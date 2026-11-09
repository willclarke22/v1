# MyWay S1.6B.5.6 — Unified Learning Journey V2

**Scope:** additive local research only, protected original `v1/main`, experiment branch `myway/learning-sandbox-v3_7a`. No modifications to existing teaching routes, `proxy.ts`, Supabase, Vercel, database, or local-release marker. No API calls during installation or verification.

## Why this version exists

This milestone consolidates instead of imposing more teaching rules. **Model B speaks first**, using recent raw dialogue and optional retrieved learner memory; **Model A assesses afterward** from original learner evidence; optional **Model C** reasons about historical root identity after embeddings/lexical candidate retrieval. Topic-label wording is not a hard identity veto. The trace records raw C output, the exact-ID/schema guard outcome, and final memory action separately. None of the model or authored fixture outputs are treated as an oracle. A failed/invalid A response does not withhold a completed tutor reply.

## Three linked outputs

1. The actual learner/tutor transcript (`S16B56_INTEGRATED_TRANSCRIPT.txt`)
2. Evidence and provisional learner memory (`S16B56_MEMORY_TIMELINE.json` and `trace.json`)
3. Research-only Learning Space projection (`S16B56_LEARNING_SPACE_PROJECTION.json`)

A synthetic 12-turn, three-session scenario covers carbon incorporation, a return to an earlier difficulty, a separate oxygen-release question, and related mitochondrial/chloroplast chemiosmosis. The authored steps are **prompts, not expected decisions**. Optional GPT-4.1 mini-generated learner messages depend on the immediately preceding tutor reply, but remain synthetic, not human-validated.

## Offline baseline, zero paid calls

```powershell
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
node scripts/sandbox/learning-intelligence/s16b56-journey.mjs --mode offline --limit 12 --history resumed --retrieval lexical
node scripts/sandbox/learning-intelligence/s16b56-journey.mjs --mode offline --limit 12 --history full --retrieval lexical
```

The offline Model A/B/C paths are **authored or deliberately unresolved**, and are useful for wiring regression only. Do not score their semantic quality as truth.

## Local semantic retrieval (not DB or approved history)

Start the **existing** MiniLM service in a separate terminal:

```powershell
cd "C:\Users\willc\projects\MyWay\v1-learning-experiment"
python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001
```

`--retrieval semantic` POSTs only synthetic learner messages and provisional in-process roots to `http://127.0.0.1:8001/embed`, requires strict normalized 384-dimensional vectors and fails closed if unavailable. No live Supabase retrieval. `--retrieval lexical` deliberately tests the simpler baseline.

## Paid pilot only after explicit authorization

Paid mode requires `OPENAI_API_KEY` in the process environment, `--allow-spend`, and an admission budget; it never loads secrets itself or prints them. Reuse the *same previously successful private `.env.local` key loader* in PowerShell; never paste the key into a chat. The official provider endpoint is normally `https://api.openai.com/v1`.

```powershell
node scripts/sandbox/learning-intelligence/s16b56-journey.mjs --mode model --limit 9 --history resumed --retrieval semantic --learner model --personalization on --allow-spend --budget-usd 0.40
```

To compare, run a separate `--history full` study. Runs are **not guaranteed paired**: generated synthetic learners, tutor replies and assessments can differ. For controlled context ablation use `--learner scripted`; neither mode proves real-world learning gains. The admitted budget estimate is deliberately conservative, **not a hard invoice cap**. If usage becomes unknown, processing stops and a partial trace is saved. No retries, background jobs, or production execution.

`--personalization off` disables remembered preference injection for an ablation. Visuals are **proposals only**, not image renderings. Relationships remain provisional topic-level comparisons only, not committed root connections. No simulation can award mastery or write authoritative memory. Evidence quotes remain verbatim and rooted in learner messages.

## Review before any integration

Evaluate independent scientific accuracy, directness to learner, response to correction or assessment request, unnecessary repetition, correct historical retrieval, any model-versus-guard disagreement, confidence calibration, tone adaptation, optional visuals, useful relationships, latency and cost. Do **not** count agreement with researcher-authored fixtures as correctness. Compare against a bare GPT-4.1 mini tutor and repeat different learner journeys. Integration to Learning Space remains a separate, later, authorized decision.

Reports are written under `.myway-patch-backups/learning-intelligence-reports/s16b56/<timestamp>/`. No Git add, commit, push or deployment occurs.
