/* Theme toggle — cycles light → dark → star, mirrors the extension. */
(function () {
  var MODES = ['light', 'dark', 'star'];
  var KEY = 'ypuf-theme';
  var NS = 'http://www.w3.org/2000/svg';
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  function current() { var t = root.getAttribute('data-theme'); return MODES.indexOf(t) >= 0 ? t : 'light'; }
  function next(m) { return MODES[(MODES.indexOf(m) + 1) % MODES.length]; }

  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function glyph(mode) {   // moon for light/dark, star for star — built via DOM (no innerHTML)
    var svg = el('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' });
    var d = mode === 'star'
      ? 'M12 2.5l2.5 6.6 7 .3-5.5 4.3 1.9 6.8L12 16.9 6.1 20.5 8 13.7 2.5 9.4l7-.3z'
      : 'M21 13.1A8.4 8.4 0 1110.9 3 6.6 6.6 0 0021 13.1z';
    svg.appendChild(el('path', { d: d }));
    return svg;
  }

  function render() {
    var m = current();
    if (toggle) {
      while (toggle.firstChild) toggle.removeChild(toggle.firstChild);
      toggle.appendChild(glyph(m));
      toggle.title = 'Theme: ' + m + ' — switch to ' + next(m);
      toggle.setAttribute('aria-label', 'Theme: ' + m + '. Switch to ' + next(m) + '.');
    }
    if (window.ypufStarfield) window.ypufStarfield.sync(m === 'star');
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', getComputedStyle(root).getPropertyValue('--paper').trim() || '#f8f5f0');
  }

  function set(m) {
    root.setAttribute('data-theme', m);
    try { localStorage.setItem(KEY, m); } catch (e) { /* private mode */ }
    render();
  }

  if (toggle) toggle.addEventListener('click', function () { set(next(current())); });
  render();
})();
