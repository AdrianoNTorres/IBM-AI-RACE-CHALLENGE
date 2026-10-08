/* Run viewer: the Help page. One subject at a time, chosen from the list on the left, and a search box that
   finds a word in all of them. The guide to the data format is one of the subjects. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$, esc = RV.esc;

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
      '<tr><td>Run CSV</td><td>the first <code>runs/run_&lt;digits&gt;_&lt;digits&gt;.csv</code> in the Observed field; if that names none, the first anywhere in the entry</td><td>the recording that is replayed</td></tr>' +
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
      '<p><b>Sector times before a recording is opened:</b> when the site is published, a summary of every recording of its own repository is written (lap, sector times, sensors), so the Versions page knows them at once. For another repository or a folder, sector times appear as recordings are opened.</p>' +
      '<p>A version without a CSV is listed but cannot be replayed. A recording that stops early is shown as an incomplete lap; an empty one is reported as such.</p>'],
    optional: ['Optional files',
      '<h4>docs/CHANGELOG-simple.md</h4><p>Same format as <code>docs/CHANGELOG.md</code>, same version names. Its title and its What changed, Why, Decision and Learned fields are the texts of the <b>basic view</b>. Without this file the basic view cannot be selected and the page uses the detailed view.</p>' +
      '<h4>track.xml</h4><p>The map is computed from a TORCS track file. <b>Supplying it is your job:</b> to see your own track, put the track\u2019s TORCS file (for example <code>tracks/road/&lt;name&gt;/&lt;name&gt;.xml</code> from a TORCS install) at the root of the repository or folder, named <code>track.xml</code>.</p>' +
      '<p>Without it the page uses the Corkscrew track bundled with it. If a run does not fit the track in use (its longest <code>distFromStart</code> differs from the track length by more than ' + RV.data.FIT_TOL + ' m), the Track tab says so instead of drawing the run on a wrong map; Versions and Telemetry still work.</p>' +
      '<h4>Other CSVs in runs/</h4><p>In a local folder, CSVs that no changelog entry names (manual laps) are listed under “Other recordings” on the Versions tab. From GitHub only the recordings named in the changelog are read.</p>'],
    local: ['Entered by hand',
      '<p>Versions, <b>Add versions</b> opens a window for entering a version by hand or importing several from CSV files. The site cannot write to its source, so these versions are stored in <b>this browser</b> (its own database for this site, on this device) and carry the badge <b>Local</b>. Nothing is uploaded. Another device or another visitor does not see them, and clearing the browser\u2019s site data deletes them. They belong to the source they were entered under.</p>' +
      '<h4>What is checked</h4><p>Every version is checked before it is stored, with the rules of the other tabs of this guide.</p>' +
      '<table class="spec"><tr><th>Outcome</th><th>When</th><th>What happens</th></tr>' +
      '<tr><td>Ready</td><td>nothing is missing</td><td>it is added</td></tr>' +
      '<tr><td>Incomplete</td><td>no recording; no lap time; an unfinished lap; a recording without the sensor columns or without <code>allowed</code>; empty fields; a typed lap time that differs from the recording\u2019s</td><td>the window says what is missing and what that affects; it is added once you tick \u201cEnter it anyway\u201d</td></tr>' +
      '<tr><td>Cannot be entered</td><td>a name that is not <code>v</code> and numbers, that exists already, or that is not newer than the latest version; no title or no result; a lap time or speed that cannot be read; a recording that is empty, lacks a required column, has no rows of a lap or does not fit the track</td><td>it is not stored</td></tr></table>' +
      '<p>A new name must be higher than the latest version: after <code>v1.06</code>, both <code>v1.06.1</code> and <code>v1.07</code> are fine.</p>' +
      '<h4>Importing files</h4><p>Several CSV files can be chosen at once. A run CSV becomes a version with that recording. A <b>table</b> has one row per version and these columns (only <code>version</code> is required; the window has a template):</p>' +
      '<pre>' + RV.validate.TABLE_HEAD.join(', ') + '</pre>' +
      '<p><code>result</code> is <code>kept</code>, <code>kept-enabling</code>, <code>rej-enabling</code> or <code>rejected</code>. <code>recording</code> names a run CSV chosen together with the table. Each version is checked on its own; those that cannot be entered are skipped and the rest are imported.</p>' +
      '<h4>Export</h4><p>The tab \u201cIn this browser\u201d of the window exports all of them or only the ticked ones as a zip: <code>docs/CHANGELOG-additions.md</code> (the entries, to paste at the end of the repository\u2019s changelog), the recordings under <code>runs/</code>, and <code>versions.csv</code> (the table, which can be imported in another browser together with the recordings). Once the repository has them, every visitor sees them and the copies in the browser can be deleted.</p>'],
  };

  /* 9: the name TORCS carries its explanation */
  for (const k in GUIDE) GUIDE[k][1] = GUIDE[k][1].replace(/TORCS/g, RV.TORCS);

  /* the name TORCS carries its explanation */
  for (const k in GUIDE) GUIDE[k][1] = GUIDE[k][1].replace(/TORCS/g, RV.TORCS);

  /* The help texts, in the order they were written: [title, html]. */
  function cards() {
    const out = [], ds = S.ds, k = s => '<kbd>' + s + '</kbd>';
    const card = (title, body) => { out.push([title, body]); return ''; };
    void ('' +
      card('New here?', '<p>Three tutorials point at each part of the screen in turn. The <b>' + RV.TOUR_NAMES.general + '</b> shows where things are, in about a minute. <b>' + RV.TOUR_NAMES.beginner + '</b> goes through every feature in plain words. <b>' + RV.TOUR_NAMES.advanced + '</b> goes through every feature in technical detail, in the detailed view.</p>' +
        '<div class="acts"><button class="btn prim" id="hTour">Redo the ' + RV.TOUR_NAMES.general.toLowerCase() + '</button><button class="btn" id="hTourB">' + RV.TOUR_NAMES.beginner + ' tutorial</button><button class="btn" id="hTourA">' + RV.TOUR_NAMES.advanced + ' tutorial</button></div>') +
      card('What this site is', '<p>The run viewer replays the laps of a self-driving racing car in the simulator ' + RV.TORCS + '. The car\u2019s driver is a set of hand-written rules that was improved one version at a time; each version drove one measured lap, and each was either kept or rejected.</p>' +
        '<p>The site only reads data. It changes nothing in the source, and nothing you open is uploaded anywhere. Your settings are saved in this browser.</p>') +
      card('The pages', '<dl class="helpdl">' +
        '<dt>Versions</dt><dd>Every version with its lap time, the lap-time chart, the rankings, and a panel that explains what the selected version changed and why.</dd>' +
        '<dt>Track</dt><dd>The replay on a map of the track: the car, the line it drove, and its sensor beams. “+ Track window” at the top of its side panel opens another view of the same replay in a window over the map, with its own camera, layers, path colour and cars; up to four. Click a window, or the map, to choose which one the side panel changes.</dd>' +
        '<dt>Telemetry</dt><dd>Charts of speed, throttle, brake and more along the lap, and in the detailed view sector times and a table of 100 m sections.</dd>' +
        '<dt>Settings</dt><dd>Five tabs: General (theme, view, reset), Replay (how a replay starts and looks), Data (the source and your own API keys), Customization (colours and themes) and Controls (the replay keys).</dd>' +
        '<dt>Help</dt><dd>This page. The list on the left has one entry per subject; the search box finds a word in all of them.</dd></dl>') +
      card('Selecting and comparing', '<ul class="helpul"><li><b>Select one version:</b> click its row on the Versions page.</li>' +
        '<li><b>Compare several (up to ' + RV.MAX_RUNS + '):</b> drag across rows, or Shift-click for a range, or Ctrl-click to add or remove one. Each gets its own colour.</li>' +
        '<li><b>The car in focus</b> is the one clicked first: the map follows it and time gaps are measured against it. Click another car on the map, its row in the Cars table, or its name in the top bar to put that one in focus.</li>' +
        '<li><b>Remove one:</b> the \u00d7 beside its name in the top bar. \u201cClear comparison\u201d keeps only the car in focus.</li></ul>') +
      card('Basic view and Detailed view', '<p>The switch in the top bar. <b>Basic view</b> uses plain-language descriptions and shows the main controls. <b>Detailed view</b> adds the technical record of each version, every telemetry channel, sector times and all the map layers. Nothing moves between the two: the detailed view adds to what the basic view shows.</p>' +
        (ds && !ds.hasSimple ? '<p class="warn">' + RV.NO_BASIC + '</p>' : '')) +
      card('Mouse and keyboard', '<table class="spec"><tr><th>Where</th><th>Do this</th><th>To</th></tr>' +
        '<tr><td>Replay</td><td>' + RV.kbd('play') + '</td><td>play or pause</td></tr>' +
        '<tr><td>Replay</td><td>' + RV.kbd('back') + ' ' + RV.kbd('fwd') + '</td><td>move one step; hold for slow motion (0.1\u00d7, then 0.25\u00d7, then 0.5\u00d7)</td></tr>' +
        '<tr><td>Replay</td><td>' + RV.kbd('home') + ', ' + RV.kbd('endloop') + '</td><td>back to the start of the lap; end the loop over a section</td></tr>' +
        '<tr><td>Map</td><td>drag, wheel, double-click</td><td>move the map, zoom, return to the car</td></tr>' +
        '<tr><td>Map</td><td>' + RV.kbd('zoomin') + ' ' + RV.kbd('zoomout') + ', ' + RV.kbd('follow') + '</td><td>zoom; follow the car or stop following</td></tr>' +
        '<tr><td>Charts</td><td>wheel, drag, click, double-click</td><td>zoom the distance axis, pan, move the car there, show the whole lap</td></tr>' +
        '<tr><td>Versions table</td><td>' + k('\u2191') + ' ' + k('\u2193') + ', ' + k('Enter') + ', ' + k('Space') + '</td><td>move between rows, select the row, add it to or remove it from the comparison</td></tr>' +
        '<tr><td>Lap-time chart</td><td>' + k('\u2190') + ' ' + k('\u2192') + ', ' + k('+') + ' ' + k('\u2212') + ', ' + k('0') + '</td><td>step through the versions, zoom, reset</td></tr>' +
        '<tr><td>Anywhere</td><td>' + k('Tab') + '</td><td>move to the next control</td></tr></table>' +
        '<div class="acts"><button class="btn" id="hKeys">Change the replay keys</button></div>') +
      card('Reading the colours', '<ul class="helpul"><li><b>Path on the map:</b> red where the car was slowest, green where it was fastest. In the detailed view it can show braking instead.</li>' +
        '<li><b>Sensor beams:</b> pink means the edge of the road is close, cyan means it is far.</li>' +
        '<li><b>Lap-time chart:</b> filled green = kept and a new best lap; filled blue = kept, not a new best; filled yellow = kept as an enabling change; red ring = rejected although its lap was faster; filled red = rejected, slower or equal; grey ring = rejected enabling change.</li>' +
        '<li><b>Time differences:</b> a minus sign, or \u201cfaster\u201d, means time gained.</li></ul>') +
      card('Using your own data', '<p>The site can show any project laid out the same way: a public GitHub repository, or a folder on this computer. Choose it under Settings, Data. The source is checked first, and the page says what it found.</p>' +
        '<div class="acts"><button class="btn" id="hFormat">Show the data format</button></div>' +
        '<p class="note">Now showing: ' + (ds ? esc(ds.src.label()) : 'nothing is loaded') + '.</p>') +
      card('If something does not work', '<dl class="helpdl">' +
        '<dt>\u201cThe data could not be loaded\u201d</dt><dd>The page needs the network to read from GitHub. Check the connection and press Try again. A firewall or an extension that blocks raw.githubusercontent.com has the same effect.</dd>' +
        '<dt>A version cannot be replayed</dt><dd>It has no recording: the changelog names no run file for it, or the file is missing from the source.</dd>' +
        '<dt>\u201cThis run does not fit the track map\u201d</dt><dd>The runs were driven on another track than the map in use. The source needs its own track.xml (see the data format).</dd>' +
        '<dt>Basic view cannot be chosen</dt><dd>The source has no simplified changelog (docs/CHANGELOG-simple.md).</dd>' +
        '<dt>A version I entered is gone</dt><dd>Entered versions are kept in the browser they were entered in, for the source they were entered under. Another browser or device, a private window, or cleared site data does not have them. Export them to put them into the repository (Data format, Entered by hand).</dd>' +
        '<dt>A local folder is gone after a reload</dt><dd>Browsers do not keep access to a folder. Choose it again under Settings, Data.</dd></dl>') +
      card('Links to a particular state', '<p>Options after <code>#</code> in the address open the page in a given state, for example <code>#tab=pm&amp;run=v1.05&amp;cmp=v0.96&amp;mode=detailed</code>. <code>tab</code> is <code>pv</code>, <code>pm</code>, <code>pt</code>, <code>ps</code> or <code>ph</code> (this page); <code>run</code> and <code>cmp</code> name versions; <code>frame</code> pauses on a frame; <code>help</code> opens this page. The README lists them all.</p>') +
      '');
    return out;
  }
  /* the subjects: id, name in the list, and which of the cards above each one shows (the data format is the guide) */
  const NAV = [['start', 'Start here', [0, 1, 4]], ['pages', 'The pages', [2]], ['compare', 'Selecting and comparing', [3]], ['keys', 'Mouse and keyboard', [5]],
    ['colours', 'Reading the colours', [6]], ['own', 'Using your own data', [7]], ['format', 'Data format', null], ['problems', 'If something does not work', [8]], ['links', 'Links to a particular state', [9]]];
  let query = '';

  function guideHtml() {
    return '<div class="card guidecard"><div class="cardhead"><h3>Data format</h3><span class="note">What a repository or folder must contain</span></div>' +
      '<div class="seg wrap subtabs" id="sGuide" role="tablist">' + Object.keys(GUIDE).map(k => '<button role="tab" data-v="' + k + '" class="' + (k === S.guideTab ? 'on' : '') + '" aria-selected="' + (k === S.guideTab) + '">' + GUIDE[k][0] + '</button>').join('') + '</div>' +
      '<div class="guidebody">' + GUIDE[S.guideTab][1] + '</div></div>';
  }
  const cardHtml = c => '<div class="card helpcard"><div class="cardhead"><h3>' + c[0] + '</h3></div>' + c[1] + '</div>';
  const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').toLowerCase();

  function render() {
    const box = $('ph'), C = cards(), q = query.trim().toLowerCase();
    if (!NAV.some(n => n[0] === S.helpTab)) S.helpTab = 'start';
    let main, found = 0;
    if (q) {                                              /* every text that has the word, whatever its subject */
      const hits = C.filter(c => text(c[0] + ' ' + c[1]).includes(q)).map(cardHtml);
      const g = Object.keys(GUIDE).filter(k => text(GUIDE[k][0] + ' ' + GUIDE[k][1]).includes(q));
      if (g.length) { if (!g.includes(S.guideTab)) S.guideTab = g[0]; hits.push(guideHtml()); }
      found = hits.length;
      main = hits.length ? hits.join('') : '<div class="card"><p class="lead">Nothing in the help mentions \u201c' + esc(query.trim()) + '\u201d.</p><p class="note">Try another word, or pick a subject on the left.</p></div>';
    } else {
      const n = NAV.find(x => x[0] === S.helpTab);
      main = n[2] ? n[2].map(i => cardHtml(C[i])).join('') : guideHtml();
    }
    const keep = box.scrollTop, typing = document.activeElement && document.activeElement.id === 'hSearch';
    box.innerHTML = '<div class="setwrap"><div class="pagehead"><h1>Help</h1><p class="lead">What the run viewer shows and how to use it.</p></div>' +
      '<div class="helpgrid"><nav class="helpnav" aria-label="Help subjects"><input type="text" id="hSearch" placeholder="Search the help \u2026" aria-label="Search the help" spellcheck="false" autocomplete="off" value="' + esc(query) + '">' +
      (q ? '<p class="note">' + found + ' text' + (found === 1 ? '' : 's') + ' found. <button class="link" id="hClear">Clear the search</button></p>' : '') +
      NAV.map(n => '<button data-v="' + n[0] + '" class="' + (!q && n[0] === S.helpTab ? 'on' : '') + '" aria-current="' + (!q && n[0] === S.helpTab ? 'page' : 'false') + '">' + n[1] + '</button>').join('') + '</nav>' +
      '<div class="helpmain">' + main + '</div></div></div>';
    box.scrollTop = keep;
    const inp = $('hSearch');
    if (typing) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    inp.oninput = e => { query = e.target.value; render(); };
    inp.onkeydown = e => { if (e.key === 'Escape' && query) { query = ''; render(); } };
    if ($('hClear')) $('hClear').onclick = () => { query = ''; render(); };
    box.querySelectorAll('.helpnav button[data-v]').forEach(b => { b.onclick = () => { query = ''; S.helpTab = b.dataset.v; RV.uiSet('helpTab', S.helpTab); render(); box.scrollTop = 0; }; });
    box.querySelectorAll('#sGuide button').forEach(b => { b.onclick = () => { S.guideTab = b.dataset.v; render(); }; });
    if ($('hTour')) $('hTour').onclick = () => RV.tutorial.start(true);
    if ($('hTourB')) $('hTourB').onclick = () => RV.tutorial.start(true, 'beginner');
    if ($('hTourA')) $('hTourA').onclick = () => RV.tutorial.start(true, 'advanced');
    if ($('hFormat')) $('hFormat').onclick = () => open('format');
    if ($('hKeys')) $('hKeys').onclick = () => { S.setTab = 'controls'; RV.showTab('ps'); };
  }
  /* shows the Help page on one subject (an id from NAV); with no subject, where it was left */
  function open(subject) { query = ''; if (subject) { S.helpTab = subject; RV.uiSet('helpTab', subject); } RV.showTab('ph'); $('ph').scrollTop = 0; }

  RV.help = { render: render, open: open };
})();
