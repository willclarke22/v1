import { NextRequest, NextResponse } from "next/server";

import { assetWithFileStats } from "../../assets/asset-library.server";
import {
  normalizePrimitiveBuilderAssetRequirements,
} from "../asset-requirement-plan";
import {
  generateTrellisPreviewForRequirement,
} from "../../scenes/resolve-scene-assets.server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawRequirement =
      body && typeof body === "object"
        ? body.requirement
        : null;
    const fallbackNodeId =
      rawRequirement &&
      typeof rawRequirement === "object" &&
      typeof rawRequirement.fallback_node_id === "string"
        ? rawRequirement.fallback_node_id
        : null;
    const warnings: string[] = [];
    const requirements =
      normalizePrimitiveBuilderAssetRequirements(
        [rawRequirement],
        new Set(
          fallbackNodeId ? [fallbackNodeId] : [],
        ),
        warnings,
      );
    const requirement = requirements[0];

    if (!requirement) {
      return NextResponse.json(
        {
          ok: false,
          error:
            warnings.join("; ") ||
            "A valid asset requirement is required.",
        },
        { status: 400 },
      );
    }

    const result =
      await generateTrellisPreviewForRequirement(
        requirement,
      );

    return NextResponse.json({
      ok: true,
      warning:
        "This TRELLIS model is available for the current scene preview, but remains globally scene-review pending until approved in the Asset Library.",
      warnings,
      asset: await assetWithFileStats(result.asset),
      binding: result.binding,
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
      { status: 500 },
    );
  }
}
