
# MyWay Shared Scene Runtime

The shared scene runtime is downstream of the Educational Scene Director.

It owns asset binding, geometry, spatial constraints, and safe placement. It
must not reinterpret or weaken the educational sequence.

## Inputs

- canonical `director_plan` with stable entity ids;
- Primitive Builder layout proxies and asset requirements;
- reviewed GLB bindings;
- logical size decisions;
- measured geometry profiles.

## Outputs

- resolved actor bindings;
- unresolved actor diagnostics;
- spatial constraints;
- collision-safe transforms;
- compatibility motion and camera tracks;
- serializable scene manifests that preserve `director_plan`.

## Spatial invariant

Two solid assets may not intersect unless the request explicitly permits
insertion, embedding, or another physical penetration. Invalid placement is
returned as unresolved and omitted from the literal asset layer; the director
event and stable actor id remain intact.

## Generic relation handling

- `on_surface`: compatible support region, footprint, clearance, collisions.
- `inside`: measured containment region and fit.
- `beside`: exterior placement with ground contact by default.
- `attached_to`: compatible attachment region and fit.
- `on_ground` and `absolute`: nearby collision-free root positions.

Saved scenes hydrate reusable assets from the current registry and preserve the
director contract so actor upgrades do not require re-directing the lesson.
