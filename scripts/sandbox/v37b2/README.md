# MyWay V3.7B.2 — Supabase-only experimental topics

## Install / boundaries
- Run **one-ZIP launcher** `install-myway-learning-sandbox-v3_7b2.ps1` from any working directory.
- It modifies only source files inside `v1-learning-experiment` and adds guarded scripts. It does **not** contact either database during installation.
- It verifies the prior V3.7A/B.0/B.1 baseline and backs up changed experimental sources before writing them. It never edits the original `v1` checkout.
- A Git checkpoint is supported. The preflight does **not** require modified/untracked git status.
- This patch rewires topic **read-side search** to Supabase and disables Qdrant when `MYWAY_TOPIC_VECTOR_BACKEND=supabase`. Existing background enrichment and engine routes remain in the source tree; **do not start Next.js or workers** until worker boundaries and all writing routes are audited.

## 1. Configure only the new sandbox database
In Supabase, choose your **myway_sandbox** project, then Project Settings > API.
In an **experimental** VS Code terminal run:
```powershell
& '.\scripts\sandbox\v37b2\configure-sandbox.ps1'
```
Enter the new project URL and its **server-side service_role key** when prompted. The key is hidden; no key is embedded in the ZIP or output.

The helper:
- Checks that the sandbox URL and key differ from original Supabase;
- Checks the new four-table schema, pgvector RPC, and empty destination tables with read-only calls (RPC uses POST but SQL is STABLE/read-only);
- Confirms `.env.local` is Git-ignored;
- Creates the **experimental worktree's** `.env.local` with an explicit Supabase backend flag;
- Stores only two credential fingerprints in `sandbox-destination.json` so the runtime rejects a different project.

The helper does **not** change original `.env.local`, Qdrant, Cloudflare, Vercel, schema or tables.

## 2. Dry-run topic transfer
In the **experimental** terminal:
```powershell
node '.\scripts\sandbox\v37b2\seed-and-verify.mjs' (Get-Location).Path --check
```
The dry-run reads the original `topic_state` and checks the new project is empty. It only displays aggregate counts and model identifiers, not learner/topic contents.

## 3. Explicitly import topic state
After reviewing the dry-run and confirming **myway_sandbox** is selected:
```powershell
node '.\scripts\sandbox\v37b2\seed-and-verify.mjs' (Get-Location).Path --apply APPLY-MYWAY-SANDBOX-TOPICS-V37B2
```
This reads original `topic_state` via GET, and inserts into the **pinned sandbox project only** in batches. It preserves topic IDs, JSON, scores, embedding metadata and spatial coordinates. It sets `last_run_id=null` because historical `runs` and `attempts` are **not** transferred in this release. Other data are copied as stored; note that `topic_json` may contain personal learning context. No raw topic rows are written to disk by these scripts.

The V3.7B.1 trigger builds 384-dimensional `topic_vectors` transactionally. The script checks record counts, indexed vector counts, and performs a semantic self-match if a valid source label vector exists. No external Qdrant or embeddings service is needed to transfer stored embeddings.

### Recovery if a batch fails
PostgREST batch inserts are atomic per HTTP request, **not across the entire import**. A failure after earlier batches may leave some rows in sandbox. The script never deletes or overwrites data automatically. Do **not** blindly rerun. Review the error; we can prepare a verified sandbox-only cleanup/recovery in the next patch if needed.

## Observability
A sanitized report is saved at `scripts/sandbox/v37b2/topic-seed-report.json` if transfer verification succeeds. Never paste `.env.local` or credentials.

## Known limitations / next steps
- Supabase topic retrieval replaces `lib/vector/query-topics.ts` in **experimental source only**, and preserves its function/result contract. Search still needs a running MiniLM embedding service for new learner messages, and exact stored `embedding_model` identity; the dry-run reports the stored model names so we can verify `MYWAY_EMBEDDING_MODEL` later.
- Historical `runs` and `attempts` are intentionally not copied; seeded `last_run_id` is cleared.
- This is **not** a full runtime release. We still need to audit all original HTTP writers and isolate worker routes before starting the experimental server or workers. V3.7C adds the Learning Space and Developer Workbench.
- Original Qdrant code is kept inert in the experimental branch for compatibility with remaining modules; it must not be reactivated.
- The project name `myway_sandbox` cannot be cryptographically validated from its display name by a service-role API key; select the correct project URL in the Supabase Dashboard. The pin prevents silent drift afterward.
