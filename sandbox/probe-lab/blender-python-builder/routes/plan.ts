import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  FOUNDRY_QUALITY_MODES,
  validateAssetDesignBrief,
  type FoundryQualityMode,
} from "../asset-design-brief";
import {
  planAssetDesign,
} from "../glm-blender-python.server";

export const runtime =
  "nodejs";
export const maxDuration =
  300;

function qualityMode(
  value: unknown,
): FoundryQualityMode {
  return FOUNDRY_QUALITY_MODES.includes(
    value as FoundryQualityMode,
  )
    ? value as FoundryQualityMode
    : "standard";
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const buildRequest =
      String(
        body.request ?? "",
      ).trim();
    if (!buildRequest) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A build request is required.",
        },
        { status: 400 },
      );
    }

    const targetExtentM =
      Math.min(
        100,
        Math.max(
          0.02,
          Number(
            body.target_extent_m ??
              2,
          ),
        ),
      );
    const maxTriangles =
      Math.min(
        2_000_000,
        Math.max(
          100,
          Math.round(
            Number(
              body.max_triangles ??
                30_000,
            ),
          ),
        ),
      );
    const result =
      await planAssetDesign({
        request:
          buildRequest,
        style:
          String(
            body.style ??
              "clean stylized",
          ).trim() ||
          "clean stylized",
        animationReady:
          body.animation_ready !==
          false,
        targetExtentM,
        maxTriangles,
        qualityMode:
          qualityMode(
            body.quality_mode,
          ),
      });
    const validation =
      validateAssetDesignBrief(
        result.design_brief,
      );

    return NextResponse.json({
      ok:
        validation.valid,
      ...result,
      design_brief_validation:
        validation,
    });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      },
      { status: 502 },
    );
  }
}
