/* Phase 17: the three tutorials. Each runs to its end in the basic and the detailed view; every step must point at
   something on screen and keep its card inside the window; on the Track page the steps do not jump back to the left;
   one step shows a looped section and one keeps a window's buttons in sight. The choosers lead to the other
   tutorials and the Help page starts each one. Phase 17.2: the page stays in use while a tutorial runs, what the
   reader closed is opened again for the step that needs it, and everything is put back when the tutorial ends.
   Writes phase17-*.png: look at them. */
const { open } = require('./h.js');
let bad = 0;
const ok = (name, pass, info) => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); if (!pass) bad++; };
const state = `(() => { const h = document.getElementById('tourHole').getBoundingClientRect(), c = document.getElementById('tourCard').getBoundingClientRect();
  return { open: RV.tutorial.isOpen(), title: (document.getElementById('tourTitle') || {}).innerText, count: (document.querySelector('.tour-count') || {}).innerText || '',
    loop: !!RV.S.loop, bar: !!document.querySelector('.win.tour-bar'), x: Math.round(h.left + h.width / 2), hole: Math.round(h.width) + 'x' + Math.round(h.height),
    inside: c.left >= 0 && c.top >= 0 && c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1 }; })()`;
const click = id => `document.getElementById('${id}').click()`;
const ready = async p => { await p.sleep(500); await p.until('RV.S.ds && RV.S.R && !RV.tutorial.isOpen()', 30000); await p.sleep(300); };
/* what must be the same before and after: the stored settings (but for "seen"), the page, the versions, the map */
const fingerprint = `(() => { const q = JSON.parse(localStorage.getItem('rv_prefs')); delete q.tutorialDone;
  return JSON.stringify({ prefs: q, tab: RV.S.tab, sel: RV.S.sel, loop: RV.S.loop, hud: !!document.getElementById('win-hud').getClientRects().length,
    wins: document.querySelectorAll('.twin').length, side: document.getElementById('pm').classList.contains('side-closed'), beams: RV.map.LAYERS.find(L => L.id === 'beams').on, hash: location.hash }); })()`;

async function run(p, id, view, shots) {
  await p.ev(`RV.tutorial.start(true, '${id}')`); await p.sleep(300);
  const seen = [], noTarget = [], outside = [], loops = [], bars = [], xs = [];
  for (let n = 0; n < 45; n++) {
    let s; try { s = await p.ev(state); } catch (e) { break; }              /* the page is opening again */
    if (!s.open) break;
    seen.push(s.title);
    const isStep = /step \d+ of/i.test(s.count);
    if (isStep && s.hole === '0x0') noTarget.push(s.title);
    if (!s.inside) outside.push(s.title);
    if (s.loop) { loops.push(s.title); await p.sleep(500); await p.shot('phase17-' + id + '-' + view + '-loop'); }
    if (s.bar) { bars.push(s.title); await p.shot('phase17-' + id + '-' + view + '-bar'); }
    if (isStep && /Track/.test(await p.ev("document.querySelector('.tab.on').innerText"))) xs.push(s.x);
    if (shots && shots.includes(n)) await p.shot('phase17-' + id + '-' + view + '-' + n);
    await p.ev(click('tourNext')); await p.sleep(260);
  }
  await ready(p);
  ok(id + ' in the ' + view + ' view runs to its end', seen.length > 5, seen.length + ' cards');
  ok(id + ' in the ' + view + ' view: every step points at something', noTarget.length === 0, noTarget);
  ok(id + ' in the ' + view + ' view: every card is inside the window', outside.length === 0, outside);
  ok(id + ' in the ' + view + ' view: one step shows a looped section, one a window\'s buttons; no loop is left', loops.length === 1 && bars.length === 1 && !(await p.ev('!!RV.S.loop')), [loops, bars]);
  /* on the Track page the steps go left, then right: the eye does not travel back */
  let back = 0; for (let i = 3; i < xs.length; i++) if (xs[i] < xs[i - 1] - 400) back++;
  ok(id + ' in the ' + view + ' view: the Track steps do not jump back to the left', back === 0, xs);
  return seen;
}

(async () => {
  let p;
  for (const view of ['basic', 'detailed']) {
    p = await open('', { view, tutorialDone: true, autoplay: true }); await ready(p); await p.close();   /* store the settings */
    p = await open('', null, { keep: true }); await ready(p);                                          /* and keep them through the reloads */
    const before = await p.ev(fingerprint);
    const g = await run(p, 'general', view, view === 'detailed' ? [0, 9, 14] : [0]);
    const b = await run(p, 'beginner', view, view === 'basic' ? [0, 11, 13, 16] : [14]);
    const a = await run(p, 'advanced', view, view === 'basic' ? [0, 3, 20] : [12, 27]);
    console.log('  cards:', g.length, b.length, a.length);
    const after = await p.ev(fingerprint);
    ok(view + ': after all three, everything is as it was', after === before, after === before ? undefined : [before.slice(0, 400), after.slice(0, 400)]);
    ok(view + ': no script error', p.errors.length === 0, p.errors);
    await p.close();
  }

  /* first visit: the welcome offers the other two; the offer starts that tutorial; ending it marks the tutorial as seen */
  p = await open('', { view: 'basic', tutorialDone: false, autoplay: true }); await p.until('RV.S.ds && RV.S.R && RV.tutorial.isOpen()'); await p.close();
  p = await open('', null, { keep: true });
  await p.until('RV.S.ds && RV.S.R && RV.tutorial.isOpen()'); await p.sleep(300);
  ok('first visit: the welcome offers both other tutorials', (await p.ev("document.querySelectorAll('#tourCard [data-tour]').length")) === 2);
  await p.ev("document.querySelector('#tourCard [data-tour=beginner]').click()"); await p.sleep(250);
  ok('the offer opens the beginner tutorial', (await p.ev('RV.tutorial.which()')) === 'beginner', (await p.ev(state)).title);
  await p.ev(click('tourSkip')); await ready(p);
  ok('ending any tutorial counts as seen', (await p.ev('RV.prefs.tutorialDone')) === true);
  /* the last card of the quick tour leads to the advanced one, which runs in the detailed view and puts the view back */
  await p.ev("RV.tutorial.start(false)"); await p.sleep(250);
  for (let n = 0; n < 20 && !(await p.ev("!!document.querySelector('#tourCard [data-tour]')")); n++) { await p.ev(click('tourNext')); await p.sleep(220); }
  await p.shot('phase17-outro');
  await p.ev("document.querySelector('#tourCard [data-tour=advanced]').click()"); await p.sleep(400);
  ok('the last card opens the advanced tutorial in the detailed view', (await p.ev('RV.tutorial.which()')) === 'advanced' && (await p.ev('RV.prefs.view')) === 'detailed');
  await p.ev(click('tourNext')); await p.sleep(250);
  await p.ev(click('tourSkip')); await ready(p);
  ok('the view is basic again afterwards', (await p.ev('RV.prefs.view')) === 'basic');
  /* the Help page starts each of the three, and the reader is back on the Help page afterwards */
  await p.ev("RV.S.helpTab = 'start'; RV.showTab('ph')"); await p.sleep(250);
  await p.shot('phase17-help');
  for (const [btn, id] of [['hTour', 'general'], ['hTourB', 'beginner'], ['hTourA', 'advanced']]) {
    await p.ev("RV.showTab('ph')"); await p.sleep(150);
    await p.ev(click(btn)); await p.sleep(300);
    ok('Help starts the ' + id + ' tutorial', (await p.ev('RV.tutorial.isOpen()')) && (await p.ev('RV.tutorial.which()')) === id);
    await p.ev(click('tourNext')); await p.sleep(250);
    await p.ev(click('tourSkip')); await ready(p);
    ok('and ends on the Help page', (await p.ev('RV.S.tab')) === 'ph', await p.ev('RV.S.tab'));
  }
  ok('no script error', p.errors.length === 0, p.errors);
  await p.close();

  /* 17.2: a live tutorial. With two versions compared on the Track page, the reader plays with the page while the
     tutorial runs; a later step opens again what was closed; ending it puts everything back. */
  p = await open('tab=pm&run=v1.27&cmp=v1.26', { view: 'detailed', autoplay: true }); await ready(p); await p.close();
  p = await open('tab=pm&run=v1.27&cmp=v1.26', null, { keep: true }); await ready(p);
  const before = await p.ev(fingerprint.replace('hash: location.hash', 'hash: 0'));
  await p.ev("RV.tutorial.start(false, 'beginner')"); await p.sleep(300);
  const goTo = async title => { for (let n = 0; n < 40 && (await p.ev(state)).title !== title; n++) { await p.ev(click('tourNext')); await p.sleep(200); } };
  await goTo('Watch the lap');
  /* a real click on the page under the tutorial: the play button */
  const playing = await p.ev('RV.S.playing');
  const r = await p.ev("(() => { const b = document.getElementById('play').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()");
  await p.mouse('mousePressed', r[0], r[1]); await p.mouse('mouseReleased', r[0], r[1]); await p.sleep(200);
  ok('live: a click reaches the page under the tutorial', (await p.ev('RV.S.playing')) !== playing);
  await p.key(' ', 'Space', 32); await p.sleep(150);
  ok('live: the keys go to the page, and the tutorial stays open', await p.ev('RV.tutorial.isOpen()'));
  /* close the readout, fold the overview map, close the side panel, open a track window, switch the beams off, go dark */
  await p.ev("document.querySelector('#win-hud .wb.c').click(); document.querySelector('#win-mini .wb.m').click(); document.getElementById('twAdd').click(); document.getElementById('sideToggle').click(); RV.map.LAYERS.find(L => L.id === 'beams').on = false; RV.prefs.theme = 'dark'; RV.savePrefs()");
  await p.sleep(400);
  ok('live: the changes took', (await p.ev(fingerprint.replace('hash: location.hash', 'hash: 0'))) !== before);
  /* drag the card: it follows, and stays there until the next step */
  const c0 = await p.ev("(() => { const b = document.getElementById('tourCard').getBoundingClientRect(); return [b.left + 30, b.top + 12]; })()");
  await p.mouse('mousePressed', c0[0], c0[1]); await p.mouse('mouseMoved', c0[0] + 120, c0[1] - 90); await p.mouse('mouseReleased', c0[0] + 120, c0[1] - 90); await p.sleep(500);
  const c1 = await p.ev("(() => { const b = document.getElementById('tourCard').getBoundingClientRect(); return [b.left + 30, b.top + 12]; })()");
  ok('live: the card can be dragged out of the way', Math.abs(c1[0] - c0[0] - 120) < 6 && Math.abs(c1[1] - c0[1] + 90) < 6, [c0, c1]);
  await goTo('The numbers of the moment'); await p.sleep(300);
  ok('live: the closed readout is opened again for its step', (await p.ev("document.getElementById('win-hud').getClientRects().length")) > 0 && (await p.ev(state)).hole !== '0x0');
  await goTo('Where on the track'); await p.sleep(300);
  ok('live: the folded overview map is unfolded for its step', !(await p.ev("document.getElementById('win-mini').classList.contains('min')")));
  await goTo('How the camera follows'); await p.sleep(300);
  await p.shot('phase17-live');
  ok('live: the closed side panel is opened again for its step', !(await p.ev("document.getElementById('pm').classList.contains('side-closed')")) && (await p.ev(state)).hole !== '0x0');
  await p.ev(click('tourSkip')); await ready(p);
  const after = await p.ev(fingerprint.replace('hash: location.hash', 'hash: 0'));
  ok('live: ending the tutorial puts everything back (settings, page, compared versions, windows, layers)', after === before, after === before ? undefined : [before.slice(-300), after.slice(-300)]);
  ok('live: the address is clean again', (await p.ev('location.hash')) === '' || (await p.until("location.hash === ''", 20000)));
  ok('live: no script error', p.errors.length === 0, p.errors);
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
