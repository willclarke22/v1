# S61 full simulated learner journey — research only

This is an ADDITIVE extension of the **S59** evidence/JSON-schema model engine and the **S60** thirty-topic public fixture, retrieval and prompt variants. It is intentionally not a third model architecture.

- A: learner-specific provisional hypotheses, observed understanding, learner relationships, request more context, possible teaching effects.
- B: natural tutoring, diagnostic question or optional probe; hears the latest A interpretation provisionally.
- L: research-only fictional learner. Receives a private fallible profile, topic and the actual B response. A/B/C never receive that profile.
- C: optionally used for ambiguous historical identity review. Advisory only; never silently merges records.
- MyWay harness: immutable observation ledger, role-context retrieval, evidence-ID validity, bounded A/B expansion, evolving hypothesis version events, structured traces, cost guards.

S61 runs *continuous sessions across several topics for the same synthetic learner*. It reuses the 30 S60 topical case prompts as **curator-authored visit openers** (clearly identified), while subsequent simulated learner responses come from Model L reacting to B. Eight separate fictional learners collectively cover all 30 topics; their memories remain isolated. S60's case-specific historical contexts are not reloaded on each visit: only the first case history is optionally seeded.

Limits:
- Probe validity is **unverified**, open-text responses are **unscored**. An offered probe is not a verified or rendered interactive activity. No 2D/3D scene generation is part of S61.
- Researcher-authored profiles are hypotheses rather than gold labels. The model may behave unrealistically, even with a private profile.
- All new learner roots/relationships remain *provisional in memory for this simulation only*. No production or sandbox database writes and no live Learning Space integration.
- Retention/contradiction and teaching impacts require independent human review; the report does not claim causal or scientific accuracy.
- Embedding retrieval needs the **local** MiniLM service at `127.0.0.1:8001`, not an external service.

## Verify and run

From project root:

```powershell
node scripts/sandbox/v37d2c7a3s16b61/verify-v37d2c7a3s16b61.mjs
node scripts/sandbox/learning-intelligence/s16b61-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b61-journey.mjs --mode offline --learner SAGE --visits 3 --turns-per-visit 3
```

Use `run-simulation.ps1` from the extracted package folder to export a report ZIP directly into Downloads and load an existing `.env.local` key (prefers `MYWAY_OPENAI_API_KEY`, falls back to `OPENAI_API_KEY`, restores existing variables):

```powershell
& "$Pkg\run-simulation.ps1" -Mode offline -Learner SAGE -Visits 3 -TurnsPerVisit 3
& "$Pkg\run-simulation.ps1" -Mode model -Learner SAGE -Visits 3 -TurnsPerVisit 3 -AllowSpend -BudgetUsd 1.00
```

First run a SMALL paid experiment. The admission estimate is conservative; post-call usage check is **not a hard billing cap**. The full 30-topic run across eight learners is `-Learner ALL -Visits 30` with explicit sufficient budget, only after reviewing a smaller run. **Do not run `-Visits 30` accidentally.**

A report directory under `.myway-patch-backups/learning-intelligence-reports/s16b61` contains `trace.json`, `READABLE_REVIEW.txt`, `CONVERSATION.md`, `INDEPENDENT_REVIEW_GUIDE.md`, `PRIVATE_EVALUATOR_ONLY.json`. Attach the ZIP, not API keys or `.env.local`.
