import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import path from "node:path";

import {
  hashFile,
} from "../assets/content-hash.server";
import type {
  RuntimeModelBindingV1,
} from "./resource-runtime-contract";
import {
  validateRuntimeModelUrl,
} from "./build-runtime-binding";
import {
  hydrateRuntimeUrlToFile,
} from "./hydrate-runtime-url.server";

export type BlenderHydrationOptions = {
  verify_hash?: boolean;
  retain_debug?: boolean;
  fetch_impl?: typeof fetch;
  runtime_origin?: string;
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
      /* turbopackIgnore: true */
      temporaryDirectory,
      fileName,
    );

  try {
    await hydrateRuntimeUrlToFile({
      public_url: publicUrl,
      destination: localPath,
      fetch_impl:
        options.fetch_impl ?? fetch,
      runtime_origin:
        options.runtime_origin,
      cache: "no-store",
      error_label:
        "Blender hydration download",
    });

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
