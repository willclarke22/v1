MYWAY V3.7D.2C.2 — VALIDATED REVIEW + INDEPENDENT SCORE OBSERVATIONS + COMPACT LAYOUT

Prerequisites: Successful V3.7D.2C.1 and its CLIENT DIRECTIVE Hotfix Fix 1; same sandbox worktree and pinned database.

SAFETY:
- Installer changes only the experimental v1-learning-experiment source files. It does not run SQL or write any database records.
- Model C is advisory. You may MANUALLY approve a supported, unique existing-topic association in Workbench. Its server-held review token expires after 10 minutes, is single-use, and requires the exact selected retrieved topic ID, a stored historical difficulty, sufficiently strong local difficulty comparison, source evidence and a fresh topic-state digest. This cannot create topics.
- Strict deterministic automatic matching from D.2C remains opt-in. The new model C path cannot auto-save or create topics.
- Independent observations are optional, OFF by default, and saved as unassigned (topic_id NULL) to a separate SQL table; topic scores and mastery do not change merely because an observation is stored.
- To enable score observation saving, FIRST run the bundled MIGRATION_APPLY_ONLY_TO_MYWAY_SANDBOX.sql MANUALLY in the SUPABASE SQL EDITOR of the PINNED ISOLATED myway_sandbox project ONLY. This migration is never applied by the installer. Do not run it on production/original v1/shared projects.
- No user accounts or cross-user RLS policy exists for this single-user lab. Never deploy these endpoints or table to production without authenticated ownership, privacy controls and a calibrated decision benchmark.
- SQL table created: public.myway_sandbox_learning_observations. Server-only writes; anon/authenticated rights revoked. It stores a bounded root-problem and evidence quote but never full learner chat. Writes are idempotent by trace event UUID.
- Manually approved association appends scored evidence to the existing topic using D.2C's existing bounded evidence history and CAS stale-state guard.
- No worker, Director, global semantic re-layout, automatic new-topic creation or mastery writes.

LAYOUT:
- Model toolbar constrained to central canvas to avoid overlaying the right topic inspector at XL widths.
- More compact model selects and per-session toggles; composer stays inside the center canvas on desktop and fades to transparent at its right edge.
- Workbench makes candidates collapsible and separates Model C, deterministic decision, reviewed update and independent observation outcome.

INSTALL: unzip the entire ZIP to a new directory and run INSTALL_V37D2C2.ps1 -ProjectRoot 'C:\Users\willc\projects\MyWay\v1-learning-experiment'. Stop the experimental Next.js server first.
LAUNCH: & 'C:\Users\willc\projects\MyWay\v1-learning-experiment\scripts\sandbox\v37d2c2\run-preview.ps1' (with EMBEDDINGS_URL and the embedding service enabled).
ROLLBACK: ROLLBACK_V37D2C2.ps1 (reverts code only; cannot undo approved Supabase inserts).

TESTS: Start with Auto-match and Save score observations OFF. Repeat running/treading question; Model C should select existing Cardio Cross-Activity Transfer. Workbench should offer the review button. After reviewing the candidate, use the explicit checkbox/button, verify same topic ID and scored event. For independent hold observations, manually apply the SQL migration, turn on Save score observations for that tab, run an ambiguous assessment and verify an unassigned row in public.myway_sandbox_learning_observations; observe that topic averages remain unchanged.
