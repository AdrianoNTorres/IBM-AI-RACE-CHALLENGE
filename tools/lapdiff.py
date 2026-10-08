"""Two laps side by side at distance marks.

    python tools/lapdiff.py %TEMP%\\v123\\base %TEMP%\\v123\\A               (every 50 m)
    python tools/lapdiff.py %TEMP%\\v123\\base %TEMP%\\v123\\A 2600 2900 10  (from m, to m, step)
    python tools/lapdiff.py runs/a.csv runs/b.csv 1850 2100 25

A and B are run CSVs, or folders of accept.py runs (the unperturbed lap *s1_p0.csv is taken).
Per mark: dt = B's time minus A's since the start line (negative = B is ahead), then speed,
gear, trackPos, throttle sent and brake of each, and B's rpm reading.
See tools/README.md, "lapdiff.py".
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


def load(path):
    out, prev_d = [], -1
    for x in csv.DictReader(open(pick(path))):
        if float(x['curLapTime']) < 0:
            continue
        d = float(x['distFromStart'])
        if d < prev_d - 1000:      # the second crossing of the line
            break
        if out or d < 1000:        # skip the metres before the line (d reads ~3,600 there)
            out.append((d, float(x['curLapTime']), float(x['speedX']), int(float(x['gear'])), float(x['trackPos']),
                        float(x['accel']), float(x['brake']), float(x['rpm'])))
            prev_d = d
    return out


def at(rows, m):
    for i in range(1, len(rows)):
        if rows[i][0] >= m:
            a, b = rows[i - 1], rows[i]
            f = (m - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0
            return (a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), b[3], a[4] + f * (b[4] - a[4]), b[5], b[6], b[7])
    return None


def main():
    if len(sys.argv) not in (3, 6) or sys.argv[1] in ('-h', '--help'):
        sys.exit(__doc__)
    A, B = load(sys.argv[1]), load(sys.argv[2])
    lo, hi, st = (int(v) for v in sys.argv[3:6]) if len(sys.argv) == 6 else (50, 3600, 50)
    print('    m   dt     vA   vB  gA gB   tpA    tpB   accA accB brkA brkB  rpmB')
    for m in range(lo, hi + 1, st):
        a, b = at(A, m), at(B, m)
        if a and b:
            print('%5d %+.3f  %4.0f %4.0f  %d  %d  %+.2f  %+.2f  %.2f %.2f %.2f %.2f  %5.0f' %
                  (m, b[0] - a[0], a[1], b[1], a[2], b[2], a[3], b[3], a[4], b[4], a[5], b[5], b[6]))


if __name__ == '__main__':
    main()
