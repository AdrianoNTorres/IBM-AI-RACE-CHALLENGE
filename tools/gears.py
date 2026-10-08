"""Every gear change of a lap: where, when, at what speed, and how long each gear was held.

    python tools/gears.py runs/run_20261008_125835.csv
    python tools/gears.py %TEMP%\\v123\\base %TEMP%\\v123\\A      (folders of accept.py runs: the lap *s1_p0.csv)
    python tools/gears.py runs/a.csv --short 0.5                  (only the stints shorter than 0.5 s)

Per lap: the number of changes, then one entry per change, from>to@metres/lap time/km/h, and
the stints (time in a gear between two changes) shorter than --short seconds (default 1).
See tools/README.md, "gears.py".
"""
import csv
import glob
import os
import sys


def pick(path):
    path = os.path.expandvars(path)
    if os.path.isdir(path):
        fs = sorted(glob.glob(os.path.join(path, '*s1_p0.csv'))) or sorted(glob.glob(os.path.join(path, '*.csv')))
        if not fs:
            sys.exit('no run CSV in %s' % path)
        return fs[0]
    return path


def shifts(path):
    """[(from gear, to gear, distance m, lap time s, speed km/h)], the first row's gear included"""
    out, g0 = [], None
    for x in csv.DictReader(open(pick(path))):
        t = float(x['curLapTime'])
        if t < 0:
            continue
        g = x['gear']
        if g != g0:
            out.append((g0, g, float(x['distFromStart']), t, float(x['speedX'])))
            g0 = g
    return out


def main():
    args = sys.argv[1:]
    short = 1.0
    if '--short' in args:
        i = args.index('--short')
        short = float(args[i + 1])
        del args[i:i + 2]
    if not args or args[0] in ('-h', '--help'):
        sys.exit(__doc__)
    for a in args:
        s = shifts(a)
        print('%s: %d gear changes' % (os.path.basename(os.path.normpath(a)), len(s) - 1))
        print('  ' + ' '.join('%s>%s@%dm/%.2fs/%d' % (f, g, d, t, v) for f, g, d, t, v in s[1:]))
        stints = [(s[i][1], s[i][2], s[i + 1][2], s[i + 1][3] - s[i][3]) for i in range(1, len(s) - 1)]
        few = [x for x in stints if x[3] < short]
        print('  %d stints under %g s: ' % (len(few), short) + ' '.join('gear %s %d-%d m %.2f s' % x for x in few))


if __name__ == '__main__':
    main()
