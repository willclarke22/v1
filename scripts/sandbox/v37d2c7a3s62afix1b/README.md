# S62A-FIX1B — Learner-first Model A (Research-only)

This is an add-only experimental fork of the existing S62A journey. It does **not** change `s62a-journey.mjs`, S59 core/prompt schema, DIAG1, FIX1A, application routes, Supabase, production learner memory, or original v1/main. No production/DB writes.

## Actual changes
- A is given a three-part learner-first structured assessment: `current_understanding`, `learner_model_delta` (positive observations, hypotheses and optional actions), and `next_teaching`.
- Root/relationship memory actions now cite each observation with an explicit `support`, `counter` or `context` role. The FIX1B-only reducer uses those roles, **not** the word `refine`, to decide buckets. Historical evidence is not deleted; revisions remain provisional.
- A positive/uncertain learner-model delta is preserved as an append-only in-run history, and a compact summary accompanies later A/B contexts, within the existing data guard. B still owns natural conversation and may probe selectively.
- The fork keeps the older validator, S60 lexical/semantic retrieval, Model L and optional Model C. An old schema-shaped adapter lets B and the existing validator consume the new response. This adapter is not objective scientific validation.
- Matched comparison: same exact frozen DIAG1 learner evidence in both arms; old S62A no-update prompt/schema versus new learner-first prompt/schema. This tests a **combined design change**, not the causal contribution of each instruction separately. The original FIX1A results remain archived.

## Order of use
1. Run read-only preflight and install the single ZIP in the protected experiment worktree.
2. Run `run-s62a-fix1b.ps1 -Task Compare -Mode Plan` (free); default 12 frozen cases / 24 new Model A calls if later authorized.
3. If the plan is acceptable, explicitly run paid `-Task Compare -Mode Model -AllowSpend -BudgetUsd 1.00`; examine independent review and compare with old cases. No automatic scoring.
4. For pipeline checks, run `-Task Journey -Mode Offline -Learner ELLI -Visits 2 -TurnsPerVisit 3 -Retrieval lexical` (free). These replies are **scripted plumbing placeholders**, not a quality test.
5. Only after reviewing matched results, opt into `-Task Journey -Mode Model -Learner ELLI -Visits 6 -TurnsPerVisit 6 -Retrieval semantic -AllowSpend -BudgetUsd 5.00`. Start the local MiniLM embeddings service beforehand. The runner prints a free journey cost plan. Consider MICA, RUNE and TAVI after ELLI results. No paid retries without inspecting partial reports.

## Limitations
- The stage has six curator-authored openers per learner. True 8-visit longitudinal follow-up requires new, independently designed stimuli, so **this patch does not invent visits 7–8**.
- All learners are fictional; private personas are fallible prompts to Model L, not independent ground truth.
- The new learner-first schema is an experimental interface. Field-level parsing, reference integrity and explicit-polarity storage do not establish correctness of a learner hypothesis.
- `no_change` and sparse root creation are not automatic successes; likewise action frequency is not educational quality.
- Positive memory is a compact, append-only **in-run learner-model sidecar** plus the existing legacy root/relationship reducer; a comprehensive production learner-memory migration is deliberately out of scope.
- Local actual usage estimates are not invoices or provider-enforced spend caps. Only paid/model mode makes API requests; `semantic` mode uses a local embeddings HTTP service.
- Reports include simulated dialogue, prior learner evidence, A/B prompts, raw model output, usage, and private research persona appendix; review before sharing.

## Expected stage files
- `scripts/sandbox/learning-intelligence/s62a-fix1b-core.mjs`
- `scripts/sandbox/learning-intelligence/s62a-fix1b-journey.mjs`
- `scripts/sandbox/learning-intelligence/s62a-fix1b-compare.mjs`
- `scripts/sandbox/learning-intelligence/s62a-fix1b-plan.mjs`
- `scripts/sandbox/learning-intelligence/s62a-fix1b-selftest.mjs`
- `scripts/sandbox/v37d2c7a3s62afix1b/{README.md,verify-v37d2c7a3s62afix1b.mjs,installation.json}`
