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
  const PROTO = 'panel';
  const VERSION = 1;

  const docBody = document.body;
  const grid = document.getElementById('board-grid');
  const emptyNote = document.getElementById('board-empty');
  const addBtn = document.getElementById('add-panel');
  const editBtn = document.getElementById('board-edit');
  const minimalNote = document.getElementById('minimal-note');

  let config = { panels: [], minimalMode: false };
  let editing = false;
  let mounted = [];   // panel teardown fns; run before each re-render so intervals,
                      // message listeners, and focus handlers never leak.

  // Cached at load so the add-panel click handler can decide grant-vs-skip
  // SYNCHRONOUSLY — calling chrome.permissions.contains inside the click would
  // consume the user gesture and break the follow-up permissions.request.
  let hasAllUrls = false;
  chrome.permissions.contains({ origins: ['<all_urls>'] }, (r) => { hasAllUrls = !!r; });

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

  const FETCH_LOCK_MS = 20000; // cross-tab single-flight window

  async function brokerRefresh(source) {
    const entry = (await local.get(source.cacheKey)) || {};
    const now = Date.now();
    // Cross-tab single-flight: if another board tab is mid-fetch, don't stampede.
    if (entry.fetchingAt && (now - entry.fetchingAt) < FETCH_LOCK_MS) return entry.value;
    await local.set(source.cacheKey, Object.assign({}, entry, { fetchingAt: now }));
    try {
      const v = window.ypuf.sourceurl.validate(source.url);
      if (!v.ok) throw new Error('invalid-source:' + v.reason);
      const res = await fetch(v.url, {
        credentials: 'omit',            // never send cookies to the feed host (R10)
        referrerPolicy: 'no-referrer',  // never leak the chrome-extension:// URL
        redirect: 'error',              // a validated public host can't 302 to a private IP
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
    }
  }

  // Stale-while-revalidate: serve fresh from cache; serve stale immediately and
  // refresh in the background; on a cold cache, await the first fetch.
  async function brokerLoad(source) {
    const entry = (await local.get(source.cacheKey)) || {};
    const has = entry.value !== undefined;
    const fresh = has && entry.fetchedAt && (Date.now() - entry.fetchedAt) < source.ttlMs;
    if (fresh) return { value: entry.value, stale: false };
    const refreshing = brokerRefresh(source).catch((e) => { console.warn('[ypuf] panel refresh failed', e); return null; });
    if (has) return { value: entry.value, stale: true, refresh: refreshing };
    const value = await refreshing;
    return { value: value == null ? null : value, stale: false, cold: value == null };
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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link';
    btn.textContent = 'Grant access';
    btn.addEventListener('click', () => {
      chrome.permissions.request({ origins: [origin.replace(/\/?$/, '/*')] }, (granted) => {
        if (!chrome.runtime.lastError && granted) ctx.updateSpec({ needsAccess: false });
      });
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

    let ready = false;
    let queued = null;

    const channel = window.ypuf.channel;

    function handle(event) {
      if (event.source !== frame.contentWindow) return;   // R9: only THIS frame (live cross-frame check)
      const msg = event.data;
      if (!msg || msg.ypuf !== PROTO || msg.v !== VERSION) return;
      if (msg.kind === 'ready') { ready = true; if (queued) { post(queued); queued = null; } return; }
      const intent = channel.parseIntent(msg);            // validated shape; index re-checked by the caller
      if (intent && typeof onIntent === 'function') onIntent(intent);
    }
    window.addEventListener('message', handle);

    function post(renderBody) {
      if (!ready) { queued = renderBody; return; }
      // renderEnvelope reduces lines to {text, open-index} only — no raw URL/HTML
      // ever crosses to the sandbox.
      frame.contentWindow.postMessage(channel.renderEnvelope(renderBody), '*');
    }

    body.appendChild(frame);
    return { render: post, destroy() { window.removeEventListener('message', handle); frame.remove(); } };
  }

  // --- edit mode: per-panel controls + reorder ----------------------------

  function editControls(spec) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-controls';
    const idx = config.panels.findIndex((p) => p.id === spec.id);
    wrap.append(
      ctrlBtn('◀', 'Move left', () => movePanel(idx, -1)),
      ctrlBtn('▶', 'Move right', () => movePanel(idx, 1)),
      ctrlBtn('✕', 'Remove panel', () => removePanel(spec.id)),
    );
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

  async function movePanel(idx, delta) {
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= config.panels.length) return;
    const [p] = config.panels.splice(idx, 1);
    config.panels.splice(to, 0, p);
    await saveConfig();
    renderBoard();
    focusPanel(p.id);
  }

  async function updatePanelSpec(id, patch) {
    const p = config.panels.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    await saveConfig();
    renderBoard();
  }

  async function removePanel(id) {
    const idx = config.panels.findIndex((p) => p.id === id);
    if (idx < 0) return;
    config.panels.splice(idx, 1);
    await saveConfig();
    renderBoard();
    // Focus moves to the next panel, or the add affordance if none remain (a11y).
    const next = config.panels[idx] || config.panels[idx - 1];
    if (next) focusPanel(next.id); else addBtn.focus();
  }

  function focusPanel(id) {
    const el = grid.querySelector(`[data-panel-id="${id}"]`);
    if (el) el.focus();
  }

  // --- add-panel flow (inline picker → config form → request-first grant) --

  function openAddPicker() {
    const addable = Object.entries(PANEL_TYPES).filter(([, d]) => d.addable);
    const picker = document.createElement('div');
    picker.className = 'add-picker';
    if (!addable.length) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'No addable panel types yet.';
      picker.appendChild(note);
    }
    for (const [type, def] of addable) {
      picker.appendChild(ctrlBtn(def.label, `Add ${def.label}`, () => openConfigForm(type, def, picker)));
    }
    picker.appendChild(ctrlBtn('Cancel', 'Cancel', () => { picker.remove(); addBtn.hidden = false; }));
    addBtn.hidden = true;
    addBtn.after(picker);
  }

  function openConfigForm(type, def, picker) {
    picker.textContent = '';
    const form = document.createElement('div');
    form.className = 'add-form';
    const readConfig = def.buildForm(form);

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'link';
    submit.textContent = 'Add panel';
    const err = document.createElement('p');
    err.className = 'muted add-error';
    err.hidden = true;

    submit.addEventListener('click', () => {
      // Everything up to permissions.request must be SYNCHRONOUS (no await) so the
      // user gesture survives — mirrors popup.js's request-first ordering.
      const instanceConfig = readConfig();
      if (!instanceConfig) { err.textContent = 'Please check the values.'; err.hidden = false; return; }
      if (def.network) {
        const origin = def.originOf(instanceConfig);
        grantThenAdd(origin, (granted) => addPanel(type, instanceConfig, !granted));
      } else {
        addPanel(type, instanceConfig, false);
      }
    });

    form.append(submit, ctrlBtn('Cancel', 'Cancel', () => { picker.remove(); addBtn.hidden = false; }), err);
    picker.appendChild(form);
  }

  // Request-first: short-circuit synchronously off the cached <all_urls> grant,
  // else request the feed origin as the next synchronous statement.
  function grantThenAdd(origin, done) {
    if (hasAllUrls) { done(true); return; }
    chrome.permissions.request({ origins: [origin.replace(/\/?$/, '/*')] }, (granted) => {
      if (chrome.runtime.lastError) { done(false); return; }
      done(!!granted);
    });
  }

  async function addPanel(type, instanceConfig, needsAccess) {
    const id = `${type}-${Date.now()}`;
    config.panels.push({ id, type, config: instanceConfig, needsAccess });
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
    for (const t of mounted) { try { t(); } catch (e) { /* a panel teardown must never block re-render */ } }
    mounted = [];
  }

  function renderBoard() {
    teardownAll();
    grid.textContent = '';
    minimalNote.hidden = true;
    docBody.classList.toggle('editing', editing);
    docBody.classList.toggle('minimal', !!config.minimalMode);
    editBtn.hidden = false;

    if (config.minimalMode) {
      emptyNote.hidden = true;
      addBtn.hidden = true;
      renderMinimal();
      return;
    }

    const panels = currentPanels();
    emptyNote.hidden = panels.length > 0;
    addBtn.hidden = !editing;
    for (const spec of panels) mountPanel(spec);
  }

  function currentPanels() {
    if (location.hash === '#selftest') return [{ id: 'selftest', type: 'selftest' }];
    return config.panels;
  }

  function mountPanel(spec) {
    if (spec.type === 'selftest') return mountSelfTest(spec);
    const def = PANEL_TYPES[spec.type];
    if (!def) return mountPlaceholder(spec, spec.type);
    const ctx = panelCell(spec, def.label);
    if (spec.id && editing) makeReorderable(ctx.cell, spec);
    grid.appendChild(ctx.cell);
    const teardown = def.mount({ ...ctx, spec, mountSandbox, send, broker, remount: renderBoard, updateSpec: (patch) => updatePanelSpec(spec.id, patch) });
    if (typeof teardown === 'function') mounted.push(teardown);
  }

  function mountPlaceholder(spec, label) {
    const { cell, body } = panelCell(spec, label);
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Loading…';
    body.appendChild(p);
    grid.appendChild(cell);
  }

  // Keyboard reorder: a focused panel moves with the arrow keys in edit mode.
  function makeReorderable(cell, spec) {
    cell.tabIndex = 0;
    cell.addEventListener('keydown', (e) => {
      const idx = config.panels.findIndex((p) => p.id === spec.id);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); movePanel(idx, -1); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); movePanel(idx, 1); }
    });
  }

  // --- U1 isolation proof (open newtab.html#selftest) ----------------------

  function mountSelfTest(spec) {
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
    grid.appendChild(cell);
  }

  // --- config + boot -------------------------------------------------------

  const saveConfig = () => send('board-save-config', { config });

  async function loadAndRender() {
    const loaded = await send('board-get-config');
    if (loaded && Array.isArray(loaded.panels)) config = loaded;
    renderBoard();
  }

  editBtn.addEventListener('click', () => { editing = !editing; renderBoard(); });
  addBtn.addEventListener('click', openAddPicker);
  window.addEventListener('hashchange', renderBoard);

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
      const results = document.createElement('div');
      const recentWrap = document.createElement('div');
      const snoozeWrap = document.createElement('div');
      body.append(search, results, recentWrap, snoozeWrap);

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

      send('list-recent', { limit: 12 }).then((resp) =>
        renderList(recentWrap, resp && resp.items, { action: 'open' }));

      let seq = 0;
      let timer = null;
      search.addEventListener('input', () => {
        const q = search.value.trim();
        clearTimeout(timer);
        timer = setTimeout(() => {
          const mine = ++seq;
          if (!q) { results.textContent = ''; return; }
          send('recall-search', { q }).then((resp) => {
            if (mine !== seq) return;
            renderList(results, resp && resp.results, { action: 'open' });
          });
        }, 180);
      });

      send('snooze-list').then((resp) => {
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
    },
  });

  // --- RSS feed panel (U5) -------------------------------------------------
  // A1 pastes a feed URL; the broker fetches/validates/parses; headlines render
  // in the sandbox. "Open headline" is an index the host intersects against its
  // OWN parsed links (pattern 15) before chrome.tabs.create — the panel can never
  // name a URL the host didn't parse.

  registerPanelType('rss', {
    label: 'RSS feed',
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
      const foot = `fetches ${host} · the host sees your IP & timing`;

      let links = [];
      const panel = ctx.mountSandbox(ctx.body, (intent) => {
        if (intent.intent !== 'open') return;
        const url = channel.resolveOpen(intent.index, links);
        if (url) chrome.tabs.create({ url });
      });

      const show = (items, note) => {
        links = (items || []).map((it) => it.link || '');
        const lines = (items || []).map((it, i) => ({ text: it.title, open: links[i] ? i : undefined }));
        panel.render({ lines: lines.length ? lines : [{ text: note || 'No headlines yet.' }], note: lines.length ? note : '', foot });
      };

      if (ctx.spec.needsAccess) {
        panel.render({ lines: [{ text: 'ypuf needs access to load this feed.' }], foot });
        addGrantAffordance(ctx);
        return () => panel.destroy();
      }

      ctx.broker.load({ cacheKey: 'panel:rss:' + cfg.url, url: cfg.url, ttlMs: 30 * 60 * 1000, parse: (xml) => rss.parse(xml) })
        .then((r) => {
          if (r.value && r.value.length) show(r.value, r.stale ? 'updating…' : '');
          else if (r.value) show([], '');                  // empty feed, fetched ok
          else show([], `couldn’t load ${host}`);          // cold-fail (R11)
          if (r.refresh) r.refresh.then((v) => { if (v) show(v, ''); }).catch(() => {});
        })
        .catch(() => show([], `couldn’t load ${host}`));
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
    addable: true,
    network: true,
    buildForm(form) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'bitcoin, ethereum';
      input.setAttribute('aria-label', 'Token ids (CoinGecko), comma-separated');
      form.appendChild(input);
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
      const foot = `via ${CP.label} (ypuf-chosen) · the host sees your IP & timing`;
      const panel = ctx.mountSandbox(ctx.body, () => {}); // glance only — no intents

      const source = {
        cacheKey: 'panel:crypto:' + tokens.join(','),
        url: CP.buildUrl(tokens),
        ttlMs: 60 * 1000,
        parse: (text) => CP.parse(text, tokens),
      };

      const asOf = (ts) => { try { return 'as of ' + new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
      const fmt = (p) => {
        if (!p || p.unavailable || typeof p.price !== 'number') return `${p ? p.token : '?'} — price unavailable`;
        const chg = typeof p.change24h === 'number' ? `  ${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(2)}%` : '';
        return `${p.token}  $${p.price.toLocaleString()}${chg}`;
      };
      const draw = (prices, ts) => {
        const lines = (prices || []).map((p) => ({ text: fmt(p) }));
        panel.render({ lines: lines.length ? lines : [{ text: 'price unavailable' }], note: ts ? asOf(ts) : 'price unavailable', foot });
      };

      if (ctx.spec.needsAccess) {
        panel.render({ lines: [{ text: 'ypuf needs access to fetch prices.' }], foot });
        addGrantAffordance(ctx);
        return () => panel.destroy();
      }

      ctx.broker.load(source).then((r) => {
        if (r.value) draw(r.value, Date.now());
        else draw(null, null);
        if (r.refresh) r.refresh.then((v) => { if (v) draw(v, Date.now()); }).catch(() => {});
      }).catch(() => draw(null, null));

      // Swap-on-refocus: stage on the interval, flush on the next refocus.
      let staged = null;
      const timer = setInterval(() => {
        ctx.broker.refresh(source).then((v) => { if (v) staged = { value: v, ts: Date.now() }; }).catch(() => {});
      }, source.ttlMs);
      const flush = () => { if (staged) { draw(staged.value, staged.ts); staged = null; } };
      const onVis = () => { if (document.visibilityState === 'visible') flush(); };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('focus', flush);

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
