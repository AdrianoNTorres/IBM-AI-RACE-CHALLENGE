'''Step trace of a run CSV against the planned line and its speed.

    python tools/trace.py runs/<file>.csv 2200 2640            # every 10 m from 2,200 m to 2,640 m
    python tools/trace.py a.csv 1880 1990 5 --driver v.py      # every 5 m, plan tables of a variant

Columns: distance, time since the first row, speed, the plan's allowed speed (logged), the
stored line speed plan_v at that distance (x plan_vs is what the driver uses), trackPos, the
line's trackPos, their difference, steer, brake, stored throttle, sent throttle, sideways
speed, gear. The plan tables are read from the driver file (default driver/snakeoil3_v1.py).
'''
import argparse, csv, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(os.path.dirname(HERE), 'driver', 'snakeoil3_v1.py')

def plan_tables(driver):
    s = open(driver, encoding='utf-8').read()
    tb = {n: [float(x) for x in re.search(r'(?m)^    %s= \((.*)\)' % n, s).group(1).split(',') if x.strip()] for n in ('plan_pos', 'plan_curv', 'plan_v')}
    ds = float(re.search(r'(?m)^    plan_ds=\s*([\d.]+)', s).group(1))
    def at(name, d):
        t = tb[name]; x = (d / ds) % len(t); i = int(x)
        return t[i] + (t[(i + 1) % len(t)] - t[i]) * (x - i)
    return at

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('csv'); ap.add_argument('start', type=float); ap.add_argument('end', type=float)
    ap.add_argument('step', type=float, nargs='?', default=10.0, help='metres between printed rows (default 10)')
    ap.add_argument('--driver', default=DRIVER, help='driver file whose plan tables to print')
    a = ap.parse_args()
    at = plan_tables(a.driver)
    rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(open(a.csv))]
    rows = [r for r in rows if r['curLapTime'] >= 0 and r['lastLapTime'] == 0]
    print(' dist     t    v allow planv    tp  line   err steer  brk  thr  acc   vy g')
    nxt, t0 = a.start, None
    for r in rows:
        d = r['distFromStart']
        if r['curLapTime'] < 3 and d > 1000: continue   # the rows before the start line
        if nxt <= d <= a.end:
            t0 = r['curLapTime'] if t0 is None else t0
            p = at('plan_pos', d)
            print('%5.0f %5.2f %4.0f %5.0f %5.0f %+.2f %+.2f %+.2f %+.2f %.2f %.2f %.2f %+4.0f %d' % (
                d, r['curLapTime'] - t0, r['speedX'], r.get('allowed', 0), at('plan_v', d), r['trackPos'], p, r['trackPos'] - p,
                r['steer'], r['brake'], r.get('throttle', 0), r['accel'], r['speedY'], r['gear']))
            nxt = d + a.step

if __name__ == '__main__':
    main()
