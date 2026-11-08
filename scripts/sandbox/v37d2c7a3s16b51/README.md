# S1.6B.5.1 — Action Fidelity & Learner-State Calibration

Standalone, opt-in research overlay, using the 2026-11-07 16:11 full 1450-file MyWay source dump. No production or Git changes. The original v1/main, deployment and database are untouched.

Adds `calibrated_v5_1` to the existing local-only Model B shadow endpoint. Existing `adaptive_v5` and the earlier current/4D route remain unchanged by default; the same compact three-field response contract and FIX2 format retry apply. Only an explicit `voice_version` selects the new instructions. No new model or external service.

The instruction changes are action-first: correction acknowledgment distinguishes historical (at-the-time) uncertainty from today's question; closure stays brief; self-reported progress is not proof of mastery, and a request to check application gets an appropriately accessible question rather than a leap ahead. Other actions receive specific next-move gates. The evaluator compares adaptive and calibrated with identical frozen learner evidence, action and nonpersonalized context; it does not award automated teaching grades.

Run after successful guarded installation:
`node scripts/sandbox/learning-intelligence/s16b51-eval.mjs --mode offline --limit 3`
Optional model tests require the guarded local Next server, deliberate `--mode model --allow-spend --budget-usd ...`, and incur provider charges. No cloud, DB, profile, or history writes. Evaluations save human-review reports to ignored `.myway-patch-backups/learning-intelligence-reports/s16b51`.

**Limitations:** model response can still depart from prompt; regex flags are only warnings, not objective fidelity scores. Frozen synthetic contexts are not proof of real longitudinal learning or memory repair. No claims of verified mastery are authorized. Human review is necessary.
