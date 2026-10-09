/* Phase 18.2 and 18.3: the Track page in 3D, and the advanced view. The switch is there and 3D is off when a page opens; the 3D library is not
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
  ok('the switch is over the map, 3D is off, and the library has not been fetched', (await p.ev("document.querySelectorAll('#v3bar .seg button').length")) === 3 && !(await p.ev('RV.view3d.isOn()')) && !(await p.ev(three)));
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

  /* 18.3.2: the car is a model from Kenney's kit, in the run's colour, with four wheels; the reader can pick another */
  await p.until('RV.view3d.state().modelOn', 20000); await p.sleep(300);
  s = await p.ev(st);
  const runCol = await p.ev("(() => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = RV.col(RV.S.sel[0]); c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; })()");
  ok('the car is the Formula model, with four wheels, and its paint was changed', s.model === 'race' && s.modelOn && s.wheels === 4 && !!s.paint, { model: s.model, wheels: s.wheels, paint: s.paint, run: runCol });
  ok('six cars to pick from', (await p.ev("document.querySelectorAll('#v3car option').length")) === 6);
  await p.ev("(() => { const e = document.getElementById('v3car'); e.value = 'sedan-sports'; e.onchange({ target: e }); })()"); await p.until("RV.view3d.state().model === 'sedan-sports' && RV.view3d.state().modelOn", 20000); await p.sleep(500);
  await p.ev("document.querySelector('#v3cam button[data-v=\"chase\"]').click()"); await p.sleep(700);
  await p.shot('phase18-car-sedan');
  await p.ev("(() => { const e = document.getElementById('v3car'); e.value = 'blocks'; e.onchange({ target: e }); })()"); await p.sleep(500);
  ok('"Blocks" is the simple car again', !(await p.ev(st)).modelOn);
  await p.ev("(() => { const e = document.getElementById('v3car'); e.value = 'race'; e.onchange({ target: e }); })()"); await p.until('RV.view3d.state().modelOn', 20000); await p.sleep(500);
  await p.shot('phase18-car-formula');
  await p.ev("document.querySelector('#v3cam button[data-v=\"orbit\"]').click()"); await p.sleep(400);
  s = await p.ev(st);
  /* 18.2.1: what lies beside the road comes from the track file: kerbs, grass or sand, walls and fences */
  const vg = await p.ev("(() => { const t = RV.S.ds.trk, at = s => RV.track.verge(t, s), k = {}; for (let s = 0; s < t.total; s += 5) for (const q of [at(s).L, at(s).R]) { k[q.bs] = 1; k[q.surf] = 1; k['bar:' + q.ks] = 1; } return { kinds: Object.keys(k).sort().join(' '), start: at(10), cork: at(2490) }; })()");
  console.log('  beside the road:', vg.kinds, '| at 10 m', JSON.stringify(vg.start), '| at 2,490 m', JSON.stringify(vg.cork));
  ok('the track file gives kerbs, walls, fences and sand as well as the plain sides', /curb/.test(vg.kinds) && /wall/.test(vg.kinds) && /bar:fence/.test(vg.kinds) && /sand/.test(vg.kinds) && vg.start.L.bs === 'wall' && vg.start.L.bh === 1, vg.kinds);
  ok('and they are drawn: far more faces than the bare road', s.triangles > 20000, s.triangles);
  ok('the kerbs are red and white by turns', s.kerbs[0] > 100 && s.kerbs[1] > 100 && Math.abs(s.kerbs[0] - s.kerbs[1]) < s.kerbs[0] * 0.5, s.kerbs);
  /* the mouse turns and zooms the orbit camera */
  const e0 = s.eye;
  /* dragging up lifts the camera (user, 2026-10-08) */
  await p.mouse('mousePressed', 700, 500); await p.mouse('mouseMoved', 700, 440); await p.mouse('mouseReleased', 700, 440); await p.sleep(200);
  const eUp = (await p.ev(st)).eye;
  ok('dragging up lifts the orbit camera', eUp[2] > e0[2] + 20, [Math.round(e0[2]), Math.round(eUp[2])]);
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
  ok('cockpit: the camera is on the car, above the driver\'s head', d > 1.2 && d < 2.2 && s.eye[2] > s.car[2] + 1.3, d);
  /* 18.3.3: a closed car gets a hood camera, ahead of the car\'s middle; the open-wheel car gets its own back */
  const ahead = q => (q.eye[0] - q.car[0]) * q.fwd[0] + (q.eye[1] - q.car[1]) * q.fwd[1];
  const a0 = ahead(s);
  await p.ev("(() => { const e = document.getElementById('v3car'); e.value = 'sedan-sports'; e.onchange({ target: e }); })()"); await p.until("RV.view3d.state().model === 'sedan-sports' && RV.view3d.state().modelOn", 20000); await p.sleep(500);
  s = await p.ev(st);
  await p.shot('phase18-hood');
  ok('the sedan: the camera moves to the hood, ahead of where the onboard one was', a0 < -0.5 && ahead(s) > 0.5, [a0, ahead(s)]);
  await p.ev("(() => { const e = document.getElementById('v3car'); e.value = 'race'; e.onchange({ target: e }); })()"); await p.until("RV.view3d.state().model === 'race' && RV.view3d.state().modelOn", 20000); await p.sleep(500);
  s = await p.ev(st);
  await p.shot('phase18-onboard');

  /* the replay moves the car; the height factor moves the road */
  const c0 = s.car;
  await p.ev('RV.play.set(true)'); await p.sleep(1200); await p.ev('RV.play.set(false)'); await p.sleep(200);
  s = await p.ev(st);
  ok('playing moves the car', Math.hypot(s.car[0] - c0[0], s.car[1] - c0[1]) > 10, Math.hypot(s.car[0] - c0[0], s.car[1] - c0[1]));
  await p.ev("(() => { const e = document.getElementById('v3k'); e.value = 3; e.oninput({ target: e }); })()"); await p.sleep(500);
  s = await p.ev(st); z = await p.ev(roadZ(3));
  ok('height x3: the road and the car are three times as high', Math.abs(s.car[2] - z) < 0.3, [s.car[2], z]);

  /* 18.3: the advanced view: the driver's seat, the sensors and the planned speed on the road; the wheels steer */
  await p.ev("document.querySelector('#v3cam button[data-v=\"orbit\"]').click()"); await p.sleep(200);
  await p.ev('RV.play.go(RV.idxAtD(RV.S.R, 2440))'); await p.sleep(200);
  await p.ev("document.querySelector('#v3bar .seg button[data-v=\"adv\"]').click()"); await p.sleep(900);
  s = await p.ev(st);
  await p.shot('phase18-advanced');
  d = Math.hypot(s.eye[0] - s.car[0], s.eye[1] - s.car[1], s.eye[2] - s.car[2]);
  ok('advanced: opens in the cockpit, with sky and haze', s.adv && s.cam === 'rel' && d < 2.2 && s.fog, { cam: s.cam, d: d });
  ok('advanced: the sensors that read something are drawn, and the planned speed lies on the road ahead', s.beams >= 10 && s.beams <= 19 && s.plan > 20, { beams: s.beams, plan: s.plan });
  ok('each sensor is a tube, with a disc where it met the edge', s.tubes === s.beams && s.discs >= 8 && s.discs <= s.tubes, { tubes: s.tubes, discs: s.discs });
  ok('the planned speed covers the next 300 m', s.plan >= 140 && s.plan <= 160, s.plan);
  const want = await p.ev('RV.S.R.st[RV.S.i] * 21 * Math.PI / 180');
  ok('the front wheels are turned as the recording says', Math.abs(s.steer - want) < 0.02 && Math.abs(want) > 0.01, [s.steer, want]);
  await p.ev("document.getElementById('v3sens').click(); document.getElementById('v3plan').click()"); await p.sleep(300);
  s = await p.ev(st);
  ok('both overlays can be switched off', s.beams === 0 && s.plan === 0, [s.beams, s.plan]);
  await p.ev("document.getElementById('v3sens').click(); document.getElementById('v3plan').click()");
  await p.ev("document.querySelector('#v3cam button[data-v=\"chase\"]').click()"); await p.sleep(900);
  await p.shot('phase18-advanced-chase');
  await p.ev("document.querySelector('#v3bar .seg button[data-v=\"3d\"]').click()"); await p.sleep(400);
  s = await p.ev(st);
  ok('plain 3D again: no sensors, no carpet, no haze', !s.adv && s.beams === 0 && s.plan === 0 && !s.fog, s);
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
