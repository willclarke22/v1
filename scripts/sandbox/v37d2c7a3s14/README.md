# MyWay V3.7D.2C.7A.3S1.4 — Raw-turn end-to-end shadow diagnostic

Purpose: test what the **real learning workflow** does with an unprocessed learner statement, instead of handing Model C an analyst-selected root problem and histories.

## Flow

1. Real Model A via existing local assessment endpoint, existing production prompt/schema/validator/clarification gate.
2. Real topic retrieval: **fixture** uses local MiniLM topic-vector comparison against a curated 17-domain bank; **sandbox** calls the EXISTING guarded `learning-space/retrieve` endpoint, which performs actual Supabase pgvector search and read-only memory preview. No write-operation values or approval headers are sent.
3. Historical evidence: curated eligible UUID roots for fixture; for sandbox, a NEW strictly local read-only endpoint SELECTs at most 8 eligible approved events from up to 3 retrieved topics, returning event IDs and root descriptions only.
4. Real local MiniLM root-to-event comparisons, preserving up to five competing approved roots. Then the EXISTING S1.3 Model C endpoint (not modified) is called to generate its two-stage identity and interpretation decision.
5. A distinct **read-only research safeguard** records unresolved referents when multiple plausible approved histories remain. This may recommend holding even if Model C guesses a match. This rule is a narrow challenge heuristic, **NOT a general semantic discriminator** and is never wired to the production writer.

An early Model A clarification **stops the pipeline before retrieval and Model C**. This is a success state, not a model error. Next milestone: optionally replay the user's answer through Model A again.

## Examples

No API/network/database activity:
```
node scripts/sandbox/learning-intelligence/s14-flow.mjs --mode fixture --case U02-ambiguous
node scripts/sandbox/learning-intelligence/s14-flow.mjs --mode fixture --case Q03-refinement
```

Paid fixture-bank chain (real Model A + real MiniLM + real Model C; curated history, **not actual Supabase**):
```
node scripts/sandbox/learning-intelligence/s14-flow.mjs --mode model --source fixture --case U02-ambiguous --allow-spend --budget-usd 0.05
```

Real end-to-end read-only sandbox chain (user-provided learner statement; real Model A, real sandbox Supabase retrieval + approved-history reads, real Model C):
```
node scripts/sandbox/learning-intelligence/s14-flow.mjs --mode model --source sandbox --message "I am confused why the voltage dropped there in the circuit" --allow-spend --budget-usd 0.05
```

Required: local Next server on 127.0.0.1:3001 (existing guarded launcher), MiniLM on 127.0.0.1:8001, OpenAI credentials in local Next config, and valid `MYWAY_EXPERIMENTAL_RUNTIME=v37b`, `MYWAY_TOPIC_VECTOR_BACKEND=supabase` for sandbox mode. Check the new read-only route first:
```
node scripts/sandbox/v37d2c7a3s14/probe-v37d2c7a3s14.mjs
```

Every paid call requires explicit opt-in; 0.01 USD reserve per admitted call; not a hard provider billing limit. The full chain may stop after **one** Model A call without invoking Model C. Uncertain/failed calls can still be billable; the run stops on unknown usage. Reports go under the gitignored `.myway-patch-backups/learning-intelligence-reports/s14/` folder. **Sandbox learner text and historical records are not stored in the report by default**; add `--save-evidence` only if you explicitly want a local record with raw text.

## Scope and caveats

- The final gate is a research-only recommendation, not production behavior. **No database mutations, approval action headers, production classifier changes, Git pushes, SQL, cron, Vercel deployments, or automated learner-history edits.**
- The real sandbox route still issues an ephemeral approval token internally as part of its EXISTING read-only preview; S1.4 deliberately discards it and never invokes a commit operation.
- The new endpoint is loopback-only, development-only, pinned sandbox-only and POST-only; the existing proxy's cloud branch remains unchanged.
- Fixture-bank topic search is a component simulation, not pgvector. Use `--source sandbox` to test actual pgvector selection and real eligible historical events.
- The evaluation is not calibrated accuracy or a deployment gate. If the learner statement is truly underspecified, no model can know its intended referent reliably without additional context.
