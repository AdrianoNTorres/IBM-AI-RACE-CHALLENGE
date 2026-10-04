/* Run viewer: the Versions tab. Headline numbers, the lap-time chart, the rankings, the table with
   multi-run selection, and the details panel. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc, fmtLap = RV.fmtLap, sgn = RV.sgn;

  let V = [], LV = [];                 /* all versions; those with a lap time (the chart's points) */
  let pr = [-0.5, 0.5], progHover = -1;
  let anchorId = null, dragSel = null;

  const LISTS = [['all', 'All versions'], ['fast', 'Fastest laps'], ['gain', 'Biggest gains'], ['loss', 'Biggest losses'], ['top', 'Top speeds']];
  /* chart classes: [palette key, filled dot?, meaning] */
  const CLS = {
    kb: ['best', true, 'Kept, new best lap'], ks: ['kept', true, 'Kept, not a new best lap'],
    rf: ['best', false, 'Rejected, although its single lap was faster'], rs: ['mute', false, 'Rejected, slower or equal'],
  };

  /* each version against the best kept lap before it */
  function prepare() {
    V = S.ds.versions; LV = V.filter(v => v.lap);
    let best = null;
    for (const v of LV) {
      v.dbest = best == null ? null : +(v.lap - best).toFixed(2);
      v.cls = !v.kept ? (v.dbest != null && v.dbest < 0 ? 'rf' : 'rs') : (v.dbest == null || v.dbest < 0 ? 'kb' : 'ks');
      v.bestBefore = best;
      if (v.kept && (best == null || v.lap < best)) best = v.lap;
      v.bestAfter = best;
    }
    pr = [-0.5, LV.length - 0.5];
  }

  function listRows() {
    if (S.listMode === 'extra') return S.ds.extras;
    if (S.listMode === 'all') return V.slice().reverse();
    let a = V;
    if (S.keptOnly) a = a.filter(v => v.kept);
    if (S.listMode === 'fast') return a.filter(v => v.lap).sort((x, y) => x.lap - y.lap).slice(0, 10);
    if (S.listMode === 'gain') return a.filter(v => v.delta != null && v.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, 10);
    if (S.listMode === 'loss') return a.filter(v => v.delta != null && v.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, 10);
    return a.filter(v => v.top).sort((x, y) => y.top - x.top).slice(0, 10);
  }
  function badge(v) {
    if (v.kept == null) return '<span class="badge">Recording</span>';
    return v.kept ? '<span class="badge kept"><i>&#10003;</i>Kept</span>' : '<span class="badge rej"><i>&#10005;</i>Rejected</span>';
  }
  function deltaTxt(d) { return RV.simple() ? (d === 0 ? 'the same' : Math.abs(d).toFixed(2) + ' s ' + (d < 0 ? 'faster' : 'slower')) : sgn(d, 2) + ' s'; }
  function deltaCell(d) { return d == null ? '<td></td>' : '<td class="num ' + (d < 0 ? 'faster' : d > 0 ? 'slower' : '') + '">' + deltaTxt(d) + '</td>'; }
  function recording(v) {
    if (v.bad) return 'cannot be read';
    if (!v.file) return v.named ? 'file missing' : 'none';
    return v.beams == null ? 'available' : (v.beams ? 'path and sensors' : 'path only');
  }

  /* the headline numbers above the chart */
  function tiles() {
    if (!LV.length) return '';
    const kept = LV.filter(v => v.kept), best = kept.slice().sort((a, b) => a.lap - b.lap)[0] || LV.slice().sort((a, b) => a.lap - b.lap)[0];
    const first = LV[0], lastV = V[V.length - 1], nk = V.filter(v => v.kept).length;
    const t = (cap, big, sub, cls) => '<div class="tile ' + (cls || '') + '"><div class="cap">' + cap + '</div><div class="big num">' + big + '</div><div class="sub">' + sub + '</div></div>';
    return '<div class="tiles">' +
      t('Best lap', fmtLap(best.lap), esc(best.id) + ', the fastest kept version', 'hero') +
      t('Gained since ' + esc(first.id), (first.lap - best.lap).toFixed(2) + ' s', 'from ' + fmtLap(first.lap) + ' down to ' + fmtLap(best.lap)) +
      t('Versions', String(V.length), nk + ' kept, ' + (V.length - nk) + ' rejected') +
      t('Latest', esc(lastV.id), (lastV.lap ? fmtLap(lastV.lap) + ', ' : '') + (lastV.kept ? 'kept' : 'rejected')) + '</div>';
  }

  function render() {
    if (!S.ds) return;
    const box = $('vmain'), sm = RV.simple(), mode = S.listMode, rank = mode !== 'all' && mode !== 'extra', extra = mode === 'extra';
    const notes = {
      all: '', extra: 'CSV files in the folder’s runs/ that no changelog entry names, newest first. A lap time appears once a recording has been opened.',
      fast: sm ? 'The ten quickest laps.' : 'Ten lowest single-lap times.',
      gain: sm ? 'The ten changes that cut the most time off the lap, compared with the last kept version before them.' : 'Largest lap-time reductions against the previous kept version.',
      loss: sm ? 'The ten changes that added the most time, compared with the last kept version before them.' : 'Largest lap-time increases against the previous kept version.',
      top: 'The ten highest top speeds.',
    };
    const lists = LISTS.concat(S.ds.extras.length ? [['extra', 'Other recordings (' + S.ds.extras.length + ')']] : []);
    let h = tiles() +
      '<div class="card chartcard"><div class="cardhead"><h3>' + (sm ? 'Lap time, version by version' : 'Lap time by version') + '</h3>' +
      '<div class="key">' + Object.keys(CLS).map(k => '<span><i class="' + (CLS[k][1] ? 'dot' : 'ring') + ' c-' + CLS[k][0] + '"></i>' + CLS[k][2] + '</span>').join('') + '<span><i class="ln"></i>Best lap so far</span></div></div>' +
      '<canvas id="prog" tabindex="0" aria-label="Lap time of every version; lower is faster"></canvas>' +
      '<p class="note">' + (sm ? 'Each dot is one version; lower is faster. Point at a dot to compare it with the best lap before it. Use the mouse wheel over the chart to zoom in on the later versions.'
        : 'Hover: difference to the best kept lap before each version. Wheel zooms the version axis, drag pans, double-click resets, click opens the details.') + '</p></div>' +
      '<div id="vbar"><div class="seg wrap" id="lists" role="group" aria-label="Which versions to list">' + lists.map(l => '<button data-l="' + l[0] + '" class="' + (l[0] === mode ? 'on' : '') + '" aria-pressed="' + (l[0] === mode) + '">' + l[1] + '</button>').join('') + '</div>' +
      (rank ? '<label class="check"><input type="checkbox" id="ko" ' + (S.keptOnly ? 'checked' : '') + '> Kept versions only</label>' : '') + '</div>' +
      '<p class="note">' + notes[mode] + (notes[mode] ? ' ' : '') +
      (sm ? 'Click a version to select it. To compare several, drag across them, or hold Shift and click to select everything in between, or hold Ctrl and click to add or remove one.'
        : 'Click selects one run. Drag or Shift-click selects a range, Ctrl-click adds or removes one (up to ' + RV.MAX_RUNS + ' runs). The run clicked first is in focus.') + '</p>';
    h += '<div class="tablewrap"><table id="vt"><thead><tr>' + (rank ? '<th>#</th>' : '') + '<th class="l">' + (extra ? 'Recording' : 'Version') + '</th>' +
      (extra ? '<th>Size</th>' : '<th class="l">' + (sm ? 'What it changed' : 'Change') + '</th>') + '<th>Lap time</th>' +
      (extra ? '' : '<th>' + (sm ? 'Against the best before it' : 'vs best so far') + '</th>') +
      (sm || extra ? '' : '<th class="xcol">Top</th><th class="xcol">Slowest corner</th>') + (extra ? '' : '<th class="l">Result</th>') + '<th class="l xcol">Recording</th></tr></thead><tbody>';
    listRows().forEach((v, k) => {
      const lapTxt = v.lap != null ? fmtLap(v.lap) : (v.sum && !v.sum.complete ? 'stopped at ' + RV.fmtInt(v.sum.stoppedAt) + ' m' : v.extra ? (v.size < 1000 ? 'empty' : 'not opened yet') : 'no lap');
      h += '<tr data-id="' + esc(v.id) + '" tabindex="0" class="' + (v.file && !v.bad ? '' : 'nofile') + '">' + (rank ? '<td class="num">' + (k + 1) + '</td>' : '') +
        '<td class="l num id">' + esc(v.id) + '</td>' + (extra ? '<td class="num">' + RV.fmtInt(v.size / 1000) + ' kB</td>' : '<td class="l w"><span>' + esc(sm && v.st ? v.st : v.title) + '</span></td>') +
        '<td class="num lap">' + lapTxt + '</td>' + (extra ? '' : deltaCell(v.dbest)) +
        (sm || extra ? '' : '<td class="num xcol">' + (v.top ? v.top + ' km/h' : '') + '</td><td class="num xcol">' + (v.slow ? v.slow + ' km/h' : '') + '</td>') +
        (extra ? '' : '<td class="l">' + badge(v) + '</td>') + '<td class="l xcol note">' + recording(v) + '</td></tr>';
    });
    const keep = box.scrollTop;
    box.innerHTML = h + '</tbody></table></div>';
    box.scrollTop = keep;
    box.querySelectorAll('#lists button').forEach(b => { b.onclick = () => { S.listMode = b.dataset.l; render(); }; });
    if ($('ko')) $('ko').onchange = e => { S.keptOnly = e.target.checked; render(); };
    paintRows(); setupProg(); renderDetail();
  }
  function paintRows() {
    document.querySelectorAll('#vt tbody tr').forEach(tr => {
      const id = tr.dataset.id, on = S.sel.includes(id);
      tr.classList.toggle('on', on); tr.setAttribute('aria-selected', on);
      tr.cells[0].style.boxShadow = on ? 'inset 5px 0 0 ' + RV.col(id) : '';
      tr.classList.toggle('sel', id === S.detailId);
    });
    S.progDirty = true;
  }

  /* ---------- selecting rows: click = that run only, Shift-click = range, Ctrl-click = add or remove, drag = range ---------- */
  function rangeIds(a, b) {
    const ids = listRows().map(v => v.id), x = ids.indexOf(a), y = ids.indexOf(b);
    if (x < 0 || y < 0) return [b];
    return ids.slice(Math.min(x, y), Math.max(x, y) + 1);
  }
  function rowOf(e) { const q = e.target.closest ? e.target.closest('#vt tbody tr') : null; return q ? q.dataset.id : null; }
  function pick(id, shift, ctrl) {
    S.detailId = id;
    if (!S.ds.byId[id].file) { paintRows(); renderDetail(); return false; }
    if (shift && anchorId) { RV.sel.set(rangeIds(anchorId, id), anchorId); paintRows(); renderDetail(); RV.sel.apply(); return false; }
    if (ctrl) {
      if (S.sel.includes(id)) { if (S.sel.length > 1) RV.sel.set(S.sel.filter(x => x !== id)); } else RV.sel.set(S.sel.concat([id]));
      anchorId = id; paintRows(); renderDetail(); RV.sel.apply();
      return false;
    }
    anchorId = id; RV.sel.set([id]); paintRows(); renderDetail();
    return true;
  }
  function wire() {
    const box = $('vmain');
    box.addEventListener('pointerdown', e => {
      const id = rowOf(e);
      if (!id || e.button !== 0) return;
      if (e.shiftKey) e.preventDefault();               /* no text selection while extending the range */
      if (pick(id, e.shiftKey, e.ctrlKey || e.metaKey)) dragSel = id;
    });
    box.addEventListener('pointermove', e => {
      if (dragSel === null || !(e.buttons & 1)) return;
      const q = document.elementFromPoint(e.clientX, e.clientY), tr = q && q.closest ? q.closest('#vt tbody tr') : null;
      if (!tr) return;
      const want = rangeIds(dragSel, tr.dataset.id).filter(id => S.ds.byId[id].file);
      if (want.length && want.slice().sort().join() !== S.sel.slice().sort().join()) { RV.sel.set(want, dragSel); S.detailId = tr.dataset.id; paintRows(); }
    });
    addEventListener('pointerup', () => { if (dragSel !== null) { dragSel = null; renderDetail(); RV.sel.apply(); } });
    /* keyboard: arrows move between rows, Enter selects the row, Space adds it to or removes it from the comparison */
    box.addEventListener('keydown', e => {
      const tr = e.target.closest ? e.target.closest('#vt tbody tr') : null;
      if (!tr) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const to = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
        e.preventDefault(); if (to) to.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = tr.dataset.id;
        if (pick(id, e.shiftKey, e.key === ' ')) RV.sel.apply();
        const again = document.querySelector('#vt tbody tr[data-id="' + CSS.escape(id) + '"]');
        if (again) again.focus();
      }
    });
  }

  /* ---------- details of one version ---------- */
  function para(title, text) { return text ? '<h4>' + title + '</h4><p>' + esc(text) + '</p>' : ''; }
  function renderDetail() {
    const box = $('vside'), v = S.ds.byId[S.detailId];
    if (!v) { box.innerHTML = '<h3>Details</h3><p class="note">Select a version in the table.</p>'; return; }
    const sm = RV.simple(), on = S.sel.includes(v.id), ref = S.sel[0] === v.id, can = !!v.file && !v.bad, sum = v.sum;
    let h = '<div class="dhead"><span class="vid num">' + esc(v.id) + '</span>' + badge(v) + '</div><p class="dtitle">' + esc(sm && v.st ? v.st : v.title) + '</p>' +
      '<div class="acts"><button class="btn prim" id="dv" ' + (can ? '' : 'disabled') + '>Replay on the track</button><button class="btn" id="dt" ' + (can ? '' : 'disabled') + '>Telemetry</button>' +
      '<button class="btn" id="dc" ' + (can && !(on && S.sel.length === 1) ? '' : 'disabled') + '>' + (on ? 'Remove from comparison' : 'Add to comparison') + '</button>' +
      (on && !ref ? '<button class="btn" id="dr">Put in focus</button>' : '') + '</div>';
    if (v.bad) h += '<p class="warn">' + esc(v.bad) + '</p>';
    else if (v.missing) h += '<p class="warn">The changelog names runs/' + esc(v.named) + ', but that file is not in the source.</p>';
    else if (!v.file) h += '<p class="note">No lap was recorded for this version, so it cannot be replayed.</p>';
    if (sum && !sum.complete) h += '<p class="warn">This recording is not a complete lap: it stops at ' + RV.fmtInt(sum.stoppedAt) + ' m.</p>';
    const kv = [];
    const add = (k, val) => kv.push('<dt>' + k + '</dt><dd class="num">' + val + '</dd>');
    add('Lap time', fmtLap(v.lap) + (v.lap && !sm ? ' <span class="note">(' + v.lap.toFixed(2) + ' s)</span>' : ''));
    if (v.dbest != null) add(sm ? 'Against the best before it' : 'vs best so far (' + fmtLap(v.bestBefore) + ')', '<span class="' + (v.dbest < 0 ? 'faster' : v.dbest > 0 ? 'slower' : '') + '">' + deltaTxt(v.dbest) + '</span>');
    if (!sm && v.delta != null) add('vs ' + esc(v.base) + ' (last kept)', sgn(v.delta, 2) + ' s');
    if (v.top) add('Top speed', v.top + ' km/h');
    if (v.slow) add('Slowest corner', v.slow + ' km/h');
    if (v.damage) add('Damage', esc(v.damage));
    if (!sm && sum) {
      add('Closest to the edge', sum.maxtp.toFixed(3) + ' at ' + RV.fmtInt(sum.maxtp_at) + ' m');
      add('Braking', sum.brake + ' % of the lap'); add('Full throttle', sum.full + ' % of the lap');
    }
    h += '<dl class="kv">' + kv.join('') + '</dl>';
    if (S.ds.hasSimple) {
      if (!sm && v.st) h += para('In plain words', v.st);
      h += para('What changed', v.what) + para('Why', v.why) + para('Decision', v.decision) + para('What was learned', v.learned);
    }
    /* the technical record from CHANGELOG.md: long, so folded away; it is the only text when there is no simplified changelog */
    if (!sm && v.tech) {
      const T = v.tech, rows = [['What changed', T.what], ['Why', T.why], ['Observed', T.observed], ['Decision', T.decision], ['Learned', T.learned]].filter(r => r[1]);
      if (rows.length) h += '<h4>Technical record <span class="note">from CHANGELOG.md</span></h4>' +
        rows.map((r, k) => '<details' + (!S.ds.hasSimple && k === 0 ? ' open' : '') + '><summary>' + r[0] + '</summary><p>' + esc(r[1]) + '</p></details>').join('');
    }
    box.innerHTML = h; box.scrollTop = 0;
    const replay = () => { RV.play.go(0); RV.play.set(true); RV.showTab('pm'); };
    $('dv').onclick = () => { on ? RV.sel.makeRef(v.id, replay) : RV.sel.only(v.id, replay); };
    $('dt').onclick = () => { const f = () => RV.showTab('pt'); on ? RV.sel.makeRef(v.id, f) : RV.sel.only(v.id, f); };
    $('dc').onclick = () => RV.sel.toggle(v.id);
    if ($('dr')) $('dr').onclick = () => RV.sel.makeRef(v.id);
  }

  /* ---------- the lap-time chart ---------- */
  const PL = 58, PR = 12;              /* left and right margins of the plot */
  function setupProg() {
    const cv = $('prog');
    if (!cv) return;
    S.progDirty = true;
    let dn = null, moved = false;
    const at = e => { const r = cv.getBoundingClientRect(); return pr[0] + (e.clientX - r.left - PL) / (r.width - PL - PR) * (pr[1] - pr[0]); };
    const lim = () => { pr = [Math.max(-0.5, pr[0]), Math.min(LV.length - 0.5, pr[1])]; S.progDirty = true; };
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const d = at(e), k = Math.exp(e.deltaY * 0.0015), a = d - (d - pr[0]) * k, b = d + (pr[1] - d) * k;
      if (b - a < 4) return;
      pr = [a, b]; lim();
    }, { passive: false });
    cv.addEventListener('pointerdown', e => { dn = e.clientX; moved = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      if (dn !== null) {
        const dx = e.clientX - dn;
        if (Math.abs(dx) > 3) moved = true;
        if (moved) { let sh = -dx / (r.width - PL - PR) * (pr[1] - pr[0]); sh = RV.clamp(sh, -0.5 - pr[0], LV.length - 0.5 - pr[1]); pr = [pr[0] + sh, pr[1] + sh]; dn = e.clientX; }
      }
      const k = Math.round(at(e));
      progHover = (k >= 0 && k < LV.length) ? k : -1; S.progDirty = true;
      const T = $('tip');
      if (progHover < 0) { T.style.display = 'none'; return; }
      const v = LV[progHover], sm = RV.simple();
      T.innerHTML = '<b>' + esc(v.id) + '</b> &nbsp; <span class="num">' + fmtLap(v.lap) + '</span><br>' + CLS[v.cls][2] +
        (v.dbest != null ? '<br><span class="num">' + (sm ? Math.abs(v.dbest).toFixed(2) + ' s ' + (v.dbest < 0 ? 'faster' : v.dbest > 0 ? 'slower' : '(the same)') + ' than the best lap before it'
          : sgn(v.dbest, 2) + ' s vs the best kept lap before it (' + fmtLap(v.bestBefore) + ')') + '</span>' : '') +
        '<br><span class="note">' + esc((sm && v.st ? v.st : v.title).slice(0, 110)) + '</span>';
      T.style.display = 'block';
      T.style.left = Math.min(innerWidth - T.offsetWidth - 8, e.clientX + 14) + 'px'; T.style.top = (e.clientY + 16) + 'px';
    });
    cv.addEventListener('pointerup', () => { if (!moved && progHover >= 0) { S.detailId = LV[progHover].id; paintRows(); renderDetail(); } dn = null; });
    cv.addEventListener('pointerleave', () => { progHover = -1; $('tip').style.display = 'none'; S.progDirty = true; });
    cv.addEventListener('dblclick', () => { pr = [-0.5, LV.length - 0.5]; S.progDirty = true; });
    /* keyboard: left and right step through the versions, + and - zoom, 0 resets */
    cv.addEventListener('keydown', e => {
      const cur = LV.findIndex(v => v.id === S.detailId);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const k = RV.clamp((cur < 0 ? LV.length - 1 : cur) + (e.key === 'ArrowRight' ? 1 : -1), 0, LV.length - 1);
        S.detailId = LV[k].id; paintRows(); renderDetail();
      } else if (e.key === '+' || e.key === '=' || e.key === '-') {
        const c = cur < 0 ? (pr[0] + pr[1]) / 2 : cur, k = e.key === '-' ? 1.4 : 0.7, a = c - (c - pr[0]) * k, b = c + (pr[1] - c) * k;
        if (b - a >= 4) { pr = [a, b]; lim(); }
      } else if (e.key === '0') { pr = [-0.5, LV.length - 0.5]; S.progDirty = true; }
    });
  }
  function niceTicks(lo, hi, n) {
    const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= raw * 0.999) || raw, o = [];
    for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9; v += st) o.push(Math.abs(v) < 1e-9 ? 0 : v);
    return [o, st];
  }
  RV.niceTicks = niceTicks;
  function drawProg() {
    const cv = $('prog');
    if (!cv || !S.progDirty || !LV.length) return;
    const r = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, P = RV.pal;
    if (!W) return;
    S.progDirty = false;
    cv.width = W * r; cv.height = H * r;
    const x = cv.getContext('2d');
    x.setTransform(r, 0, 0, r, 0, 0);
    const T = 12, B = 24, pw = W - PL - PR, ph = H - T - B, X = k => PL + (k - pr[0]) / (pr[1] - pr[0]) * pw;
    let lo = 1e9, hi = 0;
    LV.forEach((v, k) => { if (k >= pr[0] && k <= pr[1]) { lo = Math.min(lo, v.lap); hi = Math.max(hi, v.lap); } });
    const pad = (hi - lo) * 0.1 || 0.5;
    lo -= pad; hi += pad;
    const Y = v => T + (1 - (v - lo) / (hi - lo)) * ph;
    x.font = '12px ' + P.font; x.fillStyle = P.mute; x.strokeStyle = P.grid; x.lineWidth = 1; x.textAlign = 'right'; x.textBaseline = 'middle';
    for (const v of niceTicks(lo, hi, 4)[0]) { x.beginPath(); x.moveTo(PL, Y(v)); x.lineTo(W - PR, Y(v)); x.stroke(); x.fillText(fmtLap(v), PL - 8, Y(v)); }
    x.textAlign = 'center'; x.textBaseline = 'top';
    const stp = Math.max(1, Math.ceil((pr[1] - pr[0]) / Math.max(4, Math.floor(pw / 62))));
    for (let k = Math.ceil(pr[0]); k <= pr[1]; k++) if (k % stp === 0 && LV[k]) x.fillText(LV[k].id, X(k), T + ph + 7);
    x.save(); x.beginPath(); x.rect(PL - 10, T - 10, pw + 20, ph + 20); x.clip();
    /* best lap so far, as a step line */
    x.strokeStyle = P['ink-2']; x.lineWidth = 1.5; x.beginPath();
    let pen = false;
    LV.forEach((v, k) => { if (v.bestAfter == null) return; const y = Y(v.bestAfter); if (!pen) { x.moveTo(X(k), y); pen = true; } else x.lineTo(X(k), y); x.lineTo(X(k + 1), y); });
    x.stroke();
    LV.forEach((v, k) => {
      const px = X(k), py = Y(v.lap), q = CLS[v.cls], col = P[q[0]];
      x.beginPath(); x.arc(px, py, q[1] ? 4.5 : 3.5, 0, 7);
      if (q[1]) { x.fillStyle = col; x.fill(); x.strokeStyle = P.surface; x.lineWidth = 1.5; x.stroke(); }
      else { x.fillStyle = P.surface; x.fill(); x.strokeStyle = col; x.lineWidth = 2; x.stroke(); }
      if (S.sel.includes(v.id)) { x.beginPath(); x.arc(px, py, 8.5, 0, 7); x.strokeStyle = RV.col(v.id); x.lineWidth = 2.5; x.stroke(); }
      if (v.id === S.detailId || k === progHover) { x.beginPath(); x.arc(px, py, 12, 0, 7); x.strokeStyle = v.id === S.detailId ? P.ink : P.mute; x.lineWidth = 1; x.stroke(); }
    });
    x.restore();
  }

  let wired = false;
  RV.versions = {
    prepare: prepare,
    render() { if (!wired) { wire(); wired = true; } render(); },
    paintRows: paintRows, drawProg: drawProg,
  };
})();
