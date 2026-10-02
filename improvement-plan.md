# Improvement Plan — v0.33 → ~1:24

**Goal:** lower the lap time from **1:31.03** (v0.33, best so far) toward the **~1:24** another user reached, with **0 damage** and **never leaving the track** (`|trackPos|` > 1 = off track = reject).

This plan merges the user's improvement plan (written against v0.31) with Claude's racing-line analysis after v0.33. The order of each plan's tasks is kept. All gains are **estimates, not measurements**. Every step follows the CLAUDE.md workflow: one change per version, changelog entry, annotated tag. The user runs TORCS. Any damage or leaving the track means reject; slower versions may be kept only as enabling changes (rule 8).

## Current state

- **Best:** v0.37, 1:27.59, 0 damage. Telemetry: `runs/run_20261001_201950.csv`. (v0.36: 1:28.99, v0.34: 1:30.74, v0.33: 1:31.03.) Gap to ~1:24: ~3.6 s. Baseline for this plan was v0.31 (1:31.37, `runs/run_20261001_191013.csv`).
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

### 1. v0.33 — Steady line target ✅ done

- **Result:** 1:31.03, −0.34 s, best lap. Better than the predicted ±0.2 s.
- **Effect:** steering reversals 71 → 38, target jumps 81 → 38.
- **What it enables:** step 5 (a stronger line), now that the target no longer follows the car's own nose.

### 2. v0.34 — Raise `turn_grip` 6 → 7 ✅ done (8 and 9 skipped)

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
  - Fade the sharpness plan out near `turn_steer_max` instead of switching it off (one full-brake step at ~2,574 m in v0.27).
  - A speed plan that knows the hairpin is tighter than the 75 km/h floor, if the hairpin margin shrinks.

### 3. Braking to the real limit (plan E) ← **next: v0.38 = slide under braking (`slide_brake` 5 km/h)**

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

### 4. Throttle and traction control (plan D, step 2)

- **Change (two parts, one version each):**
  - a. **Brake dead band:** don't brake when less than ~2–3 km/h over the allowed speed, and don't zero the stored throttle on light touches.
  - b. **Retest `tc_slip` by speed band:** log acceleration against slip while traction control is cutting. Then consider a speed-dependent slip target, or a cut that decays over a few steps instead of chattering 0 ↔ 1.
- **Why:** traction control cuts the throttle for 11.1 s of the lap, and 9.3 s of that is while the car is ≥ 10 km/h under the allowed speed. The 54 short brake releases inside braking zones each reset the stored throttle to 0. The 2.5 m/s slip target was measured mostly at low speed.
- **Expected impact:** 0.5–1.5 s.
- **Watch:** time under traction-control cut, sideways speed on corner exits (hairpin, flick), braking-phase splits.
- **Reject if:** any damage, `|trackPos|` > 1, or exit slides growing.

### 5. Racing line that maximises the corner radius (plan C)

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

### 6. Gearbox (plan F)

- **Change:** `upshift_rpm` 15,000 → ~17,000, then (separate version) fix the 2↔3 gear hunting around 2,550–2,650 m.
- **Why:** torque peaks at 16,000–18,000 rpm; shifting at 15,000 drops the engine below the peak in every gear.
- **Expected impact:** 0.3–1 s.
- **Watch:** wheelspin and traction-control cuts after shifts, gear reversals.
- **Reject if:** any damage, `|trackPos|` > 1, or slower.

## Summary

| Step | Change | Est. gain | Risk | Status |
|---|---|---|---|---|
| 1 | Steady line target (v0.33) | ~0 s (enabling) | Low | ✅ −0.34 s |
| 2 | `turn_grip` 6 → 7 → 8 → 9 | 1–3 s | Medium (corner slides, hairpin entry) | ✅ 7: −0.29 s; 8/9 skipped (not grip-limited) |
| 3 | `brake_gain` 0.08, then `brake_decel` 12.5 → 14, then speed-dependent `brake_decel` | 0.8–1.5 s | Medium (lock-ups, entry slides) | 3a ❌ (+0.44 s); 12.5 ✅ −1.76 s; 14 ✅ −1.40 s; ⏳ v0.38 slide brake |
| 4 | Brake dead band, then speed-dependent traction control | 0.5–1.5 s | Low–medium | |
| 5 | Angle-safe braking plan, line aimed by heading (larger angle), `line_offset` ~0.85 | 1–2 s | High (track limits, hairpin) | |
| 6 | `upshift_rpm` ~17,000, fix 2↔3 hunting | 0.3–1 s | Low | |
| | **Total** | **~4–8 s** | | |

## Standing notes

- **Leave `lock_throttle` (0.2) alone** until step 5 is done. The hairpin exit margin depends on it.
- **Track memory (plan H) is on hold** until the competition officials confirm it is allowed.
- **1:24 is reachable but not certain** without plan H: the estimated total is ~4–8 s against a ~7 s gap.
- **All gains are estimates.** Only measured values go into `CHANGELOG.md`.
