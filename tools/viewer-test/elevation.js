/* Phase 18.1: the height and the banking of the track, as js/track.js builds them from the track file, against
   the driver project's own tool (tools/elevation.py on main, which follows TORCS's track4.cpp). The reference,
   elevation-ref.json, is one row per 10 m: [distance, height m, banking deg]; it is made with
     python tools/viewer-test/elevation-ref.py        (needs main's tools/elevation.py; see that file)
   No browser needed:   node elevation.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..', '..');
const ctx = { globalThis: null, Math, RegExp, parseFloat };
ctx.globalThis = ctx;
vm.createContext(ctx);
ctx.RV = { RVError: class extends Error {} };
vm.runInContext(fs.readFileSync(path.join(root, 'viewer/js/track.js'), 'utf8'), ctx);
const trk = ctx.RV.track.parse(fs.readFileSync(path.join(root, 'viewer/tracks/corkscrew.xml'), 'latin1'));
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'elevation-ref.json'), 'utf8'));
let bad = 0, dz = 0, db = 0, at = 0;
for (const [s, z, bank] of ref.rows) {
  const l = ctx.RV.track.level(trk, s), ez = Math.abs(l[0] - z), eb = Math.abs(l[1] * 180 / Math.PI - bank);
  if (ez > dz) { dz = ez; at = s; }
  db = Math.max(db, eb);
}
const ok = (name, pass, info) => { console.log((pass ? 'PASS ' : 'FAIL ') + name + '   ' + JSON.stringify(info)); if (!pass) bad++; };
ok('the lap is as long as the reference says', Math.abs(trk.total - ref.total) < 0.01, [trk.total, ref.total]);
ok('height within 1 cm of the reference at every 10 m', dz < 0.01, { worst_m: +dz.toFixed(4), at });
ok('banking within 0.01 degrees of the reference', db < 0.01, { worst_deg: +db.toFixed(4) });
ok('the lap closes in height as the reference does', Math.abs(trk.zgap - ref.closure) < 0.01, [+trk.zgap.toFixed(3), ref.closure]);
const b = trk.zbox;
console.log('height ' + b[0].toFixed(1) + ' m (at ' + Math.round(b[2]) + ' m) to ' + b[1].toFixed(1) + ' m (at ' + Math.round(b[3]) + ' m); banking ' +
  (Math.min(...trk.high.map(h => h[1])) * 180 / Math.PI).toFixed(1) + ' to ' + (Math.max(...trk.high.map(h => h[1])) * 180 / Math.PI).toFixed(1) + ' degrees');
const p = ctx.RV.track.point(trk, 2480, 6), c = ctx.RV.track.point(trk, 2480, 0);
console.log('at 2,480 m (the Corkscrew): centre ' + c.map(v => v.toFixed(1)) + ', left edge ' + p.map(v => v.toFixed(1)));
console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
process.exit(bad ? 1 : 0);
