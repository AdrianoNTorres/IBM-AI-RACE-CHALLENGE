# Run Viewer — Agent Handoff Document

**Branch:** `viewer_no_login`
**Last updated:** after Phase 17.6 (2026-10-08). **Phase 18 (3D) is being built** (the user changed their mind the same day; see "Phase 18" below). Next: 18.2.
**Phase 19 (tag `phase-19`; user, 2026-10-08): the device note.** `js/device.js`: `RV.device.kind()` says phone, tablet or pc (touch screen as the main pointer, then the shorter screen side under 600 px = phone; `#device=phone` or `#device=tablet` in the address shows the note on any device). On a phone or tablet the note (`#devnote`) is shown once per kind (`prefs.deviceNote`), before the first-visit welcome; the same three lines are on the Help page (Start here, "Which device to use") for everyone. A PC gets no pop-up. Check: `node tools/viewer-test/device.js`. 19.1: two fingers pinch-zoom the map and every track window (`pincher()` in `js/map.js`; the canvases have `touch-action: none`, so the browser does not zoom the page there and a wheel was the only zoom before); checked with touch events in `device.js`. 19.2: a looped section is ended with "End loop", a button on the map (`#loopEnd`) and the same in the bar (`#loopChip`), because a phone or tablet has no Esc key; the message when a loop starts names the button (`RV.loopHint`).
**Phase 18, 3D, is wanted after all (user, 2026-10-08), PC first, phones and tablets later.** Three parts, one at a time: 18.1 elevation (done, tag `phase-18.1`), 18.2 a 3D map behind a 2D / 3D switch on the Track page, 18.3 an advanced first-person view (the driver's eye, drawn by the site from the track's geometry, with the sensor beams and overlays in the scene; TORCS itself cannot run in a page, and TORCS footage is at most an extra for the presentation). Drawn with the Three.js library (user: "let's import the library ... would look good on a resume"; third-party is fine for visuals), kept in the repository and loaded only when 3D is switched on, so the 2D viewer cannot regress. The 3D must show the elevation and the banking. Ask the user when information about the track or the look is missing.
18.1: `js/track.js` now also builds the height and banking the way TORCS does (`track4.cpp`): each sub-segment has `z0`, `z1` (m) and `b0`, `b1` (rad, + = left side higher); `RV.track.level(trk, s)` gives [height, banking], `RV.track.point(trk, s, off)` a point of the road surface `off` m left of the centre line, `trk.high` the same stations as `trk.centre`, `trk.zbox` the lowest and highest point. Corkscrew: -2.6 m (at 3,392 m) to 46.5 m (at 2,408 m), banking -7 to +6 degrees, the lap closes to 3 mm. Identical to the driver project's `tools/elevation.py` at every 10 m (`node tools/viewer-test/elevation.js`). Nothing on screen used it until 18.2.
18.2 (tag `phase-18.2`): `js/view3d.js`, `RV.view3d`. A bar over the map (`#v3bar`, top centre) switches 2D | 3D; 3D always starts off when a page opens. On the first switch Three.js (r160, `viewer/vendor/three.module.min.js`, see `vendor/README.md`) is loaded with a dynamic `import()`; the 3D canvas `#c3` is put where `#c` is and `#c` is hidden, so the panels, the track windows, the play bar and "End loop" work as before and the 2D drawing code is untouched. The scene is rebuilt from `RV.track.point()` (road, verges, slopes to a ground plane, edge lines, start line, sector lines, labels every 500 m) when the track, the height factor or the theme changes; colours are `RV.pal` tokens (`map-bg`, `road`, `road-edge`, `road-mark`), no new ones. The driven line is a strip coloured by speed (the Path colour switch is not followed yet). Cars: `RV.map.cars3()` (new export of `js/map.js`) gives every car shown with the same smoothing as 2D; each is set on the surface with its heading and the road's slope and banking. Cameras (user, 2026-10-08): Orbit (own mouse handling: drag, wheel, Shift-drag, double-click; "Turn about the car"), Chase (trails, wheel = distance), Relative (offset ahead / left / up in the car's axes, look at the car or ahead; "Cockpit" preset). Settings in `prefs.ui.v3`. Not in 18.2: the sensor beams and the map layers in 3D, the Path colour switch, 3D inside track windows, touch gestures (PC first), and **camera scripts** (the user wants to enter scripts that move the Relative camera for a cinematic playback: proposed as keyframes, not free JavaScript; needs the user's yes on the format). 18.3: the cockpit view with beams and overlays. Check: `node tools/viewer-test/phase18.js`.
**Not for this site (user, 2026-10-08):** the rule-status record (`docs/presentation/manual/rules.json` in the driver folder: what could get a version disqualified, the fallback versions) is for the presentation and the presentation website only. Do not show it here, do not publish it on this branch, do not propose it.
**Data:** the changelog and the recordings come from `main`; after every new driver version run `git checkout main -- docs/CHANGELOG.md docs/CHANGELOG-simple.md runs` (all three: without the simplified changelog the basic view has no text for the new versions), then `node tools/viewer-test/newdata.js vX.Y`, commit and push (done up to v1.31).
**The GitHub login, the Repository page and the security pass (Phases 15.1 and 15.2) are not on this branch** (user, 2026-10-07: to be polished later). They are on `experimental_hosting` (tags `phase-15.1`, `phase-15.2`), to be merged back in later; this branch is `phase-15` plus Phase 15.3 and what came after. **The site is published from this branch since Phase 16** (user, 2026-10-07): `.github/workflows/pages.yml` and `RV.DEFAULT_LINK` / `RV.TRACK_URL` (`js/core.js`) name `viewer_no_login`. If the first deployment is refused, the branch has to be allowed once under Settings, Environments, github-pages, Deployment branches (the owner does that on GitHub).

---

## Start here

Phases 1 to 17 are built, tested, tagged (`phase-1` ... `phase-17.6`) and live at `https://adrianontorres.github.io/IBM-AI-RACE-CHALLENGE/`. What is left: **Phase 18** (3D), skipped. Their specification is `viewer/RACE_RUNNER_TASKS_ORDERED.md`; "What is left" at the end of this file says how each stands and what to watch for.

Read, in this order: this section; "What is left"; the phase you are about to build in `RACE_RUNNER_TASKS_ORDERED.md`; `tools/viewer-test/README.md`. Read the sections on finished phases only when you touch that code.

### How the work is done (agreed with the user; keep to it)

1. **One phase, then stop.** Build one phase, test it, commit, tag, push, report what to check, and wait for the user to try it. Do not start the next phase in the same turn. A phase with several parts (16, 17) may be stopped after each part if the user asks.
2. **The user's later word beats the specification.** Where the user has asked for something different on a built phase, that stands; the cases so far are listed under "Where the build differs from the specification". If the specification asks for something that overlaps with what exists, or you would build it differently, **say what you propose and wait for a yes** before building (the user asked for exactly this on 14.1).
3. **Test in a real browser before saying it works.** `tools/viewer-test/` drives the page in headless Edge; `node smoke.js` must pass after every change, and every new feature gets its own check **and a screenshot that you look at**. Test the page as it opens (newest version, nothing compared) as well as with a comparison: twice a feature passed its check and was invisible to the user there.
4. **Commit, tag, push after each phase** on the branch `viewer_no_login`: `git push origin viewer_no_login phase-N`. A push republishes the site (Actions, "Publish the run viewer"). **No Claude attribution** in commits or tags: before pushing, `git log --format='%an %ae%n%B' origin/viewer_no_login..HEAD | grep -ic "claude\|anthropic\|co-authored"` must print 0. Never commit `runs/*.csv` that are untracked (the user's manual laps), `.vscode/`, or the modified `.gitignore`.
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

### Offered to the user and decided

- Problem-area thresholds as a share of the lap time, and the summary file: **built** (Phase 15.3, user 2026-10-07).
- Moving the site to the branch `main` (see Phase 9): **not now** (user, 2026-10-07: "leave the site in experimental_hosting for now").

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
| `viewer/js/validate.js` | The one validator of entered and imported versions and recordings: valid / warning / blocked |
| `viewer/js/local.js` | Versions kept in this browser (IndexedDB), their changelog text, the zip export |
| `viewer/js/entry.js` | The "Add versions" window: one version, import files, the versions kept in this browser |
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

### Phase 15 (COMPLETE) — tag: `phase-15`
Versions entered by hand and imported (Versions, "+ Add versions"; also Settings, Data). Check: `node tools/viewer-test/phase15.js`.
- **Storage** (`js/local.js`, agreed with the user): the site cannot write to its source, so entered versions are records in IndexedDB (`rv_local`: store `versions`, one record per version; store `csv`, the recording's text, read only when the run is opened), per source (`RV.local.keyOf(src)`: the repository whatever its branch, or the folder's name). Memory only where the browser gives no database. `data.js` `openSource` reads the records of the source, turns each into changelog text (`RV.local.entryText`) and parses that with the normal parser, so an entered version takes exactly the path of a repository one; it then marks it `v.local` and takes its recording from the store. `ds.local` (id to record) and `ds.localStale` (records whose name the repository has meanwhile: not shown, offered for deletion). `openSource(src, { reuse: ds })` builds the data set again without fetching anything and keeps the loaded runs: used after every add, change or delete (`entry.js` `refresh`).
- **Validator** (`js/validate.js`, `RV.validate`): `recording(text, trk)`, `version(d, ctx)`, `table(text)`; each returns `{ level: valid | warning | blocked, blocks, warns: [{what, affects}] }` and never throws. It calls `RV.data.buildRun`; it does not restate the format. What is a warning and what blocks is in `OPTIONAL` and the `warn()` / `block()` calls. **Names (user, 2026-10-07): a new version must be newer than the latest one, by its numbers (`cmpId`); after v1.06 both v1.06.1 and v1.07 are fine; an existing name is blocked, an entered version never replaces one.** The slowest corner taken from a recording is rounded and the top speed cut, as the project's changelogs do.
- **The window** (`js/entry.js`, `RV.entry.open('one' | 'import' | 'mine')`; the `.keydlg` / `.keycard` look, wider). One version: a form; the result is four round icons (`RV.validate.RESULTS`: kept, kept as an enabling change, enabling change rejected, rejected; each knows how its Decision is written); a warning needs the tick "Enter it anyway"; blocked cannot be saved. Import files (user: both kinds): several CSVs at once; a run CSV is a version with that recording, a table (a column `version`; template in the window; `,` `;` or tab) is one row per version and takes the recordings it names from the same choice of files; each row is checked on its own against the versions that exist and the rows above it, with a summary, a tick per incomplete row, blocked rows skipped and left on the list. In this browser: the list, **export of the ticked ones or of all** (user) as a zip written in the page (`docs/CHANGELOG-additions.md`, `runs/*.csv`, `versions.csv` that can be imported again, README), change, delete (asks again).
- A recording is stored under its own name only if that is a `run_<digits>_<digits>.csv` no version uses; otherwise it gets a name made from the time, so an export can never overwrite a file of the repository.
- `RV.entry.setRecording(name, text)` and `RV.entry.addImport([{name, text}])` do what the file chooser does: the tests use them, since a headless browser has no file dialog. **Not tested: the real file chooser and dropping files on the window; the download itself** (the zip's bytes were read back from the page and verified with Python's `zipfile`).
- Help, Data format has a tab "Entered by hand"; the Versions table and the details panel show the badge "Local".

### Phase 15.3 (COMPLETE) — tag: `phase-15.3`
The two things offered earlier that the user asked for (2026-10-07). Check: `node tools/viewer-summary/build.js`, then `node tools/viewer-test/summary.js`.
- **Analysis limits as a share of the lap** (`js/analysis.js`): `K.healthOk`, `healthWarn`, `winLoss`, `zoneLoss`, `zoneBad` are thousandths of a per cent of the reference lap's time; `limits(ref)` turns them into seconds, kept on the result as `A.lim` and used for every text that names a limit. On the 73 s lap they are the seconds they were (0.05, 0.25, 0.010, 0.04, 0.12): v1.05 has exactly the same problem areas as before.
- **The summary** (`viewer/summary.json`, not in Git): written by `tools/viewer-summary/build.js`, which runs the viewer's own `core.js`, `track.js` and `data.js` in Node, so its lap and sector times are the page's own to the last digit. The publishing workflow runs it before uploading (`continue-on-error`: without it the site works as before) and is now also triggered by `docs/CHANGELOG.md`, `runs/**` and `track.xml`. `data.js` `readSummary` takes it only for the repository, branch and folder it was made from, never for a page opened from disk; a version uses its entry only while it still names the same recording (`v.pre`, and from it `v.sec`, `v.beams`). **`v.sec` no longer means the recording is loaded: `v.sum` does.** (One table assumed the first and threw; found by the test, fixed.)
- What it gives: the best theoretical lap over all 100 recordings as the page opens; sector times in the details of a version that was never opened; on Versions, Sectors across versions, the tick "Every version, not only the opened ones" (`S.secAll`). The narrow table on the Track page stays with the opened versions.
- **Not checked: the workflow run itself** (the step was run by hand on this machine; on GitHub it runs on Linux with the Node that the runner has).

### Phase 16 (COMPLETE) — tag: `phase-16`
Track windows (approach proposed and agreed 2026-10-07: the main map stays, extra views float over it). Check: `node tools/viewer-test/phase16.js` (it writes `phase16-*.png`).
- **What the reader gets:** "+ Track window" at the top of the Track side panel opens another view of the same replay in a window over the map (four at most), with its own camera, layers, path colour (a new one starts on braking where the main map is on speed) and cars. The row "Settings of" beside the button, a click on a window, or a click on the main map chooses which view the side panel shows and changes; the chosen window has the accent frame. A window is moved by its title, resized by the grip (width and height, not a scale), folded into a tab (yellow), closed (red), put back (green), faded (Camera tab, Opacity), and saved with the layout. Inside it: drag moves its map, the wheel zooms, a double-click follows the car, a click on another car puts that car in focus.
- **Comparing on one track or on separate ones:** Cars tab, "Cars on the main map" (all, or only the car in focus) and per window "Cars in Track N" (all, or one named car); "One window per car" keeps the car in focus on the main map and opens a window for every compared car; "All cars on one track" undoes it (windows the reader has since changed stay).
- **How it is built (`js/map.js`, "more than one view of the track" and "the track windows"):** the main map and each window is a *target*: `{ c, g, buf, bg, view, opt, lay, car }`. The drawing code, the camera code and the side panel work on "the current target", which is module state: `c`, `g`, `buf`, `bg`, `view`, `opt` (now `let`) and the `on` / `alpha` / `w` of every layer. `enter(T)` puts a window's state there, `leave()` takes it out again and keeps what changed; always through `inWin(T, fn)`. `scene(W, H, r, pose)` paints the current target; `draw()` calls it for the main map and `drawWins()` for each window. The thirty layers were not touched, and a layer added later with `RV.map.addLayer` works in windows without doing anything.
- **Things to know before changing it:** (1) the side panel's controls go through `act(fn)` (in `toggleRow`, `slider`, `segs`): a new control that changes `view`, `opt` or a layer must too, or it changes the main map while the panel shows a window. (2) `saveUi`, `legend` and `buildSide` asked for while a window's state is in place are postponed until `leave()` (`late`). (3) `OPT0.allInputs` (wheel and pedals of every car) belongs to the main map only. (4) A window on one car that is not the car in focus is painted with `S.R`, `S.i`, `S.sel` swapped to that car for the duration (`carFor`), so every layer treats it as the car in focus; `others()` is empty where a target shows one car. (5) A camera function kept from a frame (`cam`, `T.cam`) reads `view` when it is called, so call a window's inside `inWin`. (6) The colour steps of a run's line are cached per colouring (`r._bk.speed`, `r._bk.brake`).
- **Tests reach it through `RV.map.wins`:** `list()`, `add(o)`, `close(n)`, `pick(n)` (0 = main map), `picked()`, `mainCar()`, `perCar()`, `oneTrack()`, `at(n, x, y)`.
- **Left out on purpose (said to the user before building):** dragging along the road to make a loop and clicking a problem pin work on the main map only; the HUD panels belong to the main map and are not repeated per window; a folded window cannot be dragged (open it first); on a phone-width window the track windows are hidden like the other panels.
- **Not tested:** touch input; more than two compared cars with "One window per car"; the first GitHub Pages deployment from `viewer_no_login`.
- Where new windows open: to the right of the panels in the left column (`freeLeft`). With three cars compared the per-car windows overlap the top of the wheel-and-pedals panel on a 1500 px wide screen: the reader moves them, and the places are saved.

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

### Login with GitHub, so that entered versions reach every device (asked for by the user during Phase 15)

The user wants a login page with GitHub as the recommended login, so that an entered version is uploaded to the repository directly instead of exported and pasted. Told to the user: a static site cannot do a password login or the usual "Sign in with GitHub" button by itself (the OAuth exchange needs a server that holds a secret, and GitHub's device flow does not answer a browser); what works without a server is the reader's own GitHub token with write access (the key system of `js/keys.js` already stores one), and a real OAuth button needs a small free relay (for example a Cloudflare Worker) that the owner would host. **Not decided: which of the two, and whether "Publish" commits to the branch or opens a pull request. Ask before building.** The pieces are ready: `RV.local.entryText(rec)` is the changelog entry, `RV.local.csv(key)` the recording, `ds.localStale` handles the copy left in the browser once the repository has the version. Publishing means: read docs/CHANGELOG.md through the API, insert the entries before the closing "Last updated" line, put the CSVs under runs/, as one commit (Git Data API: blobs, tree, commit, update ref).

### Phase 17: tutorials

**Done (tags `phase-17` to `phase-17.6`).** `js/tutorial.js` holds one engine and three step lists (`TOURS`): `general` "Quick tour" (14 steps), `beginner` "First lap" (28), `advanced` "Full telemetry" (30, runs in the detailed view and puts the view back). `RV.tutorial.start(welcome, id)`. The first and the last card of the quick tour offer the other two (`.tour-offers`); Help, Start here has a button for each. Ending any one sets `tutorialDone` (user, 2026-10-08). On the Track page the steps go down the left of the map, along the bottom, then down the right, and each tutorial has a step that shows a section played on a loop (`loop`; user, 2026-10-08: the eye must not hunt back and forth, and looping a section must be shown in all three). Each tutorial also has a step on the window buttons (close, fold, back to place, resize by the corner), which keeps them in sight (`bar`; user, 2026-10-08). **The tutorials are live (17.2; user, 2026-10-08):** `#tour` lets every click through, only the card catches them and it can be dragged; keys go to the page, so the tutorial is driven by its buttons only (no Esc, no arrows). At the start `rv_prefs` is copied; at the end (`putBack`) the copy is written back and the page reloads on the page and versions it was showing (options put in the address, removed again after loading). So a tutorial may change anything that is stored in `rv_prefs` or rebuilt on load; "+ Add versions" is switched off while one runs because entered versions live in IndexedDB. What the reader closed is opened again by `prepare()` for the step that needs it (the view, the page, the side panel, a closed or folded panel through `RV.map.showPanel`, the sub-tab); a new kind of thing a step points at needs its case there. 17.4, after a review by four agents (first-time viewer, race engineer, fact-check against the code, interaction tester): step texts corrected; nothing on the page changes before the first step (`stage()`), so leaving at the welcome changes nothing; a reload or closed tab mid-tutorial writes the copy back (`pagehide`); with a local folder as the source there is no reload (`putBackInPlace`: settings and view only, layers and windows stay until the next load); the card scrolls on a touch screen and is dragged with a mouse only. 17.5 (user, 2026-10-08, on the engineer's review): in Full telemetry the Telemetry page comes before the Track page, and the Readout and Transport steps are dropped as obvious to an advanced reader (what they said that is not obvious moved into "The replay"); 17.6 (user, 2026-10-08): the Overview map and Wheel and pedals steps dropped too, and the four Settings steps merged into one card (the tutorial is live, the reader clicks through the tabs); Full telemetry has 24 steps. The quick tour and First lap keep every step. In the browser test the settings must be stored first and the page opened with `keep: true`, or `h.js` writes its own settings on the reload. A step may press a sub-tab first (`click`, `sideTab`), is never left out (17.3; user, 2026-10-08: a part the data has nothing for is still described, so the reader knows it exists): its card then sits in the middle without a highlight and carries the line `ABSENT`. The names are working names the user may change (`TOURS[..].name`, used everywhere through `RV.TOUR_NAMES`). When a feature changes, change its step in all three lists; `node tools/viewer-test/phase17.js` fails on a step that points at nothing.

### Phase 18: 3D

Lowest priority, highest risk. Behind a switch so it cannot break the 2D viewer. The track file has elevation that `js/track.js` does not read yet. Any 3D library must be free and loadable by other users without the owner's account. Propose an approach and its limits before building.

**Constraint for all phases:** no private API keys in the repo; third-party services must have a free tier reachable by any user without the owner paying per use.
