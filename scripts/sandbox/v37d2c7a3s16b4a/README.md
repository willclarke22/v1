# MyWay S1.6B.4A — foundation and interface contracts

Research-only additive overlay. No model requests, provider endpoints, Supabase access, profile writes, database writers, release-pointer changes, or changes to S1.6B.3 behavior.

This stage deliberately **does not** perform context ranking, interest eligibility, dynamic prompting, teaching generation, or real-model tests. Those belong to 4B/4C/4D. Installing 4A cannot improve the existing Model B voice by itself.

## Source-of-truth compatibility
- `lib/engine/schemas/shared.ts`: existing `personalization_profile_snapshot_v1`, `PersonalizationSignal`, `ExampleDomainSignal`; avoid creating parallel durable profile structures.
- `sandbox/probe-lab/visual-experience/visual-learning-turn.ts`: `VisualPersonalizationDecision` with `structural_bridge | light_tone | do_not_use`; candidate decisions remain unverified.
- `sandbox/probe-lab/visual-experience/visual-learning-turn-request.ts`: full-prompt teaching philosophy; borrow flexible construction principles, not visual renderer responsibilities.
- `sandbox/probe-lab/learning-space/myway-shadow-voice-s15.ts`: compact three-field teaching contract; S1.6B.3 continues to use that endpoint unmodified.
- `scripts/sandbox/learning-intelligence/s16b3-intent.mjs`: established learner-intent values and correction-closure logic.

## Files
- `s16b4a-teaching-contract.mjs`: versioned voice/action/interest policy *specification*, not installed as a provider prompt.
- `s16b4a-types.ts`: typed interfaces that reference the existing personalization and visual-turn types (type-only).
- `s16b4a-interfaces.mjs`: runtime profile adapter and fail-closed envelope/output validation. Does not rank/compact context or apply model decisions.
- `s16b4a-selftest.mjs`: isolated deterministic contract tests, no API or database access.
- `S16B4_FROZEN_PLAN.md`: agreed implementation sequence, boundaries and final evaluation matrix.

## Technical test (not a teaching-quality evaluation)
`node scripts/sandbox/learning-intelligence/s16b4a-selftest.mjs`

## Future milestones
- 4B: audited relevance-aware context selection and token budgeting.
- 4C: instructional planner and natural MyWay voice, correction closure, no fourth model.
- 4D: opt-in personalization selection and complete test harness; then **one** coordinated paid/qualitative comparison.

Source inventory was reviewed against the user-provided Nov 5, 2026 source dump. Source dump predates later overlays; dependency hashes and previous overlay receipts are checked at installation. Do not promote reference workbook prompts to validated gold truth without review.
