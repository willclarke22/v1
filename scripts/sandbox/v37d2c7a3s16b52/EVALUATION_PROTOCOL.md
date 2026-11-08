# S1.6B.5.2 Evaluation Protocol

## Design

**Tier 1:** preserve previous frozen technical regression suites (format, source integrity, route isolation, cost, fallback). **Tier 2:** controlled synthetic realism audit of 48 snapshots/10 authored conversations, 36 development/12 reserved holdout. **Tier 3 (future):** privacy-protected, consented, sampled real learner conversations and outcomes. Tier 2 passing never establishes Tier 3 validity.

## Questions

1. Can the current heuristic intent router and deterministic teaching planner pick a plausible action without the author supplying the action/focus? Audit mismatches, context holds and ambiguity; do not call mismatch rate a proven accuracy estimate.
2. Does Model B execute its selected teaching action, reflect the raw prior context and calibrate claimed understanding, *without* hallucinating earlier dialogue or memory repair?
3. Are conversation inputs representative? Review colloquial phrasing, ambiguous references, genuine misconception evolution, topic shifts, requests for just an answer, repeated questions and interruptions. This corpus still lacks empirical prevalence weights, multilingual or accessibility diversity, audio transcript errors, youth dialogue validation, actual learner errors and independent authorship.

## Synthetic source guarantees

- Literal `prior_turns` carry the exact prior authored learner/tutor text; tutor texts are explicitly labeled **scripted**.
- Separate `author_assessment_root` is metadata, never masqueraded as a learner quote. The assessment metadata is held constant in both routing conditions; this is not a test of topic-assessment inference quality.
- The 12 holdouts are labeled, but only a basic CLI lock preserves intended review order; the corpus file is readable, not cryptographically hidden. Inspect only once a development hypothesis is frozen.
- Model outputs and reports must be treated as synthetic test artifacts. No persistent or automatically updated learner state.

## Blind human review

Score 1–5, using `S16B52_BLIND_REVIEW.txt` and `S16B52_SCORECARD.csv` before opening `answer-key.json`:

| Dimension | Review question |
|---|---|
| Intent recognition | Responds to what the learner appears to want |
| Action fidelity | Performs appropriate teaching action, not just a generic explanation |
| Context truth | Does not misquote or overinterpret earlier raw utterances |
| Conceptual accuracy | Correct mechanism and no distortion in examples |
| Naturalness | Clear, context-appropriate conversation without mechanical scripting |
| Progress calibration | Reported versus demonstrated progress distinguished |
| Teaching restraint | Avoids extra lectures or unrequested quizzes |
| Next-step usefulness | Optional move fits learner need and level |

Severity: none / minor / major / critical. **Critical** includes invented learner history, unsafe medical/legal advice, claimed applied memory changes, confident material error. Consider at least two independent blind reviewers, then disagreements adjudicated before changing prompts or routing. Explicitly count legitimate multiple acceptable teaching actions; no single-output text match is sufficient.

## Runtime and cost

Offline is default and makes zero inference calls. Paid mode requires `--mode model --allow-spend --budget-usd` with a tight max of 6 selected scenarios; bounded output-format retries, stop on missing/unknown usage, stop on transport errors. Charges are estimates using pinned token rates, not billing invoices. Endpoint guard and proxy default deny are unchanged. Local reports under ignored `.myway-patch-backups` only.

## Decision rule

Do not promote a new Model B voice based on these fixtures. First inspect the exact user language, failure clusters in heuristic action selection, evidence provenance and human-reviewed model output. Correct routing errors before increasing prompt verbosity. Next plan closed-loop tests, then consented user validation.
