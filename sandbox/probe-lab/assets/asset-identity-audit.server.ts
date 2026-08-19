import {
  assetWithFileStats,
  getMyWayAsset,
  listMyWayAssets,
  renameMyWayAssetId,
  updateMyWayAsset,
  updateMyWayAssetCanonicalLabel,
} from "./asset-library.server";
import {
  proposeAssetIdentity,
  type MyWayAssetIdentityProposal,
} from "./asset-identity";
import {
  pendingAssetReviewObjectExists,
} from "./storage/pending-asset-storage.server";

export type AssetIdentityAuditRow =
  MyWayAssetIdentityProposal & {
    review_bucket: "needs_review" | "approved" | "other";
    storage_provider: string;
    model_available: boolean | null;
    thumbnail_available: boolean | null;
    source_metadata_available: boolean | null;
    license_metadata_available: boolean | null;
  };

function reviewBucket(asset: Awaited<ReturnType<typeof getMyWayAsset>>) {
  if (!asset) return "other" as const;
  if (asset.scene_review_status === "approved") {
    return "approved" as const;
  }
  if (asset.status !== "rejected") {
    return "needs_review" as const;
  }
  return "other" as const;
}

async function auditRow(
  asset: NonNullable<Awaited<ReturnType<typeof getMyWayAsset>>>,
  options: { verifyStorage?: boolean } = {},
): Promise<AssetIdentityAuditRow> {
  const proposal = proposeAssetIdentity(asset);
  let modelAvailable: boolean | null = null;
  let thumbnailAvailable: boolean | null = null;

  if (options.verifyStorage === true) {
    const file = await assetWithFileStats(asset);
    modelAvailable = file.file_stats.exists;
    if (asset.storage_provider === "r2_private_pending") {
      modelAvailable =
        await pendingAssetReviewObjectExists(asset, "model");
    }
    if (
      asset.thumbnail_storage_provider === "r2_private_pending" &&
      asset.thumbnail_path
    ) {
      thumbnailAvailable =
        await pendingAssetReviewObjectExists(asset, "thumbnail");
    } else if (!asset.thumbnail_path) {
      thumbnailAvailable = true;
    }
  }

  return {
    ...proposal,
    review_bucket: reviewBucket(asset),
    storage_provider: asset.storage_provider ?? "local",
    model_available: modelAvailable,
    thumbnail_available: thumbnailAvailable,
    // The fast audit reports whether durable references exist in the registry.
    // Actual Cloudflare/local bytes are checked transactionally when a repair
    // is applied, so scanning hundreds of assets does not issue hundreds of
    // network probes.
    source_metadata_available:
      Boolean(
        asset.source_asset_id?.trim() ||
        asset.source_url?.trim() ||
        asset.attribution?.source_provider?.trim(),
      ) || null,
    license_metadata_available:
      asset.license_record_path ? true : null,
  };
}

export async function listAssetIdentityAudit() {
  const assets = (await listMyWayAssets())
    .filter((asset) => asset.status !== "rejected");

  const rows: AssetIdentityAuditRow[] = [];
  for (const asset of assets) {
    rows.push(await auditRow(asset));
  }

  rows.sort((left, right) => {
    const bucketOrder = {
      needs_review: 0,
      approved: 1,
      other: 2,
    } as const;
    return (
      bucketOrder[left.review_bucket] -
        bucketOrder[right.review_bucket] ||
      Number(right.technical_id_change) -
        Number(left.technical_id_change) ||
      left.current_display_name.localeCompare(
        right.current_display_name,
      )
    );
  });

  return {
    schema_version: "myway_asset_identity_audit_v1" as const,
    generated_at: new Date().toISOString(),
    total: rows.length,
    needing_technical_rename:
      rows.filter((row) => row.technical_id_change).length,
    safe_needs_review_repairs:
      rows.filter(
        (row) =>
          row.review_bucket === "needs_review" &&
          row.technical_id_change &&
          row.safe_to_auto_rename,
      ).length,
    approved_with_legacy_ids:
      rows.filter(
        (row) =>
          row.review_bucket === "approved" &&
          row.technical_id_change,
      ).length,
    rows,
  };
}

export async function applyAssetIdentityRepair(input: {
  assetId: string;
  nextAssetId?: string | null;
  nextCanonicalLabel?: string | null;
  nextDisplayName?: string | null;
  refreshEmbedding?: boolean;
}) {
  const before = await getMyWayAsset(input.assetId);
  if (!before) {
    throw new Error(`Asset was not found: ${input.assetId}`);
  }

  let current = before;
  const operations: string[] = [];
  const movedArtifacts: string[] = [];
  let embeddingRefreshNeeded = false;
  let embeddingRefreshQueued = false;

  const nextAssetId =
    input.nextAssetId?.trim() ||
    before.asset_id;

  if (nextAssetId !== current.asset_id) {
    const renamed =
      await renameMyWayAssetId({
        assetId: current.asset_id,
        nextAssetId,
        queueEmbeddingRefresh:
          input.refreshEmbedding !== false,
      });
    operations.push(
      `technical_id:${renamed.renamed_from}→${renamed.asset.asset_id}`,
    );
    movedArtifacts.push(
      ...renamed.moved_identity_files,
    );
    embeddingRefreshNeeded =
      embeddingRefreshNeeded ||
      Boolean(
        (renamed as {
          embedding_refresh_needed?: boolean;
        }).embedding_refresh_needed,
      );
    embeddingRefreshQueued =
      embeddingRefreshQueued ||
      Boolean(renamed.embedding_refresh_queued);
    current = renamed.asset;
  }

  const canonical =
    input.nextCanonicalLabel?.trim()
      .toLowerCase()
      .replace(/\s+/g, " ") ||
    (current.verified_canonical_label ||
      current.canonical_label);

  if (
    canonical !==
    (current.verified_canonical_label ||
      current.canonical_label)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
  ) {
    const semantic =
      await updateMyWayAssetCanonicalLabel({
        assetId: current.asset_id,
        canonicalLabel: canonical,
        queueEmbeddingRefresh:
          input.refreshEmbedding !== false,
      });
    operations.push(
      `canonical_label:${semantic.updated_from}→${canonical}`,
    );
    embeddingRefreshNeeded =
      embeddingRefreshNeeded ||
      Boolean(
        (semantic as {
          embedding_refresh_needed?: boolean;
        }).embedding_refresh_needed,
      );
    embeddingRefreshQueued =
      embeddingRefreshQueued ||
      semantic.embedding_refresh_queued;
    current = semantic.asset;
  }

  const displayName =
    input.nextDisplayName?.trim() ||
    current.display_name;
  if (displayName !== current.display_name) {
    current =
      await updateMyWayAsset(current.asset_id, {
        display_name: displayName,
      });
    operations.push(
      `display_name:${before.display_name}→${displayName}`,
    );
  }

  const verified = await auditRow(
    current,
    { verifyStorage: true },
  );
  if (verified.model_available === false) {
    throw new Error(
      `Identity repair completed registry changes but the model is not available through its authoritative storage reference: ${current.asset_id}`,
    );
  }
  if (verified.thumbnail_available === false) {
    throw new Error(
      `Identity repair completed registry changes but the thumbnail is not available through its authoritative storage reference: ${current.asset_id}`,
    );
  }

  return {
    asset: current,
    audit: verified,
    operations,
    moved_artifacts: movedArtifacts,
    embedding_refresh_needed:
      embeddingRefreshNeeded,
    embedding_refresh_queued:
      embeddingRefreshQueued,
    cloud_verified: true,
  };
}

export async function applySafeNeedsReviewIdentityRepairs(
  input: {
    refreshEmbedding?: boolean;
    limit?: number;
    excludeAssetIds?: string[];
  } = {},
) {
  const audit = await listAssetIdentityAudit();
  const excluded = new Set(
    (input.excludeAssetIds ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const limit = Math.min(
    20,
    Math.max(1, Math.floor(input.limit ?? 10)),
  );
  const allCandidates = audit.rows.filter(
    (row) =>
      row.review_bucket === "needs_review" &&
      row.technical_id_change &&
      row.safe_to_auto_rename &&
      !excluded.has(row.asset_id),
  );
  const candidates = allCandidates.slice(0, limit);
  const repaired: Array<
    Awaited<ReturnType<typeof applyAssetIdentityRepair>>
  > = [];
  const failed: Array<{
    asset_id: string;
    error: string;
  }> = [];

  for (const row of candidates) {
    try {
      repaired.push(
        await applyAssetIdentityRepair({
          assetId: row.asset_id,
          nextAssetId: row.proposed_asset_id,
          nextCanonicalLabel:
            row.proposed_canonical_label,
          nextDisplayName:
            row.proposed_display_name,
          refreshEmbedding:
            input.refreshEmbedding !== false,
        }),
      );
    } catch (caught) {
      failed.push({
        asset_id: row.asset_id,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  return {
    attempted: candidates.length,
    repaired,
    failed,
    remaining_safe_candidates: Math.max(
      0,
      allCandidates.length - candidates.length + failed.length,
    ),
  };
}
