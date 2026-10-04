# TORCS Racing Driver

A rule-based AI racing driver for the [TORCS](http://torcs.org) simulator, hand-tuned over 106+ versions on the Corkscrew circuit. No neural nets — all control logic is explicit physics, braking plans, and track memory.

**Best lap:** v1.06 · **1:13.14** · zero damage · 0 of 30 safety runs off-track

---

## Quick start

**Requires:** TORCS installed at `C:\torcs\torcs`, Python 3.

Run one lap and print the result:

```
python harness/run_race.py
```

TORCS must not already be running. The script starts it headlessly, drives one lap, and prints the lap time, top speed, slowest corner, damage, and max track position.

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

The viewer reads live data from this GitHub repository by default. It shows all versions' lap times, replays any lap on a 2D map with sensor beams, and compares telemetry between runs.

---

## Repository layout

```
driver/         snakeoil3_v1.py — the active racing driver
harness/        run_race.py — run one race; lap_report.py — read a CSV
tools/          parallel race harness, perturbation suites, Optuna optimiser
viewer/         static website (open index.html in a browser)
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
| v1.06 | **1:13.14** | Corner speed table (track memory) |
