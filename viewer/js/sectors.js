/* Run viewer: the sector table. One table, shown on the Track tab (side panel, Sectors) and on the Versions tab:
   the sector times of every version whose recording has been opened, with the difference to the fastest lap in
   the table. It can be sorted by any column, and versions can be taken out of it. Detailed view only. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, esc = RV.esc;

  S.secSort = { k: 'lap', dir: 1 };     /* column the table is sorted by: ver, s0, s1, s2 or lap */
  S.secHidden = {};                     /* ids of the versions taken out of the table */

  const lapOf = v => (v.sum && v.sum.lap != null ? v.sum.lap : v.lap);
  /* versions (and other recordings) that have been opened and have all three sector times; a recording that was
     only read by "Load all versions" (v.bulk) is not listed until it is selected */
  function opened() { return S.ds.versions.concat(S.ds.extras).filter(v => !v.bulk && v.sec && v.sec.every(x => x != null) && lapOf(v) != null); }
  function shown() { return opened().filter(v => !S.secHidden[v.id]); }

  /* The table. compact: the narrow form for the Track tab's side panel. */
  function table(compact) {
    const all = opened(), rows = shown(), nHidden = all.length - rows.length;
    const back = nHidden ? '<p class="note sec-back">' + nHidden + ' removed from this table. <button class="link" data-secrestore="1">Show all again</button></p>' : '';
    if (!rows.length) return '<p class="note">' + (all.length ? 'Every version has been removed from this table.' : 'No recording with sector times has been opened yet.') + '</p>' + back;
    const order = {};
    S.ds.versions.concat(S.ds.extras).forEach((v, k) => { order[v.id] = k; });
    const ref = rows.reduce((a, b) => (lapOf(b) < lapOf(a) ? b : a));              /* the fastest lap in the table */
    const best = [0, 1, 2].map(k => Math.min(...rows.map(v => v.sec[k])));
    const key = { ver: v => order[v.id], s0: v => v.sec[0], s1: v => v.sec[1], s2: v => v.sec[2], lap: lapOf }[S.secSort.k] || lapOf;
    const sorted = rows.slice().sort((a, b) => (key(a) - key(b)) * S.secSort.dir || order[a.id] - order[b.id]);
    const th = (k, label, l) => {
      const on = S.secSort.k === k;
      return '<th class="' + (l ? 'l' : '') + '" aria-sort="' + (on ? (S.secSort.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button class="sortb' + (on ? ' on' : '') + '" data-secsort="' + k + '" title="Sort by this column">' + label +
        '<span class="arr">' + (on ? (S.secSort.dir > 0 ? '↑' : '↓') : '↑↓') + '</span></button></th>';
    };
    const delta = d => '<small>' + RV.secDelta(d) + '</small>';
    let h = '<div class="tablewrap"><table class="sectab' + (compact ? ' compact' : '') + '"><thead><tr>' + th('ver', 'Version', 1) + th('s0', 'S1') + th('s1', 'S2') + th('s2', 'S3') + th('lap', 'Lap') + '<th></th></tr></thead><tbody>';
    for (const v of sorted) {
      const isRef = v === ref;
      h += '<tr class="' + (isRef ? 'ref' : '') + '"><td class="l">' + (S.sel.includes(v.id) ? '<i class="sw" style="background:' + RV.col(v.id) + '"></i>' : '') + '<b>' + esc(v.id) + '</b>' + (isRef ? '<small>fastest lap</small>' : '') + '</td>' +
        [0, 1, 2].map(k => '<td class="num"><span class="' + (Math.abs(v.sec[k] - best[k]) < 0.001 ? 'faster' : v.sec[k] - best[k] > 0.5 ? 'slower' : '') + '">' + v.sec[k].toFixed(3) + '</span>' +
          (isRef ? '<small>&nbsp;</small>' : delta(v.sec[k] - ref.sec[k])) + '</td>').join('') +
        '<td class="num"><span>' + RV.fmtLap(lapOf(v)) + '</span>' + (isRef ? '<small>&nbsp;</small>' : delta(lapOf(v) - lapOf(ref))) + '</td>' +
        '<td><button class="rm" data-secrm="' + esc(v.id) + '" aria-label="Remove ' + esc(v.id) + ' from this table" title="Remove ' + esc(v.id) + ' from this table">&times;</button></td></tr>';
    }
    h += '</tbody></table></div>';
    if (rows.length >= 2) {
      const who = [0, 1, 2].map(k => rows.reduce((a, b) => (b.sec[k] < a.sec[k] ? b : a)));
      h += '<p class="sec-theo"><span>Best theoretical</span><b class="num">' + RV.fmtLap(who.reduce((s, b, k) => s + b.sec[k], 0)) + '</b><small>' + who.map((b, k) => 'S' + (k + 1) + ' ' + esc(b.id)).join(', ') + '</small></p>';
    }
    return h + back;
  }
  const NOTE = 'Times in seconds; the small figures are the difference to the fastest lap in the table. The best time of each sector is highlighted. Click a heading to sort, × to take a version out.';

  /* connects the table's buttons inside a container; both places are redrawn after a change */
  function wire(box) {
    const again = () => { RV.versions.render(); RV.map.buildSide(); };
    box.querySelectorAll('[data-secsort]').forEach(b => { b.onclick = () => { const k = b.dataset.secsort; S.secSort = { k: k, dir: S.secSort.k === k ? -S.secSort.dir : 1 }; again(); }; });
    box.querySelectorAll('[data-secrm]').forEach(b => { b.onclick = () => { S.secHidden[b.dataset.secrm] = true; again(); }; });
    box.querySelectorAll('[data-secrestore]').forEach(b => { b.onclick = () => { S.secHidden = {}; again(); }; });
  }

  RV.sectors = { table: table, wire: wire, opened: opened, shown: shown, NOTE: NOTE };
})();
