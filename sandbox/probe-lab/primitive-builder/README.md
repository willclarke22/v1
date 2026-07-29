
# Asset Scene Builder Lab

Primitive Builder is the set-building and casting layer for the canonical
Educational Scene Director.

## Generation path

1. The model returns `primitive_scene_graph_v2` with a canonical
   `director_plan`.
2. `director_plan` preserves the educational sequence, stable actor ids,
   semantic behaviours, cameras, and timed text even when final assets do not
   exist.
3. Primitive nodes are normalized as invisible layout proxies.
4. Every physical actor is represented by an asset requirement whose
   `instance_id` matches the director entity id.
5. MyWay resolves requirements against semantically verified, scene-approved
   library assets.
6. Resolved GLBs are sized and laid out using Geometry Profile, spatial
   constraints, and collision-safe layout.
7. Unresolved actors remain in the director plan, are reported as
   **Missing from scene**, and are queued for acquisition.
8. Legacy Primitive Builder reveal beats are derived from director moments.

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

Generation creates one shared acquisition job per normalized missing concept.
BlendKit runs first and TRELLIS may be used as a fallback. Refreshing missing
assets re-runs deterministic resolution against the saved graph and director
entity ids; it does not call the directing model again.

## Spatial and appearance invariants

Asset selection remains identity-first and review-gated. Appearance requests
are open vocabulary and never allow the model to choose a specific asset.

Final placement uses logical real-world size, measured geometry regions,
support/containment/attachment/adjacency constraints, fit, clearance, and
collision checks. Invalid placement remains unresolved rather than silently
shrinking, intersecting, or burying an actor.
