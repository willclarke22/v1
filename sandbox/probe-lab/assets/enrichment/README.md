# Asset appearance enrichment

Phase 1 keeps visual analysis outside scene generation:

1. Blender creates four standardized 512 × 512 renders.
2. `nvidia/nemotron-nano-12b-v2-vl` writes an open-vocabulary appearance profile.
3. `nvidia/nemotron-3-embed-1b` embeds the normalized appearance text.
4. The vector is stored outside `registry.json`; the registry stores only its reference.

New non-primitive assets are queued automatically. Existing assets can be processed one at a time from the Asset Library with **Analyze next pending asset**.

## Environment

The existing `NVIDIA_API_KEY` is used by default for hosted endpoints.

Optional overrides:

```env
MYWAY_ASSET_NVIDIA_API_KEY=nvapi-...
MYWAY_ASSET_VISION_MODEL=nvidia/nemotron-nano-12b-v2-vl
MYWAY_ASSET_VISION_BASE_URL=https://integrate.api.nvidia.com/v1
MYWAY_ASSET_EMBED_MODEL=nvidia/nemotron-3-embed-1b
MYWAY_ASSET_EMBED_BASE_URL=http://127.0.0.1:8000/v1
```

`MYWAY_ASSET_EMBED_BASE_URL` should point to the OpenAI-compatible `/v1` root for the Nemotron embedding NIM or another compatible deployment. Local endpoints do not require an API key in this sandbox implementation.

## Style-personalization profile

Prompt v3 treats identity as context and prioritizes visible style: realism, era or
aesthetic language, shape language, material treatment, palette, surface
condition, ornamentation, mood, detail level, and visual scene compatibility.
These fields lead the embedding source text so future contextual learner
preferences can rank identity-valid assets by visual fit. Existing profiles remain
readable; re-analysis fills the new fields and replaces the durable embedding.

## Analyze every existing asset

The Asset Library has an **Analyze all assets** action. The same operation can be
run from PowerShell while the local Next.js server is running:

```powershell
& ".\sandbox\probe-lab\assets\scripts\analyze-all-existing-assets.ps1"
```

The script queues every eligible non-primitive asset, then follows the lightweight
in-memory queue until all requested analyses finish. Use `-NoForce` to keep an
existing complete profile instead of rerendering it. Because the queue is local
and in memory, the Next.js server must remain running for the whole batch.

The Asset Library polls only the queue while work is active. It pauses polling
when the browser tab is hidden and reloads the full registry only when an analysis
reaches a terminal state.

## Identity-safe embedding artifacts

The registry keeps a stable logical embedding reference derived from the current
technical asset ID:

```text
sandbox/probe-lab/assets/embeddings/<asset_id>.json
```

With R2 configured, that reference resolves cloud-first to the private source
bucket at `metadata/myway/assets/embeddings/<asset_id>.json`; a repository copy is
written only when the local metadata mirror is explicitly enabled. Local-only
mode keeps the existing on-disk behavior.

Changing the verified canonical label marks only the appearance embedding as
pending and queues an embedding-only refresh using the existing ready appearance
profile. It does not rerender the GLB or rerun vision analysis unless the ready
profile is unavailable. Identity repair remains compatible with the logical
reference while the cloud object is authoritative.

## Temporary hydration policy

When an asset's `public_path` is already an HTTPS/R2 URL, appearance enrichment
downloads the GLB only into a unique OS-temporary MyWay workspace. The workspace
is removed in a `finally` path whether analysis succeeds or fails. New remote
enrichment runs therefore no longer populate
`sandbox/probe-lab/assets/enrichment/cache`.

Local-only candidates continue to use their existing project model while they are
pending review. In Phase 2, however, the four analysis renders are generated in
a temporary workspace and uploaded to the public runtime bucket, and the
appearance embedding is written to the private source bucket. The registry stores
R2 URLs for analysis views and the same stable logical key for the embedding.
Temporary render/input files are removed in `finally` paths.

The shared temporary root defaults to:

```text
%TEMP%\myway-assets\
```

Optional controls:

```env
MYWAY_ASSET_TEMP_ROOT=D:\MyWayTemp
MYWAY_ASSET_TEMP_MAX_AGE_HOURS=24
```

`MYWAY_ASSET_TEMP_ROOT` must be outside the MyWay project.

## Backfill only incomplete Needs Review enrichment

Use this targeted maintenance script when the Asset Library's **Needs Review**
section contains assets that are missing Omni vision analysis and/or a durable
appearance embedding:

```powershell
& ".\sandbox\probe-lab\assets\scripts\analyze-needs-review-missing-enrichment.ps1"
```

The selector mirrors the visible Needs Review tab (`scene_review_status ===
"pending"`) and is intentionally narrower than **Analyze all assets**:

- vision not ready → queue the existing full vision → embedding pipeline;
- vision ready but embedding not ready, failed, or missing its durable
  `vector_key` → queue embedding-only refresh;
- vision + embedding already ready → do nothing;
- primitive, rejected, approved, and missing-file rows are never silently
  reprocessed.

The script polls the existing serialized in-memory enrichment queue until every
queued asset finishes. Keep the local Next.js server running for the whole
batch; if it restarts, rerun the script and the selector will naturally skip
assets that are already complete.

