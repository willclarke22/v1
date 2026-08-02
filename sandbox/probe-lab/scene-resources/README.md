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

Model, material, and environment intents now resolve through reviewed,
deterministic R2-backed resolvers. Auxiliary intents receive an honest runtime
classification (`direct_runtime`, `requires_compilation`, `blender_only`, or
`unsupported`) and preserve explicit fallbacks. Scene resolution always forces
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
binding used by the Resource Runtime harness. Resolved material bindings are attached to the shared runtime only after the
educational direction and stable entity ids are fixed. Manual Turn, Primitive
Builder, and Visual Experience expose the same execution panel and may change
resource choices without regenerating teaching content.

## Environment handoff

Phase 2G keeps environment selection in the reviewed Resource Runtime rather than
embedding renderer objects in `SceneResourcePlanV1`. The Director may declare
lighting/background intent; the environment resolver turns that intent into a
versioned `RuntimeEnvironmentBindingV1`. Model and material entity bindings are
not rewritten when an environment changes.


## Phase 2 closeout integration

`lab-runtime-resolution.server.ts` is the common Manual Turn, Primitive Builder,
and Visual Experience composition boundary. It normalizes an existing
`myway_scene_resource_plan_v1`, applies only explicit execution overrides,
resolves reviewed resources, adapts supported primitive nodes, builds
`RuntimeSceneBindingV1`, and emits one `myway_phase2_run_inspector_v1` record.

The inspector traces:

```text
educational direction
→ normalized resource intent
→ deterministic candidate diagnostics
→ selected bindings and declared fallbacks
→ compiled shared runtime scene
→ browser lifecycle diagnostics
```

Resource replacement never rewrites narration, timing, camera cues, semantic
roles, or stable entity ids. Missing resources remain visible through declared
proxies or renderer fallbacks. Acquisition stays separate and never runs inside
scene compilation.

Auxiliary resource policy is intentionally honest:

- atlases and reviewed images can enter direct runtime binding;
- terrain and decals require deterministic compilation before runtime use;
- brushes and substances are Blender authoring inputs and require baking;
- unsupported resources never pretend to be browser-ready.
