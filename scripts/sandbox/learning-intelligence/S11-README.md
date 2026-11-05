# S1.1: Evaluation Quality — terminal-first, read-only

Installed in the isolated `v1-learning-experiment` worktree. **No model-memory runtime changes, SQL, API writes, Git writes, cron, deployments, cloud jobs, or automatic approvals.** The release pointer and one release-allowlist in the pre-existing S1 evaluation CLI are the only overwritten files.

## What's different from S1

1. **Fixture mode is a contract test**, not a statement of embedding or end-to-end classification accuracy. Original S1 160 examples remain available and unchanged via `run.mjs --mode fixture`. The S1.1 evaluator uses `--suite core` for exploratory comparisons and clearly marks unscored semantic cases.
2. **Challenge suite**: 53 human-authored cases in 16 primary subjects, plus an astronomy no-history control. Relationships are labeled `same`, `distinct`, `refinement`, `ambiguous`, `fault_missing_scores` or `no_history`. Each case provides why it was labeled. The challenge labels are hypotheses, **not independent expert-adjudicated ground truth**. The candidate topic ID and its similarity are synthetic: no real pgvector retrieval in this milestone.
3. **Fault-injection**: `F01-missing_event_scores` and `F05-missing_event_scores` deliberately suppress event embeddings in *both* modes. Core cases with `-missing_semantic_scores` similarly suppress scores in S1.1. The policy mirror (not the HTTP route) must hold rather than silently propose an unrelated new identity. Real service errors in other cases are operational errors, not auto-labeled safe abstentions.
4. **Risk taxonomy and matrix**: Provisional repeat suggestions for distinctly labeled difficulties are reported as `unsafe_repeat_proposal`, not falsely called committed database merges. Same-label novelty is `possible_duplicate_identity`. Refinement/ambiguous identity overconfidence is reported separately. The matrix separates manually authored relationships from the current classifier output. `--strict` optionally makes such findings fail the process; default exploration does not.
5. **No paid inference in S1.1**: only fixture or loopback MiniLM embedding tests. The **unchanged** previous Model A/Model C S1 runner remains available, with its token-based USD ledger, opt-in (`--allow-spend`), `--budget-usd` control, and existing provider-rate assumptions. A minimal compatibility change allows the prior S1 runner to accept the new S1.1 release pointer.
6. **Reports isolated by timestamp**, with `summary.json`, `traces.json`, `cases.csv`, `cost-ledger.json` under ignored `.myway-patch-backups/learning-intelligence-reports/s11/`. These reports contain fixture text only. No unrelated report is overwritten.

## Commands (from experiment worktree)

```powershell
node scripts/sandbox/learning-intelligence/s11-evaluator.mjs --mode fixture --suite challenge
# Local embeddings service must be running on http://127.0.0.1:8001
node scripts/sandbox/learning-intelligence/s11-evaluator.mjs --mode semantic --suite challenge --limit 12
node scripts/sandbox/learning-intelligence/s11-evaluator.mjs --mode semantic --suite challenge --case Q02-distinct
node scripts/sandbox/learning-intelligence/s11-evaluator.mjs --mode semantic --suite challenge --case F01-missing_event_scores
node scripts/sandbox/learning-intelligence/s11-evaluator.mjs --mode semantic --suite core --limit 12
# Existing original S1 paid option (DOES incur possible API cost; not a hard spending cap):
node scripts/sandbox/learning-intelligence/run.mjs --mode model --limit 2 --allow-spend --budget-usd 0.10
```

## Important scope limitations

- This still tests the actual, unchanged MyWay `compareTopicMemory` and `classifyDifficulty` TypeScript functions loaded via the S1 runtime-loader. The post-classification hold is an explicitly labeled **proxy matching two checks in the current retrieval route**, not an invocation of the full HTTP route. No database, RLS, pgvector, worker queue, or user-owned records are touched.
- Embedding similarity is not semantic identity or calibrated probability. A `repeated_difficulty` result is a **proposal**, still requiring human choice and server-authorized persistence in runtime 7A.3R2. An `unsafe_repeat_proposal` is not an actual database merge.
- A no-score case due to deliberate injection is a **fault contract**. A genuine embedding service outage is reported as an operational error; do not count it as successful abstention.
- False-merge risk, duplicate-identity risk, and hesitation are **separate metrics**. Expert labeling, complete real topic retrieval, live owner isolation, and long-term memory repair are later steps.
- Model-cost ledger is retained in the original S1 harness and reports estimated USD from provider-reported token counts, **not a hard billing limit or invoice**. No paid API calls occur in S1.1 itself.
