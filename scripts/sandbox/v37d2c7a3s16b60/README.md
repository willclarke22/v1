# S60 — diverse learner evidence / prompt and retrieval ablation

**Additive, read-only research code. Not wired into Learning Space, cloud APIs, learner memory, or production routes.** This stage preserves S59 and all older research files, plus all S59 receipt hashes. It adds no dependencies and makes no database writes.

## What was added

- Independently named **30-topic, 30-case v2** synthetic benchmark covering eight fictional learner profiles. Every case contains exact stable-ID observations, context conditions, optional prior provisional roots, diverse history, possible contradictions and a question/probe request.
- Public cases/topics/curriculum references are separate from **PRIVATE, fallible curator review rubrics and profiles**. Model A/B/C prompts never receive hidden rubrics. This separation is verified by self-tests and a runtime contamination guard.
- Candidate retrieval: lexical; optional real MiniLM `all-MiniLM-L6-v2` via the **existing local** `/embed` service; mixed lexical/semantic, plus graph/counterevidence/diverse-topic lanes. Semantic modes fail without the local service, never silently relabel lexical as semantic.
- S59 **unchanged baseline** versus S60 focused Model A and B prompt revisions with matched cases/evidence. More context is supplied if the model explicitly requests it and `--explore on` is enabled; `--explore force` enables a wider first packet.
- Stable observation IDs on ALL recent dialogue provided to a model, references validated against the actual evidence packet, hypothesis actions left provisional. Explicit tutor challenges and unscored probes remain observations, not error/mastery labels.
- Optional Model C **only** after an actual new-root proposal and available historical candidates. It can remain uncalled; compare `--c off` with `--c auto` when reviewing actual model outputs.
- Offline contract tests and a paid model-cost admission check, no automatic paid run.

## Offline tests (no API key needed)

```powershell
node scripts/sandbox/v37d2c7a3s16b60/verify-v37d2c7a3s16b60.mjs
node scripts/sandbox/learning-intelligence/s16b60-benchmark.mjs --mode offline --limit 30 --prompt compare --role both --retrieval lexical
```

Reports appear under `.myway-patch-backups/learning-intelligence-reports/s16b60` (ignored by Git). Offline model text is scripted mock output and does **not** establish tutor quality. The review rubric is not a ground-truth oracle.

## Optional controlled real-model comparison

From the **isolated experiment worktree only** (requires existing API key in local environment and the exact guarded original-main state):

```powershell
node scripts/sandbox/learning-intelligence/s16b60-benchmark.mjs --mode model --limit 4 --role both --prompt compare --retrieval lexical --explore on --c off --allow-spend --budget-usd 0.40
```

For an actual local MiniLM comparison, start the known service:

```powershell
python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001
```

Then use `--retrieval semantic` or `--retrieval mixed` in a second terminal. The service must already be running. A standalone `--mode offline` semantic run does contact this **local embedding service**, not any paid model provider; it is not fully network-free. Baseline offline self-tests use simulated vectors only.

## Boundaries and limitations

This is a *case-based* experimental comparison, not a complete learner journey or integrated memory system. No production migration, no scientific probe grader, no authoritative memory writes, no proven automatic root identity deduplication and no human tutoring efficacy claim. The 30 focus cases cover all 30 topics but are author-crafted, not an independent human evaluation sample. Some case history deliberately reuses eight fictional learner profiles; correlated cases must not be interpreted as 30 independent learners. Manually inspect source IDs, uncertainty, root quality, wrong merges, negative controls, science validity and B's response to a probe request. Treat results, especially automatic retrieval anchor recall, as *screening signals* only.
