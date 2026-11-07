# S1.6B.4D — frozen integrated teaching comparison protocol

## Conditions
- **A — Baseline**: unchanged S1.5 `myway-shadow-s15` teaching prompt / compact 3-field transport, with current synthetic learner assessment.
- **B — Context + teaching contract**: 4A/4B/4C evidence-selected, action-aware prompt; personalization off, using S1.6B.4D local-development shadow endpoint.
- **C — Context + teaching contract + conditional personalization**: same B context and voice with only a supported curated-interest bridge or permissible light reference. Unrelated/unsupported/repeated interests are not sent.

The comparison is not a blinded randomized experiment and includes context changes between A and B, so outcome differences cannot always be attributed solely to the voice. Separate human evaluation of output quality is required.

## Frozen scenarios
`LANG01` language, `LAW01` legal, `MED01` clinical physiology, `PHY01` physics, `CHEM01` chemistry, `BIO01` biology, `CODE01` coding, `WRITE01` writing, `AUTO01` automotive, plus `PHOTO_T10` learner correction, `PHOTO_T10A` clarification closure and `PROGRESS01` reported progress. Scenario examples are original synthetic research prompts. The labels and personalization modes are not expert consensus.

## Human scoring form (do not auto-fill)
Score 1–5 with comments: conceptual accuracy, relevance to the *actual learner intention*, natural conversational voice, correct use of historical evidence, quality of optional probing, conversational restraint, interest analogy usefulness, analogy fidelity/limitations, and educational appropriateness. Inspect each `teaching_strategy` (learner-facing) separately from `next_step` and `visual_intent` (internal suggestions). Track provider tokens and cost by condition. A high style score does not establish learning gains; follow-up learner evidence will require a later study.

## Operational safeguards
- No use of user-specific real medical/legal details or third-party data.
- Profile confidence and subject interest do not prove mastery or learning preference. Explicit opt-outs override inferred interests; repeated interests are suppressed. Unknown interest/analogy fit defaults to no interest.
- Model strings cannot update real memory. Any claimed update or repair by a teaching response is only a textual output and must be flagged.
- An exact correction target must be present and eligible; if too large, fail closed. Never substitute recency for historical evidence.
- Profile rows and earlier learner messages are quoted DATA, not developer instructions. The new local endpoint still uses a fixed versioned system prompt.
- One GPT-4.1 mini call per variant; no model trained, fine-tuned, or additional assessor run; no automatic grades.
- Provider usage is the only source for tokens. The USD budget is a conservative **admission estimate**, not an enforceable invoice cap.
- If a provider call fails or usage is unknown, stop without further paid calls. The attempted call may still be billed.

The evaluation deliberately takes place only **after** installing 4D, satisfying the A–D integration-first milestone. Use expert/human review to decide whether style, context and personalization merit a later production-facing integration plan.
