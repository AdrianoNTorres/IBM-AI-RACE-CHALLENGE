# Improvement Plan — v0.33 → ~1:24

**Goal:** lower the lap time from **1:31.03** (v0.33, best so far) toward the **~1:24** another user reached, with **0 damage** and **never leaving the track** (`|trackPos|` > 1 = off track = reject).

This plan merges the user's improvement plan (written against v0.31) with Claude's racing-line analysis after v0.33. The order of each plan's tasks is kept. All gains are **estimates, not measurements**. Every step follows the CLAUDE.md workflow: one change per version, changelog entry, annotated tag. The user runs TORCS. Any damage or leaving the track means reject; slower versions may be kept only as enabling changes (rule 8).

## Current state

- **Best:** v0.47, 1:20.08 (TORCS 80.088 s), 0 damage. Telemetry: `runs/run_20261001_234606.csv`. (v0.46: 1:20.13, v0.45: 1:20.20, v0.44: 1:20.58, v0.43: 1:22.23, v0.42: 1:23.12, v0.41: 1:24.35, v0.40: 1:25.95, v0.39: 1:27.44.) The ~1:24 target is beaten by ~3.9 s; the goal is now as far below it as possible.
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

### 3. Braking to the real limit (plan E) ← **3c done (v0.40); next: the flick limit, `brake_gain` at the new deceleration levels, `brake_margin` 15 → 8**

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

### 4. Throttle and traction control (plan D, step 2) — 4b partly done early (v0.39); straight-line slip limit done (v0.43, −0.89 s), its slide guard widened (v0.45, −0.38 s); 4a (dead band) no gain (v0.42 trials)

- **v0.39 (`tc_hold` 0.8, the cut fades instead of releasing at once): 1:27.44, −0.15 s ✅.** Flick slide 19.4 → 11.7 km/h, throttle jumps 363 → 40. Still open: 4a brake dead band, and a speed-dependent slip target.

- **Change (two parts, one version each):**
  - a. **Brake dead band:** don't brake when less than ~2–3 km/h over the allowed speed, and don't zero the stored throttle on light touches.
  - b. **Retest `tc_slip` by speed band:** log acceleration against slip while traction control is cutting. Then consider a speed-dependent slip target, or a cut that decays over a few steps instead of chattering 0 ↔ 1.
- **Why:** traction control cuts the throttle for 11.1 s of the lap, and 9.3 s of that is while the car is ≥ 10 km/h under the allowed speed. The 54 short brake releases inside braking zones each reset the stored throttle to 0. The 2.5 m/s slip target was measured mostly at low speed.
- **Expected impact:** 0.5–1.5 s.
- **Watch:** time under traction-control cut, sideways speed on corner exits (hairpin, flick), braking-phase splits.
- **Reject if:** any damage, `|trackPos|` > 1, or exit slides growing.

### 5. Racing line that maximises the corner radius (plan C)

- **v0.47 trials:** the car uses \|trackPos\| ≤ 0.3 in most sections and sits 0.3–0.8 short of the line target in corners. Pre-positioning to the outside from the longest beam (detectable 100+ m out) reached only −0.34 of a −0.5 target in 100 m and left the flick approach on the wrong side (2–3 of 10 perturbations off); an outside line held while braking cost 1.5–4.7 s. A stronger tracking term (5b) is the prerequisite.

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

### 6. Gearbox (plan F) — upshift done early (v0.42, 18,500: −1.23 s); hunting gone as a side effect; `downshift_rpm` still open

- **Change:** `upshift_rpm` 15,000 → ~17,000, then (separate version) fix the 2↔3 gear hunting around 2,550–2,650 m.
- **Why:** torque peaks at 16,000–18,000 rpm; shifting at 15,000 drops the engine below the peak in every gear.
- **Expected impact:** 0.3–1 s.
- **Watch:** wheelspin and traction-control cuts after shifts, gear reversals.
- **Reject if:** any damage, `|trackPos|` > 1, or slower.

## Summary

| Step | Change | Est. gain | Risk | Status |
|---|---|---|---|---|
| 1 | Steady line target (v0.33) | ~0 s (enabling) | Low | ✅ −0.34 s |
| 2 | `turn_grip` 6 → 7 → 8 → 9 | 1–3 s | Medium (corner slides, hairpin entry) | ✅ 7: −0.29 s; 8/9 skipped, then re-tested (v0.41 trials): 9 −1.12 s on v0.40; ✅ speed-dependent grip (v0.44): −1.65 s; ✅ sharpness fade 0.5–0.75 (v0.47): −0.05 s (−0.16/−0.23 over suites) |
| 3 | `brake_gain` 0.08, then `brake_decel` 12.5 → 14, then speed-dependent `brake_decel` | 0.8–1.5 s | Medium (lock-ups, entry slides) | 3a ❌ (+0.44 s); 12.5 ✅ −1.76 s; 14 ✅ −1.40 s; slide brake ❌ (v0.38); 3c `brake_aero` ✅ −1.49 s (v0.40) |
| 4 | Brake dead band, then speed-dependent traction control | 0.5–1.5 s | Low–medium | 4b fade ✅ −0.15 s (v0.39); straight-line slip limit ✅ −0.89 s (v0.43); slide guard 14 km/h ✅ −0.38 s (v0.45); dead band no gain |
| 5 | Angle-safe braking plan, line aimed by heading (larger angle), `line_offset` ~0.85 | 1–2 s | High (track limits, hairpin) | open; v0.47 trials: the line term can't hold an outside pre-position (2–3 of 10 off), so 5b (stronger tracking) comes first |
| 6 | `upshift_rpm` ~17,000, fix 2↔3 hunting | 0.3–1 s | Low | ✅ 18,500: −1.23 s (v0.42); hunting gone; `downshift_rpm` open |
| — | Off-plan: `target_speed` 200 → 250 → 300 | — | Low | ✅ −1.60 s (v0.41); ✅ 300 −0.07 s (v0.46, cap removed) |
| | **Total** | **~4–8 s** | | |

## Strongest open ideas (measured, updated v0.47)

Closed-loop full laps with `run_race.py` (TORCS s). Each is a hypothesis for the next agent, not an instruction. **Compare suites, not single laps:** the lap is bimodal by ~0.2 s around steering spikes at corner exits (v0.47), and lap times are chaotic by ~±0.2 s. Suite 1 = 10 perturbed runs (unperturbed, `turn_grip_aero` 2e-4/1.25e-4, `turn_grip` 7.5, `line_offset` 0.6, `tc_slip_straight` 6, `corner_speed` 77, `brake_decel` 14.5, `lookahead_gain` 1.6, `brake_aero` 0.0045): v0.46 mean 80.260, **v0.47 mean 80.029** (0 off, max 0.901). Suite 2 (other knobs, see the v0.47 changelog): v0.46 80.391, v0.47 80.233. The suite harness is in `%TEMP%\t47\` (`suite.py`, `summ.py`, `tr.py`, config modules; ~41 s per 10-run suite). The flick's **approach** (2,382–2,433 m, a crest: low tyre load, v0.46) is the shared limit of the braking knobs; the full-lock phase is not (v0.45).

| Rank | Idea | Measured | Watch / risk |
|---|---|---|---|
| 1 | **Crest-aware braking plan + `brake_aero` 0.0055–0.006** (two changes): `brake_decel` × clip(1 + gain·a_z/g, 0.5, 1), a_z from `speedZ` (smoothed 0.7/0.3, dt 0.021 s) | on v0.46, suite 1 without the `brake_aero` perturbation (9 runs): ×1 + 0.006 → mean **79.567**; ×1 + 0.0055 → mean **79.746**, 0 off; braking zones everywhere −0.04 to −0.09 s each. On v0.45: ×1 + 0.006 → 79.842 single lap (kink slide 14.8 → 6.9 km/h) | **flick margin ~0:** ×1 + 0.006 1 of 9 off (`line_offset` 0.6 → 1.193 at ~2,480 m); ×1 + 0.0055 max 0.999; ×1.5 + 0.006 2 off; load also scaling the aero term 2 off; 0.007 off at the hairpin exit (1.55–1.74 at ~3,298 m). Needs a flick margin from elsewhere first (rank 2), or a better load model |
| 2 | **Racing line with a stronger tracking term** (plan step 5b: heading aimed at the line), then pre-positioning on straights (user's line guidance) | early bend side from the longest beam (v0.47 trial, on v0.46): threshold 1.7° → 80.206 single lap, flick 0.676 (exit slide 5.7 km/h); 0.5/1.0/2.5° → 80.218/80.236/80.432 | the current pull cannot hold an outside pre-position (reached −0.34 of a −0.5 target in 100 m), so the flick approach sits on the wrong side: 1.7° 2 of 10 off, 1.0° 3 off. The car barely uses the width (\|trackPos\| ≤ 0.3 in most sections). `line_gain` 1.2 alone oscillates off (v0.45) |
| 3 | `brake_aero` 0.004 → 0.005 alone | on v0.45: 79.830 (−0.38); + `target_speed` 300 → 79.610 single lap | **cliff:** 0.0055 → off (1.116); with 10 perturbations 2 of 10 off (`corner_speed` 77, `brake_decel` 14.5) |
| 4 | `tc_slip_slide` 14 → 16–20 | on v0.45: 16 → 80.124 (−0.08); on v0.44: 20 → 80.050 | medium-corner exit slides 12.1 (16) / 13.9 km/h (20); not re-measured on v0.47 |
| 5 | Sharpness fade window (0.8, 0.3) instead of (0.75, 0.25) | on v0.46: suite 1 mean 80.014 (max 0.952), suite 2 80.218 (max 0.903), 0 of 20 off | equal to v0.47 within noise; a reserve, not a gain |
| 6 | Launch slip: extra traction-control limit k·clip(1 − v/v0) at the start (new in v0.47 trials) | on v0.46: k 2 at v0 60 km/h → 80.078 single lap; start section −0.04 to −0.07 s | the lap difference is within the bimodal noise; needs a suite |
| 7 | Speed-dependent steering lock cap (lock falls above v0 over w km/h, floor m) (new in v0.47 trials) | on v0.46: (75, 25, 0.6) → 80.020, (80, 40, 0.5) → 80.064 single laps; flick 0.835–0.863 | (70, 40, 0.5) and (60, 60, 0.5) **off at the hairpin exit** (1.38/1.37); no safer at the flick |
| 8 | Slide-aware sharpness credit (credit fades with sideways speed) | on v0.45: 8/12 → 80.284 (+0.08), flick 0.810; on v0.44: 80.46–80.61 over 7 settings | 6/12 + `brake_aero` 0.005 left the track on v0.44; overlaps v0.47's fade |
| 9 | Full-lock brake (pedal ≥ 0.05, throttle 0 above `\|steer\|` 0.95 and 50 km/h) | on v0.44: 80.708 (+0.12) | flick 0.85 → 0.55, hairpin 64 → 52 km/h; does **not** make `brake_aero` 0.006+ safe (failure is in the approach) |
| 10 | Allowed-speed persistence (max of the last N steps, to skip short brake touches on straights) | on v0.45: N 3 → 80.128 (−0.08, hairpin exit 0.83); N 2 → 80.394 | N 5 off at the hairpin (1.166), N 8/12 off at the flick |
| — | Tested without gain in v0.47 (on v0.46): outside line while braking (+1.5–4.7 s), hard `turn_steer_max` 0.65/0.7 (suite means 80.081/79.985 but 1 off each, `corner_speed` 77), narrow fade windows (1 off each) | | |
| — | Tested without gain in v0.46 (on v0.45): ABS threshold 0.75–0.9, slip-ratio traction control (80.28–81.41), look-ahead weighting d^1–d^3 and capped weights, `aim` smoothing, proportional throttle near the allowed speed (80.43–80.69), `downshift_rpm` 12,500–17,000, `lookahead_gain` 1.6–3.0, `max_steer_step` 0.1 (off)/0.3, `tc_gain`, `tc_hold`, centring and heading gains | | |
| — | Tested without gain in v0.45 (on v0.44): friction-circle braking plan (81.09–85.49), edge guard (can't save `brake_aero` 0.006), relaxed sharpness beam margin (hairpin exit 0.92 or off), throttle memory over brake touches, short-shift, `lock_throttle` 0.15/0.25/0.3 (0.3 off), `upshift_rpm` 18,000/18,300, `tc_slip` 2–3.5, `tc_slip_straight` 6–8, capped planned deceleration (off or ≥ 0.93) | | |
| — | Rejected in v0.43 trials: steering cap 0.6–0.9 | 83.83–84.69 on v0.42, **off track at the hairpin exit** (1.09–1.19) | full lock is needed at the hairpin |

## Standing notes

- **Leave `lock_throttle` (0.2) alone** until step 5 is done. The hairpin exit margin depends on it.
- **Track memory (plan H) is on hold** until the competition officials confirm it is allowed.
- **1:24 is reachable but not certain** without plan H: the estimated total is ~4–8 s against a ~7 s gap.
- **All gains are estimates.** Only measured values go into `CHANGELOG.md`.
