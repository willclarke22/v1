import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import path from "node:path";

import {
  hashFile,
} from "../assets/content-hash.server";
import {
  publicUrlToProjectPath,
} from "../assets/paths.server";
import type {
  RuntimeModelBindingV1,
} from "./resource-runtime-contract";
import {
  validateRuntimeModelUrl,
} from "./build-runtime-binding";

export type BlenderHydrationOptions = {
  verify_hash?: boolean;
  retain_debug?: boolean;
  fetch_impl?: typeof fetch;
};

export type BlenderHydratedModel = {
  binding: RuntimeModelBindingV1;
  temporary_directory: string;
  local_path: string;
  file_name: string;
  byte_size: number;
  actual_content_hash: string | null;
  hash_verified: boolean | null;
  retained_for_debug: boolean;
  cleanup: () => Promise<void>;
};

function safeFileStem(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (
    normalized.slice(0, 80) ||
    "myway_resource"
  );
}

function extensionForUrl(
  publicUrl: string,
) {
  try {
    const pathname =
      new URL(
        publicUrl,
        "https://myway.invalid",
      ).pathname;
    const extension =
      path.extname(pathname)
        .toLowerCase();

    if (
      extension === ".glb" ||
      extension === ".gltf"
    ) {
      return extension;
    }
  } catch {
    // Fall through to the safe default.
  }

  return ".glb";
}

async function writeRemoteFile(
  url: string,
  destination: string,
  fetchImpl: typeof fetch,
) {
  const response =
    await fetchImpl(url, {
      cache: "no-store",
    });

  if (!response.ok) {
    throw new Error(
      `Blender hydration download failed (${response.status} ${response.statusText}).`,
    );
  }

  const bytes =
    Buffer.from(
      await response.arrayBuffer(),
    );

  await writeFile(
    destination,
    bytes,
  );
}

export async function hydrateResolvedModelForBlender(
  binding: RuntimeModelBindingV1,
  options: BlenderHydrationOptions = {},
): Promise<BlenderHydratedModel> {
  const publicUrl =
    validateRuntimeModelUrl(
      binding.public_url,
      binding.storage_provider,
    );
  const temporaryDirectory =
    await mkdtemp(
      path.join(
        tmpdir(),
        "myway-resource-",
      ),
    );
  const fileName = `${safeFileStem(
    binding.asset_id,
  )}${extensionForUrl(publicUrl)}`;
  const localPath =
    path.join(
      temporaryDirectory,
      fileName,
    );

  try {
    if (
      /^https:\/\//i.test(
        publicUrl,
      )
    ) {
      await writeRemoteFile(
        publicUrl,
        localPath,
        options.fetch_impl ??
          fetch,
      );
    } else {
      await copyFile(
        publicUrlToProjectPath(
          publicUrl,
        ),
        localPath,
      );
    }

    const fileStats =
      await stat(localPath);
    let actualContentHash:
      | string
      | null = null;
    let hashVerified:
      | boolean
      | null = null;

    if (
      options.verify_hash === true &&
      binding.content_hash
    ) {
      actualContentHash =
        await hashFile(localPath);
      hashVerified =
        actualContentHash.toLowerCase() ===
        binding.content_hash.toLowerCase();

      if (!hashVerified) {
        throw new Error(
          `Blender hydration content hash mismatch. Expected ${binding.content_hash}, received ${actualContentHash}.`,
        );
      }
    }

    const retainDebug =
      options.retain_debug === true;

    return {
      binding,
      temporary_directory:
        temporaryDirectory,
      local_path: localPath,
      file_name: fileName,
      byte_size:
        fileStats.size,
      actual_content_hash:
        actualContentHash,
      hash_verified:
        hashVerified,
      retained_for_debug:
        retainDebug,
      cleanup: async () => {
        if (retainDebug) {
          return;
        }

        await rm(
          temporaryDirectory,
          {
            recursive: true,
            force: true,
          },
        );
      },
    };
  } catch (error) {
    await rm(
      temporaryDirectory,
      {
        recursive: true,
        force: true,
      },
    );
    throw error;
  }
}

export async function readHydratedModelBytes(
  hydration: BlenderHydratedModel,
) {
  return readFile(
    hydration.local_path,
  );
}
