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

## v0.7 — Steer toward the open road ahead (+ telemetry log)

| Field | Detail |
|---|---|
| **Version** | v0.7 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.7`), built on v0.5 (v0.6 gear shifting reverted). Added an open-road steering term (lines 547–552): the bearing of the open road ahead is the average angle of the 19 track beams weighted by distance², and `R['steer'] -= bearing × lookahead_gain` with `lookahead_gain = 2.0` steer per radian. The track sensor angles moved to one list, `TRACK_ANGLES` (line 64), used both for the init message and this calculation (angles sent to the server are unchanged). Also added a telemetry logger that writes one CSV row per step to `runs/run_<date>_<time>.csv` (speed, gear, rpm, throttle, brake, steer, track position, angle, visible road ahead, rear wheelspin, damage) — it does not affect driving, and `runs/` is not committed to Git. |
| **Why** | The steering only reacts to where the car is now (`angle` and `trackPos`), so it starts turning only after the car is already misaligned in the corner — it turns in late. The longest track beams point where the road is going, so steering toward them turns the car in earlier and more smoothly. On a straight the beams are symmetric and the term is zero; for a typical left bend it adds about +0.26 steer. This is plan item 5 (next in order after gears). Speed-scaled steering gain from the same plan item is left out because no high-speed weaving has been seen at ≤145 km/h. Telemetry is added because v0.6's result could not be explained without data. |
| **Prediction** | Smoother, earlier turn-in and the car holding a tighter line through corners. Because steering rises earlier, the `abs(steer)*50` corner reduction also starts earlier, so the car may slow a little sooner for corners. Lap time expected similar to or slightly faster than v0.5 (2:27.84) — this change is mostly for stability, to prepare for higher speeds. Top speed similar to v0.5 (~145 km/h). Min speed may change slightly. Risk: if the gain is too high the car may cut toward the inside edge or weave on corner exit. Damage expected to stay at 0. |
| **Lap time** | 2:19.31 |
| **Damage** | 0 |
| **Top speed** | 145 km/h |
| **Min speed** | 50 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 8.53 s faster than v0.5 (2:27.84 → 2:19.31) — the fastest lap so far and the biggest single gain since braking (v0.4). Top speed unchanged at 145 km/h; min speed 49 → 50 km/h. Telemetry (`runs/run_20261001_154006.csv`, 6,574 steps — ~21 ms per step, not exactly 20 ms) shows: the car **braked for 43% of the lap** but the brake pedal never went above 0.28 (average 0.06); full throttle only 2% of the lap; max `|trackPos|` 0.37 — the car never went near the track edges; max sideways speed 2.6 km/h — no sliding at all; rear wheelspin above the traction-control threshold only 3% of the lap; gears 2–4 used almost exclusively. On the longer straights (around 1,300 m, 1,700 m, 2,200 m and 3,400 m from the start line) the car coasted with throttle closed at 120–145 km/h because it was above `target_speed`. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | Turning in earlier made a large difference even at unchanged top and min speeds, so the car was losing time mid-corner, not just on straights. The telemetry shows the car is driving far below its limits: (1) **Braking is far too gentle** — measured deceleration was ~4.9 m/s² at pedal 0.1, ~9.4 m/s² at 0.2 and ~11.5 m/s² at 0.3, but the planner assumes only `brake_decel = 5.0` m/s², so the car brakes lightly over very long distances. (2) **`target_speed` (120) is now limiting the straights** — the car coasts above it instead of accelerating. (3) **Grip and track width are unused** — no sliding and never beyond 37% of the way to an edge, so corner speeds can rise. (4) Wheelspin is rare in v0.5 gearing, so traction control (plan item 8) and edge slowdown (plan item 7) would gain little right now. The plan order is changed to follow the data: braking first, then `target_speed`, then corner speed. |

---

## v0.8 — Stronger braking plan (`brake_decel` 5.0 → 8.0 m/s²)

| Field | Detail |
|---|---|
| **Version** | v0.8 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.8`). Line 538: `brake_decel=5.0` → `brake_decel=8.0`. Single value, no other changes. |
| **Why** | v0.7 telemetry showed the car braking for 43% of the lap with an average pedal of only 0.06, because the planner assumes the car can only slow at 5 m/s². The same telemetry measured ~9.4 m/s² at pedal 0.2 and ~11.5 m/s² at pedal 0.3, so the brakes have far more to give. At 8.0 m/s² the planner lets the car brake later and harder: allowed speed with 100 m of road ahead rises from ~116 to ~142 km/h, and with 60 m from ~91 to ~111 km/h. The end-of-road speed (`corner_speed = 50` km/h) and the 15 m safety margin are unchanged, so the car still plans to reach the same corner speed — it just gets there later. 8.0 is kept well below the measured 11.5 m/s² as a safety reserve. |
| **Prediction** | Shorter braking zones and a clearly faster lap than v0.7 (2:19.31). Time spent braking should drop well below 43% and the brake pedal should go higher (roughly 0.15–0.25). Top speed similar (~145 km/h) because `target_speed` still limits the straights. Min speed similar (~50 km/h), possibly slightly higher because the brake controller lags a few km/h behind the planned speed when braking harder. ABS may start to act. Damage expected to stay at 0. |
| **Lap time** | 2:08.37 |
| **Damage** | 0 |
| **Top speed** | 148 km/h |
| **Min speed** | 50 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 10.94 s faster than v0.7 (2:19.31 → 2:08.37) — the fastest lap so far and the biggest single gain yet. Top speed 145 → 148 km/h; min speed unchanged at 50 km/h. Telemetry (`runs/run_20261001_154834.csv`): time spent braking fell from 43% to 29% of the lap; average brake pedal rose from 0.06 to 0.11 and max from 0.28 to 0.37. Max `|trackPos|` still 0.37, max sideways speed 2.5 km/h — no sliding, nowhere near the edges. For **27% of the lap** the car was at 118 km/h or more with the throttle mostly closed — sitting at the 120 km/h `target_speed` on every longer straight (around 1,300, 1,700, 2,100–2,200, 3,100 and 3,400 m from the start line). The slowest corners (~2,460 m: 50 km/h; ~480 m, ~1,925 m: 58–62 km/h) are where the visible road ahead drops to 15–22 m, i.e. they are set by the brake planner and `corner_speed`, not by the `steer*50` reduction. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | Braking later was worth almost 11 s with no loss of safety — the measured brake capability (~11.5 m/s² at pedal 0.3) was a reliable guide, and the pedal still never went above 0.37, so there is more braking available. The car's biggest remaining limit is now `target_speed`: over a quarter of the lap is spent held at 120 km/h on straights where the brake planner would allow up to ~200 km/h (200 m of clear road at 8.0 m/s²). Corner minimum speeds are set by the planner (`corner_speed`, `brake_margin`, visible road), so raising `target_speed` should mainly affect the straights. |

---

## v0.9 — Raise `target_speed` 120 → 160 km/h

| Field | Detail |
|---|---|
| **Version** | v0.9 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.9`). Line 536: `target_speed=120` → `target_speed=160`. Single value, no other changes. |
| **Why** | v0.8 telemetry showed the car held at ~120 km/h with the throttle closed for 27% of the lap, on every longer straight. The brake planner (`brake_decel = 8.0`) already allows up to ~200 km/h with 200 m of clear road and slows the car for corners on its own, so `target_speed` is no longer needed as a safety limit on the straights. 160 km/h is a moderate step (+40 km/h) that stays well inside the planner's limit. Side effect to watch: `target_speed` also feeds the corner reduction `target_speed − abs(steer)×50`, so the throttle aim in gentle corners also rises by 40 km/h — v0.8 telemetry shows the slowest corners are set by the brake planner, not this term, so the effect should mostly be on fast sweepers. |
| **Prediction** | Higher speeds on the straights: top speed roughly 155–165 km/h (up from 148), with harder and longer braking at the ends of the straights. Lap time faster than v0.8 (2:08.37). Min speed unchanged (~50 km/h), since slow corners are set by the brake planner. Fast sweeping corners will be taken quicker, which is the main risk — watch for the car running wide in fast bends. Damage expected to stay at 0. |
| **Lap time** | 2:02.25 |
| **Damage** | 0 |
| **Top speed** | 175 km/h |
| **Min speed** | 50 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 6.12 s faster than v0.8 (2:08.37 → 2:02.25) — the fastest lap so far. Top speed 148 → 175 km/h (15 km/h above the 160 target — the throttle eases off only 0.01 per step). Min speed unchanged at 50 km/h. Telemetry (`runs/run_20261001_155436.csv`): time at the speed cap fell from 27% to ~8% of the lap; full throttle rose from 3% to 14%; time spent braking rose from 29% to 41% (braking from higher speeds), with max pedal 0.68. The lowest speed in every section of the track was within 1–2 km/h of v0.8 — corner speeds did not change. Steering reached full lock (`|steer|` ≈ 1.0) at ~2,450 m and ~3,250 m. Max `|trackPos|` 0.37 and max sideways speed 2.4 km/h, the same as before: no sliding and the edges are still unused. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | Raising the speed cap gained 6 s on the straights alone, and fast sweepers caused no problems. Corners are now the main limit: the minimum speed in each corner has not changed since v0.7, because it is set by the brake planner — the car always plans to be able to slow to `corner_speed = 50` km/h within the visible road minus the 15 m margin, and in a corner the visible road is only ~15–25 m (allowed speed ~50–68 km/h). The car is not close to its grip limit there (no sliding) and uses only the middle third of the track, so corner speed can rise. Full steering lock at the two slowest corners comes from the steering gains saturating, not from the car being at its grip limit, but those two corners are where to watch first when corner speed goes up. |

---

## v0.10 — Raise `corner_speed` 50 → 60 km/h

| Field | Detail |
|---|---|
| **Version** | v0.10 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.10`). Line 537: `corner_speed=50` → `corner_speed=60`. Single value, no other changes. |
| **Why** | v0.9 telemetry showed corner speeds unchanged since v0.7 — every corner minimum is set by the brake planner, which only lets the car go as fast as it could still slow to `corner_speed` by the end of the visible road (minus 15 m). In corners the visible road is short (~15–25 m), so `corner_speed` is effectively the corner speed limit. The car shows no sliding and stays within the middle third of the track, so there is grip and room to spare. Raising `corner_speed` by 10 km/h (+20%) lifts the allowed speed at every distance, most of all in tight corners: with 15 m visible, 50 → 60 km/h; with 22 m, ~63 → ~71 km/h; with 30 m, ~75 → ~82 km/h; with 200 m, ~202 → ~205 km/h. |
| **Prediction** | Higher speeds through all slower corners and a minimum speed of roughly 58–62 km/h. Lap time faster than v0.9 (2:02.25). Top speed similar (~175 km/h). The car should start using more track width (`|trackPos|` above 0.37) and may show some sideways sliding. Main risk: the two slowest corners (~2,450 m and ~3,250 m from the start line), where steering is already at full lock — the car may run wide there. Damage expected to stay at 0; if the car leaves the track in those corners, this value should come back down to ~55. |
| **Lap time** | _Pending run_ |
| **Damage** | _Pending run_ |
| **Top speed** | _Pending run_ |
| **Min speed** | _Pending run_ |
| **Observed** | _Pending run_ |
| **Decision** | _Pending run_ |
| **Learned** | _Pending run_ |

---

*Last updated: v0.10 implemented, awaiting run.*
