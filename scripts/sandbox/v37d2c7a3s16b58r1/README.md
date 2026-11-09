# MyWay S1.6B.5.8-R1 — Evidence & Experiment Consolidation

**Research only.** This stage reuses the existing S58 runner and adds a controlled post-journey probe experiment. It does not change S58, the application, production, Supabase, the historical runners, Git, or cloud deployment. No new model role, 30-topic catalog, database table, or scene renderer.

## Scope
- Trial conditions are enforced. T05/T06 start from the same researcher-authored question with six historical observations and **zero** preseeded root-cause hypotheses; relationships remain separate, still provisional.
- Existing S58 inference continues for 12 turns. The R1 addon then offers up to two optional probes (baseline-after-conversation and later transfer-after-teaching). Probe administrations are labeled and aren't falsely counted as historical suggestions.
- Only a small, researcher-vetted subset of probe contracts is automatically checked: explanation, prediction and scene-target selection. Exact scene targets can be checked; natural-language answers receive only an **incomplete lexical feature screen** (never an expert correctness grade). Invalid or underspecified probes are withheld. Any alternate probe is a predeclared catalog trial item and is explicitly logged.
- Model A proposes **provisional** evidence-backed support/weakening/challenge/insufficient updates for EXISTING underlying-cause hypotheses and learner relationships. Exact probe quotes and root/relationship IDs are guarded. No learner memory is rewritten. A single probe cannot establish the underlying cause of confusion, transfer, mastery or effective learning preference.
- Model B sees the recorded probe response and provisional assessment to choose a subsequent teaching step; an independent, unrehearsed transfer probe is offered afterward.
- Private synthetic learner knowledge is only included in Model L's prompts. Private rubric files are never sent to any model; they are validated by the earlier S58 fixture loader.

## Offline examples

```powershell
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
node scripts/sandbox/learning-intelligence/s16b58r1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-A --trial-id T01 --retrieval lexical
node scripts/sandbox/learning-intelligence/s16b58r1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-B --trial-id T02 --retrieval lexical
node scripts/sandbox/learning-intelligence/s16b58r1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-A --trial-id T05 --retrieval lexical
node scripts/sandbox/learning-intelligence/s16b58r1-journey.mjs --mode offline --limit 12 --learner-id LEARNER-B --trial-id T06 --retrieval lexical
```

Offline means **no paid model calls**, using authored fixture actions and teaching replies for plumbing. All new reports are below `.myway-patch-backups/learning-intelligence-reports/s16b58r1/` and include readable transcript, review summary, probe events, provisional revision review and full trace.

## Paid (optional AFTER reviewing offline)

Start the LOCAL MiniLM embeddings service on port 8001 with the established command. Set the API key using your existing `.env.local` procedure; do not paste or package it. Explicitly opt into model use:

```powershell
node scripts/sandbox/learning-intelligence/s16b58r1-journey.mjs --mode model --limit 12 --learner-id LEARNER-A --trial-id T01 --history resumed --retrieval semantic --learner model --activity simulated --activity-profile needs-feedback --personalization on --allow-spend --budget-usd 0.40
```

The conservative combined admission estimate is about USD $0.388 for 12 model-learner turns; it is **not a hard provider billing cap**. No real human learner is involved. No model-generated learning outcome is guaranteed. Stop if the runner reports uncertain usage or transport failure.

## Important limitations
This is **not** integration of probes into real 2D/3D scenes, not autonomous model probe selection, not longitudinal production memory revisions, and not a controlled causal study of teaching effects. The two probes run after the earlier 12-turn journey; no later tutor turns are retroactively modified. Restricted deterministic scoring is intentionally conservative. Interpretations are provisional; zero authoritative writes. The 60-probe catalog is preserved but not fully executable. Older S52–S58 runners remain frozen regression references.
