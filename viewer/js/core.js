/* Run viewer: shared helpers, saved settings, theme and colours.
   Every script adds to the one global, RV. Classic scripts (no ES modules) so the page also opens from disk. */
(function () {
  'use strict';
  const RV = (globalThis.RV = globalThis.RV || {});

  RV.DEFAULT_LINK = 'https://github.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE/tree/experimental_hosting';
  /* the bundled track file, as published in the site's repository: used when the page is opened from disk */
  RV.TRACK_URL = 'https://raw.githubusercontent.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE/experimental_hosting/viewer/tracks/corkscrew.xml';
  RV.MAX_RUNS = 6;                       /* runs that can be shown together: one colour each */

  /* ---------- small helpers ---------- */
  RV.$ = id => document.getElementById(id);
  RV.el = function (tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  RV.esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  RV.clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  RV.sgn = (x, d) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);
  /* lap time the way the project writes it: m:ss:cc */
  RV.fmtLap = function (s) {
    if (s == null) return 'no lap';
    const m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2).replace('.', ':');
  };
  RV.fmtInt = n => Math.round(n).toLocaleString('en-US');
  /* last index whose value is <= v, in an ascending array */
  RV.bsearch = function (arr, v) {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; }
    return lo;
  };

  /* An error with a code the page can react to and a hint for the reader. */
  RV.RVError = class RVError extends Error {
    constructor(code, message, hint) { super(message); this.code = code; this.hint = hint || ''; }
  };

  /* ---------- saved settings ---------- */
  const KEY = 'rv_prefs';
  const DEFAULTS = () => ({
    theme: 'system',                                   /* light | dark | system */
    view: 'basic',                                     /* basic | detailed */
    source: { kind: 'github', link: RV.DEFAULT_LINK }, /* a local folder cannot be saved: browsers do not keep folder access */
    speed: 1,                                          /* replay speed */
    autoplay: true,                                    /* start the replay when a run opens */
    tutorialDone: false,                               /* the welcome and tour have been seen (or skipped) */
    sync: 't',                                         /* compared cars placed at the same lap time (t) or distance (d) */
    camera: 'fit',                                     /* the camera when a run opens: fit (whole track) | follow | up (follow, car points up) */
    smooth: true,                                      /* smooth motion between steps at 1x and slower */
    loopDim: 0.55,                                     /* how dark the map outside a looped section is, 0 to 0.9 */
    carSize: 1,                                        /* size of every car that has no size of its own (1 = true scale) */
    apiKeys: {},                                       /* the reader's own keys for outside services, by service id (js/keys.js) */
    uid: '',                                           /* this browser's id: random, made on the first visit, sent nowhere */
    keys: {},                                          /* replay keys the reader changed: action id to key (see RV.KEYS) */
    ui: {},                                            /* what was last chosen on the pages: layers, panels, lists, tabs */
  });
  /* a random id (UUID, version 4); crypto.randomUUID needs a secure page, so a page opened from disk makes its own */
  function newId() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* not available here */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  let fresh = false;                                     /* the id was made on this visit and is not stored yet */
  RV.loadPrefs = function () {
    const p = DEFAULTS();
    try { Object.assign(p, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked: defaults */ }
    if (!p.source || p.source.kind !== 'github' || !p.source.link) p.source = DEFAULTS().source;
    if (!p.keys || typeof p.keys !== 'object') p.keys = {};
    if (!p.ui || typeof p.ui !== 'object') p.ui = {};
    if (!p.apiKeys || typeof p.apiKeys !== 'object') p.apiKeys = {};
    if (!['fit', 'follow', 'up'].includes(p.camera)) p.camera = 'fit';
    if (!(p.loopDim >= 0 && p.loopDim <= 0.9)) p.loopDim = 0.55;
    if (!(p.carSize >= 0.3 && p.carSize <= 4)) p.carSize = 1;
    if (!p.uid) { p.uid = newId(); fresh = true; }
    return p;
  };
  RV.savePrefs = function () { try { localStorage.setItem(KEY, JSON.stringify(RV.prefs)); } catch (e) { /* not saved */ } };
  /* everything back to its default, except the id (it stays the same browser) and the reader's keys (they are not settings) */
  RV.resetPrefs = function () { const uid = RV.prefs.uid, keys = RV.prefs.apiKeys; RV.prefs = DEFAULTS(); RV.prefs.uid = uid; RV.prefs.apiKeys = keys; RV.savePrefs(); };
  RV.prefs = RV.loadPrefs();
  if (fresh) RV.savePrefs();
  /* What was last chosen on the pages (RV.prefs.ui). Written a moment after the last change, so a slider being
     dragged does not write on every step. */
  let uiTimer = null;
  RV.uiGet = (k, dflt) => (RV.prefs.ui[k] === undefined ? dflt : RV.prefs.ui[k]);
  RV.uiSet = function (k, v) { RV.prefs.ui[k] = v; clearTimeout(uiTimer); uiTimer = setTimeout(RV.savePrefs, 250); };

  /* ---------- replay keys ----------
     The actions of the Track and Telemetry pages and their default keys. A key the reader changed is in
     RV.prefs.keys. Letters are compared without regard to case. */
  RV.KEYS = [
    { id: 'play', label: 'Play or pause', def: ' ' },
    { id: 'fwd', label: 'One step forward; hold for slow motion', def: 'ArrowRight' },
    { id: 'back', label: 'One step back; hold for slow motion backwards', def: 'ArrowLeft' },
    { id: 'home', label: 'Back to the start of the lap', def: 'Home' },
    { id: 'endloop', label: 'End the loop over a section', def: 'Escape' },
    { id: 'zoomin', label: 'Zoom the map in', def: '+' },
    { id: 'zoomout', label: 'Zoom the map out', def: '-' },
    { id: 'follow', label: 'Follow the car, or stop following', def: 'f' },
  ];
  RV.normKey = k => (k.length === 1 ? k.toLowerCase() : k);
  RV.keyOf = id => RV.prefs.keys[id] || RV.KEYS.find(a => a.id === id).def;
  /* the action a key press stands for, or null; = counts as + (the same key without Shift) unless = is a key itself */
  RV.keyAction = function (e) {
    const hit = k => RV.KEYS.find(a => RV.normKey(RV.keyOf(a.id)) === k), k = RV.normKey(e.key);
    const a = hit(k) || (k === '=' ? hit('+') : null);
    return a ? a.id : null;
  };
  RV.keyLabel = k => ({ ' ': 'Space', ArrowRight: '\u2192', ArrowLeft: '\u2190', ArrowUp: '\u2191', ArrowDown: '\u2193', Escape: 'Esc', '-': '\u2212' }[k] || (k.length === 1 ? k.toUpperCase() : k));
  RV.kbd = id => '<kbd>' + RV.esc(RV.keyLabel(RV.keyOf(id))) + '</kbd>';

  /* ---------- theme ---------- */
  RV.pal = {};
  RV.themeNow = function () {
    if (RV.prefs.theme === 'light' || RV.prefs.theme === 'dark') return RV.prefs.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  /* The canvases cannot use CSS variables directly, so the tokens are read into RV.pal once per theme change. */
  RV.applyTheme = function () {
    document.documentElement.dataset.theme = RV.themeNow();
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    const P = RV.pal;
    for (const k of ['bg', 'surface', 'surface-2', 'ink', 'ink-2', 'mute', 'line', 'grid', 'accent', 'best', 'kept', 'faster', 'slower', 'v-best', 'v-kept', 'v-rej',
      'map-bg', 'map-grid', 'map-ink', 'road', 'road-edge', 'road-mark', 'tyre', 'car-line',
      'speed-slow', 'speed-mid', 'speed-fast', 'brake-none', 'brake-full']) P[k] = v('--' + k);
    P['warn'] = v('--warn-ink');
    P.run = []; P.runMap = [];
    for (let k = 1; k <= RV.MAX_RUNS; k++) { P.run.push(v('--run-' + k)); P.runMap.push(v('--runmap-' + k)); }
    P.font = v('--font-ui'); P.fontNum = v('--font-display');
    if (RV.onTheme) RV.onTheme();
  };

  /* ---------- colour scales (the road is dark in both themes, so one scale serves both) ----------
     Speed goes red, orange, yellow, light green, green (slow to fast), bright enough to read on the dark road;
     beam length goes pink, yellow, cyan (close to far). Both also get lighter along the way. */
  function ramp(stops) {
    return function (f) {
      f = RV.clamp(f, 0, 1) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(f)), u = f - k, a = stops[k], b = stops[k + 1];
      return [0, 1, 2].map(n => Math.round(a[n] + (b[n] - a[n]) * u));
    };
  }
  const SPEED = [[255, 64, 56], [255, 140, 44], [255, 222, 60], [150, 226, 84], [44, 214, 110]];
  const BEAM = [[255, 70, 118], [255, 208, 66], [60, 226, 210]];
  const speedRGB = ramp(SPEED), beamRGB = ramp(BEAM);
  RV.speedCol = f => 'rgb(' + speedRGB(f).join(',') + ')';
  RV.beamCol = (d, a) => 'rgba(' + beamRGB(d / 200).join(',') + ',' + a + ')';
  /* Scales whose colours are theme tokens: the speed chart (red slow, green fast) and braking on the map
     (blue none, red full). f runs from 0 to 1. */
  function hexRGB(c) {
    c = (c || '').trim();
    /* browsers normalise CSS custom-property values to rgb(...) — handle both formats */
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(c);
    if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
    c = c.replace('#', '');
    if (c.length === 3) c = c.split('').map(h => h + h).join('');
    return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16));
  }
  const tokenRamp = (names, f) => 'rgb(' + ramp(names.map(n => hexRGB(RV.pal[n])))(f).join(',') + ')';
  RV.speedChartCol = f => tokenRamp(['speed-slow', 'speed-mid', 'speed-fast'], f);
  RV.brakeCol = f => tokenRamp(['brake-none', 'brake-full'], f);

  /* ---------- shared red/green color-scale utility ----------
     RV.colorScale(value, min, max, direction)
       direction  1 = high is green (throttle, speed)
                 -1 = low is green (brake, lap delta where negative = faster)
     Returns a CSS rgb() string.

     RV.deltaColor(delta)
       delta < 0 = faster (solid green), delta > 0 = slower (solid red), within 5 ms of 0 = null (no colour).

     RV.gearColor(gear)
       Returns a CSS rgb() colour for gears -1 through 6.
  */
  const GREEN_RGB = [14, 159, 79];    /* --in-throttle light */
  const RED_RGB   = [217, 45, 32];    /* --in-brake light */
  function lerpRGB(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  RV.colorScale = function (value, min, max, direction) {
    const f = RV.clamp((value - min) / (max - min || 1), 0, 1);
    const t = direction >= 0 ? f : 1 - f;             /* t=1 → green, t=0 → red */
    const rgb = lerpRGB(RED_RGB, GREEN_RGB, t);
    return 'rgb(' + rgb.join(',') + ')';
  };
  RV.deltaColor = function (delta) {
    /* solid green = faster, solid red = slower, null = dead even (within 5 ms) → transparent */
    if (Math.abs(delta) < 0.005) return null;
    return 'rgb(' + (delta < 0 ? GREEN_RGB : RED_RGB).join(',') + ')';
  };
  /* Sequential palette for gears: -1 (reverse) through 6 */
  const GEAR_COLORS = [
    [140, 100, 200],   /* -1: reverse — purple */
    [100, 120, 200],   /* 0:  neutral — blue-grey */
    [44,  150, 220],   /* 1 */
    [50,  190, 170],   /* 2 */
    [80,  190, 80],    /* 3 */
    [200, 185, 50],    /* 4 */
    [220, 130, 40],    /* 5 */
    [210, 60,  50],    /* 6 */
  ];
  RV.gearColor = function (gear) {
    const k = RV.clamp(gear + 1, 0, GEAR_COLORS.length - 1);
    return 'rgb(' + GEAR_COLORS[k].join(',') + ')';
  };
  /* the name TORCS, with its explanation on hover */
  RV.TORCS = '<abbr title="The Open Racing Car Simulator \u2014 the physics engine used to train the driver">TORCS</abbr>';
  const css = stops => 'linear-gradient(90deg,' + stops.map(s => 'rgb(' + s.join(',') + ')').join(',') + ')';
  RV.speedGradient = css(SPEED);
  RV.beamGradient = css(BEAM);

  /* ---------- messages ---------- */
  let toastTimer = null;
  RV.toast = function (msg, kind) {
    const t = RV.$('toast');
    t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, kind === 'err' ? 7000 : 3200);
  };
  /* Message and hint of any error, for showing to the reader. */
  RV.explain = function (e) {
    if (e instanceof RV.RVError) return { msg: e.message, hint: e.hint };
    return { msg: 'Something went wrong: ' + (e && e.message ? e.message : e), hint: '' };
  };
})();
