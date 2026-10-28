# MyWay V3.7D.1: read-only topic memory decision preview

**Prerequisite:** V3.7C.3 Fix 3 installed and verified; same guarded worktree `v1-learning-experiment`.

This patch extends the EXISTING `/api/sandbox/probe-lab/learning-space/retrieve` endpoint, not the route whitelist. It takes the validated Model A root problem/evidence alongside the existing query, uses the current 384D MiniLM/pgvector retrieval or honest lexical fallback, and selects up to five candidate topic rows from the PINNED sandbox `topic_state` via `getLatestTopicState()`. Only explicit historical root-problem fields may count as learning-difficulty evidence. The model does not get write authority. Unknown/absent history is shown as unknown, not inferred from topic labels or embeddings.

Pure comparator outcomes:
- `associate_existing`: a retrieved topic's **stored root-problem statement**, not just its label, closely matches the assessed root problem. With semantic retrieval, require semantic similarity >=0.60 and root-problem overlap >=0.82; with lexical fallback, require exactly equivalent explicit historical root problem.
- `propose_new`: adequate learner evidence and successful semantic search but no reasonably close semantic candidate (all <0.55) and no close historical difficulty. This is a **review proposal, not proof of novelty**.
- `hold`: weak evidence, label-only candidate, ambiguous matches, failed/unconfigured semantic retrieval, failed memory read, or insufficient history.

Workbench displays retrieval status, candidate labels, measured or absent semantic similarity, stored root-problem evidence (bounded snippets), root-problem overlap, action, rationale, and limitations. No schema migration, topic creation, updating, learner-state writes, positioning changes, workers, Director execution, or new API routes.

**Run** from VS Code PowerShell after stopping old dev server:

```
& "$env:USERPROFILE\Downloads\MyWay_V3_7D_1_Extracted\INSTALL_V37D1.ps1" -ProjectRoot 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
```

After success launch with:

```
& 'C:\Users\willc\projects\MyWay\v1-learning-experiment\scripts\sandbox\v37d1\run-preview.ps1'
```

To roll back source while there are no subsequent edits:

```
& "$env:USERPROFILE\Downloads\MyWay_V3_7D_1_Extracted\ROLLBACK_V37D1.ps1" -ProjectRoot 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
```

All previews are observational only. The next V3.7D.2 phase may add carefully approved write actions after live trace review. Inspect the generated trace before sharing learner content.
