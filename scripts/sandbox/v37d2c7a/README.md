# V3.7D.2C.7A — Approved historical difficulty retrieval

This is an experimental, opt-in and read-only cloud diagnostic. Historical difficulty **events** are distinct from topic labels and from topic-level `kind=message` centroids. No Model A/B/C endpoint, no automatic memory action, no cloud writes, and no new Cron. Original `v1/main` is off limits.

**Only run SQL in `myway_sandbox`**, using the Supabase admin SQL Editor. The ZIP installer does not execute SQL, deploy, commit or push.

Order: `sql/00_PREFLIGHT.sql` (inspect eligible event count), `sql/01_INSTALL_DIFFICULTY_PROJECTION.sql` (one-time create), `sql/02_REFRESH_APPROVED_EVIDENCE.sql` (manual source projection). In experimental Vercel Workbench, sign in as owner, use the 7A panel to load counts, then press **Prepare manual vector SQL**. The browser embeds approved root-problem descriptions locally using pinned MiniLM/q8/WASM and produces **vector-only SQL with event IDs and SHA256 revisions**. Review it and execute it MANUALLY in the same isolated SQL Editor. Then run `sql/03_VERIFY_SECURITY.sql` and reload/search the 7A Workbench.

No data is sent to an embedding API. However, browser code/model assets load from external hosts, and approved root-problem summaries briefly reside in browser memory; use a trusted device. SQL holds vectors and event IDs, not raw learner statements. The private projection holds validated root text; the authenticated owner-only export RPC sends only bounded root-problem summaries to the browser on explicit click. The search RPC returns root text to the owner. Never share SQL exports or browser console logs publicly.

The manual projection refresh removes deleted/retracted evidence, invalidates vectors when an event's root-problem SHA256 or parent topic changes, and accepts at most 100 uniquely identified, approved events. Because this pilot has no Cron, re-run manual `02_REFRESH_APPROVED_EVIDENCE.sql` after learning-history changes, then re-prepare/reapply vectors. Existing source tables and the 5C/6E jobs are unchanged.

**Quality and security tests:** examine absent history, known same-difficulty, same-topic/different-difficulty, different-topic/similar wording, stable repeated refresh, event deletion/revision, duplicate event IDs and expired owner/nonowner/signed-out. 5 evidence events cannot calibrate association thresholds; this search must never authorize topic creation/merging. Verify catalog RPC/other owner behavior in a real authenticated browser; SQL Editor tests alone cannot prove RLS.

To remove only 7A database changes after removing 7A UI use, manually run `sql/04_REMOVE_DIFFICULTY_PROJECTION.sql`. To undo local source changes before commit, run `ROLLBACK_V37D2C7A.ps1` from the extracted ZIP. Local rollback is separate from database cleanup, and it refuses committed/staged/drifted files.


### FIX1: archived TypeScript backup exclusion
The original 7A installer failed because the root `tsconfig.json` included legacy `scripts/sandbox/v37c21/backups/*.tsx` as compilation inputs. FIX1 adds narrowly scoped `exclude` patterns for archived `scripts/sandbox/**/backups` and ignored `.myway-patch-backups` paths while retaining a full-project `tsc --noEmit`. The contract suite adds a temporary backup fixture to prove exclusion and confirms the active 7A UI remains covered. FIX1 must be installed from the **FIX1 ZIP**, after a failed/rolled-back 7A attempt. Do not run the original 7A installer again.


### FIX2 manifest-path safety and root config
`verify-v37d2c7a.mjs` now uses `verify-manifest-path.mjs`, shared with the ZIP installer, to permit the *one* legitimate root-level target (`tsconfig.json`) while preserving strict checks for all other manifest paths. All previous source, ledger, TypeScript, backup and cloud access safeguards remain. Use the FIX2 ZIP, not either previous ZIP.


### FIX3: accepted historical approval provenance (pre-install correction)
Read-only SQL inspection on 2026-11-02 found five stored event IDs: four `v37d2c_validated_assessment` events and one earlier `v37d2a_explicit_user_approval` event. The former 7A SQL wrongly filtered the older explicitly approved record. FIX3 allows that record **only when its parent topic also contains** `myway_memory_origin = 'v37d2a_explicit_user_approval'`, alongside existing UUID, length, owner and uniqueness protections. No learner text or other source records are altered.

If the updated `00_PREFLIGHT.sql` reports fewer than five eligible events, stop and inspect metadata; do not weaken the gate. This fix changes only local 7A documentation, preflight, SQL source, tests and verifier (not browser logic, original main, 6E, Cron or cloud permissions). It must be applied with the separate FIX3 ZIP **after a successful FIX2 install and before any 7A SQL**. This ZIP does not install SQL itself. Its rollback reverts only FIX3 back to the successfully installed FIX2 source and marker; to roll back all of 7A, use FIX3 rollback first, then FIX2 rollback.
