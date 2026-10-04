# docs/

Internal project documentation: experiment log, tuning reference, open ideas, and
the active batch notes. These files are for the developer actively working on the
driver; they are not read by the web viewer.

---

## Files in this folder

| File | What it contains | Updated when |
|---|---|---|
| `CHANGELOG.md` | The technical experiment log: one entry per version with the change, why, prediction, lap time, top speed, min speed, observed behaviour, decision (✅ kept / ❌ rejected), and what was learned. This is the primary record of every version from v0.1 to the current best. | After every version is finalised with `tools/finalize.py`. |
| `CHANGELOG-simple.md` | Plain-language summaries of each version (title, what changed, why, decision). Displayed by the web viewer in Basic view. | After every version is finalised. |
| `batch.md` | The active batch log: a table of the current batch's versions, outcomes, and variables changed. Also holds the batch-end doc-sync checklist and tuning-card diffs pending the next sync. **Never committed** — local only. | Throughout a batch (append one row per version). |
| `improvement-plan.md` | Ranked open ideas for lap-time improvement, with measurements, evidence, and current status. Carries the full history of what has been tried and why it was accepted or rejected at the batch level. | At batch end (when new findings change the ranking or a plan item is resolved). |

---

## Notes

**`CHANGELOG.md` and `CHANGELOG-simple.md` also live at the repository root.** The
web viewer (`viewer/index.html`) fetches them from the repo root by GitHub raw URL,
so they must stay there. The copies in `docs/` are the canonical source; the root
copies are the same files.

**`batch.md` is never committed.** It is listed in `.gitignore`. The orchestrator and
sub-agents write to it during a batch; at batch end the finalized content is merged
into `CHANGELOG.md` and `improvement-plan.md`.

**`tuning-card.md` and `history.md`** may also be present depending on the state of
the active batch sync. The tuning card lists every knob with its current value, unit,
and line number in `driver/snakeoil3_v1.py`; the history file archives old batch
results and status logs that are no longer needed in `improvement-plan.md`.

For the workflow that governs how these files are used, see `CLAUDE.md` at the
repository root.
