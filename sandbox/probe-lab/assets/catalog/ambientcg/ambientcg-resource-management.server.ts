import { rm } from "node:fs/promises";

import {
  projectPath,
  publicUrlToProjectPath,
} from "../../paths.server";
import {
  cloudAssetMetadataEnabled,
} from "../../storage/cloud-json.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "../../storage/r2-asset-storage.server";
import {
  cacheAmbientCgAsset,
  safeAmbientCgSegment,
} from "./ambientcg-download.server";
import type {
  AmbientCgCachedHdri,
  AmbientCgCachedMaterial,
  AmbientCgCachedResource,
} from "./ambientcg-types";
import {
  readAmbientCgCatalog,
  readAmbientCgDownloadJobs,
  readAmbientCgHdriRegistry,
  readAmbientCgMaterialRegistry,
  readAmbientCgResourceRegistry,
  writeAmbientCgCatalog,
  writeAmbientCgDownloadJobs,
  writeAmbientCgHdriRegistry,
  writeAmbientCgMaterialRegistry,
  writeAmbientCgResourceRegistry,
} from "./ambientcg-store.server";

type CachedAmbientCgResource =
  | AmbientCgCachedMaterial
  | AmbientCgCachedHdri
  | AmbientCgCachedResource;

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function runtimeObjectKeys(resource: CachedAmbientCgResource) {
  const common = [
    resource.storage?.manifest_object_key,
    resource.storage?.thumbnail_object_key,
  ];

  if (resource.asset_type === "material") {
    return unique([
      ...common,
      ...Object.values(resource.map_object_keys ?? {}),
    ]);
  }

  if (resource.asset_type === "hdri") {
    return unique([
      ...common,
      resource.environment_object_key,
    ]);
  }

  return unique([
    ...common,
    ...resource.files.map((file) => file.object_key),
  ]);
}

function privateObjectKeys(resource: CachedAmbientCgResource) {
  return unique([
    resource.storage?.source_metadata_object_key,
    resource.storage?.license_object_key,
  ]);
}

async function removeLocalRuntime(resource: CachedAmbientCgResource) {
  if (resource.storage?.provider !== "local") return;

  const candidates = [
    resource.storage.runtime_prefix,
    resource.asset_type === "material" ? resource.public_root : null,
  ];

  for (const candidate of unique(candidates)) {
    try {
      const localPath = candidate.startsWith("/")
        ? publicUrlToProjectPath(candidate)
        : projectPath(candidate);
      await rm(localPath, {
        recursive: true,
        force: true,
      });
    } catch {
      // The registry remains authoritative even if an already-missing fallback
      // directory cannot be resolved.
    }
  }
}

async function readAll() {
  const [materials, hdris, resources] = await Promise.all([
    readAmbientCgMaterialRegistry(),
    readAmbientCgHdriRegistry(),
    readAmbientCgResourceRegistry(),
  ]);

  return { materials, hdris, resources };
}

function findResource(
  resourceId: string,
  registries: Awaited<ReturnType<typeof readAll>>,
): CachedAmbientCgResource | null {
  return (
    registries.materials.materials.find(
      (item) => item.resource_id === resourceId,
    ) ??
    registries.hdris.hdris.find(
      (item) => item.resource_id === resourceId,
    ) ??
    registries.resources.resources.find(
      (item) => item.resource_id === resourceId,
    ) ??
    null
  );
}

async function updateCatalogForSource(sourceAssetId: string) {
  const [catalog, registries] = await Promise.all([
    readAmbientCgCatalog(),
    readAll(),
  ]);
  const remaining: CachedAmbientCgResource[] = [
    ...registries.materials.materials,
    ...registries.hdris.hdris,
    ...registries.resources.resources,
  ].filter((item) => item.source_asset_id === sourceAssetId);
  const active = remaining[0] ?? null;
  const now = new Date().toISOString();

  await writeAmbientCgCatalog({
    ...catalog,
    updated_at: now,
    assets: catalog.assets.map((asset) =>
      asset.source_asset_id === sourceAssetId
        ? {
            ...asset,
            catalog_status: active
              ? active.published_to_r2
                ? "published"
                : "cached"
              : "cataloged",
            cached_resource_id: active?.resource_id ?? null,
            updated_at: now,
          }
        : asset,
    ),
  });
}

async function removeResourceRecord(
  resource: CachedAmbientCgResource,
  updateCatalog: boolean,
) {
  if (resource.storage?.provider === "r2" || cloudAssetMetadataEnabled()) {
    const runtimeStorage = getR2RuntimeStorage();
    const sourceStorage = getR2SourceStorage();
    await Promise.all([
      ...runtimeObjectKeys(resource).map((key) =>
        runtimeStorage.delete(key),
      ),
      ...privateObjectKeys(resource).map((key) =>
        sourceStorage.delete(key),
      ),
    ]);
  }

  await Promise.all([
    removeLocalRuntime(resource),
    rm(
      projectPath(
        "sandbox/probe-lab/assets/library/licenses",
        `${safeAmbientCgSegment(resource.resource_id)}.review.json`,
      ),
      { force: true },
    ),
    rm(
      projectPath(
        "sandbox/probe-lab/assets/library/source-records",
        `${safeAmbientCgSegment(resource.resource_id)}.json`,
      ),
      { force: true },
    ),
  ]);

  const [materials, hdris, resources, jobs] = await Promise.all([
    readAmbientCgMaterialRegistry(),
    readAmbientCgHdriRegistry(),
    readAmbientCgResourceRegistry(),
    readAmbientCgDownloadJobs(),
  ]);
  const now = new Date().toISOString();

  await Promise.all([
    writeAmbientCgMaterialRegistry({
      ...materials,
      updated_at: now,
      materials: materials.materials.filter(
        (item) => item.resource_id !== resource.resource_id,
      ),
    }),
    writeAmbientCgHdriRegistry({
      ...hdris,
      updated_at: now,
      hdris: hdris.hdris.filter(
        (item) => item.resource_id !== resource.resource_id,
      ),
    }),
    writeAmbientCgResourceRegistry({
      ...resources,
      updated_at: now,
      resources: resources.resources.filter(
        (item) => item.resource_id !== resource.resource_id,
      ),
    }),
    writeAmbientCgDownloadJobs({
      ...jobs,
      updated_at: now,
      jobs: jobs.jobs.filter(
        (job) => job.resource_id !== resource.resource_id,
      ),
    }),
  ]);

  if (updateCatalog) {
    await updateCatalogForSource(resource.source_asset_id);
  }
}

export async function listAmbientCgCachedResources(input?: {
  type?: string | null;
}) {
  const registries = await readAll();
  const all = registries.resources.resources;
  const type = input?.type?.trim().toLowerCase();

  return type && type !== "all"
    ? all.filter((resource) => resource.asset_type === type)
    : all;
}

export async function removeAmbientCgCachedResource(input: {
  resourceId: string;
}) {
  const registries = await readAll();
  const resource = findResource(input.resourceId, registries);

  if (!resource) {
    throw new Error("The cached ambientCG resource was not found.");
  }

  await removeResourceRecord(resource, true);

  return {
    removed: true,
    resource_id: resource.resource_id,
    source_asset_id: resource.source_asset_id,
    asset_type: resource.asset_type,
  };
}

export async function replaceAmbientCgResourceVariant(input: {
  resourceId: string;
  variantId: string;
}) {
  const registries = await readAll();
  const current = findResource(input.resourceId, registries);

  if (!current) {
    throw new Error("The cached ambientCG resource was not found.");
  }

  if (current.variant_id === input.variantId) {
    return {
      unchanged: true,
      resource: current,
    };
  }

  const cached = await cacheAmbientCgAsset({
    sourceAssetId: current.source_asset_id,
    variantId: input.variantId,
  });
  const refreshed = await readAll();
  const stale: CachedAmbientCgResource[] = [
    ...refreshed.materials.materials,
    ...refreshed.hdris.hdris,
    ...refreshed.resources.resources,
  ].filter(
    (resource) =>
      resource.source_asset_id === current.source_asset_id &&
      resource.resource_id !== cached.resource.resource_id,
  );

  for (const resource of stale) {
    await removeResourceRecord(resource, false);
  }

  await updateCatalogForSource(current.source_asset_id);

  return {
    unchanged: false,
    replaced_resource_id: current.resource_id,
    resource: cached.resource,
  };
}
