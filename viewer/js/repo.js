/* Run viewer: the Repository page. The files of the source's GitHub repository on one branch: folders on the
   left, the files of a folder in the middle, one file on the right. Every file says what it is to the viewer
   (the versions, the recording of v1.06, ...). Anyone can look; a logged-in reader (js/account.js) can add,
   change, move and remove files and publish the versions entered by hand. Nothing is written to GitHub at
   once: changes wait in the bar at the bottom and are saved together, as one commit, by its Commit button.
   All requests go through js/gh.js. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc, G = RV.gh, V = RV.validate;

  const MAX_UP = 25e6, MAX_SHOW = 3e6;                  /* bytes: a file that may be uploaded; a file that is shown */
  const IMG = /\.(png|jpe?g|gif|webp|svg)$/i;
  /* Waiting changes: { op: 'put', path, text | bytes, base } | { op: 'del', path } | { op: 'move', from, to } |
     { op: 'entries', path, recs } (versions entered by hand, added to the changelog as it is when the commit is made) */
  const st = { key: '', info: null, branches: [], branch: null, tree: null, log: [], dir: '', file: null, pending: [], msg: '', msgOwn: false,
    loading: false, busy: '', err: null, ask: null, sure: null, edit: null, pv: null, fileLog: {}, openDock: false };

  const kb = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1000 ? Math.round(n / 1000) + ' kB' : n + ' B');
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
  const nameOf = p => p.slice(p.lastIndexOf('/') + 1);
  const cleanPath = s => String(s || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  const badPath = p => !p || /(^|\/)\.{1,2}(\/|$)/.test(p) || /[\u0000-\u001f:*?"<>|]/.test(p);
  const fail = e => { const x = RV.explain(e); RV.toast(x.msg + (x.hint ? ' ' + x.hint : ''), 'err'); };
  function needLogin() { if (G.loggedIn()) return false; RV.toast('Log in with GitHub to change the repository.'); RV.showTab('pa'); return true; }

  /* ---------- the files as they will be: the branch plus the waiting changes ---------- */
  /* path to { path, size, sha, state: '' | 'add' | 'mod' | 'del' } */
  function view() {
    const m = new Map();
    if (st.tree) for (const it of st.tree.items) if (!it.dir) m.set(it.path, { path: it.path, size: it.size, sha: it.sha, state: '' });
    for (const ch of st.pending) {
      if (ch.op === 'put' || ch.op === 'entries') { const was = m.get(ch.path); m.set(ch.path, { path: ch.path, size: ch.op === 'put' ? (ch.bytes ? ch.bytes.length : ch.text.length) : (was ? was.size : 0), sha: was ? was.sha : null, state: was && was.state !== 'add' ? 'mod' : 'add', ch: ch }); }
      else if (ch.op === 'del') { const was = m.get(ch.path); if (was) was.state = 'del'; }
      else if (ch.op === 'move') { const was = m.get(ch.from); if (was) { was.state = 'del'; m.set(ch.to, { path: ch.to, size: was.size, sha: was.sha, state: 'add', from: ch.from }); } }
    }
    return m;
  }
  /* the folders and files directly in a folder ('' or 'a/b/') */
  function children(m, dir) {
    const dirs = new Map(), files = [];
    for (const f of m.values()) {
      if (f.path.indexOf(dir) !== 0) continue;
      const rest = f.path.slice(dir.length), cut = rest.indexOf('/');
      if (cut < 0) files.push(f);
      else { const d = rest.slice(0, cut), x = dirs.get(d) || { name: d, n: 0, live: 0 }; x.n++; if (f.state !== 'del') x.live++; dirs.set(d, x); }
    }
    return { dirs: Array.from(dirs.values()).sort((a, b) => a.name.localeCompare(b.name)), files: files.sort((a, b) => nameOf(a.path).localeCompare(nameOf(b.path))) };
  }
  /* what a file is to the viewer, in a few words; '' if the viewer does not use it */
  function role(path) {
    const t = G.target(), ds = S.ds;
    if (!t || path.indexOf(t.dir) !== 0) return '';
    const p = path.slice(t.dir.length);
    if (p === 'docs/CHANGELOG.md') return 'The versions' + (ds ? ': ' + (ds.versions.length - ds.local.size) + ' entries' : '') + '. The viewer reads this file.';
    if (p === 'docs/CHANGELOG-simple.md') return 'The plain-language texts of the basic view.';
    if (p === 'track.xml') return 'The track map.';
    let m = /^runs\/([^/]+\.csv)$/i.exec(p);
    if (m) { const v = ds ? ds.versions.find(x => x.named === m[1] && !x.local) : null; return v ? 'Recording of ' + v.id + (v.lap ? ', ' + RV.fmtLap(v.lap) : '') : 'A recording no version names.'; }
    if (/^viewer\//.test(p)) return 'Part of the run viewer (this site).';
    if (/^\.github\/workflows\//.test(p)) return 'A GitHub workflow.';
    return '';
  }
  const folderRole = dir => { const t = G.target(), p = t && dir.indexOf(t.dir) === 0 ? dir.slice(t.dir.length) : null; return p === 'runs/' ? 'The recordings. The viewer reads run CSVs from here.' : p === 'docs/' ? 'The changelogs.' : p === 'viewer/' ? 'The run viewer (this site).' : ''; };

  /* ---------- waiting changes ---------- */
  function stage(ch) {
    const p = ch.op === 'move' ? ch.to : ch.path, tree = new Set(st.tree ? st.tree.items.filter(i => !i.dir).map(i => i.path) : []);
    /* a later change of the same file replaces the earlier one */
    st.pending = st.pending.filter(x => !((x.op === 'put' || x.op === 'del') && x.path === p) && !(x.op === 'move' && x.to === p));
    if (ch.op === 'del') {
      const mv = st.pending.find(x => x.op === 'move' && x.to === ch.path);
      if (!tree.has(ch.path) && !mv) { paint(); return; }           /* it only existed as a waiting change */
    }
    st.pending.push(ch);
    st.sure = null;
    paint();
  }
  function describe() {
    const P = st.pending;
    if (!P.length) return '';
    const e = P.find(x => x.op === 'entries'), others = P.filter(x => x.op !== 'entries' && !(e && x.op === 'put' && e.recs.some(r => x.path.endsWith('runs/' + r.csvName))));
    if (e && !others.length) return 'Add ' + e.recs.map(r => r.id).join(', ') + ' from the run viewer';
    if (P.length === 1) { const c = P[0]; return c.op === 'del' ? 'Delete ' + c.path : c.op === 'move' ? 'Move ' + c.from + ' to ' + c.to : (c.base ? 'Update ' : 'Add ') + c.path; }
    return P.length + ' changes from the run viewer';
  }
  /* the changelog text with the entered versions added before its closing line; null if it has them all */
  function withEntries(old, recs) {
    const text = old == null ? '# Changelog\n' : old, have = RV.data.parseChangelog(text);
    const add = recs.filter(r => !have.has(r.id)).sort((a, b) => V.cmpId(a.id, b.id));
    if (!add.length) return null;
    const nl = /\r\n/.test(text) ? '\r\n' : '\n', body = add.map(r => RV.local.entryText(r).replace(/\n/g, nl)).join(nl + '---' + nl + nl);
    const foot = '*Last updated after ' + add[add.length - 1].id + ' was added in the run viewer.*' + nl;
    const m = /\r?\n---[ \t]*(\r?\n)+[ \t]*\*Last updated[^\n]*\*\s*$/.exec(text);
    const head = (m ? text.slice(0, m.index) : text.replace(/\s+$/, '')) + nl;
    return head + nl + '---' + nl + nl + body + nl + '---' + nl + nl + foot;
  }
  const toApi = ch => (ch.op === 'entries' ? { op: 'make', path: ch.path, make: old => withEntries(old, ch.recs) } : ch);

  /* ---------- loading ---------- */
  async function load(branch) {
    const t = G.target();
    if (!t) { paint(); return; }
    st.loading = true; st.err = null; paint();
    try {
      const key = t.owner + '/' + t.repo;
      if (st.key !== key || !st.info) { st.key = key; st.info = null; st.pending = []; st.branch = null; st.dir = ''; st.file = null; st.info = await G.info(); st.branches = await G.branches(); }
      st.branch = branch || st.branch || t.branch || st.info.branch;
      st.tree = await G.tree(st.branch);
      st.fileLog = {}; st.pv = null;
      st.log = await G.commits(st.branch, 5).catch(() => []);
      const m = view();
      if (st.file && !m.has(st.file)) st.file = null;
      if (st.dir && !Array.from(m.keys()).some(p => p.indexOf(st.dir) === 0)) st.dir = '';
      if (!st.dir && !st.file && t.dir) st.dir = t.dir;
    } catch (e) { st.err = RV.explain(e); st.tree = st.tree || null; }
    st.loading = false;
    paint();
  }
  /* reads the file on the right, once */
  function preview(f) {
    if (st.pv && st.pv.path === f.path && st.pv.sha === f.sha && st.pv.ch === f.ch) return st.pv;
    const pv = st.pv = { path: f.path, sha: f.sha, ch: f.ch, state: 'wait', text: null, url: null };
    const done = () => { if (st.pv === pv) paint(); };
    if (f.ch && f.ch.op === 'put') {
      if (f.ch.text != null) { pv.text = f.ch.text; pv.state = 'ok'; }
      else if (IMG.test(f.path)) { pv.url = URL.createObjectURL(new Blob([f.ch.bytes])); pv.state = 'ok'; }
      else { try { pv.text = new TextDecoder('utf-8', { fatal: true }).decode(f.ch.bytes); pv.state = 'ok'; } catch (e) { pv.state = 'binary'; } }
      return pv;
    }
    if (!f.sha) { pv.state = 'new'; return pv; }
    if (f.size > MAX_SHOW) { pv.state = 'big'; return pv; }
    G.blob(f.sha, true).then(buf => {
      const b = new Uint8Array(buf);
      if (IMG.test(f.path)) { pv.url = URL.createObjectURL(new Blob([b], { type: /\.svg$/i.test(f.path) ? 'image/svg+xml' : '' })); pv.state = 'ok'; }
      else if (b.subarray(0, 4000).indexOf(0) >= 0) pv.state = 'binary';
      else { pv.text = new TextDecoder().decode(b); pv.state = 'ok'; }
      done();
    }, e => { pv.state = 'err'; pv.err = RV.explain(e).msg; done(); });
    if (G.loggedIn() && st.fileLog[f.path] === undefined) {
      st.fileLog[f.path] = null;
      G.commits(st.branch, 1, f.path).then(c => { st.fileLog[f.path] = c[0] || null; done(); }, () => {});
    }
    return pv;
  }

  /* ---------- drawing ---------- */
  const mark = s => (s ? '<i class="rst ' + s + '" title="' + { add: 'Will be added', mod: 'Will be changed', del: 'Will be removed' }[s] + '"></i>' : '');
  function headHtml() {
    const t = G.target(), i = st.info, src = t.branch || (i ? i.branch : ''), other = st.branch && st.branch !== src;
    return '<div class="rhead"><div class="rname"><h1>' + esc(t.owner + '/' + t.repo) + '</h1>' + (i ? '<span class="note">' + (i.isPrivate ? 'Private' : 'Public') + ' repository</span>' : '') + '</div>' +
      '<label class="rbranch">Branch <select id="rBranch"' + (st.branches.length ? '' : ' disabled') + '>' + st.branches.map(b => '<option' + (b.name === st.branch ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></label>' +
      '<button class="btn sm" id="rNewBranch" title="Make a branch that starts as a copy of this one">New branch</button>' +
      (other ? '<button class="btn sm" id="rUse" title="The other pages then show the versions and recordings of this branch">Show this branch in the viewer</button>' : (st.branch ? '<span class="note">The viewer shows this branch.</span>' : '')) +
      '<button class="btn sm" id="rReload">Reload</button>' + (i ? '<a class="btn sm ghost" href="' + esc(i.url + '/tree/' + st.branch) + '" target="_blank" rel="noopener">Open on GitHub</a>' : '') + '</div>';
  }
  function askHtml() {
    const a = st.ask;
    if (!a) return '';
    return '<div class="rask"><label for="rAskIn">' + esc(a.label) + '</label><input type="text" id="rAskIn" value="' + esc(a.value || '') + '" spellcheck="false" autocomplete="off"><button class="btn sm prim" id="rAskOk">' + esc(a.ok) + '</button><button class="btn sm ghost" id="rAskNo">Cancel</button>' + (a.note ? '<p class="note">' + esc(a.note) + '</p>' : '') + '</div>';
  }
  function treeHtml(m) {
    const dirs = new Set(['']);
    for (const p of m.keys()) { const parts = p.split('/'); for (let k = 1; k < parts.length; k++) dirs.add(parts.slice(0, k).join('/') + '/'); }
    const open = d => d === '' || st.dir.indexOf(d) === 0;
    return Array.from(dirs).sort().filter(d => { if (d === '') return true; const up = d.slice(0, d.slice(0, -1).lastIndexOf('/') + 1); return open(up); }).map(d => {
      const depth = d ? d.split('/').length - 1 : 0, name = d ? d.slice(0, -1).split('/').pop() : G.target().repo;
      return '<button class="rdir' + (d === st.dir ? ' on' : '') + '" data-d="' + esc(d) + '" style="padding-left:' + (10 + depth * 14) + 'px">' + esc(name) + '</button>';
    }).join('');
  }
  function listHtml(m) {
    const c = children(m, st.dir), parts = st.dir ? st.dir.slice(0, -1).split('/') : [];
    let h = '<div class="rbar"><nav class="rcrumb" aria-label="Folder"><button data-d="">' + esc(G.target().repo) + '</button>' + parts.map((p, k) => '<span>/</span><button data-d="' + esc(parts.slice(0, k + 1).join('/') + '/') + '">' + esc(p) + '</button>').join('') + '</nav>' +
      '<div class="ractions"><button class="btn sm" id="rUp">Upload files</button><button class="btn sm" id="rNewFile">New file</button><button class="btn sm" id="rNewDir">New folder</button></div></div>';
    const fr = folderRole(st.dir);
    if (fr) h += '<p class="note rwhat">' + esc(fr) + '</p>';
    if (st.dir) h += '<div class="rdiract"><button class="link" id="rDirMove">Rename or move this folder</button><button class="link" id="rDirDel">' + (st.sure === 'dir:' + st.dir ? 'Really remove the folder and its ' + Array.from(m.values()).filter(f => f.path.indexOf(st.dir) === 0 && f.state !== 'del').length + ' files? Click again' : 'Remove this folder') + '</button></div>';
    h += askHtml() + '<div class="rlist" role="list">';
    for (const d of c.dirs) h += '<button class="rrow dirrow' + (d.live ? '' : ' gone') + '" role="listitem" data-d="' + esc(st.dir + d.name + '/') + '"><span class="rn"><i class="ric dir"></i>' + esc(d.name) + '</span><span class="rw">' + esc(folderRole(st.dir + d.name + '/')) + '</span><span class="rs num">' + d.n + ' file' + (d.n === 1 ? '' : 's') + '</span></button>';
    for (const f of c.files) h += '<button class="rrow' + (f.path === st.file ? ' on' : '') + (f.state === 'del' ? ' gone' : '') + '" role="listitem" data-f="' + esc(f.path) + '"><span class="rn">' + mark(f.state) + esc(nameOf(f.path)) + '</span><span class="rw">' + esc(role(f.path)) + '</span><span class="rs num">' + kb(f.size) + '</span></button>';
    if (!c.dirs.length && !c.files.length) h += '<p class="note rempty">This folder is empty. Upload files or make a new one.</p>';
    return h + '</div>' + (st.tree && st.tree.truncated ? '<p class="warn">The repository has more files than GitHub lists in one answer, so some are missing here.</p>' : '');
  }
  function csvTable(text) {
    const lines = text.split('\n', 27).filter(l => l.trim()), head = (lines[0] || '').split(',');
    return '<div class="tablewrap rcsv"><table><thead><tr>' + head.map(c => '<td>' + esc(c.trim()) + '</td>').join('') + '</tr></thead><tbody>' + lines.slice(1, 26).map(l => '<tr>' + l.split(',').map(c => '<td class="num">' + esc(c.trim()) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<p class="note">The first ' + Math.max(0, Math.min(25, lines.length - 1)) + ' rows.</p>';
  }
  function fileHtml(m) {
    const f = st.file ? m.get(st.file) : null;
    if (!f) {
      return '<div class="rnone"><h4 class="first">The latest commits on ' + esc(st.branch || '') + '</h4>' + (st.log.length ? '<ul class="rlog">' + st.log.map(c => '<li><a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.msg) + '</a><span class="note">' + esc(c.who) + ', ' + esc(when(c.when)) + '</span></li>').join('') + '</ul>' : '<p class="note">None to show.</p>') +
        '<p class="note">Choose a file to see what it holds and what the viewer does with it.</p></div>';
    }
    const pv = preview(f), r = role(f.path), lg = st.fileLog[f.path], gone = f.state === 'del', isText = pv.state === 'ok' && pv.text != null;
    let h = '<div class="rfile"><h2>' + mark(f.state) + esc(nameOf(f.path)) + '</h2><p class="rpath num">' + esc(f.path) + '</p>' + (r ? '<p class="rrole">' + esc(r) + '</p>' : '') +
      '<p class="note">' + kb(f.size) + (f.from ? ', moved from ' + esc(f.from) : '') + (lg ? ', last changed ' + esc(when(lg.when)) + ' by ' + esc(lg.who) + ': ' + esc(lg.msg) : '') + '</p>';
    if (st.edit && st.edit.path === f.path) {
      return h + '<textarea id="rEdit" spellcheck="false" aria-label="Text of the file">' + esc(st.edit.text) + '</textarea><div class="acts"><button class="btn prim" id="rEditOk">Keep this change</button><button class="btn ghost" id="rEditNo">Cancel</button></div>' +
        '<p class="note">The change waits in the bar below until you commit.</p></div>';
    }
    h += '<div class="acts">' + (gone ? '<button class="btn sm" id="rUndo">Keep the file after all</button>' :
      '<button class="btn sm" id="rEditBtn"' + (isText || pv.state === 'new' ? '' : ' disabled') + '>Edit</button><button class="btn sm" id="rMove">Rename or move</button><button class="btn sm" id="rDel">' + (st.sure === f.path ? 'Really remove it? Click again' : 'Remove') + '</button>' +
      (f.sha && !f.ch ? '<button class="btn sm" id="rGet">Download</button><a class="btn sm ghost" href="' + esc(st.info.url + '/blob/' + st.branch + '/' + f.path) + '" target="_blank" rel="noopener">Open on GitHub</a>' : '')) + '</div>';
    if (f.ch && f.ch.op === 'entries') return h + '<div class="chk valid"><b class="chklvl">Will be added</b> ' + f.ch.recs.map(x => esc(x.id)).join(', ') + ': their entries go at the end of this file, before its closing line, when you commit.</div><pre class="rtext">' + esc(f.ch.recs.map(x => RV.local.entryText(x)).join('\n---\n\n')) + '</pre></div>';
    if (pv.state === 'wait') return h + '<p class="note">Reading the file …</p></div>';
    if (pv.state === 'err') return h + '<p class="warn">' + esc(pv.err) + '</p></div>';
    if (pv.state === 'big') return h + '<p class="note">The file is too large to show here. Download it or open it on GitHub.</p></div>';
    if (pv.state === 'binary') return h + '<p class="note">This is not a text file, so there is nothing to show.</p></div>';
    if (pv.state === 'new') return h + '<p class="note">An empty new file. Press Edit to write it.</p></div>';
    if (pv.url) return h + '<img class="rimg" src="' + pv.url + '" alt="' + esc(nameOf(f.path)) + '"></div>';
    const text = pv.text;
    if (/\.csv$/i.test(f.path)) {
      if (/(^|,)\s*curLapTime\s*(,|$)/.test(text.split('\n', 1)[0])) {
        const c = V.recording(text, S.ds ? S.ds.trk : null);
        h += '<div class="chk ' + c.level + '"><b class="chklvl">' + { valid: 'A usable recording', warning: 'Usable, incomplete', blocked: 'Not usable' }[c.level] + '</b>' + (c.sum && c.sum.lap != null ? ' Lap ' + RV.fmtLap(c.sum.lap) + ', top speed ' + Math.trunc(c.sum.top) + ' km/h.' : '') +
          (c.blocks.length || c.warns.length ? '<ul>' + c.blocks.map(b => '<li>' + esc(b) + '</li>').join('') + c.warns.map(w => '<li><b>' + esc(w.what) + '.</b> ' + esc(w.affects) + '</li>').join('') + '</ul>' : '') + '</div>';
      }
      return h + csvTable(text) + '</div>';
    }
    if (/CHANGELOG[^/]*\.md$/i.test(f.path)) {
      const vs = Array.from(RV.data.parseChangelog(text));
      h += '<p class="rrole">' + vs.length + ' version' + (vs.length === 1 ? '' : 's') + (vs.length ? ', from ' + esc(vs[0][0]) + ' to ' + esc(vs[vs.length - 1][0]) : '') + '.</p>' +
        '<ul class="rlog">' + vs.slice(-8).reverse().map(x => '<li><b class="num">' + esc(x[0]) + '</b> ' + esc(x[1].title.replace(/[`*]/g, '').slice(0, 110)) + '<span class="note">' + esc((x[1].f['Lap time'] || 'no lap time') + ', ' + ((x[1].f['Decision'] || '').indexOf('✅') >= 0 ? 'kept' : 'rejected')) + '</span></li>').join('') + '</ul>';
    }
    const cut = 20000;
    return h + '<pre class="rtext">' + esc(text.slice(0, cut)) + '</pre>' + (text.length > cut ? '<p class="note">The first ' + RV.fmtInt(cut) + ' of ' + RV.fmtInt(text.length) + ' characters. Edit shows all of it.</p>' : '') + '</div>';
  }
  function dockHtml() {
    const P = st.pending, n = P.length, on = G.loggedIn();
    if (!n) return '<div class="rdock idle"><span>' + (on ? 'Nothing is waiting. What you add, change or remove here is collected in this bar and saved to GitHub together when you commit.' : 'You can look at everything. <button class="link" id="rLogin">Log in with GitHub</button> to add, change or remove files.') + '</span></div>';
    const line = c => (c.op === 'del' ? mark('del') + esc(c.path) : c.op === 'move' ? mark('mod') + esc(c.from) + ' <span class="note">to</span> ' + esc(c.to) : c.op === 'entries' ? mark('mod') + esc(c.path) + ' <span class="note">gets ' + c.recs.map(r => esc(r.id)).join(', ') + '</span>' : mark(c.base ? 'mod' : 'add') + esc(c.path) + ' <span class="note">' + kb(c.bytes ? c.bytes.length : c.text.length) + '</span>');
    return '<div class="rdock' + (st.openDock ? ' open' : '') + '">' +
      (st.openDock ? '<ul class="rpend">' + P.map((c, k) => '<li><span class="num">' + line(c) + '</span><button class="link" data-undo="' + k + '">Undo</button></li>').join('') + '</ul>' : '') +
      '<div class="rdockrow"><button class="rcount" id="rDockOpen" aria-expanded="' + st.openDock + '"><b>' + n + '</b> change' + (n === 1 ? '' : 's') + ' waiting<span class="note">' + (st.openDock ? 'Hide' : 'Show') + '</span></button>' +
      '<input type="text" id="rMsg" value="' + esc(st.msgOwn ? st.msg : describe()) + '" aria-label="What this commit does" spellcheck="true" autocomplete="off">' +
      '<button class="btn prim" id="rCommit"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? esc(st.busy) : 'Commit to ' + esc(st.branch)) + '</button><button class="btn ghost" id="rDiscard"' + (st.busy ? ' disabled' : '') + '>' + (st.sure === 'discard' ? 'Really discard? Click again' : 'Discard all') + '</button></div></div>';
  }

  function paint() {
    const box = $('pr');
    if (!box || S.tab !== 'pr') return;
    const t = G.target();
    if (!t) { box.innerHTML = '<div class="setwrap"><div class="card status"><h2>The data source is a folder on this computer</h2><p class="lead">This page shows the files of a GitHub repository. Choose one as the data source to browse it and save to it.</p><div class="acts"><button class="btn prim" id="rData">Open Settings, Data</button></div></div></div>'; $('rData').onclick = () => { S.setTab = 'data'; RV.showTab('ps'); }; return; }
    if (!st.tree) {
      box.innerHTML = '<div class="setwrap"><div class="card status">' + (st.err ? '<h2>The repository could not be read</h2><p class="lead">' + esc(st.err.msg) + '</p>' + (st.err.hint ? '<p>' + esc(st.err.hint) + '</p>' : '') + '<div class="acts"><button class="btn prim" id="rAgain">Try again</button>' + (G.loggedIn() ? '' : '<button class="btn" id="rLogin">Log in with GitHub</button>') + '</div>'
        : '<h2>Reading ' + esc(t.owner + '/' + t.repo) + ' …</h2>') + '</div></div>';
      if ($('rAgain')) $('rAgain').onclick = () => load();
      if ($('rLogin')) $('rLogin').onclick = () => RV.showTab('pa');
      return;
    }
    const keep = ['rTree', 'rMid', 'rSide'].map(id => ($(id) ? $(id).scrollTop : 0)), typing = document.activeElement && document.activeElement.id, m = view();
    box.innerHTML = '<div class="repo' + (st.loading ? ' loading' : '') + '">' + headHtml() + (st.err ? '<p class="warn rerr">' + esc(st.err.msg) + ' ' + esc(st.err.hint || '') + '</p>' : '') +
      '<div class="rbody"><nav id="rTree" class="rtree" aria-label="Folders">' + treeHtml(m) + '</nav><div id="rMid" class="rmid">' + listHtml(m) + '</div><div id="rSide" class="rside">' + fileHtml(m) + '</div></div>' + dockHtml() + '</div>';
    ['rTree', 'rMid', 'rSide'].forEach((id, k) => { $(id).scrollTop = keep[k]; });
    wire(m);
    if (typing === 'rMsg' && $('rMsg')) { const i = $('rMsg'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    if (st.ask && $('rAskIn') && typing !== 'rMsg') { const i = $('rAskIn'); i.focus(); if (typing !== 'rAskIn') i.select(); }
  }

  /* ---------- acting ---------- */
  function ask(a) { st.ask = a; st.sure = null; paint(); }
  function upload() {
    if (needLogin()) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.onchange = async () => addFiles(await Promise.all(Array.from(inp.files).map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    inp.click();
  }
  /* files chosen or dropped: [{ name, bytes }] go into the open folder */
  function addFiles(files) {
    const m = view(), big = [];
    for (const f of files) {
      if (f.bytes.length > MAX_UP) { big.push(f.name); continue; }
      const p = st.dir + f.name, was = m.get(p);
      stage({ op: 'put', path: p, bytes: f.bytes, base: was && was.sha && was.state !== 'add' ? was.sha : null });
      st.file = p;
    }
    if (big.length) RV.toast(big.join(', ') + ': larger than 25 MB, not added.', 'err');
    st.openDock = true; paint();
  }
  function answer() {
    const a = st.ask, v = $('rAskIn') ? $('rAskIn').value : '', m = view();
    if (!a) return;
    if (a.kind === 'branch') {
      const name = v.trim();
      if (!name || /[\s~^:?*\[\\]|\.\.|^\/|\/$|\.lock$/.test(name)) { RV.toast('That is not a branch name. Use letters, numbers, dashes and slashes.', 'err'); return; }
      if (st.branches.some(b => b.name === name)) { RV.toast('A branch ' + name + ' exists already.', 'err'); return; }
      st.ask = null; st.busy = 'Making the branch …'; paint();
      G.createBranch(name, st.tree.head).then(async () => { st.busy = ''; st.branches = await G.branches(); RV.toast('Branch ' + name + ' made from ' + st.branch + '.'); load(name); }, e => { st.busy = ''; fail(e); paint(); });
      return;
    }
    const p = cleanPath(v);
    if (badPath(p)) { RV.toast('That is not a usable path. Leave out : * ? " < > | and folders named . or ..', 'err'); return; }
    if (a.kind === 'file') { if (m.has(p) && m.get(p).state !== 'del') { RV.toast(p + ' exists already.', 'err'); return; } st.ask = null; st.file = p; st.dir = p.slice(0, p.lastIndexOf('/') + 1); st.edit = { path: p, text: '', base: null }; stage({ op: 'put', path: p, text: '', base: null }); return; }
    if (a.kind === 'dir') { st.ask = null; st.dir = p + '/'; stage({ op: 'put', path: p + '/.gitkeep', text: '', base: null }); RV.toast('Folder ' + p + ' is waiting. Git keeps a folder only with a file in it, so it gets an empty .gitkeep.'); return; }
    if (a.kind === 'move') {
      if (p === a.from) { st.ask = null; paint(); return; }
      if (m.has(p) && m.get(p).state !== 'del') { RV.toast(p + ' exists already.', 'err'); return; }
      st.ask = null; moveOne(a.from, p, m); st.file = p; st.dir = p.slice(0, p.lastIndexOf('/') + 1); paint(); return;
    }
    if (a.kind === 'movedir') {
      const to = p + '/';
      if (to === a.from || to.indexOf(a.from) === 0) { RV.toast('Choose another place for the folder.', 'err'); return; }
      const inside = Array.from(m.values()).filter(f => f.path.indexOf(a.from) === 0 && f.state !== 'del');
      if (inside.some(f => m.has(to + f.path.slice(a.from.length)) && m.get(to + f.path.slice(a.from.length)).state !== 'del')) { RV.toast('Files of that name are already there.', 'err'); return; }
      st.ask = null;
      for (const f of inside) moveOne(f.path, to + f.path.slice(a.from.length), m);
      st.dir = to; st.file = null; paint();
    }
  }
  /* moves one file; a file that only waits to be added is simply added under the other name */
  function moveOne(from, to, m) {
    const f = m.get(from);
    if (f.ch && f.ch.op === 'put') { st.pending = st.pending.filter(x => x !== f.ch); stage(Object.assign({}, f.ch, { path: to, base: null })); if (f.sha && f.state === 'mod') stage({ op: 'del', path: from }); }
    else if (f.from) { st.pending = st.pending.filter(x => !(x.op === 'move' && x.to === from)); stage({ op: 'move', from: f.from, to: to }); }
    else stage({ op: 'move', from: from, to: to });
  }
  function removeFile(path, m) {
    const f = m.get(path);
    if (!f) return;
    if (f.from) { st.pending = st.pending.filter(x => !(x.op === 'move' && x.to === path)); stage({ op: 'del', path: f.from }); }
    else stage({ op: 'del', path: path });
  }
  async function commit() {
    if (st.busy || !st.pending.length || needLogin()) return;
    const done = st.pending.slice(), msg = ($('rMsg') ? $('rMsg').value.trim() : '') || describe(), branch = st.branch;
    st.busy = 'Saving to GitHub …'; st.sure = null; paint();
    try {
      await G.commit(branch, done.map(toApi), msg);
      st.pending = st.pending.filter(x => done.indexOf(x) < 0); st.msg = ''; st.msgOwn = false; st.edit = null; st.openDock = false;
      st.busy = '';
      await after(done, branch);
      await load();
    } catch (e) { st.busy = ''; st.err = RV.explain(e); fail(e); paint(); }
  }
  /* after a commit: versions that were published leave the browser, and the other pages read the source again */
  async function after(done, branch) {
    const t = G.target(), shown = branch === (t.branch || st.info.branch), recs = [];
    for (const c of done) if (c.op === 'entries') for (const r of c.recs) recs.push(r);
    const touches = done.some(c => [c.path, c.from, c.to].some(p => p && p.indexOf(t.dir) === 0 && /^(docs\/|runs\/|track\.xml$)/.test(p.slice(t.dir.length))));
    if (!shown) { RV.toast('Committed to ' + branch + '.' + (recs.length ? ' The viewer shows another branch, so the copies in this browser stay until that branch has the versions.' : '')); return; }
    if (recs.length) { try { await RV.local.remove(recs.map(r => r.key)); } catch (e) { /* they show as copies to delete */ } }
    if (touches && S.ds && S.ds.src.kind === 'github') {
      try {
        const ds0 = S.ds, ds = await RV.data.openSource(ds0.src, { checkFiles: ds0.filesKnown });
        if (S.ds === ds0) { const keepSel = S.sel.filter(id => ds.byId[id] && ds.byId[id].file); await RV.useDataset(ds, { run: keepSel[0], cmp: keepSel.slice(1).join(','), detail: recs.length ? recs[recs.length - 1].id : S.detailId }); }
      } catch (e) { fail(e); }
    }
    RV.toast('Committed to ' + branch + '.' + (recs.length ? ' ' + recs.map(r => r.id).join(', ') + (recs.length === 1 ? ' is' : ' are') + ' in the repository now, for every device.' : ''));
  }

  function wire(m) {
    const box = $('pr'), on = (id, fn) => { if ($(id)) $(id).onclick = fn; };
    box.querySelectorAll('[data-d]').forEach(b => { b.onclick = () => { st.dir = b.dataset.d; st.file = null; st.edit = null; st.ask = null; st.sure = null; paint(); $('rMid').scrollTop = 0; }; });
    box.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => { st.file = b.dataset.f; st.edit = null; st.sure = null; paint(); $('rSide').scrollTop = 0; }; });
    $('rBranch').onchange = e => { if (st.pending.length) { RV.toast('Commit or discard the waiting changes before changing branch.'); e.target.value = st.branch; return; } st.file = null; st.edit = null; load(e.target.value); };
    on('rNewBranch', () => { if (needLogin()) return; if (st.pending.length) { RV.toast('Commit or discard the waiting changes first.'); return; } ask({ kind: 'branch', label: 'Name of the new branch, a copy of ' + st.branch, value: '', ok: 'Make the branch' }); });
    on('rUse', () => { const t = G.target(); RV.prefs.source = { kind: 'github', link: 'https://github.com/' + t.owner + '/' + t.repo + '/tree/' + st.branch + (t.dir ? '/' + t.dir.replace(/\/$/, '') : '') }; RV.savePrefs(); RV.toast('The viewer now shows the branch ' + st.branch + '.'); RV.reload().then(() => { if (S.ds) RV.showTab('pr'); }); });
    on('rReload', () => load());
    on('rLogin', () => RV.showTab('pa'));
    on('rUp', upload);
    on('rNewFile', () => { if (!needLogin()) ask({ kind: 'file', label: 'Path of the new file', value: st.dir, ok: 'Make the file' }); });
    on('rNewDir', () => { if (!needLogin()) ask({ kind: 'dir', label: 'Path of the new folder', value: st.dir, ok: 'Make the folder' }); });
    on('rDirMove', () => { if (!needLogin()) ask({ kind: 'movedir', from: st.dir, label: 'New path of the folder ' + st.dir.slice(0, -1), value: st.dir.slice(0, -1), ok: 'Move the folder', note: 'Every file in it moves along.' }); });
    on('rDirDel', () => { if (needLogin()) return; const k = 'dir:' + st.dir; if (st.sure !== k) { st.sure = k; paint(); return; } const d = st.dir; for (const f of Array.from(m.values())) if (f.path.indexOf(d) === 0 && f.state !== 'del') removeFile(f.path, view()); st.sure = null; st.openDock = true; paint(); });
    on('rAskOk', answer); on('rAskNo', () => { st.ask = null; paint(); });
    if ($('rAskIn')) $('rAskIn').onkeydown = e => { if (e.key === 'Enter') answer(); else if (e.key === 'Escape') { st.ask = null; paint(); } };
    const f = st.file ? m.get(st.file) : null;
    on('rEditBtn', () => { if (needLogin()) return; st.edit = { path: f.path, text: st.pv && st.pv.text != null ? st.pv.text : '', base: f.sha && f.state !== 'add' ? f.sha : null }; paint(); });
    if ($('rEdit')) $('rEdit').oninput = e => { st.edit.text = e.target.value; };
    on('rEditOk', () => { const e = st.edit; st.edit = null; st.openDock = true; stage({ op: 'put', path: e.path, text: e.text, base: e.base }); });
    on('rEditNo', () => { st.edit = null; paint(); });
    on('rMove', () => { if (!needLogin()) ask({ kind: 'move', from: f.path, label: 'New path of ' + nameOf(f.path), value: f.path, ok: 'Move the file', note: 'Change the name, the folder, or both.' }); });
    on('rDel', () => { if (needLogin()) return; if (st.sure !== f.path) { st.sure = f.path; paint(); return; } st.openDock = true; removeFile(f.path, m); });
    on('rUndo', () => { st.pending = st.pending.filter(x => !(x.op === 'del' && x.path === f.path) && !(x.op === 'move' && x.from === f.path)); paint(); });
    on('rGet', async () => { try { RV.local.download(new Blob([await G.blob(f.sha, true)]), nameOf(f.path)); } catch (e) { fail(e); } });
    on('rDockOpen', () => { st.openDock = !st.openDock; paint(); });
    if ($('rMsg')) $('rMsg').oninput = e => { st.msg = e.target.value; st.msgOwn = true; };
    if ($('rMsg')) $('rMsg').onkeydown = e => { if (e.key === 'Enter') commit(); };
    on('rCommit', commit);
    on('rDiscard', () => { if (st.sure !== 'discard') { st.sure = 'discard'; paint(); return; } st.pending = []; st.sure = null; st.edit = null; st.msgOwn = false; st.openDock = false; st.err = null; paint(); });
    box.querySelectorAll('[data-undo]').forEach(b => { b.onclick = () => { st.pending.splice(+b.dataset.undo, 1); if (!st.pending.length) st.openDock = false; paint(); }; });
  }

  /* Puts versions entered by hand (records of js/local.js) among the waiting changes: their entries into the
     changelog and their recordings into runs/, where the viewer reads them. Then shows the page. */
  async function publish(recs) {
    if (needLogin()) return false;
    const t = G.target();
    if (!t) { RV.toast('The data source is a folder on this computer: there is no repository to publish to.', 'err'); return false; }
    RV.showTab('pr');
    if (!st.tree || st.key !== t.owner + '/' + t.repo) await load();
    if (!st.tree) return false;
    const path = t.dir + 'docs/CHANGELOG.md', old = st.pending.find(x => x.op === 'entries'), all = (old ? old.recs.filter(r => !recs.some(n => n.key === r.key)) : []).concat(recs);
    st.pending = st.pending.filter(x => x !== old);
    st.pending.push({ op: 'entries', path: path, recs: all });
    const m = view();
    for (const r of recs) {
      if (!r.csvName) continue;
      const text = await RV.local.csv(r.key);
      if (text == null) continue;
      const p = t.dir + 'runs/' + r.csvName, was = m.get(p);
      st.pending = st.pending.filter(x => !(x.op === 'put' && x.path === p));
      st.pending.push({ op: 'put', path: p, text: text, base: was && was.sha && was.state !== 'add' ? was.sha : null });
    }
    st.dir = t.dir + 'docs/'; st.file = path; st.openDock = true; st.msgOwn = false; st.err = null;
    paint();
    return true;
  }

  /* files dropped on the page go into the open folder */
  addEventListener('dragover', e => { if (S.tab === 'pr' && !RV.entry.isOpen()) e.preventDefault(); });
  addEventListener('drop', async e => {
    if (S.tab !== 'pr' || RV.entry.isOpen() || !st.tree) return;
    e.preventDefault();
    const fs = Array.from(e.dataTransfer ? e.dataTransfer.files : []);
    if (!fs.length || needLogin()) return;
    addFiles(await Promise.all(fs.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
  });
  /* leaving the page with changes that were not committed */
  addEventListener('beforeunload', e => { if (st.pending.length) { e.preventDefault(); e.returnValue = ''; } });

  RV.repo = {
    render() { const t = G.target(); if (t && (!st.tree || st.key !== t.owner + '/' + t.repo) && !st.loading) load(); else paint(); },
    changed() { if (S.tab === 'pr') paint(); },
    publish: publish, addFiles: addFiles, waiting: () => st.pending.length, state: st, withEntries: withEntries, load: load,
  };
})();
