import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  normalizeAssetDesignBrief,
  validateAssetDesignBrief,
} from "../asset-design-brief";
import {
  prepareFoundryResources,
  resolveFoundryResourcePlan,
} from "../foundry-resource-service.server";

export const runtime =
  "nodejs";
export const maxDuration =
  300;

function briefFromBody(
  body:
    Record<string, unknown>,
) {
  return normalizeAssetDesignBrief(
    body.design_brief,
    {
      concept:
        String(
          body.request ??
            "generated asset",
        ),
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
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const brief =
      briefFromBody(
        body,
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
          design_brief:
            brief,
          design_brief_validation:
            validation,
        },
        { status: 400 },
      );
    }

    if (
      body.action ===
      "prepare"
    ) {
      const result =
        await prepareFoundryResources(
          brief,
          body.resource_plan,
        );
      return NextResponse.json({
        ok: true,
        design_brief:
          brief,
        ...result,
      });
    }

    const plan =
      await resolveFoundryResourcePlan(
        brief,
        body.resource_plan,
      );
    return NextResponse.json({
      ok: true,
      design_brief:
        brief,
      plan,
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
