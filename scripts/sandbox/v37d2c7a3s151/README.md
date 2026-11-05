# MyWay S1.5.1 — Retrieval Integrity (read-only)

Purpose: Diagnose the Q03 SA-node misroute in the S1.5 *controlled fixture* path. No application model prompt, security proxy, production retrieval, approved observation, database, or teaching writer changes.

S1.5 fixture retrieval compared a detailed Model A hypothesis to very short topic titles, always selecting the highest topic-label cosine even when below 0.3. The selected topic alone supplied history. This overlay adds an **opt-in** historical-evidence-first fixture ranker and a conservative memory-only gate.

**New CLI opt-in** (local Next :3001 + local embeddings :8001 required):

```
node scripts/sandbox/learning-intelligence/s15-flow.mjs --mode model --policy myway --source fixture --case Q03-refinement --retrieval-policy integrity --allow-spend --budget-usd 0.08
```

Compare baseline by removing `--retrieval-policy integrity` (requires fresh paid calls). The model A and model B stages run before retrieval. The new local embedding ranker compares the assessed root problem to every curated approved historical root, rather than only matching subject labels; it scores all fixture topics and includes best historical-event similarities and the topic-label-only leader in trace diagnostics. No topic names/IDs are hardcoded. It selects among curated topics, retains competing candidate histories, and stops memory identity evaluation when evidence is weak (`best event similarity < 0.42`) or two topic-level best-event scores are near-tied (`gap < 0.025`). These cutoffs are **provisional research guardrails**, not calibrated similarity confidence thresholds.

The sandbox pgvector read-only path is *not* globally rescued by this patch. When `--source sandbox --retrieval-policy integrity` is requested, incomplete top-K evidence causes a memory hold rather than asserting global topic correctness. The teaching output is still available. No provider calls for Model C are made when the retrieval integrity gate holds. Other safety gates remain unchanged.

Run `node scripts/sandbox/learning-intelligence/s151-selftest.mjs` without any API/model calls; it checks a deliberately misleading topic-label case, low root support, competing histories, and unchanged default. Run the normal S1.5 tests in baseline mode to confirm no regression.

No SQL, DB writes, new routes, proxy changes, Git actions, deployments or automatic memory approval. The external OpenAI USD budget is a call-admission estimate, not hard billing cap.

**Free first diagnostic, no model calls** (run embeddings service on :8001):

```
node scripts/sandbox/learning-intelligence/s151-diagnose.mjs --case Q03-refinement --topic "SA node depolarization" --root "Learner understands SA node location but does not understand the mechanism of ion currents causing depolarization"
```

This reports topic-label-only leader versus historically-supported ranking across *all* curated topics and the independent memory hold decision. If it fails to recover the cardiac history, inspect its scores before further Model C calls. No external inference or DB connection is required.
