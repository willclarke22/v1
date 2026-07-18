# Asset Scene Builder Lab

Primitive Builder now operates as an asset-first scene compiler.

## Generation path

1. The model returns `primitive_scene_graph_v2`.
2. Primitive nodes are normalized as invisible layout proxies.
3. Every physical object that should appear is represented by an asset requirement.
4. MyWay resolves requirements against semantically verified, scene-approved library assets.
5. Resolved GLBs are laid out with Geometry Profile + Constraint Layout.
6. Unresolved requirements are absent from the 3D scene and shown as **Missing from scene**.
7. The user may generate a TRELLIS preview for a missing requirement.
8. Saved scenes store asset bindings, layout metadata, and only explicitly authorized abstract procedural effects.

The model never chooses asset IDs, paths, providers, or URLs. MyWay owns asset
resolution, geometry validation, layout, and rendering.

Physical primitive proxies are never rendered. Only nodes explicitly marked
`procedural_required` and normalized as supported abstract effects may appear
alongside assets.
