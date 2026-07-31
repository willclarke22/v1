
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

## Phase 2G environment and lighting proof

The environment section proves:

```txt
Scene lighting intent
→ deterministic reviewed HDRI selection
→ allowlisted same-origin hydration
→ HDR or EXR decoding
→ renderer-local PMREM processing
→ PBR environment lighting
→ independent visible background policy
→ deterministic light-rig fallback
→ Blender World translation and cleanup
```

Only CC0 ambientCG HDRIs that are content-hashed, R2-published, and backed by an
HTTPS `.hdr` or `.exr` object are eligible. Runtime resolution never starts
acquisition. An empty or ineligible registry produces an explicit studio,
diagrammatic, dramatic, or outdoor-daylight fallback binding.

Browser ownership is split deliberately:

- immutable source bytes are deduplicated in the shared download cache;
- decoded source textures and PMREM render targets are owned per WebGL renderer;
- active references prevent disposal;
- idle renderer entries and source downloads can be cleared from the harness;
- a failed or unsupported environment leaves the model visible under a declared
  fallback rig rather than producing a black scene.

The canonical renderer policy is ACES Filmic tone mapping, sRGB output, binding-
controlled exposure, binding-controlled environment/background intensity, and a
versioned shadow budget. HDRI lighting may be used with an environment
background, a solid MyWay background, no background, or transparent composition.

Blender hydration maps the same binding to Environment Texture, Texture
Coordinate, Mapping, Background, and World Output nodes, uses AgX, records
horizontal rotation and strength, and removes the temporary HDR/EXR afterward.

## Browser HDRI safety budget

Reviewed 8K and 16K HDR/EXR sources remain valid R2 and Blender resources, but the
browser runtime never uploads those full decoded textures directly to WebGL. The
source is decoded, then reduced before DataTexture creation and PMREM processing to
the largest renderer-safe size that fits both the WebGL texture limit and a 96 MiB
decoded-pixel budget. WebGL2 is capped at 4096 pixels wide and WebGL1 at 2048 pixels
wide. Half-float 8K environments normally become 4K in the browser; float 8K
environments normally become 2K. Blender hydration continues using the original
reviewed 8K file. Runtime diagnostics report source size, browser size, estimated
bytes, and whether a safety downsample occurred.

## Phase 2H shared scene composition proof

Phase 2H combines the completed model, material, and environment runtimes behind
one versioned `RuntimeSceneBindingV1`. The binding preserves Director entity ids,
contains explicit entity-targeted material assignments, carries one renderer and
environment policy, and declares fallbacks without asking the runtime to invent
lesson geometry or reinterpret educational direction.

The browser scene coordinator executes one ordered lifecycle:

```txt
renderer policy
→ reviewed environment hydration
→ parallel reviewed model hydration
→ entity-targeted material application
→ stable actor placement
→ ready or degraded scene state
→ reverse-order release and cache-reference cleanup
```

The Resource Runtime harness proves two independently owned actors, shared
immutable downloads, independently mutable material instances, one shared HDRI,
actor-failure isolation, environment fallback, aggregate timings, total bytes,
and composition diagnostics. Compatibility adapters are exported for Primitive
Builder, Visual Experience, and Manual Turn; those lanes remain unmigrated until
Phase 2I deliberately replaces their compatibility renderers.
