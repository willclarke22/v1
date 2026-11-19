# S62B-FIX1 | Add-only research instrumentation successor

Stage: v37d2c7a3s62bfix1. All files installed under scripts/sandbox only.
Preserves the original S62B modules and S62A predecessors byte-for-byte.
This is a local experimental research runner; NOT a live Learning Space integration.

## Changes
- Offline mock Model L now reads `current_stage.controls` (as supplied by the runner).
- Empty/blank submissions -> `no_attempt`, with no fabricated negative score or stage progression.
- Partial balance/choice answers -> `incomplete`, with absent/insufficient evidence instead of incorrect.
- Declined and hint-only events remain explicitly non-assessed.
- Every delivered activity has a stable `design_id` and a separate `activity_instance_id`.
  Events, learner-visible views, objective outcomes and observations carry the instance identity.
- Repeated hint/attempt events in one phase preserve that phase in the evidence envelope.
- Unsupported translated plans still cause no learner participation and no post-assessment.
- Mocked selftests exercise 20 topics, short real-shaped injected failures and full 20-episode offline journey.

## Run modes
Plan: no models, embeddings, or DB. Offline: mock A/B/X/L, lexical by default.
Model: explicitly opt in to AllowSpend and a budget, only after reviewing free traces.
Lexical is self-contained; semantic/mixed requires localhost MiniLM service.
Reports: `.myway-patch-backups/learning-intelligence-reports/s62bfix1/<RunId>`.

## Limits
- The symbolic 2D/3D/audio environments are not actual rendered/media experiences.
- Model B and Model X assessment choices are not independently validated answer keys.
- Author-seeded roots and fictional Model L are not scientific ground truth.
- No production migrations, end-user UI integration, or database writes.
- The original source dump cannot prove current Git status; all Windows checks run locally.
