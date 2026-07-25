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
readable; re-analysis fills the new fields and replaces the local embedding.

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

The canonical local embedding filename is derived from the current technical
asset ID:

```text
sandbox/probe-lab/assets/embeddings/<asset_id>.json
```

Renaming an asset ID now moves that local vector file, rewrites the vector
record's `asset_id`, updates `appearance_embedding.vector_key`, and updates
exact saved JSON references in one rollback-safe transaction. Model, thumbnail,
license, and R2 source paths remain unchanged because those are immutable import
provenance rather than derived identity artifacts.

Changing the verified canonical label marks only the appearance embedding as
pending and queues an embedding-only refresh using the existing ready appearance
profile. It does not rerender the GLB or rerun vision analysis unless the ready
profile is unavailable.

After installing this behavior, repair older mismatches with `pnpm dev` running:

```powershell
& ".\sandbox\probe-lab\assets\scripts\repair-identity-artifacts.ps1"
```
