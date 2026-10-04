Simplified summary for readers. CHANGELOG.md is the authoritative log; agents working on the driver must read CHANGELOG.md, not this file.

# AI Racing — the story of each version, in plain language

## What this project is

This project teaches a computer program to drive a racing car around one track (the "Corkscrew", about 3.6 km long) in a racing simulator called TORCS. The program is not a learning system: it follows rules written by hand, such as "brake when the road ahead is short" or "ease the throttle when the rear wheels spin". The work consists of improving those rules, one step at a time, to make the lap faster.

Two things must hold on every accepted lap: the car takes **no damage**, and it **never leaves the track**.

## What a "version" is

Each version (v0.1, v0.2, … v1.05) is one experiment: one change to how the car drives, followed by a measured lap. The version numbers here are the same as in CHANGELOG.md, in the same order, so the two files can be read side by side. After v0.99 comes v1.00.

Each entry is a table with the same rows as in CHANGELOG.md: what was changed, why it was tried, what was expected beforehand (Prediction), the measured lap time, damage, top speed and lowest corner speed (Min speed), what was observed, the decision, and what was learned.

- **Kept** means the change stayed in the driver and the next version builds on it.
- **Rejected** means the change was undone and the driver went back to the previous kept version. Rejected versions stay in the log, because knowing what does not work is useful too.
- A few versions were kept although they were not faster, because they made the car safer and so made a later, faster change possible. These are called **enabling changes**.

## How results are judged

In the early versions a single lap decided. The simulator is perfectly repeatable: the same driver always produces exactly the same lap. But a tiny change early in the lap can ripple through the rest of it, so one lap can be 0.2 seconds faster or slower by luck. From about v0.45 onward, therefore, each candidate was also driven many times with its settings nudged slightly, and the average decided. The single lap time is still given for every version.

All lap times are written as minutes:seconds:hundredths, so 1:13:59 means 1 minute 13.59 seconds.

## Words you will meet

- **Lap time** — the time for one lap from a standing start. Lower is better.
- **Min speed / slowest corner** — the lowest speed the car drops to in any corner during the lap. (In v0.2 to v0.9 the log gave the lowest speed anywhere on the lap; the entries call that the "slowest point".)
- **Off the road / off the track** — the centre of the car crossed the edge of the road surface. Entries sometimes say how much of the road the car used, as a share of the way from the centre line to the edge: 0 is the middle of the road, 1.0 is the edge, so "0.95 of the way to the edge" is very close.
- **The flick** — a quick left-then-right pair of tight corners in the Corkscrew section, about 2,450 m into the lap. It is the place where the car most often runs out of road.
- **The hairpin** — the tightest corner of the lap, about 3,250 m in, just before the finish straight.
- **The kink** — a slight bend taken at high speed. One lies just before the flick, another on the start straight.
- **Apex** — the point in a corner where the car is closest to the inside edge.
- **Full lock** — the steering turned as far as it will go.
- **Wheelspin control** (traction control) — easing the throttle when the driven rear wheels spin faster than the car is moving.
- **Anti-lock brakes** (ABS) — easing the brake when a wheel stops turning, so the tyres keep gripping and the car can still steer.
- **The speed plan / braking plan** — the car's running estimate of the fastest speed it may be doing right now and still slow down in time for what it can see ahead.
- **Beams** — the car's distance sensors. Each measures how far it is to the edge of the road in one direction.
- **Robustness laps** — the lap driven again with one setting nudged slightly each time, to check that the car is not relying on luck. The standard check is three sets of 10 such laps (30 in all); none may leave the road.
- **Shifted-start laps** — a second check introduced at v0.68: 40 more laps starting from two slightly different basic set-ups. At most one lap in 40 off the road was tolerated.
- **Within chance variation** — a difference so small that it could be luck rather than a real effect of the change.
- **Margin** — the room left between the car and the edge of the road on its worst lap. Many versions trade margin for speed or speed for margin.

---

## v0.1 — The starting point: the original driver

| Field | Detail |
|---|---|
| **Version** | v0.1 |
| **What changed** | Nothing was changed. This was the driver as supplied, which aims for 300 km/h and never uses the brake, run once to have something to compare against. |
| **Why** | To have a starting point to compare every later change against. |
| **Prediction** | None (starting point). |
| **Lap time** | No lap completed |
| **Damage** | N/A |
| **Top speed** | N/A |
| **Min speed** | N/A |
| **Observed** | The car reached every corner far too fast, hit a wall and got stuck before finishing the lap. No lap completed. |
| **Decision** | ❌ Rejected — it cannot finish a lap. |
| **Learned** | The car has no working brake, so speed had to come down before anything else could be tuned. |

---

## v0.2 — Aim for 80 km/h instead of 300

| Field | Detail |
|---|---|
| **Version** | v0.2 |
| **What changed** | The speed the car aims for was lowered from 300 to 80 km/h. |
| **Why** | Without a brake, the only way the car slowed was by easing off the throttle, and that cannot lose enough speed from 300 km/h before a corner. |
| **Prediction** | The car completes at least one lap without hitting a wall. The lap will be slow. Damage zero or very low. |
| **Lap time** | 2:43:38 |
| **Damage** | 0 |
| **Top speed** | 109 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Lap 2:43:38, damage 0, top speed 109 km/h, slowest point 49 km/h. |
| **Decision** | ✅ Kept — the first clean lap. |
| **Learned** | The target speed is the strongest safety setting, and there was room to raise it carefully. |

---

## v0.3 — Slow down for right-hand corners too

| Field | Detail |
|---|---|
| **Version** | v0.3 |
| **What changed** | A mistake in the driver was fixed: it slowed down for left-hand corners but actually sped up for right-hand ones. The run was also made to stop the moment the car takes any damage. |
| **Why** | Before going faster, the car had to slow down for every corner, or right-hand corners would be where it crashed. A run with any damage counts as a failure, so there is no point in continuing it. |
| **Prediction** | The same lap time as v0.2 or slightly slower, because the car now gives up speed in right-hand corners. Damage 0. |
| **Lap time** | 2:48:72 |
| **Damage** | 0 |
| **Top speed** | 86 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Lap 2:48:72 (5.34 s slower than v0.2), damage 0, top speed 86 km/h, slowest point 49 km/h. |
| **Decision** | ✅ Kept — slower, but it is a correction that had to be in place before going faster. |
| **Learned** | Part of v0.2's lap time came from carrying unsafe speed through right-handers; the car now needed a real brake. |

---

## v0.4 — The car learns to brake

| Field | Detail |
|---|---|
| **Version** | v0.4 |
| **What changed** | The car now looks at how much road it can see straight ahead and works out the fastest speed from which it could still slow down in time for the corner. If it is going faster than that, it brakes. A simple anti-lock system (ABS: easing the brake when a wheel stops turning, so the car can still steer) was added, and the speed the car aims for was raised from 80 to 120 km/h. |
| **Why** | Until now the only way the car could slow down was to ease off the throttle, which is why its speed had to be kept at 80 km/h. A brake that plans from the road it can see lets the car go faster on the straights and still arrive at corners slowly. |
| **Prediction** | Top speed rises toward 120 km/h and the car visibly brakes before corners. Faster than v0.3, possibly faster than v0.2. Damage 0. |
| **Lap time** | 2:31:18 |
| **Damage** | 0 |
| **Top speed** | 144 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Lap 2:31:18 (17.54 s faster than v0.3), damage 0, top speed 144 km/h, slowest point 49 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | Braking from what the car can see works; the car was still slow out of corners because the throttle took 2 seconds to come back to full. |

---

## v0.5 — Back on the throttle faster

| Field | Detail |
|---|---|
| **Version** | v0.5 |
| **What changed** | After braking, the throttle now comes back five times faster: in 0.4 seconds instead of 2. |
| **Why** | After braking, the throttle used to creep back up over 2 seconds, so the car crawled out of every corner. |
| **Prediction** | Faster out of corners and a faster lap than v0.4; top speed about the same. Possibly brief wheelspin. Damage 0. |
| **Lap time** | 2:27:84 |
| **Damage** | 0 |
| **Top speed** | 145 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Lap 2:27:84 (3.34 s faster), damage 0, top speed 145 km/h, slowest point 49 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The gain came from accelerating between corners; the car was also changing up through the gears far too early for the engine to give its best. |

---

## v0.6 — Change gear by engine speed instead of road speed

| Field | Detail |
|---|---|
| **Version** | v0.6 |
| **What changed** | The gear changes were moved from fixed road speeds to engine speed, so the engine would stay in the rev range where it pulls hardest. |
| **Why** | The car's data sheet showed the old shift points were far below that range. |
| **Prediction** | Much stronger acceleration, a faster lap than v0.5 and a higher top speed. Risks: more wheelspin out of slow corners and a twitchy car into corners. |
| **Lap time** | 2:29:85 |
| **Damage** | 0 |
| **Top speed** | 136 km/h |
| **Min speed** | 49 km/h |
| **Observed** | Lap 2:29:85 (2.01 s slower than v0.5), damage 0, top speed 136 km/h (down from 145), slowest point 49 km/h. |
| **Decision** | ❌ Rejected — slower and lower top speed; the driver went back to v0.5. |
| **Learned** | The likely cause (not confirmed, because there was no recorded data yet) was wheelspin in the low gears; the car seemed limited by tyre grip, not engine power. |

---

## v0.7 — Steer toward where the road is going

| Field | Detail |
|---|---|
| **Version** | v0.7 |
| **What changed** | Now the car also steers toward the direction in which it can see the most open road, which turns it in earlier and more smoothly. A data recorder was added that writes down what the car does at every moment of the lap (it does not affect the driving). |
| **Why** | The steering used to react only once the car was already out of line, so it turned in late. The data recorder was added because v0.6's result could not be explained without data. |
| **Prediction** | Smoother, earlier turn-in. Lap time similar to or slightly faster than v0.5; mainly a change for stability. |
| **Lap time** | 2:19:31 |
| **Damage** | 0 |
| **Top speed** | 145 km/h |
| **Min speed** | 50 km/h |
| **Observed** | Lap 2:19:31 (8.53 s faster than v0.5), damage 0, top speed 145 km/h, slowest point 50 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The recorded data showed the car was far below its limits: it braked very gently for 43 % of the lap, sat at its speed cap on the straights, never slid and used only the middle of the road. |

---

## v0.8 — Brake later and harder

| Field | Detail |
|---|---|
| **Version** | v0.8 |
| **What changed** | The braking plan was told the car can slow down more strongly than it had assumed. |
| **Why** | The data from v0.7 showed the brakes could do roughly twice what the plan expected, so the car had been braking lightly over very long distances. |
| **Prediction** | Shorter braking zones and a clearly faster lap than v0.7; far less of the lap spent braking. |
| **Lap time** | 2:08:37 |
| **Damage** | 0 |
| **Top speed** | 148 km/h |
| **Min speed** | 50 km/h |
| **Observed** | Lap 2:08:37 (10.94 s faster), damage 0, top speed 148 km/h, slowest point 50 km/h. |
| **Decision** | ✅ Kept — the biggest single gain so far. |
| **Learned** | Time spent braking fell from 43 % to 29 % of the lap; the car now spent over a quarter of the lap held at its 120 km/h speed cap on the straights. |

---

## v0.9 — Raise the speed cap on the straights to 160 km/h

| Field | Detail |
|---|---|
| **Version** | v0.9 |
| **What changed** | The speed the car aims for on the straights was raised from 120 to 160 km/h. |
| **Why** | The braking plan already slows the car for corners by itself, so the cap was no longer needed for safety. |
| **Prediction** | Top speed about 155–165 km/h and a faster lap than v0.8; slow corners unchanged. |
| **Lap time** | 2:02:25 |
| **Damage** | 0 |
| **Top speed** | 175 km/h |
| **Min speed** | 50 km/h |
| **Observed** | Lap 2:02:25 (6.12 s faster), damage 0, top speed 175 km/h, slowest point 50 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The gain was all on the straights; corner speeds had not changed since v0.7, the car was not sliding and it still used only the middle third of the road, so corners were the next thing to work on. |

---

## v0.10 — Take corners a little faster (60 km/h)

| Field | Detail |
|---|---|
| **Version** | v0.10 |
| **What changed** | The speed the car plans to be down to at the end of the road it can see was raised from 50 to 60 km/h. |
| **Why** | In a corner the car can only see a short piece of road, so this number in practice sets how fast it takes tight corners. The car showed no sliding and stayed in the middle of the road, so there was grip and room to spare. |
| **Prediction** | Slowest corner about 58–62 km/h and a faster lap than v0.9. Risk: running wide in the two slowest corners. |
| **Lap time** | 1:56:26 |
| **Damage** | 0 |
| **Top speed** | 170 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:56:26 (5.99 s faster), damage 0, top speed 170 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the first lap under two minutes. |
| **Learned** | Every corner got faster with no loss of control; the car still was not sliding and still stayed in the middle of the road. |

---

## v0.11 — Corners faster again (70 km/h)

| Field | Detail |
|---|---|
| **Version** | v0.11 |
| **What changed** | The same corner-speed setting was raised another step, from 60 to 70 km/h. |
| **Why** | v0.10 had made every corner faster with almost no sliding, so another step followed the same trend. |
| **Prediction** | Slowest corner about 68–70 km/h and a lap a few seconds faster; the car may start to slide. |
| **Lap time** | 1:50:71 |
| **Damage** | 0 |
| **Top speed** | 175 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:50:71 (5.55 s faster), damage 0, top speed 175 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The gain was almost as large as the first step, but the car slid sideways for the first time, at the exit of the tight corner about 2,450 m into the lap. Raising corner speed further would probably push that corner over the limit, so the next gain had to come from elsewhere. |

---

## v0.12 — Brake harder again

| Field | Detail |
|---|---|
| **Version** | v0.12 |
| **What changed** | The braking plan was allowed to assume stronger braking once more. |
| **Why** | The car was still braking for 37 % of the lap and never pressed the pedal much, while the measurements showed more was available. |
| **Prediction** | About 1–3 s faster. |
| **Lap time** | 1:46:91 |
| **Damage** | 0 |
| **Top speed** | 173 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:46:91 (3.80 s faster), damage 0, top speed 173 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | Braking later also let the car carry more speed through fast corners. The slide at the 2,450 m corner exit grew slightly, so that corner stayed the one to watch. |

---

## v0.13 — One more step of harder braking

| Field | Detail |
|---|---|
| **Version** | v0.13 |
| **What changed** | The braking plan was raised one more step, to just under what the brakes were measured to do. |
| **Why** | The previous step gained 3.80 s with no damage, and the brake pedal was still not being pressed hard. |
| **Prediction** | About 1–2 s faster, less than v0.12 because the step is smaller. |
| **Lap time** | 1:45:26 |
| **Damage** | 0 |
| **Top speed** | 175 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Lap 1:45:26 (1.65 s faster), damage 0, top speed 175 km/h, slowest corner 69 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The slide at the 2,450 m corner did not grow. The braking plan now had no real room left, and the car still used only the middle 40 % of the road, so the next gain had to come from the line through the corners. |

---

## v0.14 — A first racing line: outside, inside, outside

| Field | Detail |
|---|---|
| **Version** | v0.14 |
| **What changed** | The car was given a racing line: when it sees a bend it moves toward the outside of the road, cuts to the inside near the middle of the corner (the "apex"), and drifts back out on the exit. |
| **Why** | A wider line makes the corner less sharp and lets the car see further around it. The braking plan had little left to give, and the car was only using the middle of the road. |
| **Prediction** | A gentle effect: the car uses a little more of the road and the lap is about 0–2 s faster. |
| **Lap time** | 1:44:52 |
| **Damage** | 0 |
| **Top speed** | 170 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Lap 1:44:52 (0.74 s faster), damage 0, top speed 170 km/h, slowest corner 69 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The idea worked in the right direction, since the corners where the car moved were the ones that got faster, but the pull toward the line was so weak that the car barely moved sideways. It needed a stronger pull. |

---

## v0.15 — A stronger pull toward the racing line

| Field | Detail |
|---|---|
| **Version** | v0.15 |
| **What changed** | The pull toward the racing line was made stronger and reshaped so that it eases off as the car reaches the line and can never push the car past it. |
| **Why** | v0.14 barely moved the car sideways, yet the corners where it did move were the ones that got faster. |
| **Prediction** | About 0.5–1.5 s faster, with the car clearly using more of the road. |
| **Lap time** | 1:44:09 |
| **Damage** | 0 |
| **Top speed** | 170 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:44:09 (0.43 s faster), damage 0, top speed 170 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The car did not actually move further out; it ended up a little nearer the middle of the road, and the steering became busier. Steering toward a line gave only small gains at this stage. The data showed something else: the car spent 22 % of the lap held at its 160 km/h cap on the straights. |

---

## v0.16 — Raise the speed cap on the straights to 180 km/h

| Field | Detail |
|---|---|
| **Version** | v0.16 |
| **What changed** | The speed the car aims for on the straights was raised from 160 to 180 km/h. |
| **Why** | The car was held at its 160 km/h cap for 22 % of the lap, and the braking plan already protects the corners. |
| **Prediction** | About 1–2 s faster, gained on the straights; top speed about 185–190 km/h. |
| **Lap time** | 1:42:73 |
| **Damage** | 0 |
| **Top speed** | 193 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:42:73 (1.36 s faster), damage 0, top speed 193 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The time came from the straights as expected, corners were unchanged, and the car did not weave at the higher speed. |

---

## v0.17 — Raise the speed cap to 200 km/h

| Field | Detail |
|---|---|
| **Version** | v0.17 |
| **What changed** | The cap was raised again, from 180 to 200 km/h. |
| **Why** | v0.16 gained 1.36 s with no weaving, and the car still sat at the cap for 7.8 % of the lap. |
| **Prediction** | About 0.5–1 s faster; top speed about 205–212 km/h. |
| **Lap time** | 1:42:55 |
| **Damage** | 0 |
| **Top speed** | 209 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:42:55 (only 0.18 s faster), damage 0, top speed 209 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The straights were nearly used up, since only a few are long enough to reach the higher speed. A closer look at the 2,450 m corner showed it is a quick left-then-right "flick", and that the slide there starts when the steering snaps from nearly straight to full right in two instants while braking. |

---

## v0.18 — Limit how fast the steering wheel can move

| Field | Detail |
|---|---|
| **Version** | v0.18 |
| **What changed** | A limit was put on how far the steering can change from one instant to the next. |
| **Why** | The data showed that the slide at the flick starts with a sudden snap of the steering; that slide had kept the corner-speed setting from being raised since v0.11. |
| **Prediction** | About the same lap time (within 0.3 s), with a clearly smaller slide at the flick. |
| **Lap time** | 1:42:50 |
| **Damage** | 0 |
| **Top speed** | 209 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:42:50 (0.05 s faster), damage 0, top speed 209 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — marginally faster and it removes sudden steering snaps at no cost. |
| **Learned** | The slide barely changed. It is not caused by how fast the steering moves but by where it goes: full opposite lock at about 77 km/h, under light braking, right after a left turn. The limit stays as a safety net. |

---

## v0.19 — Corners a little faster (75 km/h)

| Field | Detail |
|---|---|
| **Version** | v0.19 |
| **What changed** | The corner-speed setting was raised from 70 to 75 km/h, half the size of the earlier steps. |
| **Why** | Corners were the biggest remaining time, the straights were nearly used up, and the slide at the flick had been seen to recover cleanly. |
| **Prediction** | About 2–3 s faster; slowest corner about 73–75 km/h; the slide at the flick will grow. |
| **Lap time** | 1:41:32 |
| **Damage** | 0 |
| **Top speed** | 208 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Lap 1:41:32 (1.18 s faster), damage 0, top speed 208 km/h, slowest corner 69 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | Every corner got faster, but about 0.41 s was lost on the final straight because the car kept changing between 5th and 6th gear at exactly 170 km/h. The tightest corner (the hairpin near 3,250 m) was now at full steering lock, so the car ran wider on the exit instead of going faster. |

---

## v0.20 — Stop the gearbox hunting between two gears

| Field | Detail |
|---|---|
| **Version** | v0.20 |
| **What changed** | The car now changes down 10 km/h lower than it changes up, so a tiny loss of speed during a gear change can no longer trigger a change straight back. |
| **Why** | In v0.19 the car kept changing between 5th and 6th gear at exactly 170 km/h, which cost about 0.41 s. |
| **Prediction** | About 0.3–0.5 s faster, with no more back-and-forth gear changes. |
| **Lap time** | 1:40:55 |
| **Damage** | 0 |
| **Top speed** | 209 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Lap 1:40:55 (0.77 s faster), damage 0, top speed 209 km/h, slowest corner 69 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; it fixes the gear hunting. |
| **Learned** | The hunting had been costing time all over the lap, not only on the final straight (87 back-and-forth changes fell to 5). The gear-change points were still far below where the engine pulls hardest. |

---

## v0.21 — A racing line that actually moves the car

| Field | Detail |
|---|---|
| **Version** | v0.21 |
| **What changed** | The pull toward the racing line was made two and a half times stronger. Two new columns were added to the recorded data to show where the line is active and what it asks for. |
| **Why** | The user asked for a better racing line. The earlier versions had barely moved the car, because the pull was far too slow for the length of a corner. |
| **Prediction** | About 0–1 s faster, with the car visibly using more of the road in bends. |
| **Lap time** | 1:39:92 |
| **Damage** | 0 |
| **Top speed** | 209 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:39:92 (0.63 s faster), damage 0, top speed 209 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The car used a little more of the road, but it still did not reach the line, because the line's target jumped from one side of the road to the other faster than the car could follow, and it also switched on along near-straights. The steering was much busier. The line needed a steadier target. |

---

## v0.22 — Change gear by engine speed (second attempt)

| Field | Detail |
|---|---|
| **Version** | v0.22 |
| **What changed** | The gear changes were moved to engine speed again, this time changing up at a moderate engine speed and with a built-in gap before changing back down. |
| **Why** | The user asked for it; the first attempt (v0.6) had been slower. The car was changing up far below the revs where the engine pulls hardest. |
| **Prediction** | About 0.5–1.5 s faster, gained on corner exits and short straights. Risks: more wheelspin and a less settled car into corners. |
| **Lap time** | 1:39:38 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:39:38 (0.54 s faster), damage 0, top speed 213 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | Holding the lower gears longer gave better acceleration. But dropping to 1st gear in four slow corners gained nothing, and at the flick the strong engine braking of 1st gear made the rear step out, doubling the slide there (the biggest so far). |

---

## v0.23 — No 1st gear once the car is moving

| Field | Detail |
|---|---|
| **Version** | v0.23 |
| **What changed** | The car now uses 1st gear only for the start and never changes down into it. |
| **Why** | In v0.22, 1st gear's engine braking caused the biggest slide so far at the flick, and the four slow corners where 1st was used were no faster. |
| **Prediction** | About the same lap time (within 0.2 s), with the slide at the flick back to a smaller size. |
| **Lap time** | 1:39:18 |
| **Damage** | 0 |
| **Top speed** | 212 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Lap 1:39:18 (0.20 s faster), damage 0, top speed 212 km/h, slowest corner 69 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; the slide at the flick shrank from 16.0 to 10.9 km/h sideways. |
| **Learned** | In 10 of the 12 corners the car was held back by the fixed corner-speed setting, not by grip, so a corner speed that depends on how sharp each bend is could gain time. |

---

## v0.24 — Record more data (no change to the driving)

| Field | Detail |
|---|---|
| **Version** | v0.24 |
| **What changed** | Nothing about the driving changed. The data recorder now also writes down all 19 of the car's distance sensors (the "beams" that measure how far it is to the edge of the road in different directions), to find out whether they show which way a corner turns early enough to plan for it. |
| **Why** | The user wanted corner speed to depend on how sharp a turn is, and a wider racing line. Both need the car to know, well before a corner, which way and how sharply it turns. Running an unchanged driver also showed how much two identical runs differ. |
| **Prediction** | The same lap as v0.23; any difference would be chance. |
| **Lap time** | 1:39:18 |
| **Damage** | 0 |
| **Top speed** | 212 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Lap 1:39:18, damage 0, top speed 212 km/h, slowest corner 69 km/h — identical to v0.23 at every one of 4,747 recorded moments. |
| **Decision** | ✅ Kept — data only. |
| **Learned** | The simulation is fully repeatable, so even a 0.05 s difference is caused by the change made. The beams do show which way a corner turns 100–200 m ahead. |

---

## v0.25 — Move to the outside before every corner

| Field | Detail |
|---|---|
| **Version** | v0.25 |
| **What changed** | Using the new beam information, the racing line was made to start earlier: the car was to sit on the outside of the road well before each corner and cut to the inside at the apex. |
| **Why** | The user wanted a line that uses more of the road. Until now the line only started about 40 m before a corner, when it was already time to go to the inside. |
| **Prediction** | About 0.3–1 s faster, with the car on the outside before turning in. |
| **Lap time** | 1:39:64 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 69 km/h |
| **Observed** | Lap 1:39:64 (0.46 s slower), damage 0, top speed 213 km/h, slowest corner 69 km/h. |
| **Decision** | ❌ Rejected — slower; the driver went back to v0.24. |
| **Learned** | The corners actually got slightly faster, but the straights lost more. Angling the car toward the outside also pointed its forward-looking sensors at the edge of the road, so the car thought the road was ending and braked hard on a straight. The car's view of the road ahead had to be fixed before any racing line could pay off. |

---

## v0.26 — Look ahead along the road, not only along the car's nose

| Field | Detail |
|---|---|
| **Version** | v0.26 |
| **What changed** | The car now measures the road ahead both along its nose and along the direction the road itself runs (when the car is nearly lined up with it), and uses the longer of the two. |
| **Why** | This removes the false "end of the road" that sank v0.25. Every racing-line change needed this fixed first. |
| **Prediction** | About 0–0.4 s faster; mainly a preparation for the racing line. |
| **Lap time** | 1:39:08 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 66 km/h |
| **Observed** | Lap 1:39:08 (0.10 s faster than v0.24), damage 0, top speed 213 km/h, slowest corner 66 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far, and it makes racing-line work possible. |
| **Learned** | A small, safe gain by itself, from accelerating earlier out of corners. |

---

## v0.27 — Corner speed that depends on how sharp the corner is

| Field | Detail |
|---|---|
| **Version** | v0.27 |
| **What changed** | The car now uses its distance sensors to judge how sharp each bend is: a wide, gentle corner may be taken faster, a tight one still slowly. It only trusts this when the curve it has in mind stays on the road and the steering is not turned far. |
| **Why** | Until now every corner was treated as if it needed the same slow speed. This was the user's idea. In 10 of the 12 corners the car had grip to spare and was held back only by the fixed corner speed. |
| **Prediction** | About 1–3 s faster, with medium corners taken 3–10 km/h faster. |
| **Lap time** | 1:32:30 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 68 km/h |
| **Observed** | Lap 1:32:30 (6.78 s faster), damage 0, top speed 213 km/h, slowest corner 68 km/h. |
| **Decision** | ✅ Kept — the biggest single gain since v0.8. |
| **Learned** | The fixed corner speed had been the biggest limit. The throttle now cost time on corner exits, because a wheelspin correction or a light touch of the brake reset it to zero. |

---

## v0.28 — Wheelspin control based on measurements

| Field | Detail |
|---|---|
| **Version** | v0.28 |
| **What changed** | The system that eases the throttle when the rear wheels spin (traction control) was rebuilt around a measured figure: the car accelerates best with a little wheelspin, and loses out beyond it. The correction also no longer wipes out the throttle the driver had built up. |
| **Why** | The user had noticed a lot of wheelspin out of corners. Measurements from earlier laps showed that the old system eased the throttle before the point of best acceleration, and that its corrections lingered. |
| **Prediction** | About 0.3–1.0 s faster, gained on corner exits. Risk: more sliding out of corners taken with the steering turned. |
| **Lap time** | 1:31:24 |
| **Damage** | 0 |
| **Top speed** | 212 km/h |
| **Min speed** | 73 km/h |
| **Observed** | Lap 1:31:24 (1.06 s faster), damage 0, top speed 212 km/h, slowest corner 73 km/h. |
| **Decision** | ✅ Kept — faster, and the car stayed on the road, but only just: at the hairpin exit it came within a whisker of the edge (0.92 of the way from the centre to the edge), and the slide at the flick was the biggest so far. |
| **Learned** | The measurement had been taken with the wheels almost straight. With the steering fully turned the tyres have no grip left over for power, so the next version had to deal with that. |

---

## v0.29 — Less throttle when the steering is turned hard

| Field | Detail |
|---|---|
| **Version** | v0.29 |
| **What changed** | When the steering is turned more than about 60 % of the way, the throttle is now limited, down to 30 % at full lock. |
| **Why** | With the wheels fully turned the car is already turning as tightly as it can, so extra speed only pushes it wide. In v0.28 the car had come within a whisker of the edge at the hairpin exit. |
| **Prediction** | A lap between 1:31:20 and 1:31:60, with the hairpin exit and the flick calmer. |
| **Lap time** | 1:31:26 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 73 km/h |
| **Observed** | Lap 1:31:26 (0.02 s slower), damage 0, top speed 213 km/h, slowest corner 73 km/h. |
| **Decision** | ✅ Kept — enabling change: the slide at the flick fell from 24 to 16 km/h sideways. |
| **Learned** | The hairpin exit was still too close to the edge (0.86), because limiting the throttle stopped the car speeding up but did not slow it down. |

---

## v0.30 — A smoother racing line that starts earlier

| Field | Detail |
|---|---|
| **Version** | v0.30 |
| **What changed** | The racing line was rebuilt to start as soon as a corner comes into view, taking the direction of the corner from the distance sensors, and to move its target across the road gradually instead of jumping. |
| **Why** | The user wanted the car to use the width of the road. The line was starting only about 40 m before a corner, too late to go to the outside first. |
| **Prediction** | About 0.3–1.5 s faster, with the car clearly further out before corners. |
| **Lap time** | 1:31:52 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 73 km/h |
| **Observed** | Lap 1:31:52 (0.26 s slower), damage 0, but the car **left the track** at the hairpin exit. |
| **Decision** | ❌ Rejected — off the track and slower; the driver went back to v0.29. |
| **Learned** | The car did not follow the line (the pull was still too weak), and the line sent it to the inside too early, before it had really turned in. The hairpin was fragile: 1–2 km/h more with the steering fully turned was enough to run off the road. |

---

## v0.31 — Slower through the hairpin

| Field | Detail |
|---|---|
| **Version** | v0.31 |
| **What changed** | The throttle allowed with the steering fully turned was reduced from 30 % to 20 %. |
| **Why** | The user chose to make the hairpin safe before reworking the racing line. At full lock the car's speed alone decides how wide it runs. |
| **Prediction** | About the same lap time (within 0.15 s), with the car further from the edge at the hairpin exit. |
| **Lap time** | 1:31:37 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 66 km/h |
| **Observed** | Lap 1:31:37 (0.11 s slower than v0.29), damage 0, top speed 213 km/h, slowest corner 66 km/h. |
| **Decision** | ✅ Kept — enabling change: the hairpin exit moved back from 0.86 to 0.59 of the way to the edge, and the flick was calmer. |
| **Learned** | At full steering lock, the speed alone decides how wide the car runs. It was also confirmed that the distance sensors work from a flat map of the track, so they "see" over hills, up to 200 m. |

---

## v0.32 — Use the whole road: outside from 200 m, a much stronger pull

| Field | Detail |
|---|---|
| **Version** | v0.32 |
| **What changed** | The racing line was rebuilt again: the car was to move to the outside as soon as a corner was within 200 m, go to the inside only after turning in, and be pulled toward the line three times as hard (with a cap on how much the line could steer). |
| **Why** | The user wanted the whole width of the road used. The previous attempt had shown that the pull was too weak and that the move to the inside came too early. |
| **Prediction** | About 0.5–2 s faster. |
| **Lap time** | 1:32:45 |
| **Damage** | 0 |
| **Top speed** | 212 km/h |
| **Min speed** | 72 km/h |
| **Observed** | Lap 1:32:45 (1.08 s slower), damage 0, top speed 212 km/h, slowest corner 72 km/h; the car stayed on the road. |
| **Decision** | ❌ Rejected — slower, and the user saw the steering wheel swinging back and forth; the driver went back to v0.31. |
| **Learned** | The line's target depended on where the car's own nose was pointing, so steering toward the line moved the target, which moved the steering again — a loop. The target had to be made steady first. |

---

## v0.33 — A steady target for the racing line

| Field | Detail |
|---|---|
| **Version** | v0.33 |
| **What changed** | The racing line's target was made independent of where the car's nose points: once the car decides it is in a bend it keeps that decision until the bend is clearly over, and it measures its progress through the bend along the road rather than along the nose. |
| **Why** | v0.32 showed that the line's target moved whenever the car's nose moved, which made the steering swing back and forth. A stronger pull could not work until the target was steady. |
| **Prediction** | About the same lap time (within 0.2 s), with calmer steering. |
| **Lap time** | 1:31:03 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 66 km/h |
| **Observed** | Lap 1:31:03 (0.34 s faster than v0.31), damage 0, top speed 213 km/h, slowest corner 66 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far, and the number of times the steering reversed direction was halved. |
| **Learned** | A steady target pays by itself. The line was still narrow, though: the car used only about a quarter of the available width. |

---

## v0.34 — Assume a little more cornering grip

| Field | Detail |
|---|---|
| **Version** | v0.34 |
| **What changed** | The sideways grip the car assumes when it judges how fast a bend can be taken was raised by one step. |
| **Why** | The corner-speed judgement of v0.27 was the biggest gain so far and had started with a cautious grip figure; the medium corners still showed little sliding. |
| **Prediction** | About 0.3–1.0 s faster. |
| **Lap time** | 1:30:74 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 65 km/h |
| **Observed** | Lap 1:30:74 (0.29 s faster), damage 0, top speed 213 km/h, slowest corner 65 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; the flick and the hairpin were calmer, not worse. |
| **Learned** | After this step the car was almost never held back by cornering grip. Nearly all its braking was now set by how much braking distance the plan thinks it needs, so braking became the thing to work on. |

---

## v0.35 — Press the brake pedal harder for the same overspeed

| Field | Detail |
|---|---|
| **Version** | v0.35 |
| **What changed** | The brake was made to respond more strongly when the car is above its planned speed, so the car would follow the planned braking more closely. |
| **Why** | Nearly all braking was now set by braking distance, and the car habitually ran a few km/h over its planned speed before the brake caught up. |
| **Prediction** | About the same lap time (within 0.15 s, possibly a little slower); meant as a preparation for stronger braking. |
| **Lap time** | 1:31:18 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 66 km/h |
| **Observed** | Lap 1:31:18 (0.44 s slower), damage 0, top speed 213 km/h, slowest corner 66 km/h. |
| **Decision** | ❌ Rejected — slower; the driver went back to v0.34. |
| **Learned** | The car's habit of running a few km/h over its plan was in effect braking a little later, in a way it could handle; following the plan more tightly just meant braking earlier. The run also showed that the car can brake far harder at high speed than the plan assumed, and that in the Corkscrew section the car goes light or leaves the ground, so wheel measurements there cannot be trusted. |

---

## v0.36 — Braking plan: assume stronger braking

| Field | Detail |
|---|---|
| **Version** | v0.36 |
| **What changed** | The braking plan was told the car can slow down more strongly, so braking starts later everywhere. |
| **Why** | Braking distance was limiting almost all of the car's braking, and the measurements showed the car can brake harder than the plan assumed. |
| **Prediction** | About 0.4–1.0 s faster. |
| **Lap time** | 1:28:99 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 65 km/h |
| **Observed** | Lap 1:28:99 (1.76 s faster than v0.34), damage 0, top speed 213 km/h, slowest corner 65 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far and the biggest gain since v0.27. |
| **Learned** | Braking distance had been the main limit. The cost showed where the car brakes while turning: at a fast kink just before the flick the rear stepped out and was caught. |

---

## v0.37 — Braking plan: one more step

| Field | Detail |
|---|---|
| **Version** | v0.37 |
| **What changed** | The same braking setting was raised another step. |
| **Why** | The previous step gained 1.76 s and braking distance was still the limit. |
| **Prediction** | About 0.6–1.3 s faster. |
| **Lap time** | 1:27:59 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:27:59 (1.40 s faster), damage 0, top speed 213 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | It still paid, but each step made the slides bigger at the two places where the car brakes while turning: the kink before the flick, and the flick itself, where the car now used 0.70 of the way to the edge. Those slides were the next thing to fix. |

---

## v0.38 — Ease the brake when the car slides

| Field | Detail |
|---|---|
| **Version** | v0.38 |
| **What changed** | While braking, the brake was halved whenever the car was sliding sideways by more than a small amount. |
| **Why** | Each step of harder braking had made the slides bigger at the places where the car brakes while turning. The aim was to stop the rear stepping out there. |
| **Prediction** | About the same lap time (within 0.15 s), with clearly smaller slides where the car brakes while turning. |
| **Lap time** | 1:27:57 |
| **Damage** | 0 |
| **Top speed** | 212 km/h |
| **Min speed** | 65 km/h |
| **Observed** | Lap 1:27:57 (0.02 s faster), damage 0, top speed 212 km/h, slowest corner 65 km/h; the car stayed on the road. |
| **Decision** | ❌ Rejected — it had almost no effect on the slides it was aimed at, and the slide at the flick grew; the driver went back to v0.37. |
| **Learned** | By the time the slide is noticed it is too late to cure it by easing the brake. The worst slide at the flick was not a braking slide at all: it came from the wheelspin control switching the throttle fully off and fully on in turn. From this version on, laps were run automatically (about 4 seconds each), so settings could be tried out by simply driving them. |

---

## v0.39 — Wheelspin correction fades out instead of snapping off

| Field | Detail |
|---|---|
| **Version** | v0.39 |
| **What changed** | When the wheelspin control eases the throttle, the easing now fades away over a few instants instead of ending at once. |
| **Why** | This stops the throttle flicking between nothing and full while the wheels keep spinning. v0.38 showed that this on-off throttle was behind the worst slide at the flick. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:27:44 |
| **Damage** | 0 |
| **Top speed** | 213 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:27:44 (0.15 s faster than v0.37), damage 0, top speed 213 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; the slide at the flick fell from 19.4 to 11.7 km/h sideways and the on-off throttle was gone. |
| **Learned** | The smoother correction is both safer and faster, even though the car spends less of the lap at full throttle, because that throttle had only been spinning the wheels. |

---

## v0.40 — Brake later at high speed

| Field | Detail |
|---|---|
| **Version** | v0.40 |
| **What changed** | The braking plan now expects the car to slow down more strongly the faster it is going (air resistance and the downward push of the air on the car both help at speed). |
| **Why** | Before, it assumed the same braking at every speed, which wasted braking power exactly where the braking zones are longest. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:25:95 |
| **Damage** | 0 |
| **Top speed** | 214 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:25:95 (1.49 s faster), damage 0, top speed 214 km/h, slowest corner 64 km/h; the car stayed on the road. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The setting was chosen cautiously from test laps; stronger settings were faster still, but at higher ones the car arrived too fast at the flick and left the track. As a bonus the slide at the kink before the flick shrank, because braking now finished before the turn. |

---

## v0.41 — Raise the speed cap on the straights to 250 km/h

| Field | Detail |
|---|---|
| **Version** | v0.41 |
| **What changed** | The speed the car aims for on straights was raised from 200 to 250 km/h. |
| **Why** | The earlier conclusion that "the straights are used up" (v0.17) was questioned: it was reached when the car braked much more weakly. Several other ideas were tried alongside, and this one gained the most while leaving every danger spot unchanged. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:24:35 |
| **Damage** | 0 |
| **Top speed** | 254 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:24:35 (1.60 s faster), damage 0, top speed 254 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The 200 km/h cap had been the biggest single limit left. Caps above about 255 km/h change nothing, because that is as fast as the car gets on the longest straight. |

---

## v0.42 — Change up just before the engine's rev limit

| Field | Detail |
|---|---|
| **Version** | v0.42 |
| **What changed** | The car now holds each gear almost to the engine's rev limit before changing up, instead of changing up well before it. |
| **Why** | The engine's power keeps rising nearly to the limit, and the gears are close together, so the lower gear near the limit always pushes harder. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:23:12 |
| **Damage** | 0 |
| **Top speed** | 256 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:23:12 (1.23 s faster), damage 0, top speed 256 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far, and below the target at the time of about 1:24. |
| **Learned** | The gain was all in acceleration, so the corners were untouched. The finding from v0.6 that late gear changes are slower belonged to a car without proper wheelspin control and no longer held. |

---

## v0.43 — Allow more wheelspin when driving straight

| Field | Detail |
|---|---|
| **Version** | v0.43 |
| **What changed** | The wheelspin control now allows much more rear wheelspin when the steering is straight and the car is not sliding, and stays strict in corners. |
| **Why** | The data showed the wheelspin control was holding the car back for about 31 seconds of the lap, mostly out of slow corners. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:22:23 |
| **Damage** | 0 |
| **Top speed** | 256 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:22:23 (0.89 s faster), damage 0, top speed 256 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far, with the danger spots unchanged. |
| **Learned** | The extra wheelspin has to be tied to the car really running straight; tying it to the steering alone made the car slide out of medium corners, because a sliding car steers back toward straight. A test of using less steering lock in the tight corners ran off the road at the hairpin every time: full lock is needed there. |

---

## v0.44 — More cornering grip at higher speed

| Field | Detail |
|---|---|
| **Version** | v0.44 |
| **What changed** | The grip the car assumes in corners now rises with speed, because the air pushes the car harder onto the road the faster it goes (downforce). |
| **Why** | Before, the same grip was assumed at every speed, which made the car too cautious in fast corners. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:20:58 |
| **Damage** | 0 |
| **Top speed** | 257 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:20:58 (1.65 s faster), damage 0, top speed 257 km/h, slowest corner 64 km/h; the car stayed on the road. |
| **Decision** | ✅ Kept — the fastest lap so far. |
| **Learned** | The cost was margin: at the flick the car now used 0.85 of the way to the edge (0.71 before), and the kink before it slid more. The flick and the kink were now the clear limits, so the next step had to make the flick safer. |

---

## v0.45 — Keep the extra wheelspin allowance on the way out of medium corners

| Field | Detail |
|---|---|
| **Version** | v0.45 |
| **What changed** | The extra wheelspin allowed on straights (v0.43) is now switched off only at a larger sideways slide than before. |
| **Why** | The extra wheelspin allowed on straights (v0.43) used to be switched off as soon as the car slid sideways a little. But medium corners are always taken with that much sideways slip, so the allowance was being removed on every corner exit. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:20:20 |
| **Damage** | 0 |
| **Top speed** | 257 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:20:20 (0.38 s faster), damage 0, top speed 257 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; the flick and hairpin were unchanged, and slides on medium-corner exits grew slightly. |
| **Learned** | Many other ideas were tried and lost. For the first time each candidate was also checked for robustness: the lap was repeated with other settings nudged slightly, to see whether the car still stayed on the road. The flick was found to be limited by its approach, a stretch where the tyres grip less under braking. |

---

## v0.46 — Remove the speed cap on the straights

| Field | Detail |
|---|---|
| **Version** | v0.46 |
| **What changed** | The speed the car aims for was raised from 250 to 300 km/h, which is above what the car can reach on this track, so no straight is capped any more. |
| **Why** | The car was still easing off the throttle at about 250 km/h on the longest straights, while the braking plan would have allowed much more. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:20:13 |
| **Damage** | 0 |
| **Top speed** | 269 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:20:13 (0.07 s faster), damage 0, top speed 269 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; the danger spots were unchanged or slightly better, and none of 10 robustness laps left the road. |
| **Learned** | The gain is small but showed up in every robustness lap. A new finding explained the flick: its approach goes over a crest where the car is nearly airborne, so the tyres carry less weight and brake less well there. |

---

## v0.47 — Fade the corner-speed bonus out gradually as the steering turns

| Field | Detail |
|---|---|
| **Version** | v0.47 |
| **What changed** | The extra corner speed the car allows itself for gentle bends (v0.27) now fades out gradually as the steering turns, instead of switching off abruptly once the steering passes a certain point. |
| **Why** | A brief spike in the steering at a corner exit could trip the abrupt switch and make the car brake for no reason, which made lap times vary by about 0.2 s by chance. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:20:08 |
| **Damage** | 0 |
| **Top speed** | 269 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:20:08 (0.05 s faster), damage 0, top speed 269 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; over two sets of 10 robustness laps it was 0.16 to 0.23 s faster, with none of the 20 leaving the road, and the car used less width at the flick. |
| **Learned** | Single laps can mislead by about 0.2 s, so from here on versions are compared over sets of laps. |

---

## v0.48 — Braking plan matched to how the car really brakes

| Field | Detail |
|---|---|
| **Version** | v0.48 |
| **What changed** | The braking plan was refitted to measurements. It now expects stronger braking at medium speeds, never plans for more braking than the car was measured to achieve at high speed, and expects weaker braking when the car is light over a crest. |
| **Why** | Measurements showed that the car brakes harder than planned at medium speed and less hard than planned at very high speed. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:19:55 |
| **Damage** | 0 |
| **Top speed** | 273 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:19:55 (0.53 s faster), damage 0, top speed 273 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far and the first under 1:20; over three sets of 10 robustness laps it was 0.51 to 0.58 s faster with none of the 30 leaving the road. |
| **Learned** | The old plan had the wrong shape, too cautious at medium speed and too optimistic at high speed. The new upper limit sits close to the edge: a slightly higher one left the road in 2 of 30 laps. |

---

## v0.49 — Extra wheelspin allowance kept through bigger slides

| Field | Detail |
|---|---|
| **Version** | v0.49 |
| **What changed** | The extra wheelspin allowed when running straight (v0.43, v0.45) now stays on through somewhat larger sideways slides before being removed. |
| **Why** | Medium-corner exits are taken with more sideways slip than the old switch-off point allowed, so the allowance was still being removed there. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:19:44 |
| **Damage** | 0 |
| **Top speed** | 270 km/h |
| **Min speed** | 64 km/h |
| **Observed** | Lap 1:19:44 (0.11 s faster), damage 0, top speed 270 km/h, slowest corner 64 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; 0.05 to 0.15 s faster over the three sets of robustness laps, none of the 30 off the road. |
| **Learned** | Several other ideas gained more on average but left the road in 1 to 6 of the 30 laps. Nearly every way of going faster now failed at the same two places, the flick and the hairpin exit, so a safety margin there was worth more than any single setting. |

---

## v0.50 — Less throttle at full steering lock when the outside edge is close

| Field | Detail |
|---|---|
| **Version** | v0.50 |
| **What changed** | With the steering fully turned, the small amount of throttle allowed is now reduced further as the car gets close to the outside edge of the road. |
| **Why** | In the two slowest corners the car was drifting outward with the steering fully turned; more throttle there only pushed it wider. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:19:45 |
| **Damage** | 0 |
| **Top speed** | 270 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:19:45 (0.01 s slower), damage 0, top speed 270 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — enabling change: slightly slower (0.02 to 0.07 s over the three sets), but the car stayed clearly further from the edge at the flick and the hairpin exit in every set, with none of the 30 laps off the road. |
| **Learned** | This margin was bought so that the next change, which had already been measured on top of it as faster and safe, could go in. |

---

## v0.51 — Lift off the throttle instead of dabbing the brake

| Field | Detail |
|---|---|
| **Version** | v0.51 |
| **What changed** | When the car is only a tiny bit (up to 1 %) over its planned speed, it now simply lifts off the throttle instead of touching the brake. |
| **Why** | Before, each tiny brake touch reset the throttle to zero, and the car then had to build it up again, so in long steady corners the speed sawed up and down. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:19:04 |
| **Damage** | 0 |
| **Top speed** | 274 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:19:04 (0.41 s faster than v0.50), damage 0, top speed 274 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; about 0.25 s faster than v0.49 over the three sets of robustness laps, none of the 30 off the road, and the safety margin gained in v0.50 was kept. |
| **Learned** | This follow-up won back the small cost of v0.50 and more; without v0.50's margin the same change had run right to the edge of the road. |

---

## v0.52 — A tighter inside line in medium bends

| Field | Detail |
|---|---|
| **Version** | v0.52 |
| **What changed** | In medium bends the car now aims closer to the inside edge near the apex. This extra is faded out when the steering is turned far (hairpin and flick), where a tighter target would only ask for steering the car does not have. |
| **Why** | The car had been sitting well short of the inside in these bends. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:18:55 |
| **Damage** | 0 |
| **Top speed** | 271 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:18:55 (0.49 s faster), damage 0, top speed 271 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; about 0.6 s faster over the three sets of robustness laps, none of the 30 off the road, but with less room to spare at the flick (the worst lap used 0.94 of the way to the edge, 0.85 before). |
| **Learned** | The gain of the racing line is on the inside. A wider outside line broke the flick. |

---

## v0.53 — The car finally reaches the inside line

| Field | Detail |
|---|---|
| **Version** | v0.53 |
| **What changed** | When the car sits short of the inside line in a bend, the steering now builds up a gradual extra correction for as long as the gap remains, on the inside half of a bend only. |
| **Why** | The car kept sitting a steady distance short of the inside line in long bends. The cause was found: in a bend the car's body points slightly sideways to its direction of travel, and the part of the steering that keeps the car parallel to the road was cancelling about half of the pull toward the line. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:17:18 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 62 km/h |
| **Observed** | Lap 1:17:18 (1.37 s faster), damage 0, top speed 275 km/h, slowest corner 62 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; about 1.3 s faster over the three sets, none of the 30 off the road, and with more room to spare at the flick. |
| **Learned** | The problem was a steady offset, not a weak pull. When the correction was allowed to act everywhere, it left the road at the flick in up to 10 of 30 laps; limited to the inside half it made the flick safer. |

---

## v0.54 — Change down earlier, change up a touch later

| Field | Detail |
|---|---|
| **Version** | v0.54 |
| **What changed** | The car now changes down a gear earlier, so the engine is closer to the revs where it pulls hardest when the car comes out of a corner, and changes up very slightly later. |
| **Why** | An earlier test (v0.46) had found no gain here, but the car had changed a lot since. With the faster line, the car was coming out of corners at low engine revs. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:91 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 61 km/h |
| **Observed** | Lap 1:16:91 (0.27 s faster), damage 0, top speed 275 km/h, slowest corner 61 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; 0.14 to 0.20 s faster over the three sets, none of the 30 off the road, and with more room to spare. |
| **Learned** | It also calmed the flick. Changing down earlier still made the gearbox hunt between gears. |

---

## v0.55 — Anti-lock brakes react sooner

| Field | Detail |
|---|---|
| **Version** | v0.55 |
| **What changed** | The anti-lock system now eases the brake when a wheel is turning 15 % slower than the car is moving, instead of waiting for 20 %. |
| **Why** | In the big braking zones the car was running well over its planned speed. The anti-lock setting had not been looked at again since the braking plan and the racing line changed. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:80 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 61 km/h |
| **Observed** | Lap 1:16:80 (0.11 s faster), damage 0, top speed 275 km/h, slowest corner 61 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; about 0.2 s faster over the three sets, none of the 30 off the road, at the cost of room at the flick (worst lap 0.90 of the way to the edge, 0.76 before). |
| **Learned** | The setting has sharp edges: slightly different values left the road at the flick in 7 to 30 of 30 laps. Every braking gain so far showed up first as a bigger slide at the flick. |

---

## v0.56 — Don't let the planned speed jump back up while braking

| Field | Detail |
|---|---|
| **Version** | v0.56 |
| **What changed** | This version allowed the planned speed to rise only slowly while the car is braking and shortly after. |
| **Why** | On the approach to the flick the car's planned speed flickers up and down, so the car brakes, accelerates again and then brakes a second time. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. It was expected to be rejected unless the room it freed could be turned into speed. |
| **Lap time** | 1:16:98 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 61 km/h |
| **Observed** | Lap 1:16:98 (0.19 s slower than v0.55), damage 0, top speed 275 km/h, slowest corner 61 km/h. |
| **Decision** | ❌ Rejected — slower (0.14 to 0.25 s over the three sets, none of the 30 off the road); the driver went back to v0.55. |
| **Learned** | It calmed the flick, but only by arriving there slower, and the room it freed could not be turned back into speed elsewhere without leaving the road in some laps. |

---

## v0.57 — Steadier judgement of corner speed

| Field | Detail |
|---|---|
| **Version** | v0.57 |
| **What changed** | When the speed plan works out the corner-speed bonus, it now looks at a smoothed version of the steering instead of the value at each instant. |
| **Why** | The car's corner-speed bonus depends on how far the steering is turned (v0.47), and in medium bends the steering jitters a little from one instant to the next, which made the planned speed jump about. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:57 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:16:57 (0.23 s faster than v0.55), damage 0, top speed 275 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; 0.11 to 0.18 s faster over the three sets, none of the 30 off the road, at a small cost in room at the flick. |
| **Learned** | The gain came from more speed through the medium bends. An old setting, how quickly the throttle comes back (v0.5), was re-checked and is still the best value. |

---

## v0.58 — Setting the car up for a corner before it arrives

| Field | Detail |
|---|---|
| **Version** | v0.58 |
| **What changed** | The car now reads which way the next corner turns from about 150 m away (the road's far edge looks slanted in its sensors) and moves toward the outside in advance. |
| **Why** | Until now the racing line only woke up about 35 m before a corner, too late to move to the outside first. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:67 |
| **Damage** | 0 |
| **Top speed** | 271 km/h |
| **Min speed** | 59 km/h |
| **Observed** | Lap 1:16:67 (0.10 s slower than v0.57 on the single lap), damage 0, top speed 271 km/h, slowest corner 59 km/h. |
| **Decision** | ✅ Kept — enabling change: over the three sets of robustness laps it was faster (0.04 to 0.11 s), none of the 30 off the road, with more room at the flick; the single lap was slower but within the usual lap-to-lap scatter of about 0.2 s. |
| **Learned** | This is the first part of the line that acts before the corner, but the car moved out only a little, and corner speeds did not rise. |

---

## v0.59 — Corner set-up tuned: further out, finished earlier

| Field | Detail |
|---|---|
| **Version** | v0.59 |
| **What changed** | The corner set-up from v0.58 was adjusted: it aims further toward the outside and stops pulling a little earlier before the corner, so the car can turn in toward a late inside point. |
| **Why** | In v0.58 one bend had become slower because the car turned in too early; ending the pull sooner lets it turn in from the outside again. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:46 |
| **Damage** | 0 |
| **Top speed** | 274 km/h |
| **Min speed** | 59 km/h |
| **Observed** | Lap 1:16:46 (0.22 s faster than v0.58, 0.11 s faster than v0.57), damage 0, top speed 274 km/h, slowest corner 59 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far, winning back the single-lap cost of v0.58; the sets of robustness laps were equal to slightly faster, none of the 30 off the road, with less room to spare at the flick. |
| **Learned** | Holding the car out all the way to the corner wrecked the flick (25 of 30 laps off the road). In medium bends the car's speed is set by its speed plan, not by the line, so more width only pays once the plan gives credit for it. |

---

## v0.60 — More planned grip when the steering is only lightly turned

| Field | Detail |
|---|---|
| **Version** | v0.60 |
| **What changed** | When the steering is only turned a little, the speed plan now assumes 30 % more cornering grip; the extra disappears as the steering turns further. |
| **Why** | A car whose steering is only turned a little is clearly not at its grip limit. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:40 |
| **Damage** | 0 |
| **Top speed** | 274 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:16:40 (0.06 s faster), damage 0, top speed 274 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; faster over all three sets (0.05 to 0.15 s), none of the 30 off the road, and with more room to spare. |
| **Learned** | The change limits itself, since more speed needs more steering, which removes the extra. An idea to assume that a bend simply continues beyond what the car can see ran off the road in 13 to 30 of 30 laps: what lies beyond the view is exactly where it fails. |

---

## v0.61 — Let go of the inside line once the corner opens up

| Field | Detail |
|---|---|
| **Version** | v0.61 |
| **What changed** | As soon as the road ahead starts to open again, the inside target is now mostly released, so the car can unwind the steering and use the throttle. |
| **Why** | The racing line used to hold the car on the inside until the bend had completely ended, well past the apex. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:16 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:16:16 (0.24 s faster), damage 0, top speed 275 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; faster over all three sets (0.08 to 0.13 s), none of the 30 off the road. |
| **Learned** | The gain was a little everywhere, with a full second more of the lap spent at full throttle. Changes on the entry side of corners (a smoother set-up, a later apex) were all slower. |

---

## v0.62 — Corner-speed setting one step up (76 km/h)

| Field | Detail |
|---|---|
| **Version** | v0.62 |
| **What changed** | The speed the car plans to be down to at the end of the road it can see was raised from 75 to 76 km/h. |
| **Why** | Six racing-line ideas were tried first and all were slower; this small step was the only measured gain. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:13 |
| **Damage** | 0 |
| **Top speed** | 274 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:16:13 (0.03 s faster), damage 0, top speed 274 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the fastest lap so far; faster over all three sets (0.04 to 0.15 s), none of the 30 off the road, but with less room to spare (worst lap 0.92 of the way to the edge). |
| **Learned** | 76 is safe and 77 is not (one lap in 30 leaves the road at the flick). Moving the car sideways while braking cost time in every form tried. |

---

## v0.63 — Allow more wheelspin in corners

| Field | Detail |
|---|---|
| **Version** | v0.63 |
| **What changed** | The amount of rear wheelspin allowed in corners before the throttle is eased was raised. |
| **Why** | The data showed that about 14 seconds of each lap were spent with the wheelspin control holding the car back on corner exits. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:16 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 61 km/h |
| **Observed** | Lap 1:16:16 (0.04 s slower on the single lap), damage 0, top speed 275 km/h, slowest corner 61 km/h. |
| **Decision** | ✅ Kept — faster over all three sets of robustness laps (0.12 to 0.18 s), none of the 30 off the road; the single lap was slower, but within the usual 0.2 s scatter, so the sets decide. |
| **Learned** | Corner exits were limited by wheelspin, not by the line. Earlier findings that more wheelspin does not help no longer held, because the car had gained other safeguards since. |

---

## v0.64 — A light touch of the brake no longer resets the throttle

| Field | Detail |
|---|---|
| **Version** | v0.64 |
| **What changed** | When the car only brushes the brake lightly, it now keeps 70 % of the throttle it had built up, instead of starting again from zero. Heavier braking still resets it. |
| **Why** | In long bends these light touches made the car's speed saw up and down. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:16 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:16:16 (0.01 s faster), damage 0, top speed 275 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — faster on all three sets (0.08 to 0.09 s), none of the 30 off the road; the cost was less room at the flick (worst lap 0.95 of the way to the edge) and a bigger slide at the flick exit. |
| **Learned** | An earlier test of this idea (v0.45) found no gain, but that was before other changes had removed most of the heavier touches. |

---

## v0.65 — No changing straight back down after changing up

| Field | Detail |
|---|---|
| **Version** | v0.65 |
| **What changed** | For about a third of a second after changing up a gear, the car no longer changes back down unless it is braking. |
| **Why** | The engine-speed reading dips briefly while the clutch bites after a gear change, and that dip was fooling the car into changing down and up again twice per lap. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:86 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 60 km/h |
| **Observed** | Lap 1:15:86 (0.30 s faster), damage 0, top speed 275 km/h, slowest corner 60 km/h. |
| **Decision** | ✅ Kept — the best single lap so far; it removes a definite fault, and the three sets were equal to slightly faster (0.00 to 0.03 s), none of the 30 off the road. |
| **Learned** | Whether the fault appears depends on the exact engine speed at the gear change, so over 30 laps the gain averages only 0.02 s. A test of limiting the steering at low speed left the road every time: the flick and the hairpin need full lock. |

---

## v0.66 — A later inside point for very tight corners (rejected)

| Field | Detail |
|---|---|
| **Version** | v0.66 |
| **What changed** | For corners that the car only notices when very little road is left in view (the hairpin), the move to the inside was made later and shorter, hoping for a better line through the hairpin. |
| **Why** | At the hairpin the car moves to the inside while still braking and then slides to the outside at full lock. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. It was to be rejected if the robustness laps came out slower. |
| **Lap time** | 1:15:77 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 61 km/h |
| **Observed** | Lap 1:15:77 (0.08 s faster on the single lap), damage 0, top speed 275 km/h, slowest corner 61 km/h; none of the 30 robustness laps off the road. |
| **Decision** | ❌ Rejected — slower on two of the three sets (the average of all 30 laps went from 76.081 to 76.103 s); the single-lap gain was within the usual scatter and came from the flick, not from the hairpin it was aimed at. The driver went back to v0.65. |
| **Learned** | Seven line ideas were tried and none won. At the hairpin the line is not the limit: the car simply cannot steer any tighter. |

---

## v0.67 — No throttle at full lock near the outside edge

| Field | Detail |
|---|---|
| **Version** | v0.67 |
| **What changed** | With the steering fully turned and the outside edge of the road close, the car now gets no throttle at all (before, a little). |
| **Why** | Analysis of all 30 robustness laps showed that at the flick the car drifts across the whole width of the road during the first, fully-steered part; even a little throttle there was costing the safety margin. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:20 |
| **Damage** | 0 |
| **Top speed** | 274 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:16:20 (0.34 s slower), damage 0, top speed 274 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — enabling change: about 0.11 s slower over the sets, but the worst lap now used only 0.85 of the way to the edge (0.95 before), with none of the 30 off the road. |
| **Learned** | That margin makes a higher corner-speed setting safe, which had already been measured on top of this change as faster overall with no lap off the road (14 of 30 left the road without it). That follow-up is the next version. |

---

## v0.68 — Corner-speed setting up to 79 km/h (the follow-up to v0.67)

| Field | Detail |
|---|---|
| **Version** | v0.68 |
| **What changed** | The speed the car plans to be down to at the end of the road it can see was raised from 76 to 79 km/h, which means later braking on the approach to every corner. |
| **Why** | The margin bought in v0.67 is what made this safe. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:71 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:71 (0.15 s faster than v0.65, 0.49 s faster than v0.67), damage 0, top speed 275 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — a new best; the average over the 30 robustness laps beat both v0.65 (by 0.11 s) and v0.67 (by 0.22 s) with none off the road, so both changes stay. |
| **Learned** | The margin was thin: the worst lap came within a hair of the edge at the hairpin exit (0.994), and 80 km/h left the road in 5 of 30 laps. |

---

## v0.69 — No wheelspin control at the standing start (rejected)

| Field | Detail |
|---|---|
| **Version** | v0.69 |
| **What changed** | From the standing start until the car first reaches 130 km/h, the wheelspin control was in effect switched off. |
| **Why** | At the start the engine is far below the revs where it pulls hardest; letting the wheels spin works like a slipping clutch and lets the engine rev up. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:57 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:57 (0.14 s faster on the single lap), damage 0, top speed 275 km/h, slowest corner 57 km/h. |
| **Decision** | ❌ Rejected — one of the 30 robustness laps left the road at the flick, even though the average was 0.155 s faster; the driver went back to v0.68. |
| **Learned** | The start is worth about 0.1 s per lap, but v0.68 was sitting so close to the edge that any change earlier in the lap tipped one or two laps over it, although the start changes nothing in those corners. Margin had to be bought first. |

---

## v0.70 — Corner-speed setting back to 78 km/h (to make room for the start)

| Field | Detail |
|---|---|
| **Version** | v0.70 |
| **What changed** | The corner-speed setting was taken back one step, from 79 to 78 km/h. |
| **Why** | v0.69 showed that the faster start is worth about 0.1 s per lap, but it could not be used because v0.68 sat too close to the edge. The step back regains room at the flick and the hairpin exit. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:16:07 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:16:07 (0.36 s slower than v0.68 on the single lap), damage 0, top speed 275 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — enabling change: 0.09 s slower over the 30 robustness laps, none off the road, with more room to spare; with the faster start added on top it had already been measured as faster than v0.68 with none of the 30 off the road. |
| **Learned** | Once the steering is fully turned at the hairpin or flick, nothing helps any more — more or less brake or throttle made no difference. The cheapest way to buy margin is this setting itself. |

---

## v0.71 — The faster standing start, now on a safe base

| Field | Detail |
|---|---|
| **Version** | v0.71 |
| **What changed** | The change from v0.69 (no wheelspin control from the start until 130 km/h) was applied again, this time on top of v0.70's safer setting. |
| **Why** | v0.70 had bought the room for it; this is the planned follow-up. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:65 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:65 (0.42 s faster than v0.70), damage 0, top speed 275 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — a new best lap, and the average of the 30 robustness laps (75.882 s) beat v0.68 (75.970 s) with none off the road, so the cost of v0.70 was won back. |
| **Learned** | The early gear changes caused by the spinning wheels turned out to be part of the gain; starting in 2nd gear was slower. |

---

## v0.72 — The same freedom to spin the wheels on slow, straight corner exits

| Field | Detail |
|---|---|
| **Version** | v0.72 |
| **What changed** | The allowance from the standing start was extended: below 130 km/h, whenever the car is pointing straight and not sliding, the wheelspin control leaves the throttle alone. |
| **Why** | Out of the hairpin the car is dead straight in a low gear far below the engine's best revs, the same situation as at the start. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:60 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:60 (0.05 s faster), damage 0, top speed 275 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — a new best lap; 0.10 s faster over the 30 robustness laps with none off the road, and no loss of margin. On a further check of 40 laps from slightly shifted starting settings, 1 of 40 left the road, the same as before. |
| **Learned** | The allowance must be limited to a car that is really straight; a looser version let the car slide at the flick exit and one lap left the road. Using 1st gear on these exits was slower. |

---

## v0.73 — A wider definition of a "light" brake touch (suggested by an outside analysis; rejected)

| Field | Detail |
|---|---|
| **Version** | v0.73 |
| **What changed** | Somewhat heavier touches of the brake than before now also keep the built-up throttle (see v0.64). The value suggested by an outside analysis of the project was used. |
| **Why** | An outside analysis of the project suggested that keeping the throttle through somewhat heavier brake touches (see v0.64) would gain 0.30 to 0.45 s. |
| **Prediction** | The outside analysis estimated 0.30–0.45 s faster. Test laps driven beforehand showed no gain. |
| **Lap time** | 1:15:59 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:59 (0.002 s faster on the single lap), damage 0, top speed 275 km/h, slowest corner 57 km/h; none of the 30 robustness laps off the road. |
| **Decision** | ❌ Rejected — the 30-lap average did not improve (75.790 s against 75.782 s) and the worst lap came closer to the edge (0.991); the driver went back to v0.72. |
| **Learned** | The claim did not hold. Only 7 of the 43 brake applications per lap were of the kind described, and every way of keeping more throttle through a brake touch was slower or lost margin. |

---

## v0.74 — Smoothing the car's sense of where the road goes (suggested by the outside analysis; rejected)

| Field | Detail |
|---|---|
| **Version** | v0.74 |
| **What changed** | The car's reading of where the road is heading was smoothed before being used for the steering. |
| **Why** | The outside analysis suggested that the car's reading of where the road is heading jumps about and makes the steering wiggle, and that smoothing it would gain 0.10 to 0.25 s. |
| **Prediction** | The outside analysis estimated 0.10–0.25 s faster. Test laps driven beforehand showed it 0.31 s slower. |
| **Lap time** | 1:16:16 |
| **Damage** | 0 |
| **Top speed** | 274 km/h |
| **Min speed** | 56 km/h |
| **Observed** | Lap 1:16:16 (0.56 s slower), damage 0, top speed 274 km/h, slowest corner 56 km/h; none of the 30 robustness laps off the road. |
| **Decision** | ❌ Rejected — 0.31 s slower over the 30 laps; the driver went back to v0.72. |
| **Learned** | For the third time, any delay in this reading costs time: the jumps are real information (the road opening up), not noise. It was also found that the corner set-up (v0.58) switches itself on and off at every instant, yet smoother versions of it were slower. About 30 small changes around v0.72 all came out the same or worse. |

---

## v0.75 — No pull to the outside while braking at high speed (rejected)

| Field | Detail |
|---|---|
| **Version** | v0.75 |
| **What changed** | While braking at high speed into a bend that is already in view, the car is no longer pulled toward the outside; it is aimed at the inside instead. |
| **Why** | Until now the racing line pulled the car toward the outside there. Every earlier trial had added pulls while braking; this one took one away. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:56 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:56 (0.04 s faster), damage 0, top speed 275 km/h, slowest corner 57 km/h. |
| **Decision** | ❌ Rejected — it was 0.07 s faster over the three standard sets with none of the 30 off the road, but on the further check of 40 laps from shifted starting settings 5 left the road (the limit is 1), and the car used more of the road at the flick; the driver went back to v0.72. |
| **Learned** | The change makes the car arrive faster, which is exactly why it has less room at the flick. The standard sets alone would have accepted it; the second check caught it, so both checks are kept. Another suggestion from the outside analysis (letting the corner set-up act more freely) was also tested and was slower. |

---

## v0.76 — Throttle at full lock decided by how soon the car would reach the edge

| Field | Detail |
|---|---|
| **Version** | v0.76 |
| **What changed** | With the steering fully turned, the throttle allowed used to depend on how much room was left to the outside edge. It now depends on how long it would take the car to reach that edge at the rate it is drifting: no drive while the car is drifting outward, and drive again as soon as the drift stops. |
| **Why** | The old rule did the opposite of what was needed: it gave drive during the drift and withheld it afterwards. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:48 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:15:48 (0.12 s faster than v0.72), damage 0, top speed 275 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — a new best lap; 0.135 s faster over the 30 robustness laps with none off the road, more room to spare (worst lap 0.89 of the way to the edge, 0.96 before), and none of the 40 shifted-start laps off the road (1 before). |
| **Learned** | The car now drifts less far at both the flick and the hairpin. Another suggestion from the outside analysis (weighting distant road more heavily in the steering) left the road in 5 to 7 of 30 laps. |

---

## v0.77 — Braking re-tuned to use the new margin

| Field | Detail |
|---|---|
| **Version** | v0.77 |
| **What changed** | Two braking settings were changed together: the anti-lock system went back to reacting at 20 % wheel slip (as before v0.55), and the braking plan was set to brake a little later at high speed. |
| **Why** | The first made the car calmer at no cost in time; the second spent that calm on later braking. v0.76 had given the car margin at the flick and the hairpin, and this version looked for a way to turn it into time. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:27 |
| **Damage** | 0 |
| **Top speed** | 275 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:27 (0.20 s faster), damage 0, top speed 275 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — a new best lap; 0.12 s faster over the 30 robustness laps with none off the road; 1 of the 40 shifted-start laps left the road, which is within the limit of 1. |
| **Learned** | Neither setting works alone (the first gains no time, the second leaves the road in 1 of 30 laps). The assistant doing this version was cut off before writing its notes, so its other trials are not on record; all numbers in the original entry were re-measured afterwards. |

---

## v0.78 — Slipping the clutch out of slow corners

| Field | Detail |
|---|---|
| **Version** | v0.78 |
| **What changed** | While accelerating at low engine revs, the car now presses the clutch partly, which lets the engine rev up while still driving the wheels — like a driver slipping the clutch to pull away briskly. |
| **Why** | The driver had never used the clutch. Out of slow corners the engine was running far below the revs where it pulls hardest. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:15:19 |
| **Damage** | 0 |
| **Top speed** | 276 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:15:19 (0.09 s faster), damage 0, top speed 276 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — a new best lap; 0.27 s faster over the 30 robustness laps with none off the road; 1 of 40 shifted-start laps off the road (within the limit). |
| **Learned** | The clutch must not be pressed too far: slightly more and the drive is lost (almost a second slower). The explanation given for the gain at this point came from memory of how the simulator works and was corrected in the next version. |

---

## v0.79 — Clutch slip in every gear, based on the simulator's own rules

| Field | Detail |
|---|---|
| **Version** | v0.79 |
| **What changed** | The clutch is now slipped in every gear, easing shut as the wheels catch up with the engine, and pressed slightly less far than before. Gear changes up are now timed by the speed of the driven wheels instead of the engine. |
| **Why** | The simulator's program code was read to find out exactly how its clutch works: up to two-thirds pressed, the clutch still passes all of the engine's pull, while the engine is almost free to rev; and the engine gives nothing above its rev limit. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:86 |
| **Damage** | 0 |
| **Top speed** | 282 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:14:86 (0.33 s faster), damage 0, top speed 282 km/h, slowest corner 57 km/h. |
| **Decision** | ✅ Kept — a new best lap; 0.35 s faster over the 30 robustness laps with none off the road, and none of the 40 shifted-start laps off the road. The lap was now 0.14 s from the target of 1:14:72. |
| **Learned** | Reading the simulator's rules paid more than any amount of trying values. It was not separated how much of the gain came from the clutch slip itself and how much from the later gear changes that came with it. |

---

## v0.80 — A steady corner set-up (the steering wobble removed)

| Field | Detail |
|---|---|
| **Version** | v0.80 |
| **What changed** | The corner set-up from v0.58 was made steady: once the car has decided which way the coming corner turns, it keeps that decision, and the pull toward the outside is limited to a gentle amount. |
| **Why** | The user had noticed the steering wobbling before corners. The cause was the corner set-up: its own steering input switched it off at the next instant, so it flicked on and off and barely moved the car. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:72 |
| **Damage** | 0 |
| **Top speed** | 283 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:72 (0.13 s faster), damage 0, top speed 283 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — a new best lap, 0.008 s above the target of 74.72 s; 0.08 s faster over the 30 robustness laps with none off the road, and none of the 40 shifted-start laps off the road. Steering reversals fell from 283 to 81 per lap. |
| **Learned** | Removing the wobble was faster, contrary to earlier findings. But the car's line itself moved only a little toward the outside; a stronger pull reached the outside but left the road at the flick. |

---

## v0.81 — Let go of the inside line once the car has speed in hand

| Field | Detail |
|---|---|
| **Version** | v0.81 |
| **What changed** | On the way out of a bend, once the car is clearly slower than its plan allows (so the bend no longer limits it), the pull toward the inside is now released. |
| **Why** | Before, the line was still steering the car to the inside there, which held the steering on and cost drive. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:49 |
| **Damage** | 0 |
| **Top speed** | 283 km/h |
| **Min speed** | 59 km/h |
| **Observed** | Lap 1:14:49 (0.23 s faster), damage 0, top speed 283 km/h, slowest corner 59 km/h. |
| **Decision** | ✅ Kept — a new best lap and below the target of 1:14:72; 0.18 s faster over the 30 robustness laps with none off the road, and none of the 40 shifted-start laps off the road. |
| **Learned** | Letting the car go is faster, but actively pushing it to the outside on the exit is slower. The positions of the car on the road barely changed: the gain is time, not a visibly wider line. |

---

## v0.82 — Corner set-up ends slightly earlier

| Field | Detail |
|---|---|
| **Version** | v0.82 |
| **What changed** | The corner set-up now stops pulling toward the outside a few metres earlier before the corner. |
| **Why** | The idea handed down from the previous version, to keep pulling right up to the turn-in so the car would not drift back to the middle, was tested in several forms and every one was slower. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:45 |
| **Damage** | 0 |
| **Top speed** | 283 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:45 (0.04 s faster), damage 0, top speed 283 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — 0.035 s faster over the 30 robustness laps (about the level of chance variation), none off the road, none of the 40 shifted-start laps off the road. |
| **Learned** | This is a small adjustment, not a better line. Holding the car out for longer makes it notice the bend sooner and turn in too early and too fast. |

---

## v0.83 — Wheelspin limit as a share of the car's speed

| Field | Detail |
|---|---|
| **Version** | v0.83 |
| **What changed** | The amount of wheelspin allowed is now a proportion of the car's speed instead of a fixed amount, so less is allowed at low speed and more at high speed. |
| **Why** | The simulator's tyre rules show that in a bend, extra wheelspin adds no drive, only slide. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:50 |
| **Damage** | 0 |
| **Top speed** | 283 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:50 (0.05 s slower on the single lap), damage 0, top speed 283 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — 0.07 s faster over the 30 robustness laps with none off the road, slightly more room to spare, and none of the 40 shifted-start laps off the road. The best single lap remained v0.82's 1:14:45. |
| **Learned** | An earlier test of this idea (v0.46) had found no gain on the car as it was then. It was also found that the engine-speed reading the car receives is 4.7 % too high. For this batch of versions three assistants worked in parallel on separate ideas. |

---

## v0.84 — The corner-speed plan takes the car's slide into account

| Field | Detail |
|---|---|
| **Version** | v0.84 |
| **What changed** | When the car judges how fast a bend can be taken, it now takes part of its sideways slide into account: a sliding car is allowed less speed, a gripping car a little more. |
| **Why** | The car used to assume it was travelling exactly where its nose points. In a bend it actually slides slightly sideways, so its real path is tighter than assumed. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:37 |
| **Damage** | 0 |
| **Top speed** | 283 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:37 (0.13 s faster), damage 0, top speed 283 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — a new best single lap; 0.07 s faster over the 30 robustness laps with none off the road; 1 of the 40 shifted-start laps left the road (within the limit of 1; none before). |
| **Learned** | The medium bends are limited by tyre grip, not by how far the car can see, so giving the plan more or less entry speed gains nothing; what it lacked was the car's true direction of travel. The planned speed now jumps about a little more. |

---

## v0.85 — Braking plan allows slightly harder braking at very high speed

| Field | Detail |
|---|---|
| **Version** | v0.85 |
| **What changed** | The upper limit on how hard the braking plan assumes the car can brake (it matters above about 200 km/h) was raised a step. |
| **Why** | Since the clutch changes the car arrives faster at the braking points. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:23 |
| **Damage** | 0 |
| **Top speed** | 283 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:23 (0.15 s faster), damage 0, top speed 283 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — a new best single lap; 0.14 s faster over the 30 robustness laps with none off the road; 1 of 40 shifted-start laps off the road (the same lap as before, within the limit). The cost: margin was spent, not gained, and the steering oscillated for a second more per lap. |
| **Learned** | A diagnostic test showed that slowing the car more on the way into the flick neither gains nor loses time. Three separate gains were found in this round, but any two of them together left the road, always in the same two robustness laps (at the flick and the hairpin exit). The project was now limited by safety margin, not by ideas. |

---

## v0.86 — Change down earlier when braking is falling behind the plan

| Field | Detail |
|---|---|
| **Version** | v0.86 |
| **What changed** | When the car is braking and still more than 20 km/h above its planned speed, it now changes down a gear earlier, so the engine helps to slow the rear wheels. |
| **Why** | On the approach to the flick the brake pedal is already fully pressed and being eased by the anti-lock system, so engine braking is the only extra slowing available. Two measured gains could not be added because the same two robustness laps kept leaving the road. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:24 |
| **Damage** | 0 |
| **Top speed** | 283 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:24 (0.01 s slower), damage 0, top speed 283 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — enabling change: the 30-lap average was unchanged within chance (0.009 s slower), none off the road, but the lap that had been failing at the flick was now back on the road with room to spare. That makes the two waiting gains safe to add; both were measured on top of this version with none of 30 off the road. |
| **Learned** | The early change-down must only be used when the car is behind its plan; used in every braking zone it cost 0.16 s. |

---

## v0.87 — Throttle restarts from the point where the engine stops braking

| Field | Detail |
|---|---|
| **Version** | v0.87 |
| **What changed** | The throttle now restarts from the point at which the engine neither pushes nor brakes — a figure taken from the simulator's own rules, not tuned. |
| **Why** | After each brake application the throttle used to restart from zero. But at very low throttle the engine actually holds the car back (engine braking), so the first moments of every restart were still slowing the car. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:24 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:24 (unchanged), damage 0, top speed 284 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — 0.04 s faster over the 30 robustness laps with none off the road (so the small cost of v0.86 was won back); 1 of 40 shifted-start laps off the road, the same lap as before. |
| **Learned** | It was the starting point of the throttle's rise, not its speed, that lost time. Over this batch of versions the 30-lap average improved by 0.31 s. |

---

## v0.88 — Tighter inside line kept on through the medium bends

| Field | Detail |
|---|---|
| **Version** | v0.88 |
| **What changed** | The rule that switches off the tighter inside line of v0.52 was moved, so the line stays on in the two medium bends it was built for. To stop the steering and the line target chasing each other from one instant to the next, the rule now looks at a smoothed version of the steering. |
| **Why** | The tighter inside line was being switched off by its own rule in exactly those two bends, because the steering there is turned further than the rule allowed. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:04 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 58 km/h |
| **Observed** | Lap 1:14:04 (0.20 s faster, partly single-lap luck), damage 0, top speed 284 km/h, slowest corner 58 km/h. |
| **Decision** | ✅ Kept — a new best single lap; 0.08 s faster over the 30 robustness laps with none off the road; 1 of 40 shifted-start laps off the road (the same lap as before). The steering oscillation disappeared. |
| **Learned** | The car's inside points moved only slightly further in; the medium bends remain limited by tyre grip. |

---

## v0.89 — Throttle that levels off as the car reaches its planned speed (rejected)

| Field | Detail |
|---|---|
| **Version** | v0.89 |
| **What changed** | This version made the throttle level off as the car closes in on its planned speed instead of overshooting it. |
| **Why** | In two medium bends the car's speed cycles: throttle up, over the planned speed, lift or dab the brake, and again. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:22 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 57 km/h |
| **Observed** | Lap 1:14:22 (0.18 s slower), damage 0, top speed 284 km/h, slowest corner 57 km/h. |
| **Decision** | ❌ Rejected — safe (none of 30 off the road) but 0.07 s slower over the 30 laps, and it unlocked nothing; the driver went back to v0.88. |
| **Learned** | The version more than halved the brake touches in one bend, yet the sudden losses of steering there stayed exactly as they were. So the cycle is not caused by the pedals. It comes from an over-eager turn-in when the bend is first noticed, from a rear slide after a gear change down in the middle of the turn-in, and from the planned speed going up and then down on the way into the corner. |

---

## v0.90 — First gear at full steering lock

| Field | Detail |
|---|---|
| **Version** | v0.90 |
| **What changed** | With the steering fully turned at low speed (the hairpin and the two parts of the flick), the car now drops into 1st gear and goes back to 2nd once the steering unwinds. |
| **Why** | At full lock the front tyres are already doing all they can; pressing the brake harder or softer makes the drift toward the outside worse. But slowing only the rear wheels, which is what engine braking in 1st does, both slows the car and helps turn it. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:14:03 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 53 km/h |
| **Observed** | Lap 1:14:03 (0.01 s faster), damage 0, top speed 284 km/h, slowest corner 53 km/h. |
| **Decision** | ✅ Kept — 0.05 s faster over the 30 robustness laps with none off the road and clearly more room to spare (worst lap 0.79 of the way to the edge, 0.91 before); none of the 40 shifted-start laps left the road, the first time since v0.83. |
| **Learned** | The one lap that had kept failing was failing because of the speed it arrived with at the hairpin, not because of braking at full lock. The hairpin now has a deliberate rear slide, which later changes need to be checked against. |

---

## v0.91 — Less caution for crests at high speed

| Field | Detail |
|---|---|
| **Version** | v0.91 |
| **What changed** | The braking plan is now less cautious about crests above about 150–200 km/h and unchanged at lower speed, where the caution protects the entry to the flick. |
| **Why** | The braking plan expects weaker braking when the car goes light over a crest (v0.48). At high speed that caution was mostly a false alarm: the crest is over long before the corner arrives, yet the car braked hard for it. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:13:97 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 53 km/h |
| **Observed** | Lap 1:13:97 (0.06 s faster), damage 0, top speed 284 km/h, slowest corner 53 km/h. |
| **Decision** | ✅ Kept — the first lap under 1:14; 0.09 s faster over the 30 robustness laps with none off the road, and none of the 40 shifted-start laps off the road. It used part of the room at the flick that v0.90 had bought and none at the hairpin. |
| **Learned** | Reducing the caution at every speed was also faster, but two thirds of that gain came simply from arriving faster at the flick, which is the margin. Removing the caution altogether left the road. |

---

## v0.92 — Keep the clutch slipping through every change up

| Field | Detail |
|---|---|
| **Version** | v0.92 |
| **What changed** | The car now holds the clutch partly pressed for the three instants a change up takes, so drive is not interrupted. |
| **Why** | The simulator's rules showed that whenever a gear change is made with the clutch pedal fully released, the simulator itself opens the clutch and cuts the throttle for the duration of the change. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:13:82 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 53 km/h |
| **Observed** | Lap 1:13:82 (0.15 s faster), damage 0, top speed 284 km/h, slowest corner 53 km/h. |
| **Decision** | ✅ Kept — 0.12 s faster over the 30 robustness laps (of which about 0.05 to 0.07 s is well supported; the rest may be a lucky pick among similar settings), none off the road, the same safety margin, and none of the 40 shifted-start laps off the road: a gain that costs no margin. |
| **Learned** | The same trick on changes down gained nothing. A new oddity was noticed: the car brakes briefly on the start straight at about 220 km/h for no good reason. |

---

## v0.93 — Wider "lift only" zone, with full braking beyond it

| Field | Detail |
|---|---|
| **Version** | v0.93 |
| **What changed** | The "lift only" zone of v0.51 was made wider (3.5 % of the car's speed instead of 1 %), and the brake now presses at full strength beyond it. A car that is following its planned speed through a bend now lifts instead of dabbing the brake. |
| **Why** | The way the "lift only" zone had been built made the brake press less hard in every real braking zone, which is why a wider zone had always looked unsafe. |
| **Prediction** | Not predicted: the setting was chosen from test laps driven beforehand, which had already shown this result. |
| **Lap time** | 1:13:88 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 56 km/h |
| **Observed** | Lap 1:13:88 (0.06 s slower on the single lap), damage 0, top speed 284 km/h, slowest corner 56 km/h. |
| **Decision** | ✅ Kept — 0.056 s faster over the 30 robustness laps (19 of 30 faster; about 0.03 s of it is firmly supported), none off the road, and with more room to spare on both checks (none of 40 shifted-start laps off the road). The best single lap remained v0.92's. |
| **Learned** | The unexplained braking on the start straight was traced to its cause, but removing it gained nothing: the extra speed was lost again at the next braking zone. |

---

## v0.94 — Don't turn the wheel further than the tyres can use at speed

| Field | Detail |
|---|---|
| **Version** | v0.94 |
| **What changed** | Above about 105 km/h the steering is now limited to roughly 60 % of full lock. Below 95 km/h (hairpin and flick) full lock is still available. |
| **Why** | At that speed the front tyres are already giving all the grip they have; turning the wheel further only scrubs the tyres. |
| **Prediction** | A few hundredths of a second at most. |
| **Lap time** | 1:13:78 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 56 km/h |
| **Observed** | Lap 1:13:78 (0.10 s faster), damage 0, top speed 285 km/h, slowest corner 56 km/h. |
| **Decision** | ✅ Kept — the best single lap so far; none of the 30 robustness laps and none of the 40 shifted-start laps off the road. But the gain is small and only weakly supported: 0.028 s over the 30 laps, which is within chance variation. |
| **Learned** | The real aim was to fix the abrupt turn-in at corners, and that was not achieved. Every way of softening, delaying or holding the turn-in was 0.1 to 0.5 s slower: the sharp turn-in is wanted. |

---

## v0.95 — Plan for harder braking, but not on the approach to the flick

| Field | Detail |
|---|---|
| **Version** | v0.95 |
| **What changed** | The braking plan now assumes stronger braking than before, but only where that lifts the planned speed up to 235 km/h. |
| **Why** | It was found that the car can brake much harder at full pedal than the braking plan had assumed (the earlier measurement had been taken at only two-thirds pedal). Without that limit the car arrived too fast at the flick and left the road. |
| **Prediction** | Braking a few metres later in most braking zones; a few hundredths of a second over the lap. |
| **Lap time** | 1:13:72 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 54 km/h |
| **Observed** | Lap 1:13:72 (0.05 s faster), damage 0, top speed 285 km/h, slowest corner 54 km/h. |
| **Decision** | ✅ Kept — the best single lap so far; 0.04 s faster over the 30 robustness laps (19 of 30 faster), none off the road, none of 40 shifted-start laps off the road. The gain is small and only weakly supported, it used up some room on the shifted-start laps, and the limit has a cliff nearby (245 km/h: 2 of 30 laps off the road). |
| **Learned** | In this simulator, tyres keep gaining grip as they slip more, which explains why wheelspin on a straight costs nothing. |

---

## v0.96 — Gentler wheelspin correction

| Field | Detail |
|---|---|
| **Version** | v0.96 |
| **What changed** | When the rear wheels spin more than allowed, the throttle is now eased less sharply than before. |
| **Why** | The robustness laps had given a hint: the fastest of them were the ones in which wheelspin control happened to be looser. |
| **Prediction** | A few hundredths of a second per corner exit; slides at the flick and the hairpin exit to be checked. |
| **Lap time** | 1:13:59 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 55 km/h |
| **Observed** | Lap 1:13:59 (0.14 s faster), damage 0, top speed 285 km/h, slowest corner 55 km/h. |
| **Decision** | ✅ Kept — the best single lap; 0.15 s faster over the 30 robustness laps (24 of 30 faster), none off the road, none of the 40 shifted-start laps off the road, and no loss of margin. The gain was smaller on the shifted-start laps (about 0.06 s over all 70 laps together). |
| **Learned** | Wheelspin control had been set too tight for the car as it now is. A much gentler setting came close to the edge of the road, and none at all left the road in 29 of 30 laps. A diagnostic test also showed the early braking before the flick is not a mistake: with it removed, the car was damaged at a dip before the crest. |

---

## v0.97 — More wheelspin allowed when running straight (rejected)

| Field | Detail |
|---|---|
| **Version** | v0.97 |
| **What changed** | More wheelspin is allowed when the steering wheel is straight. |
| **Why** | Thirty-seven small adjustments around v0.96 were tried; only one came out faster than v0.96 at all: allowing more wheelspin when the wheel is straight. That one was run as this version. |
| **Prediction** | A few hundredths of a second, at the cost of some margin. |
| **Lap time** | 1:13:51 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 56 km/h |
| **Observed** | Lap 1:13:51 (0.08 s faster on the single lap), damage 0, top speed 285 km/h, slowest corner 56 km/h; none of the 30 robustness laps and none of the 40 shifted-start laps off the road. |
| **Decision** | ❌ Rejected — the gain was within chance variation (0.015 s over the 30 laps; 0.037 s over all 70), and it used up safety margin: the worst shifted-start lap went from 0.893 to 0.928 of the way to the edge. The driver went back to v0.96; its single lap, though faster, does not count as a record. |
| **Learned** | The driver of v0.96 was as good as small adjustments could make it. Also, on this car the abrupt hand-overs in the steering (at turn-in and at corner exit) are useful: every attempt to smooth them was slower. |

---

## v0.98 — Don't forget a bend while still in it (rejected)

| Field | Detail |
|---|---|
| **Version** | v0.98 |
| **What changed** | The car now keeps an established medium-speed bend in mind even when its sensors briefly suggest that the bend is over. |
| **Why** | Occasionally the car, in the middle of a long medium-speed bend, briefly decides the bend is over, lets go of its line, and then brakes and changes down unnecessarily. |
| **Prediction** | About 0.02 s faster over the 30 robustness laps; nothing on the standard lap. |
| **Lap time** | 1:13:59 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 55 km/h |
| **Observed** | Lap 1:13:59, damage 0, top speed 285 km/h, slowest corner 55 km/h — identical to the v0.96 lap at every one of 3,605 recorded moments, because the situation does not arise on the standard lap. None of the 30 robustness laps and none of the 40 shifted-start laps off the road. |
| **Decision** | ❌ Rejected — the gain was within chance variation (0.012 s over the 30 laps, 0.001 s over all 70: 7 laps faster, 6 slower, 57 identical); the driver went back to v0.96. |
| **Learned** | The fix does remove the fault it targets, but the laps scatter both ways afterwards. Three ideas from the plan for this version were also measured and none gained. |

---

## v0.99 — A second look at the false braking on the start straight (rejected)

| Field | Detail |
|---|---|
| **Version** | v0.99 |
| **What changed** | Below 232 km/h, the speed plan now uses a slightly tighter curve instead of throwing away a sensor reading that only just fails a safety check. |
| **Why** | At a flat-out kink on the start straight, the car sometimes lifts or brakes because its speed plan throws away a sensor reading that only just fails a safety check. |
| **Prediction** | About 0.02–0.03 s faster over the 70 laps, from the start-straight kink; nothing at the flick. |
| **Lap time** | 1:13:63 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 56 km/h |
| **Observed** | Lap 1:13:63 (0.05 s slower), damage 0, top speed 285 km/h, slowest corner 56 km/h; none of the 30 robustness laps and none of the 40 shifted-start laps off the road. |
| **Decision** | ❌ Rejected — the 30-lap average was slower (73.733 s against 73.688 s), the 0.012 s gain over all 70 laps was within chance variation, the steering was a little busier, and the kink it was written for was not fixed at this setting; the driver went back to v0.96. |
| **Learned** | How much room the car has at the flick depends on whether one small, chance touch of the brakes happens about 120 m before it; laps without that touch arrive faster, run widest and are also 0.2 s slower through the flick. Because the two groups of laps disagreed in direction, versions are from here on judged on all 70 laps together. |

---

## v1.00 — Moving out before a corner and easing in early (rejected)

| Field | Detail |
|---|---|
| **Version** | v1.00 |
| **What changed** | Before each corner the car was pulled firmly toward the outside, then gently eased toward the inside before the usual turn-in. |
| **Why** | This was a direct attempt at the wider racing line the user had asked for. A diagnostic test first forced the car to the outside before each medium bend, to see what a wide entry is worth on its own. |
| **Prediction** | About 0.1 s faster if the three bends that gain could be picked out and the others left alone; without that, a loss. |
| **Lap time** | 1:13:94 |
| **Damage** | 0 |
| **Top speed** | 284 km/h |
| **Min speed** | 54 km/h |
| **Observed** | Lap 1:13:94 (0.35 s slower), damage 0, top speed 284 km/h, slowest corner 54 km/h; none of the 30 robustness laps and none of the 40 shifted-start laps off the road. |
| **Decision** | ❌ Rejected — 0.29 s slower over all 70 laps (only 11 of 70 faster), and the stronger pull made the steering oscillate (reversals rose from 41 to 122 per lap); the driver went back to v0.96. |
| **Learned** | A wide entry alone was slower at every medium bend, because the car still turned in at the same place and then missed the inside. With the early easing-in, three bends gained and others lost, and nothing the car can sense tells those bends apart. A line that helps would need the car to know which corner is coming — remembering the track, which is on hold until the competition officials say whether it is allowed. |

---

## v1.01 — A very short brake no longer throws the throttle away

| Field | Detail |
|---|---|
| **Version** | v1.01 |
| **What changed** | For the first two instants of any brake application, the car now keeps 70 % of its built-up throttle, provided the wheel is nearly straight and the speed is below 230 km/h. |
| **Why** | At the kink on the start straight a one-instant touch of the brake cost only about 1 km/h, but restarting the throttle afterwards cost 8–9 km/h. |
| **Prediction** | About 0.03 s faster over the 70 laps; nothing on the standard lap. |
| **Lap time** | 1:13:59 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 55 km/h |
| **Observed** | Lap 1:13:59 (the same lap as v0.96), damage 0, top speed 285 km/h, slowest corner 55 km/h. |
| **Decision** | ✅ Kept — none of the 30 robustness laps and none of the 40 shifted-start laps off the road; 0.024 s faster over all 70 laps (15 faster, 3 slower, 52 unchanged), with no margin used. A small gain, but it acts exactly where it was aimed: 16 of the 18 laps that changed did so at the start kink. |
| **Learned** | Without the speed limit the rule reached the brake touches before the flick and the car came close to the edge. Three other new ideas were tried and were slower. |

---

## v1.02 — Ignore a momentary "the bend is over" signal (rejected)

| Field | Detail |
|---|---|
| **Version** | v1.02 |
| **What changed** | When the car's sensors suddenly suggest that a long bend has ended, the car now waits a few instants before believing it. |
| **Why** | In one long bend a single sensor beam sometimes clips the inside edge for a moment, which makes the car think the bend has ended. |
| **Prediction** | About 0.014 s faster over the 70 laps, plus 0.007 s from two other laps. |
| **Lap time** | 1:13:58 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 55 km/h |
| **Observed** | Lap 1:13:58 (0.01 s faster), damage 0, top speed 285 km/h, slowest corner 55 km/h; none of the 30 robustness laps and none of the 40 shifted-start laps off the road. |
| **Decision** | ❌ Rejected — within chance variation (0.007 s over all 70 laps: 22 faster, 21 slower), with slightly less room on the shifted-start laps; the driver went back to v1.01. |
| **Learned** | Laps on which the event happened had been 0.07 s slower in that stretch, but removing the event recovered almost none of it: comparing laps with and without an event overstates what the event costs. The settings of v1.01 were also re-checked and are at their best values. |

---

## v1.03 — A brake application that starts gently (rejected)

| Field | Detail |
|---|---|
| **Version** | v1.03 |
| **What changed** | A brake application that begins from full throttle, in a bend the car has already recognised, now starts at a tenth of its strength for its first two instants. A new analysis tool was also added in this round; it compares all 70 standard laps of two versions stretch by stretch. |
| **Why** | At the start-straight kink the car still sometimes brakes for a few instants for no good reason. |
| **Prediction** | At most 0.018 s faster over the 70 laps. |
| **Lap time** | 1:13:62 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 56 km/h |
| **Observed** | Lap 1:13:62 (0.04 s slower), damage 0, top speed 285 km/h, slowest corner 56 km/h; none of the 30 robustness laps and none of the 40 shifted-start laps off the road. |
| **Decision** | ❌ Rejected — no gain over all 70 laps (0.003 s, within chance: 32 faster, 37 slower), slower over the 30 standard laps, and less room at the flick; the driver went back to v1.01. |
| **Learned** | The gentle start helped at the kink (laps losing time there fell from 14 to 8 of 70), but the car cannot tell the kink's false braking from the real braking for the next bend, which begins in the same way, so the time was given back there. A slow stretch near 3,000 m was traced: mostly the robustness laps' own altered settings arriving too fast, plus three laps that forgot the bend mid-corner; fixing those was worth 0.006 s. |

---

## v1.04 — A closer look behind a kink

| Field | Detail |
|---|---|
| **Version** | v1.04 |
| **What changed** | The car has a second set of sensors it had never used: five narrow beams that it can point in a chosen direction once per second. Now, when it approaches a kink at high speed, it points them just inside the kink. If the far edge of the road comes closer as the beams sweep round, the road turns back on itself behind the kink (a slow corner is hiding there), and the car holds its planned speed down briefly. |
| **Why** | The aim was to give the car more to see within one lap, without remembering the track. The look picks out the approach to the flick on every lap, about 0.6 seconds earlier than before, and nowhere else. |
| **Prediction** | About 0.015 s faster over the 70 laps, with the worst lap at the flick further from the edge. |
| **Lap time** | 1:13:61 |
| **Damage** | 0 |
| **Top speed** | 285 km/h |
| **Min speed** | 54 km/h |
| **Observed** | Lap 1:13:61 (0.02 s slower on the single lap), damage 0, top speed 285 km/h, slowest corner 54 km/h. |
| **Decision** | ✅ Kept — none of the 30 robustness laps and none of the 40 shifted-start laps off the road; 0.035 s faster over all 70 laps (43 faster, 26 slower, 1 unchanged); the best single lap stays 1:13:59. The chosen setting was the best of five tried, so the true gain is more likely 0.02 to 0.03 s. |
| **Learned** | This is the first use of information the car did not have before. The car now arrives at the flick at nearly the same speed on every lap (230–239 km/h instead of 228–246), and the worst lap there uses less of the road. The rule has only been tested on this track. |

---

## v1.05 — Later braking from the very highest speeds

| Field | Detail |
|---|---|
| **Version** | v1.05 |
| **What changed** | The braking plan's stronger-braking assumption (v0.95) is no longer restricted whenever the car itself is travelling faster than 245 km/h. Below that the restriction stays, because without it the car took an extra touch of the brake at the start-straight kink. |
| **Why** | Since v0.95 the braking plan could assume stronger braking only up to a certain planned speed, a restriction that existed only to protect the approach to the flick. The closer look of v1.04 now takes care of the flick. |
| **Prediction** | About 0.05 s gained in the three fastest braking zones, part of it lost again at the flick; no change at the start-straight kink. |
| **Lap time** | 1:13:56 |
| **Damage** | 0 |
| **Top speed** | 286 km/h |
| **Min speed** | 54 km/h |
| **Observed** | Lap 1:13:56 (0.05 s faster), damage 0, top speed 286 km/h, slowest corner 54 km/h. |
| **Decision** | ✅ Kept — the best single lap of any kept version; none of the 30 robustness laps and none of the 40 shifted-start laps off the road; 0.033 s faster over all 70 laps (42 faster, 25 slower, 3 unchanged). The chosen value was one of three similar ones among about 20 settings tried, so the true gain is more likely 0.02 to 0.03 s; what supports it is that every form of the change gained the same small amount in the same three high-speed braking zones. |
| **Learned** | The flick no longer blocks this and several other changes, though most of the others turned out simply slower. One further change (more wheelspin allowed when running straight) was measured on top of this version as a little faster still, but within chance by itself; it was left as the candidate for the next version. |

---

*Simplified from CHANGELOG.md as it stood after the v1.05 run.*
