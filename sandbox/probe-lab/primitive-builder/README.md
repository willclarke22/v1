
# Asset Scene Builder Lab

Primitive Builder is the set-building and casting layer for the canonical
Educational Scene Director.

## Generation path

1. The model returns `primitive_scene_graph_v2` with a canonical
   `director_plan`.
2. `director_plan` preserves the educational sequence, stable actor ids,
   semantic behaviours, cameras, and timed text even when final assets do not
   exist.
3. MyWay derives `myway_scene_resource_plan_v1` from the Director and builder
   requirements. The resource plan carries actor needs, explicit fallbacks, and
   performance budgets without selecting files.
4. Primitive nodes are normalized as invisible layout proxies.
5. Every physical actor is represented by an asset requirement whose
   `instance_id` matches the director entity id.
6. MyWay resolves requirements against semantically verified, scene-approved
   library assets.
7. Resolved GLBs are sized and laid out using Geometry Profile, spatial
   constraints, and collision-safe layout.
8. Unresolved actors remain in the director and resource plans, are reported as
   **Missing from scene**, and are queued for acquisition.
9. Legacy Primitive Builder reveal beats are derived from director moments.

The model never chooses asset ids, paths, providers, URLs, exact collision
solutions, or renderer code. MyWay owns those execution details.

## Direction before assets

A missing physical actor may be absent from the current literal 3D render, but
the following must remain complete:

- stable entity id;
- semantic role;
- capability and anchor needs;
- movement sequence;
- camera focus and framing;
- timed teaching text;
- success observation.

When a reviewed asset later binds to the same entity id, the scene does not
need to be re-directed.

## Layout proxies

Physical primitive proxies are never rendered as substitutes for missing
assets. They communicate approximate bounds, grouping, relative position,
support relationships, and spatial intent.

Only explicitly requested abstract effects normalized as
`procedural_required` may render without a physical asset.

## Automatic missing assets

The existing sandbox generation path can still create one shared acquisition
job per normalized missing concept. BlendKit runs first and TRELLIS may be used
as a fallback. Refreshing missing assets re-runs deterministic resolution
against the saved graph and director entity ids; it does not call the directing
model again.

This is an explicit builder/acquisition workflow. The shared Phase 2 resource
plan defaults to `acquisition_policy: "never"`; the Phase 2C resolver will not
silently acquire resources while resolving a scene.

## Spatial and appearance invariants

Asset selection remains identity-first and review-gated. Appearance requests
are open vocabulary and never allow the model to choose a specific asset.

Final placement uses logical real-world size, measured geometry regions,
support/containment/attachment/adjacency constraints, fit, clearance, and
collision checks. Invalid placement remains unresolved rather than silently
shrinking, intersecting, or burying an actor.

## Director V2 execution bridge

The Asset Scene Builder now consumes the canonical V2 `moment.shot` after assets
load. The integration deliberately preserves the builder's set-construction
authority:

1. invisible proxies and asset requirements establish the requested set;
2. measured asset geometry produces real-world sizes and spatial regions;
3. cinematic blocking may adjust desired root staging **before** the existing
   layout solver runs; physical relations such as on-surface, inside, attached,
   and beside remain owned by the measured placement system;
4. the collision-safe solved positions become the actor inputs to the shared
   Director runtime;
5. actor motion/constraints, semantic lighting, and parameterized camera
   choreography execute from the same moment clock;
6. the page samples camera clearance, required visibility, and approximate
   occlusion as shot diagnostics.

When no Director moment is available, the previous `Bounds` + `OrbitControls`
inspection path remains the fallback. When V2 direction is active, automatic
bounds fitting is disabled so it cannot fight the directed camera.

The V2 runtime does not replace collision-safe placement or claim full physics.
It is the renderer bridge that turns semantic direction into reproducible
Three.js execution and prepares the same contract for later Blender compilation.

