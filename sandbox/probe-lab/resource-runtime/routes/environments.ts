import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isReviewedRuntimeEnvironment,
  loadReviewedEnvironmentResolverSnapshot,
  resolveReviewedEnvironment,
} from "../reviewed-environment-resolver.server";
import {
  environmentFormatFromUrl,
  normalizeBackgroundMode,
  normalizeFallbackRig,
} from "../environment-runtime-policy";
import type {
  EnvironmentRuntimeListResponse,
  ReviewedEnvironmentSummary,
} from "../environment-runtime-contract";

export const maxDuration = 300;

function finiteNumber(
  value: unknown,
  fallback: number,
) {
  return typeof value ===
      "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function summary(
  item: Awaited<
    ReturnType<
      typeof loadReviewedEnvironmentResolverSnapshot
    >
  >["registry"]["hdris"][number],
): ReviewedEnvironmentSummary | null {
  const format =
    environmentFormatFromUrl(
      item.environment_url,
    );

  if (!format) return null;

  return {
    resource_id:
      item.resource_id,
    display_name:
      item.display_name,
    resolution:
      item.resolution,
    file_format:
      item.file_format,
    variant_id:
      item.variant_id,
    format,
    public_url:
      item.environment_url,
    content_hash:
      item.content_sha256,
    semantic_tags:
      item.semantic_tags,
    source_url:
      item.source_url,
  };
}

export async function GET() {
  try {
    const snapshot =
      await loadReviewedEnvironmentResolverSnapshot();

    const environments =
      snapshot.registry.hdris
        .filter(
          isReviewedRuntimeEnvironment,
        )
        .map(summary)
        .filter(
          (
            item,
          ): item is ReviewedEnvironmentSummary =>
            Boolean(item),
        )
        .sort((left, right) =>
          left.display_name.localeCompare(
            right.display_name,
          ),
        );

    const payload:
      EnvironmentRuntimeListResponse = {
        ok: true,
        environments,
        default_environment_id:
          environments[0]
            ?.resource_id ??
          null,
        registry_snapshot_id:
          snapshot.registry_snapshot_id,
        registry_content_hash:
          snapshot.registry_content_hash,
        error: null,
      };

    return NextResponse.json(
      payload,
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        environments: [],
        default_environment_id:
          null,
        registry_snapshot_id:
          null,
        registry_content_hash:
          null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      } satisfies EnvironmentRuntimeListResponse,
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;

    const snapshot =
      await loadReviewedEnvironmentResolverSnapshot();

    const result =
      resolveReviewedEnvironment(
        {
          preferred_environment_id:
            typeof body.environment_id ===
              "string"
              ? body.environment_id
              : null,
          intent:
            typeof body.intent ===
              "string"
              ? body.intent
              : "soft neutral educational lighting",
          semantic_tags:
            Array.isArray(
              body.semantic_tags,
            )
              ? body.semantic_tags.filter(
                  (
                    value,
                  ): value is string =>
                    typeof value ===
                    "string",
                )
              : [],
          background_mode:
            normalizeBackgroundMode(
              body.background_mode,
            ),
          fallback_rig:
            normalizeFallbackRig(
              body.fallback_rig,
            ),
          intensity:
            finiteNumber(
              body.intensity,
              1,
            ),
          rotation_radians:
            finiteNumber(
              body.rotation_radians,
              0,
            ),
          background_intensity:
            finiteNumber(
              body.background_intensity,
              1,
            ),
          background_blurriness:
            finiteNumber(
              body.background_blurriness,
              0,
            ),
          background_color:
            typeof body.background_color ===
              "string"
              ? body.background_color
              : "#0f172a",
          exposure:
            finiteNumber(
              body.exposure,
              1,
            ),
          force_fallback:
            body.force_fallback ===
            true,
          simulate_failure:
            body.simulate_failure ===
            true,
        },
        snapshot,
      );

    return NextResponse.json({
      ok: true,
      binding:
        result.binding,
      diagnostics:
        result.diagnostics,
      error: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        binding: null,
        diagnostics: null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}
