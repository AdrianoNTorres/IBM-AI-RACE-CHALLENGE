# Findings ledger

One row per candidate that was measured (or considered and not run), newest version last. Written by `tools/record.py` from `tools/accept.py`'s results; search it before trying an idea: `grep -i "plan_ff\|1,931" docs/ledger.md`. Difference = paired mean lap difference to that version's base (s, negative = faster) over the stated runs; worst = largest on-track \|trackPos\| and where.

Rows for v1.03–v1.17 were transcribed on 2026-10-08 from `docs/batch.md` and the HANDOFF notes (n/s = not stated there; for v1.03–v1.12 the Worst column is the largest \|trackPos\| stated for the 70 runs, where stated); versions before v1.03 are not in the ledger: for those, search `docs/history.md` and `docs/CHANGELOG.md`.

| Version | Candidate | Where | What was tried | Runs | Difference | SE | Off | Worst | Verdict | Why / note |
|---|---|---|---|---|---|---|---|---|---|---|
| v1.03 | **chosen** | held bends (start kink) | soft dab: a brake application starting in a held bend sends 0.1 of its pedal for its first 2 steps | 70 (full) | -0.003 | 0.018 | 0 of 70 | 0.914 (bm14) | rejected | kink-slow runs 14 → 8 of 70, given back at 700–800 m and the flick |
| v1.03 | nodrop | 2,900–3,100 m | bend drop removed mid-corner: position-gated / ungated | 70 | -0.006 (on 2 runs) / +0.255 | 0.004 / n/s | 0 / 1 of 40 | n/s | lost | the tail there is braking / line perturbations arriving hot, not the drop |
| v1.03 | aimoff09 | bend state | `line_aim_off` 0.9 | 70 | +0.110 | n/s | n/s | n/s | lost | |
| v1.03 | coast-lift | lift band | zero-torque throttle in the lift band, four forms (sensor plan) | 70 | +0.032 to +0.074 | n/s | 1 of 40 in three of four | n/s | lost | untested on the stored speed (open again, plan rank 6) |
| v1.04 | **chosen** | flick approach, 2,334–2,339 m | S-bend look with the focus sensors (`sb_*`): one look shows the flick ~40 m before the beams do | 70 (full) | -0.035 | 0.014 | 0 of 70 | 0.896 @ hairpin exit 3,278 m (bm14) | kept | since v1.15 the line's crest cap binds there instead |
| v1.04 | sb-neighbours | flick approach | `sb_x` / `sb_hold` 22/12, 28/12, 32/12, 22/25 | 70 each | +0.024 / -0.028 / -0.017 / -0.026 | n/s | 0 | 0.923 (28/12), 0.986 (22/25) | lost | the chosen value is the best of five |
| v1.04 | gaplook | start kink | focus look rays as extra plan beams, seven forms | 70 | +0.003 to +0.141 | n/s | 1 of 40 in five of seven | n/s | lost | |
| v1.05 | **chosen** | braking plan at speed | planned-deceleration cap ungated above a car speed (`brake_hi_car` 245) | 70 (full) | -0.033 | 0.015 | 0 of 70 | 0.904 @ hairpin exit 3,278 m (bm14) | kept | sensor plan only: inert inside `plan_mem` since v1.16 |
| v1.05 | ungated | braking plan | cap fully ungated | 70 | -0.005 | n/s | 0 of 70 | 0.895 | lost | +0.023 s at the start kink (an extra one-step brake at 180 m in 32 of 70 runs) |
| v1.05 | gate240-250 | braking plan | gate 240 / 250 km/h; `brake_max_hi` 38 on top | 70 | -0.030 / -0.033; -0.027 | n/s | 0 | 0.919 @ flick (38) | lost | |
| v1.05 | tcss | traction control | `tc_slip_straight` 6.5 / 7 / 8 / 10 | 70 | +0.020 / -0.015 / -0.025 / -0.010 | 0.015 (8) | 0 | 0.902 (8) | lost | 8 stacked with the chosen: −0.049 s (SE 0.019), not committed |
| v1.05 | misc | pedals, look | `dab_v` 250; `lift_pct` 4.0 / 4.5; `sb_hold` 16; look as a sustained plan | 70 | +0.024; +0.020 / +0.051; -0.007; +0.035 to +0.122 | n/s | 0 | 0.904 (`sb_hold` 16) | lost | |
| v1.06 | **chosen** | five medium bends, 2,600 m, hairpin | corner table (first track memory): 7 rows of km/h added to the sensor plan by `distFromStart` | 70 (full) | -0.427 | 0.016 | 0 of 70 | 0.818 @ flick 2,473 m (bm14) | kept | inert inside `plan_mem` since v1.16 |
| v1.06 | scale | corner table | offsets ×0.8 / ×1.2 | 70 | -0.355 / -0.444 | n/s | 0 | 0.810 (×1.2) | lost | |
| v1.06 | plus20-28 | 1,931 / 2,700 / 2,988 m | +20 / +28 km/h there | 70 | -0.370 / – | n/s | 0 / 4 of 70 around 1,960 m | 0.727 @ 1,931 m (+20) | lost | cliff at +28 on the old line |
| v1.06 | shift20 | corner table | all rows 20 m earlier / later | 70 | +0.363 / -0.236 | n/s | 0 | n/s | lost | on the planned line row ends ±15 m are flat (v1.12) |
| v1.06 | otherrows | 446 m, 770 m, start kink, flick approach, hairpin | 446 m ±4 / braking +8; 770 m ±4; start kink +15 / +40 / −6; flick approach −5; hairpin +3 | 70 | +0.010 to +0.049; +0.008 / +0.019; +40: +0.075; -0.020; – | n/s | hairpin +3: 1 of 70 | 0.966 (flick −5) | lost | |
| v1.07 | **chosen** | 1,931 m, hairpin | line table: rows that put the car on the outside before the bend is detected | 70 (full) | -0.156 | 0.010 | 0 of 70 | 0.852 @ flick 2,462 m (bm14) | kept | every row inert since v1.14 |
| v1.07 | widerows | 446 / 770 / 1,042 / 1,528 / 2,988 m | wide line rows alone | 70 | +0.09 / +0.042 / +0.003 / +0.17 / +0.15 | n/s | 0 | n/s | lost | 1,528 m and 2,988 m worked in v1.10 as row + offset + turn-in together |
| v1.07 | trail-in | before detection | trail-in before the bend is detected | 70 | +0.272 | n/s | n/s | n/s | lost | halves the 1,931 m gain |
| v1.07 | row2700 | 2,560–2,645 m | wide row before the 2,700 m left-hander (−0.5) | 70 | -0.025 | 0.014 | 0 | n/s | superseded | by the planned line (v1.11) |
| v1.08 | **chosen** | 770 m, 1,042 m, 1,528 m, 1,931 m, hairpin | turn table: no bend detection before a known turn-in point; hairpin corner row −3 → −9 | 70 (full) | -0.249 | 0.017 | 0 of 70 | 0.848 (bm14) | kept | every row inert since v1.14 |
| v1.08 | braketable | seven zones | braking table, deceleration factor ×1.15 | 70 | – | – | 13–15 of 70 | – | lost | |
| v1.08 | zonegain | braking zones | per-zone `brake_gain` ×1.5 | 70 | +0.112 | n/s | n/s | n/s | lost | |
| v1.08 | hairpin-split | hairpin | split hairpin rows (more plan speed inside the bend) | n/s | – | – | wide / off | 0.83 / 0.998 | lost | |
| v1.09 | **chosen** | 1,931 m | corner row +17 → +29 and turn-in end 1,891 → 1,888 m, tuned together | 70 (full) | -0.113 | 0.010 | 0 of 70 | 0.807 @ flick | kept | cliffs: +35 km/h 3 of 70 off; row end 1,885 m 0.969 |
| v1.09 | hairpin-pull | hairpin | in-bend inside target | 70 | -0.022 | 0.004 | 0 | n/s | superseded | by the hairpin on the planned line (v1.14) |
| v1.09 | tc-table | flick exit, 2,495–2,620 m | traction table: `tc_slip_straight` +3 there | 70 | -0.033 | 0.009 | 0 | unchanged | open | not re-measured on the planned line (plan rank 9) |
| v1.09 | flick-row | flick left arc | corner row −4 / −8 | 70 | +0.109 / +0.201 | n/s | 0 | n/s | lost | |
| v1.09 | offsets | 1,042 / 1,528 / 2,700 / 2,988 m | corner offsets alone | 70 | flat or slower | n/s | 0 | n/s | lost | they paid with wide entries (v1.10) and on the planned line (v1.12) |
| v1.10 | **chosen** | 1,528 m, 2,988 m | wide entry row + corner offset + turn-in point, tuned together per bend | 70 (full) | -0.146 | 0.010 | 0 of 70 | 0.805 | kept | no margin spent (largest of the 70: 0.807 → 0.805) |
| v1.10 | row-alone | 1,528 m, 2,988 m | the line row alone | 70 | -0.014 / +0.422 | n/s | 0 | n/s | lost | works only as the combination |
| v1.10 | transfer | 1,042 m, 770 m, flick approach | the same combination elsewhere | 70; 4 (flick) | flat or slower; -0.025 at best; -0.025 at best | n/s | 0 | 0.06 of margin (flick) | lost | |
| v1.11 | **chosen** | 60–2,150 m, 2,600–3,160 m | planned line (track memory; set by the user): offline racing line followed by direction of travel + position error + curvature feed-forward; its speed as a cap | 70 (full) | -1.645 | 0.017 | 0 of 70 | 0.849 @ flick (bm14) | kept | the largest gain of the project |
| v1.11 | lapwide | whole lap | the line everywhere | single laps | – | – | run ends at the 2,351 m crest above ~255 km/h; wall at −0.85 near 2,490 m | – | lost | overturned by v1.14 (hairpin) and v1.15 (flick): it lacked the line's side before the crest, a crest cap and the v1.13 follower |
| v1.11 | nose-heading | follower | heading from the nose instead of the direction of travel | n/s | – | – | off at 566 m | 0.3 wide of the line | lost | |
| v1.11 | slip-unlimited | follower | slip angle unlimited (`plan_slipmax`) | 70; 12 | – | – | 38 of 70; 3 of 12 | – | lost | cliff |
| v1.11 | nocap | line's speed | no speed cap from the line | n/s | – | – | n/s | 20 km/h over at 450 m | lost | |
| v1.12 | **chosen** | 1,042 / 1,931 / 2,600 / 2,700 / 2,988 m | corner table re-tuned on the planned line: rows +24 to +40 km/h and 35–45 m longer | 70 (full) | -1.304 | 0.018 | 0 of 70 | 0.844 @ flick (bm14) | kept | follower check 0 of 140 off, worst 0.821 @ 1,931 m |
| v1.12 | cliffs | corner rows | 1,042 m +70 / +85; 1,931 m +99 / +109; 446 m new row +10; 2,700 m +62; 2,988 m +65 | 12 (screen) | – | – | +85: 12 of 12; +109: 5 of 12; 446 m +10: 1 of 12 | 0.945 (+70); 0.91 (+99); 0.925 @ 2,801 m; 0.845 | lost | the measured steps before each cliff |
| v1.12 | rowends | corner rows | row ends and starts ±15 m | 12 (screen) | within 0.03 | n/s | 0 | n/s | lost | no knife edges on the planned line |
| v1.12 | follower-ready | follower | `plan_ff` 8.8; `plan_ffv` 1e-3; `plan_kp` 0.4; `plan_la` 0.2 (suite 1, base 69.614) | 10 each | means 69.306; 69.376; 69.390; 69.511 | n/s | 0 | 0.819; 0.821; 0.817; n/s | taken | became v1.13 (one lever: they overlap) |
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
| v1.18 | **chosen** | see title | Throttle from the stored speed's slope (feed-forward throttle through each bend's slowest point): faster on the 70 runs, fails both plan checks | 70 (full) | -0.108 | 0.008 | 0 of 70 | 0.832 @ 1,932 m | rejected | The feed-forward throttle gains 0.11 s on the standard runs by spending the stored speed's margin at the exits: both plan checks fail, and every tamer setting that stays on the track is at 0.90-0.99 where v1.17 is at 0.88. |
| v1.18 | S05 | plan_mem bends | feed-forward throttle, `plan_tk` 0.05, no cap, single lap | 1 (single) | -0.158 | n/a | 0 of 1 | 0.936 @ 2,804 m | lost | 0.936 at the 2,700 m exit on the standard lap |
| v1.18 | S05nf | plan_mem bends | the same without the fade in the lift band, single lap | 1 (single) | n/a | n/a | 1 of 1 | none on track | lost | off the track on the standard lap |
| v1.18 | S03 | plan_mem bends | `plan_tk` 0.03, no cap | 12 (screen) | -0.155 | 0.018 | 0 of 12 | 0.888 @ 1,107 m | lost | 0.888 at the 1,042 m exit |
| v1.18 | S05m7 | plan_mem bends | `plan_tk` 0.05, `plan_tmax` 0.7 | 12 (screen) | -0.144 | 0.021 | 0 of 12 | 0.898 @ 2,804 m | lost | 0.898 at the 2,700 m exit |
| v1.18 | S05m6 | plan_mem bends | `plan_tk` 0.05, `plan_tmax` 0.6 | 12 (screen) | -0.116 | 0.017 | 0 of 12 | 0.850 @ 2,803 m | lost | 0.850 at the 2,700 m exit |
| v1.18 | S05m5 | plan_mem bends | `plan_tk` 0.05, `plan_tmax` 0.5 | 12 (screen) | -0.086 | 0.016 | 0 of 12 | 0.830 @ 1,931 m | lost | no wider on 12 runs; smaller gain than 0.04 |
| v1.18 | S04m5 | plan_mem bends | `plan_tk` 0.04, `plan_tmax` 0.5 (the chosen setting, 12 runs) | 12 (screen) | -0.119 | 0.017 | 0 of 12 | 0.827 @ 1,931 m | lost | chosen; failed the plan checks on the full bar |
| v1.18 | S05m5v103 | plan_mem bends | chosen mechanism with `plan_vs` 1.03 | 12 (screen) | -0.058 | 0.021 | 0 of 12 | 0.891 @ 2,803 m | lost | slower than 1.02, 0.891 at the 2,700 m exit |
| v1.18 | S05m5l45 | plan_mem bends | chosen mechanism with `lift_pct` 4.5 | 12 (screen) | -0.108 | 0.025 | 0 of 12 | 0.864 @ 1,106 m | lost | 0.864 at the 1,042 m exit |
| v1.18 | H2-05 | 2,700 m and 1,042 m | `plan_tk` 0.05, no cap, stored speed of both stretches 2 % lower | 12 (screen) | -0.120 | 0.028 | 0 of 12 | 0.844 @ 1,931 m | lost | same trade as the cap; not put through the checks |
| v1.18 | P1042x102 | 1,042 m | handed down: stored speed of the 1,042 m bend x1.02, no new mechanism | 12 (screen) | -0.054 | 0.016 | 0 of 12 | 0.840 @ 1,932 m | lost | smaller gain, 0.840 at 1,931 m |
| v1.18 | m3_vd=10 | 2,700 m exit | `plan_tmax` 0.3 with the stored speed read 10 m early | 12 (screen) | +0.186 | 0.020 | 0 of 12 | 0.903 @ 2,804 m | lost | 0.903 at 2,803 m (v1.17: 0.882) |
| v1.18 | m3_vd=-10 | 770 m exit | `plan_tmax` 0.3 with the stored speed read 10 m late | 12 (screen) | +0.271 | 0.021 | 0 of 12 | 0.922 @ 823 m | lost | 0.922 at 823 m (v1.17: 0.880) |
| v1.18 | m4_vs=1.04 | 2,700 m exit | `plan_tmax` 0.4 with `plan_vs` 1.04 | 12 (screen) | -0.025 | 0.018 | 0 of 12 | 0.966 @ 2,803 m | lost | 0.966 at 2,803 m |
| v1.18 | Z_vd=-10 | 1,528 m exit | mechanism only at 90-1,750 m, stored speed read 10 m late | 12 (screen) | +0.243 | 0.020 | 0 of 12 | 0.988 @ 1,632 m | lost | 0.988 at 1,631 m |
| v1.18 | f3_vd=10 | 2,700 m exit | fade over a third of the lift band, stored speed read 10 m early | 12 (screen) | n/a | n/a | 12 of 12 | none on track | lost | 12 of 12 off |
| v1.19 | **chosen** | see title | Exit guard: throttle taken off while the car runs outside the planned line (live margin at the stored bends' exits), and with it the throttle from the stored speed's slope at 446 m, 770 m and 1,528 m | 70 (full) | -0.040 | 0.007 | 0 of 70 | 0.835 @ 1,932 m | kept | A small gain that passes the bar with both plan checks no wider than v1.17; the guard is live margin at every stored exit and costs nothing on the standard runs. |
| v1.19 | Gonly2 | plan_mem exits | part 1 alone: the exit guard at the chosen values, no throttle | 12 (screen) | +0.000 | 0.000 | 0 of 12 | 0.834 @ 1,932 m | lost | all 12 laps identical to v1.17: no cost on the standard runs |
| v1.19 | Gonly2_vd10 | 2,700 m exit | the guard alone with the stored speed read 10 m early | 12 (screen) | +0.232 | 0.023 | 0 of 12 | 0.882 @ 769 m | lost | 2,803 m 0.820 (v1.17 0.857); the worst is the 770 m apex, as on v1.17 |
| v1.19 | Gonly2_vdm10 | 770 m exit | the guard alone with the stored speed read 10 m late | 12 (screen) | +0.636 | 0.017 | 0 of 12 | 0.852 @ 841 m | lost | 823-841 m 0.852 (v1.17 0.880) |
| v1.19 | Tonly | 446 / 770 / 1,528 m | part 2 alone: the throttle at the chosen values, no guard | 12 (screen) | -0.026 | 0.014 | 0 of 12 | 0.841 @ 1,932 m | lost | faster on the standard runs, see the next two rows |
| v1.19 | Tonly_vdm10 | 1,528 m exit | the throttle alone with the stored speed read 10 m late | 12 (screen) | n/a | n/a | 12 of 12 | none on track | lost | 12 of 12 off (1,631 m) |
| v1.19 | Tonly_vs104 | 1,528 m exit | the throttle alone with `plan_vs` 1.04 | 12 (screen) | -0.080 | 0.032 | 9 of 12 | 1.000 @ 1,619 m | lost | 9 of 12 off (1,619 m) |
| v1.19 | C_vd10 | chosen | chosen with the stored speed read 10 m early | 12 (screen) | +0.270 | 0.018 | 0 of 12 | 0.877 @ 767 m | lost | 0.877 at the 770 m apex (v1.17 0.882); 2,803 m 0.821 |
| v1.19 | C_vdm10 | chosen | chosen with the stored speed read 10 m late | 12 (screen) | +0.732 | 0.016 | 0 of 12 | 0.881 @ 836 m | lost | 0.881 at 836 m (v1.17 0.880 at 839 m) |
| v1.19 | C_vs104 | chosen | chosen with `plan_vs` 1.04 | 12 (screen) | +0.319 | 0.026 | 0 of 12 | 0.843 @ 1,932 m | lost | 0.843 at 1,931 m; 1,631 m 0.776, 2,803 m 0.794 |
| v1.19 | B_vd10 | v1.17 | v1.17 with the stored speed read 10 m early, for reference | 12 (screen) | +0.218 | 0.023 | 0 of 12 | 0.882 @ 769 m | lost | 0.857 at 2,803 m, 0.882 at the 770 m apex |
| v1.19 | G | whole line zone | guard in all of `plan_zones`, `plan_x0` 0.3, read on the position, single lap | 1 (single) | +0.060 | n/a | 0 of 1 | 0.810 @ 1,932 m | lost | slower: 2,988 m and hairpin exits |
| v1.19 | GC0_vdm10 | 770 m exit | guard read on the present position (`plan_xt` 0) with the throttle, stored speed 10 m late | 12 (screen) | +0.786 | 0.022 | 0 of 12 | 0.940 @ 832 m | lost | 0.940 at 831 m where 0.2 s ahead gives 0.857 |
| v1.19 | GA | plan_mem bends | guard `plan_x0` 0.3 with v1.18's throttle in every bend | 12 (screen) | +0.079 | 0.017 | 0 of 12 | 0.848 @ 1,932 m | lost | slower than v1.17: the guard cuts what the throttle adds (2,800 m +0.063, 1,600 m +0.049) |
| v1.19 | GA45 | plan_mem bends | guard 0.45 / 0.2 s with v1.18's throttle in every bend | 12 (screen) | -0.120 | 0.020 | 0 of 12 | 0.827 @ 1,931 m | lost | fastest on 12 runs, but 1,106 m 0.886-0.904 under the three perturbations (v1.17 0.80) |
| v1.19 | GC | all but 1,042 m | throttle `plan_tk` 0.04 / `plan_tmax` 0.5 without 1,042 m, with 2,700 m | 12 (screen) | -0.057 | 0.026 | 0 of 12 | 0.835 @ 1,931 m | lost | 2,803 m 0.792 on the standard runs (0.651) for no gain there |
| v1.19 | GD | 446 / 770 / 1,528 m | chosen zones with `plan_tk` 0.04 / `plan_tmax` 0.5 | 12 (screen) | -0.045 | 0.022 | 0 of 12 | 0.835 @ 1,931 m | lost | smaller gain; 823 m 0.857 with the speed 10 m late |
| v1.19 | D55 | 446 / 770 / 1,528 m | chosen zones with `plan_tk` 0.05 / `plan_tmax` 0.5 | 12 (screen) | -0.030 | 0.013 | 0 of 12 | 0.846 @ 1,932 m | lost | smaller gain |
| v1.19 | D6X40 | 446 / 770 / 1,528 m | chosen with `plan_x0` 0.4 | 12 (screen) | -0.006 | 0.020 | 0 of 12 | 0.832 @ 1,932 m | lost | no gain: the guard acts at 1,631 m on the standard runs (+0.024) |
| v1.19 | D6T25 | 446 / 770 / 1,528 m | chosen with `plan_xt` 0.25 | 12 (screen) | -0.053 | 0.015 | 0 of 12 | 0.843 @ 1,932 m | lost | smaller gain; 823 m 0.861 with the speed 10 m late |
| v1.19 | U2 | 2,700 m | handed down: stored speed of the 2,700 m stretch x1.02, no guard | 12 (screen) | -0.019 | 0.008 | 0 of 12 | 0.834 @ 1,932 m | lost | 0.817 at 2,803 m; 7 of 12 off with `plan_vs` 1.04 |
| v1.19 | U4 | 2,700 m | stored speed of the 2,700 m stretch x1.04, no guard | 12 (screen) | -0.035 | 0.012 | 5 of 12 | 0.994 @ 2,804 m | lost | 5 of 12 off at 2,803 m |
| v1.19 | GU4t | 2,700 m | the same x1.04 under the guard (`plan_x0` 0.3, 0.2 s) | 12 (screen) | +0.159 | 0.014 | 0 of 12 | 0.834 @ 1,932 m | lost | 0 off, 0.644 at 2,803 m, but slower: the exit has no speed to give |
| v1.20 | **chosen** | see title | Brake pedal ahead of the falling stored speed, with steeper braking passes above 200 km/h into 446 m, 770 m and 1,042 m: slower in every form | 70 (full) | +0.046 | 0.007 | 0 of 70 | 0.844 @ 1,932 m | rejected | Fails the bar on lap time (0.046 s slower over 70 runs); nothing measured in the braking zones is faster than v1.19. |
| v1.20 | P4k3 | 446 / 770 / 1,042 m | the chosen pair on the 12 screen runs | 12 (screen) | +0.084 | 0.012 | 0 of 12 | 0.844 @ 1,932 m | lost | slower in 12 of 12 |
| v1.20 | P4k3_vdm10 | 770 m exit | the chosen pair with the stored speed read 10 m late | 12 (screen) | +0.743 | 0.021 | 0 of 12 | 0.845 @ 1,931 m | lost | 836 m 0.830 (v1.19 0.881), 1,106 m 0.764 (0.800): the pedal buys margin there |
| v1.20 | P4k3_vd10 | 770 m apex | the chosen pair with the stored speed read 10 m early | 12 (screen) | +0.386 | 0.012 | 0 of 12 | 0.891 @ 767 m | lost | 0.891 at the 770 m apex (v1.19 0.877) |
| v1.20 | P4k3_vs104 | chosen | the chosen pair with `plan_vs` 1.04 | 12 (screen) | +0.413 | 0.019 | 0 of 12 | 0.847 @ 1,932 m | lost | margins as v1.19 (0.843) |
| v1.20 | B_vd10 | v1.19 | v1.19 with the stored speed read 10 m early, for reference | 12 (screen) | +0.346 | 0.014 | 0 of 12 | 0.877 @ 767 m | lost | reference |
| v1.20 | B_vdm10 | v1.19 | v1.19 with the stored speed read 10 m late, for reference | 12 (screen) | +0.807 | 0.012 | 0 of 12 | 0.881 @ 836 m | lost | reference |
| v1.20 | B_vs104 | v1.19 | v1.19 with `plan_vs` 1.04, for reference | 12 (screen) | +0.394 | 0.022 | 0 of 12 | 0.843 @ 1,932 m | lost | reference |
| v1.20 | F10b15 | all five zones | handed down in its plain form: the whole pedal ahead (`plan_bk` 1) with every braking pass x1.15 | 12 (screen) | +0.087 | 0.016 | 0 of 12 | 0.833 @ 1,931 m | lost | slower; 1 of 12 faster |
| v1.20 | P2k5 | 446 / 770 / 1,042 m | `plan_bk` 0.5 with passes x1.3 above 200 km/h | 12 (screen) | +0.092 | 0.015 | 0 of 12 | 0.847 @ 1,932 m | lost | slower in 12 of 12 |
| v1.20 | P3k10 | 446 / 770 / 1,042 m | `plan_bk` 1 with whole passes x1.15, single lap | 1 (single) | +0.174 | n/a | 0 of 1 | 0.825 @ 1,931 m | lost | 770 m +0.03, 1,042 m +0.04 |
| v1.20 | F10 | all five zones | part 1 alone: the whole pedal ahead on v1.19's table, single lap | 1 (single) | +0.182 | n/a | 0 of 1 | 0.845 @ 767 m | lost | brakes earlier: 446 m +0.09, 770 m +0.06 |
| v1.20 | Fzk3 | 446 / 770 / 1,042 m | part 1 alone at the chosen share (`plan_bk` 0.3), single lap | 1 (single) | +0.078 | n/a | 0 of 1 | 0.818 @ 1,932 m | lost | slower without the passes too |
| v1.20 | hall_15 | all five zones | part 2 alone: passes x1.15 above 200 km/h, v1.19's pedal, single lap | 1 (single) | +0.294 | n/a | 0 of 1 | 0.818 @ 1,931 m | lost | 446 m -0.02 then +0.04; 1,528 m +0.24 |
| v1.20 | h446_50 | 446 m | pass x1.5 above 200 km/h, single lap | 1 (single) | +0.068 | n/a | 0 of 1 | 0.819 @ 1,932 m | lost | -0.08 s to 400 m, +0.13 s to 600 m |
| v1.20 | b446_15 | 446 m | whole pass x1.15, single lap | 1 (single) | +0.118 | n/a | 0 of 1 | 0.814 @ 1,932 m | lost | -0.07 s to 400 m, +0.15 s to 600 m |
| v1.20 | b770_15 | 770 m | whole pass x1.15, single lap | 1 (single) | +0.170 | n/a | 0 of 1 | 0.822 @ 826 m | lost | +0.04 s by 1,000 m |
| v1.20 | b1042_15 | 1,042 m | whole pass x1.15, single lap | 1 (single) | +0.048 | n/a | 0 of 1 | 0.823 @ 1,931 m | lost | +0.02 s in the bend |
| v1.20 | b1528_15 | 1,528 m | pass x0.98 for x0.85, single lap | 1 (single) | +0.480 | n/a | 0 of 1 | 0.820 @ 1,932 m | lost | +0.39 s by 1,800 m: this bend needs its gentle pass |
| v1.20 | b2700_15 | 2,700 m | pass x1.15, single lap | 1 (single) | +0.000 | n/a | 0 of 1 | 0.814 @ 1,931 m | lost | the same lap: this bend's entry is not a braking pass |
| v1.20 | g446_93 | 446 m | own: gentler pass x0.93, single lap | 1 (single) | +0.128 | n/a | 0 of 1 | 0.815 @ 1,932 m | lost | +0.04 s to 400 m, -0.03 s to 600 m |
| v1.20 | g446_85 | 446 m | own: gentler pass x0.85, single lap | 1 (single) | +0.140 | n/a | 0 of 1 | 0.823 @ 1,931 m | lost | +0.09 s |
| v1.20 | g770_93 | 770 m | own: gentler pass x0.93, single lap | 1 (single) | +0.020 | n/a | 0 of 1 | 0.814 @ 1,931 m | lost | +0.01, -0.01: flat |
| v1.20 | g1528_93 | 1,528 m | own: pass x0.79 for x0.85, single lap | 1 (single) | +0.008 | n/a | 0 of 1 | 0.823 @ 1,932 m | lost | +0.01, -0.02: flat |
| v1.20 | U446b | 446 m | own: stored speed of 330-520 m x1.04, single lap | 1 (single) | +0.008 | n/a | 0 of 1 | 0.824 @ 1,931 m | lost | 400 m section +0.10 s, 500 m -0.06 s |
| v1.20 | U446c | 446 m | own: stored speed of 330-520 m x1.06, single lap | 1 (single) | +0.040 | n/a | 0 of 1 | 0.813 @ 1,931 m | lost | 400 m section +0.14 s |
| v1.20 | U2a | 446 m, second arc | own: stored speed of 470-520 m x1.03, single lap | 1 (single) | +0.078 | n/a | 0 of 1 | 0.827 @ 1,931 m | lost | 500 m section +0.04 s |
| v1.20 | Vb3 | every bend | own: 30 % less steering feed-forward at full brake pedal, single lap | 1 (single) | +0.402 | n/a | 0 of 1 | 0.781 @ 1,931 m | lost | 1,931 m apex 0.781 (0.814), 770 m 0.698 (0.761), but slower in every bend |
| v1.20 | Vb10 | every bend | own: no feed-forward at full brake pedal, single lap | 1 (single) | +1.070 | n/a | 0 of 1 | 0.859 @ 3,048 m | lost | 1,931 m 0.636, 3,047 m 0.859 |
| v1.20 | Vd3 | every bend | own: 30 % less feed-forward per 30 m/s^2 of measured deceleration, single lap | 1 (single) | +0.518 | n/a | 0 of 1 | 0.826 @ 1,105 m | lost | slower; 1,105 m 0.826 |
| v1.20 | Vd10 | every bend | own: no feed-forward at 30 m/s^2 of deceleration, single lap | 1 (single) | n/a | n/a | 1 of 1 | none on track | lost | off the track at 1,103 m |
