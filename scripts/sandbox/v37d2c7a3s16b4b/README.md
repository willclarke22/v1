# S1.6B.4B — Context Intelligence (research overlay only)

**Stage 4B of the frozen 4A→4D milestone.** No provider calls or live model-prompt changes; S1.6B.3 remains the active research teaching runner until integration after 4D. The patch is purely additive.

What is implemented:
- `selectRelevantTeachingContext` consumes the validated 4A envelope, retaining current learner statement and assessment as *separate* first-class inputs.
- Source-labeled, relevance-ranked selection favors the exact historic correction target (identified by external, trusted event ID/turn ID) rather than blindly selecting recent events.
- Historical quotes remain intact or are omitted with a reason; no cut-off excerpt can silently reverse a statement's meaning.
- If a required target is absent, excluded or unverified as historical learner evidence, a correction fails closed with `NEEDS_TARGET_EVIDENCE` and **empty context**. If required context is too large, `NEEDS_BUDGET` requires escalation, not fabricated context.
- Optional evidence is selected by deterministic lexical/topic overlap, source relevance and diversity. This is a *retrieval heuristic*, not an independently verified semantic relevance score. It is insufficient to authorize memory repair.
- History is JSON-quoted with evidence IDs, turn/difficulty IDs, source type and an untrusted-data banner; it must never be used as instructions or proof of learner mastery.
- `reported_progress` remains separate from `demonstrated_understanding`. Canonical difficulty may appear as distinct stable history; profile signals and interests are intentionally **not selected in 4B**.
- Two accounting controls: a rough `ceil(UTF-8 bytes/3)` **estimate**, and a deterministic `3 × token target` raw-byte ceiling. These DO NOT guarantee provider-token or price limits; provider usage is to be measured in 4D.
- Every candidate omission has a machine-readable reason, including missing historical anchors, unsupported attribution, duplication, relevance, byte/token budgets and diversity. Caller must check `status` and `audit.requiresHumanReview`.

Default supplemental targets are inherited from 4A (650 estimated tokens ordinarily; up to 1,200 for a correction). They exclude current message/assessment and system/output prompt overhead. Context rendering is for later 4C/4D integration, **not wired into Model B**.

Testing: `node scripts/sandbox/learning-intelligence/s16b4b-selftest.mjs`. Four cross-domain fixtures plus adversarial exact-target, absent-target, long quote, prompt-injection formatting, provenance, learner progress, Unicode, determinism and budget tests. Tests require no local Next.js, embeddings service, API key or Supabase.

**Next stage: 4C**, single-call teaching action/voice planning, purposeful correction and clarification closure, no paid comparisons yet. **Then: 4D**, existing-schema personalization, final experimental integration and frozen benchmark. Run a coordinated paid comparison only after 4D and explicit opt-in.
