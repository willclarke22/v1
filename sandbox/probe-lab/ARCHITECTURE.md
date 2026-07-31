# MyWay Probe Lab Architecture

The sandbox is organized around one principle:

> MyWay directs an exceptional educational sequence first, then late-binds the
> best available actors, geometry, renderer behaviours, and production tools.

## Canonical flow

```txt
Learner signal + diagnosis
        ↓
Visual Learning Semantic Draft
        ↓
Educational Scene Director
  - scene thesis
  - representation strategy
  - stable actor ids
  - directed moments
  - semantic behaviours
  - camera cues
  - timed text cues
  - success observations
        ↓
Compatibility adapters
  - Visual Experience story beats
  - executable semantic beats
  - Primitive Builder reveal beats
  - directed-scene hints
        ↓
Shared Scene Resource Plan
  - entity model requirements
  - surface material requirements
  - scene environment requirements
  - auxiliary authoring/runtime requirements
  - explicit fallbacks and performance budgets
        ↓
Set and casting
  - asset requirements
  - reviewed asset resolver
  - missing-asset queue
  - logical sizing
  - geometry profiles
  - spatial constraints
  - collision-safe layout
        ↓
Execution
  - Three.js immediate interactive playback
  - optional Blender scene compilation/rendering later
        ↓
Diagnostic frame review and correction loop
```

## Ownership boundaries

### Educational Scene Director

Owns why the scene exists and what must happen:

- what the learner must notice;
- the order in which ideas become necessary;
- the representation mode;
- actor identities and capability needs;
- semantic movement;
- camera intent;
- concise timed teaching text;
- the observable result of each moment.

The director never chooses asset ids, providers, URLs, files, exact mesh
coordinates, collision solutions, or renderer implementation details.

### Primitive Builder and shared scene runtime

Own set construction and safe placement:

- invisible layout proxies;
- physical asset requirements;
- real-world sizing;
- attachment, containment, support, and adjacency intent;
- reviewed-asset resolution;
- measured geometry regions;
- collision-safe final placement;
- unresolved diagnostics and acquisition jobs.

### Shared scene resource plan

Owns the deterministic execution-resource request derived from the Director:

- entity model requirements tied to stable Director ids;
- material-slot and surface requirements;
- scene-level environment intent;
- auxiliary runtime versus authoring-only resources;
- explicit fallback and performance budgets;
- validation before resource resolution.

It does not choose provider ids, URLs, object keys, or acquire missing files.

### Asset runtime

Own actor availability and quality:

- identity and appearance review;
- licensing and provenance;
- geometry profiles;
- reusable GLBs;
- BlendKit, TRELLIS, local import, and GLM procedural acquisition;
- late binding to stable director entity ids;
- future reviewed-resource resolution from `myway_scene_resource_plan_v1`;
- acquisition as a separate explicit operation rather than hidden resolution behavior.

### Three.js player

Own immediate interactive execution:

- current supported behaviour compilation;
- progressive reveal and scrubbing;
- camera tracks;
- labels and timed text;
- selection and guided interaction;
- graceful diagrammatic proxies while an actor is unresolved.

### Blender

Blender remains a production tool, not the source of educational intelligence.

Current Blender code mainly prepares individual assets. A future separate
Blender Scene Compiler should consume the same director contract to author
cameras, keyframes, text, diagnostics, and premium renders without changing the
lesson plan.

## Compatibility policy

Older structures remain readable while the sandbox migrates:

- `directed_scene`
- `scene_moments`
- `story_beats`
- semantic `beats`
- Primitive Builder reveal `beats`
- inferred motion and camera tracks
- `primitive_build_plan_v1`

They are compatibility views. New model prompts author
`myway_educational_scene_director_v1`, and MyWay derives the older views.

## Missing-asset invariant

A missing asset may reduce literal visual fidelity, but it must not delete or
weaken:

- the actor's stable id;
- its semantic role;
- required capabilities and anchors;
- its directed events;
- camera cues;
- text cues;
- the causal sequence.

This lets a better actor plug in later without regenerating or reinterpreting
the educational direction.

## Phase 2C resolution boundary

```text
SceneResourcePlanV1
  -> pure reviewed-resource resolution
  -> ResolvedSceneResourcesV1 or declared fallback

Explicit acquisition request
  -> queue or sandbox provider
  -> normalization and review
  -> future registry snapshot
```

Scene compilation never invokes providers, mutates reuse telemetry, or selects
pending resources.

## Phase 2D runtime hydration

The first canonical execution proof lives under
`sandbox/probe-lab/resource-runtime/`.

```txt
ResolvedSceneResourcesV1
→ RuntimeModelBindingV1
→ shared browser GLB runtime
→ independent render instance
→ lifecycle diagnostics and disposal
```

The runtime may hydrate only bindings emitted by the reviewed Phase 2C
resolver. It does not search providers, change the scene plan, or enqueue
acquisition. R2 bindings require HTTPS URLs. Loading failures preserve the
Director entity id and render a declared diagrammatic proxy.

The existing `useGLTF` paths in the Asset Library, Primitive Builder, and Visual
Experience remain compatibility loaders until those labs are migrated in later
Phase 2 integration patches.

## Phase 2F material runtime

The reviewed Resource Runtime now includes a deterministic material lane.
Published ambientCG materials are resolved without acquisition, normalized into
`myway_material_runtime_v1`, hydrated through one browser texture cache, and
applied to primitives or explicit GLB overrides. Colour-space, normal-map,
packed-channel, UV, fallback, and Blender Principled BSDF rules are centralized
in `resource-runtime/material-map-policy.ts`. HDRI execution remains Phase 2G.

## Phase 2G: reviewed environment runtime

The shared renderer boundary now has a third reviewed-resource lane:

```txt
Director lighting intent
→ environment resolver
→ RuntimeEnvironmentBindingV1
→ HDRI proxy / deterministic light rig
→ renderer-local PMREM
→ scene.environment and background policy
```

Environment resources remain subordinate to the Director. They may satisfy
lighting, reflection, background, exposure, and shadow intent, but they may not
change entity IDs, lesson structure, camera meaning, motion meaning, or
educational sequencing.

PMREM targets are renderer-owned rather than globally shared across WebGL
contexts. Downloaded source bytes may be deduplicated globally. This distinction
prevents cross-canvas GPU resource ownership bugs while retaining network reuse.

