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

## Manual CC0 and CC BY GLB batch import

The Asset Library now separates manually downloaded model intake by licence:

- **Import CC0 GLB** accepts up to 50 GLBs per batch, fixes the recorded licence
  to `cc0`, derives a starting concept from each filename, and submits selected
  rows sequentially to the existing manual-import route.
- **Import CC BY GLB** accepts up to 50 GLBs per batch and records the source
  title, creator, source provider, source page, stable source ID, selected CC BY
  variant, generated credit, and modification notice for each asset.

Both tabs send one multipart request at a time to
`POST /api/sandbox/probe-lab/assets/import-local`. The importer validates the GLB
2.0 binary, preserves the original source, runs headless Blender normalization,
generates Spatial Geometry Profile v3, writes source and manual-license review
records, registers the asset with pending semantic and scene review, and queues
appearance and embedding analysis. Completed assets appear in **Needs review**;
manual import never means automatic scene or app approval.

The 50-file cap is intentionally conservative. Browser file handles remain
lightweight, but every item can trigger a separate upload, Blender process,
thumbnail render, geometry audit, and enrichment job. Very large GLBs should be
split into smaller batches even though the existing per-file limit remains
400 MB.

### CC0 bundle ZIP intake

The **Import CC0 GLB** panel also accepts a `.zip` containing up to 50 standalone
GLB 2.0 members. This is an intake convenience, not a new runtime format:

1. The browser reads the ZIP central directory without writing archive paths to disk.
2. Unsafe paths, encryption, ZIP64, unsupported compression methods, excessive
   expanded size, CRC mismatches, and non-GLB model members are rejected before
   import.
3. Stored and deflated `.glb` members are unpacked in memory and validated for the
   GLB 2.0 header. Non-GLB files such as READMEs are ignored and reported.
4. Bundle-level title, creator, provider, source page, stable bundle ID, and tags
   are snapshotted onto each generated review row. The full ZIP member path is
   preserved in provenance and contributes to a deterministic member source ID,
   so similarly named variants do not collapse into one source identity.
5. Each generated `File` is then submitted sequentially to the unchanged
   `/api/sandbox/probe-lab/assets/import-local` route. Blender normalization,
   geometry profiling, enrichment, duplicate detection, licence review, and scene
   review therefore behave exactly like individual CC0 GLB imports.

The bundle intake intentionally supports **standalone GLBs only**. A ZIP containing
`.gltf` files with external `.bin` or texture dependencies should be converted to
GLB first rather than introducing a second downstream asset format.

## CC BY sources and the Poly Pizza toggle

The **Import CC BY GLB** tab supports Poly Pizza and other CC BY sources. The
**Poly Pizza source** toggle controls the source-specific behaviour:

- when enabled, MyWay parses filenames such as
  `Mouse by jeremy - 6DOjEGKd8nx.glb`, fixes the provider to Poly Pizza, derives
  `https://poly.pizza/m/6DOjEGKd8nx`, generates the credit, and uses the
  deterministic technical ID `mouse_polyp_6dojegkd8nx`;
- when disabled, the user records the actual source provider, source page,
  source title, creator, and stable source asset ID. Generic CC BY imports use
  the normal manual asset-ID path and never receive the `_polyp_` suffix.

Generic `cc_by` remains distinct from `cc_by_4_0`. Both variants require
structured source and attribution metadata plus a modification notice. MyWay
generates the displayed credit from the recorded title, creator, licence, and
provider rather than asking for a separate attribution text field.

Attribution-required assets remain blocked from public promotion until a formal
licence review confirms complete attribution. Scene and runtime bindings expose
a deduplicated `third_party_assets` collection. The attribution endpoint can
export selected records as JSON or `THIRD_PARTY_LICENSES.txt`:

`GET /api/sandbox/probe-lab/assets/attributions?asset_ids=<comma-separated ids>`

`GET /api/sandbox/probe-lab/assets/attributions?format=text&asset_ids=<ids>`

Existing local, unpromoted manual assets can be corrected with **Edit licence
and source** without re-running Blender normalization. The edit resets formal
licence and scene approval while preserving the normalized GLB, thumbnail,
geometry profile, and enrichment artifacts.


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

## Reviewed HDRI runtime eligibility

Phase 2G consumes the existing ambientCG HDRI registry without introducing a
second environment registry. A runtime HDRI must be CC0, content-hashed,
published to R2, identify its R2 object key, and expose an HTTPS `.hdr` or `.exr`
URL. Runtime selection is deterministic and never triggers download/acquisition.
The Resource Runtime uses an exact-registry-URL proxy so browser CORS settings do
not broaden the trusted resource boundary.
