import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  normalizeAssetDesignBrief,
  validateAssetDesignBrief,
} from "../asset-design-brief";
import {
  improveBlenderPython,
} from "../glm-blender-python.server";

export const runtime =
  "nodejs";
export const maxDuration =
  300;

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const code =
      String(
        body.code ?? "",
      );
    const buildRequest =
      String(
        body.request ??
          "generated asset",
      );
    const brief =
      normalizeAssetDesignBrief(
        body.design_brief,
        {
          concept:
            buildRequest,
          target_extent_m:
            Number(
              body.target_extent_m ??
                2,
            ),
          max_triangles:
            Number(
              body.max_triangles ??
                30_000,
            ),
          quality_mode:
            body.quality_mode ===
              "draft" ||
            body.quality_mode ===
              "hero"
              ? body.quality_mode
              : "standard",
          style:
            String(
              body.style ??
                "clean stylized",
            ),
          animation_ready:
            body.animation_ready !==
            false,
        },
      );
    const validation =
      validateAssetDesignBrief(
        brief,
      );
    if (!validation.valid) {
      return NextResponse.json(
        {
          ok: false,
          error:
            validation.errors.join(
              "; ",
            ),
        },
        { status: 400 },
      );
    }

    const result =
      await improveBlenderPython({
        code,
        request:
          buildRequest,
        critique:
          String(
            body.critique ??
              "",
          ),
        designBrief:
          brief,
        buildValidation:
          body.build_validation,
        qualityFindings:
          body.quality_findings,
      });

    return NextResponse.json({
      ok: true,
      ...result,
      line_count:
        result.code.split(
          /\r?\n/,
        ).length,
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
