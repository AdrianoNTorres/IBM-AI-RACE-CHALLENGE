// Security checks. What a visitor without rights can do to the repository (nothing), and what the page refuses:
// scripts that are not its own files, connections to other sites, running inside another site's frame, and
// unsafe values in a settings file read from GitHub. One request goes to the real GitHub, without a token.
const { open } = require('./h.js');
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); };
const TOKEN = 'github_pat_TESTTOKEN0123456789abcdef';
const type = (id, v) => `(() => { const e = document.getElementById('${id}'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input')); })()`;
const click = sel => `document.querySelector(${JSON.stringify(sel)}).click()`;
/* a GitHub that knows one account, which may read but not write; settings can be planted in it */
const FAKE = function () {
  const f0 = window.fetch, R = '/repos/AdrianoNTorres/IBM-AI-RACE-CHALLENGE';
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } });
  window.__gh = { writes: [], settings: null, canWrite: false };
  window.fetch = async function (u, o) {
    u = String(u);
    if (u.indexOf('https://api.github.com') !== 0) return f0.call(this, u, o);
    o = o || {};
    const m = o.method || 'GET', url = new URL(u), p = url.pathname;
    if (m !== 'GET') { window.__gh.writes.push(m + ' ' + p); return json({ message: 'Resource not accessible by personal access token' }, 403); }
    if (p === '/rate_limit') return json({});
    if (p === '/user') return json({ login: 'stranger', name: 'A Stranger', avatar_url: '' });
    if (p === R) return json({ full_name: 'AdrianoNTorres/IBM-AI-RACE-CHALLENGE', default_branch: 'experimental_hosting', private: false, permissions: { push: window.__gh.canWrite, pull: true }, html_url: 'https://github.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE' });
    if (p === R + '/branches') return json([{ name: 'experimental_hosting', commit: { sha: 'c1' } }]);
    if (p === R + '/branches/experimental_hosting') return json({ commit: { sha: 'c1', commit: { tree: { sha: 't1' } } } });
    if (p === R + '/branches/run-viewer-data') return window.__gh.settings ? json({ commit: { sha: 'c2', commit: { tree: { sha: 't2' } } } }) : json({ message: 'Branch not found' }, 404);
    if (p === R + '/git/trees/t1') return json({ sha: 't1', truncated: false, tree: [{ path: 'README.md', type: 'blob', mode: '100644', sha: 'b1', size: 10 }, { path: 'docs/CHANGELOG.md', type: 'blob', mode: '100644', sha: 'b2', size: 10 }] });
    if (p === R + '/commits') return json([]);
    if (p.indexOf(R + '/git/blobs/') === 0) return new Response('hello');
    if (p === R + '/contents/settings/stranger.json') return window.__gh.settings ? new Response(window.__gh.settings) : json({ message: 'Not Found' }, 404);
    if (p.indexOf(R + '/contents/') === 0) { const r = await f0('/' + decodeURIComponent(p.slice((R + '/contents/').length))); return r.ok ? new Response(await r.arrayBuffer()) : json({ message: 'Not Found' }, 404); }
    return json({ message: 'fake: no ' + m + ' ' + p }, 500);
  };
};
const install = '(' + FAKE.toString() + ')()';

(async () => {
  // ---- the real GitHub refuses a write without a token (this is what protects the repository) ----
  const r = await fetch('https://api.github.com/repos/AdrianoNTorres/IBM-AI-RACE-CHALLENGE/git/blobs', { method: 'POST', headers: { Accept: 'application/vnd.github+json' }, body: JSON.stringify({ content: 'x', encoding: 'utf-8' }) });
  ok('the real GitHub refuses a write to the repository from someone without a token', r.status === 401 || r.status === 403 || r.status === 404, r.status);

  let p = await open('', { view: 'detailed' });
  await p.until('RV.S.ds && RV.S.R');

  // ---- the page runs its own script files only ----
  ok('the page holds no script of its own in the HTML', await p.ev("Array.from(document.scripts).every(s => s.src && new URL(s.src).origin === location.origin)"));
  await p.ev("(() => { const s = document.createElement('script'); s.textContent = 'window.__ran1 = 1'; document.head.appendChild(s); const d = document.createElement('div'); d.innerHTML = '<img src=\"nothing.png\" onerror=\"window.__ran2 = 1\"><a id=\"jsl\" href=\"javascript:window.__ran3=1\">x</a>'; document.body.appendChild(d); document.getElementById('jsl').click(); })()");
  await p.sleep(500);
  ok('a script put into the page from outside its files does not run (script element, onerror, javascript: link)', await p.ev("window.__ran1 === undefined && window.__ran2 === undefined && window.__ran3 === undefined"), await p.ev('[window.__ran1, window.__ran2, window.__ran3]'));
  await p.ev("(() => { const s = document.createElement('script'); s.src = 'https://example.com/x.js'; s.onload = () => { window.__ran4 = 1; }; document.head.appendChild(s); })()");
  const sent = await p.ev("Promise.all(['https://example.com/', 'https://gist.githubusercontent.com/x', 'https://github.com/'].map(u => fetch(u, { mode: 'no-cors' }).then(() => 'went', () => 'blocked')))");
  ok('the page cannot send anything to another site', sent.every(x => x === 'blocked') && await p.ev('window.__ran4 === undefined'), sent);
  ok('the browser reported those attempts as blocked by the policy', p.logs.filter(l => /Content Security Policy/i.test(l)).length >= 3, p.logs.filter(l => /Content Security Policy/i.test(l)).length);

  // ---- text from a changelog cannot become code: a version with markup in every field ----
  await p.ev("(async () => { for (const r of await RV.local.list(RV.local.keyOf(RV.S.ds.src))) await RV.local.remove([r.key]); })()");
  const X = '<img src=x onerror="window.__ran5=1"><script>window.__ran5=1</scr' + 'ipt>';
  await p.ev(`(async () => { const k = RV.local.keyOf(RV.S.ds.src); await RV.local.put({ key: k + '|v9.99', src: k, id: 'v9.99', title: ${JSON.stringify(X)}, result: 'kept', lap: 70, top: 300, slow: 60, damage: ${JSON.stringify(X)}, what: ${JSON.stringify(X)}, why: ${JSON.stringify(X)}, prediction: '', observed: ${JSON.stringify(X)}, decision: ${JSON.stringify(X)}, learned: ${JSON.stringify(X)}, csvName: null, csvSize: 0, added: 1 }); const ds = await RV.data.openSource(RV.S.ds.src, { reuse: RV.S.ds }); await RV.useDataset(ds, { detail: 'v9.99' }); })()`);
  for (const t of ['pv', 'pm', 'pt']) { await p.ev(`RV.showTab('${t}')`); await p.sleep(250); }
  await p.ev("RV.showTab('pv'); RV.entry.open('mine')"); await p.sleep(300);
  ok('a version whose every text is markup is shown as text: no element was made from it, nothing ran', await p.ev("window.__ran5 === undefined && !document.querySelector('#main img[src=x], .keydlg img[src=x]') && /<img src=x/.test(document.getElementById('vside').innerText)"));
  await p.ev("RV.entry.close(); (async () => { for (const r of await RV.local.list(RV.local.keyOf(RV.S.ds.src))) await RV.local.remove([r.key]); })()");

  // ---- a visitor logged in with a token of their own: the account may read, not write ----
  await p.ev(install);
  await p.ev("RV.showTab('pa')"); await p.sleep(150);
  await p.ev(type('acTok', TOKEN)); await p.ev(click('#acLogin'));
  await p.until("RV.account.who() && /may only read it/.test(document.getElementById('pa').innerText)");
  ok('Account says the visitor may only read the repository', true);
  await p.ev("RV.showTab('pr')"); await p.until("RV.repo.state.tree && !RV.repo.state.loading && document.querySelector('.rdock')");
  ok('Repository says so too', /may only read this repository/.test(await p.ev("document.querySelector('.rdock').innerText")));
  for (const b of ['#rUp', '#rNewFile', '#rNewDir', '#rNewBranch']) { await p.ev(click(b)); await p.sleep(80); }
  await p.ev(click('.rrow[data-f="README.md"]')); await p.sleep(300);
  for (const b of ['#rEditBtn', '#rMove', '#rDel']) { await p.ev(`(() => { const e = document.querySelector('${b}'); if (e && !e.disabled) e.click(); })()`); await p.sleep(80); }
  ok('none of the change buttons collects a change for such a visitor', await p.ev("RV.repo.state.pending.length === 0 && !RV.repo.state.ask && !RV.repo.state.edit && __gh.writes.length === 0"), await p.ev("document.getElementById('toast').innerText"));
  await p.shot('sec-1-readonly');
  // even with the page's own checks bypassed, GitHub refuses and nothing is saved
  const forced = await p.ev("RV.gh.commit('experimental_hosting', [{ op: 'del', path: 'README.md' }], 'forced').then(() => 'saved', e => e.code + ': ' + e.message)");
  ok('with the page\'s own checks bypassed, the write is refused by GitHub and reported', /^forbidden/.test(forced), forced);
  const forced2 = await p.ev("RV.gh.createBranch('x', 'c1').then(() => 'saved', e => e.code)");
  ok('the same for a new branch', forced2 === 'forbidden', forced2);

  // ---- a settings file someone tampered with ----
  await p.ev("RV.apiKeys.clear('github'); sessionStorage.clear(); RV.prefs.tutorialDone = true; RV.prefs.theme = 'light'; RV.savePrefs()");
  await p.close();
  p = await open('tab=pa', null, { keep: true });
  await p.until("typeof RV !== 'undefined' && RV.S.ds && (document.getElementById('acTok') || document.getElementById('acOut'))");
  await p.ev(install); await p.ev('__gh.canWrite = true');
  const bad = { app: 'run-viewer', saved: '2026-10-07T10:00:00Z', by: 'stranger', prefs: {
    theme: 'dark', speed: 2, view: 'detailed', camera: 'sideways', loopDim: 5,
    apiKeys: { github: 'github_pat_STOLEN' }, uid: 'someone-else', source: { kind: 'github', link: 'https://github.com/evil/repo' }, tutorialDone: false,
    themes: [{ id: 'bad id!', name: 'x', base: 'dark', colors: { bg: '#000' } }, { id: 'a1', name: '<img src=x onerror=alert(1)>', base: 'dark', colors: { bg: '#000' } },
      { id: 'ok1', name: 'Fine', base: 'dark', colors: { bg: '#101010', 'bad key!': '#fff', accent: 'url(https://evil.example/x)', ink: 'red;background:url(//evil)', line: 'rgba(20, 22, 27, .62)' } }],
    keys: { play: 'p', nosuch: 'q', fwd: { a: 1 } },
    ui: { sideTab: '<script>alert(1)</scr' + 'ipt>', listMode: 'fast', carScale: { 'v1.06': 1.5 }, deep: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }, fn: 'x'.repeat(500) } } };
  await p.ev(`__gh.settings = ${JSON.stringify(JSON.stringify(bad))}`);
  await p.ev(type('acTok', TOKEN)); await p.ev(click('#acLogin'));
  await p.until("document.getElementById('acLoad') && !document.getElementById('acLoad').disabled");
  await p.ev(click('#acLoad')).catch(() => {});
  await p.sleep(2000);
  await p.until("typeof RV !== 'undefined' && RV.prefs && document.readyState === 'complete'", 20000);
  const got = await p.ev("({ theme: RV.prefs.theme, speed: RV.prefs.speed, camera: RV.prefs.camera, loopDim: RV.prefs.loopDim, key: RV.apiKeys.get('github'), uid: RV.prefs.uid, link: RV.prefs.source.link, tut: RV.prefs.tutorialDone, themes: RV.prefs.themes, keys: RV.prefs.keys, ui: [RV.prefs.ui.sideTab, RV.prefs.ui.listMode, RV.prefs.ui.carScale, RV.prefs.ui.fn, JSON.stringify(RV.prefs.ui.deep)] })");
  ok('a tampered settings file: the good values are taken (theme, speed, list, car size)', got.theme === 'dark' && got.speed === 2 && got.ui[1] === 'fast' && got.ui[2] && got.ui[2]['v1.06'] === 1.5, [got.theme, got.speed, got.ui[1], got.ui[2]]);
  ok('... the key, the viewer ID and the data source are not touched by it', got.key === TOKEN && got.uid !== 'someone-else' && got.link === await p.ev('RV.DEFAULT_LINK') && got.tut === true, [got.key === TOKEN, got.link]);
  ok('... and everything of the wrong shape is dropped (markup, style tricks, unknown keys, absurd numbers)',
    got.camera === 'fit' && got.loopDim === 0.55 && got.themes.length === 1 && got.themes[0].id === 'ok1' && JSON.stringify(Object.keys(got.themes[0].colors).sort()) === '["bg","line"]' && JSON.stringify(got.keys) === '{"play":"p"}' && got.ui[0] == null && got.ui[3] == null && !/g/.test(got.ui[4] || ''), got);
  ok('no script error', p.errors.length === 0, p.errors.slice(0, 3));
  await p.ev("RV.apiKeys.clear('github'); localStorage.clear(); sessionStorage.clear()");
  await p.close();

  // ---- inside another site's frame the page does not run ----
  p = await open('', { view: 'detailed' }, { url: 'http://127.0.0.1:8765/tools/viewer-test/frame.html' });
  await p.sleep(2500);
  const fr = await p.ev("(() => { const d = document.getElementById('f').contentDocument, w = document.getElementById('f').contentWindow; return { text: d.body.innerText, started: !!(w.RV && w.RV.S && w.RV.S.ds) || (w.__fetched || []).length > 0, tabs: d.querySelectorAll('.tab').length }; })()");
  ok('put inside a frame, the page shows a note and does not start', /does not run inside another page/.test(fr.text) && !fr.started && fr.tabs === 0, fr);
  await p.close();

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
