# S62A — Longitudinal Learner Trust (research-only)

**Add-only experimental harness.** Reuses exact S59 core/schema, S60 lexical and local MiniLM semantic retrieval, S61-FIX1 bounded context and memory loop, S61-FIX2/3 evaluation/frozen evidence foundations. Does not change existing app components or earlier source files.

## Coverage

- Four fictional learner personalities (ELLI, MICA, RUNE, TAVI), six scripted *visit openings* each. The rest of each visit is Model B teaching + Model L natural, simulated replies. Personality and possible difficulties are private **fallible** synthetic hypotheses and are NEVER passed to A, B or C.
- Default six-turn visits (configurable 2–7 turns); `ALL` / 24 visits / 6 turns = 144 learner turns and 120 optional Model L follow-ups.
- `--retrieval semantic|lexical|mixed`, with S60 `/embed` local MiniLM adapter and an in-process vector cache. Semantic mode fails on service errors rather than silently reverting to lexical. Optional `--audit-retrieval on` records matched lexical-versus-semantic retrieved IDs for each *exact same observation*; its shadow method never changes model input.
- `--a-variant baseline|no-update` adds a tiny Model A prompt experimental instruction (no schema modifications). Model C remains optional and advisory. Model B can optionally hide learner memory using S61-FIX1 memoryMode; not a controlled teaching-effect proof.
- Append-only observation ledger, provisional root revisions and relationship proposals, bounded role-specific context, full traces and qualitative review worksheets. No authoritative learner-memory or production DB writes.

## Important limits

This is a **trust-validation research harness**, NOT a validation of learner outcomes. Offline Mode L replies are placeholders. Even paid Model L may be unrealistically knowledgeable. Author-seeded visit openings are not autonomous learner topic selection. This pilot does not establish causality, relationship truth, actual independent transfer, or tutoring effectiveness. Cross-condition journeys can diverge after the first turn. No semantic scoring by synthetic answer keys.

## Suggested staged research

1. Install and verify; run lexical offline pilot (no API/embedding service required).
2. In a **separate PowerShell terminal**, run `python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001` inside the experiment worktree.
3. Run the embeddings check script; then semantic offline pilot with lexical shadow audit (embeddings required, no paid model calls).
4. After inspecting both, explicitly opt into a small paid `ELLI` two-visit, three-turn semantic pilot. Do not immediately run all 144 turns with paid models. The admission estimate is NOT a provider billing cap.
5. Independently review root changes, relationship hypotheses, contradicting observations, learner realism, accuracy and failure cases before further expansion.

Reports save under `.myway-patch-backups/learning-intelligence-reports/s62a/<timestamp>/` and launchers also ZIP to Downloads. Reports include PRIVATE_EVALUATOR_ONLY.json; treat them as synthetic research data; avoid publishing private profile plans without context.
