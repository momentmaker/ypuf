/*
 * ypuf — in-page snooze overlay.
 *
 * Injected programmatically into the active page by the service worker on the
 * snooze hotkey (so it needs no web_accessible_resources). It mirrors the recall
 * overlay: RENDER/KEYSTROKE-ONLY in a CLOSED shadow root (isolated from host-page
 * CSS and unreadable by page scripts), themed from chrome.storage.local, and made
 * to coexist with vim-style page extensions (contenteditable host + focusout-close).
 * The user picks a return time; the SW captures the active tab and schedules —
 * snooze "always picks a time, never a silent default". A second hotkey press closes.
 */
(function () {
  'use strict';

  const HOST_ID = 'ypuf-snooze-host';
  const existing = document.getElementById(HOST_ID);
  if (existing) { existing.remove(); return; } // re-press closes

  // Preset ids mirror the popup's data-preset values (snooze.resolve in the SW).
  const PRESETS = [
    { preset: 'later-today', label: 'Later today' },
    { preset: 'this-evening', label: 'This evening' },
    { preset: 'tomorrow-morning', label: 'Tomorrow morning' },
    { preset: 'this-weekend', label: 'This weekend' },
    { preset: 'next-week', label: 'Next week' },
    { preset: 'when-im-back', label: "When I'm back" },
  ];

  const STYLES = `
    :host {
      all: initial;
      /* Own top-level stacking context at the max z-index so no page element (however
         high its own z-index) can paint over the modal. The host is appended last to
         <html>, so even a page element also at max z-index loses on DOM order. */
      position: fixed; z-index: 2147483647;
      --bg: #fffdf9; --ink: #1a1613; --line: #e8e2da; --hover: #efe9e0; --muted: #9a918a;
      --accent: #c8713a; --field: #f8f5f0; --backdrop: rgba(26,22,19,0.28); --shadow: rgba(26,22,19,0.32);
    }
    :host([data-theme="dark"]) {
      --bg: #2a251e; --ink: #f0ebe1; --line: #3a342b; --hover: #353029; --muted: #a89e90;
      --accent: #e0a875; --field: #211d17; --backdrop: rgba(0,0,0,0.5); --shadow: rgba(0,0,0,0.6);
    }
    :host([data-theme="star"]) {
      --bg: #14142a; --ink: rgba(232,224,255,0.92); --line: rgba(232,224,255,0.16);
      --hover: rgba(232,224,255,0.08); --muted: rgba(232,224,255,0.5); --accent: #d9ccff;
      --field: #0b0b14; --backdrop: rgba(5,5,14,0.55); --shadow: rgba(0,0,0,0.7);
    }
    .backdrop { position: fixed; inset: 0; background: var(--backdrop); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
    .panel {
      position: fixed; top: 16vh; left: 50%; transform: translateX(-50%);
      width: min(380px, 92vw); display: flex; flex-direction: column;
      background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 16px;
      box-shadow: 0 24px 70px -8px var(--shadow); overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .panel:focus { outline: none; }   /* focused only to receive keys; the active row is the cursor */
    .head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); padding: 14px 16px 10px; border-bottom: 1px solid var(--line); }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
    .opts { list-style: none; margin: 0; padding: 6px; }
    .opt { display: flex; align-items: baseline; gap: 10px; padding: 9px 12px; border-radius: 10px; cursor: pointer; }
    .opt.active, .opt:hover { background: var(--hover); }
    .opt .key { font-size: 11px; color: var(--muted); width: 12px; flex: none; text-align: center; }
    .opt .label { font-size: 14px; color: var(--ink); }
    /* The Custom row sits below a divider but its option must line up with 1–6 above it:
       same 6px container pad + the .opt's own 12px, not the old extra 18px inset. */
    .custom-row { padding: 6px 6px 10px; border-top: 1px solid var(--line); }
    .custom-input { font: inherit; font-size: 13px; margin: 7px 0 0 34px; padding: 5px 7px;
      border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); }
    .custom-input[hidden] { display: none; }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // contenteditable so vim-style page extensions (Vimium, Surfingkeys) see an editable
  // activeElement (the host, via the closed shadow) and YIELD — otherwise they swallow the
  // 1–6/0 number keys. The light DOM is empty (everything is in the shadow), so no user
  // data is page-reachable; the privacy guarantee is the closed root below. (See solutions
  // pattern 21.)
  host.setAttribute('contenteditable', 'true');
  // CLOSED shadow root: host.shadowRoot is null, so no page script can read the
  // chooser or attach to it. Refs live in this closure. (Privacy is load-bearing.)
  const shadow = host.attachShadow({ mode: 'closed' });

  // Match the chosen theme: instant prefers-color-scheme guess, then refine from storage.
  const applyTheme = (mode) => { host.dataset.theme = (mode === 'dark' || mode === 'star') ? mode : 'light'; };
  try { applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { applyTheme('light'); }

  const style = document.createElement('style');
  style.textContent = STYLES;
  const backdrop = document.createElement('div'); backdrop.className = 'backdrop';
  const panel = document.createElement('div'); panel.className = 'panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Snooze this tab');
  const head = document.createElement('div'); head.className = 'head';
  const dot = document.createElement('span'); dot.className = 'dot';
  const headText = document.createElement('span'); headText.textContent = 'Snooze this tab until…';
  head.append(dot, headText);
  const opts = document.createElement('ul'); opts.className = 'opts';
  panel.append(head, opts);
  shadow.append(style, backdrop, panel);
  (document.documentElement || document.body).appendChild(host);

  try {
    chrome.storage.local.get('ypuf-theme', (o) => {
      if (closed || chrome.runtime.lastError) return;
      const t = o && o['ypuf-theme'];
      if (t === 'light' || t === 'dark' || t === 'star') applyTheme(t);
    });
  } catch { /* storage unavailable on this host — keep the prefers-color-scheme guess */ }

  const prevFocus = document.activeElement;
  let active = 0;
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    host.remove();
    try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch { /* ignore */ }
  }

  function snooze(preset, custom) {
    if (closed) return;
    chrome.runtime.sendMessage({ type: 'snooze', preset, custom }, () => void chrome.runtime.lastError);
    close();
  }

  function setActive(i) {
    active = Math.max(0, Math.min(PRESETS.length - 1, i));
    [...opts.children].forEach((el, idx) => el.classList.toggle('active', idx === active));
    const el = opts.children[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  PRESETS.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'opt';
    const key = document.createElement('span'); key.className = 'key'; key.textContent = String(i + 1);
    const label = document.createElement('span'); label.className = 'label'; label.textContent = p.label;
    li.append(key, label);
    li.addEventListener('mousemove', () => setActive(i));
    li.addEventListener('click', () => snooze(p.preset));
    opts.appendChild(li);
  });

  // Custom… reveals a datetime-local; a valid future time snoozes until then.
  const customRow = document.createElement('div'); customRow.className = 'custom-row';
  const customBtn = document.createElement('div'); customBtn.className = 'opt';
  const ckey = document.createElement('span'); ckey.className = 'key'; ckey.textContent = '0';
  const clabel = document.createElement('span'); clabel.className = 'label'; clabel.textContent = 'Custom…';
  customBtn.append(ckey, clabel);
  const customInput = document.createElement('input');
  customInput.className = 'custom-input'; customInput.type = 'datetime-local'; customInput.hidden = true;
  customRow.append(customBtn, customInput);
  panel.appendChild(customRow);

  function openCustom() {
    customInput.hidden = false;
    customInput.focus();
  }
  customBtn.addEventListener('click', openCustom);
  customInput.addEventListener('change', () => {
    const ts = customInput.value ? new Date(customInput.value).getTime() : NaN;
    if (!Number.isNaN(ts) && ts > Date.now()) snooze('custom', ts);
  });

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.target === customInput) return;   // let the datetime field own its own keys (digits/arrows)
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); return; }
    if (e.key === 'Enter') { e.preventDefault(); snooze(PRESETS[active].preset); return; }
    if (e.key === '0') { e.preventDefault(); openCustom(); return; }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= PRESETS.length) { e.preventDefault(); snooze(PRESETS[n - 1].preset); }
  });
  backdrop.addEventListener('click', close);

  // Vim extensions own Escape in insert mode (they grab it to exit, blurring the host).
  // Close when focus leaves the overlay entirely; focus within the closed shadow keeps the
  // host as activeElement so it stays open. (See solutions pattern 21.)
  host.addEventListener('focusout', () => {
    setTimeout(() => {
      if (closed || !document.hasFocus()) return;   // whole-window blur (alt-tab) is NOT a dismiss
      if (document.activeElement !== host) close();
    }, 0);
  });

  panel.tabIndex = -1;
  panel.focus();
  setActive(0);
})();
