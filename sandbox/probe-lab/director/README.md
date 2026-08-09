
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

## Director Capability Language V2

The plan envelope remains `myway_educational_scene_director_v1` for backward
compatibility, but normalized plans now declare `capability_language_version:
"v2"`. Each moment keeps the compact V1 `camera` cue and also receives a rich
`shot` direction.

A V2 shot composes rather than selects one isolated word:

- narrative job and visual claim;
- framing, angle, screen anchor, negative space, and caption-safe composition;
- semantic lens and depth-of-field intent;
- one or more parameterized camera movement steps with coordinate spaces;
- cinematic blocking distinct from physical placement;
- semantic actor events and optional kinematic constraints;
- lighting intent, including motivated sources;
- continuity and occlusion rules;
- reveal timing, settle/hold timing, and success observation.

The Director still never owns final camera XYZ coordinates or collision
solutions. Shared renderer helpers compile the shot against the real late-bound
actor positions and sizes.

### Kinematic constraints

`shot.constraints` is for relationships that must remain true during motion:
axis locks, persistent attachment, maintained distance, rigid links between two
endpoints, and look-at constraints. The Three.js runtime provides a deterministic
preview implementation; it is not a rigid-body physics engine. Blender or a
future rig/physics lane may compile the same semantic constraints with higher
fidelity.

