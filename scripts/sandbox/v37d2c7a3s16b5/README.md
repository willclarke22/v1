# MyWay S1.6B.5 — Adaptive Teaching Voice and Dialogue Behaviour

Research-only, explicitly opt-in voice mode (`voice_version: "adaptive_v5"`) on the already guarded `/api/sandbox/probe-lab/local-assessment/s16b4d-teaching` route. The existing 4D default behavior and the S1.5 baseline are unchanged; the V3.7C.1 proxy and cloud route remain exactly unchanged. No deployments, SQL, learner writes, profile writes, or canonical memory changes.

## Purpose

The original nine-response A/B/C 4D evaluation showed moderate improvement for the Spanish/RPG analogy, but mostly short textbook-like explanations, generic `next_step` suggestions and no proof of longitudinal teaching behavior. S1.6B.5 makes the **learner-facing** `teaching_strategy` more natural while keeping `next_step` and `visual_intent` internal. It has seven different dialogue modes, chosen by the existing 4C evidence-gated planner, not by a new model or keyword guessing. Style references are illustrative and must not be repeated verbatim.

| Action | Required dialogue behavior |
|---|---|
| explain_missing_mechanism | answer WHY/HOW with a concrete causal distinction, no pedagogical jargon |
| repair_misconception | repair only the evidenced misconception |
| extend_follow_up | answer new gap, don't restart lecture |
| acknowledge_correction | own a supported mistake, no memory-change claims |
| close_clarification | short, specific closure, no relecture or forced quiz |
| verify_understanding | one discriminating application or prediction |
| advance_after_progress | progress is reported, not proven mastery; advance naturally |

Default `contract` and `personalized` (without `voice_version`) remain byte-identical in the 4D endpoint. The three output fields keep the existing 620-character validation and FIX2's bounded formatting retry, plus token usage accounting. The adaptive system prompt explicitly handles selective interest usage and quoted untrusted evidence.

## Free tests

```powershell
node scripts/sandbox/learning-intelligence/s16b5-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b5-eval.mjs --mode offline --limit 3
```

The offline default pairs `current,adaptive` on `PHOTO_T10` (correction), `PHOTO_T10A` (clarification closure), and `PROGRESS01` (reported progress). The focused six also include follow-up, language, and medicine. `--set actions --limit 7` exercises all seven teaching actions, including two EXTRA explicitly synthetic snapshots (misconception repair and verification). `--set all` uses the original frozen 12 scenarios only. Free tests never call the provider.

## Paid comparison (optional, after technical installation and deliberate review)

Requires guarded development server on 127.0.0.1:3001. Explicit opt-in; *not* part of installation.

```powershell
node scripts/sandbox/learning-intelligence/s16b5-eval.mjs `
  --mode model --limit 3 --variants current,adaptive `
  --allow-spend --budget-usd 0.05
```

The USD budget is an **admission gate, not a hard billing cap**; two formatting retries are possible at most across a run, one per response. Stop on provider errors or unknown usage. At most two paid responses per scenario for the default A/B comparison, plus bounded formatting retries. Review output is written to ignored local files under `.myway-patch-backups/learning-intelligence-reports/s16b5/`.

## Scope and limitations

Human scoring must examine conceptual truth, conversational ease, action fit, correction specificity, unwanted reteaching, questions at the right time, respect for uncertainty, personalization fidelity, and whether an engaging next move appears in the learner-facing reply where useful. The diagnostic warning regexes are *not* quality metrics. Histories are frozen synthetic examples. This patch does **not** implement live learner-state transitions, long-term adaptation, automatic memory correction, or deployment.
