// Smoke test of the run viewer: the page opens, every page and tab draws, a comparison works, and nothing throws.
// Run it after every change, before the phase's own checks. See README.md in this folder for how to start it.
const { open } = require('./h.js');
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); };
(async () => {
  // 1. as a visitor gets it: the newest version, detailed view
  let p = await open('', { view: 'detailed', autoplay: false });
  await p.until('RV.S.ds && RV.S.R');
  ok('the page opens on the newest version', await p.ev('RV.S.sel.length === 1 && RV.S.ds.versions.length > 50'), await p.ev('[RV.S.sel[0], RV.S.ds.versions.length]'));
  for (const t of ['pv', 'pm', 'pt', 'ph', 'ps']) { await p.ev(`RV.showTab('${t}')`); await p.sleep(300); }
  for (const t of ['general', 'replay', 'data', 'custom', 'controls']) { await p.ev(`RV.S.setTab = '${t}'; RV.settings.render()`); await p.sleep(120); }
  ok('every page and every Settings tab draws without an error', p.errors.length === 0, p.errors.slice(0, 2));
  // 2. a comparison on the track, played for a moment
  await p.ev("new Promise(r => { RV.sel.set(['v1.06', 'v1.05', 'v0.96']); RV.sel.apply(r); })");
  await p.ev("RV.showTab('pm'); RV.play.go(1500); RV.play.set(true)"); await p.sleep(800);
  ok('three cars replay; the panels are on the map', await p.ev("RV.S.playing && RV.S.CM.length === 2 && ['hud', 'mini', 'sectorLive', 'lapDeltaBar', 'leg', 'inputs'].every(id => document.getElementById(id).getBoundingClientRect().width > 0)"));
  for (const tab of ['view', 'cars', 'layers', 'sectors', 'help']) { await p.ev(`RV.S.sideTab = '${tab}'; RV.map.buildSide()`); await p.sleep(100); }
  await p.ev("RV.play.set(false); RV.showTab('pt')"); await p.sleep(300);
  for (const tab of ['charts', 'summary', 'sectors', 'sect']) { await p.ev(`document.querySelector('#ttabs [data-t=${tab}]').click()`); await p.sleep(150); }
  ok('the analysis has a reference lap and finds problem areas', await p.ev("(() => { const A = RV.analysis.of(RV.S.R); return !!A && A.zones.length >= 1 && A.line.pct > 0; })()"));
  ok('no script error in the detailed view', p.errors.length === 0, p.errors.slice(0, 2));
  await p.close();
  // 3. basic view, dark theme, first visit: the tour runs to its end
  p = await open('', { view: 'basic', theme: 'dark', tutorialDone: false, autoplay: true });
  await p.until('RV.S.ds && RV.S.R && RV.tutorial.isOpen()'); await p.sleep(300);
  let steps = 0;
  while (await p.ev('RV.tutorial.isOpen()') && steps < 30) { await p.ev("document.getElementById('tourNext').click()"); await p.sleep(150); steps++; }
  ok('first visit: the tour runs to its end', !(await p.ev('RV.tutorial.isOpen()')) && p.errors.length === 0, steps);
  for (const t of ['pv', 'pm', 'pt', 'ph', 'ps']) { await p.ev(`RV.showTab('${t}')`); await p.sleep(250); }
  ok('no script error in the basic view', p.errors.length === 0, p.errors.slice(0, 2));
  await p.close();
  // 4. a phone-width window
  p = await open('tab=pm&pause', {}, { w: 420, h: 800 });
  await p.until('RV.S.ds && RV.S.R'); await p.sleep(400);
  ok('a phone-width window draws without an error and without sideways scrolling', p.errors.length === 0 && await p.ev('document.documentElement.scrollWidth <= 421'), p.errors.slice(0, 2));
  await p.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
