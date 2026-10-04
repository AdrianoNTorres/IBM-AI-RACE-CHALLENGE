# Documentation Plan

## Top-Level Overview

Add missing README files so every folder in the repository is self-explanatory to a
first-time GitHub reader. No existing files are edited or deleted. Five new files are
created; one existing file is given a new companion name so its purpose is unambiguous.

**Scope:**
- `tools/AGENTS.md` — the current `tools/README.md` content moved here (agent-facing)
- `tools/README.md` — new human-readable reference: what each tool does, where it is used, why, and a brief implementation note
- `driver/README.md` — architecture of the racing driver: control loops, sensor inputs, state machines, knob categories
- `docs/README.md` — index to the `docs/` folder: what each file is, when to read it
- `runs/README.md` — explains the telemetry CSV format and naming convention

**Non-goals:**
- No existing file is modified, moved, or deleted.
- No inline code comments are added to source files.
- No architecture diagrams (Mermaid is chat-only, not in plan files).
- No changes to the viewer, driver, harness, or tools code.

---

## Sub-Task 1 — Create `tools/AGENTS.md`

**Intent:** Give the existing agent-facing content a name that makes its audience
explicit. The current `tools/README.md` opens with "parallel race harness (read this,
not the scripts)" — it is clearly written for AI agents running parallel experiments,
not for human newcomers. Renaming it means humans and agents each get the file
intended for them without confusion.

**Expected Outcomes:**
- `tools/AGENTS.md` exists and contains exactly the text currently in `tools/README.md`.
- `tools/README.md` is untouched (the new human README is Sub-Task 2).

**Todo List:**
- [ ] Create `tools/AGENTS.md` by writing the exact content of `tools/README.md` into it.

**Relevant Context:**
- `tools/README.md` lines 1–26: the full agent reference including the command table,
  output-reading guide, suite definitions, parallel-slot rules, and Optuna notes.
- The file's opening line "parallel race harness (read this, not the scripts)" is the
  right heading for the agent audience; keep it.

**Status:** `[ ] pending`

---

## Sub-Task 2 — Create `tools/README.md` (human-readable)

**Intent:** Replace the agent-facing landing page with a human-readable reference that
explains — for a developer or collaborator reading the repository on GitHub — what each
tool does, the problem it solves, where it fits in the workflow, and a brief note on
how it is implemented. It should link to `AGENTS.md` for the full parallel-harness
reference used by agents.

**Expected Outcomes:**
- `tools/README.md` is a new file (the old content is now in `tools/AGENTS.md`).
- Each tool (`race.py`, `suite.py`, `metrics.py`, `patterns.py`, `width.py`,
  `tails.py`, `opt.py`, `finalize.py`) has a section covering:
  - What it does (plain language)
  - Where it is used in the development workflow
  - Why it exists (the problem it solves that nothing else covers)
  - How it is implemented (one paragraph, no code)
- `requirements.txt` is noted (only needed for `opt.py`).
- A pointer to `tools/AGENTS.md` for the parallel-harness detail used by agents.

**Todo List:**
- [ ] Write `tools/README.md` with an intro paragraph and one section per tool.
- [ ] Include the quick-reference command table at the top (mirrored from `AGENTS.md`).
- [ ] Close with a "For agents and automation" note pointing to `AGENTS.md`.

**Relevant Context:**
- `tools/race.py` docstring (lines 1–23): parallel race runner, private driver copies, slot locking.
- `tools/suite.py` docstring (lines 1–13): 3×10 perturbation suites, the safety standard since v0.49.
- `tools/metrics.py` docstring (lines 1–21): lap metrics from a CSV; library interface `metrics()`.
- `tools/patterns.py` docstring (lines 1–13): steering reversals, oscillation, plan jumps, gear hunting, TC time.
- `tools/width.py` line 1 comment: track-width use per corner at −80 m / apex / +80 m.
- `tools/tails.py` docstring (lines 1–16): 70-run tail analysis and paired comparison.
- `tools/opt.py` docstring (lines 1–16): Optuna knob search, scored on perturbation suites.
- `tools/finalize.py` docstring (lines 1–11): record the chosen version; `--verify` for byte-identical check.
- `tools/README.md` (current) lines 1–26: the full context a human also needs, but written for agents.

**Status:** `[ ] pending`

---

## Sub-Task 3 — Create `driver/README.md`

**Intent:** Document the racing driver for any reader who opens `driver/` on GitHub.
`snakeoil3_v1.py` is ~1,200 lines with 50+ knobs and several interacting state
machines; nothing in the repository currently explains its architecture, control loops,
or how to read or tune it.

**Expected Outcomes:**
- `driver/README.md` explains:
  - What the driver is and how it connects to TORCS (UDP protocol, one step per tick).
  - The 19 sensor beams (`track0`–`track18`) and the other inputs (speed, gear, trackPos, angle, damage, RPM).
  - The four outputs (steering, throttle, brake, gear).
  - The main control loops: line-following (lookahead), speed planning (allowed-speed curve), braking (brake plan), traction control.
  - The state machines: S-bend detection, focus-sensor look-ahead (v1.04+), corner-speed table (track memory, v1.06+).
  - How knobs are organised in `drive_example()`'s knob block and how tools override them.
  - Where to start when reading or tuning the file.

**Todo List:**
- [ ] Read `driver/snakeoil3_v1.py` lines 1–100 for file header and sensor setup.
- [ ] Read `driver/snakeoil3_v1.py` for the `drive_example()` function body (lines ~532–650+) to confirm control-loop names and knob structure.
- [ ] Write `driver/README.md` with sections: Overview, Inputs and outputs, Control loops, State machines, Knob organisation, How to read this file.

**Relevant Context:**
- `driver/snakeoil3_v1.py` is the only file in `driver/`.
- The subagent exploration confirmed: all driving logic in `drive_example()` (lines 532–636), corner table at lines 637–650, 50+ knobs in the knob block.
- `tools/race.py` overrides knobs by text-substitution in the knob block — so knob format (one knob per line, `    name=value`) is a public interface.
- `CLAUDE.md` and `tools/README.md` (current) both reference knob names; the driver README should list the knob categories so readers know where to look.

**Status:** `[ ] pending`

---

## Sub-Task 4 — Create `docs/README.md`

**Intent:** The `docs/` folder contains five files with non-obvious names. A GitHub
reader cannot tell from filenames alone whether `batch.md` is a log, a plan, or a
reference, or whether `history.md` is relevant to them. An index removes that
ambiguity and tells readers which file to open for their purpose.

**Expected Outcomes:**
- `docs/README.md` lists every file in `docs/` with:
  - One-sentence description of what it contains.
  - The audience (developer actively tuning vs. reader wanting context).
  - When it is updated (e.g., "synced at the end of every batch").
- Notes that `CHANGELOG.md` and `CHANGELOG-simple.md` live at the repo root (not
  in `docs/`) because the web viewer fetches them by GitHub raw URL.

**Todo List:**
- [ ] Confirm the current contents of `docs/` (already listed: `batch.md`, `CHANGELOG-simple.md`, `CHANGELOG.md`, `improvement-plan.md`; the subagent also found `tuning-card.md` and `history.md` may be present).
- [ ] Write `docs/README.md` with a table: File | What it contains | Updated when.

**Relevant Context:**
- `docs/` currently contains: `batch.md`, `CHANGELOG-simple.md`, `CHANGELOG.md`,
  `improvement-plan.md` (confirmed by `list_files`).
- The subagent exploration also identified `tuning-card.md` and `history.md` as
  previously documented; verify whether they are present before writing the README.
- `README.md` (root) line 72: "Every version is documented in `docs/CHANGELOG.md`"
  confirms the canonical path.
- `CLAUDE.md` is the single source of truth for workflow; `docs/README.md` should
  not duplicate it, only point to the files.

**Status:** `[ ] pending`

---

## Sub-Task 5 — Create `runs/README.md`

**Intent:** The `runs/` folder contains 17+ CSV files with timestamp names
(`run_20261003_004118.csv`, etc.). A reader doesn't know the naming convention, what
columns each file contains, how the files are produced, or how they are used by the
viewer and tools. A README here closes that gap.

**Expected Outcomes:**
- `runs/README.md` explains:
  - Naming convention (`run_YYYYMMDD_HHMMSS.csv` — one per driver version).
  - How a file is produced (`tools/finalize.py` via `harness/run_race.py`).
  - Required columns and their meaning.
  - Optional columns and what they unlock in the viewer.
  - How the viewer links a CSV to a version (via the changelog entry).
  - Commit policy (every version's CSV is committed; partial/aborted runs are not).

**Todo List:**
- [ ] Confirm the column list against `tools/metrics.py` docstring (lines 1–21) and `viewer/README.md` lines 33–34.
- [ ] Write `runs/README.md`.

**Relevant Context:**
- Required columns (from `tools/metrics.py` and `viewer/README.md`):
  `curLapTime`, `lastLapTime`, `distFromStart`, `speedX`, `gear`, `accel`, `brake`,
  `steer`, `trackPos`, `angle`, `damage`.
- Optional columns: `allowed` (planned speed), `track0`–`track18` (19 sensor beams),
  `focA`, `foc0`–`foc4` (focus rays, added v1.04+).
- Produced by: `tools/finalize.py` calls `harness/run_race.py` which writes the CSV.
- Used by: `tools/metrics.py`, `tools/patterns.py`, `tools/width.py`, `tools/tails.py`,
  and the web viewer (`viewer/js/data.js`).
- Viewer linkage: the changelog entry names its CSV as `runs/run_<date>_<time>.csv`
  somewhere in the entry text.

**Status:** `[ ] pending`
