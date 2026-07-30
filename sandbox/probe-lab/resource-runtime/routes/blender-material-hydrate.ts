import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  hydrateRuntimeMaterialForBlender,
} from "../hydrate-runtime-material-for-blender.server";
import type {
  BlenderMaterialHydrationReport,
  RuntimeMaterialBindingV1,
} from "../material-runtime-contract";

export const maxDuration = 300;

function bindingFrom(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "material_binding is required.",
    );
  }

  const binding =
    value as RuntimeMaterialBindingV1;

  if (
    binding.schema_version !==
    "myway_material_runtime_v1"
  ) {
    throw new Error(
      "material_binding has an unsupported schema version.",
    );
  }

  return binding;
}

export async function POST(
  request: NextRequest,
) {
  let cleanedUp = false;

  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const binding =
      bindingFrom(
        body.material_binding,
      );
    const hydration =
      await hydrateRuntimeMaterialForBlender(
        binding,
      );

    try {
      const response: BlenderMaterialHydrationReport =
        {
          ok: true,
          material_resource_id:
            binding.material_resource_id,
          variant_id:
            binding.variant_id,
          content_hash:
            binding.content_hash,
          target_entity_id:
            binding.target_entity_id,
          file_count:
            hydration.files.length,
          total_bytes:
            hydration.total_bytes,
          files:
            hydration.files.map(
              (file) => ({
                role: file.role,
                file_name:
                  file.file_name,
                byte_size:
                  file.byte_size,
                blender_color_space:
                  file.blender_color_space,
                principled_input:
                  file.principled_input,
                channel:
                  file.channel,
              }),
            ),
          normal_map_convention:
            binding.normal_map_convention,
          retained_for_debug:
            false,
          cleaned_up: true,
        };

      return NextResponse.json(
        response,
      );
    } finally {
      await hydration.cleanup();
      cleanedUp = true;
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        material_resource_id:
          "",
        variant_id: "",
        content_hash: "",
        target_entity_id: "",
        file_count: 0,
        total_bytes: 0,
        files: [],
        normal_map_convention:
          "none",
        retained_for_debug:
          false,
        cleaned_up: cleanedUp,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      } satisfies BlenderMaterialHydrationReport,
      { status: 500 },
    );
  }
}
