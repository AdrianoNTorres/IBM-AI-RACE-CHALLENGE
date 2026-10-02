# tools/ — parallel race harness (read this, not the scripts)

Races run 9 at once (one TORCS per scr_server slot 1–9, ports 3002–3010), each on a private copy of the driver in `%TEMP%\torcs_tools`, so **never edit `snakeoil3_v1.py` to try a value**. Parallel runs are byte-identical to serial ones and to `run_race.py` (TORCS is launched with `-t 1000000`, so the server always waits for the driver). One race ≈ 1.9 s alone; a 30-run suite ≈ 9.5 s. TORCS must not be open. Run everything from the repo root.

| Task | Command |
|---|---|
| One race, current driver (or with overrides) | `python tools/race.py [--set knob=value ...] [--keep out.csv]` |
| Metrics of a CSV (watch points, `--sections` for 100 m times) | `python tools/metrics.py runs/<file>.csv [--sections]` |
| **Safety standard**: 3×10 perturbation suites on a config | `python tools/suite.py --set brake_aero=0.0065 --set tc_slip=3` |
| Compare configs in one batch | `python tools/suite.py --cfg base: --cfg hi:brake_aero=0.0065,brake_max=30` |
| Code change (new mechanism) | copy `snakeoil3_v1.py` to `%TEMP%\x\v.py`, edit it, then `python tools/suite.py --variant %TEMP%\x\v.py` (`--set`/`--cfg` still apply on top) |
| Only suite 1 (10 runs), print every run | `python tools/suite.py --suites 1 -v ...` |
| Optimise knobs (full suite objective) | `python tools/opt.py --knob brake_aero=0.005:0.008 --knob brake_max=24:34 --trials 40 --study ba` |
| Optimise cheaply, then confirm top 5 on all 30 | `python tools/opt.py --knob tc_slip=2:3.5 --screen 1 --confirm 5 --trials 60 --study tc` |
| Record the chosen version (writes `runs/` CSV via `run_race.py`, prints changelog fields) | `python tools/finalize.py [--suite]` |
| Orchestrator check: rerun must be byte-identical | `python tools/finalize.py --verify runs/<committed>.csv` |

**Reading the output.** Per run: `t` lap (s), `|tp|` max |trackPos| @ m, `OFF` (|tp| > 1, damage, or DNF = damage stop), flick (2,430–2,530 m) max |tp| / slide km/h / exit slide (2,484–2,520), kink slide (2,350–2,420), hairpin min speed / |tp| / exit slide (3,281–3,340), largest slide elsewhere. Suite table: per suite `n`, `off`, `mean` (on-track runs only), `max|tp|`, `score` = mean + 5 s per off run + 10 s per unit |tp| over 0.95 (`opt.py --off-pen/--soft-pen/--soft-tp`). v0.49 reference: **79.471 / 79.505 / 79.450, max 0.915 / 0.952 / 0.925, 0 of 30 off**.

**Suites** (`suite.py` `SUITES`): each run moves one knob by a *delta from the config's own value* (suite 1 includes p0 = unperturbed). Suite 1: turn_grip_aero +0.5e-4/−0.25e-4, turn_grip +0.5, line_offset +0.1, tc_slip_straight +1, corner_speed +2, brake_decel +0.5, lookahead_gain −0.4, brake_aero +0.0005. Suite 2: brake_gain +0.01, tc_gain +0.1, line_gain +0.1, max_steer_step +0.05, upshift_rpm −200, corner_speed −2, brake_margin ±2, line_offset −0.1, lock_throttle +0.05. Suite 3: turn_steer_fade ±0.05, turn_steer_max −0.05, line_aim_off ±0.2, tc_slip ±0.2, downshift_rpm ±500, tc_hold +0.05.

**Notes.** `--set` names must be knobs in `drive_example()`'s knob block (exact name, one per line). `-n 10` adds slot 0 (only if nobody runs `run_race.py` meanwhile); 10 is the hard cap (scr_server has 10 slots). A `WARNING … server timeouts` line means a finished run was not deterministic: rerun it (never seen with `-t`). Optuna studies resume from `%TEMP%\torcs_tools\optuna\<study>.db` (`--fresh` restarts); trial 0 is always the current values. Library use: `from suite import run_suites`, `from race import run_batch, Job`. Needs `pip install -r tools/requirements.txt` for `opt.py` only.
