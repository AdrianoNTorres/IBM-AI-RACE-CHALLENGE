"""Worst |trackPos| per place of the lap, over every run CSV of one or more folders.

    python tools/places.py %TEMP%\\v123\\base %TEMP%\\v123\\A %TEMP%\\v123\\A_vd10
    python tools/places.py runs/run_20261008_125835.csv

One line per folder (or CSV): the number of runs and, per place, the largest |trackPos| any of
them reached there. A place ending in x is a bend's exit. accept.py keeps each label's runs in
<out>\\<label>\\. See tools/README.md, "places.py".
"""
import csv
import glob
import os
import sys

# name, from m, to m
PLACES = (('kink', 150, 330), ('446', 400, 580), ('770x', 740, 870), ('1042x', 1060, 1140), ('1528', 1480, 1560),
          ('1634x', 1590, 1680), ('1931', 1890, 1960), ('1990x', 1961, 2060), ('flick', 2380, 2470), ('wall', 2471, 2530),
          ('2600', 2531, 2680), ('2700a', 2681, 2760), ('2803x', 2761, 2850), ('2988', 2940, 3010), ('3053x', 3011, 3100),
          ('hp', 3200, 3275), ('hpx', 3276, 3360))


def worst(files):
    w = [0.0] * len(PLACES)
    for f in files:
        for x in csv.DictReader(open(f)):
            if float(x['curLapTime']) < 0:
                continue
            d, t = float(x['distFromStart']), abs(float(x['trackPos']))
            for i, p in enumerate(PLACES):
                if p[1] <= d <= p[2] and t > w[i]:
                    w[i] = t
    return w


def main():
    args = [os.path.expandvars(a) for a in sys.argv[1:]]
    if not args or args[0] in ('-h', '--help'):
        sys.exit(__doc__)
    print('%-14s %3s ' % ('runs of', 'n') + ' '.join('%6s' % p[0] for p in PLACES))
    for a in args:
        fs = sorted(glob.glob(os.path.join(a, '*.csv'))) if os.path.isdir(a) else [a]
        if not fs or not os.path.isfile(fs[0]):
            sys.exit('no run CSV in %s' % a)
        name = os.path.basename(os.path.normpath(a))
        print('%-14s %3d ' % (name[:14], len(fs)) + ' '.join('%6.3f' % v for v in worst(fs)))


if __name__ == '__main__':
    main()
