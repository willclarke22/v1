# V3.7D.2C.7A.3S1.1 — Terminal Evaluation Quality

Small, guarded add-on to **S1**: read-only challenge evaluation, fault injection, report taxonomy and existing paid-model CLI compatibility. Runtime MyWay TS source remains byte-for-byte unchanged. Old S1 fixture library and billing ledger are unchanged.

- S1 source preimages verified by the S1 release marker.
- Original v1/main Git branch and SHA checked, experiment worktree branch and shared Git worktree checked, unexpected worktree changes refused.
- One overwrite to S1 `run.mjs` (release-name allowlist only), plus `current-local-release.json`, both backed up before write.
- All other changes are new dedicated S1.1 scripts, JSON fixtures and documentation.
- Preflight -> transactional copy -> S1/S1.1 regression tests -> release verification -> full TypeScript compiler -> commit-free PASS.
- Any failure restores the source preimages and removes new files, leaving the ignored backup receipt.
- No database writes, model/provider calls, migrations, Supabase queries, Git commits or pushes, Vercel deployment or changes to original v1/main.

First run offline fixture challenge, then start the embedding service and run 12 semantic challenge cases. Do not enable automatic memory writes based on these proxy results.
