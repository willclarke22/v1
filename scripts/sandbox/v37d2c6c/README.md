# V3.7D.2C.6C — Live search bubbles + genuinely automatic local topic creation

## What changes
- Animated searching indicators appear as soon as a learning turn starts.
- Retrieved **existing** topic labels render as ephemeral clickable bubbles as soon as semantic or lexical retrieval completes, while teaching runs. They are previews, not newly persisted spheres.
- Auto-create remains OFF by default and applies only to the current browser tab. When enabled, a valid server-issued `propose_new` is committed automatically, **without an additional per-turn checkbox**. Manual approval still works when auto-create is disabled.
- Normalization of an auto-created topic label is performed inside the local guarded server before the write. The same one-time token, evidence grounding, fresh snapshot digest, semantic-only policy, duplicate/near-duplicate validation, loopback-only origin and database verification remain required. Server will not convert `hold` into `propose_new`.
- A failed auto-create reports a reason; with Auto-create enabled it will not present a redundant manual approval control. To manually create after a failure, disable Auto-create and run a new learning turn for a fresh approval token.

## Security boundary
No Supabase migration, no Cron modifications, no cloud write permission, no new paid model calls, no new vector service. Cloud remains authenticated read-only. Original v1 Git branch, cloud identity gates, and V3.7D.2C.5C synchronization untouched. No Git commit or push is performed by the installer.

## Install and test
Stop local server first. Run `INSTALL_V37D2C6C.ps1` in this zip. The Node-based installer verifies all B baseline checksums and the uncommitted B source, plus branch/original Git conditions. It performs backups and restores them if contract/TypeScript checks fail. It updates the current release pointer so `scripts\sandbox\start-local.ps1` runs the new verifier. Restart with `$env:EMBEDDINGS_URL='http://127.0.0.1:8001'; & .\scripts\sandbox\start-local.ps1`.

Test (1) auto-create OFF: manual create panel should appear for a `propose_new`; (2) auto-create ON: valid `propose_new` should create once with no manual panel; (3) poor evidence/duplicate: no auto-create and an explanatory status; (4) search bubbles appear during inference and show existing topic names; (5) Vercel remains read-only and prior 5C sync still works. Keep Git uncommitted until tests pass.
