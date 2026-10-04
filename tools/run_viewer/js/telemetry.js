/* Run viewer: the Telemetry tab. A summary of the selected runs, charts along the lap, and (detailed view)
   a table of 100 m sections. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc, sgn = RV.sgn, fmtLap = RV.fmtLap;

  /* k: run field; s: also shown in the basic view; cap / adv: caption in the basic / detailed view */
  const CH = [
    { k: 'v', ti: 'Speed', u: 'km/h', cap: 'How fast the car is going. The dips are the corners.', adv: 'Thin grey line: the speed the driver’s plan allows (run in focus).', al: true, s: 1 },
    { k: 'th', ti: 'Throttle', u: '0 to 1', cap: 'How far the accelerator is pressed. 1 is flat out.', s: 1 },
    { k: 'br', ti: 'Brake', u: '0 to 1', cap: 'How hard the brake is pressed.', s: 1 },
    { k: 'st', ti: 'Steering', u: '+1 = full left' },
    { k: 'tp', ti: 'Track position', u: '+1 = left edge, −1 = right edge', fixed: [-1, 1] },
    { k: 'g', ti: 'Gear', u: '', step: true },
    { k: 'gap', ti: 'Time gap', u: 'seconds', cap: 'Above zero a compared car is behind the car in focus; below zero it is ahead.', adv: 'Compared run minus the run in focus, at the same distance.', gap: true, s: 1 },
  ];
  const PL = 52, PR = 12;              /* left and right margins of a plot */
  let xr = [-12, 1], gapS = null, lastCur = -1, lastTotal = 0;

  const runs = () => [{ r: S.R, id: S.sel[0] }].concat(S.CM);
  const sw = id => '<i class="sw" style="background:' + RV.col(id) + '"></i>';

  /* time gap of every compared run to the run in focus, every 5 m */
  function buildGap() {
    gapS = null;
    const R = S.R;
    if (!R || !S.CM.length) return;
    gapS = [];
    for (const m of S.CM) m.gap = [];
    for (let d = 0; d <= R.total - 8; d += 5) {
      gapS.push(d);
      const ta = R.t[RV.idxAtD(R, d)];
      for (const m of S.CM) m.gap.push(m.r.t[RV.idxAtD(m.r, d)] - ta);
    }
  }

  function build() {
    const box = $('pt'), R = S.R;
    if (!S.ds) { box.innerHTML = ''; return; }
    if (!R) { box.innerHTML = '<div class="card status"><h2>No run selected</h2><p class="lead">Choose a version with a recording on the Versions tab.</p></div>'; return; }
    if (R.total !== lastTotal) { xr = [-12, R.total]; lastTotal = R.total; }
    const sm = RV.simple(), rs = runs(), many = S.CM.length > 0;
    const lap = r => r.sum.lap != null ? fmtLap(r.sum.lap) + (sm ? '' : ' <span class="note">(' + r.sum.lap.toFixed(3) + ' s)</span>') : 'stopped at ' + RV.fmtInt(r.sum.stoppedAt) + ' m';
    const rowsS = [
      ['Lap time', lap], ['Top speed', r => r.sum.top.toFixed(0) + ' km/h'], ['Slowest corner', r => r.sum.slow ? r.sum.slow.toFixed(0) + ' km/h' : 'none'],
      [sm ? 'Closest to the road edge (1 = on the edge)' : 'Max |trackPos|', r => r.sum.maxtp.toFixed(sm ? 2 : 3) + ' at ' + RV.fmtInt(r.sum.maxtp_at) + ' m'],
      ['Damage', r => r.sum.damage.toFixed(0)],
      [sm ? 'Part of the lap spent braking' : 'Braking', r => r.sum.brake + ' %'], [sm ? 'Part of the lap at full throttle' : 'Full throttle', r => r.sum.full + ' %'],
    ];
    let h = '<div class="card sumcard"><div class="cardhead"><h3>Summary</h3></div><div class="tablewrap"><table class="sumt"><thead><tr><th class="l"></th>' +
      rs.map((m, k) => '<th>' + sw(m.id) + esc(m.id) + (k === 0 && many ? ' <span class="note">in focus</span>' : '') + '</th>').join('') + '</tr></thead><tbody>';
    for (const q of rowsS) h += '<tr><td class="l">' + q[0] + '</td>' + rs.map(m => '<td class="num">' + q[1](m.r) + '</td>').join('') + '</tr>';
    if (many) h += '<tr><td class="l">' + (sm ? 'Against the car in focus' : 'Lap vs the run in focus') + '</td><td></td>' + S.CM.map(m => {
      if (m.r.sum.lap == null || R.sum.lap == null) return '<td></td>';
      const df = m.r.sum.lap - R.sum.lap;
      return '<td class="num ' + (df < 0 ? 'faster' : df > 0 ? 'slower' : '') + '">' + (sm ? Math.abs(df).toFixed(3) + ' s ' + (df > 0 ? 'slower' : 'faster') : sgn(df, 3) + ' s') + '</td>';
    }).join('') + '</tr>';
    h += '</tbody></table></div></div>';

    /* detailed view: charts and the section table share the space, one at a time */
    if (sm) S.teleTab = 'charts';
    else h += '<div class="seg subtabs" role="tablist" id="ttabs"><button role="tab" data-t="charts" class="' + (S.teleTab === 'charts' ? 'on' : '') + '">Charts along the lap</button><button role="tab" data-t="sect" class="' + (S.teleTab === 'sect' ? 'on' : '') + '">100 m sections</button></div>';

    if (S.teleTab === 'charts') {
      h += '<p class="note">' + (sm ? 'The charts run from the start line on the left to the finish on the right. The vertical line marks where the car is now; click anywhere on a chart to move the car there.'
        : 'Wheel: zoom the distance axis. Drag: pan. Click: move the car there. Double-click: the whole lap.') + ' &nbsp; ' + rs.map(m => '<span class="lg">' + sw(m.id) + esc(m.id) + '</span>').join(' ') + '</p>';
      for (const q of CH) {
        if ((q.gap && !many) || (sm && !q.s)) continue;
        const cap = sm ? q.cap : q.adv;
        h += '<div class="card chart"><div class="cardhead"><h3>' + q.ti + (q.u ? ' <span class="unit">' + q.u + '</span>' : '') + '</h3>' + (cap ? '<span class="note">' + cap + '</span>' : '') + '</div><canvas data-k="' + q.k + '" aria-label="' + q.ti + ' along the lap"></canvas></div>';
      }
    } else {
      h += '<p class="note">Times are for the run in focus; the columns for compared runs show their difference to it. Click a row to move the car there.</p><div class="card"><div class="tablewrap"><table id="sect"><thead><tr><th class="l">From</th><th>Time</th>' +
        S.CM.map(m => '<th>' + sw(m.id) + esc(m.id) + '</th>').join('') + '<th>Min speed</th><th>Max speed</th><th>Max brake</th><th>Max |trackPos|</th></tr></thead><tbody>';
      for (let m = 0; m < R.total - 50; m += 100) {
        const e = Math.min(m + 100, R.total - 8), a0 = RV.idxAtD(R, m), a1 = RV.idxAtD(R, e);
        if (a1 <= a0) continue;
        let lo = 1e9, hi = 0, bm = 0, tm = 0;
        for (let k = a0; k <= a1; k++) { lo = Math.min(lo, R.v[k]); hi = Math.max(hi, R.v[k]); bm = Math.max(bm, R.br[k]); tm = Math.max(tm, Math.abs(R.tp[k])); }
        const ta = R.t[a1] - R.t[a0];
        let cmp = '';
        for (const q of S.CM) { const df = q.r.t[RV.idxAtD(q.r, e)] - q.r.t[RV.idxAtD(q.r, m)] - ta; cmp += '<td class="num ' + (df < -0.005 ? 'faster' : df > 0.005 ? 'slower' : '') + '">' + sgn(df, 2) + '</td>'; }
        h += '<tr data-m="' + m + '" tabindex="0"><td class="l num">' + RV.fmtInt(m) + ' m</td><td class="num">' + ta.toFixed(2) + '</td>' + cmp + '<td class="num">' + lo.toFixed(0) + '</td><td class="num">' + hi.toFixed(0) + '</td><td class="num">' + bm.toFixed(2) + '</td><td class="num">' + tm.toFixed(2) + '</td></tr>';
      }
      h += '</tbody></table></div></div>';
    }
    const keep = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = keep;
    box.querySelectorAll('#ttabs button').forEach(b => { b.setAttribute('aria-selected', b.classList.contains('on')); b.onclick = () => { S.teleTab = b.dataset.t; build(); }; });
    box.querySelectorAll('#sect tr[data-m]').forEach(tr => {
      const f = () => { RV.play.set(false); RV.play.go(RV.idxAtD(R, +tr.dataset.m)); box.querySelectorAll('#sect tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); };
      tr.onclick = f; tr.onkeydown = e => { if (e.key === 'Enter') f(); };
    });
    box.querySelectorAll('canvas').forEach(wireChart);
    S.chartsDirty = true;
  }

  function wireChart(cv) {
    let dn = null, moved = false;
    const R = () => S.R, at = e => { const r = cv.getBoundingClientRect(); return xr[0] + (e.clientX - r.left - PL) / (r.width - PL - PR) * (xr[1] - xr[0]); };
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const d = at(e), k = Math.exp(e.deltaY * 0.0015), a = d - (d - xr[0]) * k, b = d + (xr[1] - d) * k;
      if (b - a < 20) return;
      xr = [Math.max(-12, a), Math.min(R().total, b)]; S.chartsDirty = true;
    }, { passive: false });
    cv.addEventListener('pointerdown', e => { dn = e.clientX; moved = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      if (dn !== null) {
        const dx = e.clientX - dn;
        if (Math.abs(dx) > 3) moved = true;
        if (moved) { let sh = -dx / (r.width - PL - PR) * (xr[1] - xr[0]); sh = RV.clamp(sh, -12 - xr[0], R().total - xr[1]); xr = [xr[0] + sh, xr[1] + sh]; dn = e.clientX; }
      }
      S.hoverD = at(e); tip(e); S.chartsDirty = true;
    });
    cv.addEventListener('pointerup', () => { if (!moved && S.hoverD !== null) { RV.play.set(false); RV.play.go(RV.idxAtD(R(), S.hoverD)); } dn = null; });
    cv.addEventListener('pointerleave', () => { S.hoverD = null; $('tip').style.display = 'none'; S.chartsDirty = true; });
    cv.addEventListener('dblclick', () => { xr = [-12, R().total]; S.chartsDirty = true; });
  }
  function tip(e) {
    const T = $('tip'), d = S.hoverD;
    if (d === null || d < xr[0] || d > xr[1]) { T.style.display = 'none'; return; }
    const sm = RV.simple(), rs = runs();
    const row = (n, f) => '<tr><td class="l">' + n + '</td>' + rs.map(m => '<td class="num">' + f(m.r, RV.idxAtD(m.r, d)) + '</td>').join('') + '</tr>';
    T.innerHTML = '<table><tr><th class="l">' + RV.fmtInt(d) + ' m</th>' + rs.map(m => '<th>' + sw(m.id) + esc(m.id) + '</th>').join('') + '</tr>' +
      row('Lap time', (r, k) => r.t[k].toFixed(2) + ' s') + row('Speed', (r, k) => r.v[k].toFixed(0) + ' km/h') + row('Throttle', (r, k) => r.th[k].toFixed(2)) + row('Brake', (r, k) => r.br[k].toFixed(2)) +
      (sm ? '' : row('Plan allows', (r, k) => r.al[k] > 350 || !r.al[k] ? 'no limit' : r.al[k].toFixed(0)) + row('Steering', (r, k) => r.st[k].toFixed(2)) + row('Track position', (r, k) => r.tp[k].toFixed(2)) + row('Gear', (r, k) => r.g[k])) + '</table>';
    T.style.display = 'block';
    T.style.left = Math.min(innerWidth - T.offsetWidth - 8, e.clientX + 14) + 'px'; T.style.top = Math.max(64, e.clientY - T.offsetHeight - 10) + 'px';
  }

  function draw() {
    const R = S.R, i = S.i;
    if (!R || (!S.chartsDirty && lastCur === i)) return;
    S.chartsDirty = false; lastCur = i;
    const r = window.devicePixelRatio || 1, P = RV.pal, sm = RV.simple();
    document.querySelectorAll('#pt canvas').forEach(cv => {
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W) return;
      if (cv.width !== Math.round(W * r)) { cv.width = Math.round(W * r); cv.height = Math.round(H * r); }
      const q = CH.find(z => z.k === cv.dataset.k), x = cv.getContext('2d');
      x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, W, H);
      const T = 8, B = 22, pw = W - PL - PR, ph = H - T - B, X = d => PL + (d - xr[0]) / (xr[1] - xr[0]) * pw;
      const series = [];
      if (q.gap) { if (!gapS) return; for (const m of S.CM) series.push({ s: gapS, v: m.gap, col: RV.col(m.id), w: 2 }); }
      else { series.push({ s: R.d, v: R[q.k], col: RV.col(S.sel[0]), w: 2.2 }); for (const m of S.CM) series.push({ s: m.r.d, v: m.r[q.k], col: RV.col(m.id), w: 1.6 }); }
      let lo = 1e9, hi = -1e9;
      for (const se of series) { const k0 = RV.bsearch(se.s, xr[0]), k1 = RV.bsearch(se.s, xr[1]); for (let k = k0; k <= k1; k++) { const v = se.v[k]; if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (q.fixed) { lo = q.fixed[0]; hi = q.fixed[1]; }
      else if (q.gap) { const m = Math.max(Math.abs(lo), Math.abs(hi), 0.05) * 1.1; lo = -m; hi = m; }
      else if (q.k === 'th' || q.k === 'br') { lo = 0; hi = 1; }
      else if (q.k === 'g') { lo = 0; hi = 6.4; }
      else if (q.k === 'st') { const m = Math.max(Math.abs(lo), Math.abs(hi), 0.1) * 1.08; lo = -m; hi = m; }
      else { lo = 0; hi = Math.ceil(hi * 1.04 / 50) * 50; }
      const Y = v => T + (1 - (v - lo) / (hi - lo)) * ph;
      x.font = '12px ' + P.font; x.fillStyle = P.mute; x.strokeStyle = P.grid; x.lineWidth = 1; x.textAlign = 'right'; x.textBaseline = 'middle';
      const tk = RV.niceTicks(lo, hi, 4), dec = tk[1] >= 1 ? 0 : (Math.abs(tk[1] * 10 - Math.round(tk[1] * 10)) < 1e-9 ? 1 : 2);
      for (const v of tk[0]) { const y = Y(v); x.beginPath(); x.moveTo(PL, y); x.lineTo(W - PR, y); x.stroke(); x.fillText(v.toFixed(dec), PL - 8, y); }
      x.textAlign = 'center'; x.textBaseline = 'top';
      const span = xr[1] - xr[0], stp = [10, 20, 50, 100, 200, 500, 1000].find(s => span / s <= Math.max(4, pw / 90)) || 1000;
      for (let d = Math.ceil(xr[0] / stp) * stp; d <= xr[1]; d += stp) { const xx = X(d); x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, T + ph); x.stroke(); x.fillText(RV.fmtInt(d + 0) + ' m', xx, T + ph + 6); }
      if (lo < 0 && hi > 0) { x.strokeStyle = P.mute; x.beginPath(); x.moveTo(PL, Y(0)); x.lineTo(W - PR, Y(0)); x.stroke(); }
      x.save(); x.beginPath(); x.rect(PL, T, pw, ph); x.clip();
      if (q.al && !sm) {                                 /* the planned speed of the run in focus */
        x.strokeStyle = P.mute; x.lineWidth = 1; x.beginPath();
        const k0 = RV.bsearch(R.d, xr[0]), k1 = Math.min(R.n - 1, RV.bsearch(R.d, xr[1]) + 1);
        let pen = false;
        for (let k = k0; k <= k1; k++) { if (!R.al[k]) { pen = false; continue; } const yy = Y(Math.min(R.al[k], hi * 1.5)); if (pen) x.lineTo(X(R.d[k]), yy); else x.moveTo(X(R.d[k]), yy); pen = true; }
        x.stroke();
      }
      for (let n = series.length - 1; n >= 0; n--) {
        const se = series[n], k0 = RV.bsearch(se.s, xr[0]), k1 = Math.min(se.s.length - 1, RV.bsearch(se.s, xr[1]) + 1);
        x.strokeStyle = se.col; x.lineWidth = se.w; x.lineJoin = 'round'; x.beginPath();
        for (let k = k0; k <= k1; k++) { const xx = X(se.s[k]), yy = Y(se.v[k]); if (k === k0) x.moveTo(xx, yy); else { if (q.step) x.lineTo(xx, Y(se.v[k - 1])); x.lineTo(xx, yy); } }
        x.stroke();
      }
      const cx = X(R.d[i]);
      x.strokeStyle = P.ink; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, T); x.lineTo(cx, T + ph); x.stroke();
      if (S.hoverD !== null) {
        const hx = X(S.hoverD);
        x.strokeStyle = P['ink-2']; x.lineWidth = 1; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(hx, T); x.lineTo(hx, T + ph); x.stroke(); x.setLineDash([]);
        for (const se of series) { const k = RV.bsearch(se.s, S.hoverD); x.beginPath(); x.arc(X(se.s[k]), Y(se.v[k]), 4, 0, 7); x.fillStyle = se.col; x.fill(); x.strokeStyle = P.surface; x.lineWidth = 2; x.stroke(); }
      }
      x.restore();
    });
  }

  RV.tele = { build: build, buildGap: buildGap, draw: draw };
})();
