/* Phase 19: the note for phones and tablets. A PC gets none. With "device=phone" or "device=tablet" in the address
   the note shows the three kinds of device with the reader's own marked; it is shown once; on a first visit the
   welcome follows it. The Help page has the same text. 19.1: two fingers pinch-zoom the map (touch events).
   Writes device-*.png: look at them. */
const { open } = require('./h.js');
let bad = 0;
const ok = (name, pass, info) => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); if (!pass) bad++; };
const note = `(() => { const b = document.getElementById('devnote'), c = document.getElementById('devcard');
  if (!b || b.hidden || !c) return null; const r = c.getBoundingClientRect(), k = document.getElementById('devOk').getBoundingClientRect();
  return { title: document.getElementById('devTitle').innerText, rows: c.querySelectorAll('.devlist li').length, here: (c.querySelector('.devlist .here b') || {}).innerText,
    btn: document.getElementById('devOk').innerText, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && k.bottom <= innerHeight }; })()`;

(async () => {
  /* a PC: no note, and the first-visit welcome comes as before */
  let p = await open('', { view: 'basic', tutorialDone: false, autoplay: true });
  await p.until('RV.S.ds && RV.S.R && RV.tutorial.isOpen()');
  ok('a PC gets no note, and the welcome opens', (await p.ev('RV.device.kind()')) === 'pc' && (await p.ev(note)) === null);
  await p.close();

  /* a phone, first visit: the note first, then the welcome; a phone-width window */
  p = await open('device=phone', { view: 'basic', tutorialDone: false, autoplay: true }, { w: 390, h: 800 });
  await p.until('RV.S.ds && RV.S.R'); await p.until(note.replace('return null', 'return 0') + ' !== 0'); await p.sleep(300);
  let n = await p.ev(note);
  await p.shot('device-phone');
  ok('a phone: the note, three kinds, "Phone" marked, inside the window', n && n.rows === 3 && n.here === 'Phone' && /phone/.test(n.btn) && n.inside, n);
  ok('the welcome waits behind the note', !(await p.ev('RV.tutorial.isOpen()')));
  await p.ev("document.getElementById('devOk').click()"); await p.sleep(400);
  ok('after "Continue" the note is gone, remembered, and the welcome opens', (await p.ev(note)) === null && (await p.ev('RV.prefs.deviceNote')) === 'phone' && (await p.ev('RV.tutorial.isOpen()')));
  await p.close();
  /* the same browser again: not shown a second time */
  p = await open('device=phone', null, { keep: true, w: 390, h: 800 });
  await p.until('RV.S.ds && RV.S.R'); await p.sleep(600);
  ok('the note is shown once', (await p.ev(note)) === null);
  await p.close();

  /* a tablet, not a first visit, dark theme */
  p = await open('device=tablet', { view: 'detailed', theme: 'dark' }, { w: 1024, h: 768 });
  await p.until('RV.S.ds && RV.S.R'); await p.until(note.replace('return null', 'return 0') + ' !== 0'); await p.sleep(300);
  n = await p.ev(note);
  await p.shot('device-tablet');
  ok('a tablet: the note with "Tablet or iPad" marked', n && n.here === 'Tablet or iPad' && /tablet/.test(n.btn) && n.inside, n);
  await p.ev("document.getElementById('devOk').click()"); await p.sleep(300);
  ok('no welcome after it when the tutorial was seen', !(await p.ev('RV.tutorial.isOpen()')));
  /* the Help page has the text for everyone */
  await p.ev("RV.S.helpTab = 'start'; RV.showTab('ph')"); await p.sleep(300);
  ok('Help, Start here has "Which device to use"', /Which device to use/i.test(await p.ev("document.getElementById('ph').innerText")) && (await p.ev("document.querySelectorAll('#ph .devlist li').length")) === 3);
  await p.ev("RV.S.helpTab = 'links'; RV.showTab('ph')"); await p.sleep(200);
  ok('Help, Links still shows its own text', /Links to a particular state/i.test(await p.ev("document.querySelector('#ph .helpmain').innerText")));
  await p.shot('device-help');
  ok('no script error', p.errors.length === 0, p.errors);
  await p.close();
  /* 19.1: two fingers on the map zoom it; one finger still moves it; a pinch picks no stretch to loop */
  p = await open('tab=pm&pause&run=v1.31', { view: 'basic' }, { w: 820, h: 1100 });
  await p.until('RV.S.ds && RV.S.R'); await p.sleep(500);
  await p.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const scale = "(() => { const a = RV.map.screenOf(0, 0), b = RV.map.screenOf(100, 0); return Math.hypot(a[0] - b[0], a[1] - b[1]); })()";
  const box = await p.ev("(() => { const r = document.getElementById('c').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
  const touch = (type, pts) => p.S('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1 })) });
  const z0 = await p.ev(scale);
  await touch('touchStart', [[box[0] - 40, box[1]], [box[0] + 40, box[1]]]);
  for (let s = 1; s <= 8; s++) { await touch('touchMove', [[box[0] - 40 - 15 * s, box[1]], [box[0] + 40 + 15 * s, box[1]]]); await p.sleep(30); }
  await touch('touchEnd', []); await p.sleep(300);
  const z1 = await p.ev(scale);
  ok('two fingers apart zoom the map in', z1 > z0 * 2.5 && z1 < z0 * 5, [z0, z1]);
  ok('a pinch picks no stretch to loop', !(await p.ev('!!RV.S.loop || !!RV.S.loopDraft')));
  await touch('touchStart', [[box[0] - 160, box[1]], [box[0] + 160, box[1]]]);
  for (let s = 1; s <= 8; s++) { await touch('touchMove', [[box[0] - 160 + 15 * s, box[1]], [box[0] + 160 - 15 * s, box[1]]]); await p.sleep(30); }
  await touch('touchEnd', []); await p.sleep(300);
  const z2 = await p.ev(scale);
  ok('two fingers together zoom it out again', Math.abs(z2 / z0 - 1) < 0.15, [z0, z2]);
  await p.shot('device-pinch');
  ok('no script error after the pinch', p.errors.length === 0, p.errors);
  await p.close();
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
  process.exit(bad ? 1 : 0);
})();
