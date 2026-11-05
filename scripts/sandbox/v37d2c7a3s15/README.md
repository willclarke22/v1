# MyWay S1.5 — Conversational intelligence & integrated shadow flow

## Scope

**Local experimental research only.** This additive overlay changes only the loopback `proxy.ts` allowlist and adds a closed-schema shadow Model B/C endpoint, MyWay voice prompts, a two-turn CLI evaluator and independent test/verifier files. It **does not change** the learner-facing Learning Space, the original Model A/B/C prompts, the stable classifier, production topic memory, teaching runtime, Git branches, Supabase, deployments, migrations, Cron or automatic memory writes. The release pointer remains `v37d2c7a3s12` for compatibility.

### What the full chain does

- Accepts raw learner statement; optional `--answer` represents one later learner answer.
- Model A: identical 8-field schema and strict evidence validator. `--policy baseline` uses the existing prompt and original `clarify/proceed` gate. `--policy myway` appends an assessment prompt about evidence-based questions and tests a **SHADOW** policy that can proceed when the grounded root is strong despite a teaching-oriented clarification request. Weak/unquoted roots and explicit unresolved referents remain held. This is diagnostic, **not a validated permission to write memory**.
- Model B: existing three-field compact teaching schema, now with an alternative concise and natural MyWay conversational prompt. Teaching is eligible separately from memory identity when a root is grounded. Existing baseline compact teaching can be used for comparison.
- Retrieval: curated bank with real MiniLM embeddings (`source=fixture` paid mode), or existing sandbox `learning-space/retrieve` pgvector plus S1.4 approved-event read endpoint (`source=sandbox`). The fixture bank is synthetic and can misroute a topic. Neither source runs learner writes.
- Model C: S1.3 schema; new prompt explicitly evaluates competing historical records. Valid anchors remain mandatory. `--policy baseline` uses unchanged S1.3 endpoint; MyWay policy uses the new S1.5 endpoint.
- When no approved history exists, Model B can still teach; Model C is not called. If a referent is missing and multiple histories compete, the shadow evidence gate holds identity assignment. Neither a model response nor this research guard writes memory.
- Optional `--policy paired` evaluates baseline and revised routes sequentially with a **shared budget**, never calls both unseen. At most 6 calls for one-turn pairs, up to 8 calls for two-turn pairs; early holds reduce calls. All outputs, decisions, latency and USD cost are recorded per stage.
- Optional `--answer "..."` reruns Model A with the original statement, original question and learner answer, validated against both learner statements. It does not mutate chat history or approval records. This is a replay, not a browser UI conversation.

## Commands

No APIs, DB, or paid calls:
```powershell
node scripts/sandbox/learning-intelligence/s15-flow.mjs --mode fixture --policy paired --case Q03-refinement
node scripts/sandbox/learning-intelligence/s15-flow.mjs --mode fixture --policy myway --case U02-ambiguous
node scripts/sandbox/learning-intelligence/s15-flow.mjs --mode fixture --policy myway --case U02-ambiguous --answer "At the battery terminals"
node scripts/sandbox/v37d2c7a3s15/probe-v37d2c7a3s15.mjs
```

Real localhost Next 3001 + MiniLM 8001 + server OpenAI key required:
```powershell
node scripts/sandbox/learning-intelligence/s15-flow.mjs --mode model --policy myway --source fixture --case Q03-refinement --allow-spend --budget-usd 0.08
```

After inspecting a revised run, explicit paired live comparison (multiple calls; user must deliberately opt in):
```powershell
node scripts/sandbox/learning-intelligence/s15-flow.mjs --mode model --policy paired --source fixture --case Q03-refinement --allow-spend --budget-usd 0.12
```

Live read-only Supabase retrieval (only if requested; do not use for first test):
```powershell
node scripts/sandbox/learning-intelligence/s15-flow.mjs --mode model --policy myway --source sandbox --message "I understand where the SA node is, but I do not know how its ionic currents trigger depolarization" --allow-spend --budget-usd 0.08
```

Budget is an admission gate (US$0.01 reserve per call against known subtotal), **not a hard billing cap**. Unknown provider token usage or failed calls are marked potentially billable and stop the run. No provider calls occur during installation. `--mode fixture` never accesses models, embeddings or databases. Reports are saved in the ignored `.myway-patch-backups/learning-intelligence-reports/s15/` directory. `source=sandbox` **redacts raw learner evidence from reports by default**; use `--save-evidence` only if you intentionally want an unredacted local report. Terminal output is not redacted.

## Limits and success criteria

- `shadowAssessmentGate` is a **research hypothesis**, not validated autonomy. The missing-referent detector is deliberately narrow (e.g., 'there', 'that part'); other ambiguous statements can slip through. Hallucinated but quoted roots are still possible. No new memory write gate is authorized by this patch.
- S1.5 does not make the existing browser MyWay models sound different. It tests whether the *alternative prompt and gate* are better before touching production user experience.
- The endpoint has strict model allowlist, pinned local development runtime, Origin/Host checks, JSON schemas, `store:false`, bounded payload, provider timeouts, no database imports or write-capable functions. Vercel/cloud requests are denied by the original proxy cloud policy before reaching its new allowlist branch.
- Actual naturalness is not measurable from a mere valid JSON response. Human review of learner-facing Model B output and unnecessary clarifications, plus separately validated ground-truth identity cases, is required. Evaluate both successful and failed cases, not accuracy on a single Q03 prompt. End-to-end live teaching/commit UI remains unmodified.
