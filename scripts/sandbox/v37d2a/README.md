# V3.7D.2A — Explicitly approved sandbox topic-memory writes

Prerequisite: V3.7D.1 installed and functioning on the `v1-learning-experiment` worktree.

- The D.1 retrieval/assessment remains a *read-only preview*. It issues a 10-minute, one-time, server-local capability **only** for an actionable `associate_existing` or `propose_new` decision. The capability is not a write and cannot be fabricated by editing the browser trace.
- The Workbench requires the user to check a confirmation box and click **Approve and commit once**. The operation uses the existing local-only retrieval URL (explicit `operation`), not a newly whitelisted route.
- The server verifies same-origin, custom approval header, one-use capability, sandbox startup approval, runtime flags, pinned Supabase identity, unchanged topic-state snapshot and current-row version. It then (a) appends supported learner evidence to the existing topic without touching its embeddings/layout/scores, or (b) does a create-only INSERT for a new topic. A verification read must confirm the write. The D.2A guarded launcher uses a new pinned-destination read check because the old B.3 auditor requires a frozen initial topic count and would reject valid newly created topics.
- One in-process lock and normalized-label checks help prevent duplicates. **No database-level unique normalized-label constraint is known**; running multiple dev servers could race. Run ONE experimental server only. An insert error must be investigated, not circumvented.
- Rejection/timeout/failed write consumes the approval token; start a new learning turn to re-authorize. If a verification read fails after a successful DB write, the change may have persisted; inspect topic records before retrying.
- Approved changes store learner statements and model-inferred root problem in the sandbox topic record. Do not test with sensitive/private learner data. Do not upload any resulting learner records.
- The new topic has no embedding, semantic layout, calibrated mastery, or relationship enrichment yet; D.2B will handle 3D positioning/refresh and relationship updates. Existing topic positions and embeddings are preserved.
- The original `v1`, legacy worker, Director and write-capable legacy APIs remain blocked. The patch never modifies Supabase schemas, Next config, proxy or worker files.
- The local database may reject a new row due to schema constraints not captured in source. It fails closed; inspect server diagnostics instead of bypassing.

Run `scripts/sandbox/v37d2a/run-preview.ps1` after installation. Stop any old Next server first. Source rollback only; it does **NOT** revert approved Supabase memory writes.

After any approved topic creation, do not use older C.3/D.1 preview launchers: their read-only seed-count audits may reject the newly changed sandbox state. Source rollback does not remove approved database changes.
