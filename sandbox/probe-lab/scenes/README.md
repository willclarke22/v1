# MyWay Shared Scene Runtime

The scene runtime is shared by Primitive Builder and Visual Experience.

- `resolved-scene.ts` defines serializable GLB bindings and spatial intent.
- `resolve-scene-assets.server.ts` resolves requirements against approved assets.
- `primitive-geometry-constraints.ts` preserves explicit spatial language and
  infers missing relationships from invisible layout proxies.
- `ui/resolved-asset-model.tsx` loads GLBs, measures their final world size, and
  transforms stored spatial regions into scene coordinates.
- `ui/constraint-layout.ts` selects compatible regions, checks fit and clearance,
  finds collision-free positions, and rejects unresolved intersections.

## General spatial invariant

Two solid assets may not intersect unless the request explicitly permits an
intersection, insertion, embedding, or another physical penetration. An invalid
placement is returned as unresolved and is omitted after runtime measurements are
ready; the solver does not silently shrink or bury the asset.

## Generic relation handling

- `on_surface`: selects a compatible support region and validates usable footprint,
  clearance above, and collisions with every other placed asset.
- `inside`: requires a measured containment region large enough for the child.
- `beside`: places the child outside the target bounds and keeps ground contact by
  default.
- `attached_to`: selects a compatible exterior attachment region and validates fit.
- `on_ground` and `absolute`: search nearby collision-free root positions.

Spatial wording is represented with generic preferences such as exterior/interior,
upward/vertical, highest/lowest, open/enclosed, and left/right/front/back. Thus
"on top of" and "on the top shelf" remain distinct without hard-coding a
bookshelf rule.

Saved scenes reference reusable asset IDs. They are hydrated from the current
registry when loaded, so rerunning the spatial geometry backfill upgrades existing
assets without copying GLBs into scene folders.
