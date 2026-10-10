/* Run viewer: analysis of the run in focus against the reference lap: the fastest lap recorded (RV.map.fastest),
   or, when the run in focus is that lap, the next fastest lap that is loaded.
   - Racing-line accuracy: how close the car's line is to the reference lap's line, as a percentage, and a path
     on the map coloured from green (on the line) to red (furthest from it).
   - Sector health: green, yellow or red for each sector, from the time lost in it.
   - Problem areas: the stretches of the lap where the most time is lost. Each gets a pin on the map (a click plays
     it on a loop) and a band on the telemetry charts (a click on its tag explains what differs there).
   Everything is worked out once per pair of runs and kept on the run (R._an). The map layers and the pins plug into
   the overlay framework (RV.map.addLayer), so they have their switch, opacity and width under Layers, Analysis. */
(function () {
  'use strict';
  const RV = globalThis.RV, S = RV.S, esc = RV.esc;

  /* the numbers that decide what counts as what; all in one place */
  const K = {
    lineFull: 3,                        /* metres from the reference line that count as 0 % for that point */
    lineOn: 0.5,                        /* within this many metres the car is "on the line" */
    /* Time lost is judged as a share of the reference lap's time, so the same rules fit a 70 s lap and a 4 minute
       one. The shares are written in thousandths of a per cent of the lap; on a 73 s lap they come to the seconds in
       brackets. limits(ref) turns them into seconds for one reference lap. */
    healthOk: 68.4, healthWarn: 341.8,  /* lost in a sector: up to the first is green (0.05 s), up to the second yellow (0.25 s), more is red */
    win: 25,                            /* metres: the lap is examined in windows of this length */
    winLoss: 13.67,                     /* lost in one window for it to belong to a problem area (0.010 s) */
    zoneLoss: 54.7, zoneBad: 164.1,     /* lost over an area: from the first it is a problem, yellow (0.04 s); from the second a bad one, red (0.12 s) */
    zones: 6,                           /* at most this many problem areas */
    lead: 50,                           /* metres before an area that the loop and the explanation also take in: the cause is usually on the way in */
  };

  /* a run's lap clock at lap distance d, and the index of the step there */
  function tAt(r, d) {
    const j = RV.idxAtD(r, d);
    if (j >= r.n - 1) return r.t[r.n - 1];
    const d0 = r.d[j], d1 = r.d[j + 1];
    return d1 > d0 && d > d0 ? r.t[j] + (r.t[j + 1] - r.t[j]) * (d - d0) / (d1 - d0) : r.t[j];
  }
  const sev = (x, a, b) => (x <= a ? 'ok' : x <= b ? 'warn' : 'bad');
  /* the limits in seconds for one reference lap: its lap time times each share */
  function limits(ref) {
    const lap = ref.sum && ref.sum.lap != null ? ref.sum.lap : ref.t[ref.n - 1] - ref.t[0], f = Math.max(lap, 1) / 1e5, o = { lap: lap };
    for (const k of ['healthOk', 'healthWarn', 'winLoss', 'zoneLoss', 'zoneBad']) o[k] = K[k] * f;
    return o;
  }
  /* a limit in words: seconds, to as many places as it needs */
  const secs = x => (x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3).replace(/0$/, '')) + ' s';
  const WORD = { ok: 'on pace', warn: 'needs some work', bad: 'needs work' };

  /* Everything about run R against the reference lap, or null when there is nothing to compare with (no map
     position, no reference yet). self: R is the reference lap itself. */
  function of(R) {
    if (!R || !R.x || !S.ds || !S.ds.trk) return null;
    let ref = RV.map.fastest(), what = 'the fastest lap';
    if (ref === R) {
      /* The fastest lap has nothing faster to be measured against, so it is measured against the next fastest lap
         that is loaded: it still loses time to that one in places. Its previous best is read in the background for this. */
      RV.needRef(R.name);
      ref = null; what = 'the next fastest lap';
      for (const r of S.ds.loaded.values()) if (r !== R && r.x && r.sum && r.sum.lap != null && (!ref || r.sum.lap < ref.sum.lap)) ref = r;
    }
    if (!ref || !ref.x) return null;
    if (R._an && R._an.ref === ref) return R._an;
    const hw = S.ds.trk.hw, n = R.n, dev = new Float32Array(n), self = ref === R, L = limits(ref);
    let sum = 0, max = 0, maxAt = 0, on = 0, len = 0;
    /* line: the sideways distance between the two cars at the same point of the lap, in metres */
    for (let k = 0, j = 0; k < n; k++) {
      while (j < ref.n - 1 && ref.d[j + 1] <= R.d[k]) j++;
      const v = self ? 0 : Math.abs(R.tp[k] - ref.tp[j]) * hw;
      dev[k] = v;
      const w = k ? Math.max(0, R.d[k] - R.d[k - 1]) : 0;                  /* weighted by distance, not by time */
      sum += Math.max(0, 1 - v / K.lineFull) * w; len += w;
      if (v <= K.lineOn) on += w;
      if (v > max) { max = v; maxAt = R.d[k]; }
    }
    let mean = 0;
    for (let k = 1; k < n; k++) mean += dev[k] * Math.max(0, R.d[k] - R.d[k - 1]);
    const line = { dev: dev, pct: len ? 100 * sum / len : 100, on: len ? 100 * on / len : 100, mean: len ? mean / len : 0, max: max, maxAt: maxAt };
    /* sectors: seconds lost in each */
    const health = R.sec && ref.sec ? [0, 1, 2].map(k => (R.sec[k] == null || ref.sec[k] == null ? null : { delta: R.sec[k] - ref.sec[k], sev: sev(R.sec[k] - ref.sec[k], L.healthOk, L.healthWarn) })) : null;
    /* problem areas: windows where time is lost, joined when they touch */
    const zones = [];
    if (!self) {
      const end = Math.min(R.d[n - 1], ref.d[ref.n - 1]) - K.win;
      let cur = null;
      for (let d = 0; d <= end; d += K.win) {
        const loss = (tAt(R, d + K.win) - tAt(R, d)) - (tAt(ref, d + K.win) - tAt(ref, d));
        if (loss >= L.winLoss) { if (cur && d - cur.d1 <= K.win) { cur.d1 = d + K.win; cur.loss += loss; } else { cur = { d0: d, d1: d + K.win, loss: loss }; zones.push(cur); } }
      }
    }
    const top = zones.filter(z => z.loss >= L.zoneLoss).sort((a, b) => b.loss - a.loss).slice(0, K.zones).sort((a, b) => a.d0 - b.d0);
    top.forEach((z, k) => { z.n = k + 1; z.sev = z.loss >= L.zoneBad ? 'bad' : 'warn'; z.from = Math.max(0, z.d0 - K.lead); z.why = explain(R, ref, z, hw); });
    return (R._an = { ref: ref, what: what, self: self, line: line, health: health, zones: top, lim: L });
  }

  /* What differs between the two laps in a problem area: sentences, the most telling first. */
  function explain(R, ref, z, hw) {
    const a = z.from, b = z.d1, why = [];
    const span = r => [RV.idxAtD(r, a), RV.idxAtD(r, b)];
    const stat = r => {
      const q = span(r);
      let lo = 1e9, loAt = 0, brake = null, brakeM = 0, full = null;
      for (let k = q[0]; k <= q[1]; k++) {
        if (r.v[k] < lo) { lo = r.v[k]; loAt = r.d[k]; }
        if (r.br[k] > 0.05) { if (brake == null) brake = r.d[k]; if (k > q[0]) brakeM += r.d[k] - r.d[k - 1]; }
      }
      for (let k = RV.idxAtD(r, loAt); k <= q[1]; k++) if (r.th[k] >= 0.99) { full = r.d[k]; break; }
      return { vin: r.v[q[0]], vout: r.v[q[1]], lo: lo, loAt: loAt, brake: brake, brakeM: brakeM, full: full };
    };
    const me = stat(R), it = stat(ref), id = esc(ref.name), m = x => RV.fmtInt(x) + ' m', kmh = x => x.toFixed(0) + ' km/h';
    if (me.vin < it.vin - 3) why.push('It arrives ' + kmh(it.vin - me.vin) + ' slower (' + kmh(me.vin) + ' against ' + kmh(it.vin) + ' at ' + m(a) + ').');
    if (me.brake != null && it.brake != null && it.brake - me.brake > 5) why.push('It brakes ' + (it.brake - me.brake).toFixed(0) + ' m earlier (at ' + m(me.brake) + '; ' + id + ' at ' + m(it.brake) + ').');
    else if (me.brake != null && it.brake != null && me.brake - it.brake > 5) why.push('It brakes ' + (me.brake - it.brake).toFixed(0) + ' m later (at ' + m(me.brake) + '; ' + id + ' at ' + m(it.brake) + ').');
    else if (me.brake != null && it.brake == null) why.push('It brakes here (from ' + m(me.brake) + '); ' + id + ' does not.');
    if (me.brakeM > it.brakeM + 8) why.push('It is on the brakes for ' + (me.brakeM - it.brakeM).toFixed(0) + ' m more.');
    if (me.lo < it.lo - 2) why.push('Its slowest point is ' + kmh(it.lo - me.lo) + ' slower (' + kmh(me.lo) + ' at ' + m(me.loAt) + '; ' + id + ' ' + kmh(it.lo) + ').');
    if (me.full != null && it.full != null && me.full - it.full > 8) why.push('It is back on full throttle ' + (me.full - it.full).toFixed(0) + ' m later (at ' + m(me.full) + ').');
    else if (me.full == null && it.full != null) why.push('It does not get back to full throttle here; ' + id + ' does at ' + m(it.full) + '.');
    if (me.vout < it.vout - 3) why.push('It leaves ' + kmh(it.vout - me.vout) + ' slower, which goes on costing time on the stretch that follows.');
    let off = 0, offAt = 0;
    for (let k = RV.idxAtD(R, a), e = RV.idxAtD(R, b), j = 0; k <= e; k++) { while (j < ref.n - 1 && ref.d[j + 1] <= R.d[k]) j++; const v = Math.abs(R.tp[k] - ref.tp[j]) * hw; if (v > off) { off = v; offAt = R.d[k]; } }
    if (off > 0.6) why.push('Its line is up to ' + off.toFixed(1) + ' m from ' + id + '’s (at ' + m(offAt) + ').');
    if (!why.length) why.push('No single cause stands out: the loss is spread over the section.');
    return why;
  }

  const lossTxt = x => '+' + x.toFixed(2) + ' s';
  function loop(z) {
    const R = S.R;
    RV.play.setLoop([z.from, z.d1]); RV.play.go(RV.idxAtD(R, z.from)); RV.play.set(true);
    RV.toast('Playing ' + RV.fmtInt(z.from) + '–' + RV.fmtInt(z.d1) + ' m on a loop. ' + RV.loopHint());
  }

  /* ---------- the popup that explains a problem area ---------- */
  let dlg = null;
  function closePopup() { if (dlg) { dlg.remove(); dlg = null; removeEventListener('keydown', popKey, true); } }
  function popKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopup(); } }
  function popup(z) {
    const A = of(S.R);
    if (!A) return;
    closePopup();
    dlg = RV.el('div', 'keydlg', '<div class="keycard" role="dialog" aria-modal="true" aria-labelledby="anTitle"><h2 id="anTitle"><i class="hdot h-' + z.sev + '"></i>Problem area ' + z.n + '</h2>' +
      '<p class="lead"><b>' + lossTxt(z.loss) + '</b> lost to ' + esc(A.ref.name) + ' between ' + RV.fmtInt(z.d0) + ' and ' + RV.fmtInt(z.d1) + ' m.</p>' +
      '<h4>What ' + esc(S.R.name) + ' does differently</h4><ul class="helpul">' + z.why.map(w => '<li>' + w + '</li>').join('') + '</ul>' +
      '<p class="note">Compared with ' + esc(A.ref.name) + ', ' + A.what + ', over ' + RV.fmtInt(z.from) + '–' + RV.fmtInt(z.d1) + ' m (the area and the ' + K.lead + ' m before it). Select both versions to see their lines side by side.</p>' +
      '<div class="tour-acts"><button class="btn prim" id="anLoop">Play it on a loop</button><button class="btn" id="anTrack">Show it on the track</button><button class="btn ghost" id="anClose">Close</button></div></div>');
    document.body.appendChild(dlg);
    addEventListener('keydown', popKey, true);
    dlg.addEventListener('pointerdown', e => { if (e.target === dlg) closePopup(); });
    RV.$('anClose').onclick = closePopup;
    RV.$('anLoop').onclick = () => { closePopup(); loop(z); };
    /* not a second loop button: the car is put where the area starts and held there, on the Track tab */
    RV.$('anTrack').onclick = () => { closePopup(); RV.play.setLoop(null); RV.play.set(false); RV.play.go(RV.idxAtD(S.R, z.d0)); RV.showTab('pm'); };
    RV.$('anLoop').focus();
  }

  /* ---------- on the map ---------- */
  const NB = 16;
  /* The dark band under a coloured path. The driven line beneath is coloured by speed in the same red and green, so
     without the band (and the extra width) a path laid over it could not be told from it. */
  function ribbon(ctx, R, z, w, st) {
    ctx.lineWidth = (w + 4) / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = RV.pal['label-bg'];
    ctx.beginPath();
    for (let k = 0; k < R.n; k += st) { if (k) ctx.lineTo(R.x[k], R.y[k]); else ctx.moveTo(R.x[k], R.y[k]); }
    ctx.stroke();
  }
  let hits = [];                        /* where the pins were drawn in the last frame: [x, y, zone] */
  RV.map.addLayer({
    id: 'lineacc', g: 'Analysis', label: 'Racing-line accuracy', on: false, alpha: 1, w: 7,
    d: 'The driven line coloured by how far it is from the line of the reference lap: green on it, red furthest from it. The reference is the fastest lap; for the fastest lap itself, the next fastest.',
    draw(ctx, z) {
      const R = S.R, A = of(R);
      if (!A || A.self) return;
      const top = Math.max(A.line.max, 0.5), st = Math.max(1, Math.floor(1.2 / z));
      ribbon(ctx, R, z, this.w, st);
      ctx.lineWidth = this.w / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let b = 0; b < NB; b++) {                      /* one stroke per colour step */
        let any = false;
        ctx.beginPath();
        for (let k = 0; k < R.n - st; k += st) {
          if (RV.clamp(Math.floor(A.line.dev[k] / top * NB), 0, NB - 1) !== b) continue;
          ctx.moveTo(R.x[k], R.y[k]); ctx.lineTo(R.x[k + st], R.y[k + st]); any = true;
        }
        if (any) { ctx.strokeStyle = RV.colorScale((b + 0.5) / NB, 0, 1, -1); ctx.stroke(); }
      }
    },
  });
  RV.map.addLayer({
    id: 'bestline', g: 'Analysis', label: 'Line of the reference lap', on: false, alpha: 0.9, w: 1.5,
    d: 'The line the reference lap drove (the fastest lap; for the fastest lap itself, the next fastest), as a thin dashed path to compare with.',
    draw(ctx, z) {
      const A = of(S.R);
      if (!A || A.self) return;
      const r = A.ref, st = Math.max(1, Math.floor(1.2 / z));
      ctx.lineWidth = this.w / z; ctx.strokeStyle = RV.pal['label-ink']; ctx.setLineDash([6 / z, 5 / z]); ctx.beginPath();
      for (let k = 0; k < r.n; k += st) { if (k) ctx.lineTo(r.x[k], r.y[k]); else ctx.moveTo(r.x[k], r.y[k]); }
      ctx.stroke(); ctx.setLineDash([]);
    },
  });
  RV.map.addLayer({
    id: 'pins', g: 'Analysis', label: 'Problem pins', on: true, alpha: 1,
    d: 'A pin where the car in focus loses the most time to the reference lap (the fastest lap; for the fastest lap itself, the next fastest): yellow, or red for the worst. Click a pin to play that stretch on a loop.',
    screen(ctx, w2s) {
      hits = [];
      const R = S.R, A = of(R);
      if (!A) return;
      for (const z of A.zones) {
        const k = RV.idxAtD(R, (z.d0 + z.d1) / 2), p = w2s(R.x[k], R.y[k]), col = RV.pal['health-' + z.sev], y = p[1] - 22;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.arc(p[0], y, 11, Math.PI * 0.8, Math.PI * 0.2); ctx.closePath();   /* a drop standing on the spot */
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = RV.pal['label-ink']; ctx.stroke();
        ctx.fillStyle = RV.pal['label-bg']; ctx.font = '700 12px ' + RV.pal.fontNum; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(z.n), p[0], y + 0.5);
        const s = lossTxt(z.loss); ctx.font = '600 11px ' + RV.pal.fontNum;
        const w = ctx.measureText(s).width;
        ctx.fillStyle = RV.pal['label-bg']; ctx.beginPath(); ctx.roundRect(p[0] + 14, y - 9, w + 10, 18, 4); ctx.fill();
        ctx.fillStyle = RV.pal['label-ink']; ctx.textAlign = 'left'; ctx.fillText(s, p[0] + 19, y + 0.5);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        hits.push([p[0], y, z]);
      }
    },
  });
  /* a click on a pin plays its stretch on a loop */
  RV.map.onHit((mx, my) => {
    if (!RV.map.LAYERS.find(L => L.id === 'pins').on) return null;
    const h = hits.find(q => Math.hypot(q[0] - mx, q[1] - my) < 14);
    return h ? () => loop(h[2]) : null;
  });

  /* ---------- the delta to the compared cars ----------
     The time gap of the car in focus to the compared cars at every point of its lap, as official timing shows a
     delta: the difference in lap clock at the same place on the track. With several compared cars it is the gap to
     their mean; cars switched off (S.cmpOff) are left out. Positive: the car in focus is behind. */
  function cmpGap(R) {
    const shown = RV.cmpShown().filter(m => m.r && m.r.t);
    if (!R || !shown.length) return null;
    const key = shown.map(m => m.id).join();
    if (R._gap && R._gap.key === key) return R._gap;
    const g = new Float32Array(R.n), js = shown.map(() => 0), end = Math.min(S.ds.trk ? S.ds.trk.total : 1e9, R.d[R.n - 1], ...shown.map(m => m.r.d[m.r.n - 1]));   /* up to the line: rows logged after it do not count */
    let max = 0, maxAt = 0;
    for (let k = 0; k < R.n; k++) {
      if (R.d[k] > end) { g[k] = k ? g[k - 1] : 0; continue; }           /* past the line: the last gap stands */
      let sum = 0;
      shown.forEach((m, q) => {
        const r = m.r;
        let j = js[q];
        while (j < r.n - 1 && r.d[j + 1] <= R.d[k]) j++;
        js[q] = j;
        const d0 = r.d[j], d1 = j < r.n - 1 ? r.d[j + 1] : d0;
        sum += d1 > d0 && R.d[k] > d0 ? r.t[j] + (r.t[j + 1] - r.t[j]) * (R.d[k] - d0) / (d1 - d0) : r.t[j];
      });
      g[k] = R.t[k] - sum / shown.length;
      if (Math.abs(g[k]) > max) { max = Math.abs(g[k]); maxAt = R.d[k]; }
    }
    return (R._gap = { key: key, g: g, max: max, maxAt: maxAt, ids: shown.map(m => m.id) });
  }
  const deltaLayer = RV.map.addLayer({
    id: 'cmpdelta', g: 'Compared runs', label: 'Delta to the compared cars', on: false, alpha: 1, w: 7, cmp: true,
    d: 'The line of the car in focus coloured by its time gap to the compared cars at each point: green where they are level, red where the gap is largest. With several compared cars it is the gap to their average; switch single cars off under Cars, or on the Telemetry page.',
    draw(ctx, z) {
      const R = S.R, G = cmpGap(R);
      if (!G) return;
      const top = Math.max(G.max, 0.02), st = Math.max(1, Math.floor(1.2 / z));
      ribbon(ctx, R, z, this.w, st);
      ctx.lineWidth = this.w / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let b = 0; b < NB; b++) {
        let any = false;
        ctx.beginPath();
        for (let k = 0; k < R.n - st; k += st) {
          if (RV.clamp(Math.floor(Math.abs(G.g[k]) / top * NB), 0, NB - 1) !== b) continue;
          ctx.moveTo(R.x[k], R.y[k]); ctx.lineTo(R.x[k + st], R.y[k + st]); any = true;
        }
        if (any) { ctx.strokeStyle = RV.colorScale((b + 0.5) / NB, 0, 1, -1); ctx.stroke(); }
      }
    },
  });
  /* its entry in the colour keys on the map, while it is on */
  function legend() {
    const G = deltaLayer.on && S.CM.length ? cmpGap(S.R) : null;
    if (!G) return '';
    return '<div class="cap">Delta to ' + (G.ids.length === 1 ? esc(G.ids[0]) : 'the ' + G.ids.length + ' compared cars (average)') + '</div><div class="grad" style="background:linear-gradient(90deg,var(--scale-good),var(--scale-bad))"></div>' +
      '<div class="ends num"><span>0</span><span>s</span><span>' + G.max.toFixed(2) + '</span></div>';
  }

  /* ---------- in the side panel (Sectors): health of each sector, the problem areas, the line ---------- */
  function sideCard() {
    const R = S.R, A = of(R), box = RV.el('div', 'ancard');
    if (!A) { box.innerHTML = '<h4>Where the time goes</h4><p class="note">Waiting for the recording of the lap this is measured against (the fastest lap; for the fastest lap itself, the next fastest). If none arrives, open another version: any loaded lap will do.</p>'; return box; }
    if (A.self) { box.innerHTML = '<h4>Where the time goes</h4><p class="note"><i class="hdot h-ok"></i>' + esc(R.name) + ' is the fastest lap recorded, so there is nothing to measure it against. Select another version to see where it loses time to this one.</p>'; return box; }
    box.innerHTML = '<h4>Where the time goes <span class="note">against ' + esc(A.ref.name) + ', ' + A.what + '</span></h4>' +
      (A.health ? '<div class="hrow3">' + A.health.map((h, k) => h ? '<div class="h-' + h.sev + '" title="' + WORD[h.sev] + '"><span><i class="hdot h-' + h.sev + '"></i>S' + (k + 1) + '</span><b class="num">' + RV.sgn(h.delta, 2) + ' s</b><small>' + WORD[h.sev] + '</small></div>' : '<div><span>S' + (k + 1) + '</span><b>–</b></div>').join('') + '</div>' : '') +
      '<p class="anline"><span>Racing-line accuracy</span><b class="num">' + A.line.pct.toFixed(0) + ' %</b><small>on average ' + A.line.mean.toFixed(2) + ' m from that lap’s line, at most ' + A.line.max.toFixed(1) + ' m (at ' + RV.fmtInt(A.line.maxAt) + ' m); ' + A.line.on.toFixed(0) + ' % of the lap within ' + K.lineOn + ' m</small></p>' +
      (A.zones.length ? '<div class="anzones">' + A.zones.map(z => '<div class="anzone"><i class="hdot h-' + z.sev + '"></i><div><b>' + z.n + '. ' + RV.fmtInt(z.d0) + '–' + RV.fmtInt(z.d1) + ' m</b> <span class="num slower">' + lossTxt(z.loss) + '</span><small>' + z.why[0] + '</small></div>' +
          '<button class="btn sm" data-loop="' + z.n + '">Loop</button><button class="btn sm" data-why="' + z.n + '">Why</button></div>').join('') + '</div>'
        : '<p class="note">No stretch of the lap loses ' + secs(A.lim.zoneLoss) + ' or more.</p>') +
      '<p class="note">Green: up to ' + secs(A.lim.healthOk) + ' lost in the sector. Yellow: up to ' + secs(A.lim.healthWarn) + '. Red: more. These limits are a share of that lap\u2019s time (' + (K.healthOk / 1000).toFixed(2) + ' % and ' + (K.healthWarn / 1000).toFixed(2) + ' %), so they fit a lap of any length. The pins on the map and the bands on the charts mark the same areas.</p>';
    box.querySelectorAll('[data-loop]').forEach(b => { b.onclick = () => loop(A.zones[+b.dataset.loop - 1]); });
    box.querySelectorAll('[data-why]').forEach(b => { b.onclick = () => popup(A.zones[+b.dataset.why - 1]); });
    return box;
  }

  /* ---------- on a telemetry chart: a band over each problem area, with a tag to click ---------- */
  const TAG = 16;                       /* height of the tag strip at the top of a band, in pixels */
  function bands(x, X, T, ph) {
    const A = of(S.R);
    if (!A) return;
    for (const z of A.zones) {
      const xa = X(z.d0), xb = X(z.d1), col = RV.pal['health-' + z.sev];
      x.globalAlpha = 0.16; x.fillStyle = col; x.fillRect(xa, T, xb - xa, ph);
      x.globalAlpha = 0.9; x.fillRect(xa, T, Math.max(xb - xa, 14), TAG);
      x.globalAlpha = 1; x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(xa, T); x.lineTo(xa, T + ph); x.moveTo(xb, T); x.lineTo(xb, T + ph); x.stroke();
      x.fillStyle = RV.pal['label-bg']; x.font = '700 11px ' + RV.pal.fontNum; x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillText(xb - xa > 56 ? z.n + '  ' + lossTxt(z.loss) : String(z.n), xa + 4, T + TAG / 2 + 0.5);
    }
  }
  /* the problem area whose tag is at lap distance d and y pixels below the top of the plot, or null */
  function tagAt(d, y, pxPerM) {
    const A = of(S.R);
    if (!A || y < 0 || y > TAG) return null;
    return A.zones.find(z => d >= z.d0 && d <= Math.max(z.d1, z.d0 + 14 / pxPerM)) || null;
  }

  RV.analysis = { of: of, cmpGap: cmpGap, legend: legend, K: K, sideCard: sideCard, bands: bands, tagAt: tagAt, popup: popup, closePopup: closePopup, loop: loop, WORD: WORD };
})();
