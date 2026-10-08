/* Phase 17: the three tutorials. Each runs to its end in the basic and the detailed view; every step must point at
   something on screen and keep its card inside the window. The choosers lead to the other tutorials, the Help page
   starts each one, and the view and the side panel are as they were afterwards. Writes phase17-*.png: look at them. */
const { open } = require('./h.js');
let bad = 0;
const ok = (name, pass, info) => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); if (!pass) bad++; };
const state = `(() => { const h = document.getElementById('tourHole').getBoundingClientRect(), c = document.getElementById('tourCard').getBoundingClientRect();
  return { open: RV.tutorial.isOpen(), title: (document.getElementById('tourTitle') || {}).innerText, count: (document.querySelector('.tour-count') || {}).innerText || '',
    hole: Math.round(h.width) + 'x' + Math.round(h.height), inside: c.left >= 0 && c.top >= 0 && c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1 }; })()`;
const click = id => `document.getElementById('${id}').click()`;

async function run(p, id, view, shots) {
  await p.ev(`RV.tutorial.start(true, '${id}')`); await p.sleep(300);
  const seen = [], noTarget = [], outside = [];
  for (let n = 0; n < 45; n++) {
    const s = await p.ev(state);
    if (!s.open) break;
    seen.push(s.title);
    const isStep = /step \d+ of/i.test(s.count);
    if (isStep && s.hole === '0x0') noTarget.push(s.title);
    if (!s.inside) outside.push(s.title);
    if (shots && shots.includes(n)) await p.shot('phase17-' + id + '-' + view + '-' + n);
    await p.ev(click('tourNext')); await p.sleep(260);
  }
  ok(id + ' in the ' + view + ' view runs to its end', !(await p.ev('RV.tutorial.isOpen()')) && seen.length > 5, seen.length + ' cards');
  ok(id + ' in the ' + view + ' view: every step points at something', noTarget.length === 0, noTarget);
  ok(id + ' in the ' + view + ' view: every card is inside the window', outside.length === 0, outside);
  return seen;
}

(async () => {
  for (const view of ['basic', 'detailed']) {
    const p = await open('', { view, tutorialDone: true, autoplay: true });
    await p.until('RV.S.ds && RV.S.R'); await p.sleep(400);
    const side0 = await p.ev('RV.S.sideTab');
    const g = await run(p, 'general', view, view === 'detailed' ? [0, 8, 13] : [0]);
    const b = await run(p, 'beginner', view, view === 'basic' ? [0, 3, 12, 17] : [14]);
    const a = await run(p, 'advanced', view, view === 'basic' ? [0, 3, 19, 23] : [12, 26]);
    console.log('  cards:', g.length, b.length, a.length);
    ok(view + ': the view and the side panel are as they were', (await p.ev('RV.prefs.view')) === view && (await p.ev('RV.S.sideTab')) === side0, [await p.ev('RV.prefs.view'), await p.ev('RV.S.sideTab')]);
    ok(view + ': no script error', p.errors.length === 0, p.errors);
    await p.close();
  }

  /* first visit: the welcome offers the other two; the offer starts that tutorial; ending it marks the tutorial as seen */
  let p = await open('', { view: 'basic', tutorialDone: false, autoplay: true });
  await p.until('RV.S.ds && RV.S.R && RV.tutorial.isOpen()'); await p.sleep(300);
  ok('first visit: the welcome offers both other tutorials', (await p.ev("document.querySelectorAll('#tourCard [data-tour]').length")) === 2);
  await p.ev("document.querySelector('#tourCard [data-tour=beginner]').click()"); await p.sleep(250);
  ok('the offer opens the beginner tutorial', (await p.ev('RV.tutorial.which()')) === 'beginner', (await p.ev(state)).title);
  await p.key('Escape', 'Escape', 27); await p.sleep(200);
  ok('ending any tutorial counts as seen', !(await p.ev('RV.tutorial.isOpen()')) && (await p.ev('RV.prefs.tutorialDone')) === true);
  /* the last card of the quick tour leads to the advanced one, which runs in the detailed view and puts the view back */
  await p.ev("RV.tutorial.start(false)"); await p.sleep(250);
  for (let n = 0; n < 20 && !(await p.ev("!!document.querySelector('#tourCard [data-tour]')")); n++) { await p.ev(click('tourNext')); await p.sleep(220); }
  await p.shot('phase17-outro');
  await p.ev("document.querySelector('#tourCard [data-tour=advanced]').click()"); await p.sleep(400);
  ok('the last card opens the advanced tutorial in the detailed view', (await p.ev('RV.tutorial.which()')) === 'advanced' && (await p.ev('RV.prefs.view')) === 'detailed');
  await p.key('Escape', 'Escape', 27); await p.sleep(300);
  ok('the view is basic again afterwards', (await p.ev('RV.prefs.view')) === 'basic');
  /* the Help page starts each of the three */
  await p.ev("RV.S.helpTab = 'start'; RV.showTab('ph')"); await p.sleep(250);
  await p.shot('phase17-help');
  for (const [btn, id] of [['hTour', 'general'], ['hTourB', 'beginner'], ['hTourA', 'advanced']]) {
    await p.ev("RV.showTab('ph')"); await p.sleep(150);
    await p.ev(click(btn)); await p.sleep(300);
    ok('Help starts the ' + id + ' tutorial', (await p.ev('RV.tutorial.isOpen()')) && (await p.ev('RV.tutorial.which()')) === id);
    await p.key('Escape', 'Escape', 27); await p.sleep(250);
  }
  ok('no script error', p.errors.length === 0, p.errors);
  await p.close();

  /* a phone-width window: the welcome with its offers fits */
  p = await open('', { view: 'basic', tutorialDone: false, autoplay: true }, { w: 390, h: 800 });
  await p.until('RV.S.ds && RV.S.R && RV.tutorial.isOpen()'); await p.sleep(400);
  await p.shot('phase17-phone');
  ok('phone width: the welcome is inside the window', (await p.ev(state)).inside);
  await p.close();
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
  process.exit(bad ? 1 : 0);
})();
