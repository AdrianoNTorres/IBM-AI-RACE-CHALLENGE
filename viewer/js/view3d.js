/* Run viewer: the Track page in 3D. A switch over the map (2D | 3D) shows the same replay on the track with its
   hills and banking (js/track.js builds both from the track file). Drawn with Three.js, which is kept in
   viewer/vendor/ and loaded only when 3D is first switched on; the 2D map does not depend on anything here.

   "Advanced 3D" is the same scene from the driver's seat, with what the driver program saw and planned drawn in it:
   its 19 distance sensors and the speed its plan allowed on the road ahead.

   Three cameras: Orbit (the whole track, turned and zoomed with the mouse), Chase (behind the car) and Relative
   (anywhere the reader puts it, as an offset from the car). Colours are the theme's own tokens (RV.pal), so the
   3D track looks like the 2D one; grass, sand, kerbs and walls have tokens of their own. The world is in metres: x and y as on the 2D map, z up. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$;
  const DEF = { on: false, adv: false, cam: 'orbit', k: 1, rel: [-9, 0, 3.5], look: true, centre: false, sens: true, plan: true };
  const COCKPIT = [-0.35, 0, 1.0];                         /* the driver's eye: just above the tub */
  const st = Object.assign({}, DEF, RV.uiGet('v3', {}));
  st.rel = (st.rel || DEF.rel).slice(0, 3);
  st.on = false; st.adv = false;                           /* a page always opens in 2D: 3D is asked for */
  const CAMS = [['orbit', 'Orbit', 'The whole track. Drag to turn it, wheel to zoom, Shift-drag to move, double-click to start again.'],
    ['chase', 'Chase', 'Behind and above the car, following it. The wheel moves the camera closer or further.'],
    ['rel', 'Relative', 'Anywhere you put it, measured from the car: ahead or behind, left or right, and how high.']];

  let T = null, ren = null, scene = null, cam = null, cv = null, bar = null, wrap = null;
  let loading = false, ready = false, raf = 0, last = 0;
  let trackG = null, lineM = null, carsG = null, built = { trk: null, k: 0, theme: -1 }, lineOf = null, carKey = '';
  const orbit = { az: -1.9, el: 0.62, dist: 900, t: [0, 0, 0], set: false };
  let chaseDist = 1, eye = null, lastCam = '', focus = null;
  let beamL = null, beamG = null, tubes = [], discs = [], planCol = null, roadM = null, roadN = 0, roadBase = null, tinted = null, skyOf = '', beamsNow = 0, planNow = 0, steerNow = 0, kerbs = [0, 0];

  const save = () => RV.uiSet('v3', { cam: st.cam, k: st.k, rel: st.rel, look: st.look, centre: st.centre, sens: st.sens, plan: st.plan });
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

  /* What lies beside the road is in the track file too (js/track.js, verge()): a border at each edge (a kerb, a flat
     strip or a low wall), then the side (grass, sand or tarmac) and a barrier at its far end (a wall or a fence).
     Each is drawn as plain coloured faces, level with the edge of the road it belongs to. */
  const SURF = { sand: 'sand', road: 'road', concrete: 'wall', tirewall: 'wall' };
  function faces() {
    const pos = [], cols = [];
    return {
      quad(a, b, c, d, colour) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]); for (let k = 0; k < 6; k++) cols.push(colour.r, colour.g, colour.b); },
      mesh(opts) {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
        return new T.Mesh(g, new T.MeshLambertMaterial(Object.assign({ vertexColors: true, side: T.DoubleSide }, opts || {})));
      },
    };
  }
  /* the road with its hills and banking; kerbs, grass, sand, walls and fences beside it; the slope down to the ground */
  function buildTrack(trk) {
    clear(trackG); trackG = new T.Group();
    const n = trk.centre.length - 1, hw = trk.hw, ground = trk.zbox[0] * st.k - 2;
    const bg = col('map-bg', '#e9e4d8'), road = col('road', '#2b2f36'), slope = bg.clone().lerp(road, 0.1);
    const C = { grass: col('grass', '#5f8f4e'), sand: col('sand', '#cdb98a'), road: road, wall: col('wall', '#8a8f99'), kerbA: col('kerb', '#c8372d'), kerbB: col('kerb-2', '#f2f0ea'),
      plan: road.clone().lerp(col('road-edge', '#ffffff'), 0.22) };
    const solid = faces(), fence = faces(), L = [], R = [], Le = [], Re = [];
    kerbs = [0, 0];
    /* one station: the road's two edges and, on each side, the points where the border, the side and the slope end */
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const s = i < n ? trk.total * i / n : 0, p = RV.track.pose(trk, s), sn = Math.sin(p[2]), cs = Math.cos(p[2]), v = RV.track.verge(trk, s);
      const l = surf(trk, s, hw), r = surf(trk, s, -hw);
      L.push(l); R.push(r); Le.push([l[0], l[1], l[2] + 0.06]); Re.push([r[0], r[1], r[2] + 0.06]);
      const row = { s: s };
      for (const [key, sg, e, q] of [['L', 1, l, v.L], ['R', -1, r, v.R]]) {
        const at = (off, z) => [p[0] - sg * off * sn, p[1] + sg * off * cs, z], z = e[2];
        const b = hw + q.bw, o = b + q.w;
        row[key] = { q: q, e: e, b: at(b, z), o: at(o, z), g: at(o + Math.max(2, (z - ground) * 1.8), ground), at: at, z: z, bOff: b, oOff: o };
      }
      rows.push(row);
    }
    for (let i = 0; i < n; i++) {
      for (const key of ['L', 'R']) {
        const a = rows[i][key], c = rows[i + 1][key], q = a.q, up = (pt, h) => [pt[0], pt[1], pt[2] + h];
        /* the border */
        if (q.bw > 0) {
          if (q.bs === 'curb') {                           /* a kerb: red and white by turns, rising a little away from the road */
            const red = Math.floor(i / 2) % 2 === 1, kc = red ? C.kerbA : C.kerbB;   /* two stations, about 4 m, of each colour */
            kerbs[red ? 0 : 1]++;
            solid.quad(a.e, c.e, up(c.b, 0.07), up(a.b, 0.07), kc);
          } else if (q.bs === 'wall' && q.bh > 0) {         /* a low wall right at the edge: its face to the road, its top, its back */
            solid.quad(a.e, c.e, up(c.e, q.bh), up(a.e, q.bh), C.wall); solid.quad(up(a.e, q.bh), up(c.e, q.bh), up(c.b, q.bh), up(a.b, q.bh), C.wall); solid.quad(a.b, c.b, up(c.b, q.bh), up(a.b, q.bh), C.wall);
          } else solid.quad(a.e, c.e, c.b, a.b, C.plan);
        }
        /* the side: grass unless the file says sand, tarmac or concrete */
        if (q.w > 0.05) solid.quad(a.b, c.b, c.o, a.o, C[SURF[/^road/.test(q.surf) ? 'road' : q.surf] || 'grass']);
        /* the barrier at the far end of the side: a wall is solid, a fence is seen through */
        if (q.kh > 0) (q.ks === 'fence' ? fence : solid).quad(a.o, c.o, up(c.o, q.kh), up(a.o, q.kh), C.wall);
        solid.quad(a.o, c.o, c.g, a.g, slope);
      }
    }
    roadM = band(L, R, 0xffffff, { vertexColors: true }); roadN = n; roadBase = road; tinted = null;
    const rc = new Float32Array((n + 1) * 6);
    for (let i = 0; i < rc.length; i += 3) { rc[i] = road.r; rc[i + 1] = road.g; rc[i + 2] = road.b; }
    roadM.geometry.setAttribute('color', new T.BufferAttribute(rc, 3));
    trackG.add(roadM);
    trackG.add(solid.mesh()); trackG.add(fence.mesh({ transparent: true, opacity: 0.35, depthWrite: false }));
    trackG.add(polyline(Le, col('road-edge', '#ffffff'))); trackG.add(polyline(Re, col('road-edge', '#ffffff')));
    const b = trk.box, w = b[1] - b[0], h = b[3] - b[2];
    const plane = new T.Mesh(new T.PlaneGeometry(w + 1600, h + 1600), new T.MeshLambertMaterial({ color: bg }));
    plane.position.set((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, ground - 0.05); trackG.add(plane);
    /* the lines across the road: start and finish, and where the timing sectors begin */
    const across = (s, colour, lift) => polyline([surf(trk, s, hw, lift), surf(trk, s, -hw, lift)], colour);
    trackG.add(across(0, col('road-mark', '#ffffff'), 0.08)); trackG.add(across(0.6, col('road-mark', '#ffffff'), 0.08));
    trackG.add(label('Start / finish', surf(trk, 0, hw + 6, 5), 5));
    (trk.sectors.cuts || []).forEach((d, k) => { trackG.add(across(d, col('best', RV.pal.accent || '#7a4cc0'), 0.08)); trackG.add(label('S' + (k + 2) + ' starts', surf(trk, d, hw + 6, 5), 4.5)); });
    for (let m = 500; m < trk.total - 100; m += 500) trackG.add(label(RV.fmtInt(m) + ' m', surf(trk, m, -hw - 6, 4), 4));
    scene.add(trackG);
    sky();
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
    /* the wheels: each on a pivot (the front two are steered about it) and turning about its axle; a pale bar across
       the rim shows it turn */
    const rim = new T.MeshLambertMaterial({ color: 0x9aa0ab, transparent: ghost, opacity: ghost ? 0.82 : 1 });
    g.userData.front = []; g.userData.wheels = [];
    for (const [x, y] of [[1.55, 0.86], [1.55, -0.86], [-1.55, 0.86], [-1.55, -0.86]]) {
      const piv = new T.Group(), w = new T.Group(); piv.position.set(x, y, 0.33);
      w.add(new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.34, 18), dark));        /* a cylinder's axis is y: across the car */
      const bar = new T.Mesh(new T.BoxGeometry(0.5, 0.36, 0.09), rim); w.add(bar);
      piv.add(w); g.add(piv); g.userData.wheels.push(w); if (x > 0) g.userData.front.push(piv);
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

  /* ---------- the advanced view: what the driver program saw and planned ---------- */
  /* the sky, and the haze that hides the far end of the ground, in the advanced view; the map's own background otherwise */
  function sky() {
    const c = st.adv ? col('sky', '#bcd7ee') : col('map-bg', '#e9e4d8');
    scene.background = c;
    scene.fog = st.adv ? new T.Fog(c, 350, 3200) : null;
    skyOf = (st.adv ? 'a' : 'm') + RV.themeRev;
  }
  /* the height of the ground at a point of the plan near distance s0 along the track (a beam's end, for one):
     the nearest station of the centre line within reach, then the road surface there, level beyond its edges */
  function groundAt(trk, x, y, s0) {
    const C = trk.centre, n = C.length - 1, i0 = Math.round(((s0 % trk.total) + trk.total) % trk.total / trk.total * n);
    let best = 1e18, bi = i0;
    for (let d = -20; d <= 115; d++) { const i = ((i0 + d) % n + n) % n, dx = C[i][0] - x, dy = C[i][1] - y, q = dx * dx + dy * dy; if (q < best) { best = q; bi = i; } }
    const s = trk.total * bi / n, p = RV.track.pose(trk, s), off = -(x - p[0]) * Math.sin(p[2]) + (y - p[1]) * Math.cos(p[2]);
    return surf(trk, s, RV.clamp(off, -trk.hw, trk.hw))[2];
  }
  const rgb = css => { const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(css); return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : [1, 1, 1]; };
  /* The 19 distance sensors of the car in focus. Each is a tapered tube from the car to the point of the track edge
     it measured (9 cm across at the car, 3 cm at the far end), so it narrows with distance as a real thing would
     and hides behind a crest; a one-pixel line runs inside it, because far away the tube is thinner than a pixel
     and would shimmer or vanish; a disc lies on the ground where it ends. Colours as on the 2D map (close to far).
     A beam that found nothing within 200 m is faint and has no disc. */
  function buildBeams() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(19 * 6), 3)); g.setAttribute('color', new T.BufferAttribute(new Float32Array(19 * 6), 3));
    beamL = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    beamL.frustumCulled = false; beamL.renderOrder = 4;
    beamG = new T.Group(); tubes = []; discs = [];
    const tg = new T.CylinderGeometry(0.015, 0.045, 1, 10, 1, true); tg.translate(0, 0.5, 0);      /* along y, from 0 (at the car) to 1 */
    const dg = new T.CircleGeometry(0.26, 20);                                                    /* flat on the ground: its normal is z */
    for (let k = 0; k < 19; k++) {
      const tube = new T.Mesh(tg, new T.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }));
      const disc = new T.Mesh(dg, new T.MeshBasicMaterial({ transparent: true, opacity: 0.92, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }));
      tube.frustumCulled = disc.frustumCulled = false; tube.renderOrder = 3; disc.renderOrder = 2;
      beamG.add(tube); beamG.add(disc); tubes.push(tube); discs.push(disc);
    }
    scene.add(beamL); scene.add(beamG);
  }
  function placeBeams(trk, c, F) {
    const r = c.r, show = st.adv && st.sens && !!r.b;
    beamL.visible = beamG.visible = show; beamsNow = 0;
    if (!show) return;
    const A = RV.TRACK_ANGLES, o = c.k * 19, lp = beamL.geometry.attributes.position.array, lc = beamL.geometry.attributes.color.array;
    const from = F.pos.clone().addScaledVector(F.up, 0.45), fog = scene.background, Y = new T.Vector3(0, 1, 0), dir = new T.Vector3();
    for (let k = 0; k < 19; k++) {
      const d = r.b[o + k], q = k * 6, tube = tubes[k], disc = discs[k];
      let ex = from.x, ey = from.y, ez = from.z, cr = [0, 0, 0], hit = false;
      tube.visible = d >= 0; disc.visible = false;
      if (d >= 0) {
        const a = c.p[2] - A[k] * Math.PI / 180, gz = groundAt(trk, c.p[0] + d * Math.cos(a), c.p[1] + d * Math.sin(a), r.s[c.k]);
        hit = d < 199.5; ex = c.p[0] + d * Math.cos(a); ey = c.p[1] + d * Math.sin(a); ez = gz + 0.3;
        cr = rgb(RV.beamCol(d, 1));
        dir.set(ex - from.x, ey - from.y, ez - from.z);
        const len = dir.length();
        /* the tube begins 2 m out, past the car's nose: from the driver's seat its near end would fill the view (the line inside it starts at the car) */
        const skip = Math.min(2, len * 0.4);
        dir.normalize();
        tube.position.copy(from).addScaledVector(dir, skip); tube.scale.set(1, Math.max(len - skip, 0.01), 1); tube.quaternion.setFromUnitVectors(Y, dir);
        tube.material.color.setRGB(cr[0], cr[1], cr[2]); tube.material.opacity = hit ? 0.5 : 0.14;
        if (hit) { disc.visible = true; disc.position.set(ex, ey, gz + 0.04); disc.material.color.setRGB(cr[0], cr[1], cr[2]); }
        else cr = [cr[0] * 0.3 + fog.r * 0.7, cr[1] * 0.3 + fog.g * 0.7, cr[2] * 0.3 + fog.b * 0.7];
        beamsNow++;
      }
      lp[q] = from.x; lp[q + 1] = from.y; lp[q + 2] = from.z; lp[q + 3] = ex; lp[q + 4] = ey; lp[q + 5] = ez;
      lc[q] = lc[q + 3] = cr[0]; lc[q + 1] = lc[q + 4] = cr[1]; lc[q + 2] = lc[q + 5] = cr[2];
    }
    beamL.geometry.attributes.position.needsUpdate = true; beamL.geometry.attributes.color.needsUpdate = true;
  }
  /* The speed the driver's plan allowed, shown on the road for the next 300 m in the colours of the driven line
     (red slow, green fast), so the road turns red ahead of a corner where the plan will make the car brake.
     It is not a second surface laid on the road: two surfaces that almost touch flicker, because the graphics card
     cannot tell which is nearer. The road itself is tinted: each frame the colours of its own points over the
     stretch ahead of the car are mixed with the plan's colour, fading out over the last 50 m, and the stretch
     tinted the frame before is put back. */
  const PLAN_AHEAD = 300, PLAN_FADE = 50, PLAN_MIX = 0.6;
  function buildPlan(trk, r) {
    planCol = null;
    if (!r || !r.x || !r.al) return;
    const n = trk.centre.length - 1, total = trk.total, al = new Float32Array(n).fill(-1);
    let lo = 1e9, hi = -1e9, any = false;
    for (let i = 0; i < r.n; i++) {
      if (r.v[i] < lo) lo = r.v[i]; if (r.v[i] > hi) hi = r.v[i];
      if (r.al[i] > 0) { any = true; al[Math.min(n - 1, Math.floor(((r.s[i] % total) + total) % total / total * n))] = r.al[i]; }
    }
    if (!any) return;
    let carry = -1;                                           /* a station the car passed between two steps takes the one before */
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { if (al[i] >= 0) carry = al[i]; else if (carry >= 0) al[i] = carry; }
    const c = new T.Color();
    planCol = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c.set(RV.speedCol(RV.clamp(hi > lo ? (al[i] - lo) / (hi - lo) : 1, 0, 1))); planCol[i * 3] = c.r; planCol[i * 3 + 1] = c.g; planCol[i * 3 + 2] = c.b; }
  }
  /* the road's colour at station i: its own, or mixed with (r, g, b) by share a; the last row of points is the first again */
  function paintRoad(i, a, r, g, b) {
    const ca = roadM.geometry.attributes.color.array, n = roadN, B = roadBase;
    for (const row of (i === 0 ? [0, n] : [i])) for (const o of [row * 6, row * 6 + 3]) { ca[o] = B.r + (r - B.r) * a; ca[o + 1] = B.g + (g - B.g) * a; ca[o + 2] = B.b + (b - B.b) * a; }
  }
  function placePlan(trk, c) {
    planNow = 0;
    if (!roadM) return;
    const n = roadN, step = trk.total / n, on = st.adv && st.plan && !!planCol && planCol.length === n * 3;
    if (tinted) { for (let k = 0; k <= tinted[1]; k++) paintRoad((tinted[0] + k) % n, 0, 0, 0, 0); tinted = null; roadM.geometry.attributes.color.needsUpdate = true; }
    if (!on) return;
    const s = c.r.s[c.k], i0 = Math.floor(((s % trk.total) + trk.total) % trk.total / step) % n, W = Math.min(n - 1, Math.round(PLAN_AHEAD / step)), F = Math.max(1, Math.round(PLAN_FADE / step));
    for (let k = 0; k <= W; k++) { const i = (i0 + k) % n; paintRoad(i, PLAN_MIX * Math.min(1, (W - k) / F), planCol[i * 3], planCol[i * 3 + 1], planCol[i * 3 + 2]); }
    tinted = [i0, W]; planNow = W;
    roadM.geometry.attributes.color.needsUpdate = true;
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
        orbit.t[0] += (sa * dx - ca * dy) * k; orbit.t[1] += (-ca * dx - sa * dy) * k;   /* the ground follows the pointer, both ways */ st.centre = false; paintBar();
      } else { orbit.az -= dx * 0.006; orbit.el = RV.clamp(orbit.el - dy * 0.006, 0.05, 1.53); }   /* dragging up lifts the camera, dragging down lowers it */
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
    if (skyOf !== (st.adv ? 'a' : 'm') + RV.themeRev) sky();
    if (lineOf !== S.R) { buildLine(trk, S.R); buildPlan(trk, S.R); }
    if (!beamL) buildBeams();
    const cars = RV.map.cars3(), key = cars.map(c => c.id + RV.col(c.id)).join('|');
    if (key !== carKey) { buildCars(cars); carKey = key; }
    focus = null;
    cars.forEach((c, k) => {
      const F = frameOf(trk, c), g = carsG.children[k];
      if (!g) return;
      g.position.copy(F.pos);
      g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(F.fwd, F.left, F.up));
      /* the front wheels turn with the recorded steering (full lock is 21 degrees), all four with the speed */
      const steer = RV.clamp(c.p[3] || 0, -1, 1) * 21 * Math.PI / 180, roll = (S.playing ? c.r.v[c.k] / 3.6 * dt / 0.33 : 0);
      g.userData.front.forEach(pv => { pv.rotation.z = steer; }); g.userData.wheels.forEach(w => { w.rotation.y += roll; });
      if (k === 0) { focus = F; steerNow = steer; placeBeams(trk, c, F); placePlan(trk, c); }
    });
    aim(dt, focus);
    ren.render(scene, cam);
  }

  /* ---------- the controls over the map ---------- */
  const seg = (items, cur, name) => '<div class="seg" role="group" aria-label="' + name + '">' + items.map(i => '<button data-v="' + i[0] + '" class="' + (i[0] === cur ? 'on' : '') + '" aria-pressed="' + (i[0] === cur) + '" title="' + (i[2] || '') + '">' + i[1] + '</button>').join('') + '</div>';
  const slide = (id, text, min, max, step, val, unit) => '<label class="v3s">' + text + '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><span class="num">' + val + unit + '</span></label>';
  function paintBar() {
    if (!bar) return;
    let h = seg([['2d', '2D', 'The flat map'], ['3d', '3D', 'The track with its hills and banking'], ['adv', 'Advanced 3D', 'From the driver\u2019s seat, with what the driver program saw and planned drawn on the road']], !st.on ? '2d' : st.adv ? 'adv' : '3d', 'The map in 2D, in 3D, or the advanced 3D view');
    if (st.on && loading) h += '<span class="note">Loading the 3D view …</span>';
    if (st.on && ready) {
      h += '<span id="v3cam">' + seg(CAMS, st.cam, 'Camera') + '</span>' + slide('v3k', 'Height', 1, 5, 0.5, st.k, '×');
      if (st.adv) h += '<label class="check" title="The 19 distance sensors, each drawn to the point of the track edge it measured"><input type="checkbox" id="v3sens"' + (st.sens ? ' checked' : '') + '> Sensors</label>' +
        '<label class="check" title="The speed the driver\u2019s plan allowed over the next 300 m, in the colours of the driven line"><input type="checkbox" id="v3plan"' + (st.plan ? ' checked' : '') + '> Planned speed</label>';
      if (st.cam === 'orbit') h += '<label class="check"><input type="checkbox" id="v3centre"' + (st.centre ? ' checked' : '') + '> Turn about the car</label>';
      if (st.cam === 'rel') h += '<div class="v3rel">' + slide('v3r0', 'Ahead', -60, 60, 0.5, st.rel[0], ' m') + slide('v3r1', 'Left', -30, 30, 0.5, st.rel[1], ' m') + slide('v3r2', 'Up', 0.3, 60, 0.1, st.rel[2], ' m') +
        '<label class="check"><input type="checkbox" id="v3look"' + (st.look ? ' checked' : '') + '> Look at the car</label>' +
        '<button class="btn sm" id="v3cock" title="The driver’s eye: just above the tub, looking ahead">Cockpit</button><button class="btn sm" id="v3back" title="Back to the offset this camera starts with">Reset</button></div>';
    }
    bar.innerHTML = h;
    bar.classList.toggle('on3', st.on);
    bar.querySelectorAll('.seg').forEach((s, k) => s.querySelectorAll('button').forEach(b => { b.onclick = () => { if (k === 0) mode(b.dataset.v); else { st.cam = b.dataset.v; save(); paintBar(); } }; }));
    const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
    const live = (id, fn, unit) => on(id, 'oninput', e => { fn(+e.target.value); e.target.nextElementSibling.textContent = e.target.value + unit; save(); });
    live('v3k', v => { st.k = v; }, '×');
    live('v3r0', v => { st.rel[0] = v; }, ' m'); live('v3r1', v => { st.rel[1] = v; }, ' m'); live('v3r2', v => { st.rel[2] = v; }, ' m');
    on('v3centre', 'onchange', e => { st.centre = e.target.checked; if (st.centre) orbit.dist = Math.min(orbit.dist, 220); save(); });
    on('v3look', 'onchange', e => { st.look = e.target.checked; save(); });
    on('v3sens', 'onchange', e => { st.sens = e.target.checked; save(); });
    on('v3plan', 'onchange', e => { st.plan = e.target.checked; save(); });
    on('v3cock', 'onclick', () => { st.rel = COCKPIT.slice(); st.look = false; save(); paintBar(); });
    on('v3back', 'onclick', () => { st.rel = DEF.rel.slice(); st.look = true; save(); paintBar(); });
  }

  function start() {
    cv = document.createElement('canvas'); cv.id = 'c3'; cv.setAttribute('aria-label', 'The replay on the track in 3D. Drag to turn the view, wheel to zoom.'); cv.tabIndex = 0;
    wrap.insertBefore(cv, $('c').nextSibling);
    ren = new T.WebGLRenderer({ canvas: cv, antialias: true });
    ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new T.Scene();
    cam = new T.PerspectiveCamera(52, 1, 0.3, 6500); cam.up.set(0, 0, 1);
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
  /* '2d', '3d' or 'adv'. The advanced view opens from the driver's seat unless the reader has chosen a camera of
     their own for it since. */
  function mode(m) {
    const adv = m === 'adv';
    if (adv && !st.adv && st.cam === 'orbit') { st.cam = 'rel'; st.rel = COCKPIT.slice(); st.look = false; }
    st.adv = adv;
    return set(m !== '2d');
  }
  /* 3D on or off. The library is fetched the first time it is wanted. */
  function set(on) {
    st.on = !!on; if (!st.on) st.adv = false;
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
    set: set, mode: mode,
    isOn: () => st.on && ready,
    /* for the browser test: what is drawn and from where */
    state() {
      if (!ready) return { on: st.on, ready: false };
      const i = ren.info.render, p = cam.position;
      return { on: st.on, ready: true, adv: st.adv, kerbs: kerbs, tubes: beamG && beamG.visible ? tubes.filter(x => x.visible).length : 0, discs: beamG && beamG.visible ? discs.filter(x => x.visible).length : 0, beams: beamL && beamL.visible ? beamsNow : 0, plan: planNow, steer: steerNow, fog: !!scene.fog, cam: st.cam, k: st.k, triangles: i.triangles, calls: i.calls, cars: carsG ? carsG.children.length : 0,
        car: focus ? [focus.pos.x, focus.pos.y, focus.pos.z] : null, up: focus ? [focus.up.x, focus.up.y, focus.up.z] : null, eye: [p.x, p.y, p.z] };
    },
    camera(id) { st.cam = id; paintBar(); }, height(k) { st.k = k; paintBar(); }, offset(a, b, c, look) { st.rel = [a, b, c]; st.look = look !== false; paintBar(); },
  };
})();
