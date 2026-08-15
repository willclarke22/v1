# Phase 1B.5C.2 — Scene-Scale + Pair-Fit Hardening

## Goal

Harden Phase 1B.5C after the exhaustive real-library audit evaluated 101 assets across 10,100 ordered pairs and five interaction lanes (50,500 resolutions). The pair resolver remained deterministic and fail-closed, but the audit showed that it was sometimes too confident about **when it knew enough** to promote a candidate.

1B.5C.2 keeps the same five generic pair lanes and the same two-Affordance-Graph architecture. It does not add an asset-pair matrix.

## Scale authority

Pair fit now distinguishes four scale authorities:

1. `scene_instance` — final/resolved actor scale from the actual scene;
2. `explicit_context` — dimensions supplied deliberately by Director/Builder/caller for the scenario;
3. `asset_baseline` — Asset Library dimensions used only as preview/reference evidence;
4. `assumed_unit` — weakest fallback when no dimensions are known.

Unqualified `source_dimensions_m` / `target_dimensions_m` default to `asset_baseline`. Explicit scale vectors default to `scene_instance` because they are expected to come from resolved scene actors.

`asset_baseline` can estimate fit and produce a preview transform, but it cannot by itself promote or permanently reject a scale-dependent Place/Insert result. Callers that genuinely know final scene dimensions must opt into `scene_instance` or `explicit_context`.

## Place hardening

Place On now requires a target support region that clears a conservative viability threshold. Marginal/weak local tangent patches do not become literal support just because a rectangular fit is mathematically possible.

The source footprint uses the measured bottom-contact region when available, instead of always projecting the whole asset X/Z bounds. This is especially important for objects whose overall bounds include handles, overhangs, or other non-contact geometry.

A Place result reaches `resolved_candidate` only when:

- source contact evidence exists;
- target support evidence is strong enough;
- the measured source contact footprint fits the target usable support region; and
- the pair is evaluated at authoritative `scene_instance` or `explicit_context` scale.

Asset Scene Builder still owns exact support polygon fit, center-of-mass stability, clearance, and collision rejection/repositioning.

## Insert aperture gate

Containment volume fit is necessary but no longer sufficient for a strong Insert result.

For the geometry-inferred open-top container lane, the measured top-opening width/depth is now preserved on the corresponding `inlet_port.opening_size` affordance. The pair resolver searches the existing deterministic right-handed source orientations and requires one orientation to fit:

- through the measured aperture; **and**
- inside the trusted containment volume.

Outcomes:

- authoritative scale + known access direction + aperture fit + volume fit → `resolved_candidate`;
- volume fit but aperture dimensions unavailable → `contextual_candidate`;
- preview/baseline scale only → `contextual_candidate`;
- authoritative scale and no orientation can pass through the aperture/volume → `fallback_only`.

The resolver still does not claim a continuous collision-free insertion path. Asset Scene Builder validates exact mesh/collision fit, path clearance through the opening, and receiver-wall interpenetration.

## Relationship activation guard

Pair resolution now returns `proposed_relationship`, not an activated `relationship`.

Every relationship plan carries:

- `activation_state: "proposed"`;
- whether it would be persistent after activation;
- whether the source would follow the target after activation;
- its inverse operation where applicable; and
- explicit activation requirements.

The pair resolver itself never activates parenting, containment membership, support state, or directed-flow state. Context/policy and Asset Scene Builder validation must succeed first.

## Surface Attach / Precise Attach / Flow

Surface Attach remains contextual because geometry can propose where surfaces meet but cannot decide material/policy intent. Baseline dimensions are preview evidence only.

Precise Attach and Flow now also require authoritative scale before their geometry-derived endpoint transforms/routes can be called resolved. Semantic connector/outlet/inlet requirements remain unchanged and fail closed.

### Authored-positive canaries

The 1B.5C.2 verifier includes **authored-positive canaries** for Precise Attach and Flow using explicit manual connector/socket/outlet/inlet evidence. These canaries prove the positive resolver branches without fabricating semantic ports on real production Asset Library records.

The production library remains conservative: real assets only gain semantic ports/outlets when those affordances are deliberately authored or otherwise verified.

## UI

The Asset Interactions tab remains inside `/sandbox/probe-lab/directable-assets?tab=interactions`.

It now labels Asset Library dimensions as `asset_baseline` preview data and provides optional Source/Target scene-dimension fields. Entering valid X/Y/Z metre dimensions sends them with `explicit_context` authority so the same page can compare baseline preview behavior with authoritative scene-fit behavior.

The UI also shows scale authority and labels relationship output as a **proposed relationship** with activation requirements.

## Protected boundaries

Phase 1B.5C.2 does not:

- add an asset-pair matrix;
- change the 183-capability Director catalog;
- change UMP ownership;
- add another WebGL Canvas;
- infer semantic connector/outlet identity from loose mesh names;
- activate scene relationships by itself;
- claim exact collision/physics/insertion-path proof;
- replace Asset Scene Builder as final fit/collision/stability authority.
