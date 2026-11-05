# MyWay 7A.3S1.2 — Selective Model C evaluation

This S1.2 patch is an **evaluation-only** addition on top of S1.1, based on the 2026-11-04 15:59 experimental source export and installed S1/S1.1 ZIPs. It does NOT change topic/difficulty classification, prompt settings in the UI, learner records, or database schemas.

## Workflow

1. Optional offline smoke test (no model calls):
   `node scripts/sandbox/learning-intelligence/s12-evaluator.mjs --mode fixture --selection balanced`
2. With loopback embeddings running, run free local semantic comparisons:
   `node scripts/sandbox/learning-intelligence/s12-evaluator.mjs --mode semantic --selection balanced --limit 8`
3. With embeddings and local Next development server running on ports 8001 and 3001, opt in to Model C calls:
   `node scripts/sandbox/learning-intelligence/s12-evaluator.mjs --mode model --selection balanced --limit 4 --allow-spend --budget-usd 0.10`

Cost: S1's original ledger uses existing `sandbox/probe-lab/local-assessment/model-token-usage.ts` published standard-rate USD estimates. Each request records provider token usage (input, output, cached), model, duration, and known estimated cost. One request can exceed the CLI's conservative US$0.01 admission reserve. The budget cannot guarantee a hard cap, and failed/time-out calls can be billable. Missing usage or request failure stops subsequent requests; retained reports explicitly describe incomplete cost data. Local embedding inference incurs local compute, not paid model API charges.

### Selection

`--selection balanced` chooses 17 intentional contrasts including same, distinct, refinement, and ambiguity. `--selection priority` targets previously difficult semantic cases. `--selection all` evaluates 53 S1.1 cases. `--limit` caps the selected set; default 17 fixture, 8 semantic, 4 paid. A single case can be requested with `--case Q02-distinct`. Paid mode caps at 20 cases per run.

The specialized Model C prompt compares **specific learning obstacles** and can return `same_difficulty`, `root_problem_refinement`, `distinct_difficulty`, or `uncertain`. Its exact historical anchor must be one of the provided synthetic approved event IDs for same/refinement. The model NEVER sees the reference label or rubric rationale. The old UI verifier remains unchanged and advisory only. Model C here is advisory-only too.

S1.2's API endpoint is limited to development, the experimental runtime pin, a loopback host and same-origin terminal client. It accepts a bounded, validated hypothetical input and uses server-side OpenAI credentials. There is no Supabase client or mutation operation in the route. Installing the patch does not invoke it.

Outputs are timestamped under `.myway-patch-backups/learning-intelligence-reports/s12/` and include `summary.json`, `traces.json`, `cases.csv` and `cost-ledger.json`. The benchmark uses analyst-authored provisional labels, fixture-supplied topic-candidate similarities, and synthetic historical observations: this is NOT expert ground-truth validation or end-to-end pgvector accuracy. No automatic writes are authorized.

This patch updates only the release allowlists in the original S1 `run.mjs` and S1.1 `s11-evaluator.mjs`, and adds the specialist adjudicator loader to `runtime-loader.mjs`; their underlying cost, decision and prior evaluation behavior remains unchanged.
