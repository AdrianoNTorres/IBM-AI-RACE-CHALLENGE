/* Run viewer: the welcome and the guided tours. The quick tour is offered once, on the first visit; the Help page
   starts any of the three again. Each step points at one part of the page and says what it is for. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$;

  /* One step. tab: the page it needs; sel: the element it points at; side: where the card prefers to sit;
     click: a control pressed first (a sub-tab) unless it is already on; sideTab: a tab of the Track page's side panel,
     by its label; loop: a stretch played on a loop while the step shows, as shares of the lap; bar: a window whose buttons stay in sight.
     Anything the reader closed is opened again for its step, and no step is left out. */
  const SIDE = '#side .sidebody', SIDE_TABS = { view: 'Camera', cars: 'Cars', layers: 'Layers', sectors: 'Sectors', help: 'Help' };
  const GENERAL = [
    { tab: 'pv', sel: '.tiles', title: 'The project at a glance',
      text: 'This site follows a self-driving racing car through every version of its driver. These tiles show the best lap so far and how much time has been gained since the first one.' },
    { tab: 'pv', sel: '.chartcard', click: '#vtabs button:first-child', title: 'Lap time, version by version',
      text: 'Each dot is one version; lower is faster. Filled dots are versions that were kept; rings are attempts that were turned down. Point at a dot for details, and use the mouse wheel to zoom in on the later versions.' },
    { tab: 'pv', sel: '#vmain > .tablewrap', side: 'top', title: 'Pick a version',
      text: 'Click a row to select a version. To compare several, drag across rows, or hold Ctrl and click to add one. Up to six can be shown together, each in its own colour.' },
    { tab: 'pv', sel: '#vside', side: 'left', title: 'What changed, and why',
      text: 'The panel explains what the selected version changed, why it was tried and what was decided. “Replay on the track” plays its lap.' },
    { tab: 'pm', sel: '#mapwrap', side: 'inside', title: 'The replay',
      text: 'The car drives its recorded lap. The coloured path is the line it took; the thin lines spreading out from the car are its distance sensors, which measure how far away the edge of the road is in each direction. Drag beside the road to move the map, use the wheel to zoom, double-click to return to the car.' },
    { tab: 'pm', sel: '#mapwrap', side: 'inside', loop: [0.62, 0.76], title: 'Loop one part of the track',
      text: 'Press the mouse button on the road where a stretch begins, drag along the road to where it ends, and let go: that stretch plays on a loop and the rest of the map is dimmed, as it is now. \u201cEnd loop\u201d, on the map and in the bar below, ends it; so does Esc. Dragging beside the road moves the map.' },
    { tab: 'pm', sel: '#v3bar', title: 'The track in 3D',
      text: '\u201c3D\u201d shows the same replay on the track with its hills and banking. Pick a camera: Orbit to turn the whole track with the mouse, Chase to ride behind the car, Relative to put the camera anywhere around it. \u201cAdvanced 3D\u201d puts you in the driver\u2019s seat and draws the car\u2019s sensors and its planned speed on the road. \u201c2D\u201d brings the flat map back.' },
    { tab: 'pm', sel: '#win-hud', bar: true, title: 'Every box is a window',
      text: 'Point at a box on the map and three round buttons appear on its edge. From left to right: close it, fold it into a small tab (click the tab to open it again), and put it back in its place at its normal size. Drag a box to move it; drag its corner to resize it. A closed box comes back under Layers.' },
    { tab: 'pm', sel: '#bar', side: 'top', title: 'Play, pause and step',
      text: 'Play or pause here, or press Space. The arrow keys move one step at a time; hold one to play slowly. Drag the slider to jump anywhere in the lap.' },
    { tab: 'pm', sel: '#side', side: 'left', title: 'Camera, layers and help',
      text: 'Choose how the camera follows the car and what is drawn on the map. Help lists the keys.' },
    { tab: 'pm', sel: '#twAdd', side: 'left', title: 'A second look at the same lap',
      text: '“+ Track window” opens another view of the replay in a window over the map, with its own camera and layers. Up to four can be open.' },
    { tab: 'pt', sel: '#pt', side: 'inside', title: 'Telemetry: the lap as charts',
      text: 'Speed, throttle and brake along the lap. Click a chart to move the car to that point; drag across one to play that stretch on a loop. With several versions selected, their lines are drawn together so you can see where one gains on another.' },
    { sel: '#viewsw', title: 'Two levels of detail',
      text: 'Basic view explains things in plain language and shows the main controls. Detailed view adds the technical record, every channel, sector times and all the controls.' },
    { sel: '#settingsTab', title: 'Settings',
      text: 'Theme and colours, the replay keys, how a replay starts, and where the data comes from.' },
    { sel: '#helpTab', title: 'Help',
      text: 'Everything explained, one subject at a time, with a search box. “Start here” has the buttons to see this tour or the two longer tutorials again.' },
  ];

  const BEGINNER = [
    { tab: 'pv', sel: '.tiles', title: 'What this site is about',
      text: 'A computer program drives a racing car around one track, on its own. People improved that program a little at a time, and every attempt is called a version. The big number is the quickest lap any version has driven.' },
    { tab: 'pv', sel: '.chartcard', click: '#vtabs button:first-child', title: 'The story in one picture',
      text: 'Read it from left to right: the first version is on the left, the newest on the right. The lower a dot sits, the quicker the lap. Filled dots are versions that were kept; rings are attempts that were turned down. Point at any dot to see which version it is.' },
    { tab: 'pv', sel: '#lists', title: 'Different ways to list the versions',
      text: 'These buttons sort the list below: every version in order, the fastest laps, the biggest gains and losses, and the highest top speeds. Tick “Kept versions only” to hide the attempts that were turned down.' },
    { tab: 'pv', sel: '#vmain > .tablewrap', side: 'top', title: 'Choose a version to look at',
      text: 'Each row is one version, with its lap time and whether it was kept. Click a row to choose it. Nothing you click here can break anything: the site only shows data.' },
    { tab: 'pv', sel: '#vside', side: 'left', title: 'What that version did',
      text: 'This panel describes the version you chose in plain words: what was changed and how the lap turned out. “Replay on the track” lets you watch it drive; “Telemetry” shows its lap as charts.' },
    { tab: 'pv', sel: '#vmain > .tablewrap', side: 'top', title: 'Put two versions side by side',
      text: 'Hold Ctrl and click a second row, or drag across several rows. Each chosen version gets its own colour, and up to six can be shown at once. That is how you see where a newer version is quicker.' },
    { sel: '#sel', title: 'What is chosen right now',
      text: 'The versions you chose are named here, on every page. The × beside a name takes it out again. “Clear comparison” keeps only the first one.' },
    { tab: 'pv', sel: '#bulkBar', side: 'top', title: 'Load everything, or add your own',
      text: 'A recording is fetched when you first choose its version. “Load all versions” fetches every recording at once, which fills in the rankings. “+ Add versions” is for putting in a lap of your own; you will not need it to look around.' },
    { tab: 'pm', sel: '#mapwrap', side: 'inside', title: 'Watch the lap',
      text: 'This is the track seen from above, with the car driving the lap exactly as it was recorded. The coloured trail is where it drove: red where it was slow, green where it was fast. Drag beside the road to move the map, roll the mouse wheel to zoom, double-click to go back to the car.' },
    { tab: 'pm', sel: '#mapwrap', side: 'inside', loop: [0.62, 0.76], title: 'Watch one corner again and again',
      text: 'Want a closer look at one part? Press the mouse button on the road where the part begins, drag along the road to where it ends, and let go. Only that part now plays, over and over, and the rest of the map goes darker, as you see here. The \u201cEnd loop\u201d button that appears on the map and in the bar below ends it; so does the Esc key.' },
    { tab: 'pm', sel: '#v3bar', title: 'See the hills: the track in 3D',
      text: 'The map is flat, but the real track climbs almost 50 m and drops again at the Corkscrew. Press \u201c3D\u201d to see that. Then choose how to look: \u201cOrbit\u201d lets you turn the whole track by dragging, \u201cChase\u201d follows behind the car, and \u201cRelative\u201d lets you put the camera wherever you like around the car. \u201cHeight\u201d makes the hills look taller so they are easier to see. \u201cAdvanced 3D\u201d puts you in the driver\u2019s seat: the coloured lines are what the car\u2019s sensors measure, and the colour on the road ahead is how fast its plan lets it go there, red for slow. Press \u201c2D\u201d to come back.' },
    { tab: 'pm', sel: '#win-hud', title: 'The numbers of the moment',
      text: 'How fast the car is going right now, how far round the lap it is and what it is doing: braking, coasting or on the throttle. The detailed view adds more numbers here.' },
    { tab: 'pm', sel: '#win-hud', bar: true, title: 'Move, shrink or close a box',
      text: 'Each box on the map is a little window. Put the mouse on one and three round buttons show up on its edge, as they do here. The first closes the box. The second folds it away into a small tab; click the tab to bring it back. The third puts the box back where it started, at its normal size. You can also drag a box anywhere, and drag its corner to make it bigger or smaller. Try it now: nothing you change here is kept.' },
    { tab: 'pm', sel: '#win-mini', title: 'Where on the track',
      text: 'A small map of the whole track with a dot for the car, so you never lose your place when the big map is zoomed in.' },
    { tab: 'pm', sel: '#win-sectorLive', title: 'The lap in three parts',
      text: 'The lap is split into three sectors. As the car finishes each one, its time appears here, next to the time of the fastest lap ever recorded. Green means quicker, red means slower.' },
    { tab: 'pm', sel: '#win-lapDeltaBar', title: 'Ahead or behind',
      text: 'One bar per car. It shows how far ahead of (green) or behind (red) the fastest recorded lap that car is at this exact point of the track.' },
    { tab: 'pm', sel: '#win-inputs', side: 'top', title: 'Steering wheel and pedals',
      text: 'The wheel turns as the car steers. The two bars are the brake pedal and the throttle, which is the accelerator: the fuller the bar, the harder the pedal is pressed.' },
    { tab: 'pm', sel: '#bar', side: 'top', title: 'Play, pause, rewind',
      text: 'Works like a video player. Play or pause with the button or the Space key. The arrow buttons move one small step; hold one for slow motion. Drag the slider to jump to any part of the lap, and change “Speed” to watch faster or slower.' },
    { tab: 'pm', sel: '#win-leg', side: 'left', title: 'What the colours mean',
      text: 'The key to the colours on the map. Every box on the map, this one included, can be dragged somewhere else, made bigger from its corner, folded or closed.' },
    { tab: 'pm', sel: '#twAdd', side: 'left', title: 'Two views at once',
      text: '“+ Track window” opens a second, smaller view of the same lap on top of the map. Keep one zoomed in on the car and one showing the whole track, for example. Up to four can be open, and each closes with its ×.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Camera', side: 'left', title: 'How the camera follows',
      text: 'Choose whether the view follows the car, and whether the map turns so the car always drives up the screen. “Back to the car” and “Whole track” get you home if you are lost.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Cars', side: 'left', title: 'The cars on the track',
      text: 'With several versions chosen, decide which cars are drawn: all of them, or only the one the camera follows. The detailed view adds how they are lined up: at the same moment of the lap, or at the same place on the track so their lines can be compared.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Layers', side: 'left', title: 'Switch things on and off',
      text: 'Everything drawn on the map has a switch here: the trail, the sensor lines, the distance marks and more. Turn off what you do not need; you can always turn it back on.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Sectors', side: 'left', title: 'Sector times',
      text: 'The times of the three parts of the lap for every version whose recording you have opened, so you can tell in which part one version beats another. This one belongs to the detailed view: in the basic view the tab offers a button to switch.' },
    { tab: 'pt', sel: '#pt', side: 'inside', click: '#ttabs button[data-t="charts"]', title: 'The lap as charts',
      text: 'Each chart runs from the start line on the left to the finish on the right. The top one is speed: valleys are corners, peaks are straights. Click anywhere on a chart and the car jumps to that spot on the track; drag across a chart and that part plays on a loop, just as on the map.' },
    { tab: 'pt', sel: '#pt', side: 'inside', click: '#ttabs button[data-t="summary"]', title: 'The lap in a few numbers',
      text: 'The summary gives the lap time, the top speed, the slowest corner and how much of the lap was spent braking or at full throttle, for every chosen version.' },
    { sel: '#viewsw', title: 'Simple or detailed',
      text: 'Basic view keeps to plain language and the main controls: stay here while you find your way. Detailed view adds the engineers’ notes, more charts and more switches. You can change at any time; nothing is lost.' },
    { sel: '#settingsTab', title: 'Make it yours',
      text: 'Light or dark colours, your own colour themes, which keys control the replay, and whether a replay starts playing by itself.' },
    { sel: '#helpTab', title: 'When you are stuck',
      text: 'Help explains every part of the site and has a search box. “Start here” on that page runs this tutorial again, or the other two.' },
  ];

  const ADVANCED = [
    { tab: 'pv', sel: '.tiles', title: 'Headline numbers',
      text: 'Best kept lap, total gain since the baseline, the count of kept and rejected versions, and the best theoretical lap: the sum of the best sector times among the recordings loaded so far. Load every recording to make that figure complete.' },
    { tab: 'pv', sel: '.chartcard', click: '#vtabs button:first-child', title: 'Lap-time chart',
      text: 'One dot per version, coloured by its decision: new best, kept without a new best, enabling change, or rejected. The step line is the best lap so far. Wheel zooms the version axis, drag pans, double-click resets; with the chart in focus the arrow keys step through versions and + and − zoom.' },
    { tab: 'pv', sel: '#vmain', side: 'inside', click: '#vtabs button:last-child', title: 'Sectors across versions',
      text: 'The same history split by sector, so a gain can be traced to the part of the lap it came from. It uses the recordings that are loaded; “Load all versions” on the first tab fills it in.' },
    { tab: 'pv', sel: '#lists', click: '#vtabs button:first-child', title: 'Rankings and filters',
      text: 'All versions in order, or ranked by lap, by gain or loss against the best lap before each version (the ten largest of each), or by top speed. “Kept versions only” removes the rejected ones from the list.' },
    { tab: 'pv', sel: '#vmain > .tablewrap', side: 'top', title: 'Selection and focus',
      text: 'Click selects one run; drag or Shift-click selects a range; Ctrl-click adds or removes one, up to six. The run clicked first is in focus: the map follows it and time gaps are measured against it. Arrow keys, Enter and Space do the same from the keyboard. The readout and the time-gap chart measure against the car in focus; the sector table, the delta bar and the analysis measure against the fastest lap recorded.' },
    { tab: 'pv', sel: '#bulkBar', side: 'top', title: 'Bulk loading and your own versions',
      text: '“Load all versions” reads every recording; “Unload non-selected” frees them again. “+ Add versions” enters a version by hand or imports CSV files: one validator marks each as valid, warning or blocked, entries are kept in this browser, and they export as a zip laid out for the repository.' },
    { tab: 'pv', sel: '#vside', side: 'left', title: 'The technical record',
      text: 'Lap, gap to the best so far and to the last kept version, top speed, slowest corner, damage, closest approach to the track edge and where, braking and full-throttle share. Below: sector times against the previous best, then the changelog entry itself (what changed, why, observed, decision, learned).' },
    { tab: 'pt', sel: '#pt', side: 'inside', click: '#ttabs button[data-t="charts"]', title: 'Channels along the lap',
      text: 'Speed, throttle, brake, steering, track position and gear against distance, plus a time-gap chart while runs are compared: the cumulative gap to the car in focus at the same distance. Drag loops that section, Shift-drag pans, wheel zooms the distance axis, click moves the car there, double-click shows the whole lap. One run is coloured by value; compared runs get one solid colour each. These are all the recorded channels: there is no acceleration channel.' },
    { tab: 'pt', sel: '#pt', side: 'inside', click: '#ttabs button[data-t="charts"]', title: 'Two laps at one corner',
      text: 'The usual job, end to end. On Versions, click the reference run, then Ctrl-click the run to compare. Here, drag across the corner on the speed chart: that section now loops on the Track page and is marked on every chart. Read the overlaid traces for where braking starts and where the throttle comes back, the time-gap chart for where the time goes, and the section table for how much.' },
    { tab: 'pt', sel: '#pt', side: 'inside', click: '#ttabs button[data-t="summary"]', title: 'Summary',
      text: 'The lap figures of every selected run in one table: lap, top speed, slowest corner, share of the lap braking and at full throttle.' },
    { tab: 'pt', sel: '#pt', side: 'inside', click: '#ttabs button[data-t="sectors"]', need: true, title: 'Sector times',
      text: 'Sector times of the selected runs with their gaps. Together with the best theoretical lap on the Versions page this shows how much is left by combining the best sectors.' },
    { tab: 'pt', sel: '#pt', side: 'inside', click: '#ttabs button[data-t="sect"]', need: true, title: 'Section table',
      text: 'The lap cut into equal sections (100 m unless you change the length) with the time spent in each, per run. This is the finest view of where time is gained: sort out a corner here, then click through to it on the charts.' },
    { tab: 'pm', sel: '#mapwrap', side: 'inside', title: 'The replay',
      text: 'The track is rebuilt from its definition file and the car is placed from the recorded distance along the track, its sideways position and its angle. The driven line runs red (slowest) to green (fastest); the 19 beams run to the track edge they measured, pink when it is close and cyan when it is far. The readout, top left, also gives the speed the driver\u2019s stored plan allows at this point and the line accuracy against the reference lap. In the bar below, holding a step key plays in slow motion (0.1\u00d7, then 0.25\u00d7, then 0.5\u00d7) and \u201cAuto loop\u201d repeats the lap.' },
    { tab: 'pm', sel: '#mapwrap', side: 'inside', loop: [0.62, 0.76], title: 'Loop a section',
      text: 'Drag along the road to pick a stretch: it plays on a loop with the rest of the map dimmed (how dark is under Settings, Replay), and the charts mark the same stretch. Dragging across a telemetry chart does the same. \u201cEnd loop\u201d on the map or in the bar, or Esc, ends it; a drag that starts beside the road moves the map instead.' },
    { tab: 'pm', sel: '#v3bar', title: '3D: elevation, banking and cameras',
      text: 'The 3D view puts the replay on the road surface as TORCS builds it from the track file: height and banking per profile step (Corkscrew: \u22122.6 m to 46.5 m, banking \u22127\u00b0 to +6\u00b0). \u201cHeight\u201d scales the vertical axis; 1\u00d7 is true scale. Orbit: drag turns, wheel zooms, Shift-drag moves the pivot, or let it turn about the car. Chase trails the car; the wheel sets its distance. Relative is a fixed offset in the car\u2019s own axes (ahead, left, up), looking at the car or straight ahead; \u201cCockpit\u201d sets the driver\u2019s eye. Compared cars are drawn too. \u201cAdvanced 3D\u201d opens in the cockpit and adds the 19 track beams, each drawn to the point of the track edge it measured (faint when nothing was found within 200 m), and the plan\u2019s allowed speed tinted onto the road over the next 300 m in the colours of the driven line, so the gap between plan and car shows before each corner. The panels and the track windows stay as they are.' },
    { tab: 'pm', sel: '#win-hud', bar: true, title: 'Panels are windows',
      text: 'Readout, overview map, colour keys, wheel and pedals, sector table and delta bar are all windows. The three buttons that appear on a window\u2019s edge when the pointer is on it are, left to right: close, fold into a tab (click the tab to unfold), and back to its place at its normal size. While cars are compared a fourth shows only the car in focus. Drag to move, resize by the corner grip; switches and opacity are in the Layers tab, and positions are saved in this browser. Track windows have the same buttons.' },
    { tab: 'pm', sel: '#win-sectorLive', title: 'Live sector table',
      text: 'Sector times of the car in focus as it passes each sector line, against the fastest lap recorded. The fastest lap itself is compared with the next fastest.' },
    { tab: 'pm', sel: '#win-lapDeltaBar', title: 'Lap delta bar',
      text: 'Every selected car against the fastest lap recorded, as a cumulative time gap at the same distance along the track: green ahead, red behind. Watching it through a corner shows whether time is won on entry or on exit.' },
    { tab: 'pm', sel: '#twAdd', side: 'left', title: 'Track windows',
      text: 'Up to four more views of the same replay, in windows over the map. Each has its own camera, layers, path colour and cars; “Settings of” beside this button chooses which view the side panel changes. A common set-up is one window per compared car, each following its own.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Camera', side: 'left', title: 'Camera',
      text: 'Follow car, car points up (the map rotates so the car in focus drives toward the top), keep all cars in view, and the jumps back to the car or to the whole track. Camera movement is smoothed at normal speed and slower, so a follow view does not shake with the steering.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Cars', side: 'left', title: 'Cars',
      text: 'Which cars are shown (all selected, or only the one in focus) and where the others are placed: at the same lap time, which is the gap you would see on the track, or at the same distance, side by side, to compare lines. Click a car on the map or a name in the top bar to move the focus.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Layers', side: 'left', title: 'Layers',
      text: 'Every drawing on the map is a layer with a switch and an opacity: track, car and path, sensors, compared runs, and the analysis layers that mark problem areas and how accurately a run held the reference line. “Path colour” above switches the driven line between speed and braking.' },
    { tab: 'pm', sel: SIDE, sideTab: 'Sectors', side: 'left', title: 'Sectors and problem areas',
      text: 'Sector times for the cars shown and where each loses time to the fastest lap. The limits that decide what counts as a problem area are a share of the lap time, so they keep their meaning on a shorter or longer track.' },
    { tab: 'ps', sel: '#sTabs', click: '#sTabs button[data-v="general"]', title: 'Settings',
      text: 'Five tabs; click through them while this card is up. General: theme, view, and the reset of everything stored in this browser. Replay: whether a run plays when it opens, and at what speed. Data: the source, a public GitHub repository or a folder on this computer laid out the same way, and your own API keys, which stay in this browser. Customization: every colour of the site is a named token; pick a theme from the previews or build your own. Controls: re-assign the replay keys.' },
    { sel: '#helpTab', title: 'Help and deep links',
      text: 'Help has the data format a repository or folder must follow, and “Links to a particular state”: options after # in the address open the site on a given page, version, comparison and frame, which is the way to send someone an exact moment of a lap.' },
  ];

  const TOURS = {
    general: { name: 'Quick tour', steps: GENERAL },
    beginner: { name: 'First lap', steps: BEGINNER },
    advanced: { name: 'Full telemetry', steps: ADVANCED, detailed: true },
  };
  RV.TOUR_NAMES = { general: TOURS.general.name, beginner: TOURS.beginner.name, advanced: TOURS.advanced.name };

  let at = -1, open = false, lastFocus = null, which = 'general', STEPS = GENERAL, looping = false;
  let snap = null, back = '', touched = false, manual = null, tick = 0, barWin = null, absent = false, staged = false;
  const root = () => $('tour'), hole = () => $('tourHole'), card = () => $('tourCard');
  const shown = el => !!el && el.getClientRects().length > 0;

  /* the step about looping shows a loop; it ends with the step */
  function demoLoop(st) {
    if (looping) { RV.play.setLoop(null); looping = false; }
    if (!st || !st.loop || !S.R || !S.R.total) return;
    const L = [st.loop[0] * S.R.total, st.loop[1] * S.R.total];
    RV.play.setLoop(L); RV.play.go(RV.idxAtD(S.R, L[0])); RV.play.set(true); looping = true;
  }
  /* the step about a window's buttons keeps them in sight (they otherwise show when the pointer is on the window) */
  function showBar(st) {
    if (barWin) { barWin.classList.remove('tour-bar'); barWin = null; }
    const w = st && st.bar ? document.querySelector(st.sel) : null;
    if (w) { w.classList.add('tour-bar'); barWin = w; }
  }

  /* The reader may try anything while a tutorial runs. Everything stored is copied when it starts; when it ends the
     copy is put back and the page opens again on the page and the versions it was showing. */
  function putBack() {
    let p = null;
    try { p = JSON.parse(snap); } catch (e) { /* no copy: nothing to put back */ }
    if (!p) return false;
    p.tutorialDone = true;                                          /* any one of the three counts */
    for (const k in RV.prefs) delete RV.prefs[k];
    Object.assign(RV.prefs, p);                                     /* a save that is still on its way writes the copy */
    try { localStorage.setItem('rv_prefs', JSON.stringify(p)); sessionStorage.setItem('rv_tour_back', '1'); } catch (e) { return false; }
    if (location.hash.slice(1) !== back) location.hash = back;
    location.reload();
    return true;
  }
  /* after that reload: the options in the address have done their work */
  try {
    if (sessionStorage.getItem('rv_tour_back')) {
      sessionStorage.removeItem('rv_tour_back');
      let n = 0; const t = setInterval(() => { if ((S.ds && S.R) || ++n > 60) { clearInterval(t); history.replaceState(null, '', location.pathname + location.search); } }, 250);
    }
  } catch (e) { /* storage blocked */ }

  /* the tab is closed or reloaded in the middle of a tutorial: what was stored before is stored again */
  function onHide() {
    if (!open || !touched || !snap) return;
    try { const p = JSON.parse(snap); p.tutorialDone = true; localStorage.setItem('rv_prefs', JSON.stringify(p)); } catch (e) { /* not stored */ }
  }
  /* A folder on this computer cannot be opened again by a reload (browsers do not keep the access), so there the
     stored settings and the view are put back in place; layers and windows changed meanwhile stay until a reload. */
  function putBackInPlace() {
    let p = null;
    try { p = JSON.parse(snap); } catch (e) { /* no copy */ }
    if (!p) return;
    p.tutorialDone = true;
    const view = p.view;
    for (const k in RV.prefs) delete RV.prefs[k];
    Object.assign(RV.prefs, p); RV.savePrefs();
    if (view) RV.setView(view);
    RV.toast('The tutorial has ended. Your settings are back; layers and windows you changed are put back when the page is next loaded.');
  }
  function done() {
    const local = !!(S.ds && S.ds.src && S.ds.src.kind !== 'github');
    demoLoop(null); showBar(null);
    removeEventListener('pagehide', onHide);
    open = false; at = -1;
    root().hidden = true;
    document.body.classList.remove('touring');
    clearInterval(tick);
    removeEventListener('resize', place);
    if (touched && snap && !local && putBack()) return;
    if (staged) RV.map.tourLayers(false);
    if (touched && snap && local) putBackInPlace();
    if (!RV.prefs.tutorialDone) { RV.prefs.tutorialDone = true; RV.savePrefs(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* put the highlight on the step's element and the card beside it (or where the reader dragged it) */
  function place() {
    if (!open) return;
    const st = STEPS[at], c = card(), h = hole(), W = innerWidth, H = innerHeight, gap = 14;
    const el = st ? document.querySelector(st.sel) : null;
    const put = (x, y) => { if (manual) { x = manual[0]; y = manual[1]; } c.style.left = RV.clamp(x, 4, Math.max(4, W - c.offsetWidth - 4)) + 'px'; c.style.top = RV.clamp(y, 4, Math.max(4, H - c.offsetHeight - 4)) + 'px'; };
    if (absent || !shown(el)) {                                    /* a card without a step, or a part that is not on screen */
      h.style.cssText = 'left:50%;top:50%;width:0;height:0';
      put((W - c.offsetWidth) / 2, (H - c.offsetHeight) / 2);
      return;
    }
    const r = el.getBoundingClientRect(), pad = 6;
    const x0 = Math.max(4, r.left - pad), y0 = Math.max(4, r.top - pad), x1 = Math.min(W - 4, r.right + pad), y1 = Math.min(H - 4, r.bottom + pad);
    h.style.cssText = 'left:' + x0 + 'px;top:' + y0 + 'px;width:' + (x1 - x0) + 'px;height:' + (y1 - y0) + 'px';
    const cw = c.offsetWidth, ch = c.offsetHeight, cx = RV.clamp((x0 + x1) / 2 - cw / 2, 12, W - cw - 12), cy = RV.clamp((y0 + y1) / 2 - ch / 2, 12, H - ch - 12);
    const spots = {
      bottom: y1 + gap + ch <= H - 8 ? [cx, y1 + gap] : null, top: y0 - gap - ch >= 8 ? [cx, y0 - gap - ch] : null,
      left: x0 - gap - cw >= 8 ? [x0 - gap - cw, cy] : null, right: x1 + gap + cw <= W - 8 ? [x1 + gap, cy] : null,
      inside: [cx, Math.min(H - ch - 24, y1 - ch - 24)],
    };
    const p = spots[st.side] || spots.bottom || spots.top || spots.right || spots.left || spots.inside;
    put(p[0], Math.max(12, p[1]));
  }
  /* the card can be dragged out of the way; it goes back beside its subject with the next step */
  function dragCard(e) {
    if (e.pointerType !== 'mouse' || e.button || e.target.closest('button')) return;   /* a finger scrolls a long card */
    const c = card(), r = c.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = ev => { manual = [ev.clientX - dx, ev.clientY - dy]; place(); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); c.classList.remove('dragging'); };
    c.classList.add('dragging'); e.preventDefault();
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  /* the tab of the Track page's side panel with this label */
  function pressSide(label) {
    const b = [...document.querySelectorAll('#side .subtabs button')].find(x => x.textContent === label);
    if (b && !b.classList.contains('on')) b.click();
  }
  /* Bring the page into the state the step describes, whatever the reader did before: the right page and view, the
     side panel open, a closed or folded window back, the sub-tab pressed. False when the step needs a control
     that this data does not have: the step is still shown, without a highlight, so the reader learns the part exists. */
  function prepare(st) {
    if (TOURS[which].detailed && RV.prefs.view !== 'detailed') RV.setView('detailed');
    if (st.tab && S.ds && S.tab !== st.tab) RV.showTab(st.tab);
    if (st.tab === 'pm') {
      if ((st.sel.indexOf('#side') === 0 || st.sel === '#twAdd' || st.sideTab) && $('pm').classList.contains('side-closed')) $('sideToggle').click();
      if (st.sel.indexOf('#win-') === 0) RV.map.showPanel(st.sel.slice(5));
    }
    if (st.sideTab) pressSide(st.sideTab);
    if (!st.click) return true;
    const b = document.querySelector(st.click);
    if (b && !b.classList.contains('on')) b.click();
    return !!b || !st.need;                             /* need: without that control the step has nothing to point at */
  }

  /* the two other tutorials, offered on the first and the last card of the quick tour */
  const offer = (q, id, lead) => '<div class="tour-offer"><span>' + q + '</span><button class="btn sm" data-tour="' + id + '">' + lead + ' ' + TOURS[id].name + ' tutorial</button></div>';
  const LIVE = '<p class="note">Try things as you go: everything is put back the way it was when the tutorial ends. Drag this card if it is in the way.</p>';
  function acts() {
    $('tourNext').onclick = () => go(at + 1);
    if ($('tourSkip')) $('tourSkip').onclick = done;
    if ($('tourBack')) $('tourBack').onclick = () => go(at - 1);
    card().querySelectorAll('[data-tour]').forEach(b => { b.onclick = () => begin(b.dataset.tour, true); });
    place(); requestAnimationFrame(place); setTimeout(place, 120);   /* the page under the tour may still be laying itself out */
    $('tourNext').focus({ preventScroll: true });
  }

  function intro() {
    const c = card(), n = STEPS.length;
    if (which === 'general') {
      c.innerHTML = '<h2 id="tourTitle">Welcome to the run viewer</h2>' +
        '<p>This site replays the laps of a self-driving racing car and shows how its driver improved, version by version. Nothing here needs installing, and nothing you do changes the data.</p>' +
        '<p>This is the general tutorial: where things are on the site and how to use the basics. It takes about a minute.</p>' +
        '<div class="tour-acts"><button class="btn prim" id="tourNext">Take the tour</button><button class="btn" id="tourSkip">Skip for now</button></div>' +
        '<div class="tour-offers">' + offer('Complete rookie?', 'beginner', 'Check out the') + offer('Think you’re a master tech?', 'advanced', 'Check out the') + '</div>' +
        '<p class="note">You can run any of them again: Help, Start here. While one runs you can try everything; it is all put back when it ends.</p>';
    } else if (which === 'beginner') {
      c.innerHTML = '<div class="tour-count">' + TOURS.beginner.name + ' tutorial</div><h2 id="tourTitle">Start from zero</h2>' +
        '<p>No racing or computer knowledge needed. This tutorial goes through everything on the site in ' + n + ' short steps, in plain words, and shows what each part is for.</p>' +
        '<div class="tour-acts"><button class="btn prim" id="tourNext">Start</button><button class="btn" id="tourSkip">Not now</button></div>' + LIVE;
    } else {
      c.innerHTML = '<div class="tour-count">' + TOURS.advanced.name + ' tutorial</div><h2 id="tourTitle">Every tool, in detail</h2>' +
        '<p>' + n + ' steps through all the features: selection and focus, the analysis against the fastest lap, track windows, every telemetry table, your own data and deep links.</p>' +
        '<p>It runs in the detailed view and puts your view back when it ends.</p>' +
        '<div class="tour-acts"><button class="btn prim" id="tourNext">Start</button><button class="btn" id="tourSkip">Not now</button></div>' + LIVE;
    }
    acts();
  }
  function outro() {
    card().innerHTML = '<h2 id="tourTitle">That is the quick tour</h2>' +
      '<p>You have seen where everything is. The two longer tutorials go through every feature.</p>' +
      '<div class="tour-offers">' + offer('Still lost or confused?', 'beginner', 'Take the') + offer('Too easy? Not enough info? See what else Run Viewer has to offer:', 'advanced', 'Take the') + '</div>' +
      '<div class="tour-acts"><button class="btn prim" id="tourNext">Finish</button><button class="btn" id="tourBack">Back</button></div>';
    acts();
  }

  /* No step is left out. A part that this data has nothing for is described all the same, with a line that says
     why it is not on screen. */
  const ABSENT = '<p class="note tour-absent">Not on screen right now: the versions shown have nothing for this part. It appears by itself when they do.</p>';
  /* the fastest lap replays while the steps run, with the sensor beams they describe switched on; not before the
     first step, so that leaving at the welcome changes nothing */
  function stage() {
    staged = true;
    S.verTab = 'overview'; S.teleTab = 'charts';         /* the steps point at the chart, the list and the charts */
    if (!S.ds) return;
    const best = S.ds.bestId, bv = best && S.ds.byId[best];
    if (bv && bv.file) RV.sel.only(best, () => { RV.play.go(0); RV.play.set(true); }); else if (S.R) RV.play.set(true);
    RV.map.tourLayers(true);
  }
  function go(k) {
    absent = false;
    if (k >= 0 && k < STEPS.length) {
      if (!staged) stage();
      touched = true;
      absent = !prepare(STEPS[k]) || !shown(document.querySelector(STEPS[k].sel));
    }
    if (k > STEPS.length || (k === STEPS.length && which !== 'general')) { const t = touched; done(); if (!t) RV.showTab('pv'); return; }
    at = k; manual = null;
    demoLoop(STEPS[k]); showBar(STEPS[k]);
    if (k < 0) return intro();
    if (k === STEPS.length) return outro();
    const st = STEPS[k], last = k === STEPS.length - 1 && which !== 'general';
    card().innerHTML = '<div class="tour-count">' + (which === 'general' ? 'Step ' : TOURS[which].name + ', step ') + (k + 1) + ' of ' + STEPS.length + '</div><h2 id="tourTitle">' + st.title + '</h2><p>' + st.text + '</p>' + (absent ? ABSENT : '') +
      '<div class="tour-acts"><button class="btn prim" id="tourNext">' + (last ? 'Finish' : 'Next') + '</button>' +
      (k > 0 ? '<button class="btn" id="tourBack">Back</button>' : '') + '<button class="btn ghost" id="tourSkip">End the tutorial</button></div>';
    acts();
  }

  /* start one of the tutorials; from a card of another one, the page is already set up */
  function begin(id, welcome) {
    which = TOURS[id] ? id : 'general';
    if (TOURS[which].detailed && RV.prefs.view !== 'detailed') { touched = true; RV.setView('detailed'); }
    STEPS = TOURS[which].steps;
    go(welcome ? -1 : 0);
  }

  RV.tutorial = {
    /* welcome: start with the first card (true) or straight at the first step; id: 'general' (the default), 'beginner' or 'advanced' */
    start(welcome, id) {
      if (open) return;
      open = true; touched = false; staged = false; manual = null; lastFocus = document.activeElement;
      /* what is stored and what is shown now, to come back to */
      RV.savePrefs();
      try { snap = localStorage.getItem('rv_prefs'); } catch (e) { snap = null; }
      back = (S.tab === 'ph' ? 'help' : 'tab=' + (S.tab === 'ps' ? 'pv' : S.tab)) + (S.sel && S.sel.length ? '&run=' + encodeURIComponent(S.sel[0]) + (S.sel.length > 1 ? '&cmp=' + S.sel.slice(1).map(encodeURIComponent).join(',') : '') : '');
      root().hidden = false;
      document.body.classList.add('touring');
      addEventListener('resize', place);
      tick = setInterval(place, 400);                      /* the reader may move or close what a step points at */
      if (!card().onpointerdown) card().onpointerdown = dragCard;
      addEventListener('pagehide', onHide);
      begin(id, welcome);
    },
    isOpen: () => open,
    which: () => which,
  };
})();
