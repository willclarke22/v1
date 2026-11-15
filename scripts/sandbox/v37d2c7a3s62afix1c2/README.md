# S62A-FIX1C.2: typed assessment-to-memory full loop

Research-only, add-only, local Windows experiment stage. No Supabase, schema, cloud or authoritative memory writes. The existing FIX1B / FIX1C / FIX1C1 source is unchanged.

Model A uses a unified memory action contract for provisional understanding, strengths, strategies, difficulties, underlying causes (roots), learner-specific relationships, interests and teaching responses. A response may leave memory_actions empty. All existing targets are typed and verified against provided IDs and allowed current-turn evidence. Evidence polarity explicitly distinguishes support for current claim, challenge, historical context and neutral context. Actions update a versioned in-memory ledger; evidence remains immutable. The code validates references but never claims educational truth.

This is a fresh experiment runner, not a RUNE/FIX1B checkpoint resume. It reuses existing S60 retrieval, S61 bounded context, B/L schemas and synthetic six-visit schedule. Model C remains off. Actual learner profiles are fictional and not a grading oracle.

The report contains `TURN_INSPECTOR.html`, `TRACE.json`, and `READABLE_REVIEW.md`. The Turn Inspector includes the actual full A/B requests, raw outputs, validation failures, memory before/after and optional same-turn B memory-off response. Model L's fictional private persona is not in the A/B inputs or inspector. Raw reports are private research artifacts; do not publicly publish without reviewing.

A memory-off B shadow only tests response differences on the same current interaction. It does NOT prove learning improvement. Memory-on tutor outputs drive future Model L reactions, so long-term histories diverge if a memory-off tutor were actually substituted.

CLI tasks: Plan (no model/embeddings/DB), Offline (mock engineering), Model (explicit -AllowSpend and budget). The local embeddings service is required only for semantic/mixed or retrieval audits. Paid runs use an atomic per-RunId marker; do not delete or retry after unknown provider state. The budget is an estimated software threshold, not a hard invoice cap.

No independent educational correctness scoring, no root creation quotas, no hard-coded correction outcomes. Investigate action quality using a human reviewer and evidence IDs. The S62A opening turn is curated; Model L subsequent turns may be unrealistically fluent. The new prompt/schema and new runner are not directly comparable to a frozen FIX1B request without a separate controlled comparison.
