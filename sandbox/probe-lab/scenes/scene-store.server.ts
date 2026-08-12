
import {
  readdir,
} from "node:fs/promises";

import {
  ensureAssetDirectories,
  MYWAY_SCENE_MANIFEST_PROJECT_PATH,
  projectPath,
} from "../assets/paths.server";
import {
  readJsonFileWithRetry,
  writeJsonFileAtomic,
} from "../assets/json-file.server";
import {
  getMyWayAsset,
} from "../assets/asset-library.server";
import {
  linkMissingAssetJobsToSavedScene,
} from "../assets/acquisition/missing-asset-store.server";
import {
  listSceneManifestCloudKeys,
  readWorkflowCloudJson,
  sceneManifestCloudKey,
  workflowDurableStateCloudEnabled,
  writeWorkflowCloudJson,
} from "../assets/storage/workflow-durable-state.server";
import type {
  MyWaySceneManifestV2,
} from "./scene-manifest";
import {
  validateSceneManifest,
  safeSceneId,
} from "./validate-scene-manifest";
import type {
  PrimitiveSceneGraphV2,
} from "../primitive-builder/primitive-scene-graph";
import {
  resolvePrimitiveBuilderSceneAssets,
} from "./resolve-scene-assets.server";

export async function saveSceneManifest(
  raw: unknown,
) {
  const validated =
    validateSceneManifest(
      raw,
    );

  if (!validated.ok) {
    throw new Error(
      validated.errors.join("; "),
    );
  }

  const missing: string[] =
    [];

  for (
    const instance of
    validated.scene.assets
  ) {
    if (
      !(
        await getMyWayAsset(
          instance.asset_id,
        )
      )
    ) {
      missing.push(
        instance.asset_id,
      );
    }
  }

  if (missing.length) {
    throw new Error(
      `Scene references missing assets: ${missing.join(", ")}`,
    );
  }

  if (
    workflowDurableStateCloudEnabled()
  ) {
    await writeWorkflowCloudJson(
      sceneManifestCloudKey(
        validated.scene.scene_id,
      ),
      validated.scene,
    );
  }
  else {
    await ensureAssetDirectories();

    const filePath =
      projectPath(
        MYWAY_SCENE_MANIFEST_PROJECT_PATH,
        `${validated.scene.scene_id}.json`,
      );

    await writeJsonFileAtomic(
      filePath,
      validated.scene,
    );
  }

  await linkMissingAssetJobsToSavedScene(
    validated.scene.scene_id,
    validated.scene.scene_id,
  ).catch(
    () => undefined,
  );

  return hydrateSceneManifest(
    validated.scene,
  );
}

async function hydrateSceneManifest(
  scene: MyWaySceneManifestV2,
) {
  const assets =
    await Promise.all(
      scene.assets.map(
        async (
          instance,
        ) => {
          const current =
            await getMyWayAsset(
              instance.asset_id,
            );

          if (!current) {
            return instance;
          }

          return {
            ...instance,
            concept:
              instance.concept ??
              current
                .verified_canonical_label ??
              current
                .canonical_label,
            public_path:
              current.public_path,
            source_type:
              current.source_type,
            scene_review_status:
              current
                .scene_review_status ??
              "pending",
            dimensions_m:
              current.dimensions_m,
            default_scale:
              current.default_scale,
            default_rotation:
              current
                .default_rotation,
            ground_offset_m:
              current
                .ground_offset_m,
            geometry_profile:
              current
                .geometry_profile ??
              null,
            preview_only:
              current
                  .scene_review_status ===
                "approved" &&
              current
                  .semantic_review_status ===
                "verified"
                ? false
                : instance.preview_only,
          };
        },
      ),
    );

  return {
    ...scene,
    assets,
  };
}

export async function getSceneManifest(
  sceneId: string,
) {
  const normalizedId =
    safeSceneId(
      sceneId,
    );

  if (!normalizedId) {
    return null;
  }

  if (
    workflowDurableStateCloudEnabled()
  ) {
    const raw =
      await readWorkflowCloudJson<
        unknown
      >(
        sceneManifestCloudKey(
          normalizedId,
        ),
      );

    if (raw == null) {
      return null;
    }

    const validated =
      validateSceneManifest(
        raw,
      );

    return validated.ok
      ? await hydrateSceneManifest(
          validated.scene,
        )
      : null;
  }

  await ensureAssetDirectories();

  try {
    const raw =
      await readJsonFileWithRetry<
        unknown
      >(
        projectPath(
          MYWAY_SCENE_MANIFEST_PROJECT_PATH,
          `${normalizedId}.json`,
        ),
      );

    const validated =
      validateSceneManifest(
        raw,
      );

    return validated.ok
      ? await hydrateSceneManifest(
          validated.scene,
        )
      : null;
  }
  catch (caught) {
    if (
      (
        caught as
          NodeJS.ErrnoException
      ).code === "ENOENT"
    ) {
      return null;
    }

    throw caught;
  }
}

function isPrimitiveSceneGraph(
  value: unknown,
): value is PrimitiveSceneGraphV2 {
  return Boolean(
    value &&
      typeof value ===
        "object" &&
      !Array.isArray(value) &&
      (
        value as
          PrimitiveSceneGraphV2
      ).schema_version ===
        "primitive_scene_graph_v2" &&
      Array.isArray(
        (
          value as
            PrimitiveSceneGraphV2
        ).asset_requirements,
      ),
  );
}

export async function refreshSavedSceneAssets(
  sceneId: string,
) {
  const scene =
    await getSceneManifest(
      sceneId,
    );

  if (!scene) {
    throw new Error(
      `Saved scene was not found: ${sceneId}`,
    );
  }

  if (
    !isPrimitiveSceneGraph(
      scene.scene_graph,
    )
  ) {
    throw new Error(
      "The saved scene does not contain a refreshable primitive scene graph.",
    );
  }

  const resolution =
    await resolvePrimitiveBuilderSceneAssets(
      scene.scene_graph,
    );

  const refreshed:
    MyWaySceneManifestV2 = {
    ...scene,
    assets:
      resolution.bindings,
    unresolved_requirements:
      resolution
        .unresolved_requirements,
    updated_at:
      new Date().toISOString(),
  };

  return {
    scene:
      await saveSceneManifest(
        refreshed,
      ),
    resolution,
  };
}

export async function listSceneManifests(): Promise<
  MyWaySceneManifestV2[]
> {
  const scenes:
    MyWaySceneManifestV2[] =
    [];

  if (
    workflowDurableStateCloudEnabled()
  ) {
    const keys =
      await listSceneManifestCloudKeys();

    for (
      const objectKey of
      keys
    ) {
      try {
        const raw =
          await readWorkflowCloudJson<
            unknown
          >(objectKey);

        if (raw == null) {
          continue;
        }

        const validated =
          validateSceneManifest(
            raw,
          );

        if (validated.ok) {
          scenes.push(
            await hydrateSceneManifest(
              validated.scene,
            ),
          );
        }
      }
      catch {
        // One malformed cloud manifest should not hide
        // the remaining saved scenes.
      }
    }
  }
  else {
    await ensureAssetDirectories();

    const directory =
      projectPath(
        MYWAY_SCENE_MANIFEST_PROJECT_PATH,
      );

    const names =
      (
        await readdir(
          directory,
        )
      ).filter(
        (name) =>
          name.endsWith(
            ".json",
          ),
      );

    for (
      const name of names
    ) {
      try {
        const raw =
          await readJsonFileWithRetry<
            unknown
          >(
            projectPath(
              MYWAY_SCENE_MANIFEST_PROJECT_PATH,
              name,
            ),
          );

        const validated =
          validateSceneManifest(
            raw,
          );

        if (validated.ok) {
          scenes.push(
            await hydrateSceneManifest(
              validated.scene,
            ),
          );
        }
      }
      catch {
        // One malformed local manifest should not hide
        // the remaining saved scenes.
      }
    }
  }

  return scenes.sort(
    (a, b) =>
      b.updated_at.localeCompare(
        a.updated_at,
      ),
  );
}
