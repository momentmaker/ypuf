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

  const STYLES = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; background: rgba(26,22,19,0.28); }
    .panel {
      position: fixed; top: 14vh; left: 50%; transform: translateX(-50%);
      width: min(620px, 92vw); max-height: 64vh; display: flex; flex-direction: column;
      background: #fffdf9; color: #1a1613; border-radius: 14px;
      box-shadow: 0 24px 60px rgba(26,22,19,0.30); overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .q {
      font: inherit; font-size: 17px; padding: 16px 18px; border: none; outline: none;
      background: transparent; border-bottom: 1px solid #e8e2da; color: inherit;
    }
    .results { list-style: none; margin: 0; padding: 6px; overflow-y: auto; }
    .item { padding: 9px 12px; border-radius: 9px; cursor: pointer; }
    .item.active, .item:hover { background: #e8e2da; }
    .item .title { font-size: 14px; line-height: 1.3; }
    .item .meta { font-size: 11px; color: #9a918a; margin-top: 2px; }
    .state { padding: 22px 18px; color: #9a918a; font-size: 13px; text-align: center; }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  const backdrop = document.createElement('div'); backdrop.className = 'backdrop';
  const panel = document.createElement('div'); panel.className = 'panel'; panel.setAttribute('role', 'dialog');
  const input = document.createElement('input');
  input.className = 'q'; input.type = 'text'; input.placeholder = 'Recall a let-go page…';
  input.setAttribute('autocomplete', 'off'); input.setAttribute('spellcheck', 'false');
  const list = document.createElement('ul'); list.className = 'results';
  const state = document.createElement('div'); state.className = 'state'; state.hidden = true;
  panel.append(input, list, state);
  shadow.append(style, backdrop, panel);
  (document.documentElement || document.body).appendChild(host);

  const prevFocus = document.activeElement;
  let items = [];
  let active = -1;
  let seq = 0;

  function close() {
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
      list.appendChild(li);
    });
    setActive(items.length ? 0 : -1);
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
      if (mine !== seq || !resp) return;
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
