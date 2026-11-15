# S62A-FIX1C — Learner-state coherence (research only)

This is an add-only fork of the S62A-FIX1B and FIX1B.1 research stages. It DOES NOT change production Learning Space, Supabase, the existing model prompts, or any existing source file. Original stage verifiers remain intact.

## Motivation

FIX1B correctly separated observed understanding from underlying-cause hypotheses but persisted mainly chronological assessment snapshots. A learner-level record of demonstrated knowledge, strengths, strategies, uncertainty, and changed understanding was missing. RUNE's six-visit run confirmed that competent local summaries alone do not prove a coherent long-term learner model.

## Architecture

- Model A: revised learner-first 3-part strict JSON with explicit `learner_intent` versus `assessed_task`, and optional `knowledge_actions` (propose, revise, weaken, retire, no_change).
- `knowledge_records`: learner-isolated, in-run provisional knowledge with ID, kind, claim, uncertainty, support/counter/context IDs, task conditions, and append-only revisions. A model action is not automatically scientific truth.
- Root and relationship actions are still optional, using the existing S62A evidence-polarity adapter and validator. No new mandatory Model C calls.
- Model B sees bounded relevant learner knowledge when memory is ON; B does not receive historical learner-model summaries/records/roots, or Model A's provisional advisory, in memory-OFF comparisons.
- Complete observation and dialogue histories remain available in the trace. Older evidence not included in the bounded input is not citable.
- New B instruction asks fewer obligatory probes; this is a prompt change to test, not proven educational improvement.
- FIX1C never imports persistence operations. Report writes are local under ignored `.myway-patch-backups/learning-intelligence-reports/s62a-fix1c/`.

## Controlled tests

1. Offline journey and mock provider unit tests: no real model/embedding calls; not evidence of learner understanding.
2. Frozen comparison: identical DIAG1 model inputs; original FIX1B vs FIX1C system instructions and JSON schemas; both calls use the same model. Two-arm difference tests the design package, not a single isolated prompt sentence.
3. Later opt-in short semantic model journey. No automatic scientific correctness adjudication. Human review needed; prior real model outputs and fictional profiles are fallible.
4. Memory-ON vs memory-OFF B-input audit is a structural leakage check, not a validated educational treatment effect. Longitudinal B teaching benefit requires separate controlled tests.

## Scope and limitations

FIX1C does NOT prove historical correction in RUNE. Its fixtures have six visit openings but do not seed an established historical root. The `knowledge_records` represent explicit model updates, not unsupervised semantic deduplication. Avoid treating record count as a quality metric. Incorrect model-evidence roles remain possible. No eight-visit fixtures have been invented.

## Generated Next.js types

A separate **optional**, guarded `repair-generated-dev-types.ps1` can back up only `.next/dev/types` after a recognized TypeScript failure. Preflight and install scripts do not silently hide generated errors; they still require a subsequent passing TypeScript check. This does NOT disable MyWay's Next.js startup safety gate.
