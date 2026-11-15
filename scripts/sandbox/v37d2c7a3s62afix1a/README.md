# S62A-FIX1A — Paired Frozen Model A Assessment Comparison

**Research only. This stage does not change Model A's production, S62A, or DIAG1 code or authoritative learner memory.**

## Question
Does clarifying Model A's learner-understanding / action-semantics instructions help it (1) recognize implicit improvement, (2) distinguish historical vs current confusion, (3) distinguish learner-specific causes from topic errors, (4) preserve alternative explanations and appropriate uncertainty, (5) avoid stale-root anchoring and forced links, and (6) select memory actions consistent with evidence polarity?

## Scientific controls

* Both fresh arms use the **same archived model input, learner, retrieval packet, schema, max output tokens, model name, and S62A no-update instruction**.
* Only the candidate arm gets additional, explicitly labeled clarification. No invented knowledge labels or automatic winner.
* Each of six preselected DIAG1 cases has two new paid calls (12 calls default), order switched deterministically by case ID, no random seed assumed.
* Default mixed selection includes problematic SAGE/MICA/ELLI cases and a useful no-action reference.
* The immutable DIAG1 frozen report must have SHA256 `6c094853308fc85ed79a3cf9628945ed124f7ec02d330a3adde6f128b8c87be3` or the tool fails before spending.
* The original historical Model A response remains attached to each case only for context; it is not treated as the freshly paired control.
* Diagnostic summaries flag structural/reference integrity and potential evidence-polarity conflicts. These flags are **not educational correctness judgments**.
* The report contains full new model requests and responses with provider usage (no credentials), blinded review worksheet, and arm-assignment key. No DB writes, no embeddings and no new simulated learner conversations.

## Procedure

1. Install the stage ZIP with `run-preflight.ps1` then `run-install.ps1`, preserving the previous research branch and DIAG1.
2. Free planning: `run-s62a-fix1a.ps1 -Mode Plan` (no network or spend; enumerates cases and estimated admission).
3. Optional new paid experiment: `run-s62a-fix1a.ps1 -Mode Model -ModelA gpt-4.1-mini -AllowSpend -BudgetUsd 0.25`; original API key remains in ignored `.env.local` on the user's machine. No key must be pasted or included in reports.
4. This generates a new ZIP in Downloads. Review `BLINDED_REVIEW.md` before `VARIANT_KEY.json`, then inspect `RESULTS.json` and original DIAG1 case dossiers.
5. If needed, run a **separate explicit experiment** with `-ModelA gpt-4.1 -BudgetUsd 1.00 -AllowSpend`; do not automatically assume the larger model wins.

Budget is an **admission planning estimate**, not a hard provider billing cap, and the adapter does not retry ambiguous failures. A timeout can still incur charge. Current prices are imported from committed `s16b61fix1-models.mjs`, which may no longer match the provider billing schedule.

## Protection

Everything is add-only under `scripts/sandbox/`. No production routes, schema, Supabase, topic data, embeddings, other worktrees, or env files are changed. Installer is preflight-guarded and rollback-enabled. Reports live in ignored `.myway-patch-backups/learning-intelligence-reports/s62a-fix1a` and are zipped by the PowerShell launcher. Never claim improvements without independently reviewing the paired outputs and checking the root reasoning, action consistency and evidence available.
