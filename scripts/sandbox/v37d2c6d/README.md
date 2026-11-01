# MyWay V3.7D.2C.6D — Retrieval and Cost Quality Baseline

This is a focused reliability patch before deploying more cloud intelligence.

## Behavior change (intentionally conservative)
- Topic-memory policy now **holds** when semantic retrieval returns zero candidates. Previously Array.every([]) could qualify an empty result set as evidence for a new topic.
- An existing exact topic label that is retrieved with unexpectedly low semantic similarity now **holds** instead of offering a duplicate new sphere. High-confidence association with an existing topic still runs first.
- All prior C features remain: live search bubbles, per-tab opt-in automatic topic creation, existing manual review, and one-way cloud sync. No new provider calls.

## Quality and cost audit
`node scripts/sandbox/v37d2c6d/test-v37d2c6d.mjs` executes synthetic retrieval cases and checks naming and token-price arithmetic. It prints **source character counts**, not billable token counts; cost checks use synthetic provider usage. It does not query your real learner data or call a model.

For a real quality baseline: in the local Workbench compare at least 5 learner turns with known expected topic outcomes, record whether the root problem is faithful, whether an existing topic should have been reused, whether name is reusable, whether the output was educationally correct, and which token counts the provider actually reported. Unknown GLM or missing usage must remain unpriced.

Do not tune cosine thresholds solely based on this synthetic test set. It is a regression guard, not a validated relevance benchmark.

## Installation and security
- Requires successful V3.7D.2C.6C, branch myway/learning-sandbox-v3_7a, fixed original main at 462a7a4, exact B/C source integrity and no unrelated dirty files.
- The node-based installer performs fail-closed preflight and backups; no Git commit/push, SQL, Cron changes, new cloud service access or database writes.
- Run `INSTALL_V37D2C6D.ps1`. The local launcher will use the new version pointer automatically.
- Do **not** deploy B/C/D to Vercel until local runtime smoke tests pass, then commit only audited files.
- Rollback is permitted only if 6D installation hashes still match and before 6D is committed.
