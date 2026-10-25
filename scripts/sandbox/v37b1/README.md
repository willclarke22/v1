# MyWay V3.7B.1 — Supabase-only experimental foundation

## Confirmed original schema (2026-10-24 SQL audit)
- runs: 11 columns; attempts: 12 columns; topic_state: 32 columns.
- All three tables have RLS enabled with no public policies; no custom triggers/functions.
- Both topic-centroid fields are JSONB. `vector` extension is absent in original.

## Installer behavior
- Targets **only** `v1-learning-experiment` and verifies previous V3.7B.0 install.
- Copies an inert SQL migration, read-only verification SQL, a read-only source-aggregate SQL, and a server-only semantic-search adapter into the experimental source tree.
- Does **not** change runtime routing, start services/workers, configure credentials, connect to databases, or run SQL.
- Leaves original MyWay checkout untouched. Fails closed if expected new files differ.

## DB migration: user-approved manual step
1. Supabase Dashboard: select **myway_sandbox** (NOT the original project), SQL Editor, new query.
2. Open `scripts/sandbox/v37b1/01-install-supabase-sandbox.sql` in your experimental worktree.
3. Copy its entire contents into the SQL Editor and run. The migration is wrapped in one transaction and refuses a project already containing `topic_state`, `runs`, `attempts`, or `topic_vectors`.
4. Run `scripts/sandbox/v37b1/02-verify-supabase-sandbox.sql` in **myway_sandbox** and capture results.
5. Separately run `03-readonly-source-data-assessment.sql` in the **original** project to report aggregate centroid reuse counts; do not export learner records yet.
6. Leave the experimental application and workers STOPPED. V3.7B.2 will configure project identity/credentials, controlled data seeding, worker isolation, and route switch away from Qdrant.

## Technical choices
- Preserve source JSONB centroids and original MyWay layout inputs.
- Add a `topic_vectors` table indexed in PostgreSQL with vector(384), maintained transactionally by a trigger when centroid or model changes.
- Matching requires exact embedding model + purpose (label or message) to prevent mixing incompatible vectors.
- Use exact cosine search first; only add HNSW after performance measurements.
- Search RPC is callable by service_role only; RLS remains enabled on all four tables.
- Existing experimental Qdrant code remains present but NOT used by the new adapter. Do not start application or worker processes until all active routes are safely switched.
- Independent Cloudflare asset infrastructure is unchanged.

## Important limitations
- This patch does not copy production topic data. The experimental database starts empty.
- Supabase's extension installation and runtime SQL have not been executed in our environment; verify the SQL Editor results on your project.
- The SQL guard protects a database that already has MyWay tables, but cannot authenticate dashboard project identity. Verify **myway_sandbox** in the UI before clicking Run.
- The original Supabase schema is replicated only for the three audited tables; additional non-public dependencies and operational needs will be assessed before full integration.
