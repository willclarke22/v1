# Asset Directability — Phase 1B.5

Phase 1B.5 gives the Director/runtime a renderer-neutral description of what a real asset exposes for direction.

The profile is derived from existing trusted asset evidence:
- measured geometry orientation, support surfaces, interior volumes, contact regions, and attachment regions;
- asset rig/clip metadata;
- explicit `directability_overrides` for semantic information geometry cannot safely infer, such as hinge pivots, semantic subparts, rolling radius/axis, socket meaning, bone maps, and clip maps.

It does **not** infer semantic mesh parts from node names, does not create missing hinges or bones, does not perform collision/fit, and does not claim arbitrary subpart execution. Asset Scene Builder remains physical staging/collision authority.

The Motion Program consumes the profile in three ways:
1. requirements can be resolved against concrete evidence instead of staying only `declared`;
2. safe root-level recipes may use orientation/rolling/root-pivot metadata when present;
3. diagnostics report resolved and unresolved directability needs without silently promoting support classifications.

Older scene manifests remain readable because `directability_profile` is optional on resolved bindings and actors.

## Phase 1B.5A Builder diagnostics

Asset directability is now inspectable in the live Asset Scene Builder. For the
active Director moment, the Builder compiles each state-resolved actor and shows
which MotionProgram directability requirements resolved, which required evidence
is missing, and which optional evidence remains unavailable. This does not
promote arbitrary child-node articulation; unresolved asset anatomy continues to
fail honestly.

## Phase 1B.5B Directable Asset Compiler

Phase 1B.5B changes the scaling model from an asset × capability matrix to a compile-once affordance graph. `compileDirectableAssetAffordanceGraph(asset)` turns existing Geometry Profile, Directability, rig, and animation-clip evidence into reusable root, frame, contact, surface, containment, port, joint, subpart, rolling, rig, and clip affordances.

Generic interaction operators then derive whether an asset is ready for Translate/Rotate, Aim/Align, Roll, Place-on, Attach roles, Insert, Fill/Drain/Accumulate, Flow/Emit, Open/Close, skeletal pose, or an existing animation clip. Phase 1B.5C now resolves source↔target compatibility from two compiled graphs without storing pair-specific data on either asset.

Legacy free-form `asset.affordances` strings are advisory only and never grant executable support by themselves. Phase 1B.5B.2 may use a narrow advisory semantic label only as one side of an independent two-signal geometry corroboration; the label alone still resolves nothing. The `/sandbox/probe-lab/directable-assets` lab compiles real Asset Library records and performs a read-only GLB hierarchy inspection for the selected asset so explicit node/bone/clip bindings can be validated without adding another WebGL Canvas or guessing semantics from node names.


## Phase 1B.5B.1 Contextual affordance inference

Phase 1B.5B.1 adds a conservative geometry-inferred affordance lane for affordances that can emerge from actual shape and scene context rather than semantic labels. The selected GLB is sampled directly in the browser (no additional WebGL Canvas) to evaluate axis candidates using projected angular coverage and boundary circularity. Strong candidates may compile to `inferred` rolling affordances with an estimated radius and explicit context requirements such as reorientation, a compatible support plane, and travel perpendicular to the rolling axis.

This does not turn geometry into semantic truth. Node names still do not create doors, sockets, bones, or material meaning; free-form metadata remains advisory; explicit rolling metadata still outranks inference. Operator diagnostics now distinguish verified/measured/inferred evidence and expose `contextual_candidate` separately from `executable_as_is`.

The directable-assets lab also includes a cheap library-wide audit built only from stored geometry/directability evidence. Deep GLB surface analysis remains on-demand per selected asset so adding more assets does not cause the page to bulk-load the model library.

## Phase 1B.5B.2 Affordance evidence hardening

Phase 1B.5B.2 hardens the boundary between raw geometry and executable semantic truth before pairwise interaction resolution.

- Raw measured interior/void regions compile first as `containment_candidate`. They become executable `containment_volume` only when accessibility/opening evidence is strong enough, or when explicit authoring supplies that truth. Advisory `container`-like metadata can corroborate a measured open-top geometry pattern, but neither metadata nor shape can promote containment alone.
- Generic geometry-derived exterior attachment regions compile as `surface_contact_region`, not semantic connector ports. Only explicit anchors or semantically specific measured mount/connector regions can become `attachment_port` / `socket_port`.
- Support surfaces carry viability information and remain contextual for Place-on and support-only Accumulate because source footprint, stability, and clearance depend on the counterpart and scene.
- Geometry-inferred Roll now classifies a rolling profile (`spherical`, `cylindrical`, `wheel_or_ring`, `tapered`, or `irregular`). Only constant-radius-compatible profiles can feed the current UMP Roll lane directly; tapered/irregular results stay approximate/fallback evidence.
- A measured `orientation_frame` is a geometric coordinate frame. `Aim` requires a separate `semantic_forward_frame`, currently supplied only by explicit directional authoring; geometry axes remain valid for `Align`.

The selected GLB may also expose an on-demand top-opening candidate from surface samples. This is still not semantic truth: it is used only as corroborating geometry when independent container semantics already exist.

Phase 1B.5B.2 deliberately does **not** itself decide pair compatibility, arbitrary GLB child-node articulation, skeletal execution, or physics. Phase 1B.5C consumes its hardened evidence; Asset Scene Builder remains fit/collision/stability authority.

## Phase 1B.5C Asset-to-asset interaction resolution

Phase 1B.5C resolves interactions from **two existing Affordance Graphs + scene context**. It does not add an asset-pair matrix and does not write pair relationships back into the Asset Library.

The first generic pair lanes are:
- `place_on`: source ground/contact + target support candidate → conservative footprint fit → target-local placement candidate;
- `surface_attach`: source/target exterior contact regions → contact fit + opposed-normal alignment candidate, while material/attachment policy remains contextual;
- `precise_attach`: authored/verified attachment/socket ports → kind + meaningful semantic-token compatibility → anchor-frame alignment + persistent attachment intent;
- `insert`: source bounds or typed connector + trusted containment/socket receiver → conservative 3D fit/alignment + containment-membership intent;
- `flow`: trusted source outlet + target inlet/usable containment → source/destination endpoint selection + directed route candidate.

A `resolved_candidate` is intentionally **not** a physics verdict. The pair resolver may select evidence, score compatibility, and emit a deterministic transform/route in scaled target-local space, but Asset Scene Builder remains authoritative for exact mesh fit, collision, stability, insertion clearance, and route obstruction. Surface attachment remains `contextual_candidate` even when geometry fits because generic contact geometry cannot prove adhesive/material policy.

Attachment results carry relationship intent rather than executing hierarchy changes inside this compiler. Precise/surface attachment may request persistent source→target attachment with `detach` as the inverse; insertion may request containment membership with `remove` as the inverse. Scene-state/runtime integration consumes those plans in later convergence work.

The pair resolver is renderer-neutral and pure. The canonical Directable Assets workbench lives at `/sandbox/probe-lab/directable-assets`: the default **Asset Qualification** tab covers per-asset evidence, while `/sandbox/probe-lab/directable-assets?tab=interactions` opens the **Asset Interactions** tab for Phase 1B.5C pair resolution. The legacy `/sandbox/probe-lab/directable-interactions` route redirects to that canonical interactions tab so old bookmarks remain valid. The interactions tab deep-inspects only the two selected GLBs, compiles both through the same hardened asset compiler, and displays all five pair-resolution lanes without creating another WebGL Canvas.

## Phase 1B.5C.2 Scene-scale + pair-fit hardening

Phase 1B.5C.2 tightens when pairwise evidence is allowed to become a strong interaction candidate. Pair context now carries explicit scale authority: `scene_instance` and `explicit_context` are authoritative, while `asset_baseline` and `assumed_unit` are preview/context evidence only. Unqualified Asset Library dimensions therefore cannot silently become final scene-fit truth.

Place On uses a measured source contact footprint when available and only consumes stronger support candidates before Builder performs exact stability/collision validation. Geometry-inferred open-top inlets preserve measured aperture size, and Insert requires one deterministic source orientation to fit both the receiver aperture and containment volume before authoritative scale can produce `resolved_candidate`.

Pair relationship output is now `proposed_relationship` with `activation_state: "proposed"` and explicit activation requirements. The resolver never activates parenting, containment membership, or other persistent scene state on its own. The Directable Assets → Asset Interactions tab exposes optional scene-dimension overrides so baseline preview and authoritative `explicit_context` fit can be compared without creating another page or WebGL Canvas.

## Phase 1B.5D — capability vocabulary + authority cleanup

Phase 1B.5D names four adjacent vocabularies without merging their responsibilities:

1. **Director action** — canonical semantic intent and temporal behaviour. This is the vocabulary GLM may request.
2. **Asset qualification operator** — internal evidence/role requirements for one real asset. `attach_as_source`, `insert_into_target`, and similar IDs are not alternate Director commands.
3. **Pair interaction** — internal compatibility and candidate-transform lanes for two real assets. `precise_attach`, `insert`, and `flow` do not become final physics verdicts.
4. **Builder placement** — final measured scene-fit authority for support, containment, attachment, adjacency, clearance, stability, and collision.

The typed cross-layer map lives in `capability-authority-contract.ts`. It deliberately preserves existing IDs and execution semantics while documenting which asset operators, pair lanes, and Builder relations may sit beneath a Director action.

The camera framing capability `insert` is now displayed as **Insert shot**, while object motion `insert_into` is displayed as **Insert into target**. Their internal IDs do not change.

Phase 1B.5D does **not**:
- change the 183-capability support distribution;
- add another motion runtime;
- promote any Directable Asset qualification status;
- activate pair relationships;
- move final fit/collision/stability authority out of Asset Scene Builder / Primitive Builder;
- add another WebGL Canvas.

The next planned phase can use this authority map to build a real-asset execution bench inside the Director Capability Library without creating a second semantic language.
