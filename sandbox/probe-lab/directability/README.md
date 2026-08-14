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
