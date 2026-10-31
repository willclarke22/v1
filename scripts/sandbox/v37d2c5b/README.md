# V3.7D.2C.5B — Owner-scoped read-only cloud topic snapshot

**Target:** `C:\Users\willc\projects\MyWay\v1-learning-experiment`, branch `myway/learning-sandbox-v3_7a`.
**Baseline:** clean experimental branch with V3.7D.2C.5A committed and synced; original `v1/main` remains `462a7a4`.

## Trust boundaries
- Cloud client uses ONLY the sandbox PUBLIC URL/key and the same V3.7D.2C.5A Auth session storage key.
- Cloud topic reads are direct authenticated SELECT requests to two new RLS tables; no MyWay API routes are opened.
- No cloud writes, inference, embeddings, service-role credentials, raw `topic_json`, prompts or learner text.
- Signed-out/error/no-row states show explicitly fictional D2C4 demo; no private data is cached after signout.
- SQL migration is NEVER run by the ZIP installer. SQL Editor has privileged database access: visually verify `myway_sandbox` first.
- Snapshot is one-time, not live sync. The seed requires exactly one Auth user and exactly 43 topics; if either changed, stop and review instead of removing the guard.

## Execute in this order
1. Expand downloaded ZIP in Downloads and run `INSTALL_V37D2C5B.ps1`. Review `INSTALL SUCCESS`; do not commit before checking output.
2. **Separately review** and manually execute `sql/01_CREATE_CLOUD_READONLY_TABLES.sql` in `myway_sandbox` SQL Editor (no user data copied yet).
3. Review and manually execute `sql/02_SEED_ONE_OWNER_SNAPSHOT.sql` only in `myway_sandbox` after the owner/43-topic guard is validated. This is an explicit database write to TWO NEW snapshot tables only.
4. Run read-only `sql/03_READONLY_VERIFY.sql` and confirm 43 topic rows, RLS enabled and SELECT-only owner policies. If no relationships were copied, it might be because stored data is empty/invalid; do not fabricate edges.
5. Stage only the exact files in `manifest.json`, commit to experiment branch, and push only to `myway/learning-sandbox-v3_7a`; ensure Vercel deployment has correct commit and Authentication is enabled.
6. Open cloud `/sandbox/probe-lab/learning-space`; when signed in, private snapshot should appear. On signout, it must show the clearly fictional 9-topic demo. Workbench Auth continues working.

## Important limitations
- SQL seed assumes no additional auth users or topic additions since the reported count on Oct 31. Do not weaken these checks without reviewing ownership migration.
- Unlike a live sync, this intentionally captures one snapshot; later local additions are NOT propagated.
- Frontend doesn't fetch raw topic_json or embedding vectors; graph relationships use only typed numeric/boolean metadata.
- The original D2C4 test pins the original cloud-page source and is superseded by the new D2C5B test for this ONE page. The existing D2C4 demo module, D2C3 gates and D2C5A auth diagnostic stay byte-identical.
- A local installer rollback does not roll back a Git commit or database changes; database rollback needs a separate reviewed operation.
