# AI Racing — Experiment Changelog

All experiments are conducted in TORCS via `gym_torcs`.  
Results are real measured values only — no invented data.  
The driver lives in a single file, `snakeoil3_v1.py`. Each version is a Git commit tagged with its version number (e.g. `v0.3`). To run an older version: `git checkout v0.2 -- snakeoil3_v1.py` (restore with `git checkout main -- snakeoil3_v1.py`).

---

## v0.1 — Baseline (unmodified `drive_example`)

| Field | Detail |
|---|---|
| **Version** | v0.1 |
| **What changed** | Nothing — this is the original unmodified `drive_example()` function with `target_speed = 300` km/h and no brake logic. |
| **Why** | Establish a baseline to compare all future changes against. |
| **Prediction** | N/A (baseline) |
| **Lap time** | DNF — car did not complete a lap |
| **Damage** | N/A |
| **Top speed** | N/A |
| **Min speed** | N/A |
| **Observed** | Car crashed into a wall and got stuck before completing the first lap. The `drive_example` function never sets `R['brake']`, and `target_speed = 300` km/h means the car arrives at every corner carrying far more speed than the throttle-bleed logic can scrub. |
| **Decision** | ❌ Rejected — cannot complete a lap |
| **Learned** | The car has no working brake. `target_speed = 300` is too aggressive for the basic steering and coasting logic to handle. Speed must be reduced before any other tuning is meaningful. |

---

## v0.2 — Lower `target_speed` to 80 km/h

| Field | Detail |
|---|---|
| **Version** | v0.2 |
| **What changed** | `target_speed` lowered from `300` → `80` km/h (line 533 of `snakeoil3_gym.py`). Single line, no other changes. |
| **Why** | At 300 km/h the only speed-reduction mechanism (`R['accel'] -= 0.01` per step) cannot scrub enough speed before a corner. Lowering the target gives the coasting logic room to work and makes the `steer * 50` corner-suppression term meaningful (at 80 km/h it can reduce the effective target to ~30 km/h on full lock). |
| **Prediction** | Car should complete at least one lap without hitting walls. Lap time will be slow. Damage expected to be zero or very low. |
| **Lap time** | 2:43.38 |
| **Damage** | 0 |
| **Top speed** | 109 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Car completed a full lap with zero damage. Top speed of 109 km/h exceeded the 80 km/h target (as expected — the target is a soft ceiling, not a hard cap, and the ramp logic allows brief overshoots). Min speed of 49 km/h shows the car is slowing appropriately for corners. Lap time is slow but the primary goal — completing a lap reliably — was achieved. |
| **Decision** | ✅ Kept — first successful lap completed |
| **Learned** | `target_speed` is the single highest-leverage safety knob. Dropping it from 300 to 80 transformed a crash into a clean lap with zero damage. The car is capable of ~109 km/h top speed even with an 80 km/h target, which means there is headroom to raise it carefully. The absence of `R['brake']` was not fatal at this speed — the throttle-bleed and `steer * 50` suppression are sufficient at low targets. Next investigation: how high can `target_speed` go before damage reappears? |

---

## v0.3 — Fix signed steer in corner speed reduction (+ stop run on damage)

| Field | Detail |
|---|---|
| **Version** | v0.3 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.3`). Line 541: `target_speed - (R['steer']*50)` → `target_speed - (abs(R['steer'])*50)`. Also added a check in the main loop that ends the run as soon as `damage > 0` and prints the damage, distance raced and current lap time. `target_speed` stays at `80` km/h; no other driving logic changed. |
| **Why** | `steer` is signed (+ = left, − = right). The old formula lowered the target speed in left-hand corners but **raised** it in right-hand corners, so the car only slowed for half the corners. This has to be fixed before speeds go up, or right-handers will be where the car crashes. The damage stop enforces the zero-damage rule: a run that takes any damage is a failed run, so there is no point continuing it. |
| **Prediction** | Car slows for right-hand corners as well as left-hand ones. Lap time likely the same or slightly slower than v0.2 (2:43.38), because the car now gives up speed it was carrying through right-handers. Min speed may drop slightly below 49 km/h. Damage should stay at 0 and the run should not be stopped early. |
| **Lap time** | 2:48.72 |
| **Damage** | 0 |
| **Top speed** | 86 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 5.34 s slower than v0.2 (2:43.38 → 2:48.72). Top speed fell from 109 to 86 km/h; min speed was unchanged at 49 km/h. |
| **Decision** | ✅ Kept — slower, but this is a correctness fix that must be in place before speeds are raised |
| **Learned** | The v0.2 top speed of 109 km/h was most likely caused by the sign bug rather than normal overshoot: in right-hand corners the target was raised by up to 50 km/h (80 → ~130), so the car was speeding up into right-handers. With the bug fixed, the car stays within ~6 km/h of the 80 km/h target. Part of v0.2's lap time came from carrying unsafe speed through right-handers — the 5.34 s loss is the honest cost of slowing for every corner. The car now needs a real brake to go faster safely. |

---

## v0.4 — Forward-sensor braking with ABS, `target_speed` 80 → 120 km/h

| Field | Detail |
|---|---|
| **Version** | v0.4 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.4`). Added brake planning: the longest of the three straight-ahead beams (`track[8..10]`, −0.5° / 0° / +0.5°) gives the visible road ahead, and `allowed_speed = sqrt(v_corner² + 2·a·(ahead − margin))` is the fastest speed from which the car can still slow to `corner_speed` in that distance (`corner_speed = 50` km/h, `brake_decel = 5.0` m/s², `brake_margin = 15` m). Throttle now aims for the lower of the old corner-adjusted target and `allowed_speed`. When `speedX > allowed_speed`, the brake is applied in proportion to the excess (`0.05` per km/h, full brake at 20 km/h over) and throttle is cut to 0. Added simple ABS: if the slowest wheel turns more than 20% slower than the car is moving (above 20 km/h), the brake is halved. `target_speed` raised from `80` → `120` km/h. Steering, traction control and gears unchanged. |
| **Why** | The car has never used `R['brake']`; its only way to slow down is releasing the throttle 0.01 per step, which is why `target_speed` has been stuck at 80. A brake that plans from the visible road lets the car go faster on straights and still arrive at corners slowly. 120 km/h is a modest first step so the brake logic can be checked before going higher. With these settings the allowed speed is ~163 km/h with 200 m of clear road, ~116 km/h at 100 m, ~67 km/h at 30 m and 50 km/h at 15 m or less. ABS is included because full brake on this car can lock the wheels, and a locked front wheel cannot steer. |
| **Prediction** | Top speed rises toward 120 km/h on the longer straights. The car brakes visibly before corners. Min speed should stay near 49–50 km/h. Lap time should be faster than v0.3 (2:48.72), possibly faster than v0.2 (2:43.38). Damage expected to stay at 0. Corner exits will still be slow because throttle restarts from 0 after braking and only rises 0.01 per step — that is the next change. |
| **Lap time** | 2:31.18 |
| **Damage** | 0 |
| **Top speed** | 144 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 17.54 s faster than v0.3 (2:48.72 → 2:31.18) and 12.20 s faster than v0.2 (2:43.38) — the fastest lap so far. Top speed rose from 86 to 144 km/h, 24 km/h above the 120 km/h target. Min speed was unchanged at 49 km/h. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | Braking from the visible road works: the car went 58 km/h faster at its peak and still slowed to the same 49 km/h minimum with no damage. `target_speed` is not a hard cap — the brake only acts on `allowed_speed`, and the throttle only closes 0.01 per step, so the car can overshoot `target_speed` by ~20+ km/h on long straights. That overshoot is currently "free" speed that the brake planner keeps safe. The 49 km/h minimum has not moved since v0.2, which suggests the slowest corner is limited by the `steer*50` corner reduction (and `corner_speed = 50`), not by braking. Corner exits are still slow: after braking, throttle restarts from 0 and takes 2 s to reach full. |

---

## v0.5 — Faster throttle ramp-up (0.01 → 0.05 per step)

| Field | Detail |
|---|---|
| **Version** | v0.5 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.5`). Line 552: throttle ramp-up step `R['accel']+= .01` → `R['accel']+= .05`. Single value, no other changes. The ramp-down step (`-= .01`) is unchanged. |
| **Why** | After every braking zone the brake logic sets the throttle to 0, and at `+0.01` per step it took 100 steps (2 s) to get back to full throttle — the car was crawling out of every corner. At `+0.05` it reaches full throttle in 20 steps (0.4 s). Only the ramp-up is changed so the effect is isolated: the ramp-down and the overshoot behaviour seen in v0.4 stay the same. Traction control (−0.2 when the rear wheels spin) is already in place to catch wheelspin from the harder throttle. |
| **Prediction** | Faster acceleration out of corners and a faster lap than v0.4 (2:31.18). Top speed similar to or slightly above 144 km/h, since the car reaches the straights sooner. Min speed should stay near 49 km/h (still set by the corner logic). Possible brief wheelspin on exits from slow corners. Damage expected to stay at 0. |
| **Lap time** | 2:27.84 |
| **Damage** | 0 |
| **Top speed** | 145 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 3.34 s faster than v0.4 (2:31.18 → 2:27.84) — the fastest lap so far. Top speed was essentially unchanged (144 → 145 km/h) and min speed was unchanged at 49 km/h. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | A single-value throttle change gained 3.34 s with no change in top or min speed, so the gain came from the time spent accelerating between corners, as predicted. Top speed barely moved, which points at the car's ability to accelerate (not the throttle command) as the limit on the straights. Checking `car1-ow1.xml` confirms why: the engine's torque peaks at 16,000–18,000 rpm (limiter 18,700), but the fixed speed-based shift points change up at only 7,400–10,800 rpm — at 145 km/h the car is in 5th at ~9,200 rpm, when 2nd gear would put it at ~15,900 rpm. |

---

## v0.6 — Shift gears on engine RPM instead of fixed speeds

| Field | Detail |
|---|---|
| **Version** | v0.6 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.6`). Replaced the fixed speed shift points (50/80/110/140/170 km/h) with RPM-based shifting (lines 575–596): shift up when `rpm > 18000`; shift down when the lower gear would put the engine below 17,000 rpm (predicted from the `car1-ow1` gear ratios `[3.9, 2.9, 2.3, 1.87, 1.68, 1.54]`); wait 10 steps (0.2 s) after any shift before shifting again; 1st gear below 10 km/h. The shift decision starts from the last commanded gear (`R['gear']`). No other changes. |
| **Why** | `car1-ow1.xml` (in the TORCS install) shows torque peaks at 16,000–18,000 rpm with the limiter at 18,700 rpm, and 1st gear alone reaches ~127 km/h at the limiter. The old shift points changed up at only 7,400–10,800 rpm, so the engine never got near its torque peak — at 145 km/h the car was in 5th at ~9,200 rpm; in 2nd it would be ~15,900 rpm with roughly 1.8× the pushing force at the wheels. v0.5 showed acceleration between corners is where the time is. A simulated speed sweep of the new logic gives clean shifts with no hunting: up 1→2 at ~122 km/h and 2→3 at ~164 km/h; down 3→2 at ~155 km/h and 2→1 at ~115 km/h. |
| **Prediction** | Much stronger acceleration everywhere; the car should mostly use gears 1–3 on this track. Lap time faster than v0.5 (2:27.84). Top speed should rise, but is still capped by the brake planner (~163 km/h max with 200 m of clear road). Min speed should stay near 49 km/h. Risks: more wheelspin out of slow corners in 1st (traction control should catch it), and stronger engine braking on the rear wheels when downshifting under braking, which could make the car twitchy into corners. Damage expected to stay at 0. |
| **Lap time** | 2:29.85 |
| **Damage** | 0 |
| **Top speed** | 136 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 2.01 s **slower** than v0.5 (2:27.84 → 2:29.85). Top speed **fell** from 145 to 136 km/h. Min speed was unchanged at 49 km/h. |
| **Decision** | ❌ Rejected — slower lap and lower top speed. Driver code reverted to v0.5. |
| **Learned** | Keeping the engine in its torque band did not make the car accelerate harder — it accelerated worse (9 km/h lower top speed). So the extra force at the wheels was not turning into acceleration. Most likely cause (not verified — there was no telemetry): in 1st/2nd gear the rear tyres cannot transmit that much force, so they spin, and traction control (−0.2 throttle per step when the rear wheels spin) keeps chopping the throttle while the ramp-up (+0.05 per step) re-applies it. A secondary suspect is extra engine braking from downshifting at high RPM. The car appears to be **traction-limited**, not power-limited, at these speeds. Revisit RPM shifting only after traction control is improved (plan item 8), and with telemetry to confirm the cause. |

---

*Last updated after v0.6 run.*
