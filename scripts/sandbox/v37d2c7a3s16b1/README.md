# S1.6B.1 — Compact conversation continuity + safe memory recovery

**Strictly local, isolated research.** Additive overlay after S1.6B. No changes to existing S1.6A/B scripts, application routes, proxy.ts, prompts used by the browser, guarded launcher, schema, database, RLS, original main or cloud deployment. No automatic learner-memory or graph writes.

## What it tests

- Fixed *same synthetic learner* chronological seed: T01, T07, T10, T02, T06, T08, T15, T11 (unchanged S1.6B seed).
- Model A in paid mode receives CURRENT learner statement plus **at most two** short earlier learner/teacher excerpts (600-character history ceiling). Evidence validator checks quotes against CURRENT statement only. Adds a focused learner-correction instruction; preserves the existing eight-field schema and assessment scoring rubric.
- Model B in paid mode uses the unchanged three-field shadow endpoint, receiving an explicitly labeled small conversation context in the already-approved `original_statement` field. Teacher is directed to acknowledge corrections and answer the actual remaining question, without treating previous MyWay teaching as learner evidence.
- Distinguishes learner-*reported* progress from objectively demonstrated mastery and from stable difficulty identity. Reported progress is journalled, not used to rewrite canonical roots.
- Model C uses existing S1.3 schema and read-only endpoint. A structural explanation-length / JSON-shape problem may trigger **at most one more paid C call per turn** if enabled (default); malformed anchors or semantic-contract violations do not retry. If still invalid, hold memory, log diagnostics and continue. Provider/transport/accounting failures stop the run; never retry them silently.
- On `same/refine`, append an observation to the existing simulated identity but do not replace its established canonical root. Record an unapplied refinement proposal. `insufficient_evidence` holds memory. Explicit learner corrections generate a review candidate **before** any later model failure and cannot trigger an automatic historical relink.
- Cross-topic relationships remain **unverified learner-explicit comparison hypotheses**, never automatic authoritative graph edges. The existing S1.6B relationship and self-correction research limits remain.

## Safety and reproducibility

- Local **synthetic ownerless JSON only**: no real user histories or Supabase. Model reference labels/scripted transitions are never passed to provider inference.
- Offline `--mode offline` uses SCRIPTED A/B/C stubs. It is a state-machine test, not real teaching quality or accuracy.
- Paid `--mode model` is explicitly opted in (`--allow-spend --budget-usd 0.03..0.50`) with max 4 visits. Default 3 visits; at most **12 planned calls** including bounded Model C retries, usually fewer. The admission budget is not a hard provider billing cap; providers may charge for failed requests. `--no-c-retry` disables extra calls.
- Paid model mode requires local Next.js `127.0.0.1:3001`, MiniLM service `127.0.0.1:8001`, configured server-side OpenAI credentials and strict local guards. No new endpoints.
- Reports created only beneath ignored `.myway-patch-backups/learning-intelligence-reports/s16b1/<unique-run>/`; full learner statements and teaching text are stored there in the local report. Use **synthetic** learner statements. The text report uses human review questions, not automatic truth ratings.
- Existing guarded worktree/root-main checks, source preimage hashes, symlink protection and exact rollback are required. Installation does not invoke providers, database, SQL, Git commits, pushes, or deployments.

## Commands (after installing)

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
node scripts/sandbox/learning-intelligence/s16b1-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b1-journey.mjs --mode offline --limit 8 --inject-fault
```

Then optionally, in **separate terminals**:

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001
```

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sandbox\start-local.ps1
```

Once services are running, an **optional paid** 3-visit test:

```powershell
node scripts/sandbox/learning-intelligence/s16b1-journey.mjs --mode model --limit 3 --model gpt-4.1-mini --allow-spend --budget-usd 0.12
```

Read the `S16B1_LONGITUDINAL_REVIEW.txt`, `trace.json`, and `final-state.json` paths printed at the end. Avoid exporting credentials or private learner data.

## Still unproven

Teaching quality requires human evaluation and learner response. Earlier learner replies are scripted, not generated adaptively in response to the new teaching. Model C model-level identity judgments need independent review, and relationships and autonomous memory correction are **not** verified. Reuse/refinement decisions are simulated and do not imply production write approval.
