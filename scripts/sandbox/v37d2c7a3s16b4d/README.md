# S1.6B.4D — Teaching personalization and integrated evaluation

This additive research overlay completes the coordinated 4A→4D foundation: versioned voice, 4B context selection, 4C teaching actions, and **4D evidence-gated interest selection**. The improved voice is reachable through a NEW development-only loopback route; the original S1.5 route is untouched and is the comparison baseline.

## Non-negotiable boundaries
- Never changes `v1/main`, the release pointer, production teaching endpoints, Supabase, learner memory, profile storage, Git history or Vercel configuration.
- The 4D route requires `NODE_ENV=development`, `MYWAY_EXPERIMENTAL_RUNTIME=v37b`, `VERCEL` not `1`, host `127.0.0.1:3001`/`localhost:3001`, and a same-origin request. It must never be treated as production-ready.
- Default test is offline only. Paid use requires `--mode model --allow-spend --budget-usd ...`, and the running guarded Next server with provider key already configured. Cost is an estimate from usage, NOT an invoice or billing cap.
- No automated historical relinking, canonical root change, profile delta application, persistent user interest updates, or relationship verification.
- **Interest mappings are curated illustrative hypotheses**, not independently validated teaching benefits. Nothing in this patch proves learning effectiveness.
- Only synthetic examples are included. The workbooks informed scenario diversity; they are not published/expert-reviewed gold-standard answers.

## Checks and next actions

Install ZIP with the included `install.mjs` / PowerShell launcher. Technical regression suite and `tsc --noEmit` run automatically; installation has no model calls.

After all A–D are installed (this step), prepare the comparison without any paid calls:

```
node scripts/sandbox/learning-intelligence/s16b4d-eval.mjs --mode offline --limit 3
```

With the guarded Next.js server running on 3001, optional user-approved paid comparison:

```
node scripts/sandbox/learning-intelligence/s16b4d-eval.mjs --mode model --limit 3 --variants baseline,contract,personalized --allow-spend --budget-usd 0.12
```

The first three frozen scenarios are language, law and medicine, only the first has a curated structural interest bridge. To compare a photosynthesis correction specifically, use `--scenario PHOTO_T10 --limit 1` (or `PHOTO_T10A`). All responses remain explicitly **unscored for teaching quality**, with human-review prompts and token cost ledgers.

Reports are ignored local files under `.myway-patch-backups/learning-intelligence-reports/s16b4d/`.
