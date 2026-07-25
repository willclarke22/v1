import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  assetWithFileStats,
  listMyWayAssets,
} from "../asset-library.server";
import {
  listMissingAssetJobs,
} from "../acquisition/missing-asset-store.server";
import {
  queueAssetEnrichment,
} from "../enrichment/asset-enrichment-worker.server";
import {
  acquireFromBlenderKit,
} from "../providers/blenderkit-provider.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is string =>
            typeof item === "string",
        )
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;
    const concept =
      typeof body.concept === "string"
        ? body.concept.trim()
        : "";

    if (!concept) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Type the object identity to import from BlendKit.",
        },
        { status: 400 },
      );
    }

    const [
      existing,
      acquisitionJobs,
    ] = await Promise.all([
      listMyWayAssets(),
      listMissingAssetJobs(),
    ]);
    const excludedSourceAssetIds =
      Array.from(
        new Set([
          ...existing
            .filter(
              (asset) =>
                asset.source_type ===
                  "blenderkit" &&
                typeof asset.source_asset_id ===
                  "string" &&
                asset.source_asset_id.trim(),
            )
            .map((asset) =>
              asset.source_asset_id!.trim(),
            ),
          ...acquisitionJobs.flatMap(
            (job) => [
              ...job.excluded_source_asset_ids,
              ...job.candidate_history
                .filter(
                  (candidate) =>
                    candidate.source_type ===
                      "blenderkit" &&
                    typeof candidate.source_asset_id ===
                      "string" &&
                    candidate.source_asset_id.trim(),
                )
                .map((candidate) =>
                  candidate.source_asset_id!.trim(),
                ),
            ],
          ),
        ]),
      );

    const aliases = stringList(
      body.aliases,
    );

    const result =
      await acquireFromBlenderKit({
        concept,
        aliases,
        semanticTags: [
          concept,
          ...aliases,
        ],
        domain:
          typeof body.domain === "string" &&
          body.domain.trim()
            ? body.domain.trim()
            : "asset_library_direct_import",
        // BlendKit source files are normalized to a consistent working
        // extent. Primitive Builder applies real-world logical sizing later.
        targetExtentM: 2,
        searchQuery:
          typeof body.search_query ===
            "string" &&
          body.search_query.trim()
            ? body.search_query.trim()
            : concept,
        requiredLicenseKind: "cc0",
        excludedSourceAssetIds,
      });

    const entry =
      queueAssetEnrichment(
        result.asset.asset_id,
        { force: true },
      );

    return NextResponse.json({
      ok: true,
      created: result.created,
      asset:
        await assetWithFileStats(
          result.asset,
        ),
      enrichment_entry: entry,
      normalization_extent_m: 2,
      message:
        "The CC0 BlendKit candidate was imported and queued for four-view style analysis. Review its identity and appearance before approving it for scenes.",
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
