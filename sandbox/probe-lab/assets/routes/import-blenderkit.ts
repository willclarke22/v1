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
  searchBlenderKitCandidates,
} from "../providers/blenderkit-candidate-search.server";
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

async function existingAndExcludedSourceIds() {
  const [existing, acquisitionJobs] = await Promise.all([
    listMyWayAssets(),
    listMissingAssetJobs(),
  ]);
  const excludedSourceAssetIds = Array.from(
    new Set([
      ...existing
        .filter(
          (asset) =>
            asset.source_type === "blenderkit" &&
            typeof asset.source_asset_id === "string" &&
            asset.source_asset_id.trim(),
        )
        .map((asset) => asset.source_asset_id!.trim()),
      ...acquisitionJobs.flatMap((job) => [
        ...job.excluded_source_asset_ids,
        ...job.candidate_history
          .filter(
            (candidate) =>
              candidate.source_type === "blenderkit" &&
              typeof candidate.source_asset_id === "string" &&
              candidate.source_asset_id.trim(),
          )
          .map((candidate) => candidate.source_asset_id!.trim()),
      ]),
    ]),
  );

  return {
    existing,
    excludedSourceAssetIds,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body =
      (await request.json()) as Record<string, unknown>;
    const action =
      typeof body.action === "string"
        ? body.action.trim().toLowerCase()
        : "import";
    const concept =
      typeof body.concept === "string"
        ? body.concept.trim()
        : "";

    if (!concept) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Type the object identity to search or import from BlendKit.",
        },
        { status: 400 },
      );
    }

    if (action === "search") {
      const existing = await listMyWayAssets();
      const result = await searchBlenderKitCandidates({
        query:
          typeof body.search_query === "string" &&
          body.search_query.trim()
            ? body.search_query.trim()
            : concept,
        existingAssets: existing,
        limit: 12,
      });

      return NextResponse.json({
        ok: true,
        ...result,
        message:
          result.candidates.length > 0
            ? `Found ${result.candidates.length} selectable CC0 BlendKit candidate(s).`
            : "BlendKit returned no selectable CC0 candidates for this search.",
      });
    }

    if (action !== "import") {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported BlendKit manual action: ${action}`,
        },
        { status: 400 },
      );
    }

    const selectedSourceAssetId =
      typeof body.selected_source_asset_id === "string"
        ? body.selected_source_asset_id.trim()
        : "";
    const { existing, excludedSourceAssetIds } =
      await existingAndExcludedSourceIds();

    if (
      selectedSourceAssetId &&
      existing.some(
        (asset) =>
          asset.source_type === "blenderkit" &&
          asset.source_asset_id === selectedSourceAssetId,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "That exact BlendKit candidate is already registered in the Asset Library.",
        },
        { status: 409 },
      );
    }

    const aliases = stringList(body.aliases);
    const searchQuery =
      typeof body.search_query === "string" &&
      body.search_query.trim()
        ? body.search_query.trim()
        : concept;

    const result = await acquireFromBlenderKit({
      concept,
      aliases,
      semanticTags: [concept, ...aliases],
      domain:
        typeof body.domain === "string" && body.domain.trim()
          ? body.domain.trim()
          : "asset_library_direct_import",
      // BlendKit source files are normalized to a consistent working
      // extent. Primitive Builder applies real-world logical sizing later.
      targetExtentM: 2,
      searchQuery,
      requiredLicenseKind: "cc0",
      excludedSourceAssetIds: selectedSourceAssetId
        ? excludedSourceAssetIds.filter(
            (entry) => entry !== selectedSourceAssetId,
          )
        : excludedSourceAssetIds,
      selectedSourceAssetId: selectedSourceAssetId || null,
    });

    const entry = queueAssetEnrichment(result.asset.asset_id, {
      force: true,
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      asset: await assetWithFileStats(result.asset),
      enrichment_entry: entry,
      normalization_extent_m: 2,
      selected_source_asset_id: selectedSourceAssetId || null,
      message:
        "The selected CC0 BlendKit candidate was imported and queued for four-view style analysis. Review its identity and appearance before approving it for scenes.",
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
