import { rm } from "node:fs/promises";
import path from "node:path";

import type { MyWayAssetRecord } from "./asset-types";
import {
  getMyWayAsset,
  listMyWayAssets,
  loadMyWayAssetRegistry,
  saveMyWayAssetRegistry,
  updateMyWayAsset,
} from "./asset-library.server";
import {
  projectPath,
  publicUrlToProjectPath,
} from "./paths.server";
import { acquireFromBlenderKit } from "./providers/blenderkit-provider.server";
import { acquireFromTrellis } from "./providers/trellis-asset-provider.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "./storage/r2-asset-storage.server";
import {
  deleteDurableAssetJson,
  runtimeObjectKeyFromPublicUrl,
} from "./storage/asset-durable-artifacts.server";

function isRemoteUrl(value: string | null | undefined) {
  return Boolean(value && /^https:\/\//i.test(value));
}

function insideProject(candidatePath: string) {
  const relative = path.relative(process.cwd(), candidatePath);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function localProjectPath(value: string | null | undefined) {
  if (!value || isRemoteUrl(value)) return null;

  const candidate = value.startsWith("/")
    ? publicUrlToProjectPath(value)
    : path.isAbsolute(value)
      ? value
      : projectPath(value);

  return insideProject(candidate) ? candidate : null;
}

function possibleLocalAssetFiles(asset: MyWayAssetRecord) {
  const candidates = new Set<string>();

  for (const value of [
    asset.public_path,
    asset.thumbnail_path,
    asset.source_path,
    asset.license_record_path,
    asset.appearance_embedding?.vector_key,
    ...(asset.appearance_profile?.analysis_views ?? []).map(
      (view) => view.public_path,
    ),
  ]) {
    const candidate = localProjectPath(value);
    if (candidate) candidates.add(candidate);
  }

  const sourceFolder =
    asset.source_type === "blenderkit"
      ? "blenderkit"
      : asset.source_type === "trellis"
        ? "trellis"
        : "manual";

  for (const extension of [".glb", ".gltf"]) {
    candidates.add(
      projectPath(
        `public/sandbox-assets/myway/models/${sourceFolder}`,
        `${asset.asset_id}${extension}`,
      ),
    );
  }

  for (const extension of [".png", ".jpg", ".jpeg", ".webp"]) {
    candidates.add(
      projectPath(
        "public/sandbox-assets/myway/thumbnails",
        `${asset.asset_id}${extension}`,
      ),
    );
  }

  candidates.add(
    projectPath(
      "sandbox/probe-lab/assets/inbox/trellis",
      `${asset.asset_id}-raw.glb`,
    ),
  );
  candidates.add(
    projectPath(
      "sandbox/probe-lab/assets/library/source-records",
      `${asset.asset_id}.json`,
    ),
  );
  candidates.add(
    projectPath(
      "sandbox/probe-lab/assets/library/licenses",
      `${asset.asset_id}.review.json`,
    ),
  );
  candidates.add(
    projectPath(
      "sandbox/probe-lab/assets/library/licenses",
      `${asset.asset_id}.json`,
    ),
  );

  return [...candidates].filter(insideProject);
}

async function deleteRemoteObjects(asset: MyWayAssetRecord) {
  const removed: string[] = [];

  if (
    asset.storage_provider === "r2" &&
    asset.storage_object_key
  ) {
    const storage = getR2RuntimeStorage();
    await storage.delete(asset.storage_object_key);
    removed.push(
      `${storage.bucket}/${asset.storage_object_key}`,
    );
  }

  if (
    asset.thumbnail_storage_provider === "r2" &&
    asset.thumbnail_object_key
  ) {
    const storage = getR2RuntimeStorage();
    await storage.delete(asset.thumbnail_object_key);
    removed.push(
      `${storage.bucket}/${asset.thumbnail_object_key}`,
    );
  }

  if (
    asset.source_storage_provider === "r2" &&
    asset.source_object_key
  ) {
    const storage = getR2SourceStorage();
    await storage.delete(asset.source_object_key);
    removed.push(
      `${storage.bucket}/${asset.source_object_key}`,
    );
  }

  const runtime =
    getR2RuntimeStorage();
  for (
    const view of
      asset.appearance_profile?.analysis_views ??
      []
  ) {
    const objectKey =
      runtimeObjectKeyFromPublicUrl(
        view.public_path,
      );
    if (!objectKey) continue;
    await runtime
      .delete(objectKey)
      .catch(() => undefined);
    removed.push(
      `${runtime.bucket}/${objectKey}`,
    );
  }

  return removed;
}

export async function removeMyWayAssetCompletely(
  assetId: string,
) {
  const asset = await getMyWayAsset(assetId);

  if (!asset) {
    throw new Error(`Asset was not found: ${assetId}`);
  }

  const removedRemoteObjects =
    await deleteRemoteObjects(asset);

  const durableReferences = [
    asset.license_record_path,
    asset.appearance_embedding
      ?.vector_key ??
      null,
    `sandbox/probe-lab/assets/library/source-records/${asset.asset_id}.json`,
  ].filter(
    (value): value is string =>
      Boolean(value),
  );

  for (const reference of durableReferences) {
    await deleteDurableAssetJson(
      reference,
    ).catch(() => undefined);
  }

  const removedLocalFiles: string[] = [];

  for (const candidate of possibleLocalAssetFiles(asset)) {
    await rm(candidate, {
      force: true,
      recursive: false,
    });
    removedLocalFiles.push(
      path
        .relative(process.cwd(), candidate)
        .replace(/\\/g, "/"),
    );
  }

  const registry = await loadMyWayAssetRegistry();
  const before = registry.assets.length;
  registry.assets = registry.assets.filter(
    (candidate) => candidate.asset_id !== asset.asset_id,
  );

  if (registry.assets.length === before) {
    throw new Error(
      `Asset disappeared before registry removal: ${asset.asset_id}`,
    );
  }

  await saveMyWayAssetRegistry(registry);

  return {
    asset,
    removed_local_files: removedLocalFiles,
    removed_remote_objects: removedRemoteObjects,
  };
}

function replacementExtent(asset: MyWayAssetRecord) {
  const extent = Math.max(...asset.dimensions_m);
  return Number.isFinite(extent) && extent > 0
    ? Math.min(4, Math.max(0.25, extent))
    : 2;
}

export async function createMyWayAssetReplacement(input: {
  assetId: string;
  provider: "blenderkit" | "trellis";
}) {
  const original = await getMyWayAsset(input.assetId);

  if (!original) {
    throw new Error(`Asset was not found: ${input.assetId}`);
  }

  if (input.provider === "blenderkit") {
    const existingAssets = await listMyWayAssets();
    const excludedSourceAssetIds = Array.from(
      new Set(
        existingAssets
          .filter(
            (asset) =>
              asset.source_type === "blenderkit" &&
              typeof asset.source_asset_id === "string" &&
              asset.source_asset_id.trim().length > 0,
          )
          .map((asset) => asset.source_asset_id!.trim()),
      ),
    );

    const result = await acquireFromBlenderKit({
      concept: original.verified_canonical_label ?? original.canonical_label,
      aliases: original.aliases,
      semanticTags: original.semantic_tags,
      domain: original.domain,
      targetExtentM: replacementExtent(original),
      requiredLicenseKind: "cc0",
      excludedSourceAssetIds,
    });

    if (
      result.asset.asset_id === original.asset_id ||
      result.asset.content_hash === original.content_hash
    ) {
      throw new Error(
        "BlendKit did not produce a new unseen asset. Every previously registered BlendKit source ID was excluded, but the downloaded result still matched an existing file.",
      );
    }

    const updated = await updateMyWayAsset(
      result.asset.asset_id,
      {
        notes:
          `${result.asset.notes ?? ""}`.trim() +
          `${result.asset.notes ? " " : ""}` +
          `Created as a CC0 BlendKit replacement candidate for ${original.asset_id}.`,
      },
    );

    return {
      original,
      replacement: updated,
      provider: "blenderkit" as const,
    };
  }

  const randomSeed =
    Math.floor(Math.random() * 2_000_000_000) + 1;

  const result = await acquireFromTrellis({
    concept: original.verified_canonical_label ?? original.canonical_label,
    semanticTags: [
      ...original.semantic_tags,
      "accurate proportions",
      "complete object",
    ],
    acquisitionTerms: [
      "high quality",
      "clean detailed geometry",
    ],
    domain: original.domain,
    targetExtentM: replacementExtent(original),
    noTexture: true,
    seed: randomSeed,
    maxAttempts: 3,
  });

  if (
    result.asset.asset_id === original.asset_id ||
    result.asset.content_hash === original.content_hash
  ) {
    throw new Error(
      "TRELLIS produced the same underlying asset. Run the improvement again for a new seed.",
    );
  }

  const updated = await updateMyWayAsset(
    result.asset.asset_id,
    {
      quality_score: Math.min(
        1,
        Math.max(
          result.asset.quality_score,
          original.quality_score + 0.05,
        ),
      ),
      notes:
        `${result.asset.notes ?? ""}`.trim() +
        `${result.asset.notes ? " " : ""}` +
        `Generated as an improved TRELLIS candidate for ${original.asset_id} using seed ${randomSeed}.`,
    },
  );

  return {
    original,
    replacement: updated,
    provider: "trellis" as const,
  };
}
