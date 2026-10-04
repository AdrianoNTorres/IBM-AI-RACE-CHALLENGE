# runs/

One telemetry CSV per driver version, committed to Git. These are the raw data files
the web viewer replays and the tools analyse.

---

## Naming convention

```
run_YYYYMMDD_HHMMSS.csv
```

The timestamp is the wall-clock time the race finished. Example:
`run_20261004_012952.csv` — a lap completed at 01:29:52 on 4 October 2026.

Each committed CSV corresponds to exactly one driver version. The version's entry in
`CHANGELOG.md` names its CSV somewhere in the entry text, which is how the web viewer
links them.

---

## How a CSV is produced

`tools/finalize.py` calls `harness/run_race.py` (TORCS slot 0, port 3001) to run the
official record lap and writes the CSV to this folder. This is the only supported
path for producing a committed CSV — it guarantees the same execution environment as
a manual `python harness/run_race.py` run and keeps the byte-identity check
(`tools/finalize.py --verify`) meaningful.

---

## Columns

### Required

These columns must be present for any tool or the web viewer to use the file.

| Column | Type | Description |
|---|---|---|
| `curLapTime` | float (s) | Time elapsed in the current lap. Rows where this is negative are before the start line and are discarded. |
| `lastLapTime` | float (s) | Official lap time once the car crosses the finish line; 0 before that. Used for the official lap time (preferred over `curLapTime`). |
| `distFromStart` | float (m) | Distance along the track from the start line. Wraps at the start/finish. |
| `speedX` | float (km/h) | Forward speed. |
| `gear` | int | Current gear (1–6). |
| `accel` | float (0–1) | Throttle pedal sent this step. |
| `brake` | float (0–1) | Brake pedal sent this step. |
| `steer` | float (-1 to +1) | Steering sent this step (+ = left). |
| `trackPos` | float | Lateral position (0 = centre, +/-1 = edge, > +/-1 = off the track). |
| `angle` | float (rad) | Yaw of the car relative to the track direction. |
| `damage` | float | Accumulated damage (0 = no damage). |

### Optional

These columns are written by later versions of the driver and unlock additional
features in the viewer and tools. Their absence is handled gracefully.

| Column | Type | Description | Unlocks |
|---|---|---|---|
| `allowed` | float (km/h) | Planned speed computed by the braking plan this step. | Viewer: dashed planned-speed line on the speed chart. |
| `track0`-`track18` | float (m) | The 19 track sensor beam lengths, in the order of `TRACK_ANGLES`. | Viewer: sensor beams drawn on the map. |
| `focA` | float (deg) | Angle at which the focus beams were requested this step. | Viewer: focus rays drawn on the map. |
| `foc0`-`foc4` | float (m) | The five focus beam lengths returned by the server. | Viewer: focus rays drawn on the map. |

---

## Commit policy

- Every version that passes the safety suite and is accepted gets its CSV committed.
- Partial, aborted, or empty runs (from tool experiments) are **not** committed and
  are kept outside the repo (typically in `%TEMP%\torcs_tools\`).
- Untracked CSVs in this folder that the web viewer cannot link to a changelog entry
  are listed as "Other recordings" when using a local folder as the data source.

---

## Tools that read these files

| Tool | What it reads |
|---|---|
| `tools/metrics.py` | Lap time, top speed, slowest corner, watch points, 100 m section times |
| `tools/patterns.py` | Control oscillations, gear hunting, TC cut time |
| `tools/width.py` | Track-width use per corner |
| `tools/tails.py` | 70-run tail analysis and paired comparison |
| `harness/lap_report.py` | Lap summary (same metrics as `metrics.py`, standalone script) |
| `viewer/js/data.js` | All columns; replays on the map, telemetry charts, sector times |
