# MyWay S1.6B.3 — Learner intent and correction resolution

This is an **additive, isolated research overlay** to S1.6B.2. It does not change browser code, local release marker, source prompts, production endpoints, Supabase, original `v1/main`, or Git. Reports are written only to ignored local `.myway-patch-backups/learning-intelligence-reports/s16b3/`.

## What changed

- Infer a **heuristic conversational intent**: new difficulty, follow-up, reported progress, explicit correction, clarification answer. Labels are NOT certified semantic judgments.
- Send Model B a compact intent-specific instruction and at most two recent exchanges (600-char S1.6B.1 context). For corrections, instruct natural acknowledgment *before* teaching and do not assert an unperformed memory repair.
- Avoid Model A and C calls on corrections/clarification answers; use B to acknowledge and respond; revisit memory with evidence instead of inventing new roots.
- Distinguish a false-alarm clarification (preserve memory) from a deliberately injected wrong event identity (offline-only reversible relink, evidence gated; NOT independent AI verification).
- Include a genuinely more specific Calvin-cycle difficulty as a positive refinement example, alongside an unnecessary refinement that is suppressed. Canonical roots remain unchanged by proposals.
- Record full conversational transcript, teacher responses, intent reasons, correction evidence, before/after revision audit and estimated model cost.

## Run

From the experiment worktree:

```powershell
node scripts/sandbox/learning-intelligence/s16b3-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b3-journey.mjs --mode offline --scenario full --limit 10 --inject-fault
```

Real model, after starting guarded local Next.js (:3001) and embeddings (:8001):

```powershell
node scripts/sandbox/learning-intelligence/s16b3-journey.mjs --mode model --scenario continuity --limit 4 --model gpt-4.1-mini --allow-spend --budget-usd 0.12
```

For the *separate*, narrower historical correction scenario (paid, research-only, no repair applied):

```powershell
node scripts/sandbox/learning-intelligence/s16b3-journey.mjs --mode model --scenario repair --limit 5 --model gpt-4.1-mini --allow-spend --budget-usd 0.12
```

The real-model run retains the existing S1.6A hard cap of **6 visits**, model whitelist, explicit opt-in and admission-budget validation. A budget is **not** a provider billing cap. No real model run in this ZIP applies a historical correction. `--inject-fault` is **offline only**.

## Limitations

Teaching responses are only *prompted* toward MyWay voice and require human accuracy and style review. A deterministic style flag is not a naturalness score. Learner replies are preauthored fixture messages; there is no autonomous learner simulation. Correction-target rankings and repair conditions are lexical/explicit-user-evidence checks, not independent semantic truth. The example offline relink is applied only to **synthetic in-memory JSON**, with an auditable inverse operation. No real memory or relationships change.
