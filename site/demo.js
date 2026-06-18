/* Landing demos: the puff (tab strip letting go), the live recall typewriter, and the
   night-scene stars. All reduced-motion-gated; all DOM-built (no innerHTML). */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Build a fragment from text with **highlighted** spans — no innerHTML.
  function frag(str) {
    var f = document.createDocumentFragment();
    var parts = String(str).split('**');
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) { var b = document.createElement('span'); b.className = 'hl'; b.textContent = parts[i]; f.appendChild(b); }
      else if (parts[i]) f.appendChild(document.createTextNode(parts[i]));
    }
    return f;
  }

  /* ---- 1. The puff: a cluttered tab strip lets go, one chip at a time ---- */
  (function puff() {
    var strip = document.getElementById('tabstrip');
    if (!strip || reduce) return;   // reduced motion → leave the strip empty (calm)
    var TITLES = ['Inbox (47)', 'flights to lisbon', 'that css trick', 'q3 planning', 'recipe — ramen',
      'github · pr #214', 'hn front page', 'rust async', 'tax form 8829', 'youtube', 'figma — board',
      'stack overflow', 'amazon cart', 'docs · api', 'maps', 'the founder who…', 'weather', 'slack'];

    function fill() {
      strip.textContent = '';
      TITLES.forEach(function (t, i) {
        var c = document.createElement('span'); c.className = 'chip'; c.style.setProperty('--i', i);
        var fav = document.createElement('i'); fav.className = 'fav';
        c.appendChild(fav); c.appendChild(document.createTextNode(t));
        strip.appendChild(c);
      });
    }
    function letGo() {
      var chips = strip.querySelectorAll('.chip');
      chips.forEach(function (c, i) {
        c.classList.remove('go');
        // stagger from a random-ish order so it feels like tabs scattering, not a wipe
        setTimeout(function () { c.classList.add('go'); }, 600 + i * 90 + (i % 3) * 40);
      });
    }
    fill(); letGo();
    // Replay when the hero scrolls back into view (calm, not constant).
    if ('IntersectionObserver' in window) {
      var armed = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) { armed = true; }
          else if (armed) { armed = false; fill(); letGo(); }
        });
      }, { threshold: 0.4 }).observe(strip);
    }
  })();

  /* ---- 2. Live recall typewriter ---- */
  (function recall() {
    var typed = document.getElementById('demo-typed');
    var results = document.getElementById('demo-results');
    if (!typed || !results) return;

    var QUERIES = [
      { q: 'the founder who quit', rows: [
        { t: 'The **founder** who quit Google to farm goats', host: 'nytimes.com', freq: true, s: '… a long interview about the **founder** who left a staff-engineer role to raise goats …' },
        { t: 'YC — how to talk to a **founder**', host: 'ycombinator.com' },
      ] },
      { q: 'rust async runtime', rows: [
        { t: 'Async Rust, demystified', host: 'fasterthanli.me', freq: true, s: '… the **runtime** polls the future until it returns Ready — tokio is the de-facto async **runtime** …' },
        { t: 'tokio — the **async** **runtime**', host: 'tokio.rs' },
      ] },
      { q: 'home office deduction', rows: [
        { t: 'Home-**office** **deduction** rules for 2026', host: 'irs.gov', s: '… the simplified method lets you **deduct** $5 per square foot, up to 300 sq ft …' },
      ] },
    ];

    function row(r, on) {
      var li = document.createElement('div'); li.className = 'row' + (on ? ' on' : '');
      var t = document.createElement('div'); t.className = 't'; t.appendChild(frag(r.t));
      var m = document.createElement('div'); m.className = 'm';
      m.appendChild(document.createTextNode(r.host || ''));
      if (r.freq) { m.appendChild(document.createTextNode('  ·  ')); var f = document.createElement('span'); f.className = 'f'; f.textContent = 'often revisited'; m.appendChild(f); }
      li.appendChild(t); li.appendChild(m);
      if (r.s) { var s = document.createElement('div'); s.className = 's'; s.appendChild(frag(r.s)); li.appendChild(s); }
      return li;
    }
    function render(rows) {
      results.textContent = '';
      rows.forEach(function (r, i) { results.appendChild(row(r, i === 0)); });
    }

    if (reduce) { typed.textContent = QUERIES[0].q; render(QUERIES[0].rows); return; }

    var qi = 0;
    function typeQuery() {
      var item = QUERIES[qi]; var q = item.q; var i = 0;
      results.textContent = '';
      (function typeChar() {
        if (i <= q.length) { typed.textContent = q.slice(0, i); i++; setTimeout(typeChar, 55 + Math.random() * 50); }
        else { setTimeout(function () { render(item.rows); setTimeout(eraseQuery, 2600); }, 280); }
      })();
    }
    function eraseQuery() {
      var cur = typed.textContent;
      (function erase() {
        if (cur.length) { cur = cur.slice(0, -1); typed.textContent = cur; setTimeout(erase, 28); }
        else { qi = (qi + 1) % QUERIES.length; setTimeout(typeQuery, 350); }
      })();
    }
    setTimeout(typeQuery, 1400);   // let the puff settle first
  })();

  /* ---- 3. Night-scene stars (always navy here; starts when in view) ---- */
  (function night() {
    var canvas = document.getElementById('nightstars');
    if (!canvas || !canvas.getContext || reduce) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var stars = [], raf = null, running = false;
    function gen() {
      var n = Math.max(30, Math.round((canvas.width * canvas.height) / (16000 * dpr)));
      stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        r: (0.5 + Math.random() * 1.4) * dpr, a: 0.2 + Math.random() * 0.5, p: Math.random() * 6.283, per: 3200 + Math.random() * 4000, warm: Math.random() < 0.13 });
    }
    function resize() { var r = canvas.getBoundingClientRect(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; gen(); }
    function frame(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < stars.length; i++) { var s = stars[i];
        var br = 0.7 + 0.5 * Math.sin((now / s.per) * 6.283 + s.p);
        ctx.globalAlpha = Math.min(s.a * (0.6 + 0.4 * Math.max(0, br)), 1);
        ctx.fillStyle = s.warm ? 'rgba(232,210,255,1)' : 'rgba(208,218,255,1)';
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, s.r * br), 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; raf = requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; resize(); window.addEventListener('resize', resize); raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', resize); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); }); }, { threshold: 0.05 }).observe(canvas);
    } else { start(); }
  })();
})();
