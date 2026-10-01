# Tuning Card — `drive_example()` in `snakeoil3_v1.py`

`snakeoil3_v1.py` is the only driver file; each version is a Git tag (see the changelog). Section 1 below describes `v0.6`. `snakeoil3_gym.py` is the untouched original (`target_speed = 300`) and is what `gym_torcs.py` imports.

The client runs at **50 steps per second** (one step ≈ 20 ms). Every step it reads all sensors, runs `drive_example()`, and sends all actions back.

---

## 1. Tuning knobs (currently used)

| Setting | Line | Current Value | What It Controls | Raise it → | Lower it → | Crash Risk |
|---|---|---|---|---|---|---|
| `target_speed` | 533 | `120` (km/h) — `300` in v0.1, `80` in v0.2–v0.3 | The speed the throttle aims for on straights. Also shrinks in corners (see `steer*50` on line 551). **Soft cap:** the throttle only eases off 0.01 per step and the brake does not enforce it, so the car can overshoot (144 km/h seen in v0.4). | Car holds higher speeds on straights. | Car drives more conservatively. | **Medium** — the brake planner (`allowed_speed`) now protects corners, so this is no longer the only safety knob. |
| `corner_speed` | 534 | `50` (km/h) | The speed the car must be able to slow to by the end of the visible road. Sets how fast the car may approach a corner it can't see past. | Later, harder braking; faster corner entry. | Earlier braking; slower corner entry. | **High** — too high and the car arrives at tight corners too fast. |
| `brake_decel` | 535 | `5.0` (m/s²) | How hard the brake planner assumes the car can decelerate. Used only for planning, not the pedal. | Planner brakes later (assumes stronger brakes). | Planner brakes earlier. | **High** — set above what the car can actually do and it runs out of road. |
| `brake_margin` | 536 | `15` (m) | Visible road kept in reserve when planning braking. | Earlier braking; more safety. | Later braking. | **Medium** |
| `brake_gain` | 537 | `0.05` (pedal per km/h over) | How hard the brake pedal is pressed per km/h over `allowed_speed`. 20 km/h over = full brake. | Harder, more abrupt braking. | Softer braking; car may not slow in time. | **Medium** — too high locks wheels (ABS helps). |
| Braking look-ahead beams | 546 | `track[8]`, `track[9]`, `track[10]` (−0.5°, 0°, +0.5°) | Which beams measure "visible road ahead". The longest of the three is used. | (Wider beams see around bends → later braking.) | (Fewer/narrower beams → more conservative.) | **Medium** |
| Angle-to-steer gain (`*15`) | 540 | `15` | Scales how sharply the car reacts to being mis-aligned with the track direction. | Steering corrections are quicker and larger — good for tight turns. | Car is slow to realign after a bend; drifts wide. | **Medium** — too high causes over-steering oscillations, worse at high speed. |
| `PI` divisor in steer | 540 | `PI` (≈3.14159) | Normalises the angle (in radians) into a −1…+1 steering command. | (Lowering the divisor has the same effect as raising the gain — see row above.) | (Raising the divisor weakens the response — see row above.) | **Medium** — do not change unless you understand radian normalisation. |
| Track-position correction (`*.10`) | 542 | `0.10` | How aggressively the car steers back toward the centre of the road when it drifts sideways. | Car snaps back to centre faster; can cause weaving on straights. | Car drifts toward the edges more easily; may run off track. | **Medium** — high values combined with a high angle gain cause oscillation. |
| Corner speed reduction (`*50`) | 551 | `50` | Lowers the throttle's aim by `abs(steer) × 50` km/h while steering (sign bug fixed in v0.3). | Target speed drops more in corners. | Car barely slows for corners. | **High** — likely what sets the 49 km/h minimum speed. |
| Throttle ramp-up step (`+= .05`) | 552 | `0.05` — `0.01` until v0.4 | How quickly the throttle opens each step when below the speed limit. 0 → full throttle takes 20 steps (0.4 s). | Throttle builds faster; quicker corner exits. | Very slow throttle response. | **Low** — larger values may cause wheelspin (traction control helps). |
| Throttle ramp-down step (`-= .01`) | 554 | `0.01` | How quickly the throttle closes each step when above the speed limit. | Throttle closes faster; less overshoot of `target_speed`. | Throttle bleeds off slowly; car overshoots target speed. | **Low** — the brake handles corners now. |
| Low-speed boost threshold | 555 | `10` (km/h) | Speed below which an emergency throttle boost kicks in to prevent stalling. | Boost activates at higher speeds. | Boost activates only at very low speeds; car may stall on a standing start. | **Low** — mainly affects standing starts and recovery from a spin. |
| Low-speed boost formula (`1/(speedX+.1)`) | 556 | `1 / (S['speedX'] + .1)` | Magnitude of the emergency boost — large when nearly stopped, fades as speed rises. The `+.1` prevents division by zero. | N/A (formula) — raising the numerator above 1 gives a stronger launch kick. | Reducing the numerator weakens the launch boost. | **Low** — only active below 10 km/h. |
| ABS lock threshold | 567 | `0.8` (wheel speed / car speed) | If the slowest wheel turns slower than 80% of the car's speed, the wheel is treated as locking. | ABS triggers earlier (less braking power, more steering). | ABS triggers later (more lock). | **Medium** |
| ABS brake cut (`*= .5`) | 568 | `0.5` | Brake multiplier applied while a wheel is locking. Only active above 20 km/h (line 565). | Gentler cut; more braking but more lock. | Harsher cut; less lock but longer stops. | **Medium** |
| ABS wheel radius (`*.3`) | 566 | `0.3` (m) | Approximate wheel radius used to turn `wheelSpinVel` (rad/s) into m/s. | (Only change if the car changes.) | | **Low** |
| Traction-control threshold | 571–572 | `5` (rad/s difference) | If rear wheels spin more than this amount faster than front wheels, throttle is cut. | Traction control activates less often. | Traction control is very sensitive. | **Medium** — too high lets wheelspin persist; too low kills acceleration. |
| Traction-control throttle cut (`-= .2`) | 573 | `0.2` | How much throttle is removed in one step when wheelspin is detected. | More aggressive cut. | Gentler cut. | **Medium** |
| `upshift_rpm` | 579 | `18000` (rpm) — speed thresholds 50/80/110/140/170 km/h until v0.5 | Engine RPM at which the car shifts up a gear. `car1-ow1` torque is flat-to-peak at 16,000–18,000 rpm and the limiter is 18,700 rpm. With this value the car shifts 1→2 at ~122 km/h and 2→3 at ~164 km/h. | Holds each gear closer to the limiter (above 18,700 the limiter cuts power). | Shifts earlier; engine drops out of its torque peak. | **Low** — affects acceleration, not grip. |
| `downshift_rpm` | 580 | `17000` (rpm) | The car shifts down only if the lower gear would put the engine below this RPM. Keeps a 1,000 rpm gap to `upshift_rpm` so it never shifts up and down repeatedly. Downshifts 3→2 at ~155 km/h and 2→1 at ~115 km/h. | Downshifts earlier (more engine braking, more pull out of corners). | Downshifts later (less engine braking). | **Medium** — downshifting at high RPM while braking adds engine braking on the rear wheels, which can unsettle the car. Must stay below `upshift_rpm`. |
| `shift_delay` | 581 | `10` (steps = 0.2 s) | Minimum wait after any shift before the next one, so RPM can settle. | Fewer, slower shifts. | Quicker successive shifts; risk of double-shifting. | **Low** |
| `gear_ratios` | 578 | `[3.9, 2.9, 2.3, 1.87, 1.68, 1.54]` | Gear ratios for gears 1–6 from `car1-ow1.xml`. Used to predict RPM after a downshift. | (Only change if the car changes.) | | **Low** |

**Setup knob (not in `drive_example`):**

| Setting | Line | Current Value | What It Controls |
|---|---|---|---|
| Track-sensor angles | 158 | `-45 -19 -12 -7 -4 -2.5 -1.7 -1 -.5 0 .5 1 1.7 2.5 4 7 12 19 45` | The direction (degrees from the car's nose) of each of the 19 `track` beams. Sent once at connection time and fixed for the whole run. Each value must be within −90…+90. The current set is packed near 0° to see corners far ahead; there are no ±90° beams, so track width can't be measured directly. The commented-out line 156 is the standard evenly-spread set. |

---

## 2. Sensors — everything the car can read (`S[...]`)

"Used?" means whether the current `drive_example()` reads that sensor.

| Sensor | Type | Range / Units | What It Means | Used? | Notes for tuning |
|---|---|---|---|---|---|
| `angle` | float | −π … +π rad | Angle between the car's heading and the direction of the track at that point. 0 = pointing straight down the road. | ✅ Yes (steering) | Large values mean the car is sliding or rotated. |
| `trackPos` | float | 0 = centre line, ±1 = track edge, beyond ±1 = off track | Lateral position on the road, normalised by track width. Positive = left of centre, negative = right. | ✅ Yes (steering) | Reliable "am I about to leave the road" signal. |
| `track` | list of 19 floats | 0 … 200 m (−1 when off track) | Range-finder beams measuring distance from the car to the **track edge** (edge of the track surface — not walls, not grass). Beam angles are set at line 158. Angles are relative to the car's nose, negative = left. `track[9]` is straight ahead. | ✅ Yes (`track[8..10]` for braking, since v0.4) | The main tool for seeing corners ahead and planning braking. Every value goes to −1 when `|trackPos| > 1`. `gym_torcs.py` uses `min(track) < 0` as its off-track check. |
| `focus` | list of 5 floats | 0 … 200 m (−1 when unavailable) | Five extra edge-distance beams that can be aimed with the `focus` action — more precise readings in a chosen direction. | ❌ No | Per the SCR manual, readings are only valid about once per second and return −1 otherwise, and are −1 when off track. |
| `opponents` | list of 36 floats | 0 … 200 m (200 = nothing there) | Distance to the nearest other car in each 10° sector around the car (full 360°). | ❌ No | Irrelevant in a solo practice session; matters in a race. |
| `speedX` | float | km/h | Speed along the car's long axis (forward speed). Negative when reversing. | ✅ Yes (throttle, brake, gears, boost) | Divide by 3.6 for m/s when doing braking-distance maths. |
| `speedY` | float | km/h | Sideways speed of the car (along its lateral axis). | ❌ No | Large `speedY` relative to `speedX` = the car is sliding. Good grip / slide detector. |
| `speedZ` | float | km/h | Vertical speed of the car. | ❌ No | Spikes over crests and bumps (e.g. the Corkscrew drop). |
| `wheelSpinVel` | list of 4 floats | rad/s | Rotation speed of each wheel: `[0]` front-left, `[1]` front-right, `[2]` rear-left, `[3]` rear-right. | ✅ Yes (traction control, ABS) | Multiply by wheel radius for surface speed. Wheel much slower than car speed = locking under braking (use for ABS). Rear much faster than front = wheelspin. |
| `rpm` | float | rev/min | Engine speed. | ✅ Yes (gear shifting, since v0.6) | Upshift at 18,000 rpm; limiter at 18,700 rpm on `car1-ow1`. |
| `gear` | int | −1 (reverse), 0 (neutral), 1 … 6 | Gear currently engaged. | ❌ No (the transmission uses the last commanded `R['gear']` instead) | Reported gear lags the command during the 0.05 s shift. |
| `damage` | float | 0 … ∞ points | Accumulated car damage. Increases on impacts. | ❌ No | Target is 0. Note: `gym_torcs.py` and the auto-relaunch in `Client` start TORCS with `-nodamage`; check how TORCS was launched before trusting this value. |
| `fuel` | float | litres | Fuel remaining. | ❌ No | Irrelevant if TORCS is launched with `-nofuel`. |
| `curLapTime` | float | s | Time elapsed in the current lap. | ❌ No | |
| `lastLapTime` | float | s | Time of the last completed lap (0 before the first one). | ❌ No | Use this to log lap times automatically. |
| `distFromStart` | float | m | Distance from the start line along the track centre line. Resets each lap. | ❌ No | Key for any track-memory approach (brake at a known point). |
| `distRaced` | float | m | Total distance driven since the race started. | ❌ No | |
| `racePos` | int | 1 … N | Current position in the race. | ❌ No | |
| `z` | float | m | Height of the car's centre of mass above the track surface. | ❌ No | Spikes = car is airborne or riding a curb. |
| `img` | RGB image | 64×64 pixels, 0–255 | Camera view of the track. | ❌ No | Only exists when TORCS is launched with `-vision` (vtorcs build). Not available in a normal run. |

**Not real sensors:** `fancyout()` (lines 320–344) also lists `stucktimer` and `targetSpeed`, which the standard SCR server does not send (if they are missing, running with `--debug` will crash with a `KeyError`), and `skid` / `slip`, which are calculated locally from `wheelSpinVel` and `speedX` for the debug display only.

---

## 3. Actions — everything the car can do (`R[...]`)

All values are clipped to their limits by `clip_to_limits()` (lines 461–478) before being sent.

| Action | Type | Range | What It Does | Used? | Notes for tuning |
|---|---|---|---|---|---|
| `accel` | float | 0 … 1 | Throttle pedal. 0 = off, 1 = full. | ✅ Yes | Starts at `0.2` (line 452). Persists between steps — `drive_example()` nudges it up or down instead of setting it. |
| `brake` | float | 0 … 1 | Brake pedal. 0 = off, 1 = full. | ✅ Yes (since v0.4) | Set from scratch every step: proportional to km/h over `allowed_speed`, halved by ABS when a wheel locks. Very strong on this car. |
| `steer` | float | −1 … +1 | Steering. **+1 = full left, −1 = full right.** ±1 ≈ ±21° at the wheels on `car1-ow1`. | ✅ Yes | Values beyond ±1 are clipped when sent, but `drive_example()` reads the unclipped value on line 551. |
| `gear` | int | −1 (reverse), 0 (neutral), 1 … 6 | Gear to engage. Invalid values are replaced with 0 (neutral). | ✅ Yes | Set every step from engine RPM since v0.6 (fixed speed thresholds before). Reverse is useful for recovering after a spin. |
| `clutch` | float | 0 … 1 | Clutch pedal. 0 = engaged, 1 = fully pressed. | ❌ No | TORCS handles the clutch automatically during shifts; mainly useful for launch control. |
| `focus` | list of angles | each −90 … +90 degrees | Direction(s) to aim the `focus` sensor beams, relative to the car's nose. | ❌ No (default `[-90,-45,0,45,90]` sent every step) | Only matters if you read the `focus` sensor. |
| `meta` | int | 0 or 1 | 1 = ask the server to restart the race. | ❌ No | `gym_torcs.py` sets this to end an episode. Leave at 0 when racing. |
