# MyWay V3.7D.2C.7A.3R — Semantic Difficulty Continuity & Unified Approval

**Scope:** Offline source-only ZIP for the separate `v1-learning-experiment` worktree. **No changes are made when you download or extract this ZIP.** It does not touch original `v1/main`, SQL, Supabase directly, Vercel, model keys, Cron, commits, or cloud endpoints.

## Changes

- Compares actual eligible, approved historical **event** descriptions with local 384-D embeddings, separately from topic summaries. A topic summary alone can never provide a reusable historical difficulty ID.
- On a single, sufficiently grounded, unique event-level semantic repeat (>=0.80), proposes reuse of its existing `difficulty_id`; ambiguous/high-but-uncertain matches refuse saving until clarification. Normalized exact approved repeats also remain valid.
- One canonical approval path in Learning Space and Workbench, with explicit **same recurring difficulty** versus **new distinct difficulty** choice when an approved repeat is proposed. Model C is advisory; the previous separate verifier-review route is retired.
- Approval token remains one-time, 10-minute, server-held, and snapshot-digest bound; commit checks the approved anchor against the latest database, verifies immutable history, and returns `eventId`,`difficultyId`,`difficultyRelation` for read-back.
- Existing-topic automatic association is **paused** (explicit manual approval only); new-topic auto-create remains a separate existing opt-in and is not extended here. No automatic mastery, relationship, or cloud writes.
- GPT-4.1 mini defaults and tab-scoped selection keys remain unchanged.

## Installer safeguards

`INSTALL_V37D2C7A3R.ps1` invokes the offline `install.mjs`: it checks exact experiment root, unmodified original main 462a7a4, branch, HEAD 03e87909..., common Git directory, existing release marker, exact source preimage hashes, staged/untracked safety, payload hashes, then makes timestamped source backups. It runs release tests, targeted and full TypeScript checks, and release/ancestor verification. On any error, it restores all prior file bytes and removes only patch-created files. It does not delete extra untracked personal files.

`ROLLBACK_V37D2C7A3R.ps1` is a separate, guarded source-only rollback. It never undoes database writes, SQL, Git commits/pushes, or deployments. Re-running the installer against an already installed release refuses cleanly.

## Manual acceptance steps (start with read-only tests)

1. Stop the local Next service before installation. Leave local `auto-create`, `auto-match`, and score observations off for diagnostics.
2. Start the embedding service as before: `python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001` from the experimental worktree. Set `$env:EMBEDDINGS_URL = "http://127.0.0.1:8001"`, then run `& ".\scripts\sandbox\start-local.ps1"` in another PowerShell window.
3. Re-run the Photosynthesis paraphrase. **Before approving**, check that it shows same topic, `repeated_difficulty`, the approved event ID `be9b9f6a-9c0d-4408-97c8-9ee63a53cbe2`, and a single explicit choice. If it is ambiguous or lacks approved-event evidence, do **not** force an approval.
4. Only after reviewing the grounded learner statement, select **same difficulty**, tick the explicit approval checkbox and approve once. Verify in read-only Supabase query that Photosynthesis contains **two** events, **different** `event_id` values, and **one shared** `difficulty_id`, and that the original event has not changed. Query guidance: `select topic_id, topic_json->'myway_learning_evidence' as events from topic_state where topic_id='topic_e846c5e1-408e-479f-8731-f2e13f2d8741';`.
5. Test a distinct chlorophyll-wavelength issue, a different subject (electron levels vs atomic solidity), same-difficulty ambiguity, and model-selection navigation. No automatic existing-topic writes should occur.
6. Run `node scripts/sandbox/v37d2c7a3r/test-v37d2c7a3r.mjs` and `node scripts/sandbox/v37d2c7a3r/verify-v37d2c7a3r.mjs`; inspect `git diff --check`, `git status --short`, `git diff --stat` and stage only reviewed paths in a later separately authorized commit.

**Limitations:** A semantic score is not proof of misconception identity or learning. The 0.80 threshold is provisional and one live Photo­synthesis trace is not a calibration dataset. Approved-event embeddings are bounded; do not force links if evidence is absent. Cloud historical projection still needs a separately authorized manual sync. The source export was captured 2026-11-03 23:15 EST and may differ from your present working tree; any source drift means **stop and rebuild** rather than overriding safeguards. No PowerShell/Windows runtime test can be executed in this Linux build environment; the ZIP installer includes runtime preflight and rollback tests for your Windows machine.
