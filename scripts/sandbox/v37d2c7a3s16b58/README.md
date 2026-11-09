# MyWay S1.6B.5.8 — Curated 30-topic seeded learner experiment

**Research only. No actual learner, DB writes, app integration, deployed renderer, or claims of mastery.** Additive on top of S57-R1; old stages remain untouched.

## Why this exists
The older S57-R1 journey created an empty memory state, then reasoned about a 12-turn synthetic scenario. This experiment instead begins with one **fictional learner's** six prior quoted observations, two competing underlying-cause root hypotheses, and one learner-specific relationship hypothesis. All 30 curriculum topics and 44 curriculum links are available, but those links are **not claims about the learner**. Model A/B/C receive only public learner history, not the hidden simulator state or evaluator scoring rubrics.

## Key terms
- **Root cause hypothesis:** a provisional, learner-specific explanation of why this learner may be struggling; distinct from the question, generic gap or topic.
- **Learner relationship:** an observed or possible individual pattern of understanding/transfer between contexts, backed by historical learner evidence; distinct from curriculum links.
- **Probe:** a question/activity that could elicit evidence. This stage recommends curated probes, but does **not** automatically administer or score catalog probes. The existing S57-R1 chemiosmosis interactive activity remains the only fully simulated scene, when organically triggered.
- **Personalization:** provisional. Historical claimed preferences are *not* invented. Evidence from a single scene never establishes stable learning-style or teaching preference.

## What is installed
- `scripts/sandbox/learning-intelligence/s16b58-fixtures/`: complete nine JSON files from the curated v1 set, including visible public content and **two private researcher files**. Do NOT feed `learner_simulator_PRIVATE.json` or `probe_scoring_PRIVATE.json` into Model A/B/C; the adapter does not.
- `s16b58-fixture.mjs`: validated fixture loader, public historical seed, three fresh twelve-turn synthetic scenarios, optional probe suggestions.
- `s16b58-journey.mjs`: additive copy of S57-R1 runner with seeded history, private state only in synthetic learner L prompts, separate audit and report names; no modifications to S57-R1 runner.
- `s16b58-selftest.mjs`: three offline learner fixtures + mocked A/B/C/L call separation, no real provider/network/DB calls.

## Read-only/offline initial experiments
```powershell
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
node scripts/sandbox/learning-intelligence/s16b58-journey.mjs --mode offline --limit 12 --learner-id LEARNER-A --trial-id T01 --history resumed --retrieval lexical --activity simulated --activity-profile needs-feedback
node scripts/sandbox/learning-intelligence/s16b58-journey.mjs --mode offline --limit 12 --learner-id LEARNER-B --trial-id T02 --history resumed --retrieval lexical --activity simulated --activity-profile needs-feedback
node scripts/sandbox/learning-intelligence/s16b58-journey.mjs --mode offline --limit 12 --learner-id LEARNER-C --trial-id T04 --history resumed --retrieval lexical --activity simulated --activity-profile needs-feedback
```
No credentials required, and offline tutor output is scripted plumbing, not measured learning intelligence. In each run, the synthetic learner's public history is seeded. `--trial-id` MUST belong to the selected learner.

## Later real-model research (optional; not run by installer)
Load `OPENAI_API_KEY` privately into your terminal as in previous paid experiments. Start local embedding service on port 8001. Then, for example:
```powershell
node scripts/sandbox/learning-intelligence/s16b58-journey.mjs --mode model --limit 12 --learner-id LEARNER-A --trial-id T01 --history resumed --retrieval semantic --learner model --activity simulated --activity-profile needs-feedback --personalization on --allow-spend --budget-usd 0.40
```
Research only; GPT-4.1 mini model calls billed, admission budget NOT a billing cap. Private synthetic knowledge state is delivered only to Model L. All output stays in `.myway-patch-backups/learning-intelligence-reports/s16b58`.

## Important limitations
- The private simulator hints are synthetic dispositions, not a reproducible or truthful human psyche. They can bias responses; assess results against visible evidence.
- 30 topics are available; this does not mean the learner studied or mastered them. The seeded two root hypotheses are provisional and include plausible alternatives/counterevidence.
- Suggested catalog probes are `offered:false`, `attempted:false`, `scored:false` unless a future explicit probe runner changes this; do not count them as completed probes.
- The S57-R1 scene remains a single fixed chemiosmosis template; this stage does not turn the other 11 scene outlines into renderers.
- Ordinary root-memory decisions still use existing S57-R1 Model C semantics; roots are not autonomously rewritten to revise their hypothesized causes. That is what the next evaluation needs to investigate.
- No production, Supabase, Vercel, Git commits/pushes, external learners or authoritative learner records touched.
