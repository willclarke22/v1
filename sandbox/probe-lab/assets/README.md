 MyWay Asset Runtime

The Asset Library stores reusable GLB assets, verified semantic identity,
geometry profiles, review status, licensing, and local or Cloudflare R2 paths.

Asset resolution returns either a reviewed library asset or an unresolved
requirement. Unresolved requirements are handed to the separate demand-driven
acquisition queue.

Primitive asset fallbacks are disabled. Missing physical objects remain absent
until a real asset is available.

## Demand-driven acquisition

Primitive Builder now creates one persistent acquisition job per normalized
missing concept. Multiple scenes share the same job. BlendKit runs first and
TRELLIS is the automatic fallback. Candidates remain scene-review pending in
the existing Asset Library.

The Asset Library is also the review queue:

- **Needs review** shows pending candidates.
- **Acquiring** shows active or failed missing-concept jobs.
- **Approve & publish** combines Cloudflare promotion and scene approval when
  the license record permits public promotion.
- **Try another BlenderKit asset** rejects the current candidate, excludes its
  source ID, and continues the same concept job.
- **Generate with TRELLIS instead** rejects the current candidate and starts a
  TRELLIS candidate for the same concept.

TRELLIS assets remain local-only unless their license record is separately
cleared for public promotion.

## Manual BlendKit candidate picker

The Asset Library manual import form searches BlendKit before downloading.
It returns a selectable set of downloadable CC0 model candidates with the
available preview, creator, file-size, polygon, validation, and match metadata.

Selecting a candidate pins its stable BlendKit source asset ID into the
headless Blender acquisition job. The job must download that exact candidate;
it may not silently replace the user's selection with another search result.
The selected model then follows the existing normalization, spatial geometry,
registration, appearance analysis, embedding, identity review, and scene-review
pipeline.

Automatic missing-asset resolution is unchanged and continues to choose its
own candidate or fall back to TRELLIS.

## Manual TRELLIS creation

The Asset Library manual acquisition panel supports two independent paths:

- **Search BlendKit** lists selectable CC0 catalogue candidates and imports the exact selected stable source asset ID.
- **Create with TRELLIS** generates a new GLB from an object identity plus optional compact generation details, semantic tags, seed, texture choice, and retry count.

Manual TRELLIS creation does not alter Primitive Builder's automatic missing-asset flow. A successful manual generation follows the normal reusable-asset pipeline:

1. TRELLIS generates the raw GLB.
2. Blender normalizes orientation and working extent.
3. Spatial Geometry Profile v3 is generated.
4. The asset is registered as pending identity and scene review.
5. Four-view appearance analysis and the identity-aware embedding are queued.
6. The user reviews and approves the asset before it becomes scene eligible.

TRELLIS produces a generated candidate rather than a catalogue preview, so identity, geometry, appearance, and licensing status must still be reviewed before production promotion.

## Manual local GLB import

The Asset Library manual acquisition panel also supports **Import local GLB**.
The browser sends the selected `.glb` file plus identity and provenance fields to
`POST /api/sandbox/probe-lab/assets/import-local` as multipart form data.

The importer:

1. validates the GLB 2.0 binary header, declared length, and JSON chunk;
2. preserves the original source file in `assets/inbox/manual`;
3. normalizes the runtime copy and thumbnail through headless Blender;
4. generates Spatial Geometry Profile v3 during normalization;
5. writes source and manual-license review records;
6. registers the asset as `source_type: manual` with pending semantic and scene review;
7. queues appearance analysis and the identity-aware embedding.

Manual imports are sandbox-usable but never app-promotable on ingestion. The
uploader's license selection is recorded as an assertion, not treated as an
independent legal verification.

## Manual GLM 5.2 procedural builder

The Asset Library manual acquisition panel includes **Build with GLM 5.2**.
GLM is used as a planner, not as an executable-code generator. It returns a
bounded `myway_glm_procedural_asset_v1` JSON plan containing approved box,
cylinder, and sphere parts, transforms, and PBR material values. MyWay validates
that plan, compiles it deterministically into GLB 2.0, then sends the result
through the existing manual-import pipeline for Blender normalization, Spatial
Geometry Profile v3, duplicate detection, appearance analysis, embedding, and
review.

This route is best suited to geometric, mechanical, furniture, toy-like,
symbolic, and educational assets. Organic or photorealistic requests are
allowed only as stylized approximations and remain pending review. The route
uses `NVIDIA_API_KEY` and defaults to `z-ai/glm-5.2`; override with
`MYWAY_GLM_ASSET_MODEL` when needed.

## Director late-binding rule

Assets are actors, not lesson plans. The canonical Educational Scene Director
stores stable entity ids, semantic roles, capability needs, anchor needs,
movement, camera cues, and timed text independently of any GLB.

A reviewed asset may bind to a director entity only when it satisfies identity,
scene approval, file, geometry, and appearance requirements. If it is missing,
the director plan remains complete and the renderer may use an approved
diagrammatic fallback. Adding or replacing an asset must not regenerate the
educational direction.

## The 3 Phase Plan — Phase 1: ambientCG catalog and cache

The Asset Library now links to `/sandbox/probe-lab/asset-library/ambientcg`.
Phase 1 keeps the complete ambientCG API v3 metadata catalog separate from
locally usable files:

- `assets/catalog/ambientcg/catalog.json` mirrors remote metadata.
- `assets/library/materials/registry.json` contains cached normalized materials.
- `assets/library/hdri/registry.json` contains cached normalized HDRIs.
- `assets/downloads/ambientcg/jobs.json` records download and normalization jobs.
- source archives and extraction intermediates stay under `assets/jobs/ambientcg`.
- browser-facing normalized files live under
  `public/sandbox-assets/myway/materials/ambientcg` and
  `public/sandbox-assets/myway/hdri/ambientcg`.

The catalog sync is resumable and processes one API page per server request.
The browser loops over pages, so a partial failure preserves the last completed
checkpoint. Catalog records remain marked `cataloged` until a material or HDRI
variant is downloaded and normalized. Phase 1 supports caching materials and
HDRIs; other ambientCG types are cataloged for future phases.

The default intended runtime variants are 1K JPG materials and 1K HDR files,
but the UI exposes every download variant mirrored from the API record. Set
`MYWAY_AMBIENTCG_MAX_DOWNLOAD_BYTES` or
`MYWAY_AMBIENTCG_DOWNLOAD_TIMEOUT_MS` to override the local sandbox safety
limits.

## Phase 2C implemented resolver boundary

The canonical scene-runtime resolver is
`reviewed-asset-resolver.server.ts`.

It is pure with respect to asset selection:

- no BlendKit, TRELLIS, or missing-asset worker calls;
- no `reuse_count` mutation or registry save;
- deterministic registry and request hashes;
- stable asset-id tie breaking;
- explicit eligibility rejection reasons;
- scene approval, semantic verification, licence eligibility, runtime file
  availability, and cloud readiness required by default;
- provider-backed appearance-vector reranking disabled for normal runtime use.

`asset-resolver.server.ts` is now a compatibility facade for explicit manual
tools. Acquisition requires `acquisition_policy: "queue_only"` or
`"sandbox_synchronous"`. New scene-runtime code calls
`resolveReviewedAsset()` directly with acquisition policy `never`.

## Phase 2F runtime materials

The ambientCG material registry is now consumed by the shared Resource Runtime.
Runtime eligibility requires CC0 metadata, a content hash, authoritative R2
publication, and HTTPS map URLs. Runtime resolution is pure and never invokes
ambientCG downloading or replacement. Acquisition remains an explicit Asset
Library operation.
