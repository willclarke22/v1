# Phase 1B.5C — Asset-to-Asset Interaction Resolution

## Goal

Move from “what can this one asset participate in?” to “given these two actual assets, what interaction can MyWay resolve from their evidence?”

The phase consumes:

```text
source Affordance Graph
+
target Affordance Graph
+
scene dimensions / scale / intent
↓
generic pair resolver
↓
evidence selection
compatibility / fit
candidate transform or route
relationship intent
Builder validation handoff
```

It deliberately does **not** store an `Asset A × Asset B` table.

## Resolution statuses

- `resolved_candidate` — pair evidence is compatible and the resolver can emit a deterministic candidate transform/route. Final Builder validation is still required where physical fit/collision matters.
- `contextual_candidate` — useful pair evidence exists, but scale, policy, orientation detail, or receiver geometry is still contextual.
- `requires_asset_authoring` — a semantic affordance such as a connector/socket/outlet/receiver is genuinely absent.
- `fallback_only` — evidence exists but is incompatible or cannot fit at authoritative scene scale.

## Generic pair lanes

### Place On

Uses source ground/contact evidence plus a target support surface.

The resolver:
1. compares the source bounds footprint against the target usable support size;
2. tries the as-authored and quarter-turn footprint variants;
3. chooses the strongest fitting support candidate;
4. aligns source-up to target support normal;
5. emits a target-scaled-local translation/quaternion candidate.

Asset Scene Builder still validates exact support polygon, center-of-mass stability, clearance, and collisions.

### Surface Attach

Uses geometry-backed `surface_contact_region` evidence on both assets.

The resolver can choose fitting contact regions and align their normals, but geometry does not prove adhesive/material policy. Therefore successful geometry remains `contextual_candidate` until caller intent/policy allows persistent attachment.

Generic surface contact never satisfies Precise Attach.

### Precise Attach

Uses only executable `attachment_port` / `socket_port` evidence.

Compatibility requires:
- a valid source/target port-kind pairing; and
- meaningful shared semantic tokens after generic words like `attachment`, `socket`, `port`, `source`, and `target` are removed.

This allows examples such as:

```text
fluid_hose / hose_connector
+
fluid_hose / hose_socket
→ compatible
```

while unrelated authored ports fail closed.

A compatible pair emits anchor alignment and persistent attachment intent. Dimensional connector tolerances remain Builder validation.

### Insert

Insertion resolves either:
- whole-source bounds into trusted `containment_volume`; or
- a compatible authored connector into a `socket_port`.

Containment insertion searches the 24 right-handed axis-aligned box orientations and chooses the strongest conservative fit. A fitting result emits a target-local transform and containment-membership intent.

Typed socket insertion remains contextual until receiver bore/depth/tolerance geometry is validated.

Raw `containment_candidate` evidence never acts as a receiver.

### Flow

Flow requires a trusted source `outlet_port` and a target `inlet_port` or executable `containment_volume`.

The resolver chooses the source/destination evidence, checks specific semantic medium/type conflicts conservatively, and emits actor-local endpoint data for a `direct_segment_candidate`.

The scene runtime still:
- transforms endpoints into current world pose;
- chooses the visual carrier/route;
- handles obstruction/visibility;
- retains existing Director quantity/process semantics.

No fluid/particle physics is implied.

## Relationship intent

Pair resolution describes relationship state without mutating it:

- Place On → `support_contact`
- Surface/Precise Attach → `persistent_attachment`, inverse `detach`
- Insert → `containment_membership`, inverse `remove`
- Flow → `directed_flow_link`

Later runtime convergence can consume these plans without teaching the asset compiler scene-state mutation.

## Scale and coordinate honesty

Pair geometry is compared in scene metres when the caller supplies `source_dimensions_m` / `target_dimensions_m`. Explicit scale vectors are the second choice. If neither is supplied, unit scale is used only as a provisional context and fit rejection stays contextual.

Candidate transforms use:

```text
coordinate_space = target_scaled_local
```

The source is not silently moved in world space by the compiler. The caller composes the candidate with the target instance transform.

## Protected boundaries

Phase 1B.5C does not change:
- the 183 Director capability catalog/support classifications;
- Universal Motion Program ownership;
- camera behavior;
- scene-state reducer semantics;
- Asset Scene Builder collision/fit authority;
- arbitrary GLB child-node articulation;
- skeletal execution;
- full physics;
- the visible Visual Experience runtime.

The pair lab adds no WebGL Canvas and deep-inspects only the two selected assets.

## Canonical Directable Assets UI

Pair resolution is surfaced as the **Asset Interactions** tab inside `/sandbox/probe-lab/directable-assets`; the deep-link is `/sandbox/probe-lab/directable-assets?tab=interactions`. The legacy `/sandbox/probe-lab/directable-interactions` route redirects to that canonical tab. No duplicate pair page is maintained.

## Phase 1B.5C.2 hardening

The exhaustive 50,500-resolution library audit showed that the generic pair architecture was sound but highlighted two confidence boundaries: Asset Library dimensions were being treated too strongly as final scene scale, and containment volume fit could be promoted before the source was shown to pass through a receiver opening.

Phase 1B.5C.2 therefore:

- distinguishes `scene_instance`, `explicit_context`, `asset_baseline`, and `assumed_unit` scale authority;
- keeps Asset Library dimensions preview-only unless a caller supplies authoritative final scene dimensions/scale;
- uses measured source contact footprint and a stronger target support viability gate for Place;
- propagates measured open-top aperture size into inferred inlet evidence and requires aperture + containment fit for strong Insert;
- renames relationship output to `proposed_relationship` with explicit activation requirements so pair resolution cannot be mistaken for already-persisted scene state; and
- keeps Asset Scene Builder as final collision, stability, path-clearance, and relationship-activation authority.

Positive Precise Attach and Flow branches remain covered by explicitly authored verifier canaries; no semantic ports/outlets are fabricated on production Asset Library records merely to make those branches pass.
