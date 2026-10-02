'''Optuna search over driver knobs, scored on the perturbation suites.

    python tools/opt.py --knob brake_aero=0.005:0.008 --knob brake_max=24:34 --trials 40
    python tools/opt.py --knob tc_slip=2:3.5 --screen 1 --confirm 5 --trials 60 --study tc
    python tools/opt.py --variant my_driver.py --knob my_gain=0:2 --set corner_speed=76

--knob name=lo:hi[:step]   range (ints if lo, hi and step are all ints; step optional)
--suites                   suites the score is taken over (default 123 = all 30 runs)
--screen S --confirm K     cheap objective on suites S (e.g. 1 = 10 runs), then the top K
                           trials (plus the baseline) are re-run on --suites and ranked
Score = mean lap (on-track runs) + --off-pen s per off-track run (default 5)
        + --soft-pen s per unit of |trackPos| above --soft-tp in each run (default 10, 0.95).
Trial 0 is always the driver's current values (the baseline). Several trials are raced
in one parallel batch (--batch, default ~30 races per batch). The study is stored in
%TEMP%/torcs_tools/optuna/<study>.db, so re-running the same command resumes it
(--fresh starts over). Requires optuna (tools/requirements.txt).
'''
import argparse, math, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import optuna
from race import knobs, parse_sets, check_no_torcs, DRIVER, DEFAULT_N, WORK
from suite import SUITES, run_suites

def parse_knob(s):
    name, rng = s.split('=', 1)
    parts = [eval(x, {}) for x in rng.split(':')]
    lo, hi, step = parts[0], parts[1], (parts[2] if len(parts) > 2 else None)
    is_int = all(isinstance(x, int) for x in parts)
    return name.strip(), lo, hi, step, is_int

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--knob', action='append', required=True)
    ap.add_argument('--set', action='append', help='fixed knob=value overrides for every trial')
    ap.add_argument('--variant')
    ap.add_argument('--suites', default='123')
    ap.add_argument('--screen', help='cheap suites for the search, e.g. 1')
    ap.add_argument('--confirm', type=int, default=5, help='top-k re-run on --suites after a --screen search')
    ap.add_argument('--trials', type=int, default=30, help='new trials to run this call')
    ap.add_argument('--batch', type=int, default=0, help='trials raced at once (default ~30 races per batch)')
    ap.add_argument('--study', default='study')
    ap.add_argument('--fresh', action='store_true')
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--off-pen', type=float, default=5.0)
    ap.add_argument('--soft-pen', type=float, default=10.0)
    ap.add_argument('--soft-tp', type=float, default=0.95)
    ap.add_argument('-n', type=int, default=DEFAULT_N)
    a = ap.parse_args()
    check_no_torcs()
    fixed = parse_sets(a.set)
    space = [parse_knob(k) for k in a.knob]
    names = [k[0] for k in space]
    cur = knobs(open(a.variant or DRIVER).read())
    for nm in names:
        if nm not in cur: sys.exit('knob %r not in the driver' % nm)
    search = a.screen or a.suites
    per_trial = sum(len(SUITES[s]) for s in search)
    batch = a.batch or max(1, round(30 / per_trial))
    pen = dict(off_pen=a.off_pen, soft_pen=a.soft_pen, soft_tp=a.soft_tp)

    os.makedirs(os.path.join(WORK, 'optuna'), exist_ok=True)
    db = os.path.join(WORK, 'optuna', a.study + '.db')
    if a.fresh and os.path.exists(db): os.remove(db)
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(study_name=a.study, storage='sqlite:///' + db.replace('\\', '/'), load_if_exists=True,
                                direction='minimize', sampler=optuna.samplers.TPESampler(seed=a.seed, constant_liar=True))
    if not study.trials:
        study.enqueue_trial({nm: fixed.get(nm, cur[nm]) for nm in names}, user_attrs={'baseline': True})
    print('study %s (%s), %d races/trial on suites %s, %d trials/batch, db %s' % (a.study, ', '.join(names), per_trial, search, batch, db))
    hdr = ' '.join('%12s' % nm[:12] for nm in names)
    print('%5s %s %9s %9s %4s %7s %6s' % ('trial', hdr, 'score', 'mean', 'off', 'max|tp|', 'best'))
    t0, done = time.time(), 0
    while done < a.trials:
        trials = [study.ask() for _ in range(min(batch, a.trials - done))]
        cfgs = []
        for tr in trials:
            ov = dict(fixed)
            for nm, lo, hi, step, is_int in space:
                ov[nm] = tr.suggest_int(nm, lo, hi, step=step or 1) if is_int else tr.suggest_float(nm, lo, hi, step=step)
            cfgs.append(('t%d' % tr.number, ov, a.variant))
        out = run_suites(cfgs, search, a.n, **pen)
        for tr, (nm, ov, var) in zip(trials, cfgs):
            r = out[nm]['all']
            for k in ('mean', 'off', 'max_tp'): tr.set_user_attr(k, r[k])
            study.tell(tr, r['score'])
            best = study.best_trial.number == tr.number
            print('%5d %s %9.3f %9.3f %4d %7.3f %6s' % (tr.number, ' '.join('%12.6g' % tr.params[n] for n in names),
                  r['score'], r['mean'], r['off'], r['max_tp'], '*' if best else ''), flush=True)
        done += len(trials)
    dt = time.time() - t0
    print('%d trials in %.1f s = %.1f trials/min (%d races, %.2f s/race)' % (done, dt, 60 * done / dt, done * per_trial, dt / max(1, done * per_trial)))

    ok = [t for t in study.trials if t.value is not None]
    ok.sort(key=lambda t: t.value)
    if a.screen and a.screen != a.suites:
        base = [t for t in ok if t.user_attrs.get('baseline')]
        top = ok[:a.confirm] + [t for t in base if t not in ok[:a.confirm]]
        print('\nconfirming top %d (+ baseline) on suites %s' % (a.confirm, a.suites))
        cfgs = [('t%d' % t.number, dict(fixed, **t.params), a.variant) for t in top]
        out = run_suites(cfgs, a.suites, a.n, **pen)
        rows = sorted(((out[c[0]]['all'], c) for c in cfgs), key=lambda x: x[0]['score'])
        print('%5s %s %9s %9s %4s %7s  per-suite means' % ('trial', hdr, 'score', 'mean', 'off', 'max|tp|'))
        for r, (nm, ov, var) in rows:
            print('%5s %s %9.3f %9.3f %4d %7.3f  %s' % (nm[1:], ' '.join('%12.6g' % ov[n] for n in names), r['score'], r['mean'],
                  r['off'], r['max_tp'], '/'.join('%.3f' % out[nm][s]['mean'] for s in a.suites)))
    else:
        print('\nbest 5:')
        for t in ok[:5]:
            print('%5d %s %9.3f %9.3f %4d %7.3f%s' % (t.number, ' '.join('%12.6g' % t.params[n] for n in names), t.value,
                  t.user_attrs['mean'], t.user_attrs['off'], t.user_attrs['max_tp'], '  (baseline)' if t.user_attrs.get('baseline') else ''))

if __name__ == '__main__':
    main()
