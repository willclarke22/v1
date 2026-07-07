# Visual Experience Sandbox

This folder is the clean sandbox lane for asset-aware generated learning scenes.

The proof of concept already showed that a Blender/BlenderKit `.glb` can be exported, placed under `public/`, and displayed in MyWay with React Three Fiber. This folder organizes that into a path that can later be promoted into the main app.

## Current boundary

- `schema.ts` defines the compact contracts.
- `assets.ts` loads and filters the visual asset registry.
- `compiler.ts` builds the future model input and returns a scaffold output for now.
- `validate.ts` checks output references against registered assets and renderer capabilities.
- `adapters.ts` converts visual-experience output into current MyWay-facing shapes.
- `ui/` contains the visual-experience workbench and GLB player.
- `routes/` contains the sandbox API route implementations.
- `assets/registry.json` is the source of truth for which assets the model may reference.

## Asset rule

Browser-loadable assets do **not** live in this sandbox folder. They live under the real Next.js public folder:

```txt
public/sandbox-assets/visual-experience/models/<domain>/<asset_id>.glb
```

The sandbox folder stores metadata and organization:

```txt
sandbox/probe-lab/visual-experience/assets/registry.json
sandbox/probe-lab/visual-experience/assets/licenses/
sandbox/probe-lab/visual-experience/assets/source/blender/
sandbox/probe-lab/visual-experience/assets/generated/
```

## Promotion path

When this works, promote the feature like this:

```txt
sandbox/probe-lab/visual-experience/schema.ts      -> lib/visual-experience/schema.ts
sandbox/probe-lab/visual-experience/assets.ts      -> lib/visual-experience/assets.ts
sandbox/probe-lab/visual-experience/compiler.ts    -> lib/visual-experience/compiler.ts
sandbox/probe-lab/visual-experience/validate.ts    -> lib/visual-experience/validate.ts
sandbox/probe-lab/visual-experience/adapters.ts    -> lib/visual-experience/adapters.ts
sandbox/probe-lab/visual-experience/ui/*           -> ui/learning-space/probes/visual-experience/*
public/sandbox-assets/visual-experience/*          -> public/myway-assets/visual-experience/* or external asset storage
```

## Next after Step 3

Step 4 is the model/compiler request-debug lane:

1. Build a real `VisualExperienceCompilerInput` from learner message + diagnosis + selected assets.
2. Show the exact model prompt/request.
3. Keep the model restricted to registered `asset_id`s.
4. Let the model declare `asset_requests` when the registry is missing something useful.
