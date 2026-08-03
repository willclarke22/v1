import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  readJsonFileWithRetry,
  writeJsonFileAtomic,
} from "../../json-file.server";
import { projectPath } from "../../paths.server";
import {
  canWriteProjectAssetFiles,
  cloudAssetMetadataEnabled,
  keepLocalAssetMetadataMirror,
  readCloudJson,
  writeCloudJson,
} from "../../storage/cloud-json.server";
import { hasR2AssetStorageEnvironment } from "../../storage/r2-asset-storage.server";
import type {
  AmbientCgCatalogDocument,
  AmbientCgDownloadJobRegistry,
  AmbientCgHdriRegistry,
  AmbientCgMaterialAppearanceRegistry,
  AmbientCgMaterialRegistry,
  AmbientCgResourceRegistry,
  AmbientCgStorageStatus,
  AmbientCgSyncState,
} from "./ambientcg-types";

export const AMBIENTCG_CATALOG_ROOT =
  "sandbox/probe-lab/assets/catalog/ambientcg";
export const AMBIENTCG_CATALOG_FILE =
  `${AMBIENTCG_CATALOG_ROOT}/catalog.json`;
export const AMBIENTCG_SYNC_STATE_FILE =
  `${AMBIENTCG_CATALOG_ROOT}/sync-state.json`;
export const AMBIENTCG_CATEGORIES_FILE =
  `${AMBIENTCG_CATALOG_ROOT}/categories.json`;
export const AMBIENTCG_COLLECTIONS_FILE =
  `${AMBIENTCG_CATALOG_ROOT}/collections.json`;
export const AMBIENTCG_MATERIAL_REGISTRY_FILE =
  "sandbox/probe-lab/assets/library/materials/registry.json";
export const AMBIENTCG_MATERIAL_APPEARANCE_REGISTRY_FILE =
  "sandbox/probe-lab/assets/library/materials/appearance-registry.json";
export const AMBIENTCG_HDRI_REGISTRY_FILE =
  "sandbox/probe-lab/assets/library/hdri/registry.json";
export const AMBIENTCG_RESOURCE_REGISTRY_FILE =
  "sandbox/probe-lab/assets/library/ambientcg-resources/registry.json";
export const AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE =
  "sandbox/probe-lab/assets/downloads/ambientcg/jobs.json";
export const AMBIENTCG_JOB_ROOT =
  "sandbox/probe-lab/assets/jobs/ambientcg";
export const AMBIENTCG_PUBLIC_MATERIAL_ROOT =
  "public/sandbox-assets/myway/materials/ambientcg";
export const AMBIENTCG_PUBLIC_HDRI_ROOT =
  "public/sandbox-assets/myway/hdri/ambientcg";
export const AMBIENTCG_PUBLIC_RESOURCE_ROOT =
  "public/sandbox-assets/myway/resources/ambientcg";

export const AMBIENTCG_CLOUD_KEYS = {
  catalog: "metadata/ambientcg/catalog-v1.json",
  sync: "metadata/ambientcg/sync-state-v1.json",
  categories: "metadata/ambientcg/categories-v1.json",
  collections: "metadata/ambientcg/collections-v1.json",
  materials: "metadata/ambientcg/material-registry-v1.json",
  materialAppearances:
    "metadata/ambientcg/material-appearance-registry-v1.json",
  hdris: "metadata/ambientcg/hdri-registry-v1.json",
  resources: "metadata/ambientcg/resource-registry-v1.json",
  jobs: "metadata/ambientcg/download-jobs-v1.json",
} as const;

const EMPTY_CATALOG: AmbientCgCatalogDocument = {
  schema_version: "myway_ambientcg_catalog_v1",
  source: "ambientcg_api_v3",
  updated_at: null,
  total_results: 0,
  assets: [],
};

const EMPTY_SYNC_STATE: AmbientCgSyncState = {
  schema_version: "myway_ambientcg_sync_state_v1",
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
};

const EMPTY_MATERIALS: AmbientCgMaterialRegistry = {
  schema_version: "myway_ambientcg_material_registry_v1",
  updated_at: null,
  materials: [],
};

const EMPTY_MATERIAL_APPEARANCES:
  AmbientCgMaterialAppearanceRegistry = {
    schema_version:
      "myway_ambientcg_material_appearance_registry_v1",
    updated_at: null,
    profiles: [],
  };

const EMPTY_HDRIS: AmbientCgHdriRegistry = {
  schema_version: "myway_ambientcg_hdri_registry_v1",
  updated_at: null,
  hdris: [],
};

const EMPTY_RESOURCES: AmbientCgResourceRegistry = {
  schema_version: "myway_ambientcg_resource_registry_v1",
  updated_at: null,
  resources: [],
};

const EMPTY_JOBS: AmbientCgDownloadJobRegistry = {
  schema_version: "myway_ambientcg_download_jobs_v1",
  updated_at: null,
  jobs: [],
};

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureAmbientCgDirectories() {
  if (!canWriteProjectAssetFiles()) return;

  const directories = [
    AMBIENTCG_CATALOG_ROOT,
    path.dirname(AMBIENTCG_MATERIAL_REGISTRY_FILE),
    path.dirname(AMBIENTCG_HDRI_REGISTRY_FILE),
    path.dirname(
      AMBIENTCG_MATERIAL_APPEARANCE_REGISTRY_FILE,
    ),
    path.dirname(AMBIENTCG_RESOURCE_REGISTRY_FILE),
    path.dirname(AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE),
    AMBIENTCG_JOB_ROOT,
    AMBIENTCG_PUBLIC_MATERIAL_ROOT,
    AMBIENTCG_PUBLIC_HDRI_ROOT,
    AMBIENTCG_PUBLIC_RESOURCE_ROOT,
    "sandbox/probe-lab/assets/library/licenses",
    "sandbox/probe-lab/assets/library/source-records",
    "sandbox/probe-lab/assets/inbox/ambientcg",
    "public/sandbox-assets/myway/models/ambientcg",
  ];

  await Promise.all(
    directories.map((directory) =>
      mkdir(projectPath(directory), {
        recursive: true,
      }),
    ),
  );
}

async function readDocument<T>(input: {
  projectFile: string;
  cloudKey: string;
  fallback: T;
}): Promise<T> {
  const remote = await readCloudJson<T>(
    input.cloudKey,
  );

  if (remote) return remote;

  const filePath = projectPath(
    input.projectFile,
  );

  if (await exists(filePath)) {
    const local =
      await readJsonFileWithRetry<T>(
        filePath,
      );

    if (cloudAssetMetadataEnabled()) {
      await writeCloudJson(
        input.cloudKey,
        local,
      );
    }

    return local;
  }

  if (cloudAssetMetadataEnabled()) {
    await writeCloudJson(
      input.cloudKey,
      input.fallback,
    );
    return structuredClone(input.fallback);
  }

  await ensureAmbientCgDirectories();
  await writeJsonFileAtomic(
    filePath,
    input.fallback,
  );
  return structuredClone(input.fallback);
}

async function writeDocument<T>(input: {
  projectFile: string;
  cloudKey: string;
  value: T;
}) {
  if (cloudAssetMetadataEnabled()) {
    await writeCloudJson(
      input.cloudKey,
      input.value,
    );
  }

  if (keepLocalAssetMetadataMirror()) {
    await ensureAmbientCgDirectories();
    await writeJsonFileAtomic(
      projectPath(input.projectFile),
      input.value,
    );
  }
}

export function readAmbientCgCatalog() {
  return readDocument({
    projectFile: AMBIENTCG_CATALOG_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.catalog,
    fallback: EMPTY_CATALOG,
  });
}

export function writeAmbientCgCatalog(
  value: AmbientCgCatalogDocument,
) {
  return writeDocument({
    projectFile: AMBIENTCG_CATALOG_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.catalog,
    value,
  });
}

export function readAmbientCgSyncState() {
  return readDocument({
    projectFile: AMBIENTCG_SYNC_STATE_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.sync,
    fallback: EMPTY_SYNC_STATE,
  });
}

export function writeAmbientCgSyncState(
  value: AmbientCgSyncState,
) {
  return writeDocument({
    projectFile: AMBIENTCG_SYNC_STATE_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.sync,
    value,
  });
}

export function readAmbientCgMaterialRegistry() {
  return readDocument({
    projectFile: AMBIENTCG_MATERIAL_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.materials,
    fallback: EMPTY_MATERIALS,
  });
}

export function writeAmbientCgMaterialRegistry(
  value: AmbientCgMaterialRegistry,
) {
  return writeDocument({
    projectFile: AMBIENTCG_MATERIAL_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.materials,
    value,
  });
}

export function readAmbientCgMaterialAppearanceRegistry() {
  return readDocument({
    projectFile:
      AMBIENTCG_MATERIAL_APPEARANCE_REGISTRY_FILE,
    cloudKey:
      AMBIENTCG_CLOUD_KEYS.materialAppearances,
    fallback:
      EMPTY_MATERIAL_APPEARANCES,
  });
}

export function writeAmbientCgMaterialAppearanceRegistry(
  value:
    AmbientCgMaterialAppearanceRegistry,
) {
  return writeDocument({
    projectFile:
      AMBIENTCG_MATERIAL_APPEARANCE_REGISTRY_FILE,
    cloudKey:
      AMBIENTCG_CLOUD_KEYS.materialAppearances,
    value,
  });
}

export function readAmbientCgHdriRegistry() {
  return readDocument({
    projectFile: AMBIENTCG_HDRI_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.hdris,
    fallback: EMPTY_HDRIS,
  });
}

export function writeAmbientCgHdriRegistry(
  value: AmbientCgHdriRegistry,
) {
  return writeDocument({
    projectFile: AMBIENTCG_HDRI_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.hdris,
    value,
  });
}

export function readAmbientCgResourceRegistry() {
  return readDocument({
    projectFile: AMBIENTCG_RESOURCE_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.resources,
    fallback: EMPTY_RESOURCES,
  });
}

export function writeAmbientCgResourceRegistry(
  value: AmbientCgResourceRegistry,
) {
  return writeDocument({
    projectFile: AMBIENTCG_RESOURCE_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.resources,
    value,
  });
}

export function readAmbientCgDownloadJobs() {
  return readDocument({
    projectFile: AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.jobs,
    fallback: EMPTY_JOBS,
  });
}

export function writeAmbientCgDownloadJobs(
  value: AmbientCgDownloadJobRegistry,
) {
  return writeDocument({
    projectFile: AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE,
    cloudKey: AMBIENTCG_CLOUD_KEYS.jobs,
    value,
  });
}

export function writeAmbientCgAuxiliaryCatalog(
  kind: "categories" | "collections",
  value: unknown,
) {
  return writeDocument({
    projectFile:
      kind === "categories"
        ? AMBIENTCG_CATEGORIES_FILE
        : AMBIENTCG_COLLECTIONS_FILE,
    cloudKey:
      kind === "categories"
        ? AMBIENTCG_CLOUD_KEYS.categories
        : AMBIENTCG_CLOUD_KEYS.collections,
    value,
  });
}

export function getAmbientCgStorageStatus():
  AmbientCgStorageStatus {
  const cloud = cloudAssetMetadataEnabled();
  return {
    cloud_enabled: cloud,
    local_mirror_enabled:
      keepLocalAssetMetadataMirror(),
    runtime_bucket_configured:
      hasR2AssetStorageEnvironment(),
    source_bucket_configured:
      hasR2AssetStorageEnvironment(),
    public_base_url_configured:
      Boolean(
        process.env.R2_PUBLIC_BASE_URL?.trim(),
      ),
    catalog_location: cloud
      ? "r2"
      : "local",
    cached_asset_destination: cloud
      ? "r2"
      : "local",
  };
}

export async function bootstrapAmbientCgCloudMetadata() {
  const [
    catalog,
    sync,
    materials,
    materialAppearances,
    hdris,
    resources,
    jobs,
  ] = await Promise.all([
    readAmbientCgCatalog(),
    readAmbientCgSyncState(),
    readAmbientCgMaterialRegistry(),
    readAmbientCgMaterialAppearanceRegistry(),
    readAmbientCgHdriRegistry(),
    readAmbientCgResourceRegistry(),
    readAmbientCgDownloadJobs(),
  ]);

  await Promise.all([
    writeCloudJson(
      AMBIENTCG_CLOUD_KEYS.catalog,
      catalog,
    ),
    writeCloudJson(
      AMBIENTCG_CLOUD_KEYS.sync,
      sync,
    ),
    writeCloudJson(
      AMBIENTCG_CLOUD_KEYS.materials,
      materials,
    ),
    writeCloudJson(
      AMBIENTCG_CLOUD_KEYS.materialAppearances,
      materialAppearances,
    ),
    writeCloudJson(
      AMBIENTCG_CLOUD_KEYS.hdris,
      hdris,
    ),
    writeCloudJson(
      AMBIENTCG_CLOUD_KEYS.resources,
      resources,
    ),
    writeCloudJson(
      AMBIENTCG_CLOUD_KEYS.jobs,
      jobs,
    ),
  ]);

  return {
    catalog_count: catalog.assets.length,
    material_count:
      materials.materials.length,
    material_appearance_count:
      materialAppearances.profiles.length,
    hdri_count: hdris.hdris.length,
    resource_count:
      resources.resources.length,
    job_count: jobs.jobs.length,
  };
}
