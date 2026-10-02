'''Lap metrics from one telemetry CSV (same lap-time method as lap_report.py).

    python tools/metrics.py runs/run_20261002_010817.csv [--sections]

metrics(path) -> dict:
  lap        lap time, s (official lastLapTime if a row past the line exists, else
             last curLapTime + remaining distance at the last speed; None if not finished)
  finished, stop (distFromStart of the last lap row), damage
  top        top speed as the screen shows it (int of max speedX), top_logged
  min_corner, min_corner_at   slowest point with 100 < dist < 3500 (km/h, m)
  max_tp, max_tp_at           max |trackPos| over the lap and where
  off        True if max_tp > 1, damage > 0 or the lap did not finish (a failed run)
  watch points (|speedY| = slide, km/h):
    kink_vy        kink, 2350-2420 m
    flick_tp/vy    flick / Corkscrew entry, 2430-2530 m (max |trackPos|, max slide)
    flick_exit_vy  flick exit, 2484-2520 m
    hp_vmin, hp_tp hairpin 3240-3340 m (min speed, max |trackPos|)
    hp_vy          hairpin exit slide, 3281-3340 m
    other_vy/_at   largest slide elsewhere (100-3500 m outside 2350-2530)
  sections   {100 m section start: time spent, s}
'''
import csv, sys

LAP_LENGTH = 3608.3   # as lap_report.py

def metrics(path):
    rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(open(path))]
    lap = [r for r in rows if r['curLapTime'] >= 0 and r['lastLapTime'] == 0]
    if len(lap) < 2 or not any(100 < r['distFromStart'] < 3500 for r in lap):   # broken/aborted run
        return dict(lap=None, finished=False, stop=lap[-1]['distFromStart'] if lap else 0, damage=max([r['damage'] for r in rows] or [0]),
                    top=0, top_logged=0, min_corner=0, min_corner_at=0, max_tp=9, max_tp_at=0, off=True, kink_vy=0,
                    flick_tp=0, flick_vy=0, flick_exit_vy=0, hp_vmin=0, hp_tp=0, hp_vy=0, other_vy=0, other_vy_at=0, sections={})
    after = [r for r in rows if r['lastLapTime'] > 0]
    last = lap[-1]
    finished = bool(after) or last['distFromStart'] > LAP_LENGTH - 5
    if after: t = after[0]['lastLapTime']
    elif finished: t = last['curLapTime'] + max(0, LAP_LENGTH - last['distFromStart']) / (max(last['speedX'], 1) / 3.6)
    else: t = None
    def win(a, b):
        return [r for r in lap if a <= r['distFromStart'] <= b] or [dict((k, 0.0) for k in lap[0])]
    vy = lambda rs: max(abs(r['speedY']) for r in rs)
    tp = lambda rs: max(abs(r['trackPos']) for r in rs)
    corner = min((r for r in lap if 100 < r['distFromStart'] < 3500), key=lambda r: r['speedX'])
    worst = max(lap, key=lambda r: abs(r['trackPos']))
    oth = [r for r in lap if 100 < r['distFromStart'] < 3500 and not 2350 <= r['distFromStart'] <= 2530]
    vo = max(oth, key=lambda r: abs(r['speedY']))
    damage = max(r['damage'] for r in rows)
    sec = {}
    for a, b in zip(lap, lap[1:]):
        k = int(a['distFromStart'] // 100) * 100
        sec[k] = sec.get(k, 0) + b['curLapTime'] - a['curLapTime']
    top = max(r['speedX'] for r in lap)
    return dict(lap=t, finished=finished, stop=last['distFromStart'], damage=damage,
                top=int(top), top_logged=top, min_corner=corner['speedX'], min_corner_at=corner['distFromStart'],
                max_tp=abs(worst['trackPos']), max_tp_at=worst['distFromStart'],
                off=abs(worst['trackPos']) > 1 or damage > 0 or not finished,
                kink_vy=vy(win(2350, 2420)), flick_tp=tp(win(2430, 2530)), flick_vy=vy(win(2430, 2530)),
                flick_exit_vy=vy(win(2484, 2520)), hp_vmin=min(r['speedX'] for r in win(3240, 3340)),
                hp_tp=tp(win(3240, 3340)), hp_vy=vy(win(3281, 3340)),
                other_vy=abs(vo['speedY']), other_vy_at=vo['distFromStart'], sections=sec)

def line(m):
    '''Compact one-line summary.'''
    if m is None: return 'NO CSV'
    return ('t %7.3f%s dmg %d |tp| %.3f@%-4d%s | flick tp %.3f vy %4.1f exit %4.1f | kink vy %4.1f | hp %4.1f tp %.2f vy %4.1f | other vy %4.1f@%d'
            % (m['lap'] or -1, '' if m['finished'] else ' DNF@%d' % m['stop'], m['damage'], m['max_tp'], m['max_tp_at'],
               ' OFF' if m['off'] else '', m['flick_tp'], m['flick_vy'], m['flick_exit_vy'], m['kink_vy'],
               m['hp_vmin'], m['hp_tp'], m['hp_vy'], m['other_vy'], m['other_vy_at']))

if __name__ == '__main__':
    m = metrics(sys.argv[1])
    print(line(m))
    print('top %d km/h, slowest corner %.0f km/h @ %.0f m' % (m['top'], m['min_corner'], m['min_corner_at']))
    if '--sections' in sys.argv:
        for k, v in sorted(m['sections'].items()): print('%5d %.3f' % (k, v))
