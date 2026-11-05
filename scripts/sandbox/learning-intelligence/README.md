# MyWay 7A.3S1 — Terminal Learning Intelligence Test Lab

**Experiment only.** This harness does not write MyWay topic/difficulty/root-problem history, does not run SQL, does not migrate, and does not contact GitHub or Vercel. Installation runs offline checks only. Nothing is automatic on installation.

## Command reference (PowerShell, from v1-learning-experiment)

```powershell
node scripts/sandbox/learning-intelligence/run.mjs --mode fixture
node scripts/sandbox/learning-intelligence/run.mjs --mode fixture --case D02-borderline
# Start the local Python embeddings service on 127.0.0.1:8001 first:
node scripts/sandbox/learning-intelligence/run.mjs --mode semantic --limit 12
# Run Next dev on 127.0.0.1:3001 and embedding service first; requires configured local OpenAI credentials in Next server:
node scripts/sandbox/learning-intelligence/run.mjs --mode model --limit 2 --allow-spend --budget-usd 0.10
# Optionally skip Model C to compare model A alone:
node scripts/sandbox/learning-intelligence/run.mjs --mode model --limit 2 --allow-spend --budget-usd 0.10 --skip-verifier
node scripts/sandbox/learning-intelligence/selftest.mjs
```

### What the three modes actually test

- `fixture`: 160 independently authored *synthetic* cases from 16 subject domains. Runs **the actual existing MyWay `compareTopicMemory` and `classifyDifficulty` functions** via the repository's TypeScript transpiler, with **hypothetical** event similarity scores and topic context. No embedding server, database, model calls, or API costs. The score fixtures are **not observed embeddings** or an empirical accuracy claim. Expected outcomes are evaluative labels; disagreements are recorded, not quietly adjusted.
- `semantic`: calls **only** the existing loopback Python service `/embed` (the MiniLM model) to compute actual event-to-event cosine values. Passes fixture **topic candidate/subject context**, not pgvector retrieval. This isolates the effect of actual embedding distances in both production decision functions but is **not** a full end-to-end retrieval benchmark. Can run 160 cases, but start with 12 to avoid long runtime.
- `model`: explicitly opt-in; calls existing **local** Next.js read-only inference routes for Model A and optionally Model C with the real runtime prompts, validators and contracts. Uses actual local embeddings; assessment may ask for clarification, which is reported as an unresolved one-turn fixture, not an error of identity routing. Still uses synthetic topic candidates and does **not** access live topic tables. It does NOT run Model B/Teaching. No auto-approval or server write APIs are invoked.

### Cost accounting

- Model mode **refuses to run** without *both* `--allow-spend` and `--budget-usd`. Maximum 10 cases per invocation.
- The ledger calls the existing source `model-token-usage.ts` with provider-reported tokens (never characters) and records individual stage model IDs, input/output/cached tokens, latency, estimated USD, and whether a charge could not be estimated. Unknown pricing and failed requests are **never counted as free**.
- Admission holds back US$0.01 **per upcoming request** against *known measured* spend, stopping additional requests if budget would be exceeded. **This is not a hard billing cap**: a single provider call, a failed call, missing token usage, or other services can exceed the estimate. Start with small cases and independently check provider billing.
- Rates come from the existing MyWay rate table and are **estimates**, not a live pricing API or invoice. Check current provider rates for purchasing decisions.
- The local embedding service does not issue paid LLM calls. Its CPU/electricity expense is not included.

### Reports and safety

Reports are local, in the already-ignored `.myway-patch-backups/learning-intelligence-reports` directory: `summary.json`, `traces.json`, `cases.csv`, `cost-ledger.json`. They intentionally contain synthetic fixture diagnostics only; do not add real learner messages to the cases file without consent. The default run overwrites only these four local report files. You can isolate report sets with `--report-dir` under that approved directory.

**Important:** this is S1 infrastructure for evidence-driven evaluation, not calibrated automation. No claims about accuracy on arbitrary learners; no production topic/difficulty routing changed. The next step is a labeled held-out corpus, observed full retrieval, multi-turn revision tests and selective Model C ablations. Original `v1/main` is untouched.
