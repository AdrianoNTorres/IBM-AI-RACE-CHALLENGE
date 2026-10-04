# Run viewer

A browser page for looking at the driver's recorded laps: every version's lap replayed on a 2D map of the Corkscrew track, with the car's sensor beams, the line it drove, rankings of the versions and telemetry charts.

It only reads files. It does not start TORCS and does not change the driver.

## Quick start

From the repository root:

```
python tools/run_viewer/build.py
```

Then open `tools/run_viewer/index.html` in a browser (double-click it). Run `build.py` again whenever a new version has been recorded.

The build takes about a minute and needs only the Python standard library. It needs the TORCS track file at `C:\torcs\torcs\tracks\road\corkscrew\corkscrew.xml`; pass `--track <path>` if TORCS is installed elsewhere.

## What the page shows

The page has three tabs and a Simple / Advanced switch in the top right corner.

**Versions.** A lap-time chart across all versions and a table of them. The buttons above the table switch between all versions, the 10 fastest laps, the 10 biggest gains, the 10 biggest losses and the 10 highest top speeds.

- **Selecting runs:** click a version to select it. To compare several (up to six), drag across the rows, or hold Shift and click to select everything between two rows, or hold Ctrl and click to add or remove a single one. Each selected run gets its own colour, shown as a bar at the left of its row, in the bar at the top and everywhere else. The run clicked first is the car in focus (the reference): the map follows it and time gaps are measured against it.
- **Details:** the panel on the right shows what the last clicked version changed, why, and what was decided. The buttons there replay it on the track, add or remove it from the comparison, make it the reference, or open its telemetry.
- **Chart colours:** green dot = kept and a new best lap; amber dot = kept but not a new best; green ring = rejected although its single lap was faster; grey ring = rejected. The grey step line is the best kept lap so far. Selected runs are ringed in their colour. Pointing at a dot shows the difference to the best lap before it.

**Track.** The replay. The car's path is coloured by speed (red slowest, green fastest) and each sensor beam is coloured by its length (red close, green far), with a dot where it meets the edge of the road.

- Drag to pan, mouse wheel to zoom, double-click to return to the car. Dragging takes over the camera: "Follow car", "Keep all cars in view" and "Car points up" switch off and the view stays exactly where it was. Zooming does not switch anything off: while following, it zooms around the car. While "Keep all cars in view" is on, zoom is automatic and the wheel and zoom keys do nothing. A "Closest zoom" slider appears in that mode: it sets how far the view may zoom in when the cars are close together (1 to 40 pixels per metre, 10 by default). "Back to the car" switches them on again.
- Space plays and pauses. The left and right arrow keys move one step; holding one plays at 0.1x, then 0.25x, then 0.5x.
- Simple mode has switches for the beams, the path, the distance marks, "Follow car" and "Car points up".
- In Advanced mode the panel on the right is grouped into Camera, Track, Car and path, Sensors, Compared runs and Panels. Every layer has a switch, a one-line description and an opacity slider; "Restore the default layers" undoes all changes.
- Compared runs appear as cars and thin lines in their own colours.
- The cars are drawn as car1-ow1, the open-wheel car the driver runs, to scale from its TORCS file; the front wheels turn with the recorded steering.
- **Focus:** when several runs are selected, a Cars table at the top of the side panel lists them with lap time, gap and speed, and highlights the one in focus. Click a row there, a car on the map, or a name in the top bar to put that car in focus. The camera, the beams, the readout and the speed-coloured line then belong to it, at the same lap time.
- **Keep all cars in view:** with two or more runs selected, this camera option moves and zooms the map so every car stays on screen. It works with "Car points up" on (the view turns with the car in focus) or off (fixed map).

**Telemetry.** A summary of the selected run (and the compared one), charts along the lap, and in Advanced mode a table of 100 m sections. Wheel zooms the distance axis, drag pans, click moves the car to that point.

**Simple and Advanced.** Simple uses plain-language descriptions from `CHANGELOG-simple.md`, fewer numbers and short explanations. Advanced shows the technical titles from `CHANGELOG.md`, all channels and all controls. The choice is remembered by the browser.

## Where the data comes from

| Shown | Source |
|---|---|
| Version list, lap times, top speed, slowest corner, kept / rejected | `CHANGELOG.md` |
| Plain-language titles and texts | `CHANGELOG-simple.md` |
| Replays and charts | the run CSV each changelog entry names, in `runs/` |
| Track outline | the TORCS track file, built with the same arithmetic TORCS uses |

"Gain" and "loss" compare a version's lap time with the last kept version before it. "Against the best before it" compares it with the fastest kept lap up to that point.

Versions v0.1 to v0.6 have no recording. Versions v0.7 to v0.23 recorded the car's path but not its sensors, so they replay without beams. From v0.24 on the beams are shown; the focus rays appear from v1.04.

## Files

| File | Role |
|---|---|
| `build.py` | Reads the changelogs, the run CSVs and the track file; writes `data/`. |
| `index.html`, `viewer.css`, `viewer.js` | The page. Static; they do not need rebuilding. |
| `data/` | Generated: `index.js` (track and version list) and one `.js` file per run, loaded only when that run is opened. About 60 MB. **Not in Git** (`.gitignore`); rebuild it with `build.py`. |

## Adding a run that is not a version

Pass CSV files to the build, optionally with a name:

```
python tools/run_viewer/build.py "manual lap=runs/run_20261003_221413.csv"
```

They appear at the top of the "All versions" list as extra runs.

## Opening the page in a particular state

Options can be added to the address after `#`, joined with `&`:

| Option | Effect |
|---|---|
| `tab=pv`, `tab=pm`, `tab=pt` | open the Versions, Track or Telemetry tab |
| `run=v1.05` | select that run |
| `cmp=v1.01,v0.96` | compare with those runs (comma-separated) |
| `frame=1539` | pause on that frame |
| `mode=simple`, `mode=adv` | choose the mode |
| `all` | keep all selected cars in view |
| `fixed` | fixed map instead of "Car points up" |
| `zoom=12` | start at that zoom, in pixels per metre |
| `list=fast`, `gain`, `loss`, `top` | choose the ranking on the Versions tab |

Example: `index.html#tab=pm&run=v1.05&cmp=v0.96&frame=2440&mode=adv`

## Adding a map feature

Map features are entries in the `LAYERS` list in `viewer.js`. Each entry has an id, a group (`g`, the heading it appears under), a label, a one-line description (`d`), a default on/off state, a default opacity and a `draw(ctx, zoom)` function that draws in track coordinates (metres). A new entry gets its switch and opacity slider in the Advanced panel automatically. If the feature needs a new telemetry column, add it to `load_run` in `build.py`.

## Accuracy

The rebuilt track is 3,608.5 m long and closes on itself to within 0.01 m. The ends of the recorded beams land on the drawn track edge to within about half a metre (the edge is drawn every 2 m). The car's position comes from the recorded distance along the track, its sideways position and its angle to the track.
