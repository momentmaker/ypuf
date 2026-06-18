/*
 * ypuf — moon-phase / star toggle glyph (theming / U5, R15).
 *
 * DOM helper (renders into an injected container), so — like lib/shelf-render.js's toDom —
 * it lives in lib/ for cross-surface loading but is NOT node-unit-tested; the decidable
 * phase math is the pure lib/moonphase.js. Builds an inline SVG via createElementNS only
 * (never innerHTML).
 *
 * The moon uses the two-disc technique: a lit disc (currentColor) + a bg-coloured shadow
 * disc displaced by the illuminated fraction, plus a stroked rim so the dark limb stays
 * visible on the dark/navy grounds (the design-lens legibility fix). In star mode it draws
 * a five-point star instead.
 */
(function (root) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const node = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  // The decidable two-disc geometry (pure, exported for tests): the illuminated fraction
  // and the shadow disc's x-offset that reveals the lit limb (waxing left → right, waning
  // mirrored). f=0 at new (shadow centred → all dark), f=1 at full (shadow off-disc → all lit).
  function geometry(phase) {
    const f = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const waning = phase >= 0.5;
    const shadowX = 16 + (waning ? 1 : -1) * (26 * f);
    return { f, waning, shadowX };
  }

  function starGlyph() {
    const cx = 16, cy = 16, R = 13, r = 5.4, pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r : R;
      pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
    }
    return node('path', { d: `M${pts.join(' L')} Z`, fill: 'currentColor' });
  }

  // render(container, { phase, star }) — clears the container and draws the glyph.
  function render(container, opts) {
    opts = opts || {};
    while (container.firstChild) container.removeChild(container.firstChild);
    const svg = node('svg', { viewBox: '0 0 32 32', width: '18', height: '18', 'aria-hidden': 'true' });
    if (opts.star) {
      svg.appendChild(starGlyph());
    } else {
      const r = 13;
      const { shadowX } = geometry(opts.phase || 0);
      // The shadow (unlit) disc is filled with the surface behind the toggle. --toggle-bg
      // lets a non-paper host override it; it falls back to --paper (the masthead/shelf bg).
      svg.appendChild(node('circle', { cx: 16, cy: 16, r, fill: 'currentColor' }));
      svg.appendChild(node('circle', { cx: shadowX.toFixed(1), cy: 16, r, fill: 'var(--toggle-bg, var(--paper))' }));
      svg.appendChild(node('circle', { cx: 16, cy: 16, r, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-opacity': '0.55' }));
    }
    container.appendChild(svg);
  }

  // Re-trigger the moon-turn keyframes on the toggle element when the theme cycles (host
  // glue, not node-tested). Reduced-motion users get nothing — no animation, no forced
  // reflow. The reflow flush between remove+add restarts the animation on a rapid re-click;
  // the class is cleared on completion so `.spin` is present only while the turn is running.
  function spinToggle(el) {
    if (!el) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('spin');
    void el.offsetWidth;
    el.classList.add('spin');
    el.addEventListener('animationend', () => el.classList.remove('spin'), { once: true });
  }

  const api = { render, geometry, spinToggle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { moonrender: api });
})(typeof self !== 'undefined' ? self : globalThis);
