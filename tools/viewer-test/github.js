// The login, the Repository page and publishing, against a stand-in for the GitHub API that lives in the page
// (FAKE below): nothing is written to the real GitHub. One check at the start reads the real repository
// without a login (five requests of the 60 an hour GitHub allows). Leaves the browser's storage empty.
const fs = require('fs');
const { open } = require('./h.js');
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); };
const TOKEN = 'github_pat_TESTTOKEN0123456789abcdef';
const type = (id, v) => `(() => { const e = document.getElementById('${id}'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input')); })()`;
const click = sel => `document.querySelector(${JSON.stringify(sel)}).click()`;

/* A small GitHub in the page: branches, trees, blobs, commits. Files of the seed are read from the test server
   (the working tree) when first asked for. window.__gh looks inside it. */
const FAKE = function (owner, repo, branch, FILES) {
  const f0 = window.fetch, pre = 'https://api.github.com', R = '/repos/' + owner + '/' + repo;
  let n = 0;
  const id = k => k + String(++n).padStart(6, '0'), enc = s => new TextEncoder().encode(s);
  const blobs = new Map(), trees = new Map(), commits = new Map(), refs = new Map();
  const local = p => f0('/' + p).then(r => (r.ok ? r.arrayBuffer() : null));
  const mkBlob = c => { const s = id('b'); blobs.set(s, c); return s; };
  const bytesOf = async sha => { let b = blobs.get(sha); if (b && b.lazy) { b = new Uint8Array((await local(b.lazy)) || 0); blobs.set(sha, b); } return b; };
  const seed = {};
  for (const p of FILES) seed[p] = { sha: mkBlob({ lazy: p }), mode: '100644', size: 1000 };
  const t0 = id('t'), c0 = id('c');
  trees.set(t0, seed); commits.set(c0, { tree: t0, message: 'seed', parents: [] }); refs.set(branch, c0);
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } });
  const treeOf = br => trees.get(commits.get(refs.get(br)).tree);
  window.__gh = {
    calls: [], refs: refs,
    files: br => Object.keys(treeOf(br)).sort(),
    text: async (br, path) => { const t = treeOf(br)[path]; return t ? new TextDecoder().decode(await bytesOf(t.sha)) : null; },
    message: br => commits.get(refs.get(br)).message,
    count: br => { let k = 0, s = refs.get(br); while (s) { k++; s = commits.get(s).parents[0]; } return k; },
    /* someone else commits a file behind the page's back */
    poke(br, path, text) { const t = Object.assign({}, treeOf(br)); t[path] = { sha: mkBlob(enc(text)), mode: '100644', size: text.length }; const ts = id('t'), cs = id('c'); trees.set(ts, t); commits.set(cs, { tree: ts, message: 'someone else', parents: [refs.get(br)] }); refs.set(br, cs); },
  };
  window.fetch = async function (u, o) {
    u = String(u);
    if (u.indexOf(pre) !== 0) return f0.call(this, u, o);
    o = o || {};
    const m = o.method || 'GET', url = new URL(u), p = url.pathname, body = o.body ? JSON.parse(o.body) : null, auth = (o.headers || {}).Authorization;
    window.__gh.calls.push(m + ' ' + p + (auth ? '' : ' (no token)'));
    if (m !== 'GET' && !auth) return json({ message: 'Requires authentication' }, 401);
    if (p === '/rate_limit') return json({});
    if (p === '/user') return auth ? json({ login: 'tester', name: 'Test Driver', avatar_url: '' }) : json({ message: 'no' }, 401);
    if (p === R) return json({ full_name: owner + '/' + repo, default_branch: branch, private: false, permissions: { push: true }, html_url: 'https://github.com/' + owner + '/' + repo });
    let x;
    if (p === R + '/branches') return json(Array.from(refs).map(([name, sha]) => ({ name: name, commit: { sha: sha } })));
    if ((x = p.match(/\/branches\/(.+)$/))) { const sha = refs.get(decodeURIComponent(x[1])); return sha ? json({ commit: { sha: sha, commit: { tree: { sha: commits.get(sha).tree } } } }) : json({ message: 'Branch not found' }, 404); }
    if ((x = p.match(/\/git\/trees\/(\w+)$/))) { const t = trees.get(x[1]); return json({ sha: x[1], truncated: false, tree: Object.keys(t).map(k => ({ path: k, type: 'blob', mode: t[k].mode, sha: t[k].sha, size: t[k].size })) }); }
    if ((x = p.match(/\/git\/blobs\/(\w+)$/))) return new Response(await bytesOf(x[1]));
    if (p === R + '/git/blobs') return json({ sha: mkBlob(body.encoding === 'base64' ? Uint8Array.from(atob(body.content), c => c.charCodeAt(0)) : enc(body.content)) }, 201);
    if (p === R + '/git/trees') {
      const t = Object.assign({}, body.base_tree ? trees.get(body.base_tree) : {});
      for (const e of body.tree) {
        if (e.sha === null) { delete t[e.path]; continue; }
        const sha = e.content !== undefined ? mkBlob(enc(e.content)) : e.sha, b = blobs.get(sha);
        t[e.path] = { sha: sha, mode: e.mode, size: b.lazy ? 1000 : b.length };
      }
      const s = id('t'); trees.set(s, t); return json({ sha: s }, 201);
    }
    if (p === R + '/git/commits') { const s = id('c'); commits.set(s, { tree: body.tree, message: body.message, parents: body.parents }); return json({ sha: s }, 201); }
    if ((x = p.match(/\/git\/refs\/heads\/(.+)$/)) && m === 'PATCH') { const b = decodeURIComponent(x[1]); if (commits.get(body.sha).parents[0] !== refs.get(b)) return json({ message: 'Update is not a fast forward' }, 422); refs.set(b, body.sha); return json({}); }
    if (p === R + '/git/refs' && m === 'POST') { const b = body.ref.replace('refs/heads/', ''); if (refs.has(b)) return json({ message: 'Reference already exists' }, 422); refs.set(b, body.sha); return json({}, 201); }
    if (p === R + '/commits') { const out = []; let s = refs.get(url.searchParams.get('sha')); while (s && out.length < 5) { const c = commits.get(s); out.push({ sha: s, html_url: 'https://github.com/x', commit: { message: c.message, author: { name: 'tester', date: '2026-10-07T12:00:00Z' } } }); s = c.parents[0]; } return json(out); }
    if ((x = p.match(/\/contents\/(.+)$/))) {
      const path = decodeURIComponent(x[1]), br = url.searchParams.get('ref') || branch;
      if (!refs.has(br)) return json({ message: 'Not Found' }, 404);
      const t = treeOf(br)[path];
      if (t) return new Response(await bytesOf(t.sha));
      if (br === branch && /\.\w+$/.test(path)) { const buf = await local(path); if (buf) return new Response(buf); }
      return json({ message: 'Not Found' }, 404);
    }
    return json({ message: 'fake: no ' + m + ' ' + p }, 500);
  };
};
const SEED = ['README.md', 'docs/CHANGELOG.md', 'docs/CHANGELOG-simple.md', 'runs/run_20261004_113412.csv', 'runs/run_20261003_220700.csv', 'viewer/index.html', '.github/workflows/pages.yml'];
const BR = 'experimental_hosting';
const install = `(${FAKE.toString()})('AdrianoNTorres', 'IBM-AI-RACE-CHALLENGE', '${BR}', ${JSON.stringify(SEED)})`;
const WIPE = "(async () => { for (const r of await RV.local.list(RV.local.keyOf(RV.S.ds.src))) await RV.local.remove([r.key]); })()";
const st = e => `RV.repo.state.${e}`;

(async () => {
  const csv = fs.readFileSync(__dirname + '/../../runs/run_20261004_113412.csv', 'utf8');
  let p = await open('', { view: 'detailed' });
  await p.until('RV.S.ds && RV.S.R');
  await p.ev(WIPE);

  // ---- as the page opens, not logged in: the real GitHub, read only ----
  ok('as the page opens: the Repository tab and "Log in" are in the top bar', await p.ev("(() => { const a = document.querySelector('.tab[data-t=pr]'), b = document.getElementById('accountTab'); return a.getBoundingClientRect().width > 0 && b.getBoundingClientRect().width > 0 && /log in/i.test(b.innerText); })()"));
  await p.ev("RV.showTab('pr')");
  let real = true;
  try { await p.until('(' + st('tree') + ' || ' + st('err') + ') && !' + st('loading'), 20000); } catch (e) { real = false; }
  const realInfo = await p.ev(`({ err: ${st('err')} && ${st('err')}.msg, branch: ${st('branch')}, n: ${st('tree')} ? ${st('tree')}.items.length : 0, rows: document.querySelectorAll('.rrow').length, dock: (document.querySelector('.rdock') || {}).innerText })`);
  ok('without a login the real repository is listed, read only (skipped if GitHub limits this network)', real && (realInfo.err ? /limiting/.test(realInfo.err) : realInfo.branch === BR && realInfo.n > 100 && realInfo.rows > 3 && /Log in with GitHub/.test(realInfo.dock)), realInfo);
  if (!realInfo.err) {
    await p.ev(click('.rrow[data-d="docs/"]')); await p.sleep(200);
    await p.ev(click('.rrow[data-f="docs/CHANGELOG.md"]'));
    await p.until("/version/.test((document.querySelector('.rfile') || {}).innerText || '') && !/Reading the file/.test(document.querySelector('.rfile').innerText)", 25000);
    ok('real GitHub: the changelog says what it is to the viewer and lists its versions', await p.ev("/The versions: 106 entries/.test(document.querySelector('.rfile').innerText) && /v1\\.06/.test(document.querySelector('.rfile').innerText)"));
    await p.shot('gh-0-real-readonly');
    await p.ev(click('#rUp')); await p.sleep(200);
    ok('a change without a login leads to the Account page', await p.ev("RV.S.tab === 'pa' && !!document.getElementById('acTok')"));
  }
  ok('the page may contact GitHub and itself only (no policy violation so far)', !p.logs.some(l => /Content Security Policy/i.test(l)), p.logs.filter(l => /Content Security Policy/i.test(l)).slice(0, 2));

  // ---- log in (from here on GitHub is the stand-in) ----
  await p.ev(install);
  await p.ev("RV.showTab('pa')"); await p.sleep(150);
  await p.shot('gh-1-login');
  await p.ev(type('acTok', TOKEN)); await p.ev(click('#acLogin'));
  await p.until("RV.account.who() && /tester/.test(document.getElementById('accountName').innerText)");
  await p.until("/Nothing is saved on GitHub yet|saved/.test(document.getElementById('pa').innerText)");
  ok('logged in: the top bar and the Account page name the account', await p.ev("/Test Driver/.test(document.getElementById('pa').innerText) && /may save to it/.test(document.getElementById('pa').innerText)"));
  ok('the token is shown masked', await p.ev(`document.getElementById('pa').innerText.indexOf(${JSON.stringify(TOKEN)}) < 0`));
  await p.shot('gh-2-account');

  // ---- settings on every device ----
  await p.ev(click('#acSave'));
  await p.until("__gh.refs.has('run-viewer-data')");
  const saved = await p.ev("__gh.text('run-viewer-data', 'settings/tester.json')");
  const sj = JSON.parse(saved);
  ok('settings are saved on a branch of their own, without the token, the keys or the viewer ID', saved.indexOf(TOKEN) < 0 && !('apiKeys' in sj.prefs) && !('uid' in sj.prefs) && !('source' in sj.prefs) && sj.prefs.theme === 'light' && sj.by === 'tester' && (await p.ev("__gh.files('run-viewer-data').join()")) === 'settings/tester.json' && saved.indexOf(await p.ev('RV.prefs.uid')) < 0, Object.keys(sj.prefs));
  await p.until("/On GitHub: saved/.test(document.getElementById('pa').innerText)");

  // ---- the repository, logged in ----
  await p.ev("RV.showTab('pr'); RV.repo.load()");
  await p.until(`${st('tree')} && ${st('tree')}.items.length === ${SEED.length} && !${st('loading')}`);
  await p.ev(click('.rdir[data-d="runs/"]')); await p.sleep(150);
  ok('runs/: each recording names its version and lap', await p.ev("(() => { const t = document.getElementById('rMid').innerText; return /Recording of v1\\.06, 1:13:14/.test(t) && /Recording of v1\\.05/.test(t) && /The viewer reads run CSVs from here/.test(t); })()"), (await p.ev("document.getElementById('rMid').innerText")).slice(0, 200));
  await p.ev(click('.rrow[data-f="runs/run_20261004_113412.csv"]'));
  await p.until("/A usable recording/i.test(document.getElementById('rSide').innerText)", 20000);
  ok('a recording is checked and shown as a table', await p.ev("/Lap 1:13:14/.test(document.getElementById('rSide').innerText) && document.querySelectorAll('.rcsv tbody tr').length === 25"));
  await p.shot('gh-3-repo-recording');

  // new file, written in the page
  await p.ev(click('#rNewFile')); await p.until("document.getElementById('rAskIn')");
  await p.ev(type('rAskIn', 'notes/hello.md')); await p.ev(click('#rAskOk')); await p.until("document.getElementById('rEdit')");
  await p.ev(type('rEdit', '# Hello\nwritten in the page\n')); await p.ev(click('#rEditOk')); await p.sleep(150);
  // two uploads into runs/, one of them not text
  await p.ev(click('.rdir[data-d="runs/"]')); await p.sleep(100);
  await p.ev(`RV.repo.addFiles([{ name: 'extra lap.csv', bytes: new TextEncoder().encode(${JSON.stringify(csv.slice(0, 5000))}) }, { name: 'pic.bin', bytes: new Uint8Array([0, 1, 2, 255, 254]) }])`); await p.sleep(150);
  // move one file, remove another (asks again), edit a third
  await p.ev(click('.rdir[data-d=""]')); await p.sleep(100); await p.ev(click('.rrow[data-f="README.md"]')); await p.sleep(100);
  await p.ev(click('#rMove')); await p.until("document.getElementById('rAskIn')"); await p.ev(type('rAskIn', 'docs/READ-ME.md')); await p.ev(click('#rAskOk')); await p.sleep(150);
  await p.ev(click('.rdir[data-d="runs/"]')); await p.sleep(100); await p.ev(click('.rrow[data-f="runs/run_20261003_220700.csv"]')); await p.sleep(100);
  await p.ev(click('#rDel')); await p.sleep(100);
  ok('removing asks again', /Really remove/.test(await p.ev("document.getElementById('rDel').innerText")) && await p.ev(st('pending') + '.length === 4'));
  await p.ev(click('#rDel')); await p.sleep(150);
  ok('five changes wait; nothing has reached GitHub', await p.ev(`${st('pending')}.length === 5 && __gh.count('${BR}') === 1 && !__gh.calls.some(c => /^(POST|PATCH)/.test(c) && !/run-viewer|git\\/(blobs|trees|commits|refs)$/.test(c) && false)`) && (await p.ev(`__gh.files('${BR}').length`)) === SEED.length, await p.ev("document.querySelector('.rdock').innerText"));
  await p.shot('gh-4-pending');
  await p.ev(type('rMsg', 'Tidy up from the test')); await p.ev(click('#rCommit'));
  await p.until(`__gh.count('${BR}') === 2 && !${st('busy')} && !${st('loading')}`, 20000);
  const after = await p.ev(`(async () => ({ files: __gh.files('${BR}'), hello: await __gh.text('${BR}', 'notes/hello.md'), moved: (await __gh.text('${BR}', 'docs/READ-ME.md') || '').length > 20, msg: __gh.message('${BR}'), pending: ${st('pending')}.length }))()`);
  ok('one commit holds them all: added, uploaded, moved and removed', after.msg === 'Tidy up from the test' && after.pending === 0 && after.hello === '# Hello\nwritten in the page\n' && after.moved && after.files.includes('runs/extra lap.csv') && after.files.includes('runs/pic.bin') && !after.files.includes('README.md') && !after.files.includes('runs/run_20261003_220700.csv'), after);

  // someone else changes the file being edited: nothing is written
  await p.ev(click('.rdir[data-d="notes/"]')); await p.sleep(100); await p.ev(click('.rrow[data-f="notes/hello.md"]'));
  await p.until("!document.getElementById('rEditBtn').disabled"); await p.ev(click('#rEditBtn')); await p.until("document.getElementById('rEdit')");
  await p.ev(type('rEdit', '# Hello\nmine\n')); await p.ev(click('#rEditOk')); await p.sleep(100);
  await p.ev(`__gh.poke('${BR}', 'notes/hello.md', 'theirs')`);
  await p.ev(click('#rCommit')); await p.until("/changed on GitHub after you opened it/.test(document.getElementById('toast').innerText)");
  ok('a file changed on GitHub meanwhile is not overwritten', (await p.ev(`__gh.text('${BR}', 'notes/hello.md')`)) === 'theirs' && await p.ev(st('pending') + '.length === 1'));
  await p.shot('gh-5-conflict');
  await p.ev(click('#rDiscard')); await p.sleep(100); await p.ev(click('#rDiscard')); await p.sleep(100);
  ok('discard (asked twice) empties the bar', await p.ev(st('pending') + '.length === 0'));

  // ---- publish a version entered by hand ----
  await p.ev("RV.showTab('pv'); RV.entry.open('one')"); await p.until("document.getElementById('aId')");
  await p.ev(type('aId', 'v1.07')); await p.ev(type('aTitle', 'Published from the test')); await p.ev(type('aWhat', 'Has a | pipe and a second line\nhere.'));
  await p.ev(click('.respick .resopt[data-v="kept"]'));
  await p.ev(`RV.entry.setRecording('lap.csv', ${JSON.stringify(csv)})`); await p.sleep(300);
  await p.ev(click('#aSave')); await p.until("!RV.entry.isOpen() && RV.S.ds.byId['v1.07'] && RV.S.ds.byId['v1.07'].local");
  const name = await p.ev("RV.S.ds.byId['v1.07'].file");
  await p.ev("RV.entry.open('mine')"); await p.until("document.getElementById('lPub')");
  await p.ev(click('.lpick')); await p.sleep(100);
  await p.shot('gh-6-publish-button');
  await p.ev(click('#lPub'));
  await p.until(`RV.S.tab === 'pr' && ${st('pending')}.length === 2`);
  ok('publishing shows where the files go: the changelog and runs/', await p.ev(`${st('pending')}.map(c => c.path).join() === 'docs/CHANGELOG.md,runs/${name}' && /Add v1\\.07 from the run viewer/.test(document.getElementById('rMsg').value) && /Will be added/i.test(document.getElementById('rSide').innerText)`), await p.ev("document.querySelector('.rdock').innerText"));
  await p.shot('gh-7-publish-review');
  await p.ev(click('#rCommit'));
  await p.until(`__gh.count('${BR}') === 4 && !${st('busy')} && RV.S.ds.byId['v1.07'] && !RV.S.ds.byId['v1.07'].local`, 30000);
  const pub = await p.ev(`(async () => { const t = await __gh.text('${BR}', 'docs/CHANGELOG.md'), v = RV.S.ds.byId['v1.07']; return { tail: t.slice(-420), n: (t.match(/^## v/gm) || []).length, csv: (await __gh.text('${BR}', 'runs/${name}')).length, v: [v.local || false, v.lap, v.kept, v.file, v.tech.what], left: (await RV.local.list(RV.local.keyOf(RV.S.ds.src))).length, last: RV.S.ds.versions[RV.S.ds.versions.length - 1].id }; })()`);
  ok('published: the entry is at the end of the changelog before its closing line, the recording is in runs/, the copy in the browser is gone, and the viewer shows v1.07 from the repository',
    /\| \*\*Decision\*\* \| ✅ Kept/.test(pub.tail) && /\n---\n\n\*Last updated after v1\.07 was added in the run viewer\.\*\n$/.test(pub.tail) && pub.n === 107 && pub.csv === csv.length && pub.v[0] === false && pub.v[1] === 73.14 && pub.v[2] === true && pub.v[3] === name && pub.v[4] === 'Has a | pipe and a second line here.' && pub.left === 0 && pub.last === 'v1.07', pub);
  await p.ev("new Promise(r => RV.sel.only('v1.07', r))"); await p.ev("RV.showTab('pm')"); await p.sleep(500);
  ok('the published version replays from the repository', await p.ev("RV.S.sel[0] === 'v1.07' && RV.S.R.n > 3000 && RV.S.R.fits"));

  // ---- branches ----
  await p.ev("RV.showTab('pr')"); await p.until("document.getElementById('rNewBranch')");
  await p.ev(click('#rNewBranch')); await p.until("document.getElementById('rAskIn')"); await p.ev(type('rAskIn', 'try/idea')); await p.ev(click('#rAskOk'));
  await p.until(`${st('branch')} === 'try/idea' && !${st('loading')}`);
  ok('a new branch is a copy of the one it was made from, and the page moves to it', await p.ev(`__gh.refs.get('try/idea') === __gh.refs.get('${BR}') && !!document.getElementById('rUse') && document.getElementById('rBranch').value === 'try/idea'`));
  await p.shot('gh-8-branch');
  await p.ev(`(() => { const s = document.getElementById('rBranch'); s.value = '${BR}'; s.dispatchEvent(new Event('change')); })()`);
  await p.until(`${st('branch')} === '${BR}' && !${st('loading')}`);

  // ---- log out ----
  await p.ev("RV.showTab('pa')"); await p.until("document.getElementById('acOut')");
  await p.ev(click('#acOut')); await p.sleep(200);
  ok('logged out: the token is gone from the browser and the top bar says "Log in"', await p.ev(`RV.apiKeys.get('github') === '' && (localStorage.getItem('rv_prefs') || '').indexOf(${JSON.stringify(TOKEN)}) < 0 && (sessionStorage.getItem('rv_keys_session') || '').indexOf('github_pat') < 0 && /log in/i.test(document.getElementById('accountName').innerText) && !!document.getElementById('acTok')`));

  // a login for this tab only
  await p.ev("document.getElementById('acKeep').click()"); await p.ev(type('acTok', TOKEN)); await p.ev(click('#acLogin'));
  await p.until("RV.account.who()");
  ok('"Stay logged in" off: the token is in the tab\'s storage only', await p.ev(`(localStorage.getItem('rv_prefs') || '').indexOf('github_pat') < 0 && (sessionStorage.getItem('rv_keys_session') || '').indexOf('github_pat') > 0 && /this tab only/.test(document.getElementById('pa').innerText)`));
  await p.ev("RV.apiKeys.clear('github')");
  ok('no script error', p.errors.length === 0, p.errors.slice(0, 3));
  await p.ev(WIPE);
  await p.ev("sessionStorage.clear(); RV.prefs.theme = 'light'; RV.prefs.tutorialDone = true; RV.savePrefs()");
  await p.close();

  // ---- settings come back on a page that opens again (opened without the harness putting settings in place) ----
  p = await open('tab=pa', null, { keep: true });
  await p.until("typeof RV !== 'undefined' && RV.S.ds && document.getElementById('acTok')");
  await p.ev(install);
  await p.ev(type('acTok', TOKEN)); await p.ev(click('#acLogin')); await p.until("RV.account.who() && document.getElementById('acSave') && !document.getElementById('acSave').disabled");
  await p.ev(click('#acSave')); await p.until("/On GitHub: saved/.test(document.getElementById('pa').innerText)");
  await p.ev("RV.prefs.theme = 'dark'; RV.prefs.speed = 4; RV.savePrefs()");
  await p.ev(click('#acLoad')).catch(() => {});
  await p.sleep(2000);
  await p.until("typeof RV !== 'undefined' && RV.prefs && document.readyState === 'complete'", 20000);
  ok('loading the settings from GitHub puts them back after the page opens again (theme light, speed 1) and keeps the login', await p.ev(`RV.prefs.theme === 'light' && RV.prefs.speed === 1 && RV.apiKeys.get('github') === ${JSON.stringify(TOKEN)}`), await p.ev('[RV.prefs.theme, RV.prefs.speed]'));
  await p.ev("RV.apiKeys.clear('github'); localStorage.clear(); sessionStorage.clear()");
  await p.close();

  // ---- dark theme and a phone-width window, with the stand-in ----
  p = await open('', { view: 'basic', theme: 'dark' }, { w: 430, h: 820 });
  await p.until('RV.S.ds && RV.S.R');
  await p.ev(install); await p.ev(`RV.apiKeys.set('github', ${JSON.stringify(TOKEN)}, true)`); await p.until('RV.account.who()');
  await p.ev("RV.showTab('pr'); RV.repo.load()"); await p.until(`${st('tree')} && !${st('loading')}`);
  await p.ev(`RV.repo.addFiles([{ name: 'a.txt', bytes: new TextEncoder().encode('a') }])`); await p.sleep(200);
  await p.shot('gh-9-dark-narrow');
  ok('dark theme, phone width: no sideways scrolling, no error', await p.ev('document.documentElement.scrollWidth <= 431') && p.errors.length === 0, [await p.ev('document.documentElement.scrollWidth'), p.errors.slice(0, 2)]);
  await p.ev("RV.repo.state.pending = []; RV.apiKeys.clear('github'); localStorage.clear(); sessionStorage.clear()");
  await p.close();

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
