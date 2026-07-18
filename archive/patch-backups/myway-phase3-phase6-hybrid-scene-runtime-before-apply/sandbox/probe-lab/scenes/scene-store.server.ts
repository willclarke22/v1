import { readFile, readdir, writeFile } from "node:fs/promises";
import { getMyWayAsset } from "../assets/asset-library.server";
import { ensureAssetDirectories, MYWAY_SCENE_MANIFEST_PROJECT_PATH, projectPath } from "../assets/paths.server";
import type { MyWaySceneManifestV1 } from "./scene-manifest";
import { validateSceneManifest } from "./validate-scene-manifest";

export async function saveSceneManifest(raw: unknown) {
  const validated = validateSceneManifest(raw);
  if (!validated.ok) throw new Error(validated.errors.join("; "));
  const missing: string[] = [];
  for (const instance of validated.scene.assets) {
    if (!(await getMyWayAsset(instance.asset_id))) missing.push(instance.asset_id);
  }
  if (missing.length) throw new Error(`Scene references missing assets: ${missing.join(", ")}`);
  await ensureAssetDirectories();
  const filePath = projectPath(MYWAY_SCENE_MANIFEST_PROJECT_PATH, `${validated.scene.scene_id}.json`);
  await writeFile(filePath, `${JSON.stringify(validated.scene, null, 2)}\n`, "utf8");
  return validated.scene;
}

export async function listSceneManifests(): Promise<MyWaySceneManifestV1[]> {
  await ensureAssetDirectories();
  const directory = projectPath(MYWAY_SCENE_MANIFEST_PROJECT_PATH);
  const files = (await readdir(directory)).filter((name: string) => name.endsWith(".json"));
  const scenes: MyWaySceneManifestV1[] = [];
  for (const file of files) {
    try { scenes.push(JSON.parse(await readFile(projectPath(MYWAY_SCENE_MANIFEST_PROJECT_PATH, file), "utf8"))); } catch {}
  }
  return scenes.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
