/*
 * ypuf — source-URL validation (slice 5 / U4, R12).
 *
 * A pure security control: a panel may only fetch a source URL that passes here.
 * https-only (blocks javascript:/data:/file:/http:), and blocks hostnames that
 * resolve to private/loopback/link-local space so a feed URL can't be aimed at the
 * LAN, the loopback interface, or cloud metadata (169.254.169.254) — the SSRF
 * surface. Config-time validation is necessary but not sufficient: the broker also
 * fetches with redirect:'error' so a validated public host can't 302 to a private
 * IP (U4). DNS-rebinding is an accepted residual.
 *
 * Built test-first (tests/sourceurl.test.js).
 */
(function (root) {
  'use strict';

  function parseIPv4(host) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return null;
    const o = m.slice(1).map(Number);
    return o.some((n) => n > 255) ? null : o;
  }

  function isPrivateV4(o) {
    const [a, b] = o;
    if (a === 0 || a === 10 || a === 127) return true;       // this-host / private / loopback
    if (a === 169 && b === 254) return true;                 // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;        // private
    if (a === 192 && b === 168) return true;                 // private
    if (a === 100 && b >= 64 && b <= 127) return true;       // carrier-grade NAT
    return false;
  }

  // validate(input) -> { ok, reason? , url?, origin?, host? }
  function validate(input) {
    let u;
    try { u = new URL(String(input)); } catch { return { ok: false, reason: 'not-a-url' }; }
    if (u.protocol !== 'https:') return { ok: false, reason: 'scheme' };
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, reason: 'loopback' };
    // Reject ALL IPv6 literals. Embedded-IPv4 (::ffff:/::compat), 6to4 (2002::), and
    // NAT64 (64:ff9b::) forms can each smuggle a private target past a hand-rolled
    // allow-list; no legitimate user RSS/crypto feed is served from a bare IPv6
    // literal, so blocking the whole class is the safe call (SSRF).
    if (host.includes(':')) return { ok: false, reason: 'ipv6-literal' };
    const v4 = parseIPv4(host);
    if (v4 && isPrivateV4(v4)) return { ok: false, reason: 'private-ip' };
    return { ok: true, url: u.href, origin: u.origin, host: u.hostname };
  }

  const api = { validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { sourceurl: api });
})(typeof self !== 'undefined' ? self : globalThis);
