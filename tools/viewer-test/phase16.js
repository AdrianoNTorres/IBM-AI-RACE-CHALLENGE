// Phase 16: track windows. A second view of the replay in a window over the map, with its own camera, layers, path
// colour and cars; moved, resized, folded, closed, saved; one window per compared car.
// Writes phase16-*.png beside this file: look at them.
const { open } = require('./h.js');
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); };
const COLOURS = id => "(() => { const c = document.querySelector('" + id + "'); if (!c || !c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 52) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; })()";
const RECT = sel => "(() => { const r = document.querySelector('" + sel + "').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()";
const BTN = (sel, text) => "[...document.querySelectorAll('" + sel + "')].find(b => b.textContent === '" + text + "').click()";
const W = 'RV.map.wins';
const MAIN_AT = 'JSON.stringify(RV.map.screenOf(0, 0))';
(async () => {
  // ---- as the page opens: one car, nothing compared
  let p = await open('tab=pm&pause&run=v1.06', { view: 'detailed' });
  await p.until('RV.S.R && RV.S.R.x && document.getElementById("twAdd")'); await p.sleep(600);
  ok('the side panel starts with "Settings of: Main map" and the button "+ Track window"', await p.ev("document.getElementById('twSel').value === 'main' && !document.getElementById('twAdd').disabled && " + W + ".list().length === 0"));
  const main0 = await p.ev(MAIN_AT);
  await p.ev("document.getElementById('twAdd').click()"); await p.sleep(500);
  let L = await p.ev(W + '.list()');
  ok('the button opens Track 2, coloured by braking where the main map is by speed, showing the whole track', L.length === 1 && L[0].n === 2 && L[0].colour === 'brake' && L[0].fit && /^v1\.06, braking$/.test(L[0].title), L[0] && [L[0].title, L[0].colour, L[0].fit]);
  const nW = await p.ev(COLOURS('#win-tw2 canvas')), nM = await p.ev(COLOURS('#c'));
  ok('the window is drawn (many colours on its canvas) and so is the main map', nW > 6 && nM > 6, [nW, nM]);
  ok('the side panel now changes Track 2, and the window has the accent frame', await p.ev("document.getElementById('twSel').value === 'tw2' && " + W + ".picked() === 2 && document.getElementById('win-tw2').classList.contains('tsel')"));
  ok('the main map did not move', await p.ev(MAIN_AT) === main0);
  await p.shot('phase16-1-one-window');

  // ---- its own layers and path colour, through the side panel
  await p.ev("RV.S.sideTab = 'layers'; RV.S.layerGroup = 'Sensors'; RV.map.buildSide()"); await p.sleep(100);
  ok('Layers of a window has no "Panels on the map" group', await p.ev("![...document.querySelectorAll('#side .acc span')].some(x => x.textContent === 'Panels on the map')"));
  await p.ev("[...document.querySelectorAll('#side .lr')].find(r => r.querySelector('.ln') && r.querySelector('.ln').textContent === 'Track beams').querySelector('input').click()"); await p.sleep(200);
  L = await p.ev(W + '.list()');
  ok('beams switched off in the window stay on on the main map', !L[0].on.includes('beams') && await p.ev("RV.map.LAYERS.find(x => x.id === 'beams').on"));
  await p.ev(BTN('#side .pathcol button', 'Speed')); await p.sleep(200);
  L = await p.ev(W + '.list()');
  ok('path colour of the window set to speed; its title follows', L[0].colour === 'speed' && /speed$/.test(L[0].title), L[0].title);
  await p.ev(BTN('#side .pathcol button', 'Brake')); await p.sleep(200);
  ok('and back to braking, while the colour keys still describe the main map (speed)', (await p.ev(W + '.list()'))[0].colour === 'brake' && /speed/i.test(await p.ev("document.getElementById('leg').innerText")));

  // ---- its own camera: wheel and drag inside the window
  let r = await p.ev(RECT('#win-tw2 canvas'));
  const z0 = (await p.ev(W + '.list()'))[0].z;
  await p.S('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, deltaX: 0, deltaY: -400 }); await p.sleep(300);
  const z1 = (await p.ev(W + '.list()'))[0].z;
  ok('the wheel over the window zooms the window only', z1 > z0 * 1.3 && await p.ev(MAIN_AT) === main0, [z0, z1]);
  const a0 = await p.ev(W + '.at(2, 0, 0)');
  await p.mouse('mousePressed', r[0] + 80, r[1] + 80); await p.mouse('mouseMoved', r[0] + 110, r[1] + 100); await p.mouse('mouseMoved', r[0] + 140, r[1] + 120); await p.mouse('mouseReleased', r[0] + 140, r[1] + 120); await p.sleep(300);
  const a1 = await p.ev(W + '.at(2, 0, 0)');
  ok('a drag on the window\'s map moves that map by the drag (60, 40), not the main map', Math.abs(a1[0] - a0[0] - 60) < 2 && Math.abs(a1[1] - a0[1] - 40) < 2 && await p.ev(MAIN_AT) === main0, [a0, a1]);
  await p.ev("RV.S.sideTab = 'view'; RV.map.buildSide()"); await p.sleep(100);
  await p.ev(BTN('#side .btnrow button', 'Back to the car')); await p.sleep(300);
  L = await p.ev(W + '.list()');
  ok('"Back to the car" in the side panel makes the window follow the car; the main map still shows the whole track', L[0].follow && await p.ev(MAIN_AT) === main0);
  await p.shot('phase16-2-window-follows');

  // ---- the window itself: move by the title, resize by the grip, fold, open
  r = await p.ev(RECT('#win-tw2 .twtitle'));
  await p.mouse('mousePressed', r[0] + 40, r[1] + 8); await p.mouse('mouseMoved', r[0] + 100, r[1] + 60); await p.mouse('mouseMoved', r[0] + 160, r[1] + 108); await p.mouse('mouseReleased', r[0] + 160, r[1] + 108); await p.sleep(200);
  const r2 = await p.ev(RECT('#win-tw2 .twtitle'));
  ok('dragging the title moves the window (120, 100)', Math.abs(r2[0] - r[0] - 120) < 2 && Math.abs(r2[1] - r[1] - 100) < 2, [r, r2]);
  const g = await p.ev(RECT('#win-tw2 .wingrip')), s0 = (await p.ev(W + '.list()'))[0];
  await p.mouse('mouseMoved', g[0] + 9, g[1] + 9); await p.mouse('mousePressed', g[0] + 9, g[1] + 9); await p.mouse('mouseMoved', g[0] + 60, g[1] + 40); await p.mouse('mouseMoved', g[0] + 109, g[1] + 69); await p.mouse('mouseReleased', g[0] + 109, g[1] + 69); await p.sleep(300);
  const s1 = (await p.ev(W + '.list()'))[0];
  ok('dragging the grip makes it larger (100, 60), and its canvas follows', s1.w === s0.w + 100 && s1.h === s0.h + 60 && await p.ev("(() => { const c = document.querySelector('#win-tw2 canvas'); return c.width === c.clientWidth && c.clientWidth > " + (s0.w + 90) + "; })()"), [s0.w, s0.h, s1.w, s1.h]);
  await p.ev("document.querySelector('#win-tw2 .wb.m').click()"); await p.sleep(200);
  ok('yellow folds it into a tab named Track 2', await p.ev("document.getElementById('win-tw2').classList.contains('min') && getComputedStyle(document.querySelector('#win-tw2 .twbody')).display === 'none' && document.querySelector('#win-tw2 .wintab').offsetWidth > 0"));
  await p.ev("document.querySelector('#win-tw2 .wintab').click()"); await p.sleep(200);
  ok('the tab opens it again', await p.ev("!document.getElementById('win-tw2').classList.contains('min') && document.querySelector('#win-tw2 canvas').clientHeight > 100"));

  // ---- saved: a new tab with the stored settings has the same window
  await p.sleep(500);
  const stored = JSON.parse(await p.ev("localStorage.getItem('rv_prefs')"));
  const before = (await p.ev(W + '.list()'))[0];
  await p.close();
  p = await open('tab=pm&pause&run=v1.06', stored);
  await p.until('RV.S.R && RV.S.R.x && ' + W + '.list().length === 1'); await p.sleep(600);
  const after = (await p.ev(W + '.list()'))[0];
  ok('after a reload: the same window, place, size, camera, colour and layers', after.n === 2 && after.w === before.w && after.h === before.h && Math.abs(after.pos[0] - before.pos[0]) < 1 && after.follow === before.follow && after.colour === 'brake' && !after.on.includes('beams') && await p.ev(COLOURS('#win-tw2 canvas')) > 6, [before.pos, after.pos, after.follow]);
  ok('and the main map still has its beams', await p.ev("RV.map.LAYERS.find(x => x.id === 'beams').on"));

  // ---- a click on the main map gives the side panel back to it; four windows at most
  r = await p.ev(RECT('#c'));
  await p.mouse('mousePressed', r[0] + r[2] - 60, r[1] + r[3] / 2); await p.mouse('mouseReleased', r[0] + r[2] - 60, r[1] + r[3] / 2); await p.sleep(200);
  ok('a click on the main map: the side panel is the main map\'s again', await p.ev(W + ".picked() === 0 && document.getElementById('twSel').value === 'main' && !document.getElementById('win-tw2').classList.contains('tsel')"));
  await p.ev("for (let k = 0; k < 5; k++) { const b = document.getElementById('twAdd'); if (!b.disabled) b.click(); }"); await p.sleep(400);
  ok('four windows at most; the button is then off', await p.ev(W + ".list().length === 4 && document.getElementById('twAdd').disabled"), await p.ev(W + '.list().map(x => x.n)'));
  await p.shot('phase16-3-four-windows');
  await p.ev("document.querySelector('#win-tw3 .wb.c').click()"); await p.sleep(200);
  ok('red closes a window; the others keep their names', JSON.stringify(await p.ev(W + '.list().map(x => x.n)')) === '[2,4,5]');
  await p.ev(W + ".pick(0); RV.S.sideTab = 'layers'; RV.map.buildSide()"); await p.sleep(100);
  await p.ev(BTN('#side button.btn.wide', 'Restore the default layers')); await p.sleep(300);
  ok('"Restore the default layers" on the main map closes every track window', await p.ev(W + ".list().length === 0 && !document.querySelector('.twin')"));
  ok('no script error with one car', p.errors.length === 0, p.errors);
  await p.close();

  // ---- comparing: on one track or one window per car
  p = await open('tab=pm&pause&run=v1.06&cmp=v1.05,v1.04', { view: 'detailed' });
  await p.until('RV.S.R && RV.S.R.x && RV.S.CM.length === 2 && RV.S.CM.every(m => m.r && m.r.x)'); await p.sleep(800);
  await p.ev("RV.S.sideTab = 'cars'; RV.map.buildSide()"); await p.sleep(100);
  ok('Cars has "Cars on the main map" and the two buttons', await p.ev("!!document.querySelector('#side .twcars') && [...document.querySelectorAll('#side .btnrow button')].map(b => b.textContent).join('|').includes('One window per car|All cars on one track')"));
  ok('three cars on the main map to begin with', (await p.ev('RV.map.carsNow().length')) === 3);
  await p.ev(BTN('#side .btnrow button', 'One window per car')); await p.sleep(700);
  L = await p.ev(W + '.list()');
  ok('one window per compared car, each showing that car only, coloured as the main map; the main map keeps the car in focus', L.length === 2 && L[0].car === 'v1.05' && L[1].car === 'v1.04' && L.every(x => x.one && x.colour === 'speed') && await p.ev(W + ".mainCar() === 'focus' && RV.map.carsNow().length === 1"), L.map(x => x.title));
  ok('both windows are drawn', await p.ev(COLOURS('#win-tw2 canvas')) > 6 && await p.ev(COLOURS('#win-tw3 canvas')) > 6);
  ok('the page\'s own state is untouched by painting another car\'s window', await p.ev("RV.S.sel[0] === 'v1.06' && RV.S.R === RV.S.ds.loaded.get('v1.06') && RV.S.CM.length === 2"));
  await p.ev("RV.play.set(true)"); await p.sleep(1500); await p.ev("RV.play.set(false)"); await p.sleep(200);
  ok('while playing nothing throws and the focus stays v1.06', p.errors.length === 0 && await p.ev("RV.S.sel[0] === 'v1.06' && RV.S.i > 0"), p.errors);
  await p.shot('phase16-4-one-window-per-car');
  // one window showing every car again
  await p.ev(W + ".pick(2); RV.S.sideTab = 'cars'; RV.map.buildSide()"); await p.sleep(100);
  await p.ev("(() => { const s = document.querySelector('#side .twcars'); s.value = ''; s.onchange(); })()"); await p.sleep(300);
  L = await p.ev(W + '.list()');
  ok('"All selected cars" in Track 2: it shows all three, Track 3 still one', !L[0].one && /^all cars/.test(L[0].title) && L[1].one, L.map(x => x.title));
  await p.ev(BTN('#side .btnrow button', 'All cars on one track')); await p.sleep(400);
  L = await p.ev(W + '.list()');
  ok('"All cars on one track": the main map has all three again; the window the reader changed stays, the untouched one is closed', await p.ev('RV.map.carsNow().length') === 3 && L.length === 1 && L[0].n === 2, L.map(x => x.n));
  // a window on one car, then another car is put in focus
  await p.ev(W + ".add({ car: 'v1.04' })"); await p.sleep(300);
  await p.ev("RV.sel.makeRef('v1.05')"); await p.sleep(900);
  ok('a new car in focus: nothing throws, the windows are still drawn', p.errors.length === 0 && await p.ev(COLOURS('#win-tw2 canvas')) > 6, p.errors);
  await p.shot('phase16-5-compare-mixed');
  ok('no script error while comparing', p.errors.length === 0, p.errors);
  await p.close();

  // ---- the basic view and the dark theme
  p = await open('tab=pm&pause&run=v1.06', { view: 'basic', theme: 'dark' });
  await p.until('RV.S.R && RV.S.R.x && document.getElementById("twAdd")'); await p.sleep(500);
  await p.ev("document.getElementById('twAdd').click()"); await p.sleep(400);
  await p.ev("RV.S.sideTab = 'layers'; RV.map.buildSide()"); await p.sleep(100);
  ok('basic view, dark: a window opens and its Layers list has no wheel-and-pedals switch', await p.ev(W + ".list().length === 1 && ![...document.querySelectorAll('#side .ln')].some(x => x.textContent === 'Wheel and pedals')") && p.errors.length === 0, p.errors);
  await p.shot('phase16-6-basic-dark');
  await p.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
