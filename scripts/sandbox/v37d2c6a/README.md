# MyWay V3.7D.2C.6A — browser MiniLM benchmark + future-proof local launcher

**Scope:** Separate experiment branch `myway/learning-sandbox-v3_7a`. Expected previous HEAD `531062a`. Original `v1/main` remains `462a7a4`.

## Functionality
- Adds the browser-only, opt-in MiniLM benchmark to the **cloud Workbench only** (`/sandbox/probe-lab/learning-space/workbench`). It is diagnostic, not real topic retrieval. Sample fixture topics are fictional. No Supabase / MyWay APIs / writes / storage are used by the new embedding code.
- Runs a module worker created from an inline Blob. **No new cloud path and no cloud route-policy change**. The worker fetches a fixed Transformers.js release from jsDelivr and a MiniLM model from a third party *only when Run is clicked*. Downloads may fail due to CSP/network restrictions, in which case an error is shown and no database fallback happens.
- WASM and WebGPU modes; 384-dimensional normalized embeddings; measures library/load/inference/total time; preserves model between repeated runs; compares sample topic labels and root problems separately. This does NOT establish compatibility with local Python embeddings; benchmark that in the next milestone.
- Adds `scripts/sandbox/start-local.ps1`, which checks original/experimental Git identities, resolves a pinned `current-local-release.json`, reads the latest installer marker and validates the test/verifier hashes before it starts the local Next.js process. Future release installers must update the pointer and the current-release verifier, not freeze an older page hash.
- Current release verifier checks prior immutable cloud security files and 5C source, excludes the *intentionally updated* cloud Workbench page from 5A historical hash checks, and verifies this new release's source hashes.
- No SQL, Cron changes, credential changes, database reads/writes, package changes, production changes or Git operations are performed by the installer.

## Install
Download one ZIP to Downloads and run the provided checksum-verified INSTALL command; installer runs strict preflight, backup, source-copy, contract verification, and a project TypeScript check. Do not install while a local dev server is running.

## After install
To launch local experimental Learning Space, use:

```powershell
& 'C:\Users\willc\projects\MyWay\v1-learning-experiment\scripts\sandbox\start-local.ps1'
```

It opens no browser automatically. Visit `http://127.0.0.1:3001/sandbox/probe-lab/learning-space` (without a topic ID). Use `start-local.ps1` in future; legacy `v37d2c3/run-preview.ps1` is intentionally obsolete.

Commit only the exact 8 source paths from `manifest.json` **after** INSTALL SUCCESS and review. Deploy cloud Workbench and test both WASM and optional WebGPU, cold/warm timings, fail-closed behavior, and unchanged Auth. End-to-end live dataset retrieval is deliberately deferred to V3.7D.2C.6B.

## Rollback
`ROLLBACK_V37D2C6A.ps1` is local-only and refuses after Git HEAD changes; after commit use a reviewed Git revert. Backups live under ignored `.myway-patch-backups` and ignored `installation.json` markers.
