import { NextResponse } from "next/server";

import {
  getSemanticEmbeddingPilotStatus,
  prepareSemanticEmbeddingPilot,
  resetSemanticEmbeddingPilot,
  runSemanticAssetSearchComparison,
  runSemanticEmbeddingPilotStep,
  runSemanticEmbeddingPilotWindow,
} from "../../assets/search/asset-semantic-embedding-pilot.server";
import {
  clearSemanticSearchServingSnapshotV2,
  getSemanticEmbeddingPilotStatusV2,
  prepareSemanticEmbeddingPilotV2,
  publishSemanticSearchServingSnapshotV2,
  resetSemanticEmbeddingPilotV2,
  runSemanticAssetSearchComparisonV2,
  runSemanticEmbeddingPilotStepV2,
  runSemanticEmbeddingPilotWindowV2,
  semanticSearchServingSnapshotStatusV2,
} from "../../assets/search/asset-semantic-embedding-pilot-v2.server";
import {
  runSemanticAssetEvidenceRerankAbV1,
  runSemanticAssetEvidenceRerankAbcV2,
  runSemanticAssetRerankV1,
  runSemanticRerankBenchmarkV1,
  runSemanticRerankerProbeV1,
} from "../../assets/search/asset-semantic-reranker-pilot.server";
import {
  clearSemanticEvidenceSnapshotV1,
  publishSemanticEvidenceSnapshotV1,
  runSemanticEvidenceAuditV1,
  runSemanticEvidenceAuditV2,
  semanticEvidenceSnapshotStatusV1,
} from "../../assets/search/asset-semantic-evidence-pilot.server";

function roundedMs(value: number) {
  return Number(value.toFixed(2));
}

export async function POST(request: Request) {
  const routeStarted = performance.now();
  try {
    const requestParseStarted = performance.now();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestParseDurationMs = roundedMs(performance.now() - requestParseStarted);
    const action =
      typeof body.action === "string" && body.action.trim()
        ? body.action.trim()
        : "pilot_status";
    const mode =
      body.asset_collection_mode === "bodyparts3d_slp_pilot"
        ? "bodyparts3d_slp_pilot"
        : "bodyparts3d_full_atlas";

    if (action === "pilot_prepare") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await prepareSemanticEmbeddingPilot(mode)),
      });
    }

    if (action === "pilot_status") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await getSemanticEmbeddingPilotStatus(mode)),
      });
    }

    if (action === "pilot_step") {
      const result = await runSemanticEmbeddingPilotStep(mode);
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...result,
      });
    }

    if (action === "pilot_run_window") {
      const result = await runSemanticEmbeddingPilotWindow(
        mode,
        Number(body.max_batches) || 6,
      );
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...result,
      });
    }

    if (action === "pilot_reset") {
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await resetSemanticEmbeddingPilot()),
      });
    }

    if (action === "semantic_compare") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_comparison: await runSemanticAssetSearchComparison(body),
      });
    }

    if (action === "pilot_v2_prepare") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await prepareSemanticEmbeddingPilotV2(mode)),
      });
    }

    if (action === "pilot_v2_status") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await getSemanticEmbeddingPilotStatusV2(mode)),
      });
    }

    if (action === "pilot_v2_step") {
      const result = await runSemanticEmbeddingPilotStepV2(mode);
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...result,
      });
    }

    if (action === "pilot_v2_run_window") {
      const result = await runSemanticEmbeddingPilotWindowV2(
        mode,
        Number(body.max_batches) || 6,
      );
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...result,
      });
    }

    if (action === "pilot_v2_reset") {
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await resetSemanticEmbeddingPilotV2()),
      });
    }

    if (action === "semantic_compare_v2") {
      const comparisonStarted = performance.now();
      const comparison = await runSemanticAssetSearchComparisonV2(body);
      const comparisonHandlerDurationMs = roundedMs(
        performance.now() - comparisonStarted,
      );
      const routeTotalBeforeSerializationMs = roundedMs(
        performance.now() - routeStarted,
      );
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_comparison_v2: comparison,
        route_metrics: {
          request_parse_duration_ms: requestParseDurationMs,
          comparison_handler_duration_ms: comparisonHandlerDurationMs,
          route_total_before_nextresponse_serialization_ms:
            routeTotalBeforeSerializationMs,
          route_wrapper_duration_ms: roundedMs(
            Math.max(
              0,
              routeTotalBeforeSerializationMs -
                requestParseDurationMs -
                comparisonHandlerDurationMs,
            ),
          ),
        },
      });
    }

    if (action === "pilot_v2_publish_serving_snapshot") {
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await publishSemanticSearchServingSnapshotV2(mode)),
      });
    }

    if (action === "pilot_v2_serving_snapshot_status") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        snapshot: semanticSearchServingSnapshotStatusV2(),
      });
    }

    if (action === "pilot_v2_clear_serving_snapshot") {
      const serving = clearSemanticSearchServingSnapshotV2();
      const evidence = clearSemanticEvidenceSnapshotV1();
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...serving,
        evidence_snapshot: evidence.snapshot,
      });
    }

    if (action === "semantic_evidence_publish_v1") {
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await publishSemanticEvidenceSnapshotV1(mode)),
      });
    }

    if (action === "semantic_evidence_status_v1") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        snapshot: semanticEvidenceSnapshotStatusV1(),
      });
    }

    if (action === "semantic_evidence_clear_v1") {
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...clearSemanticEvidenceSnapshotV1(),
      });
    }

    if (action === "semantic_evidence_audit_v1") {
      const auditStarted = performance.now();
      const audit = await runSemanticEvidenceAuditV1(body);
      const auditHandlerDurationMs = roundedMs(performance.now() - auditStarted);
      const routeTotalBeforeSerializationMs = roundedMs(
        performance.now() - routeStarted,
      );
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_evidence_audit_v1: audit,
        route_metrics: {
          request_parse_duration_ms: requestParseDurationMs,
          audit_handler_duration_ms: auditHandlerDurationMs,
          route_total_before_nextresponse_serialization_ms:
            routeTotalBeforeSerializationMs,
          route_wrapper_duration_ms: roundedMs(
            Math.max(
              0,
              routeTotalBeforeSerializationMs -
                requestParseDurationMs -
                auditHandlerDurationMs,
            ),
          ),
        },
      });
    }

    if (action === "semantic_evidence_anchor_audit_v2") {
      const auditStarted = performance.now();
      const audit = await runSemanticEvidenceAuditV2(body);
      const auditHandlerDurationMs = roundedMs(performance.now() - auditStarted);
      const routeTotalBeforeSerializationMs = roundedMs(performance.now() - routeStarted);
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_evidence_anchor_audit_v2: audit,
        route_metrics: {
          request_parse_duration_ms: requestParseDurationMs,
          audit_handler_duration_ms: auditHandlerDurationMs,
          route_total_before_nextresponse_serialization_ms: routeTotalBeforeSerializationMs,
          route_wrapper_duration_ms: roundedMs(
            Math.max(0, routeTotalBeforeSerializationMs - requestParseDurationMs - auditHandlerDurationMs),
          ),
        },
      });
    }

    if (action === "reranker_probe") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        reranker_probe: await runSemanticRerankerProbeV1(),
      });
    }

    if (action === "semantic_rerank_v1") {
      const rerankStarted = performance.now();
      const rerank = await runSemanticAssetRerankV1(body);
      const rerankHandlerDurationMs = roundedMs(performance.now() - rerankStarted);
      const routeTotalBeforeSerializationMs = roundedMs(
        performance.now() - routeStarted,
      );
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_rerank_v1: rerank,
        route_metrics: {
          request_parse_duration_ms: requestParseDurationMs,
          rerank_handler_duration_ms: rerankHandlerDurationMs,
          route_total_before_nextresponse_serialization_ms:
            routeTotalBeforeSerializationMs,
          route_wrapper_duration_ms: roundedMs(
            Math.max(
              0,
              routeTotalBeforeSerializationMs -
                requestParseDurationMs -
                rerankHandlerDurationMs,
            ),
          ),
        },
      });
    }

    if (action === "semantic_evidence_rerank_ab_v1") {
      const rerankStarted = performance.now();
      const rerank = await runSemanticAssetEvidenceRerankAbV1(body);
      const rerankHandlerDurationMs = roundedMs(performance.now() - rerankStarted);
      const routeTotalBeforeSerializationMs = roundedMs(
        performance.now() - routeStarted,
      );
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_evidence_rerank_ab_v1: rerank,
        route_metrics: {
          request_parse_duration_ms: requestParseDurationMs,
          rerank_handler_duration_ms: rerankHandlerDurationMs,
          route_total_before_nextresponse_serialization_ms:
            routeTotalBeforeSerializationMs,
          route_wrapper_duration_ms: roundedMs(
            Math.max(
              0,
              routeTotalBeforeSerializationMs -
                requestParseDurationMs -
                rerankHandlerDurationMs,
            ),
          ),
        },
      });
    }

    if (action === "semantic_evidence_rerank_abc_v2") {
      const rerankStarted = performance.now();
      const rerank = await runSemanticAssetEvidenceRerankAbcV2(body);
      const rerankHandlerDurationMs = roundedMs(performance.now() - rerankStarted);
      const routeTotalBeforeSerializationMs = roundedMs(performance.now() - routeStarted);
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_evidence_rerank_abc_v2: rerank,
        route_metrics: {
          request_parse_duration_ms: requestParseDurationMs,
          rerank_handler_duration_ms: rerankHandlerDurationMs,
          route_total_before_nextresponse_serialization_ms: routeTotalBeforeSerializationMs,
          route_wrapper_duration_ms: roundedMs(
            Math.max(0, routeTotalBeforeSerializationMs - requestParseDurationMs - rerankHandlerDurationMs),
          ),
        },
      });
    }

    if (action === "semantic_rerank_benchmark_v1") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        reranker_benchmark_v1: await runSemanticRerankBenchmarkV1(body),
      });
    }

    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/semantic-embedding-pilot",
        error: `Unsupported semantic embedding pilot action: ${action}`,
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/semantic-embedding-pilot",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
