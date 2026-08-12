import {
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";

import {
  listMyWayAssets,
  loadMyWayAssetRegistry,
  restoreMyWayAssetRegistryToCloudFromLocal,
  updateMyWayAsset,
} from "./asset-library.server";
import {
  promoteMyWayAssetToR2,
} from "./asset-promotion.server";
import type {
  MyWayAssetRecord,
} from "./asset-types";
import {
  MYWAY_ASSET_LIBRARY_PROJECT_PATH,
  MYWAY_ASSET_REGISTRY_PROJECT_PATH,
  projectPath,
  publicUrlToProjectPath,
} from "./paths.server";
import {
  bootstrapAmbientCgCloudMetadata,
  AMBIENTCG_CATALOG_FILE,
  AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE,
  AMBIENTCG_HDRI_REGISTRY_FILE,
  AMBIENTCG_MATERIAL_REGISTRY_FILE,
  AMBIENTCG_RESOURCE_REGISTRY_FILE,
  AMBIENTCG_PUBLIC_HDRI_ROOT,
  AMBIENTCG_PUBLIC_MATERIAL_ROOT,
  AMBIENTCG_PUBLIC_RESOURCE_ROOT,
  AMBIENTCG_SYNC_STATE_FILE,
} from "./catalog/ambientcg/ambientcg-store.server";
import {
  cloudAssetMetadataEnabled,
  readCloudJson,
  writeCloudJson,
} from "./storage/cloud-json.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "./storage/r2-asset-storage.server";
import {
  readDurableAssetJson,
  recoverDurableAssetJsonFromLocal,
} from "./storage/asset-durable-artifacts.server";
import {
  writeJsonFileAtomic,
} from "./json-file.server";
import {
  hashFile,
} from "./content-hash.server";
import type {
  AssetCloudMigrationState,
} from "./catalog/ambientcg/ambientcg-types";

const MIGRATION_KEY =
  "metadata/myway/assets/cloud-migration-v1.json";
const MODEL_REGISTRY_KEY =
  "metadata/myway/assets/registry-v2.json";

const EMPTY_MIGRATION:
  AssetCloudMigrationState = {
    schema_version:
      "myway_asset_cloud_migration_v1",
    updated_at: null,
    completed_asset_ids: [],
    failures: [],
    last_batch: null,
  };

async function exists(
  filePath: string,
) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readMigrationState() {
  return (
    await readCloudJson<
      AssetCloudMigrationState
    >(MIGRATION_KEY)
  ) ?? structuredClone(
    EMPTY_MIGRATION,
  );
}

async function writeMigrationState(
  value: AssetCloudMigrationState,
) {
  await writeCloudJson(
    MIGRATION_KEY,
    value,
  );
}

function localPublicPath(
  value: string | null | undefined,
) {
  if (
    !value ||
    /^https?:\/\//i.test(value)
  ) {
    return null;
  }

  try {
    return publicUrlToProjectPath(
      value,
    );
  } catch {
    return null;
  }
}

async function recoverMetadataReference(
  reference: string | null,
) {
  if (!reference) return false;

  const existing =
    await readDurableAssetJson<unknown>(
      reference,
    );

  if (existing != null) {
    return true;
  }

  try {
    await recoverDurableAssetJsonFromLocal(
      reference,
    );
    return true;
  } catch {
    return false;
  }
}

async function archiveAssetMetadata(
  asset: MyWayAssetRecord,
) {
  const licenseReference =
    asset.license_record_path ??
    null;
  const sourceRecordReference =
    `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/source-records/${asset.asset_id}.json`;
  const embeddingReference =
    asset.appearance_embedding?.vector_key ??
    null;

  const [
    licenseArchived,
    sourceRecordArchived,
    embeddingArchived,
  ] = await Promise.all([
    recoverMetadataReference(
      licenseReference,
    ),
    recoverMetadataReference(
      sourceRecordReference,
    ),
    recoverMetadataReference(
      embeddingReference,
    ),
  ]);

  return {
    license_archived:
      licenseArchived,
    source_record_archived:
      sourceRecordArchived,
    embedding_archived:
      embeddingArchived,
  };
}

export async function cloudAssetMigrationStatus() {
  const [
    state,
    assets,
  ] = await Promise.all([
    readMigrationState(),
    listMyWayAssets(),
  ]);

  const eligible =
    assets.filter(
      (asset) =>
        asset.asset_type !==
          "primitive" &&
        asset.status !==
          "rejected",
    );
  const cloudReady =
    eligible.filter(
      (asset) =>
        (
          asset.storage_provider === "r2" &&
          /^https:\/\//i.test(asset.public_path)
        ) ||
        (
          asset.storage_provider ===
            "r2_private_pending" &&
          Boolean(asset.storage_object_key)
        ),
    );

  const localSourceChecks =
    await Promise.all(
      cloudReady.map(async (asset) => {
        if (!asset.source_path) {
          return {
            local: false,
            archived: Boolean(
              asset.source_object_key,
            ),
          };
        }

        const sourcePath =
          path.isAbsolute(
            asset.source_path,
          )
            ? asset.source_path
            : projectPath(
                asset.source_path,
              );

        return {
          local:
            await exists(sourcePath),
          archived: Boolean(
            asset.source_object_key,
          ),
        };
      }),
    );

  return {
    state,
    total_assets:
      assets.length,
    eligible_assets:
      eligible.length,
    cloud_ready_assets:
      cloudReady.length,
    remaining_assets:
      eligible.length -
      cloudReady.length,
    local_source_copies:
      localSourceChecks.filter(
        (item) => item.local,
      ).length,
    unarchived_source_copies:
      localSourceChecks.filter(
        (item) =>
          item.local &&
          !item.archived,
      ).length,
    source_archived_assets:
      localSourceChecks.filter(
        (item) => item.archived,
      ).length,
  };
}

export async function migrateCloudAssetBatch(input: {
  limit?: number;
  removeLocalAfterVerification?: boolean;
}) {
  if (
    !cloudAssetMetadataEnabled()
  ) {
    throw new Error(
      "Cloud asset metadata is not enabled. Configure the existing R2 environment variables first.",
    );
  }

  const limit =
    Math.min(
      10,
      Math.max(
        1,
        input.limit ?? 2,
      ),
    );
  const assets =
    await listMyWayAssets();
  const candidates =
    assets.filter(
      (asset) =>
        asset.asset_type !== "primitive" &&
        asset.status !== "rejected" &&
        asset.storage_provider === "local" &&
        asset.scene_review_status === "approved" &&
        asset.semantic_review_status === "verified" &&
        asset.safe_to_use_in_sandbox &&
        !/^https?:\/\//i.test(asset.public_path),
    );
  const selected =
    candidates.slice(0, limit);
  const state =
    await readMigrationState();
  const completed =
    new Set(
      state.completed_asset_ids,
    );
  const failures =
    [...state.failures];
  const results:
    Array<Record<string, unknown>> =
      [];

  let promoted = 0;
  let skipped = 0;
  let failed = 0;

  for (const asset of selected) {
    const modelPath =
      localPublicPath(
        asset.public_path,
      );
    const thumbnailPath =
      localPublicPath(
        asset.thumbnail_path,
      );
    const sourcePath =
      asset.source_path
        ? path.isAbsolute(
            asset.source_path,
          )
          ? asset.source_path
          : projectPath(
              asset.source_path,
            )
        : null;
    const archiveSource =
      Boolean(
        sourcePath &&
        (await exists(sourcePath)),
      );

    try {
      const promotion =
        await promoteMyWayAssetToR2({
          assetId:
            asset.asset_id,
          archiveSource,
        });
      const updated =
        promotion.asset;

      if (
        !updated.storage_object_key
      ) {
        throw new Error(
          "Promotion did not record an R2 object key.",
        );
      }

      const runtime =
        getR2RuntimeStorage();
      const modelVerified =
        await runtime.exists(
          updated.storage_object_key,
        );

      if (!modelVerified) {
        throw new Error(
          "The uploaded model could not be verified in R2.",
        );
      }

      if (
        updated.thumbnail_object_key &&
        !(await runtime.exists(
          updated.thumbnail_object_key,
        ))
      ) {
        throw new Error(
          "The uploaded thumbnail could not be verified in R2.",
        );
      }

      if (
        updated.source_object_key &&
        !(await getR2SourceStorage().exists(
          updated.source_object_key,
        ))
      ) {
        throw new Error(
          "The archived source file could not be verified in R2.",
        );
      }

      const metadata =
        await archiveAssetMetadata(
          asset,
        );

      if (
        input.removeLocalAfterVerification
      ) {
        await Promise.all(
          [
            modelPath,
            thumbnailPath,
            archiveSource
              ? sourcePath
              : null,
          ]
            .filter(
              (
                value,
              ): value is string =>
                Boolean(value),
            )
            .map((filePath) =>
              rm(
                filePath,
                { force: true },
              ),
            ),
        );
      }

      if (
        input.removeLocalAfterVerification &&
        archiveSource
      ) {
        await updateMyWayAsset(
          updated.asset_id,
          {
            source_path: null,
          },
        );
      }

      completed.add(
        asset.asset_id,
      );
      promoted += 1;
      results.push({
        asset_id:
          asset.asset_id,
        status:
          "promoted",
        removed_local_copy:
          input.removeLocalAfterVerification ===
          true,
        source_file_archived:
          archiveSource,
        license_archived:
          metadata.license_archived,
        source_record_archived:
          metadata.source_record_archived,
        embedding_archived:
          metadata.embedding_archived,
      });
    } catch (caught) {
      failed += 1;
      const message =
        caught instanceof Error
          ? caught.message
          : String(caught);

      failures.push({
        asset_id:
          asset.asset_id,
        error: message,
        attempted_at:
          new Date().toISOString(),
      });
      results.push({
        asset_id:
          asset.asset_id,
        status: "failed",
        error: message,
      });
    }
  }

  if (!selected.length) {
    skipped = candidates.length
      ? 0
      : 1;
  }

  const nextState:
    AssetCloudMigrationState = {
      ...state,
      updated_at:
        new Date().toISOString(),
      completed_asset_ids:
        Array.from(completed).sort(),
      failures:
        failures.slice(-200),
      last_batch: {
        attempted:
          selected.length,
        promoted,
        skipped,
        failed,
      },
    };

  await writeMigrationState(
    nextState,
  );

  const status =
    await cloudAssetMigrationStatus();

  return {
    results,
    ...status,
    done:
      status.remaining_assets === 0,
  };
}

function sourceContentType(
  filePath: string,
) {
  const extension =
    path.extname(filePath)
      .toLowerCase();

  if (extension === ".glb") {
    return "model/gltf-binary";
  }
  if (extension === ".gltf") {
    return "model/gltf+json";
  }
  if (extension === ".blend") {
    return "application/octet-stream";
  }
  return "application/octet-stream";
}

function conventionalLocalThumbnails(
  assetId: string,
) {
  return [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
  ].map((extension) =>
    projectPath(
      "public/sandbox-assets/myway/thumbnails",
      `${assetId}${extension}`,
    ),
  );
}

export async function archiveCloudSourceBatch(input: {
  limit?: number;
  removeLocalAfterVerification?: boolean;
}) {
  if (
    !cloudAssetMetadataEnabled()
  ) {
    throw new Error(
      "Cloud asset metadata is not enabled. Configure the existing R2 environment variables first.",
    );
  }

  const limit =
    Math.min(
      10,
      Math.max(
        1,
        input.limit ?? 2,
      ),
    );
  const assets =
    await listMyWayAssets();
  const candidateChecks =
    await Promise.all(
      assets
        .filter(
          (asset) =>
            asset.asset_type !==
              "primitive" &&
            asset.status !==
              "rejected" &&
            asset.storage_provider ===
              "r2" &&
            /^https:\/\//i.test(
              asset.public_path,
            ) &&
            Boolean(
              asset.source_path,
            ),
        )
        .map(async (asset) => {
          const sourcePath =
            path.isAbsolute(
              asset.source_path!,
            )
              ? asset.source_path!
              : projectPath(
                  asset.source_path!,
                );
          return {
            asset,
            sourcePath,
            exists:
              await exists(sourcePath),
          };
        }),
    );
  const candidates =
    candidateChecks
      .filter(
        (item) =>
          item.exists &&
          (
            !item.asset
              .source_object_key ||
            input.removeLocalAfterVerification ===
              true
          ),
      )
      .slice(0, limit);
  const sourceStorage =
    getR2SourceStorage();
  const results:
    Array<Record<string, unknown>> =
      [];

  for (const item of candidates) {
    const {
      asset,
      sourcePath,
    } = item;

    try {
      if (
        !asset.storage_object_key ||
        !(await getR2RuntimeStorage().exists(
          asset.storage_object_key,
        ))
      ) {
        throw new Error(
          "The cloud model could not be verified before its local source was archived.",
        );
      }

      const thumbnailVerified =
        asset.thumbnail_object_key
          ? await getR2RuntimeStorage().exists(
              asset.thumbnail_object_key,
            )
          : false;

      let objectKey =
        asset.source_object_key ??
        null;
      let upload:
        Awaited<
          ReturnType<
            ReturnType<
              typeof getR2SourceStorage
            >["upload"]
          >
        > | null = null;

      if (!objectKey) {
        const hash =
          await hashFile(
            sourcePath,
          );
        const extension =
          path.extname(
            sourcePath,
          ) || ".bin";
        objectKey =
          `source/${asset.source_type}/${asset.asset_id}/` +
          `${hash.slice(0, 16)}${extension.toLowerCase()}`;
        upload =
          await sourceStorage.upload({
            local_path: sourcePath,
            object_key: objectKey,
            content_type:
              sourceContentType(
                sourcePath,
              ),
            visibility: "private",
            cache_control: "no-store",
            metadata: {
              "asset-id":
                asset.asset_id,
              "source-type":
                asset.source_type,
              "content-hash": hash,
            },
          });
      }

      if (
        !(await sourceStorage.exists(
          objectKey,
        ))
      ) {
        throw new Error(
          "The archived local source could not be verified in R2.",
        );
      }

      const metadata =
        await archiveAssetMetadata(
          asset,
        );
      const removeLocal =
        input.removeLocalAfterVerification ===
        true;

      if (removeLocal) {
        await Promise.all(
          [
            sourcePath,
            ...(thumbnailVerified
              ? conventionalLocalThumbnails(
                  asset.asset_id,
                )
              : []),
          ].map((filePath) =>
            rm(
              filePath,
              { force: true },
            ),
          ),
        );
      }

      await updateMyWayAsset(
        asset.asset_id,
        {
          source_path:
            removeLocal
              ? null
              : asset.source_path,
          source_storage_provider:
            "r2",
          source_object_key:
            objectKey,
          source_storage_etag:
            upload?.etag ??
            asset.source_storage_etag ??
            null,
          source_file_size_bytes:
            upload?.size_bytes ??
            asset.source_file_size_bytes ??
            null,
          source_archived_at:
            new Date().toISOString(),
        },
      );

      results.push({
        asset_id:
          asset.asset_id,
        status: "archived",
        removed_local_copy:
          removeLocal,
        license_archived:
          metadata.license_archived,
        source_record_archived:
          metadata.source_record_archived,
        embedding_archived:
          metadata.embedding_archived,
      });
    } catch (caught) {
      results.push({
        asset_id:
          asset.asset_id,
        status: "failed",
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  const status =
    await cloudAssetMigrationStatus();

  return {
    results,
    ...status,
    done:
      status.local_source_copies ===
      0 ||
      (
        input.removeLocalAfterVerification !==
          true &&
        status.unarchived_source_copies ===
          0
      ),
  };
}

export async function bootstrapAllCloudAssetMetadata() {
  if (
    !cloudAssetMetadataEnabled()
  ) {
    throw new Error(
      "R2 metadata storage is not enabled.",
    );
  }

  let remoteModelRegistry =
    await readCloudJson<unknown>(
      MODEL_REGISTRY_KEY,
    );
  let registryRecovery:
    | "already_present"
    | "recovered" =
    "already_present";

  if (!remoteModelRegistry) {
    await restoreMyWayAssetRegistryToCloudFromLocal();
    registryRecovery =
      "recovered";
    remoteModelRegistry =
      await readCloudJson<unknown>(
        MODEL_REGISTRY_KEY,
      );
  }

  if (!remoteModelRegistry) {
    throw new Error(
      "The model registry could not be recovered to R2.",
    );
  }

  const modelRegistry =
    await loadMyWayAssetRegistry();
  const ambient =
    await bootstrapAmbientCgCloudMetadata();

  return {
    ambient,
    registry_recovery:
      registryRecovery,
    model_registry_ready: true,
    model_asset_count:
      modelRegistry.assets.length,
  };
}

export async function compactVerifiedLocalMetadata() {
  if (
    process.env.VERCEL === "1"
  ) {
    throw new Error(
      "Local compaction is only available from the local development environment.",
    );
  }

  const sourceStorage =
    getR2SourceStorage();
  const requiredKeys = [
    MODEL_REGISTRY_KEY,
    "metadata/ambientcg/catalog-v1.json",
    "metadata/ambientcg/sync-state-v1.json",
    "metadata/ambientcg/categories-v1.json",
    "metadata/ambientcg/collections-v1.json",
    "metadata/ambientcg/material-registry-v1.json",
    "metadata/ambientcg/material-appearance-registry-v1.json",
    "metadata/ambientcg/hdri-registry-v1.json",
    "metadata/ambientcg/resource-registry-v1.json",
    "metadata/ambientcg/download-jobs-v1.json",
  ];

  for (const key of requiredKeys) {
    if (
      !(await sourceStorage.exists(
        key,
      ))
    ) {
      throw new Error(
        `Local files were not compacted because R2 verification failed for ${key}.`,
      );
    }
  }

  const now =
    new Date().toISOString();

  await Promise.all([
    writeJsonFileAtomic(
      projectPath(
        MYWAY_ASSET_REGISTRY_PROJECT_PATH,
      ),
      {
        schema_version:
          "myway_asset_registry_v2",
        updated_at: now,
        asset_root_public_url:
          "/sandbox-assets/myway",
        notes:
          "Cloud-backed registry. The authoritative copy is stored in R2.",
        assets: [],
      },
    ),
    writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_CATALOG_FILE,
      ),
      {
        schema_version:
          "myway_ambientcg_catalog_v1",
        source:
          "ambientcg_api_v3",
        updated_at: null,
        total_results: 0,
        assets: [],
      },
    ),
    writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_SYNC_STATE_FILE,
      ),
      {
        schema_version:
          "myway_ambientcg_sync_state_v1",
        status: "idle",
        run_id: null,
        last_started_at: null,
        last_completed_at: null,
        next_offset: 0,
        page_limit: 250,
        total_results: null,
        records_seen: 0,
        records_written: 0,
        last_error: null,
      },
    ),
    writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_MATERIAL_REGISTRY_FILE,
      ),
      {
        schema_version:
          "myway_ambientcg_material_registry_v1",
        updated_at: null,
        materials: [],
      },
    ),
    writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_HDRI_REGISTRY_FILE,
      ),
      {
        schema_version:
          "myway_ambientcg_hdri_registry_v1",
        updated_at: null,
        hdris: [],
      },
    ),
    writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_RESOURCE_REGISTRY_FILE,
      ),
      {
        schema_version:
          "myway_ambientcg_resource_registry_v1",
        updated_at: null,
        resources: [],
      },
    ),
    writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE,
      ),
      {
        schema_version:
          "myway_ambientcg_download_jobs_v1",
        updated_at: null,
        jobs: [],
      },
    ),
  ]);

  await Promise.all([
    rm(
      projectPath(
        AMBIENTCG_PUBLIC_MATERIAL_ROOT,
      ),
      {
        recursive: true,
        force: true,
      },
    ),
    rm(
      projectPath(
        AMBIENTCG_PUBLIC_HDRI_ROOT,
      ),
      {
        recursive: true,
        force: true,
      },
    ),
    rm(
      projectPath(
        AMBIENTCG_PUBLIC_RESOURCE_ROOT,
      ),
      {
        recursive: true,
        force: true,
      },
    ),
  ]);

  return {
    compacted: true,
    verified_cloud_keys:
      requiredKeys,
  };
}
