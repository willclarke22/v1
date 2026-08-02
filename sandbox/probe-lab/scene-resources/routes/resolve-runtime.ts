import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  resolveLabSceneRuntime,
  type ResolveLabRuntimeInput,
} from "../lab-runtime-resolution.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      asRecord(
        await request.json(),
      );

    if (!body) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The Phase 2 runtime request must be a JSON object.",
        },
        { status: 400 },
      );
    }

    const source =
      body.source ===
        "manual_turn" ||
      body.source ===
        "primitive_builder" ||
      body.source ===
        "visual_experience"
        ? body.source
        : null;

    if (!source) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "source must be manual_turn, primitive_builder, or visual_experience.",
        },
        { status: 400 },
      );
    }

    const result =
      await resolveLabSceneRuntime({
        source,
        resource_plan:
          body.resource_plan,
        primitive_nodes:
          body.primitive_nodes,
        preferred_asset_ids_by_intent:
          (asRecord(
            body.preferred_asset_ids_by_intent,
          ) as Record<string, string> | null) ??
          undefined,
        material_override:
          asRecord(
            body.material_override,
          ) as ResolveLabRuntimeInput["material_override"],
        environment_override:
          asRecord(
            body.environment_override,
          ) as ResolveLabRuntimeInput["environment_override"],
        actor_transforms:
          asRecord(
            body.actor_transforms,
          ) as ResolveLabRuntimeInput["actor_transforms"],
      });

    return NextResponse.json({
      ok: true,
      route:
        "phase2-scene-runtime-resolve",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route:
          "phase2-scene-runtime-resolve",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}
