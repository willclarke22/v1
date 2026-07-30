import type {
  AssetAcquisitionPolicy,
  AssetResolveRequest,
  MyWayAssetRecord,
} from "./asset-types";
import {
  appearanceAcquisitionTerms,
  normalizeAppearanceRequest,
} from "./appearance-request";
import {
  enqueueMissingAssetRequirements,
} from "./acquisition/missing-asset-store.server";
import {
  acquireFromBlenderKit,
} from "./providers/blenderkit-provider.server";
import {
  acquireFromTrellis,
} from "./providers/trellis-asset-provider.server";
import type {
  PrimitiveBuilderAssetRequirement,
} from "../primitive-builder/asset-requirement-plan";

export type MissingAssetAcquisitionResult = {
  ok: boolean;
  source:
    | "blenderkit"
    | "trellis"
    | "queued"
    | "none";
  asset: MyWayAssetRecord | null;
  warnings: string[];
  attempts: Array<{
    source: string;
    ok: boolean;
    error?: string;
  }>;
  queued_job_ids: string[];
  requires_scene_review: boolean;
};

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function acquisitionSearchQuery(
  request: AssetResolveRequest,
) {
  const appearance = normalizeAppearanceRequest(
    request.appearance_request,
  );
  const traits = appearanceAcquisitionTerms(
    appearance,
  )
    .flatMap((value) =>
      value
        .replace(/[^a-zA-Z0-9 -]+/g, " ")
        .trim()
        .split(/[,;]+/),
    )
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 2);

  return [
    request.concept.trim(),
    ...traits,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 140);
}

function queueRequirement(
  request: AssetResolveRequest,
): PrimitiveBuilderAssetRequirement {
  const context =
    request.acquisition_queue_context;
  const instanceId =
    context?.requirement_instance_id?.trim() ||
    `missing_${normalizePhrase(
      request.concept,
    ).replace(/\s+/g, "_") || "asset"}`;

  return {
    instance_id: instanceId,
    concept: request.concept,
    aliases: request.aliases ?? [],
    semantic_tags:
      request.semantic_tags ?? [],
    appearance_request:
      request.appearance_request,
    motion_role:
      "future reviewed scene actor",
    must_be_separate:
      request.desired_composition !==
      "object_set",
    reusable: true,
    required: true,
    target_extent_m:
      Math.max(
        0.02,
        request.target_extent_m ?? 1,
      ),
    layout_proxy_kind: "none",
    layout_proxy_node_ids: [],
    placement_relation: "absolute",
    placement_anchor: "center",
    placement_region: {
      region_kind: "any",
      exposure: "any",
      orientation: "any",
      vertical_rank: "any",
      openness: "any",
      side: "any",
      require_ground_contact: false,
      allow_intersection: false,
    },
    placement_source: "inferred",
    placement_offset: [0, 0, 0],
    placement_uv: [0, 0],
    layout_priority: 0,
    clearance_m: 0.01,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function pendingReviewWarning(
  asset: MyWayAssetRecord,
) {
  return `Asset ${asset.asset_id} was acquired, but it remains semantic-review and scene-review pending. It cannot be selected by automatic scene composition until reviewed and approved.`;
}

export async function requestMissingAssetAcquisition(
  request: AssetResolveRequest,
  policy: Exclude<
    AssetAcquisitionPolicy,
    "never"
  >,
): Promise<MissingAssetAcquisitionResult> {
  const warnings: string[] = [];
  const attempts:
    MissingAssetAcquisitionResult["attempts"] =
      [];

  if (policy === "queue_only") {
    const context =
      request.acquisition_queue_context;

    if (
      !context?.scene_session_id?.trim()
    ) {
      return {
        ok: false,
        source: "none",
        asset: null,
        warnings: [
          "queue_only acquisition requires acquisition_queue_context.scene_session_id.",
        ],
        attempts,
        queued_job_ids: [],
        requires_scene_review: false,
      };
    }

    const jobs =
      await enqueueMissingAssetRequirements({
        sceneSessionId:
          context.scene_session_id,
        sceneId:
          context.scene_id ?? null,
        source: context.source,
        title:
          context.title ?? null,
        originalPrompt:
          context.original_prompt ?? null,
        requirements: [
          queueRequirement(request),
        ],
      });

    return {
      ok: jobs.length > 0,
      source:
        jobs.length > 0
          ? "queued"
          : "none",
      asset: null,
      warnings:
        jobs.length > 0
          ? [
              `Queued ${jobs.length} reviewed-resource acquisition job(s). The current scene must continue with its declared fallback.`,
            ]
          : [
              "No missing-resource acquisition job was created.",
            ],
      attempts: [
        {
          source:
            "missing_asset_queue",
          ok: jobs.length > 0,
        },
      ],
      queued_job_ids:
        jobs.map((job) => job.job_id),
      requires_scene_review: false,
    };
  }

  const appearance =
    normalizeAppearanceRequest(
      request.appearance_request,
    );

  if (request.allow_blenderkit !== false) {
    try {
      const registered =
        await acquireFromBlenderKit({
          concept: request.concept,
          aliases: request.aliases,
          semanticTags:
            request.semantic_tags,
          acquisitionTerms:
            appearanceAcquisitionTerms(
              appearance,
            ),
          searchQuery:
            acquisitionSearchQuery(
              request,
            ),
          domain: request.domain,
          targetExtentM:
            request.target_extent_m,
        });
      attempts.push({
        source: "blenderkit",
        ok: true,
      });
      warnings.push(
        pendingReviewWarning(
          registered.asset,
        ),
      );

      return {
        ok: true,
        source: "blenderkit",
        asset: registered.asset,
        warnings,
        attempts,
        queued_job_ids: [],
        requires_scene_review: true,
      };
    } catch (caught) {
      const error =
        caught instanceof Error
          ? caught.message
          : String(caught);
      attempts.push({
        source: "blenderkit",
        ok: false,
        error,
      });
      warnings.push(
        `BlendKit acquisition failed; TRELLIS fallback was considered. ${error}`,
      );
    }
  }

  if (request.allow_trellis !== false) {
    try {
      const registered =
        await acquireFromTrellis({
          concept: request.concept,
          semanticTags:
            request.semantic_tags,
          acquisitionTerms: [
            ...appearanceAcquisitionTerms(
              appearance,
            ),
            "complete object",
            "clean detailed geometry",
            "accurate proportions",
          ],
          domain: request.domain,
          targetExtentM:
            request.target_extent_m,
        });
      attempts.push({
        source: "trellis",
        ok: true,
      });
      warnings.push(
        pendingReviewWarning(
          registered.asset,
        ),
      );

      return {
        ok: true,
        source: "trellis",
        asset: registered.asset,
        warnings,
        attempts,
        queued_job_ids: [],
        requires_scene_review: true,
      };
    } catch (caught) {
      const error =
        caught instanceof Error
          ? caught.message
          : String(caught);
      attempts.push({
        source: "trellis",
        ok: false,
        error,
      });
      warnings.push(
        `TRELLIS generation failed. ${error}`,
      );
    }
  }

  return {
    ok: false,
    source: "none",
    asset: null,
    warnings,
    attempts,
    queued_job_ids: [],
    requires_scene_review: false,
  };
}
