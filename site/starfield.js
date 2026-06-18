/* Star-mode starfield — a calm field of breathing stars, only in star mode and only
   when motion is welcome. Mirrors the extension's board starfield. */
(function () {
  var canvas = document.getElementById('starfield');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var stars = [], raf = null, running = false;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function gen() {
    var n = Math.max(40, Math.round((window.innerWidth * window.innerHeight) / 14000));
    stars = [];
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        r: rand(0.5, 1.7) * dpr, a: rand(0.18, 0.6), p: rand(0, Math.PI * 2),
        per: rand(3200, 7200), warm: Math.random() < 0.12,
      });
    }
  }

  function resize() {
    canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px'; canvas.style.height = window.innerHeight + 'px';
    gen();
  }

  function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var breath = 0.7 + 0.5 * Math.sin((now / s.per) * Math.PI * 2 + s.p);
      var rr = Math.max(0, s.r * breath);
      ctx.globalAlpha = Math.min(s.a * (0.6 + 0.4 * Math.max(0, breath)), 1);
      ctx.fillStyle = s.warm ? 'rgba(232,210,255,1)' : 'rgba(208,218,255,1)';
      ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    raf = window.requestAnimationFrame(frame);
  }

  function start() { if (running) return; running = true; resize(); window.addEventListener('resize', resize); raf = window.requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) window.cancelAnimationFrame(raf); raf = null; window.removeEventListener('resize', resize); ctx.clearRect(0, 0, canvas.width, canvas.height); }

  window.ypufStarfield = {
    sync: function (on) {
      if (on && !reduce) { canvas.hidden = false; start(); }
      else { stop(); canvas.hidden = true; }
    },
  };
})();
