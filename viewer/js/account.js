/* Run viewer: the Account page. Logging in means giving the page a GitHub token of the reader's own (the key
   system of js/keys.js keeps it: in this browser, or for this tab only). Logged in, the page can save versions
   and files to the repository (js/repo.js) and keep the reader's settings in it, so another device has them.
   What is saved to GitHub never holds a key, the token or the viewer ID. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc, G = RV.gh, K = RV.apiKeys;

  /* the settings that travel: how the site looks and behaves. Never apiKeys (keys), uid (this browser) or source. */
  const SYNC = ['theme', 'themes', 'view', 'speed', 'autoplay', 'sync', 'autoLoop', 'camera', 'smooth', 'loopDim', 'carSize', 'keys', 'ui'];
  const BRANCH = 'run-viewer-data';                     /* a branch of its own, so the settings stay out of the project's history */
  const fileOf = login => 'settings/' + login + '.json';

  let who = null, whoErr = null, info = null, remote = undefined, working = '', showTok = false, lastTok = null;
  const person = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.7-5.4 7.2-5.4s6.3 1.8 7.2 5.4"/></svg>';

  /* the name in the top bar */
  function paintTop() {
    const m = $('accountMark'), n = $('accountName');
    if (!m) return;
    m.innerHTML = who && who.avatar ? '<img src="' + esc(who.avatar) + '&s=48" alt="" width="22" height="22">' : person;
    n.textContent = who ? who.login : (G.loggedIn() ? 'Account' : 'Log in');
  }
  /* asks GitHub who the token belongs to and what it may do here; called whenever the token or its status changes */
  async function refresh() {
    const tok = K.get('github');
    if (tok === lastTok && (who || whoErr || !tok)) { paintTop(); return; }
    lastTok = tok; who = null; whoErr = null; info = null; remote = undefined;
    paintTop();
    if (!tok) { if (S.tab === 'pa') render(); return; }
    try { who = await G.me(); } catch (e) { if (K.get('github') === tok) whoErr = RV.explain(e); }
    if (K.get('github') !== tok) return;
    paintTop();
    if (S.tab === 'pa') render();
    if (who && G.target()) {
      try { info = await G.info(); } catch (e) { info = null; }
      if (K.get('github') !== tok) return;
      try { const t = await G.text(fileOf(who.login), BRANCH); remote = t == null ? null : JSON.parse(t); } catch (e) { remote = null; }
      if (K.get('github') === tok && S.tab === 'pa') render();
    }
  }

  /* ---------- settings on every device ---------- */
  /* The settings file is read from a repository other people may be able to write to, so it is not trusted: only the
     known settings are taken, each only in its expected shape, and nothing that could carry code or a link. */
  function clean(p) {
    const out = {}, str = (v, n) => typeof v === 'string' && v.length <= n && !/[<>]/.test(v), num = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;
    const colour = v => str(v, 60) && !/[;{}\\]|url\s*\(|expression|@import/i.test(v);
    if (str(p.theme, 80) && /^(light|dark|system|custom:[\w-]{1,60})$/.test(p.theme)) out.theme = p.theme;
    if (Array.isArray(p.themes)) out.themes = p.themes.slice(0, 40).filter(t => t && str(t.id, 60) && /^[\w-]+$/.test(t.id) && str(t.name, 60) && t.colors && typeof t.colors === 'object').map(t => {
      const colors = {};
      for (const k in t.colors) if (/^[a-z0-9-]{1,40}$/.test(k) && colour(t.colors[k])) colors[k] = t.colors[k];
      return { id: t.id, name: t.name, base: t.base === 'dark' ? 'dark' : 'light', colors: colors };
    });
    if (p.view === 'basic' || p.view === 'detailed') out.view = p.view;
    if (num(p.speed, 0.1, 4)) out.speed = p.speed;
    for (const k of ['autoplay', 'autoLoop', 'smooth']) if (typeof p[k] === 'boolean') out[k] = p[k];
    if (p.sync === 't' || p.sync === 'd') out.sync = p.sync;
    if (['fit', 'follow', 'up'].includes(p.camera)) out.camera = p.camera;
    if (num(p.loopDim, 0, 0.9)) out.loopDim = p.loopDim;
    if (num(p.carSize, 0.3, 4)) out.carSize = p.carSize;
    if (p.keys && typeof p.keys === 'object') { out.keys = {}; for (const a of RV.KEYS) if (str(p.keys[a.id], 20)) out.keys[a.id] = p.keys[a.id]; }
    /* the layout: plain values only (numbers, switches, short words), a few levels deep, and not too much of it */
    const plain = (v, depth) => {
      if (v === null || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) return v;
      if (typeof v === 'string') return str(v, 80) ? v : undefined;
      if (depth > 5 || typeof v !== 'object') return undefined;
      if (Array.isArray(v)) return v.slice(0, 200).map(x => plain(x, depth + 1)).filter(x => x !== undefined);
      const o = {};
      for (const k of Object.keys(v).slice(0, 200)) if (/^[\w.:-]{1,60}$/.test(k) && k !== '__proto__' && k !== 'constructor' && k !== 'prototype') { const x = plain(v[k], depth + 1); if (x !== undefined) o[k] = x; }
      return o;
    };
    if (p.ui && typeof p.ui === 'object' && !Array.isArray(p.ui)) out.ui = plain(p.ui, 0);
    return out;
  }
  async function saveSettings() {
    if (working || !who) return;
    working = 'save'; render();
    try {
      const prefs = {};
      for (const k of SYNC) prefs[k] = RV.prefs[k];
      const data = { app: 'run-viewer', saved: new Date().toISOString(), by: who.login, prefs: prefs };
      await G.saveAlone(BRANCH, fileOf(who.login), JSON.stringify(data, null, 1) + '\n', 'Run viewer settings of ' + who.login);
      remote = data;
      RV.toast('Settings saved to GitHub.');
    } catch (e) { const x = RV.explain(e); RV.toast(x.msg + (x.hint ? ' ' + x.hint : ''), 'err'); }
    working = ''; render();
  }
  async function loadSettings() {
    if (working || !who) return;
    working = 'load'; render();
    try {
      const t = await G.text(fileOf(who.login), BRANCH);
      if (t == null) { remote = null; RV.toast('No settings are saved on GitHub yet. Save them from the device that has them.'); working = ''; render(); return; }
      const data = JSON.parse(t), p = data && data.prefs;
      if (!p || typeof p !== 'object') throw new RV.RVError('format', 'The settings file on GitHub cannot be read.', 'Save the settings again from a device that has them.');
      const safe = clean(p);
      for (const k of SYNC) if (safe[k] !== undefined) RV.prefs[k] = safe[k];
      RV.savePrefs();
      location.reload();                                  /* the layout is put back as the page starts */
      return;
    } catch (e) { const x = RV.explain(e instanceof SyntaxError ? new RV.RVError('format', 'The settings file on GitHub cannot be read.', 'Save the settings again from a device that has them.') : e); RV.toast(x.msg + (x.hint ? ' ' + x.hint : ''), 'err'); }
    working = ''; render();
  }

  /* ---------- the page ---------- */
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  function loggedOut() {
    const s = K.SERVICES.find(x => x.id === 'github');
    return '<div class="pagehead"><h1>Log in with GitHub</h1><p class="lead">Logged in, the page can save to your repository: versions you enter, files you add, change or remove, and your settings, so every device has them.</p></div>' +
      '<div class="acctgrid"><div class="card"><label class="fld"><span>Your GitHub token</span><input type="password" id="acTok" autocomplete="off" spellcheck="false" placeholder="Paste the token here (it starts with github_pat_)"></label>' +
      '<div class="acctrow"><label class="check"><input type="checkbox" id="acShow"> Show it</label><label class="check"><input type="checkbox" id="acKeep" checked> Stay logged in on this device</label></div>' +
      '<p class="note">Switch “Stay logged in” off on a computer you share: the token is then forgotten when this tab closes.</p>' +
      '<div id="acMsg"></div><div class="acts"><button class="btn prim" id="acLogin">Log in</button><a class="btn" href="' + esc(s.url) + '" target="_blank" rel="noopener">Create a token on GitHub</a></div>' +
      '<p class="note">Reading a public repository needs no login. Everything on the other pages works without one.</p></div>' +
      '<div class="card"><h4 class="first">How to get a token</h4><ol class="acctsteps">' + s.steps.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' +
      '<h4>Where the token goes</h4><ul class="acctsteps"><li>It is kept in this browser and sent to api.github.com only. The page is not allowed to contact any other site.</li>' +
      '<li>It is never written into the repository, into the settings saved on GitHub, or into an export.</li>' +
      '<li>Limit it to the one repository with your runs. You can delete it on GitHub at any time, which logs every device out.</li></ul></div></div>';
  }
  function loggedIn() {
    const t = G.target(), tok = K.get('github'), stt = K.status('github');
    let h = '<div class="pagehead accthead">' + (who && who.avatar ? '<img src="' + esc(who.avatar) + '&s=120" alt="" width="56" height="56">' : '<span class="acctnoimg">' + person + '</span>') +
      '<div><h1>' + (who ? esc(who.name) : 'Logged in') + '</h1><p class="lead">' + (who ? esc(who.login) + ' on GitHub' : whoErr ? esc(whoErr.msg) : 'Asking GitHub who this is …') + '</p></div>' +
      '<button class="btn" id="acOut">Log out</button></div>';
    if (stt === 'bad' || whoErr) h += '<p class="warn">GitHub refused the token: it may have expired or been deleted. Log out and log in with a new one.</p>';
    h += '<div class="acctgrid"><div class="col">';
    h += '<div class="card"><h4 class="first">The repository</h4>' + (t
      ? '<p><b>' + esc(t.owner + '/' + t.repo) + '</b>' + (info ? ', ' + (info.isPrivate ? 'private' : 'public') + '. ' + (info.canWrite ? 'Your account may save to it; the token must allow “Contents: Read and write” too.' : '<span class="slower">Your account may only read it, so nothing can be saved there.</span>') : '') + '</p>' +
        '<div class="acts"><button class="btn prim" id="acRepo">Open the repository</button><button class="btn" id="acAdd">Add versions</button></div>'
      : '<p>The data source is a folder on this computer. Choose a GitHub repository under Settings, Data, to save to it.</p><div class="acts"><button class="btn" id="acData">Open Settings, Data</button></div>') + '</div>';
    h += '<div class="card"><h4 class="first">The token</h4><p class="num">' + (showTok ? esc(tok) : esc(K.masked(tok))) + ' <button class="link" id="acTokShow">' + (showTok ? 'Hide' : 'Show') + '</button></p>' +
      '<p class="note">' + (K.kept('github') ? 'Kept in this browser on this device, until you log out.' : 'Kept for this tab only. It is forgotten when the tab closes.') + ' It is sent to api.github.com and nowhere else.</p></div></div><div class="col">';
    h += '<div class="card"><h4 class="first">The same settings on every device</h4>' +
      '<p>Theme and your own themes, view, replay options, keys, layers, panels and window places. Save them here; on another device, log in and load them.</p>' +
      '<p class="note">' + (t ? 'They go into the file <code>' + esc(who ? fileOf(who.login) : 'settings/…') + '</code> on the branch <code>' + BRANCH + '</code> of the repository, which holds nothing else. ' +
        (info && !info.isPrivate ? 'The repository is public, so that file can be read by anyone. ' : '') + 'It never holds a key, the token or the viewer ID.' : '') + '</p>' +
      '<p class="acctsaved">' + (remote === undefined ? (t && who ? 'Looking on GitHub …' : '') : remote ? 'On GitHub: saved ' + esc(when(remote.saved)) + '.' : 'Nothing is saved on GitHub yet.') + '</p>' +
      '<div class="acts"><button class="btn prim" id="acSave"' + (t && who && !working ? '' : ' disabled') + '>' + (working === 'save' ? 'Saving …' : 'Save my settings to GitHub') + '</button>' +
      '<button class="btn" id="acLoad"' + (t && who && remote && !working ? '' : ' disabled') + '>' + (working === 'load' ? 'Loading …' : 'Load my settings from GitHub') + '</button></div>' +
      '<p class="note">Loading replaces the settings of this browser and opens the page again.</p></div>';
    return h + '</div></div>';
  }
  function render() {
    const box = $('pa');
    if (!box) return;
    const keep = box.scrollTop, on = G.loggedIn();
    box.innerHTML = '<div class="setwrap acct">' + (on ? loggedIn() : loggedOut()) + '</div>';
    box.scrollTop = keep;
    if (!on) {
      const inp = $('acTok');
      $('acShow').onchange = e => { inp.type = e.target.checked ? 'text' : 'password'; };
      const go = async () => {
        const v = inp.value.trim();
        if (!v) { inp.focus(); return; }
        $('acLogin').disabled = true; $('acLogin').textContent = 'Asking GitHub …';
        const keepIt = $('acKeep').checked;
        await K.set('github', v, !keepIt);
        if (K.status('github') === 'bad') {
          K.clear('github');
          if ($('acMsg')) { render(); $('acMsg').innerHTML = '<p class="warn">GitHub refused this token. Check that all of it was copied and that it has not expired.</p>'; }
          return;
        }
        RV.toast(K.status('github') === 'ok' ? 'Logged in.' : 'The token is stored, but GitHub could not be asked now.');
      };
      $('acLogin').onclick = go;
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      return;
    }
    $('acOut').onclick = () => { K.clear('github'); showTok = false; RV.toast('Logged out. The token was deleted from this browser.'); };
    $('acTokShow').onclick = () => { showTok = !showTok; render(); };
    if ($('acRepo')) $('acRepo').onclick = () => RV.showTab('pr');
    if ($('acAdd')) $('acAdd').onclick = () => { RV.showTab('pv'); RV.entry.open('one'); };
    if ($('acData')) $('acData').onclick = () => { S.setTab = 'data'; RV.showTab('ps'); };
    $('acSave').onclick = saveSettings;
    $('acLoad').onclick = loadSettings;
  }

  RV.account = {
    render() { render(); refresh(); },
    /* the token or what GitHub says about it has changed */
    changed() { refresh().then(() => { if (S.tab === 'pa') render(); if (RV.repo) RV.repo.changed(); }); },
    who: () => who, SYNC: SYNC, BRANCH: BRANCH,
  };
})();
