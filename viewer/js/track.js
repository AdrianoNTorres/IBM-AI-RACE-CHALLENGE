/* Run viewer: the outline of a track, built from a TORCS track file (XML) with the same arithmetic
   TORCS uses (track4.cpp): the plan (x, y), and the height and banking of the road for the 3D views. The file is read as text with regular expressions, not as an XML document:
   TORCS track files refer to external entities that a browser's XML parser refuses. */
(function () {
  'use strict';
  const RV = (globalThis.RV = globalThis.RV || {});

  /* the height along a segment: a cubic between its two end heights with the two end slopes (track4.cpp) */
  function spline(p0, p1, t0, t1, t) {
    const t2 = t * t, t3 = t * t2, h1 = 3 * t2 - 2 * t3;
    return (1 - h1) * p0 + h1 * p1 + (t3 - 2 * t2 + t) * t0 + (t3 - t2) * t1;
  }

  /* Sub-segments as TORCS builds them: {type, length, radius, arc, x, y, alf, s0} and, for the height,
     {z0, z1} (centre line at its start and end, m; flat in between, as TORCS's road is) and {b0, b1} (banking,
     rad; + = the left side is higher). */
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
    let ze = 0, etgt = 0, bke = 0;                      /* where the segment before ended: height, slope, banking */
    /* what lies beside the road, per side; a segment that says nothing about a part keeps what the one before had */
    const beside = { Left: { bw: 0, bh: 0, bs: 'plan', w: 0, surf: 'grass', kh: 0, ks: 'none' }, Right: { bw: 0, bh: 0, bs: 'plan', w: 0, surf: 'grass', kh: 0, ks: 'none' } };
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
      /* height: starts where the last segment ended unless it says otherwise; ends at "z end", or by its grade (%) */
      const has = name => new RegExp('<attnum name="' + name + '"').test(head);
      const zs = has('z start') ? num('z start', 0) : ze;
      ze = has('z end') ? num('z end', 0) : has('grade') ? zs + length * num('grade', 0) / 100 : zs;
      const bks = has('banking start') ? num('banking start', 0) * Math.PI / 180 : bke;
      if (has('banking end')) bke = num('banking end', 0) * Math.PI / 180;
      let stgt = etgt;
      const prof = /<attstr name="profil" val="(\w+)"/.exec(head);
      if (!prof || prof[1] === 'spline') {
        if (has('profil start tangent')) stgt = num('profil start tangent', 0) / 100;
        if (has('profil end tangent')) etgt = num('profil end tangent', 0) / 100;
      } else stgt = etgt = length ? (ze - zs) / length : 0;   /* a straight slope */
      const segLen = length, bkEnd = bke;
      const sideNow = {};
      for (const sd of ['Left', 'Right']) {
        const c = beside[sd], part = nm => { const m = new RegExp('<section name="' + sd + ' ' + nm + '">([\\s\\S]*?)</section>').exec(p); return m ? m[1] : null; };
        const nv = (t, nm, d) => { const m = new RegExp('<attnum name="' + nm + '"[^>]*val="([-\\d.eE]+)"').exec(t); return m ? parseFloat(m[1]) : d; };
        const sv = (t, nm, d) => { const m = new RegExp('<attstr name="' + nm + '"[^>]*val="([^"]*)"').exec(t); return m ? m[1] : d; };
        const bo = part('Border'), si = part('Side'), ba = part('Barrier');
        if (bo != null) { c.bw = nv(bo, 'width', c.bw); c.bh = nv(bo, 'height', c.bh); c.bs = sv(bo, 'style', c.bs); }
        const w0 = si != null ? nv(si, 'start width', nv(si, 'width', c.w)) : c.w, w1 = si != null ? nv(si, 'end width', nv(si, 'width', w0)) : w0;
        if (si != null) c.surf = sv(si, 'surface', c.surf);
        if (ba != null) { c.kh = nv(ba, 'height', c.kh); c.ks = sv(ba, 'style', c.ks); }
        sideNow[sd] = { bw: c.bw, bh: c.bh, bs: c.bs, w0: w0, w1: w1, surf: c.surf, kh: c.kh, ks: c.ks };
        c.w = w1;
      }
      const sideAt = (q, a, b) => ({ bw: q.bw, bh: q.bh, bs: q.bs, w0: q.w0 + (q.w1 - q.w0) * a, w1: q.w0 + (q.w1 - q.w0) * b, surf: q.surf, kh: q.kh, ks: q.ks });
      let zPrev = zs;
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
        const t0 = k / steps, t1 = (k + 1) / steps;
        seg.z0 = zPrev; seg.z1 = zPrev = spline(zs, ze, stgt * segLen, etgt * segLen, t1);
        seg.b0 = bks + (bkEnd - bks) * t0; seg.b1 = bks + (bkEnd - bks) * t1;
        seg.L = sideAt(sideNow.Left, t0, t1); seg.R = sideAt(sideNow.Right, t0, t1);
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
    trk.zgap = subs[subs.length - 1].z1 - subs[0].z0;  /* and how far its height is from the height it started at */
    outline(trk);
    sectors(trk);
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

  /* Height of the centre line (m) and banking (rad, + = left side higher) at distance s: [z, banking]. */
  function level(trk, s) {
    const subs = trk.subs, total = trk.total;
    s = ((s % total) + total) % total;
    let lo = 0, hi = subs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (subs[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    const g = subs[lo], f = g.length > 0 ? RV_clamp((s - g.s0) / g.length) : 0;
    return [g.z0 + (g.z1 - g.z0) * f, g.b0 + (g.b1 - g.b0) * f];
  }
  const RV_clamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  /* What lies beside the road at distance s, on the left (L) and the right (R): the border at the edge (bw wide, bh
     high, style bs: curb, plan or wall), the side beyond it (w wide, surface surf) and the barrier at its far end
     (kh high, style ks: wall or fence). */
  function verge(trk, s) {
    const subs = trk.subs, total = trk.total;
    s = ((s % total) + total) % total;
    let lo = 0, hi = subs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (subs[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    const g = subs[lo], f = g.length > 0 ? RV_clamp((s - g.s0) / g.length) : 0;
    const one = q => ({ bw: q.bw, bh: q.bh, bs: q.bs, w: q.w0 + (q.w1 - q.w0) * f, surf: q.surf, kh: q.kh, ks: q.ks });
    return { L: one(g.L), R: one(g.R) };
  }
  /* A point of the road surface in space: at distance s, `off` metres to the left of the centre line: [x, y, z]. */
  function point(trk, s, off) {
    const p = pose(trk, s), l = level(trk, s);
    return [p[0] - off * Math.sin(p[2]), p[1] + off * Math.cos(p[2]), l[0] + off * Math.tan(l[1])];
  }

  /* Both edges and the centre line every 2 m, a mark every 100 m, and the bounding box. */
  function outline(trk) {
    const hw = trk.hw, total = trk.total, left = [], right = [], centre = [], marks = [], high = [];
    const n = Math.trunc(total / 2);
    for (let i = 0; i <= n; i++) {
      const p = pose(trk, i < n ? total * i / n : 0), sn = Math.sin(p[2]), cs = Math.cos(p[2]);
      left.push([p[0] - hw * sn, p[1] + hw * cs]);
      right.push([p[0] + hw * sn, p[1] - hw * cs]);
      centre.push([p[0], p[1]]);
      high.push(level(trk, i < n ? total * i / n : 0));      /* [height, banking] of the same stations */
    }
    let z0 = 1e9, z1 = -1e9, zAt0 = 0, zAt1 = 0;
    high.forEach((h, i) => { if (h[0] < z0) { z0 = h[0]; zAt0 = total * i / n; } if (h[0] > z1) { z1 = h[0]; zAt1 = total * i / n; } });
    trk.high = high; trk.zbox = [z0, z1, zAt0, zAt1];       /* lowest and highest point of the centre line, and where */
    for (let m = 0; m < Math.trunc(total); m += 100) {
      const p = pose(trk, m), sn = Math.sin(p[2]), cs = Math.cos(p[2]);
      marks.push([m, p[0] - hw * sn, p[1] + hw * cs, p[0] + hw * sn, p[1] - hw * cs]);
    }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of left.concat(right)) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    trk.left = left; trk.right = right; trk.centre = centre; trk.marks = marks; trk.box = [x0, x1, y0, y1];
  }

  /* Timing sectors. Corkscrew is modelled on Laguna Seca, so it gets that circuit's three official timing
     sectors (IMSA timing sector map: S1 4514 ft 10 in, S2 4793 ft 3 in, S3 2508 ft 7 in, together the
     2.238-mile lap). The TORCS start line is taken as the finish line and each boundary is placed at the
     same share of the lap. A track without known sectors is split into thirds. */
  const REAL_SECTORS = {
    corkscrew: {
      src: 'the timing sectors of WeatherTech Raceway Laguna Seca (IMSA sector map), placed at the same share of the lap',
      len: [1376.12, 1460.98, 764.62],
      where: ['Start line to the straight before Turn 5 (Turns 1 to 4)', 'Turn 5 to the exit of Turn 9 (Turns 5 and 6, the Corkscrew, Rainey Curve)', 'Turns 10 and 11, back to the line'],
    },
  };
  function sectors(trk) {
    const def = REAL_SECTORS[trk.name.toLowerCase()], T = trk.total;
    if (def) {
      const sum = def.len[0] + def.len[1] + def.len[2];
      trk.sectors = { real: true, src: def.src, where: def.where, cuts: [def.len[0] / sum * T, (def.len[0] + def.len[1]) / sum * T] };
    } else {
      trk.sectors = { real: false, src: 'thirds of the lap (no timing sectors are known for this track)', where: ['First third', 'Second third', 'Last third'], cuts: [T / 3, 2 * T / 3] };
    }
    /* the line across the road at each boundary, for the map */
    trk.sectors.lines = trk.sectors.cuts.map(d => { const p = pose(trk, d), sn = Math.sin(p[2]), cs = Math.cos(p[2]); return [p[0] - trk.hw * sn, p[1] + trk.hw * cs, p[0] + trk.hw * sn, p[1] - trk.hw * cs]; });
  }

  /* Name for display: "corkscrew" becomes "Corkscrew". */
  function title(trk) { return trk.name.charAt(0).toUpperCase() + trk.name.slice(1); }

  RV.track = { parse: parse, pose: pose, level: level, point: point, verge: verge, title: title };
})();
