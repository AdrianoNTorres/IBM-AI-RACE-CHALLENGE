'''The whole acceptance bar for a candidate driver in one call (or a quick screen of several).

    python tools/accept.py --out %TEMP%\\v118                              # working-tree driver against HEAD's
    python tools/accept.py --out %TEMP%\\v118 --cand "A@a.py" --cand "B@a.py: plan_vs=1.03" --screen
    python tools/accept.py --out %TEMP%\\v118 --cand "A@a.py" --base v1.17
    python tools/accept.py --out %TEMP%\\v118 --cand "A@a.py" --single     # one lap each

A candidate is "label[@driver file][: knob=value knob=value ...]" (file relative to --out or a
path; none = driver/snakeoil3_v1.py as it is on disk). The base is a git revision of the driver
(default HEAD), or a driver file.

Full mode (one or more candidates) runs, in one parallel batch,
  - the 70 standard runs of the base and of each candidate (CSVs kept in <out>/base and
    <out>/<label>, named as tools/tails.py names them, so tails.py --reuse reads them),
  - every check in tools/checks.json around the candidate's own knob values,
and prints per candidate: the bar item by item (PASS / FAIL), the suite table with where each
worst run is, the paired lap difference to the base (30 / 40 / 70), the largest section
differences, the checks, the control patterns and the track-width table of base and candidate.
--screen runs only the 12 runs listed under "screen" in checks.json (a subset of the 70) and
prints one line per candidate; --single runs only the unperturbed lap.

Races already in the cache (tools/race.py) are not run again, so the base costs nothing after its
first run and a full run after a screen re-uses the screen's races.

Every call appends one line per candidate to <out>/results.jsonl and, in full mode, writes
<out>/<label>.accept.json with every number printed (read by tools/record.py).
Exit code: 0 if every candidate passes the bar (full mode), 1 otherwise; always 0 for a screen.
'''
import argparse, contextlib, io, json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import race
from race import Job, run_batch, knobs, check_no_torcs, count_raced, DRIVER, DEFAULT_N
from suite import SUITES, perturbed
from tails import GROUPS, mean, se
from metrics import metrics
import patterns

CHECKS = os.path.join(HERE, 'checks.json')

def parse_cand(spec, out):
    '''"label[@file][: k=v k=v]" -> (label, variant path or None, overrides).'''
    head, _, kv = spec.partition(':')
    label, _, var = head.strip().partition('@')
    ov = {}
    for x in kv.replace(',', ' ').split():
        k, v = x.split('=', 1)
        try: ov[k] = eval(v, {})
        except Exception: ov[k] = v
    if var:
        cands = [var, os.path.join(out, var), os.path.join(out, var + '.py')]
        var = next((p for p in cands if os.path.isfile(p)), None)
        if var is None: sys.exit('candidate driver not found: %s' % cands)
    if label in ('base', ''): sys.exit('a candidate cannot be called %r' % label)
    return label, (var or None), ov

def base_file(base, out):
    '''A driver file for the base: an existing file, or the driver at a git revision.'''
    if os.path.isfile(base): return base
    r = subprocess.run(['git', 'show', '%s:driver/snakeoil3_v1.py' % base], cwd=REPO, capture_output=True)
    if r.returncode: sys.exit('base %r is neither a file nor a git revision with the driver' % base)
    p = os.path.join(out, '_base_%s.py' % base.replace('/', '_').replace('\\', '_'))
    open(p, 'wb').write(r.stdout)
    return p

def standard_jobs(label, ov, variant, d, which):
    os.makedirs(d, exist_ok=True)
    jobs = []
    for g, gov, ss in GROUPS:
        for s in ss:
            for lab, knob, delta in SUITES[s]:
                nm = '%s_s%s_%s' % (g, s, lab)
                if which and nm not in which: continue
                j = Job(nm, perturbed(dict(ov, **gov), variant, knob, delta), variant, keep=os.path.join(d, nm + '.csv'))
                j.who, j.kind, j.group, j.name = label, 'std', g, nm
                jobs.append(j)
    return jobs

def check_jobs(label, ov, variant, checks):
    kn = knobs(open(variant or DRIVER).read())
    jobs = []
    for cname, c in checks.items():
        for p in c['perturb']:
            v0 = ov.get(p['knob'], kn.get(p['knob']))
            if v0 is None: sys.exit('check %s: knob %r is not in the candidate driver (edit tools/checks.json)' % (cname, p['knob']))
            mode = 'rel' if 'rel' in p else 'abs'
            sizes = p[mode] if isinstance(p[mode], list) else [p[mode]]
            for size in sizes:
                for sign in (-1, 1):
                    val = float('%.12g' % (v0 * (1 + sign * size) if mode == 'rel' else v0 + sign * size))
                    cfg = '%s=%g' % (p['knob'], val)
                    for s in c['suites']:
                        for lab, knob, delta in SUITES[s]:
                            j = Job(cfg, perturbed(dict(ov, **{p['knob']: val}), variant, knob, delta), variant)
                            j.who, j.kind, j.group, j.name = label, 'check', cname, '%s s%s_%s' % (cfg, s, lab)
                            jobs.append(j)
    return jobs

def group_rows(runs):
    '''[(group, n, off, mean, worst tp, worst at, worst run, off runs)] incl. the 30 as "all-30".'''
    rows = []
    for g in [x[0] for x in GROUPS]:
        sub = [(nm, m) for nm, (g2, m) in runs.items() if g2 == g]
        if not sub: continue
        on = [(nm, m) for nm, m in sub if m and not m['off']]
        offs = ['%s@%d' % (nm, m['max_tp_at'] if m else 0) for nm, m in sub if not m or m['off']]
        w = max(on, key=lambda x: x[1]['max_tp']) if on else None
        rows.append(dict(group=g, n=len(sub), off=len(offs), offs=offs, mean=mean([m['lap'] for _, m in on]) if on else None,
                         worst=w[1]['max_tp'] if w else None, worst_at=w[1]['max_tp_at'] if w else None, worst_run=w[0] if w else None,
                         damage=max([m['damage'] for _, m in sub if m] or [0])))
    return rows

def pair(runs, base, sel=lambda g: True):
    both = [(m, base[nm][1]) for nm, (g, m) in runs.items() if sel(g) and m and not m['off'] and nm in base and base[nm][1] and not base[nm][1]['off']]
    d = [m['lap'] - b['lap'] for m, b in both]
    if not d: return dict(n=0, mean=None, se=None, t=None, faster=0, slower=0, same=0, sections=[])
    s = se(d)
    ks = sorted(set(k for m, _ in both for k in m['sections']))
    sec = sorted(((mean([m['sections'].get(k, 0) - b['sections'].get(k, 0) for m, b in both]), k) for k in ks), key=lambda x: -abs(x[0]))
    return dict(n=len(d), mean=mean(d), se=s if s == s else None, t=(mean(d) / s if s == s and s > 0 else None),
                faster=sum(v < -5e-4 for v in d), slower=sum(v > 5e-4 for v in d), same=sum(abs(v) <= 5e-4 for v in d),
                sections=[(k, round(v, 4)) for v, k in sec[:6] if abs(v) >= 0.001])

def pat(csv_path):
    r = patterns.analyse(patterns.load(csv_path))
    return dict(reversals=r['reversals'], episodes=len(r['ep']), osc_s=round(r['osc_time'], 2), flips=r['flips'], plan_jumps=r['plan_jumps'],
                brake_apps=r['brake_apps'], short=r['touches'], reapplied=r['swaps'], shifts=r['shifts'], undone=r['hunts'], tc_s=round(r['tc_time'], 2))

def pat_line(p):
    return ('%d reversals, %d episodes (%.1f s), %d target flips, %d plan jumps, %d brake applications (%d short, %d re-applied), %d shifts (%d undone), TC %.1f s'
            % (p['reversals'], p['episodes'], p['osc_s'], p['flips'], p['plan_jumps'], p['brake_apps'], p['short'], p['reapplied'], p['shifts'], p['undone'], p['tc_s']))

def width(csv_path):
    r = subprocess.run([sys.executable, os.path.join(HERE, 'width.py'), csv_path], capture_output=True, text=True)
    return r.stdout.rstrip()

def f3(x): return '   n/a' if x is None else '%.3f' % x

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', required=True, help='work folder for this version (outside the repo), e.g. %%TEMP%%\\v118')
    ap.add_argument('--cand', action='append', help='"label[@driver file][: knob=value ...]" (repeatable); default: the driver on disk, label "cand"')
    ap.add_argument('--base', default='HEAD', help='git revision of the driver, or a driver file (default HEAD)')
    ap.add_argument('--screen', action='store_true', help='only the 12 screen runs of checks.json, one line per candidate, no checks')
    ap.add_argument('--single', action='store_true', help='only the unperturbed lap, one line per candidate')
    ap.add_argument('--no-checks', action='store_true', help='full 70 and pairing, but skip the checks of checks.json')
    ap.add_argument('--no-cache', action='store_true', help='race everything again and store nothing')
    ap.add_argument('-n', type=int, default=DEFAULT_N, help='parallel races (keep 4)')
    a = ap.parse_args()
    if a.no_cache: race.USE_CACHE = False
    out = os.path.abspath(os.path.expandvars(a.out))
    os.makedirs(out, exist_ok=True)
    cfg = json.load(open(CHECKS))
    which = {'base_s1_p0'} if a.single else set(cfg['screen']) if a.screen else None
    full = which is None
    cands = [parse_cand(c, out) for c in (a.cand or ['cand'])]
    if len(set(c[0] for c in cands)) < len(cands): sys.exit('candidate labels must differ')
    bfile = base_file(a.base, out)
    jobs = standard_jobs('base', {}, bfile, os.path.join(out, 'base'), which)
    for label, var, ov in cands:
        jobs += standard_jobs(label, ov, var, os.path.join(out, label), which)
        if full and not a.no_checks: jobs += check_jobs(label, ov, var, cfg['checks'])
    check_no_torcs()
    t0 = time.time()
    res = run_batch(jobs, a.n)
    raced, cached = count_raced(res)
    race.cache_prune()
    secs = time.time() - t0
    std = lambda who: {j.name: (j.group, m) for j, m in res if j.who == who and j.kind == 'std'}
    base = std('base')
    brow = {r['group']: r for r in group_rows(base)}
    mode = 'single' if a.single else 'screen' if a.screen else 'full'
    ok_all = True
    if not full:
        bon = [m for g, m in base.values() if m and not m['off']]
        bw = max(bon, key=lambda m: m['max_tp']) if bon else None
        print('%s: %d runs per config, base %s: mean %s, worst |tp| %s' % (mode, len(base), a.base, f3(mean([m['lap'] for m in bon]) if bon else None),
              '%.3f @ %d m' % (bw['max_tp'], bw['max_tp_at']) if bw else 'n/a'))
        print('%-14s %5s %8s %8s %6s %7s  %-28s %s' % ('candidate', 'off', 'mean', 'diff', 'SE', 'f/s/=', 'worst |tp| @ m (run)', 'largest section differences'))
    for label, var, ov in cands:
        runs = std(label)
        rows = group_rows(runs)
        on = [(nm, m) for nm, (g, m) in runs.items() if m and not m['off']]
        offs = [nm for nm, (g, m) in runs.items() if not m or m['off']]
        w = max(on, key=lambda x: x[1]['max_tp']) if on else None
        p_all = pair(runs, base)
        rec = dict(time=time.strftime('%Y-%m-%d %H:%M'), mode=mode, label=label, variant=var, sets=ov, base=a.base, n=len(runs),
                   off=len(offs), offs=offs, mean=mean([m['lap'] for _, m in on]) if on else None, diff=p_all['mean'], se=p_all['se'],
                   faster=p_all['faster'], slower=p_all['slower'], same=p_all['same'],
                   worst=w[1]['max_tp'] if w else None, worst_at=w[1]['max_tp_at'] if w else None, worst_run=w[0] if w else None,
                   sections=p_all['sections'])
        if not full:
            print('%-14s %2d/%-2d %8s %8s %6s %7s  %-28s %s' % (label, len(offs), len(runs), f3(rec['mean']),
                  '   n/a' if p_all['mean'] is None else '%+.3f' % p_all['mean'], f3(p_all['se']), '%d/%d/%d' % (p_all['faster'], p_all['slower'], p_all['same']),
                  ('%.3f @ %d (%s)' % (w[1]['max_tp'], w[1]['max_tp_at'], w[0].replace('base_', ''))) if w else 'none on track',
                  ' '.join('%d %+.3f' % (k, v) for k, v in p_all['sections'][:4]) + ('  OFF: ' + ','.join(offs) if offs else '')))
        else:
            r = {x['group']: x for x in rows}
            p30, p40 = pair(runs, base, lambda g: g == 'base'), pair(runs, base, lambda g: g != 'base')
            checks = {}
            for cname in ([] if a.no_checks else cfg['checks']):
                cs = [(j, m) for j, m in res if j.who == label and j.kind == 'check' and j.group == cname]
                con = [(j, m) for j, m in cs if m and not m['off']]
                cw = max(con, key=lambda x: x[1]['max_tp']) if con else None
                checks[cname] = dict(n=len(cs), off=sum(1 for j, m in cs if not m or m['off']),
                                     offs=['%s@%d' % (j.name, m['max_tp_at'] if m else 0) for j, m in cs if not m or m['off']],
                                     worst=cw[1]['max_tp'] if cw else None, worst_at=cw[1]['max_tp_at'] if cw else None, worst_run=cw[0].name if cw else None)
            shifted_off = sum(r[g]['off'] for g in r if g != 'base')
            shifted_n = sum(r[g]['n'] for g in r if g != 'base')
            bar = [('0 of 30 off, 0 damage', r['base']['off'] == 0 and r['base']['damage'] == 0, '%d off' % r['base']['off']),
                   ('0 of %d shifted off' % shifted_n, shifted_off == 0, '%d off' % shifted_off)]
            bar += [('%s check 0 of %d off' % (c, v['n']), v['off'] == 0, '%d off, worst %s @ %s m (%s)' % (v['off'], f3(v['worst']), v['worst_at'] and int(v['worst_at']), v['worst_run'])) for c, v in checks.items()]
            bar += [('all-30 mean not above the base', r['base']['mean'] is not None and brow['base']['mean'] is not None and r['base']['mean'] <= brow['base']['mean'] + 5e-4,
                     '%s vs %s' % (f3(r['base']['mean']), f3(brow['base']['mean']))),
                    ('paired gain over 70 at least 2 SE', p_all['mean'] is not None and p_all['mean'] < 0 and (p_all['t'] is None or p_all['t'] <= -2),
                     '%s s, SE %s' % ('n/a' if p_all['mean'] is None else '%+.3f' % p_all['mean'], f3(p_all['se'])))]
            ok = all(b[1] for b in bar)
            ok_all &= ok
            p0c, p0b = runs.get('base_s1_p0', (0, None))[1], base.get('base_s1_p0', (0, None))[1]
            pc = os.path.join(out, label, 'base_s1_p0.csv'); pb = os.path.join(out, 'base', 'base_s1_p0.csv')
            pats = {k: pat(p) for k, p in (('base', pb), ('cand', pc)) if os.path.exists(p)}
            wid = {k: width(p) for k, p in (('base', pb), ('cand', pc)) if os.path.exists(p)}
            print('=== %s against %s: %s' % (label, a.base, 'PASS' if ok else 'FAIL'))
            for name, good, detail in bar: print('  %-4s %-36s %s' % ('ok' if good else 'FAIL', name, detail))
            if p0c and p0c['lap']: print('lap (unperturbed) %.3f s (base %s), top %d km/h, slowest corner %.0f km/h @ %.0f m, max |trackPos| %.3f @ %.0f m, damage %d' % (
                p0c['lap'], f3(p0b['lap'] if p0b else None), p0c['top'], p0c['min_corner'], p0c['min_corner_at'], p0c['max_tp'], p0c['max_tp_at'], p0c['damage']))
            print('%-6s %3s %4s %8s %8s  %-34s %s' % ('group', 'n', 'off', 'mean', 'base', 'worst |tp| @ m (run)', 'base worst'))
            for x in rows:
                b = brow.get(x['group'], {})
                print('%-6s %3d %4d %8s %8s  %-34s %s%s' % ('all-30' if x['group'] == 'base' else x['group'], x['n'], x['off'], f3(x['mean']), f3(b.get('mean')),
                      '%s @ %s (%s)' % (f3(x['worst']), x['worst_at'] and int(x['worst_at']), x['worst_run']),
                      '%s @ %s' % (f3(b.get('worst')), b.get('worst_at') and int(b['worst_at'])), ('  OFF: ' + ', '.join(x['offs'])) if x['offs'] else ''))
            print('paired lap difference to the base (s; negative = faster)')
            for lab, p in (('30 suites', p30), ('40 shifted', p40), ('all 70', p_all)):
                print('  %-10s n %2d  %s  SE %s  %d faster / %d slower / %d same' % (lab, p['n'], '   n/a' if p['mean'] is None else '%+.3f' % p['mean'], f3(p['se']), p['faster'], p['slower'], p['same']))
            print('  largest section differences: ' + '  '.join('%d m %+.3f' % (k, v) for k, v in p_all['sections']))
            for c, v in checks.items():
                if v['offs']: print('  %s OFF: %s' % (c, ', '.join(v['offs'])))
            for k in ('base', 'cand'):
                if k in pats: print('patterns %-4s %s' % (k, pat_line(pats[k])))
            if 'cand' in wid: print('width (candidate)\n' + wid['cand'])
            rec.update(verdict='PASS' if ok else 'FAIL', bar=[dict(item=n_, ok=g_, detail=d_) for n_, g_, d_ in bar], groups=rows,
                       base_groups=list(brow.values()), pair30=p30, pair40=p40, pair70=p_all, checks=checks,
                       p0={k: p0c[k] for k in ('lap', 'top', 'min_corner', 'min_corner_at', 'max_tp', 'max_tp_at', 'damage')} if p0c else None,
                       p0_base={k: p0b[k] for k in ('lap', 'top', 'min_corner', 'min_corner_at', 'max_tp', 'max_tp_at', 'damage')} if p0b else None,
                       patterns=pats, width=wid, raced=raced, cached=cached)
            json.dump(rec, open(os.path.join(out, label + '.accept.json'), 'w'), indent=1)
        slim = {k: v for k, v in rec.items() if k not in ('groups', 'base_groups', 'width', 'bar', 'pair30', 'pair40', 'pair70', 'p0_base')}
        with open(os.path.join(out, 'results.jsonl'), 'a') as f: f.write(json.dumps(slim) + '\n')
    print('%d races run, %d from the cache, %.0f s' % (raced, cached, secs))
    sys.exit(0 if (ok_all or not full) else 1)

if __name__ == '__main__':
    main()
