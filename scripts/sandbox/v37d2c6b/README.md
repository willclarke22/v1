# V3.7D.2C.6B combined / experimental only

This single patch combines: owner-scoped client-only topic-label semantic search; inline local new/existing topic action; deterministic new-topic label normalization and an optional edited label with server-held reauthorization; OFF-by-default high-confidence automatic new-topic creation; concise assessment/teaching instructions; and provider-reported cost visibility in Learning Space.

## Boundaries
- CLOUD: browser signs in with existing Supabase Auth and SELECTs only topic IDs + labels from `myway_cloud_topic_snapshot` under existing owner RLS. Embedding model runs locally in the browser. No new SQL, public RPC, server API, service-role credential, model provider or cloud topic writes. This is capped at 200 topics and **does not yet replace server-side pgvector, same-root-problem verification, or the full cloud learning turn**.
- LOCAL: the original single-use server-issued approval token and stale-state checks still govern all topic writes. The editable label flow reissues a new one-use capability before committing. Automatic creation is OFF by default, only in the local tab, and requires semantic retrieval, high confidence >=0.92, at least one candidate, every returned subject similarity <0.25, and the original model-grounded root problem. No memory scores counted as mastery.
- COST: OpenAI rates validated against provider documentation at 2026-10-31; cost estimate uses provider-reported usage only, including cached tokens where available. GLM/unpriced, aborted or missing usage MUST NOT become a fabricated total. Time/characters are not token counts. Browser inference is on-device, not a paid embedding API.
- PROMPTS: shortened assessment, Model C verifier, and compact teaching instructions, with schemas and detailed rubric anchors preserved. No extra model calls for naming or retrieval. This is an unbenchmarked prompt experiment: verify response quality vs prior source before treating lower tokens as savings.

## Install
1. Stop the local port 3001 server; ensure the FIX1 launcher is installed, branch is correct, no unrelated dirty files.
2. Run `INSTALL_V37D2C6B.ps1` from the ZIP. It checks exact SHA-256 preimages, works within the experiment and creates a marker and backup. It does not run SQL or Git.
3. Review output, local assessment behavior, naming, and model cost comparison.
4. Before committing, review exact changed files in `manifest.json` and stage those files ONLY. If the prior FIX1 launcher file is still uncommitted, commit it separately first. Never `git add -A`.
5. Deploy to *myway-learning-experiment* Vercel project, not original v1.

## Suggested experiments
- Cloud Workbench: sign in, use a synthetic query in `Private topic-label semantic search` (WASM first), check similarity ranking, on-page timing; sign out and confirm denial.
- Local: a real learning turn with semantic retrieval available should propose a topic; create using inline approval and optionally edit its label. Confirm DB and Vercel sync. With automatic creation OFF, no new sphere should appear without approval.
- Local high-bar auto mode: enable only for a controlled test topic and observe a high-confidence `propose_new` (root confidence >=.92, all top-5 similarities below .25); weaker cases require manual approval. Disable afterwards.
- Verify provider-cost subtotal for all provider choices, including GLM, unavailable usage and errors. Contrast prompt-token usage and assessment accuracy with old trace; smaller prompt is not automatically better.

## Rollback
Use `ROLLBACK_V37D2C6B.ps1` only before committing and if installed hashes match; post-commit use reviewed `git revert` instead. DB and Cron are unchanged.
