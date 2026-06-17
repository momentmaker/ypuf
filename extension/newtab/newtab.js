/*
 * ypuf — new-tab panel board host (slice 5).
 *
 * The board host is the one privileged context (extension origin, holds host
 * grants). It renders the grid, brokers network panels (validate → fetch →
 * parse → cache → postMessage sanitized text to a sandboxed iframe), and talks
 * to the service worker for recall data via the shipped messages. Network panels
 * NEVER run here — they run null-origin in panels/sandbox.html with no chrome.*,
 * no storage, and no network egress (sandbox CSP). See the plan's KTD.
 *
 * Layers: U1 shell + host↔sandbox channel; U2 boardConfig + edit mode + add flow;
 * the ypuf panel (U3), broker (U4), RSS (U5) and crypto (U6) panel TYPES register
 * into PANEL_TYPES below.
 */
'use strict';

(function () {
  const { PROTO, VERSION } = window.ypuf.channel; // single source of the protocol id/version

  const docBody = document.body;
  const grid = document.getElementById('board-grid');
  const emptyNote = document.getElementById('board-empty');
  const addBtn = document.getElementById('add-panel');
  const editBtn = document.getElementById('board-edit');
  const minimalNote = document.getElementById('minimal-note');
  const boardSub = document.getElementById('board-sub');
  const oneLineEl = document.getElementById('board-oneline');
  const oneLineToggle = document.getElementById('oneline-toggle');

  let config = { panels: [], minimalMode: false };
  let editing = false;
  let boardBusy = false;   // guards reorder/remove against reentrancy during an async save
  let dragId = null;       // id of the panel currently being dragged (Trello-style placement)
  const COLS = 3;          // fixed, unlabeled lanes — arrange-your-desk, not a kanban to manage
  const colOf = (spec) => { const c = Number(spec && spec.col); return (Number.isInteger(c) && c >= 0 && c < COLS) ? c : 0; };
  let mounted = [];   // panel teardown fns; run before each re-render so intervals,
                      // message listeners, and focus handlers never leak.
  let firstPaint = true; // the gentle card entrance plays once on open, not on every re-render

  // Atmosphere (U4): the board greets the hour. Local clock only — no data, no network.
  const MOODS = [
    { from: 5, key: 'dawn', line: 'a fresh morning' },
    { from: 9, key: 'day', line: 'the day’s open' },
    { from: 17, key: 'dusk', line: 'a quiet evening' },
    { from: 21, key: 'night', line: 'a still night' },
  ];
  function moodNow() {
    const h = new Date().getHours();
    let m = MOODS[MOODS.length - 1];
    for (const x of MOODS) { if (h >= x.from) m = x; }
    if (h < MOODS[0].from) m = MOODS[MOODS.length - 1]; // small hours → night
    return m;
  }
  function renderMasthead() {
    const m = moodNow();
    docBody.dataset.mood = m.key;
    if (!boardSub) return;
    let date = '';
    try { date = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { /* locale */ }
    boardSub.textContent = date ? `${date} · ${m.line}` : m.line;
  }

  // --- ambient one-line (U6) ----------------------------------------------
  // A quiet daily aphorism at the board footer, from um.fz.ax. Opt-in (it's a network
  // source): the list is cached daily, a line is picked LOCALLY each open, rendered
  // text-only. Governed like a panel (validate, hardened fetch, grant, disclosure).
  const ONELINE_URL = 'https://um.fz.ax/self/one-line.md';
  const ONELINE_TTL = 24 * 60 * 60 * 1000;

  function renderOneLine() {
    if (!oneLineEl) return;
    oneLineEl.hidden = true;
    oneLineEl.textContent = '';
    if (!config.oneLine || !config.oneLine.enabled) return;
    panelHasAccess(ONELINE_URL).then((ok) => {
      if (!ok) return;   // no grant → stays hidden (calm; re-enabling re-requests it)
      broker.load({ cacheKey: 'panel:oneline', url: ONELINE_URL, ttlMs: ONELINE_TTL, parse: (md) => window.ypuf.oneline.parse(md) })
        .then((r) => {
          const lines = r && r.value;
          if (!Array.isArray(lines) || !lines.length) return;
          const line = lines[Math.floor(Math.random() * lines.length)]; // fresh pick each open, from the daily cache
          const text = document.createElement('span');
          text.className = 'oneline-text';
          text.textContent = line;                 // text-only, inert (R14)
          const src = document.createElement('span');
          src.className = 'oneline-src';
          src.textContent = 'um.fz.ax';            // disclosure (R16)
          oneLineEl.append(text, src);
          oneLineEl.hidden = false;
          if (r.refresh) r.refresh.catch(() => {}); // background refresh of the daily list
        }).catch(() => {});
    });
  }

  function toggleOneLine() {
    if (config.oneLine && config.oneLine.enabled) {
      config.oneLine = { enabled: false };
      saveConfig(); renderBoard(); renderOneLine();
      return;
    }
    // Enable: request the um.fz.ax grant in-gesture (request-first), then turn it on.
    grantThenAdd('https://um.fz.ax', () => {
      config.oneLine = { enabled: true };
      saveConfig(); renderBoard(); renderOneLine();
    });
  }

  // Cached at load so the add-panel click handler can decide grant-vs-skip
  // SYNCHRONOUSLY — calling chrome.permissions.contains inside the click would
  // consume the user gesture and break the follow-up permissions.request.
  let hasAllUrls = false;
  const refreshHasAllUrls = () => chrome.permissions.contains({ origins: ['<all_urls>'] }, (r) => { hasAllUrls = !chrome.runtime.lastError && !!r; });
  refreshHasAllUrls();
  // Keep the cached flag honest if the grant changes while a board tab stays open.
  chrome.permissions.onAdded.addListener(refreshHasAllUrls);
  chrome.permissions.onRemoved.addListener(refreshHasAllUrls);

  // --- service-worker bridge ----------------------------------------------

  function send(type, extra) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(Object.assign({ type }, extra), (resp) => {
        resolve(chrome.runtime.lastError ? null : resp);
      });
    });
  }

  // Panel cache lives in chrome.storage.local (survives restart; the board host is
  // privileged so it reads/writes directly). Never holds recall data — only fetched
  // public-feed text — so a future global privacy-clear must reach it, page-forget
  // need not (plan: deferred).
  const local = {
    get: (k) => chrome.storage.local.get(k).then((o) => o[k]),
    set: (k, v) => chrome.storage.local.set({ [k]: v }),
  };

  // --- network broker (U4) -------------------------------------------------
  // The single fetch/validate/parse/cache path for network panels. A panel NEVER
  // fetches — it hands the broker a source and gets back parsed text-only data.
  //   source: { cacheKey, url, ttlMs, parse(rawText) -> value }
  // Cache entry: { value, fetchedAt, fetchingAt? } in chrome.storage.local.

  const FETCH_LOCK_MS = 20000;   // cross-tab single-flight window
  const FETCH_TIMEOUT_MS = 15000; // a hung host must not hold the lock indefinitely

  async function brokerRefresh(source) {
    const entry = (await local.get(source.cacheKey)) || {};
    const now = Date.now();
    // Cross-tab single-flight: skip only when another tab is mid-fetch AND we already
    // have a value to serve. On a COLD cache we fetch anyway — a stale lock left by a
    // tab that closed mid-fetch must not wedge a fresh open at "couldn't load".
    if (entry.value !== undefined && entry.fetchingAt && (now - entry.fetchingAt) < FETCH_LOCK_MS) return entry.value;
    await local.set(source.cacheKey, Object.assign({}, entry, { fetchingAt: now }));
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const v = window.ypuf.sourceurl.validate(source.url);
      if (!v.ok) throw new Error('invalid-source:' + v.reason);
      const res = await fetch(v.url, {
        credentials: 'omit',            // never send cookies to the feed host (R10)
        referrerPolicy: 'no-referrer',  // never leak the chrome-extension:// URL
        redirect: 'error',              // a validated public host can't 302 to a private IP
        signal: ctl.signal,             // a slow/hung host aborts at FETCH_TIMEOUT_MS
      });
      if (!res.ok) throw new Error('http-' + res.status);
      const value = source.parse(await res.text());   // text-only struct
      await local.set(source.cacheKey, { value, fetchedAt: Date.now() }); // success-only; drop the lock
      return value;
    } catch (e) {
      // Failure: keep last-known value, drop the lock so a later open can retry.
      const keep = (await local.get(source.cacheKey)) || {};
      await local.set(source.cacheKey, { value: keep.value, fetchedAt: keep.fetchedAt });
      throw e;
    } finally {
      clearTimeout(tid);
    }
  }

  // Stale-while-revalidate: serve fresh from cache; serve stale immediately and
  // refresh in the background; on a cold cache, await the first fetch. fetchedAt
  // rides along so a panel can stamp the value with WHEN it was fetched, not now.
  async function brokerLoad(source) {
    const entry = (await local.get(source.cacheKey)) || {};
    const has = entry.value !== undefined;
    const fresh = has && entry.fetchedAt && (Date.now() - entry.fetchedAt) < source.ttlMs;
    if (fresh) return { value: entry.value, fetchedAt: entry.fetchedAt, stale: false };
    const refreshing = brokerRefresh(source).catch((e) => { console.warn('[ypuf] panel refresh failed', e); return null; });
    if (has) return { value: entry.value, fetchedAt: entry.fetchedAt, stale: true, refresh: refreshing };
    const value = await refreshing;
    return { value: value == null ? null : value, fetchedAt: value == null ? null : Date.now(), stale: false, cold: value == null };
  }

  const broker = { load: brokerLoad, refresh: brokerRefresh };

  // --- panel type registry (ypuf U3, rss U5, crypto U6) -------------------
  // A type def: { label, addable, network, buildForm(formEl)->readConfig(),
  //               originOf(cfg)->'https://host', mount(spec, ctx)->{destroy} }

  const PANEL_TYPES = {};
  const registerPanelType = (type, def) => { PANEL_TYPES[type] = def; };

  // --- panel cells ---------------------------------------------------------

  function panelCell(spec, label) {
    const cell = document.createElement('section');
    cell.className = 'panel';
    cell.setAttribute('role', 'region');
    cell.setAttribute('aria-label', label || 'panel');
    cell.dataset.panelId = spec.id || '';
    cell.dataset.type = (spec && spec.type) || '';   // drives the per-type accent dot (U1/R2)

    const head = document.createElement('header');
    head.className = 'panel-head';
    const title = document.createElement('span');
    title.className = 'panel-title';
    title.textContent = label || '';
    head.appendChild(title);
    if (editing) head.appendChild(editControls(spec));

    const body = document.createElement('div');
    body.className = 'panel-body';
    cell.append(head, body);
    return { cell, head, body };
  }

  // Shared panel helpers (used by the rss/crypto network panels).
  function hostOfUrl(u) { try { return new URL(u).host; } catch { return u || ''; } }

  function isHttpUrl(u) {
    try { const p = new URL(u).protocol; return p === 'http:' || p === 'https:'; } catch { return false; }
  }

  // A host-permission match pattern from an origin. Match patterns can't carry a
  // port, so a feed on a non-standard port grants the host across ports.
  function originMatchPattern(origin) {
    try { const u = new URL(origin); return `${u.protocol}//${u.hostname}/*`; } catch { return null; }
  }

  // Does this tab currently hold access to a panel's source? Checked live at mount so
  // a grant revoked AFTER the panel was added surfaces "needs access", not a vague
  // failure (R2).
  function panelHasAccess(url) {
    return new Promise((resolve) => {
      if (hasAllUrls) { resolve(true); return; }
      const pattern = originMatchPattern((() => { try { return new URL(url).origin; } catch { return ''; } })());
      if (!pattern) { resolve(false); return; }
      chrome.permissions.contains({ origins: [pattern] }, (r) => resolve(!chrome.runtime.lastError && !!r));
    });
  }

  function setPanelLabel(ctx, label) {
    const t = ctx.head && ctx.head.querySelector('.panel-title');
    if (t) t.textContent = label;
    if (ctx.cell) ctx.cell.setAttribute('aria-label', label);
  }

  // A "needs access" panel offers an in-gesture re-grant of just its origin.
  function addGrantAffordance(ctx) {
    const cfg = ctx.spec.config || {};
    let origin;
    try { origin = new URL(cfg.url).origin; } catch { return; }
    const pattern = originMatchPattern(origin);
    if (!pattern) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link';
    btn.textContent = 'Grant access';
    btn.addEventListener('click', () => {
      try {
        chrome.permissions.request({ origins: [pattern] }, (granted) => {
          if (!chrome.runtime.lastError && granted) ctx.remount(); // re-mount → live access check now passes
        });
      } catch (e) { console.warn('[ypuf] grant request failed', e); }
    });
    ctx.body.appendChild(btn);
  }

  // --- host-side sandbox channel ------------------------------------------
  // Mounts panels/sandbox.html (served null-origin by the manifest `sandbox`
  // key — no allow-same-origin). We accept only messages whose source IS this
  // panel's own contentWindow (a forged source from any other frame is dropped)
  // and post to that exact frame. Pure envelope/intent kernel → lib/channel.js (U4).

  function mountSandbox(body, onIntent) {
    const frame = document.createElement('iframe');
    frame.className = 'panel-frame';
    frame.title = 'panel content';
    frame.src = chrome.runtime.getURL('panels/sandbox.html');

    const channel = window.ypuf.channel;
    let ready = false;
    let alive = true;
    let queued = null;
    let readyTimer = null;

    function handle(event) {
      if (!alive || event.source !== frame.contentWindow) return; // R9 + post-teardown guard
      const msg = event.data;
      if (!msg || msg.ypuf !== PROTO || msg.v !== VERSION) return;
      if (msg.kind === 'ready') { ready = true; clearTimeout(readyTimer); if (queued) { post(queued); queued = null; } return; }
      if (msg.kind === 'resize' && Number.isFinite(msg.height)) {
        // The sandbox reports its content height so the iframe hugs it — no dead space.
        frame.style.height = Math.min(900, Math.max(28, msg.height)) + 'px';
        return;
      }
      const intent = channel.parseIntent(msg);            // validated shape; index re-checked by the caller
      if (intent && typeof onIntent === 'function') onIntent(intent);
    }
    window.addEventListener('message', handle);

    function post(renderBody) {
      // A late async render (broker resolved after teardown/reorder) can't hit a
      // removed iframe whose contentWindow is now null.
      if (!alive || !frame.contentWindow) return;
      if (!ready) { queued = renderBody; return; }
      // renderEnvelope reduces lines to {text, open-index} only — no raw URL/HTML
      // ever crosses to the sandbox.
      frame.contentWindow.postMessage(channel.renderEnvelope(renderBody), '*');
    }

    // If the sandbox never signals ready (failed load), show a calm error rather
    // than an eternal "Loading…".
    readyTimer = setTimeout(() => { if (alive && !ready) body.textContent = 'Panel couldn’t load.'; }, 6000);

    body.appendChild(frame);
    return {
      render: post,
      destroy() { alive = false; clearTimeout(readyTimer); window.removeEventListener('message', handle); frame.remove(); },
    };
  }

  // --- edit mode: per-panel controls + reorder ----------------------------

  function editControls(spec) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-controls';
    const grip = document.createElement('span');
    grip.className = 'panel-grip';
    grip.textContent = '⠿';
    grip.title = 'Drag to reorder';
    grip.setAttribute('aria-hidden', 'true');
    wrap.append(grip, ctrlBtn('✕', 'Remove panel', () => removePanel(spec.id)));
    return wrap;
  }

  function ctrlBtn(glyph, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'panel-ctrl link';
    b.textContent = glyph;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // Within-lane order is the order same-lane panels appear in the flat config.panels
  // array; a panel's lane is spec.col. So a move = set col + reposition in the flat
  // array. A second move mid-save would splice a stale index, so guard with boardBusy.

  async function reorderInto(srcId, targetId, before) {
    if (boardBusy || srcId === targetId) return;
    boardBusy = true;
    try {
      const src = config.panels.find((p) => p.id === srcId);
      const target = config.panels.find((p) => p.id === targetId);
      if (!src || !target) return;
      src.col = colOf(target);                              // drop into the target's lane
      config.panels.splice(config.panels.indexOf(src), 1);
      let to = config.panels.indexOf(target);
      if (!before) to += 1;
      config.panels.splice(to, 0, src);
      await saveConfig(); renderBoard(); focusPanel(srcId);
    } finally { boardBusy = false; }
  }

  async function moveToLane(srcId, col) {            // drop onto empty lane space → lane end
    if (boardBusy) return;
    boardBusy = true;
    try {
      const src = config.panels.find((p) => p.id === srcId);
      if (!src) return;
      src.col = col;
      config.panels.splice(config.panels.indexOf(src), 1);
      config.panels.push(src);                       // last in the flat array → bottom of its lane
      await saveConfig(); renderBoard(); focusPanel(srcId);
    } finally { boardBusy = false; }
  }

  async function moveAcross(id, delta) {             // keyboard: ◀ ▶ between lanes
    if (boardBusy) return;
    boardBusy = true;
    try {
      const src = config.panels.find((p) => p.id === id);
      if (!src) return;
      const to = Math.max(0, Math.min(COLS - 1, colOf(src) + delta));
      if (to === colOf(src)) return;
      src.col = to;
      await saveConfig(); renderBoard(); focusPanel(id);
    } finally { boardBusy = false; }
  }

  async function moveWithinLane(id, delta) {         // keyboard: ▲ ▼ within a lane
    if (boardBusy) return;
    boardBusy = true;
    try {
      const src = config.panels.find((p) => p.id === id);
      if (!src) return;
      const lane = config.panels.filter((p) => colOf(p) === colOf(src));
      const j = lane.indexOf(src) + delta;
      if (j < 0 || j >= lane.length) return;
      const target = lane[j];
      config.panels.splice(config.panels.indexOf(src), 1);
      let to = config.panels.indexOf(target);
      if (delta > 0) to += 1;
      config.panels.splice(to, 0, src);
      await saveConfig(); renderBoard(); focusPanel(id);
    } finally { boardBusy = false; }
  }

  async function removePanel(id) {
    if (boardBusy) return;
    const idx = config.panels.findIndex((p) => p.id === id);
    if (idx < 0) return;
    boardBusy = true;
    try {
      config.panels.splice(idx, 1);
      await saveConfig();
      renderBoard();
      // Focus moves to the next panel, or the add affordance if none remain (a11y).
      const next = config.panels[idx] || config.panels[idx - 1];
      if (next) focusPanel(next.id); else addBtn.focus();
    } finally { boardBusy = false; }
  }

  function focusPanel(id) {
    const el = grid.querySelector(`[data-panel-id="${id}"]`);
    if (el) el.focus();
  }

  // --- add-panel flow (inline picker → config form → request-first grant) --

  // The picker is a sibling of the add button (outside the grid), so a board
  // re-render won't remove it — close it explicitly on submit/cancel/render.
  function closeAddPicker() {
    const p = document.querySelector('.add-picker');
    if (p) p.remove();
    addBtn.hidden = !editing;
  }

  function openAddPicker() {
    closeAddPicker();
    const addable = Object.entries(PANEL_TYPES).filter(([, d]) => d.addable);
    const picker = document.createElement('div');
    picker.className = 'add-picker';
    picker.appendChild(pickerHead('Add a panel'));
    if (!addable.length) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'No panel types available yet.';
      picker.appendChild(note);
    } else {
      const tiles = document.createElement('div');
      tiles.className = 'add-tiles';
      for (const [type, def] of addable) tiles.appendChild(addTile(type, def, picker));
      picker.appendChild(tiles);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link add-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeAddPicker);
    picker.appendChild(cancel);
    addBtn.hidden = true;
    addBtn.after(picker);
  }

  function pickerHead(text) {
    const h = document.createElement('div');
    h.className = 'add-picker-head';
    h.textContent = text;
    return h;
  }

  function addTile(type, def, picker) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'add-tile';
    tile.dataset.type = type;
    const name = document.createElement('span');
    name.className = 'add-tile-name';
    name.textContent = def.label;
    const hint = document.createElement('span');
    hint.className = 'add-tile-hint';
    hint.textContent = def.hint || '';
    tile.append(name, hint);
    tile.addEventListener('click', () => openConfigForm(type, def, picker));
    return tile;
  }

  function openConfigForm(type, def, picker) {
    picker.textContent = '';
    picker.appendChild(pickerHead(`Add ${def.label}`));
    const form = document.createElement('div');
    form.className = 'add-form';
    const readConfig = def.buildForm(form);

    const err = document.createElement('p');
    err.className = 'add-error';
    err.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'add-actions';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn-primary';
    submit.textContent = 'Add panel';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeAddPicker);

    submit.addEventListener('click', () => {
      // Everything up to permissions.request must be SYNCHRONOUS (no await) so the
      // user gesture survives — mirrors popup.js's request-first ordering.
      const instanceConfig = readConfig();
      if (!instanceConfig) { err.textContent = 'Please check the values.'; err.hidden = false; return; }
      closeAddPicker();   // dismiss the form; the new panel renders into the grid
      if (def.network) {
        // Fire the grant prompt in-gesture; the panel checks access live at mount,
        // so whether granted now or revoked later, it shows the right state.
        grantThenAdd(def.originOf(instanceConfig), () => addPanel(type, instanceConfig));
      } else {
        addPanel(type, instanceConfig);
      }
    });

    actions.append(submit, cancel);
    form.append(actions, err);
    picker.appendChild(form);
  }

  // Request-first: short-circuit synchronously off the cached <all_urls> grant,
  // else request the feed origin as the next synchronous statement.
  function grantThenAdd(origin, done) {
    if (hasAllUrls) { done(true); return; }
    const pattern = originMatchPattern(origin);
    if (!pattern) { done(false); return; }
    try {
      chrome.permissions.request({ origins: [pattern] }, (granted) => {
        done(!chrome.runtime.lastError && !!granted);
      });
    } catch (e) { done(false); } // an invalid pattern / lost gesture is a denial, never a thrown click
  }

  async function addPanel(type, instanceConfig) {
    const id = `${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; // unique even for same-ms adds
    config.panels.push({ id, type, config: instanceConfig });
    await saveConfig();
    renderBoard();
    focusPanel(id);
  }

  // --- minimal mode --------------------------------------------------------

  function renderMinimal() {
    minimalNote.hidden = false;
    minimalNote.textContent = '';
    const line = document.createElement('span');
    line.textContent = 'Minimal mode — the board engine is still running. ';
    const show = ctrlBtn('Show board', 'Show board', async () => {
      config.minimalMode = false; await saveConfig(); renderBoard();
    });
    const native = ctrlBtn('Restore Chrome’s new tab…', 'Open extension settings', () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
    minimalNote.append(line, show, document.createTextNode('  ·  '), native);
  }

  // --- board render --------------------------------------------------------

  function teardownAll() {
    // A panel teardown must never block re-render, but a failure shouldn't vanish.
    for (const t of mounted) { try { t(); } catch (e) { console.warn('[ypuf] panel teardown error', e); } }
    mounted = [];
  }

  function renderBoard() {
    teardownAll();
    closeAddPicker();   // never leave a stray add-form across a re-render
    grid.textContent = '';
    minimalNote.hidden = true;
    docBody.classList.toggle('editing', editing);
    docBody.classList.toggle('minimal', !!config.minimalMode);
    editBtn.hidden = false;
    if (oneLineToggle) {
      oneLineToggle.hidden = !editing;
      oneLineToggle.textContent = (config.oneLine && config.oneLine.enabled) ? 'Remove one-line' : '+ daily one-line';
    }

    if (config.minimalMode) {
      emptyNote.hidden = true;
      addBtn.hidden = true;
      renderMinimal();
      return;
    }

    const panels = currentPanels();
    emptyNote.hidden = panels.length > 0;
    addBtn.hidden = !editing;
    const lanes = [];
    for (let c = 0; c < COLS; c++) {
      const lane = document.createElement('div');
      lane.className = 'board-col';
      lane.dataset.col = String(c);
      if (editing) makeLaneDroppable(lane, c);
      grid.appendChild(lane);
      lanes.push(lane);
    }
    for (const spec of panels) mountPanel(spec, lanes[colOf(spec)] || lanes[0]);

    if (firstPaint) {   // gentle one-shot card entrance; removed so re-renders don't re-animate
      firstPaint = false;
      docBody.classList.add('intro');
      setTimeout(() => docBody.classList.remove('intro'), 700);
    }
  }

  // A lane is a drop target for empty-space drops (a panel handles its own drop and
  // stops propagation). Dropping onto empty lane space appends to that lane's end.
  function makeLaneDroppable(lane, col) {
    lane.addEventListener('dragover', (e) => {
      if (dragId == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      lane.classList.add('lane-over');
    });
    lane.addEventListener('dragleave', (e) => { if (e.target === lane) lane.classList.remove('lane-over'); });
    lane.addEventListener('drop', (e) => {
      lane.classList.remove('lane-over');
      if (dragId == null) return;
      e.preventDefault();
      moveToLane(dragId, col);
    });
  }

  function currentPanels() {
    if (location.hash === '#selftest') return [{ id: 'selftest', type: 'selftest' }];
    return config.panels;
  }

  function mountPanel(spec, lane) {
    if (spec.type === 'selftest') return mountSelfTest(spec, lane);
    const def = PANEL_TYPES[spec.type];
    if (!def) return mountPlaceholder(spec, spec.type, lane);
    const ctx = panelCell(spec, def.label);
    if (spec.id && editing) makeDraggable(ctx.cell, spec);
    lane.appendChild(ctx.cell);
    try {
      const teardown = def.mount({ ...ctx, spec, mountSandbox, send, broker, remount: renderBoard });
      if (typeof teardown === 'function') mounted.push(teardown);
    } catch (e) {
      // One bad panel (corrupt config, missing dep) must not abort the rest of the board.
      console.warn('[ypuf] panel mount failed', spec.type, e);
      ctx.body.textContent = 'This panel couldn’t load.';
    }
  }

  function mountPlaceholder(spec, label, lane) {
    const { cell, body } = panelCell(spec, label);
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Loading…';
    body.appendChild(p);
    lane.appendChild(cell);
  }

  // Trello-style drag reorder: the whole card is the drag handle in edit mode. A
  // quiet arrow-key fallback stays for keyboard users. During a drag, iframes are
  // made pointer-events:none (CSS) so dragover/drop reach the cells beneath them.
  const clearDropMarks = () => grid.querySelectorAll('.drop-before, .drop-after, .lane-over')
    .forEach((el) => el.classList.remove('drop-before', 'drop-after', 'lane-over'));

  const insertBefore = (cell, e) => {
    const r = cell.getBoundingClientRect();
    return (e.clientY - r.top) < r.height / 2;   // top half → drop above, bottom half → below
  };

  function makeDraggable(cell, spec) {
    cell.draggable = true;
    cell.tabIndex = 0;

    cell.addEventListener('dragstart', (e) => {
      dragId = spec.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', spec.id); } catch (err) { /* some targets reject setData */ }
      cell.classList.add('dragging');
      docBody.classList.add('dragging-active');
    });
    cell.addEventListener('dragend', () => {
      dragId = null;
      cell.classList.remove('dragging');
      docBody.classList.remove('dragging-active');
      clearDropMarks();
    });
    cell.addEventListener('dragover', (e) => {
      if (dragId == null || dragId === spec.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      cell.classList.add(insertBefore(cell, e) ? 'drop-before' : 'drop-after');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-before', 'drop-after'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();   // handled here — don't also fire the lane's empty-space drop
      if (dragId == null || dragId === spec.id) return;
      reorderInto(dragId, spec.id, insertBefore(cell, e));
    });

    cell.addEventListener('keydown', (e) => {   // keyboard a11y: ◀▶ change lane, ▲▼ reorder within
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveAcross(spec.id, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveAcross(spec.id, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveWithinLane(spec.id, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveWithinLane(spec.id, 1); }
    });
  }

  // --- U1 isolation proof (open newtab.html#selftest) ----------------------

  function mountSelfTest(spec, lane) {
    const { cell, body } = panelCell(spec, 'Sandbox self-test');
    const ch = mountSandbox(body, (intent) => {
      console.log('[ypuf] self-test intent received (host validated source):', intent);
    });
    mounted.push(ch.destroy);
    ch.render({
      lines: [
        { text: 'Hello from the sandboxed panel — rendered as text.' },
        { text: '<img src=x onerror=alert(1)> — markup stays inert, click me', open: 0 },
      ],
      note: 'Inside the frame: chrome is undefined; fetch() is blocked by CSP.',
      foot: 'sandbox · no chrome.* · no network egress',
    });
    (lane || grid).appendChild(cell);
  }

  // --- config + boot -------------------------------------------------------

  const saveConfig = () => send('board-save-config', { config });

  async function loadAndRender() {
    const loaded = await send('board-get-config');
    if (loaded && Array.isArray(loaded.panels)) config = loaded;
    // One-time migration: panels from before lanes existed get spread across the
    // columns (round-robin) so the board looks composed rather than all stacked left.
    if (config.panels.some((p) => !Number.isInteger(p.col))) {
      config.panels.forEach((p, i) => { if (!Number.isInteger(p.col)) p.col = i % COLS; });
      saveConfig();
    }
    renderBoard();
    renderOneLine();
  }

  renderMasthead();   // greet the hour (U4)
  editBtn.addEventListener('click', () => { editing = !editing; renderBoard(); });
  if (oneLineToggle) oneLineToggle.addEventListener('click', toggleOneLine);
  addBtn.addEventListener('click', openAddPicker);
  window.addEventListener('hashchange', renderBoard);

  // Another board tab edited the config — converge so this tab doesn't show stale
  // state. Don't yank the board out from under an active edit; skip our own writes.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.boardConfig) return;
    const next = changes.boardConfig.newValue;
    if (!next || !Array.isArray(next.panels) || editing || boardBusy) return;
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    renderBoard();
  });

  // The board's panel-registration surface. U5 (rss) and U6 (crypto) register
  // their type defs here, before boot.
  window.ypuf = Object.assign(window.ypuf || {}, {
    board: { registerPanelType, mountSandbox, send, broker },
  });

  // --- ypuf panel (U3): recall/shelf/back-now, host-rendered ---------------
  // Reuses the shipped SW messages (zero new SW data work) and lib/shelf-render.js
  // for the text-only row builders. Page-influenced titles → textContent is
  // load-bearing here, not cosmetic (see shelf-render.js / KTD).

  registerPanelType('ypuf', {
    label: 'ypuf — recall',
    addable: false,          // present by default (R3); not added via the picker
    network: false,
    mount(ctx) {
      const SR = window.ypuf.shelfRender;
      const T = (window.ypuf && window.ypuf.titles) || {};
      const body = ctx.body;
      const handlers = { open: (id) => send('recall-open', { recordId: id }) };

      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'recall-search';
      search.placeholder = 'Recall a let-go page…';
      search.setAttribute('aria-label', 'Recall a let-go page');
      const reliefWrap = document.createElement('div');
      const results = document.createElement('div');
      const recentWrap = document.createElement('div');
      const snoozeWrap = document.createElement('div');
      body.append(reliefWrap, search, results, recentWrap, snoozeWrap);

      // The relief moment (U5/R12): once a day, a calm acknowledgement that what you
      // let go is safe. The SW gates the claim, so it shows on whichever surface you
      // open first that day; never a badge or a nag.
      send('relief-claim').then((resp) => {
        if (!resp || !resp.show) return;
        const relief = document.createElement('div');
        relief.className = 'board-relief';
        relief.textContent = `${resp.count} let go today — all still findable.`;
        reliefWrap.appendChild(relief);
      });

      function row(it, tags, action) {
        const li = SR.toDom(SR.itemRow(it, tags, T, action), document, handlers);
        // Set-bearing recall items offer a one-tap "bring back the set" (the
        // granular checkbox restore stays in the popup); restore-set intersects
        // the requested URLs against the record's stored siblings in the SW.
        if (it.siblings && it.siblings.length) {
          const urls = it.siblings.map((s) => s.url);
          const restore = document.createElement('button');
          restore.type = 'button';
          restore.className = 'link set-restore';
          restore.textContent = `bring back the set? (${it.siblings.length})`;
          restore.addEventListener('click', () => send('restore-set', { recordId: it.id, urls }));
          li.appendChild(restore);
        }
        return li;
      }

      function renderList(target, items, action) {
        target.textContent = '';
        for (const it of (items || [])) {
          target.appendChild(row(it, [T.timeAgo ? T.timeAgo(it.timestamp) : ''], action));
        }
      }

      function group(label) {
        const h = document.createElement('div');
        h.className = 'panel-group-label';
        h.textContent = label;
        return h;
      }

      let destroyed = false;
      send('list-recent', { limit: 12 }).then((resp) => {
        if (!destroyed) renderList(recentWrap, resp && resp.items, { action: 'open' });
      });

      let seq = 0;
      let timer = null;
      search.addEventListener('input', () => {
        const q = search.value.trim();
        clearTimeout(timer);
        timer = setTimeout(() => {
          const mine = ++seq;
          if (!q) { results.textContent = ''; return; }
          send('recall-search', { q }).then((resp) => {
            if (destroyed || mine !== seq) return;
            renderList(results, resp && resp.results, { action: 'open' });
          });
        }, 180);
      });

      send('snooze-list').then((resp) => {
        if (destroyed) return;
        snoozeWrap.textContent = '';
        const back = resp && resp.back;
        const snoozed = resp && resp.snoozed;
        if (back && back.length) {
          snoozeWrap.appendChild(group('Back now'));
          renderListInto(snoozeWrap, back, { action: 'open' });
        }
        if (snoozed && snoozed.length) {
          snoozeWrap.appendChild(group('Snoozed'));
          for (const it of snoozed) snoozeWrap.appendChild(snoozedRow(it));
        }
      });

      function renderListInto(target, items, action) {
        const ul = document.createElement('ul');
        ul.className = 'recent';
        for (const it of items) ul.appendChild(row(it, [T.timeAgo ? T.timeAgo(it.returnAt || it.timestamp) : ''], action));
        target.appendChild(ul);
      }

      function snoozedRow(it) {
        const li = SR.toDom(SR.itemRow(it, ['snoozed'], T, null), document, {});
        const ctrls = document.createElement('div');
        ctrls.className = 'snooze-controls';
        const wake = document.createElement('button');
        wake.type = 'button'; wake.className = 'link'; wake.textContent = 'Wake';
        wake.addEventListener('click', () => send('snooze-wake', { recordId: it.id }).then(() => ctx.remount && ctx.remount()));
        ctrls.appendChild(wake);
        li.appendChild(ctrls);
        return li;
      }

      return () => { destroyed = true; clearTimeout(timer); }; // cancel the debounce + late renders
    },
  });

  // --- RSS feed panel (U5) -------------------------------------------------
  // A1 pastes a feed URL; the broker fetches/validates/parses; headlines render
  // in the sandbox. "Open headline" is an index the host intersects against its
  // OWN parsed links (pattern 15) before chrome.tabs.create — the panel can never
  // name a URL the host didn't parse.

  registerPanelType('rss', {
    label: 'RSS feed',
    hint: 'latest headlines',
    addable: true,
    network: true,
    buildForm(form) {
      const input = document.createElement('input');
      input.type = 'url';
      input.placeholder = 'https://example.com/feed.xml';
      input.setAttribute('aria-label', 'Feed URL');
      form.appendChild(input);
      return () => {
        const v = window.ypuf.sourceurl.validate(input.value.trim());
        return v.ok ? { url: v.url, host: v.host } : null;   // sync, pre-grant (R12)
      };
    },
    originOf(cfg) { return new URL(cfg.url).origin; },
    mount(ctx) {
      const cfg = ctx.spec.config || {};
      const rss = window.ypuf.rss;
      const channel = window.ypuf.channel;
      const host = cfg.host || hostOfUrl(cfg.url);
      setPanelLabel(ctx, host);                  // R8: each instance labelled by source
      const foot = `fetches ${host} · sees your IP + timing`;

      let links = [];
      const panel = ctx.mountSandbox(ctx.body, (intent) => {
        if (intent.intent !== 'open') return;
        const url = channel.resolveOpen(intent.index, links);
        if (url && isHttpUrl(url)) chrome.tabs.create({ url }); // belt-and-suspenders (links[] is already http(s)-only)
      });

      const show = (items, note) => {
        // Only http(s) headline links are openable. A feed item link of
        // javascript:/data:/file:/chrome: is attacker-controlled feed bytes and must
        // never reach chrome.tabs.create — resolveOpen proves provenance (the index
        // maps to a host-parsed link), this proves the SCHEME is safe.
        links = (items || []).map((it) => (isHttpUrl(it.link) ? it.link : ''));
        const lines = (items || []).map((it, i) => ({ text: it.title, open: links[i] ? i : undefined }));
        panel.render({ lines: lines.length ? lines : [{ text: note || 'No headlines yet.' }], note: lines.length ? note : '', foot });
      };

      panel.render({ lines: [{ text: 'Loading…' }], foot }); // cold-cache placeholder, never blocks (R11)
      panelHasAccess(cfg.url).then((ok) => {
        if (!ok) {
          // Grant absent (never granted, or revoked after add) → calm "needs access" (R2).
          panel.render({ lines: [{ text: 'ypuf needs access to load this feed.' }], foot });
          addGrantAffordance(ctx);
          return;
        }
        ctx.broker.load({ cacheKey: 'panel:rss:' + cfg.url, url: cfg.url, ttlMs: 30 * 60 * 1000, parse: (xml) => rss.parse(xml) })
          .then((r) => {
            if (r.value && r.value.length) show(r.value, r.stale ? 'updating…' : '');
            else if (r.value) show([], '');                  // empty feed, fetched ok
            else show([], `couldn’t load ${host}`);          // cold-fail (R11)
            if (r.refresh) r.refresh.then((v) => { if (v) show(v, ''); }).catch(() => {});
          })
          .catch(() => show([], `couldn’t load ${host}`));
      });
      return () => panel.destroy();
    },
  });

  // --- Crypto price panel (U6) ---------------------------------------------
  // Glanceable price + 24h change via a swappable provider (CoinGecko v1). Refresh
  // is swap-on-refocus: a 60s in-page interval STAGES a new value without redrawing;
  // it is flushed only on the next refocus (visibilitychange→visible / window focus)
  // — the one moment the user is provably not mid-glance. An "as of HH:MM" stamp
  // keeps a left-open board honest; failures keep last-known + "unavailable" (R11).

  registerPanelType('crypto', {
    label: 'Crypto price',
    hint: 'live prices',
    addable: true,
    network: true,
    buildForm(form) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'bitcoin, ethereum, solana';
      input.setAttribute('aria-label', 'Token ids (CoinGecko), comma-separated');
      const hint = document.createElement('p');
      hint.className = 'muted add-hint';
      hint.textContent = 'CoinGecko ids, comma-separated — several show in one panel (e.g. "bitcoin", not "BTC").';
      form.append(input, hint);
      return () => {
        const tokens = input.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        return tokens.length ? { tokens } : null;
      };
    },
    originOf() { return 'https://api.coingecko.com'; }, // ypuf-chosen infra, not a user source
    mount(ctx) {
      const cfg = ctx.spec.config || {};
      const tokens = Array.isArray(cfg.tokens) ? cfg.tokens : [];
      const CP = window.ypuf.cryptoProvider;
      setPanelLabel(ctx, tokens.length ? tokens.join(' · ') : 'Crypto');
      const foot = `via ${CP.label} (ypuf-chosen) · sees your IP + timing`;
      const panel = ctx.mountSandbox(ctx.body, () => {}); // glance only — no intents

      const source = {
        cacheKey: 'panel:crypto:' + tokens.join(','),
        url: CP.buildUrl(tokens),
        ttlMs: 60 * 1000,
        parse: (text) => CP.parse(text, tokens),
      };

      const asOf = (ts) => { try { return 'as of ' + new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
      const lineOf = (p) => {
        if (!p || p.unavailable || typeof p.price !== 'number') return { text: `${p ? p.token : '?'} — unavailable` };
        const text = `${p.token}  $${p.price.toLocaleString()}`;
        if (typeof p.change24h !== 'number') return { text };
        const up = p.change24h >= 0;
        return { text, tail: `${up ? '▲' : '▼'} ${Math.abs(p.change24h).toFixed(2)}%`, tone: up ? 'pos' : 'neg' };
      };
      const draw = (prices, ts) => {
        const lines = (prices || []).map(lineOf);
        panel.render({ lines: lines.length ? lines : [{ text: 'price unavailable' }], note: ts ? asOf(ts) : 'price unavailable', foot });
      };

      panel.render({ lines: [{ text: 'Loading…' }], foot }); // cold-cache placeholder, never blocks (R11)

      // Swap-on-refocus: stage on the interval, flush on the next refocus. Declared
      // up here so teardown can always clear them, even if access is denied.
      let staged = null;
      let timer = null;
      const flush = () => { if (staged) { draw(staged.value, staged.ts); staged = null; } };
      const onVis = () => { if (document.visibilityState === 'visible') flush(); };

      panelHasAccess('https://api.coingecko.com').then((ok) => {
        if (!ok) {
          panel.render({ lines: [{ text: 'ypuf needs access to fetch prices.' }], foot });
          addGrantAffordance(ctx);
          return;
        }
        ctx.broker.load(source).then((r) => {
          if (r.value) draw(r.value, r.fetchedAt);   // stamp with WHEN it was fetched, not now
          else draw(null, null);
          if (r.refresh) r.refresh.then((v) => { if (v) draw(v, Date.now()); }).catch(() => {});
        }).catch(() => draw(null, null));
        timer = setInterval(() => {
          ctx.broker.refresh(source).then((v) => { if (v) staged = { value: v, ts: Date.now() }; }).catch(() => {});
        }, source.ttlMs);
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', flush);
      });

      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('focus', flush);
        panel.destroy();
      };
    },
  });

  loadAndRender();
})();
