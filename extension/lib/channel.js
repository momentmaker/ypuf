/*
 * ypuf — host↔sandbox channel kernel (slice 5 / U4, R9/R13).
 *
 * The PURE half of the board↔sandbox protocol. Building/validating the envelope
 * and resolving a panel-supplied intent against the host's own state are the
 * security-bearing logic, and they are pure, so they live here and are unit-tested
 * (tests/broker-channel.test.js). The DOM half — creating the iframe and the live
 * `event.source === frame.contentWindow` check — lives in newtab.js, because the
 * cross-frame identity check is a browser-runtime property a node test can't hold
 * (it's covered by the forged-intent MANUAL-DOGFOOD step instead).
 *
 * This module is the thin extraction that makes the testable part testable — it is
 * NOT proof that the real frame boundary holds.
 *
 * Protocol:
 *   host → sandbox:  { ypuf:'panel', v:1, kind:'render', body:{ lines, note, foot } }
 *   sandbox → host:  { ypuf:'panel', v:1, kind:'intent', intent:'open', index:N }
 */
(function (root) {
  'use strict';

  const PROTO = 'panel';
  const VERSION = 1;

  const isEnvelope = (msg) => !!msg && msg.ypuf === PROTO && msg.v === VERSION;

  // Build a render envelope. `lines` are reduced to sanitized fields ONLY — text
  // (a string) plus an optional integer `open` index — so a raw URL or HTML field
  // an attacker-influenced parse might carry can never reach the sandbox.
  function renderEnvelope(body) {
    return {
      ypuf: PROTO,
      v: VERSION,
      kind: 'render',
      body: {
        lines: sanitizeLines(body && body.lines),
        note: typeof (body && body.note) === 'string' ? body.note : '',
        foot: typeof (body && body.foot) === 'string' ? body.foot : '',
      },
    };
  }

  function sanitizeLines(lines) {
    return (Array.isArray(lines) ? lines : []).map((l) => {
      const line = { text: (l && typeof l.text === 'string') ? l.text : String((l && l.text != null) ? l.text : '') };
      if (l && Number.isInteger(l.open)) line.open = l.open;   // an index, never a URL
      return line;
    });
  }

  // Parse an inbound message as a panel→host intent. Returns null for anything
  // that isn't a well-formed intent envelope (the live source check is the caller's).
  function parseIntent(msg) {
    if (!isEnvelope(msg) || msg.kind !== 'intent') return null;
    if (msg.intent === 'open' && Number.isInteger(msg.index)) return { intent: 'open', index: msg.index };
    return null;
  }

  // Pattern 15: resolve a panel-supplied index against the host's OWN parsed link
  // set. A forged, out-of-range, or non-integer index resolves to null — the panel
  // can only ever open a URL the host itself parsed, never one it names.
  function resolveOpen(index, links) {
    if (!Array.isArray(links)) return null;
    if (!Number.isInteger(index) || index < 0 || index >= links.length) return null;
    const url = links[index];
    return (typeof url === 'string' && url) ? url : null;
  }

  const api = { renderEnvelope, sanitizeLines, parseIntent, resolveOpen, PROTO, VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { channel: api });
})(typeof self !== 'undefined' ? self : globalThis);
