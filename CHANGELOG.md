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
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 8.53 s faster than v0.5 (2:27.84 → 2:19.31) — the fastest lap so far and the biggest single gain since braking (v0.4). Top speed unchanged at 145 km/h; min speed 49 → 50 km/h. Telemetry (`runs/run_20261001_154006.csv`, 6,574 steps — ~21 ms per step, not exactly 20 ms) shows: the car **braked for 43% of the lap** but the brake pedal never went above 0.28 (average 0.06); full throttle only 2% of the lap; max `\|trackPos\|` 0.37 — the car never went near the track edges; max sideways speed 2.6 km/h — no sliding at all; rear wheelspin above the traction-control threshold only 3% of the lap; gears 2–4 used almost exclusively. On the longer straights (around 1,300 m, 1,700 m, 2,200 m and 3,400 m from the start line) the car coasted with throttle closed at 120–145 km/h because it was above `target_speed`. |
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
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 10.94 s faster than v0.7 (2:19.31 → 2:08.37) — the fastest lap so far and the biggest single gain yet. Top speed 145 → 148 km/h; min speed unchanged at 50 km/h. Telemetry (`runs/run_20261001_154834.csv`): time spent braking fell from 43% to 29% of the lap; average brake pedal rose from 0.06 to 0.11 and max from 0.28 to 0.37. Max `\|trackPos\|` still 0.37, max sideways speed 2.5 km/h — no sliding, nowhere near the edges. For **27% of the lap** the car was at 118 km/h or more with the throttle mostly closed — sitting at the 120 km/h `target_speed` on every longer straight (around 1,300, 1,700, 2,100–2,200, 3,100 and 3,400 m from the start line). The slowest corners (~2,460 m: 50 km/h; ~480 m, ~1,925 m: 58–62 km/h) are where the visible road ahead drops to 15–22 m, i.e. they are set by the brake planner and `corner_speed`, not by the `steer*50` reduction. |
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
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 6.12 s faster than v0.8 (2:08.37 → 2:02.25) — the fastest lap so far. Top speed 148 → 175 km/h (15 km/h above the 160 target — the throttle eases off only 0.01 per step). Min speed unchanged at 50 km/h. Telemetry (`runs/run_20261001_155436.csv`): time at the speed cap fell from 27% to ~8% of the lap; full throttle rose from 3% to 14%; time spent braking rose from 29% to 41% (braking from higher speeds), with max pedal 0.68. The lowest speed in every section of the track was within 1–2 km/h of v0.8 — corner speeds did not change. Steering reached full lock (`\|steer\|` ≈ 1.0) at ~2,450 m and ~3,250 m. Max `\|trackPos\|` 0.37 and max sideways speed 2.4 km/h, the same as before: no sliding and the edges are still unused. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | Raising the speed cap gained 6 s on the straights alone, and fast sweepers caused no problems. Corners are now the main limit: the minimum speed in each corner has not changed since v0.7, because it is set by the brake planner — the car always plans to be able to slow to `corner_speed = 50` km/h within the visible road minus the 15 m margin, and in a corner the visible road is only ~15–25 m (allowed speed ~50–68 km/h). The car is not close to its grip limit there (no sliding) and uses only the middle third of the track, so corner speed can rise. Full steering lock at the two slowest corners comes from the steering gains saturating, not from the car being at its grip limit, but those two corners are where to watch first when corner speed goes up. |

---

## v0.10 — Raise `corner_speed` 50 → 60 km/h

| Field | Detail |
|---|---|
| **Version** | v0.10 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.10`). Line 537: `corner_speed=50` → `corner_speed=60`. Single value, no other changes. |
| **Why** | v0.9 telemetry showed corner speeds unchanged since v0.7 — every corner minimum is set by the brake planner, which only lets the car go as fast as it could still slow to `corner_speed` by the end of the visible road (minus 15 m). In corners the visible road is short (~15–25 m), so `corner_speed` is effectively the corner speed limit. The car shows no sliding and stays within the middle third of the track, so there is grip and room to spare. Raising `corner_speed` by 10 km/h (+20%) lifts the allowed speed at every distance, most of all in tight corners: with 15 m visible, 50 → 60 km/h; with 22 m, ~63 → ~71 km/h; with 30 m, ~75 → ~82 km/h; with 200 m, ~202 → ~205 km/h. |
| **Prediction** | Higher speeds through all slower corners and a minimum speed of roughly 58–62 km/h. Lap time faster than v0.9 (2:02.25). Top speed similar (~175 km/h). The car should start using more track width (`\|trackPos\|` above 0.37) and may show some sideways sliding. Main risk: the two slowest corners (~2,450 m and ~3,250 m from the start line), where steering is already at full lock — the car may run wide there. Damage expected to stay at 0; if the car leaves the track in those corners, this value should come back down to ~55. |
| **Lap time** | 1:56.26 |
| **Damage** | 0 |
| **Top speed** | 170 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 5.99 s faster than v0.9 (2:02.25 → 1:56.26) — the first lap under 2 minutes. Top speed 175 → 170 km/h. Telemetry (`runs/run_20261001_155931.csv`): the reported 50 km/h minimum is the car crossing the start line while still accelerating from the standing start (the start-line section shows exactly 50 km/h in v0.9 too); the slowest corner was 59.9 km/h (was 50 in v0.9). Comparing time per 100 m section with v0.9, **every corner section got faster** — the biggest gains at the two slowest corners (~2,400 m: −0.69 s, ~3,200 m: −0.51 s) and at ~400 m (−0.54 s); corner minimum speeds rose 4–10 km/h everywhere. Braking 39% of the lap (max pedal 0.55), full throttle 14%. Max `\|trackPos\|` still 0.37 and max sideways speed 3.0 km/h (was 2.4) — still no real sliding and the edges still unused. |
| **Decision** | ✅ Kept — fastest lap so far (first under 2:00), still zero damage |
| **Learned** | `corner_speed` is a direct corner-speed knob: +10 km/h gave ~6 s, spread over every corner, with no loss of control. The car is still well inside its grip limit (sideways speed only up to 3.0 km/h) and still uses only the middle of the track, so there is more to gain. The start-line minimum (50 km/h) is set by the standing start and will not change with tuning — from now on the slowest corner from telemetry is the more useful “min speed”. The two full-lock corners (~2,450 m and ~3,250 m) remain the places to watch. |

---

## v0.11 — Raise `corner_speed` 60 → 70 km/h

| Field | Detail |
|---|---|
| **Version** | v0.11 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.11`). Line 537: `corner_speed=60` → `corner_speed=70`. Single value, no other changes. |
| **Why** | v0.10 showed `corner_speed` is the knob that sets corner speed: +10 km/h made every corner faster and gained ~6 s, while the car still showed almost no sliding (max sideways speed 3.0 km/h) and stayed in the middle of the track (max `\|trackPos\|` 0.37). Another +10 km/h step follows the same trend. Allowed speed with 15 m of road visible goes 60 → 70 km/h; with 22 m ~71 → ~80 km/h; with 30 m ~82 → ~90 km/h. |
| **Prediction** | Slowest corner around 68–70 km/h (from 60) and a faster lap than v0.10 (1:56.26), probably by a few seconds — the gain may be a little smaller than last time. Top speed similar (~170 km/h). Sideways speed and `\|trackPos\|` should start to rise as the car gets closer to its grip limit. Main risk: the two full-lock corners (~2,450 m and ~3,250 m) — if the car runs wide or slides there, this value should come back to ~65. Damage expected to stay at 0. |
| **Lap time** | 1:50.71 |
| **Damage** | 0 |
| **Top speed** | 175 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 5.55 s faster than v0.10 (1:56.26 → 1:50.71) — the fastest lap so far. Top speed 170 → 175 km/h. Telemetry (`runs/run_20261001_160629.csv`): slowest corner 60 → 68 km/h; every corner section faster again, biggest gains at ~2,400 m (−0.48 s), ~400 m (−0.47 s) and ~700 m (−0.35 s). **First sign of sliding:** sideways speed reached 7.8 km/h at ~2,490 m (exit of the ~2,450 m hairpin, where steering swings from full left lock to the right) — everywhere else it stayed at 2.4 km/h or below. Track position in that section reached 0.36 (was 0.20). Braking 37% of the lap with max pedal only 0.34; full throttle 16%. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | The second +10 km/h step on `corner_speed` gained almost as much as the first (5.55 s vs 5.99 s), so corner speed was still the main limit. But the ~2,450 m hairpin is now near the grip limit — the slide at its exit is the first in any run. Raising `corner_speed` further would most likely push that corner over the limit first, so the next gain should come from somewhere else: braking is still 37% of the lap and the pedal never goes above 0.34, while ~11.5 m/s² was measured at pedal 0.3 in v0.7. |

---

## v0.12 — Harder braking plan (`brake_decel` 8.0 → 10.0 m/s²)

| Field | Detail |
|---|---|
| **Version** | v0.12 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.12`). Line 538: `brake_decel=8.0` → `brake_decel=10.0`. Single value, no other changes. `corner_speed` stays at 70 km/h. |
| **Why** | v0.11 showed the first slide (7.8 km/h sideways at the ~2,450 m hairpin exit), so `corner_speed` is held where it is. Braking is still 37% of the lap with a max pedal of only 0.34, and v0.7 measured ~11.5 m/s² at pedal 0.3 — the car can brake harder than 8.0 m/s². At 10.0 the planner lets the car brake later from high speed: allowed speed with 100 m of road ahead rises from ~150 to ~164 km/h, with 60 m from ~119 to ~129 km/h. In tight corners the change is small (with 22 m visible, ~80 → ~82 km/h), because `corner_speed` dominates there — so the sliding corner should not be pushed much harder. 10.0 is still below the measured 11.5 m/s². |
| **Prediction** | Shorter, harder braking zones: braking time below 37% of the lap and max pedal rising to roughly 0.3–0.5. Lap time faster than v0.11 (1:50.71), probably by 1–3 s (less than the `corner_speed` steps, as most time is now in corners). Top speed similar (~175 km/h); slowest corner similar (~68–70 km/h). ABS may act more often. Risk: arriving at the ~2,450 m hairpin slightly faster where the car already slid. Damage expected to stay at 0. |
| **Lap time** | 1:46.91 |
| **Damage** | 0 |
| **Top speed** | 173 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 3.80 s faster than v0.11 (1:50.71 → 1:46.91) — the fastest lap so far, and more than the predicted 1–3 s. Top speed 175 → 173 km/h. Telemetry (`runs/run_20261001_161453.csv`): braking fell from 37% to 31% of the lap and max pedal rose from 0.34 to 0.39. Almost every section got faster; the biggest gains were in the braking zones before corners (~100, ~300, ~900, ~1,400, ~2,600 and ~2,900 m: about −0.2 s each), and minimum speeds in fast corners rose by 5–14 km/h (e.g. ~2,100 m 140 → 154, ~1,100 m 124 → 133). Slowest corner unchanged at 68 km/h (~3,270 m hairpin). **The slide at the ~2,450 m hairpin exit grew:** sideways speed 7.8 → 8.9 km/h at ~2,490 m, with `\|trackPos\|` 0.35. Sideways speed elsewhere rose slightly (max 3.2 km/h at ~2,600 m, was 2.4). Max `\|trackPos\|` for the lap 0.37 (unchanged); minimum visible road ahead 13.9 m. Full throttle 16%, rear wheelspin above the traction-control threshold 3.5%. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | The braking planner was too conservative at 8.0 m/s²: assuming harder braking moved braking points later and let the car carry more speed through fast corners, worth almost 4 s. Corner minimums in the tight hairpins did not change, as predicted — `corner_speed` still governs those. The cost is a slightly bigger slide at the ~2,450 m hairpin exit (8.9 km/h), so that corner stays the one to watch. There is still a little room before the measured ~11.5 m/s² limit. |

---

## v0.13 — Harder braking plan again (`brake_decel` 10.0 → 11.0 m/s²)

| Field | Detail |
|---|---|
| **Version** | v0.13 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.13`). Line 538: `brake_decel=10.0` → `brake_decel=11.0`. Single value, no other changes. `corner_speed` stays at 70 km/h. |
| **Why** | v0.12 (8.0 → 10.0) gained 3.80 s with zero damage, braking dropped to 31% of the lap and the max pedal was still only 0.39. v0.7 measured ~11.5 m/s² at pedal 0.3, so 11.0 is still below what the car can do (a +10% step). Allowed speed with 100 m of road ahead rises from ~164 to ~171 km/h, with 60 m from ~129 to ~134 km/h; with 22 m visible in a tight corner only ~82 → ~83 km/h. |
| **Prediction** | Smaller gain than v0.12 (the step is half the size and closer to the limit): faster than 1:46.91 by roughly 1–2 s. Braking time slightly below 31% of the lap, max pedal rising toward ~0.4–0.5. Top speed similar (~173 km/h); slowest corner similar (~68 km/h). Risk: the ~2,450 m hairpin, where sideways speed is already 8.9 km/h — if it goes well above ~10 km/h or `\|trackPos\|` there rises much above 0.35, this value goes back to 10.0. Damage expected to stay at 0. |
| **Lap time** | 1:45.26 |
| **Damage** | 0 |
| **Top speed** | 175 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 1.65 s faster than v0.12 (1:46.91 → 1:45.26) — the fastest lap so far, inside the predicted 1–2 s. Top speed 173 → 175 km/h. Telemetry (`runs/run_20261001_162125.csv`): braking fell from 31% to 29% of the lap and max pedal rose from 0.39 to 0.42. Every section was the same or faster; the biggest gains were at ~600 m (−0.13 s) and ~1,000, ~2,600 and ~2,900 m (−0.09 s each). Minimum speeds in fast corners rose by 2–5 km/h (e.g. ~2,100 m 154 → 159, ~1,600 m 116 → 121). Slowest corner 68 → 69 km/h (~3,265 m hairpin). The slide at the ~2,450 m hairpin exit did not grow: sideways speed 8.9 → 8.7 km/h at ~2,490 m. Elsewhere sideways speed peaked at 4.0 km/h at ~2,600 m (was 3.2). Max `\|trackPos\|` 0.40 at the ~3,250 m hairpin (was 0.37); minimum visible road ahead 13.5 m. Full throttle 16%, rear wheelspin above the traction-control threshold 3.7%. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | The second `brake_decel` step paid off at almost the same rate as the first (≈1.65 s per m/s² vs ≈1.9 s), and the hairpin slide stayed put, so the car brakes well at 11.0. That value is now close to the ~11.5 m/s² measured in v0.7, so there is no real room left in the braking plan. Hairpin minimums are still set by `corner_speed`, and the car still uses only the middle ~40% of the track width — the next gain has to come from the line through the corners. |

---

## v0.14 — Racing line (out-in-out), `line_offset` 0.5

| Field | Detail |
|---|---|
| **Version** | v0.14 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.14`). New knob `line_offset=0.5` (line 542) and a racing-line block in the steering (lines 555–562). When the look-ahead bearing shows a bend (`\|aim\|` over 2°), the steering's centre target moves from 0 to `line_offset` on the **outside** of the bend while plenty of road is visible ahead (`ahead` ≥ 80 m), blends through 0 at 60 m, and moves to the **inside** once the road ahead is short (`ahead` ≤ 40 m, near the apex). As the bend opens up and `ahead` grows again, the target swings back to the outside for the exit. Turn direction comes from the sign of `aim`. Implemented as `steer += line_offset·phase·side·0.10`, the same 0.10 gain as the centring term, so it is exactly the centring term with a moved target. The `ahead` line moved up from the brake planning (now line 559) so both blocks use it; its value is unchanged. `aim` now defaults to 0 (line 551). With `line_offset=0` the driver is identical to v0.13. |
| **Why** | `brake_decel` is now 11.0, close to the measured ~11.5 m/s², so the braking plan has little left to give. Corners are still the main limit, and max `\|trackPos\|` has never gone above 0.40 — the car drives the middle of the road. A wider line gives a larger corner radius, and because corner speed is set by the visible road (`ahead`), starting a bend from the outside should also let the straight-ahead beams see further around it, which raises `allowed_speed`. 0.5 is below the agreed limit of ~0.6. |
| **Prediction** | A gentle effect: with a 0.10 gain, a 0.5 target adds at most ±0.05 steer. Max `\|trackPos\|` should rise to roughly 0.45–0.6, with the car on the outside before bends and the inside near the apexes. Lap time roughly 0–2 s faster than v0.13 (1:45.26), with corner minimums up a few km/h where it works. It could also be slightly slower if the line target fights the look-ahead steering. Risks: the ~2,450 m hairpin (sideways speed already 8.7 km/h) — reject if it goes well above ~10 km/h; and `\|trackPos\|` approaching ~0.8 anywhere means the offset must come down. Damage expected to stay at 0. |
| **Lap time** | 1:44.52 |
| **Damage** | 0 |
| **Top speed** | 170 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 0.74 s faster than v0.13 (1:45.26 → 1:44.52) — the fastest lap so far, at the low end of the predicted 0–2 s. Top speed 175 → 170 km/h. Telemetry (`runs/run_20261001_162908.csv`): **the line barely moved the car.** Max `\|trackPos\|` was 0.37 (0.40 in v0.13), not the predicted 0.45–0.6. Where the line did act, it shifted the car only ~0.05–0.1 in the intended direction: e.g. ~1,500 m +0.03…+0.14 → +0.10…+0.22, ~2,700 m +0.14…+0.25 → +0.23…+0.32, ~1,000 m −0.16…−0.10 → −0.26…−0.13. The gains came from those corners: ~400 m (−0.11 s), ~1,500 m (−0.08 s), ~700 m and ~2,600 m (−0.07 s each), ~2,700 m and ~1,000 m (−0.06 s each); straights unchanged. Slowest corner 69 km/h (~3,274 m hairpin). Sideways speed at the ~2,450 m hairpin exit 8.7 → 9.1 km/h; elsewhere max 3.7 km/h. Braking 29% of the lap, max pedal 0.42; full throttle 16%; rear wheelspin above the traction-control threshold 3.5%. Minimum visible road ahead 13.8 m. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | The out-in-out idea works in the right direction — the corners where the car moved were the ones that got faster — but at a 0.10 gain the pull is too weak to move the car far before the phase changes: it shifted only ~0.05–0.1 toward a 0.5 target. The line needs a stronger pull. Simply raising the gain on this form is unsafe, because on its own it would push the car past `line_offset` (it balances only against the 0.10 centring term), so the next version turns it into a proper pull toward the target. |

---

## v0.15 — Stronger racing line (`line_gain` 0.20, pull toward the line)

| Field | Detail |
|---|---|
| **Version** | v0.15 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.15`). New knob `line_gain=.20` (line 543). The racing-line line (563) changes from `steer += line_target·0.10` to `steer += (line_target − trackPos)·line_gain`, where `line_target = line_offset·phase·side` as in v0.14. Still only active in bends (`\|aim\|` over 2°); `line_offset` (0.5) and the phase (outside at `ahead` ≥ 80 m, inside at ≤ 40 m) are unchanged. |
| **Why** | v0.14 moved the car only ~0.05–0.1 toward a 0.5 target, yet the corners where it moved were the ones that got faster. The pull needs to be stronger. With the car on the centre line, the push toward the line doubles from 0.05 to 0.10 steer. The new form also fades as the car approaches the target: together with the 0.10 centring term the car settles at `trackPos` = 0.5 × 0.20 / 0.30 ≈ 0.33 if a bend lasts long enough, and can never be pushed past `line_offset`, whatever the gain. Just raising the old 0.10 gain to 0.20 would instead have pushed toward `trackPos` 1.0, the track edge. |
| **Prediction** | Clearer use of the track width: max `\|trackPos\|` around 0.4–0.5 (0.37 in v0.14), with the car on the outside before bends and the inside near the apexes in more corners. Lap time roughly 0.5–1.5 s faster than v0.14 (1:44.52), mostly in the same corners that gained in v0.14 (~400, ~1,000, ~1,500, ~2,600, ~2,700 m). Risks: the stronger pull may fight the look-ahead steering and make the car weave in bends (watch `steer` swings and sideways speed); the ~2,450 m hairpin (9.1 km/h sideways in v0.14) — reject if it goes well above ~10 km/h; and `\|trackPos\|` above ~0.6 anywhere would mean the line is not behaving as designed. Damage expected to stay at 0. |
| **Lap time** | 1:44.09 |
| **Damage** | 0 |
| **Top speed** | 170 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 0.43 s faster than v0.14 (1:44.52 → 1:44.09) — the fastest lap so far, but below the predicted 0.5–1.5 s. Top speed 170 km/h (unchanged). Telemetry (`runs/run_20261001_163525.csv`): **the car did not move further out — max `\|trackPos\|` fell from 0.37 to 0.33**, against a predicted 0.4–0.5. In some corners the car moved a little further toward the line (~1,000 m −0.26 → −0.28; ~1,400–1,500 m up to +0.24), but on most straights and fast bends it sat closer to the centre. Gains at ~400 m, ~500 m, ~1,000 m (−0.07/−0.08 s each), ~1,500 m and ~3,000 m (−0.06 s each) and the ~2,450 m hairpin (−0.05 s); losses at ~600 m (+0.06 s) and the fast kink at ~2,100 m (+0.04 s, minimum speed 157 → 149 km/h). **Steering is busier:** steps with a steering change over 0.05 rose from 157 to 196 (+25%), most at ~2,900 m (2 → 11) and ~2,600 m (4 → 9). Sideways speed rose slightly in several bends (e.g. ~1,600 m 2.1 → 3.2, ~2,700 m 2.3 → 3.2 km/h); at the ~2,450 m hairpin exit 9.1 → 8.9 km/h. Slowest corner 68 km/h (~3,273 m hairpin). Braking 29% of the lap, max pedal 0.41; full throttle 16%; rear wheelspin above the traction-control threshold 3.8%. The car sits at the 160 km/h `target_speed` cap (no brake, `\|steer\|` < 0.1, ≥ 158 km/h) for 22% of the lap (19% in v0.12, 22% in v0.13–v0.14), while the `abs(steer)*50` corner reduction limits speed only 0.1% of the time. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | The new pull form brings a side effect: its `−trackPos·line_gain` part is extra centring whenever the line target is near 0 (the 60 m blend point), so the car ends up nearer the centre overall, and the stronger pull makes the steering busier. Steering bias alone gives only small gains here (0.74 s, then 0.43 s), because the heading term (`angle·15/PI`) dominates the steering and corner speed is set mainly by the braking plan. The lap data now points elsewhere: the car spends 22% of the lap pinned at the 160 km/h cap on straights, and the `abs(steer)*50` term almost never limits it. |

---

## v0.16 — Raise `target_speed` 160 → 180 km/h

| Field | Detail |
|---|---|
| **Version** | v0.16 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.16`). Line 536: `target_speed=160` → `target_speed=180`. Single value, no other changes. Racing line (`line_offset` 0.5, `line_gain` 0.20) and braking plan unchanged. |
| **Why** | v0.15 telemetry: the car sits at the 160 km/h cap for 22% of the lap (~23 s), up from 8% in v0.9, because braking later (v0.12–v0.13) left more of each straight at full speed. The `abs(steer)*50` corner reduction limits speed only 0.1% of the time, so corners are governed by the braking plan, which also protects the higher straight speed: from 180 km/h (50 m/s) to 70 km/h at 11 m/s² needs ~96 m plus the 15 m margin, and the forward beams see up to 200 m. +20 km/h is a +12.5% step. 6th gear (above 170 km/h) reaches the limiter only at ~321 km/h. |
| **Prediction** | Top speed around 185–190 km/h (the throttle overshoots the cap by ~10 km/h, as seen at 160). Time at the cap well below 22%; braking zones start earlier and run longer from the higher speed, with a higher max pedal. Lap time roughly 1–2 s faster than v0.15 (1:44.09), gained on the straights (~1,300, ~1,700, ~2,100–2,200, ~3,100, ~3,400 m); corner sections about the same. Corner minimums and the ~2,450 m hairpin (8.9 km/h sideways) should not change much because the braking plan sets the corner entry speed. Risk: weaving at the higher speed (steering gain does not yet fall with speed, and v0.15 already made the steering busier) — watch steering changes and sideways speed on the straights; reject on any damage or if the car gets unsettled. |
| **Lap time** | 1:42.73 |
| **Damage** | 0 |
| **Top speed** | 193 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was 1.36 s faster than v0.15 (1:44.09 → 1:42.73) — the fastest lap so far, inside the predicted 1–2 s. Top speed 170 → 193 km/h (13 km/h over the cap, slightly more than predicted). Telemetry (`runs/run_20261001_164043.csv`): the time came from the straights as predicted — ~1,700 m (−0.28 s), ~3,400 m (−0.24 s), ~2,200 m (−0.23 s), ~1,300 m (−0.16 s), ~3,500 m (−0.13 s), ~1,800 m and ~3,100 m (−0.08 s each); corner sections were within ±0.05 s of v0.15. Time at or above 158 km/h with no brake and little steering fell from 22.0% to 17.3% of the lap; time at the new 180 cap (≥ 178 km/h) is 7.8%. Full throttle rose from 16% to 26%; braking from 29% to 33% of the lap, max pedal 0.41 → 0.47. **No sign of weaving at speed:** above 150 km/h max sideways speed 2.5 km/h (2.4 in v0.15), max `\|steer\|` 0.16 and mean steering change per step unchanged (0.0016 vs 0.0015). Slowest corner 68 km/h (~3,273 m hairpin); sideways speed at the ~2,450 m hairpin exit 9.2 km/h (8.9); max `\|trackPos\|` 0.33. Rear wheelspin above the traction-control threshold 3.8%. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | Raising the straight-line cap paid off cleanly: the braking plan handled the extra speed (later braking from higher speeds, corner minimums unchanged), and the steering stayed calm at ~190 km/h even without a speed-dependent gain. The car still reaches the cap on several straights (7.8% of the lap at ≥ 178 km/h), so there is more to take there, though each step will gain less as more straights end in braking before the cap is reached. |

---

## v0.17 — Raise `target_speed` 180 → 200 km/h

| Field | Detail |
|---|---|
| **Version** | v0.17 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.17`). Line 536: `target_speed=180` → `target_speed=200`. Single value, no other changes. |
| **Why** | v0.16 gained 1.36 s on the straights with no weaving (above 150 km/h: max sideways speed 2.5 km/h, steering activity unchanged), and the car still sits at the 180 cap for 7.8% of the lap (~1,300, ~1,700, ~2,200, ~3,100, ~3,400–3,500 m). The braking plan covers the higher speed: from 200 km/h (55.6 m/s) to 70 km/h at 11 m/s² needs ~123 m plus the 15 m margin, within the 200 m beam range. +20 km/h is a +11% step. |
| **Prediction** | Top speed around 205–212 km/h (the throttle overshoots the cap by ~10–13 km/h). Lap time roughly 0.5–1 s faster than v0.16 (1:42.73) — less than last time, because the time at the cap is now 7.8% instead of 22% and more straights will end in braking before reaching 200. Gains on the same straights; corners unchanged; braking time and max pedal a little higher. Risk: weaving or a twitchy car at 200+ km/h (steering gain still does not fall with speed) — watch steering and sideways speed above 150 km/h; reject on any damage or if the car gets unsettled. |
| **Lap time** | 1:42.55 |
| **Damage** | 0 |
| **Top speed** | 209 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time was only 0.18 s faster than v0.16 (1:42.73 → 1:42.55) — the fastest lap so far, but below the predicted 0.5–1 s. Top speed 193 → 209 km/h. Telemetry (`runs/run_20261001_164805.csv`): gains on the longest straights — ~1,700 m (−0.12 s), ~3,500 m (−0.09 s), ~1,300 m (−0.08 s) — partly cancelled by small losses of +0.02–0.05 s in several other sections (e.g. ~2,800 m +0.05, ~1,600 m and ~2,200 m +0.04). Only 1.8% of the lap is spent at the new cap (≥ 198 km/h); 5.5% at ≥ 178 km/h (7.8% in v0.16). Full throttle 26% → 30%; braking 33% → 34% of the lap, max pedal 0.43. Still no weaving at speed: above 150 km/h max sideways speed 2.5 km/h and steering activity unchanged. Slowest corner 68 km/h (~3,274 m hairpin); sideways speed at the ~2,450 m hairpin exit 9.1 km/h; max `\|trackPos\|` 0.33. **A closer look at the two hairpins:** the ~2,450 m "hairpin" is a left–right flick, and its slide starts when the steering snaps from −0.06 to −0.58 and then −0.98 in two steps at ~2,484 m while braking; sideways speed then rises 0.5 → 5.5 → 9.1 km/h. At the ~3,250 m hairpin the car runs at full lock with only ~2 km/h sideways — speed there is held by the braking plan (`ahead` 14–16 m), not by grip. Over the lap only 14 steps change the steering by more than 0.2; the largest three are all at the ~2,450 m flick, and there is ±0.3 steering jitter at ~2,750 m. |
| **Decision** | ✅ Kept — fastest lap so far, still zero damage |
| **Learned** | Straights are close to used up: the gain fell from 1.36 s (160 → 180) to 0.18 s (180 → 200), as only a few straights are long enough to reach the higher cap before braking. The hairpin slide that has blocked raising `corner_speed` since v0.11 is not a grip limit at corner entry: it comes from a one-step steering snap at the ~2,484 m direction change. The other hairpin still has plenty of grip in reserve (~2 km/h sideways at full lock). |

---

## v0.18 — Steering rate limit (`max_steer_step` 0.2)

| Field | Detail |
|---|---|
| **Version** | v0.18 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.18`). New knob `max_steer_step=.2` (line 544) and `prev_steer` (line 545, the steering sent the previous step). After all steering terms, the new steering is clipped to within ±0.2 of the previous step's value (lines 566–568). All steering terms, speeds and the braking plan are unchanged. |
| **Why** | v0.17 telemetry showed the slide at the ~2,450 m hairpin comes from a steering snap: −0.06 → −0.58 → −0.98 in two steps (~42 ms) at ~2,484 m, after which sideways speed rises to 9.1 km/h. That slide is what has kept `corner_speed` at 70 since v0.11. Only 14 steps per lap change the steering by more than 0.2, so the limit only touches those snaps (and the ±0.3 jitter at ~2,750 m); everywhere else steering is unaffected. At 0.2 per step the wheel can still go from centre to full lock in 5 steps (~0.1 s). |
| **Prediction** | Sideways speed at the ~2,450 m flick drops clearly, to roughly 4–6 km/h (from 9.1), and no step changes steering by more than 0.2. Lap time about the same as v0.17 (1:42.55), within ~±0.3 s; maybe slightly faster through the ~2,450–2,500 m and ~2,750 m sections. This is mainly an enabling change: with the slide gone, `corner_speed` can be raised. Risk: slightly later turn-in at the flick, so the car may run a little wider there (`\|trackPos\|` around 2,480–2,500 m). Damage expected to stay at 0. |
| **Lap time** | 1:42.50 |
| **Damage** | 0 |
| **Top speed** | 209 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Car completed a full lap with zero damage and the damage stop never triggered. Lap time 0.05 s faster than v0.17 (1:42.55 → 1:42.50), within the predicted ±0.3 s — every 100 m section within ±0.01 s of v0.17. Top speed 209 km/h. Telemetry (`runs/run_20261001_165557.csv`): the limit works as designed — the largest steering change in one step is now exactly 0.20 (0.59 in v0.17), and no step exceeds it (14 did in v0.17). **But the slide at the ~2,450 m flick barely changed:** sideways speed 9.1 → 8.8 km/h, against a predicted 4–6. Step by step: steering now ramps from −0.04 to −1.00 over ~6 steps (2,482.7–2,485.9 m) instead of 2, but it still reaches full right lock at ~77 km/h while braking (pedal 0.1–0.23), straight after the left-hand part of the flick; sideways speed then climbs 0.9 → 8.8 km/h over the next ~5 m while the rear wheels turn up to 15 rad/s slower than the fronts. The ±0.3 jitter at ~2,750 m is unchanged (steer 0.03…0.46), as those changes were already near 0.2. `\|trackPos\|` at the flick 0.33 (unchanged), so no running wide. Slowest corner 68 km/h (~3,274 m hairpin). Braking 35% of the lap, max pedal 0.43; full throttle 30%. |
| **Decision** | ✅ Kept — marginally faster (0.05 s), still zero damage, and removes one-step steering snaps without any cost |
| **Learned** | The slide at the ~2,450 m flick is not caused by how *fast* the steering moves but by *where* it goes: full opposite lock at ~77 km/h, with light braking, right after a left turn, makes the rear step out. The rate limit is harmless and stays as a safety net, but it does not unlock `corner_speed` by itself. The rest of the lap still has plenty of grip (the ~3,250 m hairpin runs full lock with ~2 km/h sideways). |

---

## v0.19 — Raise `corner_speed` 70 → 75 km/h

| Field | Detail |
|---|---|
| **Version** | v0.19 |
| **What changed** | `snakeoil3_v1.py` (Git tag `v0.19`). Line 537: `corner_speed=70` → `corner_speed=75`. Single value, no other changes. Steering rate limit (`max_steer_step` 0.2) stays. |
| **Why** | Corners are the biggest remaining time (the slowest sections are the two hairpins and the ~400 m corner, each ~4.2–4.4 s), straights are nearly used up (v0.17 gained only 0.18 s), and `brake_decel` is at its limit. Earlier `corner_speed` steps were the biggest gains of the project (+10 km/h ≈ 5.5–6 s in v0.10 and v0.11). It was held at 70 since v0.11 because of the slide at the ~2,450 m flick. v0.18 showed that slide comes from full opposite lock at the flick, not from steering speed, and that it recovers cleanly (`\|trackPos\|` 0.33, 0 damage); elsewhere there is plenty of grip (~2 km/h sideways at full lock in the ~3,250 m hairpin). A +5 km/h step (+7%) is half the earlier steps. Allowed speed with 15 m of road visible goes 70 → 75 km/h; with 22 m ~83 → ~87 km/h. |
| **Prediction** | Slowest corner ~73–75 km/h (from 68). Lap time roughly 2–3 s faster than v0.18 (1:42.50), mostly in the hairpins and tight corners (~400, ~700, ~1,500, ~1,900, ~2,400–2,500, ~3,200 m). Sideways speed at the ~2,450 m flick will rise, probably to ~10–12 km/h, and `\|trackPos\|` there may grow. Risk: the flick — if the car leaves the track or takes damage, reject; if it stays on track but slides clearly more (well above ~12 km/h or `\|trackPos\|` above ~0.6), the next version should tackle the flick (e.g. no braking at full lock, or a tighter steering rate) before going further. Damage expected to stay at 0. |
| **Lap time** | _Pending run_ |
| **Damage** | _Pending run_ |
| **Top speed** | _Pending run_ |
| **Min speed** | _Pending run_ |
| **Observed** | _Pending run_ |
| **Decision** | _Pending run_ |
| **Learned** | _Pending run_ |

---

*Last updated: v0.19 implemented, awaiting run.*
