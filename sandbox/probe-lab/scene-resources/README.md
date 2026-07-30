# Shared Scene Resources

This folder contains the Phase 2 resource intent and binding boundary shared by
Manual Turn, Primitive Builder, Visual Experience, browser rendering, and future
Blender scene compilation.

## Ownership

The Educational Scene Director remains the source of educational truth. It owns
stable actor ids, semantic roles, directed moments, camera intent, movement, and
teaching text.

The resource plan answers a narrower question:

> What reviewed models, materials, environment resources, and auxiliary files
> are needed to execute that already-approved direction?

The resource plan must not contain provider search logic, implicit acquisition,
or a replacement lesson plan.

## Current Phase 2B files

- `scene-resource-contract.ts` — versioned intent, validation, fallback,
  performance, and future resolved-binding types.
- `resource-plan-adapters.ts` — deterministic adapter from the canonical
  Director plan, with optional Primitive Builder requirement details.
- `normalize-scene-resource-plan.ts` — backward-compatible normalization for
  saved or externally supplied resource plans.
- `validate-scene-resource-plan.ts` — cross-reference and invariant validation.

## Phase 2C boundary

The shared runtime resolver will consume `SceneResourcePlanV1` and return
`ResolvedSceneResourcesV1`. It must resolve reviewed resources only and must not
silently acquire resources. Acquisition remains a separate explicit operation.

## Phase 2C implemented scene resolver

`resolve-reviewed-scene-resources.server.ts` consumes one validated
`SceneResourcePlanV1` and one resolver snapshot. It resolves reviewed model
intents and emits `ResolvedSceneResourcesV1` with registry hashes, request
hashes, candidate diagnostics, selection explanations, stable entity ids,
warnings, and fallbacks.

Material, environment, and auxiliary intents remain preserved but explicitly
deferred to their later Phase 2 resolvers. Scene resolution always forces
acquisition policy to `never`.

## Phase 2D handoff

`ResolvedSceneResourcesV1.models` now hands off to
`resource-runtime/build-runtime-binding.ts`. The resource runtime validates the
resolved URL and provenance fields before browser or Blender hydration. The
Phase 2C resolver accepts an optional `preferred_asset_ids_by_intent` map only
for deterministic explicit-selection tools such as the runtime harness; normal
scene resolution remains score-driven and acquisition-free.

## Phase 2F material execution

`SceneResourcePlanV1.surface_intents` remain the canonical material intent
source. Phase 2F adds the deterministic reviewed-material resolver and runtime
binding used by the Resource Runtime harness. Full automatic attachment of
resolved material bindings to every scene pipeline is intentionally deferred
until the shared runtime migration patch; current teaching-lab behavior is not
silently changed.
