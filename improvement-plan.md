# Improvement Plan — v0.33 → 1:14.72 (best v0.62 1:16.13)

**Goal (updated 2026-10-02):** beat the new target **1:14.72** (TORCS 74.72 s, user, 2026-10-02); from v0.62 (1:16.13) that is a **1.41 s** gap (1.85 s from v0.57, 3.84 s from v0.52). (Original goal: from **1:31.03** (v0.33) toward the **~1:24** another user reached; beaten at v0.42.) Always with **0 damage** and **never leaving the track** (`|trackPos|` > 1 = off track = reject).

This plan merges the user's improvement plan (written against v0.31) with Claude's racing-line analysis after v0.33. The order of each plan's tasks is kept. All gains are **estimates, not measurements**. Every step follows the CLAUDE.md workflow: one change per version, changelog entry, annotated tag. The user runs TORCS. Any damage or leaving the track means reject; slower versions may be kept only as enabling changes (rule 8).

## Current state

- **Best:** **v0.62, 1:16.13** (TORCS 76.132 s), 0 damage, top 274 km/h, max \|tp\| 0.793 (flick steering flip ~2,477 m; hairpin exit 0.68). Telemetry: `runs/run_20261002_155252.csv`. Suite means 76.285/76.383/76.337 (**all-30 76.335**), max \|tp\| 0.872/0.923/0.865, 0 of 30 off. **Target 1:14.72: 1.41 s to go.**
- **Batch 4 (v0.58–v0.62, −0.44 s vs v0.57; all-30 76.706 → 76.335; theme: the racing line; detail in `CHANGELOG.md`):** v0.58 1:16.67 (✅ enabling change: **corner set-up** from the beam asymmetry: from 160 m of road the beams ±2° of the track direction give the coming bend's side, and the car is pulled to the outside before the bend is detected; suites −0.07 s, unperturbed +0.10 s); v0.59 1:16.46 (**set-up re-tuned**: `setup_offset` 0.85, ends at `setup_road` 95 m, gate `setup_steer` 0.045; recovers v0.58's cost); v0.60 1:16.40 (**grip to spare**: the sharpness plan assumes +30 % grip below smoothed \|steer\| 0.2, gone by 0.3; suites −0.09 s); v0.61 1:16.16 (**exit release**: the inside target lets go by 80 % once the road has grown 7 m past the bend's shortest; −0.24 s, suites −0.11 s); v0.62 1:16.13 (`corner_speed` 75 → 76, a knob nudge: no line mechanism of six was faster; suites −0.08 s). **Findings:** (a) until v0.57 the line never had an outside approach: the bend was detected ~35 m out with < 60 m of road, so the target went straight to the inside; the bend's side is readable ~150 m out from the beam asymmetry; (b) every entry-side line mechanism on top of the present controller was slower (latched set-up 25 of 30 off when fully held, set-up smoothing/integral, later apex, short-sight set-up, braking-zone hold, brake-scaled pull): **lateral moves in the braking zones are at a local optimum** and the line's measured time is on the **exit side**; (c) the 1,520/1,930 m bends are still entered from the centre (60–70 m of straight braking with the bearing under the 2° threshold) and the flick's first part from the inside (+0.46): that needs a planned-line / path-following redesign, not another pull; (d) a full-width exit where a straight follows runs the hairpin exit to 0.93–0.94 (3 of 10 off); (e) in steady medium bends the car rides the plan at \|steer\| 0.2–0.35: the plan (end-of-sight `corner_speed` within ~35 m of road), not the line, sets the speed; "the bend continues at the curvature seen" runs off at every unseen sharpening (13–30 of 30 off even capped): dead without track memory; (f) the flick cliff sits between `corner_speed` 76 and 77.
- **Batch 3 (v0.53–v0.57, −1.99 s; detail in `CHANGELOG.md`):** v0.53 1:17.18 (**inside line integral**: on the inside half of a bend the line error is integrated, `line_ki` 1.5, cap 0.4, faded out over \|steer\| 0.4–0.65, decays ×0.85 elsewhere; −1.37 s); v0.54 1:16.91 (**shift points**: `downshift_rpm` 13,500 → 15,000, `upshift_rpm` 18,500 → 18,600; −0.27 s); v0.55 1:16.80 (**ABS refit**: cut at 15 % slip, `abs_ratio` 0.8 → 0.85; −0.11 s, suites −0.23 s; flick suite max 0.76 → 0.90); v0.56 ❌ 1:16.98 (plan rise-limit on the flick-approach crest: calmer flick only by arriving slower, +0.19 s); v0.57 1:16.57 (**smoothed steering in the sharpness fade**: `fade_lp` 0.9, window 0.61–0.78; −0.23 s, suites −0.15 s). **Findings:** (a) in a steady bend the heading term `angle·15/π` sees the slip angle and cancels half the line pull: a steady offset, which an integral removes without raising the loop gain (`line_gain` 0.7 oscillated); integrating on the outside half or carrying it into the flick runs the flick off; (b) inherited "no gain" results for `downshift_rpm` and the ABS threshold (v0.46) no longer held on the faster car; (c) the line, grip, braking-plan, TC and `brake_gain` knobs are locally tuned out (single nudges within ±0.05 s around v0.55); (d) **every braking or speed gain lands on the flick first**: the flick maximum is at the left→right steering flip (~2,472–2,480 m, trackPos −0.73), not on the full-lock arc; on the approach crest the brake sits at a flat 0.50 (ABS-halved) at ~21 m/s² (~27 before the hairpin), 20–40 km/h over the plan through the kink; (e) the hairpin gives no beam signal to set up wide before ~40 m (needs track memory, on hold); (f) the `aim` beam rise-rate limit (v0.52 rank 1) is dead since the line integral.
- **Batch 2 (v0.48–v0.52, −1.53 s; detail in `CHANGELOG.md`):** v0.48 1:19.55 (braking plan refit: crest load factor `brake_load_min` 0.5, `brake_aero` 0.004 → 0.006, cap `brake_max` 28; −0.53 s); v0.49 1:19.44 (`tc_slip_slide` 14 → 20; −0.11 s); v0.50 1:19.45 (✅ enabling change: full-lock throttle falls to `lock_throttle_edge` 0.1 as the outside edge nears; suite max 0.92–0.95 → 0.81–0.85); v0.51 1:19.04 (**lift band**: up to `lift_pct` 1 % of speed over the allowed speed the car lifts instead of braking, stored throttle kept, faded in from 86 km/h; −0.41 s, recovers v0.50); v0.52 1:18.55 (**apex line**: the inside target goes `line_apex` 0.34 further in, faded out with \|steer\| 0.3–0.55, `line_offset` 0.5 → 0.47; −0.49 s, suites −0.60/−0.63/−0.65). **Findings:** (a) the brake dead band rejected in v0.42 works once the full-lock margin exists (v0.50 + v0.51); (b) the line gain is all on the **inside**: a wider outside target breaks the flick approach (5–7 of 30 off), because the move outside for the Corkscrew left fights the right-kink exit at full lock while braking on the crest; (c) the medium-corner steering wiggle (0.03 ↔ 0.25 every ~6–20 steps) is the −19° beam flipping 69 ↔ 25 m across the inside edge at the apex, which makes `aim` jump ~2.7° (distance² weighting); a beam rise-rate limit for `aim` fixes it at equal speed with more flick margin (rank 1 below).
- **Best before batch 2:** v0.47, 1:20.08 (TORCS 80.088 s), 0 damage. Telemetry: `runs/run_20261001_234606.csv`. (v0.46: 1:20.13, v0.45: 1:20.20, v0.44: 1:20.58, v0.43: 1:22.23, v0.42: 1:23.12, v0.41: 1:24.35, v0.40: 1:25.95, v0.39: 1:27.44.) The ~1:24 target is beaten by ~3.9 s; the goal is now as far below it as possible.
- **v0.47 (step 2 follow-up, inherited idea re-opened): sharpness plan fades out with steering, −0.05 s ✅.** `turn_steer_max` 0.6 → 0.75, new `turn_steer_fade` 0.25: the credit above the road-ahead plan falls linearly over \|steer\| 0.5–0.75 instead of switching off at 0.6. The switch turned a one-step steering spike at a corner exit (~513 m, the −19° beam opening) into a ~20 km/h drop in allowed speed and a brake touch, so laps were **bimodal by ~0.2 s**; a hard switch at 0.65/0.7 runs the flick wide (1 off). Over two 10-run suites −0.23/−0.16 s, 0 of 20 off; flick 0.828 → 0.770. **Findings:** (a) **the car barely uses the track width** (\|trackPos\| ≤ 0.3 in most sections): the line target only acts within ~50 m of a corner and the line term is a weak pull that cannot hold an outside pre-position (−0.34 of a −0.5 target in 100 m); pre-positioning from the longest beam made the flick less safe (2–3 of 10 off), so step 5 needs a stronger tracking term first; (b) **crest-aware plan + `brake_aero` 0.0055–0.006** is the biggest measured gain (suite means 79.57–79.75 vs v0.46 80.26) but the flick margin is ~0; (c) outside line while braking (+1.5–4.7 s), launch slip (start −0.04–0.07 s, in the noise), speed-dependent steering lock cap (off at the hairpin or no safer): no gain. A 10-run suite takes ~41 s (`%TEMP%\t47\`).
- **v0.46 (off-plan, own candidate): `target_speed` 250 → 300, −0.07 s ✅.** The 250 cap still bound the long straights (throttle falling to 0.4 at 249–257 km/h for ~100 m before each braking point); the car reaches 269 km/h without it (v0.41's "tops out at ~255" was wrong). Small but consistent: 0 of 10 perturbations off, each 0.05–0.15 s faster than on v0.45. **Findings:** (a) **the flick approach is a crest**: logging `speedZ`, the car is nearly airborne at ~2,364–2,378 m (vertical acceleration to −17 m/s²) and lightly loaded (−2 to −4 m/s²) through the 2,382–2,433 m braking zone; every braking plan that assumes more than ~22.8 m/s² at ~150 km/h leaves the track there (25-run `brake_decel` × `brake_aero` grid); (b) a **crest-aware plan** (`brake_decel` × the vertical load factor) is safe at the flick up to `brake_aero` 0.006 and halves the kink slide (14.8 → ~7 km/h), but the hairpin exit fails at 0.007, and over 10 perturbations it is no safer than today (see the ideas table); (c) medium corners ride the allowed speed with tiny brake touches, and an aim limit cycle at ~2,700 m (grazing −19° beam) makes the steering flip 0.04 ↔ 0.23; smoothing the throttle or the aim was slower (80.21–81.30); (d) no gain: ABS threshold, slip-ratio traction control, allowed-speed persistence (off at N ≥ 5), `downshift_rpm` 12,500–17,000, `lookahead_gain`, `max_steer_step`, `tc_gain`, `tc_hold`, centring and heading gains (numbers in the v0.46 changelog).
- **v0.45 (step 4 area, own candidate): `tc_slip_slide` 8 → 14 km/h, −0.38 s ✅.** Medium corners run 7–9.5 km/h sideways as normal cornering slip, so v0.43's guard at 8 km/h switched the straight-line traction extra off on every medium-corner exit. Gains on exits (~500 m −0.20 s); medium-corner exit slides 9.5 → 11.4 km/h; flick 0.85 → 0.84, kink 17.3 → 14.8, hairpin unchanged. Neighbours 10–20 all faster than 8 (80.05–80.47); 14 stayed on track with 8 perturbations on top (v0.44 itself: 1 of 8 off). **Findings:** (a) the flick approach (2,395–2,432 m) is a **low-grip braking zone** (wheels at 0.80–0.90 of car speed at ~0.5 pedal, ~22 m/s² vs ~25 elsewhere); `brake_aero` 0.006 fails there in the approach (17–22 km/h over the plan, turn-in at ~122 instead of 107 km/h), so full-lock fixes can't rescue it (edge guard, full-lock brake tried); (b) the sharpness plan in medium corners is bound by its "slow to 75 within the beam" term, not grip, but relaxing it only adds slides (80.42–87.03 or off); (c) friction-circle braking plan, throttle memory, short-shift, line knobs, `lock_throttle`, `upshift_rpm`, `tc_slip`: no gain (numbers in the v0.45 changelog).
- **v0.44 (step 2 area, own candidate): speed-dependent corner grip, −1.65 s ✅.** The sharpness plan assumes `turn_grip·(1 + turn_grip_aero·v²)` (`turn_grip_aero` 1.5e-4: 7.8 m/s² at 100 km/h, 10.2 at 200), solved at the curve's own speed. A flat `turn_grip` 9 had gained most in the fast corners, pointing at downforce. Fast/medium corners +5–19 km/h. Cost: kink slide 10.6 → 17.3 km/h, **flick 0.71 → 0.85**, hairpin exit −0.56 → −0.67. Trials on v0.43: flat `turn_grip` 8/8.5/9/9.5 → 81.41/81.04/80.70/80.89; `turn_grip_aero` 5e-5 → 81.65 (watch points unchanged), 1.25e-4–3e-4 → 80.59–80.77 (flick 0.69–0.86, nearly random between nearby values); `turn_steer_max` 0.5 → 82.47 (flick 0.62; with `turn_grip` 9 → 80.92, flick 0.66). The flick approach (~2,433–2,449 m) is braked at `\|steer\|` 0.4–0.6, inside the sharpness plan, which is why every grip raise widens the flick.
- **v0.43 (off-plan, own candidate, step 4b area): straight-line traction control, −0.89 s ✅.** The slip limit rises from `tc_slip` 2.5 by up to `tc_slip_straight` 5.0 m/s as the wheel straightens (`tc_slip_steer` 0.7) and the car stops sliding (`tc_slip_slide` 8 km/h). Traction control had cut the throttle for 30.8 s of the v0.42 lap; now 17.9 s. Trials on v0.42: **steering cap (new) 0.6–0.9 left the track at the hairpin exit** (less lock kept 72–73 km/h but could not turn tight enough); throttle ramp 0.1–1/step → 82.66–82.90 s; flat `tc_slip` 3–6 → 82.10–82.84 (flick slide 25–36 km/h); steering-only extra → 82.05 but medium-corner exits slid 13–19 km/h (counter-steer raised the limit); full-lock brake → 82.07; `corner_speed` 80 → off track at the flick; `downshift_rpm` 15,500/16,000 → 82.21/82.01.
- **v0.42 (step 6 taken early): `upshift_rpm` 15,000 → 18,500, −1.23 s ✅.** Power rises to the limiter and the ratios are close, so shifting at 15,000 landed every gear at 12,000–13,500 rpm. No watch point moved; shifts 66 → 41, gear reversals 6 → 0 (the 2↔3 hunting fix is no longer needed). Trials on v0.41: 20,000 never leaves 2nd at speed; `turn_grip` 9/10 → 83.17/83.01 s (flick 0.81/0.88); `brake_aero` 0.006 → 83.54; brake dead band (step 4a) 1–3 km/h → no gain; **new: full-lock brake** (pedal ≥ 0.05 above `\|steer\|` 0.95) → +0.09 s alone, but flick `\|trackPos\|` 0.71 → 0.53 and hairpin 0.59 → 0.34 (hairpin 64 → 52 km/h). Combos on 18,500 (informational): + `turn_grip` 9 → 81.80; + full-lock brake + `corner_speed` 80 → 82.47 (flick 0.62); + full-lock brake + `turn_grip` 10 → 81.77 (flick 0.57); `brake_aero` 0.008 leaves the track at ~2,467 m with or without the full-lock brake.
- **v0.41 (off-plan, own candidate): `target_speed` 200 → 250, −1.60 s ✅.** "Straights used up" (v0.17) was only true while braking was weak; with the v0.40 brakes the 200 cap held every long straight at ~210 km/h. Closed-loop trials on v0.40, for comparison: `turn_grip` 8 → −0.82 s, 9 → −1.12 s (so step 2's "not grip-limited" was wrong: the count looked at braking steps, but medium corners ride the sharpness-plan speed on part throttle); `corner_speed` 80 and `brake_margin` 10 leave the track at the flick; `brake_gain` 0.08 +0.30 s. Two-knob trials on v0.41 (informational): + `turn_grip` 9 → 83.17 s (flick `|trackPos|` 0.81, kink 15.4 km/h); + `brake_aero` 0.005 → 83.69 s (flick 0.66).
- **Races now run automatically** (`run_race.py`, ~4 s per lap), so values are chosen from closed-loop trials, not only open-loop replays. Baseline for this plan was v0.31 (1:31.37, `runs/run_20261001_191013.csv`).
- **v0.32 rejected** (1:32.45). The racing-line rework (`line_offset` 0.85, `line_gain` 1.5, `line_steer_max` 0.21) created a feedback loop. The line's steering swung the nose, which changed `aim` and `ahead`, which changed the target. The target jumped 261 times per lap, and steering reversals rose from 71 to 165. The 0.21 cap also meant the car crossed the track too slowly (~0.23 `trackPos`/s), so it never reached the line.
- **v0.33 kept** (1:31.03, −0.34 s). The line's bend is held until `|aim|` < `line_aim_off` 1°, and the phase comes from the road along the track direction. Steering reversals fell 71 → 38, and target jumps fell 81 → 38.
- **Racing line after v0.33 (user: "it goes out, but we aren't maximising the radius").** Outside the flick and the hairpin, entries, apexes and exits use only ~±0.25 of ±1:
  - Exits reach only +0.14 to +0.27.
  - On exits the heading term `angle·15/π` cancels the line's outward pull, so the net steering is ≈ 0.
  - Using the full width needs car angles above ~3°. Above that, the braking plan's look-ahead uses the nose beams only, and they see a false end of road (v0.25).

### v0.31 telemetry facts (user's plan)

| Measure | Value |
|---|---|
| Braking / part throttle / full throttle | 27.6 s / 38.4 s / 24.2 s |
| Time below 120 km/h | 31.8 s |
| ≥ 10 km/h under allowed speed, not braking, not at full throttle | 13.4 s (9.3 s traction-control cut, 2.9 s throttle ramp) |
| Traction control cutting (whole lap) | 11.1 s |
| Brake pedal | median 0.16, p90 0.24 |
| Deceleration while braking | median ~11.1 m/s²; **16.4 m/s² measured at pedal 0.57** (~2,590 m) |
| Short (< 15 step) brake releases inside braking zones | 54 (each resets the stored throttle to 0) |
| Medium corners (86–152 km/h) | sideways ≤ 8.4 km/h, `|steer|` ≤ 0.54 |
| Hairpin (~3,285 m) | 66 km/h, full lock, exit `trackPos` −0.59 (v0.33: −0.65), ~14 m/s² sideways |
| Flick (~2,460 m) | 74 km/h, full lock, 14 km/h sideways (v0.33: 13.3) |
| `|trackPos|` | mean 0.13 (v0.33: 0.17), max 0.59 (v0.33: 0.65) |

## The plan (in this order)

> **This order is a starting point, not a commitment (user, 2026-10-01).** Each new session or iteration agent forms its own view from the telemetry first, proposes at least 3 candidates of its own (at least one new), and may reorder, drop or replace steps when the evidence says so, recording why. Earlier conclusions, including rejections, are hypotheses that can be re-tested when the car or the code has changed. See CLAUDE.md, "Sessions and agents".

### 1. v0.33 — Steady line target ✅ done

- **Result:** 1:31.03, −0.34 s, best lap. Better than the predicted ±0.2 s.
- **Effect:** steering reversals 71 → 38, target jumps 81 → 38.
- **What it enables:** step 5 (a stronger line), now that the target no longer follows the car's own nose.

### 2. v0.34 — Raise `turn_grip` 6 → 7 ✅ done (8 and 9 skipped; re-opened after v0.41: 9 gave −1.12 s on v0.40); v0.44 speed-dependent grip `turn_grip_aero` 1.5e-4 ✅ −1.65 s; v0.47 sharpness fade ✅ −0.05 s

- **Result:** v0.34 (7): 1:30.74, −0.29 s. Hairpin exit −0.65 → −0.56, flick sideways 13.3 → 9.5 km/h, medium corners ≤ 9.1 km/h sideways.
- **Why it stops at 7:** classified offline, 1,248 of 1,299 braking steps in v0.34 are held by braking distance and only 15 by grip. A replay of 8 changed the brake in only 34 steps (7 changed 287). The lever is now braking (step 3). Revisit `turn_grip` after step 3 raises `brake_decel`, when grip may bind again.

Original step text:

- **Change:** one version per step. Stop at the first sign of trouble.
- **Why:** this is the strongest proven lever: adding the sharpness plan in v0.27 saved 6.78 s.
  - The medium corners run at ≤ 8.4 km/h sideways and `|steer|` ≤ 0.54.
  - The hairpin proves ≥ 14 m/s² of grip is available, so 6 m/s² is conservative.
  - The flick and hairpin are protected, because the plan switches off above `turn_steer_max` 0.6. Their approach braking still eases a little, so their entry speed rises ~2 km/h per step.
- **Expected impact:** 1–3 s in total.
- **Watch:**
  - Sideways speed and `|trackPos|` at ~485 m and ~1,926 m (7.8–8.4 km/h sideways now).
  - The flick, including its approach at ~2,384 m (14.3 km/h sideways in v0.33).
  - The hairpin: the exit is −0.65 at 66 km/h; 73 km/h gave −0.86 and 75 km/h left the track.
- **Reject if:** any damage, `|trackPos|` > 1, or sideways speed in medium corners climbing toward the flick's level (~14 km/h).
- **Follow-ups in this area:**
  - ✅ Fade the sharpness plan out near `turn_steer_max` instead of switching it off: done in v0.47 (fade over \|steer\| 0.5–0.75; a fade ending at 0.6 gained nothing in v0.45).
  - A speed plan that knows the hairpin is tighter than the 75 km/h floor, if the hairpin margin shrinks.

### 3. Braking to the real limit (plan E) ← **3c done (v0.40); next: the flick limit, `brake_gain` at the new deceleration levels, `brake_margin` 15 → 8** — **v0.48: plan refitted (aero 0.006, cap 28, crest load factor), −0.53 s ✅**

- **v0.40 (3c, `brake_aero` 0.004: plan deceleration `brake_decel + brake_aero·v²`): 1:25.95, −1.49 s ✅.** It also cured the kink slide (18.3 → 10.5 km/h): braking now ends before the turn. Closed-loop trials: 0.007 and 0.008 leave the track at the flick, so the flick entry is now the limit. The pedal runs a median 7.5 km/h over the plan (pedal median 0.36).

- **v0.38 (`slide_brake` 5 km/h): 1:27.57, ❌ rejected.** Halving the brake once the car slides > 5 km/h came too late (kink 18.3 → 17.4), and the flick slide grew to 25.7 km/h. That slide turned out to be traction-control chatter, so step 4b was done next as v0.39.

- **v0.37 (`brake_decel` 14): 1:27.59, −1.40 s ✅.** 11 → 14 gained 3.15 s in two steps. But the slides where the car brakes while turning grew each step: the kink ~2,385 m 14.3 → 16.4 → 18.3 km/h, the flick 19.4 km/h with `|trackPos|` 0.70. So the next version is the braking-while-turning item, done as a slide-triggered brake ease (halve the brake while `|speedY|` > 5 km/h). A `|steer|`-based pedal limit was rejected in replay: it missed the kink and removed hairpin-entry braking. After that: 3c speed-dependent `brake_decel`, `brake_margin` 15 → 8.

- **3b result so far:** v0.36 (`brake_decel` 12.5): 1:28.99, **−1.76 s** ✅. Hairpin exit −0.53. Braking distance still limits 1,105 of 1,159 braking steps. New watch point: the kink at ~2,384 m, where braking while turning makes the rear step out (16.4 km/h sideways, caught). That argues for trail-braking logic (pedal tapered as `|steer|` rises) as a later part of this step.

- **3a result:** v0.35 (`brake_gain` 0.08): 1:31.18, +0.44 s, ❌ rejected. Over-speed while braking fell 3.2 → 2.2 km/h, but that only made the car brake earlier (~+0.02 s in every braking section). The ~3 km/h over-speed at gain 0.05 is effectively later braking on a curve the car can follow. So 3b goes ahead on `brake_gain` 0.05.
- **New measurement (v0.35):** pedal 0.3–0.5 gives 18–21 m/s², full pedal at ~190 km/h ~30 m/s² (aero downforce). This adds **3c: a speed-dependent `brake_decel`** (more at high speed), designed from measured deceleration against speed. Exclude the Corkscrew transition (~2,475–2,490 m), where the car unloads or jumps (user) and the wheel data is unreliable.

Original step text:

- **Change (two parts, one version each):**
  - a. `brake_gain` 0.05 → ~0.08.
  - b. `brake_decel` 11 → 12.5 → 14 (one version per value).
- **Why:** the car decelerates exactly as the plan assumes (~11 m/s²), but 16.4 m/s² was measured at pedal 0.57. The old "11.5 limit" was only the most the pedal ever reached, not the car's limit.
  - With `brake_gain` 0.05 the car must be 6 km/h over the allowed speed before the pedal reaches 0.3.
  - A higher gain makes the pedal follow the planned curve and should reduce the on/off braking.
  - A higher `brake_decel` then moves the braking points later.
- **Expected impact:** ~0.2 s per big braking zone, 0.8–1.5 s in total.
- **Watch:** how often the ABS fires, wheel lock, sideways speed on corner entry, braking-phase splits.
- **Reject if:** any damage, `|trackPos|` > 1, or slides on corner entry.
- **Later follow-ups in this area:** `brake_margin` 15 → 8 m. Then trail braking (user request): taper the pedal as `|steer|` rises, so part of the slowing happens after turn-in. 87% of braking is at `|steer|` < 0.2 now.

### 4. Throttle and traction control (plan D, step 2) — 4b partly done early (v0.39); straight-line slip limit done (v0.43, −0.89 s), its slide guard widened (v0.45, −0.38 s); 4a (dead band) no gain (v0.42 trials) — **v0.49 `tc_slip_slide` 20 −0.11 s ✅; v0.51 lift band (4a re-opened) −0.41 s ✅; v0.57 smoothed sharpness fade −0.23 s ✅; TC limits mid-bend no gain (v0.54 trials)**

- **v0.39 (`tc_hold` 0.8, the cut fades instead of releasing at once): 1:27.44, −0.15 s ✅.** Flick slide 19.4 → 11.7 km/h, throttle jumps 363 → 40. Still open: 4a brake dead band, and a speed-dependent slip target.

- **Change (two parts, one version each):**
  - a. **Brake dead band:** don't brake when less than ~2–3 km/h over the allowed speed, and don't zero the stored throttle on light touches.
  - b. **Retest `tc_slip` by speed band:** log acceleration against slip while traction control is cutting. Then consider a speed-dependent slip target, or a cut that decays over a few steps instead of chattering 0 ↔ 1.
- **Why:** traction control cuts the throttle for 11.1 s of the lap, and 9.3 s of that is while the car is ≥ 10 km/h under the allowed speed. The 54 short brake releases inside braking zones each reset the stored throttle to 0. The 2.5 m/s slip target was measured mostly at low speed.
- **Expected impact:** 0.5–1.5 s.
- **Watch:** time under traction-control cut, sideways speed on corner exits (hairpin, flick), braking-phase splits.
- **Reject if:** any damage, `|trackPos|` > 1, or exit slides growing.

### 5. Racing line that maximises the corner radius (plan C) — **v0.52 apex line −0.49 s ✅; v0.53 inside line integral −1.37 s ✅; v0.58/v0.59 corner set-up ✅; v0.61 exit release −0.24 s ✅; full width (5b–5c) needs the planned-line redesign (batch 4)**

- **v0.47 trials:** the car uses \|trackPos\| ≤ 0.3 in most sections and sits 0.3–0.8 short of the line target in corners. Pre-positioning to the outside from the longest beam (detectable 100+ m out) reached only −0.34 of a −0.5 target in 100 m and left the flick approach on the wrong side (2–3 of 10 perturbations off); an outside line held while braking cost 1.5–4.7 s. A stronger tracking term (5b) is the prerequisite.
- **v0.52:** the inside target near the apex goes `line_apex` 0.34 further in (0.81), faded out with \|steer\| 0.3–0.55 so the hairpin and flick get none: −0.49 s, suites −0.6 s. A wider **outside** target (0.6–0.7) left the track in 5–7 of 30 at the flick approach; `line_gain` 0.7 oscillated (11 of 30 off); capping or fading the line pull was slow (79.10–80.63). The car still sits within ±0.3 in most sections: 5b (heading aimed at the line) remains the way to the full width.

Merged: the user's "strengthen the line" step, plus the angle-safe braking plan that the v0.33 analysis showed must come first.

- **5a. Braking plan safe when the car is angled (enabling).**
  - **Change:** when the car points away from the road direction, check whether it can turn back parallel to the road, at `turn_grip`, before it reaches the edge. Today the plan only checks curving onto a beam. If it can, the false end of road seen by the nose beams no longer limits the allowed speed. Our own design, from the beam geometry.
  - **Expected impact:** ~0 s with today's narrow line. Required for 5b.
- **5b. Let the line angle the car more.**
  - **Change:** aim the heading term at the line, instead of adding a pull that the heading term cancels. Allow a car angle of ~5–6° instead of ~2.5°. This covers the user's `line_gain` 0.5 → 0.8 → 1.2 with no 0.21 cap, and the centring term aimed at the line instead of 0. One version each.
- **5c. Use the full width.**
  - **Change:** `line_offset` 0.5 → ~0.85, so the car enters wide, clips the apex and runs out to the edge on exit. The user's guidance: the 0.8 wheel-on-edge figure is not a hard rule; on a straight with a left turn coming, move as far right as possible.
- **Why:** the car uses almost none of the 12 m track (mean `|trackPos|` 0.17). A wider entry and exit give a larger corner radius, which also raises step 2's corner speeds.
- **Expected impact:** 1–2 s.
- **Watch:** `|trackPos|` (over 1 rejects), the hairpin exit, the flick, false braking on straights when the car is angled (`ahead` collapsing, as in v0.25), and the v0.32 oscillation coming back.
- **Reject if:** any damage, `|trackPos|` > 1, or the steering oscillation of v0.32 comes back.
- **5d. Steering smoothness (plan G), only if oscillation remains after 5b–5c.** Steering gain falling with speed, and a rate limit falling with speed.

### 6. Gearbox (plan F) — upshift done early (v0.42, 18,500: −1.23 s); hunting gone as a side effect; **v0.54 `downshift_rpm` 15,000 + `upshift_rpm` 18,600 −0.27 s ✅**

- **Change:** `upshift_rpm` 15,000 → ~17,000, then (separate version) fix the 2↔3 gear hunting around 2,550–2,650 m.
- **Why:** torque peaks at 16,000–18,000 rpm; shifting at 15,000 drops the engine below the peak in every gear.
- **Expected impact:** 0.3–1 s.
- **Watch:** wheelspin and traction-control cuts after shifts, gear reversals.
- **Reject if:** any damage, `|trackPos|` > 1, or slower.

## Summary

| Step | Change | Est. gain | Risk | Status |
|---|---|---|---|---|
| 1 | Steady line target (v0.33) | ~0 s (enabling) | Low | ✅ −0.34 s |
| 2 | `turn_grip` 6 → 7 → 8 → 9 | 1–3 s | Medium (corner slides, hairpin entry) | ✅ 7: −0.29 s; 8/9 skipped, then re-tested (v0.41 trials): 9 −1.12 s on v0.40; ✅ speed-dependent grip (v0.44): −1.65 s; ✅ sharpness fade 0.5–0.75 (v0.47): −0.05 s (−0.16/−0.23 over suites); ✅ grip to spare at light steering (v0.60): −0.06 s (suites −0.09 s); `corner_speed` 76 ✅ (v0.62) |
| 3 | `brake_gain` 0.08, then `brake_decel` 12.5 → 14, then speed-dependent `brake_decel` | 0.8–1.5 s | Medium (lock-ups, entry slides) | 3a ❌ (+0.44 s); 12.5 ✅ −1.76 s; 14 ✅ −1.40 s; slide brake ❌ (v0.38); 3c `brake_aero` ✅ −1.49 s (v0.40); refit (aero 0.006, cap 28, crest load) ✅ −0.53 s (v0.48); ABS at 15 % slip ✅ −0.11 s (v0.55); plan rise-limit ❌ (v0.56) |
| 4 | Brake dead band, then speed-dependent traction control | 0.5–1.5 s | Low–medium | 4b fade ✅ −0.15 s (v0.39); straight-line slip limit ✅ −0.89 s (v0.43); slide guard 14 km/h ✅ −0.38 s (v0.45); dead band no gain; guard 20 ✅ −0.11 s (v0.49); lift band ✅ −0.41 s (v0.51); smoothed sharpness fade ✅ −0.23 s (v0.57) |
| 5 | Angle-safe braking plan, line aimed by heading (larger angle), `line_offset` ~0.85 | 1–2 s | High (track limits, hairpin) | open; v0.47 trials: the line term can't hold an outside pre-position (2–3 of 10 off), so 5b (stronger tracking) comes first; apex line ✅ −0.49 s (v0.52); inside line integral ✅ −1.37 s (v0.53); outside integrals no gain (v0.56); corner set-up ✅ enabling (v0.58) + re-tune −0.22 s (v0.59); exit release ✅ −0.24 s (v0.61); six more line add-ons no gain (v0.62) |
| 6 | `upshift_rpm` ~17,000, fix 2↔3 hunting | 0.3–1 s | Low | ✅ 18,500: −1.23 s (v0.42); hunting gone; ✅ `downshift_rpm` 15,000 / `upshift_rpm` 18,600 −0.27 s (v0.54) |
| — | Off-plan: `target_speed` 200 → 250 → 300 | — | Low | ✅ −1.60 s (v0.41); ✅ 300 −0.07 s (v0.46, cap removed) |
| | **Total** | **~4–8 s** | | |

## Batch 4 theme: the racing line (user, 2026-10-02)

The user asked to make the racing line the focus of batch 4: carrying momentum through corners, since the line is still far from optimal. This promotes plan step 5 (5b–5c) over the ranked ideas below; agents still form their own view first.

**Width use on v0.57** (`runs/run_20261002_141255.csv`; + = outside of the bend, − = inside, ±1 = edge; a textbook line is ~+0.8 → −0.85 → +0.8):

| Corner | Slowest speed | Entry (−80 m) | Slowest point | Exit (+80 m) | Speed in / out |
|---|---|---|---|---|---|
| 448 m L | 98 km/h | −0.08 | **+0.15** | +0.21 | 204 / 120 |
| 786 m R | 114 | +0.15 | −0.09 | +0.10 | 190 / 184 |
| 1041 m R | 146 | +0.04 | −0.54 | +0.12 | 227 / 196 |
| 1523 m L | 131 | −0.13 | −0.37 | −0.28 | 222 / 172 |
| 1926 m L | 115 | +0.06 | −0.21 | +0.04 | 252 / 180 |
| 2477 m R (flick) | 64 | +0.32 | −0.80 | −0.09 | 184 / 143 |
| 2989 m R | 134 | −0.07 | −0.39 | +0.13 | 217 / 196 |
| 3283 m L (hairpin) | 60 | −0.10 | **+0.62** | +0.40 | 204 / 172 |

Measured with `python tools/width.py [csv]`: corners = speed minima (lowest within ±120 m, < 200 km/h); side from the sign of `steer` at the minimum; value = −side·`trackPos` at −80 m / the minimum / +80 m.

**Why the current line can't reach this:** it is a pull (`(target − trackPos)·line_gain`, plus the v0.53 inside integral) on top of a centre-following controller (`angle·15/π − trackPos·0.10 − aim·lookahead_gain`); the target is active only within ~50 m of a corner, too late to set up wide (v0.47: −0.34 of a −0.5 target in 100 m); the heading and centring terms cancel it; and it has no notion of exit speed. A wider outside target broke the flick approach (v0.52: 5–7 of 30 off).

**Direction (hypothesis):**
1. **Planned line + path-following steering:** read each corner's direction and sharpness early (longest beam, 100+ m), set a target path outside → late apex → outside, and steer toward a point on that path a set distance ahead (pure pursuit) instead of adding a pull, so the base terms don't fight it. The sharpness plan reads the beams from the car's actual position, so a real outside position already earns more allowed speed.
2. **Exit-weighted apexes** where a long straight follows (hairpin → finish straight, 448 m, 1926 m): give up a little entry speed for exit speed.
3. **The flick as an S-bend:** line up for its second part, not its first.
4. **The hairpin:** no beam signal before ~40 m (track memory on hold): at most a tighter inside point.

**Estimate:** geometry only — a 90° corner using ~9.6 m of width instead of the centre gains ~30 m of radius; on a 50 m corner ≈ +25 % corner speed. Not measured. The first version may be slower while tuned: an enabling change under rule 8.

## Strongest open ideas (measured, updated v0.62)

Each is a hypothesis for the next agent, not an instruction. Measured with the `tools/` harness (3×10 perturbation suites, `tools/README.md`); compare suite means, not single laps (chaotic by ~±0.2 s). "All-30" = mean of the 30 suite runs (v0.62: **76.335**). The **flick** is still the shared limit: the v0.62 suite maximum (0.923) is at its left→right steering flip (~2,477 m), and `corner_speed` 77 leaves the track there once in 30 every time. Batch 4 (theme: the racing line) found that the line's remaining time is **not reachable by adding pulls/targets on top of the present centre-following controller**: every lateral change in the braking zones (more or less pull) was slower, and the late apex was monotonically slower the later it came; what paid was on the exit side (v0.61 release) and in the plan (v0.60 grip to spare).

| Rank | Idea | Measured | Watch / risk |
|---|---|---|---|
| 1 | **Planned line + path-following steering** (the batch-4 theme's redesign): read the bend's side and sharpness early (beam asymmetry, as the v0.58 set-up does from ~160 m), lay out outside → apex → outside as a path, and steer by aiming at a point on it ("pure pursuit") instead of the line pull on top of centring + heading terms. Entries still only +0.05 to +0.32 at −80 m (1,520 m and 1,930 m from the centre after 60–70 m of braking below the 2° bend threshold; flick first part from the inside) | untested as such. Pulls on top of the present controller: set-up hold 76.57–76.60 / 6 of 10 off, short-sight set-up 76.66–77.11, brake-scaled pull 76.44–76.55, full-width exit 77.11–77.18 (3 of 10 off), exit side hold 76.55–77.14 (all v0.62, suite 1 base 76.320); latched set-up 25 of 30 off (v0.59); `line_on` 1.5° 76.907 (v0.58) | expect an **enabling change** (rule 8): first version likely slower; the flick (S-bend) and hairpin exit are the risk points |
| 2 | **Make the plan credit the line:** in steady medium bends the car rides the plan at \|steer\| 0.2–0.35, below its grip, so the end-of-sight floor and sharpness plan, not the line, set the speed (v0.59). E.g. sharpness credit from the arc the car will actually take (outside position at turn-in → larger radius) | grip to spare at light steering ✅ −0.06 s (v0.60; gains on approaches/exits, not in the steady bends); "bend continues at the curvature seen" end-of-sight plan: 13–30 of 30 off even capped (v0.60): the end-of-sight speed must stay a floor without track memory | pairs with rank 1 |
| 3 | **Flick margin at the steering flip** (~2,472–2,480 m; S-bend: line up for its second part on the kink exit) | line-error speed feedback cut the flick max 0.77 → 0.55 but bought nothing spent on `corner_speed` 77/79 (76.559 / 2 off, v0.61); short-sight flick set-up 76.66–77.11 (v0.62); plan rise-limit ❌ v0.56 (+0.19 s); edge brake at full lock 76.90–77.03 | the margin is worth ~0.1–0.3 s via rank 4 |
| 4 | **`corner_speed` 76 → 77** | 1 of 30 off in every trial v0.55–v0.62 (e.g. v0.60 76.587, v0.61 76.554); 76 safe on all 30 (v0.62, −0.08 all-30) | the flick cliff sits between 76 and 77; only after rank 3 |
| 5 | **Flick-approach crest braking:** brake at a flat ABS-halved 0.50 (~21 m/s² vs ~27 before the hairpin), 20–40 km/h over the plan through the kink; wheel speeds over the crest are unreliable, so the ABS may cut on false lock | `abs_ratio` 0.9 → 7 of 30 off; `abs_cut` 0.7 → 30 off; proportional slip ABS 76.80–76.89 at max 0.92–0.98 (v0.55); crest lift 77.22–77.50; brake feedforward 77.20–77.54 | braking gains land on the flick |
| 6 | **Exit width where a straight follows** (hairpin → finish straight, 448 m, 1,926 m): v0.61's release frees steering but exits reach only −0.12 to +0.45 at +80 m | `rel_share` 1.0/1.2/1.5 → 76.378/76.351/76.454; full-width exit 77.11–77.18 (3 of 10 off, hairpin exit 0.93); exit offset/pull 76.62–76.89, 1–4 off (v0.61) | hairpin exit margin; likely part of rank 1 rather than another target |
| 7 | **Medium-corner brake/throttle sawtooth:** brake time 14.8 s, ~32 applications | lift band (v0.51) and smoothing (v0.57) each removed part; no direct trial since | |
| 8 | **Hairpin set-up wide** before turn-in | no beam signal before ~40 m (road ends square, beams symmetric) | needs track memory (on hold) |
| 9 | `rel_start`/`rel_share` re-tune with `corner_speed` 76 | (0.75, 6, 2) 76.377 but max 0.907 (v0.61); `rel_start` 5 → 76.339 vs 76.335 (v0.62) | noise-level |
| 10 | `downshift_rpm` 15,000 → 15,500 (with `upshift_rpm` 18,650); traction limit mid-bend | 76.934 on v0.55; `tc_slip`/`tc_slip_steer`/`tc_gain` 77.39–77.46 on v0.53 | plateau; more slip is not faster |
| — | Tested without gain in batch 4: smoothing the set-up chatter (cap/low-pass/aim gate 76.44–76.69, 1–4 off), set-up integral (76.48–76.67), late apex ramp (76.66–77.45), S-bend gap rule (76.71–76.84), later/narrower inside phase (76.91–77.44, 5 off), wider exit target (77.15–77.60, 2 off), speed-scaled line pull (76.74–77.22), dropping the look-ahead term on the approach (`appr_aim` 76.78–77.33), `turn_grip` 7.3 (76.592), `line_isteer` 0.5 (76.867), `apex_steer` 0.4 (76.794), `setup_road` 105 (76.345) | | |
| — | Tested without gain in batch 3: `aim` beam rise-rate limit (v0.53/v0.54: dead once the integral is in), slip-compensated heading term (78.43–79.71, 0–2 off), line knobs and Optuna co-tune `li54`, medium-bend grip boost (77.30–77.34), grip + `corner_speed` in medium bends (29–30 of 30 off), `turn_grip` 7.5/8, `turn_grip_aero` 2e-4, `brake_gain` 0.04/0.065, throttle ramp 0.03–0.15/step (0.05 still best, ≥ 0.10 off), deficit-scaled ramp (1–3 off), `lowest_running_gear` 1 (v0.23 rule holds), `lock_throttle` 0.25, `lock_throttle_edge` 0.15, plan hold (v0.56 ❌) | | |
| — | Tested without gain in batch 2: steering low-pass (79.40–79.69 on v0.50/v0.51), allowed speed falling slowly (79.32–79.43, max 0.93–1.18; overlaps the lift band), allowed-speed persistence (superseded by the lift band), `tc_slip_straight` 6 (79.25–79.51), `brake_gain` 0.055 (79.35–79.57), `lock_steer` 0.55 (79.25–79.52), `turn_grip` 7.5 (1 off, v0.52) and 8.5–9 (off, v0.49), sight-closing-rate plan (off, v0.49), raising full-lock throttle with room (5–10 of 10 off, v0.50), wider outside line target (5–7 of 30 off, v0.52), line-pull guards (cap/lock/brake fade, 79.10–80.63), `brake_max` 26/30 (slower / 2 off, v0.48) | | |
| — | Tested without gain in v0.47 (on v0.46): outside line while braking (+1.5–4.7 s), hard `turn_steer_max` 0.65/0.7 (suite means 80.081/79.985 but 1 off each, `corner_speed` 77), narrow fade windows (1 off each) | | |
| — | Tested without gain in v0.46 (on v0.45): ABS threshold 0.75–0.9, slip-ratio traction control (80.28–81.41), look-ahead weighting d^1–d^3 and capped weights, `aim` smoothing, proportional throttle near the allowed speed (80.43–80.69), `downshift_rpm` 12,500–17,000, `lookahead_gain` 1.6–3.0, `max_steer_step` 0.1 (off)/0.3, `tc_gain`, `tc_hold`, centring and heading gains | | |
| — | Tested without gain in v0.45 (on v0.44): friction-circle braking plan (81.09–85.49), edge guard (can't save `brake_aero` 0.006), relaxed sharpness beam margin (hairpin exit 0.92 or off), throttle memory over brake touches, short-shift, `lock_throttle` 0.15/0.25/0.3 (0.3 off), `upshift_rpm` 18,000/18,300, `tc_slip` 2–3.5, `tc_slip_straight` 6–8, capped planned deceleration (off or ≥ 0.93) | | |
| — | Rejected in v0.43 trials: steering cap 0.6–0.9 | 83.83–84.69 on v0.42, **off track at the hairpin exit** (1.09–1.19) | full lock is needed at the hairpin |

## Standing notes

- **Leave the full-lock limits (`lock_throttle` 0.2, `lock_throttle_edge` 0.1) alone** until step 5b is done (v0.56 re-check: 0.25 / 0.15 within noise): the hairpin-exit and flick margins depend on them, and the v0.51 lift band relies on v0.50's margin.
- **Track memory (plan H) is on hold** until the competition officials confirm it is allowed.
- **Target 1:14.72** (user, 2026-10-02): 1.41 s below v0.62 (1:16.13). The old ~1:24 target was beaten at v0.42. Batch 2 gained 1.53 s, batch 3 1.99 s, batch 4 0.44 s; the rest needs new mechanisms (a planned line with path-following steering, flick margin), not knob nudges or more pulls on top of the present line controller.
- **All gains are estimates.** Only measured values go into `CHANGELOG.md`.
