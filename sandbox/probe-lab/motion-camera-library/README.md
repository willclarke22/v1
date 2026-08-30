# Director Capability Library


## Phase 1B.6 — Hierarchical Director capabilities

The Director Capability Library is now the single authority for both low-level execution vocabulary and higher-level perceptual cinematography.

The hierarchy is:

```text
perceptual / composite Director capability
→ stable atomic Director capabilities
→ geometry + directability authority
→ Motion Program / camera runtime
→ Three.js
```

Five film-wide policies sit across compatible compositions rather than behaving like one more camera/motion primitive.

The seven Golden Lunch extractions previously explored in the temporary Cinematic Motif Library have moved here as **perceptual/composite Director capabilities**:

- `agent_approach_contact_response_retreat`
- `arrive_settle_present_depart`
- `overlapping_attention_handoff`
- `occlusion_to_parallax_discovery`
- `context_to_hero_resolution`
- `recap_sweep`
- `action_consequence_reframe`

The first five remain the initial cross-asset qualification set.

### Extraction rule: visual intent, not Golden coordinates

Reference footage is evidence for reusable visual grammar, not a source of production coordinates. Perceptual/composite capabilities preserve:

- semantic actor roles;
- perceptual job / proof strategy;
- phase grammar;
- normalized parameters;
- hard visual rules;
- measurable qualification targets;
- fallbacks;
- links to existing atomic Director capability IDs;
- shared film-policy requirements.

They do **not** preserve Golden Lunch asset IDs, world-space staging coordinates, or copied camera keyframes as production authority. The controlled WebGL proof may use normalized role-space fixtures, but real production execution must derive exact contact, clearance, staging, framing, occlusion, and camera rails from the selected Asset Library geometry/directability and fail closed when a role cannot qualify.

### Reference-video growth loop

```text
excellent reference footage
→ identify the perceptual job
→ extract an asset-independent capability
→ controlled proof
→ unrelated real-asset proof
→ measurable qualification
→ human visual review
→ promote into Director authority
```

This preserves the useful Motif experiment without maintaining a second Motif Library route or a second directing architecture.


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
  inside that viewer, so the capability catalogue does not rerender on every clock
  tick.
- The Canvas uses DPR 1, demand rendering, no shadows by default, no role labels
  by default, and sleeps while offscreen or while the browser tab is hidden.
- On the canonical real-asset-only workbench, reviewed Asset Library data is now requested automatically
  when a capability viewer needs it. Internal deterministic fixtures remain
  regression-only evidence and are not exposed as a page mode.
- Catalogue cards mount in bounded batches instead of mounting the full library at once.
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

## Phase 1B.6.3 — orientation-general Level 1 proof + Golden highlight

- Added `highlight_subject` as the 184th Level 2 atomic Director capability, derived from the Golden Lunch subject emphasis/highlight behavior.
- The seven Level 1 visualizations can rotate their normalized semantic relationship frame around Y, proving they are not tied to a single authored world axis.
- Real-asset proof may auto-fill reviewed defaults, but each semantic role remains searchable and switchable after the default is chosen.
- Level 1 actor emphasis now produces a visible browser-proof halo/outline treatment while the shared scene lighting runtime uses subject-tracked light; production renderers remain free to compile the same semantic intent into a higher-quality outline/rim treatment.


## Phase 1B.6.4 — Directional variants + asset facing + Golden outline

Level 1 visual proofs now separate three concerns that were previously conflated:

1. **Directional capability variants** — the semantic action/camera path can be instantiated from different sides and angles without rotating the whole scene. Approach, arrival, handoff, hero resolution, and consequence reframing expose side/angle controls; parallax and recap expose reversible path/order controls.
2. **Asset-facing correction** — each real Asset Library role can receive an independent yaw correction after binding so a soldier, animal, chair, or other model can present the correct side without changing the semantic movement path.
3. **Golden-style subject highlight** — the temporary Level 1 halo/floor-ring proof is retired. `highlight_subject` is represented as a tight high-contrast silhouette outline around the emphasized actor, matching the visual grammar observed in Golden Lunch rather than approximating emphasis as a volume or tracking spotlight.

These remain audit controls, not authored production coordinates. Production chooses direction, camera side, and asset-facing corrections from geometry/directability and composition constraints.



## Phase 1B.6.4.2 — Real-asset-only canonical workbench

The canonical Director Capability Library no longer exposes a Controlled proof mode.
Level 1 and Level 2 visualizations load reviewed Asset Library actors and execute the
selected capability directly against those bindings. Searchable role rebinding,
directional variants, asset-facing correction, Inspect playback, visual audit state,
and internal deterministic regression fixtures remain available without presenting a
proxy-geometry mode on the page.

Internal audit fixtures are retained as regression evidence and compiler canaries; they
are not a user-selectable visualization mode on the canonical Director page.



## Phase 1B.7A — Director Qualification Room foundation

The canonical Director Capability Library now has two tabs:

- **Capabilities** — individual Level 1 / Level 2 / Level 3 inspection.
- **Qualification Room** — systematic Level 2 audition and review.

The Qualification Room does not create a second directing runtime. It orchestrates the
existing Level 2 registry, shared Director preview/runtime, and reviewed real Asset
Library actors through one active demand-rendered WebGL Canvas.

### Canonical qualification scenes

The first qualification suite freezes four versioned scene contracts:

- `scene_a_v1` — Character + target.
- `scene_b_v1` — Spatial relationship stage.
- `scene_c_v1` — Hero object stage.
- `scene_d_v1` — Travelling subject.

These scenes provide repeatable role-space staging for comparison. They are
qualification fixtures only; they do not become production-coordinate authority.

### Qualification Cast

The Room resolves a saved semantic cast from the reviewed Asset Library. Initial cast
classes include character, compact rigid, small asymmetric, furniture, small detail,
simple rigid, irregular hero, organic elongated, and vehicle. Known reviewed assets
such as Soldier, Fire Hydrant, Lantern, and Cheeseburger are preferred where present;
other slots resolve by semantic match and remain reviewer-switchable.

### Family gauntlets

Level 2 capabilities are grouped dynamically by their existing category + group rather
than duplicated into a second vocabulary. A family gauntlet runs the selected family
sequentially through one fixed 16:9 recording viewport. Coverage can be baseline,
cross-asset, or full-scene-cast.

Each generated recording manifest stores:

- reel and per-clip run IDs;
- family, capability, and scene/version;
- primary cast class;
- exact selected Asset Library IDs;
- clip/slate/gap timing and recording offset;
- placeholders for later direction/facing evidence.

The small burn-in run ID is intended to make Windows Snipping Tool recordings easy to
send back for code-level diagnosis.

### Review outcomes

Phase 1B.7A records persistent human decisions without mutating the registry:

`Qualified / Fix / Merge candidate / Redefine / Restrict / Retire / Blocked`

Retirement and merges are deliberately review decisions first. Later patches may
deprecate or map capability IDs only after evidence is reviewed; old IDs are not
deleted simply because one audition fails.

### Automation boundary

Phase 1B.7A establishes deterministic scenes, cast selection, run manifests, sequential
auditions, and persistent review state. Mechanical/cinematography metrics, adaptive
test expansion, sibling-distinctness scoring, and dependency-aware stale-result
detection remain follow-on qualification phases rather than being faked by the first
Room implementation.

The governing rule is:

> A Director capability earns its place in MyWay through evidence, not because it
> exists in the registry.

## Phase 1B.7A.1 — Qualification coverage + scale normalization

The Qualification Room no longer treats one preferred asset per semantic class as the
whole test cast. Each class now resolves a small semantic **qualification pool** from
reviewed browser-loadable Asset Library records. The first asset remains a stable
baseline for sibling comparison; later passes rotate through additional assets and
geometry classes so family reels cover substantially more of the real library without
brute-forcing every capability × asset combination.

Coverage modes now mean:

- **Baseline** — one stable family baseline so sibling capabilities can be compared on
  exactly the same scene and actor.
- **Cross-asset** — the complete baseline block followed by one rotating-diversity block.
- **Full** — baseline + diversity + a physical-size stress block.

Family definitions declare the geometry classes that are informative for that family.
Tracking prioritizes character/vehicle/elongated actors; orbit/reveal uses irregular,
furniture, compact, organic, and vehicle shapes; detail/presentation families emphasize
small-detail and irregular hero objects; object-motion and placement families emphasize
rigid/mechanical classes. Unrelated assets are never substituted merely to increase a
coverage count.

### Qualification scale guard

Every real asset is normalized before the capability is judged. Qualification keeps two
separate notions of size:

1. **logical physical extent** — MyWay's existing logical-size resolver estimates a
   plausible real-world size from verified identity/aliases/tags;
2. **audition target extent** — the size actually used in the canonical qualification
   scene.

Most camera/framing/lighting/continuity auditions use `presentation_normalized` sizing so
an imported mug, burger, chair, soldier, or vehicle is made comparably readable before
we judge the directing behavior. Object-motion and blocking families use
`physical_context` by default because their semantics depend more strongly on plausible
relative size. Full coverage adds an explicit physical-context stress pass for other
families after the fair-display evidence has already been recorded.

The scene layout also expands actor spacing when normalized extents would otherwise make
actors overlap at the canonical starting positions. This is a qualification-stage
false-negative guard, not production placement authority; Asset Scene Builder remains
responsible for final measured fit/collision/stability.

Recording manifests now preserve the evidence needed to diagnose scale separately from
capability code: source dimensions, logical extent/source, audition target extent,
render scale multiplier, normalization policy/reason/warning, exact Asset Library ID,
and final qualification blocking position. The Room surfaces family-pool coverage and
current sizing in a compact collapsed panel so the recording viewport remains simple.

The governing review rule is therefore stricter:

> Do not mark a Director capability wrong until the Qualification Room has made the
> asset's test size, placement, and identity evidence explicit enough to rule out a bad
> qualification setup.


## Phase 1B.7A.2 — camera-relative placement + recording hardening

The first **Depth & screen placement** Qualification Room reel exposed a shared
runtime weakness rather than an asset-normalization failure: `foreground`,
`midground`, `background`, `screen_left`, and `screen_right` were still
approximated with world +/-Z and +/-X offsets. Those words are perceptual
camera/composition instructions, so the shared Director runtime now resolves a
stable opening-camera basis and stages those relations along camera-relative
view-forward/view-right axes. Explicit blocking `screen_region` hints for these
relations are applied in the same camera-relative basis.

`layered_depth` now keeps primary, secondary, and context actors in the camera
focus solve and uses group framing. Its foreground/midground/background actors
therefore have to remain simultaneously readable instead of allowing the near
actor to dominate a camera that was solving only around the primary.

`projectDirectorActorCenter(...)` exposes lightweight 16:9 screen-space
qualification evidence (NDC position, safe-frame visibility, camera distance,
and camera-depth). The Phase 1B.7A.2 verifier uses that evidence as a regression
canary: Screen Left and Screen Right must land on opposite sides of frame;
Foreground < Midground < Background must order in camera depth; and all three
Layered Depth actors must remain visible while preserving that ordering.

The recording workflow is also hardened around Snipping Tool review:

- every real asset scheduled for the selected reel is warmed through the same
  `useGLTF`/asset-id proxy path before **Run family gauntlet** unlocks;
- a preload failure blocks the reel and exposes **Retry preparation** rather than
  silently substituting a bad audition;
- long capability names wrap inside the fixed 16:9 slate instead of overflowing;
- the final gap resolves to an explicit **REEL COMPLETE** slate, which remains
  visible until the user stops/resets the reel.

These changes do not qualify the family automatically. They make the evidence
fairer and reproducible so a second human-reviewed reel can decide whether the
six capabilities are now visually correct.

## Phase 1B.7A.3 — capture-safe Qualification Room playback

Qualification reels now use a **wall-time anchored playback clock** rather than adding
a fixed number of milliseconds every time a JavaScript interval happens to fire. That
matters during Windows Snipping Tool capture: if desktop recording briefly delays the
browser, the next presented frame catches up to the correct audition time instead of
stretching the capability and creating false slow-motion evidence.

The high-frequency movie clock also no longer lives in the full Qualification Room
React tree. The page changes state only at slate/play/gap/clip boundaries, while a
Canvas-local `QualificationPlaybackPreview` presents wall-time progress at a capped
**30 FPS**. Capability/role inputs are memoized across the clip, so the expensive
Director moment, runtime actor, directability, and blocking setup are not rebuilt just
because movie time advanced.

Capture performance keeps the existing evidence-quality boundaries:

- one WebGL Canvas;
- `frameloop="demand"`;
- `dpr={1}`;
- antialias disabled;
- shadows disabled;
- the existing low-power WebGL preference;
- no browser-focus gate, so Snipping Tool taking foreground focus does not pause a
  recording while the page remains visible.

Asset preparation is also cheaper during the active reel. The hidden `useGLTF` preload
components unmount once every scheduled asset is ready; the GLTF cache remains warm.
Qualification then asks `DirectorCapabilityPreview` to preserve mounted actor instances
across sibling capabilities when the role/Asset Library ID is unchanged, avoiding
needless GLB clone/remount work at every slate boundary.

Finally, the Golden silhouette clone/material pass is now lazy. Ordinary real-asset
auditions no longer deep-clone every GLB merely to prepare an outline that only
`highlight_subject` can render.

The qualification timing rule is therefore:

> Desktop capture may drop presentation frames under load, but it must not change the
> semantic duration, easing timeline, or pacing of the Director audition.


## Phase 1B.7A.4 — layered-depth readability + fair-display evidence

The second **Depth & screen placement** reel confirmed that Phase 1B.7A.2 fixed
camera-relative left/right and depth ordering, but it also exposed a separate
camera-fit failure: the three-layer `layered_depth` shot could preserve all actors
while backing the camera so far away that the composition became a tiny island in
an otherwise empty stage.

The root cause was framing math, not the semantic capability. The ordinary shared
camera fit expands its focus radius from full 3D pairwise actor distance. That is a
reasonable conservative default for many group arrangements, but it is wrong for a
shot whose *purpose* is to spread actors along camera depth. Depth separation was
being counted as though it were sideways composition width and therefore forced an
unnecessarily extreme camera distance.

Layered-depth compositions now use a **projected 16:9 fit** instead. The runtime:

- preserves foreground / midground / background blocking exactly;
- derives the opening camera view plane from the authored Director angle;
- measures each focused actor's horizontal and vertical silhouette envelope in that
  view basis;
- solves the minimum camera distance that keeps each actor inside a conservative
  screen-safe region;
- accounts explicitly for how far each actor sits toward or away from the camera;
- does **not** let background depth inflate framing distance as if it were lateral
  stage width;
- leaves the established focus-radius camera path unchanged for ordinary Director
  shots.

This is deliberately a camera-fit repair, not a blocking shortcut. MyWay does not
pull the three actors back together just to make the shot easier to frame.

`projectDirectorActorEnvelope(...)` adds lightweight projected-bounds evidence on
top of the existing actor-centre canary. It records approximate NDC width/height,
screen-area fraction, and full safe-frame containment from the same runtime actor
box used by the Director proof. The Phase 1B.7A.4 verifier rejects layered-depth
shots when any required actor becomes cropped or visually negligible, and it also
rejects a combined composition that collapses into a microscopic patch of frame.

Qualification sizing is refined at the same time. **Depth & screen placement** is a
perceptual composition family, so Baseline and Cross-asset use
`presentation_normalized` sizing. A mug, hydrant, chair, or other geometry class is
therefore made comparably readable before the capability is judged. Full coverage
still appends the existing `physical_stress` pass, which explicitly switches back
to `physical_context` sizing so real-world scale sensitivity remains tested rather
than hidden.

The evidence rule is now:

> First prove the composition on fair, readable actor sizes; then use the physical
> stress pass to decide whether real scale creates a legitimate restriction. Do not
> fail a Director capability merely because the qualification camera or asset scale
> made its evidence unreadable.

## Phase 1B.7A.5 — tracking grammar + comparable evidence

The first **Tracking & attached camera** reel exposed two different failure classes:
the runtime's Follow/Lead/Lag variants were too visually similar, and the Qualification
Room's rotating diversity pass changed actor semantics at the same time that it changed
camera grammar. A bicycle, police car, volleyball, and goldfish were therefore being
used as if they were interchangeable evidence for sibling tracking relationships.

Phase 1B.7A.5 separates those concerns.

### Comparable sibling blocks

The tracking family now carries capability-specific suitability profiles rather than
using one coarse family-wide asset list for every member.

- `follow`, `lead_subject`, `lag_follow`, and `track_parallel` are qualified first on
  the same Character baseline and then on the same Vehicle cross-asset baseline.
- `camera_object_attached` is vehicle-gated for ordinary evidence instead of being
  assigned arbitrary organic/furniture/compact actors.
- Full coverage may use additional vehicle candidates as stress evidence, but unrelated
  assets are not substituted simply to increase diversity.

This creates two distinct questions: **same asset / different camera relationship** and
**same camera relationship / different suitable asset**.

### Capability direction is separate from asset facing

For directionally meaningful tracking auditions, the Qualification Room reads the
authored primary `move_to` path and aligns actor-local +Z to that travel heading before
the camera relationship is judged. The alignment is applied outside the Asset Library
model's stored `default_rotation`; asset identity/orientation metadata is not rewritten.
The manifest records the applied facing correction and the travel heading.

This preserves the project rule:

> capability direction is not asset facing.

### Stronger Follow / Lead / Lag grammar

`follow` remains the neutral stable travelling relationship.

`lead_subject` now reserves unmistakable look room ahead of travel by moving the optical
target materially forward while translating the rig only enough to keep the shot related
to Follow.

`lag_follow` now creates a deliberately transient asymmetric relationship: the rig falls
behind more strongly than its look point, the actor pulls into the forward portion of
frame through the middle of the move, and the relationship returns to Follow by the end.

`track_parallel` keeps the existing actor-relative second-rail solve. Because actor facing
is now aligned independently to the travel path, a mathematically side-on rail no longer
fails merely because the test model happened to face a different world direction.

### Mounted-camera merge review

`camera_object_attached` is **not** deleted or merged in this patch. The Qualification
Room explicitly marks it for comparison against the existing camera-angle
`object_attached` capability. The current semantic distinction remains:

- `object_attached` — already mounted at the start of the shot;
- `camera_object_attached` — transitions into an actor-local mounted rig.

Human qualification must decide whether that difference deserves two permanent Director
vocabulary entries or one mounted-camera primitive with an attachment-transition mode.

The mounted-camera qualification course is also made less adversarial: roadside markers
provide optic-flow and orientation evidence outside the travel corridor instead of
forcing the camera through overhead gates and near-camera beams.

No Director capability IDs or support classifications are changed by this phase.

## Phase 1B.7A.6 — Tracking cinematography + mounted-camera consolidation

The second Tracking & attached camera reel proved that comparable character/vehicle
evidence was necessary but not sufficient. Phase 1B.7A.6 keeps Follow and the qualified
parallel-track relationship intact while tightening the remaining cinematography:

- **Lead subject** is now a travel-relative composition relationship. The camera keeps
  Follow-like distance while the optical target reserves explicit screen-space look room
  ahead of motion, pushing the subject behind centre rather than merely changing a
  numeric look-at point.
- **Lag follow** uses a delayed, bounded lag envelope. The camera falls behind modestly,
  keeps its target nearly with the rig so apparent-size change stays restrained, then
  catches smoothly back to Follow by the end.
- Scene-D tracking qualification uses one **safe travelling corridor** with a dashed
  centre line and low roadside markers. Real supporting assets are placed outside the
  camera rail so foreground hydrants/boxes cannot masquerade as camera failures.
- `object_attached` and `camera_object_attached` now compile through one canonical
  **mounted-camera relationship**. The angle ID selects `immediate`; the legacy movement
  ID selects `blend_in`. Both use the same actor-local mount/view solver. The movement
  ID remains in the 184-entry registry for compatibility but is explicitly a
  merge/deprecation candidate pending human review.
- The mounted optical centre is solved above and slightly behind the host bounds before
  looking forward/down, preventing low normalized vehicles from placing the camera
  inside opaque geometry. The movement audition no longer adds a 105-degree host turn
  that points the vehicle away from its own travel corridor.

These changes refine execution and qualification evidence; they do not add a second
Director runtime or silently delete legacy capability IDs.

## Phase 1B.7A.7 — Tracking family closeout hardening

The third human-reviewed **Tracking & attached camera** reel showed that the family no
longer needs a broad rewrite. Follow is visually qualified, Track Parallel has a strong
character proof, Lead communicates a distinct travel-relative composition, and the
mounted-camera primitive is usable. The remaining work is therefore encoded as narrow
cinematography protections rather than another vocabulary or family redesign.

- **Lead subject** keeps the A.6 look-room solve, but the preferred rear-third placement
  is now constrained by the primary actor's projected runtime envelope. The solver keeps
  the strongest lead amount that preserves a comfortable rear-edge margin instead of
  letting wide or irregular actors crowd the frame.
- **Lag follow** is now an explicit temporal event: a short near-Follow opening, a
  readable rise into lag, a brief middle hold, and a deliberate recovery back to Follow.
  The camera-distance envelope remains bounded while the look relationship makes the
  subject's pull-ahead perceptually obvious.
- The canonical **mounted-camera** optical centre is raised slightly and uses less
  rearward inset so the host body becomes a restrained lower-frame reference rather than
  a dominant foreground mass. `blend_in` now takes longer to reach the same canonical
  mounted relationship, preserving the immediate/blend-in distinction for human merge
  review.
- Scene D keeps the simple road, lane marks, and low roadside posts. Real secondary and
  context assets are pushed farther into a spectator/background zone so they cannot
  compete with the camera relationship being audited.
- Follow and Track Parallel execution are intentionally unchanged. The 184-entry Level 2
  registry and its support classifications are unchanged, and the legacy
  `camera_object_attached` ID remains a merge/deprecation candidate rather than being
  deleted during qualification.

The closeout verifier adds perceptual canaries to the earlier mechanical checks: Lead
must remain visibly distinct from Follow while preserving its rear safe margin; Lag must
show a measurable middle-of-shot screen-space pull-ahead and converge back toward Follow;
the mounted blend must remain progressive rather than snapping immediately; and the
tracking support actors must stay outside the safe travelling corridor.

This phase still requires one final human-reviewed family reel. Qualification closes only
after the vehicle Track Parallel playback is captured through the persistent
**REEL COMPLETE** slate and the reviewer records the final family decisions.

## Phase 1B.7A.8 — Tracking visual + runtime-performance hardening

The fourth human-reviewed **Tracking & attached camera** reel exposed two different
classes of defect that must not be conflated: remaining cinematography issues and
Qualification Room execution overhead. This phase keeps Follow and the mounted-camera
relationship frozen while repairing only the failing evidence/runtime seams.

- **Lead subject** no longer runs a projected-envelope binary search inside the
  display-frame camera sampler. The same rear-edge safety intent is solved as a
  **constant-time camera-space constraint** from camera depth/FOV, actor half-extent,
  and desired lateral target shift. The
  exported projected-envelope helper remains qualification evidence rather than hot-path
  camera authority. Lead qualification now explicitly covers both character and wide
  vehicle geometry.
- **Lag follow** keeps the A.7 delay/hold/recovery timing, but most visible lag now comes
  from the delayed look relationship. Only a small fraction of the lag distance moves the
  physical rig, preventing the vehicle audition from reading as a temporary loom/zoom.
  Qualification checks screen position and projected silhouette area against Follow for
  both character and vehicle fixtures.
- **Track Parallel** keeps its proven side-rail camera solver unchanged. The travelling
  corridor suppresses roadside posts for this grammar because those posts sit directly on
  the side-rail lens path; centre/edge road lines remain as clean optic-flow evidence.
- Tracking family reels now use the **real primary actor only** plus the procedural
  travelling corridor. Arbitrary secondary/context GLBs are deliberately excluded from
  Tracking evidence because they were adding foreground contamination and unnecessary
  GLTF preload/render cost without helping the camera comparison.
- Qualification playback no longer spins a monitor-refresh-rate `requestAnimationFrame`
  pump merely to present at 30 FPS. A wall-time anchored 30 Hz presentation timer keeps
  semantic duration intact while reducing scheduler wakeups during Snipping Tool capture.
- Qualification owns a bounded GLTF preload residency set: URLs abandoned by a family
  change are cleared from the loader cache, so a long review session retains only the
  currently relevant reel set instead of every family previously auditioned.
- The Director page now owns one shared Asset Library snapshot above the Capabilities /
  Qualification tab switch. Moving between the two workbenches no longer discards that
  snapshot and refetches/reprocesses the same library on every tab remount.

These are execution and evidence-quality repairs only. The Level 2 vocabulary, Follow
semantics, Track Parallel camera relationship, canonical mounted-camera primitive, and
Snipping Tool no-focus-pause rule remain unchanged. The next human reel should still run
through the vehicle Track Parallel proof and the explicit **REEL COMPLETE** slate before
this family is closed.

## Phase 1B.7A.9 — Qualification presentation polish

Phase 1B.7A.9 freezes the A.8 performance architecture and uses the Tracking family
to improve the **qualification instrument**, not to broadly rewrite already-readable
camera grammar.

- The travelling course now uses one identical set of **low-profile ground-edge
  reflectors** for Follow, Lead, Lag, Track Parallel, and mounted-camera evidence.
  The former upright roadside posts are gone from active rendering. The reflectors
  preserve optic-flow cadence while remaining too low to become foreground bars,
  lens wipes, or actor occluders.
- Qualification Room opts the shared preview into a restrained
  **Qualification-only camera visibility fill** for `camera_framing`,
  `camera_angle`, and `camera_movement`. The light follows the evaluation camera
  only to keep the primary asset readable as camera viewpoint changes. It is not
  part of `DirectorShotLightingRig`, does not activate in the normal Capability
  Library preview, and is deliberately absent from `lighting_emphasis` evidence.
  The variable under test remains the camera relationship, not accidental asset
  darkness from a world-fixed light direction.
- **Lead subject** keeps the A.8 constant-time safe-frame solver and its existing
  composition amount, but changes the temporal envelope to
  **brief near-Follow opening → establish during the first third → hold**. This
  makes Lead easier to compare against Follow without making the composition more
  extreme or reintroducing per-frame search.
- Follow, Lag, Track Parallel camera math, the canonical mounted-camera primitive,
  A.8 bounded GLTF residency, the shared Asset Library snapshot, and the 30 Hz
  wall-time presentation loop remain frozen.
- Recording automation is intentionally not introduced here. The next phase can
  automate evidence capture only after this neutralized presentation layer has
  been visually approved.

The qualification principle carried forward is:

> Neutralize variables that are not under test; let the capability under test be
> the thing that changes.



## Phase 1B.7A.10 — automated gauntlet evidence capture

Qualification evidence no longer has to depend on a long desktop Snipping Tool recording.
The Qualification Room can now own the capture of the exact WebGL viewport it is already
using for the family gauntlet and export a self-describing evidence package from that same
run.

- **Record gauntlet + export evidence** waits for the existing real-asset preparation gate,
  hides camera-path / role-label debugging overlays, builds one recording manifest, starts
  `HTMLCanvasElement.captureStream(30)` + `MediaRecorder`, and then gives that **same manifest instance** to the ordinary reel state machine. There is no separately rebuilt
  "what we think was recorded" manifest after the fact.
- Capture reuses the existing **single demand-rendered Qualification Canvas**. A lightweight
  `QualificationCaptureCanvasBridge` invalidates that Canvas at 30 Hz while recording so
  slate/gap/complete holds continue to produce timestamped video frames without restoring a
  high-refresh page-level render loop.
- WebM codec selection is explicit (`VP9` → `VP8` → generic WebM), with a bounded video
  bitrate. Unsupported `captureStream` / `MediaRecorder` browsers fail visibly instead of
  pretending an evidence run succeeded.
- The recorder stops automatically only after the reel reaches persistent **REEL COMPLETE**
  and holds the final state briefly. Manual Stop cancels the evidence run and deliberately
  exports no misleading partial package.
- One browser-generated ZIP downloads automatically with exactly three entries:
  `recording.webm`, `recording-manifest.json`, and `evidence-summary.json`. The ZIP writer is
  intentionally **store-only**: WebM is already compressed, so recompressing it would add CPU
  and memory pressure for negligible gain and would require another package dependency.
- The evidence summary records the reel ID, family, coverage, clip count, expected/measured
  duration, canvas resolution, codec, 30 FPS capture rate, and
  `reel_time_zero_recording_offset_ms`. That offset makes the tiny recorder-arm interval
  before the first slate clock explicit instead of silently assuming perfect zero alignment.
- Direct capture is intentionally `webgl_canvas_only`. Current DOM slates and UI chrome are
  **not** baked into the WebM; `dom_overlays_in_video: false` is written into the evidence
  metadata and the same-run manifest remains the authoritative clip/slate/time map. This
  keeps the recording clean while staying honest about its scope.
- Family / scene / coverage / cast controls and debug overlays are locked while automated
  evidence capture is active, and Pause is disabled so a capture cannot drift away from its
  manifest timing contract.

This phase is the browser-owned evidence layer only. The Playwright/headless-style launcher
and unattended multi-family batch runner remain intentionally deferred to **Phase 1B.7A.11**;
A.11 should drive this proven A.10 button/contract rather than invent a second recorder.


## Phase 1B.7A.10B — evidence integrity + mounted-host hardening

The first browser-owned A.10 evidence ZIP proved the one-click workflow, but it also
exposed two qualification-instrument defects that should be fixed before A.11 scales
capture across the full Director vocabulary.

- The WebGL Canvas remains the **single rendering authority**, but MediaRecorder no longer
  records that demand-rendered canvas directly. A dedicated **1280×720 evidence
  compositor** copies the latest WebGL pixels, writes capture-native clip/reel labels, and
  uses `captureStream(0)` plus `CanvasCaptureMediaStreamTrack.requestFrame()` so static
  slate/gap/complete periods still submit explicit recording frames.
- The capture compositor carries the same wall-time manifest contract as the reel. Its
  burn-in shows clip index, capability, primary cast slot, asset label, phase, reel ID,
  and elapsed reel time. After the planned reel duration it writes a real
  **REEL COMPLETE** frame into the recorded pixels instead of relying on the DOM-only
  completion slate.
- Evidence summaries now distinguish **requested capture FPS** from measured compositor
  submissions. The summary contract records `capture_scope: webgl_plus_capture_burnin`
  with `capture_burnin_in_video: true` while keeping `dom_overlays_in_video: false`.
  It records submitted frame count, effective submission FPS, largest
  submission gap, finalized WebM duration when the browser can resolve it, timeline
  drift, and whether a REEL COMPLETE frame was actually submitted.
- `evidence_integrity` is `pass` only when the finalized media timeline stays within the
  drift envelope, the compositor maintains the minimum submission rate, no excessive
  submission gap occurs, and a completion frame is present. Failed integrity still
  exports the ZIP so the run can be diagnosed, but future A.11 automation must refuse to
  treat a failed package as qualification evidence.
- The general Vehicle cast intentionally continues to include bicycles for ordinary
  Follow/Lead/Lag/Parallel stress. The current canonical mounted-camera primitive is
  narrower: `camera_object_attached` now filters that Vehicle pool through a
  **mounted-host suitability gate** that requires a broad body/hood/bodywork reference.
  If there is no second suitable mounted host, the diversity pass reuses the proven host
  rather than substituting an open-frame bicycle and producing an empty-road false
  failure.
- The A.9 Qualification-only camera visibility fill is modestly strengthened after the
  first internal reel still left the side-rail character darker than desired. This
  remains Qualification-only and remains disabled for `lighting_emphasis`.

A.10B is still the browser-owned capture layer. It does not add the unattended
Playwright/batch launcher; that remains **Phase 1B.7A.11** after one integrity-passing
evidence ZIP proves this hardened recorder.

## Phase 1B.7A.10C — deterministic evidence cadence

The first A.10B compositor run proved that media/manifest timeline drift was essentially
eliminated, but its diagnostics also exposed a scheduler flaw: early `setTimeout` wakeups
could submit more than one frame around a single 30 Hz deadline, while a main-thread stall
could still leave a long hole inside a capability proof. A.10C makes the cadence itself a
qualification contract instead of merely measuring it after the fact.

- Evidence capture now runs from one monotonically increasing **30 Hz sequence/deadline
  clock**. Every intended frame has an integer sequence index and exact expected offset.
  `requestFrame()` is called at most once for each due sequence slot; an early timer wakeup
  waits for the deadline instead of creating a duplicate, so the previous ~34.5 FPS
  oversubmission path is retired.
- After a browser/main-thread stall, the compositor does **not burst-fill stale frames**. It
  records the skipped sequence slots as `missed`, submits one fresh wall-time frame for the
  current due slot, and continues from the next deadline. Each submitted or missed slot
  records sequence index, expected offset, actual offset/lateness, reel phase, capability ID,
  and run ID in `recording-manifest.json` under `evidence_frame_timing`.
- The old recurring `QualificationCaptureCanvasBridge` invalidation timer is removed. The
  WebGL playback clock already invalidates moving frames at 30 Hz; the evidence compositor
  can repeat the latest pixels during static slate/gap/complete periods. This removes a
  competing 30 Hz timer from the main thread while preserving the single WebGL rendering
  authority.
- MediaRecorder data chunks are requested on a coarser 5-second timeslice instead of every
  second, reducing avoidable main-thread event churn during the gauntlet without changing
  the WebM/ZIP contract.
- Integrity remains fail-closed and is tighter: the summary now records scheduled frames,
  submitted frames, missed frames, missed-frame ratio, maximum consecutive misses, and the
  full frame-timing entry count. A run fails if effective submission falls outside 29–30.5 FPS, a
  submission gap exceeds 100 ms, more than 1% of intended slots are missed, more than two
  consecutive slots are missed, media drift exceeds 250 ms, or REEL COMPLETE is absent.

A.10C still exports the same three-file evidence ZIP and keeps the A.10B capture-native
burn-in and mounted-host suitability rules unchanged. **Phase 1B.7A.11** remains blocked
until an automated gauntlet produces `evidence_integrity: pass` under this deterministic
cadence contract.

## Phase 1B.7A.10D — recorder warm-up + non-flushing evidence window

The first deterministic A.10C reel fixed the prior oversubmission bug, but the resulting
evidence still exposed two browser-encoder seams: an encoded startup gap before the first
audition and a large in-reel stall aligned with the first periodic MediaRecorder chunk
flush. A.10D moves both operations outside the qualification evidence window instead of
loosening the evidence-integrity thresholds.

- `MediaRecorder` now starts **without a periodic timeslice**. No `requestData()` call is
  issued while the gauntlet is running; the recorder delivers its evidence payload only
  when `stop()` is called after the persistent **REEL COMPLETE** hold. This prevents a
  scheduled 5-second chunk flush from competing with Follow/Lag/etc. while those motions
  are being qualified.
- Before reel time zero, the same 1280×720 compositor records a **2-second encoder
  warm-up** with a capture-native `ENCODER WARM-UP` slate. The warm-up absorbs VP9/WebM
  startup, while `reel_time_zero_recording_offset_ms` keeps the recording/manifest
  relationship explicit.
- Warm-up cadence is measured separately. At reel time zero A.10D snapshots warm-up
  scheduled/submitted/missed/gap diagnostics, then resets the strict evidence-window
  cadence counters and `evidence_frame_timing`. Encoder startup therefore cannot create
  a false missing-frame failure inside the actual qualification reel.
- The authoritative 30 Hz sequence/deadline clock from A.10C is restarted exactly at reel
  time zero. Evidence integrity is calculated against `evidence_window_duration_ms`,
  while total WebM timeline drift still includes the warm-up offset. The 29–30.5 FPS,
  ≤100 ms gap, ≤1% missed-frame, ≤2 consecutive-miss, ≤250 ms drift, and captured
  **REEL COMPLETE** gates remain unchanged.
- `evidence-summary.json` now records `encoder_warmup_target_ms`,
  `encoder_warmup_actual_ms`, warm-up frame/gap diagnostics,
  `evidence_window_duration_ms`, and `recorder_periodic_timeslice: false` so an A.11
  runner can distinguish encoder conditioning from evidence quality.

A.10D is still browser-owned evidence capture rather than unattended orchestration.
**Phase 1B.7A.11** remains blocked until one real gauntlet produces
`evidence_integrity: pass` under this unchanged fail-closed contract.

## Phase 1B.7A.10E — lightweight evidence capture

A.10D successfully moved encoder startup outside reel time zero and removed periodic
MediaRecorder flushes, but a real reel still showed a nondeterministic in-evidence stall.
A.10E reduces the cost of every evidence frame before escalating to an offline renderer.

- The capture compositor is reduced from 1280×720 to **960×540**. That is 518,400 pixels
  per frame instead of 921,600 — **43.75% fewer pixels** for the browser to scale, burn in,
  and encode while preserving a 16:9 review image large enough for camera-relationship evidence.
- Qualification WebM codec preference is now **VP8 first**, then VP9, then generic WebM. VP8
  is chosen as the preferred browser encoder because qualification values temporal continuity
  over maximum compression efficiency; VP9 remains available as a compatibility fallback.
- Requested video bitrate falls from 4.5 Mbps to **2.75 Mbps**. The actual selected MIME type,
  960×540 dimensions, and `capture_video_bits_per_second` are written into
  `evidence-summary.json`, so a returned evidence package proves which lightweight profile ran.
- The A.10D **2-second ENCODER WARM-UP**, no-timeslice recorder, A.10C authoritative 30 Hz
  sequence/deadline clock, capture-native burn-ins, mounted-host suitability gate, and strict
  fail-closed integrity thresholds are unchanged. No missed frame is fabricated or interpolated.

A.10E is the last inexpensive real-time capture reduction before changing export architecture.
If a real A.10E gauntlet produces `evidence_integrity: pass`, **Phase 1B.7A.11** can add bounded
integrity-aware retries for unattended qualification. If repeated 540p/VP8-first runs still
produce long random holes, the next escalation should be deterministic frame-by-frame export
rather than loosening the evidence standard.

## Phase 1B.7A.10F — deterministic frame-by-frame evidence export

Repeated A.10C–A.10E browser recordings proved that the Qualification reel clock, burn-ins,
asset preparation, and manifest alignment were sound, but real-time `MediaRecorder` capture
could still lose a random ~0.8–1.0 second section when browser/main-thread/GPU scheduling
stalled. A.10F removes real-time delivery from the evidence acceptance path rather than
loosening the integrity gate.

- **Frame N is now an obligation, not a deadline.** The exporter enumerates every logical
  30 FPS frame from reel time zero through the persistent `REEL COMPLETE` hold. For each
  frame it sets the exact clip, phase, and capability progress, commits that state, explicitly
  invalidates the existing R3F Canvas, waits for that WebGL render to finish, copies the
  completed pixels into the evidence compositor, and only then advances to frame N+1.
- The existing R3F/Three.js Qualification Canvas remains the **single rendering authority**.
  A.10F does not create a second WebGL renderer and does not approximate camera coordinates.
  `auditSnap` makes each requested progress sample random-access deterministic rather than
  dependent on smoothing from the preceding wall-clock frame.
- Browser **WebCodecs `VideoEncoder`** compresses each completed 960×540 compositor frame as
  VP8 with an explicit `frameIndex / 30` media timestamp. Codec backpressure is awaited;
  if one frame takes 800 ms to render or encode, export becomes slower but the final WebM
  still contains that logical frame at its correct 30 FPS movie time.
- A small dependency-free WebM/EBML muxer packages the encoded VP8 chunks into
  `recording.webm`. Media duration is still read back from the finalized WebM before the
  evidence package can pass.
- `recording-manifest.json` keeps one `evidence_frame_timing` row per logical evidence frame.
  Deterministic rows have `actual_offset_ms === expected_offset_ms`, `lateness_ms: 0`, and
  additionally record `render_wall_time_ms` so expensive frames remain diagnosable without
  being mislabeled as missing movie frames.
- `evidence-summary.json` records `deterministic_frame_export: true`, expected/rendered/encoded
  frame counts, total export wall time, maximum per-frame render wall time, and
  `capture_method: deterministic_webcodecs_vp8_frame_export`.
- Integrity remains fail-closed. A deterministic export must render every logical frame,
  WebCodecs must emit one encoded chunk for every logical frame, finalized WebM duration must
  remain within the existing drift bound, and `REEL COMPLETE` must be captured. A slow
  computer can make export take longer; it cannot turn a missing frame into passing evidence.

The prior MediaRecorder implementation remains in the file temporarily as a compatibility
and diagnostic fallback, but **Render gauntlet + export evidence** now uses the deterministic
A.10F path. The first real A.10F Tracking ZIP subsequently proved the browser can decode the
muxed WebM with every logical frame present and the strict integrity contract reporting
`pass`, so evidence capture is frozen unless another family exposes a real defect.

## Phase 1B.7A.11A — qualification campaign state

A.11 is deliberately **not** an unattended all-family renderer and is **not** an automated
cinematography judge. The working review loop remains one family at a time:

`MyWay controlled audition → A.10F deterministic evidence ZIP → ChatGPT + human perceptual review → qualification decisions → MyWay campaign state`.

A.11A adds the lab notebook around that loop.

- The Qualification Room now owns a persistent campaign covering the same dynamic 33-family /
  184-capability suite. The campaign records the current family, family status, latest
  evidence reel ID/integrity/coverage, family-level review notes, reviewed timestamp,
  qualified/frozen capability IDs, and an explicit re-evidence reason.
- A successful or failed **A.10F deterministic export automatically attaches itself to the
  selected family**. `evidence_integrity: pass` moves the family to
  `Awaiting ChatGPT review`; failed evidence moves it to `Needs re-evidence`. No browser
  Download interception or separate batch renderer is added.
- The existing per-capability decisions remain the perceptual authority:
  Qualified / Fix / Merge candidate / Redefine / Restrict / Retire / Blocked. Changing a
  decision after PASS evidence marks the family `Review in progress`.
- A family cannot be closed until it has PASS deterministic evidence and every capability has
  a non-Unreviewed decision. **Save family review** freezes only capabilities marked
  `Qualified`; action items stay visible instead of being silently treated as complete.
- **Needs re-evidence** reopens the family after a targeted repair without unfreezing good
  siblings. **Save review & go to next family** and **Go to next unresolved family** advance
  the campaign without rendering anything automatically.
- The campaign board exposes all 33 families, review progress, evidence state, and frozen
  capability count while keeping the existing one-family `Render gauntlet + export evidence`
  button unchanged. The resulting ZIP is still intended to be sent to ChatGPT for deep
  visual judgment before decisions are recorded.

This keeps the three responsibilities separate: A.10F guarantees technically trustworthy
evidence, ChatGPT + the human reviewer judge cinematography, and A.11A remembers what has
been reviewed, frozen, repaired, or queued next.


## Phase 1B.7A.11A.1 — tracking merge-comparison evidence

The Tracking & attached camera family now renders **explicit same-host comparison
reference clips** for mounted-camera vocabulary decisions. Previously the reel
showed `camera_object_attached` with a merge/deprecation note pointing at
`object_attached`, but the evidence package did not actually include an
`object_attached` proof on the same vehicle host. That made the cinematography
look good while leaving the merge decision under-proven.

This patch keeps the qualified Tracking siblings untouched (`follow`,
`lead_subject`, `lag_follow`, `track_parallel`) and changes only the mounted
comparison harness:

- each `camera_object_attached` mounted proof is followed immediately by an
  `object_attached` comparison reference on the **same host** and in the **same
  pass kind**;
- both clips use the same safe travel corridor and canonical mounted primitive;
- the intended difference is now isolated to **blend-in timing vs immediate
  mounted start**, rather than to host choice or scene conditions.

The purpose is not to re-open the already-qualified tracking siblings. It is to
let the Qualification Room and ChatGPT make a real evidence-based decision about
whether `camera_object_attached` should remain distinct or merge into the
canonical mounted-camera primitive represented by `object_attached`.

## Phase 1B.7A.11A.2 — Depth / screen qualification fixture repair

The first A.11A **Depth & screen placement** Cross-asset review qualified
`foreground`, `midground`, `background`, `screen_left`, and `layered_depth`, but
`screen_right` was under-proven by the qualification fixture rather than by the
canonical blocking primitive. Scene B places its support actor on the right by
default, so the Screen Right primary moved toward that support while Screen Left
moved away from it. The result was asymmetric evidence with avoidable overlap.

This repair stays inside qualification choreography:

- the shared camera-relative `screen_left` / `screen_right` Director runtime is
  unchanged;
- the five two-actor Depth / screen siblings render only their required primary
  and secondary roles, while `layered_depth` still keeps its required context
  actor and existing projected-fit path;
- Screen Right mirrors the Scene-B primary/support pair around the neutral pair
  centre before the canonical blocking solver runs, giving left/right siblings
  complementary support placement instead of a right-biased fixture;
- the successor verifier checks the role policy plus projected left/right
  separation, safe-frame containment, and primary/support overlap using the real
  Director blocking and camera projection runtime.

The next evidence pass for this family should use **Full cast** so the repaired
Screen Right proof and the existing `physical_stress` / `physical_context` pass
are reviewed together. Previously Qualified siblings remain frozen unless the
new evidence reveals an actual regression.

## Phase 1B.7A.11A.3 — Group formation foundation repair

The first A.11A **Group formations** Cross-asset reel exposed a shared semantic
runtime failure rather than five unrelated cosmetic defects. `surround`,
`form_line`, `form_circle`, `cluster`, and `symmetrical_pair` were each authored
as one blocking cue for the primary actor, while the old runtime formulas moved
only that one actor. Scene B therefore carried most of the visible arrangement,
`form_line` and `symmetrical_pair` were nearly no-ops against the fixture, and
`surround` / `form_circle` differed mostly by a 0.1 m radius constant.

A.11A.3 makes group formation a first-class multi-actor primitive:

- one semantic formation cue expands deterministically across the participating
  actor set derived from explicit participants plus the shot's keep-visible /
  camera-focus contract; GLM does not need to repeat the cue once per actor;
- all five formations are solved in the opening camera's flattened
  `view_right` / `view_forward` basis rather than hard-coded world X/Z;
- **Surround** keeps a privileged centre actor and places supporting actors on a
  clearance-aware ring around it;
- **Form line** places all participants collinearly across camera-relative
  screen width with size-aware spacing;
- **Form circle** places every participant on an empty-centre circumference with
  equal angular spacing, making it structurally different from Surround;
- **Cluster** uses deterministic compact packing with pairwise clearance instead
  of scaling one actor toward the origin;
- **Symmetrical pair** uses exactly two actors, mirrors them around the
  composition centre, and equalizes their camera-relative depth;
- group formation demo shots use group framing and focus every participating
  actor so the camera proves the whole relation rather than one object;
- A.11A.3 qualification initially used three required actors for Surround /
  Line / Circle / Cluster, exactly two for Symmetrical Pair,
  `presentation_normalized` sizing for Baseline / Diversity, and the existing
  `physical_context` override for Full-cast physical stress. A.11A.4 below
  intentionally strengthens only the Surround / Circle participant counts.

The successor verifier mathematically checks centre occupancy, collinearity,
circle radius/angular separation, compactness plus clearance, pair symmetry,
safe-frame readability, and sibling distinctness. Cross-asset evidence should be
rerun first; Full cast is useful only after the five semantic formations are
visually distinct.

Package revision **v1.1** also removes unreachable group-relation `case` labels
from the scalar blocking switch after the group-formation type guard. TypeScript
correctly narrows those relations away at that point; the semantic solver is
unchanged, and the successor verifier now protects this compile-time boundary.


## Phase 1B.7A.11A.4 — Group formation perceptual refinement

The A.11A.3 Cross-asset re-evidence proved that the shared multi-actor formation
architecture is now real: **Form line** and **Symmetrical pair** were qualified
and are frozen. Three remaining siblings need perceptual—not foundational—work.

A.11A.4 narrows the repair to those unresolved siblings:

- **Surround** qualification now uses one privileged centre actor plus three
  supports. Three support sectors make enclosure immediately legible instead of
  reading as a two-sided `between` / flanking relationship.
- **Form circle** qualification now uses five circumference actors around an
  empty centre. The solver itself already accepted arbitrary participant sets;
  the stronger proof prevents a mathematically valid three-point ring from
  reading only as a triangle.
- **Cluster** keeps the A.11A.3 compact, clearance-aware packing foundation but
  adds a camera-relative lateral silhouette-overlap constraint, preferred compact
  wedge sectors, and a final real projected-envelope overlap gate from the solved
  Director camera. Broad assets therefore cannot satisfy physical clearance while
  hiding almost completely behind another cluster member.
- **Form line** remains a three-actor camera-relative line and **Symmetrical
  pair** remains an exact two-actor mirror. The successor verifier treats both as
  frozen sibling invariants and fails if this refinement changes them.
- Qualification-only extra support roles reuse the controlled context cast pool;
  production/runtime group formation remains asset-independent and still accepts
  arbitrary participant entity ids from authored scenes.
- The Qualification Room promotes the actual planned role set into the demo
  visibility/focus contract before rendering, so the camera frames all four
  Surround actors or all five Form Circle actors rather than silently solving
  around the older three-role generic demo.

The A.11A.4 verifier checks exact qualification participant counts, Surround
sector coverage, five-point Circle radius/angular consistency, Cluster physical
clearance plus projected-envelope overlap, and frozen Line/Pair invariants. The
next evidence pass should target **Surround**, **Form circle**, and **Cluster** in
Cross-asset mode while preserving the Qualified decisions for Form line and
Symmetrical pair. Full cast remains the final physical-scale stress pass after
those three unresolved siblings qualify.

## Phase 1B.7A.11A.5 — Relative actor placement foundation repair

The first A.11A **Relative actor placement** Cross-asset reel showed a second
shared blocking-foundation problem. Scene B made `in_front_of` / `behind` look
plausible even though those primitives still used hard-coded world Z, `beside`
used world X plus a radius heuristic that could leave projected overlap,
`between` was authored as a binary camera contract despite requiring two
references, and `facing` / `facing_away` were tested on ambiguous props in an
over-wide three-actor fixture.

A.11A.5 makes the six relationships perceptually explicit without reopening the
qualified Depth/screen or Group-formation families:

- **Beside** now stages the actor on opening-camera `view_right` at extent-aware
  clearance and performs a bounded projected-envelope widening pass until visible
  screen-space air separates the pair.
- **In front of / Behind** now use signed opening-camera `view_forward` depth
  rather than world +/-Z. A small opposite lateral peek plus a projected-overlap
  ceiling keeps the rear actor identifiable instead of allowing a full eclipse.
- **Between** is now intrinsically ternary in the capability contract. The demo
  cue declares both reference entity ids, focuses all three actors, and the
  runtime places the primary at the midpoint of those two references rather than
  treating an arbitrary second actor as optional context.
- **Facing / Facing away** retain the correct target-vector yaw solver, but
  qualification gates the primary cast to directional silhouettes, removes the
  irrelevant context actor, uses a compact extent-aware pair fixture, and presents
  the relationship in a front-profile two-shot so forward orientation is large
  enough to judge.
- Relative actor Baseline / Diversity evidence uses `presentation_normalized`
  sizing for a fair semantic/orientation proof. Full-cast retains the existing
  `physical_context` override as the separate real-scale stress test.
- All binary relationships render exactly primary + target; only Between renders
  primary + reference A + reference B. Qualification promotes that planned role
  set into the demo visibility/focus contract before rendering.

The successor verifier checks camera-relative signed axes under more than one
camera angle, physical and projected Beside clearance, readable front/behind
overlap, true geometric and projected Between-ness, Facing/Facing-away vector
dot products, minimum projected actor size, directional cast gating, and the
post-type-guard scalar-switch boundary. Rerun **Cross-asset** before Full cast; no
Relative actor sibling is frozen until the repaired evidence is reviewed.

## Phase 1B.7A.11A.6 — Between qualification framing refinement

The repaired **Between** primitive from A.11A.5 passed its semantic checks: the
primary is the midpoint of two explicit references, all three actors are in the
visibility/focus contract, and the projected primary sits inside the reference
interval. Cross-asset reel `QR-20260822-174028` nevertheless showed a narrower
qualification defect: the Scene-B reference interval was over-conservative, so
the normal three-actor camera fit backed away until the relationship became a
small island in a mostly empty frame.

A.11A.6 is deliberately qualification-only. It does **not** change the canonical
Between runtime, camera solver, capability contract, or the five now-qualified
Relative actor siblings. The fixture keeps the primary outside the reference
interval before blocking, but compacts reference A / reference B with an
extent-aware half-span that preserves breathing room without treating every
actor's largest 3D extent as literal screen-horizontal width. Full-cast remains
the separate physical-scale stress pass.

The successor verifier requires the A.11A.5 policy/version to remain intact,
checks the new Between-framing policy marker, proves the primary still moves to
the exact reference midpoint, verifies all three projected envelopes remain
inside the safe frame, requires a visible projected left/centre/right ordering,
and enforces a minimum useful projected actor size. Previously qualified Beside,
In front of, Behind, Facing, and Facing away are protected by the unchanged
A.11A.5 historical verifier.

## Phase 1B.7A.11A.7 — Support & containment physical-region convergence

The first **Support & containment** Cross-asset reel exposed a different class
of blocking error from ordinary camera-relative placement. `on_surface`,
`inside`, and `attached_to` were still treating whole-object bounds as though
they were usable physical regions. A round stool could therefore look correct by
accident while an office chair sent the source to the top of its backrest, and a
chair/table bounding box could be mistaken for a real interior or attachment
site.

A.11A.7 makes these three relationships consume measured asset-region evidence
instead of manufacturing whole-bounds approximations:

- **On Ground** remains unchanged and frozen. Qualification renders only the
  grounded source actor.
- **On Surface** now resolves a measured upward support surface from the target's
  Directability profile, rejects surfaces that cannot fit the source footprint,
  and prefers the largest/high-confidence viable support region. Missing measured
  support fails closed; target height is no longer a substitute for a surface.
- **Inside** now requires a measured containment region that fits the source. The
  qualification caster admits only open/access-visible target volumes for the
  positive proof, so ordinary furniture cannot qualify merely because the source
  lies somewhere inside its broad bounding box.
- **Attached To** now resolves measured **exterior surface-contact** evidence
  and its normal, placing the source outside that face rather than at a fixed
  fraction of target width/height. Geometry-derived exterior regions remain
  generic contact evidence — they are **not** promoted to semantic connector
  ports. Qualification requires a plausible measured contact patch before a clip
  is scheduled; precise connector mating remains the separate Directability/pair
  interaction lane.
- The Support & containment gauntlet becomes relation-aware. Binary physical
  proofs render exactly source + receiver, and **On Surface runs three receiver
  canaries per pass** so chair/stool/table-like surface geometry is tested rather
  than a single lucky top plane. Cross-asset therefore expands from eight clips
  to twelve when enough compatible receivers are available.
- Receiver casting scans the reviewed/loadable Asset Library for measured region
  compatibility at the same `physical_context` sizes recorded in the evidence
  manifest. Positive evidence is never created by silently shrinking a source to
  fit a receiver.
- The v1 Directability profile remains schema-compatible but now carries the
  measured support details the physical resolver needs (`usable_size`, overhead
  clearance, blocked fraction, orientation/exposure), containment openness, and
  geometry-derived exterior contact-patch size. Those fields are additive; they
  do not promote generic contact faces to connector semantics.
- Physical capability demo framing now uses an oblique two-actor proof, with a
  higher view for containment so the support/contact/interior relationship is
  visually inspectable instead of hidden by the receiver.

The successor verifier includes both positive and negative canaries: a chair seat
must beat a narrow backrest-top surface, a simple stool top must still work, a
receiver with no measured support must fail closed, an open containment volume
must resolve while a chair with no containment must not, and blocking-level
attachment must use measured exterior contact evidence without pretending that a
generic face is a typed connector. It also protects the frozen Group Formation and
Relative actor source boundaries and leaves the shared Asset Scene Builder as the
final collision/stability authority. Re-run **Cross-asset** before Full cast; only
On Ground remains frozen until the three repaired physical relationships are
reviewed.


## Phase 1B.7A.11A.8 — physical qualification scale parity + containment coverage

The first A.11A.7 Cross-asset reel proved that measured regions can find an office-chair seat instead of the backrest top, but the longer On Surface gauntlet exposed a qualification-only size split: cast suitability used the requested 0.17 m mug extent while the preview runtime silently floored that same actor to 0.25 m. Tight surfaces could therefore be admitted by casting and then rejected by runtime, and surface attachment could show a visible air gap even when the runtime believed contact was correct.

A.11A.8 gives visible rendering, runtime geometry, and physical-pair casting one canonical effective render-scale calculation. `directorQualificationRenderedWorldSize(...)` applies the same requested extent and render-scale bounds used by `LibraryAssetMesh`; the 0.25 m runtime floor and 0.05 m per-axis floor are retired. Physical-region fit therefore reasons about the actor size the reviewer actually sees.

Inside qualification also becomes source+receiver aware. The preferred compact source is retained when it has a compatible measured open containment receiver; otherwise the Room scans other eligible compact real assets and chooses a deterministic compatible source/receiver pair instead of silently dropping Inside because one preselected source was too large. The semantic boundary remains strict: no measured accessible containment still means no positive Inside clip.

Evidence is now diagnostic rather than inferential. Every On Surface / Inside / Attached To clip records `physical_resolution` with status, selected region kind/id/label, resolved position, exact source world size, selected target-region world size, fit margin, and unresolved reason. The recording manifest also records explicit `coverage_gaps`; if the current reviewed Asset Library genuinely contains no compatible measured pair, that absence is visible instead of masquerading as a shorter successful reel.

The successor verifier uses the 0.17 m small-detail actor as a parity canary, proves visible/runtime size identity under the Qualification Room scale bounds, protects A.11A.7 measured-region/fail-closed semantics, and requires the Inside pair-search plus manifest diagnostics. **On Ground remains frozen.** Rerun Support & containment in Cross-asset before any Full-cast stress.

## Phase 1B.7A.11A.9 — mesh-surface attachment truth + open-container discovery

The A.11A.8 Cross-asset reel qualified **On Surface** across six materially different real receiver geometries, including office-chair seats that previously failed when whole-object top bounds were mistaken for support. On Ground and On Surface are therefore frozen for this repair. The remaining reel defects are narrower: Attached To still used whole-bounds left/right/front/back pseudo-faces from historical geometry profiles, so an 8 mm solver clearance could look like a large visible air gap whenever the actual mesh sat inward from that global plane; Inside correctly failed closed but the current persisted profiles could not supply a positive open-container pair.

A.11A.9 adds a read-only browser GLB physical inspection used only while the Support & containment family is selected. The inspector samples the exact rendered mesh and derives local exterior surface patches from the occupied envelope at each projected region instead of treating one global bounding-box face as a contact surface. Qualification rejects the historical `attachment_left/right/front/back` whole-bounds pseudo-faces as positive Attached-To evidence when they came from Blender geometry. The selected sampled patch is serialized into the reel manifest and replayed as a qualification-only Directability override, so planning, deterministic capture, runtime placement, and physical-resolution diagnostics all use the same measured contact point/normal/size.
The canonical Blender geometry profiler is upgraded in the same patch: newly measured/refreshed Spatial Geometry Profiles emit `mesh_contact_*` regions clustered from occupied exterior triangles, and the geometry worker treats older v3-generator output as refreshable. The browser inspection is therefore a backward-compatible qualification bridge for assets whose persisted profile predates the new mesh-contact evidence, not a separate definition of attachment truth.

Inside discovery uses the existing Phase 1B.5B.2 evidence-hardening rule rather than weakening containment semantics. A real target must have independent container semantics (`container`, `vessel`, `cup`, `bowl`, `pot`, and closely related literal container terms) **and** a qualified browser-measured open-top geometry pattern. Only when those two signals agree does qualification derive the same semantic-plus-geometry open containment volume shape already used by the Directable Asset Compiler. Source and receiver are then tested at their physical-context world sizes; no source is silently shrunk to create a pass. If the library has open-container evidence but no real source fits, the manifest reports `open_container_evidence_found_but_no_real_source_pair_fits`; if no qualified opening exists it reports `no_semantic_open_container_evidence_available`.

The new inspector is bounded to a small candidate set and runs before the Support & containment reel unlocks; it does not add a second Canvas or bulk-load the entire Asset Library. Inspection failures remain explicit and fail closed. Every derived region records provenance (`browser_gltf_surface_sample` or `semantic_plus_browser_geometry`) in the manifest. Re-run **Cross-asset** after A.11A.9. Attached To and Inside remain unresolved until that evidence is visually reviewed; Full Cast still waits for all four siblings to qualify at Cross-asset.

## Phase 1B.7A.11A.10 — Support & containment physical topology hardening

The A.11A.9 Cross-asset reel proved that whole-object bounds had been retired, but
also exposed two remaining false-positive classes: disconnected chair/pedestal
samples could still be summarized as one broad Attached-To patch, and a closed
barrel/bin lid could still look like an open rim to point-density heuristics.
A.11A.10 hardens only those unresolved siblings while keeping **On Ground** and
**On Surface** frozen.

- **Attached To** positive qualification now requires first-hit ray evidence from
  the exact rendered GLB. Side rays are grouped with strict four-neighbour
  connectivity, depth continuity, and surface-normal continuity. A candidate is
  rejected when its rectangle is sparsely occupied or its actual centre ray does
  not hit the same contiguous surface island. Point-cluster patches remain
  diagnostic/A.11A.9 lineage evidence but cannot qualify A.11A.10 Attached To.
- Qualification scoring prefers an equally valid front/right, mid/body-height
  patch for human-readable proof, and the demo camera uses a three-quarter
  oblique view so contact versus penetration can be judged instead of looking
  straight down the contact normal.
- **Inside** still requires independent semantic container truth, but the old
  apparent-rim heuristic can no longer promote containment by itself. Downward
  rays through the central aperture must pass below the rim, form one connected
  accessible opening, and reach measurable cavity depth. Closed lids therefore
  fail closed even when vertex/triangle samples resemble a rim.
- The inferred qualification containment volume uses the measured ray-confirmed
  aperture and conservative cavity depth rather than a fixed fraction of the
  receiver's outer bounding height.
- Physical-region overrides now serialize topology evidence (occupancy,
  connectivity, centre-hit/access, normal alignment, cavity depth, and aperture
  size) into the deterministic evidence manifest.

Re-run **Support & containment → Cross-asset** after this patch. The expected
positive target remains 12 clips when the real Asset Library contains compatible
pairs: 2 On Ground + 6 On Surface + 2 Attached To + 2 Inside. If ray-confirmed
open containment is unavailable, Inside must be omitted with an explicit coverage
gap rather than fabricated. Full-cast remains deferred until all four siblings
are visually qualified at Cross-asset.

## Phase 1B.7A.11A.11 — Inside readability + On Surface source generalization

The A.11A.10 Cross-asset reel closed the physical-topology false-positive classes,
but human review found two remaining qualification-evidence problems rather than
new geometry-truth failures. Inside was physically valid yet visually unreadable
because the source remained near the centre/deep portion of the measured cavity,
and On Surface varied receivers while proving almost entirely mug/cup sources.

A.11A.11 keeps the A.11A.10 ray/topology gates intact and changes only how
qualification evidence is selected/presented:

- **Inside readability is qualification-only.** The canonical Inside demo sets
  `physical_containment_readability_near_opening`; once the same measured open
  containment region has already passed fit/access checks, the runtime may move
  the source 80% of the maximum safe one-direction centre travel toward the
  verified access direction. The complete source bounds plus clearance remain
  inside the measured cavity. Ordinary authored/production Inside cues keep the
  established conservative centring path because they do not receive this flag.
- The high-angle Inside proof camera remains in place. The patch does not make a
  hidden object visible by letting it protrude through the receiver; it makes the
  already-valid contained object readable from the verified opening.
- **Inside diversity no longer wraps.** Baseline uses the best compatible real
  source/receiver pair, Diversity requires the next distinct pair, and the
  physical-stress pass requires a third distinct pair. When one does not exist,
  the clip is omitted and the evidence manifest reports a coverage gap instead
  of relabelling the baseline pair as independent evidence.
- **On Surface now tests source generalization.** Each admitted three-canary pass
  requires three distinct compatible source asset IDs that are not classified as
  mug/cup/teacup/tumbler drinkware. Source search prioritizes simple rigid, small
  asymmetric, irregular hero, compact rigid, then non-drinkware small-detail
  assets. Distinct receiver assets are preferred too, but source diversity is
  mandatory because the preceding reel had already exercised receiver geometry.
- If fewer than three compatible non-drinkware sources can be placed on measured
  upward support regions, qualification fails closed with an explicit coverage
  gap rather than padding the reel with recycled drinkware. Evidence block labels
  include the actual source asset name so human review can see what generalized.

Re-run **Support & containment → Cross-asset** after this patch. On Ground and
Attached To remain frozen from the prior review; re-check the new On Surface
source set for support/contact quality and the new Inside clips for visible but
fully-contained placement. Do not mark the family qualified until Inside is
perceptually legible and the On Surface source set demonstrates real non-drinkware
generalization (or an honest coverage gap explains why the library cannot yet do
so).


### Successor verifier policy

A.11A.11 also changes how Support & containment patches are verified going
forward. Historical phase verifiers such as A.11A.7, A.11A.8, A.11A.9, and
A.11A.10 remain valuable acceptance/lineage records for the exact implementation
that shipped in those phases, but they are **not** permanent successor gates when
they assert local source spelling, UI copy, variable names, or other historical
implementation snapshots.

Successor patches must instead run:

1. the current phase acceptance verifier;
2. `verify-director-support-containment-earned-boundaries-phase1b7a11a11.ts` for
   durable Support & containment semantics;
3. unrelated Director/Qualification architectural regression verifiers;
4. the project TypeScript check and production build.

The earned-boundaries verifier protects behavior through functional canaries:
physical-context render/runtime scale parity, measured support with fail-closed
fallbacks, non-drinkware On Surface source generalization, distinct Inside pair
evidence, contiguous centre-hit attachment topology, open-cavity versus closed-lid
ray truth, measured attachment fit, and the qualification-only readability
contracts. It intentionally does not require the Qualification Room to retain a
particular local variable name or evidence-label string.

When a later phase deliberately evolves one of those behaviors, that successor
must update the current earned-boundaries suite to express the new semantic
contract. It must not make every historical acceptance script accept every later
implementation spelling. This keeps the regression chain strict without turning
past source snapshots into permanent vetoes over legitimate successor work.

## Phase 1B.7A.11A.12 — Inside evidence identity hardening

The visually improved A.11A.11 Cross-asset reel exposed one remaining
qualification-harness bug rather than a physical-placement failure. The baseline
and Diversity Inside clips could still carry the same source and receiver asset
IDs because browser inspection may produce more than one valid physical-region
candidate on a single receiver. The A.11A.11 pass index correctly asked for
candidate 0 and candidate 1, but candidate 1 was not guaranteed to represent a
second real asset pair.

A.11A.12 hardens the candidate boundary before pass indexing:

- Inside physical candidates are first ranked by the existing fit/evidence score.
- The ranked list is then collapsed by the composite
  `source_asset_id + receiver_asset_id` identity, retaining only the strongest
  physical-region candidate for each real pair.
- An alternate cavity/region candidate on the **same source/receiver asset
  identity** cannot count as Diversity.
- Baseline still uses unique pair 0, Diversity requires unique pair 1, and a
  physical-stress pass requires unique pair 2.
- If the current reviewed Asset Library contains only one unique ray-qualified
  Inside pair, the later clip is omitted and the existing
  `open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass`
  coverage gap is emitted. An 11-clip Cross-asset reel with that explicit gap is
  more truthful than a 12th clip that repeats baseline evidence.

This phase does **not** change Inside topology inference, source fit, the
qualification-only 80% near-opening readability travel, the high-angle camera,
On Surface generalization, Attached To contact, or On Ground. Re-run
**Support & containment → Cross-asset** and verify that any rendered Inside
Diversity clip uses different source/receiver asset IDs from baseline; otherwise
the reel must contain the explicit coverage gap instead of a duplicate clip.

The A.11A.11 successor-verifier policy remains in force. A.11A.12 updates the
earned-boundaries suite with a functional duplicate-region canary, while the
historical A.11A.7-A.11A.11 acceptance scripts remain lineage records rather
than permanent source-snapshot gates.

## Phase 1B.7A.11A.13 — Inside final-admission evidence guard

The A.11A.12 candidate de-duplication was correct in isolation, but the exported
Cross-asset reel proved that candidate policy alone was not a sufficient evidence
boundary: the final planner could still admit an Inside Diversity clip whose
source and receiver asset IDs exactly matched the already-admitted baseline clip.

A.11A.13 makes the **planned reel** the final identity authority:

- Candidate de-duplication and final admission now share one canonical
  `directorQualificationInsidePairKey(source_asset_id, receiver_asset_id)`
  definition.
- `buildPlannedClips(...)` keeps a reel-scoped set of already-admitted Inside
  pair keys across baseline, Diversity, and physical-stress passes.
- Immediately before an Inside clip is appended to the planned reel, its source
  and receiver IDs are keyed and checked against that set.
- A repeated pair is rejected even if an upstream selector, alternate physical
  region, fallback, cache, or later refactor returns it again.
- The existing coverage-gap pass then records
  `open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass`
  for the omitted pass when no genuinely new pair is available.
- A genuinely different source with the same receiver, or the same source with
  a genuinely different receiver, remains independent evidence because the
  composite pair identity changes.

This is deliberately a qualification-harness guard only. On Ground, the
non-drinkware On Surface generalization set, Attached To topology/framing, Inside
ray-open topology, source fit, 80% near-opening readability placement, and the
high-angle containment camera are unchanged.

Re-run **Support & containment → Cross-asset**. A 12-clip reel is valid only if
the Inside baseline and Diversity source/receiver pair keys differ. If the
reviewed Asset Library still exposes only one qualified Inside pair, the correct
result is an 11-clip reel plus the explicit distinct-pair coverage gap.



## Phase 1B.7A.11A.14 — Inside validation fixtures + Qualification load efficiency

The A.11A.13 reel made the evidence package honest, but it also made the remaining
visual question clearer: a small coffee cup inside a coffee mug is physically
valid yet perceptually ambiguous because the visible dark top can read as liquid
rather than as a second object. A.11A.14 therefore validates Inside with two
deliberately legible real-asset fixtures at Cross-asset:

- **Baseline:** pineapple inside bathtub.
- **Diversity:** apple inside the established `coffee_mug_bk_mritny8x` mug.

These are qualification fixtures, not production special cases. Both pairs still
go through the canonical physical-context normalization, measured/raycast-open
containment requirement, fit test, near-opening readability placement, and
final reel pair-identity guard. The apple is not arbitrarily shrunk to force a
pass; the existing logical-size authority supplies its physical-context target
size. If either requested pair is absent or does not expose a valid measured
open cavity that fits the source, that pass fails closed rather than silently
substituting another pair.

Bathtub/tub joins the qualification-only container semantic vocabulary so a real
bathtub can qualify only when the independent browser raycast also proves open
access and cavity depth.

A.11A.14 also reduces Qualification Room load work. Support & containment no
longer browser-inspects a broad sample of up to eighteen receivers whenever the
family is selected. The bounded inspection set now prioritizes the two exact
Inside receivers, one chair and one stool for Attached-To readability, plus only
small preferred/container fallbacks, with an absolute cap of eight. Exact
GLB+rotation physical inspections are cached at module scope, so revisiting the
room or rebuilding the same plan reuses completed mesh/raycast work instead of
re-parsing the same GLBs. The existing R3F preloader remains scheduled-clip-only:
only assets that actually occur in `plannedClips` are mounted for reel
preparation.

Re-run **Support & containment → Cross-asset** after this phase. The intended
Inside evidence labels are `Pineapple inside bathtub` for baseline and
`Apple inside coffee mug` for Diversity. Judge both the physical truth and the
perceptual readability; the generic production Inside solver remains unchanged.


## Phase 1B.7A.11A.15 — Inside real-scale fixtures + Qualification lazy-loading

A.11A.15 closes the two remaining validation-fixture problems without changing
the generic production Inside solver.

- Cross-asset Inside keeps the requested **Pineapple → Bathtub** baseline and
  **Apple → `coffee_mug_bk_mritny8x`** Diversity proof.
- Fixture asset discovery is case-insensitive and now prefers an exact semantic
  field match before broader word matching, so canonical labels such as
  `Bathtub` and `Pineapple` resolve deterministically.
- Explicit validation fixtures carry their intended qualification cast roles
  directly. A real Bathtub is no longer rejected merely because the generic
  Qualification Cast vocabulary does not independently classify the word
  `bathtub` as Furniture.
- Fixture physical scale comes from the known MyWay logical-size concepts, not
  from the generic cast slot: Pineapple ≈ 0.30 m, Bathtub ≈ 1.70 m, Apple ≈
  0.09 m, and Coffee Mug ≈ 0.13 m.
- Only these explicit fixture roles may use the fixture's wider source-unit
  correction range. Other Support & containment evidence keeps the previously
  earned qualification scale bounds, so On Surface remains frozen.
- Missing Inside proofs now report fixture-specific reasons: source/receiver
  missing, receiver not inspected, no verified open cavity, or real-scale fit
  failure.

Qualification load work is also narrowed:

- the Director shell no longer fetches/stats the Asset Library merely because
  the page mounted;
- Qualification requests the filtered `?view=qualification` library view only
  when the reviewer asks for real assets;
- module-lived cache and in-flight request de-duplication reuse the same Asset
  Library snapshot across tab switches/remounts;
- the qualification API filters non-GLB/non-GLTF and rejected/mismatched assets
  **before** file-stat work;
- Support & containment browser mesh inspection is capped at four exact
  receivers (Bathtub, established mug, one chair, one stool), with at most two
  concurrent inspections and the A.11A.14 GLB+rotation inspection cache.

The reel preloader is still scheduled-clip-only. No new Canvas, background
vision/enrichment pass, bulk Blender work, or provider-backed asset acquisition
is introduced by Qualification.


## Phase 1B.7A.11A.16 — Qualification auto-load + page de-bloat

A.11A.16 repairs the lazy-loading lifecycle introduced by A.11A.15 without
restoring eager whole-library work. Entering **Qualification Room** now
automatically requests the shared filtered `?view=qualification` Asset Library
snapshot. The request still flows through the module-lived cache/in-flight
deduplication layer, so tab switches do not create duplicate network work; an
actual request failure remains visible and can be retried manually.

The Director shell also code-splits `director-qualification-room.tsx`, keeping
the 200 KB+ qualification implementation out of the initial Capabilities client
chunk. Even when a full Asset Library snapshot is already cached, the Room is
passed only browser-loadable qualification GLB/GLTF records. Qualification pool
resolution is gated until that filtered snapshot is loaded, while A.11A.15's
server-side pre-stat filter, four-receiver Support/Containment inspection cap,
two-worker browser inspection limit, inspection cache, and scheduled-reel-only
GLB preloading remain unchanged.

The former **Preparing qualification pools…** placeholder represented a no-work
state when the lazy request had never been triggered. It is retired in favor of
**Starting qualification asset request…** and **Loading qualification asset
index…**, so a visible wait now corresponds to a real lifecycle stage.

## Phase 1B.7A.11A.17 — three-relation Support & containment generalization

Support & containment now qualifies exactly **On Ground**, **On Surface**, and **Inside**. Generalization is not a separate reel section: each relation must prove its own Cross-asset behavior. `attached_to` remains an independently covered blocking capability, but moves to the Relative actor placement qualification family so attachment evidence no longer consumes Support/containment slots. The campaign still assigns all 184 Level-2 capabilities exactly once across the same 33 families.

**On Ground** remains frozen. **On Surface** removes the historical drinkware source ban and admits any Qualification Cast source whose real footprint fits. Qualification rejects ground/rug-like receivers and low, enclosed, blocked, or accidental ledges; it replays the exact selected elevated support region into the shared runtime and uses bounded source scans with no Baseline→Diversity pair wrapping. These are generic geometry/readability rules, not asset-ID allowlists.

**Inside** retains the two requested Cross-asset validation fixtures: Pineapple → Bathtub and Apple → the established mug. Receiver scale remains authoritative. A contained source starts from its normal logical size and may shrink only down to a plausible logical specimen floor when the measured opening/cavity demands it; the receiver is never enlarged to manufacture a pass. Small cavities use proportional clearance. Physical inspection also supports broad basin-style top-access proposals when mug-rim heuristics do not apply, but a proposal becomes containment only when the existing connected downward-ray topology proves real open depth. Container semantics are still required, so ordinary furniture/closed shells cannot qualify from bounds alone.

The performance boundary from A.11A.16 remains intact: Qualification auto-loads the filtered asset index, the Room stays code-split from the initial Director bundle, heavy browser inspection remains cached and narrowly targeted, source-pair scans are bounded, and only scheduled reel GLBs are preloaded.


## Phase 1B.7A.11A.18 — Small Inside perceptual framing

A.11A.18 is a qualification-camera-only refinement after A.11A.17 closed the
Support & containment physical rules. Small `inside` receivers (up to 0.35 m
normalized extent) use a high-angle Insert-style detail composition focused on
the receiver so a contained source remains identifiable at evidence scale. Large
containers, including the qualified pineapple-in-bathtub proof, keep the existing
high-angle two-shot camera. No placement, fit, topology, asset-selection,
normalization, production-runtime, On Ground, or On Surface rule changes in this
phase. The trigger is receiver scale, not an Apple/Mug asset ID.

## Phase 1B.7A.11A.19 — Special Viewpoints qualification truth

The first human-reviewed **Special viewpoints** A.10F reel separated three
different outcomes instead of treating the family as one pass/fail block.
**Isometric** is visually frozen: its restrained-perspective technical overview
already communicates the intended relationship across the reviewed real-asset
passes. **Object-attached** remains active and must be re-evidenced on a
directionally suitable solid-bodied vehicle. **Inside-object** is deferred from
the active Qualification Room campaign until MyWay has interior-safe
asset/directability metadata.

Deferral does not delete or silently redefine `inside_object`. The frozen
184-entry Director vocabulary and historical family builder still contain the
capability, preserving compatibility and earlier regression evidence. The live
Qualification Room uses an active-family view that omits deferred capabilities,
so the current campaign has 183 actively qualifiable capabilities across the
same 33 families. Existing persisted campaign state is normalized against that
active view when the Room opens; if a stored family's capability membership no
longer matches the active family and it already has evidence, that family becomes
**Needs re-evidence** while still retaining frozen active siblings such as
Isometric.

`object_attached` now receives a capability-specific Special Viewpoints profile:
its primary evidence host is Vehicle-only, directional facing is required, and
the same `directorQualificationMountedCameraHostSuitability(...)` gate already
used by mounted tracking evidence selects the host. Open-frame bicycles,
characters, and other hosts without a broad hood/body/bodywork reference are not
valid diversity evidence for the canonical primitive. Baseline/diversity passes
choose among suitable hosts when available and reuse the proven host rather than
manufacturing a false failure when the vehicle pool has only one suitable body.

This phase deliberately does **not** change the shared mounted-camera solver,
camera coordinates, Isometric execution, or the Director registry/support
distribution. The next Special Viewpoints ZIP should therefore answer one narrow
question: with a truthful solid-bodied vehicle fixture, does Object-attached
visually retain the intended restrained lower-frame host reference while the
road/travel context moves through view?

## Phase 1B.7A.11A.20 — Composition thirds + negative-space truth

The human-reviewed **Composition** reel qualified Center anchor, Negative space
left, and Two-subject balance, while exposing two narrow composition defects.
Left third / Right third were directionally correct but too close to centre, and
Negative space right allowed an unrelated support GLB to occupy the side that
the capability explicitly promises to reserve.

A.11A.20 strengthens the shared Left/Right Third primitive without introducing
asset-specific coordinates. The camera target offset is derived from camera
distance, field of view, a 16:9 cinematic reference aspect, and the semantic
one-third screen location. Center, center-left/right, vertical anchors, and the
existing negative-space offset strength remain unchanged. The result is a
screen-space thirds solve rather than a fixed world-space nudge.

Negative-space qualification is also made truthful and symmetric. For
`negative_space_left` and `negative_space_right`, the Qualification Room renders
only the required primary actor; unrelated default secondary/context GLBs are
excluded from those two evidence clips so they cannot occupy the intentionally
reserved side. This is qualification-fixture policy only: it does not prevent a
production shot from containing other actors when the Director explicitly stages
them.

Center anchor and Two-subject balance execution are unchanged. Negative space
left's production camera behavior is unchanged; its evidence fixture becomes
cleaner under the same symmetric one-subject rule applied to Negative space
right. No Director capability IDs, A.11A.19 deferrals, mounted-camera behavior,
asset normalization, or evidence-capture machinery change in this phase.

## Phase 1B.7A.11A.21 — Detail & relationship framing qualification truth

The first human-reviewed **Detail & relationship framing** A.10F reel separated
camera grammar from fixture/directability truth. **Over shoulder** and **Point of
view** are visually frozen. **Macro** remains in the frozen 184-capability
Director vocabulary but is deferred from active Qualification Room coverage
until reviewed assets expose semantic feature/sub-part anchors; arbitrary
whole-GLB cropping is not accepted as evidence of a tiny mechanism or
surface-level change.

**Insert** stays active and keeps its existing camera grammar, but Qualification
now binds the explicit detail role to a suitable small/compact selected target so
Baseline and Diversity change the framed asset instead of replaying one context
GLB. **Two shot** and **Group shot** use a projected-envelope safe-fit solve;
Two shot proves two complete actors and Group shot proves three planned actors.
**Cutaway** remains compound but now keeps recognizable primary-system context
while emphasizing the secondary supporting detail. The projected-fit refinement
is limited to Two shot, Group shot, and Cutaway; Over shoulder, Point of view,
A.11A.20 composition thirds, mounted-camera behavior, and unrelated framing
remain unchanged.

Active Qualification coverage is now 182 capabilities across the same 33
families: 184 frozen vocabulary entries minus deferred `inside_object` and
`macro`. Stored evidence whose family membership predates the Macro deferral is
invalidated by the existing campaign membership guard and must be rerendered.

## Phase 1B.7A.11A.22 — Detail & relationship framing cleanup + honest proof

A.11A.22 follows the perceptual review of the first post-A.11A.21 Detail & relationship reel. The deterministic evidence was healthy, but it showed that the remaining failures were not one problem: Insert was over-cropped, Two shot and Group shot were being over-pulled by safe framing around arbitrary Scene-C spacing, Over shoulder was being asked to manufacture a shoulder from non-humanoid GLBs, Point of view was mechanically actor-relative without enough visible perspective reference, and Cutaway was being treated as a static camera coordinate even though its meaning depends on editing context.

The frozen Director registry remains **184 Level 2 capabilities across 33 families**. Active Qualification coverage is now **181 capabilities** because `inside_object`, `macro`, and `cutaway` are deferred. `cutaway` is not deleted: the legacy framing id remains executable for compatibility, but active qualification marks it for merge into higher-order narrative/editing grammar (`show_inside_outside`, `reveal_cutaway`, and `return_to_context`) rather than pretending a single static pose can prove a cutaway.

Detail & relationship evidence is tightened as follows:

- **Insert** uses a single-object projected-envelope fit with a 16:9 safe occupancy target. The entire selected small/compact object must remain identifiable instead of filling the frame with an arbitrary cropped surface.
- **Two shot** keeps the projected safe-frame ceiling but removes the redundant pair-radius × framing minimum-distance floor that was pulling the camera farther back after the envelope solver had already found the closest safe distance. Qualification also places the pair in a compact extent-aware relationship stage instead of inheriting the wide Scene-C hero/detail separation.
- **Group shot** uses a compact, extent-aware three-actor triangle. Primary, secondary, and context must all contribute to one readable cluster; the camera no longer has to zoom to an extreme wide merely to encompass arbitrary fixture spread.
- **Over shoulder** qualification requires a stable `character` foreground source. Baseline and Diversity vary the viewed target, not the shoulder/body source. This is an evidence restriction, not a claim that arbitrary non-humanoid geometry can truthfully provide a shoulder silhouette.
- **Point of view** qualification also keeps a stable Character viewpoint source, but now includes a third context/reference actor near the viewed target. The context reference makes perspective/parallax visible to perceptual review while the runtime remains actor-relative rather than Character-only in production.
- **Macro** remains deferred pending semantic feature/sub-part anchors.

This phase does **not** alter the already-qualified Composition thirds/negative-space semantics, Special Viewpoints mounted-camera semantics, tracking grammar, Support & containment boundaries, or deterministic A.10F evidence capture. Successor verification uses the current A.11A.22 acceptance suite plus durable architectural canaries, TypeScript, and a full production build; historical 182/183-active snapshots are not permanent vetoes over deliberate deferrals.

## Phase 1B.7A.11A.23 — Detail & relationship closeout: projected Group shot + honest POV deferral

Post-A.11A.22 deterministic reel `QR-20260827-232517` closed three of the five active Detail & relationship framings perceptually: **Insert**, **Two shot**, and Character-restricted **Over shoulder** are now stable enough to freeze. The remaining failures are deliberately separated instead of forcing one more broad camera rewrite.

The frozen Director registry remains **184 Level 2 capabilities across 33 families**. Active Qualification coverage is now **180 capabilities** because `inside_object`, `macro`, `cutaway`, and `point_of_view` are deferred. POV is not deleted and its legacy actor-relative runtime remains executable. Active Qualification simply stops claiming that an arbitrary GLB can prove a true first-person viewpoint before directability exposes a semantic viewpoint anchor (for example eye/head, cockpit, tool tip, or another authored viewpoint) plus a trustworthy forward axis.

**Group shot** receives the only visual repair in this phase. A.11A.22 used a compact world-space triangle, but the three-quarter-front demo camera could project the rear/context actor directly behind a neighbour. A.11A.23 stages primary, context, and secondary on the demo camera's horizontal **view-right** basis as an extent-aware left / centre / right cluster. The existing projected-envelope camera solver remains authoritative for closest-safe camera distance. This makes the fixture projection-aware without modifying the production Group-shot camera primitive or inventing asset-specific camera coordinates.

A.11A.23 therefore has narrow boundaries:

- **Insert**, **Two shot**, and **Over shoulder** are preserved unchanged from the visually accepted A.11A.22 reel.
- **Group shot** must keep all three projected actor envelopes inside the safe frame, give each actor a distinct screen-space centre, and prevent material horizontal envelope overlap in a controlled regression fixture.
- **Point of view** joins the deferred set until semantic viewpoint metadata exists; the frozen id and compatibility runtime remain intact.
- **Macro**, **Cutaway**, and **Inside object** retain their existing deferral reasons.
- A.10F deterministic evidence capture, Composition, mounted-camera semantics, tracking, blocking/placement, Support & containment, and the production camera runtime are unchanged.

Successor verification is intentionally current-state based: the A.11A.23 verifier carries forward the durable A.11A.22 boundaries without running historical active-count snapshots as vetoes. The installer then runs TypeScript and finishes with a full **`pnpm build` as its final validation gate**.

## Phase 1B.7A.11A.24 — Lens perspective qualification truth

Visual review of Lens reel `QR-20260828-191502` showed that the five conventional
focal-length presets were mechanically distinct but poorly isolated by the old
qualification fixture: asset identity changed between siblings while the camera
solver correctly compensated distance for FOV, leaving the actual perspective
progression difficult to judge. The same reel also confirmed that **Macro lens**
and the **Shallow / Deep focus** pair cannot currently be qualified honestly in
the browser preview. The preview renders perspective from FOV but does not model
macro magnification / close-focus behaviour or production depth-of-field blur.

A.11A.24 therefore keeps the frozen Director registry at **184 Level 2
capabilities across 33 families** while active Qualification coverage becomes
**177 capabilities**. `lens_macro`, `focus_shallow`, and `focus_deep` join the
existing deferred set (`inside_object`, `macro`, `cutaway`, `point_of_view`).
`lens_macro` remains frozen as a future merge candidate with Macro framing once
semantic feature anchors and close-focus semantics exist. Shallow and Deep focus
remain frozen as a pair until the selected renderer can visibly prove focus
distance / aperture blur.

The active Lens reel now contains exactly **Ultra-wide, Wide, Normal, Portrait,
and Telephoto**. Within Baseline all five siblings use the same primary, secondary,
and context assets; Diversity uses a second stable three-asset set. Qualification
stages each set on an extent-aware near / mid / far diagonal aligned to the
unchanged three-quarter-front camera depth basis, with a restrained view-right
offset so silhouettes stay separate. The production camera solver is unchanged.
Its existing FOV-dependent distance compensation is now the intended experimental
mechanism: near/far apparent-size ratio should decrease monotonically from
Ultra-wide toward Telephoto as perspective becomes more compressed.

The A.11A.24 successor verifier preserves the 184-entry frozen taxonomy and the
previously qualified Detail & relationship subset, asserts the 177-entry active
view and seven intentional deferrals, checks the fixed three-role Lens proof and
near/mid/far camera-basis staging, and numerically verifies monotonic perspective
compression across the five active lens presets. The transactional installer runs
current durable Director regressions, `pnpm exec tsc --noEmit`, and **`pnpm build`
as its final validation gate** before reporting success.

## Phase 1B.7A.11A.25 — Shot-scale semantic framing repair

Human review of Shot-scale Cross-asset reel `QR-20260828-200451` froze the
environmental end of the ladder (**Extreme wide**, **Wide**, **Full**) but exposed
that the middle ladder was still mostly a sequence of camera-distance multipliers.
On a tall Character baseline, Medium-close and Close could preserve feet while
cropping the head, which is the opposite of useful upper-subject cinematic grammar.

A.11A.25 keeps the frozen 184-capability vocabulary intact and defers only
**Extreme close** from this family. The active Qualification campaign is therefore
**176 capabilities**. Extreme close remains executable/frozen, but active evidence
waits for a semantic region / feature anchor so "small" also means *meaningful*
instead of an arbitrary bounds-centre crop.

The runtime repair is deliberately conditional rather than humanoid-hardcoded.
For a single subject whose rendered dimensions are strongly tall/upright, the
Medium-wide → Medium → Medium-close → Close ladder now:

- raises the optical target from 54% → 62% → 69% → 75% of rendered subject height;
- tightens the framing multiplier from 3.65 → 2.90 → 2.25 → 1.75;
- leaves Extreme wide / Wide / Full unchanged;
- leaves non-tall arbitrary geometry on the established geometric-centre framing
  path, preserving Diversity stress coverage without pretending furniture or
  mechanisms have a human chest/head anatomy.

The successor verifier checks the frozen 184 taxonomy, exact eight-capability
deferred set, 176 active coverage, the unchanged wide/full factors, monotonic
upper-subject target/distance progression, preserved non-tall fallback behavior,
and the A.11A.24 Lens lineage. The transactional installer runs TypeScript
validation and uses **`pnpm build` as its final native validation gate** before
reporting success.
## Phase 1B.7A.11A.26 — Complex camera paths qualification truth

The first **Complex camera paths** Cross-asset reel showed two different capability
classes hiding under one family. **Spline path** is a legitimate asset-independent
camera primitive, but the demo had supplied no waypoint payload, so the runtime
correctly fell back to its legacy sinusoidal side/up motion instead of exercising the
real Catmull-Rom branch. **Pass through** was more fundamental: advancing through the
target direction on an arbitrary solid GLB produced mesh intersection rather than a
meaningful traversal through an opening or representation boundary.

A.11A.26 therefore keeps the frozen Director vocabulary at **184 capabilities** while
active Qualification becomes **175 capabilities**. `pass_through` remains frozen but
is deferred until scene/asset directability can expose a traversable boundary contract
such as an entry plane, forward normal, safe aperture, and destination clearance.

Spline remains active. Its demo/evidence cue now supplies four explicit
`target_relative_points` plus `prepend_current_pose: true`. The runtime preserves
historical absolute `points`, adds a target-relative waypoint path for reusable
actor-relative authoring, and still retains the no-waypoint sinusoidal behavior only
as a compatibility fallback. The resulting open Catmull-Rom rail begins from the
already-solved camera pose and then traverses distinct lateral, vertical, and depth
phases without a start teleport.

The successor verifier proves that:

- the active **Complex camera paths** family contains only `spline`;
- `pass_through` remains in the frozen 184-entry taxonomy but not active Qualification;
- Spline carries four target-relative waypoints and a prepended solved start pose;
- the sampled camera hits each authored waypoint phase under linear path timing;
- the path is materially curved and multi-axis rather than a straight line;
- segment-to-segment motion stays continuous and the camera never approaches the
  teaching subject closely enough to become a mesh-intersection proof;
- the legacy absolute-point Catmull-Rom branch and no-waypoint compatibility fallback
  remain available.

The transactional installer runs historical successor-safe checks, TypeScript
validation, and `pnpm build` as its final native validation gate.

## Phase 1B.7A.11A.27 — Qualification Room single-flight GLTF preparation

A long Qualification session exposed a preparation-performance failure mode rather
than a Director cinematography failure. The Room already bounded residency to the
currently scheduled reel, but the preparation Canvas still mounted every scheduled
`useGLTF` request at once. Several large reviewed GLBs could therefore fetch, parse,
and upload to WebGL concurrently, producing a main-thread/GPU spike that made
**PREPARING AUDITION REEL** appear frozen. A suspended loader also had no watchdog,
so a genuinely stalled model could leave preparation unresolved indefinitely.

A.11A.27 keeps the existing one-Canvas, demand-frameloop, scheduled-clip-only
architecture and changes only preparation backpressure:

- exactly **one scheduled GLTF preloader** is mounted at a time;
- the next asset begins only after the current asset resolves or becomes an explicit
  preload error;
- a 25-second watchdog clears the unresolved loader entry and exposes the existing
  retry UI instead of allowing an infinite Suspense wait;
- **Retry preparation** reloads only failed/stalled assets when failures exist,
  preserving already-warmed good assets and avoiding another batch parse/upload spike;
- retired-family URLs continue to be cleared from the bounded resident GLTF set;
- the A.11A.26 Spline waypoint rail and `pass_through` deferral are unchanged.

This phase is a Qualification Room execution cleanup only. Frozen taxonomy remains
184 capabilities and active Qualification remains 175. The installer runs TypeScript
validation and keeps `pnpm build` as its final native validation gate.

## Phase 1B.7A.11A.28 — Linear camera travel Dolly disambiguation

Deterministic evidence reel `QR-20260829-124529` completed cleanly with **16/16
clips**, **4,059/4,059 rendered and encoded frames**, zero missed frames, and zero
timeline drift. Visual review accepted Static, Push in, Pull out, Truck, Pedestal,
Crane, and Settle. Dolly was mechanically smooth but its old controlled demo read
too much like Push in, so the family remains open for one re-evidence pass rather
than freezing a visually ambiguous proof.

Under-the-hood inspection showed that this was **not** a production-runtime
duplication and therefore should not be repaired by merging or rewriting the camera
solver:

- `push_in` advances camera position toward a fixed optical target, so
  camera-to-target distance closes;
- `dolly` is the generic parameterized whole-rig translation primitive: camera
  position and aim point translate together, preserving their mutual distance;
- the old Dolly demo supplied no direction, so the runtime inherited its
  camera-forward `[0, 0, 1]` default. With a stationary centered subject that
  produced a perceptual result very close to Push in even though the underlying
  rig contract was different.

A.11A.28 repairs **qualification authoring and diagnostics only**. Dolly's demo now
uses a bounded `0.8 m` camera-relative diagonal direction `[0.7, 0, 0.7]`. The
stationary subject should therefore drift/parallax across frame with only moderate
scale change while camera and aim point travel together. Push in remains centered
on a fixed target and closes distance. The camera-fidelity audit now asserts both
contracts explicitly, and the Qualification guidance describes the intended visual
comparison against Push in and Truck.

No production `director-shot-runtime.tsx` behavior is changed. The frozen Director
taxonomy remains 184 capabilities, the live deferred set remains unchanged, and
active Qualification coverage remains derived from that live set (175 at this
phase). Render a fresh **Linear camera travel** gauntlet after this patch; if Dolly
now reads as whole-rig diagonal translation while the seven previously accepted
siblings remain stable, the family can be closed.

### A.11A.28 v1.2 — historical Qualification verifier successor safety

The first two A.11A.28 installer attempts exposed a regression-suite problem rather
than a camera/runtime problem. Older Qualification verifiers still pinned the active
campaign to the exact historical counts from their own phase (for example 183, 181,
180, or 175). Later, legitimate semantic deferrals reduced live active coverage, so
re-running an old snapshot verifier could veto a correct successor state.

Historical Qualification verifiers now treat the frozen 184-capability taxonomy as
the stable authority and derive active coverage from
`DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS`. They verify the cinematic/fixture
invariant owned by their phase and require their historical deferrals only as lineage
subsets where appropriate; they do not require the live deferred set to equal an old
snapshot. A dedicated A.11A.28 successor-safety verifier guards this rule so future
patch installers cannot silently reintroduce hard-coded active-count gates into the
A.11A.20–A.11A.27 regression chain.


## Phase 1B.7A.11A.29 — Orbit, arc & reveal-path perceptual disambiguation

Deterministic evidence reel `QR-20260829-215533` completed cleanly with all ten
scheduled clips and no capture-integrity drift. Visual review accepted **Orbit**,
**Arc left**, and **Arc right**. Their target-centred angular travel and surrounding
parallax are already distinct enough to freeze. **Reverse reveal** and **Rise and
reveal** remained mechanically smooth but failed the stronger perceptual contract:
the supposedly hidden information was already readable in the opening composition.

A.11A.29 therefore changes qualification authoring and fixture staging only. The
production `director-shot-runtime.tsx` camera branches remain untouched.

- Reverse reveal now uses exactly two intrinsic actors. A compact source is staged
  directly behind the apparent result on the opening camera-depth axis, then the
  authored reveal arc creates screen-space parallax until the source separates.
- Rise and reveal also uses exactly two intrinsic actors. A solid simple-rigid
  foreground occluder is placed between the camera and teaching subject; the demo
  authors a stronger bounded rise so the occluder falls away and exposes the
  subject instead of reading like an ordinary Crane/Pedestal move.
- Orbit and both Arc siblings keep their existing three-actor spatial-reference
  stage and camera semantics unchanged.
- Reveal qualification guidance now treats hidden-to-readable occlusion change as
  the perceptual invariant rather than accepting camera motion alone.

The regression process is also hardened from the A.11A.28 installer lessons:
TypeScript validation runs before the authoritative regression chain; superseded
historical verifiers are not reintroduced as vetoes; authoritative verifiers do not
gate on README prose; and `pnpm build` remains the final native validation command.
Render a fresh **Orbit, arc & reveal paths** gauntlet after this patch and review the
two reveal siblings against the already accepted Orbit/Arc trio.

### A.11A.29 v1.1 — Rise-reveal calibration after projection proof

The first A.11A.29 install correctly failed its new projection verifier before build:
with the authored 3.0 m distance and the existing 0.78 demo strength, Rise-and-reveal
travelled about 2.34 m. Because the production primitive intentionally includes a
restrained pull-back component, that oversized demo move reduced silhouette overlap
but cancelled the vertical parallax needed to make the foreground element visibly
give way. The project rolled back exactly.

The qualification demo is therefore calibrated to **1.6 m** rather than weakening the
perceptual contract or rewriting production runtime. The controlled proof now requires
three things at once: substantial opening overlap/depth occlusion, materially lower
final overlap, and a newly positive top-edge clearance where the hidden target visibly
emerges above the foreground occluder. This is a qualification-authoring correction;
`director-shot-runtime.tsx` remains unchanged.

## Phase 1B.7A.11A.30 — Rotational reframing perceptual disambiguation

Deterministic evidence reel `QR-20260829-224112` completed cleanly with all six
scheduled clips and no capture-integrity drift. Visual review accepted Pan as a
clear horizontal rotation, but Tilt over-rotated until the teaching subject was
mostly lost below frame, while Reframe looked too much like Pan instead of
proving an explicit attention handoff.

A.11A.30 keeps production camera-movement semantics intact and repairs
qualification authoring/fixture evidence:

- Pan's qualification demo selects the existing one-focus generic-yaw branch so
  it no longer uses the same two-focus actor destination pattern as Reframe.
- Tilt keeps a fixed camera but uses a bounded demo strength and wider framing so
  vertical rotation remains obvious without ending on mostly empty sky.
- Reframe uses exactly two actors staged on the opening camera's horizontal
  view-right axis. The opening privileges the primary; the ending privileges the
  secondary; both remain readable enough to perceive an intentional A-to-B
  compositional handoff.
- The A.11A.30 verifier measures fixed camera position, screen-space travel,
  safe final Tilt readability, and the Reframe centre swap. It does not use
  README or Qualification Room prose as an executable regression gate.

Patch installation continues the hardened transaction policy: exact
baseline/applied preflight, TypeScript before authoritative regression
verifiers, immediate native exit-code capture, exact rollback after writes, and
`pnpm build` as the final native success-path command.

