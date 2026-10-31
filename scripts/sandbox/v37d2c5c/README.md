# MyWay V3.7D.2C.5C — One-way automatic cloud snapshot synchronization

**Sandbox-only.** Intended baseline: clean `myway/learning-sandbox-v3_7a` at commit `f0b4ebf`.
Original `v1/main` must remain at `462a7a4`.

## Scope

- Database: existing `public.topic_state` remains authoritative. An admin-only, scheduled SQL function in `myway_sync_private` periodically reconciles the two existing owner-scoped cloud snapshot tables. **No source-table write triggers**, no local runtime edits, no original project changes.
- Browser: signed-in cloud page rechecks the snapshot every 60 seconds while visible and on window focus. It avoids updating the React scene when the data is unchanged. Existing Supabase Auth and RLS remain in place; no browser writes or API routes.
- This is **ONE-WAY LOCAL-DATABASE -> CLOUD SNAPSHOT**, not bidirectional synchronization. Cloud editing is still disabled.
- Delays: after a local write, up to ~1 minute until database refresh, then up to ~1 minute until visible browser refresh. A tab sleeping in the background catches up on focus. This is not a guaranteed real-time SLA.

## Source patch

Use `INSTALL_V37D2C5C.ps1` from any working directory. Installer verifies repo, branch, exact baseline, previous hash, original main, cloud gates, payload hashes, source contract tests and TypeScript on the user's Windows environment. It **does not run SQL, create Cron jobs, run SQL migrations, commit or push**. Rollback: `ROLLBACK_V37D2C5C.ps1` before Git commit, and only if installed source hashes still match.

## Database scripts — all manual, in this precise order, after reviewing

Execute ONLY in **myway_sandbox** (never original Supabase). No secrets or credentials in scripts:

0. `00_READONLY_PREFLIGHT.sql` — inspect source/snapshot counts, ownership, RLS, Cron. Expect source/snapshot=43, 1 snapshot owner, forced RLS=2. If `pg_cron_installed=0`, first enable Supabase Cron in the *sandbox* dashboard; do not enable it in original.
1. `01_INSTALL_REFRESH_FUNCTION.sql` — create a private admin-only owner binding + restricted `SECURITY DEFINER` function. Refuses unexpected owner / source count / RLS. Does not touch topic_state or public RLS policies. Only the SQL Editor's privileged role should invoke the function.
2. `02_RUN_ONE_REFRESH.sql` — one explicit snapshot refresh, then show counts. Initially expect 43 topics, 24 relationships (unless original source changed). The operation is atomic and aborts on invalid data.
3. `03_ENABLE_CRON.sql` — only after one successful refresh, schedule one PostgreSQL job every minute. Requires `pg_cron` already enabled. Refuses to overwrite a job of the same name.
4. `04_VERIFY_READONLY.sql` — inspect counts and last-success timestamp. Check Supabase Cron Jobs/History for success and no failures. Check the public snapshot RLS policies remain SELECT-only for `authenticated` and anon has no grants.
5. Optional: `05_STOP_CRON.sql` stops job and disables sync; `06_REMOVE_SYNC_FUNCTION.sql` removes its private function/schema **only after stopping the job**. Existing cloud snapshot data stays intact.

## Privacy and consistency

The sync function has no caller-selected owner, no exposed RPC endpoint, an empty `search_path`, and no PUBLIC/anon/authenticated/service_role execute grants. It derives its single owner from the already-protected snapshot once during installation. It copies only whitelisted topic scalars and relationship visualization metadata, never `topic_json`, run text, attempt text or embeddings. If it fails, the cron job logs an error, existing snapshots stay untouched because PostgreSQL rolls back the transaction, and local writes are **not** rolled back. Review Cron failures if cloud data appears stale.

Before enabling Cron, verify the existing RLS policy predicates still compare `auth.uid()` with `owner_uid`. Use a second test account to verify isolation before widening use beyond a personal sandbox.

## Acceptance test after manual SQL and Git deployment

1. Confirm initial cloud 43 topics, 24 relationships, normal sign-in/out.
2. In the **local sandbox only**, create a safe temporary topic via the existing normal guarded UI (don't directly change SQL to manufacture one), confirm original topic_state count increases, then check cloud count within ~2 minutes; check graph interactions. If you don't want a new topic, change a harmless existing topic label using your normal local workflow and verify it appears online.
3. Confirm the original `v1/main` commit remains `462a7a4`.
4. Inspect Supabase Cron history for success and no warning/errors. If refresh fails, stop Cron with script 05, then investigate. Do not relax permissions or expose service keys.

## Future evolution

When cloud learning writes are introduced, use one authenticated source-of-truth write path with ownership policies and evidence/association controls; do not write directly to the derived cloud snapshot. Decide whether single-user snapshot should later be replaced by fully owner-scoped `topic_state` before multi-user launch.
