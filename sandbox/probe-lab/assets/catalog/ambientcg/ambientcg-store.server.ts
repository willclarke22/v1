
import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  readJsonFileWithRetry,
  writeJsonFileAtomic,
} from "../../json-file.server";
import { projectPath } from "../../paths.server";
import type {
  AmbientCgCatalogDocument,
  AmbientCgDownloadJobRegistry,
  AmbientCgHdriRegistry,
  AmbientCgMaterialRegistry,
  AmbientCgSyncState,
} from "./ambientcg-types";

export const AMBIENTCG_CATALOG_ROOT =
  "sandbox/probe-lab/assets/catalog/ambientcg";
export const AMBIENTCG_CATALOG_FILE = `${AMBIENTCG_CATALOG_ROOT}/catalog.json`;
export const AMBIENTCG_SYNC_STATE_FILE = `${AMBIENTCG_CATALOG_ROOT}/sync-state.json`;
export const AMBIENTCG_CATEGORIES_FILE = `${AMBIENTCG_CATALOG_ROOT}/categories.json`;
export const AMBIENTCG_COLLECTIONS_FILE = `${AMBIENTCG_CATALOG_ROOT}/collections.json`;
export const AMBIENTCG_MATERIAL_REGISTRY_FILE =
  "sandbox/probe-lab/assets/library/materials/registry.json";
export const AMBIENTCG_HDRI_REGISTRY_FILE =
  "sandbox/probe-lab/assets/library/hdri/registry.json";
export const AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE =
  "sandbox/probe-lab/assets/downloads/ambientcg/jobs.json";
export const AMBIENTCG_JOB_ROOT =
  "sandbox/probe-lab/assets/jobs/ambientcg";
export const AMBIENTCG_PUBLIC_MATERIAL_ROOT =
  "public/sandbox-assets/myway/materials/ambientcg";
export const AMBIENTCG_PUBLIC_HDRI_ROOT =
  "public/sandbox-assets/myway/hdri/ambientcg";

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

const EMPTY_HDRIS: AmbientCgHdriRegistry = {
  schema_version: "myway_ambientcg_hdri_registry_v1",
  updated_at: null,
  hdris: [],
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
  const directories = [
    AMBIENTCG_CATALOG_ROOT,
    path.dirname(AMBIENTCG_MATERIAL_REGISTRY_FILE),
    path.dirname(AMBIENTCG_HDRI_REGISTRY_FILE),
    path.dirname(AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE),
    AMBIENTCG_JOB_ROOT,
    AMBIENTCG_PUBLIC_MATERIAL_ROOT,
    AMBIENTCG_PUBLIC_HDRI_ROOT,
    "sandbox/probe-lab/assets/library/licenses",
    "sandbox/probe-lab/assets/library/source-records",
  ];
  await Promise.all(
    directories.map((directory) =>
      mkdir(projectPath(directory), { recursive: true }),
    ),
  );
}

async function readOrCreate<T>(projectFile: string, fallback: T): Promise<T> {
  await ensureAmbientCgDirectories();
  const filePath = projectPath(projectFile);
  if (!(await exists(filePath))) {
    await writeJsonFileAtomic(filePath, fallback);
    return structuredClone(fallback);
  }
  return readJsonFileWithRetry<T>(filePath);
}

export function readAmbientCgCatalog() {
  return readOrCreate(AMBIENTCG_CATALOG_FILE, EMPTY_CATALOG);
}

export async function writeAmbientCgCatalog(value: AmbientCgCatalogDocument) {
  await ensureAmbientCgDirectories();
  await writeJsonFileAtomic(projectPath(AMBIENTCG_CATALOG_FILE), value);
}

export function readAmbientCgSyncState() {
  return readOrCreate(AMBIENTCG_SYNC_STATE_FILE, EMPTY_SYNC_STATE);
}

export async function writeAmbientCgSyncState(value: AmbientCgSyncState) {
  await ensureAmbientCgDirectories();
  await writeJsonFileAtomic(projectPath(AMBIENTCG_SYNC_STATE_FILE), value);
}

export function readAmbientCgMaterialRegistry() {
  return readOrCreate(AMBIENTCG_MATERIAL_REGISTRY_FILE, EMPTY_MATERIALS);
}

export async function writeAmbientCgMaterialRegistry(
  value: AmbientCgMaterialRegistry,
) {
  await ensureAmbientCgDirectories();
  await writeJsonFileAtomic(projectPath(AMBIENTCG_MATERIAL_REGISTRY_FILE), value);
}

export function readAmbientCgHdriRegistry() {
  return readOrCreate(AMBIENTCG_HDRI_REGISTRY_FILE, EMPTY_HDRIS);
}

export async function writeAmbientCgHdriRegistry(value: AmbientCgHdriRegistry) {
  await ensureAmbientCgDirectories();
  await writeJsonFileAtomic(projectPath(AMBIENTCG_HDRI_REGISTRY_FILE), value);
}

export function readAmbientCgDownloadJobs() {
  return readOrCreate(AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE, EMPTY_JOBS);
}

export async function writeAmbientCgDownloadJobs(
  value: AmbientCgDownloadJobRegistry,
) {
  await ensureAmbientCgDirectories();
  await writeJsonFileAtomic(
    projectPath(AMBIENTCG_DOWNLOAD_JOB_REGISTRY_FILE),
    value,
  );
}

export async function writeAmbientCgAuxiliaryCatalog(
  kind: "categories" | "collections",
  value: unknown,
) {
  await ensureAmbientCgDirectories();
  await writeJsonFileAtomic(
    projectPath(
      kind === "categories"
        ? AMBIENTCG_CATEGORIES_FILE
        : AMBIENTCG_COLLECTIONS_FILE,
    ),
    value,
  );
}
