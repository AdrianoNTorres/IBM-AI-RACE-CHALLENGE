/* Run viewer: the welcome and the guided tour. Shown once, on the first visit; "Redo the tutorial" on the
   Help page runs it again. Each step points at one part of the page and says what it is for. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, $ = RV.$;

  /* tab: the page the step needs; sel: the element it points at; side: where the card prefers to sit */
  const STEPS = [
    { tab: 'pv', sel: '.tiles', title: 'The project at a glance',
      text: 'This site follows a self-driving racing car through every version of its driver. These tiles show the best lap so far and how much time has been gained since the first one.' },
    { tab: 'pv', sel: '.chartcard', title: 'Lap time, version by version',
      text: 'Each dot is one version; lower is faster. Filled dots were kept, rings were rejected. Point at a dot for details, and use the mouse wheel to zoom in on the later versions.' },
    { tab: 'pv', sel: '#vmain > .tablewrap', side: 'top', title: 'Pick a version',
      text: 'Click a row to select a version. To compare several, drag across rows, or hold Ctrl and click to add one. Up to six can be shown together, each in its own colour.' },
    { tab: 'pv', sel: '#vside', side: 'left', title: 'What changed, and why',
      text: 'The panel explains what the selected version changed, why it was tried and what was decided. “Replay on the track” plays its lap.' },
    { tab: 'pm', sel: '#mapwrap', side: 'inside', title: 'The replay',
      text: 'The car drives its recorded lap. The coloured path is the line it took; the lines fanning out from the car are its distance sensors. Drag to move the map, use the wheel to zoom, double-click to return to the car.' },
    { tab: 'pm', sel: '#bar', side: 'top', title: 'Play, pause and step',
      text: 'Play or pause here, or press Space. The arrow keys move one step at a time; hold one to play slowly. Drag the slider to jump anywhere in the lap.' },
    { tab: 'pm', sel: '#side', side: 'left', title: 'Camera, layers and help',
      text: 'Choose how the camera follows the car and what is drawn on the map. Help lists the keys.' },
    { tab: 'pt', sel: '#pt', side: 'inside', title: 'Telemetry',
      text: 'Speed, throttle and brake along the lap. Click a chart to move the car to that point. With several versions selected, their lines are drawn together so you can see where one gains on another.' },
    { sel: '#viewsw', title: 'Two levels of detail',
      text: 'Basic view explains things in plain language and shows the main controls. Detailed view adds the technical record, every channel, sector times and all the controls.' },
    { sel: '#settingsTab', title: 'Settings',
      text: 'Theme and colours, the replay keys, how a replay starts, and where the data comes from.' },
    { sel: '#helpTab', title: 'Help',
      text: 'Everything explained, one subject at a time, with a search box. \u201cStart here\u201d has a button to see this tour again.' },
  ];

  let at = -1, open = false, lastFocus = null;
  const root = () => $('tour'), hole = () => $('tourHole'), card = () => $('tourCard');

  function done() {
    open = false; at = -1;
    root().hidden = true;
    if (!RV.prefs.tutorialDone) { RV.prefs.tutorialDone = true; RV.savePrefs(); }
    RV.map.tourLayers(false);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (!open) return;
    if (e.key === 'Tab') return;                                   /* Tab still moves between the card's buttons */
    if (e.key === 'Escape') { e.preventDefault(); done(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (at > 0) go(at - 1); }
    else if (e.key !== 'Enter' && e.key !== ' ') e.preventDefault();
    e.stopPropagation();                                           /* the replay keys stay quiet while the tour is open */
  }

  /* put the highlight on the step's element and the card beside it */
  function place() {
    if (!open) return;
    const st = STEPS[at], c = card(), h = hole(), W = innerWidth, H = innerHeight, gap = 14;
    const el = st ? document.querySelector(st.sel) : null;
    if (!el || !el.getClientRects().length) {                      /* the welcome, or an element that is not on screen */
      h.style.cssText = 'left:50%;top:50%;width:0;height:0';
      c.style.left = Math.max(12, (W - c.offsetWidth) / 2) + 'px'; c.style.top = Math.max(12, (H - c.offsetHeight) / 2) + 'px';
      return;
    }
    el.scrollIntoView({ block: 'nearest' });
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
    c.style.left = p[0] + 'px'; c.style.top = Math.max(12, p[1]) + 'px';
  }

  function go(k) {
    if (k >= STEPS.length) { done(); RV.showTab('pv'); return; }
    at = k;
    const st = STEPS[k];
    if (st && st.tab && S.ds && S.tab !== st.tab) RV.showTab(st.tab);
    const c = card();
    if (k < 0) {
      c.innerHTML = '<h2 id="tourTitle">Welcome to the run viewer</h2>' +
        '<p>This site replays the laps of a self-driving racing car and shows how its driver improved, version by version. Nothing here needs installing, and nothing you do changes the data.</p>' +
        '<p>A short tour shows where everything is. It takes about a minute.</p>' +
        '<div class="tour-acts"><button class="btn prim" id="tourNext">Take the tour</button><button class="btn" id="tourSkip">Skip for now</button></div>' +
        '<p class="note">You can run it again at any time: Help, Start here, “Redo the tutorial”.</p>';
    } else {
      c.innerHTML = '<div class="tour-count">Step ' + (k + 1) + ' of ' + STEPS.length + '</div><h2 id="tourTitle">' + st.title + '</h2><p>' + st.text + '</p>' +
        '<div class="tour-acts"><button class="btn prim" id="tourNext">' + (k === STEPS.length - 1 ? 'Finish' : 'Next') + '</button>' +
        (k > 0 ? '<button class="btn" id="tourBack">Back</button>' : '') + '<button class="btn ghost" id="tourSkip">End the tour</button></div>';
    }
    $('tourNext').onclick = () => go(at + 1);
    $('tourSkip').onclick = done;
    if ($('tourBack')) $('tourBack').onclick = () => go(at - 1);
    /* the page under the tour may still be laying itself out after a tab change */
    place(); requestAnimationFrame(place); setTimeout(place, 120);
    $('tourNext').focus({ preventScroll: true });
  }

  RV.tutorial = {
    /* welcome: start with the welcome card (true) or straight at the first step */
    start(welcome) {
      if (open) return;
      open = true; lastFocus = document.activeElement;
      S.verTab = 'overview'; S.teleTab = 'charts';         /* the steps point at the chart, the list and the charts */
      root().hidden = false;
      addEventListener('keydown', onKey, true);
      addEventListener('resize', place);
      /* the fastest lap replays while the tour is open, with the sensor beams the tour describes switched on */
      if (S.ds) {
        const best = S.ds.bestId, bv = best && S.ds.byId[best];
        if (bv && bv.file) RV.sel.only(best, () => { RV.play.go(0); RV.play.set(true); }); else if (S.R) RV.play.set(true);
        RV.map.tourLayers(true);
      }
      go(welcome ? -1 : 0);
    },
    isOpen: () => open,
  };
})();
