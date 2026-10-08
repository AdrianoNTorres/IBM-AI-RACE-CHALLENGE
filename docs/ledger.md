# Findings ledger

One row per candidate that was measured (or considered and not run), newest version last. Written by `tools/record.py` from `tools/accept.py`'s results; search it before trying an idea: `grep -i "plan_ff\|1,931" docs/ledger.md`. Difference = paired mean lap difference to that version's base (s, negative = faster) over the stated runs; worst = largest on-track \|trackPos\| and where.

Rows for v1.13–v1.17 were transcribed on 2026-10-08 from `docs/batch.md` and the HANDOFF notes (n/s = not stated there); versions before v1.13 are not in the ledger yet: for those, search `docs/history.md` and `docs/CHANGELOG.md`.

| Version | Candidate | Where | What was tried | Runs | Difference | SE | Off | Worst | Verdict | Why / note |
|---|---|---|---|---|---|---|---|---|---|---|
| v1.13 | **chosen** | follower, whole line | `plan_ff` 8.0 → 12 with `plan_ffv` 9e-4 → 6e-4 (more feed-forward at low speed, less growth with speed) | 70 (full) | -0.351 | 0.013 | 0 of 70 | 0.851 @ 1,931 m | kept | all follower knobs are one lever against the inside of the 1,931 m apex; flat on v1.13 afterwards |
| v1.13 | ff14 | follower | `plan_ff` 14 / `plan_ffv` 5e-4 (runner-up) | n/s | -0.066 more than the chosen | n/s | 0 | 0.864 @ 490 m | lost | spends margin at 490 m for a small gain |
| v1.13 | steercap | steering cap in the zones | `steer_cap` 0.55 / 0.70 / 0.80 inside the line zones | 12 (screen) | about ±0.01 | n/s | 0 | n/s | lost | the cap is not a limit on the line (fronts saturated at 2,700 m) |
| v1.13 | ff-offpower | follower | less feed-forward off the power | 12 (screen) | +0.28 to +0.66 | n/s | n/s | n/s | lost | the car is faster inside the line than on it |
| v1.13 | pullback | follower | one-sided pull back to the line at turn-in | 12 (screen) | +0.35 | n/s | n/s | n/s | lost | same reason |
| v1.13 | limit70 | line width, whole lap | line limit 0.70 with the old follower | n/s | -0.20 | n/s | 0 | 0.853 | open | superseded by v1.14's measurement with the new follower |
| v1.13 | apex55 | 1,931 m apex | line held to 0.55 at the apex + `plan_ff` 10.4 / `plan_ffv` 9e-4 | 12 (screen) | mean 69.060 (base 69.244 all-30) | n/s | 0 | 0.881 @ 1,042 m apex | open | per-bend line limits with a stronger follower |
| v1.14 | **chosen** | hairpin, 3,000–3,600 m | hairpin on the planned line: zone to 3,330 m, entry / exit limit 0.78, corner row −9 → +2 | 70 (full) | -0.421 | 0.002 | 0 of 70 | 0.851 @ 1,931 m | kept | overturns v1.11's "hairpin on the line is 1.5 s slower" |
| v1.14 | limit70 / limit75 | line width, whole lap | whole-line limit 0.70 / 0.75 | n/s | -0.02 / -0.12 | n/s | 0 | 0.905 / 0.977 @ 1,931 m apex | lost | width pays only where the line's own speed cap binds (slow corners) |
| v1.14 | limit78in | line width | 0.78 with the apexes held in | n/s | slower | n/s | 0 | 0.902 @ start kink | lost | |
| v1.14 | startfinish | start, finish | start and finish straight on the line | n/s | 0 | n/s | 0 | n/s | lost | no time in it |
| v1.14 | cork-zone | 2,300–2,600 m | second zone starting at 2,540 / 2,500 / 2,420 / 2,380 / 2,300 m (single laps) | 1 each | +0.07 / +0.19 / off / off / run ends | – | off at 2,484–2,488 m; ends at the 2,352 m crest | – | lost | the car arrives at +0.30 where the line is at −0.65; needs the entry side set before 2,400 m and a crest cap (done in v1.15) |
| v1.14 | apex55 | 1,931 m apex | apex held at 0.55 | n/s | +0.08 | n/s | 0 | 0.05 more margin | open | margin to spend on that corner's speed |
| v1.15 | **chosen** | flick / Corkscrew, 1,900–2,990 m | one zone (60, 3330); line held inside 0.3 before the crest, 0.5 in the kink, at the right-hand apex and at the 2,700 m apex; crest cap 230 km/h at 2,335–2,360 m | 70 (full) | -0.818 | 0.008 | 0 of 70 | 0.850 @ 1,931 m | kept | Corkscrew 65 → 72 km/h; 2,700–2,900 m gives 0.13 s back |
| v1.15 | kink65 | 2,335–2,510 m | kink / right apex at limit 0.65 in one zone | n/s | – | – | wall at 2,492 m | – | lost | the wall ends a run at about −0.83 |
| v1.15 | crest250 | 2,335–2,360 m | crest cap 250 km/h | n/s | n/s | n/s | 0 | wall side −0.786 | lost | 240 is the measured step; 230 chosen |
| v1.15 | apex2700 | 2,700 m apex | apex limit 0.55 | n/s | -0.05 | n/s | 0 | 0.778 @ 2,700 m | open | rows (2585, 2648) / (2648, 2800) were to be re-tuned; inert since v1.16 |
| v1.15 | corkexit75 | 2,515–2,570 m | Corkscrew exit limit 0.75 | n/s | -0.02 to -0.03 | n/s | 0 | n/s | open | |
| v1.15 | wide446-770 | 446 m, 770 m | wider entry / exit limits (0.78) | not run | | | | | not run | exits there are traction-limited, width unused |
| v1.15 | coast-zero | lift band | zero-torque throttle while coasting on the line's cap | not run | | | | | not run | est. 0.02–0.04 s per bend |
| v1.16 | **chosen** | 90–1,750 m, 2,600–2,850 m | braking plan from track memory: allowed speed = stored `plan_v` inside `plan_mem`; 1,042 m ×1.06, 1,528 m ×1.07 (braking ×0.85) | 70 (full) | -0.370 | 0.009 | 0 of 70 | 0.832 @ 1,931 m | kept | the sensor plan was a ceiling over the line's speed |
| v1.16 | store-all | all but 1,931 m | everything but 1,931 m on the stored speed, larger factors | 70 (full) | -0.484 | n/s | 0 of 70 | n/s | lost | at `plan_vs` 1.03 5 of 10 runs hit the Corkscrew wall: no ceiling (fixed by v1.17's guard: re-test) |
| v1.16 | steep-brake | braking pass | braking pass 38 / 42 m/s² in the stored speed | n/s | +0.04 to +0.12 | n/s | n/s | n/s | lost | the pedal is proportional to the excess: a steeper plan is followed later, not harder |
| v1.16 | store1931 | 1,931 m | 1,931 m on the stored speed, several factors | n/s | ≤ -0.01 | n/s | 0 | 0.87–0.94 @ 1,931 m | lost | tracking-limited there |
| v1.16 | storehairpin | hairpin | hairpin on the stored speed | n/s | – | – | off at the exit with the speed read 7.5 m late | – | lost | |
| v1.16 | factors | 1,042 / 1,528 / 2,700 m | single factors: 1,042 m ×1.08 / ×1.10, 2,700 m ×1.02, 1,528 m ×1.10 | n/s | -0.03 / -0.07, -0.03, -0.03 | n/s | 0 | n/s | open | each costs `plan_vs` margin; room at `plan_vs` 1.04 on v1.17: 0.79 / 0.73, 2,700 m none |
| v1.17 | **chosen** | line zone; acts at 2,452–2,461 m | line-error guard `plan_ek` 0.5, `plan_e0` 0.4, `plan_emax` 0.5; `plan_vs` 1.0 → 1.02; 770 m and crest / flick / Corkscrew apex entries ÷ 1.02 | 70 (full) | -0.177 | 0.007 | 0 of 70 | 0.838 @ 1,931 m | kept | v1.16's `plan_vs` failures were all at the Corkscrew wall |
| v1.17 | vs-scan | `plan_vs` | 1.00 / 1.01 / 1.02 / 1.03 / 1.04 / 1.05 with the guard | 12 (screen) | means 67.644 / 67.532 / 67.469 / 67.531 / 67.517 / 67.526 | n/s | 0 | 0.876 at 1.05 | lost | 1.02 is the fastest; above it the hairpin loses |
| v1.17 | vs106 | `plan_vs` | 1.06 | 10 (suite 1) | – | – | 2 of 10 (2,803 m, 827 m) | – | lost | cliff |
| v1.17 | ff-pedal | brake pedal | feed-forward brake pedal from the plan's slope, several shares | 12 (screen) | +0.09 to +0.41 (67.688–68.008) | n/s | n/s | n/s | lost | brakes on the plan instead of 4–6 m after it; open with later braking passes (`--bscale` > 1) |
| v1.17 | guard-strong | guard | `plan_ek` 2 / 4 at `plan_vs` 1.04 | n/s | +0.5 to +1.0 | n/s | n/s | n/s | lost | cliff: `plan_ek` ≥ 2 |
| v1.17 | vd-10 | 770 m stretch | `plan_vd` −10 with the 770 m stretch at 1.02 | 10 (suite 1) | – | – | 10 of 10 at 826 m | – | lost | why the 770 m entries are held at v1.16's speeds |
| v1.17 | vd-12.5 | braking-plan check | `plan_vd` −12.5 | n/s | n/s | n/s | 0 | 0.986 @ 822 m | lost | cliff; the 770 m exit sets the braking-plan check |
