# MyWay V3.7D.2C.5A — Cloud Auth Diagnostic (NO DATA)

Baseline: experiment branch `myway/learning-sandbox-v3_7a`, Git `0ca44f3`. Original `main` remains `462a7a4`.

## Scope

The cloud **Workbench** shows a private Supabase Auth sign-in/sign-out diagnostic. It uses the sandbox public URL and anon key already pinned by the V3.7D.2C.3 cloud build gate. It verifies the user via `auth.getUser()`.

- NO RLS policy, table, schema or topic changes.
- NO Cloud API allowlist changes, model calls, embeddings, or database reads/writes.
- NO new Vercel server credentials; never add a service-role key.
- Existing 3D page retains the nine fictional topic spheres.
- The original localhost Workbench remains unchanged.
- No sign-up functionality. Create test users from the **isolated** Supabase dashboard.

This phase tests **authentication only**; it does NOT secure a future topic endpoint by itself. Future reads must authenticate server-side (verified JWT) AND enforce ownership-scoped RLS. The user identity shown on a client UI must never be trusted as authorization.

## Installation

1. Download the SINGLE release ZIP. Run `INSTALL_V37D2C5A.ps1` directly from its extracted directory; it locates the experimental worktree itself.
2. Installer verifies clean Git baseline, remote branch, original main, shared repository, source hashes, previous cloud policies, sandbox pin markers; checks bundle checksums, copies payload, runs contract tests and a TypeScript check. No SQL, Vercel, or Git mutation occurs.
3. Report `INSTALL SUCCESS` output before attempting a commit. The installer creates a local ignored marker in `scripts/sandbox/v37d2c5a/installation.json` and backups in `.myway-patch-backups/`.
4. **After separate review**, stage the exact seven source files listed below. Do not stage ignored markers or backups. Commit/push only to the experimental branch. No Git push is done by the installer.
5. Verify Vercel deploys that SHA, login succeeds on Workbench, refresh still shows verified session, and sign-out works; check browser Network for only Auth requests, not PostgREST/RPC. Confirm demo still shows nine spheres and cloud APIs still block.

## Exact staged files (six)

- `app/sandbox/probe-lab/learning-space/workbench/page.tsx`
- `lib/sandbox/v37d2c5a/cloud-auth-check.tsx`
- `scripts/sandbox/v37d2c5a/README.md`
- `scripts/sandbox/v37d2c5a/test-v37d2c5a.mjs`
- `scripts/sandbox/v37d2c5a/verify-v37d2c5a.mjs`
- `scripts/sandbox/v37d2c5a/tsconfig.verify.json`

The previous V3.7D.2C.3 **immutable verifier** will legitimately report a hash change to the Workbench page: this patch intentionally supersedes that *single* old page. The NEW V3.7D.2C.5A verifier checks that exception exactly and verifies all OTHER previous files still match original hashes. Existing prior policy tests still run and remain unchanged.

## Rollback

Use `ROLLBACK_V37D2C5A.ps1` from the **same extracted ZIP**, only if installed source hashes still match. Rollback is local-only; if pushed to GitHub, revert the commit explicitly. Do not run a database migration as part of this stage.
