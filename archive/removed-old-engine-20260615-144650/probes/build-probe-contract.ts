import type {
  DiagnosisDelta,
  DiagnosisType,
  ProbeIntent,
  ProbeType,
} from "@/types/contracts";
import { makeId } from "@/lib/utils/ids";
import {
  answerCaptureKeysForRenderer,
  deterministicJudgingAvailable,
  expectedEvidenceTierForRenderer,
  expectedJudgingMethodsForRenderer,
  expectedResponseTypeForRenderer,
  personalizeRendererParams,
  selectRendererKind,
  telemetryForRenderer,
} from "@/archive/old-engine/probe-rendering";
import {
  evaluateProbeSourcePolicy,
} from "@/archive/old-engine/probe-source-policy";
import {
  evaluateContractQuality,
} from "@/archive/old-engine/probe-contract-quality";
import {
  buildProbeContractCacheCandidate,
} from "@/archive/old-engine/probe-contract-cache";
import {
  PROBE_CONTRACT_VERSION,
  type BuildProbeContractInput,
  type BuildProbeContractResult,
  type ProbeAssessmentTarget,
  type ProbeContract,
  type ProbeFailureMarker,
  type ProbeGenerationMetadata,
  type ProbeInputSchema,
  type ProbeMisconceptionMapping,
  type ProbePersonalizationApplication,
  type ProbeRendererConfig,
  type ProbeRendererConfigOverrides,
  type ProbeRendererKind,
  type ProbeSourceGroundedJudgingScaffold,
  type ProbeSuccessMarker,
} from "./probe-types";

/**
 * Probe Contract Builder V1.11
 *
 * The builder still assembles the final measurement contract, but reusable
 * renderer intelligence now lives in lib/engine/probe-rendering.
 *
 * This keeps the responsibilities clearer:
 * - probe-rendering decides which reusable renderer fits the situation
 * - probe-types define the contract shape
 * - this builder assembles scaffold contracts and now preserves source-grounded input metadata
 * - probe-source-policy assigns explicit source confidence and claim strength
 * - probe-contract-quality evaluates whether a contract can become a reusable learning object
 * - probe-contract-cache builds a future-facing cache candidate without persisting it
 * - final trust/debug surfaces dedupe repeated reasons and cautions
 * - source-grounded scaffold overrides can shape learner-facing renderer config
 * - provisional source-grounded judging hints can ride with judging schema
 */

function nowIso() {
  return new Date().toISOString();
}

function emptyDelta(): DiagnosisDelta {
  return {
    recall_gap: 0,
    representation_gap: 0,
    procedure_gap: 0,
    discrimination_gap: 0,
    transfer_gap: 0,
  };
}

function deltaFor(diagnosis: DiagnosisType, amount: number): DiagnosisDelta {
  return {
    ...emptyDelta(),
    [diagnosis]: amount,
  };
}

function normalizeTopicLabel(label: string) {
  return label.trim() || "this topic";
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    /**
     * Dedupe by normalized text while preserving the first original message.
     * This keeps debug/trust surfaces readable without hiding unique warnings.
     */
    const key = normalized.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function defaultIntent(args: {
  probeType: ProbeType;
  diagnosis: DiagnosisType | null;
  hasDiagnosisState: boolean;
}): ProbeIntent {
  /**
   * Transfer probes can be diagnostic when transfer_gap is suspected.
   * They become verification when no active transfer gap is being targeted.
   */
  if (args.probeType === "apply_transfer" && args.diagnosis !== "transfer_gap") {
    return "verification";
  }

  return "diagnostic";
}

function defaultProbeType(diagnosis: DiagnosisType | null): ProbeType {
  if (diagnosis === "transfer_gap") return "apply_transfer";
  if (diagnosis === "discrimination_gap") return "discriminate";
  if (diagnosis === "procedure_gap") return "transform";
  return "explain";
}

function defaultAssessmentTarget(
  diagnosis: DiagnosisType | null,
  probeType: ProbeType,
): ProbeAssessmentTarget {
  if (diagnosis === "recall_gap") return "recall";
  if (diagnosis === "procedure_gap") return "procedure";
  if (diagnosis === "discrimination_gap") return "discrimination";
  if (diagnosis === "transfer_gap") return "transfer";
  if (probeType === "predict") return "representation";
  return "representation";
}

function diagnosisFromAssessmentTarget(
  target: ProbeAssessmentTarget,
): DiagnosisType {
  if (target === "recall") return "recall_gap";
  if (target === "procedure") return "procedure_gap";
  if (target === "discrimination") return "discrimination_gap";
  if (target === "transfer") return "transfer_gap";
  return "representation_gap";
}

function buildSuccessMarkers(
  topicLabel: string,
  assessmentTarget: ProbeAssessmentTarget,
): ProbeSuccessMarker[] {
  const topic = normalizeTopicLabel(topicLabel);

  const markers: ProbeSuccessMarker[] = [
    {
      marker_id: makeId("success-marker"),
      label: "Stays on target",
      description: `The response stays grounded in ${topic}.`,
      required: true,
      weight: 0.28,
    },
    {
      marker_id: makeId("success-marker"),
      label: "Shows the key relationship",
      description: `The response identifies a meaningful relationship, mechanism, or contrast in ${topic}.`,
      required: true,
      weight: 0.36,
    },
  ];

  if (assessmentTarget === "procedure") {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Correct sequence",
      description: "The learner orders the steps or dependencies in a reasonable sequence.",
      required: true,
      weight: 0.36,
    });
  } else if (assessmentTarget === "discrimination") {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Distinguishes close cases",
      description: "The learner distinguishes the target idea from a tempting near-miss.",
      required: true,
      weight: 0.36,
    });
  } else if (assessmentTarget === "transfer") {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Transfers to a new case",
      description: "The learner applies the idea to a new example without changing the core mechanism.",
      required: true,
      weight: 0.36,
    });
  } else {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Concrete explanation",
      description: "The learner uses a concrete example or cause-and-effect chain.",
      required: false,
      weight: 0.26,
    });
  }

  return markers;
}

function buildFailureMarkers(
  topicLabel: string,
  assessmentTarget: ProbeAssessmentTarget,
): ProbeFailureMarker[] {
  const topic = normalizeTopicLabel(topicLabel);
  const primaryDiagnosis = diagnosisFromAssessmentTarget(assessmentTarget);

  return [
    {
      marker_id: makeId("failure-marker"),
      label: "Off-target response",
      description: `The response does not stay grounded in ${topic}.`,
      maps_to_diagnosis: "representation_gap",
      diagnosis_delta: deltaFor("representation_gap", 0.16),
      severity: 0.5,
    },
    {
      marker_id: makeId("failure-marker"),
      label: "Missing mechanism",
      description: "The response lacks a clear relationship, mechanism, or cause-and-effect chain.",
      maps_to_diagnosis: primaryDiagnosis,
      diagnosis_delta: deltaFor(primaryDiagnosis, 0.18),
      severity: 0.58,
    },
  ];
}

function buildMisconceptionMappings(
  failureMarkers: ProbeFailureMarker[],
  assessmentTarget: ProbeAssessmentTarget,
): ProbeMisconceptionMapping[] {
  const primaryDiagnosis = diagnosisFromAssessmentTarget(assessmentTarget);

  return [
    {
      misconception_id: makeId("misconception"),
      label: "Surface-level match",
      description:
        "The learner may be matching familiar words without using the underlying relationship.",
      likely_diagnosis: primaryDiagnosis,
      failure_marker_ids: failureMarkers.map((marker) => marker.marker_id),
    },
  ];
}

function buildInputSchema(args: {
  rendererKind: ProbeRendererKind;
  topicLabel: string;
}): ProbeInputSchema {
  const expectedResponseType = expectedResponseTypeForRenderer(args.rendererKind);
  const answer_capture_keys = answerCaptureKeysForRenderer(args.rendererKind);

  switch (args.rendererKind) {
    case "multiple_choice":
      return {
        renderer_kind: "multiple_choice",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "choice",
        answer_capture_keys,
        allow_multiple: false,
        options: [
          {
            option_id: makeId("option"),
            label: "Best answer",
            text: `The option that best explains the key relationship in ${args.topicLabel}.`,
            is_correct: true,
            maps_to_misconception_id: null,
          },
          {
            option_id: makeId("option"),
            label: "Near miss",
            text: "A tempting answer that uses related words but misses the mechanism.",
            is_correct: false,
            maps_to_misconception_id: null,
          },
        ],
      };

    case "ordering":
      return {
        renderer_kind: "ordering",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "ordering",
        answer_capture_keys,
        items: [
          {
            item_id: makeId("order-item"),
            label: "First",
            text: "Identify the starting condition.",
            correct_position: 0,
          },
          {
            item_id: makeId("order-item"),
            label: "Then",
            text: "Apply the key relationship or mechanism.",
            correct_position: 1,
          },
          {
            item_id: makeId("order-item"),
            label: "Result",
            text: "Infer the consequence.",
            correct_position: 2,
          },
        ],
      };

    case "slider_prediction":
      return {
        renderer_kind: "slider_prediction",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "slider",
        answer_capture_keys,
        min: 0,
        max: 100,
        step: 1,
        target_value: null,
        acceptable_range: null,
        left_label: "Much less / unlikely",
        right_label: "Much more / likely",
      };

    case "drag_drop_match": {
      const conceptItemId = makeId("drag-item");
      const exampleItemId = makeId("drag-item");
      const mechanismTargetId = makeId("drop-target");
      const surfaceTargetId = makeId("drop-target");

      return {
        renderer_kind: "drag_drop_match",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "drag_drop",
        answer_capture_keys,
        draggable_items: [
          {
            item_id: conceptItemId,
            label: "Concept",
            text: `A key idea from ${args.topicLabel}.`,
          },
          {
            item_id: exampleItemId,
            label: "Example",
            text: "A concrete example or situation.",
          },
        ],
        drop_targets: [
          {
            target_id: mechanismTargetId,
            label: "Mechanism",
            text: "What explains why it happens.",
          },
          {
            target_id: surfaceTargetId,
            label: "Surface detail",
            text: "A detail that may be related but is not the mechanism.",
          },
        ],
        /**
         * This scaffold match exists so deterministic judging has a valid shape.
         * A content-grounded generator should replace these placeholder matches.
         */
        correct_matches: [
          {
            item_id: conceptItemId,
            target_id: mechanismTargetId,
          },
          {
            item_id: exampleItemId,
            target_id: surfaceTargetId,
          },
        ],
      };
    }

    case "graph_match": {
      const causeNodeId = makeId("graph-node");
      const mechanismNodeId = makeId("graph-node");
      const effectNodeId = makeId("graph-node");
      const correctEdgeId = makeId("graph-edge");
      const nearMissEdgeId = makeId("graph-edge");

      return {
        renderer_kind: "graph_match",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "graph_match",
        answer_capture_keys,
        graph_prompt: `Choose the relationship graph that best represents ${args.topicLabel}.`,
        nodes: [
          { node_id: causeNodeId, label: "Cause / input" },
          { node_id: mechanismNodeId, label: "Mechanism" },
          { node_id: effectNodeId, label: "Effect / output" },
        ],
        candidate_edges: [
          {
            edge_id: correctEdgeId,
            source_node_id: causeNodeId,
            target_node_id: mechanismNodeId,
            label: "Cause leads into mechanism",
            is_correct: true,
          },
          {
            edge_id: nearMissEdgeId,
            source_node_id: causeNodeId,
            target_node_id: effectNodeId,
            label: "Cause skips directly to effect",
            is_correct: false,
          },
        ],
      };
    }

    case "simulation":
      return {
        renderer_kind: "simulation",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "interaction",
        answer_capture_keys,
        simulation_kind: "generic_concept_simulation",
        initial_state: {},
        controllable_variables: [],
        target_observations: [
          `Notice what changes and what stays stable in ${args.topicLabel}.`,
        ],
      };

    case "audio_explanation":
      return {
        renderer_kind: "audio_explanation",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "text",
        answer_capture_keys,
        min_duration_ms: 5_000,
        max_duration_ms: 90_000,
        transcript_required: true,
      };

    case "video_checkpoint":
      return {
        renderer_kind: "video_checkpoint",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "text",
        answer_capture_keys,
        checkpoint_time_ms: null,
        prompt_at_checkpoint: `Pause and explain what changed in ${args.topicLabel}.`,
        expected_observation: "The learner notices the target relationship or mechanism.",
      };

    case "text_explanation":
    default:
      return {
        renderer_kind: "text_explanation",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "text",
        answer_capture_keys,
        min_words: 8,
        max_words: 120,
        require_example: true,
      };
  }
}

function buildRendererConfig(args: {
  rendererKind: ProbeRendererKind;
  topicLabel: string;
  assessmentTarget: ProbeAssessmentTarget;
  personalization: ProbePersonalizationApplication | null;
  overrides: ProbeRendererConfigOverrides | null;
}): ProbeRendererConfig {
  const rendererParams = personalizeRendererParams({
    rendererKind: args.rendererKind,
    personalization: args.personalization,
  });
  const title =
    args.rendererKind === "multiple_choice"
      ? `Choose the best match for ${args.topicLabel}`
      : args.rendererKind === "ordering"
        ? `Put ${args.topicLabel} in order`
        : args.rendererKind === "slider_prediction"
          ? `Predict what happens in ${args.topicLabel}`
          : args.rendererKind === "drag_drop_match"
            ? `Match the pieces of ${args.topicLabel}`
            : args.rendererKind === "graph_match"
              ? `Map the relationship in ${args.topicLabel}`
              : args.rendererKind === "simulation"
                ? `Test ${args.topicLabel} in a simulation`
                : args.rendererKind === "audio_explanation"
                  ? `Explain ${args.topicLabel} out loud`
                  : args.rendererKind === "video_checkpoint"
                    ? `Pause and notice ${args.topicLabel}`
                    : `Explain ${args.topicLabel}`;

  const instructions =
    "Use this as a focused check of understanding. It is okay if the learner is unsure; the goal is to reveal the next useful gap.";
  const prompt = `Show what you understand about ${args.topicLabel}, focusing on the ${args.assessmentTarget} part.`;

  return {
    renderer_kind: args.rendererKind,
    title: args.overrides?.title?.trim() || title,
    instructions: args.overrides?.instructions?.trim() || instructions,
    prompt: args.overrides?.prompt?.trim() || prompt,
    thumbnail_label: args.overrides?.thumbnail_label?.trim() || "Probe",
    thumbnail_icon: selectRendererKind({
      requestedRendererKind: args.rendererKind,
      diagnosis: null,
      probeType: "explain",
      intent: "diagnostic",
      assessmentTarget: args.assessmentTarget,
      expectedResponseType: null,
    }).capability.thumbnail_icon,
    estimated_seconds: selectRendererKind({
      requestedRendererKind: args.rendererKind,
      diagnosis: null,
      probeType: "explain",
      intent: "diagnostic",
      assessmentTarget: args.assessmentTarget,
      expectedResponseType: null,
    }).capability.estimated_seconds,
    ui_hints: {
      compact: rendererParams.compact,
      show_confidence_rating: rendererParams.show_confidence_rating,
      allow_hint: rendererParams.allow_hint,
      allow_retry: rendererParams.allow_retry,
      scaffold_level: rendererParams.scaffold_level,
      show_explanation_box: rendererParams.show_explanation_box,
      require_reasoning_after_structured_answer:
        rendererParams.require_reasoning_after_structured_answer,
    },
  };
}

function buildJudgingSchema(args: {
  rendererKind: ProbeRendererKind;
  successMarkers: ProbeSuccessMarker[];
  failureMarkers: ProbeFailureMarker[];
  misconceptionMappings: ProbeMisconceptionMapping[];
  sourceGroundedJudgingScaffold: ProbeSourceGroundedJudgingScaffold | null;
}) {
  const deterministicAvailable = deterministicJudgingAvailable(args.rendererKind);

  return {
    success_markers: args.successMarkers,
    failure_markers: args.failureMarkers,
    misconception_mappings: args.misconceptionMappings,
    telemetry_to_capture: telemetryForRenderer(args.rendererKind),
    allow_partial_credit: true,
    minimum_evidence_strength_for_success: 0.62,
    expected_judging_methods: expectedJudgingMethodsForRenderer(args.rendererKind),
    expected_evidence_tier: expectedEvidenceTierForRenderer(args.rendererKind),
    deterministic_judging_available: deterministicAvailable,
    rubric_judging_required: !deterministicAvailable,
    source_grounded_judging_scaffold: args.sourceGroundedJudgingScaffold,
  };
}

function buildGenerationMetadata(input: BuildProbeContractInput): ProbeGenerationMetadata {
  const normalizedSourceChunks = input.normalizedSourceChunks ?? [];
  const normalizedSourceIds = [
    ...new Set(normalizedSourceChunks.map((chunk) => chunk.source_id)),
  ];
  const normalizedSourceChunkIds = [
    ...new Set(normalizedSourceChunks.map((chunk) => chunk.chunk_id)),
  ];

  return {
    generation_mode: input.generationMode ?? "generic_scaffold",
    source_content_ids: input.sourceContentIds ?? [],
    source_topic_ids: input.sourceTopicIds ?? [],
    normalized_source_ids: normalizedSourceIds,
    normalized_source_chunk_ids: normalizedSourceChunkIds,
    authoring_context_id: input.authoringContextId ?? null,
    generated_by: "engine_scaffold",
    generator_version: null,
    content_grounding_summary:
      input.generationMode && input.generationMode !== "generic_scaffold"
        ? normalizedSourceChunks.length
          ? `Probe contract was built from ${normalizedSourceChunks.length} normalized source chunk(s). Scaffold content still needs source-specific authoring for stronger answer keys.`
          : "Probe contract requested non-generic grounding, but no normalized source chunks were provided."
        : null,
  };
}

function buildPersonalizationApplication(
  input: BuildProbeContractInput,
): ProbePersonalizationApplication | null {
  if (!input.personalization) return null;

  return {
    mode: input.personalization.mode ?? "light",
    tone: input.personalization.tone ?? null,
    pacing: input.personalization.pacing ?? null,
    language_style: input.personalization.language_style ?? null,
    scaffold_level: input.personalization.scaffold_level ?? "medium",
    preferred_modality_reason: input.personalization.preferred_modality_reason ?? null,
    example_context: input.personalization.example_context ?? null,
    adaptation_reasons: input.personalization.adaptation_reasons ?? [],
  };
}

export function buildProbeContract(
  input: BuildProbeContractInput,
): BuildProbeContractResult {
  const targetTopicLabel = normalizeTopicLabel(input.targetTopicLabel);
  const targetDiagnosis = input.targetDiagnosis ?? null;
  const probeType = input.probeType ?? defaultProbeType(targetDiagnosis);
  const intent =
    input.intent ??
    defaultIntent({
      probeType,
      diagnosis: targetDiagnosis,
      hasDiagnosisState: Boolean(input.diagnosisState),
    });
  const assessmentTarget = defaultAssessmentTarget(targetDiagnosis, probeType);
  const personalizationApplication = buildPersonalizationApplication(input);

  const rendererSelection = selectRendererKind({
    requestedRendererKind: input.rendererKind ?? null,
    diagnosis: targetDiagnosis,
    probeType,
    intent,
    expectedResponseType: input.expectedResponseType ?? null,
    assessmentTarget,
    preferDeterministic: true,
    personalization: personalizationApplication,
  });
  const rendererKind = rendererSelection.renderer_kind;

  const successMarkers = buildSuccessMarkers(targetTopicLabel, assessmentTarget);
  const failureMarkers = buildFailureMarkers(targetTopicLabel, assessmentTarget);
  const misconceptionMappings = buildMisconceptionMappings(
    failureMarkers,
    assessmentTarget,
  );

  const inputSchema = buildInputSchema({
    rendererKind,
    topicLabel: targetTopicLabel,
  });

  const deterministicAvailable = deterministicJudgingAvailable(rendererKind);
  const expectedEvidenceTier = expectedEvidenceTierForRenderer(rendererKind);
  const sourcePolicy = evaluateProbeSourcePolicy({
    generationMode: input.generationMode ?? "generic_scaffold",
    sourceContentIds: input.sourceContentIds ?? [],
    sourceTopicIds: input.sourceTopicIds ?? [],
    normalizedSourceChunks: input.normalizedSourceChunks ?? null,
    providedSourceMetadata: input.sourceMetadata ?? null,
    rendererKind,
    deterministicJudgingAvailable: deterministicAvailable,
    expectedEvidenceTier,
  });

  const contractBase: ProbeContract = {
    contract_id: makeId("probe-contract"),
    version: PROBE_CONTRACT_VERSION,
    created_at: input.createdAt ?? nowIso(),

    target_topic_id: input.targetTopicId ?? null,
    target_topic_label: targetTopicLabel,
    target_diagnosis: targetDiagnosis,

    intent,
    probe_type: probeType,
    renderer_kind: rendererKind,
    assessment_target: assessmentTarget,
    difficulty: "medium",

    input_schema: inputSchema,
    judging_schema: buildJudgingSchema({
      rendererKind,
      successMarkers,
      failureMarkers,
      misconceptionMappings,
      sourceGroundedJudgingScaffold: input.judgingScaffoldOverrides ?? null,
    }),
    renderer_config: buildRendererConfig({
      rendererKind,
      topicLabel: targetTopicLabel,
      assessmentTarget,
      personalization: personalizationApplication,
      overrides: input.rendererConfigOverrides ?? null,
    }),

    generation_metadata: buildGenerationMetadata(input),
    source_metadata: sourcePolicy.source_metadata,
    personalization_application: personalizationApplication,

    diagnosis_state_snapshot: input.diagnosisState ?? null,

    reasons: [
      `Built a ${rendererKind} probe contract for ${targetTopicLabel}.`,
      `Assessment target selected as ${assessmentTarget}.`,
      `Renderer selected by Probe Rendering Policy with confidence ${rendererSelection.confidence.toFixed(2)}.`,
      `Expected evidence tier is ${expectedEvidenceTier}.`,
      `Source policy allowed claim strength is ${sourcePolicy.allowed_claim_strength}.`,
      `Source content confidence is ${sourcePolicy.source_metadata.content_confidence.toFixed(2)}.`,
      input.authoringContextId
        ? `Source-grounded authoring context was ${input.authoringContextId}.`
        : "No source-grounded authoring context was provided.",
      (input.normalizedSourceChunks?.length ?? 0) > 0
        ? `Received ${input.normalizedSourceChunks?.length ?? 0} normalized source chunk(s).`
        : "No normalized source chunks were provided to the probe builder.",
      input.rendererConfigOverrides?.prompt
        ? "Applied source-grounded renderer config overrides to the learner-facing probe."
        : "No renderer config overrides were provided.",
      input.judgingScaffoldOverrides
        ? "Attached provisional source-grounded judging hints to the judging schema."
        : "No provisional source-grounded judging hints were provided.",
      deterministicAvailable
        ? "Deterministic structured judging is available for this renderer kind."
        : "This renderer kind will require scaffold/rubric/model judging for stronger correctness claims.",
      ...rendererSelection.reasons.map((reason) => reason.message),
      ...sourcePolicy.reasons,
      targetDiagnosis
        ? `Target diagnosis was ${targetDiagnosis}.`
        : "No target diagnosis was provided, so the contract used a representation-oriented default.",
    ],
    cautions: [
      input.rendererConfigOverrides?.prompt
        ? "Probe Contract V1.11 uses source-grounded renderer config overrides, but answer keys and rubric criteria may still need review before trusted reuse."
        : "Probe Contract V1.11 preserves source-grounded metadata, but scaffold renderer content may still need source-specific authoring before trusted reuse.",
      input.judgingScaffoldOverrides
        ? "Source-grounded judging hints are provisional and should not be treated as a reviewed rubric."
        : "No source-grounded judging hints were attached.",
      deterministicAvailable
        ? "Deterministic judging can evaluate the structured answer shape, but the scaffold content may still be too generic to prove deep understanding."
        : "Open-ended probe judging uses local heuristic rubric support now, but still needs source-grounded rubric/model support before strong correctness claims are reliable.",
      ...rendererSelection.cautions,
      ...sourcePolicy.cautions,
    ],
  };

  const qualityEvaluation = evaluateContractQuality(contractBase);

  const contractWithQuality: ProbeContract = {
    ...contractBase,
    quality_metadata: qualityEvaluation,
  };

  const cacheCandidate = buildProbeContractCacheCandidate(contractWithQuality);

  const finalReasons = dedupeStrings([
    ...contractBase.reasons,
    `Contract quality score is ${qualityEvaluation.quality_score.toFixed(2)}.`,
    `Contract reuse status is ${qualityEvaluation.reuse_status}.`,
    `Contract review priority is ${qualityEvaluation.review_priority}.`,
    `Cache action is ${cacheCandidate.cache_action}.`,
    ...qualityEvaluation.reasons,
    ...cacheCandidate.reasons,
  ]);

  const finalCautions = dedupeStrings([
    ...contractBase.cautions,
    ...qualityEvaluation.cautions,
    ...cacheCandidate.cautions,
  ]);

  const contract: ProbeContract = {
    ...contractWithQuality,
    cache_candidate: cacheCandidate,
    reasons: finalReasons,
    cautions: finalCautions,
  };

  return {
    contract,
    selected_renderer_kind: rendererKind,
    quality_evaluation: qualityEvaluation,
    cache_candidate: cacheCandidate,
    reasons: finalReasons,
  };
}

