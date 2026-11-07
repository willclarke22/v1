# S1.6B.4C — Teaching intelligence and conversational closure (research-only)

Patch 3 of four. Implements a **deterministic instructional action planner**, a **versioned proposed Model B voice prompt**, and a **strict legacy request builder**. No source from 4A/4B or the S1.5 endpoint is edited. Does NOT invoke the model, select user interests, persist profiles, or mutate learner memory.

## Modules

- `s16b4c-planner.mjs`: deterministic action mapping from validated learner intent + 4B context; correction or clarification requires exact historical evidence. Unknown resolution is not closed as resolved.
- `s16b4c-voice.mjs`: concise instruction styles, proposed replacement system prompt for **future 4D opt-in** and a request builder matching the current `CompactTeachingInput` five-field contract exactly. The current endpoint uses a *fixed explain-first prompt*: passing this context alone does NOT switch the system prompt or prove the improved voice works.
- `s16b4c-types.ts`: types linked to 4A/4B; no new persistent teaching/profile schema.
- `s16b4c-fixtures.json` and `s16b4c-selftest.mjs`: offline structural cases in biology, law, medicine, physics, coding and writing; mocked three-field teacher outputs. No provider evaluation.

## Safety and cost

- Do not claim a database rewrite or demonstrated learner understanding from a reported preference/progress.
- Quote learner/history evidence as untrusted data. Reject missing historical correction targets.
- Do not truncate exact evidence or learner text to satisfy size limits; return `BLOCKED_SIZE` for 4D to resolve with reviewed context selection.
- All 4C personalization decisions are `do_not_use`; 4D will provide evidenced selections and anti-distortion checks.
- Single eventual Model B inference intended; current existing teacher endpoint is not switched in 4C.

## 4D continuation

4D wires the assembled 4A→4C output behind an **explicit local research opt-in**, resolves fixed system-prompt limitations without weakening endpoint guards, implements evidence-grounded profile/interest selection, and prepares a frozen cross-domain evaluation. Paid comparison after all A–D are installed and the user opts in.
