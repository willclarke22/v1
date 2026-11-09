# S58-R1-FIX1 — Evidence-first paired-probe research

This **additive, isolated** patch preserves S58, S58-R1, the 30-topic catalog and all history. It adds a thin adapter around the existing `runConsolidated` entry point; it does **not** duplicate the journey or modify existing hashes. It performs no database, source-control, production or deployment changes.

## Changes

- Matched *opening learner question* in T01/T05 (A), T02/T06 (B), and across A/B, while keeping six learner-specific historical observations and exposing two historical roots only in T01/T02.
- Exactly two matched non-leading post-journey probes for all four: BIO01-P1 asks for the source of glucose carbon and role of light; CHEM02-P1 asks for conservation during gas formation in a sealed vessel. Original fixture files are **unchanged**; these research prompts are applied to private in-memory copies.
- Each accepted probe response is stored as a **verbatim observation** whether or not the older lexical screen passes. The screen is never presented as a scientific-correctness grade. The old `independent_probe_evidence` counter remains available for historical comparison but is renamed as a *legacy screen count* in the new summary.
- A guarded `insufficient` model comment is explicitly **not** a root revision. Historical root/relationship updates remain provisional and the old guard still refuses unsupported changes from unscored answers.
- Full trace, concise per-response evidence review, and readable report in a NEW directory `s16b58r1fix1`. No separate grading model or database tables.

## What is **not** tested

This is not a randomized causal experiment: only the opening message and final two probes are exactly paired; other turns and historical evidence vary by learner. A model's response to an incorrect probe is evidence about the learner's statement, **not** automatically proof of the hidden cause. The second probe tests transfer to conservation of matter but does not exhaust multistep atom tracking. Offline learner responses are scripted; no real learner or rendered scene is involved. It uses the existing S58-R1 model interface if the user **explicitly opts in** to paid calls.

## Offline command

```powershell
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
node scripts/sandbox/learning-intelligence/s16b58r1fix1-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b58r1fix1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-A --trial-id T01 --retrieval lexical
node scripts/sandbox/learning-intelligence/s16b58r1fix1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-B --trial-id T02 --retrieval lexical
node scripts/sandbox/learning-intelligence/s16b58r1fix1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-A --trial-id T05 --retrieval lexical
node scripts/sandbox/learning-intelligence/s16b58r1fix1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-B --trial-id T06 --retrieval lexical
```

No API, Git, Vercel, SQL or database operations are performed by installation or offline tests. Install with guarded `install.mjs` and verify with `--preflight`; rollback before staging/committing with `rollback.mjs`. The release installer requires existing `s16b58r1` predecessor hashes and the project TypeScript compiler to succeed.
