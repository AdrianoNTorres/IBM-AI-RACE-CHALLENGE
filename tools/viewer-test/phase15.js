// Phase 15: versions entered by hand and imported. Drives the real window; the files a chooser would give are
// passed through RV.entry.setRecording / RV.entry.addImport. Leaves the browser's database empty again.
const fs = require('fs');
const { open } = require('./h.js');
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); };
const WIPE = "(async () => { for (const r of await RV.local.list(RV.local.keyOf(RV.S.ds.src))) await RV.local.remove([r.key]); })()";
const type = (id, v) => `(() => { const e = document.getElementById('${id}'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input')); })()`;
const click = sel => `document.querySelector(${JSON.stringify(sel)}).click()`;
const chk = "document.getElementById('aCheck').innerText";
(async () => {
  const root = __dirname + '/../../';
  const csv = fs.readFileSync(root + 'runs/run_20261004_113412.csv', 'utf8');          // v1.28's lap
  const csv2 = fs.readFileSync(root + 'runs/run_20261003_220700.csv', 'utf8');         // v1.27's lap
  let p = await open('', { view: 'detailed' });
  await p.until('RV.S.ds && RV.S.R');
  await p.ev(WIPE);
  const V = e => p.ev(e);

  // ---- the validator on its own ----
  ok('names: v1.06.1 and v1.07 are newer than v1.06; v1.06 and v1.6 are not', await V("(() => { const c = RV.validate.cmpId; return c('v1.06.1','v1.06') > 0 && c('v1.07','v1.06.1') > 0 && c('v1.06','v1.06') === 0 && c('v1.6','v1.06') === 0 && c('v1.00','v0.99') > 0 && RV.validate.nextId('v1.06') === 'v1.07' && RV.validate.nextId('v1.06.1') === 'v1.06.2'; })()"));
  ok('lap times: 1:13.14, 1:13:14 and 73.14 are the same; rubbish is refused', await V("(() => { const f = RV.validate.parseLap; return f('1:13.14') === 73.14 && f('1:13:14') === 73.14 && f('73.14') === 73.14 && f('') === null && isNaN(f('fast')) && RV.validate.lapText(73.14) === '1:13.14' && RV.validate.lapText(59.996) === '1:00.00'; })()"));
  const bad = await V(`(() => { const R = RV.validate.recording, t = RV.S.ds.trk, out = {};
    out.empty = R('', t); out.junk = R('hello\\nworld', t); out.nocol = R('curLapTime,speedX\\n1,2\\n', t); out.binary = R('\\u0000\\u0001\\ufffd'.repeat(500), t);
    out.notstr = R(null, t); out.norows = R(${JSON.stringify(csv.split('\n')[0])} + '\\n', t);
    return Object.keys(out).map(k => [k, out[k].level, out[k].blocks[0]]); })()`);
  ok('a recording that is empty, junk, lacks columns or has no rows is blocked, with a reason, and nothing throws', bad.every(b => b[1] === 'blocked' && b[2]), bad.map(b => b[0] + ': ' + b[2]));
  await p.ev(`window.__csv = ${JSON.stringify(csv)}; window.__csv2 = ${JSON.stringify(csv2)}; 0`);
  ok('a good recording is valid and gives its lap', await V("(() => { const r = RV.validate.recording(__csv, RV.S.ds.trk); return r.level === 'valid' && Math.abs(r.sum.lap - 73.14) < 0.005; })()"), await V("RV.validate.recording(__csv, RV.S.ds.trk).sum.lap"));
  ok('a recording from another track is blocked', await V("(() => { const L = __csv.split('\\n'), h = L[0].split(','), k = h.indexOf('distFromStart'); const t = L.map((l, i) => { if (!i) return l; const c = l.split(','); if (c.length < h.length) return l; c[k] = String(+c[k] * 0.5); return c.join(','); }).join('\\n'); const r = RV.validate.recording(t, RV.S.ds.trk); return r.level === 'blocked' && /does not fit the track/.test(r.blocks[0]); })()"));
  ok('half a lap and a recording without beams are warnings', await V("(() => { const L = __csv.split('\\n'); const half = RV.validate.recording(L.slice(0, 1500).join('\\n'), RV.S.ds.trk); const h = L[0].split(','), keep = h.map((c, i) => (/^track\\d+$/.test(c) ? -1 : i)).filter(i => i >= 0); const nb = RV.validate.recording(L.map(l => { const c = l.split(','); return keep.map(i => c[i]).join(','); }).join('\\n'), RV.S.ds.trk); return half.level === 'warning' && /not a complete lap/.test(half.warns[0].what) && nb.level === 'warning' && /sensor/.test(nb.warns[0].what); })()"));
  const vv = await V(`(() => { const ids = new Set(RV.S.ds.versions.map(v => v.id)), c = { ids: ids, latest: RV.validate.latestOf(ids) }, v = d => { const r = RV.validate.version(Object.assign({ title: 'T', result: 'kept', lap: '1:13.00', top: '280', slow: '60', what: 'w' }, d), c); return [r.level, (r.blocks[0] || (r.warns[0] || {}).what || '')]; };
    return { latest: c.latest, same: v({ id: 'v1.28' }), older: v({ id: 'v0.5' }), sub: v({ id: 'v1.90.1' }), next: v({ id: '1.91' }), junk: v({ id: 'new one' }), notitle: v({ id: 'v1.91', title: ' ' }), nores: v({ id: 'v1.91', result: '' }), badlap: v({ id: 'v1.91', lap: 'quick' }), nothing: RV.validate.version(null, null).level, weird: RV.validate.version({ id: {}, title: 5, rec: 7 }, 3).level }; })()`);
  ok('a version: the latest is v1.28; an existing or older name is blocked; v1.90.1 and 1.91 pass (warning: no recording)',
    vv.latest === 'v1.28' && vv.same[0] === 'blocked' && vv.older[0] === 'blocked' && vv.sub[0] === 'warning' && vv.next[0] === 'warning' && vv.junk[0] === 'blocked' && vv.notitle[0] === 'blocked' && vv.nores[0] === 'blocked' && vv.badlap[0] === 'blocked' && vv.nothing === 'blocked' && vv.weird === 'blocked', vv);

  // ---- the page as it opens: the button is there ----
  await p.ev("RV.showTab('pv')"); await p.sleep(200);
  ok('as the page opens: "Add versions" is on the Versions page and visible', await V("(() => { const b = document.getElementById('addVer'); const r = b && b.getBoundingClientRect(); return !!b && r.width > 0 && r.top > 0 && r.top < innerHeight; })()"));
  await p.shot('p15-0-versions');

  // ---- the form: a version without a recording ----
  await p.ev(click('#addVer')); await p.until("RV.entry.isOpen() && document.getElementById('aId')");
  await p.shot('p15-1-form-empty');
  ok('the empty form cannot be saved', await V("document.getElementById('aSave').disabled"));
  await p.ev(type('aId', 'v1.28')); await p.ev(type('aTitle', 'Entered by hand, no recording'));
  await p.ev(click('.respick .resopt[data-v="kept-enabling"]'));
  ok('an existing name is blocked in the form', /exists already/.test(await V(chk)) && await V("document.getElementById('aSave').disabled"), (await V(chk)).slice(0, 120));
  await p.shot('p15-2-form-blocked');
  await p.ev(type('aId', 'v1.90.1')); await p.ev(type('aLap', '1:13.50'));
  ok('v1.90.1 without a recording is a warning that needs a tick', /No recording/.test(await V(chk)) && await V("document.getElementById('aSave').disabled && !!document.getElementById('aSure')"), (await V(chk)).slice(0, 160));
  await p.shot('p15-3-form-warning');
  await p.ev(click('#aSure')); await p.sleep(100);
  ok('ticked: it can be saved', !(await V("document.getElementById('aSave').disabled")));
  await p.ev(click('#aSave'));
  await p.until("!RV.entry.isOpen() && RV.S.ds.byId['v1.90.1']");
  await p.sleep(400);
  const a = await V("(() => { const v = RV.S.ds.byId['v1.90.1']; return { local: v.local, lap: v.lap, kept: v.kept, en: v.enableChange, file: v.file, last: RV.S.ds.versions[RV.S.ds.versions.length - 1].id, detail: RV.S.detailId, sel: RV.S.sel[0], hasR: !!RV.S.R, row: (document.querySelector('#vt tbody tr[data-id=\"v1.90.1\"]') || {}).innerText }; })()");
  ok('it is the newest version, kept as an enabling change, with the Local badge; the run on screen stayed', a.local && a.lap === 73.5 && a.kept && a.en && a.file === null && a.last === 'v1.90.1' && a.detail === 'v1.90.1' && a.sel === 'v1.28' && a.hasR && /LOCAL/i.test(a.row || ''), a);
  await p.shot('p15-4-added');

  // ---- the form: a version with a recording ----
  await p.ev("RV.entry.open('one')"); await p.until("document.getElementById('aId')");
  await p.ev(type('aId', 'v1.91')); await p.ev(type('aTitle', 'Entered by hand, with a recording')); await p.ev(type('aWhat', 'Nothing: it is the lap of v1.28 again.'));
  await p.ev(click('.respick .resopt[data-v="rejected"]'));
  await p.ev("RV.entry.setRecording('my lap.csv', __csv)"); await p.sleep(200);
  ok('with a recording and its fields filled, the version is ready', /Ready/i.test(await V(chk)) && !(await V("document.getElementById('aSave').disabled")), (await V(chk)).slice(0, 100));
  await p.shot('p15-5-form-ready');
  await p.ev("RV.entry.setRecording('broken.csv', 'curLapTime,speedX\\n1,2\\n')"); await p.sleep(150);
  ok('a broken recording blocks the form', /lacks the column/.test(await V(chk)) && await V("document.getElementById('aSave').disabled"), (await V(chk)).slice(0, 140));
  await p.ev("RV.entry.setRecording('my lap.csv', __csv)"); await p.sleep(150);
  await p.ev(click('#aSave'));
  await p.until("!RV.entry.isOpen() && RV.S.ds.byId['v1.91']"); await p.sleep(300);
  const b = await V("(() => { const v = RV.S.ds.byId['v1.91']; return { lap: v.lap, top: v.top, slow: v.slow, kept: v.kept, file: v.file, fast: RV.S.ds.fastId }; })()");
  ok('lap, top speed and slowest corner came from the recording; the file got a run_ name', b.lap === 73.14 && b.top === 286 && b.slow === 58 && b.kept === false && /^run_\d+_\d+\.csv$/.test(b.file), b);
  await p.ev("new Promise(r => RV.sel.only('v1.91', r))"); await p.ev("RV.showTab('pm')"); await p.sleep(600);
  ok('the entered version replays on the track, with sectors', await V("RV.S.sel[0] === 'v1.91' && RV.S.R.n > 3000 && RV.S.R.fits && RV.S.ds.byId['v1.91'].sec.every(x => x > 0)"));
  await p.shot('p15-6-replay');
  await p.ev("new Promise(r => { RV.sel.set(['v1.91', 'v1.27']); RV.sel.apply(r); })"); await p.ev("RV.showTab('pt')"); await p.sleep(500);
  ok('it compares with a repository version, without a script error', await V("RV.S.CM.length === 1") && p.errors.length === 0, p.errors.slice(0, 2));

  // ---- still there after a reload ----
  await p.close();
  p = await open('tab=pv', null, { keep: true });
  await p.until('RV.S.ds && RV.S.R'); await p.sleep(300);
  await p.ev(`window.__csv = ${JSON.stringify(csv)}; window.__csv2 = ${JSON.stringify(csv2)}; 0`);
  const c = await p.ev("({ n: RV.S.ds.local.size, sel: RV.S.sel[0], total: RV.S.ds.versions.length, mineBtn: (document.getElementById('addMine') || {}).innerText })");
  ok('after a reload both are still there, and the page opens on the newest recording (the entered v1.91)', c.n === 2 && c.sel === 'v1.91' && /2 kept/.test(c.mineBtn || ''), c);
  await p.shot('p15-7-reload');

  // ---- import: a table and recordings in one go ----
  const table = ['version,title,result,lap time,what changed,recording',
    'v1.92,"From the table, with a recording",kept,,"Has a comma, and a ""quote""",run_20261003_220700.csv',
    'v1.93,From the table without a recording,rejected,1:14.00,,',
    'v1.01,An old name,kept,1:13.00,x,',
    'v1.94,,kept,1:13.00,x,',
    'v1.95,Names a file that was not chosen,rej-enabling,1:13.20,x,missing.csv'].join('\n');
  await p.ev("RV.entry.open('import')"); await p.until("document.getElementById('iFiles')");
  await p.shot('p15-8-import-empty');
  await p.ev(`RV.entry.addImport([{ name: 'versions.csv', text: ${JSON.stringify(table)} }, { name: 'run_20261003_220700.csv', text: __csv2 }, { name: 'loose lap.csv', text: __csv }, { name: 'broken.csv', text: 'a,b\\n1,2\\n' }])`);
  await p.until("document.getElementById('iRows')"); await p.sleep(200);
  const rows = await p.ev("Array.from(document.getElementById('iRows').children).map(e => [e.querySelector('.imid').value, e.className.replace('imrow lv-', ''), e.querySelector('.immsg').innerText.slice(0, 70)])");
  const lv = Object.fromEntries(rows.map(r => [r[0], r[1]]));
  ok('seven rows, each judged on its own', rows.length === 7 && lv['v1.92'] === 'valid' && lv['v1.93'] === 'warning' && lv['v1.01'] === 'blocked' && lv['v1.94'] === 'blocked' && lv['v1.95'] === 'warning', rows);
  ok('the summary counts them and nothing incomplete goes in without a tick', /1 ready/.test(await p.ev("document.getElementById('iSum').innerText")) && /Import 1 version, skip 6/.test(await p.ev("document.getElementById('iGo').innerText")), [await p.ev("document.getElementById('iSum').innerText"), await p.ev("document.getElementById('iGo').innerText")]);
  await p.shot('p15-9-import-rows');
  await p.ev(click('#iAll')); await p.sleep(150);
  ok('"tick every incomplete one": three go in, the four blocked are skipped', /Import 3 versions, skip 4/.test(await p.ev("document.getElementById('iGo').innerText")), await p.ev("document.getElementById('iGo').innerText"));
  await p.ev(click('#iGo'));
  await p.until("RV.S.ds.byId['v1.95']"); await p.sleep(400);
  const d = await p.ev("({ n: RV.S.ds.local.size, v8: [RV.S.ds.byId['v1.92'].lap, RV.S.ds.byId['v1.92'].file, RV.S.ds.byId['v1.92'].tech.what], v9: [RV.S.ds.byId['v1.93'].lap, RV.S.ds.byId['v1.93'].file, RV.S.ds.byId['v1.93'].kept], v11: [RV.S.ds.byId['v1.95'].enableChange, RV.S.ds.byId['v1.95'].kept], no: [!!RV.S.ds.byId['v1.94'], RV.S.ds.byId['v1.01'].local], left: RV.entry.isOpen() ? document.getElementById('iRows').children.length : -1 })");
  ok('imported: v1.92 with its recording (under a new name: v1.27 uses that one) and lap, v1.93 and v1.95 without; the blocked ones were not stored and stay on the list',
    d.n === 5 && Math.abs(d.v8[0] - 73.56) < 0.006 && /^run_\d+_\d+\.csv$/.test(d.v8[1]) && d.v8[1] !== 'run_20261003_220700.csv' && d.v8[2] === 'Has a comma, and a "quote"' && d.v9[0] === 74 && d.v9[1] === null && d.v9[2] === false && d.v11[0] === true && d.v11[1] === false && !d.no[0] && !d.no[1] && d.left === 4, d);
  await p.shot('p15-10-import-left');

  // ---- the versions kept in this browser: export some, export all, change, delete ----
  await p.ev("RV.entry.open('mine')"); await p.until("document.querySelector('.loctab')");
  ok('the list shows the five', await p.ev("document.querySelectorAll('.loctab tbody tr').length === 5 && document.getElementById('lExpSel').disabled"));
  await p.ev("(() => { const b = Array.from(document.querySelectorAll('.lpick')); b[1].click(); })()"); await p.sleep(100);
  await p.ev("(() => { const b = Array.from(document.querySelectorAll('.lpick')); b[2].click(); })()"); await p.sleep(100);
  await p.shot('p15-11-mine');
  const z = async expr => Buffer.from(await p.ev(`(async () => { const b = await RV.entry.exportRecs(${expr}); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); })()`), 'base64');
  fs.writeFileSync(__dirname + '/p15-some.zip', await z("RV.entry.mine().filter(r => r.id === 'v1.91' || r.id === 'v1.92')"));
  fs.writeFileSync(__dirname + '/p15-all.zip', await z('RV.entry.mine()'));
  ok('the ticked export button names two', /Export the 2 ticked/.test(await p.ev("document.getElementById('lExpSel').innerText")));
  // change one
  await p.ev("Array.from(document.querySelectorAll('.ledit'))[0].click()"); await p.until("document.getElementById('aTitle') && document.getElementById('aId').disabled");
  await p.ev(type('aTitle', 'Entered by hand, title changed')); await p.ev(click('#aSure')); await p.ev(click('#aSave'));
  await p.until("!RV.entry.isOpen() && RV.S.ds.byId['v1.90.1'].title === 'Entered by hand, title changed'");
  ok('a kept version can be changed; its name stays', await p.ev("RV.S.ds.local.size === 5 && RV.S.ds.byId['v1.90.1'].lap === 73.5"));
  // settings and help draw with local versions
  await p.ev("RV.S.setTab = 'data'; RV.showTab('ps')"); await p.sleep(200); await p.shot('p15-12-settings');
  ok('Settings, Data counts them', /5 kept in this browser/.test(await p.ev("document.getElementById('ps').innerText")));
  await p.ev("RV.S.guideTab = 'local'; RV.help.open('format')"); await p.sleep(200); await p.shot('p15-13-help');
  ok('Help, Data format has the tab "Entered by hand"', /Entered by hand/.test(await p.ev("document.getElementById('sGuide').innerText")) && /Cannot be entered/.test(await p.ev("document.querySelector('.guidebody').innerText")));
  // delete all: two clicks
  await p.ev("RV.showTab('pv'); RV.entry.open('mine')"); await p.until("document.getElementById('lAll')");
  await p.ev(click('#lAll')); await p.sleep(100); await p.ev(click('#lDel')); await p.sleep(100);
  ok('deleting asks again first', /Really delete 5/.test(await p.ev("document.getElementById('lDel').innerText")) && await p.ev('RV.S.ds.local.size === 5'));
  await p.ev(click('#lDel'));
  await p.until('RV.S.ds.local.size === 0'); await p.sleep(400);
  const e = await p.ev("({ n: RV.S.ds.versions.length, last: RV.S.ds.versions[RV.S.ds.versions.length - 1].id, sel: RV.S.sel[0], stored: 0 })");
  e.stored = await p.ev("RV.local.list(RV.local.keyOf(RV.S.ds.src)).then(l => l.length)");
  ok('deleted: the list ends at v1.28 again, a run is still on screen, the database is empty', e.last === 'v1.28' && e.stored === 0 && !!e.sel, e);
  // dark theme, narrow window
  await p.close();
  p = await open('tab=pv', { view: 'basic', theme: 'dark' }, { w: 430, h: 820 });
  await p.until('RV.S.ds && RV.S.R');
  await p.ev("RV.entry.open('one')"); await p.until("document.getElementById('aId')");
  await p.ev(type('aId', 'v0.1')); await p.sleep(100);
  await p.shot('p15-14-dark-narrow');
  ok('dark theme, phone width: the window fits and nothing throws', await p.ev('document.documentElement.scrollWidth <= 431') && p.errors.length === 0, p.errors.slice(0, 2));
  await p.ev('RV.entry.close()');
  await p.ev(WIPE);
  ok('no script error anywhere', p.errors.length === 0, p.errors.slice(0, 3));
  await p.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
