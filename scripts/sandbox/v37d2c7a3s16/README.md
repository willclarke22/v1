# MyWay S1.6A — Stateful Learning Space Simulation (research prototype)

**Scope:** an additive, terminal-only, synthetic Learning Space experiment, not an active browser feature. Its purpose is to examine the complete learner-message → assessment A → teaching B → historical retrieval → identity/refinement C → **local simulated memory state** sequence while collecting tentative cross-topic graph and correction evidence. It never contacts Supabase or writes actual learner records. This package does not modify the original project, proxy, cloud policy, existing S1.x source or current release pointer.

## Important distinctions

- **OFFLINE (free):** Scripted Model A assessment and a conspicuously labeled Model B stub. Topic routing uses a fixture oracle; most root matching uses lexical overlap, while a few explicitly labeled scripted transitions exercise create/refine paths. The resulting evolution verifies simulator mechanics **only**, NOT real model reliability, naturalness, teaching quality, self-correction success or autonomous topic discovery. A different score or hold is not a true performance metric.
- **MODEL (opt-in, paid):** Real GPT-4.1 mini (or gpt-4o-mini) for **A, B, C** using the exact S1.5 guarded local endpoints; real MiniLM (384-D) cross-topic evidence retrieval using the existing S1.5.1 ranker and integrity gate. Historical topics and event data remain **synthetic in process memory**. Model B's real response is logged in the Notepad report for human inspection. No new production prompts or schema changes.
- **Relationships:** the simulator collects explicit cross-topic learner statements into evidence-linked, `unverified_proposal` graph hypotheses. It preserves open-ended / novel-type candidates without forcing them into the existing derived relationship graph. This is **not an autonomous semantic relationship-reasoning model**; verification of novelty, direction, usefulness and contradiction remains a future experiment.
- **Corrections:** a contrasting later statement can trigger a traceable correction **candidate**. `--inject-fault` deliberately introduces one clearly labeled false merge in offline mode so a later contradiction tests candidate detection. It **does not automatically repair that merge**. Autonomous audited repair requires a separate evidence-checking and rollback contract.
- **Identity:** `same`, `distinct` and `uncertain` can modify only the script's isolated in-memory synthetic state. `refine` appends a new observation/hypothesis and never overwrites earlier evidence. A valid historical anchor must belong to the selected topic; otherwise the proposal is held.
- **Costs:** estimates use the existing MyWay cost ledger. `--budget-usd` is a reserve-based admission check, **not a hard billing cap**, and failures may still be billed. At most 6 real turns per command, with up to 3 calls each; some turns hold earlier. Model calls never occur during installation, verification or offline runs.

## Running in PowerShell

Start services in **separate** terminals (same existing launch commands):

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
python -m uvicorn services.embeddings.app:app --host 127.0.0.1 --port 8001
```

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sandbox\start-local.ps1
```

For the initial **free smoke test**, these two servers are not necessary:

```powershell
cd 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
node scripts\sandbox\learning-intelligence\s16-selftest.mjs
node scripts\sandbox\learning-intelligence\s16-space-sim.mjs --mode offline --limit 18 --inject-fault
```

For a **small, explicitly paid real-model sample** after verifying local services and costs:

```powershell
node scripts\sandbox\learning-intelligence\s16-space-sim.mjs `
  --mode model --limit 2 --model gpt-4.1-mini `
  --allow-spend --budget-usd 0.08
```

No flags start paid mode by default. There is no Supabase mode in S1.6A; do not confuse the synthetic state with the real sandbox.

## Where the results go

In ignored `.myway-patch-backups\learning-intelligence-reports\s16\<timestamp>\`:

- `LEARNING_SPACE_SIMULATION.txt`: long Notepad-compatible account of all learner messages, assessment, real/stub teacher text, retrieval candidates, A/B/C decisions, simulated memory changes, relationship candidates, repair candidates, final topic state, audit trail, costs, and limitations.
- `trace.json`: structured machine-readable run including gold/reference expectation **separate from the prompt and model-facing input**.
- `final-state.json`: evolved simulated topics and history.

The script refuses overwriting existing reports and keeps all output under the gitignored report root. All prompt text and fixture data are synthetic and educational; do not paste sensitive learner data into this initial simulator.

## Next steps after reading the output

1. Review real Model B teaching style and correctness turn-by-turn, including whether explanation actually addresses the root problem and whether the next step feels natural to MyWay. Do not optimize solely for superficial style flags.
2. Compare what the memory graph adds, repeats, refines and holds against independent reference expectations (not visible to models). Isolate routing errors from C errors and failures of the integrity gate.
3. Add independent relationship discovery/review: evidence-bearing typed + open-vocabulary hypotheses, direction, counterexamples, recurrence, and nontrivial new types; avoid equating embedding proximity with a useful relation.
4. Add controlled self-correction **proposals followed by independently checked reversible operations**. Distinguish detection, correct diagnosis, safe application and rollback.
5. Expand to a read-only sanitized snapshot of the experimental Learning Space only after reviewing tenant scoping, authenticity, RLS and privacy. Never treat a synthetic transcript as verification of actual Supabase behavior.

## Security / release

No SQL, migrations, cron, production changes, database writers, new API endpoints, prompt replacements, Git commits, pushes or deployments. Only allowlisted **new** files are added. The S1.5.1 overlay and `v37d2c7a3s12` release pointer remain unchanged. An installer verifies the original main SHA (`462a7a4`), correct experiment branch and Git shared worktree directory. Manual rollback verifies exact installed file hashes and refuses to remove edited files. Do not reinstall after a commit as though it were an uncommitted overlay.
