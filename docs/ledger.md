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
