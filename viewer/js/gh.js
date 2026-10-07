/* Run viewer: everything that talks to the GitHub API beyond reading a source (which is js/data.js).
   Who is logged in, the branches and files of the repository, and writing: every change the reader makes is
   one commit, built with the Git Data API (blobs, a tree on top of the branch's own, a commit, then the branch
   moved to it without force). The token is the reader's own (js/keys.js); it goes to api.github.com in the
   Authorization header and nowhere else. Nothing here touches the page. */
(function () {
  'use strict';
  const RV = globalThis.RV, RVError = RV.RVError;
  const API = 'https://api.github.com';
  const token = () => RV.apiKeys.get('github');
  const enc = s => String(s).split('/').map(encodeURIComponent).join('/');

  /* the repository the page shows: { owner, repo, branch (null = its default), dir }, or null with a folder as source */
  function target() {
    const src = RV.S && RV.S.ds ? RV.S.ds.src : null;
    if (src) return src.kind === 'github' ? { owner: src.owner, repo: src.repo, branch: src.branch && src.branch !== 'HEAD' ? src.branch : null, dir: src.dir || '' } : null;
    const p = RV.data.parseGithubLink(RV.prefs.source.link);
    return p ? { owner: p.owner, repo: p.repo, branch: null, dir: '' } : null;
  }
  const base = () => { const t = target(); if (!t) throw new RVError('nosrc', 'The data source is not a GitHub repository.', 'Choose one under Settings, Data.'); return '/repos/' + t.owner + '/' + t.repo; };

  /* One request. opts: method, body (sent as JSON), raw (the file itself: text, or bytes with opts.bytes). */
  async function api(path, opts) {
    opts = opts || {};
    const h = { Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' }, t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    if (opts.body) h['Content-Type'] = 'application/json';
    let r;
    try { r = await fetch(API + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' }); }
    catch (e) { throw new RVError('offline', 'GitHub could not be reached.', 'Check the network connection.'); }
    if (r.ok) return opts.raw ? (opts.bytes ? r.arrayBuffer() : r.text()) : (r.status === 204 ? null : r.json());
    let msg = '';
    try { msg = (await r.json()).message || ''; } catch (e) { /* no JSON in the answer */ }
    if (r.status === 401) throw new RVError('auth', 'GitHub refused the token.', 'It may have expired or been deleted. Log in again with a new one.');
    if ((r.status === 403 || r.status === 429) && (r.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(msg)))
      throw new RVError('rate', 'GitHub is limiting requests' + (t ? '.' : ' from this network (60 an hour without a login).'), t ? 'Wait a few minutes.' : 'Log in, or wait a few minutes.');
    if (r.status === 403) throw new RVError('forbidden', 'GitHub does not allow this with your token.', 'To save changes the token needs “Contents: Read and write” for this repository.');
    if (r.status === 404) throw new RVError('missing', opts.method && opts.method !== 'GET' ? 'GitHub did not accept the change: the repository was not found for this token.' : 'Not found on GitHub.',
      opts.method && opts.method !== 'GET' ? 'The token needs “Contents: Read and write” for this repository.' : '');
    if (r.status === 409 || r.status === 422) throw new RVError('conflict', 'GitHub did not accept the change' + (msg ? ': ' + msg : '.'), '');
    throw new RVError('http', 'GitHub answered with an error (HTTP ' + r.status + ')' + (msg ? ': ' + msg : '.'), 'Try again in a moment.');
  }

  /* ---------- who is logged in ---------- */
  let meFor = null, meJob = null;
  /* { login, name, avatar } of the token's owner; null without a token. Asked once per token. */
  function me() {
    const t = token();
    if (!t) { meFor = null; meJob = null; return Promise.resolve(null); }
    if (meFor !== t) { meFor = t; meJob = api('/user').then(u => ({ login: u.login, name: u.name || u.login, avatar: u.avatar_url || '' })); meJob.catch(() => { if (meFor === t) meFor = null; }); }
    return meJob;
  }
  /* { name, branch (the default), isPrivate, canWrite (the account may push; the token must allow it too), url } */
  async function info() {
    const r = await api(base());
    return { name: r.full_name, branch: r.default_branch, isPrivate: !!r.private, canWrite: !!(r.permissions && r.permissions.push), url: r.html_url };
  }

  /* ---------- reading ---------- */
  async function branches() {
    const out = [];
    for (let page = 1; page <= 5; page++) {
      const r = await api(base() + '/branches?per_page=100&page=' + page);
      for (const b of r) out.push({ name: b.name, sha: b.commit.sha });
      if (r.length < 100) break;
    }
    return out;
  }
  /* every file and folder of a branch: { head, tree, items: [{ path, dir (true for a folder), size, sha, mode }], truncated } */
  async function tree(branch) {
    const b = await api(base() + '/branches/' + enc(branch));
    const t = await api(base() + '/git/trees/' + b.commit.commit.tree.sha + '?recursive=1');
    return { head: b.commit.sha, tree: t.sha, truncated: !!t.truncated, items: t.tree.filter(x => x.type === 'blob' || x.type === 'tree').map(x => ({ path: x.path, dir: x.type === 'tree', size: x.size || 0, sha: x.sha, mode: x.mode })) };
  }
  /* a file by the id of its content: text, or bytes with asBytes. A given id never changes, so it is kept. */
  const blobs = new Map();
  function blob(sha, asBytes) {
    const k = sha + (asBytes ? ':b' : '');
    if (!blobs.has(k)) { if (blobs.size > 40) blobs.delete(blobs.keys().next().value); const job = api(base() + '/git/blobs/' + sha, { raw: true, bytes: !!asBytes }); blobs.set(k, job); job.catch(() => blobs.delete(k)); }
    return blobs.get(k);
  }
  /* a file by its path on a branch; null if it is not there */
  async function text(path, branch) {
    try { return await api(base() + '/contents/' + enc(path) + '?ref=' + encodeURIComponent(branch), { raw: true }); } catch (e) { if (e.code === 'missing') return null; throw e; }
  }
  /* the latest commits of a branch, or of one file on it: [{ sha, msg, who, when, url }] */
  async function commits(branch, n, path) {
    const r = await api(base() + '/commits?sha=' + encodeURIComponent(branch) + '&per_page=' + (n || 10) + (path ? '&path=' + encodeURIComponent(path) : ''));
    return r.map(c => ({ sha: c.sha, msg: (c.commit.message || '').split('\n')[0], who: (c.commit.author && c.commit.author.name) || '', when: (c.commit.author && c.commit.author.date) || '', url: c.html_url }));
  }

  /* ---------- writing ---------- */
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
  const putBlob = async ch => (await api(base() + '/git/blobs', { method: 'POST', body: ch.bytes ? { content: b64(ch.bytes), encoding: 'base64' } : { content: ch.text, encoding: 'utf-8' } })).sha;
  async function createBranch(name, sha) { await api(base() + '/git/refs', { method: 'POST', body: { ref: 'refs/heads/' + name, sha: sha } }); }

  /* Commits changes to a branch, on top of whatever the branch holds now. changes:
       { op: 'put', path, text | bytes, base }   base: the content id the file had when the reader changed it (null: it
                                                 did not exist); if the branch has another by now, nothing is written
       { op: 'del', path }
       { op: 'move', from, to }
       { op: 'make', path, make(old) }           the new text is made from the file as it is now (old: its text, or null);
                                                 make returns null to leave the file alone
     Throws a 'conflict' RVError naming the file if someone else changed what the reader changed. Returns the new head. */
  async function commit(branch, changes, message) {
    const b = await api(base() + '/branches/' + enc(branch)), head = b.commit.sha;
    const t = await api(base() + '/git/trees/' + b.commit.commit.tree.sha + '?recursive=1');
    const cur = new Map();
    for (const x of t.tree) if (x.type === 'blob') cur.set(x.path, x);
    const clash = p => new RVError('conflict', p + ' was changed on GitHub after you opened it, so nothing was saved.', 'Reload the repository, look at the file and make your change again.');
    const entries = [];
    for (const ch of changes) {
      if (ch.op === 'put') {
        if (ch.base !== undefined && ((cur.get(ch.path) || {}).sha || null) !== ch.base) throw clash(ch.path);
        entries.push({ path: ch.path, mode: (cur.get(ch.path) || {}).mode || '100644', type: 'blob', sha: await putBlob(ch) });
      } else if (ch.op === 'del') {
        if (cur.has(ch.path)) entries.push({ path: ch.path, mode: cur.get(ch.path).mode, type: 'blob', sha: null });
      } else if (ch.op === 'move') {
        const f = cur.get(ch.from);
        if (!f || cur.has(ch.to)) throw clash(f ? ch.to : ch.from);
        entries.push({ path: ch.to, mode: f.mode, type: 'blob', sha: f.sha }, { path: ch.from, mode: f.mode, type: 'blob', sha: null });
      } else if (ch.op === 'make') {
        const f = cur.get(ch.path), made = await ch.make(f ? await blob(f.sha) : null);
        if (made != null) entries.push({ path: ch.path, mode: f ? f.mode : '100644', type: 'blob', sha: await putBlob({ text: made }) });
      }
    }
    if (!entries.length) return head;
    const nt = await api(base() + '/git/trees', { method: 'POST', body: { base_tree: t.sha, tree: entries } });
    const c = await api(base() + '/git/commits', { method: 'POST', body: { message: message, tree: nt.sha, parents: [head] } });
    try { await api(base() + '/git/refs/heads/' + enc(branch), { method: 'PATCH', body: { sha: c.sha, force: false } }); }
    catch (e) { if (e.code === 'conflict') throw new RVError('conflict', 'Someone else saved to ' + branch + ' at the same moment, so nothing was saved.', 'Press Commit again.'); throw e; }
    return c.sha;
  }
  /* One file on a branch of its own that starts empty (the settings): the branch is made if it is not there. */
  async function saveAlone(branch, path, content, message) {
    let exists = true;
    try { await api(base() + '/branches/' + enc(branch)); } catch (e) { if (e.code !== 'missing') throw e; exists = false; }
    if (exists) return commit(branch, [{ op: 'put', path: path, text: content }], message);
    const nt = await api(base() + '/git/trees', { method: 'POST', body: { tree: [{ path: path, mode: '100644', type: 'blob', content: content }] } });
    const c = await api(base() + '/git/commits', { method: 'POST', body: { message: message, tree: nt.sha, parents: [] } });
    await createBranch(branch, c.sha);
    return c.sha;
  }

  RV.gh = {
    target: target, loggedIn: () => !!token(), me: me, info: info, branches: branches, tree: tree, blob: blob, text: text, commits: commits,
    createBranch: createBranch, commit: commit, saveAlone: saveAlone,
  };
})();
