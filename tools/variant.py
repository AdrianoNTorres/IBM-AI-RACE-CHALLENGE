'''Make a trial copy of the driver with exact text edits (the driver itself is never touched).

    python tools/variant.py %TEMP%\\v118\\a.py --rep "plan_vs=1.02=>plan_vs=1.03"
    python tools/variant.py %TEMP%\\v118\\b.py --from %TEMP%\\v118\\a.py --edits edits.txt
    python tools/variant.py %TEMP%\\v118\\c.py --plan plan.txt:1900:2990      # splice table rows 1,900-2,990 m
    python tools/variant.py %TEMP%\\v118\\d.py --from v1.16                     # the driver at a git revision
    python tools/variant.py %TEMP%\\v118\\e.py --vscale 2650:2760:1.02           # stored speed of a stretch x 1.02

--rep "old=>new" replaces old by new; old must occur exactly once (\\n in either = a line break).
--edits FILE holds any number of multi-line edits, each written as

    <<<<
    old text
    ====
    new text
    >>>>

--plan FILE[:from:to] takes plan_pos / plan_curv / plan_v from a table written by
tools/raceline.py --table; with from:to (metres) only the entries inside that stretch are
replaced and the rest stay byte for byte (splice per stretch: a full regeneration moves
far-away worst runs). --vscale from:to:factor (repeatable) multiplies the plan_v entries
inside from..to metres by the factor (at most 360 km/h, one decimal) and prints them before
and after. Edits are applied in the order --plan, --vscale, --edits, --rep. The file's line
endings are kept. Prints the number of changed lines.
'''
import argparse, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DRIVER = os.path.join(REPO, 'driver', 'snakeoil3_v1.py')

def read_base(src):
    if src is None or os.path.isfile(src):
        return open(src or DRIVER, encoding='utf-8', newline='').read()
    r = subprocess.run(['git', 'show', '%s:driver/snakeoil3_v1.py' % src], cwd=REPO, capture_output=True)
    if r.returncode: sys.exit('--from %r is neither a file nor a git revision with the driver' % src)
    return r.stdout.decode('utf-8')

def replace_once(s, old, new, nl):
    old, new = (x.replace('\r\n', '\n').replace('\n', nl) for x in (old, new))
    if s.count(old) != 1: sys.exit('edit not applied: the old text occurs %d times (must be 1):\n%s' % (s.count(old), old[:300]))
    return s.replace(old, new)

def parse_edits(path):
    txt = open(path, encoding='utf-8').read().replace('\r\n', '\n')
    out = re.findall(r'(?ms)^<<<<\n(.*?)\n====\n(.*?)\n?>>>>$', txt)
    if not out: sys.exit('no <<<< / ==== / >>>> edit found in %s' % path)
    return out

def splice_plan(s, spec):
    m = re.match(r'^(.*):([\d.]+):([\d.]+)$', spec)   # a drive letter's colon is not a range
    path, lo, hi = (m.group(1), float(m.group(2)), float(m.group(3))) if m else (spec, None, None)
    new = open(path, encoding='utf-8').read()
    ds = float(re.search(r'(?m)^    plan_ds=\s*([\d.]+)', s).group(1))
    for name in ('plan_pos', 'plan_curv', 'plan_v'):
        pat = r'(?m)^(    %s= \()(.*)(\))' % name
        m, mn = re.search(pat, s), re.search(pat, new)
        if not m or not mn: sys.exit('%s not found in the driver or in %s' % (name, path))
        old_v, new_v = [x.strip() for x in m.group(2).split(',')], [x.strip() for x in mn.group(2).split(',')]
        if len(old_v) != len(new_v): sys.exit('%s: %d entries in the driver, %d in %s' % (name, len(old_v), len(new_v), path))
        vals = [n if lo is None or lo <= i * ds <= hi else o for i, (o, n) in enumerate(zip(old_v, new_v))]
        s = s[:m.start(2)] + ', '.join(vals) + s[m.end(2):]
    return s

def scale_v(s, spec):
    try: lo, hi, f = (float(x) for x in spec.split(':'))
    except ValueError: sys.exit('--vscale needs from:to:factor, e.g. 2650:2760:1.02: %r' % spec)
    ds = float(re.search(r'(?m)^    plan_ds=\s*([\d.]+)', s).group(1))
    m = re.search(r'(?m)^(    plan_v= \()(.*)(\))', s)
    if not m: sys.exit('plan_v not found in the driver')
    v = [x.strip() for x in m.group(2).split(',')]
    idx = [i for i in range(len(v)) if lo <= i * ds <= hi]
    if not idx: sys.exit('--vscale %s: no plan_v entry in that stretch' % spec)
    old = [v[i] for i in idx]
    for i in idx: v[i] = '%g' % round(min(float(v[i]) * f, 360), 1)
    print('plan_v %g-%g m x %g: %s -> %s' % (idx[0] * ds, idx[-1] * ds, f, ' '.join(old), ' '.join(v[i] for i in idx)))
    return s[:m.start(2)] + ', '.join(v) + s[m.end(2):]

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('out', help='file to write (outside the repo)')
    ap.add_argument('--from', dest='src', help='base: a driver file or a git revision (default: the driver on disk)')
    ap.add_argument('--rep', action='append', default=[], help='"old=>new", old must occur exactly once (repeatable)')
    ap.add_argument('--edits', action='append', default=[], help='file of <<<< old ==== new >>>> blocks (repeatable)')
    ap.add_argument('--plan', help='raceline.py --table file, optionally :from:to in metres')
    ap.add_argument('--vscale', action='append', default=[], help='from:to:factor: multiplies plan_v inside the stretch in metres (repeatable)')
    a = ap.parse_args()
    out = os.path.abspath(os.path.expandvars(a.out))
    if os.path.normcase(out) == os.path.normcase(DRIVER): sys.exit('refusing to overwrite the driver')
    s0 = s = read_base(a.src)
    nl = '\r\n' if '\r\n' in s else '\n'
    if a.plan: s = splice_plan(s, a.plan)
    for v in a.vscale: s = scale_v(s, v)
    for f in a.edits:
        for old, new in parse_edits(f): s = replace_once(s, old, new, nl)
    for r in a.rep:
        if '=>' not in r: sys.exit('--rep needs "old=>new": %r' % r)
        old, new = r.split('=>', 1)
        s = replace_once(s, old.replace('\\n', '\n'), new.replace('\\n', '\n'), nl)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8', newline='').write(s)
    a_, b_ = s0.split(nl), s.split(nl)
    changed = sum(1 for x, y in zip(a_, b_) if x != y) + abs(len(a_) - len(b_))
    print('%s written: %d lines differ from the base (%d -> %d lines)' % (out, changed, len(a_), len(b_)))

if __name__ == '__main__':
    main()
