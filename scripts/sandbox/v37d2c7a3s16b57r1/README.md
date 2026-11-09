# MyWay S1.6B.5.7-R1 — realistic interactive evidence loop

**Additive research stage**. All S54/S55/S56/S57 source, application routes, Learning Space, Vercel and Supabase remain unchanged. No SQL, DB writes, production integration, model calls during installation, commit or deployment.

## Changed research behavior

- A supported chemiosmosis learning scene is offered only when the in-process dialogue has enough relevant context. Model B can decline to offer; there is no enforced scene every session.
- The offer text is appended to the learner-facing transcript, with a separate simulated **accept/decline** before any action answers. A decline is not scored as failure.
- Simulated learner Model L can use `adaptive` or a **synthetic belief seed** (`needs-feedback`, `persistent-error`, `correct`, `decline`). These are deliberate research interventions, not estimates of human behavior or a true oracle.
- The scene is still compiled from the preserved S57 chemiosmosis contract; it contains spatial nodes, four controls, private deterministic action scoring and explicit renderer metadata (`NOT_RENDERED_SIMULATED`). The scene is not actually displayed and is NOT a generic scene generator.
- A correct second attempt after tutor correction is recorded as feedback-assisted, not independently proved learning. Model A sees scored choices/explanations, returns an advisory next move; Model B receives this whole interpretation immediately, not only the final score. The next turn also receives an explicit untruncated compact activity brief.
- Summaries count invalid normal assessments and invalid task assessments separately from memory holds. Learner relationship and approach hypotheses stay provisional, no stable preference or mastery inferred from one synthetic activity.
- Existing Model C root routing and model-first tutor remains intact. The activity evidence stays in a separate research-only in-process log for later root/relationship/personalization study.

## Offline tests (zero paid calls)

```
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
node scripts/sandbox/learning-intelligence/s16b57r1-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b57r1-journey.mjs --mode offline --limit 12 --history resumed --retrieval lexical --activity simulated --activity-profile needs-feedback
node scripts/sandbox/learning-intelligence/s16b57r1-journey.mjs --mode offline --limit 12 --history resumed --retrieval lexical --activity simulated --activity-profile decline
```

Other controlled paths: `correct`, `persistent-error`. The emitted offline conversations remain scripted and do **not** prove pedagogical adaptation by GPT-4.1 mini. Compare evidence and the new `S16B57R1_TEACHING_ADAPTATIONS.json` output.

## Optional paid research (user authorization required)

Have the **existing** `OPENAI_API_KEY` in the environment (load from `.env.local` without printing), and for semantic retrieval run the existing local embedding service on `127.0.0.1:8001`. Example:

```
node scripts/sandbox/learning-intelligence/s16b57r1-journey.mjs --mode model --limit 12 --history resumed --retrieval semantic --learner model --activity simulated --activity-profile needs-feedback --personalization on --allow-spend --budget-usd 0.40
```

The `--activity-profile needs-feedback` option cues a **fictional learner belief**, not answer correctness. Default `adaptive` allows the synthetic model to choose without a seeded misunderstanding. Admission checks are not hard invoice caps.

## Generated research files

`.myway-patch-backups/learning-intelligence-reports/s16b57r1/<run-id>/`

- `S16B57R1_INTERACTIVE_TRANSCRIPT.txt`: entire learner/tutor trace, separate offer and interaction details.
- `S16B57R1_SCENE_PROPOSALS.json`: preserved renderer-oriented contract with spatial objects, controls, and states.
- `S16B57R1_INTERACTION_EVIDENCE.json`: per-task actions, independent scores, model interpretation, provisional learner-specific connections and teaching hypotheses.
- `S16B57R1_TEACHING_ADAPTATIONS.json`: proposed immediate adaptation, evidence status and Model A use.
- `S16B57R1_MEMORY_TIMELINE.json`, `S16B57R1_LEARNING_SPACE_PROJECTION.json`: previous conversational state; activity evidence is intentionally not written as authoritative root changes.
- `trace.json`: full machine-readable trace with counts for Model A rejects.

## Limits

The scene remains an authored visual template and target IDs are semantically meaningful; a strong synthetic learner may score perfectly even without seeing a rendered diagram. The activity is not real user feedback, a valid experiment proving a medium preference, a learning gain, or an evaluation of visual generation quality. The source remains additive and safely reversible until committed/staged or changed.
