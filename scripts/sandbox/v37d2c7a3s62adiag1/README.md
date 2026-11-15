# S62A-DIAG1 — Model A Learner-Understanding Diagnostic

**Research-only, add-only patch** for the protected `myway/learning-sandbox-v3_7a` experiment. This stage does not change S62A, S61, the main app, production Learning Space, Supabase, learner memory, embeddings, or prompts used by existing runs.

The earlier S62A six-visit research runs sometimes reinforced a root after a learner demonstrated competent reasoning. This stage diagnoses that situation and also examines understanding, learner-specific causal hypotheses, alternatives, uncertainty, retrieval, cross-topic relationships, coaching/probe conditions, tutoring, and memory-action fidelity. It does **not** purport to automatically grade learning science.

## Inputs

Previous S62A/S61 `trace.json` archives are required for the full diagnostic. These are **not in the complete eligible source dump**, because generated reports are ignored. Auto mode finds the longest prior model-run trace for each of ELLI, MICA, and SAGE under `.myway-patch-backups/learning-intelligence-reports/s62a`, `s16b61fix1`, and `s16b61`. Full report ZIPs can be restored under those locations, or a literal `--trace` path can be specified. No report is invented if missing.

## Offline run (free)

`node scripts/sandbox/learning-intelligence/s62a-diag1.mjs --auto --limit 15`

Read the generated `CASE_DOSSIERS.md`, `INDEPENDENT_REVIEW_WORKSHEET.md`, `AUTOMATED_QUESTIONS.json`, and `FROZEN_CASES.json`. Per-step archive validation is compared against a separate reconstruction of the source visible IDs, target roots, and references; a disagreement is a review signal, not a proof that the archived run was wrong. Root revisions show how action `refine` sent its action citations to the supporting evidence bucket in the S62A reducer. The full observation ledger is compared against evidence available to A in that step, and prior teaching is retained where archived. A response after a tutor is not automatically an independent mastery probe.

## Optional matched model replay (paid, opt-in)

Run only after reviewing the offline report:

`node scripts/sandbox/learning-intelligence/s62a-diag1-compare.mjs --cases "<full path to FROZEN_CASES.json>" --variant clarified --model-a gpt-4.1-mini --limit 3 --allow-spend --budget-usd 0.25`

Variants: `baseline` (original S60 prompt), `no-update` (S62A abstention instruction), `clarified` (experimental action-semantic explanation). Models: `gpt-4.1-mini`, `gpt-4.1`. **All candidates get identical archived learner evidence.** This is not a controlled long-journey benefit study. The comparison does not apply the new responses to memory. Admission is conservatively estimated from serialized request bytes and maximum completion tokens. Estimated usage is checked after each call; no estimated cost is a provider hard billing cap. Actual API usage varies.

The comparison may read local `.env.local` `OPENAI_API_KEY`; never paste or commit credentials. Local or HTTPS API endpoint only, production/cloud/CI execution rejected by the shared adapter. `--allow-spend` and explicit `--budget-usd` are both required.

## Boundaries

- No generated truths, no grading accuracy by topic regexes, no forced root creation, no forced positive/negative links.
- Public fictional test content and model simulations are fallible evidence sources, not actual people.
- Original archived trace files are never modified; outputs go to a unique directory under ignored `learning-intelligence-reports/s62a-diag1` and may be zipped to Downloads by PowerShell launchers.
- The stage verifier and installer run no model calls, embeddings, or DB writes.
- Even a clean offline diagnostic cannot certify that Model A's causal interpretation was correct. A human should review the dossiers before the follow-on targeted fix and RUNE/TAVI experiments.
