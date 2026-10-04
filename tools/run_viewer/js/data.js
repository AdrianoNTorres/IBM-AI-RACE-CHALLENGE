/* Run viewer: everything that reads data. Changelogs to a version list, a run CSV to a run object,
   and the two kinds of data source (a GitHub repository, a local folder). Nothing here touches the page. */
(function () {
  'use strict';
  const RV = (globalThis.RV = globalThis.RV || {});
  const RVError = RV.RVError;

  const REQUIRED = ['curLapTime', 'lastLapTime', 'distFromStart', 'speedX', 'gear', 'accel', 'brake', 'steer', 'trackPos', 'angle', 'damage'];
  const FIT_TOL = 5;                     /* metres a run's longest distance may differ from the track length */
  /* the 19 track beams, degrees from the car's nose, negative = left */
  RV.TRACK_ANGLES = [-45, -19, -12, -7, -4, -2.5, -1.7, -1, -0.5, 0, 0.5, 1, 1.7, 2.5, 4, 7, 12, 19, 45];

  const rnd = (x, n) => +x.toFixed(n);
  /* nearest whole number, halves to the even one (as Python's round) */
  function roundHalfEven(x) { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }

  /* ---------- changelogs ---------- */

  /* Map of version id to {title, body, f: {field: text}}, from a changelog in the two-column table format. */
  function parseChangelog(text) {
    const out = new Map();
    let cur = null;
    for (const raw of text.replace(/^﻿/, '').split('\n')) {
      const line = raw.replace(/\s+$/, '');
      let m = /^## (v[\d.]+)\s*[—-]\s*(.*)$/.exec(line);
      if (m) {
        if (!out.has(m[1])) out.set(m[1], { title: m[2], body: '', f: {} });
        cur = out.get(m[1]);
        continue;
      }
      if (cur) {
        cur.body += line + '\n';
        m = /^\| \*\*([^*]+)\*\* \| (.*) \|$/.exec(line);
        if (m) cur.f[m[1]] = m[2];
      }
    }
    return out;
  }
  function clean(s) { return (s || '').replace(/^[✅❌]\s*/, '').replace(/`/g, '').replace(/\\\|/g, '|').replace(/\*\*/g, ''); }
  function lapSeconds(s) { const m = /^(\d+):(\d\d)[.:](\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] + +m[3] / 100 : null; }
  function kmh(s) { const m = /^(\d+)\s*km\/h/.exec(s || ''); return m ? +m[1] : null; }

  /* The version list. files: Map of CSV names present in runs/ (name to size), or null when that is not known. */
  function buildVersions(full, simple, files) {
    const versions = [], laps = {};
    let base = null;
    for (const [vid, e] of full) {
      const f = e.f, sm = simple && simple.get(vid) ? simple.get(vid) : { title: '', f: {} };
      const m = /runs\/(run_\d+_\d+\.csv)/.exec(e.body);
      const kept = (f['Decision'] || '').indexOf('✅') >= 0;
      const lap = lapSeconds(f['Lap time']);
      const v = {
        id: vid, title: clean(e.title), lap: lap, top: kmh(f['Top speed']), slow: kmh(f['Min speed']),
        damage: clean(f['Damage']), kept: kept, base: base,
        delta: (lap && base) ? rnd(lap - laps[base], 2) : null,
        st: clean(sm.title).replace(/\s*\((?:[^()]*; )?rejected\)$/, ''),
        what: clean(sm.f['What changed']), why: clean(sm.f['Why']), learned: clean(sm.f['Learned']), decision: clean(sm.f['Decision']),
        /* the technical record, from CHANGELOG.md itself */
        tech: { what: clean(f['What changed']), why: clean(f['Why']), observed: clean(f['Observed']), decision: clean(f['Decision']), learned: clean(f['Learned']) },
        named: m ? m[1] : null, file: null, beams: null, sum: null,
      };
      if (v.named && (!files || files.has(v.named))) v.file = v.named;
      if (lap) { laps[vid] = lap; if (kept) base = vid; }
      versions.push(v);
    }
    return versions;
  }

  /* ---------- run CSVs ---------- */

  /* Columns of a CSV as number arrays; rows before the start (curLapTime < 0) and broken rows are dropped. */
  function parseCsv(text) {
    const lines = text.replace(/^﻿/, '').split('\n');
    const header = (lines[0] || '').trim().split(',').map(s => s.trim());
    if (header.length < 2 && !header[0]) throw new RVError('csv', 'This recording is empty.');
    const missing = REQUIRED.filter(c => header.indexOf(c) < 0);
    if (missing.length) throw new RVError('csv', 'This recording lacks the column' + (missing.length > 1 ? 's ' : ' ') + missing.join(', ') + '.',
      'See the data format guide in Settings for the columns a run CSV needs.');
    const want = REQUIRED.concat(['allowed', 'focA']);
    for (let k = 0; k < 19; k++) want.push('track' + k);
    for (let k = 0; k < 5; k++) want.push('foc' + k);
    const names = want.filter(c => header.indexOf(c) >= 0), idx = names.map(c => header.indexOf(c));
    const col = {};
    for (const c of names) col[c] = [];
    const iT = header.indexOf('curLapTime');
    let n = 0;
    for (let li = 1; li < lines.length; li++) {
      const line = lines[li];
      if (line.length < 3) continue;
      const p = line.split(',');
      if (p.length < header.length) continue;          /* a row cut short, as at the end of an aborted lap */
      const t = parseFloat(p[iT]);
      if (!(t >= 0)) continue;
      let ok = true;
      for (let k = 0; k < REQUIRED.length; k++) if (isNaN(parseFloat(p[idx[k]]))) { ok = false; break; }
      if (!ok) continue;
      for (let k = 0; k < names.length; k++) { const v = parseFloat(p[idx[k]]); col[names[k]].push(isNaN(v) ? 0 : v); }
      n++;
    }
    return { n: n, col: col, has: c => header.indexOf(c) >= 0 };
  }

  /* A run object from CSV text. trk may be null (no track could be loaded); the run then has no map position.
     Field names: x, y, yaw (map pose), t (lap time), s (distFromStart), d (lap distance, never decreasing),
     v (speed), tp (track position), al (planned speed), st (steering), th (throttle), br (brake), g (gear),
     b (19 beams per row), foc (focus looks by row index), sum (summary). */
  function buildRun(text, label, trk) {
    const c = parseCsv(text), n = c.n, C = c.col;
    if (!n) throw new RVError('csv', 'This recording has no rows of a lap (it is empty, or it stopped before the start line).');
    let maxS = 0;
    for (let i = 0; i < n; i++) if (C.distFromStart[i] > maxS) maxS = C.distFromStart[i];
    /* The run fits the track if its longest distance is the track's length. A recording that stopped within
       seconds of the start has not been round the lap, so it only has to stay inside the track's length. */
    const brief = C.curLapTime[n - 1] < 8 && C.lastLapTime[n - 1] <= 0;
    const fits = !!trk && maxS <= trk.total + FIT_TOL && (brief || maxS >= trk.total - FIT_TOL);
    const total = fits ? trk.total : maxS;               /* without a fitting track, the run's own length */
    const beams = c.has('track0'), hasFoc = c.has('focA') && c.has('foc0'), hasAl = c.has('allowed');
    const F = () => new Float64Array(n);
    const R = {
      name: label, n: n, total: total, beams: beams, fits: fits, maxS: maxS,
      x: fits ? F() : null, y: fits ? F() : null, yaw: fits ? F() : null,
      t: F(), s: F(), d: F(), v: F(), tp: F(), al: F(), st: F(), th: F(), br: F(), g: new Int8Array(n),
      b: beams ? new Float32Array(n * 19) : null, foc: {},
    };
    let firstAfter = -1;
    for (let i = 0; i < n; i++) {
      const s = C.distFromStart[i], tp = C.trackPos[i], ang = C.angle[i], last = C.lastLapTime[i];
      let t = C.curLapTime[i];
      if (last > 0) {
        if (firstAfter < 0) firstAfter = i;
        if (i > 100) t += last;                          /* rows after the finish line: the lap clock has restarted */
      }
      t = rnd(t, 3);
      if (i && t < R.t[i - 1]) t = R.t[i - 1];
      R.t[i] = t; R.s[i] = rnd(s, 1);
      if (fits) {
        const p = RV.track.pose(trk, s);
        R.x[i] = p[0] - tp * trk.hw * Math.sin(p[2]);    /* trackPos + = left */
        R.y[i] = p[1] + tp * trk.hw * Math.cos(p[2]);
        R.yaw[i] = p[2] - ang;
      }
      /* lap distance: the lap is timed from just before the line, so the first metres read close to the track length */
      const ld = rnd((t < 8 && s > total - 200) ? s - total : ((t > 20 && s < 200) ? s + total : s), 1);
      R.d[i] = i ? Math.max(ld, R.d[i - 1]) : ld;
      R.v[i] = rnd(C.speedX[i], 1); R.tp[i] = rnd(tp, 3);
      R.al[i] = hasAl ? rnd(C.allowed[i], 1) : 0;
      R.st[i] = rnd(C.steer[i], 3); R.th[i] = rnd(C.accel[i], 3); R.br[i] = rnd(C.brake[i], 3);
      R.g[i] = Math.trunc(C.gear[i]);
      if (beams) for (let k = 0; k < 19; k++) R.b[i * 19 + k] = C['track' + k][i];
      if (hasFoc && C.foc0[i] > 0) R.foc[i] = [C.focA[i], C.foc0[i], C.foc1[i], C.foc2[i], C.foc3[i], C.foc4[i]];
    }
    /* Lap time: the official time if a row after the line exists; otherwise the last clock reading plus
       the remaining distance at the last speed (the log usually stops just before the line). */
    const e = n - 1;
    const complete = firstAfter >= 0 || (R.t[e] > 8 && C.distFromStart[e] > total - 30);
    let lap = null;
    if (firstAfter >= 0) lap = C.lastLapTime[firstAfter];
    else if (complete) lap = C.curLapTime[e] + Math.max(0, total - C.distFromStart[e]) / Math.max(C.speedX[e] / 3.6, 1);
    /* slowest corner: the slowest point away from the start line (the standing start is slower than any corner) */
    const hi = Math.abs(total - 3608.5) < 1 ? 3500 : total - 108.5;
    let top = -1e9, slow = 1e9, k = 0, nb = 0, nf = 0;
    for (let i = 0; i < n; i++) {
      if (R.v[i] > top) top = R.v[i];
      if (R.s[i] > 100 && R.s[i] < hi && R.t[i] > 8 && R.v[i] < slow) slow = R.v[i];
      if (Math.abs(R.tp[i]) > Math.abs(R.tp[k])) k = i;
      if (R.br[i] > 0) nb++;
      if (R.th[i] >= 0.99) nf++;
    }
    R.sum = {
      lap: lap == null ? null : rnd(lap, 3), complete: complete, stoppedAt: complete ? null : Math.max(0, Math.round(R.d[e])),
      top: top, slow: slow === 1e9 ? 0 : slow, maxtp: rnd(Math.abs(R.tp[k]), 3), maxtp_at: roundHalfEven(R.s[k]),
      damage: C.damage[e], brake: rnd(100 * nb / n, 1), full: rnd(100 * nf / n, 1), frames: n,
    };
    return R;
  }

  /* ---------- sources ---------- */

  async function http(url, what) {
    let res;
    try { res = await fetch(url); } catch (err) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false)
        throw new RVError('offline', 'You are offline, so ' + what + ' could not be loaded.', 'Reconnect and try again.');
      throw new RVError('offline', what + ' could not be loaded: the request did not get through.',
        'Check the network connection. A browser extension or a firewall that blocks ' + new URL(url).host + ' has the same effect.');
    }
    if (res.status === 404) throw new RVError('missing', what + ' was not found.');
    if (res.status === 429 || res.status === 403)
      throw new RVError('rate', 'GitHub is limiting requests from this network (HTTP ' + res.status + '), so ' + what + ' could not be loaded.', 'Wait a few minutes and try again.');
    if (!res.ok) throw new RVError('http', what + ' could not be loaded (HTTP ' + res.status + ').', 'Try again in a moment.');
    return res;
  }

  /* owner, repo and what follows /tree/ from any usual form of a repository link; null if it is not one. */
  function parseGithubLink(input) {
    let s = String(input || '').trim().replace(/^git@github\.com:/i, '').replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
      .replace(/[?#].*$/, '').replace(/\/+$/, '');
    const p = s.split('/');
    if (p.length < 2 || !/^[\w.-]+$/.test(p[0]) || !/^[\w.-]+$/.test(p[1])) return null;
    let rest = [];
    if (p.length > 2) { if (p[2] !== 'tree' && p[2] !== 'blob') return null; rest = p.slice(3); }
    return { owner: p[0], repo: p[1].replace(/\.git$/, ''), rest: rest };
  }

  function githubSource(link) {
    const p = parseGithubLink(link);
    if (!p) throw new RVError('link', 'That is not a GitHub repository link.',
      'Use https://github.com/owner/repo, the same with /tree/<branch> at the end, or just owner/repo.');
    const name = p.owner + '/' + p.repo;
    const src = { kind: 'github', link: String(link).trim(), owner: p.owner, repo: p.repo, branch: null, dir: '', name: name };
    const enc = s => s.split('/').map(encodeURIComponent).join('/');
    const raw = (branch, dir, path) => 'https://raw.githubusercontent.com/' + name + '/' + enc(branch) + '/' + enc(dir + path);
    const api = 'https://api.github.com/repos/' + name;
    src.where = () => name + (src.branch && src.branch !== 'HEAD' ? ', branch ' + src.branch : ', default branch') + (src.dir ? ', folder ' + src.dir.replace(/\/$/, '') : '');
    src.label = () => 'GitHub: ' + src.where();
    src.readText = async (path, what) => (await http(raw(src.branch, src.dir, path), what || path)).text();

    /* Why CHANGELOG.md was not found: the only place the GitHub API is needed (it allows 60 requests an hour). */
    async function diagnose(branch) {
      let r;
      try { r = await fetch(api); } catch (e) { return new RVError('offline', 'GitHub could not be reached to check ' + name + '.', 'Check the network connection.'); }
      if (r.status === 404) return new RVError('repo', 'The repository ' + name + ' was not found, or it is private.',
        'The page reads public repositories only. Check the spelling of the owner and the repository name.');
      if (!r.ok) return new RVError('rate', 'CHANGELOG.md could not be read from ' + name + ', and GitHub’s request limit prevented checking why (HTTP ' + r.status + ').',
        'Check the link, or wait a few minutes and try again.');
      const info = await r.json();
      if (branch !== 'HEAD') {
        const b = await fetch(api + '/branches/' + enc(branch)).catch(() => null);
        if (b && b.status === 404) return new RVError('branch', 'The repository ' + name + ' has no branch called "' + branch + '".',
          'Its default branch is "' + info.default_branch + '".');
      }
      return new RVError('nochangelog', 'CHANGELOG.md is missing from ' + name + ' (' + (branch === 'HEAD' ? 'default branch' : 'branch ' + branch) + ').',
        'A source needs a CHANGELOG.md at its root. The data format guide in Settings describes it.');
    }
    /* Reads CHANGELOG.md and, on the way, settles which part of the link is the branch and which a folder. */
    src.readChangelog = async function () {
      const r = p.rest, cands = [];
      if (!r.length) cands.push(['HEAD', '']);             /* HEAD = the default branch; no API call needed */
      for (let k = 1; k <= r.length; k++) cands.push([r.slice(0, k).join('/'), r.slice(k).length ? r.slice(k).join('/') + '/' : '']);
      for (const [branch, dir] of cands) {
        try {
          const text = await (await http(raw(branch, dir, 'CHANGELOG.md'), 'CHANGELOG.md')).text();
          src.branch = branch; src.dir = dir;
          return text;
        } catch (e) { if (e.code !== 'missing') throw e; }
      }
      throw await diagnose(cands[0][0]);
    };
    /* The CSVs in runs/, by one API call; null if that is not possible (rate limit). */
    src.listRuns = async function () {
      try {
        const r = await fetch(api + '/contents/' + enc(src.dir + 'runs') + (src.branch !== 'HEAD' ? '?ref=' + encodeURIComponent(src.branch) : ''));
        if (!r.ok) return r.status === 404 ? new Map() : null;
        const out = new Map();
        for (const f of await r.json()) if (f.type === 'file' && /\.csv$/i.test(f.name)) out.set(f.name, f.size);
        return out;
      } catch (e) { return null; }
    };
    return src;
  }

  /* A local folder, from the File System Access API (a directory handle). Files are read only when needed. */
  function handleSource(dir) {
    const src = { kind: 'local', name: dir.name };
    src.label = () => 'Local folder: ' + dir.name;
    src.where = () => 'the folder ' + dir.name;
    async function file(path) {
      const parts = path.split('/');
      let d = dir;
      try {
        for (let k = 0; k < parts.length - 1; k++) d = await d.getDirectoryHandle(parts[k]);
        return await (await d.getFileHandle(parts[parts.length - 1])).getFile();
      } catch (e) {
        if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) throw new RVError('missing', path + ' was not found.');
        throw new RVError('access', path + ' could not be read: ' + (e && e.message ? e.message : e), 'Choose the folder again in Settings.');
      }
    }
    src.readText = async path => (await file(path)).text();
    src.readChangelog = () => src.readText('CHANGELOG.md');
    src.listRuns = async function () {
      const out = new Map();
      let runs;
      try { runs = await dir.getDirectoryHandle('runs'); } catch (e) { return out; }
      for await (const [name, h] of runs.entries()) if (h.kind === 'file' && /\.csv$/i.test(name)) out.set(name, (await h.getFile()).size);
      return out;
    };
    return src;
  }
  /* A local folder, from a directory file input (browsers without the File System Access API). */
  function fileListSource(list) {
    const files = new Map();
    let folder = 'folder';
    for (const f of list) {
      const rel = f.webkitRelativePath || f.name, cut = rel.indexOf('/');
      if (cut > 0) folder = rel.slice(0, cut);
      files.set(cut > 0 ? rel.slice(cut + 1) : rel, f);
    }
    const src = { kind: 'local', name: folder };
    src.label = () => 'Local folder: ' + folder;
    src.where = () => 'the folder ' + folder;
    src.readText = async function (path) {
      if (!files.has(path)) throw new RVError('missing', path + ' was not found.');
      return files.get(path).text();
    };
    src.readChangelog = () => src.readText('CHANGELOG.md');
    src.listRuns = async function () {
      const out = new Map();
      for (const [p, f] of files) { const m = /^runs\/([^/]+\.csv)$/i.exec(p); if (m) out.set(m[1], f.size); }
      return out;
    };
    return src;
  }

  /* The Corkscrew track file that ships with the site; read once. */
  let bundled = null;
  function bundledTrack() {
    if (!bundled) bundled = (async function () {
      let text;
      try {
        const r = await fetch('tracks/corkscrew.xml');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        text = await r.text();
      } catch (e) {
        bundled = null;
        throw new RVError('track', 'The bundled Corkscrew track file (tracks/corkscrew.xml) could not be read.',
          location.protocol === 'file:' ? 'A browser does not let a page opened from disk read its neighbouring files. Serve the folder instead: run "python -m http.server" in it and open http://localhost:8000.' : 'Check that tracks/corkscrew.xml was published with the site.');
      }
      return RV.track.parse(text);
    })();
    return bundled;
  }

  /* ---------- a data set: one source, validated and ready to show ---------- */

  /* Reads and validates a source. Throws an RVError if it cannot be used; the caller keeps its current data set.
     opts.onStep(text) reports progress; opts.checkFiles asks a GitHub source which CSVs really exist (one API call). */
  async function openSource(src, opts) {
    opts = opts || {};
    const step = opts.onStep || function () {};
    step('Reading CHANGELOG.md');
    let text;
    try { text = await src.readChangelog(); } catch (e) {
      if (e.code === 'missing') throw new RVError('nochangelog', 'CHANGELOG.md is missing from ' + src.where() + '.',
        'A source needs a CHANGELOG.md at its root. The data format guide in Settings describes it.');
      throw e;
    }
    const full = parseChangelog(text);
    if (!full.size) throw new RVError('format', 'CHANGELOG.md was found in ' + src.where() + ', but it has no version entries.',
      'An entry starts with a heading such as "## v0.1 — Title", followed by a two-column table. See the data format guide in Settings.');

    step('Reading CHANGELOG-simple.md');
    let simple = null;
    try { simple = parseChangelog(await src.readText('CHANGELOG-simple.md')); } catch (e) { if (e.code !== 'missing') throw e; }
    if (simple && !simple.size) simple = null;

    step('Reading the track');
    const ds = { src: src, trk: null, trkOwn: false, trkNote: '', hasSimple: !!simple, runs: new Map() };
    let own = null;
    try { own = await src.readText('track.xml'); } catch (e) { if (e.code !== 'missing') throw e; }
    if (own != null) {
      try { ds.trk = RV.track.parse(own); ds.trkOwn = true; }
      catch (e) { ds.trkNote = 'The source has a track.xml, but it could not be read as a TORCS track file (' + e.message + ') The bundled Corkscrew map is used instead.'; }
    }
    if (!ds.trk) {
      try { ds.trk = await bundledTrack(); } catch (e) { ds.trkNote = e.message + ' ' + e.hint; }
    }

    let files = null;
    if (src.kind === 'local' || opts.checkFiles) { step('Looking for run CSVs'); files = await src.listRuns(); }
    ds.filesKnown = !!files;
    ds.versions = buildVersions(full, simple, files);
    /* recordings in a local folder that no changelog entry names (manual laps) */
    ds.extras = [];
    if (files && src.kind === 'local') {
      const named = new Set(ds.versions.map(v => v.named));
      for (const [name, size] of files) if (!named.has(name)) ds.extras.push({
        id: name.replace(/\.csv$/i, ''), title: 'Recording not named in the changelog', extra: true, file: name, size: size,
        lap: null, top: null, slow: null, damage: '', kept: null, base: null, delta: null, st: '', what: '', why: '', learned: '', decision: '', beams: null, sum: null,
      });
      ds.extras.sort((a, b) => (a.id < b.id ? 1 : -1));
    }
    ds.byId = {};
    ds.versions.concat(ds.extras).forEach(v => { ds.byId[v.id] = v; });
    ds.report = {
      versions: ds.versions.length, named: ds.versions.filter(v => v.named).length,
      withFile: files ? ds.versions.filter(v => v.file).length : null,
      simple: ds.hasSimple, ownTrack: ds.trkOwn, extras: ds.extras.length,
    };

    /* A run by id; read and built once, then kept for the session. */
    ds.loadRun = function (id) {
      if (ds.runs.has(id)) return ds.runs.get(id);
      const v = ds.byId[id];
      const job = (async function () {
        let csv;
        try { csv = await src.readText('runs/' + v.file, 'The recording of ' + id + ' (runs/' + v.file + ')'); } catch (e) {
          if (e.code === 'missing') {
            v.file = null; v.missing = true;
            throw new RVError('missing', 'The changelog names runs/' + v.named + ' for ' + id + ', but that file is not in ' + src.where() + '.');
          }
          throw e;
        }
        let run;
        try { run = buildRun(csv, id, ds.trk); } catch (e) {
          if (e.code === 'csv') { v.bad = e.message; throw new RVError('csv', id + ': ' + e.message.charAt(0).toLowerCase() + e.message.slice(1), e.hint); }
          throw e;
        }
        v.sum = run.sum; v.beams = run.beams;
        if (v.extra) { v.lap = run.sum.lap; v.top = Math.trunc(run.sum.top); v.slow = Math.trunc(run.sum.slow); v.damage = String(run.sum.damage); }
        return run;
      })();
      ds.runs.set(id, job);
      job.catch(() => ds.runs.delete(id));
      return job;
    };
    return ds;
  }

  RV.data = {
    parseChangelog: parseChangelog, buildVersions: buildVersions, parseCsv: parseCsv, buildRun: buildRun,
    parseGithubLink: parseGithubLink, githubSource: githubSource, handleSource: handleSource, fileListSource: fileListSource,
    openSource: openSource, REQUIRED: REQUIRED, FIT_TOL: FIT_TOL,
  };
})();
