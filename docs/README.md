# docs/

The project's written record: the experiment log, the tuning reference and the open ideas.

---

## Files in this folder

| File | What it contains | Updated when |
|---|---|---|
| `CHANGELOG.md` | The technical experiment log: one entry per version with the change, why, prediction, lap time, damage, top speed, min speed, observed behaviour, decision (✅ kept / ❌ rejected), and what was learned. The primary record of every version from v0.1 to v1.33. | After every version, by `tools/record.py`. |
| `CHANGELOG-simple.md` | The same versions in plain language (title, what changed, why, decision). Shown by the run viewer in Basic view. | At the end of each batch of versions. |
| `ledger.md` | One short row per candidate that was measured, kept or not, with its numbers (v1.13 onward), so the same idea is not tried twice. | After every version, by `tools/record.py`. |
| `tuning-card.md` | Every setting of the driver with its current value, unit, line number in `driver/snakeoil3_v1.py`, what it controls and the trials behind its value; then every sensor and action. | At the end of each batch of versions. |
| `improvement-plan.md` | The working plan: ranked open ideas for lap time with their measurements, and the state of the project batch by batch. | At the end of each batch of versions. |

---

## Notes

The run viewer (`viewer/`) reads `CHANGELOG.md` and `CHANGELOG-simple.md` from this folder on the `main` branch, so both must stay here under these names.

The driver is frozen at v1.33, so these files are final.
