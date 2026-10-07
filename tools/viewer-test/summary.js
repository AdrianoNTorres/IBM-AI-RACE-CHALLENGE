// The site's summary (viewer/summary.json, made by tools/viewer-summary/build.js: run that first) and the analysis
// limits as a share of the lap.
const fs = require('fs');
const { open } = require('./h.js');
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); };
(async () => {
  if (!fs.existsSync(__dirname + '/../../viewer/summary.json')) { console.log('FAIL viewer/summary.json is missing: run node tools/viewer-summary/build.js first'); process.exit(1); }
  let p = await open('tab=pv', { view: 'detailed' });
  await p.until('RV.S.ds && RV.S.R');
  const a = await p.ev("(() => { const ds = RV.S.ds, v = ds.byId['v0.90']; return { n: ds.summary ? Object.keys(ds.summary.versions).length : 0, loaded: !!v.sum, sec: v.sec, beams: v.beams, withSec: ds.versions.filter(x => x.sec).length, tile: (document.querySelector('.tiles') || {}).innerText }; })()");
  ok('as the page opens: every version with a recording has its sector times, though only one recording was read', a.n === 100 && !a.loaded && a.sec && a.sec.length === 3 && a.beams === true && a.withSec >= 100, [a.n, a.withSec, a.sec]);
  ok('the best theoretical lap counts all of them', /best of 100 recordings/.test(a.tile || ''), (a.tile || '').slice(-120));
  await p.ev("RV.versions.renderDetail && (RV.S.detailId = 'v0.90', RV.versions.render())"); await p.sleep(200);
  ok('the details of a version that was never opened show its sector times', await p.ev("/S1/.test(document.getElementById('vside').innerText) && document.getElementById('vside').innerText.indexOf(RV.S.ds.byId['v0.90'].sec[0].toFixed(3)) >= 0"));
  // exactly what the page works out from the recording itself
  const same = await p.ev("(async () => { const out = []; for (const id of ['v0.90', 'v0.7', 'v1.05', 'v0.42']) { const v = RV.S.ds.byId[id], pre = v.pre, run = await RV.S.ds.loadRun(id); out.push(run.sec.every((x, k) => Math.abs(x - pre.sec[k]) < 0.0006) && Math.abs(run.sum.lap - pre.lap) < 0.0006 && run.beams === pre.beams); } return out; })()");
  ok('the summary\'s numbers are the ones the page gets from the recording (four versions)', same.every(Boolean), same);
  ok('unloading a recording leaves the summary\'s sector times', await p.ev("(() => { const ds = RV.S.ds; ds.unloadRun('v0.7'); const v = ds.byId['v0.7']; return !v.sum && v.sec && v.sec.length === 3 && v.beams === false; })()"));
  // the table: opened versions, or every version
  await p.ev("document.querySelector('#vtabs [data-v=sectors]').click()"); await p.sleep(200);
  const few = await p.ev("document.querySelectorAll('.sectab tbody tr').length");
  await p.ev("document.getElementById('secAll').click()"); await p.sleep(300);
  const many = await p.ev("document.querySelectorAll('.sectab tbody tr').length");
  ok('Sectors across versions: the opened ones, or with the tick every version', few >= 1 && few < 10 && many === 100, [few, many]);
  await p.shot('sum-1-all-sectors');
  await p.ev("RV.showTab('pm'); RV.S.sideTab = 'sectors'; RV.map.buildSide()"); await p.sleep(200);
  ok('the narrow table on the Track page still lists the opened versions only', await p.ev("document.querySelectorAll('#side .sectab tbody tr').length < 10"));
  // a source the summary was not made from
  ok('the summary is not used for another branch or another repository', await p.ev("(async () => { const a = await RV.data.openSource(RV.data.githubSource('https://github.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE/tree/main'), {}); const b = await RV.data.openSource(RV.data.githubSource('https://github.com/someone/IBM-AI-RACE-CHALLENGE/tree/experimental_hosting'), {}).catch(() => ({ summary: null })); return a.summary === null && b.summary === null && a.versions.filter(v => v.sec).length === 0; })()"));
  // ---- the analysis limits ----
  await p.ev("new Promise(r => RV.sel.only('v1.05', r))"); await p.until("RV.analysis.of(RV.S.R)");
  const L = await p.ev("(() => { const A = RV.analysis.of(RV.S.R); return { ref: A.ref.name, lap: A.lim.lap, ok: A.lim.healthOk, warn: A.lim.healthWarn, win: A.lim.winLoss, zone: A.lim.zoneLoss, bad: A.lim.zoneBad, zones: A.zones.map(z => [z.d0, z.d1, +z.loss.toFixed(3), z.sev]) }; })()");
  ok('on the 73 s lap the limits are the seconds they were (0.05, 0.25, 0.010, 0.04, 0.12)', Math.abs(L.ok - 0.05) < 0.0005 && Math.abs(L.warn - 0.25) < 0.001 && Math.abs(L.win - 0.01) < 0.0001 && Math.abs(L.zone - 0.04) < 0.0004 && Math.abs(L.bad - 0.12) < 0.001, L);
  // the same areas as fixed seconds would give on this lap
  const fixed = await p.ev("(() => { const R = RV.S.R, A = RV.analysis.of(R), ref = A.ref, at = (r, d) => { const j = RV.idxAtD(r, d); if (j >= r.n - 1) return r.t[r.n - 1]; const d0 = r.d[j], d1 = r.d[j + 1]; return d1 > d0 && d > d0 ? r.t[j] + (r.t[j + 1] - r.t[j]) * (d - d0) / (d1 - d0) : r.t[j]; }; const zs = []; let cur = null; const end = Math.min(R.d[R.n - 1], ref.d[ref.n - 1]) - 25; for (let d = 0; d <= end; d += 25) { const loss = (at(R, d + 25) - at(R, d)) - (at(ref, d + 25) - at(ref, d)); if (loss >= 0.010) { if (cur && d - cur.d1 <= 25) { cur.d1 = d + 25; cur.loss += loss; } else { cur = { d0: d, d1: d + 25, loss: loss }; zs.push(cur); } } } return zs.filter(z => z.loss >= 0.04).sort((a, b) => b.loss - a.loss).slice(0, 6).sort((a, b) => a.d0 - b.d0).map(z => [z.d0, z.d1, +z.loss.toFixed(3), z.loss >= 0.12 ? 'bad' : 'warn']); })()");
  ok('and v1.05 has the same problem areas as with the fixed seconds', JSON.stringify(fixed) === JSON.stringify(L.zones), [fixed.length, L.zones.length]);
  const scaled = await p.ev("(() => { const r = RV.S.ds.loaded.get('v0.7'); return null; })()");
  await p.ev("RV.showTab('pm'); RV.S.sideTab = 'sectors'; RV.map.buildSide()"); await p.sleep(200);
  ok('the Sectors panel states the limits in seconds and as a share of the lap', /up to 0\.05 s lost in the sector/.test(await p.ev("document.getElementById('side').innerText")) && /0\.07 % and 0\.34 %/.test(await p.ev("document.getElementById('side').innerText")), (await p.ev("document.getElementById('side').innerText")).slice(-330));
  await p.shot('sum-2-limits');
  ok('no script error', p.errors.length === 0, p.errors.slice(0, 3));
  await p.ev("RV.uiSet('secAll', false); RV.savePrefs()");
  await p.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
