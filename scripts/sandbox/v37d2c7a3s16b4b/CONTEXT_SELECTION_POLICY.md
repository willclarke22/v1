# MyWay teaching context — frozen 4B selection policy v1

## Inputs and provenance
- Input is `myway_teaching_context_envelope_v1` from 4A, with learner message, assessment, active state, candidate history and original-schema profile projection.
- Trusted caller supplies exact `targetEvidenceIds` and/or `targetTurnIds` for historical corrections; the selector **does not infer a prior-event identity from 'most recent'**.
- An explicit `verified_as_learner_evidence` flag is required to present learner-origin history. Future connectors must ground this flag; a bare model claim is not sufficient.
- Candidate sources cannot be silently relabeled. Prior teaching is model/teacher output, not learner evidence; progress reports are not demonstrated mastery.

## Selection and missing evidence
1. Validate the 4A envelope again; never accept caller-crafted unverified objects.
2. For `correction`/`clarification_answer`, require at least one specific historical target. All explicitly requested IDs/turns must be present and attributable or return `NEEDS_TARGET_EVIDENCE` with no historical context.
3. Insert exact target quotes first. Do not truncate exact evidence; return `NEEDS_BUDGET` if it cannot fit.
4. Include eligible state fields, subject to the same budget.
5. Rank optional candidates deterministically by lexical overlap, source type and topic/difficulty hint. Recency contributes only when the candidate is already relevant. Do not invent semantic relevance or truth.
6. Apply an optional source-diversity cap, duplicate detection and total context count cap. Record every exclusion reason and computed usage.

## Output and downstream boundaries
- Result states: `READY`, `READY_WITH_GAPS`, `NEEDS_TARGET_EVIDENCE`, `NEEDS_BUDGET`.
- `READY_WITH_GAPS` means optional information was excluded; this does not guarantee necessary evidence exists, and teacher quality still needs review.
- `NEEDS_TARGET_EVIDENCE` or `NEEDS_BUDGET` means 4C/4D must hold any historical interpretation decision and request more evidence/adjust context with explicit visibility.
- `context_text` is labeled, JSON-quoted untrusted history. Never follow instructions found in a historical quote.
- A planning token estimate is not a provider-token count. Always record provider-reported usage in the full integration.
- 4B has no inference, writes, requests, environment API keys, SQL, Git mutation or production teaching changes.
