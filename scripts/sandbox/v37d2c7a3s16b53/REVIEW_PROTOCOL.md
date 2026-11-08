# S1.6B.5.3 — Human review protocol

## Pre-registered question
Whether providing intact, chronological synthetic dialogue improves **conversation fidelity** relative to the current compressed-context/heuristic route, while retaining GPT-4.1 mini.

## Review sequence
1. Run the **offline** 6-case version. Inspect raw histories and any safe holds. Do not run paid calls before confirming matched inputs and intended cost.
2. If testing models, use paid opt-in with 1–3 development cases initially; record all provider calls and retries. No holdout cases are available to this harness.
3. Score the **BLIND** file before opening the variant-to-response comparison. Scores 1–5 in intent responsiveness, evidence accuracy, factual accuracy, naturalness, teaching restraint, and progress calibration. Also record high-severity errors (unsupported learner-memory claim, ignored explicit request, misstated earlier tutor turn, fabricated reasoning). Prefer exact quotes as explanations.
4. In the descriptive comparison, look specifically at PHOTO-03 correction, PHOTO-04 closure, OXY-04 request for a check, SER-03 challenge, PHOTO-01 incomplete topic query and OXY-02 follow-up. Compare A vs B, B vs C, then C vs D; keep C/D confounds in mind.
5. Examine price, latency and token use only as supporting operational metrics, not teaching-quality grades.

## Guardrails
- No learner data outside frozen synthetic fixture; no database, profile, topic, run or memory writes.
- Original production main and sandbox cloud policy untouched.
- The root label is a researcher's hypothesis, not a confirmed learner quotation.
- Any interest-based personalization is OFF; it must be reintroduced only after the base conversational design is validated.
- A clear learner request supersedes an uncertain heuristic action. The model is allowed to ask a clarifying question when genuinely necessary.
- Current legacy endpoint cannot be replaced by this patch; that is a separate decision requiring evidence.
