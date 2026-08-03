import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  designBriefToProceduralSpec,
  normalizeAssetDesignBrief,
  validateAssetDesignBrief,
} from "../asset-design-brief";
import {
  normalizeFoundryResourcePlan,
} from "../foundry-resource-plan";
import {
  generateBlenderPython,
} from "../glm-blender-python.server";
import {
  normalizeProceduralAssetSpec,
  validateProceduralAssetSpec,
} from "../procedural-asset-spec";

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
    const qualityMode =
      body.quality_mode ===
        "draft" ||
      body.quality_mode ===
        "hero"
        ? body.quality_mode
        : "standard";
    const designBrief =
      body.design_brief &&
      typeof body.design_brief ===
        "object"
        ? normalizeAssetDesignBrief(
            body.design_brief,
            {
              concept:
                buildRequest,
              target_extent_m:
                targetExtentM,
              max_triangles:
                maxTriangles,
              quality_mode:
                qualityMode,
              style:
                String(
                  body.style ??
                    "clean stylized",
                ),
              animation_ready:
                body.animation_ready !==
                false,
            },
          )
        : null;
    if (designBrief) {
      const validation =
        validateAssetDesignBrief(
          designBrief,
        );
      if (!validation.valid) {
        return NextResponse.json(
          {
            ok: false,
            error:
              validation.errors.join(
                "; ",
              ),
            design_brief:
              designBrief,
            design_brief_validation:
              validation,
          },
          { status: 400 },
        );
      }
    }

    const resourcePlan =
      designBrief
        ? normalizeFoundryResourcePlan(
            body.resource_plan,
            designBrief,
          )
        : null;
    const result =
      await generateBlenderPython({
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
        qualityMode,
        designBrief,
        resourcePlan,
      });
    const finalBrief =
      result.design_brief;
    const briefValidation =
      validateAssetDesignBrief(
        finalBrief,
      );
    const assetSpec =
      normalizeProceduralAssetSpec(
        designBriefToProceduralSpec(
          finalBrief,
        ),
        {
          concept:
            buildRequest,
          target_extent_m:
            targetExtentM,
          max_triangles:
            maxTriangles,
          animation_ready:
            body.animation_ready !==
            false,
        },
      );
    const specValidation =
      validateProceduralAssetSpec(
        assetSpec,
      );

    const preflightValidation =
      result.preflight_validation;
    const ok =
      briefValidation.valid &&
      specValidation.valid &&
      preflightValidation.valid;

    return NextResponse.json({
      ok,
      error:
        ok
          ? undefined
          : preflightValidation.errors.length
            ? `GLM code remains blocked by ${preflightValidation.errors.length} preflight error(s) after the bounded correction pass.`
            : undefined,
      ...result,
      design_brief:
        finalBrief,
      design_brief_validation:
        briefValidation,
      asset_spec:
        assetSpec,
      asset_spec_validation:
        specValidation,
      resource_plan:
        resourcePlan,
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
