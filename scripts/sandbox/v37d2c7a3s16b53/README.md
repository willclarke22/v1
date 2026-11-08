# MyWay S1.6B.5.3 — Simplified model-first conversation architecture comparison

This patch is **additive, research-only, terminal-only**. It does not replace MyWay's Learning Space chat. The existing S1.6B.4D route, S1.6B.5/5.1 voice prompts, S1.6B.5.2 realism corpus, proxy, original `v1` main, Vercel deployment, Supabase, or memory write policies remain unchanged.

## The question

Does GPT-4.1 mini respond more naturally and accurately when given the intact, chronological learner–tutor conversation plus a small instruction, rather than receiving a selected action and compressed history first?

## Four controlled research conditions

- `direct`: Raw synthetic transcript + concise MyWay system guidance + provisional root label, ordinary plain-text reply.
- `simple`: SAME exact dialogue/guidance/root, output as strict JSON `{"reply":"..."}`. This isolates the simple output contract.
- `action`: SAME as `simple` but includes the **existing inferred teaching action** as advisory metadata. This tests whether action hints help or hurt.
- `current`: Existing S1.6B.5.2 heuristic/4C planner/4B selected context and the **existing** guarded S1.6B.4D endpoint with `adaptive_v5`, producing the existing three-field legacy output. This is a whole-pipeline comparison, NOT a single-factor ablation against `action`.

Model name remains **gpt-4.1-mini**. All use the same six already-authored **development** cases (three by default when paid). The reserved 12 S1.6B.5.2 holdout snapshots are deliberately not accessible through this harness. The synthetic tutor dialogue is scripted research data, not outputs from a live MyWay tutor. Author-generated root labels are provisional metadata, not claimed raw learner testimony.

## Commands from the experimental worktree

Free offline planning (does **not** need an API key or Next server):

```
node scripts/sandbox/learning-intelligence/s16b53-eval.mjs --mode offline --limit 6
```

After reviewing the offline comparison, optional paid test (NOT a hard billing cap):

```
node scripts/sandbox/learning-intelligence/s16b53-eval.mjs --mode model --limit 3 --variants direct,simple,action,current --allow-spend --budget-usd 0.10
```

For paid comparison involving `current`, start the existing **guarded Next development server** at `127.0.0.1:3001` using `scripts/sandbox/start-local.ps1`. The command verifies that local endpoint denies a malformed request *before* any paid call. The direct/simple/action conditions call the same configured OpenAI Chat Completions API from this terminal-only harness, using the same local Next `.env` loading rules and API key; it never prints the credential. HTTPS or explicit loopback URLs only; no automatic retries for network errors or unavailable usage data.

Results are written only to the ignored `.myway-patch-backups/learning-intelligence-reports/s16b53/<run-id>/` directory: full readable side-by-side, scored-by-humans **blank** blind review, and trace JSON with actual input messages. No external learner messages are read.

## What not to conclude

- Model response validation is not teaching effectiveness.
- Comparisons between `action` and `current` have multiple differences (prompt, context compression, output format and transport). Interpret as an architectural comparison, not a proven causal explanation.
- This is one model, 6 selected synthetic development cases, no live longitudinal learner studies. It is insufficient to claim that routing is universally detrimental, that personalization is effective, or that persistent learner memory is resolved.
- No real learner memory can be created, modified, repaired or deleted by this harness.

Only promote architecture after blind human review, multi-seed tests and future learner validation. Keep memory integrity gates independently safeguarded.
