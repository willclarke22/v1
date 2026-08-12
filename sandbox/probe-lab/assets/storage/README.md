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

## Phase 1 local-growth guardrails

Asset processing workspaces now live outside the repository under the operating
system temporary directory:

```text
%TEMP%\myway-assets\
```

Set `MYWAY_ASSET_TEMP_ROOT` only when a different **outside-the-repository**
scratch location is desired. A value inside the MyWay project is rejected.

Temporary workspaces are removed after successful or failed processing. Old
workspaces left by a terminated process are eligible for removal the next time a
workspace is created. `MYWAY_ASSET_TEMP_MAX_AGE_HOURS` controls that stale
workspace threshold and defaults to `24`.

Blender terminal job JSON is bounded independently from ambientCG download jobs:

- `MYWAY_BLENDER_JOB_HISTORY_LIMIT=25`
  - Keeps the newest 25 completed and newest 25 failed Blender job records.
  - Set to `0` to keep no terminal Blender job history.
- `MYWAY_KEEP_BLENDER_JOB_HISTORY=true`
  - Disables terminal Blender-job pruning for explicit debugging sessions.

Phase 1 does **not** delete pre-existing `.blenderkit-download`,
`assets/enrichment/cache`, local model, source, thumbnail, analysis, embedding,
licence, or source-record files. Existing-data verification and cleanup remain a
separate migration step so no authoritative asset is removed without a checked
replacement.

## Phase 2 durable cloud authority

With the complete R2 environment configured, durable asset artifacts are now
cloud-owned rather than repository-owned.

Public runtime objects are written to the runtime bucket:

- approved normalized model GLBs;
- approved thumbnails;
- appearance-analysis renders;
- saved Blender Foundry candidate GLBs, previews, validation/quality reports,
  manifests, and inspection images.

Private durable objects are written to the source bucket:

- original/manual/TRELLIS source archives when available;
- licence review JSON;
- provenance/source-record JSON;
- appearance embedding vectors;
- saved Blender Foundry source code and `.blend` source artifacts;
- the existing registry/catalog metadata snapshots.

Compatibility references such as
`sandbox/probe-lab/assets/embeddings/<asset_id>.json` remain valid logical keys in
registry records, but when cloud mode is enabled their authoritative bytes are
stored at `metadata/myway/assets/...` in the private source bucket. Local copies
are written only when `MYWAY_KEEP_LOCAL_ASSET_MIRROR=true`.

New manual and TRELLIS imports archive their raw source to private R2 after
normalization and remove the raw local inbox copy only after R2 verification.
Pending normalized GLBs and thumbnails intentionally remain local until licence,
identity, and scene review are complete; this avoids publishing an unapproved
candidate merely to make its preview remotely reachable. Approval/finalization
then uploads and verifies the runtime GLB, thumbnail, analysis images, private
source, licence/provenance records, and embedding before clearing the verified
local working copies.

Saved Blender Foundry candidates use R2 as durable candidate storage when cloud
mode is enabled. The original active execution workspace is not swept by Phase 2
because the current lab can still be displaying that run. Phase 3 will handle
verified historical workspace cleanup and retention separately.

Phase 2 changes future durable ownership only. Installing it does not recursively
delete historical models, thumbnails, inboxes, old analysis images, embeddings,
`.blenderkit-download`, enrichment caches, or Foundry job/output directories.

## Phase 3 historical cleanup

Phase 3 is an explicit audit-and-cleanup tool for asset files that predate the
Phase 1 temporary-workspace guardrails and the Phase 2 durable R2 ownership
model. Installing Phase 3 does **not** delete anything.

Run the dry audit first:

```powershell
pnpm exec tsx scripts/sandbox/asset-historical-cleanup-phase3.ts
```

The audit writes JSON and Markdown reports outside the repository under
`Documents/MyWayCleanupReports` by default. Set `MYWAY_CLEANUP_REPORT_DIR` to a
different outside-the-project location if desired.

Each historical item is classified as:

- `safe_to_remove` — every required R2 object or transient-history condition was
  independently verified and the item is not Git-tracked;
- `keep` — the local file is still authoritative or is intentionally retained by
  policy;
- `needs_review` — R2, identity, Git tracking, active-job state, or Foundry
  durability could not be proven strongly enough for automatic deletion.

The audit covers the legacy project-local BlenderKit download workspace, old
enrichment hydration GLBs, R2-backed local model/thumbnail/source copies, old
analysis renders, per-asset embedding/licence/source-record mirrors, terminal
Blender jobs beyond the configured retention limit, and saved Foundry
candidate/job workspaces. Git-tracked files are never automatically deleted.
Pending/local-only assets are never treated as cloud duplicates.

Only after reviewing the dry-run report, apply the verified-safe cleanup with:

```powershell
pnpm exec tsx scripts/sandbox/asset-historical-cleanup-phase3.ts --apply --confirm=DELETE_VERIFIED_LOCAL_ASSET_DUPLICATES
```

Apply mode performs a **fresh** audit immediately before deletion. It removes
only items classified `safe_to_remove` by that fresh audit, restricts deletion
to explicit generated-asset roots, cleans empty generated child directories,
and writes a second before/after report outside the repository. Missing or
unverifiable R2 objects remain on disk.

## Phase 3 follow-up: verified cloud-gap repair

After historical cleanup, some legacy local artifacts can remain protected when a
registry record says `r2` but the recorded object no longer passes an R2 HEAD
check. The Phase 3 follow-up repair utility is intentionally non-destructive:

- it can republish a missing runtime model from the preserved local normalized
  GLB/GLTF and repair the registry object key/public URL;
- it can republish missing thumbnails and standardized appearance-analysis
  renders and repair their runtime references;
- it can restore missing private durable metadata objects from existing local
  JSON mirrors;
- it can archive a still-local source to the private source bucket when the
  recorded source object is absent;
- it never removes a local file. Historical local deletion remains exclusively
  controlled by the Phase 3 cleanup audit after independent R2 verification.

Run the repair CLI with Node's `--env-file=.env.local` flag so the standalone
process receives the same R2 environment as the Next.js app. The CLI defaults to
dry-run mode and requires the explicit confirmation token
`REPAIR_MISSING_R2_ASSET_OBJECTS` for apply mode.

## Step 3 durable workflow state

Persistent sandbox workflow JSON follows the same cloud-authority rule as
durable Asset Library metadata.

Private source-bucket objects now include:

- `metadata/myway/workflows/missing-asset-queue-v1.json`
- `metadata/myway/scenes/manifests/<scene_id>.json`

With R2 configured, normal queue and scene reads/writes never restore or mirror
these records from the laptop. Local queue/scene JSON is accepted only by the
explicit verified Step 3 migration. The migration refuses to overwrite a
different existing R2 document and removes local source JSON only after a
direct source-bucket read confirms equivalent data.

Asset-ID rename and identity-repair operations also rewrite references inside
the private queue and saved-scene documents, with rollback if the enclosing
asset mutation fails.

The cloud-authority audit treats the queue and existing private scene manifests
as managed expected R2 objects so they do not inflate the unreferenced-object
review set.

## Step 4 Foundry ambientCG hydration lifecycle

Blender Foundry hydration now follows a strict temporary-file lease model:

1. a unique per-execution cache scope is created under the operating-system
   temporary directory;
2. selected ambientCG material maps and HDRIs are read from runtime R2 into
   that scope;
3. Blender consumes those paths for compile/execution/render/export;
4. the Foundry runner removes the complete scope in `finally`;
5. abandoned scopes from terminated processes are eligible for stale cleanup
   after 24 hours by default.

`MYWAY_AMBIENTCG_HYDRATION_MAX_AGE_HOURS` controls the abandoned-scope
threshold.

Hydration scopes are execution scratch only. They are not durable metadata,
runtime assets, source archives, or a local mirror of R2.
