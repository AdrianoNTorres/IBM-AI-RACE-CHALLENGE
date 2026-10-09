/* Run viewer: which kind of device the page is open on, and the note for phones and tablets. The site was built
   for a mouse, a keyboard and a wide screen; on a touch device the reader is told so once, before anything else.
   The same text is on the Help page for everyone. */
(function () {
  'use strict';
  const RV = globalThis.RV, $ = RV.$;

  /* the three kinds, most at risk first: name, how risky, what to expect */
  const KINDS = [
    ['phone', 'Phone', 'Highest risk', 'Many functions are buggy or glitchy on a phone, and the screen is too small for most of the site.'],
    ['tablet', 'Tablet or iPad', 'Moderate risk', 'Most features work, but a lot of the site is still buggy on a tablet.'],
    ['pc', 'PC or laptop', 'Safest', 'What the site is designed for. A few bugs may still be there that have not been found or fixed yet.'],
  ];

  /* phone | tablet | pc. A touch screen as the main pointer means a phone or a tablet (an iPad calls itself a Mac,
     so the name of the device is no help); a laptop with a touch screen still has a mouse as its main pointer.
     "device=phone" or "device=tablet" in the address shows how the note looks, on any device. */
  function kind() {
    const m = /(?:^|[#&])device=(phone|tablet|pc)\b/.exec(location.hash);
    if (m) return m[1];
    let coarse = false;
    try { coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; } catch (e) { /* an old browser: a PC */ }
    if (!coarse || !(navigator.maxTouchPoints > 0)) return 'pc';
    return Math.min(screen.width, screen.height) < 600 ? 'phone' : 'tablet';
  }

  /* the three kinds as a list; `here` marks the reader's own */
  function rows(here) {
    return '<ul class="devlist">' + KINDS.map(k => '<li class="dev-' + k[0] + (k[0] === here ? ' here' : '') + '"><b>' + k[1] + '</b><span class="devrisk">' + k[2] + '</span>' +
      (k[0] === here ? '<span class="devhere">You are here</span>' : '') + '<p>' + k[3] + '</p></li>').join('') + '</ul>';
  }

  RV.device = {
    kind: kind,
    /* the text for the Help page */
    html: () => '<p>The run viewer was built for a mouse, a keyboard and a wide screen.</p>' + rows(kind()),
    /* Shows the note once on a phone or a tablet, then carries on with `then`. k: show it for this kind, seen or not. */
    note(then, k) {
      const here = k || kind(), box = $('devnote');
      if (!box || here === 'pc' || (!k && RV.prefs.deviceNote === here)) { if (then) then(); return; }
      const name = here === 'phone' ? 'phone' : 'tablet';
      box.innerHTML = '<div id="devcard" role="dialog" aria-modal="true" aria-labelledby="devTitle"><h2 id="devTitle">Best on a PC or laptop</h2>' +
        '<p>This site was built for a mouse, a keyboard and a wide screen. You can look around on this ' + name + ', but expect things to go wrong.</p>' + rows(here) +
        '<div class="tour-acts"><button class="btn prim" id="devOk">Continue on this ' + name + '</button></div>' +
        '<p class="note">This is shown once. You can read it again under Help, Start here.</p></div>';
      box.hidden = false;
      $('devOk').onclick = () => {
        box.hidden = true; box.innerHTML = '';
        RV.prefs.deviceNote = here; RV.savePrefs();
        if (then) then();
      };
      $('devOk').focus({ preventScroll: true });
    },
  };
})();
