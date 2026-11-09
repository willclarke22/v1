# MyWay S1.6B.5.5 — Realistic Longitudinal Learning Simulation (research-only)

**Scope:** add-only research files under `scripts/sandbox/learning-intelligence/` and `scripts/sandbox/v37d2c7a3s16b55/`. The installed Learning Space UI, `proxy.ts`, original `v1/main`, Supabase state, deployed cloud, and guarded local release marker `v37d2c7a3s12` are NOT changed. A committed source file is never automatically removed by rollback. This does **not** deploy or activate a model-first tutor in the browser.

## Hypothesis and experiment

1. A nine-turn synthetic learner fixture spans three sessions. Each session opens with an authored statement. Every subsequent learner message is selected by a documented rule that examines the **actual previous tutor reply**. This is a finite authored contingency model, not a real human, autonomous LLM learner, or a validated realism benchmark. `s16b55-selftest.mjs` changes tutor replies and verifies that learner branches change.
2. A new session serializes only provisional memory facts (roots, evidence, topics, relationships). In the **resumed** tutor context, no previous-session raw user/tutor messages appear. The selected root is carried by a provenance-backed first learner quote and source-turn ID. In `--context full`, previous chronological raw messages are available as a control. This is in-process serialization, NOT independently persisted disk/DB cold-start recovery.
3. Model A records a tentative root and exact learner quote; lexical S54 candidate retrieval presents history; Model C adjudicates same/distinct/uncertain/refinement. A refinement is held as an evidence-backed proposal with its old root unchanged. Same cross-topic matches are independently held. Reported confidence is never automatic mastery.
4. Reports include learner text, chosen branch, A/B/C status, retrieved roots, session boundaries, evidence quality, cost/usage when paid, provisional memory and unsigned visual/relationship proposals.
5. The offline evaluator uses researcher-authored Model A and B responses and a **lexical** C baseline. It proves wiring and safety gates only. It is not real-model evaluation, embedding integration, teaching effectiveness, or real-world identity accuracy.

## Run offline — no model calls

In PowerShell, after installing the reviewed single ZIP:

```powershell
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
node scripts/sandbox/learning-intelligence/s16b55-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b55-journey.mjs --mode offline --limit 9 --context resumed
node scripts/sandbox/learning-intelligence/s16b55-journey.mjs --mode offline --limit 9 --context full
```

Reports are stored under ignored `.myway-patch-backups/learning-intelligence-reports/s16b55/<run-id>/` with `S16B55_LONGITUDINAL_JOURNEY.txt`, `S16B55_EVIDENCE_TIMELINE.json`, `S16B55_SESSION_BOUNDARIES.json`, `S16B55_LEARNING_SPACE_PROJECTION.json`, and `trace.json`. These include synthetic learner messages; check privacy before sharing real reports in future changes.

## Optional real GPT-4.1 mini A/B/C pilot — DO NOT run without intentional spend approval

The install never invokes the provider. Only after inspecting offline results, verifying a local key and explicitly approving budget, run from the local experimental worktree:

```powershell
node scripts/sandbox/learning-intelligence/s16b55-journey.mjs --mode model --limit 4 --context resumed --allow-spend --budget-usd 0.20
```

This reaches the start of session two and uses GPT-4.1 mini for all three **research** roles. Actual max calls are 3 per turn (fewer if C is skipped); no retries. Source handling and cost estimate share the guarded S54 provider. Valid usage is required, and calls stop if usage is missing or the provider fails. `--budget-usd` is an **admission estimate**, not a bank-enforced billing cap. Unknown billed costs may exist after transport failures. CI, Vercel and production calls are refused. A/C invalid schemas are held, not converted to authoritative roots. Do not send personal or clinical learner data through these synthetic fixtures.

## Validated limitations and next decisions

- Conditional scripted learner branches are better than fixed next turns but still too simple. Next: human or carefully adjudicated model-generated learner replies and blinded review.
- Memory snapshot is in-process; true independent restart/persistence has not been tested. No historical provenance is read from Supabase or MiniLM in this stage.
- Lexical C holds the oxygen-gas source question rather than merging it with glucose carbon identity. This is conservative uncertainty, not proof of correct identity classification.
- Full-history runs are a **separate** experiment, not automatically paid paired B generations. Compare contexts and decide if a paired paid study is justified.
- Quality boxes in the text report are for human reviewers, not automatic scoring. Validate naturalness, accuracy, correction responsiveness, directness, evidence provenance, false merges, refinement and usefulness.
- At the end of this patch, Learning Space UI, proxy, background memory writes and cloud sync are UNCHANGED. No browser integration until model-first architecture performs acceptably against direct GPT-4.1 mini with human review and acceptable latency/cost.

## Patch integrity / rollback

Install from the single ZIP using SHA-256 guard in `README_INSTALL.md`. It preflights source payload hashes, exact current experimental worktree and branch, protected original main, S54 installed receipt/hashes, local release pointer, excluded `proxy.ts` baseline hash, symlinks and destination conflicts before writing. Installer runs older regression, stage verification and real local TypeScript compiler; any failure restores additions. It stores a rollback receipt in the ignored `.myway-patch-backups/v37d2c7a3s16b55/` folder. `rollback.mjs` is SHA-pinned and refuses changed or Git-tracked files; if committed, plan a Git revert rather than an installer rollback.
