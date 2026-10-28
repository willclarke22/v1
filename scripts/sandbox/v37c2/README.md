# MyWay V3.7C.2 — Assessment & Teaching Preview

This is a *local, experimental* learning-turn preview. It reads topic records from the pinned `myway_sandbox` Supabase project; it **does not** create/update/delete learner state, run the Director, start workers, or update the 3D layout.

## New capabilities
- Same-tab Learning Space / Workbench navigation remains.
- Composer invokes validated V3.6 Model A assessment (Edge Dev default, opt-in OpenAI if a sandbox-only key is configured). At most one clarification is requested.
- Root-problem evidence must originate from learner statements. Unsupported assessments are held rather than turned into teaching decisions.
- Experimental Supabase semantic topic retrieval is used when the existing Python 384-d MiniLM service is explicitly configured at **loopback `EMBEDDINGS_URL`**. If unavailable, topic-name lexical matching is clearly labelled as a **non-semantic fallback** in the Workbench.
- Model B selects a teaching plan and generates the frozen `myway_visual_handoff_v1`. Director does not run.
- The latest trace lives in same-tab `sessionStorage` only; click Clear in Workbench to remove it.

## Running
Stop the previous server (port 3001) first. Then:

```powershell
& '.\scripts\sandbox\v37c2\run-learning-turn-preview.ps1'
```

Optional guarded production build (not necessary for dev preview):

```powershell
& '.\scripts\sandbox\v37c2\run-guarded-build.ps1'
```

**Do not** use `pnpm dev` or start the legacy worker. Do not publish experimental branch or run old production routes. Bare `pnpm build` intentionally remains blocked by the startup gate.

## Providers
- Edge Dev: browser must expose `LanguageModel` Prompt API. This is the default and needs no API key.
- OpenAI: optional explicit select. If configured, add `MYWAY_OPENAI_API_KEY=...` **only in experimental `.env.local`** without copying original project credentials. The existing local-assessment API routes process inference and do not write learning records. Never expose API keys in screenshots/logs.
- MiniLM: to activate actual semantic retrieval, configure a loopback Python embedding service URL in experimental `.env.local`, e.g. `EMBEDDINGS_URL=http://127.0.0.1:<your_existing_embedding_port>` (the port must match your running service). The index contains existing local-embedding-service centroids. Browser models must be parity-tested before using their vectors.

No learner-state writes; 42 topics are a cloned test baseline. The Workbench snapshots and trace are independent: database snapshot comes from Supabase, trace stays in browser tab. Model responses can be wrong and should be evaluated before activating state updates in later V3.7D/V3.8 patches.
