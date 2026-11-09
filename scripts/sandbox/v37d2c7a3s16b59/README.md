# S59 — Lean Learning Intelligence research replacement

**Research-only, additive, NO database writes, no production Learning Space wiring, no replacement/deletion of predecessor code.**

This stage implements the *proposed* 09 Nov 2026 Lean Learning Intelligence design as a separate, small A/B/C/L evaluation pathway. The S54–S58R1FIX1 code is **frozen as a benchmark**, not modified. The word "refactor" here refers to the **active research pathway**: one shared lean core + one runner instead of another copy of S58's ~40 KB journey or inherited regex heuristics. It is not a claim that production code was refactored.

## Concrete changes

- Model B tutors from a role-specific compact evidence packet (rather than all 30 topic labels and 44 links).
- Model A has one explicit contract for observed understanding, presenting difficulty, possible underlying causes, **NEW learner-specific relationships**, teaching-effect hypotheses, proposed next probe, and context-expansion requests.
- Model A may request a bounded **distant-topic observation scan** that is not gated by semantic similarity or existing curriculum links.
- Optional Model C compares newly proposed root/relationship hypotheses with historical candidates; `--c off` provides a genuine A-only comparison.
- Only Model L receives hidden fictional knowledge state. All A/B/C prompts use public learner evidence.
- Exact learner messages and optional probe responses are recorded. Open-ended probe responses are **unscored** pending valid scientific assessment; a curated task flag is not scientific certification.
- MyWay validates data structure, referenced observation IDs, context identifiers, cost and isolation; it does **not** infer misconceptions using keyword rules.
- Provisional model conclusions remain **proposals**, not authoritative root/relationship updates.

## What it intentionally does not do

- No production routes/UI, cloud connection, DB schema changes, or rendering engine.
- No automatic scientific scoring of free-text probes; no separate complex new probe framework.
- No automatic root/relationship deduplication: C is advisory; model proposals remain uncommitted.
- No claim of validated tutoring effectiveness, preferences, mastery, or causal teaching effect.
- Offline scripted responses are plumbing mocks, not assessments of model quality.
- No migration of existing Learning Space memory; that requires a separate current-source audit, performance benchmarks, and explicit migration plan.

## Test

```powershell
node scripts/sandbox/learning-intelligence/s16b59-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b59-journey.mjs --mode offline --limit 4 --learner-id LEARNER-A --trial-id T01 --c auto --explore on --probe-id BIO01-P1
node scripts/sandbox/learning-intelligence/s16b59-journey.mjs --mode offline --limit 4 --learner-id LEARNER-A --trial-id T05 --c off --explore on
```

For later paid evaluation, use **explicit** `--mode model --learner model --allow-spend --budget-usd 0.40`, with a small `--limit`. An admission estimate must fit; it is not a hard billing cap. Local environmental safeguards and source protections are checked before any live provider call. Don't treat the model's synthetic learner as human ground truth.

## Before deleting older implementations

1. Run matched holdout cases against S58-R1-FIX1 and S59, with independent grading.
2. Compare root quality, learner-relationship relevance, valid abstentions, retrieval recall, context bytes, model calls and cost.
3. Confirm correct user-facing Learning Space adapter and rollback strategy from a **fresh code dump**.
4. Only then migrate one production entry point and retire redundant scripts in a separate authorized destructive patch.

This keeps research histories reproducible and prevents accidental changes to the protected original `v1` main branch.
