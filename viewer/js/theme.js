/* Run viewer: customization. Every colour of the site is a CSS token, and every token is in one list here
   (TOKENS), so the Advanced mode of the Customization tab covers all of them. The Basic mode is a set of shortcuts
   (GROUPS): one colour that sets several tokens at once. A custom theme is a base (light or dark) plus the tokens
   the reader changed; themes are kept with the other settings, under the viewer ID (RV.prefs.themes).

   A new colour in the site: define its token in css/app.css, add it to TOKENS, and use var(--token) in CSS or
   RV.pal[token] on a canvas. Nothing else is needed for it to be themeable. */
(function () {
  'use strict';
  const RV = globalThis.RV, esc = RV.esc, $ = RV.$;

  const TABS = [['ui', 'Menus and UI'], ['map', 'Track map'], ['over', 'Overlays and panels'], ['tele', 'Telemetry and scales'], ['cars', 'Cars']];
  const T = (id, label, tab) => ({ id: id, label: label, tab: tab });
  const TOKENS = [
    T('bg', 'Page background', 'ui'), T('surface', 'Cards, bars and panels', 'ui'), T('surface-2', 'Wells and hovered controls', 'ui'),
    T('ink', 'Headings and numbers', 'ui'), T('ink-2', 'Body text', 'ui'), T('mute', 'Captions and notes', 'ui'), T('line', 'Borders', 'ui'),
    T('accent', 'Primary buttons and the open tab', 'ui'), T('accent-ink', 'Text on primary buttons', 'ui'), T('accent-soft', 'Soft accent (the loading bar)', 'ui'),
    T('focus', 'Keyboard focus ring', 'ui'), T('sel', 'Selected table row', 'ui'), T('kept', 'Kept badge', 'ui'),
    T('warn-ink', 'Warnings: text', 'ui'), T('warn-bg', 'Warnings: background', 'ui'), T('ok-bg', 'Success message background', 'ui'),
    T('bad-bg', 'Failure message background', 'ui'), T('err', 'Error message', 'ui'), T('scrim', 'Shade behind dialogs', 'ui'),
    T('win-close', 'Panel window button: close', 'over'), T('win-fold', 'Panel window button: fold', 'over'), T('win-home', 'Panel window button: back to its place', 'over'), T('win-one', 'Panel window button: only the car in focus', 'over'),

    T('map-bg', 'Map background', 'map'), T('map-ink', 'Distance labels', 'map'), T('road', 'Road surface', 'map'), T('road-edge', 'Track edges and finish line', 'map'),
    T('road-mark', 'Road markings and car details', 'map'), T('grass', '3D: grass beside the road', 'map'), T('sand', '3D: sand traps', 'map'), T('kerb', '3D: kerbs, first colour', 'map'), T('kerb-2', '3D: kerbs, second colour', 'map'), T('wall', '3D: walls and fences', 'map'), T('best', 'Sector lines and the slowest-corner pin', 'map'), T('tyre', 'Tyres and the steering wheel', 'map'),
    T('car-line', 'Car outline', 'map'), T('helmet', 'Driver’s helmet', 'map'), T('label-bg', 'Speed label: background', 'map'), T('label-ink', 'Speed label: text', 'map'),

    T('sp-1', 'Driven line by speed: slowest', 'over'), T('sp-2', 'Driven line by speed: slow', 'over'), T('sp-3', 'Driven line by speed: middle', 'over'),
    T('sp-4', 'Driven line by speed: fast', 'over'), T('sp-5', 'Driven line by speed: fastest', 'over'),
    T('brake-none', 'Driven line by brake: none', 'over'), T('brake-full', 'Driven line by brake: full', 'over'),
    T('beam-near', 'Sensor beams: edge close', 'over'), T('beam-mid', 'Sensor beams: middle', 'over'), T('beam-far', 'Sensor beams: edge far', 'over'),
    T('panel-bg', 'Sector table and delta bar: background', 'over'), T('panel-ink', 'Sector table and delta bar: text', 'over'), T('panel-live', 'Sector table: the running time', 'over'),

    T('grid', 'Chart grid', 'tele'), T('scale-bad', 'Scales and deltas: slow, slower, worst', 'tele'), T('scale-good', 'Scales and deltas: fast, faster, best', 'tele'),
    T('faster', 'Time gained (text)', 'tele'), T('slower', 'Time lost (text)', 'tele'),
    T('in-throttle', 'Throttle (bar and graph)', 'tele'), T('in-brake', 'Brake (bar and graph)', 'tele'), T('in-clutch', 'Clutch (graph)', 'tele'),
    T('health-ok', 'Sector health and problem areas: on pace', 'tele'), T('health-warn', 'Sector health and problem areas: needs some work', 'tele'), T('health-bad', 'Sector health and problem areas: needs work', 'tele'),
    T('v-best', 'Lap-time chart: kept, new best lap', 'tele'), T('v-kept', 'Lap-time chart: kept', 'tele'), T('v-rej', 'Lap-time chart: rejected', 'tele'),
  ];
  for (let k = 1; k <= RV.MAX_RUNS; k++) TOKENS.push(T('run-' + k, 'Car ' + k + ': in lists and charts', 'cars'), T('runmap-' + k, 'Car ' + k + ': on the road', 'cars'));
  const TOK = {};
  TOKENS.forEach(t => { TOK[t.id] = t; });

  /* ---------- colour arithmetic ---------- */
  const probe = document.createElement('canvas').getContext('2d');
  /* any colour CSS understands, as #rrggbb or rgba(r, g, b, a); null if it is not a colour */
  function norm(v) {
    v = String(v || '').trim();
    if (!v) return null;
    probe.fillStyle = '#010203'; probe.fillStyle = v;
    const a = probe.fillStyle;
    probe.fillStyle = '#030201'; probe.fillStyle = v;
    return a === probe.fillStyle ? a : null;              /* an invalid value leaves the colour that was there */
  }
  function rgb(v) {
    v = norm(v) || '#000000';
    const m = /^rgba?\((\d+), (\d+), (\d+)/.exec(v);
    return m ? [+m[1], +m[2], +m[3]] : [1, 3, 5].map(i => parseInt(v.substr(i, 2), 16));
  }
  const hex = c => '#' + c.map(x => RV.clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((x, i) => x + (B[i] - x) * t)); };
  function toHsv(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
  }
  function fromHsv(h, s, v) {
    const f = n => { const k = (n + h / 60) % 6; return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))); };
    return hex([f(5), f(3), f(1)]);
  }
  const lum = c => { const a = rgb(c).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const isDark = c => lum(c) < 0.25;
  /* lighter (d > 0) or darker by a share of the way to white or black */
  const shade = (c, d) => mix(c, d > 0 ? '#ffffff' : '#000000', Math.abs(d));
  const onColour = c => (lum(c) > 0.45 ? '#14161b' : '#ffffff');      /* readable text on a colour */
  /* n colours from a to b, going round the colour wheel the short way (red to green passes yellow, not brown) */
  function ramp(a, b, n) {
    const A = toHsv(rgb(a)), B = toHsv(rgb(b));
    let dh = B[0] - A[0];
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    const out = [];
    for (let k = 0; k < n; k++) { const t = k / (n - 1); out.push(fromHsv((A[0] + dh * t + 360) % 360, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)); }
    return out;
  }

  /* ---------- Basic mode: one colour sets a group of tokens ----------
     from: the token whose colour the row shows. set(c, v): the tokens to write, for the chosen colour c; v(id) is
     the present value of any token. */
  const G = (id, label, tab, from, set) => ({ id: id, label: label, tab: tab, from: from, set: set });
  const GROUPS = [
    G('backgrounds', 'Backgrounds', 'ui', 'bg', c => ({ bg: c, surface: shade(c, isDark(c) ? 0.05 : 0.6), 'surface-2': shade(c, isDark(c) ? 0.1 : -0.05), sel: shade(c, isDark(c) ? 0.14 : -0.08), grid: shade(c, isDark(c) ? 0.09 : -0.06) })),
    G('text', 'Text', 'ui', 'ink', (c, v) => ({ ink: c, 'ink-2': mix(c, v('bg'), 0.22), mute: mix(c, v('bg'), 0.45) })),
    G('borders', 'Borders and lines', 'ui', 'line', (c, v) => ({ line: c, grid: mix(c, v('surface'), 0.45) })),
    G('buttons', 'Buttons and accents', 'ui', 'accent', (c, v) => ({ accent: c, 'accent-ink': onColour(c), 'accent-soft': mix(c, v('surface'), 0.82), focus: c })),
    G('warnings', 'Warnings', 'ui', 'warn-ink', (c, v) => ({ 'warn-ink': c, 'warn-bg': mix(c, v('surface'), 0.82) })),
    G('mapbg', 'Map background', 'map', 'map-bg', c => ({ 'map-bg': c, 'map-ink': onColour(c) === '#ffffff' ? '#c0c4ce' : '#2b2f38' })),
    G('road', 'Road', 'map', 'road', c => ({ road: c, tyre: shade(c, -0.7), 'car-line': shade(c, -0.55) })),
    G('markings', 'Track edges and markings', 'map', 'road-edge', (c, v) => ({ 'road-edge': c, 'road-mark': mix(c, v('road'), 0.4) })),
    G('highlight', 'Sector lines and pins', 'map', 'best', c => ({ best: c })),
    G('linelow', 'Driven line: slow end', 'over', 'sp-1', (c, v) => { const r = ramp(c, v('sp-5'), 5); return { 'sp-1': r[0], 'sp-2': r[1], 'sp-3': r[2], 'sp-4': r[3], 'sp-5': r[4] }; }),
    G('linehigh', 'Driven line: fast end', 'over', 'sp-5', (c, v) => { const r = ramp(v('sp-1'), c, 5); return { 'sp-1': r[0], 'sp-2': r[1], 'sp-3': r[2], 'sp-4': r[3], 'sp-5': r[4] }; }),
    G('beamlow', 'Sensor beams: close', 'over', 'beam-near', (c, v) => { const r = ramp(c, v('beam-far'), 3); return { 'beam-near': r[0], 'beam-mid': r[1], 'beam-far': r[2] }; }),
    G('beamhigh', 'Sensor beams: far', 'over', 'beam-far', (c, v) => { const r = ramp(v('beam-near'), c, 3); return { 'beam-near': r[0], 'beam-mid': r[1], 'beam-far': r[2] }; }),
    G('panels', 'Sector table and delta bar', 'over', 'panel-bg', c => ({ 'panel-bg': c, 'panel-ink': onColour(c), 'label-bg': c, 'label-ink': onColour(c) })),
    G('good', 'Good: fast, faster, throttle', 'tele', 'scale-good', (c, v) => ({ 'scale-good': c, faster: c, 'in-throttle': c, 'v-best': c, 'ok-bg': mix(c, v('surface'), 0.82) })),
    G('bad', 'Bad: slow, slower, brake', 'tele', 'scale-bad', (c, v) => ({ 'scale-bad': c, slower: c, 'in-brake': c, 'v-rej': c, 'brake-full': c, err: shade(c, -0.25), 'bad-bg': mix(c, v('surface'), 0.82) })),
    G('keptc', 'Kept versions', 'tele', 'v-kept', c => ({ 'v-kept': c, kept: c })),
    G('chartgrid', 'Chart grid', 'tele', 'grid', c => ({ grid: c })),
  ];
  for (let k = 1; k <= RV.MAX_RUNS; k++) GROUPS.push(G('car' + k, 'Car ' + k, 'cars', 'run-' + k, (c, v) => { const o = {}; o['run-' + k] = c; o['runmap-' + k] = isDark(v('bg')) ? c : shade(c, 0.3); return o; }));

  /* ---------- themes ---------- */
  const themes = () => RV.prefs.themes;
  const current = () => RV.customTheme();
  /* a token's colour now: the reader's, or the base theme's */
  const value = id => { const th = current(); return (th && th.colors[id]) || RV.baseVals[id] || ''; };
  let saveTimer = null, frame = 0;
  function changed() {                                    /* repaint once per frame, save a moment after the last change */
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; RV.applyTheme(); });
    clearTimeout(saveTimer); saveTimer = setTimeout(RV.savePrefs, 300);
  }
  function create(name, base, colors) {
    const names = themes().map(t => t.name);
    let n = name, k = 2;
    while (names.includes(n)) n = name + ' ' + k++;
    const th = { id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: n, base: base, colors: Object.assign({}, colors || {}) };
    themes().push(th); RV.prefs.theme = 'custom:' + th.id; RV.savePrefs();
    return th;
  }
  /* The theme that takes the reader's changes. A built-in theme cannot be changed: a copy is made the first time. */
  function editable() {
    const th = current();
    if (th) return th;
    const base = RV.themeNow(), made = create('My theme', base, {});
    RV.toast('The ' + (base === 'dark' ? 'Dark' : 'Light') + ' theme itself cannot be changed, so a copy was made: “' + made.name + '”. Your colours go there.');
    return made;
  }
  function setToken(id, v) { if (TOK[id]) { editable().colors[id] = v; changed(); } }
  function setGroup(gid, v) {
    const g = GROUPS.find(x => x.id === gid);
    if (!g) return;
    const th = editable(), out = g.set(v, value);
    for (const k in out) if (TOK[k]) th.colors[k] = out[k];
    changed();
  }
  function reset(ids) { const th = current(); if (!th) return; ids.forEach(id => { delete th.colors[id]; }); changed(); }
  function select(t) { RV.prefs.theme = t; RV.savePrefs(); RV.applyTheme(); }
  function remove(id) { RV.prefs.themes = themes().filter(t => t.id !== id); if (RV.prefs.theme === 'custom:' + id) RV.prefs.theme = 'system'; RV.savePrefs(); RV.applyTheme(); }

  /* ---------- the colour picker: swatches, a colour wheel, and a typed value ---------- */
  const SWATCHES = ['#ffffff', '#f3f1ea', '#d8d4c8', '#8d93a1', '#3f444e', '#14161b', '#000000', '#d92d20', '#ff5a4d', '#d63c00', '#ff7a3d', '#f2b72c', '#ffde3c', '#0e9f4f', '#35d07f',
    '#00796b', '#2fd3a0', '#3ce2d2', '#1565d8', '#5aa5ff', '#6a54d9', '#7a2ff0', '#b98cff', '#c22f74', '#ff6fa8'];
  let pick = null, target = null, hsv = [0, 0, 1], onPick = null;
  function drawWheel() {
    const cv = $('cpWheel'), x = cv.getContext('2d'), r = cv.width / 2;
    x.clearRect(0, 0, cv.width, cv.height);
    const con = x.createConicGradient(0, r, r);
    for (let k = 0; k <= 6; k++) con.addColorStop(k / 6, fromHsv(k * 60 % 360, 1, 1));
    x.fillStyle = con; x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.fill();
    const rad = x.createRadialGradient(r, r, 0, r, r, r - 1);
    rad.addColorStop(0, 'rgba(255,255,255,1)'); rad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rad; x.fill();
    x.fillStyle = 'rgba(0,0,0,' + (1 - hsv[2]) + ')'; x.fill();
    const a = hsv[0] * Math.PI / 180, px = r + Math.cos(a) * hsv[1] * (r - 1), py = r + Math.sin(a) * hsv[1] * (r - 1);
    x.beginPath(); x.arc(px, py, 6, 0, 7); x.strokeStyle = '#000'; x.lineWidth = 3; x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
  }
  function closePick() { if (!pick) return; pick.remove(); pick = null; target = null; removeEventListener('pointerdown', outside, true); removeEventListener('keydown', pickKey, true); }
  function outside(e) { if (pick && !pick.contains(e.target) && !(e.target.closest && e.target.closest('.cswatch'))) closePick(); }
  function pickKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePick(); } }
  /* shows the picker beside el, starting from colour; fn(colour) is called with every choice */
  function openPick(el, colour, fn) {
    closePick();
    onPick = fn;
    pick = RV.el('div', 'cpick', '<div class="cpsw" role="group" aria-label="Preset colours">' + SWATCHES.map(c => '<button style="background:' + c + '" data-c="' + c + '" title="' + c + '" aria-label="' + c + '"></button>').join('') + '</div>' +
      '<div class="cpwheel"><canvas id="cpWheel" width="176" height="176" aria-label="Colour wheel: the angle is the hue, the distance from the middle how strong the colour is"></canvas>' +
      '<label>Brightness<input type="range" id="cpVal" min="0" max="100" step="1"></label></div>' +
      '<label class="lbl" for="cpText">Value</label><div class="inrow"><input type="text" id="cpText" spellcheck="false" autocomplete="off"><span class="cpnow" id="cpNow"></span></div>' +
      '<p class="note">HEX (#1565d8), RGB (rgb(21, 101, 216)), HSL (hsl(215 82% 46%)) or a colour name. For see-through, rgba(13, 15, 20, 0.8).</p>' +
      '<div class="tour-acts"><button class="btn prim sm" id="cpDone">Done</button></div>');
    pick.setAttribute('role', 'dialog'); pick.setAttribute('aria-label', 'Choose a colour');
    document.body.appendChild(pick);
    const q = el.getBoundingClientRect(), w = pick.offsetWidth, h = pick.offsetHeight;
    /* to the left of the swatch if there is room, so the rows being changed stay in sight */
    pick.style.left = (q.left - w - 10 >= 8 ? q.left - w - 10 : RV.clamp(q.right + 10, 8, innerWidth - w - 8)) + 'px'; pick.style.top = RV.clamp(q.top - 40, 8, innerHeight - h - 8) + 'px';
    const show = (c, from) => {
      hsv = toHsv(rgb(c));
      if (from !== 'text') $('cpText').value = c;
      $('cpText').classList.remove('bad'); $('cpNow').style.background = c; $('cpVal').value = Math.round(hsv[2] * 100);
      drawWheel();
    };
    const choose = (c, from) => { show(c, from); onPick(c); };
    show(colour);
    pick.querySelectorAll('.cpsw button').forEach(b => { b.onclick = () => choose(b.dataset.c); });
    const cv = $('cpWheel');
    const at = e => {
      const r = cv.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s = RV.clamp(Math.hypot(dx, dy) / (r.width / 2 - 1), 0, 1);
      choose(fromHsv(h, s, Math.max(hsv[2], 0.05)));
    };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); at(e); });
    cv.addEventListener('pointermove', e => { if (e.buttons & 1) at(e); });
    $('cpVal').oninput = e => choose(fromHsv(hsv[0], hsv[1], +e.target.value / 100));
    $('cpText').oninput = e => { const c = norm(e.target.value); e.target.classList.toggle('bad', !c); if (c) choose(c, 'text'); };
    $('cpText').onkeydown = e => { if (e.key === 'Enter') closePick(); };
    $('cpDone').onclick = closePick;
    addEventListener('pointerdown', outside, true); addEventListener('keydown', pickKey, true);
    $('cpText').focus(); $('cpText').select();
  }

  /* The fourth choice beside Light, Dark and System: "Custom", a drop-down of the reader's own themes by name.
     However many there are, the row stays four wide. */
  function customSelect(id) {
    const th = current(), list = themes();
    return '<select id="' + id + '" class="thsel' + (th ? ' on' : '') + '" aria-label="Your own themes"' + (list.length ? '' : ' title="No themes of your own yet. Change a colour on the Customization tab and one is made."') + '>' +
      '<option value=""' + (th ? '' : ' selected') + ' disabled hidden>Custom</option>' +
      (list.length ? list.map(t => '<option value="custom:' + esc(t.id) + '"' + (th === t ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') : '<option value="" disabled>No themes of your own yet</option>') + '</select>';
  }

  /* ---------- previews ----------
     One card per theme with three small windows: the Versions page, the Track page and the Telemetry page, drawn
     with that theme's colours. A card takes its colours from the class th-light or th-dark (css/app.css gives
     those the whole set of tokens) plus the theme's own changes; the card of the theme in use has neither, so it
     shows the page's colours as they are and follows a colour while it is being changed. */
  let prevN = 0;
  function preview(sel, name, base, colors, on) {
    const n = ++prevN, style = on ? '' : Object.keys(colors || {}).filter(k => TOK[k]).map(k => '--' + k + ':' + colors[k]).join(';');
    const dot = (c, ring) => '<i style="' + (ring ? 'box-shadow:inset 0 0 0 2px var(--' + c + ')' : 'background:var(--' + c + ')') + '"></i>';
    return '<button class="thcard' + (on ? ' on' : ' th-' + base) + '" data-th="' + esc(sel) + '" style="' + esc(style) + '" aria-pressed="' + on + '" title="Use the theme ' + esc(name) + '">' +
      '<span class="thname">' + esc(name) + (on ? '<em>in use</em>' : '') + '</span><span class="thwins">' +
      /* Versions: the best-lap tile, the lap-time dots, two rows with a time difference, a button */
      '<span class="thwin tv"><b class="thero"></b><span class="tdots">' + dot('v-best') + dot('v-best') + dot('v-kept') + dot('v-rej', 1) + dot('v-best') + dot('v-rej') + dot('warn-ink') + '</span>' +
      '<span class="trow"><u></u><s style="background:var(--faster)"></s></span><span class="trow sel"><u></u><s style="background:var(--slower)"></s></span><span class="tbtn"></span><small>Versions</small></span>' +
      /* Track: the road, the driven line in the speed colours, the car, a dark panel */
      '<span class="thwin tm"><svg viewBox="0 0 120 70" aria-hidden="true"><defs><linearGradient id="thg' + n + '" x1="0" x2="1">' + [1, 2, 3, 4, 5].map((k, i) => '<stop offset="' + i * 25 + '%" style="stop-color:var(--sp-' + k + ')"/>').join('') + '</linearGradient></defs>' +
      '<path d="M14 54 C14 20 40 12 60 22 S92 44 106 18" fill="none" style="stroke:var(--road-edge)" stroke-width="11" stroke-linecap="round"/>' +
      '<path d="M14 54 C14 20 40 12 60 22 S92 44 106 18" fill="none" style="stroke:var(--road)" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M14 54 C14 20 40 12 60 22 S92 44 96 30" fill="none" stroke="url(#thg' + n + ')" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M96 30 L112 8 M96 30 L116 22 M96 30 L104 4" fill="none" style="stroke:var(--beam-far)" stroke-width="0.9"/><circle cx="96" cy="30" r="3.4" style="fill:var(--runmap-1)"/>' +
      '<rect x="6" y="6" width="34" height="20" rx="3" style="fill:var(--panel-bg)"/><rect x="10" y="11" width="16" height="3" rx="1" style="fill:var(--panel-ink)"/><rect x="10" y="17" width="26" height="4" rx="1" style="fill:var(--scale-good)"/></svg><small>Track</small></span>' +
      /* Telemetry: a card with the grid, two cars' lines, the throttle and brake colours */
      '<span class="thwin tt"><svg viewBox="0 0 120 70" aria-hidden="true"><rect x="5" y="5" width="110" height="60" rx="4" style="fill:var(--surface);stroke:var(--line)"/>' +
      [20, 35, 50].map(y => '<path d="M10 ' + y + ' H110" style="stroke:var(--grid)" stroke-width="1"/>').join('') +
      '<path d="M10 48 L26 22 L40 30 L54 14 L70 40 L86 20 L110 26" fill="none" style="stroke:var(--run-1)" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M10 50 L26 27 L40 34 L54 19 L70 44 L86 25 L110 30" fill="none" style="stroke:var(--run-2)" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<rect x="10" y="56" width="42" height="4" rx="2" style="fill:var(--in-throttle)"/><rect x="58" y="56" width="20" height="4" rx="2" style="fill:var(--in-brake)"/></svg><small>Telemetry</small></span>' +
      '</span></button>';
  }
  function previews() {
    const th = current(), P = RV.prefs, now = RV.themeNow();
    return '<div class="card"><div class="cardhead"><h3>Previews</h3><span class="note">Versions, Track and Telemetry in each theme. Click one to use it.</span></div><div class="thcards">' +
      preview('light', 'Light', 'light', null, !th && now === 'light') + preview('dark', 'Dark', 'dark', null, !th && now === 'dark') +
      themes().map(t => preview('custom:' + t.id, t.name, t.base === 'dark' ? 'dark' : 'light', t.colors, th === t)).join('') + '</div></div>';
  }

  /* ---------- the Customization tab ---------- */
  let host = null;
  const mode = () => RV.uiGet('custMode', 'basic'), tab = () => RV.uiGet('custTab', 'ui');
  function ui(box) {
    host = box;
    const th = current(), P = RV.prefs, adv = mode() === 'adv', rows = (adv ? TOKENS : GROUPS).filter(x => x.tab === tab());
    const pill = (v, label, on) => '<button data-th="' + esc(v) + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
    const row = x => {
      const id = adv ? x.id : x.from, val = value(id), own = th && (adv ? th.colors[x.id] != null : Object.keys(x.set(val, value)).some(k => th.colors[k] != null));
      return '<div class="crow" data-k="' + x.id + '"><button class="cswatch" style="background:' + esc(val) + '" aria-label="Change the colour of ' + esc(x.label) + '"></button>' +
        '<div class="cname"><b>' + esc(x.label) + '</b><small>' + (adv ? '--' + x.id : 'sets ' + Object.keys(x.set(val, value)).length + ' colour' + (Object.keys(x.set(val, value)).length === 1 ? '' : 's')) + '</small></div>' +
        '<code>' + esc(val) + '</code><button class="btn sm" data-reset="' + x.id + '"' + (own ? '' : ' disabled') + ' title="Back to the colour of the ' + (th ? th.base : RV.themeNow()) + ' theme">Reset</button></div>';
    };
    box.innerHTML = previews() + '<div class="setgrid custgrid"><div class="col"><div class="card"><div class="cardhead"><h3>Theme</h3><span class="note">Saved in this browser, under your viewer ID</span></div>' +
      '<div class="seg wrap" id="cThemes" role="group" aria-label="Theme">' + pill('light', 'Light', P.theme === 'light') + pill('dark', 'Dark', P.theme === 'dark') + pill('system', 'System', P.theme === 'system' || (!th && !['light', 'dark'].includes(P.theme))) +
      customSelect('cCustom') + '</div>' +
      (th ? '<label class="lbl" for="cName">Name of this theme</label><div class="inrow"><input type="text" id="cName" maxlength="40" value="' + esc(th.name) + '"></div>' +
          '<div class="field"><div><b>Starts from</b><p class="note">Every colour you have not changed comes from this theme.</p></div><div class="seg" id="cBase">' + ['light', 'dark'].map(b => '<button data-v="' + b + '" class="' + (th.base === b ? 'on' : '') + '" aria-pressed="' + (th.base === b) + '">' + (b === 'light' ? 'Light' : 'Dark') + '</button>').join('') + '</div></div>' +
          '<p class="note">' + Object.keys(th.colors).length + ' of ' + TOKENS.length + ' colours changed.</p>' : '<p class="note" style="margin-top:12px">Light, Dark and System cannot be changed themselves. Change any colour and a copy is made for you, or start one here.</p>') +
      '<div class="acts"><button class="btn" id="cNew">New theme from the colours now</button>' + (th ? '<button class="btn" id="cResetAll"' + (Object.keys(th.colors).length ? '' : ' disabled') + '>Reset every colour</button><button class="btn" id="cDel">Delete this theme</button>' : '') + '</div></div></div>' +
      '<div class="col"><div class="card"><div class="cardhead"><h3>Colours</h3><div class="seg" id="cMode" role="group" aria-label="How much to show">' +
      '<button data-v="basic" class="' + (adv ? '' : 'on') + '" aria-pressed="' + !adv + '">Basic</button><button data-v="adv" class="' + (adv ? 'on' : '') + '" aria-pressed="' + adv + '">Advanced</button></div></div>' +
      '<div class="seg wrap subtabs" id="cTabs" role="tablist">' + TABS.map(t => '<button role="tab" data-v="' + t[0] + '" class="' + (t[0] === tab() ? 'on' : '') + '" aria-selected="' + (t[0] === tab()) + '">' + t[1] + '</button>').join('') + '</div>' +
      '<p class="note">' + (adv ? 'Every colour of the site, one by one (' + TOKENS.length + ' in all). Click a swatch to change it.' : 'Each row changes several related colours at once. Advanced shows every one of them and lets you fine-tune.') + '</p>' +
      '<div class="crows">' + rows.map(row).join('') + '</div></div></div></div>';
    box.querySelectorAll('#cThemes button').forEach(b => { b.onclick = () => { closePick(); select(b.dataset.th); ui(box); }; });
    $('cCustom').onchange = e => { closePick(); select(e.target.value); ui(box); };
    box.querySelectorAll('.thcard').forEach(b => { b.onclick = () => { closePick(); select(b.dataset.th); ui(box); }; });
    box.querySelectorAll('#cMode button').forEach(b => { b.onclick = () => { closePick(); RV.uiSet('custMode', b.dataset.v); ui(box); }; });
    box.querySelectorAll('#cTabs button').forEach(b => { b.onclick = () => { closePick(); RV.uiSet('custTab', b.dataset.v); ui(box); }; });
    box.querySelectorAll('#cBase button').forEach(b => { b.onclick = () => { th.base = b.dataset.v; RV.savePrefs(); RV.applyTheme(); ui(box); }; });
    if ($('cName')) $('cName').onchange = e => { const n = e.target.value.trim(); if (n) { th.name = n; RV.savePrefs(); } ui(box); };
    $('cNew').onclick = () => { const all = {}; if (th) Object.assign(all, th.colors); create(th ? th.name + ' copy' : 'My theme', th ? th.base : RV.themeNow(), all); RV.applyTheme(); ui(box); const n = $('cName'); if (n) { n.focus(); n.select(); } };
    if ($('cResetAll')) $('cResetAll').onclick = () => { th.colors = {}; RV.savePrefs(); RV.applyTheme(); ui(box); };
    if ($('cDel')) $('cDel').onclick = () => { const name = th.name; remove(th.id); ui(box); RV.toast('The theme “' + name + '” was deleted.'); };
    box.querySelectorAll('[data-reset]').forEach(b => { b.onclick = () => { const x = (adv ? TOK[b.dataset.reset] : GROUPS.find(g => g.id === b.dataset.reset)); reset(adv ? [x.id] : Object.keys(x.set(value(x.from), value))); RV.applyTheme(); ui(box); }; });
    box.querySelectorAll('.crow').forEach(r => {
      const sw = r.querySelector('.cswatch'), key = r.dataset.k, x = adv ? TOK[key] : GROUPS.find(g => g.id === key);
      sw.onclick = () => {
        if (target === key) { closePick(); return; }
        openPick(sw, value(adv ? x.id : x.from), c => {
          const had = !!current();
          if (adv) setToken(x.id, c); else setGroup(x.id, c);
          if (!had) ui(box);                              /* a theme was just made for the change: the card beside has to show it */
          refreshRow(box, key, c);
        });
        target = key;
      };
    });
  }
  function refreshRow(box, key, c) {
    const r = box.querySelector('.crow[data-k="' + key + '"]');
    if (r) { r.querySelector('.cswatch').style.background = c; r.querySelector('code').textContent = c; r.querySelector('[data-reset]').disabled = false; }
  }

  RV.theme = { TABS: TABS, TOKENS: TOKENS, GROUPS: GROUPS, norm: norm, value: value, current: current, create: create, remove: remove, select: select,
    setToken: setToken, setGroup: setGroup, reset: reset, ui: ui, customSelect: customSelect, closePick: closePick, ramp: ramp, mix: mix };
})();
