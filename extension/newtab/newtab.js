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
 * U1 ships the shell + the host↔sandbox channel plumbing. boardConfig + edit mode
 * (U2), the ypuf panel (U3), the broker + panel-source registry (U4), and the RSS
 * (U5) / crypto (U6) panel types land on top of this.
 */
'use strict';

(function () {
  const PROTO = 'panel';
  const VERSION = 1;

  const grid = document.getElementById('board-grid');
  const emptyNote = document.getElementById('board-empty');

  // --- panel cells ---------------------------------------------------------

  function panelCell(label) {
    const cell = document.createElement('section');
    cell.className = 'panel';
    cell.setAttribute('role', 'region');
    cell.setAttribute('aria-label', label || 'panel');
    const head = document.createElement('header');
    head.className = 'panel-head';
    const title = document.createElement('span');
    title.className = 'panel-title';
    title.textContent = label || '';
    head.appendChild(title);
    const body = document.createElement('div');
    body.className = 'panel-body';
    cell.append(head, body);
    return { cell, head, body };
  }

  // --- host-side sandbox channel ------------------------------------------
  // Mounts panels/sandbox.html in an iframe (the manifest `sandbox` key serves it
  // null-origin — no allow-same-origin is added). All messaging is validated:
  // we only ever accept messages whose source IS this panel's own contentWindow
  // (a forged source from any other frame is dropped), and we post to that exact
  // contentWindow. The pure envelope/intent kernel is extracted to lib/channel.js
  // (U4); this is the DOM plumbing around it.

  function mountSandbox(body, onIntent) {
    const frame = document.createElement('iframe');
    frame.className = 'panel-frame';
    frame.title = 'panel content';
    frame.src = chrome.runtime.getURL('panels/sandbox.html');

    let ready = false;
    let queued = null;

    function handle(event) {
      if (event.source !== frame.contentWindow) return;   // R9: only THIS frame
      const msg = event.data;
      if (!msg || msg.ypuf !== PROTO || msg.v !== VERSION) return;
      if (msg.kind === 'ready') {
        ready = true;
        if (queued) { post(queued); queued = null; }
        return;
      }
      if (msg.kind === 'intent' && typeof onIntent === 'function') onIntent(msg);
    }
    window.addEventListener('message', handle);

    function post(renderBody) {
      if (!ready) { queued = renderBody; return; }
      // Null-origin target → targetOrigin '*'; the payload is already-sanitized
      // text only (no secret), and the inbound source check above is the guard.
      frame.contentWindow.postMessage({ ypuf: PROTO, v: VERSION, kind: 'render', body: renderBody }, '*');
    }

    body.appendChild(frame);
    return {
      render: post,
      destroy() { window.removeEventListener('message', handle); frame.remove(); },
    };
  }

  // --- board render --------------------------------------------------------
  // U1: no persisted panels yet (boardConfig is U2), so the board renders its
  // calm empty state. The add-panel affordance is wired in U2.

  function renderBoard() {
    grid.textContent = '';
    const panels = currentPanels();
    emptyNote.hidden = panels.length > 0;
    for (const spec of panels) mountPanel(spec);
  }

  function currentPanels() {
    // Replaced by boardConfig in U2. The #selftest panel is the U1 isolation proof.
    if (location.hash === '#selftest') return [{ type: 'selftest', label: 'Sandbox self-test' }];
    return [];
  }

  function mountPanel(spec) {
    if (spec.type === 'selftest') return mountSelfTest(spec);
    // Real panel types (ypuf, rss, crypto) register here in U3–U6.
  }

  // --- U1 isolation proof (open newtab.html#selftest) ----------------------
  // Verifies the channel end to end: text renders inert, the sandbox has no
  // chrome.*/network egress (CSP), and a forged-source intent is dropped.

  function mountSelfTest(spec) {
    const { cell, body } = panelCell(spec.label);
    const ch = mountSandbox(body, (intent) => {
      console.log('[ypuf] self-test intent received (host validated source):', intent);
    });
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

  renderBoard();
  window.addEventListener('hashchange', renderBoard);
})();
