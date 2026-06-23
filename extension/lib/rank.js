/*
 * ypuf — recall ranking blend (Recall v2 / U1).
 *
 * Pure, tested core that folds the engine's intent signal (revisit frequency,
 * foreground dwell, recency) into MiniSearch's text relevance — so the page the
 * user most likely wants ranks first, WITHOUT letting a daily-driver page float
 * to the top of every query it weakly matches.
 *
 * Intent is a BOUNDED TIE-BREAKER, not a multiplier that can overcome text
 * relevance: it only reorders rows that already clear a relevance FLOOR relative
 * to the top text score, and even a floor-edge row maxing out its signal cannot
 * pass the strongest zero-signal text hit (FLOOR * (1 + MAX_LIFT) <= 1). This is
 * the guard against cross-document dominance (Pattern: a 200x-revisit page must
 * not outrank a strong exact match on an unrelated query).
 *
 * Why a post-search re-rank and not MiniSearch `boostDocument`: boostDocument is
 * called per-term during scoring and never sees the final/top score, so it
 * cannot enforce the relevance floor. The SW runs the text search, then hands
 * the hits (each with its text score + the signal joined by URL) to rerank().
 *
 * Signal is per row: { revisits, dwell, ageMs }. `ageMs` is null/0 for a
 * born-equal record (lastAccessed === timestamp -> never recalled) and yields
 * NO recency lift (Pattern 19).
 */
(function (root) {
  'use strict';

  const FLOOR = 0.6;        // a hit must score >= FLOOR * topScore to receive any lift
  const MAX_LIFT = 0.5;     // max fractional boost; FLOOR * (1 + MAX_LIFT) = 0.9 <= 1
  const K_REVISIT = 5;      // revisits saturate: 5 revisits ~= half weight
  const K_DWELL = 10 * 60 * 1000;   // dwell saturates around ~10 min of foreground time
  const HALFLIFE = 3 * 86400000;    // recency half-life ~3 days
  const W = { revisit: 0.4, dwell: 0.26, recency: 0.34 }; // sum to 1

  // x / (x + k): a saturating 0..1 curve for unbounded counts/durations.
  function saturate(x, k) {
    const v = x > 0 ? x : 0;
    return v / (v + k);
  }

  function recencyScore(ageMs) {
    if (!(ageMs > 0)) return 0; // null, 0, undefined, negative -> "never recalled"
    return HALFLIFE / (HALFLIFE + ageMs);
  }

  // 0..1 strength of the behavioral signal for one row.
  function intentStrength(signal) {
    const s = signal || {};
    const r = saturate(s.revisits, K_REVISIT);
    const d = saturate(s.dwell, K_DWELL);
    const rec = recencyScore(s.ageMs);
    const v = W.revisit * r + W.dwell * d + W.recency * rec;
    return v > 1 ? 1 : v;
  }

  // The blended score for one row. Below the relevance floor the row keeps its
  // raw text score (pure-text order); above it, intent lifts it by up to MAX_LIFT.
  function blend(textScore, signal, opts) {
    const topScore = opts && opts.topScore > 0 ? opts.topScore : textScore;
    const score = textScore > 0 ? textScore : 0;
    if (score < FLOOR * topScore) return score;
    return score * (1 + MAX_LIFT * intentStrength(signal));
  }

  // Re-rank text-search hits by blended score. Each hit: { id, score, signal }
  // where signal.ageMs is already (now - lastAccessed), born-equal-aware. Returns
  // a NEW array (input untouched), each row annotated with `_blended`, sorted by
  // blended score desc, stable on ties (original order preserved).
  function rerank(hits) {
    if (!Array.isArray(hits) || hits.length === 0) return [];
    let topScore = 0;
    for (const h of hits) if (h && h.score > topScore) topScore = h.score;
    const annotated = hits.map((h, i) => ({
      hit: h, i, blended: blend(h.score, h.signal, { topScore }),
    }));
    annotated.sort((a, b) => (b.blended - a.blended) || (a.i - b.i));
    return annotated.map((a) => Object.assign({}, a.hit, { _blended: a.blended }));
  }

  const api = { rerank, blend, intentStrength, FLOOR, MAX_LIFT };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { rank: api });
})(typeof self !== 'undefined' ? self : globalThis);
