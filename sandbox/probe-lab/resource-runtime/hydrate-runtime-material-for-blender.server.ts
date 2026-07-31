import {
  mkdtemp,
  rm,
  stat,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import path from "node:path";

import {
  hydrateRuntimeUrlToFile,
} from "./hydrate-runtime-url.server";
import {
  blenderColorSpaceForRole,
  MATERIAL_ROLE_POLICY,
} from "./material-map-policy";
import type {
  MaterialTextureRole,
  RuntimeMaterialBindingV1,
} from "./material-runtime-contract";

export type BlenderHydratedMaterial = {
  temporary_directory: string;
  total_bytes: number;
  files: Array<{
    role: MaterialTextureRole;
    file_name: string;
    local_path: string;
    byte_size: number;
    blender_color_space:
      | "sRGB"
      | "Non-Color";
    principled_input: string;
    channel: string;
  }>;
  cleanup: () => Promise<void>;
};

function safeStem(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "_",
      )
      .replace(
        /^_+|_+$/g,
        "",
      )
      .slice(0, 70) ||
    "material"
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
      path.extname(
        pathname,
      ).toLowerCase();

    if (
      [
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".exr",
        ".tif",
        ".tiff",
      ].includes(extension)
    ) {
      return extension;
    }
  } catch {
    // Use the safe default.
  }

  return ".png";
}

function validateUrl(value: string) {
  const normalized =
    value
      .trim()
      .replace(/\\/g, "/");

  if (
    /^https:\/\//i.test(
      normalized,
    ) ||
    normalized.startsWith(
      "/sandbox-assets/myway/",
    )
  ) {
    return normalized;
  }

  throw new Error(
    "Blender material hydration only accepts HTTPS or MyWay public asset URLs.",
  );
}

async function hydrateOne(
  publicUrl: string,
  destination: string,
  fetchImpl: typeof fetch,
  runtimeOrigin: string | undefined,
) {
  await hydrateRuntimeUrlToFile({
    public_url: publicUrl,
    destination,
    fetch_impl: fetchImpl,
    runtime_origin: runtimeOrigin,
    cache: "no-store",
    error_label:
      "Material texture download",
  });
}

export async function hydrateRuntimeMaterialForBlender(
  binding: RuntimeMaterialBindingV1,
  options: {
    fetch_impl?: typeof fetch;
    runtime_origin?: string;
  } = {},
): Promise<BlenderHydratedMaterial> {
  if (
    binding.schema_version !==
    "myway_material_runtime_v1"
  ) {
    throw new Error(
      "Unsupported material binding schema.",
    );
  }

  const temporaryDirectory =
    await mkdtemp(
      path.join(
        tmpdir(),
        "myway-material-",
      ),
    );

  try {
    const files: BlenderHydratedMaterial["files"] =
      [];
    const byUrl =
      new Map<
        string,
        {
          local_path: string;
          file_name: string;
          byte_size: number;
        }
      >();

    for (
      const [role, map] of
      Object.entries(
        binding.maps,
      ) as Array<
        [
          MaterialTextureRole,
          NonNullable<
            RuntimeMaterialBindingV1["maps"][MaterialTextureRole]
          >,
        ]
      >
    ) {
      const publicUrl =
        validateUrl(
          map.public_url,
        );
      let downloaded =
        byUrl.get(publicUrl);

      if (!downloaded) {
        const fileName =
          `${safeStem(
            binding.material_resource_id,
          )}_${safeStem(role)}${extensionForUrl(publicUrl)}`;
        const localPath =
          path.join(
            temporaryDirectory,
            fileName,
          );

        await hydrateOne(
          publicUrl,
          localPath,
          options.fetch_impl ??
            fetch,
          options.runtime_origin,
        );
        const stats =
          await stat(localPath);
        downloaded = {
          local_path:
            localPath,
          file_name:
            fileName,
          byte_size:
            stats.size,
        };
        byUrl.set(
          publicUrl,
          downloaded,
        );
      }

      files.push({
        role,
        ...downloaded,
        blender_color_space:
          blenderColorSpaceForRole(
            role,
          ),
        principled_input:
          MATERIAL_ROLE_POLICY[role]
            .principled_input,
        channel:
          map.channel,
      });
    }

    return {
      temporary_directory:
        temporaryDirectory,
      total_bytes:
        Array.from(
          byUrl.values(),
        ).reduce(
          (sum, file) =>
            sum +
            file.byte_size,
          0,
        ),
      files,
      cleanup: async () => {
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

