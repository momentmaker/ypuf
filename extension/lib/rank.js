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

  function saturate(x, k) {
    const v = x > 0 ? x : 0;
    return v / (v + k);
  }

  function recencyScore(ageMs) {
    if (!(ageMs > 0)) return 0; // null, 0, undefined, negative -> "never recalled"
    return HALFLIFE / (HALFLIFE + ageMs);
  }

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
  //
  // TWO-AXIS (semantic recall U5): candidacy is driven by a `primary` score on a
  // shared 0..1 basis, so a zero-keyword meaning-match isn't buried by the text
  // FLOOR. When the caller passes a two-axis context (`opts.primaryMax` set,
  // meaning at least one row carries a semantic value), `primary = max(textNorm,
  // semantic)` where `textNorm = textScore / opts.textMax` (cosine is already
  // 0..1), the FLOOR/cap operate on `primary` (NOT text-only — an all-semantic
  // result set has text-max 0, so a text-only FLOOR*0 would admit everything),
  // and the lifted score is in the same 0..1 space so neither axis buries the
  // other. With NO semantic context (`opts.primaryMax` absent), this is the exact
  // legacy text-unit blend — preserved byte-for-byte so the keyword path is
  // unchanged when semantic is off.
  function blend(textScore, signal, opts) {
    const o = opts || {};
    if (o.primaryMax > 0) {
      const textMax = o.textMax > 0 ? o.textMax : 0;
      const textNorm = textMax > 0 ? (textScore > 0 ? textScore / textMax : 0) : 0;
      const sem = o.semantic > 0 ? (o.semantic > 1 ? 1 : o.semantic) : 0;
      const primary = textNorm > sem ? textNorm : sem;
      if (primary < FLOOR * o.primaryMax) return primary;
      return primary * (1 + MAX_LIFT * intentStrength(signal));
    }
    const topScore = o.topScore > 0 ? o.topScore : textScore;
    const score = textScore > 0 ? textScore : 0;
    if (score < FLOOR * topScore) return score;
    return score * (1 + MAX_LIFT * intentStrength(signal));
  }

  // The 0..1 candidacy axis for one row: max of its text relevance (normalized
  // against the run's text-max) and its semantic cosine. Used to find the run's
  // primaryMax before blending.
  function primaryOf(textScore, semantic, textMax) {
    const textNorm = textMax > 0 ? (textScore > 0 ? textScore / textMax : 0) : 0;
    const sem = semantic > 0 ? (semantic > 1 ? 1 : semantic) : 0;
    return textNorm > sem ? textNorm : sem;
  }

  // Re-rank text-search hits by blended score. Each hit: { id, score, signal,
  // semantic? } where signal.ageMs is already (now - lastAccessed),
  // born-equal-aware, and `semantic` is an optional 0..1 cosine (a meaning-match
  // candidate). Returns a NEW array (input untouched), each row annotated with
  // `_blended`, sorted by blended score desc, stable on ties (original order).
  //
  // The two-axis path engages ONLY when at least one row carries a semantic
  // value; otherwise the run is identical to the legacy keyword rerank.
  function rerank(hits) {
    if (!Array.isArray(hits) || hits.length === 0) return [];
    let textMax = 0;
    let hasSemantic = false;
    for (const h of hits) {
      if (!h) continue;
      if (h.score > textMax) textMax = h.score;
      if (h.semantic > 0) hasSemantic = true;
    }

    let opts;
    if (hasSemantic) {
      let primaryMax = 0;
      for (const h of hits) {
        if (!h) continue;
        const p = primaryOf(h.score, h.semantic, textMax);
        if (p > primaryMax) primaryMax = p;
      }
      opts = (h) => ({ textMax, primaryMax, semantic: h.semantic });
    } else {
      opts = () => ({ topScore: textMax });
    }

    const annotated = hits.map((h, i) => ({
      hit: h, i, blended: blend(h.score, h.signal, opts(h)),
    }));
    annotated.sort((a, b) => (b.blended - a.blended) || (a.i - b.i));
    return annotated.map((a) => Object.assign({}, a.hit, { _blended: a.blended }));
  }

  const api = { rerank, blend, intentStrength, primaryOf, FLOOR, MAX_LIFT };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { rank: api });
})(typeof self !== 'undefined' ? self : globalThis);
