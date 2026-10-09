/* Run viewer: the one place that decides whether a version or a recording may be entered by hand or imported.
   Every check returns { level, blocks, warns }:
     valid    nothing is missing;
     warning  usable but incomplete: warns lists {what, affects} (what is missing, which features that touches);
              the reader has to confirm before it is entered;
     blocked  it would not work or would break a page: blocks lists the reasons; it is never entered.
   The format rules themselves are those of js/data.js (parseChangelog, buildRun, REQUIRED, FIT_TOL): they are
   called here, not restated. Nothing in this file throws: whatever cannot be parsed comes back as blocked.

   To change what counts as what: OPTIONAL (columns whose absence is a warning) and the block() / warn() calls
   in recording() and version(). */
(function () {
  'use strict';
  const RV = globalThis.RV;

  /* the four results, and how each is written in a changelog's Decision field (data.js reads kept from the
     tick and an enabling change only from a Decision that starts with it) */
  const RESULTS = [
    { id: 'kept', label: 'Kept', hint: 'It stays in the driver.', mark: '✅ Kept', enabling: false, glyph: '✓' },
    { id: 'kept-enabling', label: 'Kept, enabling change', hint: 'Kept for what it makes possible, not for its own lap time.', mark: '✅ Kept', enabling: true, glyph: '✓' },
    { id: 'rej-enabling', label: 'Enabling change, rejected', hint: 'An enabling change that was rejected after all.', mark: '❌ Rejected', enabling: true, glyph: '✕' },
    { id: 'rejected', label: 'Rejected', hint: 'Slower, damaged or off the track.', mark: '❌ Rejected', enabling: false, glyph: '✕' },
  ];
  /* optional columns of a run CSV whose absence is worth a warning */
  const OPTIONAL = [
    { cols: ['track0'], what: 'The recording has no sensor columns (track0 to track18)', affects: 'The run replays without sensor beams.' },
    { cols: ['allowed'], what: 'The recording has no column "allowed"', affects: 'The planned-speed line on the speed chart is missing.' },
  ];
  /* columns of a table CSV (one row per version), by their header without case, spaces or punctuation */
  const TABLE_COLS = {
    version: 'id', title: 'title', result: 'result', laptime: 'lap', lap: 'lap', topspeed: 'top', minspeed: 'slow', slowestcorner: 'slow', damage: 'damage',
    whatchanged: 'what', why: 'why', prediction: 'prediction', observed: 'observed', decision: 'decision', learned: 'learned', recording: 'file',
  };
  const TABLE_HEAD = ['version', 'title', 'result', 'lap time', 'top speed', 'min speed', 'damage', 'what changed', 'why', 'prediction', 'observed', 'decision', 'learned', 'recording'];

  const fresh = () => ({ level: 'valid', blocks: [], warns: [] });
  const block = (o, msg) => { o.blocks.push(msg); o.level = 'blocked'; return o; };
  const warn = (o, what, affects) => { o.warns.push({ what: what, affects: affects }); if (o.level === 'valid') o.level = 'warning'; return o; };
  const why = e => (e && e.message ? e.message : String(e));

  /* ---------- version names ---------- */
  const normId = s => { s = String(s == null ? '' : s).trim(); return /^\d/.test(s) ? 'v' + s : s.replace(/^V/, 'v'); };
  /* the numbers of a name such as v1.06.1, or null if it is not one */
  const parseId = s => (/^v\d+(\.\d+)*$/.test(s) ? s.slice(1).split('.').map(Number) : null);
  /* < 0 if a is older than b; v1.06.1 is newer than v1.06 */
  function cmpId(a, b) {
    const x = parseId(a) || [], y = parseId(b) || [];
    for (let k = 0; k < Math.max(x.length, y.length); k++) { const d = (x[k] === undefined ? -1 : x[k]) - (y[k] === undefined ? -1 : y[k]); if (d) return d; }
    return 0;
  }
  function latestOf(ids) { let best = null; for (const id of ids) if (parseId(id) && (best == null || cmpId(id, best) > 0)) best = id; return best; }
  /* the next name after one: its last number plus one, as wide as it was (v1.06 gives v1.07) */
  function nextId(id) {
    const p = parseId(id);
    if (!p) return 'v0.1';
    const parts = id.slice(1).split('.'), last = parts[parts.length - 1];
    parts[parts.length - 1] = String(+last + 1).padStart(last.length, '0');
    return 'v' + parts.join('.');
  }

  /* ---------- single values ---------- */
  /* seconds from 1:13.14, 1:13:14 or 73.14; null if empty, NaN if it cannot be read */
  function parseLap(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    let m = /^(\d+):(\d{1,2})[.:](\d{1,3})$/.exec(s);
    if (m) return +m[1] * 60 + +m[2] + +m[3] / Math.pow(10, m[3].length);
    m = /^(\d+):(\d{1,2})$/.exec(s);
    if (m) return +m[1] * 60 + +m[2];
    return /^\d+(\.\d+)?$/.test(s) ? +s : NaN;
  }
  /* the way a changelog writes it: m:ss.cc */
  function lapText(sec) {
    if (sec == null) return '';
    const c = Math.round(sec * 100), m = Math.floor(c / 6000), r = c - m * 6000;
    return m + ':' + String(Math.floor(r / 100)).padStart(2, '0') + '.' + String(r % 100).padStart(2, '0');
  }
  /* whole km/h from "286" or "286 km/h"; null if empty, NaN if it cannot be read */
  function parseKmh(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    const m = /^(\d+(?:\.\d+)?)\s*(?:km\/h)?$/i.exec(s);
    return m ? Math.trunc(+m[1]) : NaN;
  }
  function normResult(s) {
    s = String(s == null ? '' : s).trim().toLowerCase();
    if (RESULTS.some(r => r.id === s)) return s;
    const en = s.indexOf('enabl') >= 0, rej = s.indexOf('rej') >= 0 || s.indexOf('❌') >= 0, kept = s.indexOf('kept') >= 0 || s.indexOf('keep') >= 0 || s.indexOf('✅') >= 0;
    if (en) return rej ? 'rej-enabling' : 'kept-enabling';
    return rej ? 'rejected' : kept ? 'kept' : '';
  }

  /* ---------- a recording (the text of a run CSV) ---------- */
  /* trk: the track in use, or null if none could be loaded. On top of level, blocks and warns the result has
     sum (lap, top, slow, damage, complete ...) when the recording can be used. */
  function recording(text, trk) {
    const o = fresh();
    o.sum = null;
    try {
      if (typeof text !== 'string' || !text.trim()) return block(o, 'The file is empty.');
      let run;
      try { run = RV.data.buildRun(text, 'check', trk || null); }
      catch (e) { return block(o, e instanceof RV.RVError ? e.message : 'The file could not be read as a run CSV (' + why(e) + ').'); }
      if (trk && !run.fits) return block(o, 'The recording does not fit the track: its longest distFromStart is ' + run.maxS.toFixed(0) + ' m and the track is ' + trk.total.toFixed(0) +
        ' m long (more than ' + RV.data.FIT_TOL + ' m apart). It was driven on another track.');
      o.sum = run.sum;
      if (!trk) warn(o, 'No track map is loaded', 'The recording could not be checked against the track and cannot be drawn on the map.');
      if (!run.sum.complete) warn(o, 'The recording is not a complete lap: it stops at ' + RV.fmtInt(run.sum.stoppedAt) + ' m',
        'It has no lap time of its own and no full sector times; the analysis against the fastest lap covers only the part driven.');
      const header = text.replace(/^﻿/, '').split('\n', 1)[0].split(',').map(s => s.trim());
      for (const c of OPTIONAL) if (!c.cols.every(x => header.indexOf(x) >= 0)) warn(o, c.what, c.affects);
    } catch (e) { block(o, 'The recording could not be checked (' + why(e) + ').'); }
    return o;
  }

  /* ---------- a version ---------- */
  /* d: { id, title, result, lap, top, slow, damage, what, ... } as typed (texts), and rec: the result of
     recording() for its run CSV, or null when it has none.
     ctx: { ids: Set of the names in use, latest: the newest of them, editing: true when d is an entry being changed
     (its name is then not checked) }.
     On top of level, blocks and warns the result has id (the name as it will be stored) and fill: the lap time
     (seconds), top speed, slowest corner and damage that will be stored: what was typed, else what the recording says. */
  function version(d, ctx) {
    const o = fresh();
    o.fill = { lap: null, top: null, slow: null, damage: '' };
    o.id = '';
    try {
      d = d || {}; ctx = ctx || {};
      const id = o.id = normId(d.id), rec = d.rec || null, sum = rec && rec.sum ? rec.sum : null;
      if (!ctx.editing) {
        if (!id) block(o, 'The version needs a name, for example ' + (ctx.latest ? nextId(ctx.latest) : 'v0.1') + '.');
        else if (!parseId(id)) block(o, '“' + id + '” is not a version name. Write v and numbers separated by dots, for example v1.07 or v1.06.1.');
        else if (ctx.ids && ctx.ids.has(id)) block(o, id + ' exists already. An entered version cannot replace one.');
        else if (ctx.latest && cmpId(id, ctx.latest) <= 0) block(o, id + ' is not newer than ' + ctx.latest + ', the latest version. Any higher name is fine, for example ' + ctx.latest + '.1 or ' + nextId(ctx.latest) + '.');
      }
      if (!String(d.title || '').trim()) block(o, 'The version needs a title: a few words on what it changed.');
      if (!RESULTS.some(r => r.id === d.result)) block(o, 'Choose a result: kept, kept as an enabling change, enabling change rejected, or rejected.');
      if (rec && rec.level === 'blocked') for (const b of rec.blocks) block(o, 'Recording: ' + b);

      const lap = parseLap(d.lap), top = parseKmh(d.top), slow = parseKmh(d.slow);
      if (lap !== null && !(lap > 0)) block(o, 'The lap time “' + String(d.lap).trim() + '” cannot be read. Write m:ss.cc, for example 1:13.14.');
      if (top !== null && isNaN(top)) block(o, 'The top speed “' + String(d.top).trim() + '” is not a number of km/h.');
      if (slow !== null && isNaN(slow)) block(o, 'The slowest corner “' + String(d.slow).trim() + '” is not a number of km/h.');
      o.fill.lap = lap > 0 ? +lap.toFixed(2) : (sum && sum.lap != null ? +sum.lap.toFixed(2) : null);
      o.fill.top = top > 0 ? top : (sum ? Math.trunc(sum.top) : null);
      o.fill.slow = slow > 0 ? slow : (sum && sum.slow ? Math.round(sum.slow) : null);   /* the changelogs round the slowest corner and cut the top speed */
      o.fill.damage = String(d.damage || '').trim() || (sum ? String(sum.damage) : '');

      if (!rec) warn(o, 'No recording', 'The version is listed with its numbers, but it cannot be replayed on the track or compared, and it has no telemetry, no sector times and no analysis.');
      else if (rec.level !== 'blocked') {
        for (const w of rec.warns) warn(o, w.what, w.affects);
        if (lap > 0 && sum && sum.lap != null && Math.abs(lap - sum.lap) > 0.05)
          warn(o, 'The lap time typed (' + lapText(lap) + ') differs from the recording’s (' + lapText(sum.lap) + ')', 'The list and the chart show the typed time; the replay and the sector times follow the recording.');
      }
      if (o.fill.lap == null) warn(o, 'No lap time', 'The version is left out of the lap-time chart, the rankings and the best-lap figures.');
      const empty = [];
      if (o.fill.top == null) empty.push('top speed');
      if (o.fill.slow == null) empty.push('slowest corner');
      if (!String(d.what || '').trim()) empty.push('what changed');
      if (empty.length) warn(o, 'Not filled in: ' + empty.join(', '), 'Those columns and paragraphs of the details stay empty for this version.');
    } catch (e) { block(o, 'The version could not be checked (' + why(e) + ').'); }
    return o;
  }

  /* ---------- a table CSV: one row per version ---------- */
  /* rows of cells; quoted cells may hold the separator, line breaks and "" for a quote */
  function csvRows(text, sep) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  const headKey = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const firstLine = text => String(text || '').replace(/^﻿/, '').split('\n', 1)[0];
  /* a table of versions (it has a column "version") and not a recording */
  function isTable(text) {
    try { const h = firstLine(text).split(/[,;\t]/).map(headKey); return h.indexOf('version') >= 0 && h.indexOf('curlaptime') < 0; } catch (e) { return false; }
  }
  /* { level, blocks, rows }: rows are objects with the fields of version()'s d, and file (the recording named) */
  function table(text) {
    const o = fresh();
    o.rows = [];
    try {
      text = String(text || '').replace(/^﻿/, '');
      const h0 = firstLine(text), sep = h0.indexOf(',') < 0 && h0.indexOf(';') >= 0 ? ';' : h0.indexOf(',') < 0 && h0.indexOf('\t') >= 0 ? '\t' : ',';
      const rows = csvRows(text, sep);
      if (!rows.length) return block(o, 'The table is empty.');
      const fields = rows[0].map(c => TABLE_COLS[headKey(c)] || null);
      if (fields.indexOf('id') < 0) return block(o, 'The table has no column “version”. Its first row must name the columns.');
      if (rows.length < 2) return block(o, 'The table has a header row but no versions under it.');
      for (const r of rows.slice(1)) {
        const d = {};
        fields.forEach((f, k) => { if (f) d[f] = String(r[k] == null ? '' : r[k]).replace(/\s+/g, ' ').trim(); });
        d.result = normResult(d.result);
        d.file = (d.file || '').replace(/^.*[\\/]/, '');
        o.rows.push(d);
      }
    } catch (e) { o.rows = []; block(o, 'The table could not be read (' + why(e) + ').'); }
    return o;
  }
  const cell = s => { s = String(s == null ? '' : s); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const tableText = rows => [TABLE_HEAD].concat(rows).map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
  const template = () => tableText([['v9.01', 'Brake later into the hairpin', 'kept', '1:12.98', '287 km/h', '58 km/h', '0', 'What the version changed', 'Why it was tried', '', 'What the run showed', 'Faster, no damage', 'What was learned', 'run_20270101_120000.csv']]);

  RV.validate = {
    RESULTS: RESULTS, OPTIONAL: OPTIONAL, TABLE_HEAD: TABLE_HEAD,
    recording: recording, version: version, table: table, isTable: isTable, tableText: tableText, template: template,
    normId: normId, parseId: parseId, cmpId: cmpId, latestOf: latestOf, nextId: nextId, parseLap: parseLap, lapText: lapText, parseKmh: parseKmh, normResult: normResult,
  };
})();
