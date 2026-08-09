import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_TEMP_MAX_AGE_HOURS = 24;

function insideProject(candidatePath: string) {
  const relative = path.relative(
    process.cwd(),
    candidatePath,
  );
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function safeWorkspaceKind(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "job";
}

function tempMaxAgeMs() {
  const configured = Number(
    process.env.MYWAY_ASSET_TEMP_MAX_AGE_HOURS ??
      DEFAULT_TEMP_MAX_AGE_HOURS,
  );
  const hours =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_TEMP_MAX_AGE_HOURS;
  return hours * 60 * 60 * 1000;
}

export function assetTempRoot() {
  const configured =
    process.env.MYWAY_ASSET_TEMP_ROOT?.trim();
  const root = configured
    ? path.resolve(configured)
    : path.join(os.tmpdir(), "myway-assets");

  if (configured && insideProject(root)) {
    throw new Error(
      `MYWAY_ASSET_TEMP_ROOT must be outside the MyWay project: ${root}`,
    );
  }

  return root;
}

export async function pruneStaleAssetTempWorkspaces() {
  const root = assetTempRoot();
  await mkdir(root, { recursive: true });

  const entries = await readdir(root, {
    withFileTypes: true,
  }).catch(() => []);
  const cutoff =
    Date.now() - tempMaxAgeMs();

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const candidate = path.join(
          root,
          entry.name,
        );
        const info = await stat(candidate).catch(
          () => null,
        );
        if (!info || info.mtimeMs >= cutoff) {
          return;
        }
        await rm(candidate, {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }),
  );
}

export async function createAssetTempWorkspace(
  kind: string,
) {
  const root = assetTempRoot();
  await mkdir(root, { recursive: true });
  await pruneStaleAssetTempWorkspaces();

  const directory = await mkdtemp(
    path.join(
      root,
      `${safeWorkspaceKind(kind)}-`,
    ),
  );
  let cleaned = false;

  return {
    path: directory,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(directory, {
        recursive: true,
        force: true,
      });
    },
  };
}
