# MyWay Cloudflare R2 asset storage

The Asset Library uses the existing two-bucket R2 setup as its durable source
of truth.

## Buckets

- Runtime bucket: public browser-ready GLBs, thumbnails, material maps, HDRIs,
  manifests, and standardized previews.
- Source bucket: private registries, ambientCG catalog metadata, job state,
  license reviews, source records, and optional source archives.

## Existing environment variables

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_RUNTIME_BUCKET_NAME`
- `R2_SOURCE_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`

When all variables are configured, cloud mode is selected automatically.

## Optional environment variables

- `MYWAY_ASSET_METADATA_STORAGE=r2|local`
  - Overrides automatic cloud detection.
- `MYWAY_KEEP_LOCAL_ASSET_MIRROR=true|false`
  - Defaults to `false` when R2 is configured and `true` without R2.
- `MYWAY_CLOUD_METADATA_CACHE_MS=30000`
  - In-memory metadata cache duration for each server process.
- `MYWAY_KEEP_ASSET_JOB_FILES=true`
  - Retains temporary ambientCG job folders for debugging. The default removes
    them after each job.
- `MYWAY_AMBIENTCG_MAX_DOWNLOAD_BYTES`
  - Maximum package size accepted by the ambientCG cache worker.
- `MYWAY_AMBIENTCG_DOWNLOAD_TIMEOUT_MS`
  - Per-attempt ambientCG download timeout.

## Unified Asset Library

`/sandbox/probe-lab/asset-library` now contains:

- MyWay model assets and their rotating GLB previews.
- The complete ambientCG catalog.
- Cloud-ready materials and HDRIs.
- Download jobs.
- Cloud migration and local-compaction controls.

The old `/asset-library/ambientcg` URL is only a compatibility entry and renders
the same unified Asset Library in its resource section.

## Local storage policy

With R2 configured:

- ambientCG downloads and extraction occur under the operating-system temporary
  directory;
- normalized files are uploaded to R2;
- temporary jobs are removed after completion;
- Blender can hydrate only the selected material or HDRI into a temporary cache;
- the model and ambientCG registries are read from and written to private R2
  metadata objects.

The Asset Library's Cloud storage tab can migrate current local models in
verified batches. Local model and thumbnail deletion is optional and occurs only
after R2 HEAD verification.

The local-compaction action verifies every required private metadata object
before replacing large local JSON files with tiny bootstrap records.
