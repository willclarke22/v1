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
  environmentFormatFromUrl,
} from "./environment-runtime-policy";
import type {
  RuntimeEnvironmentBindingV1,
} from "./environment-runtime-contract";

export type BlenderHydratedEnvironment = {
  temporary_directory: string;
  file_name: string;
  local_path: string;
  byte_size: number;
  format: "hdr" | "exr";
  world_nodes: Array<{
    node_type: string;
    purpose: string;
  }>;
  mapping_rotation_radians: number;
  background_strength: number;
  visible_background: boolean;
  view_transform: "AgX";
  exposure: number;
  cleanup: () => Promise<void>;
};

function safeStem(
  value: string,
) {
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
    "environment"
  );
}

function validateUrl(
  value: string,
) {
  const normalized =
    value
      .trim()
      .replace(
        /\\/g,
        "/",
      );

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
    "Blender environment hydration only accepts HTTPS or MyWay public asset URLs.",
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
    cache: "force-cache",
    error_label:
      "Environment download",
  });

  return (
    await stat(destination)
  ).size;
}

export async function hydrateRuntimeEnvironmentForBlender(
  binding: RuntimeEnvironmentBindingV1,
  options: {
    fetch_impl?: typeof fetch;
    runtime_origin?: string;
  } = {},
): Promise<BlenderHydratedEnvironment> {
  if (
    binding.lighting_mode !==
      "hdri" ||
    !binding.public_url
  ) {
    throw new Error(
      "Only an HDRI runtime binding can be hydrated for Blender.",
    );
  }

  const publicUrl =
    validateUrl(
      binding.public_url,
    );
  const format =
    binding.format ??
    environmentFormatFromUrl(
      publicUrl,
    );

  if (!format) {
    throw new Error(
      "Blender environment hydration requires an HDR or EXR file.",
    );
  }

  const temporaryDirectory =
    await mkdtemp(
      path.join(
        tmpdir(),
        "myway-environment-",
      ),
    );
  const fileName =
    `${safeStem(
      binding.environment_resource_id ??
        binding.environment_binding_id,
    )}.${format}`;
  const localPath =
    path.join(
      temporaryDirectory,
      fileName,
    );

  try {
    const byteSize =
      await hydrateOne(
        publicUrl,
        localPath,
        options.fetch_impl ??
          fetch,
        options.runtime_origin,
      );

    return {
      temporary_directory:
        temporaryDirectory,
      file_name: fileName,
      local_path: localPath,
      byte_size: byteSize,
      format,
      world_nodes: [
        {
          node_type:
            "ShaderNodeTexEnvironment",
          purpose:
            "Load the reviewed HDR or EXR environment texture.",
        },
        {
          node_type:
            "ShaderNodeTexCoord",
          purpose:
            "Provide Generated environment coordinates.",
        },
        {
          node_type:
            "ShaderNodeMapping",
          purpose:
            "Apply horizontal environment rotation.",
        },
        {
          node_type:
            "ShaderNodeBackground",
          purpose:
            "Control world strength independently from renderer exposure.",
        },
        {
          node_type:
            "ShaderNodeOutputWorld",
          purpose:
            "Connect the environment to the Blender World output.",
        },
      ],
      mapping_rotation_radians:
        binding.rotation_radians,
      background_strength:
        binding.intensity,
      visible_background:
        binding.background_mode ===
        "environment",
      view_transform:
        "AgX",
      exposure:
        binding.exposure,
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

