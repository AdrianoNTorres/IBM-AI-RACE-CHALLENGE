/* Run viewer: keys the reader supplies for outside services. One system for every feature that needs a private
   key: the list of services and of the features that depend on each, the stored keys, the check that a key
   works, and the dialog that asks for one. A key is the reader's own. It is kept in this browser only (with the
   other settings, under the viewer ID), sent to nobody but the service it belongs to, and never part of the site.

   A feature that needs a key: add it to its service's features (or add a service) in SERVICES; leave its
   control on the page but disabled-looking while RV.apiKeys.blocked(featureId) is true; and call
   RV.apiKeys.prompt(serviceId, featureId) when that control is clicked. */
(function () {
  'use strict';
  const RV = globalThis.RV, esc = RV.esc;

  const SERVICES = [
    {
      id: 'github', name: 'GitHub token', keyName: 'personal access token',
      what: 'The page reads public repositories without any key. A GitHub token of your own lets it read a private repository of yours and lifts GitHub’s limit of 60 checks an hour.',
      url: 'https://github.com/settings/personal-access-tokens/new',
      steps: [
        'Sign in to GitHub and open Settings, Developer settings, Personal access tokens, Fine-grained tokens (the link below goes there).',
        'Press “Generate new token”. Give it a name and an expiry date.',
        'Under Repository access choose “Only select repositories” and pick the repository with your runs.',
        'Under Permissions, Repository permissions, set “Contents” to “Read-only”. Nothing else is needed.',
        'Press “Generate token”, copy the token (it starts with github_pat_) and paste it here.',
      ],
      features: [
        { id: 'private', name: 'Reading a private repository', why: 'GitHub gives the files of a private repository only to a request that carries a token of someone allowed to read it.' },
        { id: 'limit', name: 'Checking a source more than 60 times an hour', why: 'without a token GitHub answers at most 60 questions an hour from one network (which run files exist, why a repository could not be read).' },
      ],
      /* resolves to true if the service accepts the key, false if it refuses it; throws if it could not be asked */
      async check(key) {
        const r = await fetch('https://api.github.com/rate_limit', { headers: { Authorization: 'Bearer ' + key } });
        if (r.status === 401 || r.status === 403) return false;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return true;
      },
    },
  ];
  const byId = id => SERVICES.find(s => s.id === id);
  const state = {};                     /* service id to 'ok' | 'bad' | 'unknown' (could not be checked) | 'checking' */
  const store = () => (RV.prefs.apiKeys && typeof RV.prefs.apiKeys === 'object' ? RV.prefs.apiKeys : (RV.prefs.apiKeys = {}));
  const get = id => store()[id] || '';
  let onChange = function () {};

  /* asks the service whether the stored key works; run when the page starts and whenever the key changes */
  async function check(id) {
    const s = byId(id), key = get(id);
    if (!key) { delete state[id]; onChange(); return; }
    state[id] = 'checking'; onChange();
    let res;
    try { res = (await s.check(key)) ? 'ok' : 'bad'; } catch (e) { res = 'unknown'; }
    if (get(id) === key) { state[id] = res; onChange(); }
  }
  function set(id, key) { key = String(key || '').trim(); if (key) store()[id] = key; else delete store()[id]; RV.savePrefs(); return check(id); }
  /* 'none' (no key), 'ok', 'bad' (the service refused it), 'unknown' (not checked: offline), 'checking' */
  const status = id => (get(id) ? state[id] || 'unknown' : 'none');
  /* a feature cannot be used: its service has no key, or has one the service refused */
  function blocked(featureId) {
    const s = SERVICES.find(x => x.features.some(f => f.id === featureId));
    return !s || status(s.id) === 'none' || status(s.id) === 'bad';
  }
  /* dots, and the last four characters of a key long enough that four give nothing away */
  const masked = key => '•'.repeat(Math.max(8, Math.min(24, key.length - 4))) + (key.length >= 16 ? key.slice(-4) : '');

  /* ---------- the dialog that asks for a key ---------- */
  let dlg = null, last = null;
  function close() { if (!dlg) return; dlg.remove(); dlg = null; removeEventListener('keydown', onKey, true); if (last && last.focus) last.focus(); }
  function onKey(e) {
    if (!dlg) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    e.stopPropagation();                                           /* the replay keys stay quiet while the dialog is open */
  }
  /* Asks for the key of a service. featureId: the feature the reader was after, named in the text. */
  function prompt(id, featureId) {
    const s = byId(id);
    if (!s) return;
    close();
    last = document.activeElement;
    const f = s.features.find(x => x.id === featureId), has = !!get(id);
    dlg = RV.el('div', 'keydlg', '<div class="keycard" role="dialog" aria-modal="true" aria-labelledby="keyTitle">' +
      '<h2 id="keyTitle">' + esc(s.name) + '<button class="keyhelp" id="keyHelp" aria-expanded="false" aria-controls="keySteps" title="How to get this key">?</button></h2>' +
      '<p>' + (f ? '<b>' + esc(f.name) + '</b> needs your own ' + esc(s.keyName) + ': ' + esc(f.why) + ' ' : '') + esc(s.what) + '</p>' +
      '<div id="keySteps" hidden><h4>How to get one</h4><ol>' + s.steps.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' +
      '<p><a href="' + esc(s.url) + '" target="_blank" rel="noopener">Open GitHub’s token page</a> (opens in a new tab)</p></div>' +
      '<label class="lbl" for="keyIn">Your ' + esc(s.keyName) + '</label><div class="inrow"><input type="password" id="keyIn" autocomplete="off" spellcheck="false" placeholder="' + (has ? 'A key is stored; type to replace it' : 'Paste the key here') + '">' +
      '<button class="btn" id="keyShow" aria-pressed="false">Show</button></div>' +
      '<p class="note">The key is saved in this browser only, under your viewer ID. It is sent to ' + esc(new URL(s.url).host.replace(/^www\./, '')) + ' and to nobody else, and it is not part of the site.</p>' +
      '<div id="keyWarn" class="warn" hidden></div>' +
      '<div class="tour-acts"><button class="btn prim" id="keySave">Save the key</button><button class="btn" id="keySkip">Continue without a key</button><button class="btn ghost" id="keyCancel">Cancel</button></div></div>');
    document.body.appendChild(dlg);
    addEventListener('keydown', onKey, true);
    const $ = RV.$, inp = $('keyIn');
    $('keyHelp').onclick = () => { const st = $('keySteps'); st.hidden = !st.hidden; $('keyHelp').setAttribute('aria-expanded', !st.hidden); };
    $('keyShow').onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; $('keyShow').textContent = show ? 'Hide' : 'Show'; $('keyShow').setAttribute('aria-pressed', show); };
    $('keyCancel').onclick = close;
    dlg.addEventListener('pointerdown', e => { if (e.target === dlg) close(); });
    /* skipping: say what will not work and why, then let the reader go on */
    $('keySkip').onclick = () => {
      const w = $('keyWarn');
      if (w.hidden && !has) {
        w.hidden = false;
        w.innerHTML = '<b>Without this key these parts of the site will not work:</b><ul>' + s.features.map(x => '<li><b>' + esc(x.name) + '</b>: ' + esc(x.why) + '</li>').join('') +
          '</ul>Everything else works as before. They stay on the page, greyed out; clicking one brings this box back, and the key can be entered at any time under Settings, API keys.';
        $('keySkip').textContent = 'Continue without it';
        return;
      }
      close();
    };
    const save = async () => {
      const v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      $('keySave').disabled = true; $('keySave').textContent = 'Checking …';
      await set(id, v);
      const st = status(id);
      if (st === 'bad') {
        const w = $('keyWarn');
        w.hidden = false; w.textContent = 'GitHub refused this key. Check that all of it was copied and that it has not expired. It is stored, but the features that need it stay blocked.';
        $('keySave').disabled = false; $('keySave').textContent = 'Save the key';
        return;
      }
      close();
      RV.toast(st === 'ok' ? 'The key works and is saved in this browser.' : 'The key is saved. It could not be checked now (no connection to the service).');
    };
    $('keySave').onclick = save;
    inp.onkeydown = e => { if (e.key === 'Enter') save(); };
    inp.focus();
  }

  RV.apiKeys = {
    SERVICES: SERVICES, get: get, set: set, clear: id => set(id, ''), status: status, blocked: blocked, masked: masked, prompt: prompt, check: check,
    /* checks every stored key (the page calls this once when it starts) */
    checkAll() { for (const s of SERVICES) if (get(s.id)) check(s.id); },
    /* fn is called whenever a key or its status changes, so pages can redraw what depends on it */
    onChange(fn) { onChange = fn; },
  };
})();
