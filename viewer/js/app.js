/* Run viewer: the page's state and what every tab shares. Which data set is open, which runs are selected,
   the replay clock, the tabs, the Basic / Detailed switch and the start-up. */
(function () {
  'use strict';
  const RV = globalThis.RV, $ = RV.$, esc = RV.esc;

  const S = RV.S = {
    ds: null,                        /* the open data set (see data.js openSource) */
    sel: [], selCol: {},             /* selected run ids (first = the car in focus) and their colour numbers */
    carScale: RV.uiGet('carScale', {}),   /* size of single cars (id to multiplier), as they were left; the others use RV.prefs.carSize */
    applied: [],                     /* the selection whose runs are loaded and shown */
    R: null, CM: [],                 /* the run in focus and the compared runs [{r, id}] */
    i: 0, t: 0, playing: true,       /* replay: row index, lap time, running */
    over: 0,                         /* seconds the clock has run on past the end of the lap in focus, while slower compared cars finish (auto loop) */
    camFrac: 0,                      /* fractional progress 0..1 between step i and i+1 (smoothing at ≤1×) */
    hold: { dir: 0, start: 0, rate: 0 },
    /* the lists and tabs open as they were left (RV.uiGet), otherwise at their defaults */
    tab: 'pv', listMode: RV.uiGet('listMode', 'all'), keptOnly: RV.uiGet('keptOnly', true), keptAll: RV.uiGet('keptAll', false), detailId: null,
    sideTab: RV.uiGet('sideTab', 'layers'), layerGroup: RV.uiGet('layerGroup', 'Sensors'), teleTab: RV.uiGet('teleTab', 'charts'), guideTab: 'layout', setTab: 'general',
    verTab: RV.uiGet('verTab', 'overview'), helpTab: RV.uiGet('helpTab', 'start'),   /* Versions: overview | sectors; the Help subject */
    hoverD: null, chartsDirty: true, progDirty: true, loadTok: 0,
    loop: null, loopDraft: null,     /* a section of the lap played on a loop: [from, to] in metres of lap distance; the one being dragged */
    vmin: 0, vmax: 1,                /* speed range of the run in focus, for the colour scale */
  };
  /* Basic view needs the simplified changelog; without it the page uses the detailed view. */
  RV.simple = () => RV.prefs.view === 'basic' && !!S.ds && S.ds.hasSimple;
  RV.col = id => RV.pal.run[S.selCol[id]];
  RV.colMap = id => RV.pal.runMap[S.selCol[id]];
  /* a version's lap time is the changelog's; a recording without an entry has only its own */
  RV.lapOf = id => { const v = S.ds.byId[id]; return v.lap != null ? v.lap : (v.sum ? v.sum.lap : null); };
  const idxAtT = RV.idxAtT = (r, t) => RV.bsearch(r.t, t);
  RV.idxAtD = (r, d) => RV.bsearch(r.d, d);
  /* where a compared car is drawn: at the same lap time as the car in focus, or at the same distance */
  RV.ghostIdx = r => RV.prefs.sync === 't' ? idxAtT(r, S.R.t[S.i] + S.over) : RV.idxAtD(r, S.R.d[S.i]);

  /* ---------- sectors (detailed view) ----------
     A run's sector times are compared with the previous best: the fastest kept version before it
     (for a recording that is not a version: the fastest kept version of all). */
  RV.refIdFor = function (id) {
    const v = S.ds.byId[id];
    if (!v) return null;
    const ref = v.extra ? S.ds.bestId : v.bestBeforeId;
    return ref && ref !== id ? ref : null;
  };
  /* The reference's recording is loaded in the background the first time it is needed. */
  RV.needRef = function (id) {
    const ref = RV.refIdFor(id), ds = S.ds, rv = ref && ds.byId[ref];
    if (!rv || !rv.file || rv.sum || rv.refTried) return;
    rv.refTried = true;
    ds.loadRun(ref).then(() => { if (ds === S.ds) { RV.tele.build(); RV.versions.render(); RV.map.buildSide(); } }, () => {});
  };
  const secDelta = d => '<span class="' + (d < -0.0005 ? 'faster' : d > 0.0005 ? 'slower' : '') + '">' + RV.sgn(d, 3) + '</span>';
  RV.secDelta = secDelta;
  /* The sector row of one version, for the details panel: S1 | S2 | S3, each with its time and a difference.
     The difference is against the run in focus when that is another run, otherwise against the previous best. */
  RV.sectorsBlock = function (id) {
    const v = S.ds.byId[id], trk = S.ds.trk;
    if (!v || !v.sec || !trk) return '';
    const foc = S.sel[0], fv = foc && foc !== id ? S.ds.byId[foc] : null;
    let rs = null, what;
    if (fv && fv.sec) { rs = fv.sec; what = '\u0394 against ' + esc(foc) + ', the run in focus'; }
    else {
      const ref = RV.refIdFor(id), rv = ref && S.ds.byId[ref];
      RV.needRef(id);
      rs = rv && rv.sec;
      what = !rv ? 'no earlier best to compare with' : rv.file ? '\u0394 against the previous best, ' + esc(ref) : 'the previous best, ' + esc(ref) + ', has no recording to compare with';
    }
    return '<h4>Sectors <span class="note">' + what + '</span></h4><div class="sec3">' + [0, 1, 2].map(k =>
      '<div title="' + esc(trk.sectors.where[k]) + '"><span>S' + (k + 1) + '</span><b class="num">' + (v.sec[k] == null ? '\u2013' : v.sec[k].toFixed(3)) + '</b>' +
      (rs && rs[k] != null && v.sec[k] != null ? '<em class="num">' + secDelta(v.sec[k] - rs[k]) + '</em>' : '<em>&nbsp;</em>') + '</div>').join('') + '</div>';
  };

  /* ---------- busy line under the top bar ---------- */
  function busy(text) { const b = $('busy'); b.className = text ? 'on' : ''; b.lastElementChild.textContent = text || ''; }
  RV.busy = busy;

  /* ---------- selection ---------- */
  function freeCol(used) { for (let k = 0; k < RV.MAX_RUNS; k++) if (!used.includes(k)) return k; return 0; }
  function addSel(id) {
    const v = S.ds.byId[id];
    if (!v || !v.file || S.sel.includes(id)) return false;
    if (S.sel.length >= RV.MAX_RUNS) { RV.toast('At most ' + RV.MAX_RUNS + ' runs can be shown together. Remove one first.'); return false; }
    S.selCol[id] = freeCol(Object.values(S.selCol)); S.sel.push(id);
    return true;
  }
  function dropSel(id) { if (S.sel.length < 2 || !S.sel.includes(id)) return; S.sel = S.sel.filter(x => x !== id); delete S.selCol[id]; }
  /* replace the selection by ids (first = in focus), keeping the colours runs already have */
  function setSel(ids, first) {
    ids = ids.filter(id => S.ds.byId[id] && S.ds.byId[id].file);
    if (first && ids.includes(first)) ids = [first].concat(ids.filter(x => x !== first));
    if (!ids.length) return false;
    if (ids.length > RV.MAX_RUNS) {
      ids = ids.slice(0, RV.MAX_RUNS);
      RV.toast('Only ' + RV.MAX_RUNS + ' runs can be shown together; the first ' + RV.MAX_RUNS + ' of the range are selected.');
    }
    const nc = {};
    ids.forEach(id => { if (S.selCol[id] != null) nc[id] = S.selCol[id]; });
    ids.forEach(id => { if (nc[id] == null) nc[id] = freeCol(Object.values(nc)); });
    S.sel = ids; S.selCol = nc;
    return true;
  }
  /* Loads the selected runs and shows them. A run that cannot be loaded is dropped with a message. */
  async function applySel(then) {
    const ids = S.sel.slice(), ds = S.ds;
    if (!ids.length) return;
    const tok = ++S.loadTok, waiting = ids.filter(id => !ds.byId[id].sum);
    if (waiting.length) busy('Loading ' + waiting.join(', ') + ' …');
    const res = await Promise.allSettled(ids.map(id => ds.loadRun(id)));
    if (tok !== S.loadTok || ds !== S.ds) return;
    busy(null);
    const runs = {}, ok = [];
    let err = null;
    res.forEach((r, k) => { if (r.status === 'fulfilled') { runs[ids[k]] = r.value; ok.push(ids[k]); } else if (!err) err = RV.explain(r.reason); });
    if (err) RV.toast(err.msg + (err.hint ? ' ' + err.hint : ''), 'err');
    if (!ok.length) {                                   /* nothing new could be shown: back to what was on screen */
      S.sel = []; S.selCol = {};
      setSel(S.applied.filter(id => ds.byId[id].file));
      RV.versions.render();
      if (!S.sel.length) { S.R = null; S.CM = []; chips(); RV.map.buildSide(); RV.tele.build(); }
      return;
    }
    ok.forEach(id => { delete ds.byId[id].bulk; });       /* selected: from now on it is an opened version */
    if (ok.length !== ids.length) setSel(ok, ok[0]);
    const had = !!S.R, R = S.R = runs[S.sel[0]];
    S.CM = S.sel.slice(1).map(id => ({ r: runs[id], id: id }));
    S.applied = S.sel.slice();
    S.t = had ? RV.clamp(S.t, R.t[0], R.t[R.n - 1]) : R.t[0];
    S.i = had ? idxAtT(R, S.t) : 0;
    RV.map.resetAuto();
    afterSelect();
    if (then) then();
  }
  function afterSelect() {
    const R = S.R;
    S.vmin = 1e9; S.vmax = -1e9; delete R._bk;
    for (let k = 0; k < R.n; k++) { if (R.v[k] < S.vmin) S.vmin = R.v[k]; if (R.v[k] > S.vmax) S.vmax = R.v[k]; }
    $('scrub').max = R.n - 1;
    chips(); RV.tele.buildGap(); RV.map.legend(); RV.map.buildSide(); RV.tele.build(); RV.versions.render();
    showBar();
    S.chartsDirty = true;
  }
  RV.sel = {
    add: addSel, drop: dropSel, set: setSel, apply: applySel,
    toggle(id) { if (S.sel.includes(id)) dropSel(id); else addSel(id); applySel(); },
    makeRef(id, then) { if (!S.sel.includes(id) && !addSel(id)) return; S.sel = [id].concat(S.sel.filter(x => x !== id)); applySel(then); },
    only(id, then) { S.sel = []; S.selCol = {}; if (addSel(id)) applySel(then); },
  };

  /* the selected runs, in the top bar */
  function chips() {
    const many = S.sel.length > 1;
    $('chips').innerHTML = S.sel.map((id, k) =>
      '<span class="chip' + (k === 0 ? ' foc' : '') + '"><button class="who" data-f="' + esc(id) + '" title="' + (k === 0 ? 'The car in focus' : 'Put this car in focus') + '">' +
      '<i style="background:' + RV.col(id) + '"></i><b>' + esc(id) + '</b><span class="num">' + RV.fmtLap(RV.lapOf(id)) + '</span>' + (k === 0 && many ? '<em>in focus</em>' : '') + '</button>' +
      (many ? '<button class="x" data-x="' + esc(id) + '" aria-label="Remove ' + esc(id) + ' from the selection">&times;</button>' : '') + '</span>').join('');
    $('chips').querySelectorAll('.x').forEach(b => { b.onclick = () => { dropSel(b.dataset.x); applySel(); }; });
    $('chips').querySelectorAll('.who').forEach(b => { b.onclick = () => { if (b.dataset.f !== S.sel[0]) RV.sel.makeRef(b.dataset.f); }; });
    $('clr').style.display = many ? '' : 'none';
  }

  /* ---------- replay clock ---------- */
  function go(k) { S.i = RV.clamp(k, 0, S.R.n - 1); S.t = S.R.t[S.i]; S.camFrac = 0; S.over = 0; }
  function seekT(tt) {
    const R = S.R, n = R.n;
    if (tt >= S.t) { while (S.i < n - 1 && R.t[S.i + 1] <= tt) S.i++; } else { while (S.i > 0 && R.t[S.i] > tt) S.i--; }
    S.t = tt; S.over = 0;
  }
  function setPlaying(p) {
    /* if restarting from the last frame, jump back to the start */
    if (p && S.R && S.i >= S.R.n - 1) go(0);
    S.playing = p; $('play').textContent = p ? 'Pause' : 'Play'; if (!p) S.camFrac = 0;
  }
  function hold(dir) { if (!S.R) return; setPlaying(false); go(S.i + dir); S.camFrac = 0; S.hold.dir = dir; S.hold.start = performance.now(); }
  function release() { S.hold.dir = 0; S.hold.rate = 0; }
  /* Loops the replay over a section of the lap (null: no loop). */
  function setLoop(range) {
    S.loop = range; S.loopDraft = null;
    const chip = $('loopChip');
    chip.hidden = !range;
    if (range) chip.textContent = 'Loop ' + RV.fmtInt(range[0]) + '\u2013' + RV.fmtInt(range[1]) + ' m  \u00d7';
    S.chartsDirty = true;
  }
  RV.play = { go: go, set: setPlaying, setLoop: setLoop };

  let last = null;
  function tick(now) {
    requestAnimationFrame(tick);
    if (last === null) last = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (S.tab === 'pv') { RV.versions.drawProg(); return; }
    const R = S.R;
    if (!R) { if (S.tab === 'pm' && S.ds) RV.map.draw(); return; }
    if (S.tab !== 'pm' && S.tab !== 'pt') return;
    const n = R.n, H = S.hold;
    if (H.dir) {                                        /* a held arrow: one step, then slow motion that speeds up */
      const h = (now - H.start) / 1000;
      H.rate = h < 0.45 ? 0 : h < 1.6 ? 0.1 : h < 3.2 ? 0.25 : 0.5;
      if (H.rate) { seekT(RV.clamp(S.t + H.dir * dt * H.rate, R.t[0], R.t[n - 1])); S.camFrac = 0; }
    } else if (S.playing) {
      const spd = +$('spd').value;
      const tt = S.t + dt * spd;
      const end = S.loop ? R.t[RV.idxAtD(R, S.loop[1])] : null;
      if (end != null && S.t <= end && tt > end) {
        go(RV.idxAtD(R, S.loop[0]));                   /* loop boundary: snap */
      } else if (tt >= R.t[n - 1]) {
        S.i = n - 1; S.camFrac = 0;
        if (RV.prefs.autoLoop) {
          /* auto loop: start again by itself, but not before the last compared car has crossed the line. Cars placed
             at the same lap time finish later the slower they are, so the clock runs on until the slowest is home;
             cars placed at the same distance finish together. */
          let last = R.t[n - 1];
          if (RV.prefs.sync === 't') for (const m of S.CM) last = Math.max(last, m.r.sum.lap != null ? m.r.sum.lap : m.r.t[m.r.n - 1]);   /* its lap time is when it crosses the line */
          if (tt < last) { S.t = tt; S.over = tt - R.t[n - 1]; } else go(0);
        } else {
          S.t = R.t[n - 1]; S.over = 0;
          setPlaying(false);                                /* pause at the finish so sector data is readable */
        }
      } else {
        seekT(tt);
        /* camera smoothing: at ≤1× speed compute fractional progress within the current step interval */
        if (spd <= 1 && RV.prefs.smooth && S.i < n - 1) {
          const t0 = R.t[S.i], t1 = R.t[S.i + 1];
          S.camFrac = t1 > t0 ? RV.clamp((S.t - t0) / (t1 - t0), 0, 1) : 0;
        } else {
          S.camFrac = 0;
        }
      }
    } else {
      S.camFrac = 0;
    }
    $('rate').textContent = H.dir ? (H.rate ? (H.dir < 0 ? 'back ' : '') + H.rate + '×, held' : 'one step') : (S.playing ? '' : 'paused');
    $('scrub').value = S.i;
    $('pos').textContent = (RV.simple() ? '' : 'frame ' + (S.i + 1) + ' of ' + n + ' · ') + R.s[S.i].toFixed(0) + ' m · ' + R.t[S.i].toFixed(2) + ' s';
    if (S.tab === 'pm') RV.map.draw(); else RV.tele.draw();
  }

  /* ---------- tabs ---------- */
  function showBar() { $('bar').classList.toggle('on', !!S.R && (S.tab === 'pm' || S.tab === 'pt')); }
  function showTab(id) {
    if (!S.ds && id !== 'ps' && id !== 'ph') id = 'pe';   /* nothing loaded: only the status page, Settings and Help exist */
    S.tab = id;
    document.querySelectorAll('.tab').forEach(q => { const on = q.dataset.t === id; q.classList.toggle('on', on); q.setAttribute('aria-current', on ? 'page' : 'false'); });
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === id));
    showBar();
    $('tip').style.display = 'none';
    RV.theme.closePick();
    S.chartsDirty = true; S.progDirty = true;
    if (id === 'pm') RV.map.size();
    if (id === 'ps') RV.settings.render();
    if (id === 'ph') RV.help.render();
  }
  RV.showTab = showTab;

  /* ---------- Basic view / Detailed view ---------- */
  const NO_BASIC = 'Basic view unavailable: this source has no simplified changelog (CHANGELOG-simple.md).';
  function paintView() {
    const can = !S.ds || S.ds.hasSimple, basic = RV.simple() || (!S.ds && RV.prefs.view === 'basic');
    document.querySelectorAll('#viewsw button').forEach(b => {
      const on = (b.dataset.m === 'basic') === basic;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      if (b.dataset.m === 'basic') {
        b.setAttribute('aria-disabled', !can); b.title = can ? 'Plain-language descriptions, fewer numbers' : NO_BASIC;
        b.innerHTML = can ? 'Basic view' : '<s>Basic view</s><small>unavailable: no simplified changelog</small>';
      }
      else b.title = 'Technical titles, every channel and every control';
    });
    document.body.classList.toggle('basic', basic);
  }
  function setView(m) {
    if (m === 'basic' && S.ds && !S.ds.hasSimple) { RV.toast(NO_BASIC); return; }
    RV.prefs.view = m; RV.savePrefs();
    RV.map.viewDefaults(true);
    refreshAll();
  }
  RV.setView = setView; RV.NO_BASIC = NO_BASIC;
  /* redraw everything that depends on the view, the theme or the data set */
  function refreshAll() {
    paintView();
    if (!S.ds) return;
    RV.versions.render();
    chips();
    if (S.R) { RV.map.legend(); RV.tele.build(); }
    RV.map.buildSide();
    if (S.tab === 'ps') RV.settings.render();
    S.chartsDirty = true; S.progDirty = true;
  }
  RV.refreshAll = refreshAll;
  RV.onTheme = function () { if (S.ds) { chips(); RV.versions.render(); if (S.R) { RV.map.legend(); RV.tele.build(); } RV.map.buildSide(); } S.chartsDirty = true; S.progDirty = true; };

  /* ---------- opening a data set ---------- */
  /* Makes ds the page's data set. start: optional {run, cmp, detail} from the address. */
  function useDataset(ds, start) {
    start = start || {};
    setLoop(null);
    S.ds = ds; S.sel = []; S.selCol = {}; S.applied = []; S.R = null; S.CM = []; S.i = 0; S.t = 0; S.loadTok++;
    if (S.listMode === 'extra' && !ds.extras.length) S.listMode = 'all';
    $('brandSub').textContent = ds.trk ? RV.track.title(ds.trk) : '';
    $('brandSub').title = ds.src.label();
    RV.versions.prepare();
    RV.map.startCamera();
    S.secHidden = {};
    RV.map.viewDefaults();
    const withFile = ds.versions.filter(v => v.file);
    const first = (start.run && ds.byId[start.run] && ds.byId[start.run].file) ? start.run : (withFile.length ? withFile[withFile.length - 1].id : null);
    S.detailId = start.detail || first || (ds.versions.length ? ds.versions[ds.versions.length - 1].id : null);
    if (first) addSel(first);
    if (start.cmp) String(start.cmp).split(',').forEach(x => addSel(x));
    refreshAll();
    chips();
    RV.map.buildSide(); RV.tele.build();
    if (S.tab === 'pe') showTab('pv');
    showBar();
    return first ? applySel(start.then) : Promise.resolve();
  }
  RV.useDataset = useDataset;

  /* the status page: loading steps, or why nothing could be loaded */
  function statusPage(html) { $('pe').innerHTML = '<div class="card status">' + html + '</div>'; }
  async function loadAtStart(start) {
    const steps = [];
    let src;
    try {
      src = RV.data.githubSource(RV.prefs.source.link);
      statusPage('<h2>Loading</h2><p class="lead">' + esc(RV.prefs.source.link) + '</p><ul class="steps" id="steps"></ul>');
      const ds = await RV.data.openSource(src, {
        onStep(t) { steps.push(t); $('steps').innerHTML = steps.map((s, k) => '<li class="' + (k < steps.length - 1 ? 'done' : 'now') + '">' + esc(s) + '</li>').join(''); },
      });
      await useDataset(ds, start);
    } catch (e) {
      const x = RV.explain(e), isDefault = RV.prefs.source.link === RV.DEFAULT_LINK;
      S.ds = null;
      statusPage('<h2>The data could not be loaded</h2><p class="lead">' + esc(x.msg) + '</p>' + (x.hint ? '<p>' + esc(x.hint) + '</p>' : '') +
        '<p class="note">Source: ' + esc(RV.prefs.source.link) + '</p><div class="acts"><button class="btn prim" id="eRetry">Try again</button>' +
        '<button class="btn" id="eSet">Open Settings</button>' + (isDefault ? '' : '<button class="btn" id="eDef">Use the default repository</button>') + '</div>');
      $('eRetry').onclick = () => loadAtStart(start);
      $('eSet').onclick = () => showTab('ps');
      if ($('eDef')) $('eDef').onclick = () => { RV.prefs.source = { kind: 'github', link: RV.DEFAULT_LINK }; RV.savePrefs(); loadAtStart(start); };
      if (S.tab !== 'ps' && S.tab !== 'ph') showTab('pe');
      paintView();
    }
  }
  RV.reload = () => loadAtStart({});

  /* ---------- start-up ---------- */
  RV.boot = function () {
    RV.applyTheme();
    RV.apiKeys.onChange(() => { if (S.tab === 'ps' && S.setTab === 'data') RV.settings.render(); });
    RV.apiKeys.checkAll();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (RV.prefs.theme === 'system') RV.applyTheme(); });

    /* options in the address, e.g. #tab=pm&run=v1.05&cmp=v1.01,v0.96&frame=1539&mode=adv&list=gain */
    const H = {};
    location.hash.slice(1).split('&').forEach(q => { const p = q.split('='); if (p[0]) H[p[0]] = p[1] === undefined ? true : decodeURIComponent(p[1]); });
    if (H.mode) RV.prefs.view = (H.mode === 'simple' || H.mode === 'basic') ? 'basic' : 'detailed';
    if (H.list) S.listMode = H.list;
    RV.map.fromHash(H);
    S.tab = 'pe';

    document.querySelectorAll('.tab').forEach(b => { b.onclick = () => showTab(b.dataset.t); });
    document.querySelectorAll('#viewsw button').forEach(b => { b.onclick = () => setView(b.dataset.m); });
    $('clr').onclick = () => RV.sel.only(S.sel[0]);
    $('loopChip').onclick = () => setLoop(null);
    const paintAuto = () => { const b = $('autoLoop'); b.setAttribute('aria-pressed', !!RV.prefs.autoLoop); b.title = RV.prefs.autoLoop ? 'Auto loop is on: at the end of the lap the replay starts again, once every car has finished. Click to switch it off.' : 'Auto loop: at the end of the lap, start the replay again by itself'; };
    $('autoLoop').onclick = () => { RV.prefs.autoLoop = !RV.prefs.autoLoop; RV.savePrefs(); paintAuto(); if (RV.prefs.autoLoop && S.R && !S.playing && S.i >= S.R.n - 1) setPlaying(true); };
    paintAuto();
    $('play').onclick = () => setPlaying(!S.playing);
    $('scrub').oninput = e => { go(+e.target.value); S.camFrac = 0; };
    $('spd').value = String(RV.prefs.speed);
    for (const [id, dir] of [['back', -1], ['fwd', 1]]) {
      const b = $(id);
      b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); hold(dir); });
      b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release);
      b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); hold(dir); } });
      b.addEventListener('keyup', release);
    }
    /* replay keys, on the Track and Telemetry tabs; which key does what is RV.KEYS and the reader's changes to it */
    addEventListener('keydown', e => {
      if (S.tab !== 'pm' && S.tab !== 'pt') return;
      const tg = e.target, typing = tg.tagName === 'INPUT' && tg.type === 'text';
      if (typing || e.ctrlKey || e.metaKey || e.altKey || !S.R) return;
      const act = RV.keyAction(e);
      if (!act) return;
      /* Space and Enter press the focused control; the tab of the page already open has nothing to do, so there they are replay keys */
      const openTab = tg.classList && tg.classList.contains('tab') && tg.classList.contains('on');
      if ((e.key === ' ' || e.key === 'Enter') && ((tg.tagName === 'BUTTON' && !openTab) || tg.tagName === 'SELECT' || tg.type === 'checkbox')) return;
      if (act === 'fwd' || act === 'back') {
        if (tg.type === 'range' || tg.tagName === 'SELECT') tg.blur();
        e.preventDefault();
        if (!e.repeat) hold(act === 'fwd' ? 1 : -1);
      } else if (act === 'play') { e.preventDefault(); if (!e.repeat) setPlaying(!S.playing); }
      else if (act === 'home') go(0);
      else if (act === 'endloop') { if (S.loop) setLoop(null); }
      else RV.map.key(act);
    });
    addEventListener('keyup', e => { const a = RV.keyAction(e); if (a === 'fwd' || a === 'back') release(); });
    addEventListener('blur', release);
    addEventListener('resize', () => { RV.map.size(); S.chartsDirty = true; S.progDirty = true; });

    paintView();
    showTab(H.help || H.tab === 'ph' ? 'ph' : H.tab === 'ps' ? 'ps' : 'pe');
    setPlaying(RV.prefs.autoplay && !H.pause && !H.frame);
    loadAtStart({
      run: H.run, cmp: H.cmp, detail: H.detail,
      then() { if (H.frame) go(+H.frame - 1); },
    }).then(() => {
      if (S.ds && H.tab && H.tab !== 'ps' && H.tab !== 'ph' && !H.help) showTab(H.tab);
      /* first visit: the welcome. Not on an address with options, which asks for a particular state. */
      if (S.ds && !RV.prefs.tutorialDone && !location.hash.slice(1)) RV.tutorial.start(true);
      /* opened as a local file and nothing loaded: offer the folder picker right on the status page */
      if (!S.ds && location.protocol === 'file:') {
        statusPage(
          '<h2>Open your project folder</h2>' +
          '<p class="lead">The page was opened from disk. Fetching from GitHub is not available here, but you can open your local project folder directly.</p>' +
          '<div class="acts"><button class="btn prim" id="eFolder">Open folder \u2026</button></div>' +
          '<p class="note">Pick the folder that contains <code>docs/CHANGELOG.md</code> and your <code>runs/</code> CSV files.</p>'
        );
        showTab('pe');
        $('eFolder').onclick = () => RV.settings.useSource({ kind: 'local', _pick: true });
      }
    });
    requestAnimationFrame(tick);
  };
})();
