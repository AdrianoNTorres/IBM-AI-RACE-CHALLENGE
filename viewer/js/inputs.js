/* Run viewer: the driver's inputs on the Track tab, bottom right of the map. A steering wheel that turns with
   the recorded steering, and a rolling graph of throttle and brake over the last few seconds. Colours come from
   the theme tokens. */
(function () {
  'use strict';
  const RV = globalThis.RV, $ = RV.$;
  const WINDOW = 6;                     /* seconds of history on the graph */
  const TURN = 120;                     /* degrees the wheel shows at full steering lock */
  let keyHtml = '';

  function rr(ctx, x, y, w, h, rad) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); }

  /* A Formula-style wheel seen from the driver's seat: two grips, a flat-bottomed centre with a display,
     shift lights, dials and buttons. Drawn in a square of 2 x 2 units round its centre. */
  function drawWheel(R, i) {
    const cv = $('wheel'), r = window.devicePixelRatio || 1, size = cv.clientWidth, P = RV.pal;
    if (!size) return;
    if (cv.width !== Math.round(size * r)) { cv.width = cv.height = Math.round(size * r); }
    const x = cv.getContext('2d'), u = size / 2;
    x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, size, size);
    x.translate(u, u); x.scale(u, u);
    x.rotate(-R.st[i] * TURN * Math.PI / 180);          /* steering +1 = full left = anticlockwise */
    const body = P.tyre, edge = P['road-mark'], lw = 0.035;
    x.lineJoin = 'round';
    /* the two grips */
    for (const s of [-1, 1]) { rr(x, s * 0.70 - 0.15, -0.50, 0.30, 0.92, 0.14); x.fillStyle = body; x.fill(); x.lineWidth = lw; x.strokeStyle = edge; x.stroke(); }
    /* the centre: wide at the top, cut in toward a flat bottom */
    x.beginPath(); x.moveTo(-0.62, -0.36); x.lineTo(0.62, -0.36); x.lineTo(0.62, 0.10); x.lineTo(0.36, 0.50); x.lineTo(-0.36, 0.50); x.lineTo(-0.62, 0.10); x.closePath();
    x.fillStyle = body; x.fill(); x.lineWidth = lw; x.strokeStyle = edge; x.stroke();
    /* shift lights */
    const lights = [P.kept, P.kept, P.kept, P.accent, P.accent, P.best, P.best], lit = Math.round(RV.clamp(R.th[i], 0, 1) * lights.length);
    lights.forEach((col, k) => { x.beginPath(); x.arc(-0.27 + k * 0.09, -0.285, 0.028, 0, 7); x.fillStyle = k < lit ? col : edge; x.globalAlpha = k < lit ? 1 : 0.35; x.fill(); });
    x.globalAlpha = 1;
    /* the display, with the gear */
    rr(x, -0.27, -0.22, 0.54, 0.30, 0.04); x.fillStyle = P['road']; x.fill(); x.lineWidth = 0.02; x.strokeStyle = edge; x.stroke();
    x.fillStyle = P['road-edge']; x.font = '700 0.26px ' + P.fontNum; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(R.g[i]), 0, -0.06);
    /* buttons beside the display, and three dials below it */
    [[-0.45, -0.20, P.run[0]], [-0.45, -0.02, P.run[3]], [0.45, -0.20, P.run[1]], [0.45, -0.02, P.run[2]]].forEach(b => { x.beginPath(); x.arc(b[0], b[1], 0.055, 0, 7); x.fillStyle = b[2]; x.fill(); });
    [[-0.22, 0.24], [0, 0.31], [0.22, 0.24]].forEach(d => { x.beginPath(); x.arc(d[0], d[1], 0.075, 0, 7); x.fillStyle = P['road']; x.fill(); x.lineWidth = 0.02; x.strokeStyle = edge; x.stroke(); x.beginPath(); x.moveTo(d[0], d[1]); x.lineTo(d[0], d[1] - 0.07); x.stroke(); });
    /* the mark at twelve o'clock */
    x.fillStyle = P.accent; x.fillRect(-0.035, -0.36, 0.07, 0.05);
  }

  function drawPedals(R, i) {
    const cv = $('pedals'), r = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, P = RV.pal;
    if (!W) return;
    if (cv.width !== Math.round(W * r) || cv.height !== Math.round(H * r)) { cv.width = Math.round(W * r); cv.height = Math.round(H * r); }
    const x = cv.getContext('2d'), cs = getComputedStyle(document.documentElement);
    const col = { th: cs.getPropertyValue('--in-throttle').trim(), br: cs.getPropertyValue('--in-brake').trim(), cl: cs.getPropertyValue('--in-clutch').trim() };
    x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, W, H);
    const top = 5, bot = H - 5, t1 = R.t[i], t0 = t1 - WINDOW, X = t => (t - t0) / WINDOW * (W - 2) + 1, Y = v => bot - RV.clamp(v, 0, 1) * (bot - top);
    x.strokeStyle = P.grid; x.lineWidth = 1;
    for (const v of [0, 0.5, 1]) { x.beginPath(); x.moveTo(0, Y(v)); x.lineTo(W, Y(v)); x.stroke(); }
    const k0 = RV.bsearch(R.t, Math.max(t0, R.t[0]));
    const line = (arr, c, w) => { x.strokeStyle = c; x.lineWidth = w; x.lineJoin = 'round'; x.beginPath(); for (let k = k0; k <= i; k++) { if (k === k0) x.moveTo(X(R.t[k]), Y(arr[k])); else x.lineTo(X(R.t[k]), Y(arr[k])); } x.stroke(); };
    if (R.cl) line(R.cl, col.cl, 1.6);
    line(R.br, col.br, 2); line(R.th, col.th, 2);
    const item = (name, c, v) => '<span><i style="background:' + c + '"></i>' + name + ' <b class="num">' + v + '</b></span>';
    const html = item('Throttle', col.th, R.th[i].toFixed(2)) + item('Brake', col.br, R.br[i].toFixed(2));
    if (html !== keyHtml) { $('pedkey').innerHTML = html; keyHtml = html; }
  }

  RV.inputs = { draw(R, i) { drawWheel(R, i); drawPedals(R, i); }, WINDOW: WINDOW };
})();
