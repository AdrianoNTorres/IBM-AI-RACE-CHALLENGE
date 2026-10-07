/* Run viewer: the Settings page, in five tabs. General (theme, view, this browser, reset), Replay (how a replay
   starts and looks), Data (the source, checked before the page switches to it, and the reader's API keys),
   Customization (js/theme.js) and Controls (the replay keys). The help and the data format are js/help.js. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc;

  let draft = null;                    /* what is typed in the repository field */
  let srcKind = null;                  /* which kind of source the form shows: github | local */
  let result = null;                   /* outcome of the last attempt to apply a source: {ok, html} */
  let working = false;
  let capturing = null;                /* the action whose new key is being waited for (Controls tab) */
  let shown = null;                    /* the service whose key is shown in full for the moment (API keys) */

  /* The API keys card: every service, its key (masked) and what each feature that needs it can do now. */
  function keysHtml() {
    const K = RV.apiKeys, link = S.ds && S.ds.src.kind === 'github' ? 'https://github.com/' + S.ds.src.name : RV.prefs.source.link;
    const word = { none: 'no key', ok: 'the key works', bad: 'GitHub refused this key', unknown: 'not checked (no connection)', checking: 'checking \u2026' };
    return '<div class="card keyscard"><div class="cardhead"><h3>API keys</h3><span class="note">Your own keys for outside services. Optional.</span></div>' +
      '<p class="note">Repository in use: <a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a></p>' +
      K.SERVICES.map(sv => {
        const st = K.status(sv.id), key = K.get(sv.id);
        return '<div class="field"><div><b>' + esc(sv.name) + '</b><p class="note">' + esc(sv.what) + '</p>' +
          (key ? '<p><code class="uid">' + esc(shown === sv.id ? key : K.masked(key)) + '</code> <span class="' + (st === 'bad' ? 'warn' : 'note') + '">' + word[st] + '</span></p>' : '') + '</div>' +
          '<div class="acts"><button class="btn' + (key ? '' : ' prim') + '" data-keyset="' + sv.id + '">' + (key ? 'Replace' : 'Enter a key') + '</button>' +
          (key ? '<button class="btn" data-keyshow="' + sv.id + '" aria-pressed="' + (shown === sv.id) + '">' + (shown === sv.id ? 'Hide' : 'Show') + '</button><button class="btn" data-keyclear="' + sv.id + '">Delete</button>' : '') + '</div></div>' +
          '<ul class="keyfeat">' + sv.features.map(f => { const b = K.blocked(f.id); return '<li class="' + (b ? 'blocked' : 'working') + '"><b>' + esc(f.name) + '</b> <span>' + (b ? 'blocked' : 'working') + '</span>' +
            (b ? '<small>' + esc(f.why.charAt(0).toUpperCase() + f.why.slice(1)) + '</small>' : '') + '</li>'; }).join('') + '</ul>';
      }).join('') +
      '<p class="note">A key is kept in this browser only, under your viewer ID, and is never part of the site or its repository. \u201cReset to defaults\u201d leaves it; Delete removes it.</p></div>';
  }

  /* While a key is being chosen, the next key press is the choice: nothing else on the page sees it. */
  addEventListener('keydown', e => {
    if (!capturing) return;
    if (S.tab !== 'ps' || S.setTab !== 'controls') { capturing = null; return; }
    e.preventDefault(); e.stopPropagation();
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;       /* a modifier on its way down */
    const act = RV.KEYS.find(a => a.id === capturing);
    if (e.key === 'Escape') { capturing = null; render(); return; }
    if (e.key === 'Tab') { RV.toast('Tab moves between controls and cannot be a replay key.'); return; }
    const k = RV.normKey(e.key), clash = RV.KEYS.find(a => a.id !== act.id && RV.normKey(RV.keyOf(a.id)) === k);
    if (clash) { RV.toast(RV.keyLabel(k) + ' is already the key for \u201c' + clash.label + '\u201d. Change that one first.'); return; }
    if (k === RV.normKey(act.def)) delete RV.prefs.keys[act.id]; else RV.prefs.keys[act.id] = k;
    RV.savePrefs(); capturing = null; render(); RV.map.buildSide();
  }, true);
  function controlsHtml() {
    const changed = RV.KEYS.some(a => RV.prefs.keys[a.id]);
    return '<div class="card"><div class="cardhead"><h3>Replay keys</h3><span class="note">On the Track and Telemetry pages</span></div>' +
      '<table class="spec keyst"><tr><th>Action</th><th>Key</th><th></th></tr>' + RV.KEYS.map(a => '<tr><td>' + a.label + '</td><td>' +
        (capturing === a.id ? '<span class="warn">Press the new key \u2026</span>' : RV.kbd(a.id) + (RV.prefs.keys[a.id] ? ' <span class="note">default: ' + esc(RV.keyLabel(a.def)) + '</span>' : '')) +
        '</td><td><button class="btn sm" data-key="' + a.id + '">' + (capturing === a.id ? 'Cancel' : 'Change') + '</button></td></tr>').join('') + '</table>' +
      '<div class="acts"><button class="btn" id="kReset"' + (changed ? '' : ' disabled') + '>Reset the keys</button></div>' +
      '<p class="note">Press Change, then the key you want. Esc cancels, so Esc itself can only be the key it is by default. A key that another action uses is refused. ' +
      'With Ctrl, Alt or the Command key held, a key is left to the browser. Space and Enter still press a button that has the focus.</p>' +
      '<p class="note">Fixed keys: in the versions table \u2191 \u2193 move between rows, Enter selects and Space adds to the comparison; on the lap-time chart \u2190 \u2192 step through the versions, + and \u2212 zoom, 0 resets.</p></div>';
  }

  function seg(id, items, cur, label) {
    return '<div class="seg" id="' + id + '" role="group" aria-label="' + label + '">' + items.map(it =>
      '<button data-v="' + it[0] + '" class="' + (it[0] === cur ? 'on' : '') + '" aria-pressed="' + (it[0] === cur) + '"' + (it[2] ? ' aria-disabled="true" title="' + esc(it[2]) + '"' : '') + '>' + it[1] + '</button>').join('') + '</div>';
  }
  /* what a data set contains, in words */
  function reportHtml(ds) {
    const r = ds.report, li = [];
    li.push('<b>' + r.versions + '</b> version' + (r.versions === 1 ? '' : 's') + ' in docs/CHANGELOG.md');
    li.push(r.withFile != null ? '<b>' + r.withFile + '</b> of them have a run CSV in runs/' + (r.named > r.withFile ? ' (' + (r.named - r.withFile) + ' more are named in the changelog but the file is missing)' : '')
      : '<b>' + r.named + '</b> of them name a run CSV (whether each file exists was not checked)');
    li.push(r.simple ? 'Simplified changelog: <b>found</b>, so the basic view is available' : 'Simplified changelog: <b>not found</b>, so only the detailed view is available');
    li.push(r.ownTrack ? 'Track file: <b>track.xml found</b> (' + esc(RV.track.title(ds.trk)) + ', ' + ds.trk.total.toFixed(1) + ' m)'
      : ds.trk ? 'Track file: <b>none in the source</b>, so the bundled Corkscrew map is used (' + ds.trk.total.toFixed(1) + ' m)' : 'Track file: <b>none</b>, and the bundled map could not be read');
    if (r.extras) li.push('<b>' + r.extras + '</b> other recording' + (r.extras === 1 ? '' : 's') + ' in runs/ that no changelog entry names (listed under “Other recordings”)');
    return '<ul>' + li.map(x => '<li>' + x + '</li>').join('') + '</ul>' + (ds.trkNote ? '<p class="warn">' + esc(ds.trkNote) + '</p>' : '');
  }

  /* Validates a source and switches to it only if it can be used; otherwise the current one stays. */
  async function apply(makeSrc, remember) {
    if (working) return;
    working = true; result = { ok: null, html: '<p>Checking the source …</p>' }; render();
    try {
      const src = await makeSrc();
      if (!src) { working = false; result = null; render(); return; }
      const ds = await RV.data.openSource(src, { checkFiles: true, onStep(t) { result = { ok: null, html: '<p>' + esc(t) + ' …</p>' }; paintResult(); } });
      if (remember) { RV.prefs.source = { kind: 'github', link: remember }; RV.savePrefs(); }
      result = { ok: true, html: '<p><b>Loaded ' + esc(src.label()) + '.</b></p>' + reportHtml(ds) };
      working = false;
      await RV.useDataset(ds);
    } catch (e) {
      const x = RV.explain(e);
      result = { ok: false, html: '<p><b>This source was not loaded.</b> ' + esc(x.msg) + '</p>' + (x.hint ? '<p>' + esc(x.hint) + '</p>' : '') +
        '<p class="note">' + (S.ds ? 'The page keeps showing ' + esc(S.ds.src.label()) + '.' : 'Nothing is loaded yet.') + '</p>' };
    }
    working = false;
    if (S.tab === 'ps') render();
  }
  function paintResult() { const r = $('srcResult'); if (r && result) { r.className = 'result ' + (result.ok === true ? 'ok' : result.ok === false ? 'bad' : 'wait'); r.innerHTML = result.html; } }

  async function pickFolder() {
    if (window.showDirectoryPicker) {
      let dir;
      try { dir = await window.showDirectoryPicker({ mode: 'read' }); } catch (e) { return null; }       /* the dialog was closed */
      return RV.data.handleSource(dir);
    }
    /* no File System Access API (Firefox, Safari): a directory file input; its change event applies the folder */
    $('dirInput').value = '';
    $('dirInput').click();
    return null;
  }
  $('dirInput').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    if (files.length) apply(async () => RV.data.fileListSource(files));
  });
  /* a folder dropped on the Settings page works too */
  addEventListener('dragover', e => { if (S.tab === 'ps') e.preventDefault(); });
  addEventListener('drop', async e => {
    if (S.tab !== 'ps') return;
    e.preventDefault();
    const it = e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items[0];
    if (!it || !it.getAsFileSystemHandle) { RV.toast('This browser cannot read a dropped folder. Use “Choose a folder”.'); return; }
    const h = await it.getAsFileSystemHandle();
    if (!h || h.kind !== 'directory') { RV.toast('Drop a folder, not a file.'); return; }
    srcKind = 'local';
    apply(async () => RV.data.handleSource(h));
  });

  const TABS = [['general', 'General'], ['replay', 'Replay'], ['data', 'Data'], ['custom', 'Customization'], ['controls', 'Controls']];
  function render() {
    const box = $('ps'), P = RV.prefs, ds = S.ds;
    if (!TABS.some(t => t[0] === S.setTab)) S.setTab = 'general';
    if (draft == null) draft = P.source.link;
    if (srcKind == null) srcKind = ds && ds.src.kind === 'local' ? 'local' : 'github';
    const noBasic = ds && !ds.hasSimple ? RV.NO_BASIC : '';
    const current = ds ? esc(ds.src.label()) : 'nothing is loaded';
    const tabs = '<div class="seg subtabs" id="sTabs" role="tablist">' + TABS.map(t => '<button role="tab" data-v="' + t[0] + '" class="' + (t[0] === S.setTab ? 'on' : '') + '" aria-selected="' + (t[0] === S.setTab) + '">' + t[1] + '</button>').join('') + '</div>';
    if (S.setTab !== 'controls') capturing = null;
    if (S.setTab !== 'custom') RV.theme.closePick();
    if (S.setTab === 'custom') {
      const keep0 = box.scrollTop;
      box.innerHTML = '<div class="setwrap"><div class="pagehead"><h1>Customization</h1><p class="lead">The colour of everything on the site, saved as themes of your own.</p></div>' + tabs + '<div id="custBody"></div></div>';
      box.scrollTop = keep0;
      box.querySelectorAll('#sTabs button').forEach(b => { b.onclick = () => { S.setTab = b.dataset.v; render(); box.scrollTop = 0; }; });
      RV.theme.ui($('custBody'));
      return;
    }
    if (S.setTab === 'controls') {
      const keep0 = box.scrollTop;
      box.innerHTML = '<div class="setwrap"><div class="pagehead"><h1>Controls</h1><p class="lead">The keys that drive the replay. Saved in this browser only.</p></div>' + tabs + controlsHtml() + '</div>';
      box.scrollTop = keep0;
      box.querySelectorAll('#sTabs button').forEach(b => { b.onclick = () => { S.setTab = b.dataset.v; render(); box.scrollTop = 0; }; });
      box.querySelectorAll('[data-key]').forEach(b => { b.onclick = () => { capturing = capturing === b.dataset.key ? null : b.dataset.key; render(); const again = box.querySelector('[data-key="' + (capturing || b.dataset.key) + '"]'); if (again) again.focus(); }; });
      if ($('kReset')) $('kReset').onclick = () => { RV.prefs.keys = {}; RV.savePrefs(); capturing = null; render(); RV.map.buildSide(); RV.toast('The replay keys are back to their defaults.'); };
      return;
    }
    const tab = S.setTab, head = { general: ['Settings', 'Saved in this browser only.'], replay: ['Replay', 'How a replay starts and what it looks like. Saved in this browser only.'], data: ['Data', 'Where the versions and recordings come from, and your own keys for outside services.'] }[tab];
    const appearance = '<div class="card"><div class="cardhead"><h3>Appearance</h3></div>' +
      '<div class="field"><div><b>Theme</b><p class="note">System follows the setting of your operating system. Custom lists the themes of your own; they are made on the <button class="link" id="sCustom">Customization</button> tab.</p></div>' + seg('sTheme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], RV.customTheme() ? '' : P.theme, 'Theme').replace(/<\/div>$/, RV.theme.customSelect('sThemeCustom') + '</div>') + '</div>' +
      '<div class="field"><div><b>View</b><p class="note">' + (noBasic ? '<span class="warn">' + noBasic + '</span>' : 'Basic view: plain-language descriptions and the main controls. Detailed view: technical titles, every channel and every control.') + '</p></div>' +
      seg('sView', [['basic', 'Basic view', noBasic], ['detailed', 'Detailed view']], RV.simple() || (!ds && P.view === 'basic') ? 'basic' : 'detailed', 'View') + '</div></div>';
    const replay = '<div class="card"><div class="cardhead"><h3>When a run opens</h3></div>' +
      '<div class="field"><div><b>Speed</b><p class="note">The speed a replay starts at. The bar under the replay changes it at any time.</p></div>' + seg('sSpeed', [['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ['4', '4×']], String(P.speed), 'Replay speed') + '</div>' +
      '<div class="field"><div><b>Start playing when a run opens</b><p class="note">Off: the replay waits at the start line.</p></div><label class="tg"><input type="checkbox" id="sAuto" ' + (P.autoplay ? 'checked' : '') + ' aria-label="Start playing when a run opens"><span></span></label></div>' +
      '<div class="field"><div><b>Compared cars</b><p class="note">Same lap time shows who is ahead on the track. Same distance puts the cars side by side to compare their lines.</p></div>' + seg('sSync', [['t', 'Same lap time'], ['d', 'Same distance']], P.sync, 'Where compared cars are placed') + '</div>' +
      '<div class="field"><div><b>Camera when a run opens</b><p class="note">A comparison always opens on the whole track.</p></div>' + seg('sCam', [['fit', 'Whole track'], ['follow', 'Follow the car'], ['up', 'Follow, car points up']], P.camera, 'Camera when a run opens') + '</div></div>';
    const look = '<div class="card"><div class="cardhead"><h3>On the map</h3></div>' +
      '<div class="field"><div><b>Smooth motion</b><p class="note">At 1× and slower the cars and the camera glide between the recorded steps. Off: they jump from step to step.</p></div><label class="tg"><input type="checkbox" id="sSmooth" ' + (P.smooth ? 'checked' : '') + ' aria-label="Smooth motion at 1× and slower"><span></span></label></div>' +
      '<div class="field"><div><b>Car size</b><p class="note">For every car without a size of its own (Track, Camera). 1 is true scale.</p></div><div class="setsl"><input type="range" id="sCar" min="0.3" max="4" step="0.1" value="' + P.carSize + '" aria-label="Car size"><span class="num" id="sCarV">' + P.carSize.toFixed(1) + '×</span></div></div>' +
      '<div class="field"><div><b>Dimming outside a loop</b><p class="note">How dark the rest of the map is while a section is played on a loop.</p></div><div class="setsl"><input type="range" id="sDim" min="0" max="0.9" step="0.05" value="' + P.loopDim + '" aria-label="Dimming outside a loop"><span class="num" id="sDimV">' + Math.round(P.loopDim * 100) + ' %</span></div></div></div>';
    const reset = '<div class="card"><div class="cardhead"><h3>Reset</h3></div><div class="field"><div><b>Reset to defaults</b><p class="note">System theme, basic view, the default repository, 1× speed and the other replay values, the default keys, layers, panels, lists and car sizes. The viewer ID, your API keys and your own themes stay.</p></div><button class="btn" id="sReset">Reset to defaults</button></div></div>';
    const source = '<div class="card"><div class="cardhead"><h3>Data source</h3><span class="note">Now showing: ' + current + '</span></div>' +
      seg('sKind', [['github', 'GitHub repository'], ['local', 'Local folder']], srcKind, 'Kind of data source') +
      (srcKind === 'github'
        ? '<label class="lbl" for="sLink">Repository link</label><div class="inrow"><input type="text" id="sLink" spellcheck="false" autocomplete="off" value="' + esc(draft) + '"><button class="btn prim" id="sApply"' + (working ? ' disabled' : '') + '>Load</button></div>' +
          '<p class="note"><button class="keygate' + (RV.apiKeys.blocked('private') ? ' blocked' : '') + '" id="sPrivate"' + (RV.apiKeys.blocked('private') ? ' aria-disabled="true" title="Needs your own GitHub token. Click to enter one."' : ' title="Your GitHub token is used for repositories that are not public."') + '>Private repositories: ' + (RV.apiKeys.blocked('private') ? 'need your GitHub token' : 'on, with your GitHub token') + '</button></p>' +
          '<p class="note">A public repository: <code>https://github.com/owner/repo</code>, the same with <code>/tree/&lt;branch&gt;</code>, or <code>owner/repo</code>. ' + (draft.trim() !== RV.DEFAULT_LINK ? '<button class="link" id="sDefault">Use the default repository</button>' : 'This is the default repository.') + '</p>'
        : '<div class="inrow"><button class="btn prim" id="sFolder"' + (working ? ' disabled' : '') + '>Choose a folder …</button></div>' +
          '<p class="note">A web page cannot open a folder from a typed path, so the browser asks you to pick it. <b>The folder is read in this browser and nothing is uploaded.</b> Pick the folder that contains docs/CHANGELOG.md, or drop it on this page. Browsers do not keep folder access: after a reload the page returns to the GitHub repository.</p>') +
      '<div id="srcResult" class="result"></div>' +
      '<p class="note"><b>The map:</b> to see your own track, the source must include its ' + RV.TORCS + ' track file as <code>track.xml</code>. ' +
      (ds ? (ds.trkOwn ? 'This source has one (' + esc(RV.track.title(ds.trk)) + ').' : 'This source has none, so the bundled Corkscrew map is used.') : '') + '</p>' +
      '<p class="note">What a source must contain is described under <button class="link" id="sFormat">Help, Data format</button>.</p></div>';
    const browser = '<div class="card"><div class="cardhead"><h3>This browser</h3></div><div class="field"><div><b>Viewer ID</b><p class="note">A random id made on your first visit. Your settings, keys and layout are saved under it in this browser. It is sent nowhere.</p></div><code class="uid">' + esc(P.uid) + '</code></div></div>';
    const cols = tab === 'replay' ? [replay, look] : tab === 'data' ? [source, keysHtml()] : [appearance + browser, reset];
    const h = '<div class="setwrap"><div class="pagehead"><h1>' + head[0] + '</h1><p class="lead">' + head[1] + '</p></div>' + tabs +
      '<div class="setgrid even"><div class="col">' + cols[0] + '</div><div class="col">' + cols[1] + '</div></div></div>';
    const keep = box.scrollTop, focusLink = document.activeElement && document.activeElement.id === 'sLink';
    box.innerHTML = h;
    box.scrollTop = keep;
    paintResult();
    if (focusLink) { const i = $('sLink'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }

    const on = (id, fn) => box.querySelectorAll('#' + id + ' button').forEach(b => { b.onclick = () => fn(b.dataset.v, b); });
    on('sTabs', v => { S.setTab = v; render(); box.scrollTop = 0; });
    on('sTheme', v => { P.theme = v; RV.savePrefs(); RV.applyTheme(); render(); });
    if ($('sThemeCustom')) $('sThemeCustom').onchange = e => { RV.theme.select(e.target.value); render(); };
    on('sView', v => { RV.setView(v); });
    on('sSpeed', v => { P.speed = +v; RV.savePrefs(); $('spd').value = v; render(); });
    on('sSync', v => { P.sync = v; RV.savePrefs(); RV.map.buildSide(); render(); });
    on('sCam', v => { P.camera = v; RV.savePrefs(); render(); });
    if (tab === 'replay') {
    $('sSmooth').onchange = e => { P.smooth = e.target.checked; RV.savePrefs(); };
    $('sCar').oninput = e => { P.carSize = +e.target.value; $('sCarV').textContent = P.carSize.toFixed(1) + '\u00d7'; RV.savePrefs(); };
    $('sDim').oninput = e => { P.loopDim = +e.target.value; $('sDimV').textContent = Math.round(P.loopDim * 100) + ' %'; RV.savePrefs(); };
    $('sAuto').onchange = e => { P.autoplay = e.target.checked; RV.savePrefs(); };
    }
    box.querySelectorAll('[data-keyset]').forEach(b => { b.onclick = () => RV.apiKeys.prompt(b.dataset.keyset, b.dataset.feature); });
    box.querySelectorAll('[data-keyclear]').forEach(b => { b.onclick = () => { RV.apiKeys.clear(b.dataset.keyclear); shown = null; RV.toast('The key was deleted from this browser.'); render(); }; });
    box.querySelectorAll('[data-keyshow]').forEach(b => { b.onclick = () => { shown = shown === b.dataset.keyshow ? null : b.dataset.keyshow; render(); }; });
    on('sKind', v => { srcKind = v; result = null; render(); });
    if ($('sCustom')) $('sCustom').onclick = () => { S.setTab = 'custom'; render(); box.scrollTop = 0; };
    if ($('sFormat')) $('sFormat').onclick = () => RV.help.open('format');
    if ($('sReset')) $('sReset').onclick = () => {
      const was = P.source.link, local = ds && ds.src.kind === 'local';
      RV.resetPrefs(); RV.applyTheme(); $('spd').value = '1'; draft = RV.DEFAULT_LINK; srcKind = 'github'; result = null;
      S.carScale = {};
      Object.assign(S, { listMode: 'all', keptOnly: true, keptAll: false, sideTab: 'layers', layerGroup: 'Sensors', teleTab: 'charts', verTab: 'overview', helpTab: 'start' });
      $('pm').classList.remove('side-closed'); RV.map.defaults();
      RV.refreshAll();
      if (was !== RV.DEFAULT_LINK || local || !ds) { S.setTab = 'data'; apply(async () => RV.data.githubSource(RV.DEFAULT_LINK), RV.DEFAULT_LINK); } else render();
      RV.toast('Settings are back to their defaults.');
    };
    if ($('sLink')) {
      const go = () => apply(async () => RV.data.githubSource(draft), draft.trim());
      $('sLink').oninput = e => { draft = e.target.value; };
      $('sLink').onkeydown = e => { if (e.key === 'Enter') go(); };
      $('sApply').onclick = go;
      if ($('sDefault')) $('sDefault').onclick = () => { draft = RV.DEFAULT_LINK; render(); };
    }
    if ($('sFolder')) $('sFolder').onclick = () => apply(pickFolder);
    if ($('sPrivate')) $('sPrivate').onclick = () => { if (RV.apiKeys.blocked('private')) RV.apiKeys.prompt('github', 'private'); else RV.toast('Your GitHub token is stored: a private repository it may read can be loaded like any other.'); };
  }

  RV.settings = { render: render, useSource(src) { srcKind = src.kind; S.setTab = 'data'; return src._pick ? apply(pickFolder) : apply(async () => src); } };
})();
