import { NextRequest, NextResponse } from "next/server";

import {
  assetWithFileStats,
  getMyWayAsset,
  listMyWayAssets,
  registerMyWayAsset,
  renameMyWayAssetId,
  repairAllMyWayAssetIdentityArtifacts,
  repairMyWayAssetIdentityArtifacts,
  updateMyWayAssetCanonicalLabel,
  updateMyWayAssetAliases,
  updateMyWayAssetProvenance,
  reviewMyWayAssetForScenes,
  reviewMyWayAssetSemanticIdentity,
} from "../asset-library.server";

function errorResponse(caught: unknown, status = 400) {
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

export async function GET(request: NextRequest) {
  try {
    const assetId = request.nextUrl.searchParams.get("asset_id");

    if (assetId) {
      const asset = await getMyWayAsset(assetId);

      if (!asset) {
        return NextResponse.json(
          { ok: false, error: "Asset not found." },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        asset: await assetWithFileStats(asset),
      });
    }

    const assets = await Promise.all(
      (await listMyWayAssets()).map(assetWithFileStats),
    );

    return NextResponse.json({
      ok: true,
      count: assets.length,
      assets,
    });
  } catch (caught) {
    return errorResponse(caught, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await registerMyWayAsset(body.asset ?? body);
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    return errorResponse(caught);
  }
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      body.action ===
      "repair_all_identity_artifacts"
    ) {
      const result =
        await repairAllMyWayAssetIdentityArtifacts();
      return NextResponse.json({
        ok: result.failed.length === 0,
        ...result,
      });
    }

    const assetId =
      typeof body.asset_id === "string"
        ? body.asset_id
        : "";

    if (!assetId.trim()) {
      throw new Error("asset_id is required");
    }

    if (
      body.action ===
      "repair_identity_artifacts"
    ) {
      const result =
        await repairMyWayAssetIdentityArtifacts({
          assetId,
          queueEmbeddingRefresh:
            body.queue_embedding_refresh !== false,
        });
      return NextResponse.json({
        ok: true,
        asset:
          await assetWithFileStats(
            result.asset,
          ),
        moved_identity_files:
          result.moved_identity_files,
        updated_reference_files:
          result.updated_reference_files,
        embedding_refresh_queued:
          result.embedding_refresh_queued,
        warnings: result.warnings,
      });
    }

    if (body.action === "rename_asset_id") {
      const nextAssetId =
        typeof body.next_asset_id === "string"
          ? body.next_asset_id
          : "";

      if (!nextAssetId.trim()) {
        throw new Error(
          "next_asset_id is required",
        );
      }

      const result =
        await renameMyWayAssetId({
          assetId,
          nextAssetId,
          queueEmbeddingRefresh:
            body.queue_embedding_refresh !== false,
        });

      return NextResponse.json({
        ok: true,
        asset:
          await assetWithFileStats(
            result.asset,
          ),
        renamed_from:
          result.renamed_from,
        updated_reference_files:
          result.updated_reference_files,
        moved_identity_files:
          result.moved_identity_files,
        embedding_refresh_needed:
          result.embedding_refresh_needed,
        embedding_refresh_queued:
          result.embedding_refresh_queued,
      });
    }

    if (body.action === "update_canonical_label") {
      const canonicalLabel =
        typeof body.canonical_label === "string"
          ? body.canonical_label
          : "";

      if (!canonicalLabel.trim()) {
        throw new Error(
          "canonical_label is required",
        );
      }

      const result =
        await updateMyWayAssetCanonicalLabel({
          assetId,
          canonicalLabel,
          queueEmbeddingRefresh:
            body.queue_embedding_refresh !== false,
        });

      return NextResponse.json({
        ok: true,
        asset:
          await assetWithFileStats(
            result.asset,
          ),
        canonical_label_updated_from:
          result.updated_from,
        embedding_refresh_needed:
          result.embedding_refresh_needed,
        embedding_refresh_queued:
          result.embedding_refresh_queued,
      });
    }


    if (body.action === "update_aliases") {
      const aliases = stringList(
        body.aliases,
      );

      const result =
        await updateMyWayAssetAliases({
          assetId,
          aliases,
        });

      return NextResponse.json({
        ok: true,
        asset:
          await assetWithFileStats(
            result.asset,
          ),
        aliases_updated_from:
          result.updated_from,
      });
    }

    if (body.action === "update_provenance") {
      const licenseKind =
        body.license_kind === "cc0" ||
        body.license_kind === "cc_by" ||
        body.license_kind === "cc_by_4_0" ||
        body.license_kind === "royalty_free" ||
        body.license_kind === "self_owned" ||
        body.license_kind === "unknown"
          ? body.license_kind
          : "unknown";
      const result =
        await updateMyWayAssetProvenance({
          assetId,
          sourceProvider:
            typeof body.source_provider === "string"
              ? body.source_provider
              : "",
          sourceAssetId:
            typeof body.source_asset_id === "string"
              ? body.source_asset_id
              : "",
          sourceUrl:
            typeof body.source_url === "string"
              ? body.source_url
              : "",
          assetTitle:
            typeof body.asset_title === "string"
              ? body.asset_title
              : "",
          creatorName:
            typeof body.creator_name === "string"
              ? body.creator_name
              : null,
          licenseKind,
          licenseVersion:
            typeof body.license_version === "string"
              ? body.license_version
              : null,
          attributionText:
            typeof body.attribution_text === "string"
              ? body.attribution_text
              : null,
          modificationNotice:
            typeof body.modification_notice === "string"
              ? body.modification_notice
              : null,
          downloadedAt:
            typeof body.downloaded_at === "string"
              ? body.downloaded_at
              : null,
          provenanceNotes:
            typeof body.provenance_notes === "string"
              ? body.provenance_notes
              : null,
        });

      return NextResponse.json({
        ok: true,
        asset:
          await assetWithFileStats(
            result.asset,
          ),
        source_record_path:
          result.source_record_path,
        license_record_path:
          result.license_record_path,
      });
    }

    if (body.action === "semantic_identity") {
      const semanticReviewStatus =
        body.semantic_review_status;

      if (
        semanticReviewStatus !== "pending" &&
        semanticReviewStatus !== "verified" &&
        semanticReviewStatus !== "mismatch" &&
        semanticReviewStatus !== "rejected"
      ) {
        throw new Error(
          "semantic_review_status must be pending, verified, mismatch, or rejected",
        );
      }

      const objectComposition =
        body.object_composition === "single_object" ||
        body.object_composition === "object_set" ||
        body.object_composition === "environment_piece" ||
        body.object_composition === "unknown"
          ? body.object_composition
          : "unknown";

      const asset =
        await reviewMyWayAssetSemanticIdentity({
          assetId,
          semanticReviewStatus,
          verifiedCanonicalLabel:
            typeof body.verified_canonical_label === "string"
              ? body.verified_canonical_label
              : null,
          verifiedAliases: stringList(
            body.verified_aliases,
          ),
          objectComposition,
          contains: stringList(body.contains),
          affordances: stringList(body.affordances),
          preferredForConcepts: stringList(
            body.preferred_for_concepts,
          ),
          notes:
            typeof body.semantic_review_notes === "string"
              ? body.semantic_review_notes
              : null,
        });

      return NextResponse.json({
        ok: true,
        asset: await assetWithFileStats(asset),
      });
    }

    const sceneReviewStatus = body.scene_review_status;

    if (
      sceneReviewStatus !== "pending" &&
      sceneReviewStatus !== "approved" &&
      sceneReviewStatus !== "rejected"
    ) {
      throw new Error(
        "scene_review_status must be pending, approved, or rejected",
      );
    }

    const asset = await reviewMyWayAssetForScenes({
      assetId,
      sceneReviewStatus,
      notes:
        typeof body.scene_review_notes === "string"
          ? body.scene_review_notes
          : null,
    });

    return NextResponse.json({
      ok: true,
      asset: await assetWithFileStats(asset),
    });
  } catch (caught) {
    return errorResponse(caught);
  }
}
