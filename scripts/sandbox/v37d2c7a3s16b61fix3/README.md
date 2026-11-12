# S61-FIX3 — Frozen Evidence Model Comparison

Research-only add-on to the existing S61-FIX2 stage. No S59/S60/S61/FIX1/FIX2 file modifications, no database writes, no UI/API routes, no new reasoning rules.

Purpose: compare an archived GPT-4.1 mini Model A output from the COMPLETE 12-step SAGE FIX1 trace with a fresh GPT-4.1 response to the identical final frozen A input and S60 prompt/schema. A prompts sometimes underwent a first context-expansion call; this experiment replays only the final stored decision input, not any earlier expansion calls. Model B can be examined separately using the same script with `--role B`, but that input contains the original A advisory and original mini-memory trajectory; it is NOT a fully new tutoring journey.

Model-quality evaluation is blinded and evidence-linked. `INDEPENDENT_BLIND_REVIEW.md` includes the two decisions in alternating X/Y order and the exact public observations. `UNBLINDING_KEY.json` supplies model identity only after independent assessment. A valid ID is not scientific validation. Neither zero relationship actions nor agreeing with the baseline is automatically scored good/bad. Source private fictional learner state is never loaded into model inputs or exported.

The runner creates new report directories under ignored `.myway-patch-backups/learning-intelligence-reports/s16b61fix3`. Each paid call requires `--allow-spend` and a positive estimated USD budget; this is not a guaranteed billing cap. Checkpoints retain ambiguous-charge states to avoid silent duplicate calls after process crashes. No API use in `offline` mode. The launcher resolves the most recent complete real SAGE FIX1 trace unless `-TracePath` is provided and automatically packages reports to Downloads.

After reviewing Model A results, optionally compare Model B on frozen input, then use the existing FIX1 `run-fix1-simulation.ps1` for a *separate* controlled GPT-4.1 interactive journey. That later experiment cannot by itself isolate model effects because the learner's trajectory changes.
