"""elevation.py -- the Corkscrew's elevation profile by distFromStart, from the track file.

Nothing here runs during a race. The tool reads the track definition and rebuilds the height of the
centre line the way TORCS does (track4.cpp: each segment starts at the previous one's end height, ends
at `z end` or start + length * `grade`, and is cut into profile steps whose end heights lie on a cubic
spline with the previous segment's end tangent and this segment's `profil end tangent`; between step
ends the road is flat-faced). From the height it derives, per station:

    grade   dz/ds (%; + = uphill): braking and traction gain or lose g * grade
    kv      d2z/ds2 (1/m; + = compression, - = crest), smoothed over --smooth metres
    bank    banking angle (deg; + = left side high)

and, with a driven lap (--csv), what they do to the car at the speed it had there:

    load    1 + kv * v^2 / g : the share of the car's weight on the tyres (aero downforce not counted)
    dgrip   the change of the tyres' whole load, downforce included: kv * v^2 / (g + aero * v^2), %
    dbrake  g * grade (m/s^2): + = the slope helps braking (uphill)

    python tools/elevation.py                                  # summary: extremes of height, grade, kv
    python tools/elevation.py --csv runs/<lap>.csv             # + table per 10 m where |load - 1| or |grade| is large
    python tools/elevation.py --csv runs/<lap>.csv --range 2300:2620 --step 10      # every row of a stretch
    python tools/elevation.py --table elev.txt                 # the tables the driver embeds (one entry per 10 m)
"""
import argparse, csv, math, re, sys
import xml.etree.ElementTree as ET

TRACK_XML = r'C:\torcs\torcs\tracks\road\corkscrew\corkscrew.xml'
G = 9.81
AERO = 0.005        # car1-ow1 (car file): wings 4 * 1.23 * area * sin(angle) = 1.83, ground effect about 1.4 N per (m/s)^2, over 650 kg


def spline(p0, p1, t0, t1, t):
    t2 = t * t; t3 = t * t2
    h1 = 3 * t2 - 2 * t3
    return (1 - h1) * p0 + h1 * p1 + (t3 - 2 * t2 + t) * t0 + (t3 - t2) * t1


def read_profile(path=TRACK_XML):
    """[(s at step end, z centre, banking rad)] from s = 0, and the lap length. As track4.cpp builds it."""
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
    pts = [(0.0, 0.0, 0.0)]
    s = 0.0
    ze = 0.0; etgt = 0.0; bke = 0.0
    for seg in find(mt, 'Track Segments').findall('section'):
        a = {}
        for x in seg:
            if x.tag in ('attnum', 'attstr') and x.get('name') not in a:    # GfParm keeps the first of a repeated name
                a[x.get('name')] = x.get('val')
        if 'type' not in a:
            continue
        if a['type'] == 'str':
            length = float(a['lg']); r0 = r1 = None
        else:
            r0 = float(a['radius']); r1 = float(a.get('end radius', r0)); arc = math.radians(float(a['arc']))
            length = (r0 + r1) / 2 * arc
        zs = float(a['z start']) if 'z start' in a else ze
        if 'z end' in a:
            ze = float(a['z end'])
        elif 'grade' in a:
            ze = zs + length * float(a['grade']) / 100
        else:
            ze = zs
        bks = math.radians(float(a['banking start'])) if 'banking start' in a else bke
        bke = math.radians(float(a['banking end'])) if 'banking end' in a else bke
        stgt = etgt
        if a.get('profil', 'spline') == 'spline':
            steps = int(float(a.get('profil steps', 1)))
            if steps == 1:
                lg = float(a.get('profil steps length', gstep))
                steps = int(length / lg) + 1 if lg else 1
            if 'profil start tangent' in a:
                stgt = float(a['profil start tangent']) / 100
            if 'profil end tangent' in a:
                etgt = float(a['profil end tangent']) / 100
        else:
            steps = 1
            stgt = etgt = (ze - zs) / length
        cur = length / steps
        if r0 is not None and r1 != r0 and steps != 1:
            dr = (r1 - r0) / (steps - 1); ang, r = 0.0, r0
            for _ in range(steps):
                ang += cur / r; r += dr
            cur *= arc / ang
        for i in range(1, steps + 1):
            t = i / steps
            s += cur
            pts.append((s, spline(zs, ze, stgt * length, etgt * length, t), bks + (bke - bks) * t))
    return pts, s, width


def at(pts, d, col):
    """Linear interpolation of a column at distance d (the lap is closed)."""
    L = pts[-1][0]
    d %= L
    lo, hi = 0, len(pts) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if pts[m][0] <= d:
            lo = m
        else:
            hi = m
    f = (d - pts[lo][0]) / max(pts[hi][0] - pts[lo][0], 1e-9)
    return pts[lo][col] + (pts[hi][col] - pts[lo][col]) * f


def profile(step=10.0, smooth=30.0, path=TRACK_XML):
    """Rows per `step` m: dict(s, z, grade (fraction), kv (1/m), bank (deg)). kv is the change of the mean grade
    over the `smooth` metres behind and ahead (the stepped road has no curvature of its own)."""
    pts, L, _ = read_profile(path)
    closure = pts[-1][1] - pts[0][1]        # height the lap fails to close by (m): reported, not corrected
    rows = []
    h = smooth / 2
    for i in range(int(L // step) + 1):
        s = i * step
        z0, zm, zp = at(pts, s, 1), at(pts, s - h, 1), at(pts, s + h, 1)
        if s - h < 0:
            zm -= closure
        if s + h > L:
            zp += closure
        rows.append(dict(s=s, z=z0, grade=(zp - zm) / (2 * h), kv=(zp - 2 * z0 + zm) / (h * h),
                         bank=math.degrees(at(pts, s, 2))))
    return rows, L, closure


def read_lap(path):
    """distFromStart -> speed (m/s) of the timed lap, one value per 10 m."""
    v = {}
    for r in csv.DictReader(open(path)):
        if float(r['curLapTime']) < 0:
            continue
        d = float(r['distFromStart'])
        v.setdefault(int(d // 10) * 10, float(r['speedX']) / 3.6)
    return v


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv', help='a driven lap: load and slope effects at the speed the car had')
    ap.add_argument('--range', help='from:to (m): print every row of the stretch')
    ap.add_argument('--step', type=float, default=10.0, help='row spacing, m (default 10)')
    ap.add_argument('--smooth', type=float, default=30.0, help='length the vertical curvature is taken over, m (default 30)')
    ap.add_argument('--load', type=float, default=0.12, help='with --csv: list rows whose load differs from 1 by this much (default 0.12)')
    ap.add_argument('--grade', type=float, default=4.0, help='with --csv: list rows at least this steep, %% (default 4)')
    ap.add_argument('--aero', type=float, default=AERO, help='downforce per unit mass, m/s^2 per (m/s)^2 (default %g, car1-ow1)' % AERO)
    ap.add_argument('--table', help='write plan_z / plan_kv tables (one entry per 10 m) to this file')
    a = ap.parse_args()

    rows, L, closure = profile(a.step, a.smooth)
    zs = [r['z'] for r in rows]
    print('lap %.1f m, %d rows of %g m; height %.1f to %.1f m (lowest at %d m, highest at %d m); the lap closes to %.2f m'
          % (L, len(rows), a.step, min(zs), max(zs), rows[zs.index(min(zs))]['s'], rows[zs.index(max(zs))]['s'], closure))
    for key, unit, k in (('grade', '%', 100), ('kv', '1/km', 1000)):
        o = sorted(rows, key=lambda r: r[key])
        print('  %-5s lowest %s | highest %s' % (key,
              ', '.join('%+.1f %s @ %d m' % (r[key] * k, unit, r['s']) for r in o[:4]),
              ', '.join('%+.1f %s @ %d m' % (r[key] * k, unit, r['s']) for r in o[:-5:-1])))
    v = read_lap(a.csv) if a.csv else None
    lo, hi = (float(x) for x in a.range.split(':')) if a.range else (None, None)
    hdr = '     m      z  grade%   kv 1/km  bank'
    if v:
        hdr += '   km/h  load  dgrip%  dbrake'
    print(hdr)
    for r in rows:
        line = '%6d %6.2f %+6.1f  %+7.2f %+5.1f' % (r['s'], r['z'], r['grade'] * 100, r['kv'] * 1000, r['bank'])
        show = lo is not None and lo <= r['s'] <= hi
        if v:
            u = v.get(int(r['s'] // 10) * 10)
            if u is None:
                continue
            load = 1 + r['kv'] * u * u / G
            dgrip = r['kv'] * u * u / (G + a.aero * u * u)
            line += '  %5.0f %5.2f  %+5.0f  %+5.2f' % (u * 3.6, load, dgrip * 100, G * r['grade'])
            if lo is None:
                show = abs(load - 1) >= a.load or abs(r['grade']) * 100 >= a.grade
        if show:
            print(line)
    if a.table:
        t10, _, _ = profile(10.0, a.smooth)
        with open(a.table, 'w') as f:
            f.write('    plan_z= (' + ', '.join('%.2f' % r['z'] for r in t10) + ')\n')
            f.write('    plan_kv= (' + ', '.join('%.2f' % (r['kv'] * 1000) for r in t10) + ')\n')
        print('tables written to', a.table, '(%d entries; plan_kv in 1/km)' % len(t10))


if __name__ == '__main__':
    main()
