# Asset Scene Builder Lab

Primitive Builder now operates as an asset-first scene compiler.

## Generation path

1. The model returns `primitive_scene_graph_v2`.
2. Primitive nodes are normalized as invisible layout proxies.
3. Every physical object that should appear is represented by an asset requirement.
4. MyWay resolves requirements against semantically verified, scene-approved library assets.
5. Resolved GLBs are laid out with Geometry Profile + Constraint Layout.
6. Unresolved requirements are absent from the 3D scene and shown as **Missing from scene**.
7. Missing requirements are queued automatically for BlendKit, then TRELLIS when needed.
8. Saved scenes store asset bindings, layout metadata, and only explicitly authorized abstract procedural effects.

The model never chooses asset IDs, paths, providers, or URLs. MyWay owns asset
resolution, geometry validation, layout, and rendering.

Physical primitive proxies are never rendered. Only nodes explicitly marked
`procedural_required` and normalized as supported abstract effects may appear
alongside assets.

## Automatic missing assets

Missing physical requirements are no longer handled with manual primitive or
TRELLIS controls in the scene page. Generation immediately enqueues one shared
missing-asset job per concept and returns the incomplete scene.

The **Refresh missing assets** button re-runs deterministic asset resolution
against the saved scene graph. When no approved candidate can be inserted, it
still reports why each requirement remains unresolved. It does not call the
scene-generation model again.

## Phase 2 appearance-aware selection

Asset requirements may include an open-vocabulary `appearance_request` with a
visual brief plus required, preferred, and avoided visible traits.

Resolution remains identity-first:

1. Verified identity, safety, review, composition, affordances, and file checks
   decide which assets are eligible.
2. Required appearance traits reject a candidate only when its analyzed profile
   contains a clear contradiction. Unknown traits do not reject it.
3. When at least two eligible candidates have compatible Nemotron embeddings,
   MyWay embeds the request and uses cosine similarity as a bounded ranking
   bonus.
4. Preferred traits add a small bonus and avoided traits add a penalty.
5. Missing, corrupt, or incompatible embeddings fall back to the existing
   deterministic identity and quality ranking.

The model describes appearance but never chooses an asset id. Existing saved
bindings remain stable; refresh only re-resolves missing requirements.

## Refresh diagnostics

**Refresh missing assets** can also be used as a diagnostic check when no job is
ready. It reports identity review, scene approval, composition, missing-file,
required-appearance, and score/margin blockers for each unresolved requirement.

Legacy verified assets whose composition is still `unknown` remain compatible
with a `single_object` scene requirement. Explicit `object_set` and
`environment_piece` requirements remain strict.

## Logical real-world sizing

BlendKit source files are normalized to a convenient import extent, so their GLB
bounds are not treated as real-world measurements. Before asset resolution,
MyWay applies a deterministic size decision in this order:

1. an explicit measurement near the object in the learner request;
2. a known concept profile, such as a 0.28 m book or 2.0 m bookshelf;
3. a bounded model hint for an unknown concept;
4. a conservative fallback;
5. a parent-relative cap for `inside`, `on_surface`, or `attached_to` placement.

The Primitive Builder shows the selected longest-dimension target and its policy
source. This makes unexpected sizing inspectable rather than silently trusting a
normalized source file or arbitrary planner scale.

## Job-status requests

The Primitive Builder performs one missing-asset status read when a scene with
missing objects loads. Repeated polling occurs only while BlendKit or TRELLIS is
actively running, uses a summary-only response, pauses while the tab is hidden,
and prevents overlapping requests. Awaiting-review jobs do not cause continuous
GET traffic.

## General collision-safe spatial placement

Explicit scene language can provide `placement_relation`, a target requirement,
and `placement_region` preferences. The preferences are generic across every
asset: support/containment/attachment/adjacent, exterior/interior, orientation,
vertical rank, openness, side, ground contact, and whether intersection was
explicitly allowed.

The runtime waits for actual GLB measurements, validates fit and clearance, checks
all placed assets for collisions, and omits a placement when no valid solution
exists. Primitive Builder displays the selected region and the unresolved reason.
