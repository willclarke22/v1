
# MyWay Shared Scene Runtime

The shared scene runtime is downstream of the Educational Scene Director.

It owns asset binding, geometry, spatial constraints, and safe placement. It
must not reinterpret or weaken the educational sequence.

## Inputs

- canonical `director_plan` with stable entity ids;
- validated `resource_plan` derived from the Director;
- Primitive Builder layout proxies and asset requirements;
- reviewed GLB bindings;
- logical size decisions;
- measured geometry profiles.

## Outputs

- resource-plan validation and future `resolved_resources`;
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
director and resource contracts so actor, material, or environment upgrades do
not require re-directing the lesson.

## Durable saved-scene storage

With R2 metadata mode enabled, each saved scene manifest is authoritative in the
private source bucket under:

`metadata/myway/scenes/manifests/<scene_id>.json`

Saving, loading, listing, refreshing, and asset-ID reference maintenance use
those private objects directly. Normal cloud mode never falls back to the
repository-local `sandbox/probe-lab/scenes/manifests` directory.

The local manifest directory remains a compatibility path only when R2 metadata
storage is genuinely disabled, and as an explicit one-time migration source for
pre-Step-3 saved scenes.

## Asset-aware motion interactions

`asset-aware-interaction-motion.ts` extends the same spatial invariant into moving
rigid interactions without replacing `ui/constraint-layout.ts`.

The layout solver still owns initial support/containment/attachment/adjacency
placement. The interaction solver consumes already-resolved actor poses plus the
same geometry-profile evidence when a Director/cinematic motion intentionally
brings two actors together.

It provides:

- generic exterior contact candidates from measured attachment regions;
- conservative normalized-bounds contact faces when measured regions are absent;
- full-visible-hull separation at the intended contact normal;
- collision-box-aware swept approach/retreat checks against third actors;
- deterministic candidate ranking where physical validity outranks a preferred
  but blocked contact face;
- target-relative contact maintenance for rigid touch/push/nudge motion;
- directional surface-to-surface clearance for behind/beside negative space.

The output is a candidate motion transform/path. It does not activate parenting,
containment membership, adhesive attachment, skeletal grasping, or physics.
Blocked contact fails closed rather than intersecting a third actor.
