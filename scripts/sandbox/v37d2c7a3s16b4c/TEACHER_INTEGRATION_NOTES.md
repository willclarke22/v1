# 4C → 4D integration constraints

**4C is not a live voice switch.** The S1.5 shadow teaching route owns a fixed system prompt (`S15_TEACHING_PROMPT`) that requires explaining first, which conflicts with 4C's acknowledgment/closure action. The 4C `proposed_system_prompt` is a design artifact only, not used by any current provider request. 4D must introduce a guarded, local-only opt-in path that uses the proposed prompt, without loosening provider restrictions, introducing a second model call, or editing the production teaching contract.

**Context budget**: 4B's estimated tokens/UTF-8 budget is independent of the current endpoint's 2,500-character `original_statement` constraint and 6,500-byte request limit. 4C checks those *after* selection and returns `BLOCKED_SIZE`; never clip original learner evidence or exact historical correction targets. 4D should re-select within a transport-aware budget and run adversarial tests.

**Expected output**: exactly `teaching_strategy`, `next_step`, `visual_intent`. Model B's `teaching_strategy` is learner-facing; `next_step` and `visual_intent` are internal metadata and must not be claimed as completed. Heuristic checks for canned praise, lecturing or unverified memory changes are **warning-only**, not educational-quality validation.

**Personalization**: 4C defaults interest use to `do_not_use`. 4D alone selects supported profile preferences/interests using existing `personalization_profile_snapshot_v1`, excludes explicit opt-outs, tests analogy validity and prevents repetitive interest use. No inferred memory writes.

**Resolution**: a clarification answer is not automatically resolved; the caller must provide an evidence-supported explicit `RESOLVED_NO_CHANGE` or `REPAIR_PROPOSED_UNAPPLIED`. The latter must not claim an applied repair. Unknown status yields acknowledgment and a needed clarification, not closure.

**Evaluation**: Continue technical-only offline/mock regression during installation. Freeze the comparative test scenarios before any paid calls. After all 4A→4D are installed, compare baseline, improved without interests, improved with conditional personalization, and report measured usage/cost.
