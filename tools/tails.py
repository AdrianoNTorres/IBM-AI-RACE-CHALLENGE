'''Tail analysis and paired comparison over the 70 standard runs of a config.

    python tools/tails.py --dir %TEMP%\\x\\base                       # current driver: run 70, keep the CSVs, print tables
    python tools/tails.py --dir %TEMP%\\x\\cand --variant v.py --set k=1 --pair %TEMP%\\x\\base
    python tools/tails.py --dir %TEMP%\\x\\base --reuse               # tables again from the kept CSVs, no races

The 70 runs = the 3 suites (30) + suites 1-2 on the shifted bases brake_margin=14
(bm14) and line_offset=0.5 (lo05) (40). CSVs are kept in --dir as <group>_s<suite>_<label>.csv
(keep --dir outside the repo). Prints
 (a) the suite table per group, with where and on which run each max |trackPos| is;
 (b) per 100 m section over the on-track runs: mean, min, median, number of tail runs
     (> TAIL s above the section median), tail loss (their excess over the median,
     averaged over ALL runs) and the section's correlation with the lap time, sorted by tail loss;
 (c) with --pair DIR (a base's kept CSVs): paired per-run lap difference over the 30, the 40
     and all 70 (mean, standard error, faster / slower / identical) and the per-section mean difference.
Comparing runs with and without an event overstates the event's cost: confirm by removing it.
'''
import argparse, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from race import Job, run_batch, parse_sets, check_no_torcs, DEFAULT_N
from suite import SUITES, perturbed
from metrics import metrics

GROUPS = [('base', {}, '123'), ('bm14', {'brake_margin': 14}, '12'), ('lo05', {'line_offset': 0.5}, '12')]
TAIL = 0.03

def names():
    '''[(group, suite, run name)] of the 70 runs, in order.'''
    return [(g, s, '%s_s%s_%s' % (g, s, lab)) for g, _, ss in GROUPS for s in ss for lab, _, _ in SUITES[s]]

def run70(d, overrides, variant, n=DEFAULT_N, reuse=False):
    '''Run the 70 (skipping CSVs already in d if reuse); CSVs are kept in d.'''
    os.makedirs(d, exist_ok=True)
    jobs = []
    for g, ov, ss in GROUPS:
        for s in ss:
            for lab, knob, delta in SUITES[s]:
                p = os.path.join(d, '%s_s%s_%s.csv' % (g, s, lab))
                if not (reuse and os.path.exists(p)):
                    jobs.append(Job(os.path.basename(p), perturbed(dict(overrides, **ov), variant, knob, delta), variant, keep=p))
    if jobs:
        check_no_torcs()
        run_batch(jobs, n)
    return len(jobs)

def load(d):
    '''{run name: (group, suite, metrics or None)} from the kept CSVs in d.'''
    out = {}
    for g, s, nm in names():
        p = os.path.join(d, nm + '.csv')
        out[nm] = (g, s, metrics(p) if os.path.exists(p) else None)
    return out

def mean(x): return sum(x) / len(x) if x else float('nan')
def se(x):
    if len(x) < 2: return float('nan')
    m = mean(x)
    return (sum((v - m) ** 2 for v in x) / (len(x) - 1) / len(x)) ** 0.5
def median(x):
    x = sorted(x); k = len(x) // 2
    return x[k] if len(x) % 2 else (x[k - 1] + x[k]) / 2
def corr(x, y):
    mx, my = mean(x), mean(y)
    sx = sum((a - mx) ** 2 for a in x) ** 0.5; sy = sum((b - my) ** 2 for b in y) ** 0.5
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / (sx * sy) if sx > 0 and sy > 0 else 0.0

def suite_table(runs):
    print('%-6s %-5s %3s %4s %9s %7s  %s' % ('group', 'suite', 'n', 'off', 'mean', 'max|tp|', 'max at / off runs'))
    for g, _, ss in GROUPS:
        for s in list(ss) + ['all']:
            sub = [(nm, m) for nm, (g2, s2, m) in runs.items() if g2 == g and (s == 'all' or s2 == s)]
            on = [(nm, m) for nm, m in sub if m and not m['off']]
            offs = ['%s@%d' % (nm, m['max_tp_at'] if m else 0) for nm, m in sub if not m or m['off']]
            w = max(on, key=lambda x: x[1]['max_tp']) if on else None
            print('%-6s %-5s %3d %4d %9.3f %7.3f  %s%s' % (g, s, len(sub), len(offs), mean([m['lap'] for _, m in on]) if on else 999,
                  w[1]['max_tp'] if w else 9, '%s @ %d m' % (w[0], w[1]['max_tp_at']) if w else '', ('  OFF: ' + ', '.join(offs)) if offs else ''))

def section_table(runs):
    on = [m for _, _, m in runs.values() if m and not m['off']]
    laps = [m['lap'] for m in on]
    rows = []
    for k in sorted(set(k for m in on for k in m['sections'])):
        t = [m['sections'].get(k, 0.0) for m in on]
        md = median(t); tail = [v - md for v in t if v - md > TAIL]
        rows.append((sum(tail) / len(t), k, mean(t), min(t), md, len(tail), corr(t, laps)))
    print('\nsections over %d on-track runs (mean lap %.3f, sum of section minima %.3f; tail = > %.2f s above the median), by tail loss'
          % (len(on), mean(laps), sum(r[3] for r in rows), TAIL))
    print('%5s %7s %7s %7s %5s %7s %6s' % ('sect', 'mean', 'min', 'median', 'tails', 'loss', 'corr'))
    for loss, k, mn, lo, md, nt, c in sorted(rows, reverse=True):
        print('%5d %7.3f %7.3f %7.3f %5d %7.3f %+6.2f' % (k, mn, lo, md, nt, loss, c))

def pair_table(runs, base):
    both = [(nm, g, m, base[nm][2]) for nm, (g, s, m) in runs.items() if m and not m['off'] and base.get(nm, (0, 0, None))[2] and not base[nm][2]['off']]
    print('\npaired lap difference to the base (s; negative = faster)')
    print('%-10s %3s %8s %7s %6s %6s %6s %5s' % ('runs', 'n', 'mean', 'SE', 'mean/SE', 'faster', 'slower', 'same'))
    for lab, sel in (('30 suites', lambda g: g == 'base'), ('40 shifted', lambda g: g != 'base'), ('all 70', lambda g: True)):
        d = [m['lap'] - b['lap'] for nm, g, m, b in both if sel(g)]
        s = se(d)
        print('%-10s %3d %+8.3f %7.3f %+6.1f %6d %6d %5d' % (lab, len(d), mean(d), s, mean(d) / s if s and s == s else 0,
              sum(v < -5e-4 for v in d), sum(v > 5e-4 for v in d), sum(abs(v) <= 5e-4 for v in d)))
    print('per-section mean difference (all paired runs; |diff| >= 0.001 s):')
    ks = sorted(set(k for _, _, m, _ in both for k in m['sections']))
    ds = [(k, mean([m['sections'].get(k, 0) - b['sections'].get(k, 0) for _, _, m, b in both])) for k in ks]
    print('  ' + '  '.join('%d %+.3f' % (k, v) for k, v in ds if abs(v) >= 0.001))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--dir', required=True, help='folder the 70 CSVs are kept in (outside the repo)')
    ap.add_argument('--set', action='append', help='knob=value (repeatable)')
    ap.add_argument('--variant', help='driver file instead of snakeoil3_v1.py')
    ap.add_argument('--reuse', action='store_true', help='do not re-run CSVs already in --dir')
    ap.add_argument('--pair', help="folder of a base's kept CSVs: paired comparison")
    ap.add_argument('--no-sections', action='store_true', help='skip the section table')
    ap.add_argument('-n', type=int, default=DEFAULT_N, help='parallel races (max 10)')
    a = ap.parse_args()
    t0 = time.time()
    nrun = run70(a.dir, parse_sets(a.set), a.variant, a.n, a.reuse)
    runs = load(a.dir)
    suite_table(runs)
    if not a.no_sections: section_table(runs)
    if a.pair: pair_table(runs, load(a.pair))
    print('%d races in %.1f s' % (nrun, time.time() - t0))
