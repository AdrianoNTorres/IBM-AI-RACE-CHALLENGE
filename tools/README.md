# tools/

Command-line scripts for running, measuring, and tuning the TORCS racing driver.
All scripts are run from the **repo root** and operate on `driver/snakeoil3_v1.py`
without modifying it directly — each race gets a private copy.

## Quick reference

| Task | Command |
|---|---|
| One race (optionally with knob overrides) | `python tools/race.py [--set knob=value ...]` |
| Safety suites — 3×10 perturbation runs | `python tools/suite.py [--set knob=value ...]` |
| Lap metrics from a CSV | `python tools/metrics.py runs/<file>.csv [--sections]` |
| Control-pattern check of a CSV | `python tools/patterns.py [runs/<file>.csv] [--episodes]` |
| Track-width use per corner | `python tools/width.py [runs/<file>.csv]` |
| 70-run tail analysis + paired comparison | `python tools/tails.py --dir %TEMP%\x\cand [--pair %TEMP%\x\base]` |
| Offline racing line from the track's geometry (the driver's `plan_*` table) | `python tools/raceline.py [--limit 0.65] [--zone from:to:limit] [--csv runs/<file>.csv] [--table plan.txt]` |
| Knob search with Optuna | `python tools/opt.py --knob tc_slip=2:3.5 --trials 40 --study tc` |
| Record the chosen version | `python tools/finalize.py [--suite]` |

TORCS must be installed at `C:\torcs\torcs` and must not already be running.
Install `pip install -r tools/requirements.txt` only if you use `opt.py`.

---

## race.py — run one race without touching the driver source

**What it does.** Starts one TORCS race and returns the lap time and telemetry CSV.
Knob values can be overridden on the command line (`--set knob=value`) without editing
`snakeoil3_v1.py`; a different driver file can be supplied with `--variant`. The output
CSV can be saved with `--keep`.

**Where it is used.** Every other tool calls `race.py` internally. It is the core
execution primitive for the entire harness. It is also the first thing to reach for
when you want to try a single knob value by hand.

**Why it exists.** The driver source must never be edited in-place while a tuning
session is underway (edits would corrupt the version log and break byte-identity
checks). `race.py` resolves this by making a temporary private copy of the driver,
substituting the requested knob values into that copy's knob block, and racing the
copy instead. The original file is never touched.

**Implementation.** `race.py` maintains a pool of numbered TORCS slots (scr_server
slots, ports 3002–3010). Each slot has a machine-wide lock file
(`%TEMP%\torcs_tools\slot_N.lock`) so several harness processes can run concurrently
without colliding. A race is launched with `wtorcs -t 1000000` (a 1 s server
patience timeout), which makes parallel runs byte-identical to serial ones. The knob
block in the private copy is rewritten with a regex that matches the `    name=value`
pattern from `drive_example()`'s knob block.

---

## suite.py — the 3×10 perturbation safety suites

**What it does.** Runs three suites of 10 races each (30 total) in parallel. Each run
nudges one knob by a fixed delta from the config's value. Suite 1 includes the
unperturbed run (p0). A run is marked OFF if `|trackPos| > 1`, any damage occurs, or
the lap does not finish. Prints a table: per-suite count of off-track runs, mean lap
time (on-track only), max `|trackPos|`, and a composite score.

**Where it is used.** Before any version is accepted, it must pass the safety standard:
0 of 30 off-track across all three suites. It is also used to compare two configs
side-by-side (`--cfg base: --cfg hi:...`) and as the objective function for `opt.py`.

**Why it exists.** A single fast lap is not enough to accept a change — the car must
stay on track across a range of nearby configurations (the perturbations). If the car
goes off under a small perturbation, the change relies on a knife-edge and is rejected.
The three suites, unchanged since v0.49, define what "safe" means in this project.

**Implementation.** `suite.py` defines `SUITES` as a dict of labelled perturbation
deltas. It builds a list of `Job` objects (one per run) and passes them to
`race.run_batch()`, which schedules them across the slot pool. Results are collected
and printed with pass/fail per suite. `--cfg` creates one job list per config and
interleaves them so both configs race in parallel.

---

## metrics.py — lap metrics from a telemetry CSV

**What it does.** Reads one CSV and prints the lap time, top speed, slowest corner,
max track position and where it occurred, damage, and a set of "watch points" at
specific track sections (kink, flick/Corkscrew entry, hairpin). `--sections` adds a
100 m section breakdown of time spent.

**Where it is used.** Called internally by `finalize.py` and `race.py` to format
per-run output. Also used directly to re-examine any saved CSV:
`python tools/metrics.py runs/run_*.csv`.

**Why it exists.** `lap_report.py` (in `harness/`) does the same job but is a
standalone script. `metrics.py` exposes a `metrics(path)` function that returns a
dict, making the calculations available as a library to all other tools without
subprocess calls.

**Implementation.** Reads the CSV with Python's `csv.DictReader`, discards rows
before the lap start (`curLapTime < 0`), and applies the same lap-time rule as
`lap_report.py` (official `lastLapTime` if a post-line row exists, otherwise
extrapolated from the last `curLapTime` and remaining distance). Watch points are
computed over fixed distance windows hard-coded to the Corkscrew circuit.

---

## patterns.py — control-oscillation check

**What it does.** Reads a CSV and counts control patterns that indicate the driver is
fighting itself: steering reversals and oscillation episodes, racing-line target
switching, sudden jumps in the planned speed, short brake touches, brake↔throttle
swaps, gear hunting (a shift undone within 1 s), and traction-control cut time.
Prints one line per pattern so two versions can be compared at a glance. `--episodes`
lists the exact distances where steering oscillates.

**Where it is used.** Run after a version is accepted to check whether any new control
noise was introduced. Useful for diagnosing a lap that is slower than expected despite
good corner speeds.

**Why it exists.** Many tuning changes that improve the mean lap time also introduce
subtle oscillations that cost time elsewhere. Oscillation is invisible in aggregate
metrics but immediately visible in the pattern counts. The tool gives a fast, textual
signal that something is oscillating before reaching for the full telemetry viewer.

**Implementation.** Parses the CSV row by row, tracking sign changes in `steer`,
`steer_target`, `allowed` (planned speed), and gear. Gear hunting is detected by
checking whether the gear at time `t+1s` reverses the shift at `t`. TC cut time sums
steps where the sent throttle is below the stored throttle (including lift-band steps).

---

## width.py — track-width use per corner

**What it does.** Prints a table of how much of the track width the car uses at each
corner: the lateral position 80 m before the apex, at the apex, and 80 m after it
(positive = outside of the bend, 1.0 = at the edge). Also shows entry and exit speeds.

**Where it is used.** During tuning of `line_offset` and `line_aim_off` to check
whether the car is using the full road or crowding the inside.

**Why it exists.** `trackPos` in the raw CSV is signed relative to the track centre,
not the bend direction. Reading it directly does not tell you whether the car is taking
a wide entry or a tight one. `width.py` reorients the sign per corner so positive
always means "toward the outside of the bend", making the table immediately readable.

**Implementation.** Finds local speed minima (below 200 km/h, at least 150 m apart) as
corner apexes, then samples `trackPos` at ±80 m using a nearest-row lookup. The sign
is flipped based on the steering direction at the apex (`steer > 0` = left turn →
inside is positive `trackPos`).

---

## tails.py — 70-run tail analysis and paired comparison

**What it does.** Runs the full 70-run standard set (30 perturbation runs + 40 runs on
two shifted-base configs: `brake_margin=14` and `line_offset=0.5`) and keeps all CSVs.
Prints three tables: (a) the suite table per group with where each max `|trackPos|`
occurs; (b) per 100 m section: mean, min, median, tail-run count, tail loss, and
correlation with lap time; (c) with `--pair <base>`, the paired per-run lap difference
between a candidate and a base over all 70 runs (mean, SE, faster/slower/identical
counts) and the per-section mean difference. `--reuse` reprints the tables from
previously kept CSVs without re-racing.

**Where it is used.** For judging small changes (< 0.05 s) where the single-lap noise
(SE ~0.01–0.02 s) makes a 30-run suite inconclusive. Also used to localise which
100 m sections of the track are responsible for a speed difference.

**Why it exists.** The 30-run suite tells you whether a change is safe, not whether it
is faster. Noise over 30 runs is high enough that a 0.02 s gain is indistinguishable
from noise. The paired comparison over 70 runs cancels per-run noise almost entirely,
because both configs race the same starting conditions. Tail analysis locates the
sections where occasional bad runs inflate the mean.

**Implementation.** Builds jobs for all three suites plus the two shifted-base configs
and calls `race.run_batch()`, saving each CSV to `--dir`. The section analysis bins the
lap into 100 m windows and computes statistics per bin. The paired comparison zips the
base and candidate CSV lists (sorted by group and label) and computes the per-run
difference before aggregating.

---

## raceline.py — offline racing line from the track's geometry

**What it does.** Computes a whole-lap racing line for the Corkscrew offline and prints the table the
driver embeds (`plan_ds`, `plan_pos`, `plan_curv`, `plan_v` in `drive_example()`'s knob block). No race is
run and nothing is learned on track.

    python tools/raceline.py --geometry                       # segment list with distFromStart, length check
    python tools/raceline.py --csv runs/<lap>.csv --every 25  # line next to a driven lap, every 25 m
    python tools/raceline.py --limit 0.65 --zone 990:1090:0.5 --zone 2940:3030:0.5 --table plan.txt   # v1.11's table

**Where it is used.** Whenever the planned line is changed (v1.11 on): choose the usable half-width
(`--limit`, as |trackPos|; `--zone from:to:limit` for a stretch that needs a different one), write the table
with `--table`, paste its four lines into the driver (or into a `--variant` copy for trials), and judge it
on the 70 runs (`tails.py`). `--csv` prints a lap's driven `trackPos` and speed next to the plan.

**Why it exists.** Since the officials allowed track memory, the line no longer has to be found by the
sensors corner by corner: the beams show a bend 35–150 m ahead, the geometry file knows the whole lap.

**Implementation.** (1) *Geometry:* reads `C:\torcs\torcs\tracks\road\corkscrew\corkscrew.xml` (straights
with length, arcs with radius / end radius / angle) and rebuilds the centre line as TORCS does (`track4.cpp`:
an arc is cut into steps of equal length, `profil steps length`, the radius changing linearly per step).
Check: the rebuilt lap is 3,608.45 m and closes on itself to 0.0 m and 0.00°; distance along it is the
telemetry's `distFromStart`. (2) *Line:* stations every 3 m, each free to move along the track's normal
within the limit; K1999-style smoothing (each point is moved until the path's curvature there is the
length-weighted mean of its neighbours', coarse to fine, 64 stations down to 1), which ends close to the
minimum-curvature line. (3) *Speed:* a point mass with sideways grip 15.5·(1 + 5e-4·v²) m/s² (fitted to our
laps: hairpin, 450 m, 1,528 m) and braking 14 + 0.0065·v² up to 34 m/s², sharing the grip with cornering;
`plan_v` is that limit with no drive limit (a cap for the driver's braking plan). The printed model lap
times only rank lines: they are not the car's lap time, and the "driven line" figure is rough (the log's
`trackPos` has 3 decimals). (4) *Table:* one row every 10 m: trackPos (+1 = left edge), the line's curvature
(1/km, + = left), speed limit (km/h). **Not modelled:** elevation (the crest at ~2,350 m damages the car
above ~255 km/h; the Corkscrew drop), walls at the track's edge (right side at ~2,490 m) and the tyres'
real limits, so the driver uses the table only inside its `plan_zones`.

---

## opt.py — Optuna knob search

**What it does.** Uses the [Optuna](https://optuna.org) framework to search a range of
knob values, scoring each trial on the perturbation suite objective (mean lap time +
penalties for off-track runs and high `|trackPos|`). Supports multi-knob search,
two-stage screening (`--screen S --confirm K`), and resumable studies stored in a local
SQLite database. Trial 0 is always the driver's current values.

**Where it is used.** When a knob has a plausible improvement region but the right value
is not obvious from a single sensitivity run. Particularly useful for pairs of
interacting knobs (e.g. `brake_aero` and `brake_max`) where a 2D sweep by hand would
take too long.

**Why it exists.** Manual sensitivity analysis (nudging one knob at a time via
`suite.py`) covers the space linearly. When two or more knobs interact — a common
situation in the braking and traction-control systems — a grid search is infeasible
and Optuna's tree-structured Parzen estimator converges faster than a random or grid
search.

**Implementation.** Each Optuna trial is converted to a list of `--set` overrides and
passed to `suite.run_suites()`. The objective is `mean_lap + off_pen * offs +
soft_pen * sum(max(0, |tp| - soft_tp))`. Studies persist across runs in
`%TEMP%\torcs_tools\optuna\<study>.db`; `--fresh` deletes the file and starts over.
Requires `pip install -r tools/requirements.txt`.

---

## finalize.py — record the chosen version

**What it does.** Runs the chosen driver with `harness/run_race.py` (slot 0, exactly
as the official record runs), saves the CSV to `runs/`, prints the lap report, and
formats the paste-ready changelog fields (Lap time, Top speed, Min speed, Damage,
Watch points, and the 100 m sections that changed most versus the previous run).
`--suite` also runs the 30-run safety suite. `--verify` reruns and checks that the
result is byte-identical to a previously committed CSV.

**Where it is used.** At the end of every successful version, once the suite has
passed and the lap time and telemetry have been reviewed. It is the handoff step
between "experiment" and "version".

**Why it exists.** The CSV committed to `runs/` must be produced by the same path as
the official lap (`run_race.py`, slot 0, no parallel harness). `finalize.py` enforces
this and automates the otherwise manual process of formatting the changelog fields,
reducing transcription errors.

**Implementation.** Calls `run_race.py` as a subprocess (so the CSV is written by the
same code path as a manual run), then reads the resulting CSV with `metrics()` to
format the fields. The section diff compares against the newest CSV already in `runs/`
(excluding the one just written) using the 100 m section times from `metrics(...,
sections=True)`.

---

## For agents and automation

See [`tools/AGENTS.md`](AGENTS.md) for the full parallel-harness reference: slot
locking, byte-identity guarantees, suite definitions, output-reading guide, and
library usage (`from race import run_batch, Job`).
