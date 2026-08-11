import {
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";

import {
  listMyWayAssets,
  updateMyWayAsset,
} from "../asset-library.server";
import type {
  MyWayAssetAppearanceView,
  MyWayAssetRecord,
} from "../asset-types";
import { hashFile } from "../content-hash.server";
import {
  readJsonFileWithRetry,
} from "../json-file.server";
import {
  projectPath,
  publicUrlToProjectPath,
} from "../paths.server";
import {
  archivePrivateAssetSource,
  durableAssetCloudEnabled,
  durableJsonCloudKey,
  recoverDurableAssetJsonFromExplicitLocalFile,
  recoverDurableAssetJsonFromLocal,
  runtimeObjectKeyFromPublicUrl,
  uploadRuntimeAssetFile,
} from "./asset-durable-artifacts.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "./r2-asset-storage.server";

export const PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION =
  "REPAIR_MISSING_R2_ASSET_OBJECTS";

export type CloudGapRepairCategory =
  | "runtime_model"
  | "thumbnail"
  | "analysis_render"
  | "durable_metadata"
  | "source_archive";

export type CloudGapRepairPlanItem = {
  category: CloudGapRepairCategory;
  asset_id: string | null;
  local_path: string;
  bytes: number;
  object_key: string | null;
  analysis_view_name?:
    MyWayAssetAppearanceView["name"] | null;
  durable_reference?: string | null;
  reason: string;
};

export type CloudGapRepairResultItem =
  CloudGapRepairPlanItem & {
    status: "repaired" | "already_verified" | "failed" | "skipped";
    new_object_key?: string | null;
    error?: string | null;
  };

export type CloudGapRepairPlan = {
  cloud_enabled: boolean;
  generated_at: string;
  summary: {
    items: number;
    files: number;
    bytes: number;
    by_category: Record<
      CloudGapRepairCategory,
      {
        items: number;
        bytes: number;
      }
    >;
  };
  items: CloudGapRepairPlanItem[];
};

const ANALYSIS_VIEW_NAMES = new Set([
  "front_three_quarter",
  "rear_three_quarter",
  "side",
  "elevated_front",
]);

function normalizeProjectReference(
  value: string,
) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

async function fileInfo(
  filePath: string,
) {
  const info = await stat(filePath).catch(
    () => null,
  );
  return info?.isFile() ? info : null;
}

async function listFilesRecursive(
  root: string,
): Promise<string[]> {
  const entries = await readdir(root, {
    withFileTypes: true,
  }).catch(() => []);
  const output: string[] = [];

  for (const entry of entries) {
    const candidate = path.join(
      root,
      entry.name,
    );
    if (entry.isDirectory()) {
      output.push(
        ...(await listFilesRecursive(
          candidate,
        )),
      );
    } else if (entry.isFile()) {
      output.push(candidate);
    }
  }

  return output;
}

function assetIdFromModelPath(
  filePath: string,
) {
  return path.basename(
    filePath,
    path.extname(filePath),
  );
}

function conventionalThumbnailByAsset(
  files: string[],
) {
  const byAsset = new Map<
    string,
    string
  >();
  for (const filePath of files) {
    const extension = path
      .extname(filePath)
      .toLowerCase();
    if (
      extension !== ".png" &&
      extension !== ".jpg" &&
      extension !== ".jpeg" &&
      extension !== ".webp"
    ) {
      continue;
    }
    const assetId = path.basename(
      filePath,
      extension,
    );
    if (!byAsset.has(assetId)) {
      byAsset.set(assetId, filePath);
    }
  }
  return byAsset;
}

function localSourcePath(
  asset: MyWayAssetRecord,
) {
  const source = asset.source_path;
  if (!source) return null;

  // Browser-rooted MyWay public URLs (for example
  // /sandbox-assets/myway/...) are considered absolute by
  // path.isAbsolute() on Windows. Resolve them as project public URLs
  // before treating a value as a real filesystem-absolute path.
  if (source.startsWith("/")) {
    try {
      return publicUrlToProjectPath(
        source,
      );
    } catch {
      // Not a MyWay public URL; a real absolute path may follow.
    }
  }

  if (path.isAbsolute(source)) {
    return source;
  }

  const normalized =
    normalizeProjectReference(source);
  return projectPath(
    ...normalized.split("/").filter(Boolean),
  );
}

function localReferencePath(
  value: string | null | undefined,
) {
  if (
    !value ||
    /^https?:\/\//i.test(value)
  ) {
    return null;
  }

  // On Windows, path.isAbsolute("/sandbox-assets/...") is true even
  // though this is a browser URL rooted at MyWay's public directory.
  // Resolve browser-rooted public URLs first so repair planning sees
  // the same local file that the authority audit sees.
  if (value.startsWith("/")) {
    try {
      return publicUrlToProjectPath(
        value,
      );
    } catch {
      // Not a MyWay public URL; a real absolute path may follow.
    }
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  const normalized =
    normalizeProjectReference(value);
  return projectPath(
    ...normalized.split("/").filter(Boolean),
  );
}

type LocalSourceRecordCandidate = {
  file_path: string;
  value: Record<string, unknown>;
};

function cleanIdentityValue(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function sourceRecordStableSourceIds(
  candidate: LocalSourceRecordCandidate,
) {
  return Array.from(
    new Set(
      [
        candidate.value.source_asset_id,
        candidate.value.asset_base_id,
        candidate.value.selected_source_asset_id,
      ]
        .map(cleanIdentityValue)
        .filter(Boolean),
    ),
  );
}

function sourceRecordMatchesAsset(
  asset: MyWayAssetRecord,
  candidate: LocalSourceRecordCandidate,
) {
  const recordAssetId =
    cleanIdentityValue(
      candidate.value.asset_id,
    );
  const assetSourceId =
    cleanIdentityValue(
      asset.source_asset_id ??
        asset.attribution?.source_asset_id,
    );
  const recordStableSourceIds =
    sourceRecordStableSourceIds(
      candidate,
    );
  const directMyWayIdentity =
    recordAssetId === asset.asset_id;
  const stableProviderIdentity =
    Boolean(
      assetSourceId &&
        recordStableSourceIds.includes(
          assetSourceId,
        ),
    );

  if (
    !directMyWayIdentity &&
    !stableProviderIdentity
  ) {
    return false;
  }

  const comparisons: Array<[string, string]> = [];

  if (
    assetSourceId &&
    recordStableSourceIds.length > 0
  ) {
    comparisons.push([
      stableProviderIdentity
        ? assetSourceId
        : recordStableSourceIds[0]!,
      assetSourceId,
    ]);
  }

  const recordSourceUrl =
    cleanIdentityValue(
      candidate.value.source_url ??
        candidate.value.source_page_url,
    );
  const assetSourceUrl =
    cleanIdentityValue(
      asset.source_url ??
        asset.attribution?.source_url,
    );
  if (
    recordSourceUrl &&
    assetSourceUrl
  ) {
    comparisons.push([
      recordSourceUrl,
      assetSourceUrl,
    ]);
  }

  const recordHash =
    cleanIdentityValue(
      candidate.value.content_hash,
    );
  const assetHash =
    cleanIdentityValue(
      asset.content_hash,
    );
  if (recordHash && assetHash) {
    comparisons.push([
      recordHash,
      assetHash,
    ]);
  }

  return (
    comparisons.length > 0 &&
    comparisons.every(
      ([left, right]) =>
        left === right,
    )
  );
}

type LocalSourceRecordIndex = {
  by_asset_id: Map<
    string,
    LocalSourceRecordCandidate[]
  >;
  by_source_id: Map<
    string,
    LocalSourceRecordCandidate[]
  >;
};

function addSourceRecordIndexEntry(
  index: Map<
    string,
    LocalSourceRecordCandidate[]
  >,
  key: string,
  candidate: LocalSourceRecordCandidate,
) {
  if (!key) return;
  const entries = index.get(key) ?? [];
  if (
    !entries.some(
      (entry) =>
        entry.file_path ===
        candidate.file_path,
    )
  ) {
    entries.push(candidate);
    index.set(key, entries);
  }
}

async function localSourceRecordIndex(): Promise<LocalSourceRecordIndex> {
  const root = projectPath(
    "sandbox",
    "probe-lab",
    "assets",
    "library",
    "source-records",
  );
  const byAssetId = new Map<
    string,
    LocalSourceRecordCandidate[]
  >();
  const bySourceId = new Map<
    string,
    LocalSourceRecordCandidate[]
  >();

  for (const filePath of
    await listFilesRecursive(root)) {
    if (
      path.extname(filePath)
        .toLowerCase() !== ".json"
    ) {
      continue;
    }

    let value:
      Record<string, unknown>;
    try {
      value =
        await readJsonFileWithRetry<
          Record<string, unknown>
        >(filePath);
    } catch {
      continue;
    }

    const candidate = {
      file_path: filePath,
      value,
    };
    const assetId =
      cleanIdentityValue(
        value.asset_id,
      );
    addSourceRecordIndexEntry(
      byAssetId,
      assetId,
      candidate,
    );

    for (const sourceId of
      sourceRecordStableSourceIds(
        candidate,
      )) {
      addSourceRecordIndexEntry(
        bySourceId,
        sourceId,
        candidate,
      );
    }
  }

  return {
    by_asset_id: byAssetId,
    by_source_id: bySourceId,
  };
}

function durableMetadataReferences(
  asset: MyWayAssetRecord,
) {
  const references = new Set<string>();

  if (
    asset.license_record_path &&
    !/^https?:\/\//i.test(
      asset.license_record_path,
    )
  ) {
    references.add(
      normalizeProjectReference(
        asset.license_record_path,
      ),
    );
  }

  references.add(
    `sandbox/probe-lab/assets/library/source-records/${asset.asset_id}.json`,
  );

  if (
    asset.appearance_embedding?.status ===
      "ready" &&
    asset.appearance_embedding.vector_key
  ) {
    references.add(
      normalizeProjectReference(
        asset.appearance_embedding
          .vector_key,
      ),
    );
  }

  return Array.from(references);
}

function emptyCategorySummary() {
  return {
    runtime_model: {
      items: 0,
      bytes: 0,
    },
    thumbnail: {
      items: 0,
      bytes: 0,
    },
    analysis_render: {
      items: 0,
      bytes: 0,
    },
    durable_metadata: {
      items: 0,
      bytes: 0,
    },
    source_archive: {
      items: 0,
      bytes: 0,
    },
  } satisfies CloudGapRepairPlan["summary"]["by_category"];
}

function summarizePlan(
  items: CloudGapRepairPlanItem[],
) {
  const byCategory =
    emptyCategorySummary();
  for (const item of items) {
    byCategory[item.category].items += 1;
    byCategory[item.category].bytes +=
      item.bytes;
  }
  return {
    items: items.length,
    files: items.length,
    bytes: items.reduce(
      (sum, item) => sum + item.bytes,
      0,
    ),
    by_category: byCategory,
  };
}

async function runtimeExists(
  objectKey: string | null | undefined,
) {
  if (!objectKey) return false;
  return getR2RuntimeStorage()
    .exists(objectKey)
    .catch(() => false);
}

async function sourceExists(
  objectKey: string | null | undefined,
) {
  if (!objectKey) return false;
  return getR2SourceStorage()
    .exists(objectKey)
    .catch(() => false);
}

function referenceFromLocalDurablePath(
  filePath: string,
) {
  const root = projectPath();
  return normalizeProjectReference(
    path.relative(root, filePath),
  );
}

export async function buildCloudGapRepairPlan(): Promise<CloudGapRepairPlan> {
  if (!durableAssetCloudEnabled()) {
    throw new Error(
      "Phase 3 cloud-gap repair requires the complete Cloudflare R2 environment and cloud metadata mode.",
    );
  }

  const assets = await listMyWayAssets();
  const byId = new Map(
    assets.map((asset) => [
      asset.asset_id,
      asset,
    ]),
  );
  const items: CloudGapRepairPlanItem[] = [];

  const modelRoot = projectPath(
    "public",
    "sandbox-assets",
    "myway",
    "models",
  );
  for (const filePath of
    await listFilesRecursive(modelRoot)) {
    const extension = path
      .extname(filePath)
      .toLowerCase();
    if (
      extension !== ".glb" &&
      extension !== ".gltf"
    ) {
      continue;
    }
    const assetId =
      assetIdFromModelPath(filePath);
    const asset = byId.get(assetId);
    if (
      !asset ||
      asset.storage_provider !== "r2"
    ) {
      continue;
    }
    if (
      await runtimeExists(
        asset.storage_object_key,
      )
    ) {
      continue;
    }
    const info = await fileInfo(filePath);
    if (!info) continue;
    items.push({
      category: "runtime_model",
      asset_id: asset.asset_id,
      local_path: filePath,
      bytes: info.size,
      object_key:
        asset.storage_object_key ?? null,
      reason:
        "Registry says R2 but the recorded runtime model object does not pass verification; the local normalized model can republish it.",
    });
  }

  const thumbnailRoot = projectPath(
    "public",
    "sandbox-assets",
    "myway",
    "thumbnails",
  );
  const thumbnailFiles =
    await listFilesRecursive(
      thumbnailRoot,
    );
  const thumbnailByAsset =
    conventionalThumbnailByAsset(
      thumbnailFiles,
    );
  for (const asset of assets) {
    if (
      asset.thumbnail_storage_provider !==
      "r2"
    ) {
      continue;
    }
    if (
      await runtimeExists(
        asset.thumbnail_object_key,
      )
    ) {
      continue;
    }
    const localPath =
      thumbnailByAsset.get(
        asset.asset_id,
      );
    if (!localPath) continue;
    const info = await fileInfo(localPath);
    if (!info) continue;
    items.push({
      category: "thumbnail",
      asset_id: asset.asset_id,
      local_path: localPath,
      bytes: info.size,
      object_key:
        asset.thumbnail_object_key ??
        null,
      reason:
        "Registry says the thumbnail is in R2 but the recorded object does not pass verification; the local thumbnail can republish it.",
    });
  }

  for (const asset of assets) {
    for (const view of
      asset.appearance_profile
        ?.analysis_views ?? []) {
      const recordedKey =
        runtimeObjectKeyFromPublicUrl(
          view.public_path,
        );
      if (
        recordedKey &&
        (await runtimeExists(
          recordedKey,
        ))
      ) {
        continue;
      }

      const expectedPrefix =
        `runtime/analysis/${asset.asset_id}/${view.name}/`;
      if (!recordedKey) {
        const existingUnderPrefix =
          await getR2RuntimeStorage()
            .list({
              prefix:
                expectedPrefix,
            });
        if (
          existingUnderPrefix.length > 0
        ) {
          continue;
        }
      }

      const localPath =
        localReferencePath(
          view.public_path,
        );
      if (!localPath) continue;
      const info =
        await fileInfo(localPath);
      if (!info) continue;

      items.push({
        category: "analysis_render",
        asset_id: asset.asset_id,
        local_path: localPath,
        bytes: info.size,
        object_key:
          recordedKey ??
          `${expectedPrefix}*`,
        analysis_view_name:
          view.name,
        reason:
          "The authoritative registry references a local analysis image whose expected R2 object/prefix is missing; repair uses the registry view name and exact referenced local file rather than assuming a historical filename convention.",
      });
    }
  }

  const sourceRecordIndex =
    await localSourceRecordIndex();

  for (const asset of assets) {
    for (const reference of
      durableMetadataReferences(
        asset,
      )) {
      let objectKey: string;
      try {
        objectKey =
          durableJsonCloudKey(
            reference,
          );
      } catch {
        continue;
      }

      if (await sourceExists(objectKey)) {
        continue;
      }

      const canonicalLocalPath =
        localReferencePath(reference);
      let localPath =
        canonicalLocalPath;
      let info = localPath
        ? await fileInfo(localPath)
        : null;
      let reason =
        "An authoritative asset metadata object is missing from private R2, and its canonical local historical mirror can explicitly restore the expected cloud key.";

      const canonicalSourceReference =
        `sandbox/probe-lab/assets/library/source-records/${asset.asset_id}.json`;
      if (
        !info &&
        reference ===
          canonicalSourceReference
      ) {
        const stableSourceId =
          cleanIdentityValue(
            asset.source_asset_id ??
              asset.attribution?.source_asset_id,
          );
        const candidates =
          Array.from(
            new Map(
              [
                ...(sourceRecordIndex.by_asset_id.get(
                  asset.asset_id,
                ) ?? []),
                ...(stableSourceId
                  ? sourceRecordIndex.by_source_id.get(
                      stableSourceId,
                    ) ?? []
                  : []),
              ].map((candidate) => [
                candidate.file_path,
                candidate,
              ]),
            ).values(),
          ).filter(
            (candidate) =>
              sourceRecordMatchesAsset(
                asset,
                candidate,
              ),
          );

        if (candidates.length === 1) {
          localPath =
            candidates[0]!.file_path;
          info =
            await fileInfo(localPath);
          reason =
            "The canonical source-record filename is missing after an asset-ID rename, but exactly one local historical source record matches the current MyWay asset by either current asset_id or stable provider source identity plus consistent provenance. Repair writes that verified record to the canonical private R2 key without renaming or deleting the local historical file.";
        }
      }

      if (!localPath || !info) {
        continue;
      }

      items.push({
        category:
          "durable_metadata",
        asset_id:
          asset.asset_id,
        local_path:
          localPath,
        bytes: info.size,
        object_key:
          objectKey,
        durable_reference:
          reference,
        reason,
      });
    }
  }

  for (const asset of assets) {
    if (!asset.source_path) continue;
    if (
      await sourceExists(
        asset.source_object_key,
      )
    ) {
      continue;
    }
    const sourcePath =
      localSourcePath(asset);
    if (!sourcePath) continue;
    const info = await fileInfo(sourcePath);
    if (!info) continue;
    items.push({
      category: "source_archive",
      asset_id: asset.asset_id,
      local_path: sourcePath,
      bytes: info.size,
      object_key:
        asset.source_object_key ?? null,
      reason:
        "The registry still records a local source copy without a verified private R2 source archive; it can be archived without deleting the local source.",
    });
  }

  return {
    cloud_enabled: true,
    generated_at:
      new Date().toISOString(),
    summary: summarizePlan(items),
    items,
  };
}

async function repairRuntimeModel(
  item: CloudGapRepairPlanItem,
) {
  if (!item.asset_id) {
    throw new Error(
      "Runtime model repair is missing asset_id.",
    );
  }
  const assets = await listMyWayAssets();
  const asset = assets.find(
    (candidate) =>
      candidate.asset_id ===
      item.asset_id,
  );
  if (!asset) {
    throw new Error(
      `Asset not found: ${item.asset_id}`,
    );
  }
  if (
    await runtimeExists(
      asset.storage_object_key,
    )
  ) {
    return {
      objectKey:
        asset.storage_object_key ?? null,
      alreadyVerified: true,
    };
  }
  const hash = await hashFile(
    item.local_path,
  );
  const extension = path
    .extname(item.local_path)
    .toLowerCase() || ".glb";
  const uploaded =
    await uploadRuntimeAssetFile({
      localPath: item.local_path,
      objectKey:
        `runtime/models/${asset.source_type}/${asset.asset_id}/` +
        `${hash.slice(0, 16)}${extension}`,
      metadata: {
        "asset-id": asset.asset_id,
        "source-type": asset.source_type,
        "content-hash": hash,
        "repair-kind":
          "phase3-cloud-gap-repair",
      },
    });
  if (!uploaded?.public_url) {
    throw new Error(
      `Runtime repair upload failed for ${asset.asset_id}.`,
    );
  }
  await updateMyWayAsset(
    asset.asset_id,
    {
      storage_provider: "r2",
      storage_object_key:
        uploaded.object_key,
      storage_etag:
        uploaded.etag ?? null,
      file_size_bytes:
        uploaded.size_bytes,
      public_path:
        uploaded.public_url,
      content_hash: hash,
    },
  );
  return {
    objectKey: uploaded.object_key,
    alreadyVerified: false,
  };
}

async function repairThumbnail(
  item: CloudGapRepairPlanItem,
) {
  if (!item.asset_id) {
    throw new Error(
      "Thumbnail repair is missing asset_id.",
    );
  }
  const assets = await listMyWayAssets();
  const asset = assets.find(
    (candidate) =>
      candidate.asset_id ===
      item.asset_id,
  );
  if (!asset) {
    throw new Error(
      `Asset not found: ${item.asset_id}`,
    );
  }
  if (
    await runtimeExists(
      asset.thumbnail_object_key,
    )
  ) {
    return {
      objectKey:
        asset.thumbnail_object_key ?? null,
      alreadyVerified: true,
    };
  }
  const hash = await hashFile(
    item.local_path,
  );
  const extension = path
    .extname(item.local_path)
    .toLowerCase() || ".png";
  const uploaded =
    await uploadRuntimeAssetFile({
      localPath: item.local_path,
      objectKey:
        `runtime/thumbnails/${asset.asset_id}/` +
        `${hash.slice(0, 16)}${extension}`,
      metadata: {
        "asset-id": asset.asset_id,
        "content-hash": hash,
        "repair-kind":
          "phase3-cloud-gap-repair",
      },
    });
  if (!uploaded?.public_url) {
    throw new Error(
      `Thumbnail repair upload failed for ${asset.asset_id}.`,
    );
  }
  await updateMyWayAsset(
    asset.asset_id,
    {
      thumbnail_storage_provider: "r2",
      thumbnail_object_key:
        uploaded.object_key,
      thumbnail_etag:
        uploaded.etag ?? null,
      thumbnail_file_size_bytes:
        uploaded.size_bytes,
      thumbnail_path:
        uploaded.public_url,
    },
  );
  return {
    objectKey: uploaded.object_key,
    alreadyVerified: false,
  };
}

async function repairAnalysisRender(
  item: CloudGapRepairPlanItem,
) {
  if (!item.asset_id) {
    throw new Error(
      "Analysis render repair is missing asset_id.",
    );
  }
  const assets = await listMyWayAssets();
  const asset = assets.find(
    (candidate) =>
      candidate.asset_id ===
      item.asset_id,
  );
  if (!asset?.appearance_profile) {
    throw new Error(
      `Appearance profile not found: ${item.asset_id}`,
    );
  }
  const viewName =
    item.analysis_view_name ??
    path.basename(
      item.local_path,
      path.extname(item.local_path),
    );
  if (
    !ANALYSIS_VIEW_NAMES.has(
      viewName,
    )
  ) {
    throw new Error(
      `Unsupported analysis view: ${viewName}`,
    );
  }
  const hash = await hashFile(
    item.local_path,
  );
  const extension = path
    .extname(item.local_path)
    .toLowerCase() || ".png";
  const uploaded =
    await uploadRuntimeAssetFile({
      localPath: item.local_path,
      objectKey:
        `runtime/analysis/${asset.asset_id}/${viewName}/` +
        `${hash.slice(0, 16)}${extension}`,
      metadata: {
        "asset-id": asset.asset_id,
        "analysis-view": viewName,
        "content-hash": hash,
        "repair-kind":
          "phase3-cloud-gap-repair",
      },
    });
  if (!uploaded?.public_url) {
    throw new Error(
      `Analysis repair upload failed for ${asset.asset_id}/${viewName}.`,
    );
  }
  const nextViews =
    asset.appearance_profile.analysis_views
      .filter(
        (view) =>
          view.name !== viewName,
      );
  nextViews.push({
    name: viewName as MyWayAssetAppearanceView["name"],
    public_path: uploaded.public_url,
  });
  await updateMyWayAsset(
    asset.asset_id,
    {
      appearance_profile: {
        ...asset.appearance_profile,
        analysis_views: nextViews,
      },
    },
  );
  return {
    objectKey: uploaded.object_key,
    alreadyVerified: false,
  };
}

async function repairDurableMetadata(
  item: CloudGapRepairPlanItem,
) {
  const reference =
    item.durable_reference ??
    referenceFromLocalDurablePath(
      item.local_path,
    );
  const canonicalLocalPath =
    localReferencePath(reference);
  const result =
    canonicalLocalPath &&
    path.resolve(
      canonicalLocalPath,
    ) ===
      path.resolve(
        item.local_path,
      )
      ? await recoverDurableAssetJsonFromLocal(
          reference,
        )
      : await recoverDurableAssetJsonFromExplicitLocalFile(
          reference,
          item.local_path,
        );
  return {
    objectKey:
      result.cloud_object_key,
    alreadyVerified:
      result.status ===
      "already_present",
  };
}

async function repairSourceArchive(
  item: CloudGapRepairPlanItem,
) {
  if (!item.asset_id) {
    throw new Error(
      "Source repair is missing asset_id.",
    );
  }
  const assets = await listMyWayAssets();
  const asset = assets.find(
    (candidate) =>
      candidate.asset_id ===
      item.asset_id,
  );
  if (!asset) {
    throw new Error(
      `Asset not found: ${item.asset_id}`,
    );
  }
  if (
    await sourceExists(
      asset.source_object_key,
    )
  ) {
    return {
      objectKey:
        asset.source_object_key ?? null,
      alreadyVerified: true,
    };
  }
  const uploaded =
    await archivePrivateAssetSource({
      assetId: asset.asset_id,
      sourceType: asset.source_type,
      localPath: item.local_path,
    });
  if (!uploaded) {
    throw new Error(
      `Source archive repair failed for ${asset.asset_id}.`,
    );
  }
  await updateMyWayAsset(
    asset.asset_id,
    {
      source_storage_provider: "r2",
      source_object_key:
        uploaded.object_key,
      source_storage_etag:
        uploaded.etag ?? null,
      source_file_size_bytes:
        uploaded.size_bytes,
      source_archived_at:
        new Date().toISOString(),
    },
  );
  return {
    objectKey: uploaded.object_key,
    alreadyVerified: false,
  };
}

export async function repairCloudGapPlan(input: {
  confirmation: string;
  limit?: number;
  categories?: CloudGapRepairCategory[];
  objectKeys?: string[];
}) {
  if (
    input.confirmation !==
    PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION
  ) {
    throw new Error(
      `Explicit confirmation is required: ${PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION}`,
    );
  }
  const plan =
    await buildCloudGapRepairPlan();
  const categories = input.categories?.length
    ? new Set(input.categories)
    : null;
  const objectKeys = input.objectKeys?.length
    ? new Set(input.objectKeys)
    : null;
  const selected = plan.items
    .filter(
      (item) =>
        (!categories ||
          categories.has(item.category)) &&
        (!objectKeys ||
          Boolean(
            item.object_key &&
            objectKeys.has(
              item.object_key,
            ),
          )),
    )
    .slice(
      0,
      Math.max(
        1,
        Math.floor(
          input.limit ?? 10,
        ),
      ),
    );
  const results: CloudGapRepairResultItem[] = [];

  for (const item of selected) {
    try {
      let repair:
        | {
            objectKey: string | null;
            alreadyVerified: boolean;
          }
        | undefined;
      if (
        item.category ===
        "runtime_model"
      ) {
        repair =
          await repairRuntimeModel(
            item,
          );
      } else if (
        item.category === "thumbnail"
      ) {
        repair = await repairThumbnail(
          item,
        );
      } else if (
        item.category ===
        "analysis_render"
      ) {
        repair =
          await repairAnalysisRender(
            item,
          );
      } else if (
        item.category ===
        "durable_metadata"
      ) {
        repair =
          await repairDurableMetadata(
            item,
          );
      } else if (
        item.category ===
        "source_archive"
      ) {
        repair =
          await repairSourceArchive(
            item,
          );
      }

      results.push({
        ...item,
        status:
          repair?.alreadyVerified
            ? "already_verified"
            : "repaired",
        new_object_key:
          repair?.objectKey ?? null,
      });
    } catch (caught) {
      results.push({
        ...item,
        status: "failed",
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  return {
    before: plan,
    selected_count: selected.length,
    results,
    repaired_count: results.filter(
      (item) =>
        item.status === "repaired" ||
        item.status ===
          "already_verified",
    ).length,
    failed_count: results.filter(
      (item) =>
        item.status === "failed",
    ).length,
    after:
      await buildCloudGapRepairPlan(),
  };
}
