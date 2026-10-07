/* Run viewer: the Track tab. The replay on the 2D map, its camera, and the side panel.
   The overlay framework: everything drawn on the map is a layer (LAYERS), and every box laid over it is a panel
   (OVER). A layer or a panel gets its switch and its opacity slider in the side panel automatically, a layer that
   has a line width (w) a width slider as well, and all three are saved in the browser and put back on the next
   visit. A new feature adds itself with RV.map.addLayer({...}) or RV.map.addPanel({...}); nothing else is needed.
   Every panel is also a small window: it can be dragged, folded into a tab, closed, and (where it shows several
   cars) limited to the car in focus; see "the panels as small windows" below. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, el = RV.el, esc = RV.esc;
  const NB = 32;                        /* speed colour steps of the driven line */
  const c = $('c'), g = c.getContext('2d'), mini = $('mini'), mg = mini.getContext('2d');

  /* camera. z: pixels per metre; ox, oy: pan in pixels; cx, cy, ang: centre and rotation when not following;
     all: keep every car in view (sz, scx, scy: its smoothed zoom and centre; maxAll: its closest zoom) */
  const view = { z: 3.2, ox: 0, oy: 0, cx: 0, cy: 0, follow: false, rot: false, fit: true, all: false, sInit: false, sz: 3.2, scx: 0, scy: 0, ang: 0, maxAll: 10 };
  /* fit: the whole track is kept in view (the start state); it ends when the user moves, zooms or follows */
  const opt = { line: 'upto', colour: 'speed', allInputs: true };     /* line: how much of the driven line is drawn; colour: by speed or by brake; allInputs: wheel and pedals of the compared cars too */
  let near = { x: 0, y: 0, r2: 1e18 };                         /* the part of the track that can be on screen this frame */
  const buf = document.createElement('canvas'), bg = buf.getContext('2d'), miniBuf = document.createElement('canvas');
  let bufKey = '', miniKey = '', secNow = '', tourSaved = null;
  let hudHtml = '', slvHtml = '', ldbHtml = '';
  let lastCam = null;                   /* base point, centre, angle and zoom of the last drawn frame */
  let cam = null;                       /* world-to-screen of the last drawn frame, for hit-testing clicks */
  let zoomInput = null, carCells = [];
  let hadCmp = false, hashCam = false;  /* runs were being compared at the last selection; the address set the camera */

  const trk = () => S.ds.trk;
  const onMap = () => !!S.R && !!S.R.x;                 /* the run in focus has a position on the track in use */
  const others = () => S.CM.filter(m => m.r.x);         /* compared runs that can be drawn */

  /* ---------- drawing helpers ---------- */
  function poly(ctx, P) { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const p of P) ctx.lineTo(p[0], p[1]); }
  function lineRange(r, me) {
    let k0 = 0, k1 = r.n - 2;
    if (opt.line === 'upto') k1 = Math.min(k1, me - 1);
    if (opt.line === 'near') { k0 = RV.idxAtD(r, r.d[me] - 150); k1 = Math.min(k1, RV.idxAtD(r, r.d[me] + 150)); }
    return [k0, k1];
  }
  /* Recorded points are about a metre apart. Zoomed out, most of them fall on the same pixel, so only every
     n-th is drawn (about 1.2 px apart), and points well outside the view are skipped altogether. */
  const stepFor = z => Math.max(1, Math.floor(1.2 / z));
  const inView = (x, y) => { const dx = x - near.x, dy = y - near.y; return dx * dx + dy * dy <= near.r2; };
  /* a compared run's line: one path, stroked twice (dark casing, then its colour) */
  function drawSolid(ctx, r, me, z, wOut, wIn, colOut, colIn) {
    const q = lineRange(r, me), st = stepFor(z), end = q[1] + 1;
    if (q[1] < q[0]) return;
    const p = new Path2D();
    let pen = false;
    for (let k = q[0]; k <= end; k = (k < end && k + st > end) ? end : k + st) {
      if (!inView(r.x[k], r.y[k])) { pen = false; continue; }
      if (pen) p.lineTo(r.x[k], r.y[k]); else { p.moveTo(r.x[k], r.y[k]); pen = true; }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = wOut; ctx.strokeStyle = colOut; ctx.stroke(p);
    ctx.lineWidth = wIn; ctx.strokeStyle = colIn; ctx.stroke(p);
  }
  /* colour step (0 to NB-1) of every piece of the run's line, by speed or by brake */
  function colourSteps(r) {
    if (r._bk && r._bkBy === opt.colour) return r._bk;
    const bk = new Uint8Array(r.n);
    for (let k = 0; k < r.n - 1; k++) {
      const f = opt.colour === 'brake' ? (r.br[k] + r.br[k + 1]) / 2 : ((r.v[k] + r.v[k + 1]) / 2 - S.vmin) / (S.vmax - S.vmin || 1);
      bk[k] = RV.clamp(Math.floor(f * NB), 0, NB - 1);
    }
    r._bkBy = opt.colour;
    return (r._bk = bk);
  }
  let stepCols = null, stepColsKey = '';
  function colours() {
    const key = opt.colour + RV.themeRev;
    if (key !== stepColsKey) { stepCols = []; for (let b = 0; b < NB; b++) stepCols.push(opt.colour === 'brake' ? RV.brakeCol((b + 0.5) / NB) : RV.speedCol((b + 0.5) / NB)); stepColsKey = key; }
    return stepCols;
  }
  /* the driven line of the car in focus: consecutive pieces of the same colour step are stroked together */
  function drawSpeedLine(ctx, r, z, w) {
    const q = lineRange(r, S.i), bk = colourSteps(r), cols = colours(), st = stepFor(z), end = q[1] + 1;
    ctx.lineWidth = w / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let cur = -1, pen = false;
    for (let k = q[0]; k <= q[1]; k += st) {
      if (!inView(r.x[k], r.y[k])) { if (pen) { ctx.stroke(); pen = false; } continue; }
      const b = bk[k];
      if (!pen || b !== cur) { if (pen) ctx.stroke(); ctx.beginPath(); ctx.moveTo(r.x[k], r.y[k]); ctx.strokeStyle = cols[b]; cur = b; pen = true; }
      const k2 = Math.min(k + st, end);
      ctx.lineTo(r.x[k2], r.y[k2]);
    }
    if (pen) ctx.stroke();
  }
  /* the track's outline as ready-made paths, built once per track */
  function trackPaths() {
    const T = trk();
    if (T._paths) return T._paths;
    const line = P => { const p = new Path2D(); p.moveTo(P[0][0], P[0][1]); for (const q of P) p.lineTo(q[0], q[1]); return p; };
    const road = new Path2D();
    road.moveTo(T.left[0][0], T.left[0][1]);
    for (const p of T.left) road.lineTo(p[0], p[1]);
    for (let k = T.right.length - 1; k >= 0; k--) road.lineTo(T.right[k][0], T.right[k][1]);
    road.closePath();
    const marks = new Path2D();
    for (const m of T.marks) { marks.moveTo(m[1], m[2]); marks.lineTo(m[3], m[4]); }
    /* finish line: the line across the road at distance 0 */
    const finish = new Path2D();
    finish.moveTo(T.left[0][0], T.left[0][1]); finish.lineTo(T.right[0][0], T.right[0][1]);
    return (T._paths = { road: road, left: line(T.left), right: line(T.right), centre: line(T.centre), marks: marks, finish: finish });
  }
  /* car1-ow1 from above: 4.8 m long, front axle 1.6 m ahead of the centre, rear axle 1.35 m behind, front wheels 0.70 m and
     rear wheels 0.75 m either side, tyres 0.30 m wide. The front wheels turn with the recorded steering (full lock 21 degrees).
     Never drawn smaller than about 16 px. */
  function drawCar(ctx, p, fill, z, userScale) {           /* p: [x, y, yaw, steering], see poseAt */
    const sc = Math.max(1, 16 / (4.8 * z)) * (userScale || RV.prefs.carSize), lw = 0.05, P = RV.pal;
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(p[2]); ctx.scale(sc, sc);
    ctx.strokeStyle = P['road-mark']; ctx.lineWidth = 0.06; ctx.beginPath();
    for (const w of [[1.6, 0.70], [1.6, -0.70], [-1.35, 0.75], [-1.35, -0.75]]) {
      ctx.moveTo(w[0] + 0.12, w[1] > 0 ? 0.2 : -0.2); ctx.lineTo(w[0], w[1]);
      ctx.moveTo(w[0] - 0.3, w[1] > 0 ? 0.25 : -0.25); ctx.lineTo(w[0], w[1]);
    }
    ctx.stroke();
    const wheel = (x, y, len, ang) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = P.tyre; ctx.strokeStyle = P['road-mark']; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.rect(-len / 2, -0.15, len, 0.30); ctx.fill(); ctx.stroke(); ctx.restore();
    };
    const sa = (p[3] || 0) * 21 * Math.PI / 180;
    wheel(1.6, 0.70, 0.60, sa); wheel(1.6, -0.70, 0.60, sa); wheel(-1.35, 0.75, 0.63, 0); wheel(-1.35, -0.75, 0.63, 0);
    ctx.fillStyle = fill; ctx.strokeStyle = P['car-line']; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.rect(2.0, -0.85, 0.36, 1.70); ctx.fill(); ctx.stroke();              /* front wing */
    ctx.beginPath(); ctx.rect(-2.4, -0.55, 0.38, 1.10); ctx.fill(); ctx.stroke();             /* rear wing */
    ctx.beginPath(); ctx.moveTo(2.3, 0.10); ctx.lineTo(0.95, 0.22); ctx.lineTo(0.6, 0.62); ctx.lineTo(-0.95, 0.62); ctx.lineTo(-2.0, 0.24);
    ctx.lineTo(-2.0, -0.24); ctx.lineTo(-0.95, -0.62); ctx.lineTo(0.6, -0.62); ctx.lineTo(0.95, -0.22); ctx.lineTo(2.3, -0.10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P['car-line']; ctx.beginPath(); ctx.ellipse(0.15, 0, 0.55, 0.24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = P.helmet; ctx.beginPath(); ctx.arc(0.05, 0, 0.15, 0, 7); ctx.fill();
    ctx.restore();
  }
  /* Where a run's car is, frac of the way from step k to step k + 1: [x, y, yaw, steering].
     frac is 0 except while the replay runs at 1× or slower, where it makes the motion smooth (S.camFrac). */
  function poseAt(r, k, frac) {
    if (!(frac > 0) || k >= r.n - 1) return [r.x[k], r.y[k], r.yaw[k], r.st[k]];
    const k1 = k + 1;
    let da = r.yaw[k1] - r.yaw[k];                        /* the short way round */
    if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
    return [r.x[k] + (r.x[k1] - r.x[k]) * frac, r.y[k] + (r.y[k1] - r.y[k]) * frac, r.yaw[k] + da * frac, r.st[k] + (r.st[k1] - r.st[k]) * frac];
  }
  /* a compared car, moved between its steps by as much as the car in focus is between its own */
  function ghostPose(r) {
    const R = S.R, i = S.i, f = S.camFrac;
    if (!(f > 0) || i >= R.n - 1) return poseAt(r, RV.ghostIdx(r), 0);
    const mine = RV.prefs.sync === 't' ? R.t : R.d, theirs = RV.prefs.sync === 't' ? r.t : r.d;
    const v = mine[i] + (mine[i + 1] - mine[i]) * f, k = RV.bsearch(theirs, v), span = k < r.n - 1 ? theirs[k + 1] - theirs[k] : 0;
    return poseAt(r, k, span > 0 ? RV.clamp((v - theirs[k]) / span, 0, 1) : 0);
  }
  let fp = [0, 0, 0, 0];                                  /* pose of the car in focus in the frame being drawn */
  /* the beams read at step i, drawn from where the car in focus is drawn so they stay attached to it */
  function beamEnds(r, i, each) {
    const o = i * 19, A = RV.TRACK_ANGLES;
    for (let k = 0; k < 19; k++) {
      const d = r.b[o + k];
      if (d < 0) continue;
      const a = fp[2] - A[k] * Math.PI / 180;
      each(d, fp[0] + d * Math.cos(a), fp[1] + d * Math.sin(a), d < 199.5);
    }
  }

  /* ---------- map layers ----------
     g = group heading in the panel, d = one-line description, cmp = only shown while runs are compared.
     draw(ctx, zoom) draws in track coordinates (metres); screen(ctx, w2s) draws in pixels. */
  const LAYERS = [
    { id: 'road', g: 'Track', label: 'Road surface', d: 'The dark area of the road.', on: true, alpha: 1, draw(ctx) { ctx.fillStyle = RV.pal.road; ctx.fill(trackPaths().road, 'evenodd'); } },
    { id: 'edges', g: 'Track', label: 'Track edges', d: 'The lines at both sides. Beyond them the car is off the track.', on: true, alpha: 1, draw(ctx, z) {
      ctx.lineWidth = this.w / z; ctx.strokeStyle = RV.pal['road-edge']; ctx.stroke(trackPaths().left); ctx.stroke(trackPaths().right);
    } },
    { id: 'centre', g: 'Track', label: 'Centre line', d: 'Dashed line down the middle of the road (track position 0).', on: false, alpha: 0.6, draw(ctx, z) {
      ctx.setLineDash([6 / z, 6 / z]); ctx.lineWidth = this.w / z; ctx.strokeStyle = RV.pal['road-mark']; ctx.stroke(trackPaths().centre); ctx.setLineDash([]);
    } },
    { id: 'finish', g: 'Track', label: 'Start / finish line', d: 'The start and finish line across the road.', on: true, alpha: 1, draw(ctx, z) {
      ctx.lineWidth = this.w / z; ctx.strokeStyle = RV.pal['road-edge']; ctx.stroke(trackPaths().finish);
      /* chequered pattern: alternate black/white dashes */
      ctx.lineWidth = this.w / z; ctx.setLineDash([4 / z, 4 / z]);
      ctx.strokeStyle = RV.pal['road']; ctx.stroke(trackPaths().finish); ctx.setLineDash([]);
    }, screen(ctx, w2s) {
      if (view.z < 1) return;
      ctx.font = '600 11px ' + RV.pal.font;               /* before measuring: the width depends on it */
      const T = trk(), p = w2s(T.left[0][0], T.left[0][1]), s = 'Start / Finish', w = ctx.measureText(s).width;
      ctx.fillStyle = RV.pal['road-edge']; ctx.beginPath(); ctx.roundRect(p[0] + 6, p[1] - 9, w + 12, 18, 4); ctx.fill();
      ctx.fillStyle = RV.pal['road']; ctx.fillText(s, p[0] + 12, p[1] + 3);
    } },
    { id: 'marks', g: 'Track', label: 'Distance marks', d: 'A tick and a label every 100 m from the start line.', on: true, alpha: 0.8, draw(ctx, z) {
      ctx.lineWidth = this.w / z; ctx.strokeStyle = RV.pal['road-mark']; ctx.stroke(trackPaths().marks);
    }, screen(ctx, w2s) {
      if (view.z < 0.5) return;
      ctx.fillStyle = RV.pal['map-ink']; ctx.font = '12px ' + RV.pal.font;
      for (const m of trk().marks) { const p = w2s(m[1], m[2]); if (p[0] > -40 && p[0] < c.clientWidth + 40 && p[1] > -20 && p[1] < c.clientHeight + 20) ctx.fillText(m[0] + ' m', p[0] + 5, p[1] - 5); }
    } },
    { id: 'sectors', g: 'Track', label: 'Sector lines', d: 'Where the timing sectors begin (detailed view only). On Corkscrew these are Laguna Seca\u2019s three sectors.', on: true, alpha: 1, draw(ctx, z) {
      if (RV.simple()) return;
      ctx.lineWidth = this.w / z; ctx.strokeStyle = RV.pal.best; ctx.beginPath();
      for (const m of trk().sectors.lines) { ctx.moveTo(m[0], m[1]); ctx.lineTo(m[2], m[3]); }
      ctx.stroke();
    }, screen(ctx, w2s) {
      if (RV.simple() || view.z < 0.5) return;
      ctx.font = '600 12px ' + RV.pal.font;
      trk().sectors.lines.forEach((m, k) => {
        const p = w2s(m[2], m[3]), s = 'S' + (k + 2) + ' starts', w = ctx.measureText(s).width;
        ctx.fillStyle = RV.pal.best; ctx.beginPath(); ctx.roundRect(p[0] + 6, p[1] - 10, w + 12, 20, 5); ctx.fill();
        ctx.fillStyle = RV.pal.surface; ctx.fillText(s, p[0] + 12, p[1] + 4);
      });
    } },
    { id: 'line', g: 'Car and path', label: 'Driven line', d: 'Where the car in focus drove, coloured by its speed (red slowest, green fastest) or by how hard it brakes.', on: true, alpha: 1, draw(ctx, z) { drawSpeedLine(ctx, S.R, z, this.w); } },
    { id: 'car', g: 'Car and path', label: 'Car', d: 'The car in focus: car1-ow1, the open-wheel car the driver runs, drawn to scale. Its front wheels turn with the recorded steering.', on: true, alpha: 1,
      draw(ctx, z) { drawCar(ctx, fp, RV.colMap(S.sel[0]), z, S.carScale[S.sel[0]]); } },
    { id: 'slowcorner', g: 'Car and path', label: 'Slowest corner', d: 'A pin marking the slowest corner of the selected run.', on: true, alpha: 1, draw(ctx, z) {
      const R = S.R; if (!R || !R.sum || !R.sum.slow || !R.x) return;
      const k = R.sum.slow_at || 0;
      ctx.beginPath(); ctx.arc(R.x[k], R.y[k], 6 / z, 0, 7);
      ctx.fillStyle = RV.pal['best']; ctx.fill();
      ctx.beginPath(); ctx.arc(R.x[k], R.y[k], 9 / z, 0, 7);
      ctx.strokeStyle = RV.pal['surface']; ctx.lineWidth = 2 / z; ctx.stroke();
    }, screen(ctx, w2s) {
      const R = S.R; if (!R || !R.sum || !R.sum.slow || !R.x || view.z < 0.8) return;
      const k = R.sum.slow_at || 0, p = w2s(R.x[k], R.y[k]);
      ctx.font = '600 11px ' + RV.pal.fontNum;
      const s = R.sum.slow.toFixed(0) + ' km/h', w = ctx.measureText(s).width;
      ctx.fillStyle = RV.pal.best; ctx.beginPath(); ctx.roundRect(p[0] + 12, p[1] - 9, w + 10, 18, 4); ctx.fill();
      ctx.fillStyle = RV.pal.surface; ctx.fillText(s, p[0] + 17, p[1] + 3);
    } },
    { id: 'speed', g: 'Car and path', label: 'Speed label', d: 'The current speed, written next to the car.', on: true, alpha: 1, draw() {}, screen(ctx, w2s) {
      const R = S.R, p = w2s(fp[0], fp[1]), s = R.v[S.i].toFixed(0) + ' km/h';
      ctx.font = '600 14px ' + RV.pal.fontNum;
      const w = ctx.measureText(s).width, o = 12 + 1.3 * view.z;
      ctx.fillStyle = RV.pal['label-bg']; ctx.beginPath(); ctx.roundRect(p[0] + o, p[1] - 11, w + 14, 22, 5); ctx.fill();
      ctx.fillStyle = RV.pal['label-ink']; ctx.fillText(s, p[0] + o + 7, p[1] + 5);
    } },
    { id: 'beams', g: 'Sensors', label: 'Track beams', d: 'The 19 distance sensors. Each line runs from the car to the track edge it measures; pink is close, cyan is far, faint means nothing within 200 m.', on: true, alpha: 0.95, draw(ctx, z) {
      const R = S.R; if (!R.beams) return;
      beamEnds(R, S.i, (d, ex, ey, hit) => { ctx.beginPath(); ctx.moveTo(fp[0], fp[1]); ctx.lineTo(ex, ey); ctx.lineWidth = (hit ? this.w : this.w * 0.6) / z; ctx.strokeStyle = RV.beamCol(d, hit ? 1 : 0.3); ctx.stroke(); });
    } },
    { id: 'hits', g: 'Sensors', label: 'Beam end points', d: 'A dot where each beam meets the track edge.', on: true, alpha: 1, draw(ctx, z) {
      const R = S.R; if (!R.beams) return;
      beamEnds(R, S.i, (d, ex, ey, hit) => { if (!hit) return; ctx.beginPath(); ctx.arc(ex, ey, 3.2 / z, 0, 7); ctx.fillStyle = RV.beamCol(d, 1); ctx.fill(); });
    } },
    { id: 'focus', g: 'Sensors', label: 'Focus rays', d: 'Five extra rays the car can aim once a second. Dashed; shown briefly when a look is taken.', on: true, alpha: 1, draw(ctx, z) {
      const R = S.R, i = S.i;
      let q = null, fk = 0;
      for (let k = i; k >= Math.max(0, i - 12); k--) if (R.foc[k]) { q = R.foc[k]; fk = k; break; }
      if (!q) return;
      ctx.globalAlpha *= (1 - (i - fk) / 14); ctx.setLineDash([5 / z, 4 / z]);
      for (let k = 0; k < 5; k++) {
        const d = q[k + 1];
        if (d < 0) continue;
        const a = R.yaw[fk] - (q[0] + k - 2) * Math.PI / 180, ex = R.x[fk] + d * Math.cos(a), ey = R.y[fk] + d * Math.sin(a);
        ctx.beginPath(); ctx.moveTo(R.x[fk], R.y[fk]); ctx.lineTo(ex, ey); ctx.lineWidth = this.w / z; ctx.strokeStyle = RV.beamCol(d, 1); ctx.stroke();
        if (d < 199.5) { ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(ex, ey, 4 / z, 0, 7); ctx.strokeStyle = RV.pal['label-ink']; ctx.lineWidth = 1.2 / z; ctx.stroke(); ctx.restore(); }
      }
      ctx.setLineDash([]);
    } },
    { id: 'lineB', g: 'Compared runs', label: 'Their driven lines', d: 'The path of each compared run, in that run\u2019s colour.', on: true, alpha: 0.9, cmp: true, draw(ctx, z) {
      for (const m of others()) drawSolid(ctx, m.r, RV.ghostIdx(m.r), z, (this.w + 2) / z, this.w / z, RV.pal['car-line'], RV.colMap(m.id));
    } },
    { id: 'ghost', g: 'Compared runs', label: 'Their cars', d: 'One car per compared run, in that run\u2019s colour.', on: true, alpha: 0.9, cmp: true, draw(ctx, z) {
      for (const m of others()) drawCar(ctx, ghostPose(m.r), RV.colMap(m.id), z, S.carScale[m.id]);
    } },
  ];
  const BEAMS_TIP = '19 distance sensors pointing outward from the car nose';
  const LY = {};
  /* line widths in screen pixels, for the layers that are lines; a layer without one has no width slider */
  const WIDTHS = { edges: 1.6, centre: 1, finish: 3, marks: 1, sectors: 2.5, line: 3, beams: 1.6, focus: 2, lineB: 1.8 };
  const WMIN = 0.5, WMAX = 8;
  /* notes a layer's defaults (on0, alpha0, w0) so "Restore the default layers" can go back to them */
  function enrol(L) { if (L.w == null && WIDTHS[L.id]) L.w = WIDTHS[L.id]; if (L.alpha == null) L.alpha = 1; if (L.on == null) L.on = true; LY[L.id] = L; L.on0 = L.on; L.alpha0 = L.alpha; L.w0 = L.w; }
  LAYERS.forEach(enrol);
  /* the track itself never changes during a replay; everything else moves. The car in focus is drawn last, on top. */
  /* A layer is static if it only depends on the track (group Track, or still: true): those are painted once and kept. */
  const isStatic = L => (L.still != null ? L.still : L.g === 'Track');
  let STATIC = [], MOVING = [];
  function sortLayers() { STATIC = LAYERS.filter(isStatic); MOVING = LAYERS.filter(L => !isStatic(L) && L.id !== 'car').concat(LAYERS.filter(L => L.id === 'car')); }
  sortLayers();
  const OVER = [
    { id: 'hud', label: 'Readout', d: 'The box of numbers, top left.', on: true, alpha: 1, solo: false },
    { id: 'mini', label: 'Overview map', d: 'The small map of the whole track.', on: true, alpha: 1, solo: false },
    { id: 'leg', label: 'Colour keys', d: 'What the colours mean, top right.', on: true, alpha: 1, solo: false },
    { id: 'inputs', label: 'Wheel and pedals', d: 'The steering wheel turning with the car, its brake and throttle bars, and both over the last seconds, bottom right.', on: true, alpha: 1, solo: 'opt' },
    { id: 'sectorLive', label: 'Live sector table', d: 'The sector times of the car in focus as it passes each sector, against the fastest lap recorded. Under the overview map.', on: true, alpha: 1 },
    { id: 'lapDeltaBar', label: 'Lap delta bar', d: 'Every selected car against the fastest lap recorded, at the same point of the track. Under the sector table.', on: true, alpha: 1, solo: false },
  ];
  const ALL_IN = ['Wheel and pedals of every car', 'A smaller wheel, bars and pedal graph for each compared car, above those of the car in focus. Off: the car in focus only.'];
  /* What the reader last chose on the map (layers, panels, path options, the side panel open or closed) is kept in
     this browser and put back on the next visit. The defaults (on0, alpha0) are noted before that. */
  function saveUi() {
    RV.uiSet('map', { layers: LAYERS.map(L => [L.id, L.on, L.alpha, L.w]), panels: OVER.map(L => [L.id, L.on, L.alpha, L.pos || null, !!L.min, L.solo === true]), opt: Object.assign({}, opt), closed: $('pm').classList.contains('side-closed') });
  }
  /* puts back what was stored for one layer or panel (id), or for all of them */
  function restoreUi(id) {
    const u = RV.uiGet('map', null);
    if (!u) return;
    for (const q of u.layers || []) {
      const L = LY[q[0]];
      if (!L || (id && q[0] !== id)) continue;
      L.on = !!q[1];
      if (q[2] >= 0 && q[2] <= 1) L.alpha = +q[2];
      if (L.w != null && q[3] >= WMIN && q[3] <= WMAX) L.w = +q[3];
    }
    for (const q of u.panels || []) {
      const L = OVER.find(x => x.id === q[0]);
      if (!L || (id && q[0] !== id)) continue;
      L.on = !!q[1];
      if (q[2] >= 0.2 && q[2] <= 1) L.alpha = +q[2];
      L.pos = Array.isArray(q[3]) && q[3].length === 2 && isFinite(q[3][0]) && isFinite(q[3][1]) ? [+q[3][0], +q[3][1]] : null;
      L.min = !!q[4];
      if (L.solo === true || L.solo === false) L.solo = !!q[5];
    }
  }
  (function () {
    const u = RV.uiGet('map', null);
    if (!u) return;
    restoreUi();
    const o = u.opt || {};
    if (['full', 'upto', 'near'].includes(o.line)) opt.line = o.line;
    if (o.lineW >= WMIN && o.lineW <= WMAX && !(u.layers || []).some(q => q[0] === 'line' && q[3])) LY.line.w = +o.lineW;   /* stored before widths were per layer */
    if (o.colour === 'speed' || o.colour === 'brake') opt.colour = o.colour;
    if (typeof o.allInputs === 'boolean') opt.allInputs = o.allInputs;
    if (u.closed) $('pm').classList.add('side-closed');
  })();
  /* ---------- the panels as small windows ----------
     Every panel over the map sits in a wrapper (.win) that can be dragged anywhere on the map and shows three
     buttons when the mouse is over it, as on a Mac window: red closes the panel (it comes back under Layers, Panels
     on the map), yellow folds it into a small tab that opens it again, and green, on the panels that show several
     cars, limits it to the car in focus. Where a panel was put, folded or limited is saved with the layout.
     L.pos: [x, y] in the map, or null while the panel is where the page puts it. L.min: folded. L.solo: only the car
     in focus (for the wheel and pedals that is the option allInputs, so 'opt' stands there). */
  const mapwrap = $('mapwrap');
  let winZ = 5, winDrag = null;
  const winOf = L => $('win-' + L.id);
  const soloOf = L => (L.solo === 'opt' ? !opt.allInputs : L.solo === true);
  function paintWin(L) {
    const w = winOf(L), solo = soloOf(L);
    w.classList.toggle('min', !!L.min); w.classList.toggle('solo', solo);
    const g = w.querySelector('.wb.g');
    if (g) { g.title = solo ? 'Show every car again' : 'Show only the car in focus'; g.setAttribute('aria-label', g.title); g.setAttribute('aria-pressed', solo); }
    const m = w.querySelector('.wb.m');
    m.title = L.min ? 'Open ' + L.label : 'Fold ' + L.label + ' into a tab'; m.setAttribute('aria-label', m.title);
  }
  /* puts every panel where it belongs: a moved one at its place (kept inside the map), the others back in the page's own layout */
  function placeWins() {
    const W = mapwrap.clientWidth, H = mapwrap.clientHeight, over = $('overlay');
    let back = false;                                      /* a window returns to the left column: its order there is put right */
    for (const L of OVER) {
      const w = winOf(L);
      if (!w) continue;
      if (L.pos && W) {
        if (w.parentNode !== mapwrap) mapwrap.appendChild(w);
        const x = RV.clamp(L.pos[0], 0, Math.max(0, W - w.offsetWidth)), y = RV.clamp(L.pos[1], 10, Math.max(10, H - Math.min(w.offsetHeight, 40)));
        w.classList.add('moved'); w.style.left = x + 'px'; w.style.top = y + 'px';
      } else if (!L.pos) {
        w.classList.remove('moved'); w.style.left = w.style.top = w.style.zIndex = '';
        if (w.parentNode !== L.home) { L.home.appendChild(w); back = back || L.home === over; }
      }
    }
    if (back) for (const L of OVER) { const w = winOf(L); if (w && !L.pos && L.home === over) over.appendChild(w); }   /* in the order of the list */
  }
  function wrapPanel(L) {
    const pe = $(L.id), w = el('div', 'win' + (L.solo !== undefined ? ' cansolo' : ''),
      '<div class="winbar"><button class="wb c" title="Close ' + esc(L.label) + '" aria-label="Close ' + esc(L.label) + '"></button><button class="wb m"></button>' + (L.solo !== undefined ? '<button class="wb g"></button>' : '') + '</div>' +
      '<button class="wintab" title="Open ' + esc(L.label) + '">' + esc(L.label) + '</button>');
    w.id = 'win-' + L.id; w.dataset.id = L.id;
    pe.parentNode.insertBefore(w, pe); w.appendChild(pe);
    L.home = w.parentNode;
    w.querySelectorAll('.wb').forEach(b => b.addEventListener('pointerdown', e => e.stopPropagation()));
    w.querySelector('.wb.c').onclick = () => { L.on = false; panels(); saveUi(); if (S.sideTab === 'layers') buildSide(); RV.toast(L.label + ' is off. It comes back under Layers, Panels on the map.'); };
    w.querySelector('.wb.m').onclick = () => { L.min = !L.min; paintWin(L); placeWins(); saveUi(); };
    if (w.querySelector('.wb.g')) w.querySelector('.wb.g').onclick = () => {
      if (L.solo === 'opt') opt.allInputs = !opt.allInputs; else L.solo = !L.solo;
      paintWin(L); if (L.id === 'leg') legend(); saveUi(); if (S.sideTab === 'layers') buildSide();
    };
    /* drag anywhere on the panel; a press on the tab of a folded panel that does not move opens it */
    w.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = w.getBoundingClientRect(), m = mapwrap.getBoundingClientRect();
      winDrag = { L: L, sx: e.clientX, sy: e.clientY, ox: r.left - m.left, oy: r.top - m.top, moved: false, tab: !!(e.target.closest && e.target.closest('.wintab')) };
      /* the window is listened to, not the panel: a panel that leaves the left column is moved in the page, and an element that is moved loses the pointer */
      addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
      e.preventDefault();
    });
    const move = e => {
      const d = winDrag;
      if (!d || d.L !== L) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true; w.classList.add('dragging'); w.style.zIndex = ++winZ;
      const W = mapwrap.clientWidth, H = mapwrap.clientHeight;
      L.pos = [RV.clamp(d.ox + dx, 0, Math.max(0, W - w.offsetWidth)), RV.clamp(d.oy + dy, 10, Math.max(10, H - Math.min(w.offsetHeight, 40)))];
      placeWins();
    };
    const end = () => {
      const d = winDrag;
      removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      if (!d || d.L !== L) return;
      winDrag = null; w.classList.remove('dragging');
      if (d.moved) saveUi(); else if (d.tab) { L.min = false; paintWin(L); placeWins(); saveUi(); }
    };
    paintWin(L);
  }
  OVER.forEach(wrapPanel);
  placeWins();
  const GROUPS = ['Track', 'Car and path', 'Sensors', 'Compared runs', 'Panels on the map'];

  /* ---------- side panel: the same three sections in both views; the detailed view adds controls inside them ---------- */
  function toggleRow(name, desc, on, fn) {
    const r = el('div', 'lr' + (on ? '' : ' off'), '<label class="tg"><input type="checkbox" ' + (on ? 'checked' : '') + ' aria-label="' + esc(name) + '"><span></span></label><div><div class="ln">' + name + '</div><div class="ld">' + desc + '</div></div>');
    r.querySelector('input').onchange = e => { r.classList.toggle('off', !e.target.checked); fn(e.target.checked); saveUi(); };
    return r;
  }
  function slider(row, label, min, max, step, val, fmt, fn) {
    const o = el('div', 'lo', '<small>' + label + '</small><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" aria-label="' + esc(label || 'Value') + '"><span class="num">' + fmt(val) + '</span>');
    o.querySelector('input').oninput = e => { o.lastChild.textContent = fmt(+e.target.value); fn(+e.target.value); saveUi(); };
    row.appendChild(o);
    return o.querySelector('input');
  }
  function segs(items, cur, fn, label) {
    const s = el('div', 'seg full');
    s.setAttribute('role', 'group'); if (label) s.setAttribute('aria-label', label);
    for (const it of items) {
      const b = el('button', it[0] === cur ? 'on' : null, it[1]);
      b.setAttribute('aria-pressed', it[0] === cur);
      b.onclick = () => { s.querySelectorAll('button').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', false); }); b.classList.add('on'); b.setAttribute('aria-pressed', true); fn(it[0]); saveUi(); };
      s.appendChild(b);
    }
    return s;
  }
  /* the selected cars: shows which one is in focus; a row puts that car in focus */
  function carsTable() {
    const sm = RV.simple(), gp = el('div', 'cars'), tb = el('table');
    tb.innerHTML = '<thead><tr><th class="l">Car</th><th>Lap time</th><th>' + (sm ? 'Position' : 'Gap') + '</th><th>Speed</th></tr></thead><tbody></tbody>';
    S.sel.forEach((id, k) => {
      const run = k === 0 ? S.R : S.CM[k - 1].r;
      const tr = el('tr', k === 0 ? 'foc' : null, '<td class="l"><i style="background:' + RV.col(id) + '"></i><b>' + esc(id) + '</b></td><td class="num">' + RV.fmtLap(RV.lapOf(id)) + '</td><td class="num"></td><td class="num"></td>');
      if (k > 0) { tr.tabIndex = 0; tr.title = 'Put ' + id + ' in focus'; tr.onclick = () => RV.sel.makeRef(id); tr.onkeydown = e => { if (e.key === 'Enter') RV.sel.makeRef(id); }; }
      tb.lastChild.appendChild(tr);
      carCells.push({ r: run, gap: tr.cells[2], spd: tr.cells[3], foc: k === 0 });
    });
    gp.appendChild(tb);
    gp.appendChild(el('p', 'note', 'Click a row to put that car in focus. ' + (sm ? 'Position' : 'Gap') + ' is measured against the car in focus, at the same point on the track.'));
    return gp;
  }
  function maxZoomRow(desc) {
    const r = el('div', 'lr', '<span></span><div><div class="ln">Closest zoom</div><div class="ld">' + desc + '</div></div>');
    slider(r, '', 0, 3.7, 0.01, Math.log(view.maxAll).toFixed(2), v => Math.exp(v).toFixed(1) + ' px/m', v => { view.maxAll = Math.exp(v); });
    return r;
  }
  function viewSection(s, sm) {
    const many = S.CM.length > 0;
    s.appendChild(toggleRow('Follow car', sm ? 'Keeps the car in the middle of the view.' : 'Keeps the car in focus in the same place on screen. Switches off by itself when you drag the map.', view.follow, v => { setFollow(v); if (!v) view.all = false; buildSide(); }));
    s.appendChild(toggleRow('Car points up', sm ? 'Turns the map so the car always drives toward the top.' : 'Rotates the map so the car in focus always drives toward the top. Turn off for a fixed map.', view.rot, setRot));
    /* always listed, so it can be found; it needs a comparison to do anything */
    const all = toggleRow('Keep all cars in view', many ? 'Moves and zooms the map so every selected car stays on screen. Switches “Follow car” on with it.' : 'Needs two or more cars: select several versions on the Versions tab to compare them.', many && view.all, setAll);
    if (!many) { all.classList.add('off'); all.querySelector('input').disabled = true; }
    s.appendChild(all);
    if (many && view.all) s.appendChild(maxZoomRow('How far the view may zoom in when the cars are close together. The mouse wheel and the zoom keys are off in this mode.'));
    else if (!sm) {
      const zr = el('div', 'lr', '<span></span><div><div class="ln">Zoom</div><div class="ld">Also the mouse wheel, or the + and − keys.</div></div>');
      s.appendChild(zr);
      const f = v => Math.exp(v).toFixed(1) + ' px/m';
      zoomInput = slider(zr, '', -2.5, 4, 0.01, Math.log(view.z).toFixed(2), f, v => { const b = base(); zoomAt(b[0] + view.ox, b[1] + view.oy, Math.exp(v) / view.z); });
      zoomInput._fmt = f;
    }
    const br = el('div', 'btnrow'), b1 = el('button', 'btn', 'Back to the car'), b2 = el('button', 'btn', 'Whole track');
    b1.onclick = resetView; b2.onclick = fitView; br.appendChild(b1); br.appendChild(b2); s.appendChild(br);
  }
  /* the Cars tab: who is on the track (a row puts that car in focus), where compared cars are placed, and the size of each */
  function carsSection(s, sm) {
    const many = S.CM.length > 0;
    if (many) s.appendChild(carsTable());
    else s.appendChild(el('p', 'note', 'One car is on the track. Select several versions on the Versions page to compare them: they are listed here, each with its gap to the car in focus.'));
    if (many && !sm) {
      const o = el('div', 'opt', '<div class="cap">Where the other cars are placed. Same lap time shows who is ahead; same distance shows the difference in line.</div>');
      o.appendChild(segs([['t', 'Same lap time'], ['d', 'Same distance']], RV.prefs.sync, v => { RV.prefs.sync = v; RV.savePrefs(); }, 'Where the other cars are placed'));
      s.appendChild(o);
    }
    /* per-car size sliders: shown in both basic and detailed view */
    {
      const sc = el('div', 'opt');
      sc.innerHTML = '<div class="cap">Car size (1 = true scale)</div>';
      const allIds = [S.sel[0]].concat(S.CM.map(m => m.id));
      for (const id of allIds) {
        const cur = S.carScale[id] || RV.prefs.carSize;
        const row = el('div', 'carsize', '<i class="sw" style="background:' + RV.col(id) + '"></i><b>' + esc(id) + '</b>' +
          '<input type="range" min="0.3" max="4" step="0.1" value="' + cur.toFixed(1) + '" aria-label="Car size for ' + esc(id) + '"><span class="num">' + cur.toFixed(1) + '×</span>');
        row.querySelector('input').oninput = e => { S.carScale[id] = +e.target.value; RV.uiSet('carScale', S.carScale); e.target.nextSibling.textContent = (+e.target.value).toFixed(1) + '×'; };
        const resetBtn = el('button', 'btn sm', 'Reset');
        resetBtn.onclick = () => { delete S.carScale[id]; RV.uiSet('carScale', S.carScale); buildSide(); };
        row.appendChild(resetBtn); sc.appendChild(row);
      }
      const resetAll = el('button', 'btn wide', 'Reset all car sizes');
      resetAll.onclick = () => { S.carScale = {}; RV.uiSet('carScale', S.carScale); buildSide(); };
      sc.appendChild(resetAll);
      s.appendChild(sc);
    }
  }
  function layersSection(s, sm) {
    const many = S.CM.length > 0;
    if (sm) {
      const sb = toggleRow('Sensor beams', 'The lines from the car to the edges of the road.', LY.beams.on, v => { LY.beams.on = LY.hits.on = LY.focus.on = v; });
      sb.title = BEAMS_TIP; s.appendChild(sb);
      s.appendChild(toggleRow('Driven path', 'The line the car drove, coloured by its speed.', LY.line.on, v => { LY.line.on = v; }));
      s.appendChild(toggleRow('Distance marks', 'A label every 100 m along the track.', LY.marks.on, v => { LY.marks.on = v; }));
      if (many) s.appendChild(toggleRow('The other cars', 'The cars and paths of the other selected versions.', LY.ghost.on, v => { LY.ghost.on = LY.lineB.on = v; }));
      s.appendChild(toggleRow('Wheel and pedals', 'The steering wheel and the throttle and brake graph, bottom right.', OVER[3].on, v => { OVER[3].on = v; panels(); }));
      if (many) s.appendChild(toggleRow(ALL_IN[0], ALL_IN[1], opt.allInputs, v => { opt.allInputs = v; paintWin(OVER[3]); }));
      return;
    }
    /* detailed: one group open at a time */
    for (const G of GROUPS) {
      if (G === 'Compared runs' && !many) continue;
      const open = S.layerGroup === G, items = G === 'Panels on the map' ? OVER : LAYERS.filter(L => L.g === G);
      const head = el('button', 'acc' + (open ? ' open' : ''), '<span>' + G + '</span><small>' + items.filter(L => L.on).length + ' of ' + items.length + ' on</small>');
      head.setAttribute('aria-expanded', open);
      head.onclick = () => { S.layerGroup = open ? '' : G; RV.uiSet('layerGroup', S.layerGroup); buildSide(); };
      s.appendChild(head);
      if (!open) continue;
      const body = el('div', 'accbody');
      s.appendChild(body);
      const count = () => { head.lastChild.textContent = items.filter(L => L.on).length + ' of ' + items.length + ' on'; };
      if (G === 'Panels on the map') {
        for (const L of OVER) {
          const r = toggleRow(L.label, L.d, L.on, v => { L.on = v; panels(); count(); });
          slider(r, 'Opacity', 0.2, 1, 0.05, L.alpha, v => Math.round(v * 100) + ' %', v => { L.alpha = v; panels(); });
          body.appendChild(r);
          if (L.id === 'inputs' && many) body.appendChild(toggleRow(ALL_IN[0], ALL_IN[1], opt.allInputs, v => { opt.allInputs = v; paintWin(OVER[3]); }));
        }
        continue;
      }
      for (const L of items) {
        const r = toggleRow(L.label, L.d, L.on, v => { L.on = v; count(); });
        if (L.id === 'beams') r.title = BEAMS_TIP;
        slider(r, 'Opacity', 0, 1, 0.05, L.alpha, v => Math.round(v * 100) + ' %', v => { L.alpha = v; });
        if (L.w != null) slider(r, 'Width', WMIN, WMAX, 0.1, L.w, v => v.toFixed(1) + ' px', v => { L.w = v; });
        body.appendChild(r);
        if (L.id === 'line') {
          const o = el('div', 'opt', '<div class="cap">How much of the line to draw</div>');
          o.appendChild(segs([['full', 'Whole lap'], ['upto', 'Up to the car'], ['near', 'Near the car']], opt.line, v => { opt.line = v; }, 'How much of the line to draw'));
          body.appendChild(o);
        }
      }
    }
    const rb = el('button', 'btn wide', 'Restore the default layers');
    rb.onclick = defaults;
    s.appendChild(rb);
  }
  /* sector times on the Track tab: where the car is now, and the table of every opened version */
  function sectorsSection(s, sm) {
    if (sm) {
      s.appendChild(el('div', 'guide', '<h4>Sector times</h4><p>The lap is split into three sectors. Their times, the differences between versions and the best theoretical lap are part of the detailed view.</p>'));
      const b = el('button', 'btn prim wide', 'Switch to the detailed view');
      b.onclick = () => RV.setView('detailed');
      s.appendChild(b);
      return;
    }
    const R = S.R, sc = S.ds.trk && S.ds.trk.sectors;
    if (!R || !R.sec || !sc) { s.appendChild(el('p', 'note', R ? 'This run has no position on the track map, so it has no sector times.' : 'Select a version to see its sector times.')); return; }
    s.appendChild(el('div', 'secnow', '<span>Car in focus is in</span><b id="secNow" class="num"></b>'));
    const t = el('div', 'secside', RV.sectors.table(true) + '<p class="note">' + RV.sectors.NOTE + ' A version joins the table when its recording is opened: select or compare it on the Versions tab.</p>' +
      '<p class="note">' + sc.where.map((w, k) => '<b>S' + (k + 1) + '</b> ' + esc(w)).join('. ') + '.</p>');
    s.appendChild(t);
    RV.sectors.wire(t);
  }
  /* what the two views start with: the basic view shows the car and its path, without the sensor beams and their end points */
  /* force: the view was switched, or the defaults were asked for. Otherwise (a data set opens) a stored choice of layers stands. */
  function viewDefaults(force) {
    if (!force && RV.uiGet('map', null)) return;
    const on = !RV.simple(); LY.beams.on = LY.hits.on = LY.focus.on = on;
    if (force) saveUi();
  }
  /* every layer, panel and path option back to how the page comes */
  function defaults() {
    LAYERS.forEach(L => { L.on = L.on0; L.alpha = L.alpha0; L.w = L.w0; }); OVER.forEach(L => { L.on = true; L.alpha = 1; L.pos = null; L.min = false; if (L.solo === true) L.solo = false; });
    opt.line = 'upto'; opt.colour = 'speed'; opt.allInputs = true; stepColsKey = ''; if (S.R) delete S.R._bk;
    OVER.forEach(paintWin); placeWins();
    viewDefaults(true); legend(); panels(); buildSide();
  }
  function helpSection(s, sm) {
    const R = S.R, many = S.CM.length > 0;
    s.appendChild(el('div', 'guide',
      '<h4>What you are looking at</h4><p>The car replays the recorded lap of the selected version. The coloured path is the line it drove: red where it was slowest, green where it was fastest.</p>' +
      '<p>The lines fanning out from the car are its sensors (switch them on under Layers if they are hidden). Each measures how far it is to the edge of the road in that direction: pink means the edge is close, cyan means it is far away.</p>' +
      (R && !R.beams ? '<p class="warn">This recording has no sensor columns, so only the path is shown.</p>' : '') +
      '<h4>Moving around</h4><p>Drag to move the map and use the mouse wheel to zoom. Double-click to return to the car.' + (many ? ' Click another car, its name in the top bar, or its row under Cars, to put it in focus.' : '') + '</p>' +
      '<h4>Keys</h4><dl class="keys"><dt>' + RV.kbd('play') + '</dt><dd>play or pause</dd><dt>' + RV.kbd('back') + ' ' + RV.kbd('fwd') + '</dt><dd>one step; hold for 0.1&times;, then 0.25&times;, then 0.5&times;</dd>' +
      '<dt>' + RV.kbd('zoomin') + ' ' + RV.kbd('zoomout') + '</dt><dd>zoom</dd><dt>' + RV.kbd('follow') + '</dt><dd>follow the car, or stop following</dd><dt>' + RV.kbd('home') + '</dt><dd>back to the start of the lap</dd>' +
      '<dt>' + RV.kbd('endloop') + '</dt><dd>end the loop over a section</dd></dl><p class="note">The keys can be changed under Settings, Controls.</p>'));
    const all = el('button', 'btn wide', 'Open the full help');
    all.onclick = () => RV.help.open();
    s.appendChild(all);
  }
  function buildSide() {
    const s = $('side'), sm = RV.simple();
    s.innerHTML = ''; zoomInput = null; carCells = [];
    if (!S.ds) return;
    /* how the driven line is coloured: always at hand, in both views */
    const pc = el('div', 'pathcol', '<span>Path colour</span>');
    pc.appendChild(segs([['speed', 'Speed'], ['brake', 'Brake']], opt.colour, v => { opt.colour = v; stepColsKey = ''; if (S.R) delete S.R._bk; legend(); }, 'Colour the driven path by'));
    s.appendChild(pc);
    const tabs = el('div', 'seg full subtabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [['view', 'Camera'], ['cars', 'Cars'], ['layers', 'Layers'], ['sectors', 'Sectors'], ['help', 'Help']]) {
      const b = el('button', S.sideTab === id ? 'on' : null, label);
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', S.sideTab === id);
      b.onclick = () => { S.sideTab = id; RV.uiSet('sideTab', id); buildSide(); };
      tabs.appendChild(b);
    }
    s.appendChild(tabs);
    const body = el('div', 'sidebody');
    s.appendChild(body);
    if (S.sideTab === 'view') viewSection(body, sm); else if (S.sideTab === 'cars') carsSection(body, sm); else if (S.sideTab === 'layers') layersSection(body, sm); else if (S.sideTab === 'sectors') sectorsSection(body, sm); else helpSection(body, sm);
    secNow = '';
    message();
  }
  function panels() {
    for (const L of OVER) {
      const show = L.on && onMap();
      const w = winOf(L);
      w.style.opacity = L.alpha < 1 ? L.alpha : '';
      w.style.display = show ? '' : 'none';                /* the window; inside it the panel may still hide itself */
      if (L.solo === 'opt') paintWin(L);
      if (L.id === 'sectorLive' || L.id === 'lapDeltaBar') {
        /* these are shown/hidden by their draw functions to account for missing data;
           panels() only hides them when the layer is turned off or no run is loaded */
        if (!show) $(L.id).hidden = true;
      } else {
        $(L.id).style.display = '';
      }
    }
  }

  /* what the map says when it cannot draw the run */
  function message() {
    const m = $('mapmsg'), R = S.R;
    let h = '';
    if (!S.ds) h = '';
    else if (!S.ds.trk) h = '<h3>No track map</h3><p>' + esc(S.ds.trkNote) + '</p><p class="note">The Versions and Telemetry tabs work without it.</p>';
    else if (!R) h = '';                                  /* the canvas says what to do (draw) */
    else if (!R.x) h = '<h3>This run does not fit the track map</h3><p>The run covers ' + RV.fmtInt(R.maxS) + ' m of track, but the map in use (' + esc(RV.track.title(S.ds.trk)) +
      (S.ds.trkOwn ? ', from the source\u2019s track.xml' : ', bundled with this page') + ') is ' + S.ds.trk.total.toFixed(1) + ' m long.</p><p>' +
      (S.ds.trkOwn ? 'The track.xml in the source is not the track these runs were driven on.' : 'The source needs its own <b>track.xml</b>: the ' + RV.TORCS + ' track file of the track the runs were driven on, at the root of the repository or folder.') +
      '</p><p class="note">The run is not drawn on a wrong map. The Versions and Telemetry tabs still work.</p>';
    m.innerHTML = h ? '<div class="card">' + h + '</div>' : '';
    m.style.display = h ? '' : 'none';
    panels();
  }

  /* ---------- camera ---------- */
  function size() { const r = window.devicePixelRatio || 1; if (!c.clientWidth) return; c.width = c.clientWidth * r; c.height = c.clientHeight * r; placeWins(); mapwrap.classList.toggle('cmp', S.CM.length > 0); }
  function base() { const W = c.clientWidth, H = c.clientHeight; return [W / 2, (view.follow && view.rot) ? H * 0.64 : H / 2]; }
  function carsNow() {
    /* every car where it is drawn: smoothed between steps, the compared cars as well as the one in focus */
    const p = poseAt(S.R, S.i, S.camFrac);
    return [{ id: S.sel[0], x: p[0], y: p[1] }].concat(others().map(m => { const q = ghostPose(m.r); return { id: m.id, x: q[0], y: q[1] }; }));
  }
  /* centre and zoom that keep every selected car on screen, in the frame rotated by a; smoothed so it does not jump */
  function frameAll(a, W, H) {
    const ca = Math.cos(a), sa = Math.sin(a);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of carsNow()) { const rx = p.x * ca - p.y * sa, ry = p.x * sa + p.y * ca; x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); y0 = Math.min(y0, ry); y1 = Math.max(y1, ry); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, cx = mx * ca + my * sa, cy = -mx * sa + my * ca;
    const zt = RV.clamp(Math.min((W - 200) / Math.max(x1 - x0, 1), (H - 220) / Math.max(y1 - y0, 1)), 0.08, view.maxAll);
    if (!view.sInit) { view.sz = zt; view.scx = cx; view.scy = cy; view.sInit = true; }
    else { view.sz += (zt - view.sz) * 0.12; view.scx += (cx - view.scx) * 0.3; view.scy += (cy - view.scy) * 0.3; }
    return [[view.scx, view.scy], view.sz];
  }
  const autoZoom = () => view.follow && view.all && others().length > 0;   /* zoom is set by the keep-all camera: manual zoom is off */
  function zoomAt(mx, my, k) {
    const z2 = RV.clamp(view.z * k, 0.08, 55), kk = z2 / view.z, b = base();
    view.ox = (mx - b[0]) * (1 - kk) + view.ox * kk; view.oy = (my - b[1]) * (1 - kk) + view.oy * kk; view.z = z2; view.fit = false;
  }
  /* freeze the view exactly as it is now and hand it to the user */
  function detach() {
    if (!lastCam || (!view.follow && !view.rot)) return;
    const nb = [c.clientWidth / 2, c.clientHeight / 2];
    view.ox = lastCam.b[0] + view.ox - nb[0]; view.oy = lastCam.b[1] + view.oy - nb[1];
    view.cx = lastCam.ce[0]; view.cy = lastCam.ce[1]; view.ang = lastCam.a; view.z = lastCam.z;
    view.follow = false; view.rot = false; view.all = false;
    buildSide();
  }
  function setRot(v) { view.rot = v; view.ang = 0; if (v) view.fit = false; }
  /* keeping every car in view is a way of following, so switching it on switches "Follow car" on with it */
  function setAll(v) { if (v && !view.follow) setFollow(true); view.all = v; view.sInit = false; view.ox = view.oy = 0; buildSide(); }
  function setFollow(v) { if (v) { view.ang = 0; view.fit = false; if (view.z < 1) view.z = 3.2; } view.follow = v; if (!v && onMap()) { view.cx = S.R.x[S.i]; view.cy = S.R.y[S.i]; } view.ox = view.oy = 0; }
  function resetView() { view.follow = true; view.rot = true; view.fit = false; view.all = false; view.z = 3.2; view.ox = view.oy = 0; buildSide(); }
  /* the whole track, centred in the part of the map that the panels on the left do not cover */
  function applyFit(W, H) {
    const B = trk().box, left = (W > 900 && OVER[0].on) ? 250 : 0;
    view.cx = (B[0] + B[1]) / 2; view.cy = (B[2] + B[3]) / 2; view.ang = 0; view.ox = left / 2; view.oy = 0;
    view.z = Math.min((W - left) / (B[1] - B[0]), H / (B[3] - B[2])) * 0.9;
  }
  function fitView() { view.follow = false; view.rot = false; view.all = false; view.fit = true; buildSide(); }

  /* ---------- the frame ---------- */
  function draw() {
    const P = RV.pal, r = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight, R = S.R, i = S.i;
    if (!W) return;
    if (c.width !== Math.round(W * r) || c.height !== Math.round(H * r)) size();
    g.setTransform(r, 0, 0, r, 0, 0); g.fillStyle = P['map-bg']; g.fillRect(0, 0, W, H);
    if (!R) {                                             /* no run selected: say how to begin */
      if (S.ds && S.ds.trk) {
        g.fillStyle = P['ink-2']; g.font = '600 ' + Math.max(15, Math.min(22, W / 36)) + 'px ' + P.font; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('Select a version on the Versions tab to begin replay', W / 2, H / 2, W - 48);
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      }
      return;
    }
    if (!onMap()) return;
    if (view.fit && !view.follow) applyFit(W, H);
    const many = others().length > 0;
    /* smooth motion: at 1× and slower the car, its beams and the camera move between the recorded steps */
    const sc = fp = poseAt(R, i, S.camFrac);
    const a = view.rot ? Math.PI / 2 - sc[2] : view.ang;
    let b = base(), ce = view.follow ? [sc[0], sc[1]] : [view.cx, view.cy];
    if (view.follow && view.all && many) { const f = frameAll(a, W, H); ce = f[0]; view.z = f[1]; b = [W / 2, H / 2]; }
    const z = view.z;
    lastCam = { b: b, ce: ce, a: a, z: z };
    const ca = Math.cos(a), sa = Math.sin(a);
    const w2s = (x, y) => { const dx = x - ce[0], dy = y - ce[1]; return [b[0] + view.ox + (dx * ca - dy * sa) * z, b[1] + view.oy - (dx * sa + dy * ca) * z]; };
    cam = w2s;
    /* what can be on screen: a circle round the camera's centre that covers the canvas */
    const off = Math.hypot(W / 2 - b[0] - view.ox, H / 2 - b[1] - view.oy), rad = (Math.hypot(W, H) / 2 + off) / z + 20;
    near = { x: ce[0], y: ce[1], r2: rad * rad };
    const world = ctx => { ctx.setTransform(r, 0, 0, r, 0, 0); ctx.translate(b[0] + view.ox, b[1] + view.oy); ctx.scale(z, -z); ctx.rotate(a); ctx.translate(-ce[0], -ce[1]); };
    const paint = (ctx, set) => {
      world(ctx);
      for (const L of set) { if (!L.on || (L.cmp && !many)) continue; ctx.globalAlpha = L.alpha; L.draw(ctx, z); }
      ctx.globalAlpha = 1; ctx.setTransform(r, 0, 0, r, 0, 0);
      for (const L of set) if (L.on && L.screen && !(L.cmp && !many)) { ctx.globalAlpha = L.alpha; L.screen(ctx, w2s); }
      ctx.globalAlpha = 1;
    };
    if (view.follow) paint(g, STATIC);                    /* the camera moves every frame: nothing to keep */
    else {
      /* the camera stands still: the track is painted once into a spare canvas and copied from it each frame */
      const key = [c.width, c.height, z, view.ox, view.oy, ce[0], ce[1], a, RV.themeRev, RV.simple(), trk().total, STATIC.map(L => L.on + ':' + L.alpha + ':' + L.w).join()].join('|');
      if (key !== bufKey) {
        buf.width = c.width; buf.height = c.height;
        bg.setTransform(r, 0, 0, r, 0, 0); bg.fillStyle = P['map-bg']; bg.fillRect(0, 0, W, H);
        paint(bg, STATIC); bufKey = key;
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(buf, 0, 0);
    }
    paint(g, MOVING);
    /* loop focus dimming: if a loop is active, dim everything outside the loop track region */
    if (S.loop && trk()) {
      const lp = S.loop, T = trk(), hw = T.hw;
      const step = Math.max(2, Math.floor(2 / z));          /* sample every few metres */
      /* build a road-strip polygon for the loop range: left edge forward, right edge backward */
      const leftPts = [], rightPts = [];
      for (let d = lp[0]; d <= lp[1] + step; d += step) {
        const dd = Math.min(d, lp[1]);
        const p = RV.track.pose(T, dd), sn2 = Math.sin(p[2]), cs2 = Math.cos(p[2]);
        leftPts.push(w2s(p[0] - hw * sn2, p[1] + hw * cs2));
        rightPts.push(w2s(p[0] + hw * sn2, p[1] - hw * cs2));
      }
      if (leftPts.length >= 2) {
        /* even-odd path: outer rect punches the loop strip out of the dim overlay */
        g.setTransform(r, 0, 0, r, 0, 0);
        g.save();
        g.beginPath();
        g.rect(0, 0, W, H);                                 /* outer rect covers the whole canvas */
        g.moveTo(leftPts[0][0], leftPts[0][1]);
        for (const p of leftPts) g.lineTo(p[0], p[1]);
        for (let k = rightPts.length - 1; k >= 0; k--) g.lineTo(rightPts[k][0], rightPts[k][1]);
        g.closePath();
        g.fillStyle = 'rgba(0,0,0,' + RV.prefs.loopDim + ')';         /* how dark: Settings, Replay */
        g.fill('evenodd');
        g.restore();
      }
    }
    const sn = secNow !== null && document.getElementById('secNow');
    if (sn && R.sec) {                                    /* the Sectors section of the side panel: where the car is now */
      const cu = trk().sectors.cuts, k = R.d[i] < cu[0] ? 0 : R.d[i] < cu[1] ? 1 : 2, t0 = k === 0 ? 0 : k === 1 ? R.sec[0] : (R.sec[0] != null && R.sec[1] != null ? R.sec[0] + R.sec[1] : null);
      const txt = 'S' + (k + 1) + (t0 != null ? ' \u00b7 ' + Math.max(0, R.t[i] - t0).toFixed(1) + ' s in' : '');
      if (txt !== secNow) { sn.textContent = txt; secNow = txt; }
    }
    const sm = RV.simple(), gapTxt = gp => sm ? (Math.abs(gp) < 0.005 ? 'level' : Math.abs(gp).toFixed(2) + ' s ' + (gp > 0 ? 'behind' : 'ahead')) : RV.sgn(gp, 2) + ' s';
    for (const q of carCells) {
      const ga = q.foc ? 'in focus' : gapTxt(q.r.t[RV.idxAtD(q.r, R.d[i])] - R.t[i]), sp = (q.foc ? R.v[i] : q.r.v[RV.ghostIdx(q.r)]).toFixed(0) + ' km/h';
      if (q.ga !== ga) { q.gap.textContent = ga; q.ga = ga; }                    /* the page is touched only when a value changes */
      if (q.sp !== sp) { q.spd.textContent = sp; q.sp = sp; }
    }
    if (zoomInput && document.activeElement !== zoomInput) { const lv = Math.log(z).toFixed(2); if (zoomInput.value !== lv) { zoomInput.value = lv; zoomInput.nextSibling.textContent = zoomInput._fmt(+lv); } }
    if (OVER[3].on) RV.inputs.draw([{ id: S.sel[0], r: R, i: i }].concat(opt.allInputs ? S.CM.map(m => ({ id: m.id, r: m.r, i: RV.ghostIdx(m.r) })) : []));
    if (OVER[1].on) drawMini();
    if (OVER[0].on) drawHud(sm, gapTxt);
    if (OVER[4].on) drawSectorLive();
    if (OVER[5].on) drawDeltaBar();
    for (let k = 6; k < OVER.length; k++) if (OVER[k].on && OVER[k].draw) OVER[k].draw(R, i);   /* panels added with addPanel */
  }
  function drawMini() {
    const R = S.R, B = trk().box, P = RV.pal, r = window.devicePixelRatio || 1, cw = mini.clientWidth, chh = mini.clientHeight;
    if (!cw) return;                                      /* hidden, as on a phone-width window */
    if (mini.width !== Math.round(cw * r)) { mini.width = Math.round(cw * r); mini.height = Math.round(chh * r); }
    const ms = Math.min((cw - 20) / (B[1] - B[0]), (chh - 20) / (B[3] - B[2]));
    const place = ctx => { ctx.setTransform(r, 0, 0, r, 0, 0); ctx.translate(cw / 2, chh / 2); ctx.scale(ms, -ms); ctx.translate(-(B[0] + B[1]) / 2, -(B[2] + B[3]) / 2); };
    const key = [mini.width, mini.height, trk().total, RV.themeRev, RV.simple()].join('|');
    if (key !== miniKey) {                                /* the outline is painted once and copied each frame */
      miniBuf.width = mini.width; miniBuf.height = mini.height;
      const mb = miniBuf.getContext('2d');
      const T = trk();
      /* background */
      mb.setTransform(1, 0, 0, 1, 0, 0);
      mb.fillStyle = P['map-bg']; mb.fillRect(0, 0, mini.width, mini.height);
      place(mb);
      /* road surface */
      mb.fillStyle = P.road; mb.fill(trackPaths().road, 'evenodd');
      /* road edges */
      mb.lineWidth = 1 / ms; mb.strokeStyle = P['road-edge']; mb.lineJoin = 'round';
      mb.stroke(trackPaths().left); mb.stroke(trackPaths().right);
      /* sector lines — thick, always shown */
      if (T.sectors) {
        mb.lineWidth = 3.5 / ms; mb.strokeStyle = P.best; mb.lineCap = 'round';
        for (const m of T.sectors.lines) { mb.beginPath(); mb.moveTo(m[0], m[1]); mb.lineTo(m[2], m[3]); mb.stroke(); }
        mb.lineCap = 'butt';
      }
      /* finish line — thick accent line, drawn last so it's on top */
      mb.lineWidth = 3.5 / ms; mb.strokeStyle = P.accent; mb.lineCap = 'round';
      mb.stroke(trackPaths().finish);
      mb.lineCap = 'butt';
      miniKey = key;
    }
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, mini.width, mini.height); mg.drawImage(miniBuf, 0, 0);
    place(mg);
    for (const m of (OVER[1].solo ? [] : others())) { const q = ghostPose(m.r); mg.beginPath(); mg.arc(q[0], q[1], 4.5 / ms, 0, 7); mg.fillStyle = RV.col(m.id); mg.fill(); }
    mg.beginPath(); mg.arc(fp[0], fp[1], 5.5 / ms, 0, 7); mg.fillStyle = RV.col(S.sel[0]); mg.fill(); mg.lineWidth = 1.5 / ms; mg.strokeStyle = P.surface; mg.stroke();
  }
  function drawHud(sm, gapTxt) {
    const R = S.R, i = S.i, kv = [];
    const add = (k, v, tip) => kv.push('<dt' + (tip ? ' title="' + tip + '"' : '') + '>' + k + '</dt><dd class="num">' + v + '</dd>');
    add('Distance', R.s[i].toFixed(0) + ' m');
    if (!sm) {
      add('Plan allows', R.al[i] > 350 || !R.al[i] ? 'no limit' : R.al[i].toFixed(0) + ' km/h');
      add('Track position', R.tp[i].toFixed(2), 'Track position: 0 = centre, \u00b11 = edge');
      if (R.beams) { let mn = 1e9, mx = -1; for (let k = 0; k < 19; k++) { const d = R.b[i * 19 + k]; if (d >= 0) { mn = Math.min(mn, d); mx = Math.max(mx, d); } } add('Beams', mx < 0 ? 'off track' : mn.toFixed(0) + ' to ' + mx.toFixed(0) + ' m'); }
    }
    for (const m of (OVER[0].solo ? [] : S.CM)) add('<i class="sw" style="background:' + RV.col(m.id) + '"></i>' + esc(m.id), gapTxt(m.r.t[RV.idxAtD(m.r, R.d[i])] - R.t[i]) + (sm ? '' : ' &nbsp; ' + m.r.v[RV.ghostIdx(m.r)].toFixed(0) + ' km/h'));
    const doing = R.br[i] > 0 ? 'Braking' : R.th[i] >= 0.99 ? 'Full throttle' : R.th[i] > 0.05 ? 'Part throttle' : 'Coasting';
    const html = '<div class="big num">' + R.v[i].toFixed(0) + '<small>km/h</small></div><div class="who"><i class="sw" style="background:' + RV.col(S.sel[0]) + '"></i>' + esc(R.name) + '</div><div class="hud-doing">' + doing + '</div><dl class="kv">' + kv.join('') + '</dl>';
    if (html !== hudHtml) { $('hud').innerHTML = html; hudHtml = html; }
  }
  /* ---------- the reference lap of the sector table and the delta bar ----------
     Always the fastest lap ever recorded: the fastest lap time among the versions that have a recording
     (S.ds.fastId), whether or not that version is selected. Its recording is read in the background the first
     time it is needed; until it arrives, the fastest lap among the runs already loaded stands in. A loaded
     recording that is faster still (a manual lap) takes its place. The car in focus wins a tie. */
  function fastestRun() {
    const ds = S.ds, v = ds.fastId && ds.byId[ds.fastId];
    if (v && v.file && !v.bad && !v.sum && !v.fastTried) { v.fastTried = true; ds.loadRun(v.id).catch(() => {}); }
    let best = null, bestLap = Infinity;
    const consider = run => { if (run && run.sum && run.sum.lap != null && run.sum.lap < bestLap) { bestLap = run.sum.lap; best = run; } };
    consider(S.R);
    for (const m of S.CM) consider(m.r);
    for (const run of ds.loaded.values()) consider(run);
    return best;
  }

  function drawSectorLive() {
    const R = S.R, T = trk();
    if (!R || !R.sec || !T || !T.sectors) { slvHtml = ''; $('sectorLive').hidden = true; return; }
    const cu = T.sectors.cuts, d = R.d[S.i], t = R.t[S.i];
    const fast = fastestRun(), ref = fast && fast.sec ? fast.sec : R.sec;    /* the sector times of the fastest lap */
    /* Which sector the car is currently in (0/1/2) based on replay position */
    const curSec = d < cu[0] ? 0 : d < cu[1] ? 1 : 2;
    /* Cumulative lap-time at the start of each sector, computed from replay position.
       Sector k is "crossed" only if the car has already passed its end boundary in the replay. */
    const secCrossed = [d >= cu[0], d >= cu[1], false];  /* S1 done once past cut[0], S2 past cut[1], S3 never "done" mid-lap */
    /* S3 is done only if the lap is complete (lastLapTime row was captured) */
    secCrossed[2] = R.sum && R.sum.lap != null && d >= cu[1] && R.sec[2] != null && t >= (R.sec[0] || 0) + (R.sec[1] || 0) + (R.sec[2] || 0) - 0.1;
    /* Cumulative time at sector start for the live timer */
    const secStart = [
      0,
      secCrossed[0] ? R.sec[0] : null,
      (secCrossed[0] && secCrossed[1] && R.sec[0] != null && R.sec[1] != null) ? R.sec[0] + R.sec[1] : null,
    ];
    let html = '<div class="ldb-ref">\u0394 to ' + esc(fast && fast.sec ? fast.name : R.name) + ', the fastest lap recorded</div><table><thead><tr><th class="l">S</th><th>Time</th><th>\u0394</th></tr></thead><tbody>';
    for (let k = 0; k < 3; k++) {
      const crossed = secCrossed[k];
      const live = !crossed && k === curSec;
      const future = !crossed && !live;
      /* Time: use recorded final time once crossed; live running time while active; blank if not yet reached */
      let secTime = null;
      if (crossed) secTime = R.sec[k];
      else if (live && secStart[k] != null) secTime = Math.max(0, t - secStart[k]);
      const refT = ref ? ref[k] : null;
      /* Delta shown only when the sector is fully crossed (final time known) */
      const delta = (crossed && secTime != null && refT != null) ? (secTime - refT) : null;
      const timeTxt = secTime != null ? secTime.toFixed(2) + ' s' : '\u2014';
      const deltaTxt = delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(2) : '\u2014';
      const dcol = delta != null ? RV.deltaColor(delta) : null;
      const deltaStyle = dcol ? 'background:' + dcol + ';color:var(--panel-ink)' : '';
      const rowDim = future ? ' slv-future' : '';
      const timeCls = 'slv-time' + (live ? ' slv-live' : '');
      html += '<tr class="' + rowDim + '"><td class="l num">S' + (k + 1) + '</td><td class="' + timeCls + '">' + timeTxt + '</td>'
        + '<td class="slv-delta" style="' + deltaStyle + '">' + deltaTxt + '</td></tr>';
    }
    /* Lap total row */
    const lapDone = secCrossed[2];
    const lapTime = lapDone ? R.sum.lap : t;                /* final if done, running if not */
    const refLap = ref && ref.every(x => x != null) ? ref[0] + ref[1] + ref[2] : null;
    const lapDelta = (lapDone && lapTime != null && refLap != null) ? (lapTime - refLap) : null;
    const lapTimeTxt = lapTime != null ? RV.fmtLap(lapTime) : '\u2014';
    const lapDeltaTxt = lapDelta != null ? (lapDelta > 0 ? '+' : '') + lapDelta.toFixed(2) : '\u2014';
    const lapDcol = lapDelta != null ? RV.deltaColor(lapDelta) : null;
    const lapDeltaStyle = lapDcol ? 'background:' + lapDcol + ';color:var(--panel-ink)' : '';
    const lapRowCls = lapDone ? '' : ' slv-lap-live';
    html += '<tr class="slv-lap' + lapRowCls + '"><td class="l num">Lap</td>'
      + '<td class="slv-time' + (lapDone ? '' : ' slv-live') + '">' + lapTimeTxt + '</td>'
      + '<td class="slv-delta" style="' + lapDeltaStyle + '">' + lapDeltaTxt + '</td></tr>';
    html += '</tbody></table>';
    if (html !== slvHtml) { $('sectorLive').innerHTML = html; slvHtml = html; }
    $('sectorLive').hidden = false;
  }

  /* ---------- lap delta bar ---------- */
  /* a run's lap clock at lap distance d, read between the two steps around it */
  function timeAtD(r, d) {
    const j = RV.idxAtD(r, d);
    if (j >= r.n - 1) return r.t[r.n - 1];
    const d0 = r.d[j], d1 = r.d[j + 1];
    return d1 > d0 && d > d0 ? r.t[j] + (r.t[j + 1] - r.t[j]) * (d - d0) / (d1 - d0) : r.t[j];
  }
  function drawDeltaBar() {
    const R = S.R, ref = R && fastestRun();
    if (!ref) { ldbHtml = ''; $('lapDeltaBar').hidden = true; return; }
    const end = ref.d[ref.n - 1], d = Math.min(R.d[S.i], end), tRef = timeAtD(ref, d);   /* not past the reference's last row: rows logged after the line do not count */
    const delta = r => r === ref ? 0 : (r === R && d < end ? R.t[S.i] : timeAtD(r, d)) - tRef;
    /* the car in focus first, then the others from the one furthest ahead */
    const rows = [{ id: S.sel[0], foc: true, delta: delta(R) }].concat(
      (OVER[5].solo ? [] : S.CM).map(m => ({ id: m.id, foc: false, delta: delta(m.r) })).sort((x, y) => x.delta - y.delta));
    let html = '<div class="ldb-ref">\u0394 to ' + esc(ref.name) + ', the fastest lap recorded</div>';
    for (const row of rows) {
      const col = RV.deltaColor(row.delta), txt = (Math.abs(row.delta) < 0.005 ? '' : row.delta > 0 ? '+' : '\u2212') + Math.abs(row.delta).toFixed(2) + ' s';
      html += '<div class="ldb-row' + (row.foc ? ' focused' : '') + '"><span class="ldb-label"><i class="sw" style="background:' + RV.col(row.id) + '"></i>' +
        '<span class="ldb-name">' + esc(row.id) + '</span></span><div class="ldb-track">' + (col ? '<div class="ldb-fill" style="background:' + col + '"></div>' : '') +
        '<span class="ldb-delta num">' + txt + '</span></div></div>';
    }
    if (html !== ldbHtml) { $('lapDeltaBar').innerHTML = html; ldbHtml = html; }
    $('lapDeltaBar').hidden = false;
  }

  function legend() {
    const R = S.R, sm = RV.simple();
    if (!R) { $('leg').innerHTML = ''; return; }
    $('leg').innerHTML = (opt.colour === 'brake'
        ? '<div class="cap">' + (sm ? 'Path colour: braking' : 'Driven line: brake') + '</div><div class="grad brakegrad"></div><div class="ends num"><span>none</span><span>brake</span><span>full</span></div>'
        : '<div class="cap">' + (sm ? 'Path colour: speed' : 'Driven line: speed') + '</div><div class="grad" style="background:' + RV.speedGradient + '"></div><div class="ends num"><span>' + S.vmin.toFixed(0) + '</span><span>km/h</span><span>' + S.vmax.toFixed(0) + '</span></div>') +
      (R.beams ? '<div class="cap">' + (sm ? 'Sensor colour: distance to the road edge' : 'Beams: distance to the edge') + '</div><div class="grad" style="background:' + RV.beamGradient + '"></div><div class="ends num"><span>0</span><span>m</span><span>200</span></div>' : '') +
      (S.CM.length && !OVER[2].solo ? '<div class="cap">Compared runs</div>' + S.CM.map(m => '<div><i class="sw" style="background:' + RV.col(m.id) + '"></i>' + esc(m.id) + '</div>').join('') : '');
  }

  /* ---------- pointer and keys ---------- */
  let drag = null, moved = 0;
  function carAt(e) {
    if (!cam || !onMap()) return null;
    const q = c.getBoundingClientRect(), mx = e.clientX - q.left, my = e.clientY - q.top;
    let best = null, bd = 18;
    for (const p of carsNow()) { const w = cam(p.x, p.y), d = Math.hypot(w[0] - mx, w[1] - my); if (d < bd) { bd = d; best = p.id; } }
    return best;
  }
  c.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; moved = 0; c.setPointerCapture(e.pointerId); c.classList.add('drag'); });
  c.addEventListener('pointermove', e => {
    if (!drag) { const h = carAt(e); c.style.cursor = (h && h !== S.sel[0]) ? 'pointer' : ''; return; }
    moved += Math.abs(e.clientX - drag[0]) + Math.abs(e.clientY - drag[1]);
    if (moved >= 5) { detach(); view.fit = false; }
    view.ox += e.clientX - drag[0]; view.oy += e.clientY - drag[1]; drag = [e.clientX, e.clientY];
  });
  c.addEventListener('pointerup', e => { drag = null; c.classList.remove('drag'); if (moved < 5) { const h = carAt(e); if (h && h !== S.sel[0]) RV.sel.makeRef(h); } });
  /* wheel: no zoom while all cars are kept in view; around the car while following; around the pointer otherwise */
  c.addEventListener('wheel', e => {
    e.preventDefault();
    if (autoZoom() || !onMap()) return;
    const k = Math.exp(-e.deltaY * 0.0015);
    if (view.follow) { const b = base(); zoomAt(b[0] + view.ox, b[1] + view.oy, k); } else { const r = c.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, k); }
  }, { passive: false });
  c.addEventListener('dblclick', () => { if (onMap()) resetView(); });
  /* a replay key that belongs to the map: act is 'zoomin', 'zoomout' or 'follow' (RV.KEYS) */
  function key(act) {
    if (S.tab !== 'pm' || !onMap()) return;
    const b = base();
    if (act === 'zoomin') { if (!autoZoom()) zoomAt(b[0] + view.ox, b[1] + view.oy, 1.25); }
    else if (act === 'zoomout') { if (!autoZoom()) zoomAt(b[0] + view.ox, b[1] + view.oy, 0.8); }
    else if (act === 'follow') { setFollow(!view.follow); if (!view.follow) view.all = false; buildSide(); }
  }
  if (window.ResizeObserver) new ResizeObserver(size).observe(c);

  /* ---------- side panel toggle ---------- */
  (function () {
    const btn = $('sideToggle'), pm = $('pm');
    function updateToggle() {
      const closed = pm.classList.contains('side-closed');
      btn.textContent = closed ? '\u203a' : '\u2039';
      btn.setAttribute('aria-label', closed ? 'Show side panel' : 'Hide side panel');
      btn.title = closed ? 'Show side panel' : 'Hide side panel';
    }
    btn.onclick = () => { pm.classList.toggle('side-closed'); updateToggle(); RV.map.size(); saveUi(); };
    updateToggle();
  }());

  RV.map = {
    draw: draw, size: size, legend: legend, buildSide: buildSide, key: key,
    /* called when the selection has been applied */
    resetAuto() {
      view.sInit = false;
      mapwrap.classList.toggle('cmp', S.CM.length > 0);     /* the green button shows only while cars are compared */
      /* the whole track when a comparison starts; not on every later change of the selection (a new car in
         focus, one car removed), and not over a camera the address asked for */
      const cmp = S.CM.length > 0;
      if (cmp && !hadCmp && !hashCam) fitView();
      hadCmp = cmp; hashCam = false;
    },
    /* the address can ask for the camera that follows the car (follow, zoom, all, fixed); otherwise the whole track is shown */
    fromHash(H) {
      if (H.follow || H.zoom || H.all || H.fixed) { view.follow = true; view.rot = !H.fixed; view.fit = false; hashCam = true; }
      if (H.all) view.all = true;
      if (H.zoom) view.z = +H.zoom;
    },
    viewDefaults: viewDefaults, defaults: defaults,
    /* the camera a run opens with (Settings, Replay), unless the address asked for one */
    startCamera() {
      if (hashCam) return;
      const m = RV.prefs.camera;
      view.follow = m !== 'fit'; view.rot = m === 'up'; view.fit = m === 'fit'; view.all = false; view.ox = view.oy = 0; view.ang = 0;
      if (view.follow && view.z < 1) view.z = 3.2;
    },
    /* the tutorial talks about the sensor beams, so they are shown while it runs and put back afterwards */
    tourLayers(on) {
      if (on) { if (!tourSaved) tourSaved = [LY.beams.on, LY.hits.on, LY.focus.on]; LY.beams.on = LY.hits.on = LY.focus.on = true; }
      else if (tourSaved) { LY.beams.on = tourSaved[0]; LY.hits.on = tourSaved[1]; LY.focus.on = tourSaved[2]; tourSaved = null; }
      buildSide();
    },
    LAYERS: LAYERS, PANELS: OVER,
    /* Adds a layer to the map. def: { id, g (group heading in the panel; a new name makes a new group), label, d,
       draw(ctx, zoom) in track coordinates and/or screen(ctx, w2s) in pixels, and optionally on, alpha, w (line width
       in px: gives the layer a width slider; use this.w in draw), cmp (only while runs are compared), still (true:
       depends on the track only, so it is painted once and kept) }. Its switch, sliders and saved state follow. */
    addLayer(def) {
      if (LY[def.id]) return LY[def.id];
      if (!def.draw) def.draw = function () {};
      LAYERS.push(def); enrol(def);
      if (!GROUPS.includes(def.g)) GROUPS.splice(GROUPS.length - 1, 0, def.g);       /* before "Panels on the map" */
      restoreUi(def.id); sortLayers(); bufKey = '';
      if (S.ds) buildSide();
      return def;
    },
    /* Adds a panel over the map. def: { id (of an element inside #mapwrap, made here if it is missing), label, d,
       draw(R, i) called every frame while it is on, and optionally on, alpha }. */
    addPanel(def) {
      const had = OVER.find(x => x.id === def.id);
      if (had) return had;
      if (!$(def.id)) { const e = el('div'); e.id = def.id; e.className = 'mappanel'; $('overlay').appendChild(e); }
      if (def.on == null) def.on = true;
      if (def.alpha == null) def.alpha = 1;
      OVER.push(def); restoreUi(def.id); wrapPanel(def); placeWins();
      if (S.ds) { panels(); buildSide(); }
      return def;
    },
    /* where every selected car is drawn now: [{id, x, y}] in track coordinates (used by tests) */
    carsNow: () => (onMap() ? carsNow() : []),
  };
})();
