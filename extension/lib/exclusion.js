/*
 * ypuf — privacy exclusion gate (U2).
 *
 * The single entry point that enforces gate-then-extract. Pure function:
 * the service worker reads the user blocklist from chrome.storage and passes
 * it in, so this module needs no chrome.* and is fully unit-testable.
 *
 *   classify({ url, incognito }, userBlocklist) -> { kind, url, host }
 *     kind: 'never-index'  — incognito; store nothing at all (R14)
 *           'metadata-only' — blocklisted / restricted / unparseable;
 *                             store title + URL only, query stripped (R15)
 *           'extractable'  — normal page; full content capture allowed
 *
 * Fails closed: anything we cannot positively classify as a normal injectable
 * web page is 'metadata-only', never 'extractable'.
 */
(function (root) {
  'use strict';

  // Shipped default sensitive-domain blocklist. User-extensible at runtime;
  // refined with dogfooding. Banking · health · government · password managers.
  const DEFAULT_BLOCKLIST = [
    // banking / finance
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'citibank.com',
    'capitalone.com', 'usbank.com', 'pnc.com', 'americanexpress.com', 'discover.com',
    'paypal.com', 'venmo.com', 'schwab.com', 'fidelity.com', 'vanguard.com', 'ally.com',
    // health
    'mychart.com', 'healthcare.gov', 'anthem.com', 'kaiserpermanente.org', 'cigna.com',
    'uhc.com', 'goodrx.com',
    // government
    'irs.gov', 'ssa.gov', 'login.gov', 'usa.gov', 'uscis.gov',
    // password managers
    '1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com',
    'keepersecurity.com', 'nordpass.com',
  ];

  const RESTRICTED_SCHEMES = new Set([
    'chrome:', 'edge:', 'brave:', 'about:', 'view-source:',
    'chrome-extension:', 'moz-extension:', 'data:', 'blob:', 'file:',
  ]);

  const WEB_STORE_HOSTS = new Set(['chromewebstore.google.com']);

  function stripQuery(u) {
    // origin + pathname only — drops ?query and #hash (which carry tokens/PII)
    return u.origin + u.pathname;
  }

  function hostMatches(host, entry) {
    return host === entry || host.endsWith('.' + entry);
  }

  function isBlocklisted(host, lists) {
    for (const list of lists) {
      for (const entry of list) {
        if (hostMatches(host, entry)) return true;
      }
    }
    return false;
  }

  function classify(tab, userBlocklist) {
    const incognito = !!(tab && tab.incognito);
    const rawUrl = tab && tab.url;

    if (incognito) return { kind: 'never-index', url: null, host: null };

    let u;
    try {
      u = new URL(rawUrl);
    } catch {
      // Unparseable → fail closed. Keep whatever string we were given for recall.
      return { kind: 'metadata-only', url: rawUrl || null, host: null };
    }

    if (RESTRICTED_SCHEMES.has(u.protocol) ||
        WEB_STORE_HOSTS.has(u.hostname) ||
        u.pathname.toLowerCase().endsWith('.pdf')) {
      return { kind: 'metadata-only', url: stripQuery(u), host: u.hostname };
    }

    if (isBlocklisted(u.hostname, [DEFAULT_BLOCKLIST, userBlocklist || []])) {
      return { kind: 'metadata-only', url: stripQuery(u), host: u.hostname };
    }

    return { kind: 'extractable', url: u.href, host: u.hostname };
  }

  const api = { classify, stripQuery, hostMatches, DEFAULT_BLOCKLIST, RESTRICTED_SCHEMES };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { exclusion: api });
})(typeof self !== 'undefined' ? self : globalThis);
