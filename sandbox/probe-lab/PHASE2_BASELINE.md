# Phase 2 Active Baseline

Prepared from the active-only sandbox snapshot generated July 30, 2026.

## Baseline scope

The active snapshot contains 364 text files from:

- `sandbox/`
- `app/sandbox/`
- `app/api/sandbox/`
- `lib/sandbox/`

Historical `.myway-patch-backups`, dependency folders, build output, archives, the
virtual environment, and `sandbox/probe-lab/assets/jobs` are excluded.

This document records architecture and file authority. It does not claim that a
build passed on another machine. Run `scripts/sandbox/audit-phase2-baseline.ps1`
and `pnpm build` after applying each Phase 2 patch.

## Canonical educational path

1. `sandbox/probe-lab/visual-experience/visual-learning-semantic-draft.ts`
2. `sandbox/probe-lab/director/director-contract.ts`
3. `sandbox/probe-lab/director/normalize-director-plan.ts`
4. `sandbox/probe-lab/scene-resources/scene-resource-contract.ts`
5. `sandbox/probe-lab/scene-resources/resource-plan-adapters.ts`
6. builder-specific geometry and compatibility adapters
7. reviewed-resource resolution
8. Three.js execution or future Blender scene compilation

`myway_educational_scene_director_v1` remains the educational source of truth.
`myway_scene_resource_plan_v1` is an execution-resource request derived from the
Director. It does not replace the Director.

## Canonical resource and storage files

### Reviewed model library

- `sandbox/probe-lab/assets/asset-types.ts`
- `sandbox/probe-lab/assets/asset-library.server.ts`
- `sandbox/probe-lab/assets/normalize-asset-record.ts`
- `sandbox/probe-lab/assets/validate-asset-record.ts`
- `sandbox/probe-lab/assets/library/registry.json`

### Existing model resolver

- `sandbox/probe-lab/assets/asset-resolver.server.ts`
- `sandbox/probe-lab/assets/appearance-ranking.server.ts`

The existing resolver remains active for current model-only paths. Phase 2C will
introduce a pure reviewed-resource resolution boundary and separate acquisition
from resolution. Phase 2B does not remove or rewrite the working resolver.

### ambientCG catalog and cached resources

- `sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-types.ts`
- `sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-store.server.ts`
- `sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-download.server.ts`
- `sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-hydration.server.ts`
- `sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-resource-management.server.ts`

### Cloud storage

- `sandbox/probe-lab/assets/storage/asset-storage.ts`
- `sandbox/probe-lab/assets/storage/r2-asset-storage.server.ts`
- `sandbox/probe-lab/assets/storage/cloud-json.server.ts`
- `sandbox/probe-lab/assets/cloud-library-migration.server.ts`

R2 is authoritative after verification. Local files remain temporary processing,
optional debugging, or compact registry mirrors.

## Builder integration points

### Manual Turn

Manual Turn uses the Visual Learning Turn assembly and normalization path. Its
shared resource plan is therefore carried inside
`visual_experience.semantic_scene_plan.resource_plan`.

### Primitive Builder

`sandbox/probe-lab/primitive-builder/primitive-scene-graph.ts` owns the active
hybrid graph. It now derives a shared resource plan from the canonical Director
and optional primitive asset requirements.

### Visual Experience

`sandbox/probe-lab/visual-experience/normalize-visual-learning-turn-output.ts`
normalizes strict and near-miss outputs into the Director plan and now derives the
same shared resource plan.

### Saved scenes

`sandbox/probe-lab/scenes/scene-manifest.ts` carries Director, resource-plan, and
future resolved-resource fields. `validate-scene-manifest.ts` normalizes saved
resource plans or rebuilds them from the Director when absent.

## Phase 2B invariants

- Director contracts contain requirements, not provider URLs.
- Resource intent targets stable Director entity ids.
- Environment intent is scene-level.
- Materials target entity material slots or named surfaces.
- Runtime and Blender-authoring-only resources are distinguished.
- Acquisition policy defaults to `never`.
- Fallbacks preserve stable entity ids.
- Performance budgets are explicit.
- Unknown resource kinds and invalid cross-references fail validation.
- Current renderers remain backward compatible because new fields are additive.

## Required verification after applying the patch

```powershell
pnpm build
powershell -ExecutionPolicy Bypass -File scripts\sandbox\audit-phase2-baseline.ps1
git status --short
```

The apply script performs these checks automatically unless the build is skipped
explicitly.

## Phase 2C installed state

Canonical Phase 2C files:

- `assets/reviewed-asset-resolver.server.ts`
- `assets/asset-acquisition.server.ts`
- `scene-resources/resolve-reviewed-scene-resources.server.ts`
- `scripts/sandbox/verify-phase2c-resolver.ts`

Primitive Builder and Visual Experience use reviewed resolution against a shared
snapshot. Primitive Builder no longer starts missing-asset acquisition unless
the request explicitly supplies an acquisition policy.

## Phase 2D runtime baseline

Phase 2D adds a focused resource-runtime harness and shared hydration boundary:

- `sandbox/probe-lab/resource-runtime/`
- `app/sandbox/probe-lab/resource-runtime/page.tsx`
- `app/api/sandbox/probe-lab/resource-runtime/route.ts`
- `app/api/sandbox/probe-lab/resource-runtime/blender-hydrate/route.ts`

The browser runtime deduplicates immutable URL/hash loads, creates independent
scene instances, records lifecycle metrics, and disposes owned instance
resources. Blender hydration writes only the selected binding to an OS
temporary directory and cleans it after use.

This patch does not migrate the larger labs or implement material and HDRI
application.

## Phase 2F status

The shared runtime now resolves R2-published CC0 materials deterministically,
loads PBR maps with correct colour-space policy, applies independent material
instances to primitives and explicit GLB overrides, and translates the same
binding into a temporary Blender Principled BSDF hydration report. Full HDRI
environment execution and teaching-lab migration remain open.

## Phase 2G baseline

The Resource Runtime now contains an isolated reviewed environment and lighting
proof. It includes deterministic ambientCG HDRI resolution, no-acquisition
fallback behavior, an exact-URL R2 proxy, HDR/EXR loader selection, renderer-
local PMREM ownership, independent lighting/background controls, ACES Filmic
tone mapping, exposure and shadow policy, deterministic fallback rigs, browser
cache diagnostics, and Blender World hydration/cleanup.

The active ambientCG HDRI registry may legitimately be empty. In that state the
fallback bindings remain the required production-safe behavior, and the HDRI
button remains unavailable until an HDRI has been reviewed and published to R2.

