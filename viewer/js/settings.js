/* Run viewer: the Settings page. Theme, view, the data source (with validation before switching to it),
   replay preferences, and the guide to the data format. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc;

  let draft = null;                    /* what is typed in the repository field */
  let srcKind = null;                  /* which kind of source the form shows: github | local */
  let result = null;                   /* outcome of the last attempt to apply a source: {ok, html} */
  let working = false;

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

  /* ---------- the data-format guide ---------- */
  const GUIDE = {
    layout: ['Folder layout',
      '<p>A data source is a public GitHub repository or a folder on this computer, laid out like this:</p>' +
      '<pre>docs/\n  CHANGELOG.md        required   one entry per version\n  CHANGELOG-simple.md optional   the same entries in plain language\ntrack.xml               optional   the TORCS track file of the track driven\nruns/\n  run_20261003_220700.csv          one telemetry file per version\n  run_&lt;date&gt;_&lt;time&gt;.csv</pre>' +
      '<p>The page only reads. It writes nothing to the source; settings stay in this browser.</p>' +
      '<p>From GitHub the page fetches <code>docs/CHANGELOG.md</code>, <code>docs/CHANGELOG-simple.md</code> and <code>track.xml</code> when it opens, and a run CSV only when that run is opened or compared. A link may end in <code>/tree/&lt;branch&gt;</code> or <code>/tree/&lt;branch&gt;/&lt;folder&gt;</code>; without it the default branch is read.</p>'],
    changelog: ['docs/CHANGELOG.md',
      '<p>One entry per version: a heading, then a two-column table whose rows are <code>| **Field** | text |</code>.</p>' +
      '<pre>## v0.7 — Steer toward the open road\n\n| Field | Value |\n|---|---|\n| **What changed** | … |\n| **Lap time** | 2:19.31 |\n| **Top speed** | 148 km/h |\n| **Min speed** | 41 km/h |\n| **Damage** | 0 |\n| **Observed** | … Telemetry: runs/run_20261001_154006.csv |\n| **Decision** | ✅ Kept — faster, no damage |\n| **Learned** | … |</pre>' +
      '<table class="spec"><tr><th>Part</th><th>Rule</th><th>Used for</th></tr>' +
      '<tr><td>Heading</td><td><code>## vX.Y \u2014 Title</code> (a dash or a hyphen)</td><td>the version\u2019s name and its title in the detailed view</td></tr>' +
      '<tr><td>Lap time</td><td>starts with <code>m:ss.cc</code> or <code>m:ss:cc</code></td><td>the lap time, the chart, the rankings</td></tr>' +
      '<tr><td>Top speed, Min speed</td><td>start with <code>NNN km/h</code></td><td>the Top and Slowest corner columns</td></tr>' +
      '<tr><td>Damage</td><td>any text</td><td>shown in the details</td></tr>' +
      '<tr><td>Decision</td><td>contains ✅ if the version was kept</td><td>Kept or Rejected; gains are measured against the last kept version</td></tr>' +
      '<tr><td>Run CSV</td><td>the first <code>runs/run_&lt;digits&gt;_&lt;digits&gt;.csv</code> anywhere in the entry</td><td>the recording that is replayed</td></tr>' +
      '<tr><td>What changed, Why, Observed, Learned</td><td>any text</td><td>the technical record in the details panel</td></tr></table>' +
      '<p>The file must hold at least one such entry, or the source is refused. An entry without a lap time is listed but left out of the chart.</p>'],
    csv: ['Run CSVs',
      '<p>One row per simulation step, with a header row. Plain numbers separated by commas.</p>' +
      '<table class="spec"><tr><th>Column</th><th></th><th>Meaning</th></tr>' +
      '<tr><td><code>curLapTime</code></td><td>required</td><td>seconds since the start of the lap; rows below 0 are before the start and are dropped</td></tr>' +
      '<tr><td><code>lastLapTime</code></td><td>required</td><td>0 during the lap; the official lap time on rows after the finish line</td></tr>' +
      '<tr><td><code>distFromStart</code></td><td>required</td><td>metres along the track from the start line</td></tr>' +
      '<tr><td><code>speedX</code></td><td>required</td><td>speed, km/h</td></tr>' +
      '<tr><td><code>gear</code>, <code>accel</code>, <code>brake</code>, <code>steer</code></td><td>required</td><td>gear; throttle and brake 0 to 1; steering −1 to +1 (+1 = full left)</td></tr>' +
      '<tr><td><code>trackPos</code></td><td>required</td><td>sideways position: 0 centre, +1 left edge, −1 right edge</td></tr>' +
      '<tr><td><code>angle</code></td><td>required</td><td>angle between the car and the track direction, radians</td></tr>' +
      '<tr><td><code>damage</code></td><td>required</td><td>damage points; the last row\u2019s value is shown</td></tr>' +
      '<tr><td><code>allowed</code></td><td>optional</td><td>the speed the driver\u2019s plan allows, km/h; without it the grey line on the speed chart is missing</td></tr>' +
      '<tr><td><code>track0</code> … <code>track18</code></td><td>optional</td><td>the 19 distance sensors, metres (−1 off track); without them the run replays without beams</td></tr>' +
      '<tr><td><code>focA</code>, <code>foc0</code> … <code>foc4</code></td><td>optional</td><td>focus rays: centre angle and five distances; without them no focus rays</td></tr></table>' +
      '<p><b>Lap time of a recording:</b> the <code>lastLapTime</code> of the first row after the line if there is one; otherwise the last clock reading plus the remaining distance at the last speed. <b>Slowest corner:</b> the lowest speed more than 100 m from the start line and after the first 8 seconds. Other columns are ignored.</p>' +
      '<p>A version without a CSV is listed but cannot be replayed. A recording that stops early is shown as an incomplete lap; an empty one is reported as such.</p>'],
    optional: ['Optional files',
      '<h4>docs/CHANGELOG-simple.md</h4><p>Same format as <code>docs/CHANGELOG.md</code>, same version names. Its title and its What changed, Why, Decision and Learned fields are the texts of the <b>basic view</b>. Without this file the basic view cannot be selected and the page uses the detailed view.</p>' +
      '<h4>track.xml</h4><p>The map is computed from a TORCS track file. <b>Supplying it is your job:</b> to see your own track, put the track\u2019s TORCS file (for example <code>tracks/road/&lt;name&gt;/&lt;name&gt;.xml</code> from a TORCS install) at the root of the repository or folder, named <code>track.xml</code>.</p>' +
      '<p>Without it the page uses the Corkscrew track bundled with it. If a run does not fit the track in use (its longest <code>distFromStart</code> differs from the track length by more than ' + RV.data.FIT_TOL + ' m), the Track tab says so instead of drawing the run on a wrong map; Versions and Telemetry still work.</p>' +
      '<h4>Other CSVs in runs/</h4><p>In a local folder, CSVs that no changelog entry names (manual laps) are listed under “Other recordings” on the Versions tab. From GitHub only the recordings named in the changelog are read.</p>'],
  };

  /* 9: the name TORCS carries its explanation */
  for (const k in GUIDE) GUIDE[k][1] = GUIDE[k][1].replace(/TORCS/g, RV.TORCS);

  /* ---------- the Help tab ---------- */
  function helpHtml() {
    const ds = S.ds, k = s => '<kbd>' + s + '</kbd>';
    const card = (title, body) => '<div class="card helpcard"><div class="cardhead"><h3>' + title + '</h3></div>' + body + '</div>';
    return '<div class="setgrid"><div class="col">' +
      card('New here?', '<p>The tutorial walks through the three pages in about a minute and points at each part of the screen in turn.</p>' +
        '<div class="acts"><button class="btn prim" id="hTour">Redo the tutorial</button></div>') +
      card('What this site is', '<p>The run viewer replays the laps of a self-driving racing car in the simulator ' + RV.TORCS + '. The car\u2019s driver is a set of hand-written rules that was improved one version at a time; each version drove one measured lap, and each was either kept or rejected.</p>' +
        '<p>The site only reads data. It changes nothing in the source, and nothing you open is uploaded anywhere. Your settings are saved in this browser.</p>') +
      card('The pages', '<dl class="helpdl">' +
        '<dt>Versions</dt><dd>Every version with its lap time, the lap-time chart, the rankings, and a panel that explains what the selected version changed and why.</dd>' +
        '<dt>Track</dt><dd>The replay on a map of the track: the car, the line it drove, and its sensor beams.</dd>' +
        '<dt>Telemetry</dt><dd>Charts of speed, throttle, brake and more along the lap, and in the detailed view sector times and a table of 100 m sections.</dd>' +
        '<dt>Settings</dt><dd>Theme, view, data source and replay preferences, the guide to the data format, and this help.</dd></dl>') +
      card('Selecting and comparing', '<ul class="helpul"><li><b>Select one version:</b> click its row on the Versions page.</li>' +
        '<li><b>Compare several (up to ' + RV.MAX_RUNS + '):</b> drag across rows, or Shift-click for a range, or Ctrl-click to add or remove one. Each gets its own colour.</li>' +
        '<li><b>The car in focus</b> is the one clicked first: the map follows it and time gaps are measured against it. Click another car on the map, its row in the Cars table, or its name in the top bar to put that one in focus.</li>' +
        '<li><b>Remove one:</b> the \u00d7 beside its name in the top bar. \u201cClear comparison\u201d keeps only the car in focus.</li></ul>') +
      card('Basic view and Detailed view', '<p>The switch in the top bar. <b>Basic view</b> uses plain-language descriptions and shows the main controls. <b>Detailed view</b> adds the technical record of each version, every telemetry channel, sector times and all the map layers. Nothing moves between the two: the detailed view adds to what the basic view shows.</p>' +
        (ds && !ds.hasSimple ? '<p class="warn">' + RV.NO_BASIC + '</p>' : '')) +
      '</div><div class="col">' +
      card('Mouse and keyboard', '<table class="spec"><tr><th>Where</th><th>Do this</th><th>To</th></tr>' +
        '<tr><td>Replay</td><td>' + k('Space') + '</td><td>play or pause</td></tr>' +
        '<tr><td>Replay</td><td>' + k('\u2190') + ' ' + k('\u2192') + '</td><td>move one step; hold for slow motion (0.1\u00d7, then 0.25\u00d7, then 0.5\u00d7)</td></tr>' +
        '<tr><td>Replay</td><td>' + k('Home') + '</td><td>back to the start of the lap</td></tr>' +
        '<tr><td>Map</td><td>drag, wheel, double-click</td><td>move the map, zoom, return to the car</td></tr>' +
        '<tr><td>Map</td><td>' + k('+') + ' ' + k('\u2212') + ', ' + k('F') + '</td><td>zoom; follow the car or stop following</td></tr>' +
        '<tr><td>Charts</td><td>wheel, drag, click, double-click</td><td>zoom the distance axis, pan, move the car there, show the whole lap</td></tr>' +
        '<tr><td>Versions table</td><td>' + k('\u2191') + ' ' + k('\u2193') + ', ' + k('Enter') + ', ' + k('Space') + '</td><td>move between rows, select the row, add it to or remove it from the comparison</td></tr>' +
        '<tr><td>Lap-time chart</td><td>' + k('\u2190') + ' ' + k('\u2192') + ', ' + k('+') + ' ' + k('\u2212') + ', ' + k('0') + '</td><td>step through the versions, zoom, reset</td></tr>' +
        '<tr><td>Anywhere</td><td>' + k('Tab') + '</td><td>move to the next control</td></tr></table>') +
      card('Reading the colours', '<ul class="helpul"><li><b>Path on the map:</b> blue where the car was slowest, yellow where it was fastest. In the detailed view it can show braking instead.</li>' +
        '<li><b>Sensor beams:</b> pink means the edge of the road is close, cyan means it is far.</li>' +
        '<li><b>Lap-time chart:</b> filled purple = kept and a new best lap; filled green = kept; purple ring = rejected although its lap was faster; grey ring = rejected.</li>' +
        '<li><b>Time differences:</b> a minus sign, or \u201cfaster\u201d, means time gained.</li></ul>') +
      card('Using your own data', '<p>The site can show any project laid out the same way: a public GitHub repository, or a folder on this computer. Choose it under Settings, Data source. The source is checked first, and the page says what it found.</p>' +
        '<div class="acts"><button class="btn" id="hFormat">Show the data format</button></div>' +
        '<p class="note">Now showing: ' + (ds ? esc(ds.src.label()) : 'nothing is loaded') + '.</p>') +
      card('If something does not work', '<dl class="helpdl">' +
        '<dt>\u201cThe data could not be loaded\u201d</dt><dd>The page needs the network to read from GitHub. Check the connection and press Try again. A firewall or an extension that blocks raw.githubusercontent.com has the same effect.</dd>' +
        '<dt>A version cannot be replayed</dt><dd>It has no recording: the changelog names no run file for it, or the file is missing from the source.</dd>' +
        '<dt>\u201cThis run does not fit the track map\u201d</dt><dd>The runs were driven on another track than the map in use. The source needs its own track.xml (see the data format).</dd>' +
        '<dt>Basic view cannot be chosen</dt><dd>The source has no simplified changelog (docs/CHANGELOG-simple.md).</dd>' +
        '<dt>A local folder is gone after a reload</dt><dd>Browsers do not keep access to a folder. Choose it again under Settings, Data source.</dd></dl>') +
      card('Links to a particular state', '<p>Options after <code>#</code> in the address open the page in a given state, for example <code>#tab=pm&amp;run=v1.05&amp;cmp=v0.96&amp;mode=detailed</code>. <code>tab</code> is <code>pv</code>, <code>pm</code>, <code>pt</code> or <code>ps</code>; <code>run</code> and <code>cmp</code> name versions; <code>frame</code> pauses on a frame; <code>help</code> opens this page. The README lists them all.</p>') +
      '</div></div>';
  }

  function render() {
    const box = $('ps'), P = RV.prefs, ds = S.ds;
    if (draft == null) draft = P.source.link;
    if (srcKind == null) srcKind = ds && ds.src.kind === 'local' ? 'local' : 'github';
    const noBasic = ds && !ds.hasSimple ? RV.NO_BASIC : '';
    const current = ds ? esc(ds.src.label()) : 'nothing is loaded';
    const tabs = '<div class="seg subtabs" id="sTabs" role="tablist">' + [['prefs', 'Settings'], ['help', 'Help']].map(t => '<button role="tab" data-v="' + t[0] + '" class="' + (t[0] === S.setTab ? 'on' : '') + '" aria-selected="' + (t[0] === S.setTab) + '">' + t[1] + '</button>').join('') + '</div>';
    if (S.setTab === 'help') {
      const keep0 = box.scrollTop;
      box.innerHTML = '<div class="setwrap"><div class="pagehead"><h1>Help</h1><p class="lead">What the run viewer shows and how to use it.</p></div>' + tabs + helpHtml() + '</div>';
      box.scrollTop = keep0;
      box.querySelectorAll('#sTabs button').forEach(b => { b.onclick = () => { S.setTab = b.dataset.v; render(); box.scrollTop = 0; }; });
      $('hTour').onclick = () => RV.tutorial.start(true);
      $('hFormat').onclick = () => { S.setTab = 'prefs'; render(); const g = box.querySelector('.guidecard'); if (g) g.scrollIntoView({ block: 'start' }); };
      return;
    }
    let h = '<div class="setwrap"><div class="pagehead"><h1>Settings</h1><p class="lead">Saved in this browser only.</p></div>' + tabs +

      '<div class="setgrid"><div class="col">' +
      '<div class="card"><div class="cardhead"><h3>Appearance</h3></div>' +
      '<div class="field"><div><b>Theme</b><p class="note">System follows the setting of your operating system.</p></div>' + seg('sTheme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], P.theme, 'Theme') + '</div>' +
      '<div class="field"><div><b>View</b><p class="note">' + (noBasic ? '<span class="warn">' + noBasic + '</span>' : 'Basic view: plain-language descriptions and the main controls. Detailed view: technical titles, every channel and every control.') + '</p></div>' +
      seg('sView', [['basic', 'Basic view', noBasic], ['detailed', 'Detailed view']], RV.simple() || (!ds && P.view === 'basic') ? 'basic' : 'detailed', 'View') + '</div></div>' +

      '<div class="card"><div class="cardhead"><h3>Replay</h3></div>' +
      '<div class="field"><div><b>Speed</b><p class="note">The speed a replay starts at. The bar under the replay changes it at any time.</p></div>' + seg('sSpeed', [['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ['4', '4×']], String(P.speed), 'Replay speed') + '</div>' +
      '<div class="field"><div><b>Start playing when a run opens</b><p class="note">Off: the replay waits at the start line.</p></div><label class="tg"><input type="checkbox" id="sAuto" ' + (P.autoplay ? 'checked' : '') + ' aria-label="Start playing when a run opens"><span></span></label></div>' +
      '<div class="field"><div><b>Compared cars</b><p class="note">Same lap time shows who is ahead on the track. Same distance puts the cars side by side to compare their lines.</p></div>' + seg('sSync', [['t', 'Same lap time'], ['d', 'Same distance']], P.sync, 'Where compared cars are placed') + '</div></div>' +

      '<div class="card"><div class="cardhead"><h3>Reset</h3></div><div class="field"><div><b>Reset to defaults</b><p class="note">System theme, basic view, the default repository, 1× speed.</p></div><button class="btn" id="sReset">Reset to defaults</button></div></div>' +
      '</div><div class="col">' +

      '<div class="card"><div class="cardhead"><h3>Data source</h3><span class="note">Now showing: ' + current + '</span></div>' +
      seg('sKind', [['github', 'GitHub repository'], ['local', 'Local folder']], srcKind, 'Kind of data source') +
      (srcKind === 'github'
        ? '<label class="lbl" for="sLink">Repository link</label><div class="inrow"><input type="text" id="sLink" spellcheck="false" autocomplete="off" value="' + esc(draft) + '"><button class="btn prim" id="sApply"' + (working ? ' disabled' : '') + '>Load</button></div>' +
          '<p class="note">A public repository: <code>https://github.com/owner/repo</code>, the same with <code>/tree/&lt;branch&gt;</code>, or <code>owner/repo</code>. ' + (draft.trim() !== RV.DEFAULT_LINK ? '<button class="link" id="sDefault">Use the default repository</button>' : 'This is the default repository.') + '</p>'
        : '<div class="inrow"><button class="btn prim" id="sFolder"' + (working ? ' disabled' : '') + '>Choose a folder …</button></div>' +
          '<p class="note">A web page cannot open a folder from a typed path, so the browser asks you to pick it. <b>The folder is read in this browser and nothing is uploaded.</b> Pick the folder that contains docs/CHANGELOG.md, or drop it on this page. Browsers do not keep folder access: after a reload the page returns to the GitHub repository.</p>') +
      '<div id="srcResult" class="result"></div>' +
      '<p class="note"><b>The map:</b> to see your own track, the source must include its ' + RV.TORCS + ' track file as <code>track.xml</code>. ' +
      (ds ? (ds.trkOwn ? 'This source has one (' + esc(RV.track.title(ds.trk)) + ').' : 'This source has none, so the bundled Corkscrew map is used.') : '') + '</p></div>' +

      '<div class="card guidecard"><div class="cardhead"><h3>Data format</h3><span class="note">What a repository or folder must contain</span></div>' +
      '<div class="seg wrap subtabs" id="sGuide" role="tablist">' + Object.keys(GUIDE).map(k => '<button role="tab" data-v="' + k + '" class="' + (k === S.guideTab ? 'on' : '') + '" aria-selected="' + (k === S.guideTab) + '">' + GUIDE[k][0] + '</button>').join('') + '</div>' +
      '<div class="guidebody">' + GUIDE[S.guideTab][1] + '</div></div>' +
      '</div></div></div>';
    const keep = box.scrollTop, focusLink = document.activeElement && document.activeElement.id === 'sLink';
    box.innerHTML = h;
    box.scrollTop = keep;
    paintResult();
    if (focusLink) { const i = $('sLink'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }

    const on = (id, fn) => box.querySelectorAll('#' + id + ' button').forEach(b => { b.onclick = () => fn(b.dataset.v, b); });
    on('sTabs', v => { S.setTab = v; render(); box.scrollTop = 0; });
    on('sTheme', v => { P.theme = v; RV.savePrefs(); RV.applyTheme(); render(); });
    on('sView', v => { RV.setView(v); });
    on('sSpeed', v => { P.speed = +v; RV.savePrefs(); $('spd').value = v; render(); });
    on('sSync', v => { P.sync = v; RV.savePrefs(); RV.map.buildSide(); render(); });
    on('sKind', v => { srcKind = v; result = null; render(); });
    on('sGuide', v => { S.guideTab = v; render(); });
    $('sAuto').onchange = e => { P.autoplay = e.target.checked; RV.savePrefs(); };
    $('sReset').onclick = () => {
      const was = P.source.link, local = ds && ds.src.kind === 'local';
      RV.resetPrefs(); RV.applyTheme(); $('spd').value = '1'; draft = RV.DEFAULT_LINK; srcKind = 'github'; result = null;
      RV.refreshAll();
      if (was !== RV.DEFAULT_LINK || local || !ds) apply(async () => RV.data.githubSource(RV.DEFAULT_LINK), RV.DEFAULT_LINK); else render();
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
  }

  RV.settings = { render: render, useSource(src) { srcKind = src.kind; return src._pick ? apply(pickFolder) : apply(async () => src); } };
})();
