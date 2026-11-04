# V3.7D.2C.7A.3 — Topic & root-problem memory intelligence

This change is for the **local isolated learning experiment only**. No cloud mutation endpoints, SQL, Cron, automatic migrations, or Git commands are introduced.

## Decisions
- Topic identity is distinct from difficulty identity. A unique, grounded top topic with exact label-token coverage, similarity >= 0.60 and assessment confidence >= 0.70 can get `reviewed_topic_new_difficulty` as **manual-only** `associate_existing`. A competing exact-label fit within a 0.12 similarity margin blocks it. A generic topical neighbor cannot pass. `autoEligible=false`. The current strict automatic association gate and new-topic gates are unchanged.
- Model C is advisory; the deterministic decision and server-issued one-use token remain authoritative.
- Commit still requires local-only runtime/Origin/approval guards, server snapshot SHA-256, grounded evidence, scores and per-row optimistic CAS. Existing root summaries, mastery, embeddings, semantic positions and previous evidence are untouched.
- Newly approved immutable `myway_learning_evidence` observations include `difficulty_id`, `difficulty_relation` and `difficulty_identity_schema`. A normalized **exact match** against an approved previous event reuses its difficulty_id. Partial textual similarity >=0.72 is `possible_refinement`: create a new difficulty_id with `related_event_id` pending future review, NOT a merge. Otherwise start a new difficulty identity. Prior five events are not rewritten or backfilled; older approved event UUIDs are used as stable anchors when an exact repeat is later recorded.
- The read-only Workbench displays a provisional continuity hint from the same pure classifier.
- Assessment and Teaching default to `openai:gpt-4.1-mini`. User selections for Assessment, Teaching, Verifier are stored in tab-scoped sessionStorage and restored on Learning Space -> Workbench -> Learning Space navigation. No secrets persisted.

## Known limits
- The pilot has five approved root-problem events; it cannot calibrate a robust repeat/refine classifier. Paraphrases without exact equivalence will remain separate pending review. No automated backfilling of history, resolution/mastery claims, or false equivalence from similarity.
- 7A cloud historical vectors still use **manual** approved evidence refresh and browser-generated SQL. New local approved events are not indexed in the separate cloud 7A projection without that process. This patch does not create a database job or change RLS.
- Normalized exact-label topic detection and strict previous decision checks remain in force; no schema migrations.

## Local acceptance
1. Confirm default Assessment & Teaching show GPT-4.1 mini. Change Assessment to Edge, navigate to Workbench and back: Edge choice persists. Reset manually if desired.
2. With auto-create/auto-associate off, test 'I don't understand how photosynthesis uses sunlight' then clarify; the existing Photosynthesis sphere can be proposed for manual append despite empty history. Do not approve in synthetic tests.
3. Test an unrelated electron-level confusion: it should not be silently attached to Atomic Structure and Solidity.
4. Confirm Workbench shows provisional difficulty-continuity and preserves all previous root evidence. No explicit approval means no topic evidence write.
5. Stage Git only after reviewing status and running verifiers. Original main is unchanged.
