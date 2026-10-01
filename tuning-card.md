# Tuning Card — `drive_example()` in `snakeoil3_v1.py`

`snakeoil3_v1.py` is the only driver file; each version is a Git tag (see the changelog). **Section 1 below describes `v0.2`** and will be updated once v0.4 is accepted. `snakeoil3_gym.py` is the untouched original (`target_speed = 300`) and is what `gym_torcs.py` imports.

The client runs at **50 steps per second** (one step ≈ 20 ms). Every step it reads all sensors, runs `drive_example()`, and sends all actions back.

---

## 1. Tuning knobs (currently used)

| Setting | Line | Current Value | What It Controls | Raise it → | Lower it → | Crash Risk |
|---|---|---|---|---|---|---|
| `target_speed` | 533 | `80` (km/h) — was `300` in v0.1 | The top speed the car tries to reach on straights. Also shrinks automatically in corners (see `steer*50` on line 541). | Car accelerates harder and holds higher speeds everywhere. | Car drives more conservatively; more headroom before the throttle backs off. | **High** — there is no brake, so anything much above ~110 km/h arrives at corners too fast (v0.1 crashed at 300). |
| Angle-to-steer gain (`*15`) | 536 | `15` | Scales how sharply the car reacts to being mis-aligned with the track direction. | Steering corrections are quicker and larger — good for tight turns. | Car is slow to realign after a bend; drifts wide. | **Medium** — too high causes over-steering oscillations, worse at high speed. |
| `PI` divisor in steer | 536 | `PI` (≈3.14159) | Normalises the angle (in radians) into a −1…+1 steering command. | (Lowering the divisor has the same effect as raising the gain — see row above.) | (Raising the divisor weakens the response — see row above.) | **Medium** — do not change unless you understand radian normalisation. |
| Track-position correction (`*.10`) | 538 | `0.10` | How aggressively the car steers back toward the centre of the road when it drifts sideways. | Car snaps back to centre faster; can cause weaving on straights. | Car drifts toward the edges more easily; may run off track. | **Medium** — high values combined with a high angle gain cause oscillation. |
| Corner speed reduction (`*50`) | 541 | `50` | Scales how much the target speed is reduced when the car is steering — the only corner-slowing logic. ⚠️ **Known bug:** it uses the *signed* steer value. Left turns (steer > 0) lower the target, but right turns (steer < 0) **raise** it. Should be `abs(R['steer'])`. | Target speed drops more in corners; car slows down a lot before bends. | Car barely slows for corners; enters them too fast. | **High** — lowering toward 0 removes the only corner-slowing logic. The sign bug makes right-hand corners the most dangerous. |
| Throttle ramp-up step (`+= .01`) | 542 | `0.01` | How quickly the throttle opens each step when below target speed. 0 → full throttle takes 100 steps (2 s). | Throttle builds faster; quicker corner exits. | Very slow throttle response; car feels sluggish pulling out of corners. | **Low** — larger values may cause jerky acceleration or wheelspin. |
| Throttle ramp-down step (`-= .01`) | 544 | `0.01` | How quickly the throttle closes each step when above target speed. This is currently the **only** way the car slows down (no brake). | Throttle closes faster; more engine braking. | Throttle bleeds off slowly; car overshoots target speed. | **Low** — mismatch between ramp-up and ramp-down can cause oscillation. |
| Low-speed boost threshold | 545 | `10` (km/h) | Speed below which an emergency throttle boost kicks in to prevent stalling. | Boost activates at higher speeds; car is always getting extra gas at low speed. | Boost activates only at very low speeds; car may stall on a standing start. | **Low** — mainly affects standing starts and recovery from a spin. |
| Low-speed boost formula (`1/(speedX+.1)`) | 546 | `1 / (S['speedX'] + .1)` | Magnitude of the emergency boost — large when nearly stopped, fades as speed rises. The `+.1` prevents division by zero. | N/A (formula, not a literal constant) — raising the numerator above 1 gives a stronger launch kick. | Reducing the numerator weakens the launch boost. | **Low** — only active below 10 km/h. |
| Traction-control threshold | 549–550 | `5` (rad/s difference) | If rear wheels spin more than this amount faster than front wheels, throttle is cut. | Traction control activates less often; car spins wheels more before cutting power. | Traction control is very sensitive; may cut throttle unnecessarily on normal acceleration. | **Medium** — too high a threshold lets wheelspin persist; too low kills acceleration. |
| Traction-control throttle cut (`-= .2`) | 551 | `0.2` | How much throttle is removed in one step when wheelspin is detected. | More aggressive cut — regains grip faster but feels jerky. | Gentler cut — smoother but may not stop wheelspin in time. | **Medium** — if too small the car never recovers grip; if too large it surges. |
| Gear 2 upshift threshold | 555 | `50` (km/h) | Speed at which the car shifts from 1st to 2nd gear. | Holds 1st gear longer; engine revs higher before shifting. | Shifts to 2nd very early; poor acceleration out of corners. | **Low** — gear thresholds have little crash risk but affect lap time. |
| Gear 3 upshift threshold | 557 | `80` (km/h) | Speed at which the car shifts from 2nd to 3rd gear. | Holds 2nd longer; more torque but higher revs. | Shifts to 3rd early; less torque on medium-speed corners. | **Low** |
| Gear 4 upshift threshold | 559 | `110` (km/h) | Speed at which the car shifts from 3rd to 4th gear. | Holds 3rd longer. | Shifts early; may lug the engine at low revs. | **Low** |
| Gear 5 upshift threshold | 561 | `140` (km/h) | Speed at which the car shifts from 4th to 5th gear. | Holds 4th longer. | Shifts to 5th early; may reduce top-end pull. | **Low** |
| Gear 6 upshift threshold | 563 | `170` (km/h) | Speed at which the car shifts from 5th to 6th (top) gear. | Stays in 5th longer on fast straights. | Enters top gear earlier; engine load may drop off. | **Low** |

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
| `track` | list of 19 floats | 0 … 200 m (−1 when off track) | Range-finder beams measuring distance from the car to the **track edge** (edge of the track surface — not walls, not grass). Beam angles are set at line 158. Angles are relative to the car's nose, negative = left. `track[9]` is straight ahead. | ❌ No | The main tool for seeing corners ahead and planning braking. Every value goes to −1 when `|trackPos| > 1`. `gym_torcs.py` uses `min(track) < 0` as its off-track check. |
| `focus` | list of 5 floats | 0 … 200 m (−1 when unavailable) | Five extra edge-distance beams that can be aimed with the `focus` action — more precise readings in a chosen direction. | ❌ No | Per the SCR manual, readings are only valid about once per second and return −1 otherwise, and are −1 when off track. |
| `opponents` | list of 36 floats | 0 … 200 m (200 = nothing there) | Distance to the nearest other car in each 10° sector around the car (full 360°). | ❌ No | Irrelevant in a solo practice session; matters in a race. |
| `speedX` | float | km/h | Speed along the car's long axis (forward speed). Negative when reversing. | ✅ Yes (throttle, gears, boost) | Divide by 3.6 for m/s when doing braking-distance maths. |
| `speedY` | float | km/h | Sideways speed of the car (along its lateral axis). | ❌ No | Large `speedY` relative to `speedX` = the car is sliding. Good grip / slide detector. |
| `speedZ` | float | km/h | Vertical speed of the car. | ❌ No | Spikes over crests and bumps (e.g. the Corkscrew drop). |
| `wheelSpinVel` | list of 4 floats | rad/s | Rotation speed of each wheel: `[0]` front-left, `[1]` front-right, `[2]` rear-left, `[3]` rear-right. | ✅ Yes (traction control) | Multiply by wheel radius for surface speed. Wheel much slower than car speed = locking under braking (use for ABS). Rear much faster than front = wheelspin. |
| `rpm` | float | rev/min | Engine speed. | ❌ No | Better shift trigger than fixed km/h thresholds. |
| `gear` | int | −1 (reverse), 0 (neutral), 1 … 6 | Gear currently engaged. | ❌ No (gear is written, not read) | Useful for RPM-based shifting with hysteresis. |
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
| `brake` | float | 0 … 1 | Brake pedal. 0 = off, 1 = full. | ❌ **No — always 0** | The biggest missing piece. Very strong on this car; full brake at speed will lock the wheels, so it needs ABS logic (watch `wheelSpinVel`). |
| `steer` | float | −1 … +1 | Steering. **+1 = full left, −1 = full right.** ±1 ≈ ±21° at the wheels on `car1-ow1`. | ✅ Yes | Values beyond ±1 are clipped when sent, but `drive_example()` reads the unclipped value on line 541. |
| `gear` | int | −1 (reverse), 0 (neutral), 1 … 6 | Gear to engage. Invalid values are replaced with 0 (neutral). | ✅ Yes | Set every step from fixed speed thresholds. Reverse is useful for recovering after a spin. |
| `clutch` | float | 0 … 1 | Clutch pedal. 0 = engaged, 1 = fully pressed. | ❌ No | TORCS handles the clutch automatically during shifts; mainly useful for launch control. |
| `focus` | list of angles | each −90 … +90 degrees | Direction(s) to aim the `focus` sensor beams, relative to the car's nose. | ❌ No (default `[-90,-45,0,45,90]` sent every step) | Only matters if you read the `focus` sensor. |
| `meta` | int | 0 or 1 | 1 = ask the server to restart the race. | ❌ No | `gym_torcs.py` sets this to end an episode. Leave at 0 when racing. |
