# MyWay V3.7D.2C.3 — Private cloud read-only foundation

Purpose: get a dedicated Vercel experiment project building and showing a **static shell**. This is **NOT** a deployed functional learning engine. No cloud Supabase reads/writes, model calls, or API access. All API routes are blocked in the new cloud proxy branch. Local Learning Space remains on localhost:3001 with its existing sandbox approvals and live retrieval.

## Install

Before installing, in Vercel open **myway-learning-experiment → Settings → General** and copy its Project ID (`prj_...`). Install with:

```powershell
& "$env:USERPROFILE\Downloads\MyWay_Cloud_Foundation_Extracted\INSTALL_V37D2C3.ps1" -ProjectRoot "C:\Users\willc\projects\MyWay\v1-learning-experiment" -VercelProjectId "prj_YOUR_EXPERIMENT_PROJECT_ID"
```

Installer enforces Git worktree/branch and 90391dd source baseline, pinned local sandbox config, backups and rollback, and tests; it derives cloud identity with *public* Supabase hostname and Vercel Project ID, never embeds any key. Review `git diff` before commit.

New project **Production** variables, and only these from Supabase: `NEXT_PUBLIC_SUPABASE_URL` (pinned sandbox project) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sandbox anon/publishable). Add `MYWAY_CLOUD_SHELL_MODE=readonly` (Config, Production). Do NOT add `SUPABASE_SERVICE_ROLE_KEY`, secret keys, databases, Qdrant keys, or local runtime flags.

In the new Vercel project, enable **Automatically expose System Environment Variables** under Settings → Environment Variables so the build has `VERCEL`, `VERCEL_ENV`, `VERCEL_PROJECT_ID`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_REPO_OWNER`, `VERCEL_GIT_REPO_SLUG`.

Set new project Production Branch to `myway/learning-sandbox-v3_7a`. Set **Vercel Authentication → All Deployments**. Check there are no shared/team-level privileged env vars. The new project uses a Production *environment* although the code/data are experimental. Original Vercel `v1` project must remain unchanged.

Run new local launcher:
```powershell
$env:EMBEDDINGS_URL="http://127.0.0.1:8001"
& "C:\Users\willc\projects\MyWay\v1-learning-experiment\scripts\sandbox\v37d2c3\run-preview.ps1"
```

The old `v37d2c2/run-preview.ps1` calls an obsolete verifier that pins old source hashes; use the **new** launcher after this patch. No prior markers are removed or modified.

Commit in experimental worktree and push only experiment branch (new files and changed next.config.ts, proxy.ts, two pages). All committed changes are intentional source code; `.env.local`, sandbox destination, local installation metadata and backups stay ignored.

Cloud deployment checks Vercel project ID, Git owner/repository/branch, Production environment, opt-in and exact sandbox Supabase hostname. Misconfiguration fails the build. Proxy permits two readonly shell pages, Next static chunks and favicon only. No model, learner or Supabase access.

If deployment builds and shell works, next stage should add safe authenticated cloud retrieval with a hosted embedding service and explicit sandbox-only auth, then separately consider write authorization.
