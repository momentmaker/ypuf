/*
 * ypuf — recall command bar overlay (U6 / flow F2).
 *
 * Injected programmatically into the active page by the service worker on the
 * recall hotkey (so it needs no web_accessible_resources). It is
 * RENDER/KEYSTROKE-ONLY: it sends the query to the SW and renders what comes
 * back via textContent (never innerHTML) inside a shadow root (isolated from
 * host-page CSS). The SW runs the search and performs the reopen.
 *
 * Re-injection toggles: a second recall hotkey press closes an open overlay.
 */
(function () {
  'use strict';

  const HOST_ID = 'ypuf-overlay-host';
  const existing = document.getElementById(HOST_ID);
  if (existing) { existing.remove(); return; } // re-press closes

  // Palette mirrors the extension's theme tokens (light/dark/star). The theme value is
  // read from chrome.storage.local below; until then `:host` is light, with an instant
  // prefers-color-scheme guess so dark-OS users don't flash white.
  const STYLES = `
    :host {
      all: initial;
      --bg: #fffdf9; --ink: #1a1613; --line: #e8e2da; --hover: #efe9e0; --muted: #9a918a;
      --accent: #c8713a; --backdrop: rgba(26,22,19,0.28); --shadow: rgba(26,22,19,0.32);
    }
    :host([data-theme="dark"]) {
      --bg: #2a251e; --ink: #f0ebe1; --line: #3a342b; --hover: #353029; --muted: #a89e90;
      --accent: #e0a875; --backdrop: rgba(0,0,0,0.5); --shadow: rgba(0,0,0,0.6);
    }
    :host([data-theme="star"]) {
      --bg: #14142a; --ink: rgba(232,224,255,0.92); --line: rgba(232,224,255,0.16);
      --hover: rgba(232,224,255,0.08); --muted: rgba(232,224,255,0.5);
      --accent: #d9ccff; --backdrop: rgba(5,5,14,0.55); --shadow: rgba(0,0,0,0.7);
    }
    .backdrop { position: fixed; inset: 0; background: var(--backdrop); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
    .panel {
      position: fixed; top: 13vh; left: 50%; transform: translateX(-50%);
      width: min(640px, 92vw); max-height: 64vh; display: flex; flex-direction: column;
      background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 16px;
      box-shadow: 0 24px 70px -8px var(--shadow); overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 16px 2px; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
    .brand { font-size: 12px; letter-spacing: 0.03em; color: var(--muted); }
    .brand b { color: var(--ink); font-weight: 600; }
    .head .spacer { flex: 1; }
    .q {
      font: inherit; font-size: 17px; padding: 10px 16px 14px; border: none; outline: none;
      background: transparent; color: var(--ink); border-bottom: 1px solid var(--line);
    }
    .q::placeholder { color: var(--muted); }
    .results { list-style: none; margin: 0; padding: 6px; overflow-y: auto; }
    .results::-webkit-scrollbar { width: 9px; }
    .results::-webkit-scrollbar-thumb { background: var(--line); border-radius: 5px; }
    .item { padding: 9px 12px; border-radius: 10px; cursor: pointer; border-left: 2px solid transparent; }
    .item.active, .item:hover { background: var(--hover); }
    .item.active { border-left-color: var(--accent); }
    .item .title { font-size: 14px; line-height: 1.3; color: var(--ink); }
    .item .meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .state { padding: 22px 18px; color: var(--muted); font-size: 13px; text-align: center; }
    .set-offer { font-size: 12px; color: var(--accent); margin-top: 5px; cursor: pointer; }
    .set-box { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
    .set-row { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; }
    .set-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .set-actions { display: flex; gap: 14px; margin-top: 5px; }
    .set-btn { font: inherit; font-size: 12px; background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; }
    .foot { display: flex; gap: 16px; padding: 9px 16px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }
    .foot b { color: var(--ink); font-weight: 600; }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // CLOSED shadow root: host.shadowRoot returns null, so no script on the page
  // can read the user's let-go titles/URLs or attach a listener to the recall
  // input. Refs are kept in this closure. (Privacy: nothing leaves the device.)
  const shadow = host.attachShadow({ mode: 'closed' });

  // Respect the chosen theme (light/dark/star). chrome.storage.local is the durable,
  // content-script-readable source of truth; set an instant prefers-color-scheme guess
  // first so a dark-OS user never flashes white, then refine from storage (incl. star).
  const applyTheme = (mode) => { host.dataset.theme = (mode === 'dark' || mode === 'star') ? mode : 'light'; };
  try { applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { applyTheme('light'); }

  const style = document.createElement('style');
  style.textContent = STYLES;
  const backdrop = document.createElement('div'); backdrop.className = 'backdrop';
  const panel = document.createElement('div'); panel.className = 'panel'; panel.setAttribute('role', 'dialog');

  const head = document.createElement('div'); head.className = 'head';
  const dot = document.createElement('span'); dot.className = 'dot';
  const brand = document.createElement('span'); brand.className = 'brand';
  const brandName = document.createElement('b'); brandName.textContent = 'ypuf';
  brand.append(brandName, document.createTextNode(' · recall'));
  const spacer = document.createElement('span'); spacer.className = 'spacer';
  head.append(dot, brand, spacer);

  const input = document.createElement('input');
  input.className = 'q'; input.type = 'text'; input.placeholder = 'Recall a let-go page…';
  input.setAttribute('autocomplete', 'off'); input.setAttribute('spellcheck', 'false');
  const list = document.createElement('ul'); list.className = 'results';
  const state = document.createElement('div'); state.className = 'state'; state.hidden = true;

  const foot = document.createElement('div'); foot.className = 'foot';
  const hint = (key, label) => {
    const s = document.createElement('span');
    const b = document.createElement('b'); b.textContent = key;
    s.append(b, document.createTextNode(' ' + label));
    return s;
  };
  foot.append(hint('↑↓', 'navigate'), hint('↵', 'open'), hint('esc', 'close'));

  panel.append(head, input, list, state, foot);
  shadow.append(style, backdrop, panel);
  (document.documentElement || document.body).appendChild(host);

  try {
    chrome.storage.local.get('ypuf-theme', (o) => {
      if (chrome.runtime.lastError) return;
      const t = o && o['ypuf-theme'];
      if (t === 'light' || t === 'dark' || t === 'star') applyTheme(t);
    });
  } catch { /* storage unavailable on this host — keep the prefers-color-scheme guess */ }

  const prevFocus = document.activeElement;
  let items = [];
  let active = -1;
  let seq = 0;
  let closed = false;

  function close() {
    closed = true;
    host.remove();
    try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch { /* ignore */ }
  }

  function setActive(i) {
    active = i;
    [...list.children].forEach((el, idx) => el.classList.toggle('active', idx === active));
    const el = list.children[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function render(results) {
    list.textContent = '';
    items = results || [];
    items.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'item';
      const t = document.createElement('div'); t.className = 'title';
      t.textContent = r.title || r.url || '(untitled)';
      const m = document.createElement('div'); m.className = 'meta';
      m.textContent = (r.host || '') + (r.contentLess ? '  ·  title only' : '');
      li.append(t, m);
      li.addEventListener('click', () => choose(i));
      // "bring back the set?" on the command bar (slice 4 / R9). Mouse-driven,
      // secondary to Enter (which still recalls just this page); stopPropagation
      // keeps a click on the affordance from triggering the item's recall.
      if (r.siblings && r.siblings.length) {
        const offer = document.createElement('div'); offer.className = 'set-offer';
        offer.textContent = `+${r.siblings.length} — bring back the set?`;
        offer.addEventListener('click', (e) => { e.stopPropagation(); expandSet(li, offer, r); });
        li.appendChild(offer);
      }
      list.appendChild(li);
    });
    setActive(items.length ? 0 : -1);
  }

  function expandSet(li, offer, r) {
    offer.remove();
    const box = document.createElement('div'); box.className = 'set-box';
    box.addEventListener('click', (e) => e.stopPropagation()); // never trigger item recall
    const boxes = [];
    for (const sib of r.siblings) {
      const row = document.createElement('label'); row.className = 'set-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.value = sib.url;
      const span = document.createElement('span');
      span.textContent = (sib.title && sib.title.trim()) ? `${sib.title.trim()}  ·  ${sib.host || ''}` : (sib.host || sib.url);
      row.append(cb, span); box.appendChild(row); boxes.push(cb);
    }
    const restore = document.createElement('button'); restore.className = 'set-btn';
    const update = () => { const n = boxes.filter((b) => b.checked).length; restore.textContent = n ? `Bring back ${n}` : 'Just open this page'; };
    boxes.forEach((b) => b.addEventListener('change', update)); update();
    restore.addEventListener('click', (e) => {
      e.stopPropagation();
      if (restore.disabled) return;
      restore.disabled = true; // debounce the fan-out
      const urls = boxes.filter((b) => b.checked).map((b) => b.value);
      chrome.runtime.sendMessage(urls.length
        ? { type: 'restore-set', recordId: r.id, urls }
        : { type: 'recall-open', recordId: r.id }, () => void chrome.runtime.lastError);
      close();
    });
    const cancel = document.createElement('button'); cancel.className = 'set-btn'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', (e) => { e.stopPropagation(); box.remove(); li.appendChild(offer); });
    const actions = document.createElement('div'); actions.className = 'set-actions';
    actions.append(restore, cancel);
    box.appendChild(actions);
    li.appendChild(box);
  }

  function choose(i) {
    const r = items[i];
    if (!r) return;
    chrome.runtime.sendMessage({ type: 'recall-open', recordId: r.id });
    close();
  }

  function query() {
    const q = input.value.trim();
    const mine = ++seq;
    chrome.runtime.sendMessage({ type: 'recall-search', q }, (resp) => {
      if (closed || mine !== seq || !resp) return; // overlay removed mid-flight, or stale response
      if (list.querySelector('.set-box')) return;  // a set is expanded — don't clobber it with a re-render
      if (resp.total === 0) { state.hidden = false; state.textContent = 'Nothing let go yet. Let a tab go to start your shelf.'; render([]); return; }
      if (q && resp.results.length === 0) { state.hidden = false; state.textContent = 'No match.'; render([]); return; }
      state.hidden = true;
      render(resp.results);
    });
  }

  input.addEventListener('input', query);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) setActive(Math.min(active + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setActive(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(active); }
  });
  backdrop.addEventListener('click', close);

  input.focus();
  query();
})();
