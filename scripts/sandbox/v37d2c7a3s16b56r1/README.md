# MyWay S1.6B.5.6-R1 — minimal unified-journey correction

Research only. This is an **add-only** successor to S56. S54, S55, S55-R1 and S56 source files remain unchanged; no database writes, Git operations, product integration, visualization rendering or paid API calls occur during installation.

## Why this patch

The real-model 9-turn transcript produced two plausible Model C `distinct` proposals that were held only because their rationales were 378 and 383 characters, exceeding S56's 350-character output validation. This is a formatting failure, not a supported claim that the identity judgments were semantically wrong.

* `s16b56r1-journey.mjs` preserves S56's model-first design and evidence/anchor checks, raising the rationale input-hygiene limit from 350 to 2,000 characters. It does **not** treat any model proposal as automatically semantically correct.
* Historical retrieval data in `events[].retrieval_for_tutor` and `events[].retrieval_for_C` is deep-copied when recorded, preventing later writes to the in-process root observation array from appearing in earlier events. Historical visual proposal and commitment observations are also frozen.
* Summary fields now distinguish `held_turns` (all turns with held proposals), `guard_rejections` and `guard_rejection_reasons` (software-rejected proposals), `unresolved_identity_holds` (recorded uncertain identity holds), and `transient_held_turns` (held at a turn but not stored in unresolved-hold state). Existing `holds` remains an alias for `unresolved_identity_holds` for comparison with S56. There is **no automatic repair of old traces**.
* Research outputs are saved separately under `.myway-patch-backups/learning-intelligence-reports/s16b56r1/`. No changes to the S56 output folder.

## Commands after installation

Offline (no provider calls):

`node scripts/sandbox/learning-intelligence/s16b56r1-journey.mjs --mode offline --limit 12 --history resumed --retrieval lexical`

Offline semantic (requires local embedding server; no paid calls):

`node scripts/sandbox/learning-intelligence/s16b56r1-journey.mjs --mode offline --limit 12 --history resumed --retrieval semantic`

Optional real-model research **only with explicit user approval** and the `OPENAI_API_KEY` already loaded in the PowerShell environment:

`node scripts/sandbox/learning-intelligence/s16b56r1-journey.mjs --mode model --limit 9 --history resumed --retrieval semantic --learner model --personalization on --allow-spend --budget-usd 0.40`

The model admission estimate is **not** an actual billing ceiling. If using `--retrieval semantic`, run the local service separately:

`python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001`

## Interpretation

The nine-turn historical paid trace and scripted learner are research evidence, not correctness oracles. Source quotations are evidence; Model A/C outputs are provisional interpretations; retrieval suggests candidates; software guards validate structure and exact IDs only. Real learner quality and mastery are unproven. S56-R1 does not change tone, relationship scoring, visual generation, teaching prompts, semantic thresholds, or production integrations.
