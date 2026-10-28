# MyWay V3.7C.2.3: GLM + Model and Retrieval Performance

## Changes (experimental worktree only)
- Adds GLM through **NVIDIA NIM, direct Z.ai, or OpenRouter** as **opt-in** model provider for each role: Model A assessment and Model B teaching.
- Default GLM model: `glm-5.3-flash` with low reasoning effort; optional `glm-5.3`, `glm-5.3-flashx` through `MYWAY_GLM_MODEL` (OpenRouter uses prefixed model IDs).
- Fixed provider HTTPS endpoints (NVIDIA, Z.ai, or OpenRouter), chosen server-side. Key is server-side, read only from experimental `.env.local`; never in client code or Workbench.
- Current Edge/OpenAI integrations preserved, with the same contract validators, status decisions, and two-stage sequence.
- Workbench shows model prompt/output **character counts** for all providers; true token counts only for GLM if supplied by the provider. No invented token estimates.
- Logs model/provider duration, output-size diagnostics; provider duration overlaps request duration, not summed twice.
- Labels for lexical fallback cached in memory for 60 seconds after a read; source remains pinned to experimental Supabase, no learner text in the cache.
- No schema changes, learner-state writes, worker operations, topic creation, or production modification.

## Configure NVIDIA GLM (recommended for this project; no credentials included in patch)

In experimental `C:\Users\willc\projects\MyWay\v1-learning-experiment\.env.local`, add or update these entries while keeping existing Supabase/runtime variables intact:

```dotenv
MYWAY_GLM_BACKEND=nvidia
NVIDIA_API_KEY=YOUR_EXISTING_NVIDIA_KEY
MYWAY_GLM_MODEL=z-ai/glm-5.3
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
```

`z-ai/glm-5.3-flash` is also on NVIDIA's catalog and may be tested by changing only the model value. API credentials never go in the browser or the patch. The key may be stored in original `v1/.env.local`; copy just `NVIDIA_API_KEY` manually into **experimental** `.env.local`, leaving original file unchanged. Never paste credentials in chat. If a different `NVIDIA_BASE_URL` is configured, the GLM route **rejects** it rather than sending your key to an unverified host. When GLM is selected in the UI the Workbench labels its actual backend.

## Configure GLM (other optional providers; not added by installer)
In `C:\Users\willc\projects\MyWay\v1-learning-experiment\.env.local`, set:

```
MYWAY_GLM_API_KEY=<your own Z.ai API key>
MYWAY_GLM_MODEL=glm-5.3-flash
```

`ZAI_API_KEY` is also accepted if set server-side. **Or**, to reuse an OpenRouter key (as in some earlier MyWay experiments), use:

```
MYWAY_GLM_BACKEND=openrouter
OPENROUTER_API_KEY=<your own OpenRouter key>
MYWAY_GLM_MODEL=z-ai/glm-5.3-flash
```

For the larger GLM model, set `MYWAY_GLM_MODEL=glm-5.3` for direct Z.ai or `z-ai/glm-5.3` for OpenRouter. Allowed models are explicit; arbitrary endpoints aren't supported. Choose explicitly with `MYWAY_GLM_BACKEND=nvidia|zai|openrouter`. Without an explicit backend, only the available key is autodetected, with Z.ai taking precedence if several are configured.

**Never share API credentials.** These are pay-as-you-go model API endpoints, not a coding subscription; usage may incur charges. Restart the guarded preview to load environment changes. Do not paste your key in chat.

## Run
1. Stop any preview listening on port 3001. Keep the original MyWay server alone.
2. Install with the packaged PowerShell installer (guarded source hashes and rollback).
3. Start only with `& '.\scripts\sandbox\v37c23\run-glm-preview.ps1'`.
4. Run the same prompt with A/B provider choices: Edge/Edge, GLM/GLM, OpenAI/OpenAI (if configured), or mixed. Avoid parallel automatic calls; each selection makes real inference calls.
5. Check Workbench session latency comparison. Cold and warm runs may differ. Model output correctness still matters.
6. Optional guarded build: `& '.\scripts\sandbox\v37c23\run-glm-guarded-build.ps1'`.

## Limits
- The local embedding service is still optional. Without `EMBEDDINGS_URL`, retrieval remains explicitly lexical and is not semantic similarity.
- Performance improvements are hypotheses until measured on your machine. The server label cache saves repeated SELECTs only for fallback requests within 60s.
- GLM may return incomplete or invalid JSON; existing validators will reject rather than silently invent teaching progress.
- This does not enable persistent learning-state writes, new topic creation, or Director rendering.
