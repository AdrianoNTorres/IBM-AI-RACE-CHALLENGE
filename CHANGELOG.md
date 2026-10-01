# AI Racing — Experiment Changelog

All experiments are conducted in TORCS via `gym_torcs`.  
Results are real measured values only — no invented data.

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

*Last updated after v0.2 run.*
