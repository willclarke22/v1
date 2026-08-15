# Phase 1B.5B.2 — Affordance Evidence Hardening

## Goal

Prevent raw geometric measurements from being promoted too directly into semantic truth before Phase 1B.5C consumes them.

The library-wide 1B.5B.1 audit demonstrated three important false-positive classes:

1. geometric interior/void regions could make unrelated objects appear literally fillable;
2. generic left/right/front/back exterior regions made every asset appear to have a precise attachment port;
3. any upward support patch could make Place/Accumulate look more executable than the scene context justified.

It also showed that a single constant-radius Roll model is too strong for tapered and irregular rotational shapes, and that a geometric GLB coordinate frame is not the same thing as semantic facing.

## Evidence promotion rules

### Containment

`geometry_profile.interior_volumes` remain valuable measurements. 1B.5B.2 compiles them as `containment_candidate` first.

A measured region is promoted to executable `containment_volume` only when:
- it is open;
- an access direction exists;
- confidence/usability clear a conservative threshold; and
- its measured volume is non-trivial relative to the asset bounds.

Explicit manual containment remains authoritative.

A second corroboration lane is allowed for current assets such as an open cup whose stored geometry profile missed an interior:
- asset metadata may suggest `container` / `vessel` / similar semantics;
- independently sampled GLB geometry must show a strong open-top rim + center void pattern;
- the two signals together may produce an `inferred` usable containment/opening affordance.

Neither signal can grant literal Fill on its own.

### Surface contact versus connector ports

Geometry-generated exterior regions are now `surface_contact_region`.

They are useful for later coarse contact/sticking/alignment, but do not mean:
- socket;
- plug;
- hitch;
- hose connector;
- attachment port.

Precise `attachment_port` / `socket_port` evidence requires explicit authoring or semantically specific measured labels such as mount/connector/socket/port/hitch.

This lets Phase 1B.5C distinguish:
- generic surface attachment; from
- typed connector attachment.

### Support viability

A support surface now carries:
- usable size;
- area;
- clearance when available;
- blocked fraction when available;
- a viability score;
- explicit contextual requirements.

Place-on is therefore `contextual_candidate` even when the target has usable support geometry. The actual source footprint, center-of-mass stability, and clearance must still be solved pairwise.

Support-only Accumulate is also contextual. Accumulate inside usable containment can remain executable on the asset side.

### Rolling profile

Strong rotational geometry is classified as:
- `spherical`;
- `cylindrical`;
- `wheel_or_ring`;
- `tapered`;
- `irregular`.

The current UMP constant-radius Roll lane can consume the first three after scene context resolves pose/support/travel.

`tapered` and `irregular` geometry is retained as inferred physical evidence but marked `approximate_only`; it must not silently receive a constant-radius literal Roll.

### Directional frame

`orientation_frame` means geometric coordinate frame.

`semantic_forward_frame` means an authored semantic facing/aim direction.

`Align` can use either. `Aim` requires semantic forward evidence. A bagel, chair, or hydrant no longer “faces” somewhere merely because its GLB has a +Z axis.

## Boundaries

Phase 1B.5B.2 does not:
- implement Phase 1B.5C source↔target compatibility;
- infer semantic node identity from node names;
- animate arbitrary GLB child nodes;
- auto-rig assets;
- add skeletal execution;
- perform fluid/smoke/granular simulation;
- replace Asset Scene Builder collision, fit, stability, or placement authority.

The output is still a renderer-neutral affordance graph used to qualify runtime operators honestly.
