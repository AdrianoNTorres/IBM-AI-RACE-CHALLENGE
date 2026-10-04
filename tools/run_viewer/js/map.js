/* Run viewer: the Track tab. The replay on the 2D map, its camera, and the side panel.
   New map features go into LAYERS: each entry gets a switch and an opacity slider in the panel automatically. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, el = RV.el, esc = RV.esc;
  const NB = 32;                        /* speed colour steps of the driven line */
  const c = $('c'), g = c.getContext('2d'), mini = $('mini'), mg = mini.getContext('2d');

  /* camera. z: pixels per metre; ox, oy: pan in pixels; cx, cy, ang: centre and rotation when not following;
     all: keep every car in view (sz, scx, scy: its smoothed zoom and centre; maxAll: its closest zoom) */
  const view = { z: 3.2, ox: 0, oy: 0, cx: 0, cy: 0, follow: true, rot: true, all: false, sInit: false, sz: 3.2, scx: 0, scy: 0, ang: 0, maxAll: 10 };
  const opt = { line: 'full', lineW: 3 };
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
  function drawSolid(ctx, r, me, w, col) {
    const q = lineRange(r, me);
    if (q[1] < q[0]) return;
    ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(r.x[q[0]], r.y[q[0]]);
    for (let k = q[0] + 1; k <= q[1] + 1; k++) ctx.lineTo(r.x[k], r.y[k]);
    ctx.stroke();
  }
  /* row indices of the run grouped by speed step, so the line is drawn in NB strokes */
  function buckets(r) {
    if (r._bk) return r._bk;
    const bk = [];
    for (let k = 0; k < NB; k++) bk.push([]);
    for (let k = 0; k < r.n - 1; k++) {
      const f = ((r.v[k] + r.v[k + 1]) / 2 - S.vmin) / (S.vmax - S.vmin || 1);
      bk[RV.clamp(Math.floor(f * NB), 0, NB - 1)].push(k);
    }
    return (r._bk = bk);
  }
  function drawSpeedLine(ctx, r, z, w) {
    const q = lineRange(r, S.i), bk = buckets(r);
    ctx.lineWidth = w / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let b = 0; b < NB; b++) {
      const L = bk[b];
      if (!L.length) continue;
      ctx.beginPath();
      let any = false;
      for (const k of L) { if (k < q[0] || k > q[1]) continue; ctx.moveTo(r.x[k], r.y[k]); ctx.lineTo(r.x[k + 1], r.y[k + 1]); any = true; }
      if (any) { ctx.strokeStyle = RV.speedCol((b + 0.5) / NB); ctx.stroke(); }
    }
  }
  /* car1-ow1 from above: 4.8 m long, front axle 1.6 m ahead of the centre, rear axle 1.35 m behind, front wheels 0.70 m and
     rear wheels 0.75 m either side, tyres 0.30 m wide. The front wheels turn with the recorded steering (full lock 21 degrees).
     Never drawn smaller than about 16 px. */
  function drawCar(ctx, r, k, fill, z) {
    const sc = Math.max(1, 16 / (4.8 * z)), lw = 0.05, P = RV.pal;
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
    { id: 'road', g: 'Track', label: 'Road surface', d: 'The dark area of the road.', on: true, alpha: 1, draw(ctx) {
      const T = trk();
      ctx.beginPath(); ctx.moveTo(T.left[0][0], T.left[0][1]);
      for (const p of T.left) ctx.lineTo(p[0], p[1]);
      for (let k = T.right.length - 1; k >= 0; k--) ctx.lineTo(T.right[k][0], T.right[k][1]);
      ctx.closePath(); ctx.fillStyle = RV.pal.road; ctx.fill('evenodd');
    } },
    { id: 'edges', g: 'Track', label: 'Track edges', d: 'The lines at both sides. Beyond them the car is off the track.', on: true, alpha: 1, draw(ctx, z) {
      ctx.lineWidth = 1.6 / z; ctx.strokeStyle = RV.pal['road-edge']; poly(ctx, trk().left); ctx.stroke(); poly(ctx, trk().right); ctx.stroke();
    } },
    { id: 'centre', g: 'Track', label: 'Centre line', d: 'Dashed line down the middle of the road (track position 0).', on: false, alpha: 0.6, draw(ctx, z) {
      ctx.setLineDash([6 / z, 6 / z]); ctx.lineWidth = 1 / z; ctx.strokeStyle = RV.pal['road-mark']; poly(ctx, trk().centre); ctx.stroke(); ctx.setLineDash([]);
    } },
    { id: 'marks', g: 'Track', label: 'Distance marks', d: 'A tick and a label every 100 m from the start line.', on: true, alpha: 0.8, draw(ctx, z) {
      ctx.lineWidth = 1 / z; ctx.strokeStyle = RV.pal['road-mark']; ctx.beginPath();
      for (const m of trk().marks) { ctx.moveTo(m[1], m[2]); ctx.lineTo(m[3], m[4]); }
      ctx.stroke();
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
    { id: 'line', g: 'Car and path', label: 'Driven line', d: 'Where the car in focus drove, coloured by its speed: blue slowest, yellow fastest.', on: true, alpha: 1, draw(ctx, z) { drawSpeedLine(ctx, S.R, z, opt.lineW); } },
    { id: 'car', g: 'Car and path', label: 'Car', d: 'The car in focus: car1-ow1, the open-wheel car the driver runs, drawn to scale. Its front wheels turn with the recorded steering.', on: true, alpha: 1,
      draw(ctx, z) { drawCar(ctx, S.R, S.i, RV.colMap(S.sel[0]), z); } },
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
      for (const m of others()) { const k = RV.ghostIdx(m.r); drawSolid(ctx, m.r, k, (opt.lineW * 0.6 + 2) / z, RV.pal['car-line']); drawSolid(ctx, m.r, k, opt.lineW * 0.6 / z, RV.colMap(m.id)); }
    } },
    { id: 'ghost', g: 'Compared runs', label: 'Their cars', d: 'One car per compared run, in that run’s colour.', on: true, alpha: 0.9, cmp: true, draw(ctx, z) {
      for (const m of others()) drawCar(ctx, m.r, RV.ghostIdx(m.r), RV.colMap(m.id), z);
    } },
  ];
  const LY = {};
  LAYERS.forEach(L => { LY[L.id] = L; L.on0 = L.on; L.alpha0 = L.alpha; });
  const DRAW = LAYERS.filter(L => L.id !== 'car').concat(LAYERS.filter(L => L.id === 'car'));   /* the car in focus is drawn last, on top */
  const OVER = [
    { id: 'hud', label: 'Readout', d: 'The box of numbers, top left.', on: true },
    { id: 'mini', label: 'Overview map', d: 'The small map of the whole track.', on: true },
    { id: 'leg', label: 'Colour keys', d: 'What the colours mean, bottom left.', on: true },
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
  }
  function layersSection(s, sm) {
    const many = S.CM.length > 0;
    if (sm) {
      s.appendChild(toggleRow('Sensor beams', 'The lines from the car to the edges of the road.', LY.beams.on, v => { LY.beams.on = LY.hits.on = LY.focus.on = v; }));
      s.appendChild(toggleRow('Driven path', 'The line the car drove, coloured by its speed.', LY.line.on, v => { LY.line.on = v; }));
      s.appendChild(toggleRow('Distance marks', 'A label every 100 m along the track.', LY.marks.on, v => { LY.marks.on = v; }));
      if (many) s.appendChild(toggleRow('The other cars', 'The cars and paths of the other selected versions.', LY.ghost.on, v => { LY.ghost.on = LY.lineB.on = v; }));
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
    rb.onclick = () => { LAYERS.forEach(L => { L.on = L.on0; L.alpha = L.alpha0; }); OVER.forEach(L => { L.on = true; }); opt.line = 'full'; opt.lineW = 3; panels(); buildSide(); };
    s.appendChild(rb);
  }
  function helpSection(s, sm) {
    const R = S.R, many = S.CM.length > 0;
    s.appendChild(el('div', 'guide',
      '<h4>What you are looking at</h4><p>The car replays the recorded lap of the selected version. The coloured path is the line it drove: blue where it was slowest, yellow where it was fastest.</p>' +
      '<p>The lines fanning out from the car are its sensors. Each measures how far it is to the edge of the road in that direction: pink means the edge is close, cyan means it is far away.</p>' +
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
    const tabs = el('div', 'seg full subtabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [['view', 'Camera'], ['layers', 'Layers'], ['help', 'Help']]) {
      const b = el('button', S.sideTab === id ? 'on' : null, label);
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', S.sideTab === id);
      b.onclick = () => { S.sideTab = id; buildSide(); };
      tabs.appendChild(b);
    }
    s.appendChild(tabs);
    const body = el('div', 'sidebody');
    s.appendChild(body);
    if (S.sideTab === 'view') viewSection(body, sm); else if (S.sideTab === 'layers') layersSection(body, sm); else helpSection(body, sm);
    message();
  }
  function panels() { for (const L of OVER) $(L.id).style.display = (L.on && onMap()) ? '' : 'none'; }

  /* what the map says when it cannot draw the run */
  function message() {
    const m = $('mapmsg'), R = S.R;
    let h = '';
    if (!S.ds) h = '';
    else if (!S.ds.trk) h = '<h3>No track map</h3><p>' + esc(S.ds.trkNote) + '</p><p class="note">The Versions and Telemetry tabs work without it.</p>';
    else if (!R) h = '<h3>No run selected</h3><p>Choose a version with a recording on the Versions tab.</p>';
    else if (!R.x) h = '<h3>This run does not fit the track map</h3><p>The run covers ' + RV.fmtInt(R.maxS) + ' m of track, but the map in use (' + esc(RV.track.title(S.ds.trk)) +
      (S.ds.trkOwn ? ', from the source’s track.xml' : ', bundled with this page') + ') is ' + S.ds.trk.total.toFixed(1) + ' m long.</p><p>' +
      (S.ds.trkOwn ? 'The track.xml in the source is not the track these runs were driven on.' : 'The source needs its own <b>track.xml</b>: the TORCS track file of the track the runs were driven on, at the root of the repository or folder.') +
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
    view.ox = (mx - b[0]) * (1 - kk) + view.ox * kk; view.oy = (my - b[1]) * (1 - kk) + view.oy * kk; view.z = z2;
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
  function setRot(v) { view.rot = v; view.ang = 0; }
  function setAll(v) { view.all = v; view.sInit = false; view.ox = view.oy = 0; buildSide(); }
  function setFollow(v) { if (v) view.ang = 0; view.follow = v; if (!v && onMap()) { view.cx = S.R.x[S.i]; view.cy = S.R.y[S.i]; } view.ox = view.oy = 0; }
  function resetView() { view.follow = true; view.rot = true; view.all = false; view.z = 3.2; view.ox = view.oy = 0; buildSide(); }
  function fitView() {
    const B = trk().box;
    view.follow = false; view.rot = false; view.all = false; view.ang = 0; view.cx = (B[0] + B[1]) / 2; view.cy = (B[2] + B[3]) / 2; view.ox = view.oy = 0;
    view.z = Math.min(c.clientWidth / (B[1] - B[0]), c.clientHeight / (B[3] - B[2])) * 0.9;
    buildSide();
  }

  /* ---------- the frame ---------- */
  function draw() {
    const P = RV.pal, r = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight, R = S.R, i = S.i;
    if (!W) return;
    if (c.width !== Math.round(W * r) || c.height !== Math.round(H * r)) size();
    g.setTransform(r, 0, 0, r, 0, 0); g.fillStyle = P['map-bg']; g.fillRect(0, 0, W, H);
    if (!onMap()) return;
    const many = others().length > 0, a = view.rot ? Math.PI / 2 - R.yaw[i] : view.ang;
    let b = base(), ce = view.follow ? [R.x[i], R.y[i]] : [view.cx, view.cy];
    if (view.follow && view.all && many) { const f = frameAll(a, W, H); ce = f[0]; view.z = f[1]; b = [W / 2, H / 2]; }
    const z = view.z;
    lastCam = { b: b, ce: ce, a: a, z: z };
    g.translate(b[0] + view.ox, b[1] + view.oy); g.scale(z, -z); g.rotate(a); g.translate(-ce[0], -ce[1]);
    for (const L of DRAW) { if (!L.on || (L.cmp && !many)) continue; g.globalAlpha = L.alpha; L.draw(g, z); }
    g.globalAlpha = 1; g.setTransform(r, 0, 0, r, 0, 0);
    const ca = Math.cos(a), sa = Math.sin(a);
    const w2s = (x, y) => { const dx = x - ce[0], dy = y - ce[1]; return [b[0] + view.ox + (dx * ca - dy * sa) * z, b[1] + view.oy - (dx * sa + dy * ca) * z]; };
    cam = w2s;
    for (const L of LAYERS) if (L.on && L.screen && !(L.cmp && !many)) { g.globalAlpha = L.alpha; L.screen(g, w2s); }
    g.globalAlpha = 1;
    const sm = RV.simple(), gapTxt = gp => sm ? (Math.abs(gp) < 0.005 ? 'level' : Math.abs(gp).toFixed(2) + ' s ' + (gp > 0 ? 'behind' : 'ahead')) : RV.sgn(gp, 2) + ' s';
    for (const q of carCells) {
      if (q.foc) { q.gap.textContent = 'in focus'; q.spd.textContent = R.v[i].toFixed(0) + ' km/h'; }
      else { q.gap.textContent = gapTxt(q.r.t[RV.idxAtD(q.r, R.d[i])] - R.t[i]); q.spd.textContent = q.r.v[RV.ghostIdx(q.r)].toFixed(0) + ' km/h'; }
    }
    if (zoomInput && document.activeElement !== zoomInput) { const lv = Math.log(z).toFixed(2); if (zoomInput.value !== lv) { zoomInput.value = lv; zoomInput.nextSibling.textContent = zoomInput._fmt(+lv); } }
    if (OVER[1].on) drawMini();
    if (OVER[0].on) drawHud(sm, gapTxt);
  }
  function drawMini() {
    const R = S.R, B = trk().box, P = RV.pal, r = window.devicePixelRatio || 1, cw = mini.clientWidth, chh = mini.clientHeight;
    if (mini.width !== Math.round(cw * r)) { mini.width = Math.round(cw * r); mini.height = Math.round(chh * r); }
    const ms = Math.min((cw - 20) / (B[1] - B[0]), (chh - 20) / (B[3] - B[2]));
    mg.setTransform(r, 0, 0, r, 0, 0); mg.clearRect(0, 0, cw, chh);
    mg.translate(cw / 2, chh / 2); mg.scale(ms, -ms); mg.translate(-(B[0] + B[1]) / 2, -(B[2] + B[3]) / 2);
    mg.lineWidth = 2.4 / ms; mg.strokeStyle = P.mute; mg.lineJoin = 'round'; poly(mg, trk().centre); mg.closePath(); mg.stroke();
    for (const m of others()) { const k = RV.ghostIdx(m.r); mg.beginPath(); mg.arc(m.r.x[k], m.r.y[k], 4.5 / ms, 0, 7); mg.fillStyle = RV.col(m.id); mg.fill(); }
    mg.beginPath(); mg.arc(R.x[S.i], R.y[S.i], 5.5 / ms, 0, 7); mg.fillStyle = RV.col(S.sel[0]); mg.fill(); mg.lineWidth = 1.5 / ms; mg.strokeStyle = P.surface; mg.stroke();
  }
  function drawHud(sm, gapTxt) {
    const R = S.R, i = S.i, kv = [];
    const add = (k, v) => kv.push('<dt>' + k + '</dt><dd class="num">' + v + '</dd>');
    add('Lap time', R.t[i].toFixed(2) + ' s'); add('Distance', R.s[i].toFixed(0) + ' m');
    if (sm) add('Doing', R.br[i] > 0 ? 'Braking' : R.th[i] >= 0.99 ? 'Full throttle' : R.th[i] > 0.05 ? 'Part throttle' : 'Coasting');
    else {
      add('Gear', R.g[i]); add('Plan allows', R.al[i] > 350 || !R.al[i] ? 'no limit' : R.al[i].toFixed(0) + ' km/h');
      add('Throttle', R.th[i].toFixed(2)); add('Brake', R.br[i].toFixed(2)); add('Steering', R.st[i].toFixed(2)); add('Track position', R.tp[i].toFixed(2));
      if (R.beams) { let mn = 1e9, mx = -1; for (let k = 0; k < 19; k++) { const d = R.b[i * 19 + k]; if (d >= 0) { mn = Math.min(mn, d); mx = Math.max(mx, d); } } add('Beams', mx < 0 ? 'off track' : mn.toFixed(0) + ' to ' + mx.toFixed(0) + ' m'); }
    }
    for (const m of S.CM) add('<i class="sw" style="background:' + RV.col(m.id) + '"></i>' + esc(m.id), gapTxt(m.r.t[RV.idxAtD(m.r, R.d[i])] - R.t[i]) + (sm ? '' : ' &nbsp; ' + m.r.v[RV.ghostIdx(m.r)].toFixed(0) + ' km/h'));
    $('hud').innerHTML = '<div class="big num">' + R.v[i].toFixed(0) + '<small>km/h</small></div><div class="who"><i class="sw" style="background:' + RV.col(S.sel[0]) + '"></i>' + esc(R.name) + '</div><dl class="kv">' + kv.join('') + '</dl>';
  }
  function legend() {
    const R = S.R, sm = RV.simple();
    if (!R) { $('leg').innerHTML = ''; return; }
    $('leg').innerHTML = '<div class="cap">' + (sm ? 'Path colour: speed' : 'Driven line: speed') + '</div><div class="grad" style="background:' + RV.speedGradient + '"></div><div class="ends num"><span>' + S.vmin.toFixed(0) + '</span><span>km/h</span><span>' + S.vmax.toFixed(0) + '</span></div>' +
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
    if (moved >= 5) detach();
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

  RV.map = {
    draw: draw, size: size, legend: legend, buildSide: buildSide, key: key,
    resetAuto() { view.sInit = false; },
    fromHash(H) { if (H.all) view.all = true; if (H.fixed) view.rot = false; if (H.zoom) view.z = +H.zoom; },
    LAYERS: LAYERS,
  };
})();
