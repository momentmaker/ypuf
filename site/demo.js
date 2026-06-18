/* Landing demos: the puff (tab strip + cursor-reactive mark), an interactive recall bar,
   and the night scene (breathing stars + shooting stars). All reduced-motion-gated; all
   DOM-built (no innerHTML). */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fragment from text with **highlighted** spans — no innerHTML.
  function frag(str) {
    var f = document.createDocumentFragment();
    var parts = String(str).split('**');
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) { var b = document.createElement('span'); b.className = 'hl'; b.textContent = parts[i]; f.appendChild(b); }
      else if (parts[i]) f.appendChild(document.createTextNode(parts[i]));
    }
    return f;
  }

  /* ---- 1a. The puff: a cluttered tab strip lets go ---- */
  (function puff() {
    var strip = document.getElementById('tabstrip');
    if (!strip || reduce) return;
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
      strip.querySelectorAll('.chip').forEach(function (c, i) {
        c.classList.remove('go');
        setTimeout(function () { c.classList.add('go'); }, 600 + i * 90 + (i % 3) * 40);
      });
    }
    fill(); letGo();
    if ('IntersectionObserver' in window) {
      var armed = false;
      new IntersectionObserver(function (es) { es.forEach(function (e) {
        if (!e.isIntersecting) armed = true; else if (armed) { armed = false; fill(); letGo(); }
      }); }, { threshold: 0.4 }).observe(strip);
    }
  })();

  /* ---- 1b. Cursor-reactive puff mark (gentle parallax toward the pointer) ---- */
  (function cursorPuff() {
    var wrap = document.getElementById('puffwrap');
    var hero = document.querySelector('.hero');
    if (!wrap || !hero || reduce || !window.matchMedia('(pointer:fine)').matches) return;
    hero.addEventListener('mousemove', function (e) {
      var r = wrap.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / 18;
      var dy = (e.clientY - (r.top + r.height / 2)) / 18;
      wrap.style.transform = 'translate(' + Math.max(-14, Math.min(14, dx)) + 'px,' + Math.max(-14, Math.min(14, dy)) + 'px)';
    });
    hero.addEventListener('mouseleave', function () { wrap.style.transform = ''; });
  })();

  /* ---- 2. Interactive recall bar (auto-types until you take over) ---- */
  (function recall() {
    var input = document.getElementById('demo-input');
    var results = document.getElementById('demo-results');
    if (!input || !results) return;

    var INDEX = [
      { title: 'The founder who quit Google to farm goats', host: 'nytimes.com', freq: true, content: 'a long interview about the founder who left a staff-engineer role to raise goats in vermont' },
      { title: 'YC — how to talk to a founder', host: 'ycombinator.com', content: 'the best founder conversations start with the problem, not the product' },
      { title: 'Async Rust, demystified', host: 'fasterthanli.me', freq: true, content: 'the runtime polls the future until it returns Ready — tokio is the de-facto async runtime' },
      { title: 'tokio — the async runtime', host: 'tokio.rs', content: 'an asynchronous runtime for the rust programming language' },
      { title: 'Home-office deduction rules for 2026', host: 'irs.gov', content: 'the simplified method lets you deduct five dollars per square foot, up to 300 sq ft of tax' },
      { title: 'flights to lisbon in october', host: 'google.com', content: 'cheapest fares to lisbon portugal in october for travel' },
      { title: 'that CSS grid trick', host: 'css-tricks.com', content: 'subgrid and minmax for responsive layouts without media queries' },
      { title: 'tonkotsu ramen broth recipe', host: 'seriouseats.com', content: 'simmer pork bones twelve hours for a rich tonkotsu ramen broth' },
      { title: 'q3 planning doc', host: 'notion.so', freq: true, content: 'roadmap, okrs, and the q3 planning priorities for the team' },
      { title: 'walktalkmeditate / pilgrim-ios', host: 'github.com', content: 'a privacy-first iOS app for intentional walking, on-device transcription' },
    ];

    function mark(text, terms) {
      if (!terms.length) return text;
      var out = text, lc = text.toLowerCase();
      // mark the longest/first matching term occurrences (simple, non-overlapping)
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t]; var i = lc.indexOf(term);
        if (i >= 0) { out = out.slice(0, i) + '**' + out.slice(i, i + term.length) + '**' + out.slice(i + term.length);
          lc = out.toLowerCase(); }
      }
      return out;
    }
    function snippet(content, terms) {
      var lc = content.toLowerCase(), pos = -1;
      for (var t = 0; t < terms.length; t++) { var i = lc.indexOf(terms[t]); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
      if (pos < 0) return '';
      var s = Math.max(0, pos - 38), e = Math.min(content.length, pos + 48);
      var snip = content.slice(s, e); if (s > 0) snip = '… ' + snip; if (e < content.length) snip += ' …';
      return mark(snip, terms);
    }
    function search(q) {
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      return INDEX.map(function (e) {
        var hay = (e.title + ' ' + e.content).toLowerCase();
        var score = terms.reduce(function (s, t) { return s + (e.title.toLowerCase().indexOf(t) >= 0 ? 3 : 0) + (hay.indexOf(t) >= 0 ? 1 : 0); }, 0);
        return { e: e, terms: terms, score: score };
      }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 4);
    }
    function render(q) {
      var hits = search(q);
      results.textContent = '';
      if (!q.trim()) return;
      if (!hits.length) { var none = document.createElement('div'); none.className = 'row'; var t = document.createElement('div'); t.className = 'm'; t.textContent = 'No match — try founder, rust, or tax.'; none.appendChild(t); results.appendChild(none); return; }
      hits.forEach(function (h, idx) {
        var r = h.e; var li = document.createElement('div'); li.className = 'row' + (idx === 0 ? ' on' : '');
        var t = document.createElement('div'); t.className = 't'; t.appendChild(frag(mark(r.title, h.terms)));
        var m = document.createElement('div'); m.className = 'm'; m.appendChild(document.createTextNode(r.host));
        if (r.freq) { m.appendChild(document.createTextNode('  ·  ')); var f = document.createElement('span'); f.className = 'f'; f.textContent = 'often revisited'; m.appendChild(f); }
        li.appendChild(t); li.appendChild(m);
        var sn = snippet(r.content, h.terms);
        if (sn) { var s = document.createElement('div'); s.className = 's'; s.appendChild(frag(sn)); li.appendChild(s); }
        results.appendChild(li);
      });
    }

    var manual = false;
    input.addEventListener('focus', function () { manual = true; input.value = ''; render(''); });
    input.addEventListener('input', function () { manual = true; render(input.value); });
    input.addEventListener('blur', function () { if (!input.value.trim()) { manual = false; if (!reduce) startAuto(); } });

    var DEMO = ['the founder who quit', 'rust async runtime', 'home office deduction'];
    var qi = 0;
    function startAuto() {
      if (manual) return;
      var q = DEMO[qi], i = 0;
      input.value = ''; render('');
      (function type() {
        if (manual) return;
        if (i <= q.length) { input.value = q.slice(0, i); render(input.value); i++; setTimeout(type, 55 + Math.random() * 50); }
        else { setTimeout(erase, 2600); }
      })();
    }
    function erase() {
      if (manual) return;
      (function back() {
        if (manual) return;
        var v = input.value;
        if (v.length) { input.value = v.slice(0, -1); render(input.value); setTimeout(back, 28); }
        else { qi = (qi + 1) % DEMO.length; setTimeout(startAuto, 350); }
      })();
    }

    if (reduce) { input.value = DEMO[0]; render(DEMO[0]); }
    else { setTimeout(startAuto, 1400); }
  })();

  /* ---- 3. Night scene: breathing stars + occasional shooting star ---- */
  (function night() {
    var canvas = document.getElementById('nightstars');
    if (!canvas || !canvas.getContext || reduce) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var stars = [], raf = null, running = false, shoot = null, nextShoot = 0;
    function gen() {
      var n = Math.max(30, Math.round((canvas.width * canvas.height) / (16000 * dpr)));
      stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        r: (0.5 + Math.random() * 1.4) * dpr, a: 0.2 + Math.random() * 0.5, p: Math.random() * 6.283, per: 3200 + Math.random() * 4000, warm: Math.random() < 0.13 });
    }
    function resize() { var r = canvas.getBoundingClientRect(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; gen(); }
    function spawnShoot() {
      var fromLeft = Math.random() < 0.5;
      shoot = { x: fromLeft ? 0 : canvas.width, y: Math.random() * canvas.height * 0.5,
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 4) * dpr, vy: (1.4 + Math.random()) * dpr, life: 0, max: 60 };
    }
    function frame(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < stars.length; i++) { var s = stars[i];
        var br = 0.7 + 0.5 * Math.sin((now / s.per) * 6.283 + s.p);
        ctx.globalAlpha = Math.min(s.a * (0.6 + 0.4 * Math.max(0, br)), 1);
        ctx.fillStyle = s.warm ? 'rgba(232,210,255,1)' : 'rgba(208,218,255,1)';
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, s.r * br), 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (!shoot && now >= nextShoot) { if (nextShoot) spawnShoot(); nextShoot = now + 6000 + Math.random() * 9000; }
      if (shoot) {
        shoot.life++;
        var tx = shoot.x - shoot.vx * 7, ty = shoot.y - shoot.vy * 7;
        var fade = Math.min(1, shoot.life / 8) * Math.max(0, 1 - shoot.life / shoot.max);
        var g = ctx.createLinearGradient(shoot.x, shoot.y, tx, ty);
        g.addColorStop(0, 'rgba(232,224,255,' + (0.9 * fade) + ')'); g.addColorStop(1, 'rgba(232,224,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6 * dpr; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(tx, ty); ctx.stroke();
        shoot.x += shoot.vx; shoot.y += shoot.vy;
        if (shoot.life > shoot.max || shoot.x < -50 || shoot.x > canvas.width + 50) shoot = null;
      }
      ctx.globalCompositeOperation = 'source-over'; raf = requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; resize(); window.addEventListener('resize', resize); nextShoot = performance.now() + 2500; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', resize); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); }); }, { threshold: 0.05 }).observe(canvas);
    } else { start(); }
  })();
})();
