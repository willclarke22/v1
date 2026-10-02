import { stableTextHash } from "../content-hash.server";
import {
  getSemanticSearchServingDocumentsV2,
  runSemanticAssetSearchServingV2,
  semanticSearchServingSnapshotStatusV2,
} from "./asset-semantic-embedding-pilot-v2.server";
import {
  ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES,
  ASSET_SEMANTIC_RERANK_BENCHMARK_V1_SCHEMA_VERSION,
  benchmarkFirstAcceptedRank,
  benchmarkPercentile,
} from "./asset-semantic-rerank-benchmark";
import {
  ASSET_SEMANTIC_RERANKER_V1_SCHEMA_VERSION,
  buildAssetRerankerInputsEvidenceV2,
  buildAssetRerankerInputsEvidenceV3,
  buildAssetRerankerInputsV1,
  compileAssetRerankerQueryV1,
  mergeAssetRerankerRankingsV1,
} from "./asset-semantic-reranker";
import {
  buildSemanticEvidenceContextsV1,
  buildSemanticEvidenceContextsV2,
  semanticEvidenceSnapshotStatusV1,
} from "./asset-semantic-evidence-pilot.server";
import {
  callNvidiaAssetRerankerV1,
  probeNvidiaAssetRerankerV1,
} from "./asset-semantic-reranker-provider.server";

function roundedMs(value: number) {
  return Number(value.toFixed(2));
}

export async function runSemanticAssetRerankV1(
  raw: Record<string, unknown>,
) {
  const totalStarted = performance.now();
  const retrievalStarted = performance.now();
  const retrieval = await runSemanticAssetSearchServingV2({
    ...raw,
    limit: 20,
  });
  const retrievalDurationMs = roundedMs(performance.now() - retrievalStarted);

  const candidateStarted = performance.now();
  const rrfCandidates = retrieval.candidate_union.slice(0, 20);
  const documents = getSemanticSearchServingDocumentsV2(
    rrfCandidates.map((candidate) => candidate.asset_id),
  );
  const rerankerInputs = buildAssetRerankerInputsV1(rrfCandidates, documents);
  if (!rerankerInputs.length) {
    throw new Error("Reranker received no candidate passages from the published V2 snapshot.");
  }
  const rerankerQuery = compileAssetRerankerQueryV1(retrieval.query_packet);
  const candidatePassageCompileDurationMs = roundedMs(
    performance.now() - candidateStarted,
  );

  const providerStarted = performance.now();
  const provider = await callNvidiaAssetRerankerV1({
    query: rerankerQuery,
    passages: rerankerInputs.map((candidate) => candidate.passage),
    timeout_ms: Number(raw.reranker_timeout_ms) || 60_000,
  });
  const rerankerProviderWallDurationMs = roundedMs(
    performance.now() - providerStarted,
  );

  const mergeStarted = performance.now();
  const reranked = mergeAssetRerankerRankingsV1(
    rerankerInputs,
    provider.rankings,
  ).map((candidate) => ({
    ...candidate,
    candidate_text_hash: stableTextHash(candidate.candidate_passage),
  }));
  const rerankerMergeDurationMs = roundedMs(performance.now() - mergeStarted);
  const totalDurationMs = roundedMs(performance.now() - totalStarted);
  const accounted = roundedMs(
    retrievalDurationMs +
      candidatePassageCompileDurationMs +
      rerankerProviderWallDurationMs +
      rerankerMergeDurationMs,
  );

  return {
    schema_version: ASSET_SEMANTIC_RERANKER_V1_SCHEMA_VERSION,
    query_packet: retrieval.query_packet,
    reranker_query: rerankerQuery,
    snapshot: semanticSearchServingSnapshotStatusV2(),
    retrieval: {
      model: retrieval.model,
      candidate_pool_size: retrieval.candidate_pool_size,
      candidate_channels: retrieval.candidate_channels,
      rrf_candidates: rrfCandidates,
      metrics: retrieval.metrics,
    },
    reranker: {
      model: provider.model,
      endpoint: provider.endpoint,
      passage_count: provider.passage_count,
      attempt_count: provider.attempt_count,
      usage: provider.usage,
      rankings: reranked,
    },
    metrics: {
      retrieval_duration_ms: retrievalDurationMs,
      candidate_passage_compile_duration_ms: candidatePassageCompileDurationMs,
      reranker_provider_duration_ms: provider.duration_ms,
      reranker_provider_wall_duration_ms: rerankerProviderWallDurationMs,
      reranker_merge_duration_ms: rerankerMergeDurationMs,
      accounted_phase_duration_ms: accounted,
      rerank_total_duration_ms: totalDurationMs,
      unaccounted_duration_ms: roundedMs(
        Math.max(0, totalDurationMs - accounted),
      ),
    },
    authority_note:
      "The NVIDIA cross-encoder reranker reorders a bounded candidate shortlist only. Its logits and ranks are evidence; MyWay grounding, confidence, and execution policy remain authoritative.",
  };
}

export async function runSemanticRerankerProbeV1() {
  return {
    schema_version: ASSET_SEMANTIC_RERANKER_V1_SCHEMA_VERSION,
    ...(await probeNvidiaAssetRerankerV1()),
  };
}

export async function runSemanticRerankBenchmarkV1(
  raw: Record<string, unknown>,
) {
  const requestedIds = Array.isArray(raw.case_ids)
    ? raw.case_ids.filter((value): value is string => typeof value === "string")
    : [];
  const requested = requestedIds.length
    ? ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES.filter((item) =>
        requestedIds.includes(item.id),
      )
    : ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES;
  const maxCases = Math.max(1, Math.min(12, Number(raw.max_cases) || 3));
  const cases = requested.slice(0, maxCases);
  const caseResults: Array<Record<string, unknown>> = [];
  const latencies: number[] = [];

  for (const fixture of cases) {
    const started = performance.now();
    try {
      const result = await runSemanticAssetRerankV1({
        ...fixture.query,
        asset_collection_mode:
          raw.asset_collection_mode === "bodyparts3d_slp_pilot"
            ? "bodyparts3d_slp_pilot"
            : "bodyparts3d_full_atlas",
      });
      const rrfIds = result.retrieval.rrf_candidates.map((item) => item.asset_id);
      const rerankedIds = result.reranker.rankings.map((item) => item.asset_id);
      const retrievalRank = benchmarkFirstAcceptedRank(
        rrfIds,
        fixture.accepted_asset_ids,
      );
      const rerankerRank = benchmarkFirstAcceptedRank(
        rerankedIds,
        fixture.accepted_asset_ids,
      );
      const durationMs = roundedMs(performance.now() - started);
      latencies.push(durationMs);
      caseResults.push({
        id: fixture.id,
        category: fixture.category,
        description: fixture.description,
        accepted_asset_ids: fixture.accepted_asset_ids,
        ok: true,
        retrieval_first_accepted_rank: retrievalRank,
        retrieval_recall_at_5: retrievalRank !== null && retrievalRank <= 5,
        retrieval_recall_at_10: retrievalRank !== null && retrievalRank <= 10,
        retrieval_recall_at_20: retrievalRank !== null && retrievalRank <= 20,
        reranker_first_accepted_rank: rerankerRank,
        reranker_top_1: rerankerRank === 1,
        reranker_top_3: rerankerRank !== null && rerankerRank <= 3,
        reciprocal_rank: rerankerRank ? Number((1 / rerankerRank).toFixed(6)) : 0,
        duration_ms: durationMs,
        rrf_top_5: result.retrieval.rrf_candidates.slice(0, 5),
        reranker_top_5: result.reranker.rankings.slice(0, 5),
      });
    } catch (caught) {
      caseResults.push({
        id: fixture.id,
        category: fixture.category,
        description: fixture.description,
        accepted_asset_ids: fixture.accepted_asset_ids,
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
        duration_ms: roundedMs(performance.now() - started),
      });
    }
  }

  const successful = caseResults.filter((item) => item.ok === true);
  const count = successful.length;
  const mean = (key: string) =>
    count
      ? Number(
          (
            successful.reduce(
              (sum, item) => sum + (item[key] === true ? 1 : 0),
              0,
            ) / count
          ).toFixed(4),
        )
      : null;
  const meanNumber = (key: string) =>
    count
      ? Number(
          (
            successful.reduce(
              (sum, item) => sum + Number(item[key] ?? 0),
              0,
            ) / count
          ).toFixed(4),
        )
      : null;

  return {
    schema_version: ASSET_SEMANTIC_RERANK_BENCHMARK_V1_SCHEMA_VERSION,
    requested_case_count: cases.length,
    successful_case_count: count,
    failed_case_count: cases.length - count,
    aggregate: {
      candidate_recall_at_5: mean("retrieval_recall_at_5"),
      candidate_recall_at_10: mean("retrieval_recall_at_10"),
      candidate_recall_at_20: mean("retrieval_recall_at_20"),
      reranker_top_1_accuracy: mean("reranker_top_1"),
      reranker_top_3_accuracy: mean("reranker_top_3"),
      mean_reciprocal_rank: meanNumber("reciprocal_rank"),
      median_case_latency_ms: benchmarkPercentile(latencies, 0.5),
      p95_case_latency_ms: benchmarkPercentile(latencies, 0.95),
    },
    cases: caseResults,
    fixture_count_available: ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES.length,
    authority_note:
      "Ground-truth asset ids exist only in benchmark fixtures. They are not imported by production retrieval/reranking code and do not influence runtime ranks.",
  };
}


export const ASSET_SEMANTIC_EVIDENCE_RERANK_AB_V1_SCHEMA_VERSION =
  "myway_asset_semantic_evidence_rerank_ab_v1" as const;

export async function runSemanticAssetEvidenceRerankAbV1(
  raw: Record<string, unknown>,
) {
  const totalStarted = performance.now();
  const mode =
    raw.asset_collection_mode === "bodyparts3d_slp_pilot"
      ? "bodyparts3d_slp_pilot"
      : "bodyparts3d_full_atlas";

  const retrievalStarted = performance.now();
  const retrieval = await runSemanticAssetSearchServingV2({
    ...raw,
    limit: 20,
  });
  const retrievalDurationMs = roundedMs(performance.now() - retrievalStarted);
  const rrfCandidates = retrieval.candidate_union.slice(0, 20);
  const documents = getSemanticSearchServingDocumentsV2(
    rrfCandidates.map((candidate) => candidate.asset_id),
  );
  const rerankerQuery = compileAssetRerankerQueryV1(retrieval.query_packet);

  const evidenceStarted = performance.now();
  const evidence = buildSemanticEvidenceContextsV1({
    packet: retrieval.query_packet,
    candidate_ids: rrfCandidates.map((candidate) => candidate.asset_id),
    mode,
  });
  const evidenceContextDurationMs = roundedMs(
    performance.now() - evidenceStarted,
  );

  const passageStarted = performance.now();
  const baselineInputs = buildAssetRerankerInputsV1(rrfCandidates, documents);
  const evidenceInputs = buildAssetRerankerInputsEvidenceV2(
    rrfCandidates,
    documents,
    evidence.contexts,
  );
  if (
    baselineInputs.length !== rrfCandidates.length ||
    evidenceInputs.length !== rrfCandidates.length
  ) {
    throw new Error(
      `Evidence A/B reranker requires passages for the same RRF Top 20. Baseline=${baselineInputs.length}, evidence=${evidenceInputs.length}, candidates=${rrfCandidates.length}.`,
    );
  }
  const passageCompileDurationMs = roundedMs(
    performance.now() - passageStarted,
  );

  const baselineProviderStarted = performance.now();
  const baselineProvider = await callNvidiaAssetRerankerV1({
    query: rerankerQuery,
    passages: baselineInputs.map((candidate) => candidate.passage),
    timeout_ms: Number(raw.reranker_timeout_ms) || 60_000,
  });
  const baselineProviderWallDurationMs = roundedMs(
    performance.now() - baselineProviderStarted,
  );

  const evidenceProviderStarted = performance.now();
  const evidenceProvider = await callNvidiaAssetRerankerV1({
    query: rerankerQuery,
    passages: evidenceInputs.map((candidate) => candidate.passage),
    timeout_ms: Number(raw.reranker_timeout_ms) || 60_000,
  });
  const evidenceProviderWallDurationMs = roundedMs(
    performance.now() - evidenceProviderStarted,
  );

  const mergeStarted = performance.now();
  const baselineRankings = mergeAssetRerankerRankingsV1(
    baselineInputs,
    baselineProvider.rankings,
  ).map((candidate) => ({
    ...candidate,
    candidate_text_hash: stableTextHash(candidate.candidate_passage),
    candidate_character_count: candidate.candidate_passage.length,
  }));
  const evidenceRankings = mergeAssetRerankerRankingsV1(
    evidenceInputs,
    evidenceProvider.rankings,
  ).map((candidate) => ({
    ...candidate,
    candidate_text_hash: stableTextHash(candidate.candidate_passage),
    candidate_character_count: candidate.candidate_passage.length,
  }));
  const mergeDurationMs = roundedMs(performance.now() - mergeStarted);

  const baselineById = new Map(
    baselineRankings.map((candidate) => [candidate.asset_id, candidate]),
  );
  const evidenceById = new Map(
    evidenceRankings.map((candidate) => [candidate.asset_id, candidate]),
  );
  const comparisons = rrfCandidates.map((candidate) => {
    const baseline = baselineById.get(candidate.asset_id);
    const enriched = evidenceById.get(candidate.asset_id);
    return {
      asset_id: candidate.asset_id,
      canonical_identity: candidate.canonical_identity,
      rrf_rank: candidate.rank,
      baseline_v1_rank: baseline?.reranker_rank ?? null,
      baseline_v1_logit: baseline?.reranker_logit ?? null,
      evidence_v2_rank: enriched?.reranker_rank ?? null,
      evidence_v2_logit: enriched?.reranker_logit ?? null,
      evidence_vs_baseline_rank_delta:
        baseline && enriched
          ? baseline.reranker_rank - enriched.reranker_rank
          : null,
      baseline_character_count:
        baseline?.candidate_character_count ?? null,
      evidence_character_count:
        enriched?.candidate_character_count ?? null,
    };
  });

  const totalDurationMs = roundedMs(performance.now() - totalStarted);
  const accounted = roundedMs(
    retrievalDurationMs +
      evidenceContextDurationMs +
      passageCompileDurationMs +
      baselineProviderWallDurationMs +
      evidenceProviderWallDurationMs +
      mergeDurationMs,
  );

  return {
    schema_version: ASSET_SEMANTIC_EVIDENCE_RERANK_AB_V1_SCHEMA_VERSION,
    query_packet: retrieval.query_packet,
    reranker_query: rerankerQuery,
    serving_snapshot: semanticSearchServingSnapshotStatusV2(),
    evidence_snapshot: semanticEvidenceSnapshotStatusV1(),
    anchor_resolution: evidence.anchor_resolutions,
    retrieval: {
      model: retrieval.model,
      candidate_pool_size: retrieval.candidate_pool_size,
      rrf_candidates: rrfCandidates,
      metrics: retrieval.metrics,
    },
    baseline_v1: {
      model: baselineProvider.model,
      passage_count: baselineProvider.passage_count,
      rankings: baselineRankings,
    },
    evidence_v2: {
      model: evidenceProvider.model,
      passage_count: evidenceProvider.passage_count,
      rankings: evidenceRankings,
      evidence_contexts: evidence.contexts.map((context) => ({
        asset_id: context.asset_id,
        evidence_summary: {
          source_asserted_count: context.record.source_asserted.length,
          measured_count: context.record.measured.length,
          reviewed_count: context.record.reviewed.length,
          model_inferred_count: context.record.model_inferred.length,
          collection_geometry_available: Boolean(
            context.record.collection_geometry,
          ),
        },
        contextual_spatial_evidence: context.contextual,
      })),
    },
    comparison: comparisons,
    metrics: {
      retrieval_duration_ms: retrievalDurationMs,
      evidence_context_duration_ms: evidenceContextDurationMs,
      passage_compile_duration_ms: passageCompileDurationMs,
      baseline_provider_duration_ms: baselineProvider.duration_ms,
      baseline_provider_wall_duration_ms: baselineProviderWallDurationMs,
      evidence_provider_duration_ms: evidenceProvider.duration_ms,
      evidence_provider_wall_duration_ms: evidenceProviderWallDurationMs,
      merge_duration_ms: mergeDurationMs,
      accounted_phase_duration_ms: accounted,
      total_duration_ms: totalDurationMs,
      unaccounted_duration_ms: roundedMs(
        Math.max(0, totalDurationMs - accounted),
      ),
    },
    authority_note:
      "Both reranker lanes receive the same query and exact same RRF Top 20. Evidence V2 changes only the candidate passage. Neither lane resolves assets or grants execution authority, and Evidence V2 stores no model-authored permanent facts.",
  };
}

export const ASSET_SEMANTIC_EVIDENCE_RERANK_ABC_V2_SCHEMA_VERSION =
  "myway_asset_semantic_evidence_rerank_abc_v2" as const;

export async function runSemanticAssetEvidenceRerankAbcV2(
  raw: Record<string, unknown>,
) {
  const totalStarted = performance.now();
  const mode =
    raw.asset_collection_mode === "bodyparts3d_slp_pilot"
      ? "bodyparts3d_slp_pilot"
      : "bodyparts3d_full_atlas";

  const retrievalStarted = performance.now();
  const retrieval = await runSemanticAssetSearchServingV2({ ...raw, limit: 20 });
  const retrievalDurationMs = roundedMs(performance.now() - retrievalStarted);
  const rrfCandidates = retrieval.candidate_union.slice(0, 20);
  const documents = getSemanticSearchServingDocumentsV2(
    rrfCandidates.map((candidate) => candidate.asset_id),
  );
  const rerankerQuery = compileAssetRerankerQueryV1(retrieval.query_packet);

  const evidenceStarted = performance.now();
  const evidenceV2Context = buildSemanticEvidenceContextsV1({
    packet: retrieval.query_packet,
    candidate_ids: rrfCandidates.map((candidate) => candidate.asset_id),
    mode,
  });
  const evidenceV3Context = buildSemanticEvidenceContextsV2({
    packet: retrieval.query_packet,
    candidate_ids: rrfCandidates.map((candidate) => candidate.asset_id),
    mode,
  });
  const evidenceContextDurationMs = roundedMs(performance.now() - evidenceStarted);

  const passageStarted = performance.now();
  const baselineInputs = buildAssetRerankerInputsV1(rrfCandidates, documents);
  const evidenceV2Inputs = buildAssetRerankerInputsEvidenceV2(
    rrfCandidates,
    documents,
    evidenceV2Context.contexts,
  );
  const evidenceV3Inputs = buildAssetRerankerInputsEvidenceV3(
    rrfCandidates,
    documents,
    evidenceV3Context.contexts,
    retrieval.query_packet,
  );
  if (
    baselineInputs.length !== rrfCandidates.length ||
    evidenceV2Inputs.length !== rrfCandidates.length ||
    evidenceV3Inputs.length !== rrfCandidates.length
  ) {
    throw new Error(
      `Evidence A/B/C reranker requires passages for the same RRF Top 20. Baseline=${baselineInputs.length}, V2=${evidenceV2Inputs.length}, V3=${evidenceV3Inputs.length}, candidates=${rrfCandidates.length}.`,
    );
  }
  const passageCompileDurationMs = roundedMs(performance.now() - passageStarted);

  const timeoutMs = Number(raw.reranker_timeout_ms) || 60_000;
  const baselineStarted = performance.now();
  const baselineProvider = await callNvidiaAssetRerankerV1({
    query: rerankerQuery,
    passages: baselineInputs.map((candidate) => candidate.passage),
    timeout_ms: timeoutMs,
  });
  const baselineProviderWallDurationMs = roundedMs(performance.now() - baselineStarted);

  const v2Started = performance.now();
  const evidenceV2Provider = await callNvidiaAssetRerankerV1({
    query: rerankerQuery,
    passages: evidenceV2Inputs.map((candidate) => candidate.passage),
    timeout_ms: timeoutMs,
  });
  const evidenceV2ProviderWallDurationMs = roundedMs(performance.now() - v2Started);

  const v3Started = performance.now();
  const evidenceV3Provider = await callNvidiaAssetRerankerV1({
    query: rerankerQuery,
    passages: evidenceV3Inputs.map((candidate) => candidate.passage),
    timeout_ms: timeoutMs,
  });
  const evidenceV3ProviderWallDurationMs = roundedMs(performance.now() - v3Started);

  const decorate = (inputs: typeof baselineInputs, rankings: Array<{ index: number; logit: number }>) =>
    mergeAssetRerankerRankingsV1(inputs, rankings).map((candidate) => ({
      ...candidate,
      candidate_text_hash: stableTextHash(candidate.candidate_passage),
      candidate_character_count: candidate.candidate_passage.length,
    }));

  const mergeStarted = performance.now();
  const baselineRankings = decorate(baselineInputs, baselineProvider.rankings);
  const evidenceV2Rankings = decorate(evidenceV2Inputs, evidenceV2Provider.rankings);
  const evidenceV3Rankings = decorate(evidenceV3Inputs, evidenceV3Provider.rankings);
  const mergeDurationMs = roundedMs(performance.now() - mergeStarted);

  const baselineById = new Map(baselineRankings.map((item) => [item.asset_id, item]));
  const v2ById = new Map(evidenceV2Rankings.map((item) => [item.asset_id, item]));
  const v3ById = new Map(evidenceV3Rankings.map((item) => [item.asset_id, item]));
  const comparison = rrfCandidates.map((candidate) => {
    const baseline = baselineById.get(candidate.asset_id);
    const v2 = v2ById.get(candidate.asset_id);
    const v3 = v3ById.get(candidate.asset_id);
    return {
      asset_id: candidate.asset_id,
      canonical_identity: candidate.canonical_identity,
      rrf_rank: candidate.rank,
      baseline_v1_rank: baseline?.reranker_rank ?? null,
      evidence_v2_rank: v2?.reranker_rank ?? null,
      evidence_v3_rank: v3?.reranker_rank ?? null,
      baseline_v1_logit: baseline?.reranker_logit ?? null,
      evidence_v2_logit: v2?.reranker_logit ?? null,
      evidence_v3_logit: v3?.reranker_logit ?? null,
      v3_vs_baseline_rank_delta:
        baseline && v3 ? baseline.reranker_rank - v3.reranker_rank : null,
      v3_vs_v2_rank_delta:
        v2 && v3 ? v2.reranker_rank - v3.reranker_rank : null,
      baseline_character_count: baseline?.candidate_character_count ?? null,
      evidence_v2_character_count: v2?.candidate_character_count ?? null,
      evidence_v3_character_count: v3?.candidate_character_count ?? null,
    };
  });

  const totalDurationMs = roundedMs(performance.now() - totalStarted);
  const accounted = roundedMs(
    retrievalDurationMs +
      evidenceContextDurationMs +
      passageCompileDurationMs +
      baselineProviderWallDurationMs +
      evidenceV2ProviderWallDurationMs +
      evidenceV3ProviderWallDurationMs +
      mergeDurationMs,
  );

  return {
    schema_version: ASSET_SEMANTIC_EVIDENCE_RERANK_ABC_V2_SCHEMA_VERSION,
    query_packet: retrieval.query_packet,
    reranker_query: rerankerQuery,
    serving_snapshot: semanticSearchServingSnapshotStatusV2(),
    evidence_snapshot: semanticEvidenceSnapshotStatusV1(),
    anchor_resolution_v1: evidenceV2Context.anchor_resolutions,
    anchor_resolution_v2: evidenceV3Context.anchor_resolutions,
    retrieval: {
      model: retrieval.model,
      candidate_pool_size: retrieval.candidate_pool_size,
      rrf_candidates: rrfCandidates,
      metrics: retrieval.metrics,
    },
    baseline_v1: {
      model: baselineProvider.model,
      passage_count: baselineProvider.passage_count,
      rankings: baselineRankings,
    },
    evidence_v2: {
      model: evidenceV2Provider.model,
      passage_count: evidenceV2Provider.passage_count,
      rankings: evidenceV2Rankings,
    },
    evidence_v3: {
      model: evidenceV3Provider.model,
      passage_count: evidenceV3Provider.passage_count,
      rankings: evidenceV3Rankings,
      evidence_contexts: evidenceV3Context.contexts.map((context) => ({
        asset_id: context.asset_id,
        contextual_spatial_evidence: context.contextual,
      })),
    },
    comparison,
    metrics: {
      retrieval_duration_ms: retrievalDurationMs,
      evidence_context_duration_ms: evidenceContextDurationMs,
      passage_compile_duration_ms: passageCompileDurationMs,
      baseline_provider_duration_ms: baselineProvider.duration_ms,
      baseline_provider_wall_duration_ms: baselineProviderWallDurationMs,
      evidence_v2_provider_duration_ms: evidenceV2Provider.duration_ms,
      evidence_v2_provider_wall_duration_ms: evidenceV2ProviderWallDurationMs,
      evidence_v3_provider_duration_ms: evidenceV3Provider.duration_ms,
      evidence_v3_provider_wall_duration_ms: evidenceV3ProviderWallDurationMs,
      merge_duration_ms: mergeDurationMs,
      accounted_phase_duration_ms: accounted,
      total_duration_ms: totalDurationMs,
      unaccounted_duration_ms: roundedMs(Math.max(0, totalDurationMs - accounted)),
    },
    authority_note:
      "All three reranker lanes receive the same query and exact same RRF Top 20. Evidence V3 adds source-backed full-collection reference anchors and deterministic two-anchor geometry only; reference anchors never enter the candidate set and no lane grants execution authority.",
  };
}

