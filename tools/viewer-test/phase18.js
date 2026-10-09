/* Phase 18.2: the Track page in 3D. The switch is there and 3D is off when a page opens; the 3D library is not
   fetched before 3D is asked for; in 3D the track is drawn, the cars stand on the road surface with the road's
   slope, the three cameras and the height factor work, the replay moves the car, and 2D comes back as it was.
   Writes phase18-*.png: look at them. */
const { open } = require('./h.js');
let bad = 0;
const ok = (name, pass, info) => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); if (!pass) bad++; };
const st = 'RV.view3d.state()';
const three = "performance.getEntriesByType('resource').some(e => /three\\.module/.test(e.name))";
/* the height the road has under the car in focus, as the track code gives it, times the height factor */
const roadZ = k => `(() => { const R = RV.S.R, i = RV.S.i, t = RV.S.ds.trk; return RV.track.point(t, R.s[i], R.tp[i] * t.hw)[2] * ${k}; })()`;

(async () => {
  const p = await open('tab=pm&pause&run=v1.31&cmp=v1.30', { view: 'detailed' });
  await p.until('RV.S.ds && RV.S.R && RV.S.CM.length === 1'); await p.sleep(400);
  ok('the switch is over the map, 3D is off, and the library has not been fetched', (await p.ev("document.querySelectorAll('#v3bar .seg button').length")) === 2 && !(await p.ev('RV.view3d.isOn()')) && !(await p.ev(three)));
  await p.ev('RV.play.go(RV.idxAtD(RV.S.R, 2380))');                       /* the climb to the Corkscrew */
  await p.ev("document.querySelector('#v3bar .seg button[data-v=\"3d\"]').click()");
  await p.until('RV.view3d.isOn()', 20000); await p.sleep(1200);
  let s = await p.ev(st);
  await p.shot('phase18-orbit');
  ok('3D is on: the library was fetched, the track is drawn, two cars', (await p.ev(three)) && s.triangles > 5000 && s.cars === 2, { triangles: s.triangles, calls: s.calls, cars: s.cars });
  let z = await p.ev(roadZ(1));
  ok('the car stands on the road surface, at true scale to begin with', s.k === 1 && Math.abs(s.car[2] - z) < 0.3 && z > 30, [s.car[2], z]);
  ok('the car leans with the road (its "up" is close to vertical, not exactly)', s.up[2] > 0.9 && s.up[2] < 0.99999, s.up);
  ok('the 2D canvas is hidden and the panels are still there', (await p.ev("getComputedStyle(document.getElementById('c')).visibility")) === 'hidden' && (await p.ev("document.getElementById('win-hud').getClientRects().length")) > 0);

  /* the mouse turns and zooms the orbit camera */
  const e0 = s.eye;
  await p.mouse('mousePressed', 700, 500); await p.mouse('mouseMoved', 820, 440); await p.mouse('mouseReleased', 820, 440); await p.sleep(200);
  await p.S('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 500, deltaX: 0, deltaY: -600 }); await p.sleep(300);
  s = await p.ev(st);
  ok('dragging and the wheel move the orbit camera', Math.hypot(s.eye[0] - e0[0], s.eye[1] - e0[1], s.eye[2] - e0[2]) > 50, [e0.map(Math.round), s.eye.map(Math.round)]);

  /* chase: behind the car and close to it */
  await p.ev("document.querySelector('#v3cam button[data-v=\"chase\"]').click()"); await p.sleep(900);
  s = await p.ev(st);
  await p.shot('phase18-chase');
  let d = Math.hypot(s.eye[0] - s.car[0], s.eye[1] - s.car[1], s.eye[2] - s.car[2]);
  ok('chase: the camera is 8 to 16 m from the car and above it', s.cam === 'chase' && d > 8 && d < 16 && s.eye[2] > s.car[2] + 2, d);

  /* relative: the offset the reader sets; the cockpit preset */
  await p.ev("document.querySelector('#v3cam button[data-v=\"rel\"]').click()"); await p.sleep(400);
  ok('relative: three sliders, "Look at the car", Cockpit and Reset', (await p.ev("document.querySelectorAll('.v3rel input[type=range]').length")) === 3 && (await p.ev("!!document.getElementById('v3look') && !!document.getElementById('v3cock') && !!document.getElementById('v3back')")));
  await p.ev("(() => { const e = document.getElementById('v3r2'); e.value = 20; e.oninput({ target: e }); })()"); await p.sleep(400);
  s = await p.ev(st);
  await p.shot('phase18-relative');
  ok('relative: "Up 20 m" puts the camera about 20 m above the car', Math.abs(s.eye[2] - s.car[2] - 20) < 2.5, s.eye[2] - s.car[2]);
  await p.ev("document.getElementById('v3cock').click()"); await p.sleep(500);
  s = await p.ev(st);
  await p.shot('phase18-cockpit');
  d = Math.hypot(s.eye[0] - s.car[0], s.eye[1] - s.car[1], s.eye[2] - s.car[2]);
  ok('cockpit: the camera is in the car', d < 1.6, d);

  /* the replay moves the car; the height factor moves the road */
  const c0 = s.car;
  await p.ev('RV.play.set(true)'); await p.sleep(1200); await p.ev('RV.play.set(false)'); await p.sleep(200);
  s = await p.ev(st);
  ok('playing moves the car', Math.hypot(s.car[0] - c0[0], s.car[1] - c0[1]) > 10, Math.hypot(s.car[0] - c0[0], s.car[1] - c0[1]));
  await p.ev("(() => { const e = document.getElementById('v3k'); e.value = 3; e.oninput({ target: e }); })()"); await p.sleep(500);
  s = await p.ev(st); z = await p.ev(roadZ(3));
  ok('height x3: the road and the car are three times as high', Math.abs(s.car[2] - z) < 0.3, [s.car[2], z]);

  /* a dark theme: the scene takes its colours */
  await p.ev("RV.prefs.theme = 'dark'; RV.theme.apply ? RV.theme.apply() : (RV.applyTheme && RV.applyTheme())"); await p.sleep(600);
  await p.ev("document.querySelector('#v3cam button[data-v=\"orbit\"]').click()"); await p.sleep(600);
  await p.shot('phase18-dark');

  /* back to 2D: the map as it was */
  await p.ev("document.querySelector('#v3bar .seg button[data-v=\"2d\"]').click()"); await p.sleep(400);
  ok('2D again: the 2D canvas shows, the 3D one is hidden, the camera controls are gone', (await p.ev("getComputedStyle(document.getElementById('c')).visibility")) === 'visible' && (await p.ev("document.getElementById('c3').hidden")) && !(await p.ev("!!document.getElementById('v3cam')")));
  await p.shot('phase18-2d');
  ok('no script error', p.errors.length === 0, p.errors);
  await p.close();
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
  process.exit(bad ? 1 : 0);
})();
