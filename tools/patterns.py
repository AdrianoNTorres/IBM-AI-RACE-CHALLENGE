"""Pattern check of a run CSV: control oscillations that cost lap time.

    python tools/patterns.py [runs/<file>.csv] [--episodes]

Newest run by default. Prints one line per pattern (count per lap and the time
spent in it), so two versions can be compared at a glance; --episodes lists
where the steering oscillates. Patterns:
  steering   reversals of the wheel (both moves > 0.03) and episodes of them
  target     racing-line target switching on/off or changing side step to step
  plan       allowed speed jumping more than 20 km/h in one step
  pedals     brake applications, short brake touches (< 8 steps), brake <-> throttle swaps
  gears      a shift undone within 1 s (hunting)
  tc         time with the sent throttle cut below the stored throttle
"""
import csv, glob, math, sys, collections


def load(path):
    rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(open(path))]
    return [r for r in rows if r['curLapTime'] >= 0]


def episodes(rev, win=12, start=4, keep=3):
    """Stretches where the steering reverses at least `start` times in `win` steps."""
    ep, i, n = [], 0, len(rev)
    while i < n:
        if sum(rev[i:i+win]) >= start:
            j = i
            while j < n and sum(rev[j:j+win]) >= keep: j += 1
            j = min(j+win-1, n-1); ep.append((i, j)); i = j+1
        else:
            i += 1
    return ep


def analyse(rows):
    n = len(rows)
    dt = lambda a, b: rows[b]['curLapTime'] - rows[a]['curLapTime']
    rev, flip, plan = [0]*n, [0]*n, [0]*n
    for i in range(2, n):
        a, b = rows[i-1].get('lineTarget', 0), rows[i].get('lineTarget', 0)
        if (a == 0) != (b == 0) or a*b < 0: flip[i] = 1
        d1 = rows[i-1]['steer'] - rows[i-2]['steer']; d2 = rows[i]['steer'] - rows[i-1]['steer']
        if d1*d2 < 0 and abs(d1) > .03 and abs(d2) > .03: rev[i] = 1
        if 'allowed' in rows[i] and abs(rows[i]['allowed'] - rows[i-1]['allowed']) > 20: plan[i] = 1
    ep = episodes(rev)
    # pedals: brake applications and their lengths, brake <-> throttle swaps within 10 steps
    apps, i = [], 0
    while i < n:
        if rows[i]['brake'] > 0:
            j = i
            while j < n and rows[j]['brake'] > 0: j += 1
            apps.append((i, j-1)); i = j
        else:
            i += 1
    swaps = sum(1 for (a, b), (c, d) in zip(apps, apps[1:]) if c - b <= 10)
    # gears: a shift undone within 1 s
    shifts = [(i, rows[i-1]['gear'], rows[i]['gear']) for i in range(1, n) if rows[i]['gear'] != rows[i-1]['gear']]
    hunts = sum(1 for (i, a, b), (j, c, d) in zip(shifts, shifts[1:]) if d == a and dt(i, j) < 1.0)
    tc = sum(dt(i-1, i) for i in range(1, n)
             if 'throttle' in rows[i] and rows[i]['brake'] == 0 and rows[i]['accel'] < rows[i]['throttle'] - .05
             and dt(i-1, i) > 0)   # a row logged after the finish line restarts curLapTime at 0: not a step of -70 s
    return dict(rows=rows, rev=rev, flip=flip, ep=ep, lap=max(x['curLapTime'] for x in rows),
                reversals=sum(rev), osc_time=sum(dt(a, b) for a, b in ep), flips=sum(flip),
                plan_jumps=sum(plan), brake_apps=len(apps),
                touches=sum(1 for a, b in apps if b - a + 1 < 8), swaps=swaps,
                shifts=len(shifts), hunts=hunts, tc_time=tc)


def report(path, show_episodes=False):
    r = analyse(load(path)); rows = r['rows']
    print('%s  lap end %.2f s' % (path, r['lap']))
    print('steering  %4d reversals, %2d episodes, %5.1f s in them' % (r['reversals'], len(r['ep']), r['osc_time']))
    print('target    %4d on/off or side flips' % r['flips'])
    print('plan      %4d jumps of the allowed speed > 20 km/h in one step' % r['plan_jumps'])
    print('pedals    %4d brake applications, %d short touches (< 8 steps), %d re-applied within 10 steps' % (
        r['brake_apps'], r['touches'], r['swaps']))
    print('gears     %4d shifts, %d undone within 1 s' % (r['shifts'], r['hunts']))
    print('tc        %5.1f s with the sent throttle cut below the stored throttle' % r['tc_time'])
    if show_episodes:
        print('%6s %6s %5s %4s %4s %5s %6s %5s %6s %6s %5s  %s' % (
            'from', 'to', 's', 'rev', 'flip', 'km/h', 'dsteer', 'yaw', 'tp0', 'tp1', 'brk%', 'targets'))
        for a, b in r['ep']:
            s = rows[a:b+1]
            ds = [abs(s[k]['steer'] - s[k-1]['steer']) for k in range(1, len(s))]
            yaw = [x['angle']*180/math.pi for x in s]
            tg = collections.Counter(round(x.get('lineTarget', 0), 2) for x in s).most_common(3)
            print('%6.0f %6.0f %5.2f %4d %4d %5.0f %6.3f %5.1f %6.2f %6.2f %5.0f  %s' % (
                s[0]['distFromStart'], s[-1]['distFromStart'], s[-1]['curLapTime'] - s[0]['curLapTime'],
                sum(r['rev'][a:b+1]), sum(r['flip'][a:b+1]), sum(x['speedX'] for x in s)/len(s),
                sum(ds)/len(ds), max(yaw) - min(yaw), s[0]['trackPos'], s[-1]['trackPos'],
                100*sum(x['brake'] > 0 for x in s)/len(s), ' '.join('%g:%d' % t for t in tg)))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    report(args[0] if args else sorted(glob.glob('runs/*.csv'))[-1], '--episodes' in sys.argv)
