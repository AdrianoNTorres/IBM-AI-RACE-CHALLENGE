# Run Viewer — Agent Handoff Document

**Branch:** `experimental_hosting`
**Last updated:** after Phase 11 (2026-10-07)

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

### Phase 7 (COMPLETE) — tag: `phase-7`
1. **Camera smoothing** (`app.js`, `map.js`): `S.camFrac` (0–1) is set each tick to the fractional progress within the current step interval when `spd ≤ 1`. `map.js` `smoothCar()` linearly interpolates `R.x/y/yaw` by `camFrac`; the interpolated position and yaw feed the camera centre and rotation angle in `draw()`. `S.camFrac` is reset to 0 on `go()`, `setPlaying(false)`, `hold()`, scrub drag, loop boundary, and when `spd > 1`.

### Phase 8 (COMPLETE) — tag: `phase-8`
1. **Bulk load** (`versions.js` `wireBulk`): "Load all versions" button iterates `ds.versions` filtered to `v.file && !v.bad && !v.sum`, calls `ds.loadRun(id)` sequentially, shows `N / total loaded…` in `#bulkStatus`. Re-enables buttons and refreshes the table when done.
2. **Bulk unload** (`versions.js` `wireBulk`): "Unload non-selected" button clears `v.sum`, `v.sec`, `v.beams` and removes the entry from `ds.runs` for every version not in `S.applied`. Shows a toast with the count. Calling `ds.loadRun(id)` again re-fetches the run normally.
3. `#bulkBar` (`<div class="acts">`) with both buttons and status span is injected at the top of the render HTML, before `#vt`.

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

---

### Phase 9 (COMPLETE) — tag: `phase-9`
Published on GitHub Pages from the branch `experimental_hosting` by `.github/workflows/pages.yml`, which uploads `viewer/` as it is (static, no build). Live at `https://adrianontorres.github.io/IBM-AI-RACE-CHALLENGE/`. The stylesheet and scripts carry a `?v=` tag in `index.html`: change it whenever a file changes, or browsers mix old and new files. Moving to `main` later: merge, change the branch in `pages.yml`, point `RV.DEFAULT_LINK` and `RV.TRACK_URL` (`js/core.js`) at `main`, and allow `main` in the `github-pages` environment.

### Phase 10 (COMPLETE) — tag: `phase-10`
1. **Viewer ID** (`core.js`): `RV.prefs.uid`, a UUID from `crypto.randomUUID()` (own generator where that is unavailable), made on the first visit, shown under Settings, kept by "Reset to defaults", sent nowhere.
2. **Saved layout** (`RV.uiGet` / `RV.uiSet`, stored in `RV.prefs.ui`, written 250 ms after the last change): map layers, panels, path options and the open or closed side panel (`map.js` `saveUi` / `restoreUi`), side-panel tab and layer group, versions list and its kept-only boxes, telemetry tab and section gap.
3. **Controls tab** (`settings.js`): the eight replay actions in `RV.KEYS` (`core.js`) can each be given another key; changes are in `RV.prefs.keys`. `RV.keyAction(e)` maps a key press to an action; `app.js` and `map.js` `key(act)` act on it. A key in use is refused, Esc cancels. Help texts show the current keys through `RV.kbd(id)`.
4. **Data format tab**: the guide moved from the Settings tab to its own tab; Settings has four tabs (Settings, Controls, Help, Data format).

### Phase 11 (COMPLETE) — tag: `phase-11`
The overlay framework in `map.js`: every layer (`LAYERS`) and every panel (`OVER`) gets a switch and an opacity slider, a layer with a line width (`w`, defaults in `WIDTHS`) a width slider too, and all of it is saved and restored. New features register with `RV.map.addLayer({ id, g, label, d, draw(ctx, zoom), screen(ctx, w2s), w, cmp, still })` (a new `g` makes a new group; `still: true` layers are painted once into the track buffer) and `RV.map.addPanel({ id, label, d, draw(R, i) })` (the element is made in `#overlay` if missing). Phases 14 and 16 should add their pins and windows this way.

**The full specification of Phases 12-18 is not in the repository**: only the one-line summaries below. Ask the user for the "Race Runner ordered implementation list" before building them.

## Pre-Phase-9 audit (2026-10-07)

Phases 1-8 were checked in a headless browser against the working tree (106 versions, 100 recordings). Where this section and the phase notes above differ, this section is current.

**Must be done before hosting**

1. `viewer/js/sectors.js` and `viewer/js/tutorial.js` have never been committed, but the committed `index.html` loads them. As pushed, the page throws on start. Commit them with the rest of the working tree.
2. `RV.DEFAULT_LINK` and `RV.TRACK_URL` (`js/core.js`) point at the branch `experimental_hosting`. Point them at the branch the site is published from.
3. GitHub Pages serves a branch root or `/docs`; the site is in `viewer/`. Publish it with a Pages workflow that uploads `viewer/` (all its paths are relative, so a sub-path works).

**Fixed in the audit**

- A version's recording is now the CSV its Observed field names. Before, 42 versions (v0.43-v0.85) replayed the previous version's lap, because their Why field names that run first.
- Enabling-change badge: only a Decision that starts "Kept/Rejected - enabling change". Six versions that only mention the words lost the badge (7 remain).
- Lap delta bar: read from the reference run itself (`ds.loaded`, exact times). Before, the fastest lap showed up to +/-2.8 s against itself.
- Live sector table and delta bar are on a dark panel under the overview map (`#overlay`, which wraps into a second column in a low window); the colour keys moved to the top right. Before, they overlapped the colour keys, were unreadable in the light theme, and their Panels switches did not hide them.
- Both always compare with the fastest lap ever recorded (`S.ds.fastId` from `versions.js` `prepare`, `fastestRun` in `map.js`), loaded in the background, also while runs are compared (user, 2026-10-07). The focus car's delta bar is 20% larger.
- Wheel and pedals: one row per car (`inputs.js` builds `.incar` rows; the old ids `#wheel`, `#pedals`, `#barBrake`, `#barThrottle` are gone), the car in focus large, compared cars small; option `opt.allInputs` under Layers (user, 2026-10-07).
- Telemetry charts: value-coloured lines only with one run; solid per-car colours while comparing; the gear chart is a step line without the filled areas (user, 2026-10-07).
- Smoothing (`S.camFrac`) applies to every car, the beams, the speed label and the overview dots (`poseAt`, `ghostPose` in `map.js`).
- The whole-track view is applied when a comparison starts, not on every selection change, and not over a camera asked for in the address.
- Bulk load: progress and result survive a re-render; four at a time. Unload goes through `ds.unloadRun` and the reference recording loads again afterwards.
- Space is play/pause right after clicking a tab; the range field follows zoom and pan; the car-size rows are laid out; label widths are measured with the right font; a phone-width window no longer throws on every frame (`drawMini`).

**Differences from the phase notes above (earlier redesigns, kept)**

- `RV.deltaColor(delta)` returns solid green, solid red or null; the bar is filled whole, not from the centre.
- Loop dimming is a dark overlay outside the looped stretch of road (in `draw`), not a two-pass line.
- The replay pauses at the finish; the HUD no longer lists lap time, sector, gear and pedals.

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
