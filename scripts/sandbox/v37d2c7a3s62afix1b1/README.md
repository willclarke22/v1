# S62A-FIX1B.1 — pinned RUNE continuity and evidence-reference reliability

Research-only; add-only to the experiment worktree. Original S62A, DIAG1, FIX1A and FIX1B are not changed. No production memory, API routes, databases, or Vercel deployments.

## What this fixes

The original RUNE experiment stopped during Model A's 21st response after 20 completed turns because a learner-first demonstrated-evidence citation failed the allowed-ID check. That response was not retained. The source history includes the *uncommitted* step-21 learner observation. Simply rerunning FIX1B would spend money recreating its first 20 turns.

This stage provides an **exact-checkpoint resume** from the supplied original RUNE ZIP only. It pins the original ZIP and `trace.json` hashes, validates options, schedule and checkpoint, reconstructs the prior 20 observed turns and 58 calls, discards exactly one uncommitted step-21 observation before replaying that step, and continues through the remaining 16 turns.

The runner also filters non-citable historical IDs from bounded `learner_model_summary` entries, records raw rejected Model A responses and cited/offending IDs, and optionally permits **at most one extra Model A reference-correction request for the entire resumed run**. It never silently treats an invalid ID as valid or changes a learner's scientific assessment to satisfy tests.

## Guardrails

- `-Mode Plan` has zero API/embedding/DB calls. It checks the exact previous report and gives an estimate for remaining turns.
- `-Mode Model` requires `-AllowSpend` and a separate, additional `-BudgetUsd` authorization (not a hard provider billing cap). It uses the pinned previous report and does *not* regenerate the first 20 turns.
- A one-shot local attempt marker prevents accidental repeated paid continuation. If the attempt fails, inspect the new partial report before deciding whether another patch or carefully reviewed retry is needed.
- Local semantic retrieval still requires `127.0.0.1:8001` when running the model. Original privacy and Model L isolation protections remain.
- Reports save in ignored local `.myway-patch-backups/learning-intelligence-reports/s62a-fix1b1` and are ZIPped into Downloads. Reports contain simulated learner dialogue and potentially raw rejected model output; review before sharing.
- This is a software reliability patch, not evidence that Model A understands RUNE, that roots are scientifically valid, or that teaching improves real learning.
- No new database. Existing source files are not modified; the patch introduces a separate fork runner, helper, plan, selftest, stage verifier and README.

## Diagnostic files

`trace.json` preserves old and resumed timeline, calls, and cost; `RESUME_AUDIT.json` separates original and new calls/spending, original failure and resumed step; `REJECTED_MODEL_A.json` preserves raw rejected responses, allowed IDs, cited IDs and invalid citations. All unscored.

## Expected test sequence

Verify original report checksum and run free plan. Confirm local embedding service is healthy. Run model continuation only with budget and explicit spend authorization. Upload the resulting report ZIP; review actual Model A/B/L turns, memory actions and remaining quality issues before running new learners.
