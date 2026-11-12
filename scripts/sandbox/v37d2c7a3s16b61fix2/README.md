# S61-FIX2 — Independent reviewer reliability

Research-only, additive reviewer upgrade. It leaves all S59, S60, S61, and S61-FIX1 sources unchanged. No live Learning Space changes, DB writes, migrations, model calls during installation or testing.

- `s16b61fix2-review.mjs` selects all current and cited supporting/contradictory observations before optional relevance context; distinguishes current scientific understanding from historical root support, teaching quality, and probe independence.
- Retains old S61-FIX1 accepted reviews as `legacy_unverified`; never silently treats their `supported` labels as confirmed FIX2-quality judgments.
- Persists after each reviewed step. Rejected model output has a short excerpt, hash, error classification and evidence allowlist for local audit; continues with other steps after model-format/reference errors. Provider/budget/usage failures stop safely.
- Re-running uses the existing FIX2 report to skip previously accepted FIX2 and legacy steps, retrying only missing/failed steps. Results are saved as `INDEPENDENT_MODEL_REVIEW_FIX2.json` and `SIX_CAPABILITY_SCORECARD_FIX2.{json,md}` alongside the original S61 trace. Original review and scorecard files are unchanged.
- The independent reviewer is a fallible research tool, not a scientific adjudicator or learner-memory writer. No validated teaching outcome is claimed.

Offline: `node scripts/sandbox/learning-intelligence/s16b61fix2-selftest.mjs`.

Paid runner: use the ZIP package's `run-fix2-review.ps1`, not the historical FIX1 reviewer launcher.
