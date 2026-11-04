# MyWay V3.7D.2C.7A.1 — Local learning-intelligence consolidation

Starting point: Git commit **03e87909db593846f24117fe972c04d93662d65f** on `myway/learning-sandbox-v3_7a`, original main **462a7a4**, previous trusted release `v37d2c7a` FIX3. Only the experiment worktree and sandbox runtime may change.

This is a *local* behavior hardening release. **No SQL, no cron, no Vercel APIs, no cloud inference, no cloud topic writes, no new models.** Do not run the ZIP installer against original `v1/main`. A separate future 7B milestone remains reserved for cloud model inference.

Changes:

1. Model A receives a short instruction to distinguish what the learner already understands from the genuinely unresolved gap; it retains the strict original 8-field schema, evidence quote check, one-question limit and confidence behavior.
2. Semantic topic retrieval queries now consist of the **assessed subject + unresolved root-problem summary**. Earlier learner statements and answers remain available to the models and the human-readable trace, but are not indiscriminately copied into the embedding search query. The local retrieval diagnostic now truthfully labels this as caller-supplied search text, rather than claiming that the entire learner context was embedded. If the root is missing, use a clearly labeled diagnostic statement fallback; existing memory actions still require a grounded root.
3. Local historical difficulty preview and on-demand semantic comparison now both accept exactly the approved-event origin families accepted by 7A SQL: validated D2C events with a UUID, or D2A user-approved events with matching parent-topic provenance and a UUID. Other origins and invalid UUID events are ignored. Existing legacy structured root-problem *summary fields* remain supported as a separate backward-compatible source; they are not fabricated individual approved events. Preserve bounded local comparison (four descriptions per top-three topic candidate) and original memory-decision thresholds.
4. Synthetic contract tests cover mixed understood/unresolved statements, topic query fallback, provenance filtering, unchanged write gates and legacy 6D tests. No training or calibrated threshold claims.

## Installation

1. Stop local Next dev on port 3001. Keep original `v1/main` untouched.
2. Run the separately published SHA256-verified PowerShell launcher command (or check the ZIP hash yourself), which invokes `INSTALL_V37D2C7A1.ps1` from an extracted copy of this archive.
3. Installer checks the experimental branch, main checkpoint, Git common dir, remote URL, pristine Git state, 7A release ledger, 7A test+verifier, old 6D tests, manifest payload/preimages, then backs up touched files to `.myway-patch-backups/` before writing. It runs the new offline tests, old 6D regression tests, full `tsc --noEmit`, and installed verifier. Failures restore originals.
4. After `INSTALL SUCCESS`, use `scripts/sandbox/start-local.ps1` as usual; test several live learner turns *locally* with auto-create OFF first. Focus on mixed understood/new difficulties, a previously encountered difficulty and a new topic, a duplicate event, and retrieval unavailable.
5. Review `git diff --check`, `git status --short`, test actual local behavior. Commit/push only the manifest allowlisted paths separately with Git checks. Do NOT stage by `git add -A`.

The default verifier is Git-aware and will refuse the original worktree or unexpected source changes. The rollback script is **source-only**, requires unchanged installed hashes and the pre-install Git HEAD, and does not undo Git history, database state, or deployed code.

### Boundaries and follow-up

The 7A cloud difficulty index remains diagnostic-only and manually refreshed. This patch does not wire 7A owner data into local topic-memory writes, does not change their approval tokens/decisions, and cannot infer a new topic from a missing index. We still need actual signed-out and non-owner 7A tests, richer evaluation data, relationship intelligence, MyWay voice, and secure cloud 7B/7C deployment. New root-problem events require the existing manual 7A refresh/index workflow to be represented on Vercel.
