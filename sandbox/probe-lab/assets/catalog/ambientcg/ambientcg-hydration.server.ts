
import {
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
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
    /* turbopackIgnore: true */
    tmpdir(),
    "myway-asset-cache",
    "ambientcg",
  );

const FOUNDRY_CACHE_ROOT =
  path.join(
    /* turbopackIgnore: true */
    CACHE_ROOT,
    "foundry",
  );

const DEFAULT_STALE_MAX_AGE_HOURS =
  24;

const activeFoundryScopes =
  new Set<string>();

function safeCacheSegment(
  value: string,
) {
  const normalized =
    value
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "_",
      )
      .replace(
        /^_+|_+$/g,
        "",
      );

  if (!normalized) {
    throw new Error(
      "A non-empty hydration cache identifier is required.",
    );
  }

  return normalized;
}

function staleMaxAgeHours() {
  const configured =
    Number.parseInt(
      process.env
        .MYWAY_AMBIENTCG_HYDRATION_MAX_AGE_HOURS ??
        "",
      10,
    );

  if (
    !Number.isFinite(
      configured,
    )
  ) {
    return DEFAULT_STALE_MAX_AGE_HOURS;
  }

  return Math.min(
    720,
    Math.max(
      1,
      configured,
    ),
  );
}

export function ambientCgHydrationCacheRoot() {
  return CACHE_ROOT;
}

export function ambientCgHydrationScopePath(
  scopeId: string,
) {
  return path.join(
    /* turbopackIgnore: true */
    FOUNDRY_CACHE_ROOT,
    safeCacheSegment(
      scopeId,
    ),
  );
}

function hydrationResourceRoot(
  resourceId: string,
  scopeId?: string,
) {
  const safeResourceId =
    safeCacheSegment(
      resourceId,
    );

  return scopeId
    ? path.join(
    /* turbopackIgnore: true */
        ambientCgHydrationScopePath(
          scopeId,
        ),
        safeResourceId,
      )
    : path.join(
    /* turbopackIgnore: true */
        CACHE_ROOT,
        safeResourceId,
      );
}

export function beginAmbientCgHydrationScope() {
  const scopeId =
    `foundry-${randomUUID()}`;

  activeFoundryScopes.add(
    scopeId,
  );

  return scopeId;
}

async function removeDirectoryWithRetry(
  directory: string,
) {
  let lastError:
    unknown = null;

  for (
    let attempt = 0;
    attempt < 3;
    attempt += 1
  ) {
    try {
      await rm(
        /* turbopackIgnore: true */
        directory,
        {
          recursive:
            true,
          force:
            true,
        },
      );

      return;
    }
    catch (caught) {
      lastError =
        caught;

      await new Promise<void>(
        (resolve) => {
          setTimeout(
            resolve,
            75 *
              (attempt + 1),
          );
        },
      );
    }
  }

  throw lastError;
}

export async function removeAmbientCgHydrationScope(
  scopeId: string,
) {
  const normalized =
    safeCacheSegment(
      scopeId,
    );

  activeFoundryScopes.delete(
    normalized,
  );

  await removeDirectoryWithRetry(
    ambientCgHydrationScopePath(
      normalized,
    ),
  );
}

export async function ambientCgHydrationScopeExists(
  scopeId: string,
) {
  try {
    const info =
      await stat(
        /* turbopackIgnore: true */
        ambientCgHydrationScopePath(
          scopeId,
        ),
      );

    return info.isDirectory();
  }
  catch {
    return false;
  }
}

async function directoryMtime(
  directory: string,
) {
  try {
    const info =
      await stat(
        /* turbopackIgnore: true */
        directory,
      );

    return info.mtimeMs;
  }
  catch {
    return null;
  }
}

export async function pruneStaleAmbientCgHydrationCache(
  input: {
    maxAgeHours?: number;
    preserveScopeIds?: string[];
  } = {},
) {
  const maxAgeHours =
    Number.isFinite(
      input.maxAgeHours,
    )
      ? Math.min(
          720,
          Math.max(
            1,
            Number(
              input.maxAgeHours,
            ),
          ),
        )
      : staleMaxAgeHours();

  const cutoff =
    Date.now() -
    maxAgeHours *
      60 *
      60 *
      1000;

  const preserve =
    new Set<string>([
      ...activeFoundryScopes,
      ...(
        input
          .preserveScopeIds ??
        []
      ).map(
        safeCacheSegment,
      ),
    ]);

  const removedScopeIds:
    string[] = [];

  const scopeEntries =
    await readdir(
      /* turbopackIgnore: true */
      FOUNDRY_CACHE_ROOT,
      {
        withFileTypes:
          true,
      },
    ).catch(
      () => [],
    );

  for (
    const entry of
    scopeEntries
  ) {
    if (
      !entry.isDirectory() ||
      preserve.has(
        entry.name,
      )
    ) {
      continue;
    }

    const directory =
      path.join(
    /* turbopackIgnore: true */
        FOUNDRY_CACHE_ROOT,
        entry.name,
      );

    const mtime =
      await directoryMtime(
        directory,
      );

    if (
      mtime != null &&
      mtime < cutoff
    ) {
      await removeDirectoryWithRetry(
        directory,
      ).catch(
        () => undefined,
      );

      if (
        !(
          await ambientCgHydrationScopeExists(
            entry.name,
          )
        )
      ) {
        removedScopeIds.push(
          entry.name,
        );
      }
    }
  }

  // Before Step 4 the cache used:
  //
  //   %TEMP%\myway-asset-cache\ambientcg\<resource_id>\
  //
  // Those folders are also temporary R2 hydration copies. Remove only stale
  // legacy directories; recent folders are left alone in case an older
  // in-flight Foundry process is still using them.
  const legacyEntries =
    await readdir(
      /* turbopackIgnore: true */
      CACHE_ROOT,
      {
        withFileTypes:
          true,
      },
    ).catch(
      () => [],
    );

  const removedLegacyIds:
    string[] = [];

  for (
    const entry of
    legacyEntries
  ) {
    if (
      !entry.isDirectory() ||
      entry.name ===
        "foundry"
    ) {
      continue;
    }

    const directory =
      path.join(
    /* turbopackIgnore: true */
        CACHE_ROOT,
        entry.name,
      );

    const mtime =
      await directoryMtime(
        directory,
      );

    if (
      mtime != null &&
      mtime < cutoff
    ) {
      await removeDirectoryWithRetry(
        directory,
      ).catch(
        () => undefined,
      );

      const remaining =
        await directoryMtime(
          directory,
        );

      if (remaining == null) {
        removedLegacyIds.push(
          entry.name,
        );
      }
    }
  }

  return {
    max_age_hours:
      maxAgeHours,
    active_scope_count:
      activeFoundryScopes.size,
    removed_scope_ids:
      removedScopeIds,
    removed_legacy_resource_ids:
      removedLegacyIds,
  };
}

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
    /* turbopackIgnore: true */
    path.dirname(
      destination,
    ),
    {
      recursive:
        true,
    },
  );

  await writeFile(
    /* turbopackIgnore: true */
    destination,
    Buffer.from(
      result.body,
    ),
  );

  return destination;
}

export async function hydrateAmbientCgMaterial(
  resourceId: string,
  options: {
    scopeId?: string;
  } = {},
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
    hydrationResourceRoot(
      resource.resource_id,
      options.scopeId,
    );

  const maps:
    Partial<
      Record<
        keyof AmbientCgMaterialMaps,
        string
      >
    > = {};

  for (
    const [
      role,
      objectKey,
    ] of
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
      path.extname(
        objectKey,
      ) ||
      ".bin";

    maps[role] =
      await writeR2ObjectToCache(
        objectKey,
        path.join(
    /* turbopackIgnore: true */
          root,
          `${role}${extension}`,
        ),
      );
  }

  return {
    resource,
    cache_root:
      root,
    hydration_scope_id:
      options.scopeId ??
      null,
    maps,
  };
}

export async function hydrateAmbientCgHdri(
  resourceId: string,
  options: {
    scopeId?: string;
  } = {},
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
      resource
        .environment_object_key,
    ) ||
    ".hdr";

  const root =
    hydrationResourceRoot(
      resource.resource_id,
      options.scopeId,
    );

  const environmentPath =
    await writeR2ObjectToCache(
      resource
        .environment_object_key,
      path.join(
    /* turbopackIgnore: true */
        root,
        `environment${extension}`,
      ),
    );

  return {
    resource,
    cache_root:
      root,
    hydration_scope_id:
      options.scopeId ??
      null,
    environment_path:
      environmentPath,
  };
}

// Compatibility cleanup for any non-scoped caller. Foundry itself uses
// removeAmbientCgHydrationScope() so concurrent executions never delete each
// other's hydration files.
export async function removeAmbientCgHydrationCache(
  resourceId?: string,
) {
  await removeDirectoryWithRetry(
    resourceId
      ? hydrationResourceRoot(
          resourceId,
        )
      : CACHE_ROOT,
  );
}

export async function ambientCgHydrationCacheExists(
  resourceId: string,
) {
  try {
    const info =
      await stat(
        /* turbopackIgnore: true */
        hydrationResourceRoot(
          resourceId,
        ),
      );

    return info.isDirectory();
  }
  catch {
    return false;
  }
}
