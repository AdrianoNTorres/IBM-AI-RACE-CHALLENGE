/* Run viewer: the Track page in 3D. A switch over the map (2D | 3D) shows the same replay on the track with its
   hills and banking (js/track.js builds both from the track file). Drawn with Three.js, which is kept in
   viewer/vendor/ and loaded only when 3D is first switched on; the 2D map does not depend on anything here.

   Three cameras: Orbit (the whole track, turned and zoomed with the mouse), Chase (behind the car) and Relative
   (anywhere the reader puts it, as an offset from the car). Colours are the theme's own tokens (RV.pal), so the
   3D track looks like the 2D one. The world is in metres: x and y as on the 2D map, z up. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$;
  const DEF = { on: false, cam: 'orbit', k: 1, rel: [-9, 0, 3.5], look: true, centre: false };
  const st = Object.assign({}, DEF, RV.uiGet('v3', {}));
  st.rel = (st.rel || DEF.rel).slice(0, 3);
  st.on = false;                                           /* a page always opens in 2D: 3D is asked for */
  const CAMS = [['orbit', 'Orbit', 'The whole track. Drag to turn it, wheel to zoom, Shift-drag to move, double-click to start again.'],
    ['chase', 'Chase', 'Behind and above the car, following it. The wheel moves the camera closer or further.'],
    ['rel', 'Relative', 'Anywhere you put it, measured from the car: ahead or behind, left or right, and how high.']];

  let T = null, ren = null, scene = null, cam = null, cv = null, bar = null, wrap = null;
  let loading = false, ready = false, raf = 0, last = 0;
  let trackG = null, lineM = null, carsG = null, built = { trk: null, k: 0, theme: -1 }, lineOf = null, carKey = '';
  const orbit = { az: -1.9, el: 0.62, dist: 900, t: [0, 0, 0], set: false };
  let chaseDist = 1, eye = null, lastCam = '', focus = null;

  const save = () => RV.uiSet('v3', { cam: st.cam, k: st.k, rel: st.rel, look: st.look, centre: st.centre });
  const trkNow = () => (S.ds && S.ds.trk) || null;
  const col = (name, dflt) => new T.Color(RV.pal[name] || dflt);

  /* ---------- the world ---------- */
  /* a point of the road surface, `off` m left of the centre line at distance s, `lift` m above it */
  function surf(trk, s, off, lift) { const p = RV.track.point(trk, s, off); return [p[0], p[1], p[2] * st.k + (lift || 0)]; }
  /* a band between two lines of points that run side by side (the last point is the first again) */
  function band(a, b, colour, opts) {
    const n = a.length, pos = new Float32Array(n * 6), idx = [];
    for (let i = 0; i < n; i++) { pos.set(a[i], i * 6); pos.set(b[i], i * 6 + 3); }
    for (let i = 0; i < n - 1; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new T.Mesh(g, new T.MeshLambertMaterial(Object.assign({ color: colour, side: T.DoubleSide }, opts || {})));
  }
  function polyline(pts, colour) {
    const g = new T.BufferGeometry().setFromPoints(pts.map(p => new T.Vector3(p[0], p[1], p[2])));
    return new T.Line(g, new T.LineBasicMaterial({ color: colour }));
  }
  /* a line of text that always faces the camera */
  function label(text, at, size) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), f = '600 44px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    x.font = f; c.width = Math.ceil(x.measureText(text).width) + 28; c.height = 64;
    x.font = f; x.fillStyle = RV.pal['label-bg'] || 'rgba(20,22,27,.85)'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = RV.pal['label-ink'] || '#fff'; x.textBaseline = 'middle'; x.fillText(text, 14, 34);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(size * c.width / c.height, size, 1); sp.position.set(at[0], at[1], at[2]); sp.renderOrder = 5;
    return sp;
  }
  function clear(g) { if (!g) return; g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); scene.remove(g); }

  /* the road with its hills and banking, a verge on both sides, the slope down to the ground, the lines across */
  function buildTrack(trk) {
    clear(trackG); trackG = new T.Group();
    const n = trk.centre.length - 1, hw = trk.hw, VERGE = 9, ground = trk.zbox[0] * st.k - 2;
    const L = [], R = [], LV = [], RV_ = [], LS = [], RS = [], Le = [], Re = [];
    for (let i = 0; i <= n; i++) {
      const s = i < n ? trk.total * i / n : 0, p = RV.track.pose(trk, s), sn = Math.sin(p[2]), cs = Math.cos(p[2]);
      const l = surf(trk, s, hw), r = surf(trk, s, -hw), plan = off => [p[0] - off * sn, p[1] + off * cs];
      L.push(l); R.push(r); Le.push([l[0], l[1], l[2] + 0.06]); Re.push([r[0], r[1], r[2] + 0.06]);
      const a = plan(hw + VERGE), b = plan(-hw - VERGE);
      LV.push([a[0], a[1], l[2] - 0.25]); RV_.push([b[0], b[1], r[2] - 0.25]);
      const a2 = plan(hw + VERGE + Math.max(2, (l[2] - ground) * 1.8)), b2 = plan(-hw - VERGE - Math.max(2, (r[2] - ground) * 1.8));
      LS.push([a2[0], a2[1], ground]); RS.push([b2[0], b2[1], ground]);
    }
    const bg = col('map-bg', '#e9e4d8'), road = col('road', '#2b2f36'), verge = bg.clone().lerp(road, 0.22), slope = bg.clone().lerp(road, 0.1);
    trackG.add(band(L, R, road));
    trackG.add(band(LV, L, verge)); trackG.add(band(R, RV_, verge));
    trackG.add(band(LS, LV, slope)); trackG.add(band(RV_, RS, slope));
    trackG.add(polyline(Le, col('road-edge', '#ffffff'))); trackG.add(polyline(Re, col('road-edge', '#ffffff')));
    const b = trk.box, w = b[1] - b[0], h = b[3] - b[2];
    const plane = new T.Mesh(new T.PlaneGeometry(w + 1600, h + 1600), new T.MeshLambertMaterial({ color: bg }));
    plane.position.set((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, ground - 0.05); trackG.add(plane);
    /* the lines across the road: start and finish, and where the timing sectors begin */
    const across = (s, colour, lift) => polyline([surf(trk, s, hw, lift), surf(trk, s, -hw, lift)], colour);
    trackG.add(across(0, col('road-mark', '#ffffff'), 0.08)); trackG.add(across(0.6, col('road-mark', '#ffffff'), 0.08));
    trackG.add(label('Start / finish', surf(trk, 0, hw + 6, 5), 5));
    (trk.sectors.cuts || []).forEach((d, k) => { trackG.add(across(d, col('sector', RV.pal.accent || '#7a4cc0'), 0.08)); trackG.add(label('S' + (k + 2) + ' starts', surf(trk, d, hw + 6, 5), 4.5)); });
    for (let m = 500; m < trk.total - 100; m += 500) trackG.add(label(RV.fmtInt(m) + ' m', surf(trk, m, -hw - 6, 4), 4));
    scene.add(trackG);
    scene.background = bg;
    built = { trk: trk, k: st.k, theme: RV.themeRev };
    if (!orbit.set) { orbit.t = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (trk.zbox[0] + trk.zbox[1]) / 2 * st.k]; orbit.dist = Math.max(w, h) * 0.95; orbit.set = true; }
    lineOf = null; carKey = '';
  }

  /* where the car in focus drove, as a strip on the road, red where it was slowest and green where it was fastest */
  function buildLine(trk, r) {
    clear(lineM); lineM = null; lineOf = r;
    if (!r || !r.x) return;
    const hw = trk.hw, W = 0.2, pos = [], cols = [], idx = [];
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < r.n; i++) { if (r.v[i] < lo) lo = r.v[i]; if (r.v[i] > hi) hi = r.v[i]; }
    const c = new T.Color();
    let m = 0;
    for (let i = 0; i < r.n; i += 2) {
      const off = r.tp[i] * hw, a = surf(trk, r.s[i], off + W, 0.09), b = surf(trk, r.s[i], off - W, 0.09);
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      c.set(RV.speedCol(hi > lo ? (r.v[i] - lo) / (hi - lo) : 1)); cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (m > 0 && Math.abs(r.s[i] - r.s[i - 2]) < 60) { const q = (m - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }   /* no strip across the start line */
      m++;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); g.setIndex(idx);
    lineM = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }));
    scene.add(lineM);
  }

  /* car1-ow1 in a few blocks: tub, nose, side pods, wings and four wheels; x forward, 4.6 m long, 2 m wide */
  function buildCar(colour, ghost) {
    const g = new T.Group(), body = new T.MeshLambertMaterial({ color: colour, transparent: ghost, opacity: ghost ? 0.82 : 1 });
    const dark = new T.MeshLambertMaterial({ color: 0x15171c, transparent: ghost, opacity: ghost ? 0.82 : 1 });
    const box = (lx, ly, lz, x, y, z, mat) => { const m = new T.Mesh(new T.BoxGeometry(lx, ly, lz), mat); m.position.set(x, y, z); g.add(m); };
    box(2.6, 0.7, 0.42, -0.2, 0, 0.38, body);            /* tub */
    box(1.7, 0.36, 0.26, 1.7, 0, 0.3, body);             /* nose */
    box(1.3, 0.42, 0.36, -0.5, 0.56, 0.34, body); box(1.3, 0.42, 0.36, -0.5, -0.56, 0.34, body);   /* side pods */
    box(0.5, 0.36, 0.34, -0.55, 0, 0.74, dark);          /* the driver's head and the air box */
    box(0.36, 1.86, 0.06, 2.35, 0, 0.16, body);          /* front wing */
    box(0.42, 1.5, 0.08, -2.05, 0, 0.92, body); box(0.3, 0.06, 0.5, -2.05, 0.72, 0.7, body); box(0.3, 0.06, 0.5, -2.05, -0.72, 0.7, body);   /* rear wing */
    for (const [x, y] of [[1.55, 0.86], [1.55, -0.86], [-1.55, 0.86], [-1.55, -0.86]]) {
      const w = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.34, 18), dark); w.position.set(x, y, 0.33); g.add(w);   /* a cylinder's axis is y: across the car */
    }
    return g;
  }
  function buildCars(cars) {
    clear(carsG); carsG = new T.Group();
    cars.forEach((c, k) => { const g = buildCar(new T.Color(RV.col(c.id) || RV.pal.accent || '#d63c00'), k > 0); g.userData.id = c.id; carsG.add(g); });
    scene.add(carsG);
  }

  /* where a car is in space and which way it faces: its position, forward, left and up, on the road it stands on */
  function frameOf(trk, c) {
    const r = c.r, k = c.k, hw = trk.hw;
    let s = r.s[k], tp = r.tp[k];
    if (c.f > 0 && k < r.n - 1 && Math.abs(r.s[k + 1] - s) < 60) { s += (r.s[k + 1] - s) * c.f; tp += (r.tp[k + 1] - tp) * c.f; }
    const off = RV.clamp(tp, -1.6, 1.6) * hw, here = surf(trk, s, off);
    const a0 = surf(trk, s - 1, off), a1 = surf(trk, s + 1, off), l0 = surf(trk, s, off - 1), l1 = surf(trk, s, off + 1);
    const along = new T.Vector3(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]), across = new T.Vector3(l1[0] - l0[0], l1[1] - l0[1], l1[2] - l0[2]);
    const up = new T.Vector3().crossVectors(along, across).normalize();
    if (up.z < 0) up.negate();
    const flat = new T.Vector3(Math.cos(c.p[2]), Math.sin(c.p[2]), 0);
    const fwd = flat.sub(up.clone().multiplyScalar(flat.dot(up))).normalize(), left = new T.Vector3().crossVectors(up, fwd);
    return { pos: new T.Vector3(c.p[0], c.p[1], here[2]), fwd: fwd, left: left, up: up };
  }

  /* ---------- the cameras ---------- */
  function aim(dt, F) {
    const snap = lastCam !== st.cam; lastCam = st.cam;
    if (st.cam === 'orbit' || !F) {
      if (st.centre && F) orbit.t = [F.pos.x, F.pos.y, F.pos.z];
      const ce = Math.cos(orbit.el);
      cam.position.set(orbit.t[0] + orbit.dist * ce * Math.cos(orbit.az), orbit.t[1] + orbit.dist * ce * Math.sin(orbit.az), orbit.t[2] + orbit.dist * Math.sin(orbit.el));
      cam.lookAt(orbit.t[0], orbit.t[1], orbit.t[2]); eye = null;
      return;
    }
    const zUp = new T.Vector3(0, 0, 1);
    let want, look;
    if (st.cam === 'chase') {
      want = F.pos.clone().addScaledVector(F.fwd, -11 * chaseDist).addScaledVector(zUp, 4.4 * chaseDist);
      look = F.pos.clone().addScaledVector(F.fwd, 5).addScaledVector(zUp, 1);
    } else {                                               /* relative: the reader's offset, in the car's own directions */
      want = F.pos.clone().addScaledVector(F.fwd, st.rel[0]).addScaledVector(F.left, st.rel[1]).addScaledVector(F.up, st.rel[2]);
      look = st.look ? F.pos.clone().addScaledVector(zUp, 0.6) : want.clone().addScaledVector(F.fwd, 30);
    }
    /* the chase camera trails a little, so the car is seen to turn; the relative one is fixed to the car */
    if (!eye || snap || st.cam === 'rel') eye = want; else eye.lerp(want, 1 - Math.exp(-dt * 7));
    cam.position.copy(eye); cam.lookAt(look);
  }
  function resetOrbit() { orbit.set = false; orbit.az = -1.9; orbit.el = 0.62; const t = trkNow(); if (t) { const b = t.box; orbit.t = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (t.zbox[0] + t.zbox[1]) / 2 * st.k]; orbit.dist = Math.max(b[1] - b[0], b[3] - b[2]) * 0.95; orbit.set = true; } }
  function pointers() {
    let d = null;
    cv.addEventListener('pointerdown', e => { d = [e.clientX, e.clientY, e.shiftKey || e.button === 2]; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); });
    cv.addEventListener('pointermove', e => {
      if (!d || st.cam !== 'orbit') return;
      const dx = e.clientX - d[0], dy = e.clientY - d[1]; d[0] = e.clientX; d[1] = e.clientY;
      if (d[2]) {                                          /* move the point the camera turns about, along the ground */
        const k = orbit.dist * 0.0016, sa = Math.sin(orbit.az), ca = Math.cos(orbit.az);
        orbit.t[0] += (sa * dx + ca * dy) * k; orbit.t[1] += (-ca * dx + sa * dy) * k; st.centre = false; paintBar();
      } else { orbit.az -= dx * 0.006; orbit.el = RV.clamp(orbit.el + dy * 0.006, 0.05, 1.53); }
    });
    const up = () => { d = null; cv.classList.remove('drag'); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const k = Math.exp(e.deltaY * 0.0012);
      if (st.cam === 'orbit') orbit.dist = RV.clamp(orbit.dist * k, 12, 6000); else if (st.cam === 'chase') chaseDist = RV.clamp(chaseDist * k, 0.35, 8);
    }, { passive: false });
    cv.addEventListener('dblclick', () => { if (st.cam === 'orbit') { st.centre = false; resetOrbit(); paintBar(); } else chaseDist = 1; });
  }

  /* ---------- every frame ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!st.on || !ready || S.tab !== 'pm') return;
    const trk = trkNow(), dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
    if (!trk || !S.R || !S.R.x) return;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * ren.getPixelRatio()) || cv.height !== Math.round(H * ren.getPixelRatio())) { ren.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix(); }
    if (built.trk !== trk || built.k !== st.k || built.theme !== RV.themeRev) buildTrack(trk);
    if (lineOf !== S.R) buildLine(trk, S.R);
    const cars = RV.map.cars3(), key = cars.map(c => c.id + RV.col(c.id)).join('|');
    if (key !== carKey) { buildCars(cars); carKey = key; }
    focus = null;
    cars.forEach((c, k) => {
      const F = frameOf(trk, c), g = carsG.children[k];
      if (!g) return;
      g.position.copy(F.pos);
      g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(F.fwd, F.left, F.up));
      if (k === 0) focus = F;
    });
    aim(dt, focus);
    ren.render(scene, cam);
  }

  /* ---------- the controls over the map ---------- */
  const seg = (items, cur, name) => '<div class="seg" role="group" aria-label="' + name + '">' + items.map(i => '<button data-v="' + i[0] + '" class="' + (i[0] === cur ? 'on' : '') + '" aria-pressed="' + (i[0] === cur) + '" title="' + (i[2] || '') + '">' + i[1] + '</button>').join('') + '</div>';
  const slide = (id, text, min, max, step, val, unit) => '<label class="v3s">' + text + '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><span class="num">' + val + unit + '</span></label>';
  function paintBar() {
    if (!bar) return;
    let h = seg([['2d', '2D'], ['3d', '3D']], st.on ? '3d' : '2d', 'The map in 2D or 3D');
    if (st.on && loading) h += '<span class="note">Loading the 3D view …</span>';
    if (st.on && ready) {
      h += '<span id="v3cam">' + seg(CAMS, st.cam, 'Camera') + '</span>' + slide('v3k', 'Height', 1, 5, 0.5, st.k, '×');
      if (st.cam === 'orbit') h += '<label class="check"><input type="checkbox" id="v3centre"' + (st.centre ? ' checked' : '') + '> Turn about the car</label>';
      if (st.cam === 'rel') h += '<div class="v3rel">' + slide('v3r0', 'Ahead', -60, 60, 0.5, st.rel[0], ' m') + slide('v3r1', 'Left', -30, 30, 0.5, st.rel[1], ' m') + slide('v3r2', 'Up', 0.3, 60, 0.1, st.rel[2], ' m') +
        '<label class="check"><input type="checkbox" id="v3look"' + (st.look ? ' checked' : '') + '> Look at the car</label>' +
        '<button class="btn sm" id="v3cock" title="The driver’s eye: just above the tub, looking ahead">Cockpit</button><button class="btn sm" id="v3back" title="Back to the offset this camera starts with">Reset</button></div>';
    }
    bar.innerHTML = h;
    bar.classList.toggle('on3', st.on);
    bar.querySelectorAll('.seg').forEach((s, k) => s.querySelectorAll('button').forEach(b => { b.onclick = () => { if (k === 0) set(b.dataset.v === '3d'); else { st.cam = b.dataset.v; save(); paintBar(); } }; }));
    const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
    const live = (id, fn, unit) => on(id, 'oninput', e => { fn(+e.target.value); e.target.nextElementSibling.textContent = e.target.value + unit; save(); });
    live('v3k', v => { st.k = v; }, '×');
    live('v3r0', v => { st.rel[0] = v; }, ' m'); live('v3r1', v => { st.rel[1] = v; }, ' m'); live('v3r2', v => { st.rel[2] = v; }, ' m');
    on('v3centre', 'onchange', e => { st.centre = e.target.checked; if (st.centre) orbit.dist = Math.min(orbit.dist, 220); save(); });
    on('v3look', 'onchange', e => { st.look = e.target.checked; save(); });
    on('v3cock', 'onclick', () => { st.rel = [-0.35, 0, 1.0]; st.look = false; save(); paintBar(); });
    on('v3back', 'onclick', () => { st.rel = DEF.rel.slice(); st.look = true; save(); paintBar(); });
  }

  function start() {
    cv = document.createElement('canvas'); cv.id = 'c3'; cv.setAttribute('aria-label', 'The replay on the track in 3D. Drag to turn the view, wheel to zoom.'); cv.tabIndex = 0;
    wrap.insertBefore(cv, $('c').nextSibling);
    ren = new T.WebGLRenderer({ canvas: cv, antialias: true });
    ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new T.Scene();
    cam = new T.PerspectiveCamera(52, 1, 0.3, 9000); cam.up.set(0, 0, 1);
    scene.add(new T.HemisphereLight(0xffffff, 0x777777, 1.9));
    const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-0.5, -0.7, 1); scene.add(sun);
    pointers();
    ready = true; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function show() {
    const is3 = st.on && ready;
    if (cv) cv.hidden = !is3;
    $('c').style.visibility = is3 ? 'hidden' : '';
    wrap.classList.toggle('in3d', is3);
    paintBar();
  }
  /* 3D on or off. The library is fetched the first time it is wanted. */
  function set(on) {
    st.on = !!on;
    if (!st.on || ready) { show(); return Promise.resolve(ready); }
    if (loading) return Promise.resolve(false);
    loading = true; paintBar();
    return import(new URL('vendor/three.module.min.js', document.baseURI).href).then(m => {
      T = m; loading = false; start(); show(); return true;
    }).catch(e => {
      loading = false; st.on = false; show();
      RV.toast('The 3D view could not be started: ' + (e && e.message ? e.message : 'the browser refused it') + '. The 2D map is unchanged.', 'err');
      return false;
    });
  }

  function init() {
    wrap = $('mapwrap');
    if (!wrap || bar) return;
    bar = document.createElement('div'); bar.id = 'v3bar'; bar.setAttribute('aria-label', 'The map in 2D or 3D, and the 3D camera');
    wrap.appendChild(bar);
    paintBar();
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();

  RV.view3d = {
    set: set,
    isOn: () => st.on && ready,
    /* for the browser test: what is drawn and from where */
    state() {
      if (!ready) return { on: st.on, ready: false };
      const i = ren.info.render, p = cam.position;
      return { on: st.on, ready: true, cam: st.cam, k: st.k, triangles: i.triangles, calls: i.calls, cars: carsG ? carsG.children.length : 0,
        car: focus ? [focus.pos.x, focus.pos.y, focus.pos.z] : null, up: focus ? [focus.up.x, focus.up.y, focus.up.z] : null, eye: [p.x, p.y, p.z] };
    },
    camera(id) { st.cam = id; paintBar(); }, height(k) { st.k = k; paintBar(); }, offset(a, b, c, look) { st.rel = [a, b, c]; st.look = look !== false; paintBar(); },
  };
})();
