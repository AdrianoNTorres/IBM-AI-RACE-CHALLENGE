# Run Viewer — Agent Handoff Document

**Branch:** `experimental_hosting`
**Last updated:** after Phase 14 (2026-10-07). **Next: Phase 15.**

---

## Start here

Phases 1 to 14 are built, tested, tagged (`phase-1` ... `phase-14`) and live at `https://adrianontorres.github.io/IBM-AI-RACE-CHALLENGE/`. What is left: **Phase 15** (manual entry and CSV import), **Phase 16** (track windows; the HUD part is mostly done), **Phase 17** (tutorials), **Phase 18** (3D). Their specification is `viewer/RACE_RUNNER_TASKS_ORDERED.md`; "What is left" at the end of this file says how each stands and what to watch for.

Read, in this order: this section; "What is left"; the phase you are about to build in `RACE_RUNNER_TASKS_ORDERED.md`; `tools/viewer-test/README.md`. Read the sections on finished phases only when you touch that code.

### How the work is done (agreed with the user; keep to it)

1. **One phase, then stop.** Build one phase, test it, commit, tag, push, report what to check, and wait for the user to try it. Do not start the next phase in the same turn. A phase with several parts (16, 17) may be stopped after each part if the user asks.
2. **The user's later word beats the specification.** Where the user has asked for something different on a built phase, that stands; the cases so far are listed under "Where the build differs from the specification". If the specification asks for something that overlaps with what exists, or you would build it differently, **say what you propose and wait for a yes** before building (the user asked for exactly this on 14.1).
3. **Test in a real browser before saying it works.** `tools/viewer-test/` drives the page in headless Edge; `node smoke.js` must pass after every change, and every new feature gets its own check **and a screenshot that you look at**. Test the page as it opens (newest version, nothing compared) as well as with a comparison: twice a feature passed its check and was invisible to the user there.
4. **Commit, tag, push after each phase** on the branch `experimental_hosting`: `git push origin experimental_hosting phase-N`. A push republishes the site (Actions, "Publish the run viewer"). **No Claude attribution** in commits or tags: before pushing, `git log --format='%an %ae%n%B' origin/experimental_hosting..HEAD | grep -ic "claude\|anthropic\|co-authored"` must print 0. Never commit `runs/*.csv` that are untracked (the user's manual laps), `.vscode/`, or the modified `.gitignore`.
5. **Change the `?v=` tag in `viewer/index.html`** (all script and stylesheet links) whenever a file changes, or browsers mix old and new files and the user sees a half-updated page.
6. **Say plainly what was and was not checked**, and what the user should look at. Report a test that failed, with the reason, also when the reason is the test.
7. Every colour is a token (`css/app.css` + `RV.theme.TOKENS`); every map drawing is a layer (`RV.map.addLayer`); every box over the map is a panel (`RV.map.addPanel`) and therefore a window; every setting is in `RV.prefs` or `RV.prefs.ui`. A feature that needs a private key goes through `js/keys.js`. Do not build a second way of doing any of these.
8. The site stays static (GitHub Pages, no server, no build step, classic scripts on the one global `RV`). Anything from outside must be free and reachable by other users later; nothing of the owner's is embedded.

### Where the build differs from the specification (on purpose)

- **Deltas** are always a time gap at the same point of the track. The **delta bar** is a solid green or red bar, not white-centred, and compares with the **fastest lap recorded**, not the previous best; the **live sector table** uses the same reference. The bars do not animate when they re-order.
- The **analysis** (pins, bands, line accuracy) compares with the fastest lap; the fastest lap itself with the next fastest.
- The **gear chart** is a step line without filled areas. On the charts, value-coloured lines are used with one run only; compared runs have one solid colour each.
- The **driven line** on the map runs red (slow) to green (fast).
- The **sector table and delta bar** sit under the overview map on the left; the colour keys are top right.
- **Theme selector**: Light, Dark, System and one "Custom" drop-down; previews across the top of the Customization tab.
- **Help** is a page in the top bar, not a tab of Settings.
- **HUD panels are already windows** (drag, resize by a corner grip, close, fold, back to place, only the car in focus): built during Phase 13 at the user's request, ahead of Phase 16.
- **Hosting** is static on GitHub Pages; Streamlit was not used. Settings are per browser (`localStorage`), not per account.

### Offered to the user and not decided

- Problem-area thresholds as a share of the lap time instead of fixed seconds (`K` in `js/analysis.js`), for data with larger gaps or another track length.
- A summary file (one JSON with every version's lap and sector times, written by the publishing workflow) so that sector data does not need every recording to be loaded. SQL was discussed and not recommended.
- Moving the site to the branch `main` (see Phase 9).

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
| `viewer/js/keys.js` | The reader's own API keys: services, storage, the dialog that asks for a key |
| `viewer/js/theme.js` | Every colour token, the Basic groups, themes, the colour picker, the Customization tab |
| `viewer/js/analysis.js` | Run in focus against the reference lap: line accuracy, sector health, problem areas, delta to compared cars |
| `viewer/js/help.js` | The Help page and the data-format guide |
| `viewer/RACE_RUNNER_TASKS_ORDERED.md` | The specification of all eighteen phases |
| `tools/viewer-test/` | The browser test harness (`server.js`, `h.js`, `smoke.js`, README) |
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
5. **Replay defaults** (Settings, Replay; `RV.prefs`): besides speed, autoplay and placement of compared cars, the camera a run opens with (`camera`: fit / follow / up, applied by `RV.map.startCamera`), smooth motion on or off (`smooth`), the default car size (`carSize`) and the dimming outside a loop (`loopDim`). Per-car sizes are saved (`RV.prefs.ui.carScale`).
6. **API keys** (`js/keys.js`, the shared system the spec asks for): `RV.apiKeys` holds the list of services and the features that depend on each, the reader's stored keys (`RV.prefs.apiKeys`, this browser only, kept by "Reset to defaults"), a check on start and on every change, `blocked(featureId)`, and `prompt(serviceId, featureId)`: a dialog with a help icon (steps and the provider's link), a masked field with Show, and a warning that lists what will not work if the reader skips. Settings has an API keys card (repository link, key masked / Show / Replace / Delete, each feature working or blocked). The first service is the reader's own GitHub token: `data.js` sends it to api.github.com and, when raw.githubusercontent.com has no such file, reads the file through the API, which is what makes a private repository readable. A refused token never breaks a public source. A later feature that needs a key adds itself to `SERVICES` and follows the three steps in the header of `keys.js`.

### Phase 11 (COMPLETE) — tag: `phase-11`
The overlay framework in `map.js`: every layer (`LAYERS`) and every panel (`OVER`) gets a switch and an opacity slider, a layer with a line width (`w`, defaults in `WIDTHS`) a width slider too, and all of it is saved and restored. New features register with `RV.map.addLayer({ id, g, label, d, draw(ctx, zoom), screen(ctx, w2s), w, cmp, still })` (a new `g` makes a new group; `still: true` layers are painted once into the track buffer) and `RV.map.addPanel({ id, label, d, draw(R, i) })` (the element is made in `#overlay` if missing). Phases 14 and 16 should add their pins and windows this way.

### Phase 12 (COMPLETE) — tag: `phase-12`
Customization and themes (`js/theme.js`, Settings > Customization).
1. **One central list**: every colour of the site is a CSS token in `css/app.css` and an entry in `RV.theme.TOKENS` (66 of them, each with a label and a sub-tab). The colours that were constants in the scripts became tokens (`--sp-1..5` driven line, `--beam-*`, `--scale-bad` / `--scale-good`, `--panel-*`, `--label-*`, `--helmet`); the only colour left in a script is the black of the loop dimming, which is a setting. A new colour: add the token to the stylesheet and to `TOKENS`, use `var(--token)` or `RV.pal[token]`.
2. **Themes**: `RV.prefs.themes` = `[{id, name, base: light | dark, colors: {token: colour}}]`, `RV.prefs.theme` = `light | dark | system | custom:<id>`. `RV.applyTheme` (`core.js`) sets the base, then the changed tokens on the root element, reads everything into `RV.pal`, rebuilds the scales and raises `RV.themeRev` (cached canvases compare it). The inline script in `index.html` applies a custom theme before the first paint. Built-in themes cannot be changed: the first change makes a copy ("My theme"). Themes survive "Reset to defaults".
3. **Basic and Advanced**: Advanced lists every token of a sub-tab. Basic lists `RV.theme.GROUPS`: one colour that writes several tokens (backgrounds, text, buttons, good / bad, the low and high end of each scale, one row per car, ...), so the two are always in sync and the theme stores per-token values only.
4. **Colour input**: preset swatches, a colour wheel with a brightness slider, and a typed value (HEX, RGB, HSL, names, rgba for see-through), in both modes.
5. Sub-tabs: Menus and UI, Track map, Overlays and panels, Telemetry and scales, Cars.
6. **Theme selector** (user, 2026-10-07): Light, Dark, System and one "Custom" drop-down that lists the reader's themes by name (`customSelect`), on the Settings tab and the Customization tab, so the row never grows.
7. **Previews** (user, 2026-10-07): a strip of cards across the top of the Customization tab, one per theme, each with three small windows (Versions, Track, Telemetry) drawn in that theme's colours; a click uses the theme. The classes `.th-light` and `.th-dark` (same rule blocks as the two token sets in `css/app.css`) give one element a whole built-in theme whatever the page's theme is; the card of the theme in use carries neither, so it follows the live colours.

### Phase 13 (COMPLETE) — tag: `phase-13`
Navigation and usability: crowded places were split into tabs, and Help became a page of its own.
1. **Help** is a top-bar page (`#ph`, `js/help.js`, `RV.help.open(subject)`): nine subjects in a list on the left (Start here, The pages, Selecting and comparing, Mouse and keyboard, Reading the colours, Using your own data, Data format, If something does not work, Links to a particular state), one shown at a time, and a search box that finds a word in all of them. The data-format guide lives here. `#help` and `#tab=ph` open it. The help texts are the `card(...)` calls in `cards()`; `NAV` says which cards make up which subject.
2. **Settings** (`js/settings.js`) has five tabs, `S.setTab`: `general` (Appearance, This browser, Reset), `replay` (When a run opens, On the map), `data` (Data source, API keys), `custom`, `controls`.
3. **Track side panel**: Camera, **Cars**, Layers, Sectors, Help. Cars holds the table of selected cars (a row puts that car in focus), the placement of compared cars and the size of each car; Camera is left with the camera. The panel's Help has a button to the full help.
4. **Telemetry**: Charts along the lap, Summary, Sectors, Sections are four tabs (`S.teleTab`; two in the basic view), so the charts start at the top of the page.
5. **Versions** (detailed view): "Lap times and versions" and "Sectors across versions" are two tabs (`S.verTab`).
6. A full top bar (many compared cars) clips its chips instead of widening the page (`grid-template-columns: minmax(0, 1fr)` on `body`).
7. The tour has eleven steps: Settings and Help are separate ones.
8. **Panels as small windows** (user, 2026-10-07; the first part of Phase 16's movable HUD, built early). Every panel over the map is wrapped in a `.win` (`map.js`, "the panels as small windows": `wrapPanel`, `placeWins`, `paintWin`). It can be dragged by any part of it and stays inside the map. Three buttons show while the mouse is over it, as on a Mac window: red closes the panel (back under Layers, Panels on the map), yellow folds it into a small tab that opens it again, green puts it back in its place at its normal size (user, 2026-10-07: green resets). A fourth, blue button limits the panel to the car in focus (only on panels that show several cars, and only while cars are compared: readout, overview map, colour keys, wheel and pedals, delta bar). Position (`L.pos`), folded (`L.min`) and focus-only (`L.solo`; for the wheel and pedals it is `opt.allInputs`) are saved with the layout and reset by "Restore the default layers". A grip at the bottom right corner resizes a panel (`L.scale`, 0.6 to 2.5, applied as CSS `zoom` on the panel so text, bars and canvases grow together; the canvases draw that much finer; double-click the grip for the normal size; also a Size slider under Layers). Still to do in Phase 16: track windows on the same component. The side-panel tab reads "Cars" without a count.

### Phase 14 (COMPLETE) — tag: `phase-14`
`js/analysis.js`: the run in focus against the reference lap: the fastest lap recorded (`RV.map.fastest()`), or, when the run in focus is that lap, the next fastest loaded lap (its previous best is read in the background), so the newest and fastest version, which is what the page opens on, has pins and bands too. `RV.analysis.of(R)` works everything out once per pair of runs and keeps it on the run (`R._an`); the thresholds are the constants `K` at the top of the file.
- **14.2 Racing-line accuracy**: the sideways distance to the reference lap's line at every point of the lap. The percentage is the average closeness, where 3 m away counts as 0 % for that point; mean, maximum and the share of the lap within 0.5 m are shown with it (readout row, Sectors side panel, Telemetry summary). Map layer "Racing-line accuracy" (green on the line, red furthest away; off by default) and "Line of the fastest lap" (dashed; off by default), both under Layers, Analysis.
- **14.3 Sector health and pins**: each sector green (up to 0.05 s lost), yellow (up to 0.25 s) or red; a dot per sector in the live sector table and a card in the Sectors side panel. Problem areas: the lap is examined in 25 m windows; windows that lose 0.010 s or more are joined, and areas that lose 0.04 s or more (red from 0.12 s) are kept, six at most. Each has a numbered pin on the map (layer "Problem pins", on by default); a click plays the area and the 50 m before it on a loop, with the rest of the map dimmed. The map asks `RV.map.onHit(fn)` handlers what a click does.
- **14.4 Problem areas on the charts**: every telemetry chart has a band over each area in the warning colour, with a numbered tag; a click on the tag opens a popup that says what the run does differently there (arrival speed, braking point, time on the brakes, slowest point, return to full throttle, exit speed, line), with buttons to loop it and show it on the track. `explain()` writes the sentences.
- **14.1 Comparison deltas** (confirmed by the user 2026-10-07; a delta is always a time gap at the same point of the track, "the way it is officially compared"). The time-gap chart, section table, delta bar and readout gaps existed already. Added: the map layer "Delta to the compared cars" (Layers, Compared runs; off by default): the focus car's line coloured by its time gap to the compared cars, green level, red largest, to their mean when there are several (`RV.analysis.cmpGap`), with an entry in the colour keys; and the "Compared cars" table above the telemetry charts: a tick per car that shows or hides it on every chart and counts it or not in the map delta (`S.cmpOff`, `RV.cmpShown()`, `RV.map.setCmp`; the same ticks are in the Cars tab of the track side panel), lap, lap delta, largest gap and where, and an opacity slider for the compared cars' lines (`S.cmpAlpha`).

**Also added on the Track page (user, 2026-10-07):**
- **Auto loop** button beside the playback buttons (`RV.prefs.autoLoop`): at the end of the lap the replay starts again by itself. With compared cars placed at the same lap time, the clock runs on (`S.over`) until the slowest has crossed the line (its lap time), then restarts.
- **Dragging on the map**: along the road it selects that stretch, which then plays on a loop with the rest dimmed (`trackAt`, `S.loopDraft`); beside the road (or with Shift) it moves the map. The map cannot be dragged away: some road always stays in the window (`keepInSight`); while any road is on screen the camera stays exactly where the drag puts it.

**The full specification is `viewer/RACE_RUNNER_TASKS_ORDERED.md`** (added 2026-10-07). Read the phase there before building it. Where the user has since asked for something different on a built phase, the user's later word stands: the delta bar is solid green or red and compares with the fastest recorded lap (not white-centred, not the previous best); the sector table uses the same reference; the gear chart has no filled areas; the colour keys are top right. **Work one phase at a time and stop after each for the user to test** (user, 2026-10-07).

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

## What is left

### Phase 15: manual run/version entry and import

A window for adding a version or a run by hand, and for importing several from a CSV. Read the phase in the specification; the points that are easy to get wrong:

- **Where the entries live.** The site only reads its source (a repository or a folder) and cannot write to it. Entered and imported versions therefore have to be kept in the browser and merged into the data set when it opens. `localStorage` is too small for recordings (a run CSV is close to 1 MB): use IndexedDB for them. Say this to the user before building: an entered version exists in that browser only, unless it is exported. Offer an export (the changelog entry as text and the CSV) so it can be put into the repository.
- **One validator module** that is used by manual entry and by CSV import, returns valid / warning (with what is missing and which features that affects) / blocked (with the reason), and never throws: wrap the parsing. The existing rules are in `js/data.js` (`parseChangelog`, `buildVersions`, `parseCsv`, `buildRun`, `REQUIRED`, `FIT_TOL`) and described in Help, Data format (`js/help.js`): reuse them, do not restate them.
- A version without a recording is a **warning** (listed, cannot be replayed, no sectors, no analysis); a recording that lacks a required column, has no rows of a lap, or does not fit the track is **blocked**.
- Result type is chosen with rounded selectable icons: kept, kept as an enabling change, enabling change later rejected, rejected. `data.js` reads "enabling change" only from a Decision that starts with it.
- CSV import of several runs: each validated on its own; a summary of valid, warned and blocked; blocked ones skipped with their reasons.
- New colours are tokens; the window should reuse the dialog look of `.keydlg` / `.keycard` or become the shared window component of Phase 16.

### Phase 16: multi-track windows

Done already: every HUD panel is a window (`map.js`, "the panels as small windows"): drag, resize, opacity, fold, close, back to its place, saved, reset by "Restore the default layers". **Left:** several track views as draggable, overlapping windows, each with its own layers (one by speed, one by brake), comparisons on the same track or on separate ones. `map.js` draws one canvas with one camera (`view`), one set of layer states (`LAYERS`) and one list of panels; a second track window needs those three to exist per window. That is a restructuring of `map.js`: propose the approach to the user first, and keep the single-window page working throughout.

### Phase 17: tutorials

The tour is `js/tutorial.js` (eleven steps, `STEPS`). Wanted: a chooser before step 1 and again at the end (general / beginner / advanced), a beginner tutorial (all features, simple, more depth) and an advanced one (all features, technical). Write them last, against the page as it then is; the Help page (`js/help.js`) has the current descriptions of everything.

### Phase 18: 3D

Lowest priority, highest risk. Behind a switch so it cannot break the 2D viewer. The track file has elevation that `js/track.js` does not read yet. Any 3D library must be free and loadable by other users without the owner's account. Propose an approach and its limits before building.

**Constraint for all phases:** no private API keys in the repo; third-party services must have a free tier reachable by any user without the owner paying per use.
