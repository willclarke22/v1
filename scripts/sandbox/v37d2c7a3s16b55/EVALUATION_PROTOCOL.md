# S1.6B.5.5 — Evaluation and acceptance gates

Status: **structural research milestone**, not an accepted live teaching architecture.

## Review workflow

1. Run the S55 selftest and the two offline contexts (`resumed` and `full`). Compare the actual `selected_branch`, learner sentence, B reply, and proof that a changed tutor reply changes the next user turn. Alternate branches are authored and limited.
2. Compare turn `S55-04`: old session raw dialogue **must be zero** in resumed context; `source_turn` and `first_learner_quote` of the relevant earlier root must survive. Full-history control should expose exactly six older raw messages at this point. Interpret all historical memory as provisional.
3. Check `S55-06` (source of oxygen gas) is held when the lexical baseline lacks identity evidence; it must not silently merge with the earlier question about carbon. Check `S55-07` is a separate topic and that any cross-topic link is only an unverified hypothesis.
4. Check `S55-08` is a specific requested diagram **proposal**, never a fabricated asset. Visual quality remains unevaluated.
5. Review `evidence_timeline` for speaker, verbatim evidence, source ID, classification, uncertainty and zero claimed mastery. Compare learner corrections and assessment requests with B's actual behavior.
6. Only after offline review: optional small provider pilot, local only, with permission and cost accounting. Separately run a `full` control if approving additional provider spend; the default pilot does **not** double costs by generating both.

## Manual rubric (0 poor / 1 mixed / 2 good; mark NA as needed)

- Scientific accuracy and no misleading explanation
- Directness and concision
- Owns prior mistakes and follows learner correction
- Tests understanding when asked rather than teaching past the request
- Resumes with useful evidenced history (not invented personal memories)
- Distinguishes confidence, expressed reasoning, independently demonstrated application and actual mastery
- Same/distinct/refinement decisions grounded in quotes and provenance; low false-merge rate
- Relevant cross-topic relationships; no synonym-for-identity mistakes
- Visual proposals have a specific teaching objective, without hallucinated generation
- Latency and provider cost versus direct minimal GPT-4.1 mini baseline

**Acceptance condition:** repeated realistic and provider-backed trials with blinded review, explicit negative controls, accurate evidence provenance, no unauthorized memory changes, acceptable user experience, acceptable latency and reasonable cost. A passing offline selftest alone is insufficient.
