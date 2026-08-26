export type NeedsReviewSceneApprovalAssetLike = {
  status: string;
  scene_review_status?: string | null;
  semantic_review_status?: string | null;
  safe_to_use_in_sandbox?: boolean | null;
  storage_provider?: string | null;
  appearance_profile?: {
    status?: string | null;
  } | null;
  appearance_embedding?: {
    status?: string | null;
    vector_key?: string | null;
  } | null;
};

export type NeedsReviewSceneApprovalMetadataBlocker =
  | "not_safe_for_scene_use"
  | "semantic_identity_not_verified"
  | "vision_not_ready"
  | "embedding_not_ready"
  | null;

/**
 * Selects only Asset Library -> Needs review rows that are fully enriched and
 * otherwise eligible to enter the existing single-asset approve/publish path.
 *
 * The bulk action intentionally adds a stricter enrichment gate than the
 * historical single-asset button: both Omni vision and the durable appearance
 * embedding must be ready before publication is attempted.
 */
export function needsReviewSceneApprovalMetadataBlocker(
  asset: NeedsReviewSceneApprovalAssetLike,
): NeedsReviewSceneApprovalMetadataBlocker {
  if (asset.scene_review_status !== "pending") {
    return "not_safe_for_scene_use";
  }
  if (
    asset.status === "rejected" ||
    asset.safe_to_use_in_sandbox !== true
  ) {
    return "not_safe_for_scene_use";
  }
  if (
    asset.semantic_review_status !==
    "verified"
  ) {
    return "semantic_identity_not_verified";
  }
  if (
    asset.appearance_profile?.status !==
    "ready"
  ) {
    return "vision_not_ready";
  }
  if (
    asset.appearance_embedding?.status !==
      "ready" ||
    !asset.appearance_embedding.vector_key?.trim()
  ) {
    return "embedding_not_ready";
  }
  return null;
}
