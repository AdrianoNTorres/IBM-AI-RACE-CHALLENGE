"""Build site/data.json, the one data file the presentation website reads.

    python tools/sitedata.py            write site/data.json and print a summary
    python tools/sitedata.py --check    exit 1 if site/data.json is out of date

Sources (all local): project-stats.csv (one row per version) and docs/presentation/
(vX.Y.json for the plain-language titles, batch-NN.json, manual/rules.json,
index/bob-tasks.jsonl) and the judged lap's run CSV. Nothing is typed here: every number comes from those files.
"""
import csv
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRES = os.path.join(ROOT, 'docs', 'presentation')
OUT = os.path.join(ROOT, 'site', 'data.json')


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def num(text, kind=float):
    return kind(text) if text not in ('', None) else None


def shown(lap_s):
    """65.56 -> '1:05.56'"""
    if lap_s is None:
        return None
    m, s = divmod(round(lap_s * 100), 6000)
    return '%d:%05.2f' % (m, s / 100)


def versions():
    out = []
    with open(os.path.join(ROOT, 'project-stats.csv'), encoding='utf-8') as f:
        for row in csv.DictReader(f):
            note = os.path.join(PRES, row['version'] + '.json')
            plain = load(note).get('title_plain') if os.path.exists(note) else None
            lap_s = num(row['lap_s'])
            out.append({
                'v': row['version'],
                'batch': num(row['batch'], int),
                'decision': row['decision'],
                'lap_s': lap_s,
                'lap': shown(lap_s),
                'best_s': num(row['best_so_far_s']),
                'top_kmh': num(row['top_kmh'], int),
                'date': row['tagged_at'][:10] or None,
                'title': plain or row['title'],
            })
    return out


def batches():
    out = []
    for path in sorted(glob.glob(os.path.join(PRES, 'batch-*.json'))):
        b = load(path)
        quote = (b.get('user_decisions') or [{}])[0]
        out.append({
            'batch': b['batch'],
            'first': b['versions'][0],
            'last': b['versions'][-1],
            'kept': len(b.get('kept') or []),
            'rejected': len(b.get('rejected') or []),
            'before_s': b.get('best_lap_before_s'),
            'after_s': b.get('best_lap_after_s'),
            'before': shown(b.get('best_lap_before_s')),
            'after': shown(b.get('best_lap_after_s')),
            'races': b.get('races'),
            'theme': b.get('theme'),
            'quote': quote.get('quote'),
            'quote_effect': quote.get('effect'),
        })
    return out


def rules(laps):
    r = load(os.path.join(PRES, 'manual', 'rules.json'))
    out = []
    for q in r['questions']:
        fb = q['fallback_if_rejected']
        official = q['status'].startswith('confirmed')
        out.append({
            'id': q['id'],
            'what_we_do': q['what_we_do'],
            'rule_touched': q['rule_touched'],
            'since': q['first_version'],
            'status': 'confirmed by the officials' if official else 'our reading, not asked separately',
            'official': official,
            'date': q.get('date') or (q.get('official_answer') or {}).get('date_relayed'),
            'caveat': q.get('caveat'),
            'fallback': fb['version'],
            'fallback_lap': shown(laps.get(fb['version'])),
            'fallback_edge': fb['lap_max_trackpos'],
            'fallback_why': fb['why'],
        })
    return out


def bob():
    dates = []
    with open(os.path.join(PRES, 'index', 'bob-tasks.jsonl'), encoding='utf-8') as f:
        for line in f:
            if line.strip():
                dates.append(json.loads(line)['date'][:10])
    return {'tasks': len(dates), 'first': min(dates), 'last': max(dates)}


def trace(run_csv, dt=0.2):
    """The judged lap every dt seconds, from its run CSV: distance driven (m), trackPos, the car's angle to the
    track (rad) and the 19 beam readings (m), with the beams' angles as the driver sets them. The car starts
    about 10 m before the line, so the distance runs on past one lap: take it modulo lap_m."""
    ts, rows, lap_m, laps = [], [], 0.0, 0
    with open(os.path.join(ROOT, run_csv), newline='') as f:
        for row in csv.DictReader(f):
            t, d = float(row['curLapTime']), float(row['distFromStart'])
            if t < 0:
                continue
            if ts and t < ts[-1]:
                break
            if ts and d < rows[-1][0] - laps * lap_m - 1000:
                laps += 1
            if not laps:
                lap_m = max(lap_m, d)
            ts.append(t)
            rows.append([d + laps * lap_m, float(row['trackPos']), float(row['angle'])]
                        + [float(row['track%d' % k]) for k in range(19)])
    out, i = [], 0
    for k in range(int(ts[-1] / dt) + 1):
        while ts[i + 1] < k * dt:
            i += 1
        f = (k * dt - ts[i]) / ((ts[i + 1] - ts[i]) or 1)
        out.append([a + f * (b - a) for a, b in zip(rows[i], rows[i + 1])])
    with open(os.path.join(ROOT, 'driver', 'snakeoil3_v1.py'), encoding='utf-8') as f:
        angles = json.loads(re.search(r'^TRACK_ANGLES\s*=\s*(\[[^\]]*\])', f.read(), re.M).group(1).replace(' .', ' 0.').replace('-.', '-0.'))
    return {'dt': dt, 'lap_m': round(lap_m, 1), 'angles': angles,
            'm': [round(r[0], 1) for r in out], 'pos': [round(r[1], 2) for r in out], 'ang': [round(r[2], 3) for r in out],
            'beams': [[round(v) for v in r[3:]] for r in out]}


def track(ds=8.0):
    """The centre line every ds metres as x, y (raceline.py) and height z (elevation.py), all in metres."""
    import elevation
    import raceline
    segs, _ = raceline.read_segments()
    S, X, Y = raceline.centre_line(segs, ds)[:3]
    prof = elevation.read_profile()[0]
    cx, cy = (min(X) + max(X)) / 2, (min(Y) + max(Y)) / 2
    return {'x': [round(x - cx, 1) for x in X], 'y': [round(y - cy, 1) for y in Y],
            'z': [round(elevation.at(prof, d, 1), 1) for d in S]}


def build():
    vs = versions()
    laps = {v['v']: v['lap_s'] for v in vs}
    with_lap = [v for v in vs if v['lap_s'] is not None and v['decision'] != 'rejected']
    best = min(with_lap, key=lambda v: v['lap_s'])
    first = with_lap[0]
    res = load(os.path.join(PRES, best['v'] + '.json'))['result']
    bs = batches()
    dates = sorted({v['date'] for v in vs if v['date']})
    summary = {
        'best_version': best['v'],
        'best_lap': best['lap'],
        'best_lap_torcs_s': res['lap_s'],
        'first_version': first['v'],
        'first_lap': first['lap'],
        'gain_s': round(first['lap_s'] - best['lap_s'], 2),
        'versions': len(vs),
        'kept': sum(v['decision'] == 'kept' for v in vs),
        'enabling': sum(v['decision'] == 'enabling' for v in vs),
        'rejected': sum(v['decision'] == 'rejected' for v in vs),
        'first_day': dates[0],
        'last_day': dates[-1],
        'days_with_versions': len(dates),
        'batches': max(b['batch'] for b in bs),
        'races_logged': sum(b['races'] or 0 for b in bs),
        'top_kmh': res['top_kmh'],
        'slowest_corner_kmh': res['slowest_corner_kmh'],
        'damage': res['damage'],
        'max_trackpos': res['max_trackpos'],
        'max_trackpos_at_m': res['max_trackpos_at_m'],
        'all30_s': res['all30_s'],
        'run_csv': res['run_csv'],
    }
    return {'summary': summary, 'versions': vs, 'batches': bs, 'rules': rules(laps), 'bob': bob(),
            'trace': trace(res['run_csv']), 'track': track()}


def main():
    text = json.dumps(build(), ensure_ascii=False, indent=1) + '\n'
    if '--check' in sys.argv:
        old = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        print('site/data.json is up to date' if old == text else 'site/data.json is OUT OF DATE')
        sys.exit(0 if old == text else 1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    d = json.loads(text)
    sys.stdout.reconfigure(encoding='utf-8')
    print('wrote', os.path.relpath(OUT, ROOT), len(text), 'bytes')
    print(json.dumps(d['summary'], indent=1))
    print('bob', d['bob'])
    for b in d['batches']:
        print(b['batch'], b['first'], b['last'], b['before'], b['after'], b['kept'], b['rejected'], b['races'], '|', (b['theme'] or '')[:70])
    for q in d['rules']:
        print(q['id'], '|', q['since'], '|', q['status'], '|', q['fallback'], q['fallback_lap'])


if __name__ == '__main__':
    main()
