# Phase 1B.5B — Directable Asset Compiler & Affordance Graph

Phase 1B.5B changes the scaling model for real-asset direction.

The system no longer treats an asset × capability matrix as the source of truth. Instead, each asset is compiled once into a renderer-neutral affordance graph. Generic interaction operators then derive whether a requested action is executable from the evidence exposed by that graph.

## Evidence model

Executable graph evidence comes from:

- measured Geometry Profile orientation, ground contact, support surfaces, interior volumes, and attachment regions;
- explicit Directability overrides for semantic ports, pivots, semantic subparts, and rolling metadata;
- rig and animation-clip metadata already carried by the asset record;
- optional read-only GLB hierarchy inspection in the qualification lab, used only to validate explicit node/bone/clip bindings (never to infer semantic identity from names).

Free-form `asset.affordances` strings remain advisory only. They are shown as suggestions in diagnostics and cannot make Roll, Open, Fill, Attach, or another operator executable.

## Compiler output

`compileDirectableAssetAffordanceGraph(asset)` produces:

- root-transform control;
- orientation frames;
- contact/support evidence;
- containment volumes;
- attachment/socket/inlet/outlet ports;
- pivot joints;
- semantic subparts;
- rolling radius/axis evidence;
- rig and clip affordances;
- non-executable metadata suggestions;
- evidence/confidence diagnostics.

## Generic interaction operators

Phase 1B.5B defines generic requirements for root motion, Aim/Align, Roll, Place-on, Attach roles, Insert, Fill/Drain/Accumulate, Flow source/destination, Emit, Open/Close, skeletal pose, and existing animation clips.

These operators query affordances. They are not copied into each asset record.

Asset-pair compatibility (for example connector type/size matching between a hose and tank) is intentionally deferred to Phase 1B.5C. Phase 1B.5B only proves whether each side exposes the trusted evidence required to participate in that interaction.

## Qualification statuses

- `executable_as_is`: this asset alone exposes the trusted evidence needed by the operator.
- `conditional`: this asset exposes its side of a pair interaction, but another compatible asset is still required.
- `asset_ready_runtime_pending`: the asset exposes the required trusted anatomy, but the corresponding shared runtime lane is intentionally not executable yet (for example arbitrary child articulation or skeletal control).
- `requires_asset_authoring`: the requested behavior depends on missing structural/semantic asset anatomy such as rolling metadata, joints, semantic subparts, or semantic rig mappings.
- `fallback_only`: the current asset lacks literal evidence; an existing coarse/root or diagrammatic fallback may still exist, but asset-specific execution is not qualified.

## Protected boundaries

Phase 1B.5B does not:

- change the 183 Director capability vocabulary or support classifications;
- modify qualified camera behavior;
- replace the Universal Motion Program;
- animate arbitrary GLB child nodes;
- infer semantic parts from node names;
- auto-rig or segment meshes;
- implement pairwise connector compatibility;
- move collision/fit authority out of Asset Scene Builder;
- promote fluid/smoke/granular simulation.

The new `/sandbox/probe-lab/directable-assets` lab is diagnostic. It compiles real Asset Library records and shows exactly what is known, what is only suggested, and why each generic operator resolves or fails.
