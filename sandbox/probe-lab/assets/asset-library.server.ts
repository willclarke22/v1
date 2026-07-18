import {
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  MyWayAssetRecord,
  MyWayAssetRegistryV1,
} from "./asset-types";
import {
  normalizeMyWayAssetRecord,
  safeAssetId,
} from "./normalize-asset-record";
import {
  ensureAssetDirectories,
  MYWAY_ASSET_REGISTRY_PROJECT_PATH,
  projectPath,
  publicUrlToProjectPath,
} from "./paths.server";
import { validateMyWayAssetRecord } from "./validate-asset-record";

let writeQueue: Promise<unknown> = Promise.resolve();

function emptyRegistry(): MyWayAssetRegistryV1 {
  return {
    schema_version: "myway_asset_registry_v1",
    updated_at: new Date().toISOString(),
    asset_root_public_url: "/sandbox-assets/myway",
    notes: "Shared MyWay sandbox asset library.",
    assets: [],
  };
}

export async function loadMyWayAssetRegistry(): Promise<MyWayAssetRegistryV1> {
  await ensureAssetDirectories();
  const registryPath = projectPath(
    MYWAY_ASSET_REGISTRY_PROJECT_PATH,
  );

  try {
    const parsed = JSON.parse(
      await readFile(registryPath, "utf8"),
    ) as Partial<MyWayAssetRegistryV1>;

    return {
      ...emptyRegistry(),
      updated_at:
        typeof parsed.updated_at === "string"
          ? parsed.updated_at
          : new Date().toISOString(),
      notes:
        typeof parsed.notes === "string"
          ? parsed.notes
          : null,
      assets: Array.isArray(parsed.assets)
        ? parsed.assets
            .map(normalizeMyWayAssetRecord)
            .filter(
              (
                asset,
              ): asset is MyWayAssetRecord =>
                Boolean(asset),
            )
        : [],
    };
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException).code !==
      "ENOENT"
    ) {
      throw caught;
    }

    const registry = emptyRegistry();
    await writeFile(
      registryPath,
      `${JSON.stringify(registry, null, 2)}\n`,
      "utf8",
    );
    return registry;
  }
}

async function saveRegistryUnlocked(
  registry: MyWayAssetRegistryV1,
) {
  registry.updated_at = new Date().toISOString();

  await writeFile(
    projectPath(
      MYWAY_ASSET_REGISTRY_PROJECT_PATH,
    ),
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );
}

export function saveMyWayAssetRegistry(
  registry: MyWayAssetRegistryV1,
) {
  const task = writeQueue.then(() =>
    saveRegistryUnlocked(registry),
  );

  writeQueue = task.catch(() => undefined);
  return task;
}

export async function getMyWayAsset(
  assetId: string,
) {
  const registry = await loadMyWayAssetRegistry();
  const normalized = safeAssetId(assetId);

  return (
    registry.assets.find(
      (asset) => asset.asset_id === normalized,
    ) ?? null
  );
}

export async function listMyWayAssets() {
  const registry = await loadMyWayAssetRegistry();

  return registry.assets
    .slice()
    .sort(
      (a, b) =>
        a.domain.localeCompare(b.domain) ||
        a.display_name.localeCompare(
          b.display_name,
        ),
    );
}

export async function registerMyWayAsset(
  raw: unknown,
) {
  const asset = normalizeMyWayAssetRecord(raw);

  if (!asset) {
    throw new Error(
      "Asset record was invalid or missing asset_id/public_path.",
    );
  }

  const validation =
    validateMyWayAssetRecord(asset);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const registry = await loadMyWayAssetRegistry();
  const duplicateHash = asset.content_hash
    ? registry.assets.find(
        (candidate) =>
          candidate.content_hash &&
          candidate.content_hash ===
            asset.content_hash,
      )
    : null;

  if (duplicateHash) {
    return {
      asset: duplicateHash,
      created: false,
      duplicate_of: duplicateHash.asset_id,
    };
  }

  const existingIndex =
    registry.assets.findIndex(
      (candidate) =>
        candidate.asset_id === asset.asset_id,
    );

  if (existingIndex >= 0) {
    const existing =
      registry.assets[existingIndex]!;
    asset.created_at = existing.created_at;
    registry.assets[existingIndex] = asset;
  } else {
    registry.assets.push(asset);
  }

  await saveMyWayAssetRegistry(registry);

  return {
    asset,
    created: existingIndex < 0,
    duplicate_of: null,
  };
}

export async function updateMyWayAsset(
  assetId: string,
  updater:
    | Partial<MyWayAssetRecord>
    | ((
        current: MyWayAssetRecord,
      ) => MyWayAssetRecord),
) {
  const registry = await loadMyWayAssetRegistry();
  const normalizedId = safeAssetId(assetId);
  const index = registry.assets.findIndex(
    (asset) => asset.asset_id === normalizedId,
  );

  if (index < 0) {
    throw new Error(
      `Asset was not found in the registry: ${normalizedId}`,
    );
  }

  const current = registry.assets[index]!;
  const candidate =
    typeof updater === "function"
      ? updater(current)
      : {
          ...current,
          ...updater,
          asset_id: current.asset_id,
          created_at: current.created_at,
          updated_at: new Date().toISOString(),
        };

  const normalized =
    normalizeMyWayAssetRecord(candidate);

  if (!normalized) {
    throw new Error(
      `Updated asset record was invalid: ${normalizedId}`,
    );
  }

  const validation =
    validateMyWayAssetRecord(normalized);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  normalized.created_at = current.created_at;
  normalized.updated_at =
    new Date().toISOString();
  registry.assets[index] = normalized;

  await saveMyWayAssetRegistry(registry);
  return normalized;
}

export async function reviewMyWayAssetForScenes(input: {
  assetId: string;
  sceneReviewStatus: "pending" | "approved" | "rejected";
  notes?: string | null;
}) {
  const current = await getMyWayAsset(input.assetId);

  if (!current) {
    throw new Error(
      `Asset was not found in the registry: ${safeAssetId(input.assetId)}`,
    );
  }

  if (
    input.sceneReviewStatus === "approved" &&
    (!current.safe_to_use_in_sandbox ||
      current.status === "rejected")
  ) {
    throw new Error(
      "This asset cannot be approved for scenes because it is rejected or not safe for sandbox use.",
    );
  }

  if (
    input.sceneReviewStatus === "approved" &&
    current.semantic_review_status !== "verified"
  ) {
    throw new Error(
      "Verify the asset's semantic identity before approving it for automatic scene use.",
    );
  }

  const reviewedAt =
    input.sceneReviewStatus === "pending"
      ? null
      : new Date().toISOString();

  return updateMyWayAsset(current.asset_id, {
    scene_review_status: input.sceneReviewStatus,
    scene_reviewed_at: reviewedAt,
    scene_review_notes:
      typeof input.notes === "string" && input.notes.trim()
        ? input.notes.trim()
        : null,
  });
}

export async function reviewMyWayAssetSemanticIdentity(input: {
  assetId: string;
  semanticReviewStatus:
    | "pending"
    | "verified"
    | "mismatch"
    | "rejected";
  verifiedCanonicalLabel?: string | null;
  verifiedAliases?: string[];
  objectComposition?:
    | "single_object"
    | "object_set"
    | "environment_piece"
    | "unknown";
  contains?: string[];
  affordances?: string[];
  preferredForConcepts?: string[];
  notes?: string | null;
}) {
  const current = await getMyWayAsset(input.assetId);

  if (!current) {
    throw new Error(
      `Asset was not found in the registry: ${safeAssetId(input.assetId)}`,
    );
  }

  const verifiedCanonicalLabel =
    typeof input.verifiedCanonicalLabel === "string" &&
    input.verifiedCanonicalLabel.trim()
      ? input.verifiedCanonicalLabel.trim().toLowerCase()
      : null;

  if (
    input.semanticReviewStatus === "verified" &&
    !verifiedCanonicalLabel
  ) {
    throw new Error(
      "A verified canonical label is required before semantic verification.",
    );
  }

  return updateMyWayAsset(current.asset_id, {
    verified_canonical_label: verifiedCanonicalLabel,
    verified_aliases: input.verifiedAliases ?? [],
    semantic_review_status: input.semanticReviewStatus,
    semantic_reviewed_at:
      input.semanticReviewStatus === "pending"
        ? null
        : new Date().toISOString(),
    semantic_review_notes:
      typeof input.notes === "string" && input.notes.trim()
        ? input.notes.trim()
        : null,
    object_composition:
      input.objectComposition ??
      current.object_composition ??
      "unknown",
    contains: input.contains ?? current.contains ?? [],
    affordances:
      input.affordances ?? current.affordances ?? [],
    preferred_for_concepts:
      input.preferredForConcepts ??
      current.preferred_for_concepts ??
      [],
    scene_review_status:
      input.semanticReviewStatus === "mismatch" ||
      input.semanticReviewStatus === "rejected"
        ? "pending"
        : current.scene_review_status,
    scene_reviewed_at:
      input.semanticReviewStatus === "mismatch" ||
      input.semanticReviewStatus === "rejected"
        ? null
        : current.scene_reviewed_at,
  });
}

export async function listSceneApprovedAssets() {
  return (await listMyWayAssets()).filter(
    (asset) =>
      asset.scene_review_status === "approved" &&
      asset.semantic_review_status === "verified" &&
      asset.safe_to_use_in_sandbox &&
      asset.status !== "rejected",
  );
}

export async function touchAssetReuse(
  assetId: string,
) {
  const registry = await loadMyWayAssetRegistry();
  const asset = registry.assets.find(
    (candidate) =>
      candidate.asset_id ===
      safeAssetId(assetId),
  );

  if (!asset) return null;

  asset.reuse_count += 1;
  asset.updated_at = new Date().toISOString();
  await saveMyWayAssetRegistry(registry);
  return asset;
}

function isRemoteUrl(value: string) {
  return /^https:\/\//i.test(value);
}

export async function assetWithFileStats(
  asset: MyWayAssetRecord,
) {
  if (asset.asset_type === "primitive") {
    return {
      ...asset,
      file_stats: {
        exists: true,
        file_size_bytes: null,
        project_relative_path: null,
        storage_provider:
          asset.storage_provider ?? "local",
        remote_url: null,
      },
    };
  }

  if (isRemoteUrl(asset.public_path)) {
    return {
      ...asset,
      file_stats: {
        exists: true,
        file_size_bytes:
          asset.file_size_bytes ?? null,
        project_relative_path: null,
        storage_provider:
          asset.storage_provider ?? "r2",
        remote_url: asset.public_path,
      },
    };
  }

  const fullPath = publicUrlToProjectPath(
    asset.public_path,
  );

  try {
    const info = await stat(fullPath);

    return {
      ...asset,
      file_stats: {
        exists: info.isFile(),
        file_size_bytes: info.size,
        project_relative_path: path
          .relative(process.cwd(), fullPath)
          .replace(/\\/g, "/"),
        storage_provider:
          asset.storage_provider ?? "local",
        remote_url: null,
      },
    };
  } catch {
    return {
      ...asset,
      file_stats: {
        exists: false,
        file_size_bytes: null,
        project_relative_path: path
          .relative(process.cwd(), fullPath)
          .replace(/\\/g, "/"),
        storage_provider:
          asset.storage_provider ?? "local",
        remote_url: null,
      },
    };
  }
}
