# S62B: MyWay learner intelligence architecture successor (research-only)

Replaces S62A-FIX1C.2 as the *recommended research runner*, but preserves all earlier stages for audit and rollback. Nothing modifies the original `v1` worktree, deployed MyWay app, Supabase, routes, or database. The experimental branch may be committed separately after installation and tests.

## Components

- **A:** evidence-grounded learner intelligence, typed understanding and root/shared-root beliefs, revision with historical provenance.
- **B:** freeform creative teacher (prompt has no MyWay execution constraints); learner-facing text/story + optional experience proposal.
- **X:** separate technical translation stage. Converts a creative description into a strictly validated symbolic control plan or clearly rejects it. **X is not Model C, an assessor, or a teacher.** Translation fidelity must be independently reviewed.
- **L:** fictional participant given only current stage, controls, visible teacher text, delivered hints and recent learner-visible dialogue. Does not see hidden answers or Model A beliefs.
- **Deterministic layer:** typed target/reference validation; phase-gated information; control-domain checks; event log, replay, objective numeric balance checks, indication when answer keys are teacher-proposed and not independently verified.
- **Retrieval:** current evidence plus lexical/local-MiniLM candidate searches using current message and existing root claims; includes root supporting and contradicting evidence where available; bounded second search available.
- **Model C:** removed from live path.

## Known limits—do NOT overinterpret passes

1. Only **text** tasks run through a research executable input. 2D/3D/audio plans are **symbolic only**; this package does not render scenes or synthesize/play audio. A symbolic attempt is not a genuine perceptual test.
2. Translation from B is model-assisted and fallible. A valid schema is not proof that it faithfully implements the activity. Unsupported proposals are rejected without fabricated learner attempts.
3. Model L and the 20 authored visit-openings are fictional; simulated scores are not a scientific educational benchmark.
4. Five initial topic records are low-confidence hypotheses based largely on historical unscored questions. They are deliberately marked provisional, not authoritative.
5. The authored topic route tests 5 pre-existing and 8 new topic IDs in a known scenario. Free-form production topic classification is **not** validated by this stage.
6. No root hypothesis is automatically created or revised; real Model A may appropriately abstain. The mock test deliberately injects actions to validate mechanics only.
7. The objective arithmetic check verifies an equation *as specified in the technical plan*; correctness of the learning task itself and the semantic match to B still require review.
8. Resource budgets are pre-admission estimates and pre-call software thresholds, not actual provider billing caps. Never auto retry unknown-usage paid calls.

## Tests

- `node scripts/sandbox/v37d2c7a3s62b/verify-v37d2c7a3s62b.mjs`
- Plan: `node scripts/sandbox/learning-intelligence/s62b-journey.mjs --mode plan --episodes 3 --retrieval lexical --run-id plan1`
- Offline: `node scripts/sandbox/learning-intelligence/s62b-journey.mjs --mode offline --episodes 3 --retrieval lexical --run-id offline1`
- End-to-end **offline 20**: `node scripts/sandbox/learning-intelligence/s62b-journey.mjs --mode offline --episodes 20 --retrieval lexical --run-id offline20`

For paid mode, use the ZIP PowerShell launcher with an explicit `-AllowSpend` and budget. New RunId each time; inspect partial reports instead of rerunning after errors. Local embeddings (`python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001`) required for `semantic`/`mixed` retrieval.

All reports are local and ignored under `.myway-patch-backups/learning-intelligence-reports/s62b`. They include `TURN_INSPECTOR.html`, `TRACE.json`, and `SUMMARY.md`. Do not publish raw learner/evaluator data in Git.
