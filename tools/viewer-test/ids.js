/* Lists the ids and headings of a page's parts, to find what a tutorial step can point at.
   node ids.js [basic|detailed] */
const { open } = require('./h.js');
(async () => {
  const view = process.argv[2] || 'detailed';
  const dump = `(sel => { const r = document.querySelector(sel); if (!r) return sel + ': none';
    return sel + ': ' + [...r.querySelectorAll('[id],h2,h3,h4,summary,.seg')].filter(e => e.getClientRects().length).map(e =>
      (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ').join('.') : '')) + (/^H\\d|SUMMARY/.test(e.tagName) ? '"' + e.innerText.slice(0, 28) + '"' : '')).join(' | '); })`;
  for (const [hash, sels] of [['tab=pv', ['#vmain', '#vside']], ['tab=pm&pause', ['#side', '#overlay', '#mapwrap']], ['tab=pt', ['#pt']], ['tab=ps', ['#ps']]]) {
    const p = await open(hash, { view });
    await p.until('RV.S.ds && RV.S.R'); await p.sleep(400);
    for (const s of sels) console.log((await p.ev(dump + '(' + JSON.stringify(s) + ')')).slice(0, 2600), '\n');
    await p.close();
  }
})();
