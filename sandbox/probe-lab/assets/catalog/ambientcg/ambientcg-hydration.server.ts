import {
  mkdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getR2RuntimeStorage,
} from "../../storage/r2-asset-storage.server";
import {
  readAmbientCgHdriRegistry,
  readAmbientCgMaterialRegistry,
} from "./ambientcg-store.server";
import type {
  AmbientCgMaterialMaps,
} from "./ambientcg-types";

const CACHE_ROOT =
  path.join(
    tmpdir(),
    "myway-asset-cache",
    "ambientcg",
  );

async function writeR2ObjectToCache(
  objectKey: string,
  destination: string,
) {
  const result =
    await getR2RuntimeStorage().read(
      objectKey,
    );

  if (!result) {
    throw new Error(
      `R2 object was not found: ${objectKey}`,
    );
  }

  await mkdir(
    path.dirname(destination),
    { recursive: true },
  );
  await writeFile(
    destination,
    Buffer.from(result.body),
  );

  return destination;
}

export async function hydrateAmbientCgMaterial(
  resourceId: string,
) {
  const registry =
    await readAmbientCgMaterialRegistry();
  const resource =
    registry.materials.find(
      (item) =>
        item.resource_id ===
        resourceId,
    );

  if (!resource) {
    throw new Error(
      `Material resource was not found: ${resourceId}`,
    );
  }

  if (
    resource.storage_provider !==
      "r2" ||
    !resource.map_object_keys
  ) {
    throw new Error(
      "This material is not stored in R2. Use its existing local paths instead.",
    );
  }

  const root =
    path.join(
      CACHE_ROOT,
      resource.resource_id,
    );
  const maps:
    Partial<
      Record<
        keyof AmbientCgMaterialMaps,
        string
      >
    > = {};

  for (
    const [role, objectKey] of
    Object.entries(
      resource.map_object_keys,
    ) as Array<
      [
        keyof AmbientCgMaterialMaps,
        string,
      ]
    >
  ) {
    const extension =
      path.extname(objectKey) ||
      ".bin";
    maps[role] =
      await writeR2ObjectToCache(
        objectKey,
        path.join(
          root,
          `${role}${extension}`,
        ),
      );
  }

  return {
    resource,
    cache_root: root,
    maps,
  };
}

export async function hydrateAmbientCgHdri(
  resourceId: string,
) {
  const registry =
    await readAmbientCgHdriRegistry();
  const resource =
    registry.hdris.find(
      (item) =>
        item.resource_id ===
        resourceId,
    );

  if (!resource) {
    throw new Error(
      `HDRI resource was not found: ${resourceId}`,
    );
  }

  if (
    resource.storage_provider !==
      "r2" ||
    !resource.environment_object_key
  ) {
    throw new Error(
      "This HDRI is not stored in R2. Use its existing local path instead.",
    );
  }

  const extension =
    path.extname(
      resource.environment_object_key,
    ) || ".hdr";
  const root =
    path.join(
      CACHE_ROOT,
      resource.resource_id,
    );
  const environment_path =
    await writeR2ObjectToCache(
      resource.environment_object_key,
      path.join(
        root,
        `environment${extension}`,
      ),
    );

  return {
    resource,
    cache_root: root,
    environment_path,
  };
}

export async function removeAmbientCgHydrationCache(
  resourceId?: string,
) {
  await rm(
    resourceId
      ? path.join(
          CACHE_ROOT,
          resourceId,
        )
      : CACHE_ROOT,
    {
      recursive: true,
      force: true,
    },
  );
}

export async function ambientCgHydrationCacheExists(
  resourceId: string,
) {
  try {
    const info =
      await stat(
        path.join(
          CACHE_ROOT,
          resourceId,
        ),
      );
    return info.isDirectory();
  } catch {
    return false;
  }
}
