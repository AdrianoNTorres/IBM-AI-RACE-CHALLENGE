/* Run viewer: the Track tab. The replay on the 2D map, its camera, and the side panel.
   New map features go into LAYERS: each entry gets a switch and an opacity slider in the panel automatically. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, el = RV.el, esc = RV.esc;
  const NB = 32;                        /* speed colour steps of the driven line */
  const c = $('c'), g = c.getContext('2d'), mini = $('mini'), mg = mini.getContext('2d');

  /* camera. z: pixels per metre; ox, oy: pan in pixels; cx, cy, ang: centre and rotation when not following;
     all: keep every car in view (sz, scx, scy: its smoothed zoom and centre; maxAll: its closest zoom) */
  const view = { z: 3.2, ox: 0, oy: 0, cx: 0, cy: 0, follow: false, rot: false, fit: true, all: false, sInit: false, sz: 3.2, scx: 0, scy: 0, ang: 0, maxAll: 10 };
  /* fit: the whole track is kept in view (the start state); it ends when the user moves, zooms or follows */
  const opt = { line: 'upto', lineW: 3, colour: 'speed' };     /* line: how much of the driven line is drawn; colour: by speed or by brake */
  let near = { x: 0, y: 0, r2: 1e18 };                         /* the part of the track that can be on screen this frame */
  const buf = document.createElement('canvas'), bg = buf.getContext('2d'), miniBuf = document.createElement('canvas');
  let bufKey = '', miniKey = '', secNow = '', tourSaved = null;
  let hudHtml = '', slvHtml = '', ldbHtml = '';
  let lastCam = null;                   /* base point, centre, angle and zoom of the last drawn frame */
  let cam = null;                       /* world-to-screen of the last drawn frame, for hit-testing clicks */
  let zoomInput = null, carCells = [];

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
    const key = opt.colour + document.documentElement.dataset.theme;
    if (key !== stepColsKey) { stepCols = []; for (let b = 0; b < NB; b++) stepCols.push(opt.colour === 'brake' ? RV.brakeCol((b + 0.5) / NB) : RV.speedCol((b + 0.5) / NB)); stepColsKey = key; }
    return stepCols;
  }
  /* the driven line of the car in focus: consecutive pieces of the same colour step are stroked together */
  const LOOP_DIM = 0.18;                               /* opacity of the driven line outside a looped section */
  function drawSpeedLine(ctx, r, z, w) {
    const q = lineRange(r, S.i), bk = colourSteps(r), cols = colours(), st = stepFor(z), end = q[1] + 1;
    ctx.lineWidth = w / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lp = S.loop;
    const inLoop = lp ? (k => r.d[k] >= lp[0] && r.d[k] <= lp[1]) : null;
    /* draw two passes when a loop is active: faded outside, full inside */
    const passes = lp ? [false, true] : [null];
    for (const pass of passes) {
      if (pass === false) ctx.globalAlpha *= LOOP_DIM;
      else if (pass === true) ctx.globalAlpha = Math.min(1, ctx.globalAlpha / LOOP_DIM);
      let cur = -1, pen = false;
      for (let k = q[0]; k <= q[1]; k += st) {
        if (pass !== null && inLoop(k) === pass) { if (pen) { ctx.stroke(); pen = false; } continue; }
        if (!inView(r.x[k], r.y[k])) { if (pen) { ctx.stroke(); pen = false; } continue; }
        const b = bk[k];
        if (!pen || b !== cur) { if (pen) ctx.stroke(); ctx.beginPath(); ctx.moveTo(r.x[k], r.y[k]); ctx.strokeStyle = cols[b]; cur = b; pen = true; }
        const k2 = Math.min(k + st, end);
        ctx.lineTo(r.x[k2], r.y[k2]);
      }
      if (pen) ctx.stroke();
      if (pass === false) ctx.globalAlpha /= LOOP_DIM;  /* restore before the next pass */
    }
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
  function drawCar(ctx, r, k, fill, z, userScale) {
    const sc = Math.max(1, 16 / (4.8 * z)) * (userScale || 1), lw = 0.05, P = RV.pal;
    ctx.save(); ctx.translate(r.x[k], r.y[k]); ctx.rotate(r.yaw[k]); ctx.scale(sc, sc);
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
    const sa = (r.st[k] || 0) * 21 * Math.PI / 180;
    wheel(1.6, 0.70, 0.60, sa); wheel(1.6, -0.70, 0.60, sa); wheel(-1.35, 0.75, 0.63, 0); wheel(-1.35, -0.75, 0.63, 0);
    ctx.fillStyle = fill; ctx.strokeStyle = P['car-line']; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.rect(2.0, -0.85, 0.36, 1.70); ctx.fill(); ctx.stroke();              /* front wing */
    ctx.beginPath(); ctx.rect(-2.4, -0.55, 0.38, 1.10); ctx.fill(); ctx.stroke();             /* rear wing */
    ctx.beginPath(); ctx.moveTo(2.3, 0.10); ctx.lineTo(0.95, 0.22); ctx.lineTo(0.6, 0.62); ctx.lineTo(-0.95, 0.62); ctx.lineTo(-2.0, 0.24);
    ctx.lineTo(-2.0, -0.24); ctx.lineTo(-0.95, -0.62); ctx.lineTo(0.6, -0.62); ctx.lineTo(0.95, -0.22); ctx.lineTo(2.3, -0.10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P['car-line']; ctx.beginPath(); ctx.ellipse(0.15, 0, 0.55, 0.24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.arc(0.05, 0, 0.15, 0, 7); ctx.fill();
    ctx.restore();
  }
  function beamEnds(r, i, each) {
    const o = i * 19, A = RV.TRACK_ANGLES;
    for (let k = 0; k < 19; k++) {
      const d = r.b[o + k];
      if (d < 0) continue;
      const a = r.yaw[i] - A[k] * Math.PI / 180;
      each(d, r.x[i] + d * Math.cos(a), r.y[i] + d * Math.sin(a), d < 199.5);
    }
  }

  /* ---------- map layers ----------
     g = group heading in the panel, d = one-line description, cmp = only shown while runs are compared.
     draw(ctx, zoom) draws in track coordinates (metres); screen(ctx, w2s) draws in pixels. */
  const LAYERS = [
    { id: 'road', g: 'Track', label: 'Road surface', d: 'The dark area of the road.', on: true, alpha: 1, draw(ctx) { ctx.fillStyle = RV.pal.road; ctx.fill(trackPaths().road, 'evenodd'); } },
    { id: 'edges', g: 'Track', label: 'Track edges', d: 'The lines at both sides. Beyond them the car is off the track.', on: true, alpha: 1, draw(ctx, z) {
      ctx.lineWidth = 1.6 / z; ctx.strokeStyle = RV.pal['road-edge']; ctx.stroke(trackPaths().left); ctx.stroke(trackPaths().right);
    } },
    { id: 'centre', g: 'Track', label: 'Centre line', d: 'Dashed line down the middle of the road (track position 0).', on: false, alpha: 0.6, draw(ctx, z) {
      ctx.setLineDash([6 / z, 6 / z]); ctx.lineWidth = 1 / z; ctx.strokeStyle = RV.pal['road-mark']; ctx.stroke(trackPaths().centre); ctx.setLineDash([]);
    } },
    { id: 'finish', g: 'Track', label: 'Start / finish line', d: 'The start and finish line across the road.', on: true, alpha: 1, draw(ctx, z) {
      ctx.lineWidth = 3 / z; ctx.strokeStyle = RV.pal['road-edge']; ctx.stroke(trackPaths().finish);
      /* chequered pattern: alternate black/white dashes */
      ctx.lineWidth = 3 / z; ctx.setLineDash([4 / z, 4 / z]);
      ctx.strokeStyle = RV.pal['road']; ctx.stroke(trackPaths().finish); ctx.setLineDash([]);
    }, screen(ctx, w2s) {
      if (view.z < 1) return;
      const T = trk(), p = w2s(T.left[0][0], T.left[0][1]), s = 'Start / Finish', w = ctx.measureText(s).width;
      ctx.font = '600 11px ' + RV.pal.font;
      ctx.fillStyle = RV.pal['road-edge']; ctx.beginPath(); ctx.roundRect(p[0] + 6, p[1] - 9, w + 12, 18, 4); ctx.fill();
      ctx.fillStyle = RV.pal['road']; ctx.fillText(s, p[0] + 12, p[1] + 3);
    } },
    { id: 'marks', g: 'Track', label: 'Distance marks', d: 'A tick and a label every 100 m from the start line.', on: true, alpha: 0.8, draw(ctx, z) {
      ctx.lineWidth = 1 / z; ctx.strokeStyle = RV.pal['road-mark']; ctx.stroke(trackPaths().marks);
    }, screen(ctx, w2s) {
      if (view.z < 0.5) return;
      ctx.fillStyle = RV.pal['map-ink']; ctx.font = '12px ' + RV.pal.font;
      for (const m of trk().marks) { const p = w2s(m[1], m[2]); if (p[0] > -40 && p[0] < c.clientWidth + 40 && p[1] > -20 && p[1] < c.clientHeight + 20) ctx.fillText(m[0] + ' m', p[0] + 5, p[1] - 5); }
    } },
    { id: 'sectors', g: 'Track', label: 'Sector lines', d: 'Where the timing sectors begin (detailed view only). On Corkscrew these are Laguna Seca\u2019s three sectors.', on: true, alpha: 1, draw(ctx, z) {
      if (RV.simple()) return;
      ctx.lineWidth = 2.5 / z; ctx.strokeStyle = RV.pal.best; ctx.beginPath();
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
    { id: 'line', g: 'Car and path', label: 'Driven line', d: 'Where the car in focus drove, coloured by its speed (blue slowest, yellow fastest) or by how hard it brakes.', on: true, alpha: 1, draw(ctx, z) { drawSpeedLine(ctx, S.R, z, opt.lineW); } },
    { id: 'car', g: 'Car and path', label: 'Car', d: 'The car in focus: car1-ow1, the open-wheel car the driver runs, drawn to scale. Its front wheels turn with the recorded steering.', on: true, alpha: 1,
      draw(ctx, z) { drawCar(ctx, S.R, S.i, RV.colMap(S.sel[0]), z, S.carScale[S.sel[0]]); } },
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
      const s = R.sum.slow.toFixed(0) + ' km/h', w = ctx.measureText(s).width;
      ctx.font = '600 11px ' + RV.pal.fontNum;
      ctx.fillStyle = RV.pal.best; ctx.beginPath(); ctx.roundRect(p[0] + 12, p[1] - 9, w + 10, 18, 4); ctx.fill();
      ctx.fillStyle = RV.pal.surface; ctx.fillText(s, p[0] + 17, p[1] + 3);
    } },
    { id: 'speed', g: 'Car and path', label: 'Speed label', d: 'The current speed, written next to the car.', on: true, alpha: 1, draw() {}, screen(ctx, w2s) {
      const R = S.R, p = w2s(R.x[S.i], R.y[S.i]), s = R.v[S.i].toFixed(0) + ' km/h';
      ctx.font = '600 14px ' + RV.pal.fontNum;
      const w = ctx.measureText(s).width, o = 12 + 1.3 * view.z;
      ctx.fillStyle = 'rgba(13,15,20,.88)'; ctx.beginPath(); ctx.roundRect(p[0] + o, p[1] - 11, w + 14, 22, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(s, p[0] + o + 7, p[1] + 5);
    } },
    { id: 'beams', g: 'Sensors', label: 'Track beams', d: 'The 19 distance sensors. Each line runs from the car to the track edge it measures; pink is close, cyan is far, faint means nothing within 200 m.', on: true, alpha: 0.95, draw(ctx, z) {
      const R = S.R; if (!R.beams) return;
      beamEnds(R, S.i, (d, ex, ey, hit) => { ctx.beginPath(); ctx.moveTo(R.x[S.i], R.y[S.i]); ctx.lineTo(ex, ey); ctx.lineWidth = (hit ? 1.6 : 1) / z; ctx.strokeStyle = RV.beamCol(d, hit ? 1 : 0.3); ctx.stroke(); });
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
        ctx.beginPath(); ctx.moveTo(R.x[fk], R.y[fk]); ctx.lineTo(ex, ey); ctx.lineWidth = 2 / z; ctx.strokeStyle = RV.beamCol(d, 1); ctx.stroke();
        if (d < 199.5) { ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(ex, ey, 4 / z, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 / z; ctx.stroke(); ctx.restore(); }
      }
      ctx.setLineDash([]);
    } },
    { id: 'lineB', g: 'Compared runs', label: 'Their driven lines', d: 'The path of each compared run, in that run’s colour.', on: true, alpha: 0.9, cmp: true, draw(ctx, z) {
      for (const m of others()) drawSolid(ctx, m.r, RV.ghostIdx(m.r), z, (opt.lineW * 0.6 + 2) / z, opt.lineW * 0.6 / z, RV.pal['car-line'], RV.colMap(m.id));
    } },
    { id: 'ghost', g: 'Compared runs', label: 'Their cars', d: 'One car per compared run, in that run's colour.', on: true, alpha: 0.9, cmp: true, draw(ctx, z) {
      for (const m of others()) drawCar(ctx, m.r, RV.ghostIdx(m.r), RV.colMap(m.id), z, S.carScale[m.id]);
    } },
  ];
  const BEAMS_TIP = '19 distance sensors pointing outward from the car nose';
  const LY = {};
  LAYERS.forEach(L => { LY[L.id] = L; L.on0 = L.on; L.alpha0 = L.alpha; });
  /* the track itself never changes during a replay; everything else moves. The car in focus is drawn last, on top. */
  const STATIC = LAYERS.filter(L => L.g === 'Track');
  const MOVING = LAYERS.filter(L => L.g !== 'Track' && L.id !== 'car').concat(LAYERS.filter(L => L.id === 'car'));
  const OVER = [
    { id: 'hud', label: 'Readout', d: 'The box of numbers, top left.', on: true },
    { id: 'mini', label: 'Overview map', d: 'The small map of the whole track.', on: true },
    { id: 'leg', label: 'Colour keys', d: 'What the colours mean, bottom left.', on: true },
    { id: 'inputs', label: 'Wheel and pedals', d: 'The steering wheel turning with the car, and its throttle and brake over the last seconds, bottom right.', on: true },
    { id: 'sectorLive', label: 'Live sector table', d: 'Current sector times and deltas vs. the reference lap.', on: true },
    { id: 'lapDeltaBar', label: 'Lap delta bar', d: 'Live gap vs. the reference lap, shown as a coloured bar.', on: true },
  ];
  const GROUPS = ['Track', 'Car and path', 'Sensors', 'Compared runs', 'Panels on the map'];

  /* ---------- side panel: the same three sections in both views; the detailed view adds controls inside them ---------- */
  function toggleRow(name, desc, on, fn) {
    const r = el('div', 'lr' + (on ? '' : ' off'), '<label class="tg"><input type="checkbox" ' + (on ? 'checked' : '') + ' aria-label="' + esc(name) + '"><span></span></label><div><div class="ln">' + name + '</div><div class="ld">' + desc + '</div></div>');
    r.querySelector('input').onchange = e => { r.classList.toggle('off', !e.target.checked); fn(e.target.checked); };
    return r;
  }
  function slider(row, label, min, max, step, val, fmt, fn) {
    const o = el('div', 'lo', '<small>' + label + '</small><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" aria-label="' + esc(label || 'Value') + '"><span class="num">' + fmt(val) + '</span>');
    o.querySelector('input').oninput = e => { o.lastChild.textContent = fmt(+e.target.value); fn(+e.target.value); };
    row.appendChild(o);
    return o.querySelector('input');
  }
  function segs(items, cur, fn, label) {
    const s = el('div', 'seg full');
    s.setAttribute('role', 'group'); if (label) s.setAttribute('aria-label', label);
    for (const it of items) {
      const b = el('button', it[0] === cur ? 'on' : null, it[1]);
      b.setAttribute('aria-pressed', it[0] === cur);
      b.onclick = () => { s.querySelectorAll('button').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', false); }); b.classList.add('on'); b.setAttribute('aria-pressed', true); fn(it[0]); };
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
    s.appendChild(toggleRow('Follow car', sm ? 'Keeps the car in the middle of the view.' : 'Keeps the car in focus in the same place on screen. Switches off by itself when you drag the map.', view.follow, v => { setFollow(v); buildSide(); }));
    s.appendChild(toggleRow('Car points up', sm ? 'Turns the map so the car always drives toward the top.' : 'Rotates the map so the car in focus always drives toward the top. Turn off for a fixed map.', view.rot, setRot));
    if (many) s.appendChild(toggleRow('Keep all cars in view', 'Moves and zooms the map so every selected car stays on screen.', view.all, setAll));
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
    if (many && !sm) {
      const o = el('div', 'opt', '<div class="cap">Where the other cars are placed. Same lap time shows who is ahead; same distance shows the difference in line.</div>');
      o.appendChild(segs([['t', 'Same lap time'], ['d', 'Same distance']], RV.prefs.sync, v => { RV.prefs.sync = v; RV.savePrefs(); }, 'Where the other cars are placed'));
      s.appendChild(o);
    }
    /* per-car size sliders */
    if (!sm) {
      const sc = el('div', 'opt');
      sc.innerHTML = '<div class="cap">Car size (1 = true scale)</div>';
      const allIds = [S.sel[0]].concat(S.CM.map(m => m.id));
      for (const id of allIds) {
        const cur = S.carScale[id] || 1;
        const row = el('div', 'lr');
        row.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex:1"><i class="sw" style="background:' + RV.col(id) + '"></i><span class="ln" style="flex:1">' + esc(id) + '</span></div>';
        const resetBtn = el('button', 'btn sm', 'Reset');
        resetBtn.onclick = () => { delete S.carScale[id]; buildSide(); };
        const slRow = el('div', 'lo', '<small>Scale</small><input type="range" min="0.3" max="4" step="0.1" value="' + cur.toFixed(1) + '" aria-label="Car size for ' + esc(id) + '"><span class="num">' + cur.toFixed(1) + '×</span>');
        slRow.querySelector('input').oninput = e => { S.carScale[id] = +e.target.value; e.target.nextSibling.textContent = (+e.target.value).toFixed(1) + '×'; };
        row.appendChild(slRow); row.appendChild(resetBtn); sc.appendChild(row);
      }
      const resetAll = el('button', 'btn wide', 'Reset all car sizes');
      resetAll.onclick = () => { S.carScale = {}; buildSide(); };
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
      return;
    }
    /* detailed: one group open at a time */
    for (const G of GROUPS) {
      if (G === 'Compared runs' && !many) continue;
      const open = S.layerGroup === G, items = G === 'Panels on the map' ? OVER : LAYERS.filter(L => L.g === G);
      const head = el('button', 'acc' + (open ? ' open' : ''), '<span>' + G + '</span><small>' + items.filter(L => L.on).length + ' of ' + items.length + ' on</small>');
      head.setAttribute('aria-expanded', open);
      head.onclick = () => { S.layerGroup = open ? '' : G; buildSide(); };
      s.appendChild(head);
      if (!open) continue;
      const body = el('div', 'accbody');
      s.appendChild(body);
      const count = () => { head.lastChild.textContent = items.filter(L => L.on).length + ' of ' + items.length + ' on'; };
      if (G === 'Panels on the map') { for (const L of OVER) body.appendChild(toggleRow(L.label, L.d, L.on, v => { L.on = v; panels(); count(); })); continue; }
      for (const L of items) {
        const r = toggleRow(L.label, L.d, L.on, v => { L.on = v; count(); });
        if (L.id === 'beams') r.title = BEAMS_TIP;
        slider(r, 'Opacity', 0, 1, 0.05, L.alpha, v => Math.round(v * 100) + ' %', v => { L.alpha = v; });
        body.appendChild(r);
        if (L.id === 'line') {
          const o = el('div', 'opt', '<div class="cap">How much of the line to draw</div>');
          o.appendChild(segs([['full', 'Whole lap'], ['upto', 'Up to the car'], ['near', 'Near the car']], opt.line, v => { opt.line = v; }, 'How much of the line to draw'));
          slider(o, 'Width', 1, 8, 0.5, opt.lineW, v => v.toFixed(1) + ' px', v => { opt.lineW = v; });
          body.appendChild(o);
        }
      }
    }
    const rb = el('button', 'btn wide', 'Restore the default layers');
    rb.onclick = () => { LAYERS.forEach(L => { L.on = L.on0; L.alpha = L.alpha0; }); OVER.forEach(L => { L.on = true; }); opt.line = 'upto'; opt.lineW = 3; opt.colour = 'speed'; viewDefaults(); legend(); panels(); buildSide(); };
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
  function viewDefaults() { const on = !RV.simple(); LY.beams.on = LY.hits.on = LY.focus.on = on; }
  function helpSection(s, sm) {
    const R = S.R, many = S.CM.length > 0;
    s.appendChild(el('div', 'guide',
      '<h4>What you are looking at</h4><p>The car replays the recorded lap of the selected version. The coloured path is the line it drove: blue where it was slowest, yellow where it was fastest.</p>' +
      '<p>The lines fanning out from the car are its sensors (switch them on under Layers if they are hidden). Each measures how far it is to the edge of the road in that direction: pink means the edge is close, cyan means it is far away.</p>' +
      (R && !R.beams ? '<p class="warn">This recording has no sensor columns, so only the path is shown.</p>' : '') +
      '<h4>Moving around</h4><p>Drag to move the map and use the mouse wheel to zoom. Double-click to return to the car.' + (many ? ' Click another car, or its name in the top bar, to put it in focus.' : '') + '</p>' +
      '<h4>Keys</h4><dl class="keys"><dt><kbd>Space</kbd></dt><dd>play or pause</dd><dt><kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt><dd>one step; hold for 0.1&times;, then 0.25&times;, then 0.5&times;</dd>' +
      '<dt><kbd>+</kbd> <kbd>&minus;</kbd></dt><dd>zoom</dd><dt><kbd>F</kbd></dt><dd>follow the car, or stop following</dd><dt><kbd>Home</kbd></dt><dd>back to the start of the lap</dd></dl>'));
  }
  function buildSide() {
    const s = $('side'), sm = RV.simple();
    s.innerHTML = ''; zoomInput = null; carCells = [];
    if (!S.ds) return;
    if (S.CM.length) s.appendChild(carsTable());
    /* how the driven line is coloured: always at hand, in both views */
    const pc = el('div', 'pathcol', '<span>Path colour</span>');
    pc.appendChild(segs([['speed', 'Speed'], ['brake', 'Brake']], opt.colour, v => { opt.colour = v; legend(); }, 'Colour the driven path by'));
    s.appendChild(pc);
    const tabs = el('div', 'seg full subtabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [['view', 'Camera'], ['layers', 'Layers'], ['sectors', 'Sectors'], ['help', 'Help']]) {
      const b = el('button', S.sideTab === id ? 'on' : null, label);
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', S.sideTab === id);
      b.onclick = () => { S.sideTab = id; buildSide(); };
      tabs.appendChild(b);
    }
    s.appendChild(tabs);
    const body = el('div', 'sidebody');
    s.appendChild(body);
    if (S.sideTab === 'view') viewSection(body, sm); else if (S.sideTab === 'layers') layersSection(body, sm); else if (S.sideTab === 'sectors') sectorsSection(body, sm); else helpSection(body, sm);
    secNow = '';
    message();
  }
  function panels() {
    for (const L of OVER) {
      const show = L.on && onMap();
      if (L.id === 'sectorLive' || L.id === 'lapDeltaBar') {
        /* these are shown/hidden by their draw functions to account for missing data;
           panels() only hides them when the layer is turned off or no run is loaded */
        if (!show) $(L.id).hidden = true;
      } else {
        $(L.id).style.display = show ? '' : 'none';
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
      (S.ds.trkOwn ? ', from the source’s track.xml' : ', bundled with this page') + ') is ' + S.ds.trk.total.toFixed(1) + ' m long.</p><p>' +
      (S.ds.trkOwn ? 'The track.xml in the source is not the track these runs were driven on.' : 'The source needs its own <b>track.xml</b>: the ' + RV.TORCS + ' track file of the track the runs were driven on, at the root of the repository or folder.') +
      '</p><p class="note">The run is not drawn on a wrong map. The Versions and Telemetry tabs still work.</p>';
    m.innerHTML = h ? '<div class="card">' + h + '</div>' : '';
    m.style.display = h ? '' : 'none';
    panels();
  }

  /* ---------- camera ---------- */
  function size() { const r = window.devicePixelRatio || 1; if (!c.clientWidth) return; c.width = c.clientWidth * r; c.height = c.clientHeight * r; }
  function base() { const W = c.clientWidth, H = c.clientHeight; return [W / 2, (view.follow && view.rot) ? H * 0.64 : H / 2]; }
  function carsNow() {
    const R = S.R;
    return [{ id: S.sel[0], x: R.x[S.i], y: R.y[S.i] }].concat(others().map(m => { const k = RV.ghostIdx(m.r); return { id: m.id, x: m.r.x[k], y: m.r.y[k] }; }));
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
  function setAll(v) { view.all = v; view.sInit = false; view.ox = view.oy = 0; buildSide(); }
  function setFollow(v) { if (v) { view.ang = 0; view.fit = false; if (view.z < 1) view.z = 3.2; } view.follow = v; if (!v && onMap()) { view.cx = S.R.x[S.i]; view.cy = S.R.y[S.i]; } view.ox = view.oy = 0; }
  function resetView() { view.follow = true; view.rot = true; view.fit = false; view.all = false; view.z = 3.2; view.ox = view.oy = 0; buildSide(); }
  /* the whole track, centred in the part of the map that the readout on the left does not cover */
  function applyFit(W, H) {
    const B = trk().box, left = (W > 900 && OVER[0].on) ? 250 : 0;
    view.cx = (B[0] + B[1]) / 2; view.cy = (B[2] + B[3]) / 2; view.ang = 0; view.ox = left / 2; view.oy = 0;
    view.z = Math.min((W - left) / (B[1] - B[0]), H / (B[3] - B[2])) * 0.9;
  }
  function fitView() { view.follow = false; view.rot = false; view.all = false; view.fit = true; buildSide(); }

  /* ---------- the frame ---------- */
  /* Linearly interpolate a world position using camFrac (smoothed camera at ≤1× speed).
     Returns the interpolated [x, y, yaw] for the camera centre and rotation. */
  function smoothCar(R, i, frac) {
    if (frac <= 0 || i >= R.n - 1) return [R.x[i], R.y[i], R.yaw[i]];
    const i1 = i + 1;
    const x = R.x[i] + (R.x[i1] - R.x[i]) * frac;
    const y = R.y[i] + (R.y[i1] - R.y[i]) * frac;
    /* shortest-path yaw lerp */
    let da = R.yaw[i1] - R.yaw[i];
    if (da > Math.PI) da -= 2 * Math.PI;
    else if (da < -Math.PI) da += 2 * Math.PI;
    const yaw = R.yaw[i] + da * frac;
    return [x, y, yaw];
  }

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
    /* smooth camera: interpolate position and yaw between steps at ≤1× playback speed */
    const sc = smoothCar(R, i, S.camFrac);
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
      const key = [c.width, c.height, z, view.ox, view.oy, ce[0], ce[1], a, document.documentElement.dataset.theme, RV.simple(), trk().total, STATIC.map(L => L.on + ':' + L.alpha).join()].join('|');
      if (key !== bufKey) {
        buf.width = c.width; buf.height = c.height;
        bg.setTransform(r, 0, 0, r, 0, 0); bg.fillStyle = P['map-bg']; bg.fillRect(0, 0, W, H);
        paint(bg, STATIC); bufKey = key;
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(buf, 0, 0);
    }
    paint(g, MOVING);
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
    if (OVER[3].on) RV.inputs.draw(R, i);
    if (OVER[1].on) drawMini();
    if (OVER[0].on) drawHud(sm, gapTxt);
    if (OVER[4].on) drawSectorLive();
    if (OVER[5].on) drawDeltaBar();
  }
  function drawMini() {
    const R = S.R, B = trk().box, P = RV.pal, r = window.devicePixelRatio || 1, cw = mini.clientWidth, chh = mini.clientHeight;
    if (mini.width !== Math.round(cw * r)) { mini.width = Math.round(cw * r); mini.height = Math.round(chh * r); }
    const ms = Math.min((cw - 20) / (B[1] - B[0]), (chh - 20) / (B[3] - B[2]));
    const place = ctx => { ctx.setTransform(r, 0, 0, r, 0, 0); ctx.translate(cw / 2, chh / 2); ctx.scale(ms, -ms); ctx.translate(-(B[0] + B[1]) / 2, -(B[2] + B[3]) / 2); };
    const key = [mini.width, mini.height, trk().total, document.documentElement.dataset.theme, RV.simple()].join('|');
    if (key !== miniKey) {                                /* the outline is painted once and copied each frame */
      miniBuf.width = mini.width; miniBuf.height = mini.height;
      const mb = miniBuf.getContext('2d');
      const T = trk();
      place(mb); mb.lineWidth = 2.4 / ms; mb.strokeStyle = P.mute; mb.lineJoin = 'round'; mb.stroke(trackPaths().centre);
      /* finish line */
      mb.lineWidth = 2 / ms; mb.strokeStyle = P['road-edge']; mb.stroke(trackPaths().finish);
      /* sector lines (detailed view only) */
      if (!RV.simple() && T.sectors) {
        mb.lineWidth = 1.5 / ms; mb.strokeStyle = P.best;
        for (const m of T.sectors.lines) { mb.beginPath(); mb.moveTo(m[0], m[1]); mb.lineTo(m[2], m[3]); mb.stroke(); }
      }
      miniKey = key;
    }
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, mini.width, mini.height); mg.drawImage(miniBuf, 0, 0);
    place(mg);
    for (const m of others()) { const k = RV.ghostIdx(m.r); mg.beginPath(); mg.arc(m.r.x[k], m.r.y[k], 4.5 / ms, 0, 7); mg.fillStyle = RV.col(m.id); mg.fill(); }
    mg.beginPath(); mg.arc(R.x[S.i], R.y[S.i], 5.5 / ms, 0, 7); mg.fillStyle = RV.col(S.sel[0]); mg.fill(); mg.lineWidth = 1.5 / ms; mg.strokeStyle = P.surface; mg.stroke();
  }
  function drawHud(sm, gapTxt) {
    const R = S.R, i = S.i, kv = [];
    const add = (k, v, tip) => kv.push('<dt' + (tip ? ' title="' + tip + '"' : '') + '>' + k + '</dt><dd class="num">' + v + '</dd>');
    add('Lap time', R.t[i].toFixed(2) + ' s');
    if (!sm && R.sec && trk().sectors) { const cu = trk().sectors.cuts, d = R.d[i]; add('Sector', d < cu[0] ? 'S1' : d < cu[1] ? 'S2' : 'S3'); }
    add('Distance', R.s[i].toFixed(0) + ' m');
    if (!sm) {
      add('Gear', R.g[i]); add('Plan allows', R.al[i] > 350 || !R.al[i] ? 'no limit' : R.al[i].toFixed(0) + ' km/h');
      add('Throttle', R.th[i].toFixed(2)); add('Brake', R.br[i].toFixed(2)); add('Steering', R.st[i].toFixed(2)); add('Track position', R.tp[i].toFixed(2), 'Track position: 0 = centre, \u00b11 = edge');
      if (R.beams) { let mn = 1e9, mx = -1; for (let k = 0; k < 19; k++) { const d = R.b[i * 19 + k]; if (d >= 0) { mn = Math.min(mn, d); mx = Math.max(mx, d); } } add('Beams', mx < 0 ? 'off track' : mn.toFixed(0) + ' to ' + mx.toFixed(0) + ' m'); }
    }
    for (const m of S.CM) add('<i class="sw" style="background:' + RV.col(m.id) + '"></i>' + esc(m.id), gapTxt(m.r.t[RV.idxAtD(m.r, R.d[i])] - R.t[i]) + (sm ? '' : ' &nbsp; ' + m.r.v[RV.ghostIdx(m.r)].toFixed(0) + ' km/h'));
    const doing = R.br[i] > 0 ? 'Braking' : R.th[i] >= 0.99 ? 'Full throttle' : R.th[i] > 0.05 ? 'Part throttle' : 'Coasting';
    const html = '<div class="big num">' + R.v[i].toFixed(0) + '<small>km/h</small></div><div class="who"><i class="sw" style="background:' + RV.col(S.sel[0]) + '"></i>' + esc(R.name) + '</div><div class="hud-doing">' + doing + '</div><dl class="kv">' + kv.join('') + '</dl>';
    if (html !== hudHtml) { $('hud').innerHTML = html; hudHtml = html; }
  }
  /* ---------- sector live table ---------- */
  /* Returns reference sector times [s1, s2, s3] or null.
     Priority: mean of loaded compared runs > bestBefore of the focused version. */
  function refSectors() {
    if (!S.ds || !trk() || !trk().sectors) return null;
    if (S.CM.length > 0) {
      const loaded = S.CM.filter(m => m.r && m.r.sec);
      if (loaded.length > 0) {
        const mean = [0, 0, 0];
        for (const m of loaded) { mean[0] += m.r.sec[0] || 0; mean[1] += m.r.sec[1] || 0; mean[2] += m.r.sec[2] || 0; }
        return mean.map(v => v / loaded.length);
      }
    }
    const v = S.ds.versions && S.ds.versions.find(vv => vv.id === S.sel[0]);
    if (v && v.bestBeforeId && S.ds.byId && S.ds.byId[v.bestBeforeId] && S.ds.byId[v.bestBeforeId].sec)
      return S.ds.byId[v.bestBeforeId].sec;
    return null;
  }

  function drawSectorLive() {
    const R = S.R, T = trk();
    if (!R || !R.sec || !T || !T.sectors) { slvHtml = ''; $('sectorLive').hidden = true; return; }
    const cu = T.sectors.cuts, d = R.d[S.i], t = R.t[S.i];
    const ref = refSectors();
    const curSec = d < cu[0] ? 0 : d < cu[1] ? 1 : 2;
    /* cumulative start times for each sector */
    const secStart = [0, R.sec[0], (R.sec[0] != null && R.sec[1] != null) ? R.sec[0] + R.sec[1] : null];
    let html = '<table><thead><tr><th class="l">Sector</th><th>Time</th><th>\u0394 Ref</th></tr></thead><tbody>';
    for (let k = 0; k < 3; k++) {
      const done = R.sec[k] != null;
      const live = !done && k === curSec;
      let secTime = done ? R.sec[k] : (live && secStart[k] != null ? Math.max(0, t - secStart[k]) : null);
      const refT = ref ? ref[k] : null;
      const delta = (secTime != null && refT != null) ? (secTime - refT) : null;
      const timeTxt = secTime != null ? secTime.toFixed(2) + ' s' : '\u2014';
      const deltaTxt = delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(2) + ' s' : '\u2014';
      const deltaBg = delta != null && Math.abs(delta) > 0.01 ? 'background:' + RV.deltaColor(delta, 2) + ';color:#fff' : (delta != null ? 'background:' + RV.deltaColor(delta, 2) : '');
      const timeCls = 'slv-time' + (live ? ' slv-live' : '');
      html += '<tr><td class="l num">S' + (k + 1) + '</td><td class="' + timeCls + '">' + timeTxt + '</td>'
        + '<td class="slv-delta" style="' + deltaBg + '">' + deltaTxt + '</td></tr>';
    }
    html += '</tbody></table>';
    if (html !== slvHtml) { $('sectorLive').innerHTML = html; slvHtml = html; }
  }

  /* ---------- lap delta bar ---------- */
  function lapDeltaForCar(r) {
    const R = S.R;
    const ref = refSectors();
    if (ref) {
      /* compare this car's current running time vs. reference total */
      const refTotal = ref[0] + ref[1] + ref[2];
      return r.t[S.i] - refTotal;
    }
    /* no external ref: compare each car against the focused car at the same track distance */
    if (r === R) return 0;
    return r.t[RV.idxAtD(r, R.d[S.i])] - R.t[S.i];
  }

  function drawDeltaBar() {
    const R = S.R;
    if (!R) { ldbHtml = ''; $('lapDeltaBar').hidden = true; return; }
    const MAX_D = 5;
    const cars = [{ id: S.sel[0], r: R, foc: true }].concat(S.CM.filter(m => m.r && m.r.t).map(m => ({ id: m.id, r: m.r, foc: false })));
    const rows = cars.map(c => ({ id: c.id, r: c.r, foc: c.foc, delta: lapDeltaForCar(c.r) }));
    const focRow = rows[0];
    const rest = rows.slice(1).sort((a, b) => a.delta - b.delta);
    const sorted = [focRow, ...rest];
    let html = '';
    for (const row of sorted) {
      const delta = row.delta;
      const col = RV.deltaColor(delta, MAX_D);
      let fillStyle;
      if (delta <= 0) {
        const pct = Math.min(50, Math.abs(delta) / MAX_D * 50);
        fillStyle = 'left:' + (50 - pct).toFixed(1) + '%;right:50%;background:' + col;
      } else {
        const pct = Math.min(50, delta / MAX_D * 50);
        fillStyle = 'left:50%;right:' + (50 - pct).toFixed(1) + '%;background:' + col;
      }
      const deltaTxt = (delta > 0 ? '+' : '') + delta.toFixed(2) + ' s';
      html += '<div class="ldb-row' + (row.foc ? ' focused' : '') + '">'
        + '<div class="ldb-label"><i class="sw" style="background:' + RV.col(row.id) + ';width:8px;height:8px;border-radius:2px;margin-right:4px"></i>'
        + esc(row.id) + ' <span style="font-variant-numeric:tabular-nums">' + esc(deltaTxt) + '</span></div>'
        + '<div class="ldb-track"><div class="ldb-fill" style="' + fillStyle + '"></div>'
        + '<div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--line)"></div></div>'
        + '</div>';
    }
    if (html !== ldbHtml) { $('lapDeltaBar').innerHTML = html; ldbHtml = html; }
  }

  function legend() {
    const R = S.R, sm = RV.simple();
    if (!R) { $('leg').innerHTML = ''; return; }
    $('leg').innerHTML = (opt.colour === 'brake'
        ? '<div class="cap">' + (sm ? 'Path colour: braking' : 'Driven line: brake') + '</div><div class="grad brakegrad"></div><div class="ends num"><span>none</span><span>brake</span><span>full</span></div>'
        : '<div class="cap">' + (sm ? 'Path colour: speed' : 'Driven line: speed') + '</div><div class="grad" style="background:' + RV.speedGradient + '"></div><div class="ends num"><span>' + S.vmin.toFixed(0) + '</span><span>km/h</span><span>' + S.vmax.toFixed(0) + '</span></div>') +
      (R.beams ? '<div class="cap">' + (sm ? 'Sensor colour: distance to the road edge' : 'Beams: distance to the edge') + '</div><div class="grad" style="background:' + RV.beamGradient + '"></div><div class="ends num"><span>0</span><span>m</span><span>200</span></div>' : '') +
      (S.CM.length ? '<div class="cap">Compared runs</div>' + S.CM.map(m => '<div><i class="sw" style="background:' + RV.col(m.id) + '"></i>' + esc(m.id) + '</div>').join('') : '');
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
  function key(e) {
    if (S.tab !== 'pm' || !onMap()) return;
    const b = base();
    if (e.key === '+' || e.key === '=') { if (!autoZoom()) zoomAt(b[0] + view.ox, b[1] + view.oy, 1.25); }
    else if (e.key === '-') { if (!autoZoom()) zoomAt(b[0] + view.ox, b[1] + view.oy, 0.8); }
    else if (e.key === 'f' || e.key === 'F') { setFollow(!view.follow); buildSide(); }
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
    btn.onclick = () => { pm.classList.toggle('side-closed'); updateToggle(); RV.map.size(); };
    updateToggle();
  }());

  RV.map = {
    draw: draw, size: size, legend: legend, buildSide: buildSide, key: key,
    resetAuto() {
      view.sInit = false;
      /* default to whole-track view when a comparison run is added */
      if (S.CM && S.CM.length > 0) fitView();
    },
    /* the address can ask for the camera that follows the car (follow, zoom, all, fixed); otherwise the whole track is shown */
    fromHash(H) {
      if (H.follow || H.zoom || H.all || H.fixed) { view.follow = true; view.rot = !H.fixed; view.fit = false; }
      if (H.all) view.all = true;
      if (H.zoom) view.z = +H.zoom;
    },
    viewDefaults: viewDefaults,
    /* the tutorial talks about the sensor beams, so they are shown while it runs and put back afterwards */
    tourLayers(on) {
      if (on) { if (!tourSaved) tourSaved = [LY.beams.on, LY.hits.on, LY.focus.on]; LY.beams.on = LY.hits.on = LY.focus.on = true; }
      else if (tourSaved) { LY.beams.on = tourSaved[0]; LY.hits.on = tourSaved[1]; LY.focus.on = tourSaved[2]; tourSaved = null; }
      buildSide();
    },
    LAYERS: LAYERS,
  };
})();
