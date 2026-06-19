/*
 * ypuf — new-tab panel board host (slice 5).
 *
 * The board host is the one privileged context (extension origin, holds host
 * grants). It renders the grid, brokers network panels (validate → fetch →
 * parse → cache → postMessage sanitized text to a sandboxed iframe), and talks
 * to the service worker for recall data via the shipped messages. Network panels
 * NEVER run here — they run null-origin in panels/sandbox.html with no chrome.*,
 * no storage, and no network egress (sandbox CSP). See the plan's KTD.
 *
 * Layers: U1 shell + host↔sandbox channel; U2 boardConfig + edit mode + add flow;
 * the ypuf panel (U3), broker (U4), RSS (U5) and crypto (U6) panel TYPES register
 * into PANEL_TYPES below.
 */
'use strict';

(function () {
  const { PROTO, VERSION } = window.ypuf.channel; // single source of the protocol id/version
  const lanes = window.ypuf.lanes;                // pure lane-placement math (tested in lib/lanes.js)
  const boardkeys = window.ypuf.boardkeys;        // pure cursor + key→intent (tested in lib/boardkeys.js)
  const hints = window.ypuf.hints;                // pure f-hint label assign/match (tested in lib/hints.js)
  const theme = window.ypuf.theme;                // pure light/dark/star mode core (tested in lib/theme.js)
  const moonphase = window.ypuf.moonphase;        // pure lunar phase (tested in lib/moonphase.js)
  const moonrender = window.ypuf.moonrender;      // moon/star toggle glyph (DOM helper)
  const starfield = window.ypuf.starfield;        // pure star-field generation (tested in lib/starfield.js)

  const docBody = document.body;
  const grid = document.getElementById('board-grid');
  const emptyNote = document.getElementById('board-empty');
  const addBtn = document.getElementById('add-panel');
  const editBtn = document.getElementById('board-edit');
  const settingsBtn = document.getElementById('board-settings');
  const themeToggle = document.getElementById('theme-toggle');
  const minimalNote = document.getElementById('minimal-note');

  // --- theme controller (U5, R2/R3/R9/R15) ---------------------------------
  // Light/dark/star, applied pre-paint by lib/theme-preinit.js; this wires the cycling
  // moon-phase toggle, persists to localStorage (synchronous, shared across extension
  // pages, local-only), and converges other open surfaces via the `storage` event.
  // chrome.storage.local is the durable source of truth; localStorage is a synchronous
  // mirror the pre-paint bootstrap reads (FOUC-free). Both are local-only, never transmitted.
  const THEME_KEY = 'ypuf-theme';
  const currentTheme = () => theme.normalize(document.documentElement.getAttribute('data-theme'));

  function renderThemeToggle() {
    if (!themeToggle) return;
    const mode = currentTheme();
    const star = mode === 'star';
    const phase = star ? 0 : moonphase.phase(new Date());
    moonrender.render(themeToggle, { star, phase });
    const nextMode = theme.next(mode);
    const phaseName = star ? 'star' : moonphase.phaseName(phase);
    themeToggle.setAttribute('aria-label', `Theme: ${mode} — switch to ${nextMode}`);
    themeToggle.title = `Theme: ${mode} (${phaseName}) · click for ${nextMode}`;
  }

  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', theme.normalize(mode));
    renderThemeToggle();
    postThemeToPanels(currentTheme());   // U7: propagate into the sandboxed panels
    syncStarfield();                     // U8: start/stop the starfield for star mode
    if (typeof refreshThemeControl === 'function') refreshThemeControl();
  }
  function setTheme(mode) {
    const m = theme.normalize(mode);
    try { localStorage.setItem(THEME_KEY, m); } catch (e) { /* storage blocked */ }
    try { chrome.storage.local.set({ [THEME_KEY]: m }); } catch (e) { /* durable write best-effort */ }
    applyTheme(m);
  }
  // Re-render to the new phase first, then spin the freshly-drawn moon into place.
  const cycleTheme = () => { setTheme(theme.next(currentTheme())); moonrender.spinToggle(themeToggle); };

  // Boot reconcile: the durable chrome.storage value wins; resolveInitial applies the
  // first-run prefers-color-scheme rule. Re-seeds the localStorage mirror so a cleared
  // mirror (but surviving durable store) recovers without a flash on the *next* open.
  function reconcileTheme() {
    let mirror = null; try { mirror = localStorage.getItem(THEME_KEY); } catch (e) { /* blocked */ }
    try {
      chrome.storage.local.get(THEME_KEY, (o) => {
        if (chrome.runtime.lastError) return;
        const durable = o && o[THEME_KEY];
        const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const stored = theme.MODES.indexOf(durable) >= 0 ? durable : mirror;
        const resolved = theme.resolveInitial(stored, prefersDark);
        if (resolved !== currentTheme()) applyTheme(resolved);
        try { localStorage.setItem(THEME_KEY, resolved); } catch (e) { /* blocked */ }
        if (durable !== resolved) { try { chrome.storage.local.set({ [THEME_KEY]: resolved }); } catch (e) { /* best-effort */ } }
      });
    } catch (e) { /* chrome.storage unavailable */ }
  }

  // U7: propagate the active theme into every mounted sandboxed panel (a live-frame
  // registry — mounted[] holds only teardown fns, so panels register their postTheme here).
  const panelFrames = new Set();
  function postThemeToPanels(mode) { panelFrames.forEach((p) => { if (p.postTheme) p.postTheme(mode); }); }
  let refreshThemeControl = null;   // set by the settings theme control when the overlay is open

  // --- starfield (U8, R4/R9) -----------------------------------------------
  // A slow, calm star drift behind the board — ONLY in star mode and ONLY when motion is
  // welcome. Positions come from the pure lib/starfield.js; this is the canvas host (size +
  // RAF + teardown). The canvas is behind content (z-index 0) and pointer-events:none, so
  // text on the opaque panels stays legible; the stars are low-alpha lavender.
  const starCanvas = document.getElementById('starfield');
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let starRAF = null;
  let onStarResize = null;

  // A soft radial-glow sprite (lavender / warm) — drawing a scaled sprite is what makes a
  // star read as a glow that grows and shrinks with its breath (vs a hard dot).
  function starSprite(rgb) {
    const S = 32, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); const cx = S / 2;
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.35, `rgba(${rgb},0.45)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    return c;
  }

  function startStarfield() {
    if (!starCanvas || starRAF) return;
    const ctx = starCanvas.getContext('2d');
    if (!ctx) return;
    const cool = starSprite('232,224,255'), warm = starSprite('255,232,220');
    let dpr = 1, stars = [];
    const size = () => {
      dpr = window.devicePixelRatio || 1;
      starCanvas.width = Math.floor(window.innerWidth * dpr);
      starCanvas.height = Math.floor(window.innerHeight * dpr);
      const density = Math.round((window.innerWidth * window.innerHeight) / 11000);
      stars = starfield.generate(Math.min(200, density), starCanvas.width, starCanvas.height, 0x9e3779b1);
    };
    size();
    starCanvas.hidden = false;

    // Occasional shooting star (ported from pilgrim Universe.js): a streak with a fading
    // tail + a bright head, eased, ~900 ms. The first comes soon so it's noticeable.
    let shooting = null, nextShootAt = performance.now() + 4000 + Math.random() * 4000;
    const spawnShoot = (now) => {
      const w = starCanvas.width, h = starCanvas.height, fromLeft = Math.random() < 0.5;
      shooting = {
        x0: fromLeft ? -50 * dpr : w + 50 * dpr, y0: Math.random() * h * 0.45,
        dx: (fromLeft ? 1 : -1) * (w * 0.65), dy: h * 0.4, t0: now, dur: 900,
      };
    };
    const drawShoot = (now) => {
      if (!shooting) return;
      const p = (now - shooting.t0) / shooting.dur;
      if (p >= 1) { shooting = null; return; }
      const e = 1 - Math.pow(1 - p, 3), fade = 1 - p;
      const hx = shooting.x0 + shooting.dx * e, hy = shooting.y0 + shooting.dy * e;
      const ang = Math.atan2(shooting.dy, shooting.dx), len = 150 * dpr;
      const tx = hx - Math.cos(ang) * len, ty = hy - Math.sin(ang) * len;
      ctx.globalAlpha = 1;
      const grad = ctx.createLinearGradient(hx, hy, tx, ty);
      grad.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
      grad.addColorStop(1, 'rgba(232,224,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.95 * fade})`;   // bright head
      ctx.beginPath(); ctx.arc(hx, hy, 1.8 * dpr, 0, Math.PI * 2); ctx.fill();
    };

    const frame = (now) => {
      const w = starCanvas.width, h = starCanvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';   // additive: glows blend softly
      for (const s of stars) {
        const breath = 0.7 + 0.5 * Math.sin((now / s.period) * Math.PI * 2 + s.phase);  // grows + shrinks
        const d = Math.max(0, s.r * dpr * 3 * breath);
        ctx.globalAlpha = Math.min(s.a * (0.6 + 0.4 * Math.max(0, breath)), 1);
        ctx.drawImage(s.warm ? warm : cool, s.x - d, s.y - d, d * 2, d * 2);
      }
      ctx.globalAlpha = 1;   // reset before the shooting star (was inheriting a star's low alpha)
      if (!shooting && now >= nextShootAt) { spawnShoot(now); nextShootAt = now + 12000 + Math.random() * 14000; }
      drawShoot(now);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      starRAF = requestAnimationFrame(frame);
    };
    starRAF = requestAnimationFrame(frame);
    onStarResize = size;
    window.addEventListener('resize', onStarResize);
  }

  function stopStarfield() {
    if (starRAF) { cancelAnimationFrame(starRAF); starRAF = null; }
    if (onStarResize) { window.removeEventListener('resize', onStarResize); onStarResize = null; }
    if (starCanvas) {
      const ctx = starCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, starCanvas.width, starCanvas.height);
      starCanvas.hidden = true;
    }
  }

  function syncStarfield() {
    if (currentTheme() === 'star' && !reduceMotion()) startStarfield();
    else stopStarfield();
  }
  // Toggling the OS "reduce motion" while in star mode starts/stops the field live.
  if (window.matchMedia) {
    const mm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => syncStarfield();
    if (mm.addEventListener) mm.addEventListener('change', onChange);
    else if (mm.addListener) mm.addListener(onChange);
  }
  const boardSub = document.getElementById('board-sub');
  const oneLineEl = document.getElementById('board-oneline');

  let config = { panels: [], minimalMode: false };
  let editing = false;
  let boardBusy = false;   // guards reorder/remove against reentrancy during an async save
  let dragId = null;       // id of the panel currently being dragged (Trello-style placement)
  let oneLineSeq = 0;      // supersedes a slow one-line fetch when the footer is re-rendered or toggled off
  const COLS = 3;          // fixed, unlabeled lanes — arrange-your-desk, not a kanban to manage
  const colOf = (spec) => lanes.colOf(spec, COLS);

  // Calm line icons (U1). Built via createElementNS (never innerHTML), themed by
  // currentColor so they inherit the affordance's calm/hover/accent color.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    trash: [['path', { d: 'M3 4.6h10' }], ['path', { d: 'M6.3 4.6V3.3a1 1 0 011-1h1.4a1 1 0 011 1v1.3' }],
            ['path', { d: 'M4.3 4.6l.6 8.1a1.2 1.2 0 001.2 1.1h3.8a1.2 1.2 0 001.2-1.1l.6-8.1' }],
            ['path', { d: 'M6.6 7v3.9M9.4 7v3.9' }]],
    pencil: [['path', { d: 'M10.7 2.7l2.6 2.6' }], ['path', { d: 'M3 13l.7-2.7 7.3-7.3 2.6 2.6-7.3 7.3z' }]],
    shield: [['path', { d: 'M8 2.4l4.6 1.7v3.9c0 3-1.9 5.2-4.6 6-2.7-.8-4.6-3-4.6-6V4.1z' }],
             ['path', { d: 'M5.9 8.1l1.5 1.5 2.7-3' }]],
    gear: [['circle', { cx: 8, cy: 8, r: 2.2 }],
           ['path', { d: 'M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6L3.5 3.5' }]],
    close: [['path', { d: 'M4 4l8 8M12 4l-8 8' }]],
  };
  function icon(name) {
    const svg = document.createElementNS(SVGNS, 'svg');
    const a = { viewBox: '0 0 16 16', width: '15', height: '15', fill: 'none', stroke: 'currentColor',
                'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
    for (const k of Object.keys(a)) svg.setAttribute(k, a[k]);
    for (const [tag, attrs] of ICONS[name]) {
      const el = document.createElementNS(SVGNS, tag);
      for (const k of Object.keys(attrs)) el.setAttribute(k, String(attrs[k]));
      svg.appendChild(el);
    }
    return svg;
  }

  // --- settings overlay (U2) ----------------------------------------------
  // A calm first-party slide-over: gear → role=dialog, focus-trapped, Esc/backdrop
  // close, focus restores to the gear. The groups (auto-let-go U3, never-touch U4,
  // board U5) populate `buildSettingsGroups`; U10's cheatsheet reuses this shell.
  let settingsPrevFocus = null;
  let cheatsheetPrevFocus = null;
  const settingsOpen = () => !!document.querySelector('.settings-overlay');

  function closeSettings() {
    const o = document.querySelector('.settings-overlay');
    if (o) o.remove();
    try { if (settingsPrevFocus && settingsPrevFocus.focus) settingsPrevFocus.focus(); } catch (e) { /* gone */ }
  }

  // Shared Tab-cycle for the modal overlays (U2 settings + U10 cheatsheet): keep focus
  // inside `panel` so Tab/Shift-Tab wrap at the ends.
  function trapTab(e, panel) {
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button, input, select, [href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function settingsKeydown(e) {
    // stopPropagation so this Esc doesn't also bubble to the board keydown (which would
    // run after the overlay is gone and clear the recall cursor the user had).
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSettings(); return; }
    trapTab(e, e.currentTarget);
  }

  // The keyboard layer's bindings, shared by the ? cheatsheet (U10).
  const CHEATSHEET = [
    ['j / k', 'Move the recall cursor'],
    ['g g / G', 'Jump to top / bottom'],
    ['o / Enter', 'Open the cursored page'],
    ['d / u', 'Delete (forget) / undo'],
    ['p', 'Never-touch this site'],
    ['/', 'Jump to recall search'],
    ['f', 'Hint every link — type a label to open'],
    ['e', 'Toggle edit mode'],
    ['?', 'This cheatsheet'],
    ['Esc', 'Clear cursor · close'],
  ];

  function settingsGroup(title) {
    const g = document.createElement('section'); g.className = 'settings-group';
    const h = document.createElement('div'); h.className = 'settings-group-label'; h.textContent = title;
    g.appendChild(h);
    return g;
  }

  // Auto-let-go group (U3): on/off + a Timid/Balanced/Bold segmented control (muted
  // when off), with the real window shown. Reads/writes via the SW (single writer).
  function buildAutoGroup(container) {
    const E = window.ypuf.eagerness;
    const g = settingsGroup('Auto-let-go');
    const body = document.createElement('div'); body.className = 'auto-body';
    g.appendChild(body); container.appendChild(g);

    const draw = (state) => {
      if (!document.body.contains(body)) return;   // overlay closed before the SW replied
      body.textContent = '';
      const enabled = !!(state && state.enabled);
      const level = (state && state.eagerness) || E.DEFAULT;

      const sw = document.createElement('button');
      sw.type = 'button'; sw.className = 'switch' + (enabled ? ' on' : '');
      sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(enabled));
      sw.setAttribute('aria-label', 'Auto-let-go'); sw.title = enabled ? 'On' : 'Off';
      sw.addEventListener('click', () => {
        if (enabled) { send('auto-disable').then(draw).catch(() => {}); return; }
        // Enabling needs the <all_urls> grant — request it in-gesture, then enable.
        chrome.permissions.request({ origins: ['<all_urls>'] }, (granted) => {
          if (!granted || !document.body.contains(body)) return;
          refreshHasAllUrls();
          send('auto-enable').then(draw).catch(() => {});
        });
      });
      const swLabel = document.createElement('span'); swLabel.className = 'toggle-label';
      swLabel.textContent = enabled ? 'On — clearing tabs you’ve stopped caring about' : 'Off';
      const row = document.createElement('div'); row.className = 'toggle-row'; row.append(sw, swLabel);

      const seg = document.createElement('div'); seg.className = 'segmented' + (enabled ? '' : ' muted');
      seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Eagerness');
      for (const lv of E.LEVELS) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'seg' + (lv.key === level ? ' selected' : '');
        b.textContent = lv.label; b.setAttribute('aria-pressed', String(lv.key === level));
        if (!enabled) b.disabled = true;
        b.addEventListener('click', () => send('set-auto-eagerness', { level: lv.key }).then(draw).catch(() => {}));
        seg.appendChild(b);
      }

      const days = (E.LEVELS.find((l) => l.key === level) || E.LEVELS.find((l) => l.key === E.DEFAULT)).days;
      const sub = document.createElement('div'); sub.className = 'auto-sub';
      sub.textContent = `Lets go after ~${days} quiet day${days === 1 ? '' : 's'}.`;

      body.append(row, seg, sub);
    };

    send('auto-state').then(draw).catch(() => draw(null));
  }

  // Never-touch group (U4): the protected sites auto-let-go must never close. Add is
  // recall-row-only in v1 (no manual domain input); remove + empty-state live here.
  function buildNeverTouchGroup(container) {
    const g = settingsGroup('Never-touch');
    const list = document.createElement('div'); list.className = 'nevertouch-list';
    g.appendChild(list); container.appendChild(g);

    const draw = (resp) => {
      if (!document.body.contains(list)) return;   // overlay closed before the SW replied
      list.textContent = '';
      const items = (resp && resp.items) || [];
      if (!items.length) {
        const empty = document.createElement('p'); empty.className = 'muted nevertouch-empty';
        empty.textContent = 'No sites protected yet — protect a site from a recall row.';
        list.appendChild(empty); return;
      }
      for (const host of items) {
        const row = document.createElement('div'); row.className = 'nevertouch-row';
        const name = document.createElement('span'); name.className = 'nevertouch-host'; name.textContent = host;
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'link'; rm.textContent = 'remove';
        rm.setAttribute('aria-label', `Stop protecting ${host}`);
        rm.addEventListener('click', () => send('protect-remove', { host })
          .then((r) => (r && r.ok) ? send('protected-list') : null)   // only refresh on a real removal
          .then(draw).catch(() => {}));
        row.append(name, rm); list.appendChild(row);
      }
    };
    send('protected-list').then(draw).catch(() => draw(null));
  }

  // Board group (U5): the one-line opt-in, relocated here from the masthead. v1 is a
  // single toggle (mood/sound deferred to a future unit, holding the calm ~3-groups cap).
  function buildBoardGroup(container) {
    const g = settingsGroup('Board');
    const enabled = !!(config.oneLine && config.oneLine.enabled);
    const sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'switch' + (enabled ? ' on' : '');
    sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(enabled)); sw.setAttribute('aria-label', 'Daily one-line');
    sw.addEventListener('click', () => toggleOneLine((on) => {   // grant-in-gesture preserved by toggleOneLine
      sw.classList.toggle('on', on); sw.setAttribute('aria-checked', String(on));
    }));
    const label = document.createElement('span'); label.className = 'toggle-label'; label.textContent = 'Daily one-line';
    const row = document.createElement('div'); row.className = 'toggle-row'; row.append(sw, label);
    const sub = document.createElement('div'); sub.className = 'auto-sub';
    sub.textContent = 'A quiet aphorism at the board footer, from um.fz.ax.';
    g.append(row, sub); container.appendChild(g);
  }

  // Appearance group (U5): an explicit segmented Light/Dark/Star control — the
  // settings surface gets the named choice (vs the masthead's glyph toggle). Reflects
  // external theme changes (toggle/storage) while the overlay is open.
  function buildThemeControl(container) {
    refreshThemeControl = null;   // drop any prior overlay's closure before registering this one
    const g = settingsGroup('Appearance');
    const seg = document.createElement('div'); seg.className = 'segmented';
    seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Theme');
    const LABELS = { light: 'Light', dark: 'Dark', star: 'Star' };
    const draw = () => {
      const mode = currentTheme();
      seg.textContent = '';
      for (const m of theme.MODES) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'seg' + (m === mode ? ' selected' : '');
        b.textContent = LABELS[m]; b.setAttribute('aria-pressed', String(m === mode));
        b.addEventListener('click', () => setTheme(m));
        seg.appendChild(b);
      }
    };
    draw();
    refreshThemeControl = () => { document.body.contains(seg) ? draw() : (refreshThemeControl = null); };
    g.appendChild(seg); container.appendChild(g);
  }

  function buildSettingsGroups(container) {
    buildThemeControl(container);
    buildAutoGroup(container);
    buildNeverTouchGroup(container);
    buildBoardGroup(container);
  }

  function openSettings() {
    if (settingsOpen()) return;
    settingsPrevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Settings');
    const backdrop = document.createElement('div'); backdrop.className = 'settings-backdrop';
    backdrop.addEventListener('click', closeSettings);
    const panel = document.createElement('div'); panel.className = 'settings-panel';
    panel.addEventListener('keydown', settingsKeydown);
    const head = document.createElement('div'); head.className = 'settings-head';
    const title = document.createElement('span'); title.className = 'settings-title'; title.textContent = 'Settings';
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'settings-close icon-btn';
    close.setAttribute('aria-label', 'Close settings'); close.title = 'Close';
    close.append(icon('close'));
    close.addEventListener('click', closeSettings);
    head.append(title, close);
    const groups = document.createElement('div'); groups.className = 'settings-groups';
    buildSettingsGroups(groups);
    // Passive discoverability (U10): the keyboard layer is invisible until used, so the
    // one place it can be mentioned without costing board calm is here, where the user
    // already came looking for controls.
    const kbdHint = document.createElement('p'); kbdHint.className = 'settings-foot muted';
    kbdHint.textContent = 'Keyboard shortcuts: press ? on the board.';
    panel.append(head, groups, kbdHint);
    overlay.append(backdrop, panel);
    docBody.appendChild(overlay);
    // Initial focus = the first group control (e.g. the auto toggle), else the close.
    (groups.querySelector('button, input, select, [tabindex]:not([tabindex="-1"])') || close).focus();
  }
  let mounted = [];   // panel teardown fns; run before each re-render so intervals,
                      // message listeners, and focus handlers never leak.
  let firstPaint = true; // the gentle card entrance plays once on open, not on every re-render
  // The puff (U6): the soft "let go" arrival on recall rows let go since you last
  // opened the board. `boardLastOpen` holds the PREVIOUS open's stamp; `puffArmed`
  // fires the animation once on this open, then disarms so re-renders don't re-puff.
  let boardLastOpen = 0;
  let puffArmed = false;

  // Atmosphere (U4): the board greets the hour. Local clock only — no data, no network.
  const MOODS = [
    { from: 5, key: 'dawn', line: 'a fresh morning' },
    { from: 9, key: 'day', line: 'the day’s open' },
    { from: 17, key: 'dusk', line: 'a quiet evening' },
    { from: 21, key: 'night', line: 'a still night' },
  ];
  function moodNow() {
    const h = new Date().getHours();
    let m = MOODS[MOODS.length - 1];
    for (const x of MOODS) { if (h >= x.from) m = x; }
    if (h < MOODS[0].from) m = MOODS[MOODS.length - 1]; // small hours → night
    return m;
  }
  function renderMasthead() {
    const m = moodNow();
    docBody.dataset.mood = m.key;
    if (!boardSub) return;
    let date = '';
    try { date = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { /* locale */ }
    boardSub.textContent = date ? `${date} · ${m.line}` : m.line;
  }

  // --- ambient one-line (U6) ----------------------------------------------
  // A quiet daily aphorism at the board footer, from the open-source momentmaker/um repo
  // on GitHub (the raw source — um.fz.ax republishes it via GitBook, which injects footer
  // boilerplate, so we read the clean source directly). Opt-in (it's a network source):
  // the list is cached daily, a line is picked LOCALLY each open, rendered text-only.
  // Governed like a panel (validate, hardened fetch, grant, disclosure).
  const ONELINE_URL = 'https://raw.githubusercontent.com/momentmaker/um/refs/heads/master/self/one-line.md';
  const ONELINE_TTL = 24 * 60 * 60 * 1000;

  function renderOneLine() {
    if (!oneLineEl) return;
    const mine = ++oneLineSeq;   // a later render or a toggle-off makes this pass stale
    oneLineEl.hidden = true;
    oneLineEl.textContent = '';
    if (!config.oneLine || !config.oneLine.enabled) return;
    panelHasAccess(ONELINE_URL).then((ok) => {
      if (!ok || mine !== oneLineSeq) return;   // no grant, or superseded → stays hidden (calm)
      broker.load({ cacheKey: 'panel:oneline:gh', url: ONELINE_URL, ttlMs: ONELINE_TTL, parse: (md) => window.ypuf.oneline.parse(md) })
        .then((r) => {
          if (mine !== oneLineSeq) return;   // a later render/disable won; never double-append
          const lines = r && r.value;
          if (!Array.isArray(lines) || !lines.length) return;
          const line = lines[Math.floor(Math.random() * lines.length)]; // fresh pick each open, from the daily cache
          const text = document.createElement('span');
          text.className = 'oneline-text';
          text.textContent = line;                 // text-only, inert (R14)
          const src = document.createElement('span');
          src.className = 'oneline-src';
          src.textContent = 'um.fz.ax';   // disclosure (R16) — the content's home (fetched from its GitHub source)
          oneLineEl.append(text, src);
          oneLineEl.hidden = false;
          if (r.refresh) r.refresh.catch(() => {}); // background refresh of the daily list
        }).catch(() => {});
    });
  }

  function toggleOneLine(onDone) {
    if (config.oneLine && config.oneLine.enabled) {
      config.oneLine = { enabled: false };
      saveConfig(); renderBoard(); renderOneLine();
      if (onDone) onDone(false);
      return;
    }
    // Enable: request the raw.githubusercontent.com grant in-gesture (request-first), then on.
    grantThenAdd('https://raw.githubusercontent.com', () => {
      config.oneLine = { enabled: true };
      saveConfig(); renderBoard(); renderOneLine();
      if (onDone) onDone(true);
    });
  }

  // Cached at load so the add-panel click handler can decide grant-vs-skip
  // SYNCHRONOUSLY — calling chrome.permissions.contains inside the click would
  // consume the user gesture and break the follow-up permissions.request.
  let hasAllUrls = false;
  const refreshHasAllUrls = () => chrome.permissions.contains({ origins: ['<all_urls>'] }, (r) => { hasAllUrls = !chrome.runtime.lastError && !!r; });
  refreshHasAllUrls();
  // Keep the cached flag honest if the grant changes while a board tab stays open.
  chrome.permissions.onAdded.addListener(refreshHasAllUrls);
  chrome.permissions.onRemoved.addListener(refreshHasAllUrls);

  // --- service-worker bridge ----------------------------------------------

  function send(type, extra) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(Object.assign({ type }, extra), (resp) => {
        resolve(chrome.runtime.lastError ? null : resp);
      });
    });
  }

  // Panel cache lives in chrome.storage.local (survives restart; the board host is
  // privileged so it reads/writes directly). Never holds recall data — only fetched
  // public-feed text — so a future global privacy-clear must reach it, page-forget
  // need not (plan: deferred).
  const local = {
    get: (k) => chrome.storage.local.get(k).then((o) => o[k]),
    set: (k, v) => chrome.storage.local.set({ [k]: v }),
  };

  // --- network broker (U4) -------------------------------------------------
  // The single fetch/validate/parse/cache path for network panels. A panel NEVER
  // fetches — it hands the broker a source and gets back parsed text-only data.
  //   source: { cacheKey, url, ttlMs, parse(rawText) -> value }
  // Cache entry: { value, fetchedAt, fetchingAt? } in chrome.storage.local.

  const FETCH_LOCK_MS = 20000;   // cross-tab single-flight window
  const FETCH_TIMEOUT_MS = 15000; // a hung host must not hold the lock indefinitely

  async function brokerRefresh(source) {
    const entry = (await local.get(source.cacheKey)) || {};
    const now = Date.now();
    // Cross-tab single-flight: skip only when another tab is mid-fetch AND we already
    // have a value to serve. On a COLD cache we fetch anyway — a stale lock left by a
    // tab that closed mid-fetch must not wedge a fresh open at "couldn't load".
    if (entry.value !== undefined && entry.fetchingAt && (now - entry.fetchingAt) < FETCH_LOCK_MS) return entry.value;
    await local.set(source.cacheKey, Object.assign({}, entry, { fetchingAt: now }));
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const v = window.ypuf.sourceurl.validate(source.url);
      if (!v.ok) throw new Error('invalid-source:' + v.reason);
      const res = await fetch(v.url, {
        credentials: 'omit',            // never send cookies to the feed host (R10)
        referrerPolicy: 'no-referrer',  // never leak the chrome-extension:// URL
        redirect: 'error',              // a validated public host can't 302 to a private IP
        signal: ctl.signal,             // a slow/hung host aborts at FETCH_TIMEOUT_MS
      });
      if (!res.ok) throw new Error('http-' + res.status);
      const value = source.parse(await res.text());   // text-only struct
      await local.set(source.cacheKey, { value, fetchedAt: Date.now() }); // success-only; drop the lock
      return value;
    } catch (e) {
      // Failure: keep last-known value, drop the lock so a later open can retry.
      const keep = (await local.get(source.cacheKey)) || {};
      await local.set(source.cacheKey, { value: keep.value, fetchedAt: keep.fetchedAt });
      throw e;
    } finally {
      clearTimeout(tid);
    }
  }

  // Stale-while-revalidate: serve fresh from cache; serve stale immediately and
  // refresh in the background; on a cold cache, await the first fetch. fetchedAt
  // rides along so a panel can stamp the value with WHEN it was fetched, not now.
  async function brokerLoad(source) {
    const entry = (await local.get(source.cacheKey)) || {};
    const has = entry.value !== undefined;
    const fresh = has && entry.fetchedAt && (Date.now() - entry.fetchedAt) < source.ttlMs;
    if (fresh) return { value: entry.value, fetchedAt: entry.fetchedAt, stale: false };
    const refreshing = brokerRefresh(source).catch((e) => { console.warn('[ypuf] panel refresh failed', e); return null; });
    if (has) return { value: entry.value, fetchedAt: entry.fetchedAt, stale: true, refresh: refreshing };
    const value = await refreshing;
    return { value: value == null ? null : value, fetchedAt: value == null ? null : Date.now(), stale: false, cold: value == null };
  }

  const broker = { load: brokerLoad, refresh: brokerRefresh };

  // --- panel type registry (ypuf U3, rss U5, crypto U6) -------------------
  // A type def: { label, addable, network, buildForm(formEl)->readConfig(),
  //               originOf(cfg)->'https://host', mount(spec, ctx)->{destroy} }

  const PANEL_TYPES = {};
  const registerPanelType = (type, def) => { PANEL_TYPES[type] = def; };

  // --- panel cells ---------------------------------------------------------

  function panelCell(spec, label) {
    const cell = document.createElement('section');
    cell.className = 'panel';
    cell.setAttribute('role', 'region');
    cell.setAttribute('aria-label', label || 'panel');
    cell.dataset.panelId = spec.id || '';
    cell.dataset.type = (spec && spec.type) || '';   // drives the per-type accent dot (U1/R2)

    const head = document.createElement('header');
    head.className = 'panel-head';
    const title = document.createElement('span');
    title.className = 'panel-title';
    title.textContent = label || '';
    head.appendChild(title);
    if (editing) head.appendChild(editControls(spec));

    const body = document.createElement('div');
    body.className = 'panel-body';
    cell.append(head, body);
    return { cell, head, body };
  }

  // Shared panel helpers (used by the rss/crypto network panels).
  function hostOfUrl(u) { try { return new URL(u).host; } catch { return u || ''; } }

  function isHttpUrl(u) {
    try { const p = new URL(u).protocol; return p === 'http:' || p === 'https:'; } catch { return false; }
  }

  // MV3 favicon (local — the "favicon" permission; never a network request).
  function faviconUrl(pageUrl) {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', '32');
    return u.toString();
  }

  // A host-permission match pattern from an origin. Match patterns can't carry a
  // port, so a feed on a non-standard port grants the host across ports.
  function originMatchPattern(origin) {
    try { const u = new URL(origin); return `${u.protocol}//${u.hostname}/*`; } catch { return null; }
  }

  // Does this tab currently hold access to a panel's source? Checked live at mount so
  // a grant revoked AFTER the panel was added surfaces "needs access", not a vague
  // failure (R2).
  function panelHasAccess(url) {
    return new Promise((resolve) => {
      if (hasAllUrls) { resolve(true); return; }
      const pattern = originMatchPattern((() => { try { return new URL(url).origin; } catch { return ''; } })());
      if (!pattern) { resolve(false); return; }
      chrome.permissions.contains({ origins: [pattern] }, (r) => resolve(!chrome.runtime.lastError && !!r));
    });
  }

  function setPanelLabel(ctx, label) {
    const t = ctx.head && ctx.head.querySelector('.panel-title');
    if (t) t.textContent = label;
    if (ctx.cell) ctx.cell.setAttribute('aria-label', label);
  }

  // A "needs access" panel offers an in-gesture re-grant of just its origin.
  function addGrantAffordance(ctx) {
    const cfg = ctx.spec.config || {};
    let origin;
    try { origin = new URL(cfg.url).origin; } catch { return; }
    const pattern = originMatchPattern(origin);
    if (!pattern) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link';
    btn.textContent = 'Grant access';
    btn.addEventListener('click', () => {
      try {
        chrome.permissions.request({ origins: [pattern] }, (granted) => {
          if (!chrome.runtime.lastError && granted) ctx.remount(); // re-mount → live access check now passes
        });
      } catch (e) { console.warn('[ypuf] grant request failed', e); }
    });
    ctx.body.appendChild(btn);
  }

  // --- host-side sandbox channel ------------------------------------------
  // Mounts panels/sandbox.html (served null-origin by the manifest `sandbox`
  // key — no allow-same-origin). We accept only messages whose source IS this
  // panel's own contentWindow (a forged source from any other frame is dropped)
  // and post to that exact frame. Pure envelope/intent kernel → lib/channel.js (U4).

  function mountSandbox(body, onIntent) {
    const frame = document.createElement('iframe');
    frame.className = 'panel-frame';
    frame.title = 'panel content';
    frame.src = chrome.runtime.getURL('panels/sandbox.html');

    const channel = window.ypuf.channel;
    let ready = false;
    let alive = true;
    let queued = null;
    let readyTimer = null;

    function handle(event) {
      if (!alive || event.source !== frame.contentWindow) return; // R9 + post-teardown guard
      const msg = event.data;
      if (!msg || msg.ypuf !== PROTO || msg.v !== VERSION) return;
      // Theme BEFORE the queued render so the panel paints its content already-themed —
      // no one-frame flash of light-mode content on a dark/star board.
      if (msg.kind === 'ready') { ready = true; clearTimeout(readyTimer); postTheme(currentTheme()); if (queued) { post(queued); queued = null; } return; }
      if (msg.kind === 'resize' && Number.isFinite(msg.height)) {
        // The sandbox reports its content height so the iframe hugs it — no dead space.
        frame.style.height = Math.min(900, Math.max(28, msg.height)) + 'px';
        return;
      }
      const intent = channel.parseIntent(msg);            // validated shape; index re-checked by the caller
      if (intent && typeof onIntent === 'function') onIntent(intent);
    }
    window.addEventListener('message', handle);

    function post(renderBody) {
      // A late async render (broker resolved after teardown/reorder) can't hit a
      // removed iframe whose contentWindow is now null.
      if (!alive || !frame.contentWindow) return;
      if (!ready) { queued = renderBody; return; }
      // renderEnvelope reduces lines to {text, open-index} only — no raw URL/HTML
      // ever crosses to the sandbox.
      frame.contentWindow.postMessage(channel.renderEnvelope(renderBody), '*');
    }

    // Theme (U7): post the active mode to this frame; not-yet-ready frames get the
    // current theme on their own 'ready', so a no-op here is safe.
    function postTheme(mode) {
      if (!alive || !frame.contentWindow || !ready) return;
      const env = channel.themeEnvelope(mode);
      if (env) frame.contentWindow.postMessage(env, '*');
    }

    // If the sandbox never signals ready (failed load), show a calm error rather
    // than an eternal "Loading…".
    readyTimer = setTimeout(() => { if (alive && !ready) body.textContent = 'Panel couldn’t load.'; }, 6000);

    body.appendChild(frame);
    const api = {
      render: post,
      postTheme,
      destroy() {
        alive = false; clearTimeout(readyTimer); window.removeEventListener('message', handle);
        frame.remove(); panelFrames.delete(api);
      },
    };
    panelFrames.add(api);
    return api;
  }

  // --- edit mode: per-panel controls + reorder ----------------------------

  function editControls(spec) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-controls';
    const grip = document.createElement('span');
    grip.className = 'panel-grip';
    grip.textContent = '⠿';
    grip.title = 'Drag to reorder';
    grip.setAttribute('aria-hidden', 'true');
    wrap.appendChild(grip);
    const def = PANEL_TYPES[spec.type];
    if (def && def.reconfigurable) {   // configurable types get an in-place edit (tickers / feed)
      const cfgBtn = ctrlBtn('', 'Configure panel', () => openReconfigureForm(spec, def));
      cfgBtn.append(icon('gear'));
      wrap.appendChild(cfgBtn);
    }
    wrap.appendChild(ctrlBtn('✕', 'Remove panel', () => removePanel(spec.id)));
    return wrap;
  }

  function ctrlBtn(glyph, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'panel-ctrl link';
    b.textContent = glyph;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // The lane math lives in lib/lanes.js (pure + tested); the host owns the boardBusy
  // guard + the save/render/focus epilogue. A second move mid-save would splice a
  // stale index, so every mutation is serialized behind boardBusy.
  async function commitMove(id, moved) {
    if (boardBusy || !moved()) return;   // moved() mutates config.panels; false → nothing changed
    boardBusy = true;
    try { await saveConfig(); renderBoard(); focusPanel(id); }
    finally { boardBusy = false; }
  }

  const reorderInto = (srcId, targetId, before) =>
    commitMove(srcId, () => srcId !== targetId && lanes.reorderInto(config.panels, srcId, targetId, before, COLS));
  const moveToLane = (srcId, col) =>                 // drop onto empty lane space → lane end
    commitMove(srcId, () => lanes.moveToLane(config.panels, srcId, col));
  const moveAcross = (id, delta) =>                  // keyboard: ◀ ▶ between lanes
    commitMove(id, () => lanes.moveAcross(config.panels, id, delta, COLS));
  const moveWithinLane = (id, delta) =>             // keyboard: ▲ ▼ within a lane
    commitMove(id, () => lanes.moveWithinLane(config.panels, id, delta, COLS));

  async function removePanel(id) {
    if (boardBusy) return;
    const idx = config.panels.findIndex((p) => p.id === id);
    if (idx < 0) return;
    boardBusy = true;
    try {
      config.panels.splice(idx, 1);
      await saveConfig();
      renderBoard();
      // Focus moves to the next panel, or the add affordance if none remain (a11y).
      const next = config.panels[idx] || config.panels[idx - 1];
      if (next) focusPanel(next.id); else addBtn.focus();
    } finally { boardBusy = false; }
  }

  function focusPanel(id) {
    const el = grid.querySelector(`[data-panel-id="${id}"]`);
    if (el) el.focus();
  }

  // --- add-panel flow (inline picker → config form → request-first grant) --

  // The picker is a sibling of the add button (outside the grid), so a board
  // re-render won't remove it — close it explicitly on submit/cancel/render.
  function closeAddPicker() {
    document.querySelectorAll('.add-picker').forEach((p) => p.remove());   // clear any (a fast re-open can leave two)
    addBtn.hidden = !editing;
  }

  function openAddPicker() {
    closeAddPicker();
    const addable = Object.entries(PANEL_TYPES).filter(([, d]) => d.addable);
    const picker = document.createElement('div');
    picker.className = 'add-picker';
    picker.appendChild(pickerHead('Add a panel'));
    if (!addable.length) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'No panel types available yet.';
      picker.appendChild(note);
    } else {
      const tiles = document.createElement('div');
      tiles.className = 'add-tiles';
      for (const [type, def] of addable) tiles.appendChild(addTile(type, def, picker));
      picker.appendChild(tiles);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link add-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeAddPicker);
    picker.appendChild(cancel);
    addBtn.hidden = true;
    addBtn.after(picker);
  }

  function pickerHead(text) {
    const h = document.createElement('div');
    h.className = 'add-picker-head';
    h.textContent = text;
    return h;
  }

  function addTile(type, def, picker) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'add-tile';
    tile.dataset.type = type;
    const name = document.createElement('span');
    name.className = 'add-tile-name';
    name.textContent = def.label;
    const hint = document.createElement('span');
    hint.className = 'add-tile-hint';
    hint.textContent = def.hint || '';
    tile.append(name, hint);
    tile.addEventListener('click', () => openConfigForm(type, def, picker));
    return tile;
  }

  // Shared form body for both add (openConfigForm) and edit-in-place (openReconfigureForm):
  // builds the type's fields (pre-filled from `current` when reconfiguring) + submit/cancel.
  function buildConfigForm(picker, def, opts) {
    picker.textContent = '';
    picker.appendChild(pickerHead(opts.headText));
    const form = document.createElement('div');
    form.className = 'add-form';
    const readConfig = def.buildForm(form, opts.current || null);

    const err = document.createElement('p');
    err.className = 'add-error';
    err.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'add-actions';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn-primary';
    submit.textContent = opts.submitText;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeAddPicker);

    submit.addEventListener('click', () => {
      // Everything up to permissions.request must be SYNCHRONOUS (no await) so the
      // user gesture survives — mirrors popup.js's request-first ordering.
      const instanceConfig = readConfig();
      if (!instanceConfig) { err.textContent = 'Please check the values.'; err.hidden = false; return; }
      opts.onSubmit(instanceConfig);
    });

    actions.append(submit, cancel);
    form.append(actions, err);
    picker.appendChild(form);
  }

  function openConfigForm(type, def, picker) {
    buildConfigForm(picker, def, {
      headText: `Add ${def.label}`, submitText: 'Add panel', current: null,
      onSubmit: (cfg) => {
        closeAddPicker();   // dismiss the form; the new panel renders into the grid
        // Fire the grant prompt in-gesture; the panel checks access live at mount,
        // so whether granted now or revoked later, it shows the right state.
        if (def.network) grantThenAdd(def.originOf(cfg), () => addPanel(type, cfg));
        else addPanel(type, cfg);
      },
    });
  }

  // Edit a placed panel's config in Edit mode (change crypto tickers / RSS feed). Reuses
  // the add form pre-filled, then swaps the panel's config in place — no remove + re-add.
  function openReconfigureForm(spec, def) {
    closeAddPicker();
    const picker = document.createElement('div');
    picker.className = 'add-picker';
    buildConfigForm(picker, def, {
      headText: `Configure ${def.label}`, submitText: 'Save changes', current: spec.config || {},
      onSubmit: (cfg) => {
        closeAddPicker();
        // The feed/origin may have changed (RSS) → re-request in-gesture; crypto's origin
        // is fixed, so grantThenAdd short-circuits on the cached grant.
        if (def.network) grantThenAdd(def.originOf(cfg), () => updatePanelConfig(spec.id, cfg));
        else updatePanelConfig(spec.id, cfg);
      },
    });
    addBtn.hidden = true;
    addBtn.after(picker);
  }

  async function updatePanelConfig(id, newConfig) {
    if (boardBusy) return;
    const p = config.panels.find((x) => x.id === id);
    if (!p) return;
    boardBusy = true;
    try { p.config = newConfig; await saveConfig(); renderBoard(); focusPanel(id); }
    finally { boardBusy = false; }
  }

  // Request-first: short-circuit synchronously off the cached <all_urls> grant,
  // else request the feed origin as the next synchronous statement.
  function grantThenAdd(origin, done) {
    if (hasAllUrls) { done(true); return; }
    const pattern = originMatchPattern(origin);
    if (!pattern) { done(false); return; }
    try {
      chrome.permissions.request({ origins: [pattern] }, (granted) => {
        done(!chrome.runtime.lastError && !!granted);
      });
    } catch (e) { done(false); } // an invalid pattern / lost gesture is a denial, never a thrown click
  }

  async function addPanel(type, instanceConfig) {
    const id = `${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; // unique even for same-ms adds
    config.panels.push({ id, type, config: instanceConfig });
    await saveConfig();
    renderBoard();
    focusPanel(id);
  }

  // --- minimal mode --------------------------------------------------------

  function renderMinimal() {
    minimalNote.hidden = false;
    minimalNote.textContent = '';
    const line = document.createElement('span');
    line.textContent = 'Minimal mode — the board engine is still running. ';
    const show = ctrlBtn('Show board', 'Show board', async () => {
      config.minimalMode = false; await saveConfig(); renderBoard();
    });
    const native = ctrlBtn('Restore Chrome’s new tab…', 'Open extension settings', () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
    minimalNote.append(line, show, document.createTextNode('  ·  '), native);
  }

  // --- board render --------------------------------------------------------

  function teardownAll() {
    // A panel teardown must never block re-render, but a failure shouldn't vanish.
    for (const t of mounted) { try { t(); } catch (e) { console.warn('[ypuf] panel teardown error', e); } }
    mounted = [];
  }

  function renderBoard() {
    teardownAll();
    dragId = null; docBody.classList.remove('dragging-active');   // a programmatic re-render mid-drag must not leave stale drag state
    closeAddPicker();   // never leave a stray add-form across a re-render
    // The keyboard layer's state (U8/U9) is keyed to the DOM we're about to replace —
    // a re-render (incl. a cross-tab storage.onChanged converge) must not leave the
    // hint-layer (which lives on docBody, not grid) orphaned, or the cursor index
    // silently re-targeting a different row.
    clearKbdCursor(); exitHints(); pendingG = false;
    grid.textContent = '';
    minimalNote.hidden = true;
    docBody.classList.toggle('editing', editing);
    docBody.classList.toggle('minimal', !!config.minimalMode);
    editBtn.hidden = false;
    if (settingsBtn) settingsBtn.hidden = false;

    if (config.minimalMode) {
      emptyNote.hidden = true;
      addBtn.hidden = true;
      renderMinimal();
      return;
    }

    const panels = currentPanels();
    emptyNote.hidden = panels.length > 0;
    addBtn.hidden = !editing;
    const lanes = [];
    for (let c = 0; c < COLS; c++) {
      const lane = document.createElement('div');
      lane.className = 'board-col';
      lane.dataset.col = String(c);
      if (editing) makeLaneDroppable(lane, c);
      grid.appendChild(lane);
      lanes.push(lane);
    }
    for (const spec of panels) mountPanel(spec, lanes[colOf(spec)] || lanes[0]);

    if (firstPaint) {   // gentle one-shot card entrance; removed so re-renders don't re-animate
      firstPaint = false;
      docBody.classList.add('intro');
      setTimeout(() => docBody.classList.remove('intro'), 700);
    }
  }

  // A lane is a drop target for empty-space drops (a panel handles its own drop and
  // stops propagation). Dropping onto empty lane space appends to that lane's end.
  function makeLaneDroppable(lane, col) {
    lane.addEventListener('dragover', (e) => {
      if (dragId == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      lane.classList.add('lane-over');
    });
    lane.addEventListener('dragleave', (e) => { if (e.target === lane) lane.classList.remove('lane-over'); });
    lane.addEventListener('drop', (e) => {
      lane.classList.remove('lane-over');
      if (dragId == null) return;
      e.preventDefault();
      moveToLane(dragId, col);
    });
  }

  function currentPanels() {
    if (location.hash === '#selftest') return [{ id: 'selftest', type: 'selftest' }];
    return config.panels;
  }

  function mountPanel(spec, lane) {
    if (spec.type === 'selftest') return mountSelfTest(spec, lane);
    const def = PANEL_TYPES[spec.type];
    if (!def) return mountPlaceholder(spec, spec.type, lane);
    const ctx = panelCell(spec, def.label);
    if (spec.id && editing) makeDraggable(ctx.cell, spec);
    lane.appendChild(ctx.cell);
    try {
      const teardown = def.mount({ ...ctx, spec, mountSandbox, send, broker, remount: renderBoard });
      if (typeof teardown === 'function') mounted.push(teardown);
    } catch (e) {
      // One bad panel (corrupt config, missing dep) must not abort the rest of the board.
      console.warn('[ypuf] panel mount failed', spec.type, e);
      ctx.body.textContent = 'This panel couldn’t load.';
    }
  }

  function mountPlaceholder(spec, label, lane) {
    const { cell, body } = panelCell(spec, label);
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Loading…';
    body.appendChild(p);
    lane.appendChild(cell);
  }

  // Trello-style drag reorder: the whole card is the drag handle in edit mode. A
  // quiet arrow-key fallback stays for keyboard users. During a drag, iframes are
  // made pointer-events:none (CSS) so dragover/drop reach the cells beneath them.
  const clearDropMarks = () => grid.querySelectorAll('.drop-before, .drop-after, .lane-over')
    .forEach((el) => el.classList.remove('drop-before', 'drop-after', 'lane-over'));

  const insertBefore = (cell, e) => {
    const r = cell.getBoundingClientRect();
    return (e.clientY - r.top) < r.height / 2;   // top half → drop above, bottom half → below
  };

  function makeDraggable(cell, spec) {
    cell.draggable = true;
    cell.tabIndex = 0;

    cell.addEventListener('dragstart', (e) => {
      dragId = spec.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', spec.id); } catch (err) { /* some targets reject setData */ }
      cell.classList.add('dragging');
      docBody.classList.add('dragging-active');
    });
    cell.addEventListener('dragend', () => {
      dragId = null;
      cell.classList.remove('dragging');
      docBody.classList.remove('dragging-active');
      clearDropMarks();
    });
    cell.addEventListener('dragover', (e) => {
      if (dragId == null || dragId === spec.id) return;
      e.preventDefault();
      e.stopPropagation();   // this cell is the drop target — don't also light up the lane's empty-space hint
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      cell.classList.add(insertBefore(cell, e) ? 'drop-before' : 'drop-after');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-before', 'drop-after'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();   // handled here — don't also fire the lane's empty-space drop
      if (dragId == null || dragId === spec.id) return;
      reorderInto(dragId, spec.id, insertBefore(cell, e));
    });

    cell.addEventListener('keydown', (e) => {   // keyboard a11y: ◀▶ change lane, ▲▼ reorder within
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveAcross(spec.id, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveAcross(spec.id, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveWithinLane(spec.id, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveWithinLane(spec.id, 1); }
    });
  }

  // --- U1 isolation proof (open newtab.html#selftest) ----------------------

  function mountSelfTest(spec, lane) {
    const { cell, body } = panelCell(spec, 'Sandbox self-test');
    const ch = mountSandbox(body, (intent) => {
      console.log('[ypuf] self-test intent received (host validated source):', intent);
    });
    mounted.push(ch.destroy);
    ch.render({
      lines: [
        { text: 'Hello from the sandboxed panel — rendered as text.' },
        { text: '<img src=x onerror=alert(1)> — markup stays inert, click me', open: 0 },
      ],
      note: 'Inside the frame: chrome is undefined; fetch() is blocked by CSP.',
      foot: 'sandbox · no chrome.* · no network egress',
    });
    (lane || grid).appendChild(cell);
  }

  // --- config + boot -------------------------------------------------------

  const saveConfig = () => send('board-save-config', { config });

  const BOARD_LAST_OPEN_KEY = 'boardLastOpen';

  async function loadAndRender() {
    const loaded = await send('board-get-config');
    if (loaded && Array.isArray(loaded.panels)) config = loaded;
    // One-time migration: panels from before lanes existed get spread across the
    // columns (round-robin) so the board looks composed rather than all stacked left.
    if (lanes.migrateCols(config.panels, COLS)) saveConfig();
    // U6: capture the prior open's stamp (for the puff), then advance it. Read before
    // write so this open's "new since last time" comparison uses the previous value.
    // A 0 here (first open ever, or a read error) keeps the puff quiet — see the > 0
    // guard at the puff site, so a fresh/backlogged profile never mass-puffs.
    boardLastOpen = (await local.get(BOARD_LAST_OPEN_KEY).catch(() => 0)) || 0;
    puffArmed = true;
    local.set(BOARD_LAST_OPEN_KEY, Date.now());
    renderBoard();
    renderOneLine();
  }

  renderMasthead();   // greet the hour (U4)
  editBtn.textContent = ''; editBtn.append(icon('pencil'));   // U1: iconify the edit affordance
  editBtn.setAttribute('aria-label', 'Edit board'); editBtn.title = 'Edit board';
  editBtn.addEventListener('click', () => { editing = !editing; renderBoard(); });
  if (settingsBtn) {   // U2: the gear opens/closes the settings overlay
    settingsBtn.append(icon('gear'));
    settingsBtn.setAttribute('aria-label', 'Settings'); settingsBtn.title = 'Settings';
    settingsBtn.addEventListener('click', () => { settingsOpen() ? closeSettings() : openSettings(); });
  }
  if (themeToggle) {   // U5: the cycling moon-phase toggle (light → dark → star)
    themeToggle.setAttribute('aria-label', 'Theme');
    renderThemeToggle();
    themeToggle.addEventListener('click', cycleTheme);
  }
  // Another extension surface (a second board tab, the popup) changed the theme — converge.
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY && e.newValue) applyTheme(e.newValue);
  });
  syncStarfield();    // U8: start the field if the pre-paint theme is already star
  reconcileTheme();   // durable chrome.storage ⇄ pre-paint mirror, after first paint

  addBtn.addEventListener('click', openAddPicker);
  window.addEventListener('hashchange', renderBoard);

  // --- board normal-mode keyboard layer (U8, R9/R12) -----------------------
  // One document keydown drives a recall cursor + row actions. The key→intent
  // decision is the pure lib (boardkeys); this is only DOM application — actions
  // reuse the rows' existing controls (click .recall-forget / .recall-protect /
  // the title) so the SW round-trips, undo grace, and teardown guards aren't
  // duplicated. Invisible at rest: the cursor class is added only once a key moves
  // it, and cleared on Escape (the U10 calm guarantee).
  let kbdCursor = -1;
  let pendingG = false;   // first 'g' of a 'gg' (jump-to-top) sequence

  const isField = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
    || t.tagName === 'SELECT' || t.isContentEditable);
  const recallRows = () =>
    [...document.querySelectorAll('.recent-item[data-id]')].filter((el) => el.offsetParent !== null);

  function paintCursor(rows) {
    rows.forEach((el, i) => el.classList.toggle('kbd-cursor', i === kbdCursor));
    if (rows[kbdCursor]) rows[kbdCursor].scrollIntoView({ block: 'nearest' });
  }
  function clearKbdCursor() {
    kbdCursor = -1;
    document.querySelectorAll('.recent-item.kbd-cursor').forEach((el) => el.classList.remove('kbd-cursor'));
  }
  function moveKbd(delta) {
    const rows = recallRows();
    kbdCursor = boardkeys.moveCursor(kbdCursor, delta, rows.length);
    paintCursor(rows);
  }
  function jumpKbd(toEnd) {
    const rows = recallRows();
    if (!rows.length) { kbdCursor = -1; return; }
    kbdCursor = toEnd ? rows.length - 1 : 0;
    paintCursor(rows);
  }
  function cursorRow() {
    const rows = recallRows();
    return (kbdCursor >= 0 && kbdCursor < rows.length) ? rows[kbdCursor] : null;
  }
  const clickIn = (row, sel) => { const b = row && row.querySelector(sel); if (b) b.click(); };

  // f-hints (U9): label every host-rendered clickable, type a label to open it. Targets
  // are host DOM only (recall titles + top-sites) — sandboxed RSS/crypto iframes are a
  // separate origin we can't badge into (pattern 16; noted in the U10 cheatsheet).
  let hintsActive = false;
  let hintBuf = '';
  let hintLabels = [];
  let hintTargets = [];

  const hintTargetEls = () => [...document.querySelectorAll('.recent-item[data-id] .title.clickable, .topsite')]
    .filter((el) => el.offsetParent !== null);

  function enterHints() {
    if (hintsActive) return;
    const targets = hintTargetEls();
    if (!targets.length) return;   // nothing to label — stay quiet
    clearKbdCursor();
    hintLabels = hints.assign(targets.length);
    hintTargets = targets.slice(0, hintLabels.length);
    hintBuf = '';
    const layer = document.createElement('div');
    layer.className = 'hint-layer';
    layer.setAttribute('aria-hidden', 'true');   // floating badges are coordinate artifacts, not content
    hintTargets.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const badge = document.createElement('span');
      badge.className = 'hint-badge';
      badge.dataset.label = hintLabels[i];
      badge.textContent = hintLabels[i];
      badge.style.left = `${r.left}px`;
      badge.style.top = `${r.top}px`;
      layer.appendChild(badge);
    });
    docBody.appendChild(layer);
    hintsActive = true;
    // The fixed badges are pinned to enter-time viewport coords; a scroll would slide the
    // rows out from under them. Dismiss on any scroll — calm + predictable, like a typo.
    window.addEventListener('scroll', exitHints, { capture: true, passive: true });
  }

  function exitHints() {
    hintsActive = false;
    hintBuf = '';
    hintTargets = [];
    hintLabels = [];
    window.removeEventListener('scroll', exitHints, { capture: true });
    const layer = document.querySelector('.hint-layer');
    if (layer) layer.remove();
  }

  function handleHintKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); exitHints(); return; }
    if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;   // only letters select a hint
    e.preventDefault();
    hintBuf += e.key.toLowerCase();
    const m = hints.match(hintBuf, hintLabels);
    if (m.index !== undefined) {
      const target = hintTargets[m.index];
      exitHints();
      if (target) target.click();
    } else if (m.noMatch) {
      exitHints();   // a typo cancels — calm, predictable
    } else {
      // needMore: dim the badges that no longer match the typed prefix
      document.querySelectorAll('.hint-badge').forEach((b) =>
        b.classList.toggle('stale', b.dataset.label.indexOf(hintBuf) !== 0));
    }
  }

  // The ? cheatsheet (U10): a calm static help overlay listing the keyboard layer.
  // Reuses U2's focus-trap; Esc/backdrop closes; focus restores to where it was. The
  // layer is invisible until used — this is the only thing ? ever draws.
  const cheatsheetOpen = () => !!document.querySelector('.cheatsheet-overlay');

  function closeCheatsheet() {
    const o = document.querySelector('.cheatsheet-overlay');
    if (o) o.remove();
    try { if (cheatsheetPrevFocus && cheatsheetPrevFocus.focus) cheatsheetPrevFocus.focus(); } catch (e) { /* gone */ }
  }

  function cheatsheetKeydown(e) {
    // stopPropagation so this Esc doesn't also bubble to the board keydown and clear the cursor.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCheatsheet(); return; }
    trapTab(e, e.currentTarget);
  }

  function openCheatsheet() {
    if (cheatsheetOpen()) return;
    cheatsheetPrevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'cheatsheet-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Keyboard shortcuts');
    const backdrop = document.createElement('div'); backdrop.className = 'cheatsheet-backdrop';
    backdrop.addEventListener('click', closeCheatsheet);
    const card = document.createElement('div'); card.className = 'cheatsheet-card';
    card.addEventListener('keydown', cheatsheetKeydown);
    const head = document.createElement('div'); head.className = 'settings-head';
    const title = document.createElement('span'); title.className = 'settings-title'; title.textContent = 'Keyboard shortcuts';
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'settings-close icon-btn';
    close.setAttribute('aria-label', 'Close'); close.title = 'Close';
    close.append(icon('close'));
    close.addEventListener('click', closeCheatsheet);
    head.append(title, close);
    const list = document.createElement('dl'); list.className = 'cheatsheet-list';
    for (const [keys, desc] of CHEATSHEET) {
      const dt = document.createElement('dt'); dt.textContent = keys;
      const dd = document.createElement('dd'); dd.textContent = desc;
      list.append(dt, dd);
    }
    const note = document.createElement('p'); note.className = 'cheatsheet-note muted';
    note.textContent = 'f-hints label host-rendered links only — not inside the RSS/crypto panels.';
    card.append(head, list, note);
    overlay.append(backdrop, card);
    docBody.appendChild(overlay);
    close.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (settingsOpen() || cheatsheetOpen()) return;   // overlays trap their own keys
    if (hintsActive) { handleHintKey(e); return; }     // f-hint mode owns letters (U9)
    const it = boardkeys.intent(e.key, { fieldFocused: isField(e.target) });
    if (it === 'none') { pendingG = false; return; }   // any unmapped/field key resolves a pending 'gg'
    const wasPendingG = pendingG;
    pendingG = false;                                  // consumed below; 'g' re-arms it
    // A held key must not re-fire a row mutation; only cursor movement repeats.
    if (e.repeat && it !== 'down' && it !== 'up' && it !== 'g' && it !== 'bottom') return;

    switch (it) {
      case 'down': e.preventDefault(); moveKbd(1); break;
      case 'up': e.preventDefault(); moveKbd(-1); break;
      case 'bottom': e.preventDefault(); jumpKbd(true); break;
      case 'g':
        e.preventDefault();
        if (wasPendingG) jumpKbd(false); else pendingG = true;
        break;
      case 'open': e.preventDefault(); clickIn(cursorRow(), '.title.clickable'); break;
      case 'forget': {
        const r = cursorRow();
        if (r && !r.classList.contains('struck')) { e.preventDefault(); clickIn(r, '.recall-forget'); }
        break;
      }
      case 'undo': {
        const r = cursorRow();
        if (r && r.classList.contains('struck')) { e.preventDefault(); clickIn(r, '.recall-forget'); }
        break;
      }
      case 'protect': e.preventDefault(); clickIn(cursorRow(), '.recall-protect'); break;
      case 'search': {
        e.preventDefault();
        const s = document.querySelector('.recall-search');
        if (s) s.focus();
        break;
      }
      case 'edit': e.preventDefault(); editBtn.click(); break;
      case 'hints': e.preventDefault(); enterHints(); break;       // U9
      case 'help': e.preventDefault(); openCheatsheet(); break;    // U10
      case 'escape':
        if (isField(e.target)) e.target.blur();
        clearKbdCursor();
        break;
      default: break;
    }
  });

  // Another board tab edited the config — converge so this tab doesn't show stale
  // state. Don't yank the board out from under an active edit; skip our own writes.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.boardConfig) return;
    const next = changes.boardConfig.newValue;
    if (!next || !Array.isArray(next.panels) || editing || boardBusy) return;
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    if (settingsOpen()) closeSettings();   // don't leave a stale settings overlay over a converged board
    if (cheatsheetOpen()) closeCheatsheet();   // nor a stale cheatsheet
    renderBoard();
  });

  // The board's panel-registration surface. U5 (rss) and U6 (crypto) register
  // their type defs here, before boot.
  window.ypuf = Object.assign(window.ypuf || {}, {
    board: { registerPanelType, mountSandbox, send, broker },
  });

  // --- ypuf panel (U3): recall/shelf/back-now, host-rendered ---------------
  // Reuses the shipped SW messages (zero new SW data work) and lib/shelf-render.js
  // for the text-only row builders. Page-influenced titles → textContent is
  // load-bearing here, not cosmetic (see shelf-render.js / KTD).

  registerPanelType('ypuf', {
    label: 'ypuf — recall',
    addable: false,          // present by default (R3); not added via the picker
    network: false,
    mount(ctx) {
      const SR = window.ypuf.shelfRender;
      const T = (window.ypuf && window.ypuf.titles) || {};
      const body = ctx.body;
      const handlers = {
        open: (id) => {
          send('recall-open', { recordId: id });
          // Opening a page dismisses its row from the shelf — it's a live tab now,
          // not a let-go page. It stays in the searchable archive (and the recent
          // shelf omits currently-open pages), so it won't reappear until it's let
          // go again. Covers recent, back-now, and search-result rows alike.
          const sel = (window.CSS && CSS.escape) ? CSS.escape(String(id)) : String(id);
          const el = body.querySelector('[data-id="' + sel + '"]');
          if (el) el.remove();
        },
      };
      let destroyed = false;   // armed by the teardown so late SW replies can't write into a torn-down panel
      const undoTimers = new Set();   // pending forget-undo timers, cleared on teardown so none outlive the mount

      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'recall-search';
      search.placeholder = 'Recall a let-go page…';
      search.setAttribute('aria-label', 'Recall a let-go page');
      const reliefWrap = document.createElement('div');
      const digestWrap = document.createElement('div');
      const results = document.createElement('div');
      const recentWrap = document.createElement('div');
      const snoozeWrap = document.createElement('div');
      body.append(reliefWrap, digestWrap, search, results, recentWrap, snoozeWrap);

      // The relief moment (U5/R12): once a day, a calm acknowledgement that what you
      // let go is safe. The SW gates the claim, so it shows on whichever surface you
      // open first that day; never a badge or a nag.
      send('relief-claim').then((resp) => {
        if (destroyed || !resp || !resp.show) return;
        const relief = document.createElement('div');
        relief.className = 'board-relief';
        relief.textContent = `${resp.count} let go today — all still findable.`;
        reliefWrap.appendChild(relief);
      });

      // "Your week, unburdened" (U7/R8): a calm weekly tally — hidden entirely when
      // there's nothing to show (no cold all-zeros line on a fresh profile).
      send('week-digest').then((d) => {
        if (destroyed || !d || (!d.letGo && !d.recalled)) return;
        const line = document.createElement('div');
        line.className = 'board-digest';
        line.textContent = `${d.letGo} let go this week · ${d.lost} lost · ${d.recalled} recalled`;
        digestWrap.appendChild(line);
      });

      // Reflect the never-touch set on each row's shield: lit when the site is already
      // protected, and the shield toggles protect ⇄ allow-auto-close (mirrors the popup's
      // Protected-sites removal). Fetched once at mount; the toggle keeps it in sync.
      let protectedHosts = new Set();
      const isProtected = (host) => !!host && protectedHosts.has(host);
      function markProtect(btn) {
        const lit = isProtected(btn.dataset.host);
        btn.classList.toggle('protected', lit);
        btn.title = lit ? 'Protected — click to allow auto-close' : 'Never-touch this site';
        btn.setAttribute('aria-label', lit ? 'Site protected — click to unprotect' : 'Never let this site go');
      }
      const syncProtectMarks = () => body.querySelectorAll('.recall-protect').forEach(markProtect);
      send('protected-list').then((resp) => {
        if (destroyed || !resp || !Array.isArray(resp.items)) return;
        protectedHosts = new Set(resp.items);
        syncProtectMarks();
      }).catch(() => {});

      function row(it, tags, action) {
        const li = SR.toDom(SR.itemRow(it, tags, T, action), document, handlers);
        // Set-bearing recall items offer a one-tap "bring back the set" (the
        // granular checkbox restore stays in the popup); restore-set intersects
        // the requested URLs against the record's stored siblings in the SW.
        if (it.siblings && it.siblings.length) {
          const urls = it.siblings.map((s) => s.url);
          const restore = document.createElement('button');
          restore.type = 'button';
          restore.className = 'link set-restore';
          restore.textContent = `bring back the set? (${it.siblings.length})`;
          restore.addEventListener('click', () => send('restore-set', { recordId: it.id, urls }));
          li.appendChild(restore);
        }
        if (it.id) { addProtect(li, it); addForget(li, it); }   // hover-revealed pair: protect · forget
        return li;
      }

      // One-tap never-touch (U4): the shield toggles this page's site between protected
      // (auto-let-go never closes it) and not. Hover/focus-reveals as a calm pair with
      // forget. Uses the row's STORED host; lit state comes from the never-touch set.
      function addProtect(li, it) {
        const host = it.host || hostOfUrl(it.url || '');
        const protect = document.createElement('button');
        protect.type = 'button';
        protect.className = 'recall-protect icon-btn';
        protect.dataset.host = host || '';
        protect.append(icon('shield'));
        markProtect(protect);
        let inflight = false;
        protect.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!host || inflight) return;   // ignore re-clicks until the round-trip settles
          inflight = true;
          const wasProtected = isProtected(host);
          send(wasProtected ? 'protect-remove' : 'protect-add', { host }).then((resp) => {
            inflight = false;
            if (destroyed || !resp || !resp.ok) return;   // panel torn down or the SW rejected
            if (wasProtected) protectedHosts.delete(host); else protectedHosts.add(host);
            syncProtectMarks();   // re-light EVERY row for this host, not just the clicked one
          }).catch(() => { inflight = false; });
        });
        li.appendChild(protect);
      }

      // Delete-in-place (forget) from the board — mirrors the popup's What's-indexed
      // Forget: strike the row, swap to "undo" for the 6s grace window, then remove.
      // A quiet hover-revealed link so the board stays calm at rest.
      function addForget(li, it) {
        const forget = document.createElement('button');
        forget.type = 'button';
        forget.className = 'link recall-forget icon-btn';
        const showForget = () => { forget.textContent = ''; forget.append(icon('trash')); forget.setAttribute('aria-label', 'Forget this page'); forget.title = 'forget'; };
        showForget();
        let undoTimer = null;
        forget.addEventListener('click', (e) => {
          e.stopPropagation();
          if (undoTimer) {                                   // within the grace window → undo
            clearTimeout(undoTimer); undoTimers.delete(undoTimer); undoTimer = null;
            send('forget-page-undo', { recordId: it.id }).then((resp) => {
              if (destroyed) return;                          // panel torn down before the SW replied
              if (!resp || !resp.ok) { li.remove(); return; } // undo too late — the page is truly gone
              li.classList.remove('struck'); showForget();
            });
            return;
          }
          send('forget-page', { recordId: it.id }).then((resp) => {
            if (!resp || !resp.ok) return;                   // forget failed → don't fake success
            li.classList.add('struck');
            forget.textContent = 'undo'; forget.setAttribute('aria-label', 'Undo forget'); forget.title = 'undo';
            undoTimer = setTimeout(() => { undoTimers.delete(undoTimer); if (!destroyed) li.remove(); }, 6000); // don't touch a torn-down row
            undoTimers.add(undoTimer);
          });
        });
        li.appendChild(forget);
      }

      function renderList(target, items, action) {
        target.textContent = '';
        for (const it of (items || [])) {
          target.appendChild(row(it, [T.timeAgo ? T.timeAgo(it.timestamp) : ''], action));
        }
      }

      function group(label) {
        const h = document.createElement('div');
        h.className = 'panel-group-label';
        h.textContent = label;
        return h;
      }

      send('list-recent', { limit: 12 }).then((resp) => {
        if (destroyed) return;
        const items = (resp && resp.items) || [];
        renderList(recentWrap, items, { action: 'open' });
        syncProtectMarks();   // protected-list may have resolved before any rows existed — re-mark now
        // U6: the puff — rows let go since the last board open arrive with a soft
        // settle. One-shot: disarm after the first paint so re-renders stay still.
        // boardLastOpen === 0 means first-ever open (or a read error) — stay quiet
        // rather than animate the whole backlog at once.
        if (puffArmed && boardLastOpen > 0) {
          const rows = recentWrap.querySelectorAll('.recent-item');
          items.forEach((it, i) => {
            if (it.autoClosed && it.timestamp > boardLastOpen && rows[i]) rows[i].classList.add('puff');
          });
        }
        if (puffArmed) puffArmed = false;
      });

      // While a query is active, collapse the panel to JUST the matches — the recent +
      // snoozed + relief/digest sections hide, so the results aren't buried under the
      // unfiltered recent list (which read as "search returns junk").
      const searchMode = (active) => {
        for (const el of [reliefWrap, digestWrap, recentWrap, snoozeWrap]) el.hidden = active;
      };

      let seq = 0;
      let timer = null;
      const applyQuery = () => {
        const q = search.value.trim();
        const mine = ++seq;              // bump on EVERY call (incl. clear) so an in-flight
                                         // response can't repaint a since-cleared/changed query
        searchMode(!!q);                 // toggle immediately so the recent list hides as you type
        clearTimeout(timer);
        if (!q) { results.textContent = ''; return; }   // empty → restore the full panel
        timer = setTimeout(() => {
          send('recall-search', { q }).then((resp) => {
            if (destroyed || mine !== seq) return;
            const items = (resp && resp.results) || [];
            renderList(results, items, { action: 'open' });
            if (!items.length) {
              const none = document.createElement('p');
              none.className = 'muted recall-no-match';
              none.textContent = `No matches for “${q}”.`;
              results.appendChild(none);
            }
          });
        }, 180);
      };
      search.addEventListener('input', applyQuery);
      search.addEventListener('search', applyQuery);   // native clear (× button / type=search reset)
      // Esc owns the search field: clear the query, restore the panel, then blur — so the
      // board's generic 'escape' (which only blurs) can't leave it stuck mid-search.
      search.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();   // stops the board 'escape' — so also clear the kbd cursor it would have
        search.value = '';
        applyQuery();
        clearKbdCursor();
        search.blur();
      });

      send('snooze-list').then((resp) => {
        if (destroyed) return;
        snoozeWrap.textContent = '';
        const back = resp && resp.back;
        const snoozed = resp && resp.snoozed;
        if (back && back.length) {
          snoozeWrap.appendChild(group('Back now'));
          renderListInto(snoozeWrap, back, { action: 'open' });
        }
        if (snoozed && snoozed.length) {
          snoozeWrap.appendChild(group('Snoozed'));
          for (const it of snoozed) snoozeWrap.appendChild(snoozedRow(it));
        }
      });

      function renderListInto(target, items, action) {
        const ul = document.createElement('ul');
        ul.className = 'recent';
        for (const it of items) ul.appendChild(row(it, [T.timeAgo ? T.timeAgo(it.returnAt || it.timestamp) : ''], action));
        target.appendChild(ul);
      }

      function snoozedRow(it) {
        const li = SR.toDom(SR.itemRow(it, ['snoozed'], T, null), document, {});
        const ctrls = document.createElement('div');
        ctrls.className = 'snooze-controls';
        const wake = document.createElement('button');
        wake.type = 'button'; wake.className = 'link'; wake.textContent = 'Wake';
        wake.addEventListener('click', () => send('snooze-wake', { recordId: it.id }).then(() => ctx.remount && ctx.remount()));
        ctrls.appendChild(wake);
        li.appendChild(ctrls);
        return li;
      }

      return () => { destroyed = true; clearTimeout(timer); for (const t of undoTimers) clearTimeout(t); undoTimers.clear(); }; // cancel the debounce, late renders + pending undo timers
    },
  });

  // --- RSS feed panel (U5) -------------------------------------------------
  // A1 pastes a feed URL; the broker fetches/validates/parses; headlines render
  // in the sandbox. "Open headline" is an index the host intersects against its
  // OWN parsed links (pattern 15) before chrome.tabs.create — the panel can never
  // name a URL the host didn't parse.

  registerPanelType('rss', {
    label: 'RSS feed',
    hint: 'latest headlines',
    addable: true,
    reconfigurable: true,
    network: true,
    buildForm(form, current) {
      const input = document.createElement('input');
      input.type = 'url';
      input.placeholder = 'https://example.com/feed.xml';
      input.setAttribute('aria-label', 'Feed URL');
      if (current && current.url) input.value = current.url;
      form.appendChild(input);
      return () => {
        const v = window.ypuf.sourceurl.validate(input.value.trim());
        return v.ok ? { url: v.url, host: v.host } : null;   // sync, pre-grant (R12)
      };
    },
    originOf(cfg) { return new URL(cfg.url).origin; },
    mount(ctx) {
      const cfg = ctx.spec.config || {};
      const rss = window.ypuf.rss;
      const channel = window.ypuf.channel;
      const host = cfg.host || hostOfUrl(cfg.url);
      setPanelLabel(ctx, host);                  // R8: each instance labelled by source
      const foot = `fetches ${host} · sees your IP + timing`;

      let links = [];
      const panel = ctx.mountSandbox(ctx.body, (intent) => {
        if (intent.intent !== 'open') return;
        const url = channel.resolveOpen(intent.index, links);
        if (url && isHttpUrl(url)) chrome.tabs.create({ url }); // belt-and-suspenders (links[] is already http(s)-only)
      });

      const show = (items, note) => {
        // Only http(s) headline links are openable. A feed item link of
        // javascript:/data:/file:/chrome: is attacker-controlled feed bytes and must
        // never reach chrome.tabs.create — resolveOpen proves provenance (the index
        // maps to a host-parsed link), this proves the SCHEME is safe.
        links = (items || []).map((it) => (isHttpUrl(it.link) ? it.link : ''));
        const lines = (items || []).map((it, i) => ({ text: it.title, open: links[i] ? i : undefined }));
        panel.render({ lines: lines.length ? lines : [{ text: note || 'No headlines yet.' }], note: lines.length ? note : '', foot });
      };

      let alive = true;   // armed false by teardown; a late access resolve must not fetch/render a gone panel
      panel.render({ lines: [{ text: 'Loading…' }], foot }); // cold-cache placeholder, never blocks (R11)
      panelHasAccess(cfg.url).then((ok) => {
        if (!alive) return;   // torn down before access resolved → no post-teardown feed fetch
        if (!ok) {
          // Grant absent (never granted, or revoked after add) → calm "needs access" (R2).
          panel.render({ lines: [{ text: 'ypuf needs access to load this feed.' }], foot });
          addGrantAffordance(ctx);
          return;
        }
        ctx.broker.load({ cacheKey: 'panel:rss:' + cfg.url, url: cfg.url, ttlMs: 30 * 60 * 1000, parse: (xml) => rss.parse(xml) })
          .then((r) => {
            if (r.value && r.value.length) show(r.value, r.stale ? 'updating…' : '');
            else if (r.value) show([], '');                  // empty feed, fetched ok
            else show([], `couldn’t load ${host}`);          // cold-fail (R11)
            if (r.refresh) r.refresh.then((v) => { if (v) show(v, ''); }).catch(() => {});
          })
          .catch(() => show([], `couldn’t load ${host}`));
      });
      return () => { alive = false; panel.destroy(); };
    },
  });

  // --- Crypto price panel (U6) ---------------------------------------------
  // Glanceable price + 24h change via a swappable provider (CoinGecko v1). Refresh
  // is swap-on-refocus: a 60s in-page interval STAGES a new value without redrawing;
  // it is flushed only on the next refocus (visibilitychange→visible / window focus)
  // — the one moment the user is provably not mid-glance. An "as of HH:MM" stamp
  // keeps a left-open board honest; failures keep last-known + "unavailable" (R11).

  registerPanelType('crypto', {
    label: 'Crypto price',
    hint: 'live prices',
    addable: true,
    reconfigurable: true,
    network: true,
    buildForm(form, current) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'bitcoin, ethereum, solana';
      input.setAttribute('aria-label', 'Token ids (CoinGecko), comma-separated');
      if (current && Array.isArray(current.tokens)) input.value = current.tokens.join(', ');
      const hint = document.createElement('p');
      hint.className = 'muted add-hint';
      hint.textContent = 'CoinGecko ids, comma-separated — several show in one panel (e.g. "bitcoin", not "BTC").';
      form.append(input, hint);
      return () => {
        const tokens = input.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        return tokens.length ? { tokens } : null;
      };
    },
    originOf() { return 'https://api.coingecko.com'; }, // ypuf-chosen infra, not a user source
    mount(ctx) {
      const cfg = ctx.spec.config || {};
      const tokens = Array.isArray(cfg.tokens) ? cfg.tokens : [];
      const CP = window.ypuf.cryptoProvider;
      setPanelLabel(ctx, tokens.length ? tokens.join(' · ') : 'Crypto');
      const foot = `via ${CP.label} (ypuf-chosen) · sees your IP + timing`;
      const panel = ctx.mountSandbox(ctx.body, () => {}); // glance only — no intents

      const source = {
        cacheKey: 'panel:crypto:' + tokens.join(','),
        url: CP.buildUrl(tokens),
        ttlMs: 60 * 1000,
        parse: (text) => CP.parse(text, tokens),
      };

      const asOf = (ts) => { try { return 'as of ' + new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
      const lineOf = (p) => {
        if (!p || p.unavailable || typeof p.price !== 'number') return { text: `${p ? p.token : '?'} — unavailable` };
        const text = `${p.token}  $${p.price.toLocaleString()}`;
        if (typeof p.change24h !== 'number') return { text };
        const up = p.change24h >= 0;
        return { text, tail: `${up ? '▲' : '▼'} ${Math.abs(p.change24h).toFixed(2)}%`, tone: up ? 'pos' : 'neg' };
      };
      const draw = (prices, ts) => {
        const lines = (prices || []).map(lineOf);
        panel.render({ lines: lines.length ? lines : [{ text: 'price unavailable' }], note: ts ? asOf(ts) : 'price unavailable', foot });
      };

      panel.render({ lines: [{ text: 'Loading…' }], foot }); // cold-cache placeholder, never blocks (R11)

      // Swap-on-refocus: stage on the interval, flush on the next refocus. Declared
      // up here so teardown can always clear them, even if access is denied.
      let staged = null;
      let timer = null;
      let alive = true;   // armed false by teardown; a late access resolve must not install the interval/listeners
      const flush = () => { if (staged) { draw(staged.value, staged.ts); staged = null; } };
      const onVis = () => { if (document.visibilityState === 'visible') flush(); };

      panelHasAccess('https://api.coingecko.com').then((ok) => {
        if (!alive) return;   // torn down before access resolved → install nothing (no leaked interval/fetch)
        if (!ok) {
          panel.render({ lines: [{ text: 'ypuf needs access to fetch prices.' }], foot });
          addGrantAffordance(ctx);
          return;
        }
        ctx.broker.load(source).then((r) => {
          if (r.value) draw(r.value, r.fetchedAt);   // stamp with WHEN it was fetched, not now
          else draw(null, null);
          if (r.refresh) r.refresh.then((v) => { if (v) draw(v, Date.now()); }).catch(() => {});
        }).catch(() => draw(null, null));
        timer = setInterval(() => {
          ctx.broker.refresh(source).then((v) => { if (v) staged = { value: v, ts: Date.now() }; }).catch(() => {});
        }, source.ttlMs);
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', flush);
      });

      return () => {
        alive = false;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('focus', flush);
        panel.destroy();
      };
    },
  });

  // --- Top sites panel ------------------------------------------------------
  // Most-visited sites via chrome.topSites — local, never transmitted. On-brand:
  // *measured* importance (most-visited), not *declared* organization (§9). Host-
  // rendered (first-party, like the ypuf panel); only http(s) sites are openable.

  registerPanelType('topsites', {
    label: 'Top sites',
    hint: 'most visited',
    addable: true,
    network: false,
    buildForm(form) {
      const note = document.createElement('p');
      note.className = 'muted add-hint';
      note.textContent = 'Your most-visited sites — local, never leaves your device.';
      form.appendChild(note);
      return () => ({});   // no config needed
    },
    mount(ctx) {
      const body = ctx.body;
      if (!chrome.topSites || !chrome.topSites.get) {
        body.textContent = 'Top sites is unavailable.';
        return;
      }
      let alive = true;   // a re-render before the async callback fires must not write into a torn-down panel
      chrome.topSites.get((sites) => {
        if (!alive || chrome.runtime.lastError) return;
        body.textContent = '';
        const list = document.createElement('div');
        list.className = 'topsites-list';
        for (const s of (sites || [])) {
          if (!isHttpUrl(s.url)) continue;               // never render a non-web scheme
          if (list.children.length >= 8) break;          // a calm glance, not a wall
          const a = document.createElement('a');
          a.className = 'topsite';
          a.href = s.url;
          const ico = document.createElement('img');
          ico.className = 'topsite-ico';
          ico.alt = '';
          ico.src = faviconUrl(s.url);
          ico.addEventListener('error', () => ico.remove()); // drop a broken favicon quietly
          const name = document.createElement('span');
          name.className = 'topsite-name';
          name.textContent = s.title || hostOfUrl(s.url); // page-derived → textContent, inert
          a.append(ico, name);
          list.appendChild(a);
        }
        if (!list.children.length) {
          const p = document.createElement('p');
          p.className = 'muted';
          p.textContent = 'No top sites yet — browse a little.';
          body.appendChild(p);
        } else {
          body.appendChild(list);
        }
      });
      return () => { alive = false; };
    },
  });

  loadAndRender();
})();
