# Race Runner: Ordered Implementation List

**Purpose:** Source material for the next Claude agent to turn into an execution prompt.
**Ordering rule:** Top = easiest / foundational. Each phase should not break on a later one. The 3D work is intentionally last (lowest priority, highest risk, likely long debug time).

## Instructions for the agent
- Work phase by phase, top to bottom. Finish and verify one phase before starting the next.
- **Phases 1 to 8 are built and tested on the local machine only.** Do not add hosting, accounts, or persistence work during those phases.
- **Phase 9 is the conversion/hosting step.** It happens only after the local feature set from Phases 1 to 8 works.
- Phases 2 and 11 build **shared systems** (color scale utility, overlay system). Build them once and reuse them everywhere. Do not duplicate logic per feature.
- Anything with a "customizable" angle (colors, opacity, width, enable/disable) should read from the settings/theme system once it exists (Phases 10 to 12). Until then, use constants that are easy to swap out.
- Tutorials (Phase 17) are written last on purpose, so they describe the finished feature set.

## Hosting constraint (applies to every phase)
- Third-party APIs, applications, services, and libraries are acceptable **as long as they are free and remain accessible to other users in the future** (not tied to the owner's personal paid account). If a service needs a private API key, each user supplies their own; the owner's key must never be embedded in the app or committed to the repo. See "User-supplied API keys" below.
- Prefer options with a free tier that public users can reach without the owner paying per use. Flag anything with usage caps or likely to become paid.

## User-supplied API keys (applies whenever any feature needs a private key)
Build this once as a shared system, and reuse it for every key-dependent feature. Ideally it is in place by Phase 9, when the first external service is introduced.

1. **Prompt for the key.** If a feature needs a private key, the site prompts the user to create one and enter it.
2. **Help icon.** The prompt has a help icon that explains how to get the key (step-by-step, with the provider's signup/key page link) for users who get lost.
3. **Warning on skip.** If the user doesn't enter a key, warn them that parts of the site won't work as intended, and **list exactly which features are affected and why**.
4. **Availability checks.** Run checks (on load and whenever the key changes) to detect which features can't be used without the key.
5. **Disabled-but-visible state.** Unusable features stay **visible but greyed out / blocked**, not hidden.
6. **Re-prompt on click.** Clicking a blocked feature **re-prompts the user to enter the key**.
7. **Settings entry.** The key can also be entered and edited in **Settings** (a dedicated API Keys section), alongside the **GitHub link** (repo link) for reference.
8. **Storage and safety.** Keys are stored per user only (see Phase 10 persistence). They are never committed to the repo, never shown in plain text after entry (mask with a reveal toggle), and the user can clear/delete them.

---

## Phase 1: Text, label, and trivial UI fixes (lowest risk)

1. **Telemetry label:** change "Part of the lap at full throttle" to **"% of the lap at full throttle"** in the Basic view. In the Detailed view, replace the bare "full throttle" with the same "% of the lap at full throttle".
2. **Remove the clutch** from the wheel and pedals HUD (clutch isn't recorded).
3. **"Doing" status in Basic and Detailed views:** the user likes the doing status in the Basic view. Add it to the Detailed view too, placed near the top, directly under the version number. The Basic view should use this same location, so the status sits directly under the version number in **both** views.
4. **Versions tab status for "kept" results:**
   - A kept result that was an enabling change should **not** be green. Use **yellow / a warning color** and read **"enabling change"**.
   - If it was an enabling change but **rejected**, still read as an enabling change, but **grayed out** like other rejected entries.

---

## Phase 2: Shared red/green color-scale system (build once, reuse everywhere)

Create one shared color utility (value, min, max, direction -> color). Later phases (deltas, line accuracy, sector indicators, themes) all reuse it.

**Rules:**
- **All lap deltas:** green if faster, red if slower.
- **Versions tab:** lap time by version follows the same green/red.
- **Track tab speed line:** red-to-green format.
- **Telemetry:**
  - Throttle: green (max) to red (min).
  - Brake: red (max) to green (min), reversed.
  - Steering and track position: green toward 0, red approaching +-1.
  - Gears: **area under the line filled in**, using custom sequential colors for gears **-1 through 6**.

---

## Phase 3: Small HUD addition

- Add **two vertical bars** between the steering wheel and the throttle/brake history HUD.
  - One for **brake** (fills **red**), one for **throttle** (fills **green**).
  - Fill level is driven by the **step's value**.

---

## Phase 4: Track map visual markers

1. **Finish line / Sector 1:** show a clear marker at the start of the track.
2. **Left-side track map (on the tab itself):** add a visual finish line and **sector locations**.
3. **Slowest corner pinpoint:** mark the slowest corner on the track.
4. **During comparison runs:** default the camera to the **"whole track" view** instead of "keep cars in view".
5. **Per-car size adjustment:** the user can adjust the **size of each car individually** (the focused car and each compared car get their own control). Include a **reset button that returns the car to true scale** (one per car, plus an optional "reset all"). Keep the control easy to reach from the replay view.
6. **Loop focus dimming:** when a selected area is looped, **only that area is shown at full strength** and the **rest of the map is faded out**. This applies to any loop, including a drag-selected range and, later, pin loops (Phase 14.3).
   - Interpreted as "opaque" meaning dimmed/see-through (the user's wording). The faded portion should still be faintly visible for orientation, not removed entirely.
   - The fade level should be a constant that is easy to change now, and an adjustable setting once the overlay system exists (Phase 11).
   - Return the map to normal when the loop is stopped or cleared.

---

## Phase 5: Telemetry panel improvements

1. **Section gap selector:** replace the fixed 100 m sections with a **user-selectable gap**. The list must always include **0 and the very end** of the track, even when the end isn't an exact multiple of the gap.
2. **Auto-fit sizing:** the telemetry should auto-size so the **entire track's data is visible without scrolling**. Manual zoom and pan stay available afterward.
3. **Step range input:** let the user type a range of steps to set the visible range manually.

---

## Phase 6: Track tab side panel and sector timing table

1. Keep the **sectors in the right-side panel as they are**, but add the option to **close** that side panel.
2. Add a **sector time table**:
   - Always displayed **under the panels on the map**, specifically under the **overview map**.
   - Shows the **live current time**; when a sector completes, its sector time is filled in.
   - Also shows the **delta** for each sector. The **background of that column's table cell** is colored **green if faster, red if slower** than the reference. The colors come from the shared Phase 2 color utility, and become **user-selected theme colors** once Phase 12 exists.
   - **Reference for the delta:** the **previous best** sector time, or the **comparison runs** when a comparison is active (mean if multiple are selected, matching Phase 14.1 behavior).
   - Remains visible even when the right side panel is closed.
3. **Lap delta bar:** on the **left side, directly under the sectors**, add a bar showing the **delta of the entire lap time vs the best time**.
   - **White** at 0 difference, shading to **red** the further behind, and to **green** when ahead.
   - The color **fades gradually with the size of the delta** (a small gap is a pale tint, a large gap is a strong color). Define a configurable "full color" delta (e.g. a number of seconds), with a sensible default.
   - Updates live as the lap progresses, and shows the final delta when the lap completes.
   - Uses a white-centered (diverging) variant of the Phase 2 color utility. Add that mode to the shared utility rather than building a separate one. Colors become user-selected theme colors once Phase 12 exists.
   - "Best time" follows the same reference as the sector table: the previous best, or the comparison runs when a comparison is active.
   - **Focused car by default:** when multiple cars are running, the bar is based on the **focused car**.
   - **Multiple bars option:** add an option to display **multiple delta bars, one per selected car**.
     - **Order:** sorted by each car's **final lap time**, fastest at the top.
     - **Focused car exception:** the focused car's bar is **larger than the others** and **ALWAYS stays at the top**, regardless of its lap time. The remaining bars follow in fastest-to-slowest order beneath it.
     - Each bar is labeled with its car, and uses the same white/red/green fade.
     - If the focused car changes, the new focused car moves to the top and enlarges, and the order of the rest is recalculated.
     - If a car's final lap time isn't known yet (lap in progress), place it by its current running time and re-sort when it finishes. Re-sorting should not make bars jump around distractingly, so animate or throttle the reordering.

---

## Phase 7: Replay camera smoothing

- "Keep cars in view" is choppy because the camera teleports to each step. Add a **smoothing/interpolation function** for camera follow.
- **Rules:**
  - Smoothing applies **only when playing at 1x speed and below** (e.g. 0.5x, 0.25x). Above 1x, no smoothing.
  - On **pause, next/prev step, or set step**, the camera must **snap** to that exact step.
  - If playback is **paused or interrupted between steps** (including a speed change above 1x, a loop change, or any other interruption mid-smoothing), the camera must **jump to the nearest step** rather than stopping partway.
  - The camera must **never rest in a mid-smoothing position** between steps.

---

## Phase 8: Versions tab bulk actions

- Add a **"Load all versions"** button: loads all versions for all tools needed across tabs.
- Add a matching **"Unload"** button.

> **Checkpoint before Phase 9:** everything in Phases 1 to 8 should work correctly on the local machine. Record a short list of the behaviors to re-verify after conversion (camera smoothing, keybinds, live sector table, bulk load/unload, etc.).

---

## Phase 9: Hosting decision and conversion (happens only after local features work)

**Goal:** convert the working local app so it can be hosted publicly for free from the GitHub repo.

- Current plan: convert to a **Streamlit** app, since it's free to run from a public GitHub repo.
- Agent should evaluate and recommend before converting:
  - **Streamlit Community Cloud:** free for public repos. Caveat: its rerun-on-interaction model is awkward for a real-time replay, camera smoothing, custom keybinds, and drag-and-drop windows. These likely need a custom JS component (`st.components`).
  - **Static hosting** (GitHub Pages / Cloudflare Pages / Netlify): if the viewer is mostly front-end, this is simpler and free, and the user ID can come from `crypto.randomUUID()`.
  - **Persistence options for Phase 10:** browser storage (`localStorage` / `IndexedDB`: no backend, but per-device only) versus a free hosted DB (e.g. Supabase / Firebase free tiers) keyed by the user ID (works across devices). Must satisfy the free + future-accessible constraint above.
- Deliverables:
  1. A short written recommendation of the chosen approach and why.
  2. The converted app deployed and reachable.
  3. A **parity check** against the Phase 1 to 8 checkpoint list. Fix any regressions the conversion introduced before moving on.

---

## Phase 10: Persistence, user identity, and Settings restructure

(Depends on Phase 9.)

1. **User ID + saved data:** generate a unique hash ID per user. Persist user info and settings so they survive closing and reopening the site.
2. **Replay default settings:** currently only *speed, start when playing, and compared cars* have defaults. Add **all applicable replay values** with settable defaults (including per-car sizes from Phase 4, which should also persist).
3. **Settings > Controls tab (new):** a separate Controls tab that also lets users **rebind keys**.
4. **Move data format info:** it currently lives in Settings. Move it to its own tab in the **Help** section.
5. **Settings > API Keys section (new):** entry/edit/clear for user-supplied keys, the repo's GitHub link, and per-feature status (working / blocked). Follows the "User-supplied API keys" rules above. Keys are saved per user ID.

---

## Phase 11: Overlay system (shared foundation for the analysis features)

- **Every overlay** follows one consistent formatting scheme: enable/disable, **transparency, width**, and similar options.
- Build this as a single reusable framework. Deltas, line accuracy, sector pins, and per-tab overlays (Phases 14 and 16) plug into it.

---

## Phase 12: Customization / themes

(Depends on Phases 10 and 11.)

- Add a **Customization tab in Settings**.
- The user can change the color of **everything** on the site and save it as a **custom theme**. Themes are saved **per user ID**.
- **Basic and Advanced sections:** the Customization tab has two modes.
  - **Basic:** groups related things together so the user changes many at once, e.g. all buttons, all backgrounds, min/max (low-to-high) scale colors, text, accents, etc.
  - **Advanced:** lets the user customize **EVERYTHING** individually, down to each separate element.
  - Basic settings are shortcuts that set groups of Advanced values, so the two always stay in sync. A user can start in Basic and fine-tune in Advanced, and the saved theme stores the full per-element values.
  - Every themeable color in the app must be registered in one central list so Advanced truly covers everything and Basic groups are built from it.
- **Color input methods:** preset swatches, typed values (**HEX, RGB, etc.**), and a **color wheel**. Available in both modes.
- Organize into **sub-tabs**: Menus/UI, Overlays, Telemetry, etc. Sub-tabs apply within both Basic and Advanced.

---

## Phase 13: Navigation and usability pass

- Make the site easier to navigate. **Split crowded panels/windows into more tabs** and add new tabs where needed.
- **Clean up the Help section.** It currently feels cluttered, so reorganize it for findability (it also hosts the new Data Format tab from Phase 10).

---

## Phase 14: Analysis features (build on the shared color utility and overlay system)

### 14.1 Comparison deltas
- Option in compared runs to **show deltas between comparisons**, implemented as **overlays**.
- Delta follows the **focused car's line** and compares it to the others.
  - If multiple comparisons are selected, use the **mean**.
  - Allow comparing against **specific cars** chosen from the already-selected batch.
- Color: **green = 0 difference, red = largest difference**.
- Add a **delta comparison table in the Telemetry** panel.
  - Select/deselect comparisons for **all** telemetry data.
  - Adjustable **opacity**.

### 14.2 Racing-line accuracy
- Show a **percentage** for how close the car is to the **perfect racing line / best lap available**.
- Add an extra **path overlay**: green = on the line, red = furthest away.

### 14.3 Sector health indicators and pins
- **Red / yellow / green indicators** in the run viewer showing which sectors need work.
- These **drop pins** on the highlighted areas.
- **Clicking a pin loops** the selected steps, using the loop focus dimming from Phase 4 (only the looped area shows, the rest of the map fades).

### 14.4 Problem corners in telemetry
- Problem corners with pinpoints also appear in their respective telemetry charts, styled with **warning colors**, similar to the drag-to-select range look.
- **Clicking** one opens a **popup** explaining the issue in more detail.

---

## Phase 15: Manual run/version entry and import

- A dedicated **window** for manually importing and entering runs or versions. It should prompt for everything needed and **explain or link to the data formatting rules**.
- Result type is chosen with **rounded, stylish selectable icons, not a dropdown**. Options:
  - "kept"
  - "kept enabling change"
  - "kept enabling change rejected"
  - "just rejected"
- The rest of the inputs should follow a similar styled approach.
- Include a button to **import a CSV** for a set of runs in one go.
- **Format validation before entry (applies to manual entry and CSV import):** check every run or version against the data formatting rules before it is added. Results fall into three levels:
  1. **Valid:** enters normally.
  2. **Warning (missing data):** the run is usable but incomplete, for example **missing recording data**. Warn the user, state exactly what is missing and which features will be affected, and **allow them to enter it anyway** (explicit confirm step).
  3. **Blocked (invalid):** the data is **corrupted, entirely the wrong format, or won't work**, or would cause **major issues, crashes, or errors**. **Do not allow it to be entered**, since it would either break the application or stop features from running properly or at all. Show a clear error saying what is wrong and link to the data format rules (Help > Data Format tab).
- The validator should be one shared module that defines which problems count as warnings and which count as blocking, so the rules are easy to update as the data format changes. Validation must not itself crash on bad input (wrap parsing safely and treat any parse failure as blocked).
- **CSV import with multiple runs:** validate **each run separately**. Show a summary listing valid, warned, and blocked runs. Valid and confirmed-warned runs are imported; blocked runs are skipped and listed with reasons, without stopping the rest of the import.

---

## Phase 16: Multi-track draggable windows

(Depends on the overlay system, deltas, and the color system.)

- The user can open **multiple track tabs**. These are **draggable windows**, not split panes.
- Windows can be **overlapped** (two track options stacked) or placed side by side.
- Each track window supports its **own object-specific overlays**. For example, one shows the speed overlay and another shows the brake overlay.
- Option to run comparisons **on the same track** or on **separate tracks**, to compare race lines, overlays, etc.

**HUD elements as movable windows (same system as the track windows):**
- **All HUD elements are draggable**: the steering wheel and throttle/brake history HUD, the throttle/brake bars, the sector time table, the lap delta bars, and any other HUD panel.
- The user can **change the opacity** of each HUD element.
- Each HUD element is **adjustable in size** (resizable).
- Each can be **minimized** (collapsed to a small handle or title bar that can be restored) or **closed altogether**. Closed HUD elements must be easy to bring back (e.g. a HUD menu listing all elements with show/hide toggles).
- Build HUD windows on the same window component as the track windows, so drag, resize, minimize, close, and opacity are implemented once.
- Keep HUD elements within the viewport (no losing a window off-screen), and provide a **reset layout** button that restores default positions, sizes, and opacity.
- Saved per user with the other settings (position, size, opacity, minimized/closed state), and included as defaults the user can reset to (Phase 10).

---

## Phase 17: Tutorials

(Written after features are done so they stay accurate.)

### 17.1 General (existing) tutorial, additions
- Before Step 1, explain that this is a **general tutorial** (where things are on the site, and basic usage). Let the user pick a tutorial:
  - **"Complete Rookie? / Absolute Beginner / No idea where to start"**: button: "Check out the {easiest beginner tutorial name} tutorial".
  - **"Pro? / Think you're a Master Tech?"**: button: "Check out the {hardest advanced tutorial name} tutorial".
- At the **end** of the general tutorial, ask again with different wording:
  - **"Still lost / confused?"**: button: beginner tutorial.
  - **"Too easy? / Not enough info? / See what else Run Viewer has to offer:"**: button: advanced tutorial.

### 17.2 Beginner tutorial (new)
- Shows **all features**, explained more simply and in more depth than the general tutorial.

### 17.3 Advanced tutorial (new)
- Much deeper and more technical. Showcases **all features**.

*(Add 3D steps to the tutorials only after Phase 18 ships.)*

---

## Phase 18: 3D visualization (LOWEST PRIORITY, highest risk)

**Problem:** the 2D top-down replay is immersive but has no sense of track elevation or curvature.

**Requirements:**
- Option to **enable a 3D visual**, plus an **advanced 3D visual** that runs the **TORCS previews** with the data overlaid on top.
- Data overlays at **varying heights**, placed by a default spacing/location and **manually adjustable** by the user.
- **Better ghost car system:** running many comparisons gets overwhelming, and even a single comparison makes overlapping hard to see.
- In 3D mode, track windows (Phase 16) can also be moved **up and down**, in addition to side by side and overlapped.

**Notes for the agent:**
- Keep 3D behind a feature flag or toggle so it can't regress the 2D viewer.
- Reuse the Phase 11 overlay system and Phase 2 color utility.
- Any 3D library or TORCS-related tooling must meet the free + future-accessible constraint.
- Expect substantial debugging time; do this only after all earlier phases are stable.

---

## Quick-reference checklist (order of work)

| # | Phase | Difficulty | Environment |
|---|-------|-----------|-------------|
| 1 | Text, label, status fixes | Trivial | Local |
| 2 | Shared red/green color system | Easy | Local |
| 3 | Throttle/brake bars | Easy | Local |
| 4 | Track map markers + whole-track on compare | Easy-Med | Local |
| 5 | Telemetry sizing, gaps, step range | Medium | Local |
| 6 | Side panel close + sector time table | Medium | Local |
| 7 | Camera smoothing | Medium | Local |
| 8 | Load all / unload versions | Easy-Med | Local |
| 9 | Hosting decision + conversion + parity check | Medium-Hard | Local -> Hosted |
| 10 | Persistence, user ID, defaults, Controls tab, Help data-format tab | Medium | Hosted |
| 11 | Overlay framework | Medium | Hosted |
| 12 | Customization / themes | Med-Hard | Hosted |
| 13 | Navigation + Help cleanup | Medium | Hosted |
| 14 | Deltas, line accuracy, sector pins, problem corners | Hard | Hosted |
| 15 | Manual entry / CSV import window | Medium | Hosted |
| 16 | Draggable multi-track windows + movable/resizable HUD | Hard | Hosted |
| 17 | Tutorials (general, beginner, advanced) | Medium (content-heavy) | Hosted |
| 18 | 3D visualization + ghost car system | Hardest | Hosted |
