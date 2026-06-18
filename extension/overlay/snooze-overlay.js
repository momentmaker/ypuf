/*
 * ypuf — in-page snooze overlay.
 *
 * Injected programmatically into the active page by the service worker on the
 * snooze hotkey (so it needs no web_accessible_resources). It mirrors the recall
 * overlay: RENDER/KEYSTROKE-ONLY in a CLOSED shadow root (isolated from host-page
 * CSS and unreadable by page scripts). The user picks a return time; the SW
 * captures the active tab and schedules — snooze "always picks a time, never a
 * silent default". A second snooze hotkey press closes an open overlay.
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
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; background: rgba(26,22,19,0.28); }
    .panel {
      position: fixed; top: 16vh; left: 50%; transform: translateX(-50%);
      width: min(380px, 92vw); display: flex; flex-direction: column;
      background: #fffdf9; color: #1a1613; border-radius: 14px;
      box-shadow: 0 24px 60px rgba(26,22,19,0.30); overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .head { font-size: 13px; color: #9a918a; padding: 15px 18px 9px; border-bottom: 1px solid #e8e2da; }
    .opts { list-style: none; margin: 0; padding: 6px; }
    .opt { display: flex; align-items: baseline; gap: 10px; padding: 9px 12px; border-radius: 9px; cursor: pointer; }
    .opt.active, .opt:hover { background: #e8e2da; }
    .opt .key { font-size: 11px; color: #9a918a; width: 12px; }
    .opt .label { font-size: 14px; }
    .custom-row { padding: 8px 18px 14px; border-top: 1px solid #e8e2da; }
    .custom-input { font: inherit; font-size: 13px; margin-top: 7px; padding: 5px 7px;
      border: 1px solid #e8e2da; border-radius: 7px; background: #f8f5f0; color: inherit; }
    .custom-input[hidden] { display: none; }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // CLOSED shadow root: host.shadowRoot is null, so no page script can read the
  // chooser or attach to it. Refs live in this closure. (Privacy is load-bearing.)
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  const backdrop = document.createElement('div'); backdrop.className = 'backdrop';
  const panel = document.createElement('div'); panel.className = 'panel'; panel.setAttribute('role', 'dialog');
  const head = document.createElement('div'); head.className = 'head'; head.textContent = 'Snooze this tab until…';
  const opts = document.createElement('ul'); opts.className = 'opts';
  panel.append(head, opts);
  shadow.append(style, backdrop, panel);
  (document.documentElement || document.body).appendChild(host);

  const prevFocus = document.activeElement;
  let active = 0;
  let closed = false;

  function close() {
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

  panel.tabIndex = -1;
  panel.focus();
  setActive(0);
})();
