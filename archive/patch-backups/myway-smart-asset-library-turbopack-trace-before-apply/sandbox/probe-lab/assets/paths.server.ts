import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

export const MYWAY_PUBLIC_ASSET_URL_ROOT = "/sandbox-assets/myway";
export const MYWAY_ASSET_LIBRARY_PROJECT_PATH = "sandbox/probe-lab/assets/library";
export const MYWAY_ASSET_REGISTRY_PROJECT_PATH = `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/registry.json`;
export const MYWAY_SCENE_MANIFEST_PROJECT_PATH = "sandbox/probe-lab/scenes/manifests";
export const MYWAY_ASSET_JOB_PROJECT_PATH = "sandbox/probe-lab/assets/jobs";
export const MYWAY_ASSET_INBOX_PROJECT_PATH = "sandbox/probe-lab/assets/inbox";
export const MYWAY_ASSET_DEBUG_PROJECT_PATH = "sandbox/probe-lab/assets/debug";
export const MYWAY_PUBLIC_ASSET_PROJECT_PATH = "public/sandbox-assets/myway";

export function projectRoot() {
  return process.cwd();
}

export function projectPath(...parts: string[]) {
  return path.join(projectRoot(), ...parts);
}

export function publicUrlToProjectPath(publicPath: string) {
  const normalized = publicPath.replace(/\\/g, "/");
  if (!normalized.startsWith(`${MYWAY_PUBLIC_ASSET_URL_ROOT}/`)) {
    throw new Error(`Asset path must start with ${MYWAY_PUBLIC_ASSET_URL_ROOT}/`);
  }
  return projectPath("public", ...normalized.replace(/^\/+/, "").split("/"));
}

export async function ensureAssetDirectories() {
  const directories = [
    MYWAY_ASSET_LIBRARY_PROJECT_PATH,
    `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/licenses`,
    `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/source-records`,
    MYWAY_SCENE_MANIFEST_PROJECT_PATH,
    MYWAY_ASSET_DEBUG_PROJECT_PATH,
    `${MYWAY_ASSET_INBOX_PROJECT_PATH}/blenderkit`,
    `${MYWAY_ASSET_INBOX_PROJECT_PATH}/trellis`,
    `${MYWAY_ASSET_INBOX_PROJECT_PATH}/manual`,
    `${MYWAY_ASSET_JOB_PROJECT_PATH}/pending`,
    `${MYWAY_ASSET_JOB_PROJECT_PATH}/running`,
    `${MYWAY_ASSET_JOB_PROJECT_PATH}/completed`,
    `${MYWAY_ASSET_JOB_PROJECT_PATH}/failed`,
    `${MYWAY_PUBLIC_ASSET_PROJECT_PATH}/models/blenderkit`,
    `${MYWAY_PUBLIC_ASSET_PROJECT_PATH}/models/trellis`,
    `${MYWAY_PUBLIC_ASSET_PROJECT_PATH}/models/manual`,
    `${MYWAY_PUBLIC_ASSET_PROJECT_PATH}/models/procedural`,
    `${MYWAY_PUBLIC_ASSET_PROJECT_PATH}/thumbnails`,
  ];
  await Promise.all(directories.map((directory) => mkdir(projectPath(directory), { recursive: true })));
}

async function exists(candidate: string) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function versionValue(name: string) {
  const match = name.match(/(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] ?? 0) : 0;
}

export async function resolveBlenderExecutable() {
  const configured = process.env.BLENDER_EXECUTABLE?.trim();
  if (configured && (await exists(configured))) return configured;

  if (process.platform === "win32") {
    const standard = "C:\\Program Files\\Blender Foundation";
    if (await exists(standard)) {
      const entries = await readdir(standard, { withFileTypes: true });
      const candidates = entries
        .filter((entry: import("node:fs").Dirent) => entry.isDirectory() && entry.name.toLowerCase().startsWith("blender"))
        .sort((a: import("node:fs").Dirent, b: import("node:fs").Dirent) => versionValue(b.name) - versionValue(a.name))
        .map((entry: import("node:fs").Dirent) => path.join(standard, entry.name, "blender.exe"));
      for (const candidate of candidates) if (await exists(candidate)) return candidate;
    }
  }

  throw new Error(
    "Blender executable was not found. Set BLENDER_EXECUTABLE in .env.local to the full blender.exe path.",
  );
}
