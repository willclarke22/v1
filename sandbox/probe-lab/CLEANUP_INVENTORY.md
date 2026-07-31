# Phase 2 Cleanup Inventory

Cleanup is a gate at the end of every subphase, not a single destructive step.
No file listed here should be deleted until imports, runtime reads, cloud state,
and rollback requirements are verified.

## Classification rules

Every sandbox path should be classified as:

1. canonical source;
2. compatibility adapter;
3. generated runtime state;
4. debug or test evidence;
5. obsolete or duplicate implementation;
6. candidate for promotion to permanent runtime code.

## Current canonical source areas

- `sandbox/probe-lab/director/`
- `sandbox/probe-lab/scene-resources/`
- `sandbox/probe-lab/primitive-builder/`
- `sandbox/probe-lab/scenes/`
- active Visual Learning Turn files under `sandbox/probe-lab/visual-experience/`
- `sandbox/probe-lab/assets/` services, contracts, providers, storage, and UI
- route shims under `app/api/sandbox/probe-lab/`
- page shims under `app/sandbox/probe-lab/`

## Compatibility code that remains intentionally active

Do not remove yet:

- `directed_scene`
- `scene_moments`
- `story_beats`
- semantic compatibility `beats`
- Primitive Builder reveal beats
- `primitive_build_plan_v1`
- legacy fallback/replacement fields in saved scene and asset requirement types
- older Visual Experience compiler types used by the existing player

These can be removed only after all readers migrate to the Director and shared
resource contracts and regression fixtures prove old saved scenes still load.

## Generated-state cleanup candidates

Review retention, source-control, and migration needs for:

- `sandbox/probe-lab/assets/debug/`
- `sandbox/probe-lab/assets/embeddings/`
- `sandbox/probe-lab/assets/acquisition/missing-asset-jobs.json`
- `sandbox/probe-lab/assets/downloads/ambientcg/jobs.json`
- `sandbox/probe-lab/blender-python-builder/jobs/`
- local registry mirrors under `sandbox/probe-lab/assets/library/`
- cached source records and licence review snapshots after verified R2 publication

Actions may include moving generated data outside source-oriented folders,
retention limits, `.gitignore` rules, compaction, or explicit debug-retention
flags. Do not delete authoritative or not-yet-published metadata.

## Large-file refactoring candidates

These files are active but large enough to deserve later focused decomposition:

- `sandbox/probe-lab/assets/ui/asset-library-lab.tsx`
- `sandbox/probe-lab/assets/ui/ambientcg-library-lab.tsx`
- `sandbox/probe-lab/primitive-builder/ui/primitive-builder-lab.tsx`
- `sandbox/probe-lab/director/normalize-director-plan.ts`
- `sandbox/probe-lab/visual-experience/model-provider.server.ts`
- `sandbox/probe-lab/visual-experience/visual-learning-turn-request.ts`
- `sandbox/probe-lab/visual-experience/ui/scene-player/directed-scene-compiler.ts`

Refactor only when a Phase 2 subphase already touches the relevant boundary.
Avoid unrelated broad rewrites.

## Duplicate-boundary review

Before Phase 2C, confirm and document the authority of:

- model-only `asset-resolver.server.ts` versus shared scene-resource resolution;
- old Visual Experience compiler schema versus Visual Learning Turn Director path;
- local JSON registries versus R2 authoritative snapshots;
- scene asset bindings versus future `ResolvedSceneResourcesV1`;
- browser hydration versus Blender hydration.

## End-of-subphase cleanup checklist

1. Search imports and references.
2. Confirm compatibility readers.
3. Remove dead exports and unused helpers.
4. Consolidate duplicate types and validators.
5. Update README and architecture documents.
6. Move or compact generated state safely.
7. Run the baseline audit.
8. Run `pnpm build` and relevant tests.
9. Inspect `git status --short`.
10. Delete only after a verified replacement and rollback path exist.

## Promotion rule

Once a module is stable and used outside experiments, move it from `sandbox` to
a permanent runtime boundary such as `lib/rendering`, `lib/engine/renderers`, or
a dedicated permanent resource module. Leave compatibility re-exports during the
migration and remove them only after callers have moved.

## Phase 2C cleanup classification

Canonical:

- `assets/reviewed-asset-resolver.server.ts`
- `assets/asset-acquisition.server.ts`
- `scene-resources/resolve-reviewed-scene-resources.server.ts`

Compatibility-only:

- `assets/asset-resolver.server.ts`
- legacy `allow_blenderkit` and `allow_trellis` request fields

Deferred cleanup:

- keep `reuse_count` only as telemetry/UI data;
- keep historical acquisition jobs and debug files until a retention patch;
- remove the compatibility facade only after every manual caller has migrated.

## Phase 2D runtime cleanup classification

Canonical new code:

- `sandbox/probe-lab/resource-runtime/resource-runtime-contract.ts`
- `sandbox/probe-lab/resource-runtime/build-runtime-binding.ts`
- `sandbox/probe-lab/resource-runtime/browser-glb-runtime.ts`
- `sandbox/probe-lab/resource-runtime/hydrate-resolved-model-for-blender.server.ts`
- `sandbox/probe-lab/resource-runtime/routes/`
- `sandbox/probe-lab/resource-runtime/ui/`

Compatibility loaders retained intentionally:

- `useGLTF` in `assets/ui/asset-library-lab.tsx`
- `useGLTF` in `scenes/ui/resolved-asset-model.tsx`
- `useGLTF` in `visual-experience/ui/visual-experience-player.tsx`
- `useGLTF` in `blender-python-builder/ui/blender-python-builder-lab.tsx`

Do not remove these loaders until each owning lab is migrated and its existing
preview behavior is covered by tests. The Phase 2D browser cache is the
canonical future runtime path, not an additional selection system.

## Phase 2F cleanup classification

- `resource-runtime/browser-texture-runtime.ts` is the canonical experimental
  browser texture cache. New labs must not create another independent texture
  cache.
- `resource-runtime/browser-material-runtime.ts` is the canonical experimental
  PBR material application layer.
- Existing texture and material handling inside older GLB/scene-player
  components remains compatibility code until those callers migrate.
- Temporary Blender material hydration is OS-temp-only and is removed after
  each request.
- Material resolver diagnostics are response data, not source-controlled debug
  artifacts.

## Phase 2G lighting classification

Canonical shared runtime:

- `resource-runtime/environment-runtime-contract.ts`
- `resource-runtime/environment-runtime-policy.ts`
- `resource-runtime/reviewed-environment-resolver.server.ts`
- `resource-runtime/browser-environment-runtime.ts`
- `resource-runtime/environment-proxy.server.ts`
- `resource-runtime/hydrate-runtime-environment-for-blender.server.ts`

Compatibility or lab-specific lighting:

- Resource Runtime model/material canvases retain their earlier local light rigs
  for isolated Phase 2D/2F tests.
- Primitive Builder, Manual Turn, Motion & Camera Library, and Visual Experience
  light setups remain lab-specific until Phase 2H composition/migration work.
- No existing lab light rig is deleted in Phase 2G.

Generated or temporary environment output:

- browser PMREM targets are renderer-owned and disposable;
- source downloads are memory-cache entries, not project files;
- Blender HDR/EXR files live under operating-system temporary directories and
  are removed before the route returns.

