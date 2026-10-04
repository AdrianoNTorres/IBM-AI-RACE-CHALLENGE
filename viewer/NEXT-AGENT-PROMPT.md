# Run Viewer — Agent Handoff Document

**Branch:** `experimental_hosting`
**Last updated:** after Phase 1

---

## What has been done

### Phase 1 (COMPLETE)
All trivial UI and label fixes. Commit tag: `phase-1`.

Changes made:
1. **Telemetry label** (`telemetry.js`, `versions.js`): "Part of the lap at full throttle" and "Full throttle" both renamed to "% of the lap at full throttle" in both Basic and Detailed views.
2. **Clutch removed from HUD** (`inputs.js`, `index.html`): The "Clutch: not recorded" span is gone from the pedals key display. Clutch still renders on the canvas graph if the data has it, but the text key no longer mentions it. `aria-label` updated to match.
3. **"Doing" status in both views** (`map.js`, `css/app.css`): The "Doing" status (Braking / Full throttle / Part throttle / Coasting) now appears in both Basic and Detailed views. It is shown as a small `.hud-doing` div directly under the version name in the HUD, not in the key-value list. CSS added: `#hud .hud-doing`.
4. **Enabling change badge** (`data.js`, `versions.js`, `core.js`, `css/app.css`): Versions whose Decision field contains "enabling change" (case-insensitive) are tagged with `v.enableChange = true`. In the Versions tab:
   - Kept enabling changes: **yellow/warning badge** ("Enabling change"), yellow dot on the chart.
   - Rejected enabling changes: **grey badge** ("Enabling change"), grey dot on the chart (same as other rejected).
   - New `ke` and `re` chart classes added to `CLS`. `c-warn` CSS class added to the key legend. `P['warn']` added to palette (reads `--warn-ink`).

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

### Phase 2: Shared red/green color-scale system
Build one utility: `RV.colorScale(value, min, max, direction)` → CSS color string.
- Green = better (faster, more throttle), red = worse (slower, more brake).
- White-centered (diverging) variant for the lap delta bar in Phase 6.
- Later phases (deltas, line accuracy, sector indicators) all reuse this.
- In `telemetry.js` speed chart: currently uses `RV.speedChartCol`; replace with this utility for the red-to-green format rule.
- In `versions.js` chart: lap time coloring should use this utility.
- Export as `RV.deltaColor(delta, maxDelta)` → CSS color string.

### Phase 3: Throttle/brake vertical bars in the HUD
Add two small vertical bars between the steering wheel and the pedals history graph:
- One fills **red** for brake, one fills **green** for throttle.
- Fill level = current step's value (0–1).
- In `inputs.js`, add `drawBars(R, i)` and wire it into `draw()`. Add CSS in `app.css`.
- The bars sit between `#wheel` and `.ped` in `#inputs`.

### Phase 4: Track map visual markers
1. **Start/finish marker** on the track map at distance 0 (where the lap starts). Draw a chequered or solid line perpendicular to the track.
2. **Left mini-map**: add sector boundary lines and a finish line marker to the overview map (`drawMini`).
3. **Slowest corner pin**: mark the point of the run's slowest corner speed on the main map. Show a dot and a small label.
4. **Default camera for comparison runs**: when `S.CM.length > 0`, default `view.all = true` (whole-track view) instead of follow. Do not change after the user interacts.
5. **Per-car size adjustment**: add a multiplier per car (stored in `S.carScale = {}`). Show a small number input or slider in the side panel's Camera section, one per car. A "reset" button restores `1.0`. The `drawCar` function receives the scale.
6. **Loop focus dimming**: when a loop is active (`S.loop != null`), fade out the portions of the map **outside** the loop boundaries. Only the looped section of the driven line is full strength; the rest is at ~20% opacity (a named constant). Clear when the loop ends. This applies to the driven line layer on the main canvas.

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
