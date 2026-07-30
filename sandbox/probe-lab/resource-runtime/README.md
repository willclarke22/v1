# Reviewed Resource Runtime

The Resource Runtime is the controlled execution boundary between deterministic
reviewed-resource selection and renderer-specific loading.

Open:

```txt
/sandbox/probe-lab/resource-runtime
```

## Phase 2D model proof

The model section proves:

```txt
Scene model intent
→ reviewed deterministic model binding
→ validated runtime binding
→ browser GLB hydration
→ independent render instance
→ lifecycle diagnostics and disposal
```

It also verifies temporary Blender-bound model hydration without retaining a
permanent local copy.

## Phase 2F material proof

The material section proves:

```txt
Scene surface intent
→ deterministic R2 material selection
→ validated runtime material binding
→ shared texture hydration
→ PBR material application
→ primitive or GLB actor
→ cache/disposal diagnostics
```

The material resolver only considers ambientCG material-registry entries that
are CC0, content-hashed, published to authoritative R2 storage, and backed by an
HTTPS base-colour map. It never triggers acquisition.

Supported maps are base colour, OpenGL or DirectX normal, roughness, metalness,
ambient occlusion, opacity, emissive, height, and packed ORM. Base-colour and
emissive maps use sRGB. Data maps use linear/Non-Color interpretation. DirectX
normal maps invert the green-axis normal scale for Three.js.

The harness provides:

- independent primitive instances sharing cached downloads but not mutable
  material settings;
- UV repeat and roughness comparisons;
- original GLB preservation;
- whole-model material replacement;
- named material-slot or mesh replacement;
- a deliberate missing-base-colour test with a neutral declared fallback;
- map-level loading warnings rather than actor disappearance;
- texture-cache inspection and safe idle-cache clearing;
- Blender Principled BSDF map, colour-space, and channel translation;
- temporary Blender texture hydration followed by cleanup.

## Runtime guarantees

- Runtime loading never selects an unreviewed resource or starts acquisition.
- R2 bindings use HTTPS URLs.
- Stable Director entity IDs survive loading and material-map failures.
- Concurrent requests for the same immutable texture URL share one download and
  decoded template.
- Every actor receives independently mutable material and texture instances.
- Original GLB appearance is preserved unless an override is explicit.
- Missing optional maps use scalar or omitted-map fallbacks.
- Dielectric materials without a metalness map default to `metalness = 0`.
- Materials without an emissive map default to black emission at zero intensity.
- Height textures are not hydrated while displacement scale is zero.
- GLB replacement diagnostics report discovered meshes, slots, UV availability,
  applied counts, and attached map roles.
- Missing base colour uses a visible neutral fallback material.
- Browser and Blender colour-space rules come from one policy module.
- Temporary Blender files are removed after verification.

## Key files

- `resource-runtime-contract.ts` — model runtime contracts.
- `material-runtime-contract.ts` — material and texture runtime contracts.
- `reviewed-material-resolver.server.ts` — deterministic material selection.
- `material-map-policy.ts` — shared colour-space, channel, and normal policy.
- `browser-glb-runtime.ts` — shared browser model cache.
- `browser-texture-runtime.ts` — shared browser texture cache.
- `browser-material-runtime.ts` — PBR creation and GLB/primitive application.
- `hydrate-resolved-model-for-blender.server.ts` — temporary model hydration.
- `hydrate-runtime-material-for-blender.server.ts` — temporary texture hydration
  and Principled BSDF translation.
- `routes/` — list, resolve, and hydration endpoints.
- `ui/` — model and material runtime harnesses.
- `tests/verify-phase2d-runtime.ts` — model runtime fixture.
- `tests/verify-phase2f-material-runtime.ts` — deterministic material fixture.

## Deferred work

HDRI lighting and background execution belongs to Phase 2G. Manual Turn,
Primitive Builder, and Visual Experience continue using compatibility loaders
until the shared runtime is migrated into each lab deliberately.