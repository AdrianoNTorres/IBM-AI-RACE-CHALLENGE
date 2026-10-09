# TORCS Racing Driver

A rule-based AI racing driver for the [TORCS](http://torcs.org) simulator, hand-tuned over 133 recorded versions on the Corkscrew circuit. No neural nets — all control logic is explicit physics, braking plans, and track memory (a racing line and its speed computed offline from the track's geometry, followed with live sensor feedback).

**Best lap:** v1.33 · **1:05.56** · zero damage · 0 of 30 safety runs off-track · run `runs/run_20261008_223916.csv`

---

## Project overview

Entry for **AI Racing League – Go FullSpeed with IBM Bob** by **One Qubit Racing** (Adriano Torres, solo).

- Presentation: https://adrianontorres.github.io/IBM-AI-RACE-CHALLENGE/
- Run viewer (replay any version's lap): https://adrianontorres.github.io/IBM-AI-RACE-CHALLENGE/viewer/

The car drives one lap of the Corkscrew from a standing start. The first completed lap took 2:43.38 (v0.2); the submitted lap takes 1:05.56 (v1.33) with zero damage and the car's centre never past the track edge.

## Tools used

TORCS (the simulator, with the `scr_server` robot), Python 3, VS Code, IBM Bob (analysis, planning, review, repository documentation) and Claude Code (the driver's code and the test harness). Git: one tag per version.

## Baseline and final driver

| | File | Result |
|---|---|---|
| Baseline, as supplied and never edited | `driver/snakeoil3_gym.py` | Aims for 300 km/h, does not brake, crashes on the first lap (v0.1) |
| Final driver | `driver/snakeoil3_v1.py` | 1:05.56, zero damage (v1.33) |

There is one driver file. Earlier versions are not kept as copies: each is a Git tag (`git checkout v0.42 -- driver/snakeoil3_v1.py`).

## One change at a time

Every version changes one mechanism, is measured, and is recorded in [`docs/CHANGELOG.md`](docs/CHANGELOG.md): what changed, why, the prediction, the measured lap, damage, and what was learned. Of 133 versions, 100 were kept, 11 were kept as groundwork for a later gain and 22 were rejected. Every setting is listed in [`docs/tuning-card.md`](docs/tuning-card.md).

## How IBM Bob was used

- **Ask.** Bob's first task was to open the supplied driver, find the function that makes the driving decisions, and list every sensor it reads and every action it sets.
- **Plan.** From that, Bob wrote the first tuning card and the changelog format used for all 133 versions. After 72 versions it produced an independent analysis with three specialists (race engineer, racing driver, data analyst) and a ranked plan, and later the hand-off plan and the brief for running agents in parallel.
- **Code.** Bob restructured the repository, wrote the READMEs and built the first hosted phases of the run viewer. Its direct edits to the driver's control code were less dependable, so the driver's code was written with Claude Code, one measured version at a time.
- **Review.** Bob reviewed the run viewer from four points of view (race engineer, driver, data analyst, first-time visitor), and its analysis served as a second opinion on the work in progress. The two of its suggestions that were measured (v0.73, v0.74) were rejected, and are recorded like every other result.

## How it was tested in TORCS

The simulation is deterministic: the same driver file gives the same telemetry CSV byte for byte. A harness (`tools/`) runs up to four simulators at once. In the final versions a candidate had to pass, with zero damage and no lap off the track: 70 laps with its settings nudged (compared run by run against the previous version) and 660 check laps around its own new values. Lap time, damage, top speed and the largest `|trackPos|` are read from each run's CSV in `runs/`.

## What worked

- Finishing first: lowering the target speed to complete a lap (v0.2), then adding braking, steering and a racing line in small steps.
- Measuring every change on many perturbed laps instead of one, so a gain that only works on a lucky lap is not kept.
- A racing line and its speed computed in advance from the track's geometry, followed with live corrections (v1.11 onward): 1:12.54 to 1:07.40 in seven versions.
- Watching laps in the run viewer: the last half second came from road the car was visibly not using.

## What did not work

- Sensors alone could not set the car up wide for a corner it had not yet seen: the lap stalled near 1:13.6 and four of five versions in batch 12 were rejected.
- Running several agents in parallel (batch 9): gains that passed alone failed together.
- More speed without more margin: several faster settings left the track on perturbed laps and were rejected.
- Letting the car slide: every setting that allowed more slip was slower.

## What I learned

- Ask about the rules early. Track memory was held back for 105 versions until the officials confirmed it was allowed.
- Record rejections as carefully as gains; they stop the same idea from being tried twice.
- State openly what a result relies on, and name the version to submit instead if it is ruled out.

---

## Quick start

**Requires:** TORCS installed at `C:\torcs\torcs`, Python 3.

Run one lap and print the result:

```
python harness/run_race.py
```

TORCS must not already be running. The script starts it headlessly (Windows: `wtorcs.exe -r config/raceman/practice.xml`, set up for the Corkscrew, 1 lap, `scr_server` slot 0), drives one lap, and prints the lap time, top speed, slowest corner, damage, and max track position. The lap is deterministic: the same driver file gives the same telemetry CSV byte for byte (`python tools/finalize.py --verify runs/run_20261008_223916.csv`).

To drive it yourself, start a TORCS race with an `scr_server` car on port 3001, then run `python driver/snakeoil3_v1.py`. The driver waits for the server and never starts TORCS itself.

---

## Open the lap viewer

The run viewer is a static website — no server needed.

```
viewer/index.html   ← double-click to open in a browser
```

Or serve locally for full functionality:

```
python -m http.server 8000
```

Then open `http://localhost:8000/viewer/`.

It is also online at https://adrianontorres.github.io/IBM-AI-RACE-CHALLENGE/viewer/. The viewer reads live data from this GitHub repository by default. It shows all versions' lap times, replays any lap on a 2D map with sensor beams, and compares telemetry between runs.

---

## Repository layout

```
driver/         snakeoil3_v1.py — the final driver; snakeoil3_gym.py — the supplied baseline
harness/        run_race.py — run one race; lap_report.py — read a CSV
tools/          parallel race harness, perturbation suites, Optuna optimiser
site/           the presentation website (published at the address above)
viewer/         the run viewer, a static website (open index.html in a browser)
.github/        the workflow that publishes site/ and viewer/ on GitHub Pages
docs/           CHANGELOG.md, improvement plan, tuning card, history
runs/           telemetry CSVs — one per version, committed to git
```

---

## Advanced tooling

```bash
python tools/race.py                         # one race (or --set knob=val)
python tools/suite.py                        # 3×10 perturbation safety suites
python tools/opt.py --knob tc_slip=2:3.5     # Optuna knob search
python tools/metrics.py runs/run_*.csv       # lap metrics from CSV
python tools/tails.py --dir %TEMP%\x\cand   # per-section tail analysis
```

See `tools/README.md` for the full reference.

---

## Experiment log

Every version is documented in [`docs/CHANGELOG.md`](docs/CHANGELOG.md) with the change, why, what was observed, and the decision. Plain-language summaries are in [`docs/CHANGELOG-simple.md`](docs/CHANGELOG-simple.md).

Version highlights:

| Version | Lap time | Mechanism |
|---|---|---|
| v0.1 | DNF | Baseline |
| v0.7 | 2:19.31 | Steer toward the open road |
| v0.96 | 1:13.59 | Softer traction-control cut |
| v1.04 | 1:13.61 | S-bend look with focus sensors |
| v1.06 | 1:13.14 | Corner speed table (track memory) |
| v1.17 | 1:07.40 | Planned line over the whole lap, its stored speed as the braking plan |
| v1.31 | 1:06.05 | Gears, elevation, softer line-follower gains |
| v1.33 | **1:05.56** | The stored line drawn wider (kerbs allowed) |
