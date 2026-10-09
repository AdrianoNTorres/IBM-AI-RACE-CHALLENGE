/* After a data update from main: the newest versions are listed, each has its recording and its plain-language
   entry (docs/CHANGELOG-simple.md, which the basic view shows), and the newest one replays.
   node newdata.js v1.28 1:06 */
const { open } = require('./h.js');
(async () => {
  const want = process.argv[2] || '', lap = process.argv[3] || '';
  const p = await open('tab=pv', { view: 'detailed' });
  await p.until('RV.S.ds && RV.S.R');
  const info = await p.ev(`(() => { const ds = RV.S.ds, ids = Object.keys(ds.byId);
    const tail = ids.filter(i => /^v1\\.(0[6-9]|[1-9]\\d)/.test(i)).map(i => i + (ds.byId[i].file ? '' : ' (no file)'));
    return { n: ids.length, best: ds.bestId, tail: tail.join(' '), shown: RV.S.R && RV.S.R.id,
      noPlain: ds.hasSimple ? ids.filter(i => !ds.byId[i].what).join(' ') : 'no simplified changelog' }; })()`);
  console.log(JSON.stringify(info, null, 1));
  const tiles = await p.ev("document.querySelector('.tiles').innerText");
  console.log('tiles:', tiles.replace(/\s+/g, ' '));
  await p.shot('newdata-versions');
  const q = await open('tab=pm&pause&run=' + want, { view: 'detailed' });
  await q.until('RV.S.ds && RV.S.R');
  console.log('replay of', want, ':', (await q.ev("document.getElementById('hud').innerText")).replace(/\s+/g, ' ').slice(0, 300));
  await q.shot('newdata-replay');
  const errs = p.errors.concat(q.errors);
  const ok = info.tail.includes(want) && !info.tail.includes('no file') && info.noPlain === '' && (!lap || tiles.includes(lap)) && !errs.length;
  console.log(errs.length ? errs : 'no script errors', ok ? 'PASS' : 'FAIL');
  await p.close(); await q.close();
  process.exit(ok ? 0 : 1);
})();
