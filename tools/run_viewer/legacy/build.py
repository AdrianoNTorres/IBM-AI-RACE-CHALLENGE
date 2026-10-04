"""Builds the data for the run viewer (index.html in this folder).

    python tools/run_viewer/build.py [label=runs/extra.csv ...] [--track <corkscrew.xml>]

Reads CHANGELOG.md (and CHANGELOG-simple.md for the plain-language texts), finds
each version's run CSV in runs/, and writes into tools/run_viewer/data/
    index.js     track outline and the list of versions
    <id>.js      one file per run, loaded by the page only when that run is opened
Then open tools/run_viewer/index.html in a browser. Extra CSVs given on the command
line (for example a manual lap) are added to the list. See README.md.

The track's 2D outline is built from the TORCS track file with the same arithmetic
as TORCS's track4.cpp; the car is placed from distFromStart, trackPos and angle.
Driving is not touched.
"""
import argparse, csv, json, math, os, re

TRACK_XML = r'C:\torcs\torcs\tracks\road\corkscrew\corkscrew.xml'
TRACK_ANGLES = [-45, -19, -12, -7, -4, -2.5, -1.7, -1, -.5, 0, .5, 1, 1.7, 2.5, 4, 7, 12, 19, 45]


def load_track(path):
    """Sub-segments as TORCS builds them: dicts with type, length, radius, arc, x, y, alf, s0."""
    txt = open(path, encoding='latin-1').read()
    main = txt[txt.index('<section name="Main Track">'):]
    width = float(re.search(r'name="width"[^>]*val="([\d.]+)"', main).group(1))
    gstep = float(re.search(r'name="profil steps length"[^>]*val="([\d.]+)"', main).group(1))
    body = main[main.index('<section name="Track Segments">'):]
    # top-level segment sections: split on the type attribute, which only segments have
    parts = re.split(r'(?=<section name="[^"]+">\s*<attstr name="type")', body)[1:]
    subs, x, y, alf, tot = [], 0.0, 0.0, 0.0, 0.0
    for p in parts:
        head = p.split('<section name="Left', 1)[0].split('<section name="Right', 1)[0]
        def num(name, default=None):
            m = re.search(r'<attnum name="%s"[^>]*val="([-\d.eE]+)"' % re.escape(name), head)
            return float(m.group(1)) if m else default
        typ = re.search(r'<attstr name="type" val="(\w+)"', head).group(1)
        if typ == 'str':
            length, radius, rend, arc = num('lg', 0.0), 0.0, 0.0, 0.0
        else:
            radius = num('radius', 0.0)
            rend = num('end radius', radius)
            arc = math.radians(num('arc', 0.0))
            length = (radius + rend) / 2.0 * arc
        steps = int(num('profil steps', 1.0))
        if steps == 1:
            sl = num('profil steps length', gstep)
            steps = int(length / sl) + 1 if sl else 1
        cur_arc = arc / steps
        cur_len = length / steps
        drad = (rend - radius) / steps
        if rend != radius and steps != 1:
            drad = (rend - radius) / (steps - 1)
            ta, tr = 0.0, radius
            for _ in range(steps):
                ta += cur_len / tr
                tr += drad
            cur_len *= arc / ta
        for _ in range(steps):
            if typ != 'str' and drad != 0:
                cur_arc = cur_len / radius
            seg = dict(type=typ, length=cur_len, radius=radius, arc=cur_arc, x=x, y=y, alf=alf, s0=tot)
            subs.append(seg)
            if typ == 'str':
                x += cur_len * math.cos(alf); y += cur_len * math.sin(alf)
            else:
                sg = 1.0 if typ == 'lft' else -1.0
                cx = x - sg * radius * math.sin(alf); cy = y + sg * radius * math.cos(alf)
                alf += sg * cur_arc
                x = cx + sg * radius * math.sin(alf); y = cy - sg * radius * math.cos(alf)
                seg['length'] = cur_arc * radius
            tot += seg['length']
            if typ != 'str':
                radius += drad
    return subs, width, tot


def pose(subs, total, s):
    """Centre-line point and tangent heading at distance s from the start."""
    s %= total
    lo, hi = 0, len(subs) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if subs[mid]['s0'] <= s: lo = mid
        else: hi = mid - 1
    g = subs[lo]; d = s - g['s0']
    if g['type'] == 'str':
        return g['x'] + d * math.cos(g['alf']), g['y'] + d * math.sin(g['alf']), g['alf']
    sg = 1.0 if g['type'] == 'lft' else -1.0
    cx = g['x'] - sg * g['radius'] * math.sin(g['alf']); cy = g['y'] + sg * g['radius'] * math.cos(g['alf'])
    a = g['alf'] + sg * d / g['radius']
    return cx + sg * g['radius'] * math.sin(a), cy - sg * g['radius'] * math.cos(a), a


def load_run(path, label, subs, total, hw):
    rows = [r for r in csv.DictReader(open(path)) if float(r['curLapTime']) >= 0]
    beams = 'track0' in rows[0]
    has_foc = 'focA' in rows[0]
    R = dict(name=label, x=[], y=[], yaw=[], t=[], s=[], d=[], v=[], tp=[], al=[], st=[], th=[], br=[],
             g=[], b=[], foc={}, beams=beams)
    for i, r in enumerate(rows):
        s = float(r['distFromStart']); tp = float(r['trackPos']); ang = float(r['angle']); t = float(r['curLapTime'])
        if float(r['lastLapTime']) > 0 and i > 100:        # rows after the finish line: the lap clock has restarted
            t += float(r['lastLapTime'])
        if R['t'] and t < R['t'][-1]:
            t = R['t'][-1]
        x, y, tg = pose(subs, total, s)
        x -= tp * hw * math.sin(tg); y += tp * hw * math.cos(tg)      # trackPos + = left
        R['x'].append(round(x, 2)); R['y'].append(round(y, 2)); R['yaw'].append(round(tg - ang, 4))
        R['t'].append(round(t, 3)); R['s'].append(round(s, 1))
        # lap distance: the lap is timed from just before the line, so the first metres read ~3,600
        ld = s - total if (t < 8 and s > total - 200) else (s + total if (t > 20 and s < 200) else s)
        R['d'].append(round(max(ld, R['d'][-1]) if R['d'] else ld, 1))
        R['v'].append(round(float(r['speedX']), 1)); R['tp'].append(round(tp, 3))
        R['al'].append(round(float(r.get('allowed') or 0), 1)); R['st'].append(round(float(r['steer']), 3))
        R['th'].append(round(float(r['accel']), 3)); R['br'].append(round(float(r['brake']), 3))
        R['g'].append(int(float(r['gear'])))
        if beams:
            R['b'].extend(round(float(r['track%d' % k]), 1) for k in range(19))
        if has_foc and float(r['foc0']) > 0:
            R['foc'][i] = [float(r['focA'])] + [round(float(r['foc%d' % k]), 1) for k in range(5)]
    n = len(rows)
    last = rows[-1]
    after = [r for r in rows if float(r['lastLapTime']) > 0]
    if after:
        lap = float(after[0]['lastLapTime'])
    else:
        lap = float(last['curLapTime']) + max(0.0, total - float(last['distFromStart'])) / max(float(last['speedX']) / 3.6, 1.0)
    corner = [R['v'][i] for i in range(n) if 100 < R['s'][i] < 3500 and R['t'][i] > 8]
    k = max(range(n), key=lambda i: abs(R['tp'][i]))
    R['sum'] = dict(lap=round(lap, 3), top=max(R['v']), slow=min(corner) if corner else 0,
                    maxtp=round(abs(R['tp'][k]), 3), maxtp_at=round(R['s'][k]),
                    damage=float(last['damage']),
                    brake=round(100.0 * sum(1 for b in R['br'] if b > 0) / n, 1),
                    full=round(100.0 * sum(1 for a in R['th'] if a >= 0.99) / n, 1), frames=n)
    return R


def table_fields(path):
    """{version: {'title': ..., field: text}} from a changelog in the two-column table format."""
    out, cur = {}, None
    if not os.path.exists(path):
        return out
    for line in open(path, encoding='utf-8'):
        m = re.match(r'^## (v[\d.]+)\s*[\u2014-]\s*(.*)$', line.rstrip())
        if m:
            cur = out.setdefault(m.group(1), {'title': m.group(2), 'body': ''})
            continue
        if cur is not None:
            cur['body'] += line
            m = re.match(r'^\| \*\*([^*]+)\*\* \| (.*) \|\s*$', line)
            if m:
                cur[m.group(1)] = m.group(2)
    return out


def clean(s):
    s = re.sub(r'^[\u2705\u274c]\s*', '', s or '')
    return s.replace('`', '').replace('\\|', '|').replace('**', '')


def lap_seconds(s):
    m = re.match(r'^(\d+):(\d\d)[.:](\d\d)', s or '')
    return int(m.group(1)) * 60 + int(m.group(2)) + int(m.group(3)) / 100.0 if m else None


def kmh(s):
    m = re.match(r'^(\d+)\s*km/h', s or '')
    return int(m.group(1)) if m else None


def write_run(ddir, fn, vid, R):
    js = 'window.RUNDATA=window.RUNDATA||{};RUNDATA[%s]=%s;' % (json.dumps(vid), json.dumps(R, separators=(',', ':')))
    open(os.path.join(ddir, fn), 'w', encoding='utf-8').write(js)
    return len(js)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv', nargs='*', help='extra runs to add, as path or label=path')
    ap.add_argument('--track', default=TRACK_XML)
    a = ap.parse_args()
    mine = os.path.dirname(os.path.abspath(__file__))
    here = os.path.dirname(os.path.dirname(mine))          # repository root
    ddir = os.path.join(mine, 'data')
    os.makedirs(ddir, exist_ok=True)
    for f in os.listdir(ddir):
        if f.endswith('.js'):
            os.remove(os.path.join(ddir, f))

    subs, width, total = load_track(a.track)
    hw = width / 2.0
    end = pose(subs, total, total - 1e-6)
    print('track: %d sub-segments, length %.1f m, closing gap %.2f m' % (len(subs), total, math.hypot(end[0], end[1])))
    left, right, centre = [], [], []
    n = int(total / 2.0)
    for i in range(n + 1):
        x, y, t = pose(subs, total, total * i / n if i < n else 0.0)
        left.append([round(x - hw * math.sin(t), 2), round(y + hw * math.cos(t), 2)])
        right.append([round(x + hw * math.sin(t), 2), round(y - hw * math.cos(t), 2)])
        centre.append([round(x, 2), round(y, 2)])
    marks = []
    for m in range(0, int(total), 100):
        x, y, t = pose(subs, total, m)
        marks.append([m, round(x - hw * math.sin(t), 2), round(y + hw * math.cos(t), 2),
                      round(x + hw * math.sin(t), 2), round(y - hw * math.cos(t), 2)])

    full = table_fields(os.path.join(here, 'CHANGELOG.md'))
    simple = table_fields(os.path.join(here, 'CHANGELOG-simple.md'))
    versions, laps, base, size = [], {}, None, 0
    for vid, f in full.items():
        m = re.search(r'runs/(run_\d+_\d+\.csv)', f['body'])
        path = os.path.join(here, 'runs', m.group(1)) if m else None
        sm = simple.get(vid, {})
        kept = '\u2705' in f.get('Decision', '')
        lap = lap_seconds(f.get('Lap time'))
        v = dict(id=vid, title=clean(f['title']), lap=lap, top=kmh(f.get('Top speed')), slow=kmh(f.get('Min speed')),
                 damage=clean(f.get('Damage', '')), kept=kept, base=base,
                 delta=round(lap - laps[base], 2) if (lap and base) else None,
                 st=re.sub(r'\s*\((?:[^()]*; )?rejected\)$', '', clean(sm.get('title', ''))), what=clean(sm.get('What changed', '')), why=clean(sm.get('Why', '')),
                 learned=clean(sm.get('Learned', '')), decision=clean(sm.get('Decision', '')), file=None, beams=False)
        if lap:
            laps[vid] = lap
            if kept:
                base = vid
        if path and os.path.exists(path):
            R = load_run(path, vid, subs, total, hw)
            v['file'] = vid + '.js'; v['beams'] = R['beams']; v['sum'] = R['sum']
            size += write_run(ddir, v['file'], vid, R)
        versions.append(v)
    for k, spec in enumerate(a.csv):
        label, path = spec.split('=', 1) if ('=' in spec and not os.path.exists(spec)) else (None, spec)
        vid = label or os.path.splitext(os.path.basename(path))[0]
        R = load_run(path, vid, subs, total, hw)
        fn = 'extra_%d.js' % k
        size += write_run(ddir, fn, vid, R)
        versions.append(dict(id=vid, title='Extra run: ' + os.path.basename(path), lap=R['sum']['lap'], top=int(R['sum']['top']),
                             slow=int(R['sum']['slow']), damage='%g' % R['sum']['damage'], kept=None, base=None, delta=None,
                             st='A run added by hand', what='', why='', learned='', decision='', file=fn,
                             beams=R['beams'], sum=R['sum'], extra=True))

    data = dict(left=left, right=right, centre=centre, marks=marks, angles=TRACK_ANGLES, hw=hw, total=round(total, 1),
                versions=versions, dataDir='data')
    out = os.path.join(ddir, 'index.js')
    open(out, 'w', encoding='utf-8').write('window.RV_INDEX=%s;' % json.dumps(data, separators=(',', ':')))
    nd = sum(1 for v in versions if v['file'])
    print('wrote %s: %d runs, %.0f MB; %d versions listed, %d with sensor beams'
          % (ddir, nd, (size + os.path.getsize(out)) / 1e6, len(versions), sum(1 for v in versions if v['beams'])))
    print('open ' + os.path.join(mine, 'index.html'))


if __name__ == '__main__':
    main()
