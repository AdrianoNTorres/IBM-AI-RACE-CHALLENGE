# Run Viewer — Agent Handoff Document

**Branch:** `experimental_hosting`
**Last updated:** after Phase 6

---

## What has been done

### Phase 1 (COMPLETE) — tag: `phase-1`
All trivial UI and label fixes.
1. **Telemetry label** (`telemetry.js`, `versions.js`): "% of the lap at full throttle" in both Basic and Detailed views.
2. **Clutch removed from HUD** (`inputs.js`, `index.html`): "Clutch: not recorded" span removed; `aria-label` updated.
3. **"Doing" status in both views** (`map.js`, `css/app.css`): Braking / Full throttle / Part throttle / Coasting shown as `.hud-doing` div directly under the version name in the HUD in both views.
4. **Enabling change badge** (`data.js`, `versions.js`, `core.js`, `css/app.css`): `v.enableChange = true` when Decision contains "enabling change". Kept = yellow `.warn-badge`; rejected = grey `.dim-badge`. New `ke`/`re` chart classes; `P['warn']` reads `--warn-ink`.

### Phase 2 (COMPLETE) — tag: `phase-2`
Shared red/green color-scale utilities added to `core.js`:
- `RV.colorScale(value, min, max, direction)` → CSS rgb. direction=1: high=green, -1: low=green.
- `RV.deltaColor(delta, maxDelta)` → diverging white-centred scale (white=0, green=faster, red=slower). Ready for Phase 6 lap delta bar.
- `RV.gearColor(gear)` → sequential palette for gears −1 through 6.

Applied in `telemetry.js`: speed (red→green), throttle (green=full), brake (green=none), steering/trackPos (green=near 0), gear (filled area per gear, own color).

### Phase 3 (COMPLETE) — tag: `phase-3`
Two vertical bars in `#pedBars` between the wheel and pedal history graph:
- `#barBrake` (red, `--in-brake`) and `#barThrottle` (green, `--in-throttle`).
- `--bar-h` CSS custom property drives `::after` height; set each frame in `drawBars(R, i)` in `inputs.js`.

### Phase 4 (COMPLETE) — tag: `phase-4`
1. **Start/finish line** (`map.js`): `finish` path in `trackPaths()`; chequered line layer in Track group; "Start / Finish" screen label at zoom ≥ 1.
2. **Mini-map** (`drawMini`): finish line + sector boundaries (detailed view only) in static buffer.
3. **Slowest corner pin** (`map.js`): `slowcorner` layer (purple dot + speed label). `data.js` stores `sum.slow_at` index.
4. **Default whole-track on compare** (`map.js` `resetAuto`): `fitView()` called when `S.CM.length > 0`.
5. **Per-car size** (`app.js`, `map.js`): `S.carScale = {}`. `drawCar` takes `userScale`. Sliders + Reset per car + "Reset all" in Camera section (detailed view).
6. **Loop focus dimming** (`map.js` `drawSpeedLine`): `LOOP_DIM = 0.18`. Two-pass draw: outside loop at dim opacity, inside at full.

### Phase 5 (COMPLETE) — tag: `phase-5`
1. **Auto-fit** (`telemetry.js`): `xr = [0, R.total]` on new run load. Zoom/pan still work.
2. **Step range input**: `<input id="teleRange">` + "Full lap" button above charts. Accepts `start–end`; bad input resets to full lap.
3. **Configurable section gap**: `sectGap` (default 100 m). Segmented buttons (25/50/100/200/500 m) above the sections table. Tab reads "`N` m sections".

### Phase 6 (COMPLETE) — tag: `phase-6`
1. **Side panel toggle** (`index.html`, `css/app.css`, `map.js`): `#sideToggle` button between `#mapwrap` and `#side`. CSS class `side-closed` on `#pm` hides `#side` and flips arrow glyph (`‹`/`›`). `#sectorLive` and `#lapDeltaBar` live in `#overlay` (always visible regardless of side panel state).
2. **Live sector table** (`map.js` `drawSectorLive`): `#sectorLive` div in `#overlay`. Columns: Sector | Time | Δ Ref. Live time shows for the current sector in italic/accent colour; locked once the sector completes. Delta cell background via `RV.deltaColor(delta, 2)` with `color:#fff` when visible. Reference: mean of loaded compared runs, or `bestBeforeId` sector times of the focused version.
3. **Lap delta bar** (`map.js` `drawDeltaBar`): `#lapDeltaBar` div below `#sectorLive`. Centered white bar, green fills left when ahead, red fills right when behind, saturates at 5 s. Focused car row is visually larger. Extra cars sorted by delta. Single helper `refSectors()` shared by both features.
4. Both new overlays registered in `OVER` array and controlled via the Layers > Panels panel like other overlays.

---

## Architecture

Static multi-file page under `viewer/`. No build step; loads directly in a browser (and from GitHub raw URLs).

| File | Purpose |
|---|---|
| `viewer/index.html` | Page shell, tab/overlay structure |
| `viewer/js/core.js` | Palette, clamp, bsearch, color scales (`colorScale`, `deltaColor`, `gearColor`) |
| `viewer/js/data.js` | Fetches/parses changelogs and run CSVs from GitHub or local folder |
| `viewer/js/app.js` | Page state (`RV.S`), selection, replay clock, tabs, view switch |
| `viewer/js/versions.js` | Versions tab: lap-time chart, table, rankings, detail panel |
| `viewer/js/map.js` | Track tab: canvas replay, camera, side panel, layers, HUD |
| `viewer/js/inputs.js` | Steering wheel and throttle/brake graph + vertical bars |
| `viewer/js/telemetry.js` | Telemetry tab: charts, section table, range input |
| `viewer/js/sectors.js` | Sector time helpers shared by Versions and Telemetry |
| `viewer/js/settings.js` | Settings / Help page |
| `viewer/js/tutorial.js` | Guided tutorial overlay |
| `viewer/css/app.css` | All CSS, fully token-based (light/dark themes) |

Global namespace: `globalThis.RV`. All modules attach to it.

---

## Remaining phases (do in order)

### Phase 7: Replay camera smoothing
**File to edit:** `viewer/js/app.js`

- In `tick()`: when `+$('spd').value <= 1` and `S.playing`, linearly interpolate the camera's world-to-screen position between the current step `S.i` and the next step `S.i + 1` using fractional `dt`.
- Snap immediately (no interpolation) on: `go()`, `setPlaying(false)`, speed change to > 1×, loop boundary hit, or any `hold` direction.
- The camera must **never** rest at a fractional position — all non-playing states must be at exact step positions.
- Note: the camera lives in `map.js` (`view` object). The smoothing fraction needs to be stored in `S` (e.g. `S.camFrac`) and read by `map.draw()`. Add a `RV.map.setCamFrac(f)` method.

### Phase 8: Versions tab bulk actions
**File to edit:** `viewer/js/versions.js`

- Add a `<div id="bulkBar">` with two buttons above the version table: **"Load all versions"** and **"Unload non-selected"**.
- "Load all": loops `S.ds.versions.filter(v => v.file && !v.sum)` and calls `S.ds.loadRun(id)` for each, showing a progress counter in `bulkBar`. Do not re-load already-loaded runs.
- "Unload": for every `v` where `!S.applied.includes(v.id)`, delete `v.sum`, `v.sec`, and clear from `S.ds.byId[v.id]` any heavy fields; call `RV.versions.render()` after. Show a toast with the count unloaded.

---

## Phase 9 (hosting) checkpoint — verify all of these before starting Phase 9

- [ ] Camera smoothing works at 0.5× and 1× (smooth), fails gracefully above 1× (no smoothing, snaps)
- [ ] Keybinds: Space play/pause, arrows step/hold, Home reset, Escape clears loop, F toggles follow
- [ ] Sector live table: times fill in as each sector completes; delta colors correct
- [ ] Lap delta bar: updates live, white at zero, colors shift correctly, multiple-car order works
- [ ] Bulk load shows progress; unload removes summary data; re-opening a run reloads it
- [ ] Loop focus dimming: driven line fades outside loop, clears on Escape
- [ ] Enabling change badges visible on applicable versions
- [ ] Throttle/brake bars animate in real-time during replay
- [ ] Per-car scale sliders work; reset restores true scale
- [ ] Configurable section gap: all 5 options produce correct section boundaries

---

## Phases 9–18 (summary)

Full spec in the original Race Runner ordered implementation list. Key notes:

- **Phase 9:** Convert/host on GitHub Pages (static is preferred; evaluate Streamlit only if something genuinely requires a backend). Parity check all Phase 1–8 features after conversion.
- **Phase 10:** User ID (`crypto.randomUUID()`), `localStorage` persistence for settings and defaults, Controls tab with key rebinding, Help > Data Format tab.
- **Phase 11:** Overlay framework (enable/disable, opacity, width) — build once, reused by Phases 14 and 16.
- **Phase 12:** Customization/themes tab in Settings. Basic (group shortcuts) + Advanced (per-element). Saved per user.
- **Phase 13:** Navigation cleanup, split crowded panels, reorganise Help.
- **Phase 14:** Comparison deltas, racing-line accuracy, sector health pins, problem corners in telemetry.
- **Phase 15:** Manual run/version entry window + CSV import with per-row validation.
- **Phase 16:** Draggable multi-track windows + resizable/minimizable HUD elements (same window component).
- **Phase 17:** General, Beginner, and Advanced tutorials (written last).
- **Phase 18:** 3D visualisation behind a feature flag (lowest priority).

**Constraint for all phases:** no private API keys in the repo; third-party services must have a free tier reachable by any user without the owner paying per use.
