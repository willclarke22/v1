import {
  access,
} from "node:fs/promises";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  hydrateRuntimeEnvironmentForBlender,
} from "../hydrate-runtime-environment-for-blender.server";
import type {
  BlenderEnvironmentHydrationReport,
  RuntimeEnvironmentBindingV1,
} from "../environment-runtime-contract";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as {
        environment_binding?:
          RuntimeEnvironmentBindingV1;
      };
    const binding =
      body.environment_binding;

    if (!binding) {
      return NextResponse.json(
        {
          ok: false,
          environment_resource_id:
            null,
          variant_id: null,
          content_hash: null,
          file_name: null,
          byte_size: 0,
          format: null,
          world_nodes: [],
          mapping_rotation_radians:
            0,
          background_strength: 0,
          visible_background:
            false,
          view_transform: "AgX",
          exposure: 1,
          retained_for_debug:
            false,
          cleaned_up: true,
          error:
            "An HDRI runtime binding is required.",
        } satisfies BlenderEnvironmentHydrationReport,
        { status: 400 },
      );
    }

    const hydrated =
      await hydrateRuntimeEnvironmentForBlender(
        binding,
      );

    let cleanedUp = false;

    try {
      const response:
        BlenderEnvironmentHydrationReport = {
          ok: true,
          environment_resource_id:
            binding.environment_resource_id,
          variant_id:
            binding.variant_id,
          content_hash:
            binding.content_hash,
          file_name:
            hydrated.file_name,
          byte_size:
            hydrated.byte_size,
          format:
            hydrated.format,
          world_nodes:
            hydrated.world_nodes,
          mapping_rotation_radians:
            hydrated.mapping_rotation_radians,
          background_strength:
            hydrated.background_strength,
          visible_background:
            hydrated.visible_background,
          view_transform:
            hydrated.view_transform,
          exposure:
            hydrated.exposure,
          retained_for_debug:
            false,
          cleaned_up: false,
          error: null,
        };

      await hydrated.cleanup();
      cleanedUp = true;

      try {
        await access(
          hydrated.temporary_directory,
        );
      } catch {
        response.cleaned_up =
          true;
      }

      return NextResponse.json(
        response,
      );
    } finally {
      if (!cleanedUp) {
        await hydrated.cleanup();
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        environment_resource_id:
          null,
        variant_id: null,
        content_hash: null,
        file_name: null,
        byte_size: 0,
        format: null,
        world_nodes: [],
        mapping_rotation_radians:
          0,
        background_strength: 0,
        visible_background:
          false,
        view_transform: "AgX",
        exposure: 1,
        retained_for_debug:
          false,
        cleaned_up: true,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      } satisfies BlenderEnvironmentHydrationReport,
      { status: 500 },
    );
  }
}
