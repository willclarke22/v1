import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { parseJsonObjectFromText } from "@/sandbox/probe-lab/visual-experience/json-extract";
import { callVisualLearningTurnModel } from "@/sandbox/probe-lab/visual-experience/model-provider.server";
import {
  makePrimitiveBuildModelRequest,
  makePrimitiveBuildRepairRequest,
  normalizePrimitiveBuilderFallback,
  normalizePrimitiveBuilderProvider,
} from "../primitive-build-request";
import { makePrimitiveSceneGraphScaffoldText, normalizePrimitiveSceneGraph, sceneGraphToPrimitiveBuildPlan } from "../primitive-scene-graph";
import {
  preparePrimitiveBuilderSceneAssets,
  resolvePrimitiveBuilderSceneAssets,
} from "../../scenes/resolve-scene-assets.server";
import {
  enqueueMissingAssetRequirements,
  listMissingAssetJobs,
} from "../../assets/acquisition/missing-asset-store.server";
import {
  startMissingAssetAcquisitions,
} from "../../assets/acquisition/missing-asset-worker.server";

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function preview(value: string, max = 4000) {
  return value.length > max ? `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]` : value;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const sceneSessionId =
    `primitive_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const body = await request.json().catch(() => ({}));
  const acquisitionPolicy =
    body.acquisition_policy === "queue_only" ||
    body.acquisition_policy === "sandbox_synchronous"
      ? body.acquisition_policy
      : "never";
  const userRequest = text(body.prompt, "build something interesting");
  const provider = normalizePrimitiveBuilderProvider(body.provider);
  const fallbackProvider = normalizePrimitiveBuilderFallback(body.fallback_provider, provider);
  const modelRequest = makePrimitiveBuildModelRequest({ user_request: userRequest, style: body.style });

  let providerResult = await callVisualLearningTurnModel({
    provider,
    model_request: modelRequest as any,
    scaffold_raw_text:
      makePrimitiveSceneGraphScaffoldText(
        userRequest,
      ),
    generation_preset: "cinematic",
    enable_streaming: true,
    retry_transient_errors: true,
    fallback_provider: fallbackProvider,
  });

  const initialParsed =
    parseJsonObjectFromText(
      providerResult.raw_text,
    );
  let parsed = initialParsed;
  let parseRetry: {
    attempted: boolean;
    succeeded: boolean;
    error: string | null;
  } = {
    attempted: false,
    succeeded: false,
    error: null,
  };

  if (!initialParsed.ok) {
    parseRetry.attempted = true;

    try {
      const repairRequest =
        makePrimitiveBuildRepairRequest({
          user_request: userRequest,
          style: body.style,
          previous_response:
            providerResult.raw_text,
        });
      const repairResult =
        await callVisualLearningTurnModel({
          provider,
          model_request:
            repairRequest as any,
          scaffold_raw_text:
            makePrimitiveSceneGraphScaffoldText(
              userRequest,
            ),
          generation_preset: "cinematic",
          enable_streaming: false,
          retry_transient_errors: true,
          fallback_provider:
            fallbackProvider,
        });
      const repaired =
        parseJsonObjectFromText(
          repairResult.raw_text,
        );

      if (repaired.ok) {
        providerResult = repairResult;
        parsed = repaired;
        parseRetry.succeeded = true;
      } else {
        parseRetry.error = repaired.error;
      }
    } catch (caught) {
      parseRetry.error =
        caught instanceof Error
          ? caught.message
          : String(caught);
    }
  }

  const normalizedGraph =
    normalizePrimitiveSceneGraph(
      parsed.ok ? parsed.value : null,
      userRequest,
    );
  const warnings = [
    ...normalizedGraph.warnings,
  ];

  if (!initialParsed.ok) {
    if (parseRetry.succeeded) {
      warnings.unshift(
        `Initial model response could not be parsed (${initialParsed.error}); compact non-streaming JSON retry succeeded.`,
      );
    } else {
      warnings.unshift(
        `Model response parse failed: ${initialParsed.error}. Compact non-streaming retry also failed: ${parseRetry.error ?? "no JSON object was found"}.`,
      );
    }
  }

  const preparedAssets =
    await preparePrimitiveBuilderSceneAssets(
      normalizedGraph.scene_graph,
      userRequest,
    );
  warnings.push(...preparedAssets.warnings);

  const plan = sceneGraphToPrimitiveBuildPlan(
    preparedAssets.scene_graph,
  );
  const assetResolution =
    await resolvePrimitiveBuilderSceneAssets(
      preparedAssets.scene_graph,
    );
  warnings.push(...assetResolution.warnings);

  const acquisitionJobs =
    acquisitionPolicy === "never"
      ? []
      : await enqueueMissingAssetRequirements({
          sceneSessionId,
          source: "primitive_builder",
          title: plan.scene_title,
          originalPrompt: userRequest,
          requirements:
            assetResolution.unresolved_requirements,
        });

  if (
    acquisitionPolicy === "sandbox_synchronous"
  ) {
    startMissingAssetAcquisitions(
      acquisitionJobs
        .filter(
          (job) =>
            job.status === "missing" ||
            job.status === "unavailable",
        )
        .map((job) => job.job_id),
    );
  }

  const acquisitionJobSummaries =
    acquisitionPolicy === "never"
      ? []
      : await listMissingAssetJobs({
          sceneSessionId,
        });

  if (acquisitionJobs.length) {
    warnings.push(
      acquisitionPolicy === "queue_only"
        ? `${acquisitionJobs.length} missing asset acquisition job(s) were queued explicitly; the current scene continues with declared fallbacks.`
        : `${acquisitionJobs.length} missing asset acquisition job(s) were queued and started by an explicit sandbox acquisition request.`,
    );
  } else if (
    acquisitionPolicy === "never" &&
    assetResolution
      .unresolved_requirements.length
  ) {
    warnings.push(
      `${assetResolution.unresolved_requirements.length} asset requirement(s) remain unresolved. Acquisition policy is never, so no provider or acquisition worker was invoked.`,
    );
  }

  return NextResponse.json({
    ok: true,
    route: "primitive-builder-generate",
    schema_version: "primitive_scene_graph_v2",
    scene_session_id: sceneSessionId,
    acquisition_policy:
      acquisitionPolicy,
    acquisition_jobs:
      acquisitionJobSummaries,
    provider_requested: provider,
    fallback_provider: fallbackProvider,
    provider_used: providerResult.provider_used,
    provider_model: providerResult.model,
    provider_fallback_used: providerResult.provider_fallback_used ?? false,
    provider_call_error: providerResult.provider_call_error ?? null,
    duration_ms: Date.now() - startedAt,
    model_call_diagnostics: providerResult.diagnostics ?? null,
    provider_request_payload_preview: providerResult.request_payload_preview ?? null,
    prompt_stats: modelRequest.prompt_stats,
    parse_ok: parsed.ok,
    parse_error:
      parsed.ok ? null : parsed.error,
    parse_retry: parseRetry,
    warnings,
    scene_graph: preparedAssets.scene_graph,
    director_plan:
      preparedAssets.scene_graph.director_plan,
    director_validation:
      preparedAssets.scene_graph.director_validation,
    asset_requirements:
      preparedAssets.scene_graph.asset_requirements,
    asset_inference:
      preparedAssets.inferred_assets,
    asset_resolution: assetResolution,
    // Compatibility: keep a flattened plan so the existing beat/sidebar code and any old tests still have a plan field.
    plan,
    raw_text_preview: preview(providerResult.raw_text),
  });
}
