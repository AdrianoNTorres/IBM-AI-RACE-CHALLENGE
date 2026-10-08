'''Lap result from a telemetry CSV: lap time, top speed, slowest corner,
damage, and whether the car stayed on track.

    python lap_report.py              # newest run in runs/
    python lap_report.py runs/run_20261001_201155.csv

Lap time: if the log has a row after the finish line, its lastLapTime is the
official time. Otherwise the log stops just before the line (< ~1 m), and the
time is the last curLapTime plus the remaining distance at the last speed.
Checked against every lap time the user reported from v0.7 to v0.36
(all within 0.01 s). Times are shown as m:ss:cc, the format the user reads
off the screen (1:28:99 = 1:28.99). The screen truncates to hundredths
(v0.37: TORCS 87.596 s, screen 1:27:59), so the time shown here is truncated
too; since v0.39 the log writes times with 3 decimals so this is exact.'''
import csv, glob, math, os, sys

LAP_LENGTH = 3608.3   # m, largest distFromStart seen before the line wraps to 0

def report(path):
    rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(open(path))]
    lap = [r for r in rows if r['curLapTime'] >= 0 and r['lastLapTime'] == 0]
    after = [r for r in rows if r['lastLapTime'] > 0]
    last = lap[-1]
    finished = bool(after) or last['distFromStart'] > LAP_LENGTH - 5
    if after:
        lap_time = after[0]['lastLapTime']
    elif finished:
        lap_time = last['curLapTime'] + max(0, LAP_LENGTH - last['distFromStart']) / (max(last['speedX'], 1) / 3.6)
    else:
        lap_time = None
    corner = min((r for r in lap if 100 < r['distFromStart'] < 3500), key=lambda r: r['speedX'])
    worst = max(lap, key=lambda r: abs(r['trackPos']))
    damage = max(r['damage'] for r in rows)
    print('Run:          %s' % os.path.basename(path))
    if lap_time is None:
        print('Lap time:     not finished (stopped at %.0f m, %.2f s)' % (last['distFromStart'], last['curLapTime']))
    else:
        shown = math.floor(round(lap_time * 1000)) / 1000   # TORCS time, 3 decimals in logs from v0.39
        cs = int(math.floor(shown * 100 + 1e-6))             # truncated to hundredths, as on screen
        m, s = divmod(cs // 100, 60)
        print('Lap time:     %d:%02d:%02d   (= %d:%02d.%02d, TORCS %.3f s)' % (m, s, cs % 100, m, s, cs % 100, lap_time))
    # Logged to 0.1 km/h; the on-screen value is truncated, so a logged X.0 may show as X-1.
    print('Top speed:    %d km/h   (logged %.1f)' % (int(max(r['speedX'] for r in lap)), max(r['speedX'] for r in lap)))
    print('Min speed:    %.0f km/h  (slowest corner, ~%.0f m)' % (corner['speedX'], corner['distFromStart']))
    print('Damage:       %.0f' % damage)
    print('Max |trackPos|: %.3f at ~%.0f m  -> %s' % (abs(worst['trackPos']), worst['distFromStart'],
          'OFF TRACK (> 1)' if abs(worst['trackPos']) > 1 else 'on track'))

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else sorted(glob.glob(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'runs', '*.csv')))[-1]
    report(path)
