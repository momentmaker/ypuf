/*
 * ypuf — popup shell (U1).
 *
 * The shelf list (U7), the let-go button wiring (U5), and the privacy
 * controls / what's-indexed view (U8) attach to these elements as they land.
 * U1 keeps it inert but loadable so the extension opens with no console errors.
 */
'use strict';

(function () {
  const recent = document.getElementById('recent');
  const empty = document.getElementById('empty');

  // Theme (U6): mirrors the board controller — applied pre-paint by lib/theme-preinit.js;
  // this wires the cycling moon/star toggle, persists to localStorage (shared across
  // extension pages, local-only), and converges via the storage event.
  const theme = window.ypuf.theme;
  const moonphase = window.ypuf.moonphase;
  const moonrender = window.ypuf.moonrender;
  const themeToggle = document.getElementById('theme-toggle');
  const THEME_KEY = 'ypuf-theme';
  const currentTheme = () => theme.normalize(document.documentElement.getAttribute('data-theme'));
  function renderThemeToggle() {
    if (!themeToggle) return;
    const mode = currentTheme();
    const star = mode === 'star';
    const phase = star ? 0 : moonphase.phase(new Date());
    moonrender.render(themeToggle, { star, phase });
    const nextMode = theme.next(mode);
    const phaseName = star ? 'star' : moonphase.phaseName(phase);
    themeToggle.setAttribute('aria-label', `Theme: ${mode} — switch to ${nextMode}`);
    themeToggle.title = `Theme: ${mode} (${phaseName}) · click for ${nextMode}`;
  }
  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', theme.normalize(mode));
    renderThemeToggle();
  }
  function setTheme(m) {
    try { localStorage.setItem(THEME_KEY, m); } catch (e) { console.warn('[ypuf] theme mirror write failed', e); }
    try { chrome.storage.local.set({ [THEME_KEY]: m }); } catch (e) { /* durable write best-effort */ }
    applyTheme(m);
  }
  if (themeToggle) {
    renderThemeToggle();
    themeToggle.addEventListener('click', () => setTheme(theme.next(currentTheme())));
  }
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY && e.newValue) applyTheme(e.newValue);
  });
  // Reconcile the durable chrome.storage value with the pre-paint localStorage mirror.
  try {
    chrome.storage.local.get(THEME_KEY, (o) => {
      if (chrome.runtime.lastError) return;
      const durable = o && o[THEME_KEY];
      if (theme.MODES.indexOf(durable) >= 0 && durable !== currentTheme()) applyTheme(durable);
      if (theme.MODES.indexOf(durable) >= 0) { try { localStorage.setItem(THEME_KEY, durable); } catch (e) {} }
    });
  } catch (e) { /* chrome.storage unavailable */ }

  // Let-go trigger (U5): the SW owns the capture; the popup just asks.
  const letgo = document.getElementById('letgo');
  if (letgo) {
    letgo.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'let-go' });
      window.close();
    });
  }

  // Snooze trigger + duration picker (U2): the user always picks a time; the
  // SW captures the tab and schedules the return.
  const snoozeBtn = document.getElementById('snooze-btn');
  const snoozePanel = document.getElementById('snooze-panel');
  const snoozeCustomBtn = document.getElementById('snooze-custom-btn');
  const snoozeCustomInput = document.getElementById('snooze-custom-input');

  function doSnooze(preset, custom) {
    chrome.runtime.sendMessage({ type: 'snooze', preset, custom }, () => window.close());
  }
  snoozeBtn?.addEventListener('click', () => { snoozePanel.hidden = !snoozePanel.hidden; });
  for (const opt of document.querySelectorAll('.snooze-opt')) {
    opt.addEventListener('click', () => doSnooze(opt.dataset.preset));
  }
  snoozeCustomBtn?.addEventListener('click', () => { snoozeCustomInput.hidden = false; snoozeCustomInput.focus(); });
  snoozeCustomInput?.addEventListener('change', () => {
    const ts = snoozeCustomInput.value ? new Date(snoozeCustomInput.value).getTime() : NaN;
    if (!Number.isNaN(ts) && ts > Date.now()) doSnooze('custom', ts); // reject a past time (matches the overlay)
  });

  // Opened via the snooze hotkey → reveal the picker straight away, then clear.
  // Key mirrors SNOOZE_INTENT_KEY in background.js (the popup can't import the SW).
  chrome.storage.session.get('snoozeIntent').then((o) => {
    if (o && o.snoozeIntent) {
      if (snoozePanel) snoozePanel.hidden = false;
      chrome.storage.session.remove('snoozeIntent');
    }
  }).catch(() => {});

  // Shelf list (U7): the SW owns the store; the popup renders what it returns.
  // Every page-derived string goes through textContent — never innerHTML.
  const T = (window.ypuf && window.ypuf.titles) || {};
  const titleOf = (it) => (T.cleanTitle ? T.cleanTitle(it.title || it.url || '', it.host || '') : it.title) || it.url || '(untitled)';

  // The empty state shows only when both the let-go list and the snooze groups
  // are empty — a user with snoozed items hasn't got "nothing let go yet".
  let recentEmpty = true, snoozeEmpty = true;
  function updateEmpty() { empty.hidden = !(recentEmpty && snoozeEmpty); }

  function itemRow(it, tags) {
    const li = document.createElement('li');
    li.className = 'recent-item' + (it.contentLess ? ' content-less' : '');
    const title = document.createElement('div'); title.className = 'title'; title.textContent = titleOf(it);
    const meta = document.createElement('div'); meta.className = 'meta';
    const host = T.friendlyDomain ? T.friendlyDomain(it.host || '') : (it.host || '');
    meta.textContent = [host].concat(tags || []).filter(Boolean).join('  ·  ');
    li.append(title, meta);
    return li;
  }
  const recallOpen = (id) => { chrome.runtime.sendMessage({ type: 'recall-open', recordId: id }); window.close(); };
  const openOnClick = (li, id) => li.addEventListener('click', () => recallOpen(id));

  // For a set-bearing row, only the title opens the single page — the row itself
  // is not click-to-open, so clicking the set affordance never closes the popup.
  function titleOpens(li, id) {
    const title = li.querySelector('.title');
    if (!title) return;
    title.classList.add('clickable');
    title.addEventListener('click', () => recallOpen(id));
  }

  // "bring back the set? (N)" — a passive, dismissible affordance (slice 4 / R6,
  // R9). It never gates the single-page recall (the title still opens just this
  // page). N is the stored sibling count.
  function setControls(it) {
    const wrap = document.createElement('div'); wrap.className = 'set-controls';
    wrap.appendChild(mkBtn(`bring back the set? (${it.siblings.length})`, () => expandSet(it, wrap)));
    return wrap;
  }

  function expandSet(it, wrap) {
    wrap.textContent = '';
    const members = document.createElement('div'); members.className = 'set-members';
    const boxes = [];
    for (const sib of it.siblings) {
      const row = document.createElement('label'); row.className = 'set-member';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.value = sib.url;
      const text = document.createElement('span');
      const host = T.friendlyDomain ? T.friendlyDomain(sib.host || '') : (sib.host || '');
      text.textContent = (sib.title && sib.title.trim()) ? `${sib.title.trim()}  ·  ${host}` : (host || sib.url);
      row.append(cb, text); members.appendChild(row); boxes.push(cb);
    }
    const restore = document.createElement('button'); restore.className = 'link'; restore.type = 'button';
    const update = () => {
      const n = boxes.filter((b) => b.checked).length;
      restore.textContent = n ? `Bring back ${n}` : 'Just open this page';
    };
    for (const b of boxes) b.addEventListener('change', update);
    update();
    restore.addEventListener('click', () => {
      if (restore.disabled) return;
      restore.disabled = true; // debounce — a second tap can't double-fire the fan-out
      const urls = boxes.filter((b) => b.checked).map((b) => b.value);
      // Both branches close only after the SW acknowledges, so a cold worker
      // can't drop the message before window.close().
      if (urls.length) chrome.runtime.sendMessage({ type: 'restore-set', recordId: it.id, urls }, () => window.close());
      else chrome.runtime.sendMessage({ type: 'recall-open', recordId: it.id }, () => window.close()); // uncheck-all → just the anchor
    });
    const actions = document.createElement('div'); actions.className = 'set-actions';
    actions.append(restore, mkBtn('Cancel', loadRecent));
    wrap.append(members, actions);
  }

  // Vim-style quick-open: each visible recall row gets a hint key (1–9, then 0);
  // pressing it opens that page. j/k (or arrows) move a cursor; Enter opens it.
  const HINT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  let quick = [];   // recall row ids, indexed by visible position
  let cursor = -1;

  function render(items) {
    recent.textContent = '';
    recentEmpty = !(items && items.length);
    updateEmpty();
    quick = []; cursor = -1;
    if (hintsActive) exitHints();   // a refresh mid-hint would orphan the badges (pattern 20)
    if (recentEmpty) return;
    items.forEach((it, i) => {
      const ago = T.timeAgo ? T.timeAgo(it.timestamp) : '';
      // Auto-closed items carry a quiet marker so the undo shelf doubles as a
      // discovery surface when the ambient indicator was missed (R13).
      const li = itemRow(it, [ago, it.autoClosed ? 'let go for you' : '']);
      if (it.siblings && it.siblings.length) { titleOpens(li, it.id); li.appendChild(setControls(it)); }
      else openOnClick(li, it.id);
      if (i < HINT_KEYS.length && it.id) {
        const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = HINT_KEYS[i];
        li.appendChild(hint);
      }
      quick.push(it.id);
      recent.appendChild(li);
    });
  }

  function setCursor(i) {
    cursor = i;
    [...recent.children].forEach((li, idx) => li.classList.toggle('cursor', idx === cursor));
    if (recent.children[cursor]) recent.children[cursor].scrollIntoView({ block: 'nearest' });
  }
  function moveCursor(d) {
    if (!quick.length) return;
    const start = cursor < 0 ? (d > 0 ? 0 : quick.length - 1) : cursor + d;
    setCursor(Math.max(0, Math.min(quick.length - 1, start)));
  }

  // f-hints (U11): press f to badge every recall row with a letter label; typing it opens
  // that page — the same vim layer the board uses (lib/boardkeys.js + lib/hints.js). The
  // readable 1–9 numbers stay alongside for now; a dogfood decides their fate later.
  const boardkeys = window.ypuf.boardkeys;
  const hints = window.ypuf.hints;
  let hintsActive = false, hintBuf = '', hintLabels = [], hintTargets = [];

  function enterHints() {
    if (hintsActive) return;
    // Only badge rows the user can actually see — the shelf is hidden while the
    // indexed/protected sub-views are open. Keep each row's quick-index id alongside it.
    const rows = [...recent.children]
      .map((el, i) => ({ el, id: quick[i] }))
      .filter((r) => r.el.offsetParent !== null);
    if (!rows.length) return;
    hintLabels = hints.assign(rows.length);
    hintTargets = rows.slice(0, hintLabels.length);
    hintBuf = '';
    const layer = document.createElement('div');
    layer.className = 'hint-layer';
    hintTargets.forEach((row, i) => {
      const r = row.el.getBoundingClientRect();
      const badge = document.createElement('span');
      badge.className = 'hint-badge';
      badge.dataset.label = hintLabels[i];
      badge.textContent = hintLabels[i];
      badge.style.left = `${r.left}px`;
      badge.style.top = `${r.top}px`;
      layer.appendChild(badge);
    });
    document.body.appendChild(layer);
    hintsActive = true;
  }

  function exitHints() {
    hintsActive = false; hintBuf = ''; hintTargets = []; hintLabels = [];
    const layer = document.querySelector('.hint-layer');
    if (layer) layer.remove();
  }

  function handleHintKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); exitHints(); return; }
    if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;   // only letters select a hint
    e.preventDefault();
    hintBuf += e.key.toLowerCase();
    const m = hints.match(hintBuf, hintLabels);
    if (m.index !== undefined) {
      const row = hintTargets[m.index];
      exitHints();
      if (row && row.id) recallOpen(row.id);
    } else if (m.noMatch) {
      exitHints();   // a typo cancels — calm, predictable
    } else {
      document.querySelectorAll('.hint-badge').forEach((b) =>
        b.classList.toggle('stale', b.dataset.label.indexOf(hintBuf) !== 0));
    }
  }
  // 1–9/0 open a row directly; j/k+Enter for cursor nav; Esc closes. A focused input
  // (the snooze datetime) or button keeps its own keys.
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (hintsActive) { handleHintKey(e); return; }   // f-hint mode owns letters + its own Esc
    if (e.key === 'Escape') { window.close(); return; }
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); return; }
    if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); return; }
    if (e.key === 'Enter') {
      if (cursor >= 0 && quick[cursor] && !(t && (t.tagName === 'BUTTON' || t.tagName === 'A'))) {
        e.preventDefault(); recallOpen(quick[cursor]);
      }
      return;
    }
    if (boardkeys.intent(e.key) === 'hints') { e.preventDefault(); enterHints(); return; }
    const idx = HINT_KEYS.indexOf(e.key);
    if (idx >= 0 && quick[idx]) { e.preventDefault(); recallOpen(quick[idx]); }
  });

  let recentSeq = 0;
  function loadRecent() {
    const mine = ++recentSeq; // Cancel can re-fire this while the first fetch is in flight
    chrome.runtime.sendMessage({ type: 'list-recent' }, (resp) => {
      if (mine !== recentSeq || chrome.runtime.lastError) return;
      render(resp && resp.items);
    });
  }
  loadRecent();

  // Snooze groups (U4): "Back now" (click-to-open) and "Snoozed" (wake / later).
  const snoozeGroups = document.getElementById('snooze-groups');
  // Same preset keys as the popup.html picker; labels are intentionally shorter
  // here because they render inline inside a shelf row, not the full panel.
  const RESNOOZE_PRESETS = [
    ['later-today', 'Later today'], ['this-evening', 'This evening'], ['tomorrow-morning', 'Tomorrow'],
    ['this-weekend', 'Weekend'], ['next-week', 'Next week'], ['when-im-back', 'When back'],
  ];

  function whenLabel(returnAt) {
    try { return new Date(returnAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); }
    catch { return ''; }
  }
  function backTag(it) {
    if (typeof it.returnAt === 'number' && it.returnAt < Date.now()) {
      const ago = T.timeAgo ? T.timeAgo(it.returnAt) : '';
      return ago ? `back · due ${ago}` : 'back now';
    }
    return 'back now';
  }
  const snoozedTag = (it) => it.untilStartup ? 'snoozed · next time you’re back'
    : (it.returnAt ? `snoozed until ${whenLabel(it.returnAt)}` : 'snoozed');

  function groupHeading(text) {
    const h = document.createElement('div'); h.className = 'group-label'; h.textContent = text; return h;
  }

  function renderSnooze(back, snoozed) {
    snoozeGroups.textContent = '';
    snoozeEmpty = !((back && back.length) || (snoozed && snoozed.length));
    updateEmpty();
    if (back && back.length) {
      snoozeGroups.appendChild(groupHeading('Back now'));
      const ul = document.createElement('ul'); ul.className = 'recent';
      for (const it of back) { const li = itemRow(it, [backTag(it)]); openOnClick(li, it.id); ul.appendChild(li); }
      snoozeGroups.appendChild(ul);
    }
    if (snoozed && snoozed.length) {
      snoozeGroups.appendChild(groupHeading('Snoozed'));
      const ul = document.createElement('ul'); ul.className = 'recent';
      for (const it of snoozed) ul.appendChild(snoozedRow(it));
      snoozeGroups.appendChild(ul);
    }
  }

  function snoozedRow(it) {
    const li = itemRow(it, [snoozedTag(it)]); // intentionally NOT click-to-open (recall via search)
    const controls = document.createElement('div'); controls.className = 'snooze-controls';
    const wake = mkBtn('Wake', () => chrome.runtime.sendMessage({ type: 'snooze-wake', recordId: it.id }, refreshSnooze));
    const later = mkBtn('Later', () => showResnooze(it.id, controls));
    controls.append(wake, later);
    li.appendChild(controls);
    return li;
  }

  function showResnooze(id, controls) {
    controls.textContent = '';
    for (const [preset, label] of RESNOOZE_PRESETS) {
      controls.appendChild(mkBtn(label, () => chrome.runtime.sendMessage({ type: 'snooze-resnooze', recordId: id, preset }, refreshSnooze)));
    }
    controls.appendChild(mkBtn('Cancel', refreshSnooze));
  }

  function refreshSnooze() {
    if (chrome.runtime.lastError) return;
    chrome.runtime.sendMessage({ type: 'snooze-list' }, (resp) => {
      if (!chrome.runtime.lastError) renderSnooze(resp && resp.back, resp && resp.snoozed);
    });
  }
  refreshSnooze();

  // --- auto-let-go: ambient status, activation, relief, badge (U8) --------
  const autoStatus = document.getElementById('auto-status');
  const autoNote = document.getElementById('auto-note');
  const relief = document.getElementById('relief');

  function setNote(text) {
    if (!autoNote) return;
    autoNote.textContent = text || '';
    autoNote.hidden = !text;
  }

  function renderAuto(s) {
    if (!autoStatus || !s) return;
    autoStatus.hidden = false;
    if (s.enabled && s.granted) {
      const week = s.week || 0;
      autoStatus.textContent = week
        ? `auto-let-go: on · ${week} let go this week`
        : 'auto-let-go: on · watching for quiet tabs';
      autoStatus.classList.remove('off');
      autoStatus.disabled = true;          // on-state is informational, not a trap
      setNote('');
    } else {
      autoStatus.textContent = 'Auto-let-go: off — turn on';
      autoStatus.classList.add('off');
      autoStatus.disabled = false;
    }
  }

  // The grant must be requested directly inside the click handler (the gesture).
  function enableAuto() {
    chrome.permissions.request({ origins: ['<all_urls>'] }, (granted) => {
      if (chrome.runtime.lastError || !granted) {
        setNote('ypuf needs access to your pages to let tabs go for you.');
        return;
      }
      chrome.runtime.sendMessage({ type: 'auto-enable' }, (resp) => {
        if (!chrome.runtime.lastError && resp) renderAuto(resp);
      });
    });
  }
  autoStatus?.addEventListener('click', () => { if (!autoStatus.disabled) enableAuto(); });

  chrome.runtime.sendMessage({ type: 'auto-summary' }, (resp) => {
    if (!chrome.runtime.lastError) renderAuto(resp);
  });

  // Relief moment (R15): once per day, only when there's something to relieve.
  chrome.runtime.sendMessage({ type: 'relief-claim' }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.show) return;
    relief.textContent = `${resp.count} let go today — all in your recall list.`;
    relief.hidden = false;
  });

  // Opening the popup is the deliberate reading surface — clear the badge.
  chrome.runtime.sendMessage({ type: 'seen-badge' }, () => void chrome.runtime.lastError);

  // What's-indexed view + forget + block (U8).
  const shelf = document.getElementById('shelf');
  const panel = document.getElementById('indexed-panel');
  const indexedList = document.getElementById('indexed-list');
  const indexedEmpty = document.getElementById('indexed-empty');

  function showIndexed() {
    shelf.hidden = true; panel.hidden = false;
    chrome.runtime.sendMessage({ type: 'whats-indexed' }, (resp) => {
      if (!chrome.runtime.lastError) renderIndexed(resp && resp.items);
    });
  }

  function renderIndexed(items) {
    indexedList.textContent = '';
    if (!items || !items.length) { indexedEmpty.hidden = false; return; }
    indexedEmpty.hidden = true;
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'recent-item' + (it.contentLess ? ' content-less' : '');
      const title = document.createElement('div'); title.className = 'title'; title.textContent = titleOf(it);
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = it.host || '';
      const actions = document.createElement('div'); actions.className = 'actions';
      const forget = document.createElement('button'); forget.className = 'link'; forget.type = 'button'; forget.textContent = 'Forget';
      const block = document.createElement('button'); block.className = 'link'; block.type = 'button'; block.textContent = 'Block site';
      actions.append(forget, block);
      li.append(title, meta, actions);
      forget.addEventListener('click', () => doForget(it, li, actions));
      block.addEventListener('click', () => confirmBlock(it, actions));
      indexedList.appendChild(li);
    }
  }

  function doForget(it, li, actions) {
    chrome.runtime.sendMessage({ type: 'forget-page', recordId: it.id }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) return; // forget failed — don't fake success
      li.classList.add('struck');
      actions.textContent = '';
      const undo = document.createElement('button'); undo.className = 'link'; undo.type = 'button'; undo.textContent = 'Undo';
      actions.appendChild(undo);
      const timer = setTimeout(() => li.remove(), 6000);
      undo.addEventListener('click', () => {
        clearTimeout(timer);
        chrome.runtime.sendMessage({ type: 'forget-page-undo', recordId: it.id }, showIndexed);
      });
    });
  }

  function confirmBlock(it, actions) {
    actions.textContent = '';
    const q = document.createElement('span'); q.className = 'meta'; q.textContent = (it.host || 'this site') + '?';
    const keep = mkBtn('Block, keep titles', () => chrome.runtime.sendMessage({ type: 'blocklist-add', host: it.host }, showIndexed));
    const all = mkBtn('Forget all', () => chrome.runtime.sendMessage({ type: 'forget-domain', host: it.host }, showIndexed));
    const cancel = mkBtn('Cancel', showIndexed);
    actions.append(q, keep, all, cancel);
  }

  function mkBtn(label, onClick) {
    const b = document.createElement('button'); b.className = 'link'; b.type = 'button'; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  document.getElementById('open-indexed')?.addEventListener('click', showIndexed);
  document.getElementById('indexed-back')?.addEventListener('click', () => { panel.hidden = true; shelf.hidden = false; });

  // Protected-sites view (U8/R14): what ypuf has learned to keep, correctable.
  const protectedPanel = document.getElementById('protected-panel');
  const protectedListEl = document.getElementById('protected-list');
  const protectedEmpty = document.getElementById('protected-empty');

  function showProtected() {
    shelf.hidden = true; protectedPanel.hidden = false;
    chrome.runtime.sendMessage({ type: 'protected-list' }, (resp) => {
      if (!chrome.runtime.lastError) renderProtected(resp && resp.items);
    });
  }

  function renderProtected(hosts) {
    protectedListEl.textContent = '';
    if (!hosts || !hosts.length) { protectedEmpty.hidden = false; return; }
    protectedEmpty.hidden = true;
    for (const host of hosts) {
      const li = document.createElement('li');
      li.className = 'recent-item';
      const title = document.createElement('div'); title.className = 'title';
      title.textContent = T.friendlyDomain ? T.friendlyDomain(host) : host;
      const actions = document.createElement('div'); actions.className = 'actions';
      const remove = mkBtn('Un-protect', () => {
        chrome.runtime.sendMessage({ type: 'protect-remove', host }, () => {
          if (!chrome.runtime.lastError) showProtected();
        });
      });
      actions.appendChild(remove);
      li.append(title, actions);
      protectedListEl.appendChild(li);
    }
  }

  document.getElementById('open-protected')?.addEventListener('click', showProtected);
  document.getElementById('protected-back')?.addEventListener('click', () => { protectedPanel.hidden = true; shelf.hidden = false; });

  // Surface the current recall binding (U7 fleshes this out).
  const hint = document.getElementById('hotkey-hint');
  if (hint && chrome.commands?.getAll) {
    chrome.commands.getAll((cmds) => {
      const recall = cmds.find((c) => c.name === 'recall');
      hint.textContent = recall?.shortcut ? `Recall: ${recall.shortcut}` : 'Recall: unset';
    });
  }
})();
