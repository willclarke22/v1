# MyWay S1.6B.2 — Evidence-Grounded Memory Decisions

**Local, isolated simulation research; additive overlay after S1.6B.1.** No changes to existing files, browser prompts, proxy.ts, endpoints, original v1/main, Supabase, RLS, production learning memories, cloud deployment, Cron, or actual topic relationships.

## Scope / actual new behavior

- Keeps the same 8-turn learner journey and the S1.6B.1 compact Model A context (up to 2 recent turns, 600 history characters); keeps existing GPT-4.1 mini defaults and strict A/B/C response schemas. No new model endpoints or additional recurring inference passes.
- **Model B correction-aware context:** inserts a concise instruction into the already-supported teaching context. Model B is asked to acknowledge a correction before deciding whether explanation is necessary, not invent a question the learner did not ask, and ask one targeted memory clarification if needed. This is a *prompt hypothesis*, not a confirmed improvement in educational quality; inspect the real teacher text.
- **Conservative refinement:** if Model C says `same/refine`, a separate lexical support gate compares its proposed root with the canonical root and CURRENT unresolved learner evidence. If fewer than two new learner-supported detail terms appear or the roots barely overlap, the simulated operation is **`same/retain`** while recording the original model decision and why refinement was suppressed. A passing gate creates an **unverified candidate only**; canonical roots are never rewritten. It is not a semantic expert adjudicator and can produce false negatives.
- **Prior-event correction ranking:** examines all previous turn-linked events, not just the most recent one; records ranked evidence, contradictory/denied phrase and clarified focus. A ranking *never* selects an event for mutation. T10 now ranks T01's light-reaction interpretation ahead of T07's Calvin-cycle record, without concluding that either link was objectively erroneous.
- **Conflict-aware memory clarification:** explicit learner correction creates a targeted unresolved question; memory writes are held. The teaching model may still respond, but no C call is made on that correction turn until the learner clarifies. This avoids a potentially unnecessary paid C call, and does not conflate uncertainty with correction success.
- Keeps learner-reported progress separate from demonstrated mastery. Real relationship discovery / edge direction / novel types are out of scope; the four familiar explicit comparison hypotheses remain unverified and graph state is unchanged.
- In other turns, Model C retains the existing bounded formatting retry (once only when permitted); provider transport failures and missing cost information remain fail-closed.

## Installation and safety

One SHA256-verified ZIP, guarded Node installer and exact rollback. The installer checks the named experimental worktree and branch, full 40-digit protected original `main` checkpoint, common Git root, protected local release pointer, S1.6B.1 marker, exact unchanged dependency hashes, safe paths, and clean patch destinations. It *only adds* `s16b2-evidence.mjs`, `s16b2-journey.mjs`, `s16b2-selftest.mjs`, and this versioned README/verify script; installed receipt is ignored. No provider calls or data writes during installation.

Reports go only to ignored `.myway-patch-backups/learning-intelligence-reports/s16b2/<unique-run>/`. Reports and traces may contain full synthetic learner messages, teacher outputs and API call metadata. Do not use real sensitive learner evidence in this test. Budget flags are admission controls, **not provider billing caps**.

## Offline (no provider calls, no DB)

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
node scripts/sandbox/learning-intelligence/s16b2-selftest.mjs
node scripts/sandbox/learning-intelligence/s16b2-journey.mjs --mode offline --limit 8 --inject-fault
```

Offline A/B/C are *scripted stubs* and do not establish accuracy, teaching naturalness or actual self-repair. The `--inject-fault` control intentionally corrupts one **isolated synthetic event** in the simulation and never edits the real database. The lexical correction detector is not an autonomous repairer.

## Optional model evaluation (explicit paid opt-in only)

Start guarded Next.js and local MiniLM services in independent terminals using the existing commands:

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001
```

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sandbox\start-local.ps1
```

Then (after offline checks):

```powershell
node scripts/sandbox/learning-intelligence/s16b2-journey.mjs --mode model --limit 3 --model gpt-4.1-mini --allow-spend --budget-usd 0.12
```

Default three visits: T01, T07, T10. Max four paid visits. **Expected normal calls: A + B + C at T01, A + B + C at T07, A + B but NO C at correction T10 (8 total)**. Up to two additional C retry calls across T01/T07 if malformed schema permits retry. Other cases and holds may reduce calls. Actual tokens and fees vary; see run ledger.

The printed report `S16B2_EVIDENCE_REVIEW.txt` contains full learner-facing teacher outputs, ranked correction targets, the proposed clarification, original vs effective Model C interpretation, suppressed refinements, observed (not proven) progress, audit, cost and memory snapshots. `trace.json`/`final-state.json` provide the corresponding machine-readable evidence. No automatic learner questions are sent; the question is a proposal to inspect.

## What remains unresolved

- A lexical novel-detail heuristic cannot establish meaningful semantic refinement. It deliberately errs toward retaining established roots; human evaluation and better semantic tests still required.
- Model B still generates a three-field compact teaching output; a real interactive teaching dialogue is not implemented.
- Context is last two short turns and does not reconstruct an entire learner conversation; it may omit important earlier teaching even when correction ranking looks back further.
- The clarification prompt is NOT answered in this scenario. Repair remains an unapplied proposal. Future experiments should add actual clarification replay before any simulated relinking.
- No actual novel relationship discovery, independent graph verification, tenant-scoped production retrieval or automatic database memory correction is demonstrated.
