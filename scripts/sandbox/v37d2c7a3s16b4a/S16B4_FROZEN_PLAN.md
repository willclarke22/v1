# S1.6B.4 — coordinated milestone (frozen implementation boundaries)

Goal: Model B makes the correct teaching move, uses relevant evidence, sounds natural, and personalizes only when helpful; no second durable personalization schema. GPT-4.1 mini remains the default model. S1.5–S1.6B.3 memory restrictions remain in force.

| Patch | Additive responsibility | Gate before proceeding |
| --- | --- | --- |
| **4A — Foundation** | Canonical teaching style/action vocabulary, existing-schema adapter, evidence-aware context and plan types, explicit compatibility with 3-field Model B output | Install source hashes; static syntax/TypeScript; pure selftests + old regressions. No paid calls. |
| **4B — Context** | Relevant history candidates; exact corrected event first; recency only when relevant; exclusion reasons; budget by task; provenance and token estimates | Offline adversarial context fixtures, omitted-history audit, token bounds; preserve old modules. No paid calls. |
| **4C — Teaching** | Single-call instructional plan + teaching response; natural voice; correction acknowledgment/closure; selective analogy, one meaningful probe when needed | Mocked provider schema and behavior contract cases; no production prompt switch. No paid calls. |
| **4D — Personalization/integration** | Scope/evidence-aware profile projection, interest relevance/anti-distortion/repetition, complete experimental runner and frozen cross-domain evaluation set | All regression tests, source integrity, no writes. Then ONE controlled paid A/B/C comparison with user opt-in. |

## Shared invariants
1. Target is `v1-learning-experiment` on `myway/learning-sandbox-v3_7a`; original `v1/main` remains at full pinned commit `462a7a4b6ce8b2b20a91021acca716307f4aa2d1`.
2. All code remains an isolated local research overlay until reviewed; no production API, database writes, automatic deployment, Git mutation or model billing during install.
3. A/B/C model roles remain distinct. Shared logical stages are not extra paid model invocations by default.
4. Current learner statement is first-class; historical assertions, reported progress, demonstrated progress, hypotheses, and model output carry separate provenance.
5. User interests do not automatically imply a teaching preference or a useful analogy. Explicit opt-outs override inferred signals. Profile changes require separate learner-outcome evidence and a reversible update path.
6. Interest decision modes reuse existing visual full-turn taxonomy (`structural_bridge`, `light_tone`, `do_not_use`) and strict anti-distortion notes.
7. Current Model B endpoint and exact `teaching_strategy`,`next_step`,`visual_intent` response schema stay stable during A–C; integration behind explicit opt-in only in D.
8. Initial **experimental** supplemental targets are ~650 tokens ordinary and up to 1,200 for corrections; 4B will implement actual context inclusion/token accounting. Nothing in 4A claims those limits are enforced.
9. Prompts and benchmark must not share verbatim answer keys. Workbooks are candidate examples, not independently expert-verified ground truth; use all nine domains with independently reviewed baseline responses.
10. No paid model evaluations or informal quality-win claims during A–D. Minimal deterministic and mocked regressions are mandatory after each additive patch. Final evaluation follows 4D completion.

## Final coordinated evaluation after 4D
Compare: (A) current S1.6B.3 teaching, (B) contract + context without interests, (C) contract + context + eligible personalization. Freeze input scenarios and rubrics before provider calls. Evaluate conceptual correctness, natural voice, correct teaching move, historical continuity, correction closure, interest usefulness and fidelity, false-interest controls, domain safety, token/cost/latency, and learner follow-up evidence. Include cases from nine workbook domains plus Photosynthesis T01/T07/T10/T10A. Keep costs reported as estimates, not invoices.

## Not part of S1.6B.4
Automatic semantic memory repairs, nontrivial graph relationship verification, production profile writes, browser wiring, changing model defaults, and full visual experience generation.
