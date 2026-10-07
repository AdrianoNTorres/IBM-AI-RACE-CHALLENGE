/* Run viewer: the Versions tab. Headline numbers, the lap-time chart, the rankings, the table with
   multi-run selection, and the details panel. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc, fmtLap = RV.fmtLap, sgn = RV.sgn;

  let V = [], LV = [];                 /* all versions; those with a lap time (the chart's points) */
  let pr = [-0.5, 0.5], progHover = -1;
  let anchorId = null, dragSel = null;
  let bulk = null, bulkMsg = '';       /* loading every recording: {ds, done, total, failed} while it runs; the last outcome */

  if (!['all', 'fast', 'gain', 'loss', 'top', 'extra'].includes(S.listMode)) S.listMode = 'all';
  const LISTS = [['all', 'All versions'], ['fast', 'Fastest laps'], ['gain', 'Biggest gains'], ['loss', 'Biggest losses'], ['top', 'Top speeds']];
  /* chart classes: [palette key, filled dot?, meaning] */
  const CLS = {
    kb: ['v-best', true, 'Kept, new best lap'], ks: ['v-kept', true, 'Kept, not a new best lap'],
    ke: ['warn', true, 'Kept, enabling change'],
    rf: ['v-rej', false, 'Rejected, although its single lap was faster'], rs: ['v-rej', true, 'Rejected, slower or equal'],
    re: ['mute', false, 'Rejected, enabling change'],
  };

  /* each version against the best kept lap before it */
  function prepare() {
    V = S.ds.versions; LV = V.filter(v => v.lap);
    let best = null, bestId = null;
    for (const v of LV) {
      v.dbest = best == null ? null : +(v.lap - best).toFixed(2);
      v.cls = !v.kept
        ? (v.enableChange ? 're' : v.dbest != null && v.dbest < 0 ? 'rf' : 'rs')
        : (v.enableChange ? 'ke' : v.dbest == null || v.dbest < 0 ? 'kb' : 'ks');
      v.bestBefore = best; v.bestBeforeId = bestId;
      if (v.kept && (best == null || v.lap < best)) { best = v.lap; bestId = v.id; }
      v.bestAfter = best;
    }
    S.ds.bestId = bestId;
    /* the fastest lap ever recorded, kept or rejected: the reference of the live sector table and the delta bar */
    const rec = LV.filter(v => v.file);
    S.ds.fastId = rec.length ? rec.reduce((a, b) => (b.lap < a.lap ? b : a)).id : null;
    bulk = null; bulkMsg = '';
    pr = [-0.5, LV.length - 0.5];
  }

  function listRows() {
    if (S.listMode === 'extra') return S.ds.extras;
    if (S.listMode === 'all') return (S.keptAll ? V.filter(v => v.kept) : V).slice().reverse();
    let a = V;
    if (S.keptOnly) a = a.filter(v => v.kept);
    if (S.listMode === 'fast') return a.filter(v => v.lap).sort((x, y) => x.lap - y.lap).slice(0, 10);
    if (S.listMode === 'gain') return a.filter(v => v.delta != null && v.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, 10);
    if (S.listMode === 'loss') return a.filter(v => v.delta != null && v.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, 10);
    return a.filter(v => v.top).sort((x, y) => y.top - x.top).slice(0, 10);
  }
  function badge(v) {
    if (v.kept == null) return '<span class="badge">Recording</span>';
    if (v.kept && v.enableChange) return '<span class="badge warn-badge"><i>&#10003;</i>Enabling change</span>';
    if (!v.kept && v.enableChange) return '<span class="badge rej dim-badge"><i>&#10005;</i>Enabling change</span>';
    return v.kept ? '<span class="badge kept"><i>&#10003;</i>Kept</span>' : '<span class="badge rej"><i>&#10005;</i>Rejected</span>';
  }
  /* a version entered by hand: kept in this browser, not in the source (js/entry.js) */
  const localBadge = v => (v.local ? ' <span class="badge local" title="Entered by hand: kept in this browser only until it is exported">Local</span>' : '');
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
    /* best theoretical lap: the best S1, S2 and S3 of the versions whose recordings have been opened, kept or not */
    const sv = V.filter(v => v.sec && v.sec.every(x => x != null));
    let theo = '';
    if (!RV.simple() && sv.length >= 2) {
      const who = [0, 1, 2].map(k => sv.reduce((a, b) => (b.sec[k] < a.sec[k] ? b : a)));
      theo = t('Best theoretical', fmtLap(who.reduce((s, b, k) => s + b.sec[k], 0)),
        who.map((b, k) => 'S' + (k + 1) + ' ' + esc(b.id)).join(', ') + (S.ds.summary ? ', the best of ' + sv.length + ' recordings' : ', from the ' + sv.length + ' recordings loaded so far'));
    }
    return '<div class="tiles' + (theo ? ' five' : '') + '">' +
      t('Best lap', fmtLap(best.lap), esc(best.id) + ', the fastest kept version', 'hero') +
      t('Gained since ' + esc(first.id), (first.lap - best.lap).toFixed(2) + ' s', 'from ' + fmtLap(first.lap) + ' down to ' + fmtLap(best.lap)) +
      t('Versions', String(V.length), nk + ' kept, ' + (V.length - nk) + ' rejected') +
      t('Latest', esc(lastV.id), (lastV.lap ? fmtLap(lastV.lap) + ', ' : '') + (lastV.kept ? 'kept' : 'rejected')) + theo + '</div>';
  }

  /* Detailed view: the sector times of every version whose recording has been opened, kept or not. */
  function sectorGrid() {
    const sum = !!S.ds.summary, all = sum && S.secAll;
    if (RV.simple() || (all ? RV.sectors.known() : RV.sectors.opened()).length < 2 && !sum) return '';
    return '<div class="card sumcard seccard"><div class="cardhead"><h3>Sectors across versions</h3><span class="note">' +
      (all ? 'Every version with a recording, from the summary made when the site was published. ' : 'Only versions that have been opened (selected or compared) are listed; \u201cLoad all versions\u201d adds none. ') + RV.sectors.NOTE + '</span></div>' +
      (sum ? '<label class="check secall"><input type="checkbox" id="secAll"' + (S.secAll ? ' checked' : '') + '> Every version, not only the opened ones</label>' : '') + RV.sectors.table(false) + '</div>';
  }

  function render() {
    if (!S.ds) return;
    const box = $('vmain'), sm = RV.simple(), mode = S.listMode, rank = mode !== 'all' && mode !== 'extra', extra = mode === 'extra';
    const notes = {
      all: '', extra: 'CSV files in the folder\u2019s runs/ that no changelog entry names, newest first. A lap time appears once a recording has been opened.',
      fast: sm ? 'The ten quickest laps.' : 'Ten lowest single-lap times.',
      gain: sm ? 'The ten changes that cut the most time off the lap, compared with the last kept version before them.' : 'Largest lap-time reductions against the previous kept version.',
      loss: sm ? 'The ten changes that added the most time, compared with the last kept version before them.' : 'Largest lap-time increases against the previous kept version.',
      top: 'The ten highest top speeds.',
    };
    const lists = LISTS.concat(S.ds.extras.length ? [['extra', 'Other recordings (' + S.ds.extras.length + ')']] : []);
    /* detailed view: the sector times of the opened versions have a tab of their own, so the chart and the list stay near the top */
    const vtabs = sm ? '' : '<div class="seg subtabs" role="tablist" id="vtabs">' + [['overview', 'Lap times and versions'], ['sectors', 'Sectors across versions']].map(t =>
      '<button role="tab" data-v="' + t[0] + '" class="' + (S.verTab === t[0] ? 'on' : '') + '" aria-selected="' + (S.verTab === t[0]) + '">' + t[1] + '</button>').join('') + '</div>';
    const wireTabs = () => box.querySelectorAll('#vtabs button').forEach(b => { b.onclick = () => { S.verTab = b.dataset.v; RV.uiSet('verTab', S.verTab); render(); }; });
    if (!sm && S.verTab === 'sectors') {
      box.innerHTML = tiles() + vtabs + (sectorGrid() || '<div class="card"><p class="lead">No sector times to compare yet.</p><p class="note">Sector times come from a version\u2019s recording. Open two or more versions (select one, or compare several) and they are listed here side by side.</p></div>');
      wireTabs(); RV.sectors.wire(box); renderDetail();
      if ($('secAll')) $('secAll').onchange = e => { S.secAll = e.target.checked; RV.uiSet('secAll', S.secAll); render(); };
      return;
    }
    let h = tiles() + vtabs +
      '<div class="card chartcard"><div class="cardhead"><h3>' + (sm ? 'Lap time, version by version' : 'Lap time by version') + '</h3>' +
      '<div class="key">' + Object.keys(CLS).map(k => '<span><i class="' + (CLS[k][1] ? 'dot' : 'ring') + ' c-' + CLS[k][0] + '"></i>' + CLS[k][2] + '</span>').join('') + '<span><i class="ln"></i>Best lap so far</span></div></div>' +
      '<canvas id="prog" tabindex="0" aria-label="Lap time of every version; lower is faster"></canvas>' +
      '<p class="note">' + (sm ? 'Each dot is one version; lower is faster. Point at a dot to compare it with the best lap before it. Use the mouse wheel over the chart to zoom in on the later versions.'
        : 'Hover: difference to the best kept lap before each version. Wheel zooms the version axis, drag pans, double-click resets, click opens the details.') + '</p></div>' +
      '<div id="vbar"><div class="seg wrap" id="lists" role="group" aria-label="Which versions to list">' + lists.map(l => '<button data-l="' + l[0] + '" class="' + (l[0] === mode ? 'on' : '') + '" aria-pressed="' + (l[0] === mode) + '">' + l[1] + '</button>').join('') + '</div>' +
      (extra ? '' : '<label class="check"><input type="checkbox" id="ko" ' + ((rank ? S.keptOnly : S.keptAll) ? 'checked' : '') + '> Kept versions only</label>') + '</div>' +
      '<p class="note">' + notes[mode] + (notes[mode] ? ' ' : '') +
      (sm ? 'Click a version to select it. To compare several, drag across them, or hold Shift and click to select everything in between, or hold Ctrl and click to add or remove one.'
        : 'Click selects one run. Drag or Shift-click selects a range, Ctrl-click adds or removes one (up to ' + RV.MAX_RUNS + ' runs). The run clicked first is in focus.') + '</p>';
    h += '<div id="bulkBar" class="acts" style="margin:8px 0 4px"><button class="btn sm" id="bulkLoad" title="Read the recording of every version: quicker to open afterwards, and all of them count for the best theoretical lap. They are not added to the sector table.">Load all versions</button>' +
      '<button class="btn sm" id="bulkUnload" title="Free the memory of every recording that is not selected">Unload non-selected</button>' +
      '<button class="btn sm" id="addVer" title="Enter a version by hand, or import several from CSV files. They are kept in this browser until you export them.">+ Add versions \u2026</button>' +
      (S.ds.local.size || S.ds.localStale.length ? '<button class="link" id="addMine">' + (S.ds.local.size + S.ds.localStale.length) + ' kept in this browser</button>' : '') +
      '<span id="bulkStatus" class="note" role="status" style="margin-left:6px"></span></div>';
    h += '<div class="tablewrap"><table id="vt"><thead><tr>' + (rank ? '<th>#</th>' : '') + '<th class="l">' + (extra ? 'Recording' : 'Version') + '</th>' +
      (extra ? '<th>Size</th>' : '<th class="l">' + (sm ? 'What it changed' : 'Change') + '</th>') + '<th>Lap time</th>' +
      (extra ? '' : '<th title="Lap time difference vs the best lap at that point in development">' + (sm ? 'Against the best before it' : 'vs best so far') + '</th>') +
      (sm || extra ? '' : '<th class="xcol" title="Top speed reached during the lap (km/h)">Top</th><th class="xcol">Slowest corner</th>') + (extra ? '' : '<th class="l">Result</th>') + '<th class="l xcol">Recording</th></tr></thead><tbody>';
    listRows().forEach((v, k) => {
      const lapTxt = v.lap != null ? fmtLap(v.lap) : (v.sum && !v.sum.complete ? 'stopped at ' + RV.fmtInt(v.sum.stoppedAt) + ' m' : v.extra ? (v.size < 1000 ? 'empty' : 'not opened yet') : 'no lap');
      h += '<tr data-id="' + esc(v.id) + '" tabindex="0" class="' + (v.file && !v.bad ? '' : 'nofile') + '">' + (rank ? '<td class="num">' + (k + 1) + '</td>' : '') +
        '<td class="l num id">' + esc(v.id) + localBadge(v) + '</td>' + (extra ? '<td class="num">' + RV.fmtInt(v.size / 1000) + ' kB</td>' : '<td class="l w"><span>' + esc(sm && v.st ? v.st : v.title) + '</span></td>') +
        '<td class="num lap">' + lapTxt + '</td>' + (extra ? '' : deltaCell(v.dbest)) +
        (sm || extra ? '' : '<td class="num xcol">' + (v.top ? v.top + ' km/h' : '') + '</td><td class="num xcol">' + (v.slow ? v.slow + ' km/h' : '') + '</td>') +
        (extra ? '' : '<td class="l">' + badge(v) + '</td>') + '<td class="l xcol note">' + recording(v) + '</td></tr>';
    });
    /* the table is rebuilt, so the scroll position and the row that has the keyboard focus are put back */
    const keep = box.scrollTop, act = document.activeElement, focusRow = act && act.closest && act.closest('#vt tbody tr') ? act.closest('#vt tbody tr').dataset.id : null;
    box.innerHTML = h + '</tbody></table></div>';
    box.scrollTop = keep;
    if (focusRow) { const tr = box.querySelector('#vt tbody tr[data-id="' + CSS.escape(focusRow) + '"]'); if (tr) tr.focus({ preventScroll: true }); }
    box.querySelectorAll('#lists button').forEach(b => { b.onclick = () => { S.listMode = b.dataset.l; RV.uiSet('listMode', S.listMode); render(); }; });
    /* the full list starts with every version; the rankings start with the kept ones */
    if ($('ko')) $('ko').onchange = e => { if (S.listMode === 'all') S.keptAll = e.target.checked; else S.keptOnly = e.target.checked; RV.uiSet('keptAll', S.keptAll); RV.uiSet('keptOnly', S.keptOnly); render(); };
    wireTabs();
    paintRows(); setupProg(); renderDetail();
    wireBulk();
  }

  /* The table is rebuilt while recordings arrive, so the progress is kept here and painted into whatever
     bar is on the page now. */
  function paintBulk() {
    const st = $('bulkStatus');
    if (!st) return;
    st.textContent = bulk ? bulk.done + ' / ' + bulk.total + ' loaded \u2026' : bulkMsg;
    $('bulkLoad').disabled = $('bulkUnload').disabled = !!bulk;
  }
  function wireBulk() {
    if (!$('bulkLoad')) return;
    $('addVer').onclick = () => RV.entry.open('one');
    if ($('addMine')) $('addMine').onclick = () => RV.entry.open('mine');
    $('bulkLoad').onclick = async () => {
      if (bulk) return;
      const ds = S.ds, pending = ds.versions.filter(v => v.file && !v.bad && !v.sum);
      if (!pending.length) { bulkMsg = 'Every recording is already loaded.'; paintBulk(); return; }
      const job = bulk = { ds: ds, done: 0, total: pending.length, failed: 0 };
      paintBulk();
      /* four at a time: quicker than one by one, and gentle on the host */
      const next = async () => {
        while (pending.length && bulk === job) {
          const v = pending.shift();
          v.bulk = true;                                  /* loaded in bulk, not opened: kept out of the sector table */
          try { await ds.loadRun(v.id); } catch (e) { job.failed++; }
          job.done++;
          if (bulk === job) paintBulk();
        }
      };
      await Promise.all([next(), next(), next(), next()]);
      if (bulk !== job) return;                           /* another data set was opened meanwhile */
      bulk = null;
      const ok = job.done - job.failed;
      bulkMsg = ok + ' recording' + (ok === 1 ? '' : 's') + ' loaded' + (job.failed ? ', ' + job.failed + ' could not be read' : '') + '.';
      RV.versions.render(); RV.map.buildSide();
    };
    $('bulkUnload').onclick = () => {
      if (bulk) return;
      /* kept: the runs on screen, the previous best of the run in focus, and the fastest lap (the map's reference) */
      const ds = S.ds, keep = S.sel.concat(S.applied, [RV.refIdFor(S.sel[0]), ds.fastId]);
      let count = 0;
      for (const v of ds.versions.concat(ds.extras)) if (!keep.includes(v.id) && ds.unloadRun(v.id)) count++;
      bulkMsg = '';
      RV.toast(count ? count + ' recording' + (count === 1 ? '' : 's') + ' unloaded.' : 'Nothing to unload.');
      RV.versions.render(); RV.map.buildSide();
    };
    paintBulk();
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
      }
    });
  }

  /* ---------- details of one version ---------- */
  function para(title, text) { return text ? '<h4>' + title + '</h4><p>' + esc(text) + '</p>' : ''; }
  function renderDetail() {
    const box = $('vside'), v = S.ds.byId[S.detailId];
    if (!v) { box.innerHTML = '<h3>Details</h3><p class="note">Select a version in the table.</p>'; return; }
    const sm = RV.simple(), on = S.sel.includes(v.id), ref = S.sel[0] === v.id, can = !!v.file && !v.bad, sum = v.sum;
    let h = '<div class="dhead"><span class="vid num">' + esc(v.id) + '</span>' + badge(v) + localBadge(v) + '</div><p class="dtitle">' + esc(sm && v.st ? v.st : v.title) + '</p>' +
      '<div class="acts"><button class="btn prim" id="dv" ' + (can ? '' : 'disabled') + '>Replay on the track</button><button class="btn" id="dt" ' + (can ? '' : 'disabled') + '>Telemetry</button>' +
      '<button class="btn" id="dc" ' + (can && !(on && S.sel.length === 1) ? '' : 'disabled') + '>' + (on ? 'Remove from comparison' : 'Add to comparison') + '</button>' +
      (on && !ref ? '<button class="btn" id="dr">Put in focus</button>' : '') + '</div>';
    if (v.local) h += '<p class="note localnote">Entered by hand and kept in this browser only. <button class="link" id="dLocal">Export, change or delete it</button></p>';
    if (v.bad) h += '<p class="warn">' + esc(v.bad) + '</p>';
    else if (v.missing && v.local) h += '<p class="warn">The recording stored with this version in this browser is gone.</p>';
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
      add('Braking', sum.brake + ' % of the lap'); add('% of the lap at full throttle', sum.full + ' %');
    }
    h += '<dl class="kv">' + kv.join('') + '</dl>';
    if (!sm) h += RV.sectorsBlock(v.id);
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
    if ($('dLocal')) $('dLocal').onclick = () => RV.entry.open('mine');
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
    paintRows: paintRows, drawProg: drawProg, renderDetail() { if (S.ds) renderDetail(); },
  };
})();
