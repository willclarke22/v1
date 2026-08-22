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
A.10F path. Phase 1B.7A.11 remains deferred until one real A.10F ZIP proves the browser can
decode the muxed WebM and the strict integrity contract reports `pass`.

