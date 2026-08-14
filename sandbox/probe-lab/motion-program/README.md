# Universal Motion Program — Phase 1B.4.2

`myway_motion_program_v1` is the renderer-neutral deterministic execution layer
beneath the semantic MyWay Director language.

Phase 1B.4.2 deliberately stays narrow:

- executable channels: `transform`, `orientation`;
- executable coordinate spaces: `world`, `actor_local`;
- primitives: vector lerp, angle lerp, rotate around anchor, periodic sampling;
- composition helpers: sequence, parallel, hold, repeat, reverse;
- Director adapter subset: `move_to`, `rotate`, `pivot`, `oscillate`;
- all other transform semantics retain the legacy actor runtime;
- the named Director Capability Library is not required to author a valid program;
- unsupported future lanes remain declared rather than being faked as root motion.

The public scene runtime API remains `sampleDirectorActorState(...)`. In the
Phase 1B.4.2 foundation, the adapter executed a MotionProgram only when every
transform event for that actor stayed in the frozen four-canary subset; later
strengthening extends that qualified set without changing the public sampler.

## Phase 1B.4.3 — relational + articulation recipes

The program stays renderer-neutral while selected Director semantics now compile
to distinct recipes instead of sharing legacy branches:

- `follow_target` samples the moving target at arbitrary progress and preserves a
  target-relative offset;
- `attach` composes approach then bound target-relative sampling and declares an
  attachment state effect for the current moment;
- `detach` latches the release origin at the event start and no longer inherits
  later target movement;
- `aim_at` aims the visual-forward +Z axis, while `align` aligns a declared or
  fallback horizontal actor axis;
- `hinge`, `open`, and `close` share the generalized rotate-around-anchor
  primitive but carry distinct recipe ids, hinge requirements, and Open/Close
  state effects;
- `slide` is constrained actor-local translation;
- `roll` is parallel translation + orientation with angular distance derived
  from travel distance divided by rolling radius.

`target_relative` is now an executable coordinate-space only for the dedicated
relational operations. Generic target-relative vectors remain unsupported rather
than guessing a target basis.

This phase does not claim arbitrary GLB subpart articulation or cross-moment
state persistence. Hinge/Open/Close keep the whole-actor fallback and declare the
anchor/axis/state semantics that later asset-directability and scene-state phases
will resolve.

## Phase 1B.4.4 — scene state + cross-moment continuity

`DirectorSceneState` is now the explicit immutable snapshot that separates **how an
actor changes during a moment** from **what remains true after that moment**.
`reduceDirectorMomentSceneState()` and `reduceDirectorMomentsToSceneState()`
reconstruct continuity deterministically from ordered Director moments; sampling
history is never used as hidden state.

The snapshot persists position, rotation, scale, visibility, normalized articulation
openness, the canonical closed articulation pose, and target-relative attachment
relations. Attach emits a supported persistent relation, Detach clears that relation
while preserving the released world pose, and Open/Close reduce to normalized
articulation state so later Close/Open transitions begin from the state they actually
receive. Show/Hide persist visibility without faking it as scale or geometry changes.

Unsupported legacy transform semantics still fail closed: the reducer does not invent
persistent transform results for multi-actor/process behaviours that have not yet
migrated to the MotionProgram. Camera, lighting, Asset Scene Builder collision
authority, and support classifications are unchanged.

## Phase 1B.4.5 — multi-actor choreography

Phase 1B.4.5 adds a deterministic choreography planner above the Universal Motion
Program and the Phase 1B.4.4 scene-state reducer.

Qualified choreography semantics:

- `assemble`: predeclared part actors move into stable readable slots around an anchor;
- `disassemble`: predeclared components spread into readable positions without losing identity;
- `merge`: declared actors converge on a shared target region while remaining separately addressable;
- `split`: predeclared result actors spread from a shared region; the runtime does not clone geometry;
- `insert_into` / `remove_from`: containment staging becomes target-relative and persistent without taking fit/clearance authority away from the Asset Scene Builder;
- `connect` / `disconnect`: semantic endpoint relationships are recorded separately from physical attachment;
- `scatter`: because the current Director V2 behaviour enum has no dedicated `scatter` verb, the existing capability continues to emit `move_away` but now carries `parameters.choreography_kind = "scatter"` plus explicit participant IDs. This is an intentional compatibility bridge, not a hidden new canonical verb.

The planner consumes stable actor IDs from `actor_entity_id`,
`supporting_entity_ids`, and optional `parameters.participant_entity_ids`.
Every participant gets its own deterministic MotionProgram track. No missing
parts are invented, no geometry is cloned or deleted, and no collision or
containment-fit decision is made here.

Phase 1B.4.5 also adds persistent per-actor choreography state. Assembly,
containment, and merge slots may follow their declared anchor in later moments;
disassembly, split, scatter, remove, and disconnect update or release those
relations through the immutable scene-state reducer.

Process/quantity semantics (`flow`, `emit`, `fill`, `accumulate`, `drain`, and
related material-front behaviour) remain outside this phase.

## Phase 1B.4.6 — process / quantity semantics

Phase 1B.4.6 makes `process` an executable MotionProgram channel instead of
representing process intent with rigid actor transforms.

Qualified process semantics:

- `fill` interpolates a normalized `fill_level` quantity and persists the
  completed level into `DirectorSceneState`;
- `drain` begins from the incoming persisted `fill_level` when available and
  reduces that quantity without shrinking the container actor;
- `accumulate` interpolates a distinct non-negative `accumulated_amount`
  quantity instead of reusing Fill;
- `flow` samples deterministic carrier positions from a source, through optional
  route points, toward a declared destination actor/point;
- `emit` samples deterministic independent carriers from the source along an
  actor-local direction/spread without translating or scaling the source actor.

The process sampler returns renderer-neutral `quantities`, `carriers`, and
`active_process_track_ids` beside position/rotation/scale. Scene-state reduction
persists completed quantity values and last-process metadata, while transient
carrier samples are reconstructed deterministically at arbitrary progress rather
than stored as mutable playback history.

This is not fluid, smoke, granular, collision, or production particle physics.
Carrier geometry/material choice remains a renderer/asset concern, measured
containment remains Asset Scene Builder authority, and support classifications,
camera, lighting, and the GLM-facing Director language are unchanged.


## Phase 1B.5 — asset directability foundation

Phase 1B.5 adds a canonical asset-directability profile between resolved assets
and the Universal Motion Program. It does not create a second motion engine.

The profile is assembled from existing trustworthy evidence:

- measured geometry orientation, bounds/contact, support surfaces, interior
  volumes, and attachment regions;
- asset-level rig/animation-clip metadata;
- explicit `directability_overrides` for semantic information geometry cannot
  safely infer: pivots/hinges, semantic subparts, socket meanings, rolling
  radius/axis, semantic bone maps, and semantic clip maps.

Resolved scene bindings carry the derived profile into Director runtime actors.
MotionProgram directability requirements are then resolved per target actor
against concrete evidence and reported in program diagnostics. Missing required
evidence stays visible as an unresolved requirement; MyWay does not invent asset
anatomy.

Safe root-level recipe improvements are additive: Align/Slide may use the asset
forward frame and Roll may use declared rolling radius/axis. Existing fallbacks
remain byte-compatible when no profile is attached. Hinge/Open/Close can now
prove whether hinge metadata exists, but arbitrary GLB child/subpart execution
is **not** promoted in this phase; the qualified whole-actor compatibility proof
remains until a later articulation lane can bind real nodes/joints.

Process semantics also declare optional containment/surface/outlet/inlet
requirements so Fill/Drain/Accumulate/Flow/Emit can report whether a real asset
provides the required geometry/anchors. Asset Scene Builder remains the authority
for measured fit, clearance, collision, and final physical placement.
