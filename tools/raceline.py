"""raceline.py -- offline racing line for the Corkscrew track, from the track's geometry.

Nothing here runs during a race. The tool reads the track definition (segments: straights and arcs),
rebuilds the centre line the way TORCS does (track4.cpp: arcs are cut into steps of equal length,
the radius changing linearly per step), computes a smooth line inside a usable half-width
(K1999-style curvature smoothing: every point is moved along the track's normal until the path's
curvature there is the mean of its neighbours'), estimates the speed and lap time on it with a simple
point-mass model, compares it with a driven lap (telemetry CSV), and prints the table the driver embeds.

    python tools/raceline.py                               # line at the default limit, summary
    python tools/raceline.py --csv runs/<lap>.csv          # + comparison with the driven line
    python tools/raceline.py --limit 0.8 --zone 2300:2600:0.6 --table plan.txt
    python tools/raceline.py --geometry                    # segment list and corner positions only

Conventions (the driver's): distance = distFromStart along the centre line (m); offset = trackPos
(+1 = left edge, -1 = right edge, 0 = centre); curvature + = left-hand bend.
"""
import argparse, csv, math, os, re, sys
import xml.etree.ElementTree as ET

TRACK_XML = r'C:\torcs\torcs\tracks\road\corkscrew\corkscrew.xml'
HALF = 6.0          # half of the 12 m road


# ---------------------------------------------------------------- geometry
def read_segments(path=TRACK_XML):
    """[(name, type, length, [(step length, curvature), ...])] in track order; curvature + = left."""
    txt = open(path, encoding='latin-1').read()
    txt = re.sub(r'<!DOCTYPE[^\[]*\[.*?\]>', '', txt, flags=re.S)
    txt = re.sub(r'&[\w-]+;', '', txt)
    root = ET.fromstring(txt)

    def find(sec, name):
        for s in sec.findall('section'):
            if s.get('name') == name:
                return s
    mt = find(root, 'Main Track')
    glob = {x.get('name'): x.get('val') for x in mt if x.tag in ('attnum', 'attstr')}
    gstep = float(glob.get('profil steps length', 0) or 0)
    width = float(glob.get('width', 12))
    segs = []
    for seg in find(mt, 'Track Segments').findall('section'):
        a = {x.get('name'): x.get('val') for x in seg if x.tag in ('attnum', 'attstr')}
        if a['type'] == 'str':
            L = float(a['lg'])
            segs.append((seg.get('name'), 'str', L, [(L, 0.0)]))
            continue
        r0 = float(a['radius']); r1 = float(a.get('end radius', r0)); arc = math.radians(float(a['arc']))
        length = (r0 + r1) / 2 * arc
        stepslg = float(a.get('profil steps length', gstep))
        steps = int(float(a.get('profil steps', 1)))
        if steps == 1 and stepslg:
            steps = int(length / stepslg) + 1
        cur = length / steps
        dr = (r1 - r0) / steps
        if r1 != r0 and steps != 1:
            dr = (r1 - r0) / (steps - 1)
            ang, r = 0.0, r0
            for _ in range(steps):
                ang += cur / r; r += dr
            cur *= arc / ang
        sign = 1 if a['type'] == 'lft' else -1
        parts, r = [], r0
        for _ in range(steps):
            parts.append((cur, sign / r)); r += dr
        segs.append((seg.get('name'), a['type'], cur * steps, parts))
    return segs, width


def centre_line(segs, ds=1.0):
    """Stations every ds along the centre line: s, x, y, heading (rad), curvature (1/m)."""
    S, X, Y, T, K = [], [], [], [], []
    x = y = th = 0.0
    s = 0.0
    nxt = 0.0
    fine = 0.05
    for _, _, _, parts in segs:
        for L, k in parts:
            n = max(1, int(round(L / fine))); h = L / n
            for _ in range(n):
                if s >= nxt - 1e-9:
                    S.append(nxt); X.append(x); Y.append(y); T.append(th); K.append(k); nxt += ds
                x += h * math.cos(th + k * h / 2); y += h * math.sin(th + k * h / 2); th += k * h; s += h
    return S, X, Y, T, K, s, (x, y, th)


# ---------------------------------------------------------------- line
def curv(ax, ay, bx, by, cx, cy):
    """Curvature of the circle through a, b, c (+ = left)."""
    x1, y1 = cx - bx, cy - by
    x2, y2 = ax - bx, ay - by
    x3, y3 = cx - ax, cy - ay
    det = x1 * y2 - y1 * x2
    n = math.sqrt((x1 * x1 + y1 * y1) * (x2 * x2 + y2 * y2) * (x3 * x3 + y3 * y3))
    return 2 * det / n if n > 0 else 0.0


class Line:
    def __init__(self, S, X, Y, T, lim):
        self.S, self.X, self.Y, self.T = S, X, Y, T
        self.N = len(S)
        self.nx = [-math.sin(t) for t in T]      # left normal
        self.ny = [math.cos(t) for t in T]
        self.lim = lim                           # per station, metres
        self.n = [0.0] * self.N
        self.px = list(X); self.py = list(Y)

    def put(self, i, n):
        n = max(-self.lim[i], min(self.lim[i], n))
        self.n[i] = n
        self.px[i] = self.X[i] + n * self.nx[i]; self.py[i] = self.Y[i] + n * self.ny[i]

    def adjust(self, p, i, q, target):
        """Move point i along its normal so the curvature through p, i, q is target."""
        px, py, qx, qy = self.px[p], self.py[p], self.px[q], self.py[q]
        # where the chord p-q crosses i's normal
        dx, dy = qx - px, qy - py
        den = dx * self.ny[i] - dy * self.nx[i]
        if abs(den) < 1e-12:
            return
        n0 = (dy * (self.X[i] - px) - dx * (self.Y[i] - py)) / den
        d = 0.1
        c1 = curv(px, py, self.X[i] + (n0 + d) * self.nx[i], self.Y[i] + (n0 + d) * self.ny[i], qx, qy)
        if abs(c1) < 1e-12:
            return
        self.put(i, n0 + d * target / c1)

    def kappa(self, i, step=1):
        N = self.N
        p, q = (i - step) % N, (i + step) % N
        return curv(self.px[p], self.py[p], self.px[i], self.py[i], self.px[q], self.py[q])

    def smooth(self, step):
        N = self.N
        for i in range(0, N - step + 1, step):
            p, pp = (i - step) % N, (i - 2 * step) % N
            q, qq = (i + step) % N, (i + 2 * step) % N
            c0 = curv(self.px[pp], self.py[pp], self.px[p], self.py[p], self.px[i], self.py[i])
            c1 = curv(self.px[i], self.py[i], self.px[q], self.py[q], self.px[qq], self.py[qq])
            lp = math.hypot(self.px[i] - self.px[p], self.py[i] - self.py[p])
            ln = math.hypot(self.px[i] - self.px[q], self.py[i] - self.py[q])
            self.adjust(p, i, q, (ln * c0 + lp * c1) / (ln + lp))

    def interpolate(self, step):
        if step <= 1:
            return
        N = self.N
        for i in range(0, N - step + 1, step):
            q = (i + step) % N
            pp, qq = (i - step) % N, (i + 2 * step) % N
            c0 = curv(self.px[pp], self.py[pp], self.px[i], self.py[i], self.px[q], self.py[q])
            c1 = curv(self.px[i], self.py[i], self.px[q], self.py[q], self.px[qq], self.py[qq])
            for k in range(i + 1, min(i + step, N)):
                f = (k - i) / step
                self.adjust(i, k, q, (1 - f) * c0 + f * c1)

    def optimise(self, top=64, iters=60):
        step = top
        while step >= 1:
            for _ in range(int(iters * math.sqrt(step))):
                self.smooth(step)
            self.interpolate(step)
            step //= 2
        for _ in range(iters):
            self.smooth(1)


# ---------------------------------------------------------------- speed model
def speed_profile(px, py, grip0=15.5, aero=5e-4, grip_max=40.0, brake0=14.0, brake_aero=0.0065, brake_max=34.0,
                  power=17.0, vtop=90.0, v0=None, drive=True, vmax=None, vscale=None, bscale=None):
    """Point mass on a closed path. Sideways grip grip0*(1 + aero*v^2) capped at grip_max; braking
    brake0 + brake_aero*v^2 capped; drive ~power/v, fading out toward vtop (rough: the model's lap
    times only rank lines, they are not a prediction of the car's lap time);
    drive and braking share the grip with cornering (friction circle). Returns v (m/s) per point and
    the time for the lap. v0: speed at point 0 (standing start = 0), None = flying lap.
    vmax: optional most speed per point (m/s; None = no cap), e.g. a crest the model does not know;
    the braking pass brings the speed down to it. vscale: optional factor per point on the cornering
    speed (None = 1: grip x factor^2; a bend the car takes faster or slower than the model, from our laps);
    bscale: optional factor per point on the braking deceleration (None = 1)."""
    N = len(px)
    ks = [abs(curv(px[i - 1], py[i - 1], px[i], py[i], px[(i + 1) % N], py[(i + 1) % N])) for i in range(N)]
    ds = [math.hypot(px[(i + 1) % N] - px[i], py[(i + 1) % N] - py[i]) for i in range(N)]

    def vlim(k):
        if k < 1e-6:
            return vtop
        d = 1 - grip0 * aero / k
        v = math.sqrt(grip0 / k / d) if d > 0.05 else vtop
        if grip0 * (1 + aero * v * v) > grip_max:
            v = math.sqrt(grip_max / k)
        return min(v, vtop)
    v = [vlim(k) for k in ks]
    gs = [1.0 if f is None else f for f in vscale] if vscale is not None else [1.0] * N
    bs = [1.0 if f is None else f for f in bscale] if bscale is not None else [1.0] * N
    if vscale is not None:
        v = [min(u * f, vtop) for u, f in zip(v, gs)]
    if vmax is not None:
        v = [u if m is None else min(u, m) for u, m in zip(v, vmax)]
    lat = lambda u: min(grip0 * (1 + aero * u * u), grip_max)
    for _ in range(2):                       # backward: braking
        for i in range(N - 1, -1, -1):
            j = (i + 1) % N
            if v0 is not None and j == 0:
                continue
            u = v[j]
            a = min(brake0 + brake_aero * u * u, brake_max) * bs[j]
            used = min(1.0, u * u * ks[j] / (lat(u) * gs[j] ** 2))
            a *= math.sqrt(max(0.0, 1 - used * used))
            v[i] = min(v[i], math.sqrt(u * u + 2 * a * ds[i]))
    if v0 is not None:
        v[0] = min(v[0], max(v0, 1.0))
    for _ in range((1 if v0 is not None else 2) if drive else 0):   # forward: drive
        for i in range(N - (1 if v0 is not None else 0)):
            j = (i + 1) % N
            u = max(v[i], 1.0)
            a = min(power * 55.0 / max(u, 12.0), 14.0) * max(0.0, 1 - (u / vtop) ** 2)
            used = min(1.0, u * u * ks[i] / lat(u))
            a *= math.sqrt(max(0.0, 1 - used * used))
            v[j] = min(v[j], math.sqrt(u * u + 2 * a * ds[i]))
    t = sum(d / max((v[i] + v[(i + 1) % N]) / 2, 1.0) for i, d in enumerate(ds))
    return v, t, ks


# ---------------------------------------------------------------- telemetry
def read_lap(path):
    rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(open(path))]
    return [r for r in rows if r['curLapTime'] >= 0]


def at(rows, d, key):
    best = min(rows, key=lambda r: abs(r['distFromStart'] - d))
    return best[key]


# ---------------------------------------------------------------- main
def build(limit=0.75, zones=(), ds=3.0, top=64, iters=60, quiet=False):
    segs, width = read_segments()
    S, X, Y, T, K, total, end = centre_line(segs, ds)
    lim = []
    for s in S:
        l = limit
        for z0, z1, zl in zones:
            if z0 <= s < z1:
                l = zl
        lim.append(l * HALF)
    ln = Line(S, X, Y, T, lim)
    ln.optimise(top, iters)
    return segs, ln, K, total, end


def table(ln, K, spacing=10.0, total=None, **model):
    """Rows every `spacing` m: (trackPos, curvature of the line in 1/km, speed limit of the line in km/h:
    cornering grip and braking distance only, no drive limit), interpolated from the stations."""
    N = ln.N
    vcap = speed_profile(ln.px, ln.py, drive=False, vtop=100.0, **model)[0]
    out = []
    d = 0.0
    ds = ln.S[1] - ln.S[0]
    while d < total - 1e-6:
        f = d / ds; i = int(f) % N; j = (i + 1) % N; f -= int(f)
        n = (ln.n[i] * (1 - f) + ln.n[j] * f) / HALF
        k = ln.kappa(i, 2) * (1 - f) + ln.kappa(j, 2) * f
        out.append((round(n, 3), round(k * 1000, 2), round((vcap[i] * (1 - f) + vcap[j] * f) * 3.6)))
        d += spacing
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--limit', type=float, default=0.75, help='usable |trackPos| (default 0.75; 0.8 = wheels on the edge)')
    ap.add_argument('--zone', action='append', default=[], help='from:to:limit, a different limit in a stretch (repeatable)')
    ap.add_argument('--ds', type=float, default=3.0, help='station spacing for the optimiser, m')
    ap.add_argument('--spacing', type=float, default=10.0, help='spacing of the printed table, m')
    ap.add_argument('--csv', help='a driven lap to compare with')
    ap.add_argument('--table', help='write the driver table (python tuples) to this file')
    ap.add_argument('--grip', type=float, default=15.5, help='sideways grip at low speed, m/s^2 (fitted to our laps)')
    ap.add_argument('--grip-aero', type=float, default=5e-4, help='grip rises by this share per (m/s)^2')
    ap.add_argument('--brake', type=float, default=34.0, help='most braking deceleration, m/s^2')
    ap.add_argument('--vcap', action='append', default=[], help='from:to:km/h, most speed of the line in a stretch (repeatable): '
                    'what the geometry does not show, e.g. a crest; the braking of the line leads up to it')
    ap.add_argument('--vscale', action='append', default=[], help='from:to:factor on the cornering speed of the line in a stretch (repeatable): '
                    'a bend the car takes faster or slower than the point-mass model, fitted to our laps')
    ap.add_argument('--bscale', action='append', default=[], help='from:to:factor on the braking deceleration in a stretch (repeatable)')
    ap.add_argument('--geometry', action='store_true', help='print the segment list and stop')
    ap.add_argument('--every', type=float, default=50.0, help='spacing of the comparison rows, m')
    a = ap.parse_args()
    zones = [tuple(float(x) for x in z.split(':')) for z in a.zone]
    segs, width = read_segments()
    if a.geometry:
        s = 0.0
        for name, typ, L, parts in segs:
            if typ == 'str':
                print('%-6s %7.1f - %7.1f  straight %6.1f m' % (name, s, s + L, L))
            else:
                print('%-6s %7.1f - %7.1f  %s  %6.1f m  radius %6.1f -> %6.1f  %5.1f deg' % (
                    name, s, s + L, 'left ' if typ == 'lft' else 'right', L, 1 / abs(parts[0][1]), 1 / abs(parts[-1][1]),
                    math.degrees(sum(l * abs(k) for l, k in parts))))
            s += L
        S, X, Y, T, K, total, end = centre_line(segs, 1.0)
        print('length %.2f m; closure: end point (%.1f, %.1f) m from the start, heading %.2f deg' % (
            total, end[0], end[1], math.degrees(end[2]) - 360))
        return
    segs, ln, K, total, end = build(a.limit, zones, a.ds)
    N = ln.N
    cx, cy = ln.X, ln.Y
    mdl = dict(grip0=a.grip, aero=a.grip_aero, brake_max=a.brake)
    if a.vcap:
        caps = [tuple(float(x) for x in c.split(':')) for c in a.vcap]
        mdl['vmax'] = [min([c[2] / 3.6 for c in caps if c[0] <= s < c[1]], default=None) for s in ln.S]
    for opt, key in ((a.vscale, 'vscale'), (a.bscale, 'bscale')):
        if opt:
            zs = [tuple(float(x) for x in c.split(':')) for c in opt]
            mdl[key] = [([c[2] for c in zs if c[0] <= s < c[1]] or [None])[-1] for s in ln.S]
    v_c, t_c, _ = speed_profile(cx, cy, **mdl)
    v_o, t_o, k_o = speed_profile(ln.px, ln.py, **mdl)
    print('track %.1f m, %d stations; limit |trackPos| %.2f%s%s' % (total, N, a.limit, ''.join(' [%g-%g: %g]' % z for z in zones),
                                                                  ''.join(' [%s km/h]' % c for c in a.vcap)))
    print('model lap (flying): centre line %.2f s, planned line %.2f s' % (t_c, t_o))
    rows = read_lap(a.csv) if a.csv else None
    if rows:
        dx, dy = [], []
        raw = [at(rows, ln.S[i], 'trackPos') for i in range(N)]
        for i in range(N):
            tp = sum(raw[(i + k) % N] for k in range(-4, 5)) / 9 * HALF   # smoothed: the log has 3 decimals
            dx.append(ln.X[i] + tp * ln.nx[i]); dy.append(ln.Y[i] + tp * ln.ny[i])
        v_d, t_d, _ = speed_profile(dx, dy, **mdl)
        print('model lap on the driven line (%s): %.2f s' % (os.path.basename(a.csv), t_d))
    print('\n   m   track 1/R  plan tP  plan 1/R  model km/h' + ('  driven tP  driven km/h' if rows else ''))
    d = 0.0
    while d < total:
        i = int(round(d / a.ds)) % N
        line = '%5.0f  %8.4f  %+6.2f  %8.4f  %7.0f' % (d, K[i], ln.n[i] / HALF, ln.kappa(i, 2), v_o[i] * 3.6)
        if rows:
            line += '     %+6.2f     %7.0f' % (at(rows, d, 'trackPos'), at(rows, d, 'speedX'))
        print(line)
        d += a.every
    if a.table:
        tb = table(ln, K, a.spacing, total, **mdl)
        with open(a.table, 'w') as f:
            f.write('    plan_ds= %g\n' % a.spacing)
            f.write('    plan_pos= (' + ', '.join('%g' % r[0] for r in tb) + ')\n')
            f.write('    plan_curv= (' + ', '.join('%g' % r[1] for r in tb) + ')\n')
            f.write('    plan_v= (' + ', '.join('%d' % r[2] for r in tb) + ')\n')
        print('\ntable written to %s (%d rows every %g m)' % (a.table, len(tb), a.spacing))


if __name__ == '__main__':
    main()
