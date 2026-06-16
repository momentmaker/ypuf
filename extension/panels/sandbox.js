/*
 * ypuf — sandboxed panel render surface (slice 5 / U1, R9/R13).
 *
 * This runs in a sandboxed iframe (manifest `sandbox`): allow-scripts but NO
 * allow-same-origin, so it is a null origin with no `chrome.*`, no extension
 * storage, no reach into the parent's DOM. The sandbox CSP also removes network
 * egress (default-src/connect-src/img-src 'none') — this surface CANNOT fetch.
 * It only renders text the privileged board host posts in, and posts back
 * validated intents (e.g. "open headline N"). It is render-only by construction.
 *
 * Protocol (host ⇄ sandbox), mirrored by lib/channel.js on the host side:
 *   host → sandbox:  { ypuf:'panel', v:1, kind:'render', body:{ lines, note, foot } }
 *   sandbox → host:  { ypuf:'panel', v:1, kind:'intent', intent:'open', index:N }
 *
 * Every string is written via textContent — never innerHTML. A feed/price byte
 * that contains markup renders as inert text.
 */
'use strict';

(function () {
  const PROTO = 'panel';
  const VERSION = 1;
  const root = document.getElementById('root');

  function postIntent(intent, index) {
    // Null-origin sandbox → the parent's origin is "null", so targetOrigin must be
    // '*'. We carry no secret outbound (just an intent index the host re-validates),
    // and the host validates event.source before acting, so '*' is safe here.
    window.parent.postMessage({ ypuf: PROTO, v: VERSION, kind: 'intent', intent, index }, '*');
  }

  function lineNode(line) {
    const text = (line && typeof line.text === 'string') ? line.text : '';
    if (line && Number.isInteger(line.open)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'line';
      b.textContent = text;                       // inert: markup never parsed
      b.addEventListener('click', () => postIntent('open', line.open));
      return b;
    }
    const li = document.createElement('li');
    li.className = 'line';
    li.textContent = text;
    return li;
  }

  function render(body) {
    root.textContent = '';
    const lines = document.createElement('ul');
    lines.className = 'lines';
    const arr = (body && Array.isArray(body.lines)) ? body.lines : [];
    arr.forEach((line) => lines.appendChild(lineNode(line)));
    root.appendChild(lines);

    if (body && typeof body.note === 'string' && body.note) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = body.note;
      root.appendChild(note);
    }
    if (body && typeof body.foot === 'string' && body.foot) {
      const foot = document.createElement('div');
      foot.className = 'foot';
      foot.textContent = body.foot;               // disclosure line (R10), inert
      root.appendChild(foot);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;   // only the embedding board host
    const msg = event.data;
    if (!msg || msg.ypuf !== PROTO || msg.v !== VERSION) return;
    if (msg.kind === 'render') render(msg.body);
  });

  // Announce readiness so the host knows the frame is listening before it posts.
  window.parent.postMessage({ ypuf: PROTO, v: VERSION, kind: 'ready' }, '*');
})();
