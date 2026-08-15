# Director Capability Library

The canonical page route is now:

`/sandbox/probe-lab/director-capability-library`

The former `/sandbox/probe-lab/motion-camera-library` route redirects to the canonical URL. The implementation folder remains in place temporarily to preserve internal import compatibility while the feature is promoted into the Asset Scene Builder.

## Purpose

The library is the isolated visual proof environment for the vocabulary GLM may
use when directing a MyWay scene. It connects each semantic directing term to:

- a typed capability id and category;
- an inspectable Director instruction;
- a named compiler/controller id;
- Three.js and Blender support levels;
- an explicit fallback;
- a single-Canvas interactive demonstration;
- real browser-loadable examples selected from the reviewed Asset Library;
- visibility and future promotion diagnostics.

## Categories

- narrative and attention;
- camera framing;
- camera angle;
- camera movement;
- object motion;
- blocking and placement;
- lighting and emphasis;
- transitions and continuity.

## Runtime boundary

The page intentionally reuses exactly one React Three Fiber `Canvas`. Selecting a
new capability swaps the active fixture and controllers inside that viewer. It
does not create a Canvas per card.

The current page proves vocabulary, composition, controller behaviour, and real
asset casting. It does not claim to run the Asset Scene Builder's measured
collision or analytic occlusion solvers. A capability should be promoted in this
order:

```text
declared capability
→ single-viewer visual proof
→ multi-asset verification
→ Asset Scene Builder integration
→ Visual Experience integration
→ Blender Scene Compiler implementation
```

## Canonical files

- `director-capability-registry.ts` — typed vocabulary and execution metadata.
- `ui/director-capability-library-lab.tsx` — one Canvas, a fixed searchable capability sidebar, and the full-width inspector.
- `ui/director-capability-preview.tsx` — real-asset casting, motion, camera, lighting, and guides.
- `ui/index.ts` — canonical export plus a temporary compatibility alias.

## Current workbench layout

- The left column keeps the WebGL preview and transport visible.
- The right column is a fixed-height, independently scrollable capability catalogue.
- Search and filters remain visible at the top of that sidebar.
- The selected capability inspector occupies the full-width section beneath the workbench.
- The default secondary fixture deterministically prefers the reviewed Soldier asset (`soldier_polyp_ul46oxezyk`) instead of the previous coffee-mug example.

## V2 composition workbench

The library now proves **composed shots**, not only isolated demo motions. A
selected capability is wrapped in a canonical V2 Director moment so the preview
can combine framing, angle, lens, camera movement, blocking, lighting,
continuity, actor motion, and constraints at the same time.

The expanded vocabulary adds high-value camera moves (arc, dolly, lead/lag
follow, reframe, rise reveal, spline, object-attached, pass-through, settle),
mechanical/educational actor verbs, composition and lens controls, cinematic
blocking, motivated lighting, richer narrative jobs, continuity rules, and
kinematic constraints.

Camera and actor controllers are parameterized and actor-relative. The same
shared `director-shot-runtime.tsx` is used by the Asset Scene Builder so a
capability that graduates from this page does not need a second execution
language. The preview's visibility/occlusion checks are intentionally
approximate; measured physical placement and collision authority remain in the
Asset Scene Builder.

## Movement polish pass

The capability fixtures intentionally use a stable cast so visual comparisons are
repeatable across cards:

- `primary_subject` → reviewed Soldier (`soldier_polyp_ul46oxezyk`);
- `secondary_subject` → reviewed Fire Hydrant (`fire_hydrant_bk_mrjsn0wl`);
- `context_subject` → reviewed Lantern (`lantern_bk_mrqk238f`) when available, so motivated-light demos have a meaningful source.

The V2 preview distinguishes world-fixed camera composition from explicit
actor-relative tracking. A `static` camera therefore stays fixed while its demo
subject travels; `follow`, lead/lag follow, parallel tracking, and object-attached
views opt into actor-relative composition. Camera and actor damping use frame
time rather than fixed per-frame lerp factors, and paused scrubbing snaps to the
requested timeline sample.

The polish pass also gives roll a translational component, hinges/open/close a
visible edge pivot, pans/reframes real two-subject targets, settle a preceding
move to settle from, and transition/continuity cards concrete benchmark action
instead of static-only demonstrations. `inside_object` remains explicitly
approximate because an arbitrary reviewed GLB is not guaranteed to contain a
renderable interior.

## Phase 1B camera fidelity bench

Phase 1B separates **structural runtime parity** from **visual fidelity evidence**.

Camera framing, angle, and movement capabilities now receive a deterministic
controlled-fixture report in addition to the real Asset Library preview. The
report samples the shared Director camera runtime at five timeline positions,
records camera/target travel and lens state, and runs capability-specific checks
where a useful analytic expectation exists. Automated checks are evidence, not a
replacement for visual review.

The first fidelity corrections are intentionally narrow:

- over-shoulder uses a declared foreground actor as the shoulder source and a
  focus actor as the viewed target;
- point-of-view places the camera at the declared foreground actor's viewing
  region and looks toward the focus actor;
- object-attached camera offsets now rotate in actor-local space rather than
  being added as world-space offsets;
- `isometric` is explicitly `approximate` in Three.js because the current player
  still uses a restrained perspective camera rather than an orthographic
  projection;
- `cutaway` is explicitly `compound` because a truthful cutaway requires
  Director-selected detail/context, not only a camera-distance change;
- `inside_object` and shallow focus remain explicitly approximate.

Macro and insert framing remain useful at entity level, but semantic sub-part
targeting is deferred to the later asset-directability phase rather than being
faked with raw world coordinates.

## Phase 1B.2 visual audit harness

The Director Capability Library is now optimized for repeated visual qualification
rather than continuous showcase playback.

- The selected capability uses one isolated audit viewer. Playback progress lives
  inside that viewer, so the 183-card catalogue does not rerender on every clock
  tick.
- The Canvas uses DPR 1, demand rendering, no shadows by default, no role labels
  by default, and sleeps while offscreen or while the browser tab is hidden.
- The Asset Library is not fetched on page load. Controlled procedural fixtures
  are the default qualification proof; reviewed GLBs are loaded only when the
  reviewer explicitly requests a real-asset generalization check.
- Catalogue cards mount in bounded batches instead of mounting all 183 at once.
- Inspector JSON bodies mount only when their disclosure panel is opened.
- Human review is persisted in browser localStorage with `pass`, `needs_work`,
  `blocked`, and `approximate_ok` states plus free-text notes.
- The audit state can be exported as JSON so a review batch can be shared without
  recording every capability individually.
- Category-aware controlled fixtures make viewpoint, travelling-camera,
  technical-overview, detail-target, object-motion, blocking, lighting,
  continuity, and narrative capabilities easier to compare against a known scene.

The audit harness does not claim that automated checks prove cinematographic
quality. It exists to make human visual qualification faster, repeatable, and
less dependent on external screen-capture tools.

## Phase 1B.3 camera grammar strengthening

Phase 1B.3 uses the controlled audit harness as the source of truth for improving
camera behavior before real assets are promoted back into the default proof.

- over-shoulder now uses larger clearance-aware back/shoulder offsets so the
  foreground actor reads as an edge-of-frame shoulder rather than a camera
  intersection;
- point-of-view moves just beyond the source actor's face volume while remaining
  tied to its viewpoint and looking toward the declared focus actor;
- follow keeps the existing stable actor-relative composition;
- lead changes the look point ahead of travel instead of translating camera and
  target together;
- lag uses a transient rearward look bias that peaks mid-move and catches back
  toward follow by the end;
- track-parallel solves a side-on rig perpendicular to the subject's actual
  travel direction and then preserves that actor-relative relationship;
- object-attached angle and movement use larger clearance-aware local mounts that
  still rotate with the sampled actor orientation;
- isometric frames the full three-actor technical envelope with a restrained
  perspective overview while remaining honestly classified as approximate;
- macro and insert use an explicit tiny controlled feature actor plus smaller
  focus-radius/distance floors, so the proof genuinely isolates a detail;
- cutaway uses the same explicit detail fixture as a supporting-detail
  composition while remaining compound.

The controlled fixture layouts are shared by the visual audit viewer and the
numeric camera-fidelity bench so visual and analytic evidence test the same
geometry. Real-asset semantic sub-part targeting still waits for asset
directability/feature-anchor metadata.


## Phase 1B.3.1 camera grammar visual refinement

Phase 1B.3.1 is a focused human-review refinement on top of the broader Phase 1B.3 camera grammar pass.

- `point_of_view` and `follow` are treated as regression canaries because they passed the controlled human review.
- `over_shoulder` keeps the Phase 1B.3 relationship but lowers the optical centre slightly so the foreground subject reads more naturally as a shoulder.
- `lead_subject` and `lag_follow` use stronger look-point separation from ordinary Follow so the three choices are immediately distinguishable.
- `track_parallel` now behaves like a second rail beside the travelling actor: stable lateral distance, centered subject target, and rapid settling onto the side rig.
- `object_attached` and `camera_object_attached` preserve an actor-local outward viewing direction in addition to actor-local mount position. The mounted camera no longer treats the host centre as its default thing to look back at.
- The `detail_target` controlled fixture is now a recognizable machine/control panel. Macro focuses a tiny fastener; Insert focuses a larger lever/control. This keeps the fixture simple while making the two framing jobs visually judgeable.
- The support distribution is intentionally unchanged while human review continues.

## Phase 1B.3.2 remaining camera cleanup

Phase 1B.3.2 freezes the camera capabilities that passed human review and narrows
changes to the remaining uncertain/failing proof cases.

- `track_parallel` starts on its second rail from the first frame and directly
  preserves the side relationship for the full shot, eliminating the entry zoom
  that escaped the previous late-shot verifier;
- the Track Parallel fidelity check now covers 0/25/50/75/100% and checks
  camera-subject distance, relation drift, target centering, and an apparent-size
  proxy across the whole move;
- `macro` keeps the tiny fastener as the target but backs the camera off enough
  to preserve the complete screw head and surrounding panel surface, while using
  exact geometric-centre targeting for the tiny feature;
- the fastener uses a cross-shaped screw slot so the controlled target reads
  immediately as a familiar screw rather than an abstract disc;
- the mounted-camera fixture becomes a small recognizable test vehicle with a
  visible hood/body reference, road surface, lane markings, and repeated course
  gates. The shared mounted runtime remains actor-local; the stronger fixture
  makes translation and rotation visually judgeable instead of showing mostly
  empty floor/sky.

No support-level classifications change in this refinement.

## Phase 1B.3.3 final camera polish

Phase 1B.3.3 addresses the last human-review issues without reopening camera
capabilities that already passed visual qualification.

- controlled audit proofs now keep the Director camera authoritative while
  paused (`auditSnap` disables manual OrbitControls), preventing a false
  pause-to-play camera handoff in Track Parallel and Macro;
- the shared camera controller treats authored progress 0 as a snap point, so
  the exact first frame cannot ease out of a stale/manual camera state;
- Macro keeps its existing geometric-centre target and 0.44 m minimum distance,
  but qualification now projects the complete cross-head fastener at
  0/25/50/75/100% and requires it to stay within a safe screen-space margin;
- the default object-attached mount moves higher and farther back on the host,
  with a slight downward-forward local view. This keeps road/support context
  and a restrained hood/body edge readable while preserving actor-local
  position/orientation;
- the controlled vehicle mount marker now mirrors that shared runtime default.

Support classifications remain unchanged. Real-asset semantic feature anchors
remain future asset-directability work.

## Phase 1B.4.2 — Universal Motion Program foundation

The Director Capability Library remains the semantic/filmmaking vocabulary. The
new `sandbox/probe-lab/motion-program/` layer is a smaller renderer-neutral,
deterministic execution grammar underneath it; it does **not** replace the 183
named capabilities and a valid MotionProgram does not require a capability id.

This first runtime adapter is intentionally narrow. Only actors whose complete
transform-event set stays inside `move_to`, `rotate`, `pivot`, and `oscillate`
may execute through `myway_motion_program_v1`. If another transform semantic is
present, the entire actor remains on the legacy compatibility path so event
ordering cannot silently change. Translate/Rotate/Pivot/Oscillate are dual-run
against the Phase 1B.4.1 authority at fixed samples, with dense samples for
Oscillate. Existing semantic-overlap diagnostics remain unqualified.

The foundation provides deterministic arbitrary-progress sampling, world and
actor-local basic vector spaces, independent overlapping tracks, and sequence,
parallel, hold, repeat, and reverse composition helpers. Future articulation,
skeletal, deformation, process, physics, camera, lighting, and presentation
channels are declared in the contract but are not falsely reported as executable.

The Capability Library inspector exposes both the selected actor program and a
synthetic unnamed parallel translation + rotation proof. This is data-only and
does not add another WebGL context: the existing single demand-rendered
`DirectorAuditViewer` remains the playback/canvas owner.

## Phase 1B.4.3 — relational + articulation motion recipes

Phase 1B.4.3 starts using `myway_motion_program_v1` to separate Director meanings
that previously collapsed onto shared actor-runtime branches. The Director
catalog, GLM-facing language, support classifications, camera runtime, lighting,
and Asset Scene Builder authority remain unchanged.

The strengthened recipe set is Follow target, Attach, Detach, Aim at, Align,
Hinge, Open, Close, Slide, and Roll. Follow target samples a moving target at the
requested progress. Attach uses approach then bound target-relative sampling;
Detach latches its release origin and stops inheriting later target movement.
Aim at uses the visual-forward axis while Align uses a declared/fallback actor
axis. Hinge/Open/Close compile through generalized rotate-around-anchor tracks
with distinct semantic recipe/state metadata. Roll composes independent
translation and orientation tracks coupled by distance/radius.

The controlled Follow target and Attach demos now move the secondary relationship
target so current-target sampling is visually judgeable. The Capability Library
inspector shows the Phase 1B.4.3 recipe id when one is present and still uses the
single demand-rendered `DirectorAuditViewer`; no additional WebGL context is
introduced.

Articulation remains honest: the current Three.js proof may use a whole-actor
hinge fallback, while hinge anchor/axis requirements and Open/Close state effects
are carried in the MotionProgram for later asset-directability and scene-state
work. Cross-moment persistence is intentionally deferred to Phase 1B.4.4.

## Phase 1B.4.4 — scene state + cross-moment continuity

Phase 1B.4.4 makes continuity explicit instead of relying on mutable playback history.
The Director Capability Library inspector now shows an immutable incoming scene
snapshot, the deterministic completed-moment reduction, and the outgoing snapshot.
This is inspection-only and does not add another WebGL context.

The state lane persists pose/scale/visibility, target-relative attachment relations,
and normalized articulation openness. Attach survives into later moments and follows a
moving target; Detach clears that relation while keeping the released pose; Open/Close
carry a canonical closed pose so a later transition starts from the actual incoming
openness; Hide remains hidden until Show. Existing one-moment callers remain valid
because scene state is an optional additive input to the public actor sampler.

Cross-moment state does not promote the remaining Assemble/Disassemble/Scatter/Split/
Merge or Flow/Emit/Fill/Drain/Accumulate approximations. Those remain later
multi-actor/process-lane work, and camera/lighting/Builder authority remains frozen.

## Phase 1B.4.5 — multi-actor choreography

The Director Capability Library keeps the same 183 semantic capability IDs and
the same Three.js support classifications while the execution layer strengthens
multi-actor meaning underneath them.

Phase 1B.4.5 qualifies controlled choreography for Assemble, Disassemble,
Scatter, Split, Merge, Insert, and Remove, and also strengthens canonical
`connect` / `disconnect` Director behaviours when they appear in plans. The
planner coordinates only predeclared stable actor IDs; it does not create
geometry or reassign Asset Scene Builder collision/fit authority.

Scatter remains a compatibility bridge through the existing `move_away`
behaviour plus an explicit `choreography_kind = "scatter"` parameter because
Director V2 does not currently expose a standalone `scatter` behaviour.

The Capability Library still owns zero direct Canvas elements. Playback remains
isolated in the single demand-rendered audit viewer, and process/quantity
semantics remain reserved for the next phase.

## Phase 1B.4.6 — process / quantity semantics

The Director Capability Library still exposes the same semantic capability IDs
and support classifications, but Flow, Emit, Fill, Drain, and Accumulate now use
the Universal Motion Program's executable `process` lane rather than root
translation/scale proxies.

Fill and Drain operate on persistent normalized `fill_level`; Accumulate uses a
separate `accumulated_amount` quantity. Flow samples carriers along explicit
source/route/destination semantics, while Emit samples independent carriers from
the source. The source/container actor root transform remains unchanged.

The controlled process fixture and inspector expose process recipe IDs, process
tracks, and outgoing scene-state quantity values. Carrier samples are
renderer-neutral evidence, not fluid/particle simulation. Asset Scene Builder
still owns measured containment/collision/fit, and the existing single
demand-rendered audit Canvas remains the only WebGL owner.


## Phase 1B.5 — asset directability

Phase 1B.5 keeps the 183-capability catalog, support labels, single demand-rendered
audit Canvas, and protected camera behavior unchanged while adding an asset
directability evidence layer beneath actor execution.

Real resolved scene bindings can now carry orientation frames, anchors, support
surfaces, containment regions, semantic pivots/subparts, rolling metadata, and
rig/clip mappings into Director runtime actors. MotionProgram requirements record
which of those needs were actually resolved and which remain declared.

This is intentionally not a node-name guessing system and not arbitrary GLB
subpart animation. Missing pivots, sockets, bones, or semantic parts remain
missing. Asset Scene Builder still owns fit/collision, and real subpart execution
remains a later lane.

## Phase 1B.5A — runtime convergence + visual qualification

Phase 1B.5A moves the newest Director guarantees out of verifier-only proof and
into the real Asset Scene Builder playback path. Incoming cross-moment scene
state now reaches actor, camera, lighting, validation, and process visualization.
The Capability Library remains the isolated one-Canvas qualification environment.

The code-level visual audit also tightens the controlled object-motion proof.
`roll` now uses physically consistent ground-roll polarity and rotates visible
geometry around its centre instead of the bottom-root contact point, preventing
the controlled wheel from dipping through the floor. Lift/Lower use bounded
vertical travel (with Lower starting elevated), and Expand/Contract use the rigid
scale-readable fixture instead of being grouped with material processes.
Fill/Drain use an open vessel, Accumulate uses a shallow receiving tray, and
Flow/Emit use source/path-specific guides so the semantic differences are
visually judgeable.
These are controlled proof fixtures, not claims of production fluid or particle
physics. Human visual review remains required before support promotion.

The focused code-level audit and browser checklist are recorded in
`PHASE1B5A_VISUAL_QUALIFICATION.md`.

## Phase 1B.5D — capability vocabulary authority

The Capability Library now exposes a read-only authority path for asset-relevant Director actions. This path is intentionally descriptive rather than a new execution engine:

`Director action → asset qualification → pair interaction when needed → Builder placement validation`

The four layers are not synonyms. Director actions are semantic scene directions. Directable Asset operators are internal evidence requirements. Pair interactions are two-asset compatibility lanes. Builder placement remains the final measured scene-fit/collision authority.

Two visible labels are disambiguated without changing their stable IDs:
- camera framing `insert` → **Insert shot**;
- object motion `insert_into` → **Insert into target**.

The inspector displays the Phase 1B.5D authority map beside existing compiled execution, camera/object-motion fidelity, MotionProgram, scene-state, and promotion diagnostics. No additional Canvas is introduced, and no support classification or runtime behaviour is promoted by this phase.

## Phase 1B.5E — real-asset execution qualification bench

Phase 1B.5E turns the canonical Director Capability Library into the real-asset
execution qualification surface without creating a second runtime or another
WebGL canvas.

The isolated audit viewer still owns the single demand-rendered Canvas. The
Asset Library remains deferred until the reviewer explicitly requests a
real-asset proof. Once loaded, each Director demo role can be left on its
deterministic auto-match or overridden with a specific reviewed browser-loadable
Asset Library record.

For capabilities mapped by the Phase 1B.5D authority contract, the bench now
shows three distinct forms of evidence before the reviewer judges the animation:

- **asset/operator qualification** compiles the selected real asset through the
  hardened Affordance Graph and reports the exact internal operator
  requirements used by the Director action;
- **pair qualification** evaluates the mapped Phase 1B.5C interaction lanes for
  source/target capabilities using the preview actors' final target extents as
  `scene_instance` dimension authority;
- **runtime readiness** distinguishes asset authoring gaps, declared runtime
  gaps, contextual/pair dependencies, Builder validation handoff, and assets
  ready for visual proof.

Real-asset preview actors also pass their existing Phase 1B.5 directability
profile into the same shared `DirectorRuntimeActor` contract already used by the
Director runtime. This is an execution-qualification bridge, not a new motion
engine.

Important boundaries remain unchanged:

- a pair `resolved_candidate` is still only a proposal and never activates
  parenting, containment, support, or flow state in this phase;
- Asset Scene Builder / Primitive Builder still owns final measured fit,
  collision, stability, insertion clearance, and route obstruction;
- Open/Close, skeletal posing, and animation-clip lanes remain honest about
  runtime support when qualification is present but execution is still pending;
- camera capabilities without a Phase 1B.5D asset gate can still use selectable
  real GLBs for generalization review, but asset-aware camera targeting remains
  later camera-convergence work;
- the 183-capability semantic catalog and support classifications are unchanged.

