# MyWay Shared Scene Runtime

The scene runtime is shared by Primitive Builder and Visual Experience.

- `resolved-scene.ts` defines serializable GLB bindings.
- `resolve-scene-assets.server.ts` resolves Primitive Builder requirements
  against scene-approved library assets and handles explicit TRELLIS previews.
- `ui/resolved-asset-model.tsx` loads local or R2 GLBs, fits them to target
  extent, applies asset defaults, grounding, shadows, and common scene motion.
- Scene manifests reference reusable asset IDs; GLB files are never copied into
  scene folders.
- Saved scenes are hydrated from the current registry when loaded, so promoted
  or relocated asset URLs stay current.
