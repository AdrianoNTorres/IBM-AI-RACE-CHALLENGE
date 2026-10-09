# tools/

Command-line scripts for running, measuring, and tuning the TORCS racing driver.
All scripts are run from the **repo root** and operate on `driver/snakeoil3_v1.py`
without modifying it directly — each race gets a private copy.

## Quick reference

| Task | Command |
|---|---|
| **The whole acceptance bar in one call** (70 runs against the base, paired difference, checks, patterns, width) | `python tools/accept.py --out %TEMP%\vNNN [--cand "label[@file.py][: knob=value ...]"] [--base v1.17]` |
| Screen several candidates (12 runs each) or one lap each | `python tools/accept.py --out %TEMP%\vNNN --cand "A@a.py" --cand "B: plan_vs=1.03" --screen` (or `--single`) |
| Trial copy of the driver with exact text edits, spliced table rows or a stretch of the stored speed scaled | `python tools/variant.py %TEMP%\vNNN\a.py --rep "old=>new" [--edits edits.txt] [--plan plan.txt:from:to] [--vscale from:to:factor]` |
| Worst `\|trackPos\|` per place of the lap over folders of runs | `python tools/places.py %TEMP%\vNNN\base %TEMP%\vNNN\A` |
| Two laps side by side at marks (time difference, speed, gear, position, pedals) | `python tools/lapdiff.py %TEMP%\vNNN\base %TEMP%\vNNN\A [from to step]` |
| Every gear change of a lap and its short stints | `python tools/gears.py runs/<file>.csv [--short 1]` |
| Step trace of a run against the planned line | `python tools/trace.py runs/<file>.csv 2200 2640 [step]` |
| **Record a version once** (changelog entry, batch row, ledger rows, run CSV, commit, tag) | `python tools/record.py %TEMP%\vNNN\version.md [--dry-run]` |
| What each sub-agent of a session cost (turns, context, minutes) | `python tools/agentcost.py [--all] [--detail]` |
| Batch-end doc sync: remap the tuning card's driver line numbers and check every knob row | `python tools/cardlines.py [--from v1.17] [--write]` |
| One race (optionally with knob overrides) | `python tools/race.py [--set knob=value ...]` |
| Race cache: size / empty it | `python tools/race.py --cache-info` / `--cache-clear` |
| Safety suites — 3×10 perturbation runs | `python tools/suite.py [--set knob=value ...]` |
| Lap metrics from a CSV | `python tools/metrics.py runs/<file>.csv [--sections]` |
| Control-pattern check of a CSV | `python tools/patterns.py [runs/<file>.csv] [--episodes]` |
| Track-width use per corner | `python tools/width.py [runs/<file>.csv]` |
| 70-run tail analysis + paired comparison | `python tools/tails.py --dir %TEMP%\x\cand [--pair %TEMP%\x\base]` |
| Elevation profile from the track file: height, gradient, vertical curvature, banking, tyre load at the speed driven | `python tools/elevation.py [--csv runs/<file>.csv] [--range from:to] [--table elev.txt]` |
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

**Race cache.** The simulation is deterministic, so a finished race's CSV is stored
(gzip, about 0.25 MB) in `%TEMP%\torcs_tools\cache` under a hash of the exact driver
source that was raced (knob overrides applied) and of the TORCS files that decide the
result (race file, car, track, `scr_server` set-up). Asking for the same race again
copies the CSV from the cache and starts no TORCS: a base's 70 runs cost nothing after
their first run, and a full acceptance run after a screen re-uses the screen's races.
Checked against the committed v1.17 run: raced, cached and `--no-cache` CSVs are byte
for byte the same file. `--no-cache` (or `TORCS_TOOLS_CACHE=0`) races regardless;
`--cache-info` prints the size; `--cache-clear` empties it. The least recently used
entries are dropped beyond 3 GB (`CACHE_MAX`). Raise `CACHE_VERSION` in `race.py` when
the harness changes what a race writes.

---

**Other options.** `--repeat N`: run the same config N times in parallel (a determinism check).

## accept.py — the whole acceptance bar in one call

**What it does.** Runs everything a version is judged on and prints one table: the 70
standard runs of the base and of each candidate, the paired lap difference (30 / 40 /
70 runs, with standard error and faster / slower counts), the largest section
differences, every check in `tools/checks.json` around the candidate's own knob values
(follower check, braking-plan check), the control patterns and the track-width table of
base and candidate, and the bar item by item as PASS / FAIL. `--screen` runs only the 12
screen runs per candidate and prints one line each; `--single` runs one lap each.

    python tools/accept.py --out %TEMP%\v118                               # driver on disk against HEAD's
    python tools/accept.py --out %TEMP%\v118 --cand "A@a.py" --cand "B@a.py: plan_vs=1.03" --screen
    python tools/accept.py --out %TEMP%\v118 --cand "A@a.py" --base v1.17  # full bar for one candidate

A candidate is `label[@driver file][: knob=value ...]` (the file is looked up in `--out`
first). The base is a git revision of the driver (default `HEAD`) or a driver file.

**Where it is used.** By every iteration: `--single` and `--screen` while exploring, the
full run once on the chosen candidate. `tools/record.py` reads its output. The 70 CSVs
are kept in `<out>/base` and `<out>/<label>` under the names `tails.py` uses, so
`python tools/tails.py --dir <out>/<label> --reuse --pair <out>/base` prints the full
tail and section tables from them without racing.

**Why it exists.** The bar had grown to five separate commands per version (70 runs of
the base, 70 of the candidate, pairing, a 200-run follower check, an 80-run braking-plan
check, plus patterns and width), each a model turn, and its exact command lines lived as
prose in `CLAUDE.md`. One call makes the bar executable and the same for every version;
`checks.json` makes adding a knob to a check a one-line change.

**Implementation.** Builds one job list (base, candidates, checks) and passes it to
`race.run_batch()`, so everything shares the four race slots and the race cache.
Standard runs come from `tails.GROUPS` and `suite.SUITES`; a check entry in
`checks.json` (`{"knob": ..., "rel": 0.1}` or `"abs": [5, 10]`) is applied in both
directions around the candidate's value and raced on the listed suites. The bar: 0 of
30 off and 0 damage, 0 of 40 shifted off, every check 0 off, all-30 mean not above the
base's, paired gain over the 70 of at least 2 standard errors. Margin is not judged by
the script: the table shows each group's worst run next to the base's. Writes
`<out>/<label>.accept.json` (full mode) and appends one line per candidate to
`<out>/results.jsonl` (every mode). Exit code 1 if a candidate fails the bar. Checked:
v1.17 against v1.16 reproduces the recorded numbers (all-30 67.460 vs 67.634, paired
−0.177 s, SE 0.007, 69 / 1; follower worst 0.885; braking-plan worst 0.882) in 201 s
for 420 races, and in 18 s with 0 races when repeated.

---

**Other options.** `--no-checks`: the full 70 runs and the pairing, but skip the checks of `checks.json`.

## record.py — record a version once

**What it does.** Turns one short file written by the agent (`version.md`: title,
decision, what changed, why, prediction, learned, variables, alternatives) plus
`accept.py`'s output into the version's whole record: the `docs/CHANGELOG.md` entry in
its usual table format, a row in `docs/batch.md`, rows in `docs/ledger.md`, the run CSV
in `runs/`, the commit and the annotated tag. Every measured number (lap, top speed,
slowest corner, all-30, paired difference, checks, patterns, and each alternative's
screen result) is filled in from `accept.py`'s files. `--dry-run` prints everything and
changes nothing. It never pushes and adds no attribution lines.

**Where it is used.** As the last step of every version, kept or rejected, in place of
writing the changelog entry, the batch row and the commit message by hand. A rejected
version is committed and tagged, then the driver is restored from the previous commit
and that is committed too (working rule 8).

**Why it exists.** The same facts were being written four or five times per version
(changelog entry of 11–22 thousand characters, batch row, commit message, hand-back
report, HANDOFF bullet), and four of five batch-15 agents wrote the changelog entry
twice because a shell heredoc failed. Numbers typed by hand can be mistyped; numbers
copied by a script cannot, which enforces "real measured values only".

**Implementation.** Parses `version.md` (format in the script's docstring; an
alternative is `label | where | what was tried | why it lost`, the label being the one
used with `accept.py`). Before writing anything it runs the driver on disk with
`harness/run_race.py` and requires that CSV to be byte for byte the accepted
candidate's unperturbed run (`<out>/<label>/base_s1_p0.csv`); if not, the driver on
disk is not what was accepted and nothing is recorded. A kept version needs the bar's
PASS; `decision: enabling` needs 0 off and 0 damage. Line endings of the changelog are
kept.

---

## variant.py — a trial copy of the driver

**What it does.** Writes a copy of the driver (from disk, from another file or from a
git revision) with exact text edits applied: `--rep "old=>new"` (the old text must occur
exactly once), `--edits FILE` for multi-line edits written as `<<<<` / old / `====` /
new / `>>>>` blocks, and `--plan plan.txt[:from:to]` to take the `plan_pos` /
`plan_curv` / `plan_v` entries of a `raceline.py --table` file, optionally only inside a
stretch in metres, and `--vscale from:to:factor` (repeatable) to multiply the stored
speed `plan_v` inside a stretch in metres (at most 360 km/h; the entries are printed
before and after).

**Where it is used.** For every trial that changes code or tables and cannot be a
`--set`: the copy is then raced with `accept.py --cand "A@a.py"` or
`race.py --variant`.

**Why it exists.** Each agent had been rebuilding this as `mk.py` / `gen.py` / `g.py`
in its `%TEMP%` folder. The driver itself must never be edited to try something, and a
text edit that silently matches nothing or twice produces a trial of the wrong thing:
the exactly-once rule stops that. Splicing a stretch keeps the rest of the table byte
for byte (a full regeneration moves far-away worst runs chaotically, v1.14). `--vscale`
replaces the `mkU.py` that the agents of v1.18 and v1.19 each wrote.

**Implementation.** Reads the base with its line endings preserved, applies `--plan`,
then `--vscale`, then `--edits`, then `--rep`, and refuses to write over `driver/snakeoil3_v1.py`.

---

## trace.py — a run against the planned line

**What it does.** Prints a step trace of a run CSV between two distances: speed, the
plan's allowed speed, the stored line speed, `trackPos` next to the line's, their
difference, steering, pedals, sideways speed and gear.

**Where it is used.** To see where the car leaves the planned line or its speed (for
example the Corkscrew's left apex), before and after a change.

**Why it exists.** Replaces the `tr.py` each agent copied from the previous agent's
`%TEMP%` folder.

**Implementation.** Reads the plan tables from the driver file (`--driver` for a
variant) and interpolates them at each row's `distFromStart`, as the driver does.

---

## places.py — worst edge use per place

**What it does.** For each folder of run CSVs (or single CSV) given, prints one line:
the number of runs and the largest `|trackPos|` any of them reached in each of 17
places of the lap (start kink, 446 m, the exits of 770 m / 1,042 m / 1,528 m, the
1,931 m apex and exit, flick, the Corkscrew's wall, 2,700 m apex and exit, 2,988 m and
its exit, hairpin and its exit). A name ending in `x` is an exit.

**Where it is used.** After a screen or a perturbed screen (`plan_vd` ±10, `plan_vs`
1.04), to see which place a candidate moved: `python tools/places.py
%TEMP%\vNNN\base %TEMP%\vNNN\A`. `accept.py` keeps each label's runs in
`<out>\<label>\`.

**Why it exists.** `accept.py` prints only each group's single worst run, so a place
that moves from 0.67 to 0.85 behind a worst run of 0.88 elsewhere is invisible (the
2,700 m exit at v1.22). The agents of v1.19 (`win.py`) and v1.22 (`places.py`) each
wrote this in their trial folder.

**Implementation.** Reads every `*.csv` of a folder, rows with `curLapTime` ≥ 0; the
places are the `PLACES` table at the top of the script (name, from m, to m): edit it
when a new margin place appears.

---

## lapdiff.py — two laps side by side

**What it does.** Prints, at distance marks (every 50 m, or `from to step`), the time
difference of lap B against lap A since the start line (negative = B ahead) and, for
each lap, speed, gear, `trackPos`, throttle sent and brake, plus B's rpm reading.

**Where it is used.** To find where a single-lap or screen difference is made and what
the car does differently there, before reading a full step trace with `trace.py`:
`python tools/lapdiff.py %TEMP%\vNNN\base %TEMP%\vNNN\A 2600 2900 10`.

**Why it exists.** `accept.py` gives the largest per-100 m section differences but not
the speeds, gears and positions behind them; v1.20 (`sec.py`), v1.21 (`lt.py`) and
v1.22 (`cmp.py`) each rebuilt a version of this.

**Implementation.** Each argument is a run CSV or a folder of `accept.py` runs (the
unperturbed lap `*s1_p0.csv` is taken). Values are interpolated linearly at each mark;
the lap ends at the second crossing of the line.

---

## gears.py — every gear change of a lap

**What it does.** Lists every gear change of a lap (from>to@metres/lap time/km/h) and
the stints, the time spent in a gear between two changes, shorter than `--short`
seconds (default 1).

**Where it is used.** For any change to the shift rules (`upshift_rpm`,
`downshift_rpm`, `drive_ds_rpm`, `drive_ds_wait`, the clutch): which shifts were added
or lost and where the short stints are. `patterns.py` only counts shifts and those
undone within 1 s.

**Why it exists.** Written by v1.22's agent to find the 4-3-2 double downshift in the
2,700 m bend and the short lower-gear stints at 1,045 m, 1,533 m and 1,927 m, which are
an open Pattern watch item.

**Implementation.** Each argument is a run CSV or a folder of `accept.py` runs
(`*s1_p0.csv`); rows with `curLapTime` ≥ 0; a change is any row whose `gear` differs
from the row before.

---

## agentcost.py — what a session's agents cost

**What it does.** Reads a Claude Code session's transcripts and prints per sub-agent
and for the orchestrator: turns, context at the first and largest turn, the context
summed over all turns ("processed" tokens), wall minutes, minutes waiting for tools
(races), minutes of model time and the model it ran on. Below the table, "by model" adds
up every agent and the orchestrator per model (agents, turns, tokens processed): the
figure to watch against the plan's limit, Opus first. `--all` prints one line per session; `--detail` adds
tool calls, files read and characters written. Times are UTC.

**Where it is used.** By the orchestrator at batch end, for the batch's cost line, and
to check whether a workflow change lowered the cost.

**Why it exists.** Every turn reads the whole context again, so a version costs turns
× context; the figure reported when an agent ends is only its last context size, and
the minutes agents reported themselves did not match the transcripts.

**Implementation.** Parses `~/.claude/projects/<project>/<session>/subagents/*.jsonl`:
one usage record per model message, tool waits from the timestamps of each call and
its result.

---

## cardlines.py — the tuning card's line numbers after the driver changed

**What it does.** With `--from <tag>` it maps every line of that tag's driver to its
line in the working driver and rewrites the tuning card's line references: the "Line"
column of each knob row and the numbers after "line", "lines", "comment" and "code" in
the text (ranges and "N and M" too). Without `--write` it only prints what would
change. It then checks, with or without `--from`, that each row named after a knob
points at the line where the driver assigns that knob (for a range: that the range
contains it) and prints every mismatch; exit code 1 if there is one.

**Where it is used.** By the orchestrator at the batch-end doc sync
(`docs/batch.md`, step 1): once with `--from <the previous batch's tag> --write`
before the new rows are written, once without arguments after.

**Why it exists.** A batch moves the knob block and the code by tens of lines (batch
16: +14 to +70), and the card holds about 230 line references. The remap was a
one-off script at the batch 15 sync and was needed again at the batch 16 sync.

**Implementation.** `git show <tag>:driver/snakeoil3_v1.py` against the working file
through `difflib.SequenceMatcher`; a line inside a changed block maps to the same
share of the way through the new block. References written in another form (for
example "with `plan_pos` 784") are not found: grep the card for the old numbers of
anything the batch touched. New rows and changed values are written by hand.

---

**Other options.** `--card FILE`: another card than `docs/tuning-card.md`.

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

**Other options.** `--no-sections`: skip the section table.

## raceline.py — offline racing line from the track's geometry

**What it does.** Computes a whole-lap racing line for the Corkscrew offline and prints the table the
driver embeds (`plan_ds`, `plan_pos`, `plan_curv`, `plan_v` in `drive_example()`'s knob block). No race is
run and nothing is learned on track.

    python tools/raceline.py --geometry                       # segment list with distFromStart, length check
    python tools/raceline.py --csv runs/<lap>.csv --every 25  # line next to a driven lap, every 25 m
    python tools/raceline.py --limit 0.65 --zone 990:1090:0.5 --zone 2940:3030:0.5 --table plan.txt   # v1.11's table

Speed options (v1.15–v1.16, all repeatable): `--vcap from:to:km/h` caps the line's speed
in a stretch (a known brake point: the crest at 2,335–2,360 m is capped at 230);
`--vscale from:to:factor` scales the cornering speed in a stretch; `--bscale
from:to:factor` scales the braking deceleration into it. Splice the result into the
driver per stretch with `tools/variant.py --plan plan.txt:from:to`.

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

**Other options.** `--ds M`: station spacing for the optimiser (default 3 m); `--spacing M`: spacing of the printed table (default 10 m); `--grip` / `--grip-aero`: sideways grip at low speed and its rise per (m/s)^2 (defaults 15.5 m/s^2 and 5e-4, fitted to our laps); `--brake`: most braking deceleration (default 34 m/s^2).

## elevation.py — the track's elevation profile from the track file

**What it does.** Rebuilds the height of the Corkscrew's centre line by `distFromStart` offline and prints,
per 10 m, the height, the gradient, the vertical curvature and the banking; with a driven lap, also what they
do to the car at the speed it had there. No race is run.

    python tools/elevation.py                                       # extremes of height, gradient, curvature
    python tools/elevation.py --csv runs/<lap>.csv                  # rows where the tyre load or the slope is large
    python tools/elevation.py --csv runs/<lap>.csv --range 2300:2620   # every row of a stretch
    python tools/elevation.py --table elev.txt                      # `plan_z` / `plan_kv` tables, one entry per 10 m

Columns: `z` (m), `grade%` (+ = uphill), `kv 1/km` (+ = compression, − = crest), `bank` (degrees, + = left
side high); with `--csv`: `km/h`, `load` = 1 + kv·v²/g (the share of the car's weight on the tyres),
`dgrip%` = kv·v²/(g + 0.005·v²) (the change of the whole tyre load, downforce counted; `--aero` changes the
0.005) and `dbrake` = g·grade (m/s², + = the slope helps braking). `--load` and `--grade` set which rows the
short list shows; `--smooth` is the length the curvature is taken over (30 m).

**Where it is used.** Before changing the stored speed (`plan_v`) or a corner row at a place: look up whether
the car is light or heavy there and how steep the road is. v1.30 used it to move the braking for the flick
into the compression at 2,335–2,358 m.

**Why it exists.** `raceline.py` models a flat track, and until v1.30 the only elevation knowledge was a
hand-set cap at "the crest" and hand-tuned Corkscrew entries. The user allowed the elevation to be memorised
(2026-10-08). The profile showed that the crest at 2,351 m is a compression (where the car bottoms and is
damaged) followed by a crest at 2,365–2,385 m.

**Implementation.** Reads `C:\torcs\torcs\tracks\road\corkscrew\corkscrew.xml` and follows `track4.cpp`:
a segment starts at the previous one's end height and ends at `z end` or start + length × `grade`; it is cut
into profile steps (`profil steps length`), whose end heights lie on a cubic spline (`TrackSpline`) with the
previous segment's end tangent and this segment's `profil end tangent`; banking runs linearly from
`banking start` to `banking end`. Check: the lap is 3,608.45 m, the height runs from −2.6 m (3,390 m) to
46.5 m (2,410 m) and closes to 0.00 m. The road between step ends is flat-faced, so the curvature is the
change of the mean gradient over 15 m behind and ahead. `load` and `dgrip` use the speed of the first log row
in each 10 m of the lap. Downforce per unit mass 0.005 m/s² per (m/s)² is from the car file (two wings
4·1.23·area·sin(angle) = 1.83, ground effect about 1.4 N per (m/s)², 650 kg). **Not in it:** the kinks at the
step joints (4–8 m apart), which the car feels as bumps, and the side slope across the road apart from the
banking column.

---

**Other options.** `--step M`: row spacing in metres (default 10).

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

**Other options.** `--batch N`: trials raced at once (default about 30 races per batch); `--seed N`: the sampler's seed (default 0).

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

## sitedata.py — the presentation website's data file

**What it does.** Writes `site/data.json`, the one data file `site/index.html` reads:
a summary (best lap, first lap, counts of kept / enabling / rejected versions, the
judged lap's top speed and largest `|trackPos|`), one row per version for the chart
(all 133: lap, decision, batch, plain-language title), one row per batch (versions,
best lap before and after, theme), the six rule questions with their fallback
versions, and the number and dates of the IBM Bob sessions. `--check` writes nothing
and exits 1 if the file on disk differs from what would be written.

**Where it is used.** By whoever changes the presentation website or its sources:
`python tools/sitedata.py`, then commit `site/data.json`. It needs the local,
untracked sources (`project-stats.csv`, `docs/presentation/`), so it runs on the
project machine, not in a GitHub workflow.

**Why it exists.** The website is published from Git, and its sources are not in Git.
One generated, committed file keeps every number on the page taken from the tools'
output instead of typed.

**Implementation.** Reads `project-stats.csv` for the version rows and
`docs/presentation/vX.Y.json` for `title_plain`; `batch-NN.json` for the batches;
`manual/rules.json` for the rule questions (a status starting with "confirmed" is
shown as confirmed by the officials, anything else as our reading; the fallback's lap
comes from the version rows); `index/bob-tasks.jsonl` for the Bob sessions. Laps are
shown as `m:ss.cc`. The summary's judged-lap values come from the best version's
`result`.

## For agents and automation

See [`tools/AGENTS.md`](AGENTS.md) for the full parallel-harness reference: slot
locking, byte-identity guarantees, suite definitions, output-reading guide, and
library usage (`from race import run_batch, Job`).
