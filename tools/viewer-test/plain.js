/* The basic view shows the plain-language entry of a version (docs/CHANGELOG-simple.md), the detailed view the
   technical one. Prints both titles and the first lines of the panel for the versions named, and fails when a
   version's two titles are the same.   node plain.js v1.31 v1.30 v1.07 */
const { open } = require('./h.js');
(async () => {
  const ids = process.argv.slice(2);
  let bad = 0;
  const out = {};
  for (const view of ['basic', 'detailed']) {
    const p = await open('tab=pv&run=' + ids[0], { view });
    await p.until('RV.S.ds && RV.S.R'); await p.sleep(300);
    for (const id of ids) {
      await p.ev(`new Promise(r => RV.sel.only(${JSON.stringify(id)}, r))`); await p.sleep(250);
      const row = await p.ev(`(() => { const tr = document.querySelector('#vt tr[data-id="${id}"]'); return tr ? tr.innerText.replace(/\\s+/g, ' ').slice(0, 110) : 'no row'; })()`);
      const side = await p.ev("document.getElementById('vside').innerText.replace(/\\s+/g, ' ').slice(0, 230)");
      (out[id] = out[id] || {})[view] = { row, side };
    }
    if (view === 'basic') await p.shot('plain-basic');
    await p.close();
  }
  for (const id of ids) {
    const b = out[id].basic, d = out[id].detailed;
    const same = b.row.slice(0, 60) === d.row.slice(0, 60);
    if (same) bad++;
    console.log((same ? 'FAIL ' : 'PASS ') + id + '\n  basic:    ' + b.row + '\n  detailed: ' + d.row + '\n  basic panel:    ' + b.side + '\n  detailed panel: ' + d.side);
  }
  process.exit(bad ? 1 : 0);
})();
