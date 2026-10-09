# driver/

The active racing driver for TORCS, hand-tuned over 133 recorded versions on the
Corkscrew circuit. No neural networks — all control logic is explicit physics, braking
plans, and track memory.

**Current version:** v1.33 · **1:05.56** · zero damage · 0 of 30 safety runs off-track

**This page describes the sensor-driven driver as it stood at v1.06.** That logic is
still in the file and still drives the start and the finish straight, and it still
plans the speed outside `plan_mem`. Since v1.11–v1.19 most of the lap is steered by a
planned line stored in the file (`plan_pos`, `plan_curv`, `plan_v`, one row per 10 m,
computed offline by `tools/raceline.py`) and followed with live feedback; inside
`plan_mem` the line's stored speed is the braking plan. The comments in the knob block
of `drive_example()` and `docs/tuning-card.md` are the current reference.

---

## What the driver is

`snakeoil3_v1.py` is a Python UDP client for the TORCS SCR (Simulated Car Racing)
interface. At each simulation step (~21 ms, 50 Hz) TORCS sends the car's sensor
readings over UDP and waits for the driver to send back a control action. The driver
reads sensors, runs its logic, and replies with steering, throttle, brake, and gear —
all within the same step.

The file is based on the open-source `snakeoil.py` library (Chris X Edwards). The
library handles the UDP protocol, option parsing, and the client loop. All driving
logic lives in `drive_example()`.

---

## Inputs (what the driver reads each step)

| Sensor | Description |
|---|---|
| `track[0..18]` | 19 range-finder beams at fixed angles (−45° to +45°). Each reads the distance in metres to the edge of the road. Angles are defined in `TRACK_ANGLES` at the top of the file. |
| `speedX` | Forward speed (km/h). |
| `speedY` | Sideways speed (km/h). Positive = sliding left. |
| `speedZ` | Vertical speed (km/h). Used to detect crests that unload the tyres. |
| `trackPos` | Lateral position on the track (0 = centre, +1 = left edge, −1 = right edge). |
| `angle` | Yaw angle of the car relative to the track direction (radians). |
| `gear` | Current gear (1–6). |
| `rpm` | Engine RPM. |
| `damage` | Accumulated damage. |
| `wheelSpinVel[0..3]` | Angular velocity of each wheel (rad/s). Used for ABS and traction control. |
| `focus[0..4]` | Five narrow focus beams, 1° apart, aimed by the driver. The server replies once per second. Used by the S-bend look (v1.04+). |

---

## Outputs (what the driver sends each step)

| Action | Range | Description |
|---|---|---|
| `steer` | −1 to +1 | Steering wheel position (+ = left). |
| `accel` | 0 to 1 | Throttle pedal. |
| `brake` | 0 to 1 | Brake pedal. |
| `gear` | 1–6 | Target gear (the driver shifts by setting this directly). |
| `focus` | angle (°) | Angle at which to aim the next focus reading (optional). |

---

## Control loops

All control runs in `drive_example()` on every step, in this order:

### 1. Steering

**Lookahead (heading toward open road).** The 19 track beams are weighted by distance
squared; their weighted average bearing is the direction of the open road. The driver
steers toward it (`lookahead_gain`).

**Racing line (out-in-out).** In a bend (bearing over 2°), the lateral target shifts to
the outside on approach (`line_offset`, assisted by the corner set-up) and to the inside
near the apex (`line_apex`). An integral term corrects persistent inside-track error in
steady bends (`line_ki`). Both the apex extra and the integral fade out near full lock
so they do not fight the car in the hairpin or flick.

**Corner set-up.** On the straight before a bend the two beams just either side of the
track direction diverge (the longer side is the outside of the coming bend). The driver
reads this ~150 m before the bend and moves the car toward the outside (`setup_offset`)
so the turn-in starts from the correct position.

**Steering cap and rate limit.** Above ~100 km/h the steering is capped at `steer_cap`
(the front tyres are saturated past that point). The wheel may not move more than
`max_steer_step` per step regardless.

### 2. Speed planning (allowed speed)

The driver computes `allowed_speed` — the fastest the car may go given what the sensors
show — on every step. Three sources contribute, and the highest is used:

**Road-ahead plan.** The longest beam near the nose gives the visible stopping distance.
The plan assumes `brake_decel + brake_aero·v²` of deceleration and solves for the
fastest speed from which the car can slow to `corner_speed` within that distance, less a
safety margin (`brake_margin`). The deceleration is reduced on crests (vertical
acceleration reduces tyre load) with a speed-dependent floor (`brake_load_min`,
`brake_load_fast`). A higher cap (`brake_max_hi`) applies at medium speeds.

**Sharpness plan.** For each beam at a meaningful angle, the driver computes whether the
car could follow a curve toward that beam (at `turn_grip` of sideways acceleration) and
slow to `corner_speed` by the end of it. Wide bends with long beams at moderate angles
allow more speed; tight hairpins with short beams at wide angles allow less. The credit
fades out with steering input (`turn_steer_fade`/`turn_steer_max`) so it does not fire
near full lock.

**Corner table (track memory, v1.06+).** A hand-written table of (from, to, speed
offset) rows adds a fixed km/h offset to `allowed_speed` within specified distance
ranges. This captures corner-by-corner knowledge — which bends have more headroom than
the sensors can see — without replacing the live sensor plan.

### 3. Throttle

If `speedX < allowed_speed`, the stored throttle ramps up at +0.05 per step, starting
from the engine's zero-torque throttle rather than 0 (to avoid engine-braking after
every brake touch). If `speedX > allowed_speed`, the stored throttle ramps down at
−0.01 per step.

**Lift band.** A small excess over `allowed_speed` (up to `lift_pct`% of speed, faded
in from `lift_v0`) causes only a lift (throttle 0, stored throttle kept) rather than a
brake. This prevents the car from braking in steady medium corners where it rides the
plan at ±1 km/h.

**Full-lock throttle limit.** Above `lock_steer` of steering the throttle is capped,
falling to `lock_throttle` at full lock. The limit is modulated by the time to the
outside edge so it stays higher during a clean drift that has stopped widening.

### 4. Braking

If `speedX > allowed_speed + lift_band`, the brake pedal is set to
`brake_gain × (speed − allowed_speed)`. A soft brake touch (< `touch_brake`) keeps
most of the stored throttle so the engine does not restart from 0 after the touch.
The dab logic (`dab_n` steps) protects against one-step plan dips zeroing the throttle
at high speed.

**ABS.** If the slowest wheel turns below `abs_ratio` of the car speed, the brake pedal
is multiplied by `abs_cut` (partial release, keeps the tyre near its peak slip).

### 5. Gear shifting

Upshift when the driven-wheel RPM (not engine RPM) exceeds `upshift_rpm`. Hold for
`upshift_hold` steps before allowing a downshift (prevents 2-3-2 hunting). Downshift
when the lower gear would land below `downshift_rpm`; a more aggressive threshold
(`brake_ds_rpm`) applies while braking hard. First gear is engaged from second at full
lock below `lock_gear_v` km/h (engine braking aids turning).

### 6. Traction control

Computes rear over-speed: rear-wheel surface speed minus front-wheel surface speed
(m/s). The cut threshold (`tc_slip`) rises on straights (`tc_slip_straight`, faded by
steering and sideways speed). It also scales with speed (`tc_vref`) because the tyre
force depends on slip ratio, not slip in m/s. If rear over-speed exceeds the threshold,
the throttle sent this step is cut by `tc_gain × excess`. The cut fades out at
`tc_hold` per step to prevent chatter.

Launch traction control (`launch_slip`) is disabled until the car first exceeds
`launch_v`, allowing wheelspin off the line.

**Clutch.** The clutch pedal is slipped (`clutch_slip`) while the driven-wheel RPM is
below `clutch_top` and for `shift_steps` steps after each upshift, passing full engine
torque while matching revs.

---

## State machines

### S-bend look (v1.04+)

When the longest track beam sits at the edge of a kink (off the nose by several
degrees, with its outer neighbour much shorter), the driver requests the focus beams
aimed just inside that kink. The server replies one second later. If the focus readings
show a far edge facing the car (road turns back behind the kink), a slow corner is
identified. The allowed speed is then capped to the braking distance to `corner_speed`
over the look's longest ray for `sb_hold` steps. This handles the flick approach
(~2,346 m on Corkscrew) where the 19 track beams cannot distinguish a flat-out kink
from a kink followed by a sharp corner.

### Standing-start launch

On the first step after the race starts the car is at rest. Traction control is fully
disabled (via `launch_slip`) until `launch_v` is first reached. After the launch the
exit-straight logic (`exit_vy`, `exit_steer`) also allows extra wheelspin while the
car runs straight out of slow corners.

---

## Knob organisation

All 50+ tuning knobs are local variables declared at the **top of `drive_example()`**,
before the logic that uses them. This is deliberate: `tools/race.py` overrides knobs
by text-substitution into this block (regex: `    name=value`), so knob lines must
be one per line, four-space indented, and must not appear anywhere else in the function
with the same name.

Knob categories:

| Category | Key knobs |
|---|---|
| Braking plan | `brake_decel`, `brake_aero`, `brake_max`, `brake_max_hi`, `brake_hi_v`, `brake_margin` |
| Brake response | `brake_gain`, `brake_load_min`, `brake_load_fast`, `abs_ratio`, `abs_cut` |
| Corner speed floor | `corner_speed` |
| Sharpness plan | `turn_grip`, `turn_grip_aero`, `turn_steer_max`, `turn_steer_fade`, `slip_ref` |
| Racing line | `line_offset`, `line_gain`, `line_aim_off`, `line_apex`, `line_ki`, `lookahead_gain` |
| Corner set-up | `setup_dist`, `setup_offset`, `setup_road`, `setup_pull` |
| Steering limits | `steer_cap`, `max_steer_step` |
| Traction control | `tc_slip`, `tc_gain`, `tc_hold`, `tc_slip_straight`, `tc_vref` |
| Gear shifting | `upshift_rpm`, `downshift_rpm`, `upshift_hold`, `lock_gear_on` |
| Throttle/lift | `lift_pct`, `lift_v0`, `thr_zero`, `touch_brake`, `dab_n`, `dab_keep` |
| Full-lock throttle | `lock_steer`, `lock_throttle`, `lock_tte_near`, `lock_tte_far` |
| S-bend look | `sb_a`, `sb_v`, `sb_fall`, `sb_x`, `sb_hold` |
| Track memory | `corner_table` (v1.06+) |
| Launch / clutch | `launch_v`, `launch_slip`, `clutch_slip`, `clutch_top`, `shift_steps` |

To try a knob value without editing this file, use `tools/race.py --set knob=value`.

---

## How to read this file

1. **`TRACK_ANGLES`** (line 22) — the 19 beam angles; this is the geometry every
   distance calculation is built on.

2. **`drive_example()` knob block** (lines ~470–683) — all tuning parameters in one
   place, each with a comment that gives the unit, what the setting does and why it
   has its value. The planned line's tables (`plan_pos`, `plan_curv`, `plan_v`) end it.

3. **Steering** (lines ~687–815) — the sensor steering (lookahead, racing line, corner
   set-up), then the planned-line follower that replaces it inside `plan_zones`, the
   steering cap and the rate limit.

4. **Speed planning** (lines ~817–919) — brake planning math, sharpness plan, S-bend
   look, the planned line's speed, the braking plan from track memory, corner table.

5. **Throttle / Brake / ABS** (lines ~921–991) — the control laws that act on
   `allowed_speed`.

6. **Gear / traction control / clutch** (lines ~993–1085) — wheel-slip logic, clutch
   slip and the gear state machine.

The comments say what each part does and why. The history of every value (each trial
and its numbers) is in `docs/CHANGELOG.md` and `docs/tuning-card.md`.
