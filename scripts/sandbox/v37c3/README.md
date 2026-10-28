# MyWay V3.7C.3 — Learning Space model integration

Experimental `v1-learning-experiment` worktree only. This patch does **not** create/update/delete learner topics, run Director, start workers or change semantic retrieval/layout.

## Changes

- Preserve original learner message **and** any latest clarification answer through the teaching model's structured input and the existing visual handoff (`myway_visual_handoff_v1`). MyWay's clarifying question is marked as not learner evidence.
- Concise, evidence-focused assessment/teaching instructions, retaining the 0–10 confusion/insight rubric, exact evidence checks, no invented interests, and schema validation. These are engineering adaptations to the agreed benchmark principles; exact historical benchmark prompt strings were not present in the source snapshot.
- Strictly accept complete ` ```json `-fenced JSON blocks as well as raw JSON. Do **not** accept JSON embedded in arbitrary prose or weaken schema checks.
- Assessment and teaching choose models independently: Edge Dev, GPT-4o mini, GPT-4.1 mini, GLM-5.3, GLM-5.3 Flash, GLM-5.3 FlashX. GLM options depend on the configured provider; NVIDIA currently excludes FlashX. Unsupported choices are rejected server-side with HTTP 422. Models require your own existing experimental API configuration and may incur API usage charges.
- Explicit model IDs are allowlisted server-side, never user-selected endpoints or credentials. Output uses actual returned model ID.
- Align `glm` with frozen visual-handoff provider types **without changing the handoff's field names/schema version**, and keep Workbench session timing/history.
- Preserve the existing assessment JSON Schema `additionalProperties: false` and strict OpenAI server-schema validation.

## Install / preview

Run `INSTALL_V37C3.ps1` from the extracted ZIP. Installer refuses drift, backs up modified files, then verifies source hashes and runs `pnpm exec tsc -p scripts/sandbox/v37c3/tsconfig.verify.json --noEmit --incremental false` using installed dependencies. This inherits the original `tsconfig.json`, but excludes historical `scripts/**/backups` source snapshots that contain broken relative imports; active modules remain compiled. On failure, restored files are put back and new files removed. It never runs the application or any migrations.

**Do not use older V3.7C.2.x launchers after this patch:** their immutable historical source hashes intentionally reject any upgraded files. Use the new:

```powershell
& 'C:\Users\willc\projects\MyWay\v1-learning-experiment\scripts\sandbox\v37c3\run-preview.ps1'
```

This runs a guarded local-only read-only destination check and launches the Next dev server on 127.0.0.1:3001.

## Suggested manual checks

1. Edge/Edge learner statement; inspect Workbench assessment, teaching and timing.
2. OpenAI GPT-4o mini (A), GPT-4.1 mini (B); check actual returned model IDs, if configured.
3. GLM Flash in A or B, if the selected provider supports it. Expect explicit 422 if an unsupported model variant (e.g., FlashX on NVIDIA) is selected.
4. Clarification round-trip: verify Model B sees **original message + latest answer**, and frozen visual handoff retains both without enabling Director.
5. Confirm `SANDBOX · NO STATE WRITES` and no topic rows changed. Retrieval can continue to use lexical fallback if `EMBEDDINGS_URL` is unset.

## Safety notes

- Retains the immutable `proxy.ts`, `next.config.ts`, Supabase destination pin, worker block, and existing retrieval route.
- Old verification markers stay as historical records. The C.3 verifier checks current hashes and safety guards without rerunning obsolete hash pin comparisons.
- The source dump did not contain root `proxy.ts`; the installer therefore requires its known V3.7C.2.3 SHA-256 hash to match the previous installation marker before touching anything.
- If TypeScript checking fails in your local environment, the installer rolls back. Share its logs instead of bypassing guards.

### Fix 3: TypeScript backups-only exclusion

The old root `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, so it compiles
archived source copies under `scripts/sandbox/v37c21/backups`, `v37c22/backups`,
`v37c23/backups`, etc. These intentionally do not have adjacent dependencies,
which produced 30 irrelevant TypeScript errors during Fix 2 installation.
Fix 3 supplies a **dedicated inherited TypeScript project** that excludes only
historical backup trees, not current app/learning-space modules. The installer
explicitly checks that eight critical live modules are still in TypeScript's
file list before running the full strict check. It does not edit the original
`tsconfig.json`, delete backups, use `--skipLibCheck` to ignore errors, or bypass
TypeScript verification. All Learning Space application source files are
byte-identical to Fix 2.
