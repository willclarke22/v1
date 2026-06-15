import type {
  EntityId,
} from "@/types/contracts";
import type {
  BuildProbeContractInput,
  ProbeContractSource,
  ProbeContractSourceMetadata,
  ProbeContractSourceRef,
  ProbeGenerationMode,
  ProbeRendererKind,
} from "@/archive/old-engine/probes/probe-types";
import type {
  NormalizedLearningSourceChunk,
} from "@/archive/old-engine/source-processing/source-types";
import {
  applySourceGroundedScaffold,
} from "./apply-source-grounded-scaffold";
import {
  applySourceGroundedJudgingScaffold,
} from "./apply-source-grounded-judging-scaffold";
import type {
  BuildSourceGroundedProbeInputOptions,
  ProbeAuthoringContext,
  SourceGroundedProbeInputBuildResult,
} from "./authoring-types";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function safeTopicLabel(value: string) {
  return value.trim() || "this topic";
}

function selectRendererKind(args: {
  context: ProbeAuthoringContext;
  options: BuildSourceGroundedProbeInputOptions;
}): ProbeRendererKind {
  if (args.options.rendererKind) return args.options.rendererKind;

  if (args.options.preferTextExplanationUntilReviewed !== false) {
    return "text_explanation";
  }

  return args.context.preferred_renderer_kinds[0] ?? "text_explanation";
}

function contractSourceForContext(
  context: ProbeAuthoringContext,
): ProbeContractSource {
  if (context.can_author_strong_answer_key) {
    if (context.trust_summary.highest_trust_level === "human_reviewed") {
      return "human_reviewed_library";
    }

    if (context.trust_summary.highest_trust_level === "trusted_public") {
      return "trusted_public_source";
    }
  }

  switch (context.recommended_generation_mode) {
    case "user_uploaded_content_grounded":
      return "uploaded_source";
    case "retrieval_grounded":
      return "trusted_public_source";
    case "content_grounded":
      return context.trust_summary.highest_trust_level === "human_reviewed"
        ? "human_reviewed_library"
        : "cached_generated";
    case "manual":
      return "human_reviewed_library";
    case "generic_scaffold":
      return "template_only";
    case "unknown":
    default:
      return "unknown";
  }
}

function generationModeForContext(
  context: ProbeAuthoringContext,
): ProbeGenerationMode {
  if (!context.can_author_low_stakes_probe) return "generic_scaffold";
  return context.recommended_generation_mode;
}

function runtimeJudgingModeForRenderer(
  rendererKind: ProbeRendererKind,
): ProbeContractSourceMetadata["runtime_judging_mode"] {
  switch (rendererKind) {
    case "multiple_choice":
    case "ordering":
    case "slider_prediction":
    case "drag_drop_match":
    case "graph_match":
      return "deterministic";
    case "text_explanation":
    case "audio_explanation":
    case "video_checkpoint":
      return "rubric_then_llm_if_needed";
    case "simulation":
      return "rubric";
    default:
      return "rubric";
  }
}

function refsForChunks(
  chunks: NormalizedLearningSourceChunk[],
): ProbeContractSourceRef[] {
  return chunks.map((chunk) => ({
    source_id: chunk.source_id,
    chunk_id: chunk.chunk_id,
    page: null,
    section_label: `Chunk ${chunk.chunk_index + 1}`,
    quote_or_summary: chunk.source_summary,
  }));
}

function sourceIdsForChunks(chunks: NormalizedLearningSourceChunk[]) {
  return unique(chunks.map((chunk) => chunk.source_id));
}

function sourceTopicIdsForContext(context: ProbeAuthoringContext): EntityId[] {
  return context.target_topic_id ? [context.target_topic_id] : [];
}

function buildSourceSummary(context: ProbeAuthoringContext) {
  if (context.source_summary) return context.source_summary;

  if (!context.source_chunks.length) {
    return "No normalized source chunks were provided.";
  }

  return context.source_chunks
    .slice(0, 2)
    .map((chunk) => chunk.source_summary ?? chunk.text.slice(0, 180).trim())
    .join("\n---\n");
}

function authoringConfidenceForContext(context: ProbeAuthoringContext) {
  const base = context.source_confidence;

  if (context.can_author_strong_answer_key) return clamp01(base + 0.08);
  if (context.can_author_source_grounded_probe) return clamp01(base);
  if (context.can_author_low_stakes_probe) return clamp01(Math.min(base, 0.52));

  return 0.24;
}

function pedagogicalConfidenceForContext(context: ProbeAuthoringContext) {
  if (context.can_author_strong_answer_key) return 0.78;
  if (context.can_author_source_grounded_probe) return 0.62;
  if (context.can_author_low_stakes_probe) return 0.48;
  return 0.24;
}

function buildSourceMetadata(args: {
  context: ProbeAuthoringContext;
  rendererKind: ProbeRendererKind;
}): ProbeContractSourceMetadata {
  const context = args.context;
  const contractSource = contractSourceForContext(context);
  const requiresReview = context.requires_review_before_use;
  const canMakeStrong = context.can_author_strong_answer_key;
  const canMakeModerate =
    canMakeStrong ||
    (context.can_author_source_grounded_probe && context.source_confidence >= 0.58);

  return {
    contract_source: contractSource,
    grounding_source_ids: context.source_ids,
    source_refs: refsForChunks(context.source_chunks),
    authoring_confidence: authoringConfidenceForContext(context),
    content_confidence: clamp01(context.source_confidence),
    pedagogical_confidence: pedagogicalConfidenceForContext(context),
    requires_review: requiresReview,
    runtime_judging_mode: runtimeJudgingModeForRenderer(args.rendererKind),
    source_summary: buildSourceSummary(context),

    policy_version: "probe_authoring_source_metadata_v1",
    confidence_level: context.source_confidence >= 0.82
      ? "high"
      : context.source_confidence >= 0.62
        ? "moderate"
        : context.source_confidence >= 0.38
          ? "low"
          : "very_low",
    allowed_claim_strength: canMakeStrong
      ? "strong"
      : canMakeModerate
        ? "moderate"
        : "conservative",
    can_make_strong_correctness_claim: canMakeStrong,
    can_make_moderate_correctness_claim: canMakeModerate,
    should_invite_source_upload: false,
    source_policy_reasons: [
      `Built from probe authoring context ${context.authoring_context_id}.`,
      `Authoring readiness was ${context.readiness}.`,
      `Source confidence was ${context.source_confidence.toFixed(2)}.`,
    ],
    normalized_source_chunk_ids: context.source_chunk_ids,
    normalized_source_chunks: context.source_chunks,
  };
}

/**
 * Converts a ProbeAuthoringContext into a safe BuildProbeContractInput.
 *
 * This is the first bridge from source-processing into probe contracts. It does
 * not generate final answer keys or distractors yet. It prepares the contract
 * builder with grounded source metadata and, by default, applies a conservative
 * source-grounded scaffold to the learner-facing renderer prompt.
 */
export function buildSourceGroundedProbeInput(
  context: ProbeAuthoringContext,
  options: BuildSourceGroundedProbeInputOptions = {},
): SourceGroundedProbeInputBuildResult {
  const topicLabel = safeTopicLabel(context.topic_label);
  const rendererKind = selectRendererKind({ context, options });
  const sourceMetadata = buildSourceMetadata({
    context,
    rendererKind,
  });

  const generationMode = generationModeForContext(context);
  const sourceContentIds = sourceIdsForChunks(context.source_chunks);
  const sourceTopicIds = sourceTopicIdsForContext(context);

  const probeInput: BuildProbeContractInput = {
    targetTopicId: context.target_topic_id,
    targetTopicLabel: topicLabel,
    targetDiagnosis: options.targetDiagnosis ?? null,
    intent: options.intent ?? "diagnostic",
    probeType: options.probeType ?? "explain",
    rendererKind,
    expectedResponseType: options.expectedResponseType ?? null,
    diagnosisState: options.diagnosisState ?? null,
    createdAt: options.createdAt ?? null,

    generationMode,
    sourceContentIds,
    sourceTopicIds,
    sourceMetadata,
    normalizedSourceChunks: context.source_chunks,
    authoringContextId: context.authoring_context_id,
    rendererConfigOverrides: null,
    judgingScaffoldOverrides: null,
    personalization: null,
  };

  const baseResult: SourceGroundedProbeInputBuildResult = {
    probe_input: probeInput,
    source_metadata: sourceMetadata,
    selected_renderer_kind: rendererKind,
    source_grounded_scaffold: null,
    source_grounded_judging_scaffold: null,
    reasons: [
      `Built source-grounded probe input for ${topicLabel}.`,
      `Selected renderer kind ${rendererKind}.`,
      `Generation mode is ${generationMode}.`,
      `Included ${context.source_chunk_ids.length} normalized source chunk(s).`,
      `Contract source is ${sourceMetadata.contract_source}.`,
      `Allowed claim strength is ${sourceMetadata.allowed_claim_strength}.`,
    ],
    cautions: [
      ...(!context.can_author_strong_answer_key
        ? ["This input should not be used for strong correctness claims without review."]
        : []),
      ...(rendererKind !== "text_explanation" && !context.can_author_strong_answer_key
        ? ["Structured source-grounded probes need reviewed answer keys before trusted reuse."]
        : []),
      ...(!context.can_author_source_grounded_probe
        ? ["Authoring context is not fully source-grounded; resulting probe may still be low-stakes only."]
        : []),
      ...(context.rights_summary.contains_private_upload
        ? ["The resulting probe input references private/user-provided material; reuse and persistence should respect source rights scope."]
        : []),
    ],
  };

  const withRendererScaffold =
    options.applySourceGroundedScaffold === false
      ? baseResult
      : applySourceGroundedScaffold(baseResult, {
          createdAt: options.createdAt ?? null,
          maxSourceSummaryChars: options.maxScaffoldSourceSummaryChars,
        });

  if (options.applySourceGroundedJudgingScaffold === false) {
    return withRendererScaffold;
  }

  return applySourceGroundedJudgingScaffold(withRendererScaffold, {
    createdAt: options.createdAt ?? null,
    maxSourceSummaryChars: options.maxJudgingSourceSummaryChars,
  });
}

