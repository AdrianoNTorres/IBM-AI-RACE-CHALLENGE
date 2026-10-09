"""Writes elevation-ref.json, the reference for elevation.js: the height and banking of the track every 10 m
as the driver project's tool works them out (tools/elevation.py on branch main; it follows TORCS's track4.cpp).

That tool is not on this branch, so it is read from main without checking it out:

    git show main:tools/elevation.py > %TEMP%\\elevation_main.py
    python tools/viewer-test/elevation-ref.py %TEMP%\\elevation_main.py

The track file read is this branch's own copy (viewer/tracks/corkscrew.xml).
"""
import importlib.util, json, math, os, sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('elevation_main', sys.argv[1])
el = importlib.util.module_from_spec(spec)
spec.loader.exec_module(el)
xml = os.path.join(here, '..', '..', 'viewer', 'tracks', 'corkscrew.xml')
pts, total, width = el.read_profile(xml)
rows = [[s, round(el.at(pts, s, 1), 4), round(math.degrees(el.at(pts, s, 2)), 4)] for s in range(0, int(total), 10)]
out = {'source': 'tools/elevation.py on main, read_profile() and at()', 'total': round(total, 3), 'width': width,
       'closure': round(pts[-1][1] - pts[0][1], 4), 'rows': rows}
json.dump(out, open(os.path.join(here, 'elevation-ref.json'), 'w'), separators=(',', ':'))
print('%d rows, lap %.2f m, closure %.3f m' % (len(rows), total, out['closure']))
