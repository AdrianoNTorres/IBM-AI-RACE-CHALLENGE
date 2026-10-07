/* Run viewer: the Telemetry tab. A summary of the selected runs, charts along the lap, and (detailed view)
   a table of 100 m sections. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc, sgn = RV.sgn, fmtLap = RV.fmtLap;

  /* k: run field; s: also shown in the basic view; c: the caption under the chart */
  const CH = [
    { k: 'v', ti: 'Speed', u: 'km/h', s: 1, c: 'Speed (km/h) \u2014 dips show braking zones and corners' },
    { k: 'th', ti: 'Throttle', u: '0 to 1', s: 1, c: 'Throttle input (0\u20131) \u2014 1 is full power' },
    { k: 'br', ti: 'Brake', u: '0 to 1', s: 1, c: 'Brake input (0\u20131) \u2014 1 is maximum braking' },
    { k: 'st', ti: 'Steering', u: '', c: 'Steering (+1 full left to \u22121 full right) \u2014 large swings may signal instability' },
    { k: 'tp', ti: 'Track position', u: '', fixed: [-1, 1], c: 'Track position (\u22121 right edge to +1 left edge)' },
    { k: 'g', ti: 'Gear', u: '', step: true, c: 'Gear selected (0 = neutral)' },
    { k: 'gap', ti: 'Time gap', u: 'seconds', gap: true, s: 1, c: 'Cumulative time gap vs the compared run \u2014 positive = ahead' },
  ];
  const NC = 24;                       /* colour steps of the speed line */
  let sectSort = { k: 'm', dir: 1 }, sectShown = [], sectCols = [], scrolled = false;
  /* whether the run's CSV had a planned speed (an "allowed" column) */
  const hasPlan = r => { if (r._plan == null) r._plan = r.al.some(x => x > 0); return r._plan; };
  const PL = 52, PR = 12;              /* left and right margins of a plot */
  let xr = [-12, 1], gapS = null, lastCur = -1, lastTotal = 0;
  const SECT_GAPS = [25, 50, 100, 200, 500];
  let sectGap = +RV.uiGet('sectGap', 100);        /* section gap (metres), as it was left */
  if (!(sectGap >= 5 && sectGap <= 5000)) sectGap = 100;
  let sectGapCustom = !SECT_GAPS.includes(sectGap);   /* true when a manually-typed value is in use */

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
    if (R.total !== lastTotal) { xr = [0, R.total]; lastTotal = R.total; }     /* auto-fit to whole lap */
    const sm = RV.simple(), rs = runs(), many = S.CM.length > 0;
    const lap = r => r.sum.lap != null ? fmtLap(r.sum.lap) + (sm ? '' : ' <span class="note">(' + r.sum.lap.toFixed(3) + ' s)</span>') : 'stopped at ' + RV.fmtInt(r.sum.stoppedAt) + ' m';
    const rowsS = [
      ['Lap time', lap], ['Top speed', r => r.sum.top.toFixed(0) + ' km/h'], ['Slowest corner', r => r.sum.slow ? r.sum.slow.toFixed(0) + ' km/h' : 'none'],
      [sm ? 'Closest to the road edge (1 = on the edge)' : 'Max |trackPos|', r => r.sum.maxtp.toFixed(sm ? 2 : 3) + ' at ' + RV.fmtInt(r.sum.maxtp_at) + ' m'],
      ['Damage', r => r.sum.damage.toFixed(0)],
      [sm ? 'Part of the lap spent braking' : 'Braking', r => r.sum.brake + ' %'], [sm ? '% of the lap at full throttle' : '% of the lap at full throttle', r => r.sum.full + ' %'],
    ];
    let sum = '<div class="card sumcard"><div class="cardhead"><h3>Summary</h3></div><div class="tablewrap"><table class="sumt"><thead><tr><th class="l"></th>' +
      rs.map((m, k) => '<th>' + sw(m.id) + esc(m.id) + (k === 0 && many ? ' <span class="note">in focus</span>' : '') + '</th>').join('') + '</tr></thead><tbody>';
    for (const q of rowsS) sum += '<tr><td class="l">' + q[0] + '</td>' + rs.map(m => '<td class="num">' + q[1](m.r) + '</td>').join('') + '</tr>';
    if (many) sum += '<tr><td class="l">' + (sm ? 'Against the car in focus' : 'Lap vs the run in focus') + '</td><td></td>' + S.CM.map(m => {
      if (m.r.sum.lap == null || R.sum.lap == null) return '<td></td>';
      const df = m.r.sum.lap - R.sum.lap;
      return '<td class="num ' + (df < 0 ? 'faster' : df > 0 ? 'slower' : '') + '">' + (sm ? Math.abs(df).toFixed(3) + ' s ' + (df > 0 ? 'slower' : 'faster') : sgn(df, 3) + ' s') + '</td>';
    }).join('') + '</tr>';
    sum += '</tbody></table></div></div>';


    /* One thing at a time, so the charts are in sight without scrolling: the charts, the summary of the runs and,
       in the detailed view, the sector times and the table of sections. */
    const sec = sm ? '' : sectorCard();
    const tabs = [['charts', 'Charts along the lap'], ['summary', 'Summary']].concat(sm ? [] : (sec ? [['sectors', 'Sectors']] : []).concat([['sect', sectGap + '\u202fm sections']]));
    if (!tabs.some(t => t[0] === S.teleTab)) S.teleTab = 'charts';
    let h = '<div class="seg subtabs" role="tablist" id="ttabs">' + tabs.map(t => '<button role="tab" data-t="' + t[0] + '" class="' + (S.teleTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>';
    if (S.teleTab === 'summary') h += sum;
    else if (S.teleTab === 'sectors') h += sec;
    else
    if (S.teleTab === 'charts') {
      /* step range input */
      h += '<div class="tblbar" id="chartBar"><p class="note">' + (sm ? 'The charts run from the start line on the left to the finish on the right. The vertical line marks where the car is now; click anywhere on a chart to move the car there. Hold and drag across a chart to play that section on a loop.'
        : 'Drag: play that section on a loop (Esc, or the Loop button below, ends it). Wheel: zoom the distance axis. Shift-drag: pan. Click: move the car there. Double-click: the whole lap.') + ' &nbsp; ' + rs.map(m => '<span class="lg">' + sw(m.id) + esc(m.id) + '</span>').join(' ') + '</p>' +
        '<label class="lbl" for="teleRange">Range (m)</label><div class="inrow sm"><input type="text" id="teleRange" spellcheck="false" style="width:120px" placeholder="0\u2013' + Math.round(R.total) + '" value="' + Math.round(xr[0]) + '\u2013' + Math.round(xr[1]) + '"><button class="btn sm" id="teleReset">Full lap</button></div></div>';
      for (const q of CH) {
        if ((q.gap && !many) || (sm && !q.s)) continue;
        const lgd = q.k !== 'v' ? '' : (many ? '' : '<span class="clg"><i class="gsw"></i>Speed (red = slow, green = fast)</span>') + (hasPlan(R) ? '<span class="clg"><i class="dsw"></i>Planned</span>' : '');
        h += '<div class="card chart"><div class="cardhead"><h3>' + q.ti + (q.u ? ' <span class="unit">' + q.u + '</span>' : '') + '</h3>' + lgd + '</div><canvas data-k="' + q.k + '" aria-label="' + q.ti + ' along the lap"></canvas><p class="chart-caption">' + q.c + '</p>' + (q.gap ? '' : statsBar(R, q)) + '</div>';
      }
    } else h += sectionsTable();
    const keep = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = keep;
    box.querySelectorAll('#ttabs button').forEach(b => { b.setAttribute('aria-selected', b.classList.contains('on')); b.onclick = () => { S.teleTab = b.dataset.t; RV.uiSet('teleTab', S.teleTab); build(); }; });
    /* step range input */
    if ($('teleRange')) {
      $('teleRange').onchange = e => {
        const m = /^(\d+)\s*[\u2013\-–]\s*(\d+)$/.exec(e.target.value.trim());
        if (m) { xr = [RV.clamp(+m[1], 0, R.total), RV.clamp(+m[2], 0, R.total)]; if (xr[0] >= xr[1]) xr = [0, R.total]; }
        else { xr = [0, R.total]; }
        e.target.value = Math.round(xr[0]) + '\u2013' + Math.round(xr[1]);
        S.chartsDirty = true;
      };
      $('teleRange').onkeydown = e => { if (e.key === 'Enter') $('teleRange').dispatchEvent(new Event('change')); };
    }
    if ($('teleReset')) $('teleReset').onclick = () => { xr = [0, R.total]; if ($('teleRange')) $('teleRange').value = '0\u2013' + Math.round(R.total); S.chartsDirty = true; };
    box.querySelectorAll('#sect tr[data-m]').forEach(tr => {
      const f = () => { RV.play.set(false); RV.play.go(RV.idxAtD(R, +tr.dataset.m)); box.querySelectorAll('#sect tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); };
      tr.onclick = f; tr.onkeydown = e => { if (e.key === 'Enter') f(); };
    });
    box.querySelectorAll('#sect .sortb').forEach(b => { b.onclick = () => { sectSort = { k: b.dataset.k, dir: sectSort.k === b.dataset.k ? -sectSort.dir : 1 }; build(); const again = document.querySelector('#sect .sortb[data-k="' + b.dataset.k + '"]'); if (again) again.focus(); }; });
    if ($('sectExport')) $('sectExport').onclick = exportSections;
    /* section gap preset buttons */
    box.querySelectorAll('[data-g]').forEach(b => { b.onclick = () => { sectGap = +b.dataset.g; sectGapCustom = false; RV.uiSet('sectGap', sectGap); build(); }; });
    /* custom gap input */
    if ($('sectGapApply')) {
      const applyCustom = () => {
        const v = parseInt($('sectGapInput').value, 10);
        if (v >= 5 && v <= 5000) { sectGap = v; sectGapCustom = !SECT_GAPS.includes(v); RV.uiSet('sectGap', sectGap); build(); }
        else { $('sectGapInput').focus(); }
      };
      $('sectGapApply').onclick = applyCustom;
      $('sectGapInput').onkeydown = e => { if (e.key === 'Enter') applyCustom(); };
    }
    box.querySelectorAll('canvas').forEach(wireChart);
    S.chartsDirty = true;
  }

  /* ---------- configurable sections: one object per section, shown as a sortable table and exported as CSV ---------- */
  function sectionData() {
    const R = S.R, rows = [], gap = sectGap;
    /* build section start points, then add R.total - 8 as the terminal so the last section is always included */
    const TERM = R.total - 8;
    const starts = [];
    for (let m = 0; m < TERM - gap * 0.5; m += gap) starts.push(m);
    starts.push(TERM);                 /* terminal: last section runs to the end of the usable lap data */
    for (let si = 0; si < starts.length - 1; si++) {
      const m = starts[si], e = starts[si + 1], a0 = RV.idxAtD(R, m), a1 = RV.idxAtD(R, e);
      if (a1 <= a0) continue;
      let lo = 1e9, hi = 0, bm = 0, tm = 0, g0 = 99, g1 = -99;
      for (let k = a0; k <= a1; k++) { lo = Math.min(lo, R.v[k]); hi = Math.max(hi, R.v[k]); bm = Math.max(bm, R.br[k]); tm = Math.max(tm, Math.abs(R.tp[k])); g0 = Math.min(g0, R.g[k]); g1 = Math.max(g1, R.g[k]); }
      const t = R.t[a1] - R.t[a0];
      rows.push({ m: m, t: t, lo: lo, hi: hi, bm: bm, tm: tm, g0: g0, g1: g1, c: S.CM.map(q => {
        const b0 = RV.idxAtD(q.r, m), b1 = RV.idxAtD(q.r, e);
        let qlo = 1e9, qbm = 0;
        for (let k = b0; k <= b1; k++) { qlo = Math.min(qlo, q.r.v[k]); qbm = Math.max(qbm, q.r.br[k]); }
        return { dt: q.r.t[b1] - q.r.t[b0] - t, dv: qlo - lo, db: qbm - bm };     /* compared run minus the run in focus */
      }) });
    }
    return rows;
  }
  function sectionsTable() {
    sectCols = [{ k: 'm', ti: 'From', l: 1, f: r => r.m, s: r => RV.fmtInt(r.m) + ' m' }, { k: 't', ti: 'Time', f: r => r.t, s: r => r.t.toFixed(2) }]
      .concat(S.CM.map((q, n) => ({ k: 'c' + n, ti: sw(q.id) + esc(q.id), f: r => r.c[n].dt, s: r => sgn(r.c[n].dt, 2), cls: r => (r.c[n].dt < -0.005 ? 'faster' : r.c[n].dt > 0.005 ? 'slower' : '') })))
      .concat([{ k: 'lo', ti: 'Min speed', f: r => r.lo, s: r => r.lo.toFixed(0) }, { k: 'hi', ti: 'Max speed', f: r => r.hi, s: r => r.hi.toFixed(0) },
        { k: 'bm', ti: 'Max brake', f: r => r.bm, s: r => r.bm.toFixed(2) }, { k: 'tm', ti: 'Max |trackPos|', f: r => r.tm, s: r => r.tm.toFixed(2) }]);
    const col = sectCols.find(c => c.k === sectSort.k) || sectCols[0];
    if (col.k !== sectSort.k) sectSort = { k: 'm', dir: 1 };
    sectShown = sectionData().sort((a, b) => (col.f(a) - col.f(b)) * sectSort.dir || a.m - b.m);
    let h = '<div class="tblbar"><p class="note">Times are for the run in focus; the columns for compared runs show their difference to it. Click a row to move the car there, a column heading to sort by it.</p>' +
      '<div class="sect-gap-ctrl"><label class="lbl" style="margin:0">Section gap:</label>' +
      '<div class="seg" role="group" aria-label="Section gap">' + SECT_GAPS.map(g => '<button class="' + (!sectGapCustom && g === sectGap ? 'on' : '') + '" data-g="' + g + '">' + g + ' m</button>').join('') + '</div>' +
      '<div class="inrow sm" style="gap:4px;margin:0"><input type="text" id="sectGapInput" style="width:72px" placeholder="m" value="' + (sectGapCustom ? sectGap : '') + '" aria-label="Custom section gap in metres"><button class="btn sm" id="sectGapApply">Apply</button></div></div>' +
      '<button class="btn sm" id="sectExport" title="Download these rows, in this order, as a CSV file">Export CSV</button></div><div class="card"><div class="tablewrap"><table id="sect"><thead><tr>' +
      sectCols.map(c => { const on = c.k === sectSort.k; return '<th class="' + (c.l ? 'l' : '') + '" aria-sort="' + (on ? (sectSort.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button class="sortb' + (on ? ' on' : '') + '" data-k="' + c.k + '" title="Sort by this column">' + c.ti + '<span class="arr">' + (on ? (sectSort.dir > 0 ? '\u2191' : '\u2193') : '\u2191\u2193') + '</span></button></th>'; }).join('') + '</tr></thead><tbody>';
    for (const r of sectShown) h += '<tr data-m="' + r.m + '" tabindex="0">' + sectCols.map(c => '<td class="' + (c.l ? 'l ' : '') + 'num ' + (c.cls ? c.cls(r) : '') + '">' + c.s(r) + '</td>').join('') + '</tr>';
    return h + '</tbody></table></div></div>';
  }
  function exportSections() {
    const id = S.sel[0], head = ['section_start_m', 'time_s', 'min_speed_kmh', 'max_speed_kmh', 'max_brake', 'max_abs_trackpos', 'min_gear', 'max_gear'];
    for (const q of S.CM) head.push(q.id + '_time_diff_s', q.id + '_min_speed_diff_kmh', q.id + '_max_brake_diff');
    const lines = [head.join(',')];
    for (const r of sectShown) {
      const f = [r.m, r.t.toFixed(3), r.lo.toFixed(1), r.hi.toFixed(1), r.bm.toFixed(3), r.tm.toFixed(3), r.g0, r.g1];
      for (const c of r.c) f.push(c.dt.toFixed(3), c.dv.toFixed(1), c.db.toFixed(3));
      lines.push(f.join(','));
    }
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    a.href = url; a.download = 'sections_' + String(id).replace(/[^\w.-]+/g, '_') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  /* 3: the speed of the run in focus, each piece coloured by its speed (0 = red, the run's top speed = green) */
  function speedLine(x, se, k0, k1, X, Y) {
    const top = S.vmax || 1;
    x.lineWidth = se.w; x.lineJoin = 'round'; x.lineCap = 'round';
    for (let b = 0; b < NC; b++) {
      let any = false;
      x.beginPath();
      for (let k = k0; k < k1; k++) {
        if (RV.clamp(Math.floor((se.v[k] + se.v[k + 1]) / 2 / top * NC), 0, NC - 1) !== b) continue;
        x.moveTo(X(se.s[k]), Y(se.v[k])); x.lineTo(X(se.s[k + 1]), Y(se.v[k + 1])); any = true;
      }
      if (any) { x.strokeStyle = RV.colorScale((b + 0.5) / NC, 0, 1, 1); x.stroke(); }
    }
    x.lineCap = 'butt';
  }

  /* coloured step line for throttle, brake, steering, trackPos using the shared color scale */
  function coloredLine(x, se, k0, k1, X, Y, scaleDir, scaleMin, scaleMax) {
    const NC2 = 16;
    x.lineWidth = se.w; x.lineJoin = 'round'; x.lineCap = 'round';
    for (let b = 0; b < NC2; b++) {
      let any = false;
      x.beginPath();
      for (let k = k0; k < k1; k++) {
        const mid = (se.v[k] + se.v[k + 1]) / 2;
        const bucket = RV.clamp(Math.floor((mid - scaleMin) / (scaleMax - scaleMin || 1) * NC2), 0, NC2 - 1);
        if (bucket !== b) continue;
        x.moveTo(X(se.s[k]), Y(se.v[k])); x.lineTo(X(se.s[k + 1]), Y(se.v[k + 1])); any = true;
      }
      if (any) { x.strokeStyle = RV.colorScale(scaleMin + (b + 0.5) / NC2 * (scaleMax - scaleMin), scaleMin, scaleMax, scaleDir); x.stroke(); }
    }
    x.lineCap = 'butt';
  }

  /* Sector times of the run in focus against the previous best, and of the compared runs against the run in focus. */
  function sectorCard() {
    const R = S.R, trk = S.ds.trk;
    if (!R.sec || !trk) return '';
    const sc = trk.sectors, id = S.sel[0], ref = RV.refIdFor(id), rv = ref && S.ds.byId[ref], rs = rv && rv.sec;
    RV.needRef(id);
    const tm = x => x == null ? '\u2013' : x.toFixed(3), cuts = [0].concat(sc.cuts, [trk.total]);
    let h = '<div class="card sumcard"><div class="cardhead"><h3>Sectors</h3><span class="note">' + (sc.real ? 'Laguna Seca\u2019s timing sectors' : 'Thirds of the lap') + '; times in seconds</span></div><div class="tablewrap"><table class="sumt sect"><thead><tr><th class="l">Sector</th><th class="l">From, to</th><th>' + sw(id) + esc(id) + '</th>' +
      (rv ? '<th>Previous best<br><span class="note">' + esc(ref) + '</span></th><th>Difference</th>' : '') +
      S.CM.map(m => '<th>' + sw(m.id) + esc(m.id) + '</th><th><span class="note">to ' + esc(id) + '</span></th>').join('') + '</tr></thead><tbody>';
    const row = (name, where, k) => {
      const mine = k < 3 ? R.sec[k] : R.sum.lap, theirs = rs ? (k < 3 ? rs[k] : rv.sum.lap) : null;
      return '<tr' + (k === 3 ? ' class="total"' : '') + '><td class="l"><b>' + name + '</b></td><td class="l note">' + where + '</td><td class="num">' + tm(mine) + '</td>' +
        (rv ? '<td class="num dim">' + (rs ? tm(theirs) : (rv.file ? 'loading' : 'no recording')) + '</td><td class="num">' + (rs && mine != null && theirs != null ? RV.secDelta(mine - theirs) : '') + '</td>' : '') +
        S.CM.map(m => { const x = m.r.sec ? (k < 3 ? m.r.sec[k] : m.r.sum.lap) : null; return '<td class="num">' + tm(x) + '</td><td class="num">' + (x != null && mine != null ? RV.secDelta(x - mine) : '') + '</td>'; }).join('') + '</tr>';
    };
    for (let k = 0; k < 3; k++) h += row('S' + (k + 1), esc(sc.where[k]) + ' <span class="num">(' + RV.fmtInt(cuts[k]) + ' to ' + RV.fmtInt(cuts[k + 1]) + ' m)</span>', k);
    h += row('Lap', '', 3) + '</tbody></table></div><p class="note">' +
      (rv ? 'Previous best: the fastest kept version before ' + esc(id) + '. A minus sign means faster. ' : 'There is no earlier kept version to compare ' + esc(id) + ' with. ') +
      'Sector boundaries: ' + esc(sc.src) + '.</p></div>';
    return h;
  }

  /* lowest, mean and highest value of a channel over every frame of the run in focus */
  function statsBar(R, q) {
    const a = R[q.k], n = R.n;
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let k = 0; k < n; k++) { const v = a[k]; if (v < lo) lo = v; if (v > hi) hi = v; sum += v; }
    const f = v => q.step ? String(Math.round(v)) : v.toFixed(1);
    return '<div class="chart-stats"><span>min <b class="num">' + f(lo) + '</b></span><span>mean <b class="num">' + f(sum / n) + '</b></span><span>max <b class="num">' + f(hi) + '</b></span></div>';
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
    /* drag: select a section of the lap to play on a loop. Shift-drag: pan. Click: move the car there. */
    let pan = false, d0 = 0;
    cv.addEventListener('pointerdown', e => { dn = e.clientX; moved = false; pan = e.shiftKey; d0 = at(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      if (dn !== null) {
        const dx = e.clientX - dn;
        if (Math.abs(dx) > 3) moved = true;
        if (moved && pan) { let sh = -dx / (r.width - PL - PR) * (xr[1] - xr[0]); sh = RV.clamp(sh, -12 - xr[0], R().total - xr[1]); xr = [xr[0] + sh, xr[1] + sh]; dn = e.clientX; }
        else if (moved) { const d1 = RV.clamp(at(e), 0, R().total - 8), a0 = RV.clamp(d0, 0, R().total - 8); S.loopDraft = [Math.min(a0, d1), Math.max(a0, d1)]; }
      }
      S.hoverD = at(e); tip(e); S.chartsDirty = true;
    });
    cv.addEventListener('pointerup', () => {
      if (moved && !pan && S.loopDraft && S.loopDraft[1] - S.loopDraft[0] >= 5) {
        const L = S.loopDraft;
        RV.play.setLoop(L); RV.play.go(RV.idxAtD(R(), L[0])); RV.play.set(true);
      } else if (!moved && S.hoverD !== null) { RV.play.set(false); RV.play.go(RV.idxAtD(R(), S.hoverD)); }
      S.loopDraft = null; dn = null; S.chartsDirty = true;
    });
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

  /* A chart changes only when the selection, the zoom, the view or the theme changes, but its cursor moves every
     frame. So each chart is painted once into a spare canvas; a frame copies that and draws the cursor on top.
     Charts scrolled out of sight are skipped until they come back. */
  function draw() {
    const R = S.R, i = S.i;
    if (!R || (!S.chartsDirty && lastCur === i && !scrolled)) return;
    const dirty = S.chartsDirty;
    S.chartsDirty = false; lastCur = i; scrolled = false;
    const r = window.devicePixelRatio || 1, P = RV.pal, sm = RV.simple(), port = $('pt').getBoundingClientRect();
    const ri = $('teleRange');                           /* the range field follows the wheel zoom and the pan */
    if (dirty && ri && document.activeElement !== ri) { const s = Math.round(Math.max(0, xr[0])) + '–' + Math.round(xr[1]); if (ri.value !== s) ri.value = s; }
    document.querySelectorAll('#pt canvas').forEach(cv => {
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W) return;
      if (dirty) cv._stale = true;
      const rc = cv.getBoundingClientRect();
      if (rc.bottom < port.top - 40 || rc.top > port.bottom + 40) return;
      const pxW = Math.round(W * r), pxH = Math.round(H * r);
      if (cv.width !== pxW || cv.height !== pxH) { cv.width = pxW; cv.height = pxH; cv._stale = true; }
      if (!cv._buf) { cv._buf = document.createElement('canvas'); cv._stale = true; }
      if (cv._stale) { cv._buf.width = pxW; cv._buf.height = pxH; paintChart(cv, cv._buf.getContext('2d'), W, H, r, P, sm); cv._stale = false; }
      const x = cv.getContext('2d'), T = 8, B = 22, pw = W - PL - PR, ph = H - T - B;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, pxW, pxH); x.drawImage(cv._buf, 0, 0);
      const cx = PL + (R.d[i] - xr[0]) / (xr[1] - xr[0]) * pw;
      if (cx >= PL && cx <= PL + pw) { x.setTransform(r, 0, 0, r, 0, 0); x.strokeStyle = P.ink; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, T); x.lineTo(cx, T + ph); x.stroke(); }
    });
  }
  function paintChart(cv, x, W, H, r, P, sm) {
    {
      const R = S.R, q = CH.find(z => z.k === cv.dataset.k);
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
      else if (q.k === 'g') { lo = -0.4; hi = 6.4; }
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
      const lp = S.loopDraft || S.loop;                  /* the section played on a loop, or being selected */
      if (lp) {
        const xa = X(lp[0]), xb = X(lp[1]);
        x.globalAlpha = S.loopDraft ? 0.12 : 0.18; x.fillStyle = P.accent; x.fillRect(xa, T, xb - xa, ph); x.globalAlpha = 1;
        x.strokeStyle = P.accent; x.lineWidth = 1.5; x.beginPath(); x.moveTo(xa, T); x.lineTo(xa, T + ph); x.moveTo(xb, T); x.lineTo(xb, T + ph); x.stroke();
      }
      if (!sm && R.sec) {                                /* sector boundaries */
        x.strokeStyle = P.best; x.fillStyle = P.best; x.lineWidth = 1; x.setLineDash([5, 4]); x.textAlign = 'left'; x.textBaseline = 'top'; x.font = '600 11px ' + P.font;
        S.ds.trk.sectors.cuts.forEach((d, k) => { const xx = X(d); x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, T + ph); x.stroke(); x.fillText('S' + (k + 2), xx + 4, T + 2); });
        x.setLineDash([]);
      }
      if (q.k === 'v' && hasPlan(R)) {                   /* the planned speed of the run in focus, dashed */
        x.strokeStyle = P['ink-2']; x.lineWidth = 1.2; x.setLineDash([6, 4]); x.beginPath();
        const k0 = RV.bsearch(R.d, xr[0]), k1 = Math.min(R.n - 1, RV.bsearch(R.d, xr[1]) + 1);
        let pen = false;
        for (let k = k0; k <= k1; k++) { if (!R.al[k]) { pen = false; continue; } const yy = Y(Math.min(R.al[k], hi * 1.5)); if (pen) x.lineTo(X(R.d[k]), yy); else x.moveTo(X(R.d[k]), yy); pen = true; }
        x.stroke();
      }
      x.setLineDash([]);
      for (let n = series.length - 1; n >= 0; n--) {
        const se = series[n], k0 = RV.bsearch(se.s, xr[0]), k1 = Math.min(se.s.length - 1, RV.bsearch(se.s, xr[1]) + 1);
        /* one run: its line is coloured by value. Compared runs: one solid colour per car, or the lines cannot be told apart */
        const alone = S.CM.length === 0;
        if (q.k === 'v' && n === 0 && alone) { speedLine(x, se, k0, k1, X, Y); continue; }
        /* throttle (green=high), brake (green=low), steering/trackPos (green=near 0, red=near ±1) — only for the run in focus */
        if (n === 0 && alone && (q.k === 'th' || q.k === 'br' || q.k === 'st' || q.k === 'tp')) {
          if (q.k === 'th') { coloredLine(x, se, k0, k1, X, Y, 1, 0, 1); continue; }
          if (q.k === 'br') { coloredLine(x, se, k0, k1, X, Y, -1, 0, 1); continue; }
          /* steering and trackPos: abs value drives bucket; original Y used for drawing */
          const NC3 = 16;
          x.lineWidth = se.w; x.lineJoin = 'round'; x.lineCap = 'round';
          for (let b = 0; b < NC3; b++) {
            let any = false; x.beginPath();
            for (let k = k0; k < k1; k++) {
              const av = (Math.abs(se.v[k]) + Math.abs(se.v[k + 1])) / 2;
              if (RV.clamp(Math.floor(av * NC3), 0, NC3 - 1) !== b) continue;
              x.moveTo(X(se.s[k]), Y(se.v[k])); x.lineTo(X(se.s[k + 1]), Y(se.v[k + 1])); any = true;
            }
            if (any) { x.strokeStyle = RV.colorScale(b / NC3, 0, 1, -1); x.stroke(); }
          }
          x.lineCap = 'butt';
          continue;
        }
        x.strokeStyle = se.col; x.lineWidth = se.w; x.lineJoin = 'round'; x.beginPath();
        for (let k = k0; k <= k1; k++) { const xx = X(se.s[k]), yy = Y(se.v[k]); if (k === k0) x.moveTo(xx, yy); else { if (q.step) x.lineTo(xx, Y(se.v[k - 1])); x.lineTo(xx, yy); } }
        x.stroke();
      }
      if (q.gap && gapS !== null) {                      /* where each compared run's gap is largest */
        for (const m of S.CM) {
          let pk = 0;
          for (let k = 1; k < gapS.length; k++) if (Math.abs(m.gap[k]) > Math.abs(m.gap[pk])) pk = k;
          const px = X(gapS[pk]), py = Y(m.gap[pk]);
          x.beginPath(); x.arc(px, py, 5, 0, 7); x.fillStyle = RV.col(m.id); x.fill(); x.strokeStyle = P.surface; x.lineWidth = 1.5; x.stroke();
          x.font = '600 11px ' + P.fontNum; x.fillStyle = P.ink; x.textAlign = 'center';
          if (py - 9 - 14 >= T) { x.textBaseline = 'bottom'; x.fillText(RV.sgn(m.gap[pk], 2) + ' s', px, py - 9); }
          else { x.textBaseline = 'top'; x.fillText(RV.sgn(m.gap[pk], 2) + ' s', px, py + 9); }
        }
      }
      if (S.hoverD !== null) {
        const hx = X(S.hoverD);
        x.strokeStyle = P['ink-2']; x.lineWidth = 1; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(hx, T); x.lineTo(hx, T + ph); x.stroke(); x.setLineDash([]);
        for (const se of series) { const k = RV.bsearch(se.s, S.hoverD); x.beginPath(); x.arc(X(se.s[k]), Y(se.v[k]), 4, 0, 7); x.fillStyle = se.col; x.fill(); x.strokeStyle = P.surface; x.lineWidth = 2; x.stroke(); }
      }
      x.restore();
    }
  }
  $('pt').addEventListener('scroll', () => { scrolled = true; }, { passive: true });

  RV.tele = { build: build, buildGap: buildGap, draw: draw };
})();
