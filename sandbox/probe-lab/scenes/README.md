# MyWay Shared Scene Runtime

The scene runtime is shared by Primitive Builder and Visual Experience.

- `resolved-scene.ts` defines serializable GLB bindings and layout-proxy metadata.
- `resolve-scene-assets.server.ts` resolves asset requirements against scene-approved library assets and handles explicit TRELLIS previews.
- `primitive-geometry-constraints.ts` compiles invisible layout proxies into support and placement constraints.
- `ui/resolved-asset-model.tsx` loads local or R2 GLBs, fits them to target extent, applies asset defaults, grounding, shadows, and common scene motion.
- `ui/constraint-layout.ts` places measured assets and resolves shared-surface packing.
- Primitive Builder renders assets only; missing physical objects remain absent.
- Saved scenes reference reusable asset IDs. GLB files are never copied into scene folders.
- Saved scenes are hydrated from the current registry when loaded, so promoted or relocated asset URLs stay current.
