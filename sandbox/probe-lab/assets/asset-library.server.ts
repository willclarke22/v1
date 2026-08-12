import {
  mkdir,
  readdir,
  rename as renameFile,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import type {
  MyWayAssetRecord,
  MyWayAssetRegistryV2,
} from "./asset-types";
import {
  normalizeMyWayAssetRecord,
  safeAssetId,
} from "./normalize-asset-record";
import {
  ensureAssetDirectories,
  MYWAY_ASSET_LIBRARY_PROJECT_PATH,
  MYWAY_ASSET_REGISTRY_PROJECT_PATH,
  MYWAY_MISSING_ASSET_QUEUE_PROJECT_PATH,
  MYWAY_SCENE_MANIFEST_PROJECT_PATH,
  projectPath,
  projectRoot,
  publicUrlToProjectPath,
} from "./paths.server";
import { validateMyWayAssetRecord } from "./validate-asset-record";
import {
  attributionCompletenessIssues,
  buildAssetAttribution,
  licensePolicyForKind,
} from "./asset-attribution";
import {
  readJsonFileWithRetry,
  writeJsonFileAtomic,
} from "./json-file.server";
import {
  cloudAssetMetadataEnabled,
  keepLocalAssetMetadataMirror,
  readCloudJson,
  writeCloudJson,
} from "./storage/cloud-json.server";
import {
  deleteDurableAssetJson,
  durableAssetCloudEnabled,
  readDurableAssetJson,
  writeDurableAssetJson,
} from "./storage/asset-durable-artifacts.server";
import {
  applyWorkflowCloudReferenceMutation,
  collectWorkflowCloudReferenceMutations,
  rollbackWorkflowCloudReferenceMutation,
  type WorkflowCloudReferenceMutation,
} from "./storage/workflow-durable-state.server";

let writeQueue: Promise<unknown> = Promise.resolve();

const MYWAY_ASSET_REGISTRY_CLOUD_KEY =
  "metadata/myway/assets/registry-v2.json";

type JsonReferenceMutation = {
  file_path: string;
  original: unknown;
  next: unknown;
};

function replaceExactStringReferences(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") {
    return replacements.get(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceExactStringReferences(
        item,
        replacements,
      ),
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      ).map(([key, item]) => [
        key,
        replaceExactStringReferences(
          item,
          replacements,
        ),
      ]),
    );
  }

  return value;
}

const ASSET_EMBEDDING_DIRECTORY =
  "sandbox/probe-lab/assets/embeddings";

function canonicalEmbeddingVectorKey(
  assetId: string,
) {
  return `${ASSET_EMBEDDING_DIRECTORY}/${safeAssetId(assetId)}.json`;
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException).code ===
      "ENOENT"
    ) {
      return false;
    }
    throw caught;
  }
}

function queueIdentityEmbeddingRefresh(
  assetId: string,
) {
  void import(
    "./enrichment/asset-enrichment-worker.server"
  )
    .then(({ queueAssetEmbeddingRefresh }) => {
      queueAssetEmbeddingRefresh(assetId);
    })
    .catch(() => undefined);
}

function projectPathFromStoredReference(
  storedPath: string,
) {
  const normalized = storedPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (
    normalized.includes("../") ||
    path.isAbsolute(storedPath)
  ) {
    return null;
  }

  return projectPath(
    ...normalized.split("/").filter(Boolean),
  );
}

async function listJsonFiles(
  relativeDirectory: string,
) {
  try {
    const directory = projectPath(
      ...relativeDirectory
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean),
    );
    const entries = await readdir(
      directory,
      { withFileTypes: true },
    );

    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.toLowerCase().endsWith(".json"),
      )
      .map((entry) =>
        path.join(directory, entry.name),
      );
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException).code ===
      "ENOENT"
    ) {
      return [];
    }
    throw caught;
  }
}

async function collectJsonReferenceMutation(
  filePath: string,
  replacements: ReadonlyMap<string, string>,
): Promise<JsonReferenceMutation | null> {
  try {
    const original =
      await readJsonFileWithRetry<unknown>(
        filePath,
      );
    const next =
      replaceExactStringReferences(
        original,
        replacements,
      );

    return JSON.stringify(original) ===
      JSON.stringify(next)
      ? null
      : {
          file_path: filePath,
          original,
          next,
        };
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException).code ===
      "ENOENT"
    ) {
      return null;
    }
    throw caught;
  }
}

function emptyRegistry(): MyWayAssetRegistryV2 {
  return {
    schema_version: "myway_asset_registry_v2",
    updated_at: new Date().toISOString(),
    asset_root_public_url: "/sandbox-assets/myway",
    notes: "Shared MyWay sandbox asset library.",
    assets: [],
  };
}

function normalizeLoadedRegistry(
  parsed: Partial<MyWayAssetRegistryV2>,
): MyWayAssetRegistryV2 {
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
}


function isCompactedLocalRegistry(
  registry: MyWayAssetRegistryV2,
) {
  return (
    registry.assets.length === 0 &&
    Boolean(
      registry.notes
        ?.toLowerCase()
        .includes(
          "authoritative copy is stored in r2",
        ),
    )
  );
}

async function readLocalMyWayAssetRegistry(
  registryPath: string,
) {
  try {
    const parsed =
      await readJsonFileWithRetry<
        Partial<MyWayAssetRegistryV2>
      >(registryPath);

    return normalizeLoadedRegistry(
      parsed,
    );
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException).code ===
      "ENOENT"
    ) {
      return null;
    }

    throw caught;
  }
}

export async function restoreMyWayAssetRegistryToCloudFromLocal(): Promise<MyWayAssetRegistryV2> {
  if (!cloudAssetMetadataEnabled()) {
    throw new Error(
      "R2 asset metadata storage is not enabled.",
    );
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "Local asset-registry recovery is only available from the local development environment.",
    );
  }

  const registryPath =
    projectPath(
      MYWAY_ASSET_REGISTRY_PROJECT_PATH,
    );
  const local =
    await readLocalMyWayAssetRegistry(
      registryPath,
    );

  if (!local) {
    throw new Error(
      "The local asset registry is missing, so it cannot be used for explicit R2 recovery.",
    );
  }

  if (isCompactedLocalRegistry(local)) {
    throw new Error(
      "The local asset registry is only a compact cloud bootstrap record. It cannot restore the authoritative R2 registry.",
    );
  }

  await writeCloudJson(
    MYWAY_ASSET_REGISTRY_CLOUD_KEY,
    local,
  );

  const restored =
    await readCloudJson<
      Partial<MyWayAssetRegistryV2>
    >(
      MYWAY_ASSET_REGISTRY_CLOUD_KEY,
    );

  if (!restored) {
    throw new Error(
      "Explicit asset-registry recovery wrote to R2 but verification failed.",
    );
  }

  return normalizeLoadedRegistry(
    restored,
  );
}

export async function loadMyWayAssetRegistry(): Promise<MyWayAssetRegistryV2> {
  const registryPath =
    projectPath(
      MYWAY_ASSET_REGISTRY_PROJECT_PATH,
    );

  if (cloudAssetMetadataEnabled()) {
    const remoteRaw =
      await readCloudJson<
        Partial<MyWayAssetRegistryV2>
      >(
        MYWAY_ASSET_REGISTRY_CLOUD_KEY,
      );

    if (!remoteRaw) {
      throw new Error(
        `Authoritative R2 asset registry is missing: ${MYWAY_ASSET_REGISTRY_CLOUD_KEY}. ` +
        "Normal reads never restore it from this laptop. Use the explicit cloud migration/recovery action if a verified local source still exists.",
      );
    }

    return normalizeLoadedRegistry(
      remoteRaw,
    );
  }

  const local =
    await readLocalMyWayAssetRegistry(
      registryPath,
    );

  if (local) {
    return local;
  }

  const registry =
    emptyRegistry();

  if (keepLocalAssetMetadataMirror()) {
    await ensureAssetDirectories();
    await writeJsonFileAtomic(
      registryPath,
      registry,
    );
  }

  return registry;
}

async function saveRegistryUnlocked(
  registry: MyWayAssetRegistryV2,
) {
  registry.updated_at =
    new Date().toISOString();

  if (cloudAssetMetadataEnabled()) {
    await writeCloudJson(
      MYWAY_ASSET_REGISTRY_CLOUD_KEY,
      registry,
    );
  }

  if (keepLocalAssetMetadataMirror()) {
    await ensureAssetDirectories();
    await writeJsonFileAtomic(
      projectPath(
        MYWAY_ASSET_REGISTRY_PROJECT_PATH,
      ),
      registry,
    );
  }
}

export function saveMyWayAssetRegistry(
  registry: MyWayAssetRegistryV2,
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

  const created = existingIndex < 0;
  if (
    created &&
    asset.asset_type !== "primitive" &&
    asset.status !== "rejected"
  ) {
    void import(
      "./enrichment/asset-enrichment-worker.server"
    )
      .then(({ queueAssetEnrichment }) => {
        queueAssetEnrichment(asset.asset_id);
      })
      .catch(() => undefined);
  }

  return {
    asset,
    created,
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


export type UpdateMyWayAssetProvenanceInput = {
  assetId: string;
  sourceProvider: string;
  sourceAssetId: string;
  sourceUrl: string;
  assetTitle: string;
  creatorName?: string | null;
  licenseKind: MyWayAssetRecord["license_kind"];
  licenseVersion?: string | null;
  attributionText?: string | null;
  modificationNotice?: string | null;
  downloadedAt?: string | null;
  provenanceNotes?: string | null;
};

async function readJsonIfPresent(
  filePath: string,
) {
  try {
    return await readJsonFileWithRetry<
      Record<string, unknown>
    >(filePath);
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException)
        .code === "ENOENT"
    ) {
      return null;
    }
    throw caught;
  }
}

export async function updateMyWayAssetProvenance(
  input: UpdateMyWayAssetProvenanceInput,
) {
  await ensureAssetDirectories();
  const current = await getMyWayAsset(
    input.assetId,
  );
  if (!current) {
    throw new Error(
      `Asset was not found in the registry: ${safeAssetId(
        input.assetId,
      )}`,
    );
  }
  if (
    current.storage_provider === "r2" ||
    current.promoted_at ||
    current.license_review_id
  ) {
    throw new Error(
      "Licence and source metadata cannot be rewritten after public promotion or formal licence approval. Create a new reviewed asset version instead.",
    );
  }

  const sourceProvider =
    input.sourceProvider.trim();
  const sourceAssetId =
    input.sourceAssetId.trim();
  const sourceUrl = input.sourceUrl.trim();
  const assetTitle = input.assetTitle.trim();
  if (
    !sourceProvider ||
    !sourceAssetId ||
    !sourceUrl ||
    !assetTitle
  ) {
    throw new Error(
      "Source provider, stable source asset ID, source URL, and asset title are required.",
    );
  }

  const attribution = buildAssetAttribution({
    licenseKind: input.licenseKind,
    attributionText:
      input.attributionText,
    assetTitle,
    creatorName: input.creatorName,
    sourceProvider,
    sourceAssetId,
    sourceUrl,
    modificationNotice:
      input.modificationNotice,
    downloadedAt: input.downloadedAt,
    licenseVersion: input.licenseVersion,
  });
  const issues =
    attributionCompletenessIssues(
      attribution,
    );
  if (issues.length) {
    throw new Error(
      `Attribution-required provenance is incomplete: ${issues.join(
        "; ",
      )}`,
    );
  }

  const sourceRecordRelativePath =
    `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/source-records/${current.asset_id}.json`;
  const licenseRelativePath =
    current.license_record_path &&
    !/^https?:\/\//i.test(
      current.license_record_path,
    )
      ? current.license_record_path
      : `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/licenses/${current.asset_id}.manual.review.json`;
  const previousSource =
    await readDurableAssetJson<Record<string, unknown>>(
      sourceRecordRelativePath,
    );
  const previousLicense =
    await readDurableAssetJson<Record<string, unknown>>(
      licenseRelativePath,
    );
  const now = new Date().toISOString();
  const sourceRecord = {
    ...(previousSource ?? {}),
    schema_version:
      previousSource?.schema_version ??
      "myway_manual_asset_source_record_v1",
    asset_id: current.asset_id,
    source_provider: sourceProvider,
    source_asset_id: sourceAssetId,
    source_url: sourceUrl,
    asset_title: assetTitle,
    creator_name:
      attribution.creator_name,
    license_kind_asserted_by_user:
      input.licenseKind,
    license_version_asserted_by_user:
      attribution.license_version,
    attribution,
    provenance_notes:
      input.provenanceNotes?.trim() ||
      null,
    updated_at: now,
  };
  const policy = licensePolicyForKind(
    input.licenseKind,
  );
  const licenseDraft = {
    ...(previousLicense ?? {}),
    schema_version:
      "myway_manual_asset_license_review_v1",
    asset_id: current.asset_id,
    review_status:
      "needs_human_review",
    source_provider: sourceProvider,
    source_asset_id: sourceAssetId,
    source_url: sourceUrl,
    asset_title: assetTitle,
    creator_name:
      attribution.creator_name,
    license_kind_asserted_by_user:
      input.licenseKind,
    license_version_asserted_by_user:
      attribution.license_version,
    commercial_use_allowed_asserted_by_user:
      policy.commercialUseAllowed,
    raw_redistribution_allowed_asserted_by_user:
      policy.rawRedistributionAllowed,
    attribution,
    provenance_notes:
      input.provenanceNotes?.trim() ||
      null,
    warning:
      "MyWay records the uploader's assertion but does not independently verify third-party terms. Verify the source terms before app promotion.",
    updated_at: now,
  };

  try {
    await writeDurableAssetJson(
      sourceRecordRelativePath,
      sourceRecord,
    );
    await writeDurableAssetJson(
      licenseRelativePath,
      licenseDraft,
    );

    const asset = await updateMyWayAsset(
      current.asset_id,
      {
        source_display_name:
          `${sourceProvider}: ${assetTitle}`,
        source_asset_id: sourceAssetId,
        source_url: sourceUrl,
        attribution,
        license_kind: input.licenseKind,
        license_record_path:
          licenseRelativePath,
        license_status:
          policy.licenseStatus,
        commercial_use_allowed:
          policy.commercialUseAllowed,
        raw_redistribution_allowed:
          policy.rawRedistributionAllowed,
        safe_to_promote_to_app: false,
        license_review_id: null,
        promoted_at: null,
        status: "normalized",
        scene_review_status: "pending",
        scene_reviewed_at: null,
        scene_review_notes:
          "Licence or provenance changed; scene eligibility must be reviewed again.",
        notes: [
          current.notes,
          `Licence and provenance updated on ${now}; formal licence and scene review were reset.`,
        ]
          .filter(Boolean)
          .join(" "),
      },
    );

    return {
      asset,
      source_record_path:
        sourceRecordRelativePath,
      license_record_path:
        licenseRelativePath,
    };
  } catch (caught) {
    if (previousSource) {
      await writeDurableAssetJson(
        sourceRecordRelativePath,
        previousSource,
      ).catch(() => undefined);
    } else {
      await deleteDurableAssetJson(
        sourceRecordRelativePath,
      ).catch(() => undefined);
    }
    if (previousLicense) {
      await writeDurableAssetJson(
        licenseRelativePath,
        previousLicense,
      ).catch(() => undefined);
    } else {
      await deleteDurableAssetJson(
        licenseRelativePath,
      ).catch(() => undefined);
    }
    throw caught;
  }
}

export async function renameMyWayAssetId(input: {
  assetId: string;
  nextAssetId: string;
}) {
  await ensureAssetDirectories();

  const previousAssetId =
    safeAssetId(input.assetId);
  const nextAssetId =
    safeAssetId(input.nextAssetId);

  if (!previousAssetId) {
    throw new Error(
      "The current asset ID is required.",
    );
  }

  if (!nextAssetId) {
    throw new Error(
      "The new asset ID must contain at least one letter or number.",
    );
  }

  const registry =
    await loadMyWayAssetRegistry();
  const index = registry.assets.findIndex(
    (asset) =>
      asset.asset_id === previousAssetId,
  );

  if (index < 0) {
    throw new Error(
      `Asset was not found in the registry: ${previousAssetId}`,
    );
  }

  if (previousAssetId === nextAssetId) {
    const repaired =
      await repairMyWayAssetIdentityArtifacts({
        assetId: previousAssetId,
        queueEmbeddingRefresh: false,
      });
    return {
      asset: repaired.asset,
      renamed_from: previousAssetId,
      updated_reference_files:
        repaired.updated_reference_files,
      moved_identity_files:
        repaired.moved_identity_files,
    };
  }

  if (
    registry.assets.some(
      (asset) =>
        asset.asset_id === nextAssetId,
    )
  ) {
    throw new Error(
      `Another asset already uses the ID "${nextAssetId}".`,
    );
  }

  const current = registry.assets[index]!;
  const previousVectorKey =
    current.appearance_embedding?.vector_key ??
    null;
  const nextVectorKey = previousVectorKey
    ? canonicalEmbeddingVectorKey(nextAssetId)
    : null;
  const previousVectorPath = previousVectorKey
    ? projectPathFromStoredReference(
        previousVectorKey,
      )
    : null;
  const nextVectorPath = nextVectorKey
    ? projectPathFromStoredReference(
        nextVectorKey,
      )
    : null;
  const cloudDurableMetadata =
    durableAssetCloudEnabled();
  const previousVectorExists =
    previousVectorPath
      ? await fileExists(previousVectorPath)
      : false;
  const previousDurableVector =
    previousVectorKey
      ? await readDurableAssetJson<
          Record<string, unknown>
        >(previousVectorKey)
      : null;
  const embeddingRefreshQueued =
    Boolean(
      current.appearance_embedding &&
      (
        cloudDurableMetadata
          ? !previousDurableVector
          : !previousVectorExists &&
            !previousDurableVector
      ),
    );

  const renamed: MyWayAssetRecord = {
    ...current,
    asset_id: nextAssetId,
    appearance_embedding:
      current.appearance_embedding
        ? {
            ...current.appearance_embedding,
            status: embeddingRefreshQueued
              ? "pending"
              : current.appearance_embedding.status,
            vector_key: nextVectorKey,
            source_text_hash: embeddingRefreshQueued
              ? null
              : current.appearance_embedding.source_text_hash,
            embedded_at: embeddingRefreshQueued
              ? null
              : current.appearance_embedding.embedded_at,
            error: embeddingRefreshQueued
              ? null
              : current.appearance_embedding.error,
          }
        : undefined,
    updated_at: new Date().toISOString(),
  };

  const validation =
    validateMyWayAssetRecord(renamed);

  if (!validation.ok) {
    throw new Error(
      validation.errors.join("; "),
    );
  }

  const referenceFiles = new Set<string>([
    projectPath(
      MYWAY_MISSING_ASSET_QUEUE_PROJECT_PATH,
    ),
    ...(await listJsonFiles(
      MYWAY_SCENE_MANIFEST_PROJECT_PATH,
    )),
    ...(await listJsonFiles(
      `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/source-records`,
    )),
  ]);

  if (
    current.license_record_path &&
    !/^https?:\/\//i.test(
      current.license_record_path,
    )
  ) {
    const licensePath =
      projectPathFromStoredReference(
        current.license_record_path,
      );
    if (licensePath) {
      referenceFiles.add(licensePath);
    }
  }

  if (previousVectorPath) {
    referenceFiles.add(previousVectorPath);
  }

  const replacements = new Map<string, string>([
    [previousAssetId, nextAssetId],
  ]);
  if (
    previousVectorKey &&
    nextVectorKey &&
    previousVectorKey !== nextVectorKey
  ) {
    replacements.set(
      previousVectorKey,
      nextVectorKey,
    );
  }

  const mutations = (
    await Promise.all(
      [...referenceFiles].map((filePath) =>
        collectJsonReferenceMutation(
          filePath,
          replacements,
        ),
      ),
    )
  ).filter(
    (
      mutation,
    ): mutation is JsonReferenceMutation =>
      Boolean(mutation),
  );

  const workflowCloudMutations =
    await collectWorkflowCloudReferenceMutations(
      replacements,
    );

  const applied: JsonReferenceMutation[] =
    [];
  const appliedWorkflowCloudMutations:
    WorkflowCloudReferenceMutation[] =
    [];
  let vectorMoved = false;
  let durableVectorCopied = false;

  try {
    for (const mutation of mutations) {
      await writeJsonFileAtomic(
        mutation.file_path,
        mutation.next,
      );
      applied.push(mutation);
    }

    for (
      const mutation of
      workflowCloudMutations
    ) {
      await applyWorkflowCloudReferenceMutation(
        mutation,
      );
      appliedWorkflowCloudMutations.push(
        mutation,
      );
    }

    if (
      previousDurableVector &&
      !previousVectorExists &&
      previousVectorKey &&
      nextVectorKey &&
      previousVectorKey !== nextVectorKey
    ) {
      await writeDurableAssetJson(
        nextVectorKey,
        {
          ...previousDurableVector,
          asset_id: nextAssetId,
        },
      );
      durableVectorCopied = true;
    }

    if (
      previousVectorPath &&
      nextVectorPath &&
      previousVectorPath !== nextVectorPath &&
      previousVectorExists &&
      (
        !cloudDurableMetadata ||
        keepLocalAssetMetadataMirror()
      )
    ) {
      if (await fileExists(nextVectorPath)) {
        throw new Error(
          `The canonical embedding filename already exists: ${nextVectorKey}`,
        );
      }
      await mkdir(
        path.dirname(nextVectorPath),
        { recursive: true },
      );
      await renameFile(
        previousVectorPath,
        nextVectorPath,
      );
      vectorMoved = true;
    }

    registry.assets[index] = renamed;
    await saveMyWayAssetRegistry(registry);

    if (
      durableVectorCopied &&
      previousVectorKey &&
      previousVectorKey !== nextVectorKey
    ) {
      await deleteDurableAssetJson(
        previousVectorKey,
      );
    }
  } catch (caught) {
    if (
      durableVectorCopied &&
      nextVectorKey
    ) {
      await deleteDurableAssetJson(
        nextVectorKey,
      ).catch(() => undefined);
    }
    if (
      vectorMoved &&
      previousVectorPath &&
      nextVectorPath
    ) {
      await renameFile(
        nextVectorPath,
        previousVectorPath,
      ).catch(() => undefined);
    }
    for (
      const mutation of
      appliedWorkflowCloudMutations
        .slice()
        .reverse()
    ) {
      await rollbackWorkflowCloudReferenceMutation(
        mutation,
      ).catch(
        () => undefined,
      );
    }

    for (
      const mutation of applied
        .slice()
        .reverse()
    ) {
      await writeJsonFileAtomic(
        mutation.file_path,
        mutation.original,
      ).catch(() => undefined);
    }
    throw caught;
  }

  if (embeddingRefreshQueued) {
    queueIdentityEmbeddingRefresh(
      renamed.asset_id,
    );
  }

  return {
    asset: renamed,
    renamed_from: previousAssetId,
    updated_reference_files: [
      ...mutations.map(
        (mutation) =>
          path.relative(
            projectRoot(),
            mutation.file_path,
          ),
      ),
      ...workflowCloudMutations.map(
        (mutation) =>
          `r2-source:${mutation.object_key}`,
      ),
    ],
    moved_identity_files:
      (vectorMoved || durableVectorCopied) &&
      nextVectorKey
        ? [nextVectorKey]
        : [],
    embedding_refresh_queued:
      embeddingRefreshQueued,
  };
}

export async function updateMyWayAssetCanonicalLabel(input: {
  assetId: string;
  canonicalLabel: string;
}) {
  const current = await getMyWayAsset(input.assetId);

  if (!current) {
    throw new Error(
      `Asset was not found in the registry: ${safeAssetId(input.assetId)}`,
    );
  }

  const canonicalLabel = input.canonicalLabel
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!canonicalLabel) {
    throw new Error(
      "A canonical label is required.",
    );
  }

  const previousCanonicalLabel =
    current.verified_canonical_label ??
    current.canonical_label;

  const existingEmbedding =
    current.appearance_embedding;
  const asset = await updateMyWayAsset(
    current.asset_id,
    {
      verified_canonical_label:
        canonicalLabel,
      semantic_review_status:
        "verified",
      semantic_reviewed_at:
        new Date().toISOString(),
      appearance_embedding: existingEmbedding
        ? {
            ...existingEmbedding,
            status: "pending",
            source_text_hash: null,
            embedded_at: null,
            error: null,
          }
        : existingEmbedding,
    },
  );

  if (existingEmbedding) {
    queueIdentityEmbeddingRefresh(
      asset.asset_id,
    );
  }

  return {
    asset,
    updated_from:
      previousCanonicalLabel,
    embedding_refresh_queued:
      Boolean(existingEmbedding),
  };
}


export async function repairMyWayAssetIdentityArtifacts(input: {
  assetId: string;
  queueEmbeddingRefresh?: boolean;
}) {
  await ensureAssetDirectories();

  const assetId = safeAssetId(input.assetId);
  const registry = await loadMyWayAssetRegistry();
  const index = registry.assets.findIndex(
    (asset) => asset.asset_id === assetId,
  );

  if (index < 0) {
    throw new Error(
      `Asset was not found in the registry: ${assetId}`,
    );
  }

  const current = registry.assets[index]!;
  const embedding = current.appearance_embedding;
  if (!embedding) {
    return {
      asset: current,
      moved_identity_files: [] as string[],
      updated_reference_files: [] as string[],
      embedding_refresh_queued: false,
      warnings: [] as string[],
    };
  }

  const expectedVectorKey =
    canonicalEmbeddingVectorKey(current.asset_id);
  const currentVectorKey =
    embedding.vector_key;
  const currentVectorPath = currentVectorKey
    ? projectPathFromStoredReference(
        currentVectorKey,
      )
    : null;
  const expectedVectorPath =
    projectPathFromStoredReference(
      expectedVectorKey,
    );

  if (!expectedVectorPath) {
    throw new Error(
      `Could not resolve the canonical embedding path for ${current.asset_id}.`,
    );
  }

  const currentExists = currentVectorPath
    ? await fileExists(currentVectorPath)
    : false;
  const expectedExists =
    await fileExists(expectedVectorPath);
  const durableCurrent =
    currentVectorKey
      ? await readDurableAssetJson<
          Record<string, unknown>
        >(currentVectorKey)
      : null;
  const durableExpected =
    expectedVectorKey === currentVectorKey
      ? durableCurrent
      : await readDurableAssetJson<
          Record<string, unknown>
        >(expectedVectorKey);

  if (
    currentVectorPath &&
    currentVectorPath !== expectedVectorPath &&
    currentExists &&
    expectedExists
  ) {
    throw new Error(
      `Both the old and canonical embedding files exist for ${current.asset_id}. Resolve the duplicate before continuing: ${currentVectorKey} and ${expectedVectorKey}`,
    );
  }

  const sourceVectorPath = currentExists
    ? currentVectorPath
    : expectedExists
      ? expectedVectorPath
      : null;
  const sourceVectorKey = currentExists
    ? currentVectorKey
    : expectedExists
      ? expectedVectorKey
      : durableCurrent
        ? currentVectorKey
        : durableExpected
          ? expectedVectorKey
          : null;
  const sourceVectorRecord =
    sourceVectorPath
      ? null
      : durableCurrent ??
        durableExpected;

  const replacements = new Map<string, string>();
  if (
    currentVectorKey &&
    currentVectorKey !== expectedVectorKey
  ) {
    replacements.set(
      currentVectorKey,
      expectedVectorKey,
    );
  }

  const referenceFiles = new Set<string>([
    projectPath(
      MYWAY_MISSING_ASSET_QUEUE_PROJECT_PATH,
    ),
    ...(await listJsonFiles(
      MYWAY_SCENE_MANIFEST_PROJECT_PATH,
    )),
    ...(await listJsonFiles(
      `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/source-records`,
    )),
  ]);
  if (sourceVectorPath) {
    referenceFiles.add(sourceVectorPath);
  }

  let sourceTextNeedsRefresh = false;
  const warnings: string[] = [];
  if (
    sourceVectorPath ||
    sourceVectorRecord
  ) {
    try {
      const stored =
        sourceVectorRecord ??
        await readJsonFileWithRetry<
          Record<string, unknown>
        >(sourceVectorPath!);
      const storedAssetId =
        typeof stored.asset_id === "string"
          ? safeAssetId(stored.asset_id)
          : "";
      if (
        storedAssetId &&
        storedAssetId !== current.asset_id
      ) {
        replacements.set(
          storedAssetId,
          current.asset_id,
        );
      }

      const identityLabel = (
        current.verified_canonical_label ??
        current.canonical_label
      )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      const sourceText =
        typeof stored.source_text === "string"
          ? stored.source_text.toLowerCase()
          : "";
      sourceTextNeedsRefresh =
        !sourceText.includes(
          `asset identity gate: ${identityLabel}`,
        );
    } catch (caught) {
      sourceTextNeedsRefresh = true;
      warnings.push(
        `The embedding JSON could not be inspected: ${
          caught instanceof Error
            ? caught.message
            : String(caught)
        }`,
      );
    }
  } else {
    sourceTextNeedsRefresh = true;
    warnings.push(
      "The embedding metadata exists, but neither its local nor private-R2 vector object could be found.",
    );
  }

  const mutations = replacements.size > 0
    ? (
        await Promise.all(
          [...referenceFiles].map((filePath) =>
            collectJsonReferenceMutation(
              filePath,
              replacements,
            ),
          ),
        )
      ).filter(
        (
          mutation,
        ): mutation is JsonReferenceMutation =>
          Boolean(mutation),
      )
    : [];

  const workflowCloudMutations =
    replacements.size > 0
      ? await collectWorkflowCloudReferenceMutations(
          replacements,
        )
      : [];

  const shouldQueueRefresh =
    input.queueEmbeddingRefresh !== false &&
    sourceTextNeedsRefresh;
  const repaired: MyWayAssetRecord = {
    ...current,
    appearance_embedding: {
      ...embedding,
      status: shouldQueueRefresh
        ? "pending"
        : embedding.status,
      vector_key: expectedVectorKey,
      source_text_hash: shouldQueueRefresh
        ? null
        : embedding.source_text_hash,
      embedded_at: shouldQueueRefresh
        ? null
        : embedding.embedded_at,
      error: shouldQueueRefresh
        ? null
        : embedding.error,
    },
    updated_at: new Date().toISOString(),
  };

  const validation =
    validateMyWayAssetRecord(repaired);
  if (!validation.ok) {
    throw new Error(
      validation.errors.join("; "),
    );
  }

  const applied: JsonReferenceMutation[] = [];
  const appliedWorkflowCloudMutations:
    WorkflowCloudReferenceMutation[] =
    [];
  let vectorMoved = false;
  let durableVectorCopied = false;

  try {
    for (const mutation of mutations) {
      await writeJsonFileAtomic(
        mutation.file_path,
        mutation.next,
      );
      applied.push(mutation);
    }

    for (
      const mutation of
      workflowCloudMutations
    ) {
      await applyWorkflowCloudReferenceMutation(
        mutation,
      );
      appliedWorkflowCloudMutations.push(
        mutation,
      );
    }

    if (
      sourceVectorRecord &&
      sourceVectorKey &&
      sourceVectorKey !== expectedVectorKey
    ) {
      await writeDurableAssetJson(
        expectedVectorKey,
        {
          ...sourceVectorRecord,
          asset_id: current.asset_id,
        },
      );
      durableVectorCopied = true;
    }

    if (
      sourceVectorPath &&
      sourceVectorPath !== expectedVectorPath
    ) {
      await mkdir(
        path.dirname(expectedVectorPath),
        { recursive: true },
      );
      await renameFile(
        sourceVectorPath,
        expectedVectorPath,
      );
      vectorMoved = true;
    }

    registry.assets[index] = repaired;
    await saveMyWayAssetRegistry(registry);

    if (
      durableVectorCopied &&
      sourceVectorKey &&
      sourceVectorKey !== expectedVectorKey
    ) {
      await deleteDurableAssetJson(
        sourceVectorKey,
      );
    }
  } catch (caught) {
    if (durableVectorCopied) {
      await deleteDurableAssetJson(
        expectedVectorKey,
      ).catch(() => undefined);
    }
    if (
      vectorMoved &&
      sourceVectorPath
    ) {
      await renameFile(
        expectedVectorPath,
        sourceVectorPath,
      ).catch(() => undefined);
    }
    for (
      const mutation of
      appliedWorkflowCloudMutations
        .slice()
        .reverse()
    ) {
      await rollbackWorkflowCloudReferenceMutation(
        mutation,
      ).catch(
        () => undefined,
      );
    }

    for (
      const mutation of applied
        .slice()
        .reverse()
    ) {
      await writeJsonFileAtomic(
        mutation.file_path,
        mutation.original,
      ).catch(() => undefined);
    }
    throw caught;
  }

  if (shouldQueueRefresh) {
    queueIdentityEmbeddingRefresh(
      repaired.asset_id,
    );
  }

  return {
    asset: repaired,
    moved_identity_files:
      vectorMoved || durableVectorCopied
        ? [expectedVectorKey]
        : [],
    updated_reference_files: [
      ...mutations.map((mutation) =>
        path.relative(
          projectRoot(),
          mutation.file_path,
        ),
      ),
      ...workflowCloudMutations.map(
        (mutation) =>
          `r2-source:${mutation.object_key}`,
      ),
    ],
    embedding_refresh_queued:
      shouldQueueRefresh,
    warnings,
  };
}

export async function repairAllMyWayAssetIdentityArtifacts() {
  const assets = await listMyWayAssets();
  const repaired: Array<{
    asset_id: string;
    moved_identity_files: string[];
    updated_reference_files: string[];
    embedding_refresh_queued: boolean;
    warnings: string[];
  }> = [];
  const failed: Array<{
    asset_id: string;
    error: string;
  }> = [];

  for (const asset of assets) {
    try {
      const result =
        await repairMyWayAssetIdentityArtifacts({
          assetId: asset.asset_id,
          queueEmbeddingRefresh: true,
        });
      repaired.push({
        asset_id: result.asset.asset_id,
        moved_identity_files:
          result.moved_identity_files,
        updated_reference_files:
          result.updated_reference_files,
        embedding_refresh_queued:
          result.embedding_refresh_queued,
        warnings: result.warnings,
      });
    } catch (caught) {
      failed.push({
        asset_id: asset.asset_id,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  return {
    repaired,
    failed,
  };
}


export async function updateMyWayAssetAliases(input: {
  assetId: string;
  aliases: string[];
}) {
  const current = await getMyWayAsset(input.assetId);

  if (!current) {
    throw new Error(
      `Asset was not found in the registry: ${safeAssetId(input.assetId)}`,
    );
  }

  const canonical = (
    current.verified_canonical_label ??
    current.canonical_label
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  const aliases = Array.from(
    new Set(
      input.aliases
        .map((value) =>
          value
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " "),
        )
        .filter(
          (value) =>
            Boolean(value) &&
            value !== canonical,
        ),
    ),
  );

  const previousAliases = Array.from(
    new Set([
      ...(current.verified_aliases ?? []),
      ...current.aliases,
    ]),
  );

  const asset = await updateMyWayAsset(
    current.asset_id,
    {
      // aliases is the active identity synonym set. Keep the verified copy in
      // sync so older imported assets can be edited, including removals.
      aliases,
      verified_aliases: aliases,
      semantic_review_status:
        current.semantic_review_status ===
        "verified"
          ? "verified"
          : current.semantic_review_status,
      semantic_reviewed_at:
        current.semantic_review_status ===
        "verified"
          ? new Date().toISOString()
          : current.semantic_reviewed_at,
    },
  );

  return {
    asset,
    updated_from: previousAliases,
  };
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

  const previousIdentityLabel = (
    current.verified_canonical_label ??
    current.canonical_label
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const nextIdentityLabel = (
    verifiedCanonicalLabel ??
    current.canonical_label
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const identityChanged =
    previousIdentityLabel !==
    nextIdentityLabel;
  const existingEmbedding =
    current.appearance_embedding;

  const updated = await updateMyWayAsset(current.asset_id, {
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
    appearance_embedding:
      identityChanged && existingEmbedding
        ? {
            ...existingEmbedding,
            status: "pending",
            source_text_hash: null,
            embedded_at: null,
            error: null,
          }
        : existingEmbedding,
  });

  if (identityChanged && existingEmbedding) {
    queueIdentityEmbeddingRefresh(
      updated.asset_id,
    );
  }

  return updated;
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
