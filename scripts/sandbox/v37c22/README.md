# MyWay V3.7C.2.2 — Read-only reliability and latency instrumentation

This patch does not enable topic creation, learning-state writes, legacy workers or new API routes.

Changes:
- Fine-grained *browser measured* timing for Edge availability, session creation, model inference, cleanup, assessment/teaching validation, retrieval, and visual handoff. Failed model steps are timed and labeled.
- Local-only retrieval: correct localhost/127.0.0.1 Origin vs internal request URL discrepancy; failures include short safe descriptions. Server timings expose sandbox SELECT, lexical ranking and combined semantic inference+pgvector query (cannot independently time embedding vs pgvector without changes to the existing adapter).
- Skip semantic attempt when EMBEDDINGS_URL is not set; mark result lexical, not semantic. Only the pinned sandbox Supabase is read.
- Edge availability promise cached per browser tab; conversational model sessions deliberately remain separate to avoid learning-turn context contamination.
- The Edge teaching schema forbids invented user interests when the test profile is empty. If only metadata invents an interest and teaching prose does not depend on it, normalize metadata and emit a warning. If content relies on invented interests, reject it.
- Provisional unlabeled topic questions are converted to `unspecified topic` (never saved) rather than posing a question as a new topic.
- Workbench profiler and last-12-run timing-only history in sessionStorage; no user messages included in the historical metric rows.

## Install
1. Ctrl+C in the experimental preview terminal; verify port 3001 free.
2. Unzip and run `install-myway-learning-sandbox-v3_7c22.ps1` using the one-ZIP command in ChatGPT.
3. Expected `V3.7C.2.2 VERIFY PASS`.
4. Run `& '.\scripts\sandbox\v37c2\run-learning-turn-preview.ps1'` in experiment.
5. Ask the same question 2-3 times (different turns) in Edge Dev, then inspect Learning Space > Workbench.
6. Optional local source integrity check: `node .\scripts\sandbox\v37c22\verify-v37c22.mjs`.

## Caution
- `pnpm build` without the guarded build launcher remains intentionally blocked by Next startup gate.
- The semantic option needs a compatible **384-dimensional** local embedding service configured on EMBEDDINGS_URL. Otherwise lexical fallback is explicit; its 0 similarities are not embedding scores.
- We cannot validate actual Edge/browser model latency, network authorization or TypeScript project compilation on the user's Windows system. Installer and syntax checks are performed in the packaged fixture.
- End-to-end performance optimizations should be evaluated across multiple warm and cold runs; no latency improvement is guaranteed.
