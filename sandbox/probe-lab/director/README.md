
# Educational Scene Director

This folder is the canonical architecture boundary between model-authored
teaching intent and renderer-specific execution.

## Source-of-truth flow

1. The model explains what the learner must notice.
2. MyWay normalizes that direction into
   `myway_educational_scene_director_v1`.
3. The director plan keeps stable entity ids, moments, camera cues, semantic
   behaviours, timed text, capability needs, and late-binding asset policy.
4. Compatibility adapters derive the older Visual Experience story beats,
   semantic beats, Primitive Builder reveal beats, and directed-scene hints.
5. Asset resolution, geometry, collision safety, Three.js, and Blender remain
   execution layers. They do not redefine the educational intent.

## Missing assets

A missing actor must not weaken the direction. The plan remains complete and
uses stable entity ids plus an explicit fallback representation. When a better
GLB or rigged actor becomes available later, it binds to the same entity id and
inherits the same moments, events, camera cues, and text cues.

## Why this exists

The sandbox previously had overlapping direction concepts across Primitive
Build Plan, Primitive Scene Graph, Semantic Scene Plan, directed scene,
scene moments, story beats, semantic beats, motion tracks, and camera tracks.
Those layers remain readable for compatibility, but they are now downstream
views of one canonical director plan.
