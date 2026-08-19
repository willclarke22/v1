import { NextResponse } from "next/server";

import {
  applyAssetIdentityRepair,
  applySafeNeedsReviewIdentityRepairs,
  listAssetIdentityAudit,
} from "../asset-identity-audit.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      ...(await listAssetIdentityAudit()),
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

export async function POST(request: Request) {
  try {
    const body =
      (await request.json().catch(() => ({}))) as {
        action?: string;
        asset_id?: string;
        next_asset_id?: string;
        next_canonical_label?: string;
        next_display_name?: string;
        refresh_embedding?: boolean;
        limit?: number;
        exclude_asset_ids?: string[];
      };

    if (body.action === "apply_safe_needs_review") {
      return NextResponse.json({
        ok: true,
        ...(await applySafeNeedsReviewIdentityRepairs({
          refreshEmbedding:
            body.refresh_embedding !== false,
          limit:
            typeof body.limit === "number"
              ? body.limit
              : 10,
          excludeAssetIds:
            Array.isArray(body.exclude_asset_ids)
              ? body.exclude_asset_ids.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
        })),
      });
    }

    if (body.action !== "apply") {
      return NextResponse.json(
        {
          ok: false,
          error:
            'action must be "apply" or "apply_safe_needs_review".',
        },
        { status: 400 },
      );
    }

    if (!body.asset_id?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "asset_id is required.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      result:
        await applyAssetIdentityRepair({
          assetId: body.asset_id,
          nextAssetId:
            body.next_asset_id ?? null,
          nextCanonicalLabel:
            body.next_canonical_label ??
            null,
          nextDisplayName:
            body.next_display_name ?? null,
          refreshEmbedding:
            body.refresh_embedding !== false,
        }),
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
