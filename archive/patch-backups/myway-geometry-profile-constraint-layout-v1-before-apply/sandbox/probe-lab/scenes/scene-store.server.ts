import {
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";

import {
  ensureAssetDirectories,
  MYWAY_SCENE_MANIFEST_PROJECT_PATH,
  projectPath,
} from "../assets/paths.server";
import {
  getMyWayAsset,
} from "../assets/asset-library.server";
import type {
  MyWaySceneManifestV2,
} from "./scene-manifest";
import {
  validateSceneManifest,
} from "./validate-scene-manifest";

export async function saveSceneManifest(
  raw: unknown,
) {
  const validated = validateSceneManifest(raw);

  if (!validated.ok) {
    throw new Error(validated.errors.join("; "));
  }

  const missing: string[] = [];

  for (const instance of validated.scene.assets) {
    if (!(await getMyWayAsset(instance.asset_id))) {
      missing.push(instance.asset_id);
    }
  }

  if (missing.length) {
    throw new Error(
      `Scene references missing assets: ${missing.join(", ")}`,
    );
  }

  await ensureAssetDirectories();
  const filePath = projectPath(
    MYWAY_SCENE_MANIFEST_PROJECT_PATH,
    `${validated.scene.scene_id}.json`,
  );

  await writeFile(
    filePath,
    `${JSON.stringify(validated.scene, null, 2)}\n`,
    "utf8",
  );

  return hydrateSceneManifest(validated.scene);
}

async function hydrateSceneManifest(
  scene: MyWaySceneManifestV2,
) {
  const assets = await Promise.all(
    scene.assets.map(async (instance) => {
      const current = await getMyWayAsset(
        instance.asset_id,
      );

      if (!current) return instance;

      return {
        ...instance,
        concept:
          instance.concept ??
          current.verified_canonical_label ??
          current.canonical_label,
        public_path: current.public_path,
        source_type: current.source_type,
        scene_review_status:
          current.scene_review_status ??
          "pending",
        dimensions_m: current.dimensions_m,
        default_scale: current.default_scale,
        default_rotation:
          current.default_rotation,
        ground_offset_m:
          current.ground_offset_m,
        preview_only:
          current.scene_review_status === "approved" &&
          current.semantic_review_status === "verified"
            ? false
            : instance.preview_only,
      };
    }),
  );

  return {
    ...scene,
    assets,
  };
}

export async function listSceneManifests(): Promise<
  MyWaySceneManifestV2[]
> {
  await ensureAssetDirectories();
  const directory = projectPath(
    MYWAY_SCENE_MANIFEST_PROJECT_PATH,
  );
  const names = (
    await readdir(directory)
  ).filter((name) => name.endsWith(".json"));
  const scenes: MyWaySceneManifestV2[] = [];

  for (const name of names) {
    try {
      const raw = JSON.parse(
        await readFile(
          projectPath(
            MYWAY_SCENE_MANIFEST_PROJECT_PATH,
            name,
          ),
          "utf8",
        ),
      );
      const validated = validateSceneManifest(raw);
      if (validated.ok) {
        scenes.push(
          await hydrateSceneManifest(
            validated.scene,
          ),
        );
      }
    } catch {
      // One malformed sandbox manifest should not hide
      // the remaining saved scenes.
    }
  }

  return scenes.sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
}
