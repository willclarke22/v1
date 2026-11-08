# S1.6B.5.4 — Unified Learning Journey Simulation

**Research-only, terminal-first, additive sandbox patch.** This is a functioning local orchestration experiment with three research model roles: A for assessment, B for naturally worded teaching, and C for difficulty-identity advice. It is **not** installed as the active Learning Space and **never** writes Supabase, actual memory, profiles, or the graph.

## Goal

`Learner utterance → optional Model A assessment → Model B natural reply from chronological dialogue + relevant roots → independent Model C memory assessment → provisional in-memory root/evidence/relationship/visual state → reports.`

A clarification is Model B's conversational choice, not a compulsory classifier rule. Model B is not given the old `MOVE=` contract. A/C research outputs are not authorities over tone. No single model call is required to establish memory certainty before a helpful teaching reply can be returned.

## First run (free, safe)

```powershell
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
node scripts/sandbox/learning-intelligence/s16b54-journey.mjs --mode offline --limit 12
```

Optional explicit synthetic learner preference (no inferred personalization):

```powershell
node scripts/sandbox/learning-intelligence/s16b54-journey.mjs --mode offline --limit 12 --personalization explicit
```

The 12 fixed learner messages span 3 sessions: carbon fixation, return to Rubisco, chemiosmosis/mitochondria, self-correction, and a change to oxygen saturation. They were authored as tests and are **not** taken from real learners. Offline Model A and Model B are **hand-written fixture outputs**; Model C is an **unverified lexical simulator**. There are no paid model calls in offline mode.

## Optional real-model research run (only after offline review)

Model mode uses **GPT-4.1 mini for the A, B and C roles**, via the provider API. It uses research-only prompts, not the current production A/C adapters. It requires a configured `OPENAI_API_KEY`, explicitly opted-in paid model mode, a conservative budget admission, and a local development environment. It does not require the Next.js server.

```powershell
node scripts/sandbox/learning-intelligence/s16b54-journey.mjs `
  --mode model --limit 3 --allow-spend --budget-usd 0.12
```

The admission budget is **NOT** a hard billing cap; actual cost is estimated from provider-reported token usage. Up to 3 calls per turn are planned (A, B, C); C is skipped when not needed. No retry calls are automatically performed. A provider transport failure, missing token usage or invalid output stops the remaining experiment. No production or memory write is possible through this runner.

## Reports

All reports are generated under `.myway-patch-backups/learning-intelligence-reports/s16b54/<run-id>`:

- `S16B54_UNIFIED_LEARNING_JOURNEY.txt` — learner and tutor turns, A/C results, memory proposals, visual requests and a manual quality-review checklist
- `S16B54_MEMORY_TIMELINE.json` — exact learner quotes, root IDs, provisional actions, relationship proposals and audit
- `S16B54_LEARNING_SPACE_PROJECTION.json` — visualization-ready *data prototype*, not live 3D rendering; coordinates are explicitly marked stable hash placeholders, **not embeddings**
- `trace.json` — all staged model context, origin labels and token-cost accounting

## Critical safety distinctions

- Root problems and related topics are **provisional research hypotheses**. No automatically verified mastery or correction. Root identity remains unchanged on uncertain evidence.
- Exact original learner quotation is required for a new root observation. Model C must cite a permitted original root ID for a SAME decision; cross-topic SAME is held for independent review.
- The chronological recent dialogue—including generated teacher answers in model mode—is always passed to Model B. No forced instructional action. The current learner message remains the last message in the prompt.
- Long-lived memory in this simulation is an **in-memory JavaScript object**, saved only into local research reports.
- Relationships are `POSSIBLE_SHARED_MECHANISM` **unverified** proposals, not canonical graph edges.
- Visualization proposals are metadata only and require further review. The patch does not render or call existing visual asset services.
- A future integrated product may schedule A/C separately, reduce model calls, rely on actual embedders and validate persistence independently. Those capabilities are **not yet provided here**.

## Manual rollback

In the extracted ZIP directory run:

```powershell
& node "$env:USERPROFILE\Downloads\myway_v37d2c7a3s16b54_unified_learning_journey\rollback.mjs" "C:\Users\willc\projects\MyWay\v1-learning-experiment"
```

Rollback removes only the eight new hash-matched patch files and its receipt. It will refuse if any of those files were modified after installation. It does not delete generated reports; those are locally ignored research data.
