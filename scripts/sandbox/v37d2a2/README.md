# MyWay V3.7D.2A.2 — Concise model prompting + memory quality

Requires working V3.7D.2A.1 installed. No database schema changes.

- Remove the running/treading-water-specific example from global assessment prompt. Preserve the scoring rubric and exact-evidence validators.
- Isolate Learning Space teaching requests using `format=myway_learning_space_teaching_v1`: three JSON model fields (`teaching_strategy`, `next_step`, `visual_intent`).
- Fill `learner_reflection`, `use_interest`, `chosen_interest`, `reason` deterministically for unchanged `TeachingPlan` and frozen handoff contracts. No interest inferred or injected.
- Remove unrelated topic candidates from teaching input. They remain available in topic-memory retrieval and Workbench.
- Ensure `next_step` is a learning objective, not unsolicited exercise/medical advice.
- The separate legacy Assessment Lab still uses its previous seven-field teaching schema; no route is added to proxy.
- Root problems remain hypotheses, not permanent diagnoses. Newly approved topics keep known fields in `topic_json` only. No fake mastery, embeddings, semantic layout, or workers.

Requires the same loopback-3001 experimental server and Supabase pin. Run the installer, then `scripts/sandbox/v37d2a2/run-preview.ps1`. A genuine prior-file drift fails preflight. Rollback restores source files only, never reverses explicitly approved DB changes.
