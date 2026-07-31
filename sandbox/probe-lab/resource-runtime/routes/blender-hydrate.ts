import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  hydrateResolvedModelForBlender,
} from "../hydrate-resolved-model-for-blender.server";
import type {
  RuntimeModelBindingV1,
} from "../resource-runtime-contract";

export const maxDuration = 300;

function asRuntimeBinding(
  value: unknown,
): RuntimeModelBindingV1 {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "runtime_binding is required.",
    );
  }

  const binding =
    value as RuntimeModelBindingV1;

  if (
    binding.schema_version !==
    "myway_resource_runtime_v1"
  ) {
    throw new Error(
      "runtime_binding has an unsupported schema version.",
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
      asRuntimeBinding(
        body.runtime_binding,
      );
    const hydration =
      await hydrateResolvedModelForBlender(
        binding,
        {
          verify_hash:
            body.verify_hash ===
            true,
          retain_debug: false,
          runtime_origin:
            request.nextUrl.origin,
        },
      );

    try {
      return NextResponse.json({
        ok: true,
        asset_id:
          binding.asset_id,
        entity_id:
          binding.entity_id,
        file_name:
          hydration.file_name,
        byte_size:
          hydration.byte_size,
        expected_content_hash:
          binding.content_hash,
        actual_content_hash:
          hydration.actual_content_hash,
        hash_verified:
          hydration.hash_verified,
        retained_for_debug:
          hydration.retained_for_debug,
        cleaned_up: true,
      });
    } finally {
      await hydration.cleanup();
      cleanedUp = true;
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        asset_id: "",
        entity_id: "",
        file_name: null,
        byte_size: null,
        expected_content_hash: null,
        actual_content_hash: null,
        hash_verified: null,
        retained_for_debug: false,
        cleaned_up: cleanedUp,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}

