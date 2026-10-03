'''The three 10-run perturbation suites (the safety standard since v0.49), run in parallel.

    python tools/suite.py                                    # current driver, all 30 runs
    python tools/suite.py --set brake_aero=0.0065 --set tc_slip=3
    python tools/suite.py --cfg base: --cfg hi:brake_aero=0.0065,brake_max=30   # compare configs
    python tools/suite.py --variant my_driver.py --suites 1 -v

Each perturbation nudges one knob by a DELTA from the config's own value (the
v0.49 suites, written as deltas so they still apply when a config changes that
knob; on the v0.49 values they give exactly the v0.49 runs).
Suite 1 includes the unperturbed run p0. A run counts as OFF if |trackPos| > 1,
any damage, or it did not finish. Means are over on-track runs only.
Score (used by opt.py) = mean lap + off_pen * offs + soft_pen * sum(max(0, |tp| - soft_tp)).
'''
import argparse, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from race import Job, run_batch, knobs, parse_sets, check_no_torcs, DRIVER, DEFAULT_N
from metrics import line

SUITES = {
    '1': [('p0', None, 0), ('tga+', 'turn_grip_aero', 0.5e-4), ('tga-', 'turn_grip_aero', -0.25e-4),
          ('tg+.5', 'turn_grip', 0.5), ('lo+.1', 'line_offset', 0.1), ('tss+1', 'tc_slip_straight', 1.0),
          ('cs+2', 'corner_speed', 2), ('bd+.5', 'brake_decel', 0.5), ('lg-.4', 'lookahead_gain', -0.4),
          ('ba+', 'brake_aero', 0.0005)],
    '2': [('bg+.01', 'brake_gain', 0.01), ('tcg+.1', 'tc_gain', 0.1), ('lgn+.1', 'line_gain', 0.1),
          ('mss+.05', 'max_steer_step', 0.05), ('up-200', 'upshift_rpm', -200), ('cs-2', 'corner_speed', -2),
          ('bm+2', 'brake_margin', 2), ('bm-2', 'brake_margin', -2), ('lo-.1', 'line_offset', -0.1),
          ('lt+.05', 'lock_throttle', 0.05)],
    '3': [('tsf-.05', 'turn_steer_fade', -0.05), ('tsf+.05', 'turn_steer_fade', 0.05), ('tsm-.05', 'turn_steer_max', -0.05),
          ('lao-.2', 'line_aim_off', -0.2), ('lao+.2', 'line_aim_off', 0.2), ('tcs-.2', 'tc_slip', -0.2),
          ('tcs+.2', 'tc_slip', 0.2), ('ds-500', 'downshift_rpm', -500), ('ds+500', 'downshift_rpm', 500),
          ('tch+.05', 'tc_hold', 0.05)],
}

def perturbed(overrides, variant, knob, delta):
    '''Config overrides with one knob moved by delta from the config's value.'''
    ov = dict(overrides)
    if knob:
        base = ov.get(knob, knobs(open(variant or DRIVER).read()).get(knob))
        if base is None: raise KeyError('suite knob %r missing from the driver' % knob)
        v = base + delta
        ov[knob] = int(round(v)) if isinstance(base, int) and float(delta).is_integer() else float('%.12g' % v)
    return ov

def run_suites(configs, suites='123', n=DEFAULT_N, verbose=False, off_pen=5.0, soft_pen=10.0, soft_tp=0.95):
    '''configs: [(name, overrides, variant)]. Returns {name: summary dict} (all runs in one parallel batch).'''
    jobs = []
    for name, ov, var in configs:
        for s in suites:
            for lab, knob, delta in SUITES[s]:
                j = Job('%s s%s_%s' % (name, s, lab), perturbed(ov, var, knob, delta), var)
                j.cfg, j.suite = name, s
                jobs.append(j)
    res = run_batch(jobs, n, verbose=verbose)
    out = {}
    for name, ov, var in configs:
        rs = [(j, m) for j, m in res if j.cfg == name]
        summ = {'runs': rs}
        for s in list(suites) + ['all']:
            sub = [(j, m) for j, m in rs if s == 'all' or j.suite == s]
            on = [m for j, m in sub if m and not m['off']]
            offs = [j.label.split(' ', 1)[1] for j, m in sub if not m or m['off']]
            tps = [m['max_tp'] if m else 9 for j, m in sub]
            mean = sum(m['lap'] for m in on) / len(on) if on else 999.0
            summ[s] = dict(n=len(sub), off=len(offs), offs=offs, mean=mean, max_tp=max(tps),
                           score=mean + off_pen * len(offs) + soft_pen * sum(max(0, t - soft_tp) for t in tps if t <= 1))
        out[name] = summ
    return out

def print_summary(out, suites):
    print('%-14s %-5s %3s %4s %9s %7s %9s  %s' % ('config', 'suite', 'n', 'off', 'mean', 'max|tp|', 'score', 'off runs'))
    for name, summ in out.items():
        for s in list(suites) + ['all']:
            r = summ[s]
            print('%-14s %-5s %3d %4d %9.3f %7.3f %9.3f  %s' % (name, s, r['n'], r['off'], r['mean'], r['max_tp'], r['score'], ','.join(r['offs'])))
        p0 = [m for j, m in summ['runs'] if j.label.endswith('s1_p0')]
        if p0 and p0[0]: print('%-14s p0    %s' % (name, line(p0[0])))

def parse_cfg(s):
    name, _, kv = s.partition(':')
    return name, parse_sets([x for x in kv.split(',') if x])

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--set', action='append', help='knob=value (one config)')
    ap.add_argument('--cfg', action='append', help='NAME:k=v,k=v (repeatable; compares configs)')
    ap.add_argument('--variant', help='driver file instead of snakeoil3_v1.py (applies to all configs)')
    ap.add_argument('--suites', default='123', help='which suites, e.g. 1 or 13 (default 123 = all 30 runs)')
    ap.add_argument('-n', type=int, default=DEFAULT_N, help='parallel races (max 10)')
    ap.add_argument('-v', action='store_true', help='print every run')
    a = ap.parse_args()
    check_no_torcs()
    base = parse_sets(a.set)   # --set applies under every --cfg (it was silently dropped when --cfg was given until v0.82)
    cfgs = [(nm, dict(base, **ov), a.variant) for nm, ov in map(parse_cfg, a.cfg)] if a.cfg else [('cfg', base, a.variant)]
    t0 = time.time()
    out = run_suites(cfgs, a.suites, a.n, a.v)
    print_summary(out, a.suites)
    print('%d races in %.1f s' % (sum(len(s['runs']) for s in out.values()), time.time() - t0))
