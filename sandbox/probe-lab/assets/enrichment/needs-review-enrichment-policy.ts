export type NeedsReviewEnrichmentAssetLike = {
  asset_type: string;
  status: string;
  scene_review_status?: string | null;
  appearance_profile?: {
    status?: string | null;
  } | null;
  appearance_embedding?: {
    status?: string | null;
    vector_key?: string | null;
  } | null;
};

export type NeedsReviewMissingEnrichmentMode =
  | "full"
  | "embedding_only"
  | null;

/**
 * Mirrors the Asset Library's visible Needs Review bucket and decides only
 * whether provider-backed enrichment is incomplete.
 *
 * - Vision must be ready before an embedding-only refresh is allowed.
 * - A "ready" embedding without a durable vector reference is treated as
 *   incomplete and regenerated.
 * - Approved/rejected/primitive rows are outside this targeted backfill.
 */
export function needsReviewMissingEnrichmentMode(
  asset: NeedsReviewEnrichmentAssetLike,
): NeedsReviewMissingEnrichmentMode {
  if (
    asset.scene_review_status !== "pending" ||
    asset.asset_type === "primitive" ||
    asset.status === "rejected"
  ) {
    return null;
  }

  if (asset.appearance_profile?.status !== "ready") {
    return "full";
  }

  if (
    asset.appearance_embedding?.status !== "ready" ||
    !asset.appearance_embedding.vector_key?.trim()
  ) {
    return "embedding_only";
  }

  return null;
}
