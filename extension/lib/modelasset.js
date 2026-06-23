/*
 * ypuf — semantic-recall model-asset lifecycle (U4).
 *
 * The download-once-on-opt-in shell around the pure embedding core (lib/embed.js):
 * fetch the static-embedding asset (model.safetensors + tokenizer.json) from a
 * pinned ypuf GitHub-Release URL, SHA-256-verify the weights against a PINNED hex
 * constant ON DOWNLOAD and AGAIN ON EVERY COLD-START CACHE READ (re-verify guards
 * cache tampering), cache both blobs in Cache Storage, and purge cleanly on opt-out.
 *
 * Two halves, the same split embed.js uses:
 *   PURE core (unit-tested; no chrome.* / network / Cache):
 *     sha256Hex(arrayBuffer)        -> Promise<hex>        (crypto.subtle.digest)
 *     constantTimeEqualHex(a, b)    -> bool                (length-safe, no early-out)
 *   IMPURE shell (page context — runs from the new-tab page, NOT the SW):
 *     ensureModel({ onProgress })   -> { matrix, dim, tokenizer, modelVersion }
 *     loadFromCache()               -> same | null  (cache miss is a NORMAL state)
 *     isCached()                    -> bool
 *     purge()                       -> void (caches.delete the whole bucket)
 *     requestHostPermission()/revokeHostPermission() -> the NARROW grant only
 *
 * The model is DATA, not code — no remote code, no WASM, no CSP change. The
 * download runs in the page (an SW death mid-download just re-offers on next open);
 * the parsed model is handed to background.js's `_semantic` seam by U6.
 *
 * eviction-safe: a cache miss is not an error. loadFromCache()/ensureModel()
 * return null on miss so the caller falls back to keyword recall and offers a
 * re-download — the browser is allowed to evict the bucket at any time.
 */
(function (root) {
  'use strict';

  // embed.js does the safetensors parse + tokenizer build; this module only
  // fetches/verifies/caches the bytes and hands them over. Resolve it the same
  // way the SW libs do: prefer the attached namespace, fall back to require.
  const embed = (root.ypuf && root.ypuf.embed)
    || (typeof require !== 'undefined' ? require('./embed.js') : null);

  // --- pinned asset (rotated atomically per model release; see U7 checklist) ---
  //
  // The SHA-256 of potion-base-8M's model.safetensors. Computed from the spike's
  // tools/semantic-spike/model/model.safetensors via `shasum -a 256`. A model bump
  // updates this hash AND the URL together, and re-tags every vector (U3) so stale
  // vectors are invalidated — the release checklist (U7) verifies the bytes before
  // tagging.
  //
  // NOTE: the asset must be UPLOADED to the GitHub Release below before opt-in
  // works end-to-end. That upload is a U7 / release step — until then ensureModel()
  // fetches will 404 and the caller falls back to keyword (the calm failure path).
  const PINNED_SAFETENSORS_SHA256 =
    'f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2';

  const RELEASE_BASE =
    'https://github.com/momentmaker/ypuf/releases/download/semantic-model-v1';
  const SAFETENSORS_URL = RELEASE_BASE + '/model.safetensors';
  const TOKENIZER_URL = RELEASE_BASE + '/tokenizer.json';

  // Cache Storage bucket holding both blobs. Versioned so a future asset shape
  // change can ship a fresh bucket and purge the old one.
  const CACHE_NAME = 'ypuf-semantic-v1';

  // The NARROW optional host permission opt-in requests in-gesture (U6 calls
  // requestHostPermission inside the user click) and opt-out revokes. NEVER
  // <all_urls> — revoking that would trip background.js's permissions.onRemoved
  // and disable auto-let-go. Two origins: the release host AND its 302 redirect
  // target (GitHub redirects /releases/download/* to objects.githubusercontent.com).
  const HOST_PERMISSION = {
    origins: [
      'https://github.com/momentmaker/ypuf/releases/*',
      'https://objects.githubusercontent.com/*',
    ],
  };

  // --- pure core -----------------------------------------------------------

  // SHA-256 of an ArrayBuffer as lowercase, zero-padded hex. crypto.subtle exists
  // in both the page and node's --test runner, so this is testable without a shim.
  async function sha256Hex(arrayBuffer) {
    const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  // Length-safe, no-early-out hex compare. A mismatched length is a mismatch
  // (return false) but is still walked to a fixed bound so timing leaks no info
  // about WHERE the first differing nibble is.
  function constantTimeEqualHex(a, b) {
    const sa = String(a);
    const sb = String(b);
    const len = Math.max(sa.length, sb.length);
    let diff = sa.length ^ sb.length;
    for (let i = 0; i < len; i++) {
      diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  // --- impure shell --------------------------------------------------------

  // Fetch a URL to an ArrayBuffer, reporting byte progress when the host sends a
  // Content-Length. default redirect:'follow' — GitHub 302s release-download URLs
  // to objects.githubusercontent.com, so we must NOT set redirect:'error' and must
  // NOT run the RSS broker's sourceurl SSRF validator (either would hard-fail the
  // legitimate redirect). credentials:'omit' + no-referrer keep the request clean.
  async function fetchBuffer(url, onChunk) {
    const res = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      // redirect defaults to 'follow' — intentional (GitHub's 302 to the CDN).
    });
    if (!res.ok) throw new Error('http-' + res.status);

    const total = Number(res.headers.get('content-length')) || 0;
    // No stream / no progress callback → the simple path (still verified later).
    if (!res.body || typeof onChunk !== 'function') return res.arrayBuffer();

    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onChunk(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out.buffer;
  }

  // Verify the safetensors bytes against the pinned hash, then derive the
  // model-version tag from the VERIFIED bytes (first 16 hex chars). The tag is
  // the verified hash itself — never a separate constant — so a vector can never
  // be tagged a version it wasn't actually embedded with. Returns the tag.
  async function verifySafetensors(buf) {
    const hex = await sha256Hex(buf);
    if (!constantTimeEqualHex(hex, PINNED_SAFETENSORS_SHA256)) {
      throw new Error('integrity-mismatch');
    }
    return hex.slice(0, 16);
  }

  // Parse the verified safetensors + tokenizer bytes into the model the embed
  // core needs. modelVersion rides along, derived from the verified hash.
  function buildModel(safetensorsBuf, tokenizerBuf, modelVersion) {
    const { matrix, dim } = embed.parseSafetensors(safetensorsBuf);
    const tokenizerJson = JSON.parse(new TextDecoder('utf-8').decode(tokenizerBuf));
    const tokenizer = embed.makeTokenizer(tokenizerJson);
    return { matrix, dim, tokenizer, modelVersion };
  }

  async function openCache() { return caches.open(CACHE_NAME); }

  // Have we already cached both blobs? (A bucket may exist but be partial after an
  // interrupted download — require BOTH to count as cached.)
  async function isCached() {
    try {
      const cache = await openCache();
      const a = await cache.match(SAFETENSORS_URL);
      const b = await cache.match(TOKENIZER_URL);
      return !!(a && b);
    } catch { return false; }
  }

  // Read the cached blobs and RE-VERIFY the safetensors hash before parsing —
  // this is the cache-tampering guard (~20ms for 30MB). A miss, a partial cache,
  // or a failed re-verify all return null: a cache miss is a NORMAL state the
  // caller handles (keyword fallback + re-download offer), not an error.
  async function loadFromCache() {
    let cache;
    try { cache = await openCache(); } catch { return null; }
    const safRes = await cache.match(SAFETENSORS_URL).catch(() => null);
    const tokRes = await cache.match(TOKENIZER_URL).catch(() => null);
    if (!safRes || !tokRes) return null;

    const safetensorsBuf = await safRes.arrayBuffer();
    const tokenizerBuf = await tokRes.arrayBuffer();
    let modelVersion;
    try {
      modelVersion = await verifySafetensors(safetensorsBuf); // re-verify on read
    } catch {
      // Tampered/corrupt cached blob — drop the poisoned bucket so the next
      // ensureModel() re-downloads clean rather than re-failing the same bytes.
      await purge();
      return null;
    }
    return buildModel(safetensorsBuf, tokenizerBuf, modelVersion);
  }

  // The opt-in download. If both blobs are already cached, load (and re-verify)
  // from cache — no refetch. Otherwise fetch both, verify the safetensors on
  // download, cache both, and return the parsed model. onProgress({loaded,total})
  // reports the safetensors download (the large blob). Throws on download/verify
  // failure so U6 can render the calm "couldn't download — try again?" state;
  // nothing is cached on a verify failure.
  async function ensureModel(opts) {
    const onProgress = (opts && opts.onProgress) || null;
    const cached = await loadFromCache();
    if (cached) return cached;

    // Download both blobs (safetensors progress is the one worth showing).
    const safetensorsBuf = await fetchBuffer(
      SAFETENSORS_URL,
      onProgress ? (loaded, total) => onProgress({ loaded, total }) : null,
    );
    const modelVersion = await verifySafetensors(safetensorsBuf); // verify-on-download
    const tokenizerBuf = await fetchBuffer(TOKENIZER_URL, null);

    // Cache only AFTER verify passes (a tampered download is never persisted).
    const cache = await openCache();
    await cache.put(SAFETENSORS_URL, new Response(safetensorsBuf));
    await cache.put(TOKENIZER_URL, new Response(tokenizerBuf));

    return buildModel(safetensorsBuf, tokenizerBuf, modelVersion);
  }

  // Clean purge (opt-out / poisoned-cache recovery): delete the whole bucket.
  // Idempotent — a never-cached or already-deleted bucket is a no-op, not an error.
  async function purge() {
    try { await caches.delete(CACHE_NAME); } catch { /* nothing cached */ }
  }

  // --- narrow host permission (U6 calls these inside the opt-in user gesture) --
  //
  // chrome.permissions.request must run synchronously in a user gesture; these
  // are thin promise wrappers callers invoke directly from the click handler.
  // Mirrors newtab.js's grantThenAdd, but for our two release origins — NOT
  // <all_urls> (which is load-bearing for auto-let-go).
  function requestHostPermission() {
    return new Promise((resolve) => {
      try {
        chrome.permissions.request(HOST_PERMISSION, (granted) => {
          resolve(!chrome.runtime.lastError && !!granted);
        });
      } catch { resolve(false); } // a lost gesture is a denial, never a thrown click
    });
  }

  function revokeHostPermission() {
    return new Promise((resolve) => {
      try {
        chrome.permissions.remove(HOST_PERMISSION, (removed) => {
          resolve(!chrome.runtime.lastError && !!removed);
        });
      } catch { resolve(false); }
    });
  }

  function hasHostPermission() {
    return new Promise((resolve) => {
      try {
        chrome.permissions.contains(HOST_PERMISSION, (has) => {
          resolve(!chrome.runtime.lastError && !!has);
        });
      } catch { resolve(false); }
    });
  }

  const api = {
    // pure core (tested)
    sha256Hex,
    constantTimeEqualHex,
    // impure shell
    ensureModel,
    loadFromCache,
    isCached,
    purge,
    requestHostPermission,
    revokeHostPermission,
    hasHostPermission,
    // constants (read-only; useful to tests / callers / the release checklist)
    PINNED_SAFETENSORS_SHA256,
    SAFETENSORS_URL,
    TOKENIZER_URL,
    CACHE_NAME,
    HOST_PERMISSION,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { modelasset: api });
})(typeof self !== 'undefined' ? self : globalThis);
