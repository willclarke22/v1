# MyWay V3.7D.2B — Searchable approved topics + 3D snapshot integration

Requires successful V3.7D.2A.2. No database migration and no writes at installation.

- New explicit Workbench topic commits generate a local MiniLM 384-D label embedding BEFORE INSERT.
- Existing `topic_state_to_vectors` trigger creates the queryable `topic_vectors` row atomically.
- Collision-checked initial 3D positions are stored without overwriting existing positions. Legacy topics that have only order-based fallback positions may still move on refresh; the global layout worker is deliberately not run.
- Strong same-model cosine neighbour evidence (>=0.60) permits a **provisional local** semantic target; otherwise the position is deterministic with `semantic_layout_refresh_pending`. This is NOT a global semantic layout recomputation.
- Workbench shows per-topic eligibility to explicitly repair an earlier approved topic with missing label centroid (including Cardio Cross-Activity Transfer). One id, one click, one record; no whole-DB backfill.
- Source-only rollback does NOT undo database changes approved through Workbench.
- A new or repaired topic appears in the existing read-only scene on Refresh. Local relationships derive from the existing buildLearningSpace graph; no legacy worker enabled.
- The assessment follow-up prompt retains original conceptual evidence through clarifications.
- Index model identity must match the search model exactly. An embedding failure prevents NEW topic insertion.

No Qdrant, no non-sandbox routes, no alterations to original v1 checkout, and no automatic learner score/mastery writes.
