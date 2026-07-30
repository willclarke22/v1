import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  searchAmbientCgCatalog,
  syncAmbientCgCatalogPage,
} from "../catalog/ambientcg/ambientcg-client.server";
import {
  cacheAmbientCgAsset,
} from "../catalog/ambientcg/ambientcg-download.server";
import {
  importAmbientCgModel,
} from "../catalog/ambientcg/ambientcg-model-import.server";
import {
  listAmbientCgCachedResources,
  removeAmbientCgCachedResource,
  replaceAmbientCgResourceVariant,
} from "../catalog/ambientcg/ambientcg-resource-management.server";
import {
  getAmbientCgStorageStatus,
  readAmbientCgCatalog,
  readAmbientCgDownloadJobs,
  readAmbientCgHdriRegistry,
  readAmbientCgMaterialRegistry,
  readAmbientCgResourceRegistry,
  readAmbientCgSyncState,
} from "../catalog/ambientcg/ambientcg-store.server";
import {
  archiveCloudSourceBatch,
  bootstrapAllCloudAssetMetadata,
  cloudAssetMigrationStatus,
  compactVerifiedLocalMetadata,
  migrateCloudAssetBatch,
} from "../cloud-library-migration.server";

function errorResponse(
  caught: unknown,
  status = 400,
) {
  return NextResponse.json(
    {
      ok: false,
      error:
        caught instanceof Error
          ? caught.message
          : String(caught),
    },
    { status },
  );
}

function numberParam(
  value: string | null,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function attachCatalogVariants<
  T extends {
    source_asset_id: string;
    available_variants?: unknown[];
  },
>(
  items: T[],
  catalog: Awaited<
    ReturnType<
      typeof readAmbientCgCatalog
    >
  >,
) {
  const bySource = new Map(
    catalog.assets.map((asset) => [
      asset.source_asset_id,
      asset.download_variants,
    ]),
  );

  return items.map((item) => ({
    ...item,
    available_variants:
      item.available_variants?.length
        ? item.available_variants
        : bySource.get(
            item.source_asset_id,
          ) ?? [],
  }));
}

export async function GET(
  request: NextRequest,
) {
  try {
    const view =
      request.nextUrl.searchParams.get(
        "view",
      ) ?? "catalog";

    if (view === "status") {
      const [
        sync,
        materials,
        hdris,
        resources,
        jobs,
        migration,
      ] = await Promise.all([
        readAmbientCgSyncState(),
        readAmbientCgMaterialRegistry(),
        readAmbientCgHdriRegistry(),
        readAmbientCgResourceRegistry(),
        readAmbientCgDownloadJobs(),
        cloudAssetMigrationStatus(),
      ]);
      const resourceCounts =
        resources.resources.reduce<
          Record<string, number>
        >((counts, resource) => {
          counts[resource.asset_type] =
            (counts[resource.asset_type] ?? 0) + 1;
          return counts;
        }, {});

      return NextResponse.json({
        ok: true,
        sync,
        storage:
          getAmbientCgStorageStatus(),
        migration,
        counts: {
          materials:
            materials.materials.length,
          hdris:
            hdris.hdris.length,
          resources:
            resources.resources.length,
          by_type: resourceCounts,
          jobs:
            jobs.jobs.length,
        },
      });
    }

    if (view === "materials") {
      const [registry, catalog] =
        await Promise.all([
          readAmbientCgMaterialRegistry(),
          readAmbientCgCatalog(),
        ]);

      return NextResponse.json({
        ok: true,
        ...registry,
        materials: attachCatalogVariants(
          registry.materials,
          catalog,
        ),
      });
    }

    if (view === "hdris") {
      const [registry, catalog] =
        await Promise.all([
          readAmbientCgHdriRegistry(),
          readAmbientCgCatalog(),
        ]);

      return NextResponse.json({
        ok: true,
        ...registry,
        hdris: attachCatalogVariants(
          registry.hdris,
          catalog,
        ),
      });
    }

    if (view === "resources") {
      const [resources, catalog] =
        await Promise.all([
          listAmbientCgCachedResources({
            type:
              request.nextUrl.searchParams.get(
                "type",
              ),
          }),
          readAmbientCgCatalog(),
        ]);

      return NextResponse.json({
        ok: true,
        resources: attachCatalogVariants(
          resources,
          catalog,
        ),
      });
    }

    if (view === "jobs") {
      const registry =
        await readAmbientCgDownloadJobs();

      return NextResponse.json({
        ok: true,
        ...registry,
      });
    }

    const result =
      await searchAmbientCgCatalog({
        query:
          request.nextUrl.searchParams.get(
            "q",
          ) ?? "",
        type:
          request.nextUrl.searchParams.get(
            "type",
          ) ?? "all",
        status:
          request.nextUrl.searchParams.get(
            "status",
          ) ?? "all",
        page:
          numberParam(
            request.nextUrl.searchParams.get(
              "page",
            ),
            1,
          ),
        limit:
          numberParam(
            request.nextUrl.searchParams.get(
              "limit",
            ),
            24,
          ),
      });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (caught) {
    return errorResponse(
      caught,
      500,
    );
  }
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

    if (
      body.action === "sync_page"
    ) {
      const result =
        await syncAmbientCgCatalogPage({
          restart:
            body.restart === true,
          pageLimit:
            typeof body.page_limit ===
            "number"
              ? body.page_limit
              : undefined,
        });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (body.action === "cache") {
      const sourceAssetId =
        typeof body.source_asset_id ===
        "string"
          ? body.source_asset_id.trim()
          : "";

      if (!sourceAssetId) {
        throw new Error(
          "source_asset_id is required.",
        );
      }

      const result =
        await cacheAmbientCgAsset({
          sourceAssetId,
          variantId:
            typeof body.variant_id ===
            "string"
              ? body.variant_id
              : undefined,
        });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (body.action === "import_model") {
      const sourceAssetId =
        typeof body.source_asset_id === "string"
          ? body.source_asset_id.trim()
          : "";

      if (!sourceAssetId) {
        throw new Error("source_asset_id is required.");
      }

      const result = await importAmbientCgModel({
        sourceAssetId,
        variantId:
          typeof body.variant_id === "string"
            ? body.variant_id
            : undefined,
        targetExtentM:
          typeof body.target_extent_m === "number"
            ? body.target_extent_m
            : undefined,
      });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (body.action === "replace_variant") {
      const resourceId =
        typeof body.resource_id === "string"
          ? body.resource_id.trim()
          : "";
      const variantId =
        typeof body.variant_id === "string"
          ? body.variant_id.trim()
          : "";

      if (!resourceId || !variantId) {
        throw new Error(
          "resource_id and variant_id are required.",
        );
      }

      const result =
        await replaceAmbientCgResourceVariant({
          resourceId,
          variantId,
        });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (body.action === "remove_resource") {
      const resourceId =
        typeof body.resource_id === "string"
          ? body.resource_id.trim()
          : "";

      if (!resourceId) {
        throw new Error("resource_id is required.");
      }

      const result =
        await removeAmbientCgCachedResource({
          resourceId,
        });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (
      body.action ===
      "bootstrap_cloud_metadata"
    ) {
      const result =
        await bootstrapAllCloudAssetMetadata();

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (
      body.action ===
      "migrate_library_batch"
    ) {
      const result =
        await migrateCloudAssetBatch({
          limit:
            typeof body.limit ===
            "number"
              ? body.limit
              : 2,
          removeLocalAfterVerification:
            body.remove_local_after_verification ===
            true,
        });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (
      body.action ===
      "archive_cloud_sources_batch"
    ) {
      const result =
        await archiveCloudSourceBatch({
          limit:
            typeof body.limit ===
            "number"
              ? body.limit
              : 2,
          removeLocalAfterVerification:
            body.remove_local_after_verification ===
            true,
        });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (
      body.action ===
      "compact_local_metadata"
    ) {
      const result =
        await compactVerifiedLocalMetadata();

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    throw new Error(
      "Unknown ambientCG or cloud-library action.",
    );
  } catch (caught) {
    return errorResponse(caught);
  }
}
