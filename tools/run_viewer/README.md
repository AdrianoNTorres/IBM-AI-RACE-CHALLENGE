# Run viewer

A website for looking at a rule-based TORCS driver's recorded laps: every version's lap replayed on a 2D map of the track, with the car's sensor beams, the line it drove, rankings of the versions and telemetry charts.

It is a static site: plain files, no server code and no build step. It loads its data itself, from a GitHub repository or from a folder on your computer. It only reads; it writes nothing to the source.

## Running it

**Hosted.** Publish this folder (`tools/run_viewer/`) on GitHub Pages or any static host and open it. Nothing else is needed.

**On your computer.** Double-click `index.html`. No server is needed.

A browser does not let a page opened from disk read the files next to it, so in that case the page fetches the Corkscrew track file from this site's repository on GitHub instead (`RV.TRACK_URL` in `js/core.js`); it needs the network for the changelogs and runs anyway. If the site moves to another repository, change that address.

Serving the folder also works and uses the local copy of the track file: `python -m http.server 8000` in this folder, then `http://localhost:8000`.

## Where the data comes from

By default the page reads `https://github.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE`, branch `main`. Another source is chosen in **Settings**.

| Shown | Source file | When it is read |
|---|---|---|
| Version list, lap times, top speed, slowest corner, kept / rejected, the technical record | `CHANGELOG.md` (required) | when the page opens |
| Plain-language titles and texts (the basic view) | `CHANGELOG-simple.md` (optional) | when the page opens |
| Replays and charts | `runs/run_<date>_<time>.csv`, the first one each changelog entry names | when that run is opened or compared; kept for the session |
| Track outline | `track.xml` in the source (optional), otherwise the bundled `tracks/corkscrew.xml` (from GitHub when the page is opened from disk) | when the page opens |

Files come from `raw.githubusercontent.com`, which allows requests from other sites and has no hourly limit of 60 requests. The GitHub API is called only in two cases: to find out why `CHANGELOG.md` could not be read (repository missing or private, branch missing, file missing), and once when a source is applied in Settings, to check which run CSVs exist.

The full description of the data format is on the Settings page ("Data format"). In short:

- `CHANGELOG.md`: one entry per version, a heading `## vX.Y — Title` and a two-column table with rows `| **Field** | text |`. Fields read: Lap time, Top speed, Min speed, Damage, Decision (a ✅ means kept), and the texts.
- `runs/*.csv`: one row per simulation step. Required columns: `curLapTime`, `lastLapTime`, `distFromStart`, `speedX`, `gear`, `accel`, `brake`, `steer`, `trackPos`, `angle`, `damage`. Optional: `allowed`, `track0`–`track18`, `focA`, `foc0`–`foc4`.
- `track.xml`: the TORCS track file of the track the runs were driven on. Supplying it is the job of whoever owns the data. If a run does not fit the track in use (its longest `distFromStart` differs from the track length by more than 5 m), the Track tab says so and does not draw the run on a wrong map.

## What the page shows

Four pages, chosen in the top bar, and a **Basic view / Detailed view** switch.

**Versions.** Headline numbers, a lap-time chart across all versions and a table of them. The buttons above the table switch between all versions, the fastest laps, the biggest gains, the biggest losses and the highest top speeds. With a local folder, "Other recordings" lists CSVs that no changelog entry names (manual laps).

- **Selecting runs:** click a version to select it. To compare several (up to six), drag across the rows, or hold Shift and click to select everything between two rows, or hold Ctrl and click to add or remove one. Each selected run gets its own colour. The run clicked first is the car in focus: the map follows it and time gaps are measured against it.
- **Keyboard:** Tab to the table, arrow keys move between rows, Enter selects the row, Space adds it to or removes it from the comparison. On the chart, the left and right arrows step through the versions, `+` and `-` zoom, `0` resets.
- **Details:** the panel on the right shows what the last clicked version changed, why, and what was decided. Its buttons replay it on the track, open its telemetry, add or remove it from the comparison, or put it in focus. In the detailed view the technical record from `CHANGELOG.md` is folded underneath.
- **Chart:** filled purple dot = kept and a new best lap; filled green dot = kept but not a new best; purple ring = rejected although its single lap was faster; grey ring = rejected. The step line is the best kept lap so far. Selected runs are ringed in their colour.

**Track.** The replay. The car's path is coloured by speed (blue slowest, yellow fastest) and each sensor beam by its length (pink close, cyan far), with a dot where it meets the edge of the road.

- Drag to pan, mouse wheel to zoom, double-click to return to the car. Dragging takes over the camera: "Follow car", "Keep all cars in view" and "Car points up" switch off and the view stays where it was. While "Keep all cars in view" is on, zoom is automatic.
- Space plays and pauses. The left and right arrow keys move one step; holding one plays at 0.1x, then 0.25x, then 0.5x. `+` and `-` zoom, `F` toggles following, Home returns to the start.
- The side panel has the same three sections in both views: **Camera**, **Layers** and **Help**. The basic view shows the main switches. The detailed view adds the zoom slider and, under Layers, the groups Track, Car and path, Sensors, Compared runs and Panels on the map, one open at a time; every layer has a switch, a description and an opacity slider.
- Compared runs appear as cars and thin lines in their own colours. A Cars table at the top of the side panel lists them with lap time, gap and speed. Click a row there, a car on the map, or a name in the top bar to put that car in focus.
- The cars are drawn as car1-ow1, to scale; the front wheels turn with the recorded steering.

**Telemetry.** A summary of the selected runs and charts along the lap. Wheel zooms the distance axis, drag pans, click moves the car to that point. The detailed view adds more channels and a second section, "100 m sections".

**Sectors (detailed view only).** The lap is split into three sectors. Corkscrew is modelled on Laguna Seca, so it uses that circuit's official timing sectors, from IMSA's sector map: S1 4,514 ft 10 in, S2 4,793 ft 3 in, S3 2,508 ft 7 in (together the 2.238-mile lap). The TORCS start line is taken as the finish line and each boundary is placed at the same share of the lap: S2 starts at 1,379 m (on the straight before Turn 5) and S3 at 2,842 m (after Turn 9, Rainey Curve). A track without known sectors is split into thirds. The definition is `REAL_SECTORS` in `js/track.js`.

- The Telemetry page shows a Sectors table: the run in focus, the previous best and the difference per sector, and for each compared run its sector times and its difference to the run in focus.
- "Previous best" is the fastest kept version before the run in focus (for a recording that is not a version: the fastest kept version of all). Its recording is loaded in the background the first time it is needed.
- The details panel on the Versions page shows the same three sector times and differences for a version whose recording is loaded.
- The charts mark where S2 and S3 start, and the map has a "Sector lines" layer.

**Settings.** Theme (Light, Dark, System), the view, the data source, replay preferences, a reset, and the guide to the data format.

- **GitHub repository:** `https://github.com/owner/repo`, the same with `/tree/<branch>` or `/tree/<branch>/<folder>`, or `owner/repo`.
- **Local folder:** chosen with the browser's folder picker, or dropped on the Settings page. The folder is read in the browser and nothing is uploaded. Browsers do not keep folder access, so after a reload the page returns to the GitHub repository.
- A source is checked before the page switches to it. Without a `CHANGELOG.md` that has at least one version entry it is refused and the current source stays. The result says how many versions and run CSVs were found and whether a simplified changelog and a track file are present.

**Basic view and Detailed view.** The basic view uses the plain-language texts from `CHANGELOG-simple.md`, fewer numbers and the main controls. The detailed view shows the technical titles, all channels and all controls, in the same places. When a source has no simplified changelog the basic view cannot be selected and the switch says why.

Settings are saved in the browser (`localStorage`, key `rv_prefs`).

## Opening the page in a particular state

Options can be added to the address after `#`, joined with `&`:

| Option | Effect |
|---|---|
| `tab=pv`, `tab=pm`, `tab=pt`, `tab=ps` | open the Versions, Track, Telemetry or Settings page |
| `run=v1.05` | select that run |
| `cmp=v1.01,v0.96` | compare with those runs (comma-separated) |
| `frame=1539` | pause on that frame |
| `mode=basic`, `mode=detailed` | choose the view (`simple` and `adv` still work) |
| `all` | keep all selected cars in view |
| `fixed` | fixed map instead of "Car points up" |
| `zoom=12` | start at that zoom, in pixels per metre |
| `list=fast`, `gain`, `loss`, `top` | choose the ranking on the Versions page |
| `pause` | start paused |

Example: `index.html#tab=pm&run=v1.05&cmp=v0.96&frame=2440&mode=detailed`

## Files

| File | Role |
|---|---|
| `index.html` | The page's markup. |
| `css/app.css` | All styles. Colours are tokens (CSS custom properties) defined once per theme at the top. |
| `js/core.js` | Shared helpers, saved settings, theme, colour scales, messages. |
| `js/track.js` | TORCS track file to 2D outline, with the same arithmetic as TORCS. |
| `js/data.js` | Changelogs to the version list, a run CSV to a run object, the GitHub and local-folder sources, validation. No page code. |
| `js/app.js` | The page's state: open data set, selection, replay clock, tabs, view switch, start-up. |
| `js/versions.js`, `js/map.js`, `js/telemetry.js`, `js/settings.js` | One file per page. |
| `tracks/corkscrew.xml` | The Corkscrew track file from TORCS (GPL), the default map. |
| `legacy/` | The previous viewer (a page opened from disk plus `build.py`, which pre-built its data). Kept only as the reference the new code was checked against; not used by the site and safe to delete. `build.py` no longer runs from this location. |

The scripts are classic scripts sharing one global, `RV`, not ES modules, so that the page also opens from disk.

## Adding a map feature

Map features are entries in the `LAYERS` list in `js/map.js`. Each entry has an id, a group (`g`), a label, a one-line description (`d`), a default on/off state, a default opacity and a `draw(ctx, zoom)` function that draws in track coordinates (metres). A new entry gets its switch and opacity slider in the Layers section automatically. If the feature needs a new telemetry column, add it to `parseCsv` and `buildRun` in `js/data.js`.

## Accuracy

The rebuilt Corkscrew is 3,608.45 m long and closes on itself to within 0.013 m (the old `build.py` printed the same values rounded: 3608.5 m and 0.01 m). The ends of the recorded beams land on the drawn track edge to within about half a metre. The car's position comes from the recorded distance along the track, its sideways position and its angle to the track.

The browser code was checked against the old Python build for all 99 recorded versions: lap time, top speed, slowest corner, maximum track position and where it occurs, damage, braking and full-throttle share are identical, and positions agree to the old files' rounding (0.005 m).

## Status

Done: loading from GitHub at page load, local folders, the track outline in the browser, validation and error messages, light / dark / system themes including the canvases, the Settings page with the data-format guide, the Basic / Detailed views, the redesign, opening from disk without a server, sector times in the detailed view.

Not covered by an automated browser test: the browser's own folder-picker dialog and dropping a folder (the code beneath them was tested with real `File` objects and real directory handles); a GitHub rate-limit response; Firefox and Safari (tested in Edge only).
