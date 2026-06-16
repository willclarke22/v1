import { NextResponse } from "next/server";
import {
  buildMockThreeModelMessageRouteResponse,
  shouldUseMockThreeModelMessageRoute,
} from "@/lib/api-routes/message/mock-3model-response";
import { runMessageDiagnosisEngineShadow } from "@/lib/api-routes/message/engine-shadow";
import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import { insertRun, upsertTopicState } from "@/lib/persistence/myway";
import { makeId } from "@/lib/utils/ids";
import {
  embedMessageForSemanticRouting,
  querySemanticTopicCandidatesFromEmbedding,
} from "@/lib/vector/query-topics";
import type {
  EmbeddingVector,
  ImportantRunInputs,
  MessageRouteResponse,
  ModelSignals,
  MyWayRunResult,
  TopicRoutingState,
  VectorInfo,
} from "@/types/contracts";
import type { TopicResolutionTrace } from "@/lib/topic-routing/topic-routing-trace";

import {
  inferKeywordsFromTopicLabel,
  loadRouteTopics,
  type RouteTopic,
} from "@/lib/topic-routing/route-topics";
import {
  applyMetricUpdate,
  buildImportantRunInputs,
  buildInterventionModeDecision,
  buildNotApplicableProbePlan,
  buildProbePlan,
  buildUpdatedMetrics,
} from "@/lib/intervention-planning/message-runtime";
import { nowIso } from "@/lib/shared/runtime";
import {
  buildTopicLabelerRequest,
  callConfiguredTopicLabeler,
  getTopicLabelerEnabled,
  getTopicLabelerProvider,
  getTopicLabelerTimeoutMs,
  type TopicLabelerClientResult,
} from "@/lib/topic-routing/topic-labeler/client";
import {
  buildModelTopicRoutePolicyDecision,
  type ModelTopicRoutePolicyDecision,
} from "@/lib/topic-routing/topic-labeler/policy";
import {
  buildModelFirstTopicResolutionOutcome,
  buildModelRouteContinuationPolicy,
  type ModelRouteContinuationPolicy,
  type SemanticEnrichmentStatus,
} from "@/lib/topic-routing/topic-labeler/resolution";
import {
  appendPendingConfusionInsightScore,
  buildConfusionInsightInput,
  buildConfusionInsightQueueReason,
  buildFallbackModelSignals,
  buildForegroundConfusionInsightSignalState,
  buildPendingConfusionInsightScore,
  derivePersistedConfusionInsightValues,
  getConfusionInsightScoringMode,
  getForegroundConfusionInsightTimeoutMs,
  hasUsableConfusionInsightSignals,
  resolveConfusionInsightSignalsForMessageRoute,
  CONFUSION_INSIGHT_PAYLOAD_SHAPE,
  CONFUSION_INSIGHT_WORKER_QUEUE_ROLE,
  type ConfusionInsightScoringMode,
  type PendingConfusionInsightScore,
  type RouteResolutionKind,
} from "@/lib/api-routes/message/confusion-insight-queue";
import {
  appendPendingTopicMessageEmbedding,
  buildPendingTopicMessageEmbedding,
  TOPIC_MESSAGE_EMBEDDING_PENDING_QUEUE_MAX_ITEMS,
  type PendingTopicMessageEmbedding,
} from "@/lib/api-routes/message/topic-message-embedding-queue";
import {
  createMessageRouteTimer,
  type MessageRouteLatencyDebug,
  type TopicLabelingMode,
  type TopicRoutingQdrantQueryMode,
} from "@/lib/api-routes/message/timing";
import {
  adaptLearningSpaceToContract,
  buildSceneUpdate,
  type RawLearningSpace,
} from "@/lib/api-routes/message/learning-space-response";
import {
  buildDeliveredResponse,
  buildStatusLabel,
  buildSuggestedAction,
} from "@/lib/api-routes/message/delivered-response";
import {
  buildEngineFuel,
  buildPreviousModeOutcome,
  buildRunMetadata,
} from "@/lib/api-routes/message/engine-fuel";
import {
  asOptionalString,
  buildChatHistoryLinesForModelSignals,
  buildRecentUserMessagesForTopicLabeler,
  inferMessageRouteRunKind,
  normalizeRecentTurns,
  type MessageRouteBody,
} from "@/lib/api-routes/message/request-context";
import {
  applyMessageEmbeddingUpdatePlanToTopics,
  buildTargetTopicMessageEmbeddingPlan,
  describeCentroidUpdatePlan,
  getCanonicalEmbeddingPersistenceMetadata,
  isUsableCentroidUpdatePlan,
  type RouteCentroidUpdatePlan,
} from "@/lib/api-routes/message/semantic-message-embedding";
import {
  adaptModelFirstTopicResolutionOutcome,
  buildContinuationPolicyTopicResolutionOutcome,
  buildSemanticEnrichmentStatusForContinuationPolicy,
  deriveClarifySeekingFromResolutionFrame,
  derivePreferredModalityFromResolutionFrame,
  emptyVectorInfo,
  getMessageEmbeddingSkipReason,
  getResolvedMessageFrame,
  normalizeVectorInfoFallback,
  shouldOverrideLearnerMessageWithContinuationPolicy,
  shouldPersistLearningSpaceForContinuation,
  shouldUseModelContinuationPolicyInsteadOfDeterministic,
  type TopicResolutionDebug,
  type TopicResolutionOutcome,
} from "@/lib/api-routes/message/topic-resolution-adapter";


function getTopicRoutingQdrantQueryMode(): TopicRoutingQdrantQueryMode {
  const raw =
    process.env.MYWAY_TOPIC_ROUTING_QDRANT_QUERY_MODE?.trim().toLowerCase();

  if (raw === "always") return "always";

  /**
   * Default is intentionally "off" for this pass.
   *
   * The route now embeds once and lets the configured topic labeler perform local Supabase embedding ranking.
   * We will add "local confidence -> optional Qdrant" after updating topic-router.ts
   * and topic-routing-policy.ts.
   */
  return "off";
}

function getTopicLabelerSummary(result: TopicLabelerClientResult | null) {
  if (!result) {
    return {
      attempted: false,
      provider: getTopicLabelerProvider(),
      succeeded: null,
      error: null,
      latency_ms: null,
      route_decision: null,
      extracted_label: null,
      matched_topic_label: null,
    };
  }

  if (!result.ok) {
    return {
      attempted: true,
      provider: result.provider,
      succeeded: false,
      error: result.error,
      latency_ms: result.latency_ms,
      route_decision: null,
      extracted_label: null,
      matched_topic_label: null,
    };
  }

  return {
    attempted: true,
    provider: result.provider,
    succeeded: true,
    error: null,
    latency_ms: result.latency_ms,
    route_decision: result.response.route.route_decision,
    extracted_label:
      result.response.route.extracted_label ??
      result.response.model_prediction.extracted_label,
    matched_topic_label: result.response.route.matched_topic_label ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function getConfusionInsightSignalCount(topicJson: unknown) {
  const record = asRecord(topicJson);
  const value = record.confusion_insight_signal_count;

  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}


export async function POST(request: Request) {
  const timer = createMessageRouteTimer();

  let topicCountLoaded: number | null = null;

  let incomingActiveTopicId: string | null = null;
  let incomingActiveTopicFound: boolean | null = null;
  let incomingActiveTopicLabel: string | null = null;
  let viewportFocusedTopicId: string | null = null;
  let viewportSelectedTopicId: string | null = null;
  let viewportActiveTopicIdForMessage: string | null = null;

  const qdrantQueryMode = getTopicRoutingQdrantQueryMode();
  let qdrantQueryAttempted = false;
  let qdrantQuerySucceeded: boolean | null = null;
  let qdrantQueryError: string | null = null;
  let qdrantQuerySkippedReason: string | null =
    qdrantQueryMode === "off" ? "qdrant_query_mode_off" : null;

  let qdrantSyncAttempted = false;
  let qdrantSyncSucceeded: boolean | null = null;
  let qdrantSyncError: string | null = null;
  let qdrantSyncDurationMs: number | null = null;

  let finalModelSignalsStatus: ModelSignals["status"] | null = null;
  let finalTopicLabelingMode: TopicLabelingMode | null = null;
  let finalResolutionKind: RouteResolutionKind | null = null;
  let finalUsedLLMFallback: boolean | null = null;
  let finalMessageEmbeddingAvailable: boolean | null = null;
  let finalEmbeddingModel: string | null = null;
  let finalCentroidUpdateMethod: string | null = null;

  const topicLabelerEnabled = getTopicLabelerEnabled();
  const topicLabelerProvider = getTopicLabelerProvider();
  let topicLabelerResult: TopicLabelerClientResult | null = null;
  let modelTopicRoutePolicyDecision: ModelTopicRoutePolicyDecision | null =
    null;
  let modelTopicPolicyUsedAsAuthority = false;
  let topicAuthoritySource: string | null = null;
  let modelRouteContinuationPolicy: ModelRouteContinuationPolicy | null = null;
  let semanticEnrichmentStatus: SemanticEnrichmentStatus | null = null;

  try {
    const body = (await request.json()) as MessageRouteBody;
    timer.step("parse_request_json");

    const message = body.messageText?.trim() || body.message?.trim();

    if (!message) {
      timer.step("validate_message_missing");

      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 },
      );
    }

    if (shouldUseMockThreeModelMessageRoute()) {
      timer.step("mock_3model_message_route");

      return NextResponse.json(
        await buildMockThreeModelMessageRouteResponse({ message }),
      );
    }
    incomingActiveTopicId = asOptionalString(body.activeTopicId);
    viewportFocusedTopicId = asOptionalString(
      body.viewportContext?.focusedTopicId,
    );
    viewportSelectedTopicId = asOptionalString(
      body.viewportContext?.selectedTopicId,
    );
    viewportActiveTopicIdForMessage = asOptionalString(
      body.viewportContext?.activeTopicIdForMessage,
    );

    const recentTurns = normalizeRecentTurns(body);
    const chatHistoryForModelSignals = buildChatHistoryLinesForModelSignals({
      body,
      recentTurns,
    });
    timer.step("normalize_message_and_chat_history");

    let modelSignals: ModelSignals = {
      ...buildFallbackModelSignals(),
      error_message: "Confusion/insight foreground scoring has not run yet.",
    };

    finalModelSignalsStatus = modelSignals.status;
    timer.step("initialize_confusion_insight_signal_shell");

    const existingTopics = await loadRouteTopics();
    topicCountLoaded = existingTopics.length;

    const activeTopicFromRequest =
      incomingActiveTopicId != null
        ? (existingTopics.find((topic) => topic.id === incomingActiveTopicId) ??
          null)
        : null;

    incomingActiveTopicFound = Boolean(activeTopicFromRequest);
    incomingActiveTopicLabel = activeTopicFromRequest?.topic_label ?? null;

    timer.step("load_route_topics_from_supabase");

    if (topicLabelerEnabled) {
      const topicLabelerRequest = buildTopicLabelerRequest({
        message,
        activeTopicLabel: incomingActiveTopicLabel,
        currentTopicLabels: existingTopics.map((topic) => topic.topic_label),
        previousUserMessages:
          buildRecentUserMessagesForTopicLabeler(recentTurns),
      });

      topicLabelerResult = await callConfiguredTopicLabeler(
        topicLabelerRequest,
        { timeoutMs: getTopicLabelerTimeoutMs() },
      );

      console.info("[topic-labeler active: model result]", {
        request: topicLabelerRequest,
        result: topicLabelerResult,
        note: "The configured topic labeler/model policy is now allowed to be authoritative for safe route decisions.",
      });
    }

    timer.step("topic_labeler_active");

    modelTopicRoutePolicyDecision = buildModelTopicRoutePolicyDecision({
      modelResult: topicLabelerResult,
      activeTopic: activeTopicFromRequest,
      existingTopics,
    });

    modelRouteContinuationPolicy = buildModelRouteContinuationPolicy({
      activeTopic: activeTopicFromRequest,
      modelPolicyDecision: modelTopicRoutePolicyDecision,
    });

    console.info("[topic-labeler policy decision]", {
      usable: modelTopicRoutePolicyDecision.usable,
      decision_kind: modelTopicRoutePolicyDecision.decision_kind,
      extracted_label: modelTopicRoutePolicyDecision.extracted_label,
      matched_topic_label: modelTopicRoutePolicyDecision.matched_topic_label,
      matched_topic_id: modelTopicRoutePolicyDecision.matched_topic_id,
      reasons: modelTopicRoutePolicyDecision.reasons,
      continuation_policy: modelRouteContinuationPolicy,
      note: "Policy may be authoritative for create_new, switch_existing, or stay_active. Clarify/no-topic now has an explicit continuation policy.",
    });

    timer.step("model_topic_policy_decision");

    let semanticVectorInfo: VectorInfo = emptyVectorInfo();
    let messageEmbedding: EmbeddingVector | null = null;
    let embeddingModel: string | null = null;

    const messageEmbeddingSkipReason = getMessageEmbeddingSkipReason({
      decision: modelTopicRoutePolicyDecision,
      continuationPolicy: modelRouteContinuationPolicy,
      topicLabelerEnabled,
    });
    const skipMessageEmbeddingForModelPolicy =
      messageEmbeddingSkipReason !== null;

    if (skipMessageEmbeddingForModelPolicy) {
      messageEmbedding = null;
      embeddingModel = null;
      finalMessageEmbeddingAvailable = false;
      finalEmbeddingModel = null;

      console.info("[message embedding skipped]", {
        reason: messageEmbeddingSkipReason,
        decision_kind: modelTopicRoutePolicyDecision?.decision_kind ?? null,
        extracted_label: modelTopicRoutePolicyDecision?.extracted_label ?? null,
        continuation_policy_kind: modelRouteContinuationPolicy?.kind ?? null,
      });
    } else {
      try {
        const embeddingResult = await embedMessageForSemanticRouting(message);
        messageEmbedding = embeddingResult.messageEmbedding;
        embeddingModel = embeddingResult.embeddingModel;
        finalMessageEmbeddingAvailable = Boolean(messageEmbedding?.length);
        finalEmbeddingModel = embeddingModel;
      } catch (error) {
        console.warn("Message embedding failed in POST /api/message", error);
        messageEmbedding = null;
        embeddingModel = null;
        finalMessageEmbeddingAvailable = false;
        finalEmbeddingModel = null;
      }
    }

    timer.step("embed_message_for_semantic_routing");

    if (messageEmbedding?.length && qdrantQueryMode === "always") {
      qdrantQueryAttempted = true;
      qdrantQuerySkippedReason = null;

      try {
        const qdrantQuery = await querySemanticTopicCandidatesFromEmbedding(
          messageEmbedding,
          5,
          embeddingModel,
        );

        semanticVectorInfo = qdrantQuery.vectorInfo;
        qdrantQuerySucceeded = true;

        if (!qdrantQuery.candidates.length) {
          qdrantQuerySkippedReason =
            qdrantQuery.debug?.metadata.skipped_reason ??
            "no_qdrant_candidates";
        }
      } catch (error) {
        qdrantQuerySucceeded = false;
        qdrantQueryError =
          error instanceof Error ? error.message : "Unknown Qdrant query error";
        qdrantQuerySkippedReason = "qdrant_query_failed";
        semanticVectorInfo = emptyVectorInfo();

        console.warn("Qdrant topic query failed in POST /api/message", error);
      }
    }

    timer.step("optional_qdrant_topic_query");

    const preliminaryInteractionContext: ImportantRunInputs["current_interaction_context"] =
      {
        run_kind:
          incomingActiveTopicId && recentTurns.length > 0
            ? "mixed"
            : "initial_question",
        is_response_to_delivered_probe: false,
        prior_mode_selected: null,
        prior_probe_was_applicable: null,
        prior_probe_id: null,
        prior_mode_outcome_available: recentTurns.length > 0,
      };

    const modelFirstTopicResolution = buildModelFirstTopicResolutionOutcome({
      existingTopics,
      activeTopic: activeTopicFromRequest,
      modelPolicyDecision: modelTopicRoutePolicyDecision,
      semanticVectorInfo,
      messageEmbedding,
      embeddingModel,
      initialMessage: message,
      embeddingSkippedForFastRoute: skipMessageEmbeddingForModelPolicy,
    });

    const modelAuthoritativeTopicResolution = modelFirstTopicResolution
      ? adaptModelFirstTopicResolutionOutcome(modelFirstTopicResolution)
      : null;

    if (modelFirstTopicResolution) {
      modelRouteContinuationPolicy =
        modelFirstTopicResolution.modelRouteContinuationPolicy;
      semanticEnrichmentStatus =
        modelFirstTopicResolution.semanticEnrichmentStatus;
    }

    let topicResolution: TopicResolutionOutcome;

    const shouldUseContinuationPolicyInsteadOfDeterministic =
      !modelAuthoritativeTopicResolution &&
      shouldUseModelContinuationPolicyInsteadOfDeterministic(
        modelRouteContinuationPolicy,
      );

    if (modelAuthoritativeTopicResolution) {
      topicResolution = modelAuthoritativeTopicResolution;
      modelTopicPolicyUsedAsAuthority = true;
      topicAuthoritySource = "topic_labeler_policy";
    } else if (
      shouldUseContinuationPolicyInsteadOfDeterministic &&
      modelRouteContinuationPolicy
    ) {
      topicResolution = buildContinuationPolicyTopicResolutionOutcome({
        existingTopics,
        activeTopic: activeTopicFromRequest,
        modelRouteContinuationPolicy,
        modelPolicyDecision: modelTopicRoutePolicyDecision,
        semanticVectorInfo,
      });
      semanticEnrichmentStatus =
        buildSemanticEnrichmentStatusForContinuationPolicy({
          policy: modelRouteContinuationPolicy,
          modelPolicyDecision: modelTopicRoutePolicyDecision,
        });
      modelTopicPolicyUsedAsAuthority = false;
      topicAuthoritySource = "topic_labeler_continuation_policy";
    } else {
      const modelSafeFallbackPolicy =
        modelRouteContinuationPolicy ??
        buildModelRouteContinuationPolicy({
          activeTopic: activeTopicFromRequest,
          modelPolicyDecision: modelTopicRoutePolicyDecision,
        });

      topicResolution = buildContinuationPolicyTopicResolutionOutcome({
        existingTopics,
        activeTopic: activeTopicFromRequest,
        modelRouteContinuationPolicy: modelSafeFallbackPolicy,
        modelPolicyDecision: modelTopicRoutePolicyDecision,
        semanticVectorInfo,
      });

      semanticEnrichmentStatus =
        buildSemanticEnrichmentStatusForContinuationPolicy({
          policy: modelSafeFallbackPolicy,
          modelPolicyDecision: modelTopicRoutePolicyDecision,
        });

      modelRouteContinuationPolicy = modelSafeFallbackPolicy;
      modelTopicPolicyUsedAsAuthority = false;
      topicAuthoritySource =
        "topic_labeler_safe_fallback_no_modern_deterministic";
    }

    timer.step("resolve_topic_outcome");

    const {
      topic,
      createdTopic,
      routeTopics,
      resolutionKind,
      vectorInfo,
      resolvedLabel,
      matchConfidence,
      usedLLMFallback,
      resolutionTrace,
      semanticTopicRouting,
      centroidUpdatePlan: initialCentroidUpdatePlan,
      debug: topicResolutionDebug,
    } = topicResolution;

    finalTopicLabelingMode = topicResolutionDebug.topic_labeling_mode;
    finalResolutionKind = resolutionKind;
    finalUsedLLMFallback = usedLLMFallback;

    if (topicLabelerEnabled) {
      console.info("[topic-labeler active: route authority decision]", {
        actual_authoritative_result: {
          authority_source: topicAuthoritySource,
          model_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
          resolution_kind: resolutionKind,
          resolved_label: resolvedLabel,
          target_topic_id: topic.id,
          target_topic_label: topic.topic_label,
          created_topic_label: createdTopic?.topic_label ?? null,
          match_confidence: matchConfidence,
          used_llm_topic_fallback: usedLLMFallback,
          model_route_continuation_policy: modelRouteContinuationPolicy,
          semantic_enrichment_status: semanticEnrichmentStatus,
        },
        topic_labeler_result: topicLabelerResult,
      });
    }

    const targetTopicId = topic.id;
    const resolvedMessageFrame = getResolvedMessageFrame(resolutionTrace);
    const preferredModality =
      derivePreferredModalityFromResolutionFrame(resolvedMessageFrame);
    const clarifySeeking =
      modelTopicPolicyUsedAsAuthority &&
      modelTopicRoutePolicyDecision?.decision_kind === "stay_active"
        ? true
        : deriveClarifySeekingFromResolutionFrame(resolvedMessageFrame);
    timer.step("derive_route_message_signals");

    const currentInteractionContext: ImportantRunInputs["current_interaction_context"] =
      {
        run_kind: inferMessageRouteRunKind({
          recentTurns,
          hasActiveTopicId: Boolean(incomingActiveTopicId),
          clarifySeeking,
        }),
        is_response_to_delivered_probe: false,
        prior_mode_selected:
          recentTurns.length > 0 && clarifySeeking ? "clarify" : null,
        prior_probe_was_applicable: null,
        prior_probe_id: null,
        prior_mode_outcome_available: recentTurns.length > 0,
      };

    const newAttempt: ImportantRunInputs["new_attempt"] = {
      status: "absent",
      attempt_id: null,
      timestamp: null,
      originating_run_id: null,
      source_message_id: null,
      linked_probe_id: null,
      linked_stimulus_id: null,
      linked_topic_id: null,
      linked_cluster_id: null,
      linked_resolution_contract_id: null,
      response_type: null,
      completion_status: null,
      raw_response: null,
      delivery_context: {
        renderer_type: null,
        generator: null,
        modality: null,
        tone: null,
        pacing: null,
        language_style: null,
        context_framing: null,
      },
      submission_metadata: {
        latency_ms: null,
        revision_count: null,
        used_hint: null,
        requested_clarification_before_answering: null,
      },
    };

    timer.step("build_interaction_context_and_attempt_shell");

    const updatedTopicMetrics = buildUpdatedMetrics(targetTopicId, topic);

    const shouldPersistLearningSpace =
      shouldPersistLearningSpaceForContinuation(modelRouteContinuationPolicy);

    /**
     * Routing and evidence are intentionally split.
     *
     * /api/message should stay responsive and should not start or require the
     * embedding service for authoritative topic-labeler routes. If a routing
     * embedding already exists, we can use it immediately. Otherwise we queue
     * the learner message as pending topic-message evidence for the local
     * semantic worker to process when the laptop is idle.
     */
    timer.step("queue_or_use_topic_message_embedding_evidence");

    const fallbackCentroidUpdatePlan = buildTargetTopicMessageEmbeddingPlan({
      targetTopic: topic,
      messageEmbedding,
      embeddingModel,
    });

    const finalCentroidUpdatePlan = isUsableCentroidUpdatePlan(
      initialCentroidUpdatePlan,
      targetTopicId,
    )
      ? initialCentroidUpdatePlan
      : fallbackCentroidUpdatePlan;

    if (
      initialCentroidUpdatePlan &&
      finalCentroidUpdatePlan !== initialCentroidUpdatePlan
    ) {
      console.info("[centroid update plan fallback selected]", {
        reason: "initial_centroid_update_plan_unusable",
        target_topic_id: targetTopicId,
        target_topic_label: topic.topic_label,
        initial_plan: describeCentroidUpdatePlan(initialCentroidUpdatePlan),
        fallback_plan: describeCentroidUpdatePlan(fallbackCentroidUpdatePlan),
      });
    }

    const runId = makeId("run");

    /**
     * New engine shadow path:
     *
     * This runs the 3-model engine diagnosis boundary in parallel with the
     * existing /api/message route. It logs/validates the new diagnosis output
     * but does not change routing, metrics, persistence, probe planning, or the
     * response yet.
     */
    await runMessageDiagnosisEngineShadow({
      runId,
      message,
    });


    const confusionInsightScoringMode = getConfusionInsightScoringMode();
    const confusionInsightInput = buildConfusionInsightInput({
      message,
      activeTopic: activeTopicFromRequest,
      targetTopic: topic,
      vectorInfo: normalizeVectorInfoFallback(
        vectorInfo,
        topic,
        Boolean(createdTopic),
      ),
      resolutionKind,
      matchConfidence,
      createdTopic: Boolean(createdTopic),
      currentInteractionContext,
      clarifySeeking,
    });

    const confusionInsightResolution =
      await resolveConfusionInsightSignalsForMessageRoute({
        scoringMode: confusionInsightScoringMode,
        input: confusionInsightInput,
        targetTopicId,
        targetTopicLabel: topic.topic_label,
        resolutionKind,
      });

    modelSignals = confusionInsightResolution.modelSignals;
    finalModelSignalsStatus = modelSignals.status;

    timer.step(confusionInsightResolution.timerStep);

    const persistedConfusionInsight = derivePersistedConfusionInsightValues({
      topic,
      updatedTopicMetrics,
      modelSignals,
      createdTopic: Boolean(createdTopic),
    });

    const finalUpdatedTopicMetrics = {
      ...updatedTopicMetrics,
      confusion: persistedConfusionInsight.confusion,
      insight: persistedConfusionInsight.insight,
    };

    const finalMetricUpdateForFrontend = {
      ...updatedTopicMetrics,
      confusion: persistedConfusionInsight.confusion ?? undefined,
      insight: persistedConfusionInsight.insight ?? undefined,
    };

    console.info("[confusion-insight persistence decision]", {
      target_topic_id: targetTopicId,
      target_topic_label: topic.topic_label,
      source: persistedConfusionInsight.source,
      model_confusion_used: persistedConfusionInsight.model_confusion_used,
      model_insight_used: persistedConfusionInsight.model_insight_used,
      persisted_confusion: persistedConfusionInsight.confusion,
      persisted_insight: persistedConfusionInsight.insight,
      blend_alpha: persistedConfusionInsight.blend_alpha,
    });

    const shouldQueueTopicMessageEmbeddingEvidence =
      shouldPersistLearningSpace &&
      !finalCentroidUpdatePlan &&
      resolutionKind !== "no_match" &&
      modelRouteContinuationPolicy?.should_treat_as_learning_evidence !== false;

    const pendingTopicMessageEmbeddingEvidence =
      shouldQueueTopicMessageEmbeddingEvidence
        ? buildPendingTopicMessageEmbedding({
            message,
            runId,
            targetTopicId,
            targetTopicLabel: topic.topic_label,
            resolutionKind,
            resolvedLabel,
            matchConfidence,
            authoritySource: topicAuthoritySource,
          })
        : null;

    const shouldQueueConfusionInsightScore =
      shouldPersistLearningSpace &&
      resolutionKind !== "no_match" &&
      modelRouteContinuationPolicy?.should_treat_as_learning_evidence !==
        false &&
      (confusionInsightScoringMode === "worker" ||
        modelSignals.status !== "ok");

    const pendingConfusionInsightScore = shouldQueueConfusionInsightScore
      ? buildPendingConfusionInsightScore({
          message,
          chatHistory: chatHistoryForModelSignals,
          structuredInput: confusionInsightInput,
          runId,
          targetTopicId,
          targetTopicLabel: topic.topic_label,
          resolutionKind,
          resolvedLabel,
          matchConfidence,
          authoritySource: topicAuthoritySource,
        })
      : null;

    if (pendingConfusionInsightScore) {
      console.info("[confusion-insight score queued for worker]", {
        target_topic_id: targetTopicId,
        target_topic_label: topic.topic_label,
        resolution_kind: resolutionKind,
        chat_history_items: chatHistoryForModelSignals.length,
        payload_shape: pendingConfusionInsightScore.payload_shape,
        reason: buildConfusionInsightQueueReason({
          scoringMode: confusionInsightScoringMode,
          modelSignals,
        }),
      });
    }

    if (pendingTopicMessageEmbeddingEvidence) {
      console.info("[topic message embedding queued for worker]", {
        target_topic_id: targetTopicId,
        target_topic_label: topic.topic_label,
        resolution_kind: resolutionKind,
        reason: "no_synchronous_message_embedding_available",
        routing_embedding_skipped: skipMessageEmbeddingForModelPolicy,
        routing_embedding_skip_reason: messageEmbeddingSkipReason,
      });
    }

    const metricUpdatedTopics = routeTopics.map((routeTopic) =>
      routeTopic.id === targetTopicId
        ? applyMetricUpdate(routeTopic, finalMetricUpdateForFrontend)
        : routeTopic,
    );

    const updatedTopics = applyMessageEmbeddingUpdatePlanToTopics(
      metricUpdatedTopics,
      finalCentroidUpdatePlan,
    );

    const updatedResolvedTopic =
      updatedTopics.find((routeTopic) => routeTopic.id === targetTopicId) ??
      topic;

    finalCentroidUpdateMethod = finalCentroidUpdatePlan?.update_method ?? null;

    const topicRouting = semanticTopicRouting
      ? {
          ...semanticTopicRouting,
          selected_topic_id: targetTopicId,
          selected_topic_label: updatedResolvedTopic.topic_label,
          centroid_update: finalCentroidUpdatePlan
            ? {
                topic_id: finalCentroidUpdatePlan.topic_id,
                previous_embedding_count:
                  finalCentroidUpdatePlan.previous_embedding_count,
                new_embedding_count:
                  finalCentroidUpdatePlan.new_embedding_count,
                update_method: finalCentroidUpdatePlan.update_method,
                alpha: finalCentroidUpdatePlan.alpha,
                embedding_model: finalCentroidUpdatePlan.embedding_model,
                updated_at: finalCentroidUpdatePlan.updated_at,
              }
            : null,
        }
      : null;

    const normalizedVectorInfo = normalizeVectorInfoFallback(
      vectorInfo,
      topic,
      Boolean(createdTopic),
    );

    const decision = buildInterventionModeDecision(
      updatedResolvedTopic,
      normalizedVectorInfo,
      preferredModality,
      message,
      Boolean(createdTopic),
      modelSignals,
      currentInteractionContext,
      newAttempt,
      resolutionKind,
      clarifySeeking,
    );

    const probePlan =
      decision.mode_selected === "probe"
        ? buildProbePlan(
            updatedResolvedTopic,
            decision,
            message,
            preferredModality,
          )
        : buildNotApplicableProbePlan(updatedResolvedTopic);

    let deliveredResponse = buildDeliveredResponse(
      updatedResolvedTopic,
      decision,
      probePlan,
    );

    if (
      shouldOverrideLearnerMessageWithContinuationPolicy(
        modelRouteContinuationPolicy,
      ) &&
      modelRouteContinuationPolicy?.suggested_learner_message
    ) {
      deliveredResponse = {
        ...deliveredResponse,
        learner_message: {
          text: modelRouteContinuationPolicy.suggested_learner_message,
          tone: "encouraging",
          mode: "clarify",
        },
        delivered_probe: null,
      };
    }

    const previousModeOutcome = buildPreviousModeOutcome(
      currentInteractionContext.run_kind,
    );

    const engineFuel = buildEngineFuel(
      updatedTopics,
      decision,
      probePlan,
      previousModeOutcome,
      topicRouting,
    );

    timer.step("build_decision_probe_delivery_and_engine_fuel");

    const rawLearningSpace = buildLearningSpace(
      updatedTopics,
    ) as RawLearningSpace;
    const learningSpace = adaptLearningSpaceToContract(
      rawLearningSpace,
      updatedTopics,
    );

    timer.step("build_learning_space");

    const result: MyWayRunResult = {
      run_metadata: buildRunMetadata(engineFuel, runId),
      important_run_inputs: buildImportantRunInputs(
        message,
        normalizedVectorInfo,
        modelSignals,
        currentInteractionContext,
        newAttempt,
        [],
      ),
      engine_fuel: engineFuel,
      delivered_response: deliveredResponse,
      learning_space: learningSpace,
    };

    const runResultJson = JSON.parse(JSON.stringify(result));

    const foregroundSignalCountBefore = getConfusionInsightSignalCount(
      updatedResolvedTopic.topic_json,
    );
    const foregroundSignalCountAfter =
      confusionInsightScoringMode === "foreground" &&
      hasUsableConfusionInsightSignals(modelSignals)
        ? foregroundSignalCountBefore + 1
        : foregroundSignalCountBefore;
    const foregroundSignalState =
      confusionInsightScoringMode === "foreground"
        ? buildForegroundConfusionInsightSignalState({
            topicJson: updatedResolvedTopic.topic_json,
            modelSignals,
            persisted: persistedConfusionInsight,
          })
        : asRecord(updatedResolvedTopic.topic_json)
            .confusion_insight_signal_state ?? null;

    const topicJsonBase = {
      ...asRecord(updatedResolvedTopic.topic_json),
      topic_id: updatedResolvedTopic.id,
      topic_label: updatedResolvedTopic.topic_label,
      topic_position: updatedResolvedTopic.position,
      semantic_position: updatedResolvedTopic.semanticPosition ?? null,
      semantic_position_method:
        updatedResolvedTopic.semanticPositionMethod ?? null,
      semantic_position_updated_at:
        updatedResolvedTopic.semanticPositionUpdatedAt ?? null,
      next_step:
        probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
      inferred_keywords: inferKeywordsFromTopicLabel(
        resolvedLabel ?? updatedResolvedTopic.topic_label,
      ),
      updated_topic_metrics: finalUpdatedTopicMetrics,
      foreground_confusion_insight_score: {
        scored_at:
          confusionInsightScoringMode === "foreground" ? nowIso() : null,
        scoring_mode: confusionInsightScoringMode,
        status: modelSignals.status,
        model_confusion: modelSignals.model_confusion,
        model_insight: modelSignals.model_insight,
        model_version: modelSignals.model_version,
        latency_ms: modelSignals.latency_ms,
        error_message: modelSignals.error_message,
        persistence_source: persistedConfusionInsight.source,
        persisted_confusion: persistedConfusionInsight.confusion,
        persisted_insight: persistedConfusionInsight.insight,
        blend_alpha: persistedConfusionInsight.blend_alpha,
        queued_for_worker: Boolean(pendingConfusionInsightScore),
        queued_payload_shape:
          pendingConfusionInsightScore?.payload_shape ?? null,
      },
      confusion_insight_scoring: {
        mode: confusionInsightScoringMode,
        status: modelSignals.status,
        foreground_timeout_ms:
          confusionInsightScoringMode === "foreground"
            ? getForegroundConfusionInsightTimeoutMs()
            : null,
        queued_for_worker: Boolean(pendingConfusionInsightScore),
        queued_payload_shape:
          pendingConfusionInsightScore?.payload_shape ?? null,
        queue_reason: pendingConfusionInsightScore
          ? buildConfusionInsightQueueReason({
              scoringMode: confusionInsightScoringMode,
              modelSignals,
            })
          : null,
        worker_queue_role: CONFUSION_INSIGHT_WORKER_QUEUE_ROLE,
        note:
          confusionInsightScoringMode === "worker"
            ? "Scoring is deferred to the local worker for CPU-only local-dev stability and future external/GPU service reuse."
            : "Scoring was attempted in the foreground message route.",
      },
      model_confusion_average: persistedConfusionInsight.confusion,
      model_insight_average: persistedConfusionInsight.insight,
      confusion_insight_signal_state: foregroundSignalState,
      confusion_insight_signal_count: foregroundSignalCountAfter,
      last_confusion_insight_score:
        confusionInsightScoringMode === "foreground" &&
        hasUsableConfusionInsightSignals(modelSignals)
          ? {
              score_id: null,
              run_id: runId,
              processed_at: nowIso(),
              source: "message_route_foreground",
              payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
              input_type: confusionInsightInput.input_type,
              structured_input_used: confusionInsightInput,
              model_confusion: modelSignals.model_confusion,
              model_insight: modelSignals.model_insight,
              model_version: modelSignals.model_version,
              inference_mode: modelSignals.inference_mode,
              latency_ms: modelSignals.latency_ms,
              next_confusion: persistedConfusionInsight.confusion,
              next_insight: persistedConfusionInsight.insight,
              persistence_source: persistedConfusionInsight.source,
              signal_count_before_run: foregroundSignalCountBefore,
              signal_count_after_run: foregroundSignalCountAfter,
            }
          : asRecord(updatedResolvedTopic.topic_json)
              .last_confusion_insight_score ?? null,
      learning_space_topic:
        learningSpace.topics.find(
          (t) => t.topic_id === updatedResolvedTopic.id,
        ) ?? null,
      planned_probe: deliveredResponse.delivered_probe ?? null,
      resolution_kind: resolutionKind,
      resolved_label: resolvedLabel,
      match_confidence: matchConfidence,
      used_llm_topic_fallback: usedLLMFallback,
      topic_resolution_debug: topicResolutionDebug,
      topic_resolution_trace: resolutionTrace,
      semantic_vector_info: normalizedVectorInfo,
      topic_routing: topicRouting,
      topic_labeler_active: topicLabelerResult,
      model_topic_route_policy_decision: modelTopicRoutePolicyDecision,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,
      model_route_continuation_policy: modelRouteContinuationPolicy,
      semantic_enrichment_status: semanticEnrichmentStatus,
      needs_embedding_centroid:
        semanticEnrichmentStatus?.needs_embedding_centroid ?? false,
      embedding_skip_reason:
        semanticEnrichmentStatus?.embedding_skip_reason ?? null,
      layout_status: semanticEnrichmentStatus?.layout_status ?? null,
      should_schedule_enrichment:
        semanticEnrichmentStatus?.should_schedule_enrichment ?? false,
      semantic_enrichment_prompt_text:
        semanticEnrichmentStatus?.enrichment_prompt_text ?? null,
      message_embedding_update_plan: finalCentroidUpdatePlan,

      topic_label_embedding_centroid:
        updatedResolvedTopic.topic_label_embedding_centroid ?? null,
      topic_label_embedding_count:
        updatedResolvedTopic.topic_label_embedding_count ?? 0,
      topic_label_embedding_model:
        updatedResolvedTopic.topic_label_embedding_model ?? null,
      topic_label_embedding_updated_at:
        updatedResolvedTopic.topic_label_embedding_updated_at ?? null,

      topic_message_embedding_centroid:
        updatedResolvedTopic.topic_message_embedding_centroid ?? null,
      topic_message_embedding_count:
        updatedResolvedTopic.topic_message_embedding_count ?? 0,
      topic_message_embedding_model:
        updatedResolvedTopic.topic_message_embedding_model ?? null,
      topic_message_embedding_updated_at:
        updatedResolvedTopic.topic_message_embedding_updated_at ?? null,
    };

    const topicJsonWithPendingMessageEmbedding =
      pendingTopicMessageEmbeddingEvidence
        ? appendPendingTopicMessageEmbedding({
            topicJson: topicJsonBase,
            pendingItem: pendingTopicMessageEmbeddingEvidence,
          })
        : topicJsonBase;

    const topicJsonWithPendingConfusionInsight = pendingConfusionInsightScore
      ? appendPendingConfusionInsightScore({
          topicJson: topicJsonWithPendingMessageEmbedding,
          pendingItem: pendingConfusionInsightScore,
        })
      : topicJsonWithPendingMessageEmbedding;

    const topicJson = JSON.parse(
      JSON.stringify(topicJsonWithPendingConfusionInsight),
    );

    const sceneUpdate = buildSceneUpdate(
      targetTopicId,
      learningSpace,
      resolutionKind,
    );

    const suggestedAction = buildSuggestedAction(
      updatedResolvedTopic.topic_label,
      probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
      decision.mode_selected,
    );

    const statusLabel = buildStatusLabel(
      resolutionKind,
      decision.mode_selected,
    );

    timer.step("serialize_result_topic_json_and_scene_update");

    await insertRun({
      id: runId,
      runType: "message",
      userMessage: message,
      sourceMessageId: result.important_run_inputs.user_message.message_id,
      targetTopicId,
      modeSelected: decision.mode_selected,
      activeDiagnosis: decision.active_diagnosis,
      replyText: deliveredResponse.learner_message.text,
      suggestedAction,
      runResultJson,
    });

    timer.step("insert_run_supabase");

    if (shouldPersistLearningSpace) {
      await upsertTopicState({
        topicId: updatedResolvedTopic.id,
        lastRunId: runId,
        topicLabel: updatedResolvedTopic.topic_label,
        confusion: finalUpdatedTopicMetrics.confusion ?? null,
        insight: finalUpdatedTopicMetrics.insight ?? null,
        learningScore:
          updatedTopics.find((t) => t.id === updatedResolvedTopic.id)
            ?.learningScore ?? null,
        diagnosis: decision.active_diagnosis,
        nextStep:
          probePlan.text_plan.instructional_goal ??
          updatedResolvedTopic.nextStep,
        topicJson,
        topicPosition: updatedResolvedTopic.position,
        semanticPosition: updatedResolvedTopic.semanticPosition ?? null,
        semanticPositionMethod:
          updatedResolvedTopic.semanticPositionMethod ?? null,
        semanticPositionUpdatedAt:
          updatedResolvedTopic.semanticPositionUpdatedAt ?? null,
        ...getCanonicalEmbeddingPersistenceMetadata(updatedResolvedTopic),
      });
    } else {
      console.info("[topic_state persistence skipped]", {
        reason: "model_route_continuation_policy_no_learning_space_update",
        continuation_policy_kind: modelRouteContinuationPolicy?.kind ?? null,
        learner_message_intent:
          modelRouteContinuationPolicy?.learner_message_intent ?? null,
        target_topic_id: updatedResolvedTopic.id,
        target_topic_label: updatedResolvedTopic.topic_label,
      });
    }

    timer.step("upsert_topic_state_supabase");

    qdrantSyncAttempted = false;
    qdrantSyncSucceeded = null;
    qdrantSyncDurationMs = null;
    qdrantSyncError = shouldPersistLearningSpace
      ? "qdrant_sync_owned_by_semantic_worker"
      : "skipped_no_learning_space_update";

    console.info("[qdrant sync skipped on message route]", {
      reason: qdrantSyncError,
      topic_id: updatedResolvedTopic.id,
      topic_label: updatedResolvedTopic.topic_label,
      note: "The semantic enrichment worker owns Qdrant sync so /api/message stays fast and GPU/external-service migration stays simple.",
    });

    timer.step("skip_qdrant_sync_on_message_route");

    const latencyDebug = timer.finish({
      route: "POST /api/message",
      topic_count_loaded: topicCountLoaded,

      incoming_active_topic_id: incomingActiveTopicId,
      incoming_active_topic_found: incomingActiveTopicFound,
      incoming_active_topic_label: incomingActiveTopicLabel,
      viewport_focused_topic_id: viewportFocusedTopicId,
      viewport_selected_topic_id: viewportSelectedTopicId,
      viewport_active_topic_id_for_message: viewportActiveTopicIdForMessage,

      qdrant_query_mode: qdrantQueryMode,
      qdrant_query_attempted: qdrantQueryAttempted,
      qdrant_query_succeeded: qdrantQuerySucceeded,
      qdrant_query_error: qdrantQueryError,
      qdrant_query_skipped_reason: qdrantQuerySkippedReason,

      qdrant_sync_attempted: qdrantSyncAttempted,
      qdrant_sync_succeeded: qdrantSyncSucceeded,
      qdrant_sync_error: qdrantSyncError,
      qdrant_sync_duration_ms: qdrantSyncDurationMs,

      confusion_insight_status: finalModelSignalsStatus,
      topic_labeling_mode: finalTopicLabelingMode,
      resolution_kind: finalResolutionKind,
      used_llm_topic_fallback: finalUsedLLMFallback,
      message_embedding_available: finalMessageEmbeddingAvailable,
      embedding_model: finalEmbeddingModel,
      centroid_update_method: finalCentroidUpdatePlan?.update_method ?? null,

      topic_labeler_provider:
        getTopicLabelerSummary(topicLabelerResult).provider ??
        topicLabelerProvider,
      topic_labeler_enabled: topicLabelerEnabled,
      topic_labeler_attempted:
        getTopicLabelerSummary(topicLabelerResult).attempted,
      topic_labeler_succeeded:
        getTopicLabelerSummary(topicLabelerResult).succeeded,
      topic_labeler_error: getTopicLabelerSummary(topicLabelerResult).error,
      topic_labeler_latency_ms:
        getTopicLabelerSummary(topicLabelerResult).latency_ms,
      topic_labeler_route_decision:
        getTopicLabelerSummary(topicLabelerResult).route_decision,
      topic_labeler_extracted_label:
        getTopicLabelerSummary(topicLabelerResult).extracted_label,
      topic_labeler_matched_topic_label:
        getTopicLabelerSummary(topicLabelerResult).matched_topic_label,

      model_topic_policy_usable: modelTopicRoutePolicyDecision?.usable ?? null,
      model_topic_policy_decision_kind:
        modelTopicRoutePolicyDecision?.decision_kind ?? null,
      model_topic_policy_extracted_label:
        modelTopicRoutePolicyDecision?.extracted_label ?? null,
      model_topic_policy_matched_topic_label:
        modelTopicRoutePolicyDecision?.matched_topic_label ?? null,
      model_topic_policy_reasons:
        modelTopicRoutePolicyDecision?.reasons ?? null,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,

      model_route_continuation_policy_kind:
        modelRouteContinuationPolicy?.kind ?? null,
      model_route_learner_message_intent:
        modelRouteContinuationPolicy?.learner_message_intent ?? null,
      model_route_should_create_learning_topic:
        modelRouteContinuationPolicy?.should_create_learning_topic ?? null,
      model_route_should_update_learning_space:
        modelRouteContinuationPolicy?.should_update_learning_space ?? null,
      model_route_should_treat_as_learning_evidence:
        modelRouteContinuationPolicy?.should_treat_as_learning_evidence ?? null,
      model_route_should_myway_choose_target:
        modelRouteContinuationPolicy?.should_myway_choose_target ?? null,
      model_route_should_ask_user_to_choose:
        modelRouteContinuationPolicy?.should_ask_user_to_choose ?? null,

      semantic_enrichment_status: semanticEnrichmentStatus?.status ?? null,
      needs_embedding_centroid:
        semanticEnrichmentStatus?.needs_embedding_centroid ?? null,
      embedding_skip_reason:
        semanticEnrichmentStatus?.embedding_skip_reason ?? null,
      layout_status: semanticEnrichmentStatus?.layout_status ?? null,
      should_schedule_enrichment:
        semanticEnrichmentStatus?.should_schedule_enrichment ?? null,
    });

    console.info("[POST /api/message timing]", latencyDebug);

    const response: MessageRouteResponse & {
      topic_resolution_debug: TopicResolutionDebug;
      topic_resolution_trace: TopicResolutionTrace | null;
      topic_routing: TopicRoutingState | null;
      topic_labeler_active: TopicLabelerClientResult | null;
      model_topic_route_policy_decision: ModelTopicRoutePolicyDecision | null;
      model_topic_policy_used_as_authority: boolean;
      topic_authority_source: string | null;
      model_route_continuation_policy: ModelRouteContinuationPolicy | null;
      semantic_enrichment_status: SemanticEnrichmentStatus | null;
      latency_debug: MessageRouteLatencyDebug;
      worker_queue_debug: {
        confusion_insight_queued: boolean;
        confusion_insight_queue_reason: string | null;
        confusion_insight_payload_shape: "structured_v1_1" | null;
        topic_message_embedding_queued: boolean;
        pending_queue_max_items: number;
      };
    } = {
      result,
      scene_update: sceneUpdate,
      intervention: {
        mode_selected: decision.mode_selected,
        target_topic_id: decision.target_topic_id,
        active_diagnosis: decision.active_diagnosis,
        probe_available: deliveredResponse.delivered_probe !== null,
        status_label: statusLabel,
        suggested_action: suggestedAction,
      },
      topic_resolution_debug: topicResolutionDebug,
      topic_resolution_trace: resolutionTrace,
      topic_routing: topicRouting,
      topic_labeler_active: topicLabelerResult,
      model_topic_route_policy_decision: modelTopicRoutePolicyDecision,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,
      model_route_continuation_policy: modelRouteContinuationPolicy,
      semantic_enrichment_status: semanticEnrichmentStatus,
      latency_debug: latencyDebug,
      worker_queue_debug: {
        confusion_insight_queued: Boolean(pendingConfusionInsightScore),
        confusion_insight_queue_reason: pendingConfusionInsightScore
          ? buildConfusionInsightQueueReason({
              scoringMode: confusionInsightScoringMode,
              modelSignals,
            })
          : null,
        confusion_insight_payload_shape:
          pendingConfusionInsightScore?.payload_shape ?? null,
        topic_message_embedding_queued: Boolean(
          pendingTopicMessageEmbeddingEvidence,
        ),
        pending_queue_max_items: TOPIC_MESSAGE_EMBEDDING_PENDING_QUEUE_MAX_ITEMS,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    const latencyDebug = timer.finish({
      route: "POST /api/message",
      topic_count_loaded: topicCountLoaded,

      incoming_active_topic_id: incomingActiveTopicId,
      incoming_active_topic_found: incomingActiveTopicFound,
      incoming_active_topic_label: incomingActiveTopicLabel,
      viewport_focused_topic_id: viewportFocusedTopicId,
      viewport_selected_topic_id: viewportSelectedTopicId,
      viewport_active_topic_id_for_message: viewportActiveTopicIdForMessage,

      qdrant_query_mode: qdrantQueryMode,
      qdrant_query_attempted: qdrantQueryAttempted,
      qdrant_query_succeeded: qdrantQuerySucceeded,
      qdrant_query_error: qdrantQueryError,
      qdrant_query_skipped_reason: qdrantQuerySkippedReason,

      qdrant_sync_attempted: qdrantSyncAttempted,
      qdrant_sync_succeeded: qdrantSyncSucceeded,
      qdrant_sync_error: qdrantSyncError,
      qdrant_sync_duration_ms: qdrantSyncDurationMs,

      confusion_insight_status: finalModelSignalsStatus,
      topic_labeling_mode: finalTopicLabelingMode,
      resolution_kind: finalResolutionKind,
      used_llm_topic_fallback: finalUsedLLMFallback,
      message_embedding_available: finalMessageEmbeddingAvailable,
      embedding_model: finalEmbeddingModel,
      centroid_update_method: finalCentroidUpdateMethod,

      topic_labeler_provider:
        getTopicLabelerSummary(topicLabelerResult).provider ??
        topicLabelerProvider,
      topic_labeler_enabled: topicLabelerEnabled,
      topic_labeler_attempted:
        getTopicLabelerSummary(topicLabelerResult).attempted,
      topic_labeler_succeeded:
        getTopicLabelerSummary(topicLabelerResult).succeeded,
      topic_labeler_error: getTopicLabelerSummary(topicLabelerResult).error,
      topic_labeler_latency_ms:
        getTopicLabelerSummary(topicLabelerResult).latency_ms,
      topic_labeler_route_decision:
        getTopicLabelerSummary(topicLabelerResult).route_decision,
      topic_labeler_extracted_label:
        getTopicLabelerSummary(topicLabelerResult).extracted_label,
      topic_labeler_matched_topic_label:
        getTopicLabelerSummary(topicLabelerResult).matched_topic_label,

      model_topic_policy_usable: modelTopicRoutePolicyDecision?.usable ?? null,
      model_topic_policy_decision_kind:
        modelTopicRoutePolicyDecision?.decision_kind ?? null,
      model_topic_policy_extracted_label:
        modelTopicRoutePolicyDecision?.extracted_label ?? null,
      model_topic_policy_matched_topic_label:
        modelTopicRoutePolicyDecision?.matched_topic_label ?? null,
      model_topic_policy_reasons:
        modelTopicRoutePolicyDecision?.reasons ?? null,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,

      model_route_continuation_policy_kind:
        modelRouteContinuationPolicy?.kind ?? null,
      model_route_learner_message_intent:
        modelRouteContinuationPolicy?.learner_message_intent ?? null,
      model_route_should_create_learning_topic:
        modelRouteContinuationPolicy?.should_create_learning_topic ?? null,
      model_route_should_update_learning_space:
        modelRouteContinuationPolicy?.should_update_learning_space ?? null,
      model_route_should_treat_as_learning_evidence:
        modelRouteContinuationPolicy?.should_treat_as_learning_evidence ?? null,
      model_route_should_myway_choose_target:
        modelRouteContinuationPolicy?.should_myway_choose_target ?? null,
      model_route_should_ask_user_to_choose:
        modelRouteContinuationPolicy?.should_ask_user_to_choose ?? null,

      semantic_enrichment_status: semanticEnrichmentStatus?.status ?? null,
      needs_embedding_centroid:
        semanticEnrichmentStatus?.needs_embedding_centroid ?? null,
      embedding_skip_reason:
        semanticEnrichmentStatus?.embedding_skip_reason ?? null,
      layout_status: semanticEnrichmentStatus?.layout_status ?? null,
      should_schedule_enrichment:
        semanticEnrichmentStatus?.should_schedule_enrichment ?? null,
    });

    console.error("POST /api/message failed", error);
    console.info("[POST /api/message timing before failure]", latencyDebug);

    return NextResponse.json(
      {
        error: "Failed to process message.",
        latency_debug: latencyDebug,
      },
      { status: 500 },
    );
  }
}



