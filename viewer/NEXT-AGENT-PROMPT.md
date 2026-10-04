# Run Viewer — Agent Handoff Document

**Branch:** `experimental_hosting`
**Last updated:** after Phase 4

---

## What has been done

### Phase 1 (COMPLETE) — tag: `phase-1`
All trivial UI and label fixes.

Changes made:
1. **Telemetry label** (`telemetry.js`, `versions.js`): "Part of the lap at full throttle" and "Full throttle" both renamed to "% of the lap at full throttle" in both Basic and Detailed views.
2. **Clutch removed from HUD** (`inputs.js`, `index.html`): The "Clutch: not recorded" span is gone from the pedals key display. Clutch still renders on the canvas graph if the data has it, but the text key no longer mentions it. `aria-label` updated to match.
3. **"Doing" status in both views** (`map.js`, `css/app.css`): The "Doing" status (Braking / Full throttle / Part throttle / Coasting) now appears in both Basic and Detailed views. It is shown as a small `.hud-doing` div directly under the version name in the HUD, not in the key-value list. CSS added: `#hud .hud-doing`.
4. **Enabling change badge** (`data.js`, `versions.js`, `core.js`, `css/app.css`): Versions whose Decision field contains "enabling change" (case-insensitive) are tagged with `v.enableChange = true`. In the Versions tab:
   - Kept enabling changes: **yellow/warning badge** ("Enabling change"), yellow dot on the chart.
   - Rejected enabling changes: **grey badge** ("Enabling change"), grey dot on the chart (same as other rejected).
   - New `ke` and `re` chart classes added to `CLS`. `c-warn` CSS class added to the key legend. `P['warn']` added to palette (reads `--warn-ink`).

### Phase 2 (COMPLETE) — tag: `phase-2`
Shared red/green color-scale utility added to `core.js`:

- `RV.colorScale(value, min, max, direction)` → CSS rgb string. direction=1: high=green; direction=-1: low=green.
- `RV.deltaColor(delta, maxDelta)` → diverging white-centered scale (white at 0, green faster, red slower). Used by Phase 6 lap delta bar.
- `RV.gearColor(gear)` → sequential palette for gears -1 through 6.

Applied in `telemetry.js`:
- Speed chart line: now uses `RV.colorScale` (red→green by speed).
- Throttle chart: colored line using `RV.colorScale` (green=full throttle, red=none).
- Brake chart: colored line (green=no brake, red=full brake).
- Steering and Track position: colored by `|value|` (green=near 0, red=near ±1).
- Gear chart: filled area per gear, each gear has its own color via `RV.gearColor`. Gear range extended to include -1 (reverse).

---

## Architecture overview

The viewer is a static multi-file page under `viewer/`. It has no build step and runs directly in a browser.

- `viewer/index.html` — the page shell, tab/overlay structure
- `viewer/js/core.js` — palette, clamp, bsearch, color scales
- `viewer/js/data.js` — fetches and parses changelogs and run CSVs from GitHub or local folder
- `viewer/js/app.js` — page state (`RV.S`), selection, replay clock, tabs, view switch
- `viewer/js/versions.js` — Versions tab: lap-time chart, table, rankings, detail panel
- `viewer/js/map.js` — Track tab: canvas replay, camera, side panel, layers, HUD
- `viewer/js/inputs.js` — steering wheel and throttle/brake graph (bottom right of map)
- `viewer/js/telemetry.js` — Telemetry tab: charts along the lap, 100 m sections
- `viewer/js/sectors.js` — sector time helpers shared by Versions and Telemetry tabs
- `viewer/js/settings.js` — Settings/Help page
- `viewer/js/tutorial.js` — guided tutorial overlay
- `viewer/css/app.css` — all CSS, fully token-based (light/dark themes)

Global namespace is `globalThis.RV`. All modules attach to it.

---

## Remaining phases (ordered, easiest first)

### Phase 3 (COMPLETE) — tag: `phase-3`
Two vertical bars added between the steering wheel and the pedals history graph in `#inputs`:
- `#barBrake` (fills red via `--in-brake`) and `#barThrottle` (fills green via `--in-throttle`).
- CSS `--bar-h` custom property drives the `::after` height; updated each frame in `drawBars(R, i)` in `inputs.js`.
- The `#pedBars` container sits between `#wheel` and `.ped` in `#inputs`.

### Phase 4 (COMPLETE) — tag: `phase-4`
1. **Start / finish line** (`map.js`): new `finish` path in `trackPaths()`. A `finish` layer in the Track group draws a chequered line across the road at distance 0. A "Start / Finish" label appears at zoom ≥ 1.
2. **Mini-map** (`drawMini`): finish line and sector boundaries (detailed view only) are now painted into the mini-map's static background buffer.
3. **Slowest corner pin** (`map.js`): new `slowcorner` layer in the "Car and path" group. Shows a purple dot and a speed label at the run's slowest corner. `data.js` now stores `sum.slow_at` (frame index) alongside `sum.slow`.
4. **Default whole-track view on comparison** (`map.js` `resetAuto`): when `S.CM.length > 0`, `fitView()` is called so the whole track is shown by default.
5. **Per-car size** (`app.js`, `map.js`): `S.carScale = {}` stores a scale multiplier per car. `drawCar` accepts a `userScale` argument. Sliders in the Camera section of the side panel (detailed view) let the user adjust each car's size from 0.3× to 4×, with Reset buttons per car and a "Reset all" button.
6. **Loop focus dimming** (`map.js` `drawSpeedLine`): `LOOP_DIM = 0.18` constant. When `S.loop` is active, the driven line is drawn in two passes: outside the loop at `LOOP_DIM` opacity, inside at full opacity.

### Phase 5: Telemetry panel improvements
1. **Configurable section gap**: replace the hardcoded `100` m gap with a user-selectable value (options: 25, 50, 100, 200, 500 m, always include 0 and `R.total`). Add a small control above the sections table.
2. **Auto-fit**: when a chart is first built (or the selection changes), set `xr` so the entire lap is visible without horizontal scroll — i.e. `xr = [0, R.total]` on initial load. Zoom/pan still works afterward.
3. **Step range input**: add a small `<input type="text">` above the charts that lets the user type e.g. `1200–2400` to set `xr` directly. Parse the two numbers; reset to full range if invalid.

### Phase 6: Track tab side panel and sector timing table
1. **Close button for the side panel**: add a toggle to hide `#side` entirely (a thin arrow button at its edge). Sector table remains visible even when the panel is closed.
2. **Sector time table under the overview map**: always visible below `#mini`. Shows live current time and fills in each sector time as it completes. Delta column per sector, background colored green/red using `RV.deltaColor` (Phase 2). Reference is the previous best or the comparison mean when comparing.
3. **Lap delta bar** below the sector table: white at 0, green when ahead, red when behind. Uses the diverging `RV.colorScale` variant. Configurable "full color" delta (default 5 s). When multiple cars: show one bar per car, focused car always at top and larger.

### Phase 7: Replay camera smoothing
- In `app.js` `tick()`: when speed ≤ 1× and playing, interpolate the camera position between the previous and next step using the elapsed `dt`.
- Snap immediately on pause, `go()`, speed change > 1×, or any interruption.
- The camera must never stop at a mid-interpolation position between two steps.

### Phase 8: Versions tab bulk actions
- Add **"Load all versions"** button: iterates all versions with files and calls `ds.loadRun(id)` for each, showing progress.
- Add **"Unload"** button: clears `sum`, `sec`, and run data from all non-selected versions to free memory.
- Both buttons live above the version table.

---

## Phase 9 (hosting) checkpoint list

Before Phase 9, verify locally:
- [ ] Camera smoothing at 0.5× and 1× speed
- [ ] Keybinds: Space, arrows, Home, Escape loop, F follow
- [ ] Live sector table updates as the lap progresses
- [ ] Bulk load/unload of versions
- [ ] Loop focus dimming on the map
- [ ] Enabling change badges visible on versions with "enabling change" in their decision

---

## Phases 9–18

See the original implementation plan (the Race Runner ordered list) for full details of Phase 9 (hosting), Phase 10 (persistence), Phase 11 (overlay framework), Phase 12 (themes), Phase 13 (navigation), Phase 14 (analysis features), Phase 15 (manual entry), Phase 16 (draggable windows), Phase 17 (tutorials), and Phase 18 (3D).

**Key constraint for all phases:** no user-specific paid API keys embedded in the repo. Third-party services must have a free tier accessible to all users.
