# Track-width use per corner: position at -80 m / slowest point / +80 m (+ = outside of the bend, 1 = edge).
# Usage: python tools/width.py [runs/...csv]  (default: newest run)
import csv, sys, glob
r=[{k:float(v) for k,v in x.items()} for x in csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 else sorted(glob.glob('runs/*.csv'))[-1]))]
r=[x for x in r if x['curLapTime']>=0 and 50<x['distFromStart']<3590]
# corners = local speed minima (over +-120 m) below 200 km/h
mins=[]
for i,x in enumerate(r):
    w=[y['speedX'] for y in r if abs(y['distFromStart']-x['distFromStart'])<120]
    if x['speedX']==min(w) and x['speedX']<200 and (not mins or x['distFromStart']-mins[-1]['distFromStart']>150): mins.append(x)
def at(d): return min(r,key=lambda y:abs(y['distFromStart']-d))
print(' apex m  vmin  side  entry(-80m) apex  exit(+80m)  [+ = outside, - = inside; 1 = edge]  entry v / exit v')
for m in mins:
    d=m['distFromStart']; side=1 if m['steer']>0 else -1   # steer + = left turn -> inside is +trackPos
    f=lambda y: -side*y['trackPos']   # positive = outside of the bend
    e,x=at(d-80),at(d+80)
    print('%6.0f %5.0f %5s   %+.2f      %+.2f   %+.2f            %3.0f / %3.0f'%(d,m['speedX'],'L' if side>0 else 'R',f(e),f(m),f(x),e['speedX'],x['speedX']))
