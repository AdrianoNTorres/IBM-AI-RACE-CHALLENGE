'''Run the chosen version for the record and print the changelog result fields.

    python tools/finalize.py                 # run_race.py on snakeoil3_v1.py, keep the CSV in runs/
    python tools/finalize.py --suite         # also the 30-run perturbation suite (means, offs, max |tp|)
    python tools/finalize.py --verify runs/run_20261002_010817.csv   # rerun, check byte-identical, delete rerun

Uses run_race.py itself (slot 0, port 3001, exactly as the user's runs), so the
CSV it leaves in runs/ is the one to commit. Prints lap_report.py's output, the
paste-ready changelog fields, watch points, and the 100 m sections that changed
most against the previous newest run in runs/.
'''
import argparse, filecmp, glob, math, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from metrics import metrics, line

def screen_time(t):
    cs = int(math.floor(math.floor(round(t * 1000)) / 1000 * 100 + 1e-6))
    m, s = divmod(cs // 100, 60)
    return '%d:%02d.%02d' % (m, s, cs % 100), '%d:%02d:%02d' % (m, s, cs % 100)

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--suite', action='store_true', help='also run the 30-run perturbation suite')
    ap.add_argument('--verify', help='committed CSV to reproduce byte for byte (rerun is deleted)')
    a = ap.parse_args()
    runs = lambda: set(glob.glob(os.path.join(REPO, 'runs', '*.csv')))
    before = runs()
    prev = sorted(before)[-1] if before else None
    r = subprocess.run([sys.executable, os.path.join(REPO, 'harness', 'run_race.py')], cwd=REPO, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    new = sorted(runs() - before)
    if not new: sys.exit('no new CSV')
    path = new[-1]
    if a.verify:
        same = filecmp.cmp(path, a.verify, shallow=False)
        os.remove(path)
        print('\nRERUN %s %s (rerun deleted)' % ('BYTE-IDENTICAL to' if same else 'DIFFERS from', a.verify))
        sys.exit(0 if same else 1)
    m = metrics(path)
    if m['lap'] is None: sys.exit('lap not finished: ' + line(m))
    dot, colon = screen_time(m['lap'])
    print('\n--- changelog result fields ---')
    print('| **Lap time** | %s |' % dot)
    print('| **Damage** | %d |' % m['damage'])
    print('| **Top speed** | %d km/h |' % m['top'])
    print('| **Min speed** | %.0f km/h |' % m['min_corner'])
    print('Observed: run `runs/%s`; TORCS time %.3f s -> on screen %s; max |trackPos| %.3f at ~%.0f m (%s); slowest corner ~%.0f m'
          % (os.path.basename(path), m['lap'], colon, m['max_tp'], m['max_tp_at'], 'OFF TRACK' if m['max_tp'] > 1 else 'on track', m['min_corner_at']))
    print('Watch points: ' + line(m))
    if prev:
        p = metrics(prev)
        if p['lap']:
            d = sorted(((m['sections'].get(k, 0) - v, k) for k, v in p['sections'].items()), key=lambda x: abs(x[0]), reverse=True)[:6]
            print('vs %s (%.3f s): %+.3f s; biggest section changes: %s' % (os.path.basename(prev), p['lap'], m['lap'] - p['lap'],
                  ', '.join('%d m %+.3f' % (k, dv) for dv, k in d)))
    if a.suite:
        from suite import run_suites, print_summary
        print()
        print_summary(run_suites([('version', {}, None)]), '123')

if __name__ == '__main__':
    main()
