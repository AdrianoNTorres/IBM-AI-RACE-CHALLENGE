/* Run viewer: versions entered by hand or imported, kept in this browser.
   The site only reads its source and cannot write to it, so what the reader enters is stored here: in
   IndexedDB, the browser's own database for a site (localStorage is too small: a recording is close to 1 MB).
   Two stores: "versions" (one record per version, see makeRec in js/entry.js) and "csv" (the text of its
   recording, read only when the run is opened). A record belongs to the source it was entered under
   (keyOf(src)), and js/data.js openSource adds the records of a source after its own versions.
   Nothing here leaves the browser. The export writes a zip the reader can put into the repository.
   Where IndexedDB is not available (some private windows) the records live in memory until the page closes. */
(function () {
  'use strict';
  const RV = globalThis.RV, V = RV.validate;

  const DB = 'rv_local';
  let dbp = null, mem = null;
  function db() {
    if (mem) return Promise.reject(new Error('no database'));
    if (!dbp) dbp = new Promise((res, rej) => {
      let rq;
      try { rq = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
      rq.onupgradeneeded = () => { const d = rq.result; d.createObjectStore('versions', { keyPath: 'key' }); d.createObjectStore('csv'); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error || new Error('no database'));
      rq.onblocked = () => rej(new Error('blocked'));
    }).catch(e => { mem = { versions: new Map(), csv: new Map() }; throw e; });
    return dbp;
  }
  /* runs fn(transaction) and resolves with the result of the request fn returns, once the transaction is through */
  function tx(stores, mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(stores, mode);
      let rq;
      try { rq = fn(t); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(rq ? rq.result : undefined);
      t.onerror = t.onabort = () => rej(t.error || new Error('The browser refused to store this.'));
    }));
  }
  const noDb = () => !!mem;

  /* the source a record belongs to: the repository whatever its branch, or the folder by its name */
  const keyOf = src => (src.kind === 'github' ? 'github:' + (src.owner + '/' + src.repo).toLowerCase() : 'local:' + src.name);

  /* the records of one source, oldest version first */
  async function list(srcKey) {
    let all;
    try { all = await tx(['versions'], 'readonly', t => t.objectStore('versions').getAll()); }
    catch (e) { if (!noDb()) throw e; all = Array.from(mem.versions.values()); }
    return (all || []).filter(r => r && r.src === srcKey && r.id).sort((a, b) => V.cmpId(a.id, b.id));
  }
  /* stores a record; csv: the text of its recording, null to remove the stored one, undefined to leave it */
  async function put(rec, csv) {
    try {
      await tx(['versions', 'csv'], 'readwrite', t => {
        if (csv === null) t.objectStore('csv').delete(rec.key); else if (csv !== undefined) t.objectStore('csv').put(csv, rec.key);
        return t.objectStore('versions').put(rec);
      });
      /* ask the browser not to clear this site's data when the disk runs short; it may say no */
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* not available */ }
    } catch (e) {
      if (!noDb()) throw new RV.RVError('store', 'The browser could not store this (' + (e && e.message ? e.message : e) + ').', 'Its storage for this site may be full or switched off.');
      mem.versions.set(rec.key, rec);
      if (csv === null) mem.csv.delete(rec.key); else if (csv !== undefined) mem.csv.set(rec.key, csv);
    }
  }
  async function remove(keys) {
    try { await tx(['versions', 'csv'], 'readwrite', t => { for (const k of keys) { t.objectStore('versions').delete(k); t.objectStore('csv').delete(k); } }); }
    catch (e) { if (!noDb()) throw e; for (const k of keys) { mem.versions.delete(k); mem.csv.delete(k); } }
  }
  /* the text of a record's recording, or null */
  async function csv(key) {
    try { const r = await tx(['csv'], 'readonly', t => t.objectStore('csv').get(key)); return r == null ? null : r; }
    catch (e) { if (!noDb()) throw e; return mem.csv.has(key) ? mem.csv.get(key) : null; }
  }

  /* ---------- a record as a changelog entry ---------- */
  const one = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
  function decisionText(rec) {
    const r = V.RESULTS.find(x => x.id === rec.result) || V.RESULTS[3], why = one(rec.decision);
    return r.mark + ' — ' + (r.enabling ? 'enabling change' + (why ? ': ' + why : '') : (why || 'entered by hand'));
  }
  /* the entry in the format of docs/CHANGELOG.md (Help, Data format): what js/data.js parses, and what the export writes */
  function entryText(rec) {
    const obs = [one(rec.observed), rec.csvName ? 'Telemetry: runs/' + rec.csvName : ''].filter(Boolean).join(' ');
    const rows = [['Version', rec.id], ['What changed', one(rec.what)], ['Why', one(rec.why)], ['Prediction', one(rec.prediction)],
      ['Lap time', V.lapText(rec.lap)], ['Damage', one(rec.damage)], ['Top speed', rec.top != null ? rec.top + ' km/h' : ''], ['Min speed', rec.slow != null ? rec.slow + ' km/h' : ''],
      ['Observed', obs], ['Decision', decisionText(rec)], ['Learned', one(rec.learned)]];
    return '## ' + rec.id + ' — ' + String(rec.title || '').replace(/\s+/g, ' ').trim() + '\n\n| Field | Detail |\n|---|---|\n' + rows.map(r => '| **' + r[0] + '** | ' + r[1] + ' |').join('\n') + '\n';
  }

  /* ---------- export: a zip without compression ---------- */
  let CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  /* files: [{name, text}]; returns a Blob */
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [], now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, name);
      off += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  }
  /* the row of a record in a table CSV (js/validate.js TABLE_HEAD): the zip's versions.csv can be imported again */
  const tableRow = rec => [rec.id, rec.title, rec.result, V.lapText(rec.lap), rec.top != null ? rec.top + ' km/h' : '', rec.slow != null ? rec.slow + ' km/h' : '', rec.damage,
    rec.what, rec.why, rec.prediction, rec.observed, rec.decision, rec.learned, rec.csvName || ''];
  /* the files of an export of some records: the changelog entries, the recordings, a table and a note on what to do */
  async function exportFiles(recs) {
    recs = recs.slice().sort((a, b) => V.cmpId(a.id, b.id));
    const files = [], runs = [];
    for (const r of recs) if (r.csvName) { const text = await csv(r.key); if (text != null) { files.push({ name: 'runs/' + r.csvName, text: text }); runs.push(r.csvName); } }
    files.unshift({ name: 'versions.csv', text: V.tableText(recs.map(tableRow)) });
    files.unshift({ name: 'docs/CHANGELOG-additions.md', text: recs.map(entryText).join('\n---\n\n') });
    files.unshift({
      name: 'README.txt', text: ['Versions exported from the run viewer: ' + recs.map(r => r.id).join(', '), '',
        'To make them part of the repository, so that every visitor and every device sees them:',
        '1. Open docs/CHANGELOG-additions.md and paste its entries at the end of the repository\'s docs/CHANGELOG.md,',
        '   after the last version and before the closing "Last updated" line.',
        runs.length ? '2. Copy the ' + runs.length + ' file' + (runs.length === 1 ? '' : 's') + ' in runs/ into the repository\'s runs/ folder.' : '2. (No recordings in this export.)',
        '3. Commit and push. When the site shows the versions from the repository, delete the copies kept in the browser',
        '   (Versions, Add versions, In this browser).', '',
        'To move them to another browser instead: there, open Versions, Add versions, Import files, and choose',
        'versions.csv together with the files in runs/.', ''].join('\r\n'),
    });
    return files;
  }
  function download(blob, name) {
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  RV.local = {
    keyOf: keyOf, list: list, put: put, remove: remove, csv: csv, entryText: entryText, decisionText: decisionText,
    exportFiles: exportFiles, zip: zip, download: download,
    /* false when the browser gave no database: entries then last only until the page is closed */
    lasting: () => !mem,
  };
})();
