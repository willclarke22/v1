# Unified MyWay direction and readiness criteria

## Separation of responsibilities

1. **Model B conversation:** raw learner utterance; previous user + tutor utterances, in order; bounded relevant historical difficulty evidence; minimal teaching prompt; optional explicitly supplied preference. Let the model naturally clarify, teach, correct course or test understanding. No mandatory action class.
2. **Model A assessment:** a soft hypothesis about topic, root problem, quote provenance, and uncertainty. Must not invent evidence or force a reply.
3. **Retrieval + Model C:** find candidate existing roots; evaluate same / distinct / uncertain. Preserve original root identity and quotes; new evidence belongs to a history of observations, not an overwrite.
4. **Provisional memory:** in-memory topic/root/evidence state for simulation only. Holds and uncertain decisions are observable. Real persistence requires separate authorization, security policies, audit, and validation.
5. **Relationships:** cross-topic proposals can emerge when the learner explicitly compares mechanisms. They are not proof that two root problems are the same.
6. **Voice / personalization:** minimal stable tutor guidance. Apply a known learner preference only if explicitly selected, and never distort mechanism or force an analogy.
7. **Visualizations:** propose an educational diagram only when requested in this milestone. No render or 3D product integration; projection data contains placeholder positions only.

## What works now

- Same-learner chronological history across 12 research-authored turns and three simulated sessions.
- Different independent research roles for A/B/C, with fully mocked model-mode tests and an explicit opt-in live-provider mode.
- Exact-source learner observations, unverified root identity proposals, conservative holds, cross-topic hypothesis, optional visual proposal, local reports, and per-role paid-cost telemetry.
- Source-hash-pinned guarded installer, no original-v1 modifications, no production API modifications, regression checks and rollback.

## What is not yet verified

- Realistic learners generating each next utterance in response to the model (scripted learner turns are fixed).
- Educational quality of real-model A/B/C in a full journey (offline uses script/lexical substitutes; provider-mode requires review).
- Correct semantic identity across a broad topic history (lexical retrieval in this milestone, not MiniLM index or Supabase retrieval).
- Interoperability with the actual Learning Space browser UI, durable root schema, semantic 3D projection or asset generator.
- Reliable longitudinal mastery claims, personalization benefit, background scheduling, automated error self-correction or actual graph updates.

## Future validation before wiring into Learning Space

1. Offline run for all 12 turns: preserve every verbatim quote; review rooted topics/holds, relationships and visual requests.
2. Small real-model study: verify model outputs from A/B/C and learner-facing B; inspect all costs and exact input histories.
3. Interactive learner simulator or consenting real users: subsequent user messages actually respond to generated MyWay replies; stress ambiguity and mistaken assumptions.
4. Replace lexical offline candidate ranking with evidence-bounded real semantic retrieval while keeping same/uncertain gates; measure false merges and omissions.
5. Independently compare memory proposals against labeled reality and verify no unsupported mastery claims.
6. Test visuals: scientific validity, learner usefulness, responsiveness; preserve optional nature.
7. Only then design a separately reviewed browser integration with authorization, persistence audit and rollback plan. Keep old Learning Space working until shadow comparisons show sufficient quality.
