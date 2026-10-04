/* Run viewer: the 2D outline of a track, built from a TORCS track file (XML) with the same arithmetic
   TORCS uses (track4.cpp). The file is read as text with regular expressions, not as an XML document:
   TORCS track files refer to external entities that a browser's XML parser refuses. */
(function () {
  'use strict';
  const RV = (globalThis.RV = globalThis.RV || {});

  /* Sub-segments as TORCS builds them: {type, length, radius, arc, x, y, alf, s0}. */
  function parse(xml) {
    const at = xml.indexOf('<section name="Main Track">');
    if (at < 0) throw new RV.RVError('track', 'This is not a TORCS track file: it has no "Main Track" section.');
    const main = xml.slice(at);
    const mw = /name="width"[^>]*val="([\d.]+)"/.exec(main);
    const mg = /name="profil steps length"[^>]*val="([\d.]+)"/.exec(main);
    const segAt = main.indexOf('<section name="Track Segments">');
    if (!mw || segAt < 0) throw new RV.RVError('track', 'This track file has no track width or no "Track Segments" section.');
    const width = parseFloat(mw[1]), gstep = mg ? parseFloat(mg[1]) : 0;
    /* top-level segment sections: split on the type attribute, which only segments have */
    const parts = main.slice(segAt).split(/(?=<section name="[^"]+">\s*<attstr name="type")/).slice(1);
    if (!parts.length) throw new RV.RVError('track', 'This track file lists no segments.');

    const subs = [];
    let x = 0, y = 0, alf = 0, tot = 0;
    for (const p of parts) {
      const head = p.split('<section name="Left')[0].split('<section name="Right')[0];
      const num = function (name, dflt) {
        const m = new RegExp('<attnum name="' + name + '"[^>]*val="([-\\d.eE]+)"').exec(head);
        return m ? parseFloat(m[1]) : dflt;
      };
      const typ = /<attstr name="type" val="(\w+)"/.exec(head)[1];
      let length, radius, rend, arc;
      if (typ === 'str') {
        length = num('lg', 0); radius = 0; rend = 0; arc = 0;
      } else {
        radius = num('radius', 0);
        rend = num('end radius', radius);
        arc = num('arc', 0) * Math.PI / 180;
        length = (radius + rend) / 2 * arc;
      }
      let steps = Math.trunc(num('profil steps', 1));
      if (steps === 1) {
        const sl = num('profil steps length', gstep);
        steps = sl ? Math.trunc(length / sl) + 1 : 1;
      }
      let curArc = arc / steps, curLen = length / steps, drad = (rend - radius) / steps;
      if (rend !== radius && steps !== 1) {
        drad = (rend - radius) / (steps - 1);
        let ta = 0, tr = radius;
        for (let k = 0; k < steps; k++) { ta += curLen / tr; tr += drad; }
        curLen *= arc / ta;
      }
      for (let k = 0; k < steps; k++) {
        if (typ !== 'str' && drad !== 0) curArc = curLen / radius;
        const seg = { type: typ, length: curLen, radius: radius, arc: curArc, x: x, y: y, alf: alf, s0: tot };
        subs.push(seg);
        if (typ === 'str') {
          x += curLen * Math.cos(alf); y += curLen * Math.sin(alf);
        } else {
          const sg = typ === 'lft' ? 1 : -1;
          const cx = x - sg * radius * Math.sin(alf), cy = y + sg * radius * Math.cos(alf);
          alf += sg * curArc;
          x = cx + sg * radius * Math.sin(alf); y = cy - sg * radius * Math.cos(alf);
          seg.length = curArc * radius;
        }
        tot += seg.length;
        if (typ !== 'str') radius += drad;
      }
    }
    if (!(tot > 0)) throw new RV.RVError('track', 'This track file gives a track of zero length.');

    const nm = /<params name="([^"]+)"/.exec(xml);
    const trk = { subs: subs, width: width, hw: width / 2, total: tot, name: nm ? nm[1] : 'track' };
    const end = pose(trk, tot - 1e-6);
    trk.gap = Math.hypot(end[0], end[1]);              /* how far the end of the lap is from its start */
    outline(trk);
    return trk;
  }

  /* Centre-line point and tangent heading at distance s from the start: [x, y, heading]. */
  function pose(trk, s) {
    const subs = trk.subs, total = trk.total;
    s = ((s % total) + total) % total;
    let lo = 0, hi = subs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (subs[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    const g = subs[lo], d = s - g.s0;
    if (g.type === 'str') return [g.x + d * Math.cos(g.alf), g.y + d * Math.sin(g.alf), g.alf];
    const sg = g.type === 'lft' ? 1 : -1;
    const cx = g.x - sg * g.radius * Math.sin(g.alf), cy = g.y + sg * g.radius * Math.cos(g.alf);
    const a = g.alf + sg * d / g.radius;
    return [cx + sg * g.radius * Math.sin(a), cy - sg * g.radius * Math.cos(a), a];
  }

  /* Both edges and the centre line every 2 m, a mark every 100 m, and the bounding box. */
  function outline(trk) {
    const hw = trk.hw, total = trk.total, left = [], right = [], centre = [], marks = [];
    const n = Math.trunc(total / 2);
    for (let i = 0; i <= n; i++) {
      const p = pose(trk, i < n ? total * i / n : 0), sn = Math.sin(p[2]), cs = Math.cos(p[2]);
      left.push([p[0] - hw * sn, p[1] + hw * cs]);
      right.push([p[0] + hw * sn, p[1] - hw * cs]);
      centre.push([p[0], p[1]]);
    }
    for (let m = 0; m < Math.trunc(total); m += 100) {
      const p = pose(trk, m), sn = Math.sin(p[2]), cs = Math.cos(p[2]);
      marks.push([m, p[0] - hw * sn, p[1] + hw * cs, p[0] + hw * sn, p[1] - hw * cs]);
    }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of left.concat(right)) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    trk.left = left; trk.right = right; trk.centre = centre; trk.marks = marks; trk.box = [x0, x1, y0, y1];
  }

  /* Name for display: "corkscrew" becomes "Corkscrew". */
  function title(trk) { return trk.name.charAt(0).toUpperCase() + trk.name.slice(1); }

  RV.track = { parse: parse, pose: pose, title: title };
})();
