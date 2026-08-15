# Phase 1B.5B.1 — Geometry-Derived + Contextual Affordance Inference

## Goal

Strengthen the Phase 1B.5B compile-once affordance graph without returning to an asset × capability matrix.

Some affordances are not purely static metadata. A bagel, wheel, can, barrel, or sphere may support rolling because of actual shape, pose, support, and requested travel direction. Phase 1B.5B.1 therefore separates:

1. intrinsic/structural evidence on the asset;
2. conservative geometry-derived affordance candidates;
3. scene-context requirements;
4. current runtime execution support.

## Evidence levels

Affordance evidence is surfaced as `verified`, `measured`, `inferred`, `suggested`, `unknown`, or `contradicted`. Free-form asset labels remain suggestions only.

`inferred` is intentionally weaker than measured geometry/directability metadata. It may resolve an intrinsic requirement while still producing a `contextual_candidate` operator status.

## Rolling inference

The selected GLB is loaded through `GLTFLoader` and sampled without creating another Canvas. Mesh vertices plus deterministic triangle edge/centroid samples are transformed into the GLB scene frame. For local X/Y/Z candidate axes the inspector measures:

- projected angular coverage;
- radial boundary circularity;
- projected span ratio;
- axial span ratio;
- an aggregate geometry score and confidence.

The compiler accepts only conservative high-scoring candidates. It estimates effective rolling radius relative to the already-normalized asset bounds. Explicit `directability_overrides.rolling` remains authoritative and always outranks inferred shape.

A geometry-derived roll never becomes plain `executable_as_is`. It remains a `contextual_candidate` until the scene provides a compatible support plane, a travel direction perpendicular to the axis, and any required reorientation.

## What geometry inference does not do

It does not infer semantic mesh identity from node names. It does not declare a door, socket, mouth, fuel inlet, wheel semantic role, bone identity, or material meaning. It does not add physics, collision, fitting, arbitrary child-node execution, or skeletal control.

## Library scaling

The `/sandbox/probe-lab/directable-assets` page computes a cheap library-wide audit from existing stored evidence. It does not load every GLB to perform deep topology inference. Actual surface-shape analysis remains on-demand for the selected asset, preserving the single-viewer/performance architecture.

## Protected boundaries

Phase 1B.5B.1 does not change:

- the 183 Director capability registry or support classifications;
- Universal Motion Program ownership;
- scene-state behavior;
- camera or lighting qualifications;
- Asset Scene Builder collision/fit authority;
- the Phase 1B.5A runtime;
- the no-arbitrary-subpart and no-full-physics boundaries.

Phase 1B.5C remains the intended place for source↔target compatibility resolution.
