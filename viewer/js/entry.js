/* Run viewer: the window for adding versions by hand. Three tabs: one version (a form), import files (several
   recordings and / or a table of versions in one go), and the versions kept in this browser (export, change,
   delete). Every entry goes through js/validate.js before it is stored by js/local.js; a warning needs the
   reader's tick, a blocked entry is never stored. After a change the data set is built again from what is
   already loaded (data.js openSource, opts.reuse), so nothing is fetched twice. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc, V = RV.validate, L = RV.local;

  const TEXTS = [['what', 'What changed'], ['why', 'Why'], ['prediction', 'Prediction'], ['observed', 'Observed'], ['decision', 'Decision: the reason'], ['learned', 'Learned']];
  const blank = () => ({ id: '', title: '', result: '', lap: '', top: '', slow: '', damage: '', what: '', why: '', prediction: '', observed: '', decision: '', learned: '' });
  const LEVEL = { valid: 'Ready', warning: 'Incomplete', blocked: 'Cannot be entered' };

  let dlg = null, last = null, tab = 'one';
  let F = blank(), file = null, edit = null, touched = false, sure = false;   /* the form; its recording {name, text, check}; the record being changed */
  let rows = [], tableNotes = [];                                             /* the import: one row per version to be */
  let mine = [], picked = new Set(), askDelete = false, working = false;      /* the records of this source; those ticked */

  const srcKey = () => L.keyOf(S.ds.src);
  /* the names in use and the newest of them: the source's versions, those kept here, and extra (rows above in an import) */
  function context(extra) {
    const ids = new Set(S.ds.versions.map(v => v.id));
    for (const r of mine) ids.add(r.id);
    for (const id of extra || []) ids.add(id);
    return { ids: ids, latest: V.latestOf(ids) };
  }
  /* a file name for a stored recording: its own if that is a run_<digits>_<digits>.csv no version uses, else one made from the time */
  function csvName(name, used) {
    const taken = new Set(S.ds.versions.map(v => v.named).filter(Boolean).concat(mine.map(r => r.csvName).filter(Boolean), used || []));
    if (/^run_\d+_\d+\.csv$/i.test(name || '') && !taken.has(name)) return name;
    const p = n => String(n).padStart(2, '0');
    for (let t = Date.now(); ; t += 1000) {
      const d = new Date(t), n = 'run_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.csv';
      if (!taken.has(n)) return n;
    }
  }
  /* the record that is stored: the typed texts, and the numbers the validator settled on */
  function makeRec(d, res, name, size, old) {
    const t = k => String(d[k] || '').replace(/\s+/g, ' ').trim(), id = old ? old.id : res.id;
    return {
      key: srcKey() + '|' + id, src: srcKey(), id: id, title: t('title'), result: d.result,
      lap: res.fill.lap, top: res.fill.top, slow: res.fill.slow, damage: res.fill.damage,
      what: t('what'), why: t('why'), prediction: t('prediction'), observed: t('observed'), decision: t('decision'), learned: t('learned'),
      csvName: name || null, csvSize: name ? size || 0 : 0, added: old ? old.added : Date.now(), changed: Date.now(),
    };
  }
  /* builds the data set again with the versions now kept here, and shows detail */
  async function refresh(detail) {
    const ds0 = S.ds;
    if (!ds0) return;
    const ds = await RV.data.openSource(ds0.src, { reuse: ds0 });
    if (S.ds !== ds0) return;
    const keep = S.sel.filter(id => ds.byId[id] && ds.byId[id].file);
    await RV.useDataset(ds, { run: keep[0], cmp: keep.slice(1).join(','), detail: detail && ds.byId[detail] ? detail : (ds.byId[S.detailId] ? S.detailId : null) });
    if (S.tab === 'ps') RV.settings.render();
  }
  async function loadMine() { try { mine = await L.list(srcKey()); } catch (e) { mine = []; } picked = new Set(Array.from(picked).filter(k => mine.some(r => r.key === k))); }

  /* ---------- parts shared by the tabs ---------- */
  function resultPick(cur, cls) {
    return '<div class="respick ' + (cls || '') + '" role="radiogroup" aria-label="Result">' + V.RESULTS.map(r =>
      '<button type="button" role="radio" aria-checked="' + (r.id === cur) + '" class="resopt r-' + r.id + (r.id === cur ? ' on' : '') + '" data-v="' + r.id + '" title="' + esc(r.label + ': ' + r.hint) + '">' +
      '<i class="resic" aria-hidden="true">' + r.glyph + (r.enabling ? '<em>E</em>' : '') + '</i><span><b>' + r.label + '</b><small>' + r.hint + '</small></span></button>').join('') + '</div>';
  }
  /* what a check found, in words; confirmId: the id of the tick a warning needs */
  function checkHtml(res, confirmId, ticked) {
    let h = '<div class="chk ' + res.level + '"><b class="chklvl">' + LEVEL[res.level] + '</b>';
    if (res.level === 'valid') h += '<span> Nothing is missing.</span>';
    if (res.blocks.length) h += '<ul>' + res.blocks.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>';
    if (res.warns.length && res.level !== 'blocked') h += '<ul>' + res.warns.map(w => '<li><b>' + esc(w.what) + '.</b> ' + esc(w.affects) + '</li>').join('') + '</ul>';
    if (res.level === 'blocked') h += '<p class="note">It would not work on the site, so it is not entered. The rules are under <button type="button" class="link" data-format>Help, Data format</button>.</p>';
    if (res.level === 'warning') h += '<label class="check"><input type="checkbox" id="' + confirmId + '"' + (ticked ? ' checked' : '') + '> Enter it anyway, without what is missing</label>';
    return h + '</div>';
  }
  const fmtDate = ms => { const d = new Date(ms); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
  function readFiles(list) { return Promise.all(Array.from(list || []).map(f => f.text().then(t => ({ name: f.name, text: t }), () => ({ name: f.name, text: '' })))); }
  function pickFiles(multiple, then) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,text/csv'; inp.multiple = !!multiple;
    inp.onchange = async () => { const fs = await readFiles(inp.files); if (fs.length && dlg) then(fs); };
    inp.click();
  }

  /* ---------- tab 1: one version ---------- */
  function checkForm() { return V.version(Object.assign({}, F, { rec: file ? file.check : null }), Object.assign(context(), { editing: !!edit })); }
  function formHtml() {
    const c = context(), fld = (id, label, val, ph, cls, extra) => '<label class="fld ' + (cls || '') + '"><span>' + label + '</span><input type="text" id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '" spellcheck="false" autocomplete="off"' + (extra || '') + '></label>';
    return (edit ? '<p class="note">Changing <b>' + esc(edit.id) + '</b>, a version kept in this browser. Its name stays.</p>'
      : '<p class="note">The version is checked against the <button type="button" class="link" data-format>data format rules</button> before it is added. It is kept <b>in this browser only</b> until you export it.</p>') +
      '<div class="addgrid">' + fld('aId', 'Version', edit ? edit.id : F.id, c.latest ? V.nextId(c.latest) : 'v0.1', '', edit ? ' disabled' : '') + fld('aTitle', 'Title', F.title, 'A few words on what it changed', 'wide') + '</div>' +
      (edit ? '' : '<p class="fldhint">' + (c.latest ? 'Newer than ' + esc(c.latest) + ', the latest: ' + esc(V.nextId(c.latest)) + ', ' + esc(c.latest) + '.1 or anything higher.' : 'For example v0.1.') + '</p>') +
      '<div class="fldcap">Result</div>' + resultPick(F.result) +
      '<div class="fldcap">Recording <span class="note">the run CSV of its lap; optional</span></div>' +
      '<div class="filepick" id="aDrop"><button type="button" class="btn pill" id="aFile">' + (file ? 'Choose another file …' : 'Choose the run CSV …') + '</button><span id="aFileName" class="note"></span></div>' +
      '<div class="addgrid four">' + fld('aLap', 'Lap time', F.lap, '1:13.14') + fld('aTop', 'Top speed, km/h', F.top, '286') + fld('aSlow', 'Slowest corner, km/h', F.slow, '58') + fld('aDamage', 'Damage', F.damage, '0') + '</div>' +
      '<label class="fld"><span>What changed</span><textarea id="aWhat" rows="2" placeholder="What this version does differently">' + esc(F.what) + '</textarea></label>' +
      '<details class="more"' + (TEXTS.slice(1).some(t => F[t[0]]) ? ' open' : '') + '><summary>More fields: why, prediction, observed, decision, learned</summary>' +
      TEXTS.slice(1).map(t => '<label class="fld"><span>' + t[1] + '</span><textarea id="a_' + t[0] + '" rows="2">' + esc(F[t[0]]) + '</textarea></label>').join('') + '</details>' +
      '<div id="aCheck"></div>' +
      '<div class="tour-acts"><button type="button" class="btn prim" id="aSave">' + (edit ? 'Save the changes' : 'Add the version') + '</button>' + (edit ? '<button type="button" class="btn" id="aNew">Enter a new one instead</button>' : '') +
      '<button type="button" class="btn ghost" id="aCancel">Close</button></div>';
  }
  function paintForm() {
    const res = checkForm(), box = $('aCheck');
    if (!box) return;
    const fn = $('aFileName');
    fn.innerHTML = file ? '<b>' + esc(file.name) + '</b>' + (file.check.sum && file.check.sum.lap != null ? ' · lap ' + RV.fmtLap(file.check.sum.lap) : '') +
      (file.check.level === 'blocked' ? ' · <span class="slower">cannot be used</span>' : '') + ' <button type="button" class="link" id="aFileX">Remove</button>' : 'None chosen. A file can also be dropped here.';
    if ($('aFileX')) $('aFileX').onclick = () => { file = null; touched = true; sure = false; paintForm(); };
    /* what the recording will fill in shows as the placeholder */
    const sum = file && file.check.sum;
    $('aLap').placeholder = sum && sum.lap != null ? V.lapText(sum.lap) + ' (from the recording)' : '1:13.14';
    $('aTop').placeholder = sum ? Math.trunc(sum.top) + ' (from the recording)' : '286';
    $('aSlow').placeholder = sum && sum.slow ? Math.round(sum.slow) + ' (from the recording)' : '58';
    $('aDamage').placeholder = sum ? sum.damage + ' (from the recording)' : '0';
    box.innerHTML = touched ? checkHtml(res, 'aSure', sure) : '<div class="chk idle">Fill in the version, a title and the result. A recording and the other fields are optional.</div>';
    if ($('aSure')) $('aSure').onchange = e => { sure = e.target.checked; paintForm(); };
    box.querySelectorAll('[data-format]').forEach(b => { b.onclick = toFormat; });
    $('aSave').disabled = working || !touched || res.level === 'blocked' || (res.level === 'warning' && !sure);
  }
  function setRecording(name, text) {
    file = { name: name, text: text, check: V.recording(text, S.ds.trk) };
    touched = true; sure = false;
    if (dlg && tab === 'one') { $('aFile').textContent = 'Choose another file …'; paintForm(); }
  }
  function wireForm() {
    const bind = (id, k) => { const el = $(id); if (el) el.oninput = () => { F[k] = el.value; touched = true; sure = false; paintForm(); }; };
    bind('aId', 'id'); bind('aTitle', 'title'); bind('aLap', 'lap'); bind('aTop', 'top'); bind('aSlow', 'slow'); bind('aDamage', 'damage'); bind('aWhat', 'what');
    TEXTS.slice(1).forEach(t => bind('a_' + t[0], t[0]));
    dlg.querySelectorAll('.respick .resopt').forEach(b => {
      b.onclick = () => {
        F.result = b.dataset.v; touched = true; sure = false;
        dlg.querySelectorAll('.respick .resopt').forEach(q => { const on = q === b; q.classList.toggle('on', on); q.setAttribute('aria-checked', on); });
        paintForm();
      };
    });
    $('aFile').onclick = () => pickFiles(false, fs => setRecording(fs[0].name, fs[0].text));
    $('aCancel').onclick = close;
    if ($('aNew')) $('aNew').onclick = () => { edit = null; F = blank(); file = null; touched = false; sure = false; render(); };
    $('aSave').onclick = saveForm;
    paintForm();
  }
  async function saveForm() {
    const res = checkForm();
    if (working || res.level === 'blocked' || (res.level === 'warning' && !sure)) return;
    working = true; paintForm();
    try {
      /* the stored recording stays unless another file was chosen or it was removed */
      const sameFile = edit && file && file.stored, name = file ? (sameFile ? edit.csvName : csvName(file.name)) : null;
      const rec = makeRec(F, res, name, file ? file.text.length : 0, edit);
      await L.put(rec, file ? (sameFile ? undefined : file.text) : null);
      const was = !!edit;
      F = blank(); file = null; edit = null; touched = false; sure = false; working = false;
      close();
      await refresh(rec.id);
      RV.toast(rec.id + (was ? ' was changed.' : ' was added. It is kept in this browser only: publish or export it to put it into the repository.'));
    } catch (e) { working = false; const x = RV.explain(e); RV.toast(x.msg + (x.hint ? ' ' + x.hint : ''), 'err'); if (dlg) paintForm(); }
  }

  /* ---------- tab 2: import files ---------- */
  /* Takes the chosen files: a table of versions makes one row per version (a recording it names is taken from the
     same choice of files), every other CSV is a recording and makes a row of its own unless a table row names it. */
  function addImport(files) {
    const tables = files.filter(f => V.isTable(f.text)), recs = files.filter(f => !V.isTable(f.text)), used = new Set();
    for (const t of tables) {
      const res = V.table(t.text);
      if (res.level === 'blocked') { tableNotes.push({ name: t.name, msg: res.blocks.join(' ') }); continue; }
      for (const d of res.rows) {
        const f = d.file ? recs.find(x => x.name.toLowerCase() === d.file.toLowerCase()) : null;
        if (f) used.add(f);
        rows.push({ d: Object.assign(blank(), d), from: t.name, file: f ? { name: f.name, text: f.text, check: V.recording(f.text, S.ds.trk) } : null, wanted: f ? '' : d.file, ok: false });
      }
    }
    /* a recording chosen later for a row that named it */
    for (const f of recs) {
      if (used.has(f)) continue;
      const row = rows.find(r => !r.file && r.wanted && r.wanted.toLowerCase() === f.name.toLowerCase());
      const mk = { name: f.name, text: f.text, check: V.recording(f.text, S.ds.trk) };
      if (row) { row.file = mk; row.wanted = ''; }
      else rows.push({ d: blank(), from: '', file: mk, wanted: '', ok: false });
    }
    /* rows without a name get the next free ones */
    const seen = context(rows.map(r => V.normId(r.d.id)).filter(Boolean));
    let next = seen.latest;
    for (const r of rows) if (!r.d.id.trim()) { next = next ? V.nextId(next) : 'v0.1'; r.d.id = next; }
    if (dlg && tab === 'import') render();
  }
  /* each row on its own, against the versions that exist and the rows above it that will go in */
  function checkRows() {
    const before = [];
    for (const r of rows) {
      r.res = V.version(Object.assign({}, r.d, { rec: r.file ? r.file.check : null }), context(before));
      if (r.res.level !== 'blocked') before.push(r.res.id);
      if (r.res.level !== 'warning') r.ok = false;
    }
  }
  const going = () => rows.filter(r => r.res.level === 'valid' || (r.res.level === 'warning' && r.ok));
  function importHtml() {
    let h = '<p class="note">Choose several files in one go. A <b>run CSV</b> becomes a version with that recording. A <b>table</b> (a CSV with one row per version; <button type="button" class="link" id="iTemplate">download a template</button>) fills in the names, titles, results and texts; a recording it names is taken from the files chosen with it. Every version is checked on its own against the <button type="button" class="link" data-format>data format rules</button>.</p>' +
      '<div class="filepick" id="iDrop"><button type="button" class="btn pill prim" id="iFiles">Choose CSV files …</button><span class="note">or drop them here</span>' + (rows.length ? '<button type="button" class="link" id="iClear">Clear the list</button>' : '') + '</div>';
    h += tableNotes.map(n => '<div class="chk blocked"><b class="chklvl">Table not read</b> <b>' + esc(n.name) + '</b>: ' + esc(n.msg) + '</div>').join('');
    if (!rows.length) return h + '<div class="tour-acts"><button type="button" class="btn ghost" id="aCancel">Close</button></div>';
    h += '<div id="iSum" class="imsum"></div><div id="iRows">' + rows.map((r, k) =>
      '<div class="imrow" data-k="' + k + '"><div class="imhead"><i class="lvdot"></i><input type="text" class="imid" value="' + esc(r.d.id) + '" aria-label="Version" spellcheck="false" autocomplete="off">' +
      '<input type="text" class="imtitle" value="' + esc(r.d.title) + '" placeholder="Title: a few words on what it changed" aria-label="Title" spellcheck="false" autocomplete="off">' +
      resultPick(r.d.result, 'mini') + '<button type="button" class="link imx" title="Take this one off the list">Remove</button></div>' +
      '<div class="note immeta">' + (r.file ? 'Recording <b>' + esc(r.file.name) + '</b>' + (r.file.check.sum && r.file.check.sum.lap != null ? ', lap ' + RV.fmtLap(r.file.check.sum.lap) : '')
        : r.wanted ? 'Names the recording <b>' + esc(r.wanted) + '</b>, which was not among the chosen files' : 'No recording') + (r.from ? ' · from ' + esc(r.from) : '') + '</div><div class="immsg"></div></div>').join('') + '</div>' +
      '<div class="tour-acts"><button type="button" class="btn prim" id="iGo"></button><button type="button" class="btn" id="iAll">Tick every incomplete one</button><button type="button" class="btn ghost" id="aCancel">Close</button></div>';
    return h;
  }
  function paintImport() {
    if (!$('iRows')) return;
    checkRows();
    const n = { valid: 0, warning: 0, blocked: 0 };
    rows.forEach((r, k) => {
      n[r.res.level]++;
      const el = $('iRows').children[k], res = r.res;
      el.className = 'imrow lv-' + res.level;
      let h = '';
      if (res.level === 'blocked') h = '<ul class="slower">' + res.blocks.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>';
      else if (res.level === 'warning') h = '<ul>' + res.warns.map(w => '<li><b>' + esc(w.what) + '.</b> ' + esc(w.affects) + '</li>').join('') + '</ul>' +
        '<label class="check"><input type="checkbox" class="imok"' + (r.ok ? ' checked' : '') + '> Enter it anyway</label>';
      el.querySelector('.immsg').innerHTML = h;
      const ok = el.querySelector('.imok');
      if (ok) ok.onchange = () => { r.ok = ok.checked; paintImport(); };
    });
    const go = going().length, skipped = rows.length - go;
    $('iSum').innerHTML = '<span class="lvchip valid"><b>' + n.valid + '</b> ready</span><span class="lvchip warning"><b>' + n.warning + '</b> incomplete: each needs your tick</span><span class="lvchip blocked"><b>' + n.blocked + '</b> cannot be entered: skipped</span>';
    $('iGo').textContent = go ? 'Import ' + go + ' version' + (go === 1 ? '' : 's') + (skipped ? ', skip ' + skipped : '') : 'Nothing to import yet';
    $('iGo').disabled = working || !go;
    $('iAll').hidden = !rows.some(r => r.res.level === 'warning' && !r.ok);
  }
  function wireImport() {
    $('aCancel').onclick = close;
    $('iFiles').onclick = () => pickFiles(true, addImport);
    $('iTemplate').onclick = () => L.download(new Blob([V.template()], { type: 'text/csv' }), 'versions-template.csv');
    if ($('iClear')) $('iClear').onclick = () => { rows = []; tableNotes = []; render(); };
    if (!$('iRows')) return;
    Array.from($('iRows').children).forEach((el, k) => {
      const r = rows[k];
      el.querySelector('.imid').oninput = e => { r.d.id = e.target.value; paintImport(); };
      el.querySelector('.imtitle').oninput = e => { r.d.title = e.target.value; paintImport(); };
      el.querySelectorAll('.resopt').forEach(b => { b.onclick = () => { r.d.result = b.dataset.v; el.querySelectorAll('.resopt').forEach(q => { q.classList.toggle('on', q === b); q.setAttribute('aria-checked', q === b); }); paintImport(); }; });
      el.querySelector('.imx').onclick = () => { rows.splice(k, 1); render(); };
    });
    $('iAll').onclick = () => { rows.forEach(r => { if (r.res.level === 'warning') r.ok = true; }); paintImport(); };
    $('iGo').onclick = runImport;
    paintImport();
  }
  async function runImport() {
    checkRows();
    const take = going();
    if (working || !take.length) return;
    working = true; paintImport();
    const used = [], done = [], failed = [];
    for (const r of take) {
      try {
        const name = r.file ? csvName(r.file.name, used) : null;
        if (name) used.push(name);
        const rec = makeRec(r.d, r.res, name, r.file ? r.file.text.length : 0, null);
        await L.put(rec, r.file ? r.file.text : null);
        done.push(rec.id); mine.push(rec);
      } catch (e) { failed.push(r.res.id); }
    }
    const skipped = rows.length - take.length;
    rows = rows.filter(r => take.indexOf(r) < 0); tableNotes = [];
    working = false;
    if (!rows.length) close(); else render();
    try { await refresh(done[done.length - 1]); } catch (e) { /* the entries are stored; the list shows them when the page is opened again */ }
    RV.toast(done.length + ' version' + (done.length === 1 ? '' : 's') + ' imported' + (skipped ? ', ' + skipped + ' left on the list' : '') + (failed.length ? '; ' + failed.join(', ') + ' could not be stored' : '') +
      '. They are kept in this browser only.', failed.length ? 'err' : '');
  }

  /* ---------- tab 3: the versions kept in this browser ---------- */
  function listHtml() {
    const stale = new Set(S.ds.localStale || []);
    let h = '<p class="note">Versions entered here are kept in <b>this browser on this device</b> (its own database for this site). Nothing is uploaded: another device, another browser or another visitor does not see them, and clearing the site data of the browser deletes them. ' +
      'An <b>export</b> is a zip with their changelog entries, their recordings and a table; its README says how to put them into the repository, where they are permanent and visible to everyone.</p>' +
      (L.lasting() ? '' : '<p class="warn">This browser gave the page no database (a private window can do that), so entries last only until the page is closed. Export them before you leave.</p>');
    if (!mine.length) return h + '<div class="chk idle">No version is kept in this browser for ' + esc(S.ds.src.where()) + '.</div><div class="tour-acts"><button type="button" class="btn prim" id="lAdd">Add a version</button><button type="button" class="btn ghost" id="aCancel">Close</button></div>';
    h += '<div class="tablewrap"><table class="loctab"><thead><tr><th class="l"><input type="checkbox" id="lAll" aria-label="Tick every version"' + (picked.size === mine.length ? ' checked' : '') + '></th><th class="l">Version</th><th class="l">Title</th><th>Lap time</th><th class="l">Recording</th><th class="l">Added</th><th></th></tr></thead><tbody>' +
      mine.map(r => '<tr><td class="l"><input type="checkbox" class="lpick" data-k="' + esc(r.key) + '"' + (picked.has(r.key) ? ' checked' : '') + ' aria-label="Tick ' + esc(r.id) + '"></td><td class="l num"><b>' + esc(r.id) + '</b></td>' +
        '<td class="l w">' + esc(r.title) + (stale.has(r.id) ? '<br><span class="warn">The repository has a ' + esc(r.id) + ' now; this copy is not shown. Delete it.</span>' : '') + '</td>' +
        '<td class="num">' + (r.lap != null ? RV.fmtLap(r.lap) : 'none') + '</td><td class="l note">' + (r.csvName ? esc(r.csvName) + ', ' + RV.fmtInt(r.csvSize / 1000) + ' kB' : 'none') + '</td><td class="l note">' + fmtDate(r.added) + '</td>' +
        '<td><button type="button" class="link ledit" data-k="' + esc(r.key) + '">Change</button></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="tour-acts"><button type="button" class="btn prim" id="lExpSel"' + (picked.size ? '' : ' disabled') + '>Export the ' + picked.size + ' ticked</button><button type="button" class="btn" id="lExpAll">Export all ' + mine.length + '</button>' +
      '<button type="button" class="btn" id="lPub"' + (picked.size ? '' : ' disabled') + ' title="Puts them into the repository on GitHub, where every device and every visitor sees them. You review the files and commit on the Repository page.">Publish the ' + picked.size + ' ticked to GitHub</button>' +
      '<button type="button" class="btn" id="lDel"' + (picked.size ? '' : ' disabled') + '>' + (askDelete ? 'Really delete ' + picked.size + '? Click again' : 'Delete the ticked') + '</button><button type="button" class="btn ghost" id="aCancel">Close</button></div>';
    return h;
  }
  async function exportRecs(recs) {
    if (!recs.length) return null;
    const blob = L.zip(await L.exportFiles(recs));
    L.download(blob, 'run-viewer-versions-' + recs.length + '.zip');
    RV.toast(recs.length + ' version' + (recs.length === 1 ? '' : 's') + ' exported. The README in the zip says where the files go.');
    return blob;
  }
  function wireList() {
    $('aCancel').onclick = close;
    if ($('lAdd')) $('lAdd').onclick = () => { tab = 'one'; render(); };
    if (!$('lAll')) return;
    $('lAll').onchange = e => { picked = new Set(e.target.checked ? mine.map(r => r.key) : []); askDelete = false; render(); };
    dlg.querySelectorAll('.lpick').forEach(b => { b.onchange = () => { if (b.checked) picked.add(b.dataset.k); else picked.delete(b.dataset.k); askDelete = false; render(); }; });
    dlg.querySelectorAll('.ledit').forEach(b => { b.onclick = () => startEdit(mine.find(r => r.key === b.dataset.k)); });
    $('lExpSel').onclick = () => exportRecs(mine.filter(r => picked.has(r.key)));
    $('lExpAll').onclick = () => exportRecs(mine);
    /* versions the repository already has are not published again */
    $('lPub').onclick = () => { const stale = new Set(S.ds.localStale || []), recs = mine.filter(r => picked.has(r.key) && !stale.has(r.id)); close(); if (recs.length) RV.repo.publish(recs); else RV.toast('The repository has those versions already.'); };
    $('lDel').onclick = async () => {
      if (!askDelete) { askDelete = true; render(); return; }
      const keys = Array.from(picked), n = keys.length;
      askDelete = false;
      try { await L.remove(keys); } catch (e) { RV.toast('The browser could not delete them.', 'err'); return; }
      picked = new Set(); await loadMine(); if (dlg) render();
      try { await refresh(); } catch (e) { /* shown when the page is opened again */ }
      RV.toast(n + ' version' + (n === 1 ? '' : 's') + ' deleted from this browser.');
    };
  }
  async function startEdit(rec) {
    if (!rec) return;
    edit = rec; touched = true; sure = false;
    F = blank();
    for (const k in F) F[k] = rec[k] == null ? '' : String(rec[k]);
    F.lap = rec.lap != null ? V.lapText(rec.lap) : '';
    file = null;
    if (rec.csvName) { let text = null; try { text = await L.csv(rec.key); } catch (e) { /* treated as gone */ } if (text != null) { file = { name: rec.csvName, text: text, check: V.recording(text, S.ds.trk), stored: true }; } }
    tab = 'one';
    if (dlg) render();
  }

  /* ---------- the window ---------- */
  function toFormat() { close(); RV.help.open('format'); }
  function close() { if (!dlg) return; dlg.remove(); dlg = null; removeEventListener('keydown', onKey, true); if (last && last.focus && document.contains(last)) last.focus(); }
  function onKey(e) {
    if (!dlg) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    e.stopPropagation();                                           /* the replay keys stay quiet while the window is open */
  }
  function render() {
    if (!dlg) return;
    const card = dlg.firstChild, keep = card.scrollTop;
    const tabs = [['one', edit ? 'Change ' + edit.id : 'One version'], ['import', 'Import files' + (rows.length ? ' (' + rows.length + ')' : '')], ['mine', 'In this browser (' + mine.length + ')']];
    card.innerHTML = '<h2 id="addTitle">Add versions</h2><div class="seg wrap subtabs" role="tablist" id="addTabs">' + tabs.map(t => '<button type="button" role="tab" data-v="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '" aria-selected="' + (t[0] === tab) + '">' + esc(t[1]) + '</button>').join('') + '</div>' +
      (tab === 'one' ? formHtml() : tab === 'import' ? importHtml() : listHtml());
    card.scrollTop = keep;
    card.querySelectorAll('#addTabs button').forEach(b => { b.onclick = () => { tab = b.dataset.v; askDelete = false; render(); card.scrollTop = 0; }; });
    card.querySelectorAll('[data-format]').forEach(b => { b.onclick = toFormat; });
    if (tab === 'one') wireForm(); else if (tab === 'import') wireImport(); else wireList();
  }
  /* Opens the window. which: 'one' (the form), 'import' or 'mine' (the versions kept in this browser). */
  async function open(which) {
    if (!S.ds) { RV.toast('No data is loaded yet.'); return; }
    close();
    last = document.activeElement;
    tab = which || 'one'; askDelete = false; working = false;
    await loadMine();
    dlg = RV.el('div', 'keydlg', '<div class="keycard addcard" role="dialog" aria-modal="true" aria-labelledby="addTitle"></div>');
    document.body.appendChild(dlg);
    addEventListener('keydown', onKey, true);
    /* files dropped on the window: the form takes the first as its recording, the import takes them all */
    dlg.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    dlg.addEventListener('drop', async e => {
      e.preventDefault(); e.stopPropagation();
      const fs = await readFiles(e.dataTransfer ? e.dataTransfer.files : []);
      if (!fs.length || !dlg) return;
      if (tab === 'one') setRecording(fs[0].name, fs[0].text); else { tab = 'import'; addImport(fs); render(); }
    });
    render();
    const first = dlg.querySelector(tab === 'one' && !edit ? '#aId' : 'button');
    if (first) first.focus();
  }

  RV.entry = {
    open: open, close: close, isOpen: () => !!dlg,
    /* what a file chooser or a drop does, callable without one */
    setRecording: setRecording, addImport: addImport, exportRecs: exportRecs,
    mine: () => mine.slice(),
  };
})();
