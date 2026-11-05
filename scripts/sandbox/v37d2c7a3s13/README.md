# V3.7D.2C.7A.3S1.3 — Two-stage Model C shadow benchmark

**Scope:** additive overlay of the existing S1.2 + S1.2.1 experiment; **no learner-memory, SQL, cloud, production, or writer changes.**

- Stage A: identity = `same` / `distinct` / `uncertain`, and an exact existing approved event anchor only for `same`.
- Stage B: interpretation for a preserved identity = `retain` / `refine` / `insufficient_evidence`. Refine proposes an **uncommitted** root-problem hypothesis grounded in learner evidence. Distinct and uncertain require `not_applicable` and an empty anchor.
- The prompt discourages confounding an increase in verbal specificity with demonstrated learning; no mastery claims.
- All 53 S1.1 challenge examples retained. A10-competing is now explicitly **contested and excluded from scored metrics** without changing the S1.1 fixture or rewriting the historical result. Six extra analyst-authored cases: four genuinely underspecified competing histories, one disambiguated same control, one distinct control. None are expert gold.
- `--compare-s12-live` explicitly triggers an **additional paid** GPT-4.1 mini S1.2 call on the *same* learner statement and historical root descriptions; both calls share budget accounting and are reported separately.
- The default `--mode fixture` and `--mode semantic` are free of provider calls; model mode requires `--allow-spend --budget-usd` and remains fully read-only.
- Outputs: summary.json, traces.json, cases.csv, cost-ledger.json in timestamped folders under `.myway-patch-backups/learning-intelligence-reports/s13`.
- The S1.3 overlay retains the existing `v37d2c7a3s12` release pointer; the new `scripts/sandbox/v37d2c7a3s13/installation.json` identifies the overlay. The earlier S1.2 and S1.1 run commands remain available. Use S1.3 verifier after installing this overlay; older S1.2.1 verifier pinned the *old* proxy preimage and will not be applicable after this proxy extension.

## Commands

Run from `C:\Users\willc\projects\MyWay\v1-learning-experiment`:

```powershell
node scripts/sandbox/learning-intelligence/s13-evaluator.mjs --mode fixture --selection balanced
node scripts/sandbox/learning-intelligence/s13-evaluator.mjs --mode semantic --selection ambiguity --limit 7
node scripts/sandbox/v37d2c7a3s13/probe-v37d2c7a3s13.mjs
# After start-local.ps1 and the port 8001 embedding server are running and the no-cost probe returns 400:
node scripts/sandbox/learning-intelligence/s13-evaluator.mjs --mode model --case Q06-same --limit 1 --allow-spend --budget-usd 0.02
# Optional paired paid comparison (two model requests):
node scripts/sandbox/learning-intelligence/s13-evaluator.mjs --mode model --case Q03-refinement --limit 1 --compare-s12-live --allow-spend --budget-usd 0.05
```

The USD admission budget is **not a billing cap**. The evaluator stops on unknown usage, model failure, or invalid output, but a failed request might still be billed.

The benchmark does not run live topic pgvector retrieval, Model A, Model B, nor any database write. Analyst-authored case labels are provisional and cannot be used as deployment acceptance criteria. Explicit further evaluation is required before automatic memory identity or interpretation changes.
