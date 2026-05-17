import { NextRequest, NextResponse } from "next/server";
import { buildLearningSpace } from "@/lib/build-learning-space";
import {
  insertAttempt,
  insertRun,
  upsertTopicState,
} from "@/lib/persistence/myway";
import { makeId } from "@/lib/utils/ids";
import type {
  DeliveredProbe,
  DeliveredResponse,
  EmbeddingVector,
  EngineFuel,
  ImportantRunInputs,
  InterventionModeDecision,
  LearningSpace,
  ModelSignals,
  MyWayRunResult,
  PreviousModeOutcome,
  ProbeSubmitRouteResponse,
  RunMetadata,
  TopicState,
  VectorInfo,
} from "@/types/contracts";
import {
  applyMetricUpdate,
  buildJudgedAttempt,
  buildTopicMetricUpdate,
  buildVectorInfo,
  inferDiagnosisFromTopic,
  scoreResponse,
  type ProbeAttemptPayload,
} from "@/lib/runtime/attempt-judging";
import {
  buildNextProbePlan,
  buildNotApplicableProbePlan,
  buildResponseBundle,
} from "@/lib/runtime/probe-runtime";
import { buildRecentChatHistory } from "@/lib/runtime/chat-history";
import { scoreConfusionInsight } from "@/lib/providers/confusion-insight";
import { nowIso } from "@/lib/runtime/shared";
import { loadRouteTopics, type RouteTopic } from "@/lib/runtime/route-topics";

type IncomingChatTurn = {
  role?: string;
  text?: string;
  content?: string;
};

type ProbeSubmitBody = ProbeAttemptPayload & {
  chat_history?: string;
  recent_turns?: IncomingChatTurn[];
  conversation_turns?: IncomingChatTurn[];
};

function normalizeRecentTurns(body: ProbeSubmitBody) {
  const rawTurns = Array.isArray(body.recent_turns)
    ? body.recent_turns
    : Array.isArray(body.conversation_turns)
      ? body.conversation_turns
      : [];

  return rawTurns
    .map((turn) => {
      const rawRole = typeof turn.role === "string" ? turn.role : "user";
      const role = rawRole === "assistant" ? "assistant" : "user";
      const text =
        typeof turn.text === "string"
          ? turn.text
          : typeof turn.content === "string"
            ? turn.content
            : "";

      return {
        role,
        text: text.trim(),
      };
    })
    .filter((turn) => turn.text.length > 0) as Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}

function buildChatHistoryFromBody(body: ProbeSubmitBody) {
  if (typeof body.chat_history === "string" && body.chat_history.trim()) {
    return body.chat_history.trim();
  }

  const recentTurns = normalizeRecentTurns(body);

  if (!recentTurns.length) {
    return "";
  }

  return buildRecentChatHistory(recentTurns, 6);
}

function buildFallbackModelSignals(errorMessage?: string): ModelSignals {
  return {
    model_confusion: null,
    model_insight: null,
    model_version: "unavailable",
    inference_mode: null,
    latency_ms: null,
    status: errorMessage ? "error" : "unavailable",
    error_message: errorMessage ?? null,
  };
}

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

function asPositiveCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function buildEmbeddingSummary(args: {
  centroid?: EmbeddingVector | null;
  count?: number | null;
  model?: string | null;
  updatedAt?: string | null;
}) {
  const centroid = asEmbeddingVector(args.centroid ?? null);

  return {
    available: Boolean(centroid?.length),
    dimension: centroid?.length ?? 0,
    count: args.count ?? 0,
    model: args.model ?? null,
    updated_at: args.updatedAt ?? null,
    preview: centroid ? centroid.slice(0, 5) : [],
  };
}

function getRouteTopicLabel(topic: RouteTopic) {
  return topic.topic_label.trim() || "Untitled Topic";
}

function getEmbeddingPersistenceFields(topic: RouteTopic) {
  const topicLabelCentroid = asEmbeddingVector(
    topic.topic_label_embedding_centroid,
  );

  const topicLabelCount = asPositiveCount(topic.topic_label_embedding_count);
  const topicLabelModel = topic.topic_label_embedding_model ?? null;
  const topicLabelUpdatedAt = topic.topic_label_embedding_updated_at ?? null;

  const topicMessageCentroid = asEmbeddingVector(
    topic.topic_message_embedding_centroid,
  );

  const topicMessageCount = asPositiveCount(
    topic.topic_message_embedding_count,
  );

  const topicMessageModel = topic.topic_message_embedding_model ?? null;
  const topicMessageUpdatedAt =
    topic.topic_message_embedding_updated_at ?? null;

  return {
    topicLabelEmbeddingCentroid: topicLabelCentroid,
    topicLabelEmbeddingCount: topicLabelCount,
    topicLabelEmbeddingModel: topicLabelModel,
    topicLabelEmbeddingUpdatedAt: topicLabelUpdatedAt,

    topicMessageEmbeddingCentroid: topicMessageCentroid,
    topicMessageEmbeddingCount: topicMessageCount,
    topicMessageEmbeddingModel: topicMessageModel,
    topicMessageEmbeddingUpdatedAt: topicMessageUpdatedAt,
  };
}

function buildImportantRunInputs(args: {
  body: ProbeAttemptPayload;
  topic: RouteTopic;
  vectorInfo: VectorInfo;
  modelSignals: ModelSignals;
  rawResponse: string;
}): ImportantRunInputs {
  const { body, topic, vectorInfo, modelSignals, rawResponse } = args;
  const topicLabel = getRouteTopicLabel(topic);

  return {
    user_message: {
      message_id: null,
      timestamp: body.submittedAt || nowIso(),
      content: rawResponse,
    },
    model_signals: modelSignals,
    current_interaction_context: {
      run_kind: "attempt_run",
      is_response_to_delivered_probe: true,
      prior_mode_selected: "probe",
      prior_probe_was_applicable: true,
      prior_probe_id: body.probeId,
      prior_mode_outcome_available: true,
    },
    new_attempt: {
      status: "present",
      attempt_id: body.attemptId ?? null,
      timestamp: body.submittedAt || nowIso(),
      originating_run_id: null,
      source_message_id: null,
      linked_probe_id: body.probeId,
      linked_stimulus_id: null,
      linked_topic_id: body.topicId,
      linked_cluster_id: null,
      linked_resolution_contract_id: null,
      response_type: body.responseType ?? "text",
      completion_status:
        typeof body.response === "string" && body.response.trim().length === 0
          ? "skipped"
          : "complete",
      raw_response:
        typeof body.response === "string" || typeof body.response === "object"
          ? body.response
          : null,
      delivery_context: {
        renderer_type: body.deliveryContext?.renderer_type ?? "text_renderer",
        generator: body.deliveryContext?.generator ?? "chatgpt",
        modality: body.deliveryContext?.modality ?? "text",
        tone: body.deliveryContext?.tone ?? "encouraging",
        pacing: body.deliveryContext?.pacing ?? "normal",
        language_style: body.deliveryContext?.language_style ?? "plain",
        context_framing:
          body.deliveryContext?.context_framing ??
          `Probe response for ${topicLabel}.`,
      },
      submission_metadata: {
        latency_ms: body.metadata?.latencyMs ?? null,
        revision_count: body.metadata?.revisionCount ?? null,
        used_hint: body.metadata?.usedHint ?? null,
        requested_clarification_before_answering:
          body.metadata?.requestedClarificationBeforeAnswering ?? null,
      },
    },
    vector_info: vectorInfo,
    uploaded_content: [],
  };
}

function buildDeliveredProbeFromPlan(
  plan: ReturnType<typeof buildNextProbePlan>,
): DeliveredProbe {
  const probeType = plan.probe_type;

  const title =
    probeType === "apply_transfer"
      ? "Apply the idea in a new situation"
      : probeType === "predict"
        ? "Predict what happens next"
        : probeType === "discriminate"
          ? "Distinguish the key difference"
          : probeType === "transform"
            ? "Walk through it step by step"
            : "Explain the idea more concretely";

  return {
    probe_id: plan.probe_id,
    target_topic_id: plan.target_topic_id,
    target_diagnosis: plan.target_diagnosis,
    intent: plan.intent,
    probe_type: plan.probe_type,
    renderer_type: "text_renderer",
    generator: "chatgpt",
    modality: "text",
    title,
    instructions: plan.text_payload.input,
    actual_tone: "encouraging",
    actual_pacing: "normal",
    actual_language_style: "plain",
    actual_context_framing:
      plan.text_payload.personalization_snapshot.context_framing ?? null,
    expected_response_type: plan.expected_response_type,
    stimulus_id: `stimulus-${plan.probe_id}`,
    payload_snapshot: {
      text_payload: plan.text_payload,
    },
  };
}

function buildDeliveredResponse(
  reply: string,
  nextMode: "clarify" | "probe",
  nextProbe: DeliveredProbe | null,
): DeliveredResponse {
  return {
    learner_message: {
      text: reply,
      tone: "encouraging",
      mode: nextMode,
    },
    delivered_probe: nextMode === "probe" ? nextProbe : null,
  };
}

function buildTopicStates(updatedTopics: RouteTopic[]): TopicState[] {
  return updatedTopics.map((topic) => {
    const topicLabel = getRouteTopicLabel(topic);

    return {
      topic_id: topic.id,
      topic_label: topicLabel,
      topic_confusion_average: topic.confusion,
      topic_insight_average: topic.insight,
      topic_learning_score: topic.learningScore,
      topic_learning_velocity: 0,
      topic_novelty_score: 0.5,
      topic_message_count: topic.messageCount ?? 1,
      topic_difficulty: 0.5,
      topic_decay_rate: 0.05,
      topic_link_threshold: 0.5,
      topic_last_update: nowIso(),
      topic_centroid: topic.position as [number, number, number],

      topic_label_embedding: buildEmbeddingSummary({
        centroid: topic.topic_label_embedding_centroid ?? null,
        count: topic.topic_label_embedding_count ?? 0,
        model: topic.topic_label_embedding_model ?? null,
        updatedAt: topic.topic_label_embedding_updated_at ?? null,
      }),

      topic_message_embedding: buildEmbeddingSummary({
        centroid: topic.topic_message_embedding_centroid ?? null,
        count: topic.topic_message_embedding_count ?? 0,
        model: topic.topic_message_embedding_model ?? null,
        updatedAt: topic.topic_message_embedding_updated_at ?? null,
      }),
    };
  });
}

function buildPreviousModeOutcome(): PreviousModeOutcome {
  return {
    mode_selected: "probe",
    reasons: ["This run follows a submitted probe response."],
    confidence: 0.82,
    clarify_outcome: "not_applicable",
  };
}

function bodyResponseSignal(scoring: ReturnType<typeof scoreResponse>) {
  if (scoring.classification === "no_response") return 0.05;
  if (scoring.classification === "guess") return 0.25;
  if (scoring.classification === "structural_failure") return 0.35;
  if (scoring.classification === "near_miss") return 0.6;
  if (scoring.classification === "success") return 0.85;
  return 0.4;
}

function buildDecision(args: {
  topic: RouteTopic;
  scoring: ReturnType<typeof scoreResponse>;
  replyBundle: ReturnType<typeof buildResponseBundle>;
  modelSignals: ModelSignals;
}): InterventionModeDecision {
  const { topic, scoring, replyBundle, modelSignals } = args;
  const continueWithProbe = replyBundle.nextMode === "probe";

  const confusion = modelSignals.model_confusion;
  const insight = modelSignals.model_insight;

  const readinessSignal =
    typeof insight === "number"
      ? Math.max(
          0,
          Math.min(
            1,
            scoring.correctnessEstimate * 0.42 +
              scoring.evidenceStrength * 0.28 +
              insight * 0.3,
          ),
        )
      : Math.max(
          0,
          Math.min(
            1,
            scoring.correctnessEstimate * 0.6 + scoring.evidenceStrength * 0.4,
          ),
        );

  const evidenceQualitySignal =
    typeof confusion === "number" && typeof insight === "number"
      ? Math.max(
          0,
          Math.min(
            1,
            scoring.explanationQuality * 0.34 +
              scoring.evidenceStrength * 0.26 +
              scoring.judgmentConfidence * 0.2 +
              insight * 0.18 -
              confusion * 0.12,
          ),
        )
      : Math.max(
          0,
          Math.min(
            1,
            scoring.explanationQuality * 0.45 +
              scoring.evidenceStrength * 0.35 +
              scoring.judgmentConfidence * 0.2,
          ),
        );

  const classificationBase =
    scoring.classification === "success"
      ? 0.82
      : scoring.classification === "near_miss"
        ? 0.68
        : scoring.classification === "structural_failure"
          ? 0.64
          : scoring.classification === "guess"
            ? 0.58
            : 0.54;

  const decisionConfidence = Math.max(
    0,
    Math.min(
      0.95,
      classificationBase +
        scoring.evidenceStrength * 0.1 +
        scoring.judgmentConfidence * 0.12 +
        (typeof insight === "number" ? insight * 0.04 : 0) -
        (typeof confusion === "number" ? confusion * 0.03 : 0),
    ),
  );

  const decisionReasons = [
    "This run is directly downstream of a delivered probe.",
    `The judged attempt classification was ${scoring.classification}.`,
    `Evidence strength was ${scoring.evidenceStrength.toFixed(
      2,
    )} and judgment confidence was ${scoring.judgmentConfidence.toFixed(2)}.`,
    replyBundle.whyThisNextStep,
  ];

  if (scoring.missingElements) {
    decisionReasons.push(
      `Important missing element detected: ${scoring.missingElements}.`,
    );
  }

  if (scoring.misconceptionTags.length > 0) {
    decisionReasons.push(
      `Detected misconception tags: ${scoring.misconceptionTags.join(", ")}.`,
    );
  }

  if (typeof confusion === "number") {
    decisionReasons.push(
      `Confusion signal for this attempt-like turn was ${confusion.toFixed(2)}.`,
    );
  }

  if (typeof insight === "number") {
    decisionReasons.push(
      `Insight signal for this attempt-like turn was ${insight.toFixed(2)}.`,
    );
  }

  return {
    mode_selected: continueWithProbe ? "probe" : "clarify",
    target_topic_id: topic.id,
    active_diagnosis: replyBundle.activeDiagnosis,
    primary_block: topic.nextStep,
    decision_confidence: decisionConfidence,
    decision_reasons: decisionReasons,
    clarify_score: continueWithProbe
      ? Math.max(
          0.2,
          Math.min(
            0.8,
            0.26 +
              (scoring.classification === "structural_failure" ? 0.18 : 0) +
              (scoring.classification === "near_miss" ? 0.12 : 0) +
              (scoring.missingElements ? 0.08 : 0),
          ),
        )
      : Math.max(
          0.35,
          Math.min(
            0.92,
            0.62 +
              (scoring.classification === "structural_failure" ? 0.08 : 0) +
              (scoring.missingElements ? 0.06 : 0),
          ),
        ),
    probe_score: continueWithProbe
      ? Math.max(
          0.4,
          Math.min(
            0.94,
            0.62 +
              scoring.evidenceStrength * 0.12 +
              (scoring.classification === "success" ? 0.08 : 0),
          ),
        )
      : Math.max(
          0.18,
          Math.min(
            0.7,
            0.26 +
              (scoring.classification === "guess" ? 0.05 : 0) +
              (scoring.classification === "no_response" ? 0.04 : 0),
          ),
        ),
    signal_summary: {
      raw_response_signal: bodyResponseSignal(scoring),
      evidence_quality_signal: evidenceQualitySignal,
      active_problem_signal: 0.72,
      readiness_signal: readinessSignal,
      history_signal: 0.75,
    },
  };
}

function buildEngineFuel(args: {
  updatedTopics: RouteTopic[];
  decision: InterventionModeDecision;
  nextProbePlan:
    | ReturnType<typeof buildNextProbePlan>
    | ReturnType<typeof buildNotApplicableProbePlan>;
  judgedAttempt: ReturnType<typeof buildJudgedAttempt>;
}): EngineFuel {
  const { updatedTopics, decision, nextProbePlan, judgedAttempt } = args;

  return {
    topics: buildTopicStates(updatedTopics),
    clusters: [],
    linked_pairs: [],
    previous_mode_outcome: buildPreviousModeOutcome(),
    intervention_mode_decision: decision,
    probe_plan: nextProbePlan,
    attempts: [judgedAttempt],
  };
}

function buildRunMetadata(engineFuel: EngineFuel, runId: string): RunMetadata {
  return {
    run_id: runId,
    timestamp: nowIso(),
    engine_version: "runtime-v1-hard-topic-label-contract",
    previous_run_id: null,
    topic_count: engineFuel.topics.length,
    cluster_count: engineFuel.clusters.length,
    linked_pair_count: engineFuel.linked_pairs.length,
  };
}

function buildSceneUpdate(
  topicId: string,
  learningSpace: LearningSpace,
): ProbeSubmitRouteResponse["scene_update"] {
  return {
    target_topic_id: topicId,
    camera_destination_topic_id: topicId,
    arrival_mode: "focus",
    learning_space: learningSpace,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProbeSubmitBody;

    const rawResponse =
      typeof body?.response === "string"
        ? body.response
        : JSON.stringify(body?.response ?? "");

    if (!body?.probeId || !body?.topicId || typeof rawResponse !== "string") {
      return NextResponse.json(
        { error: "Missing required fields: probeId, topicId, response." },
        { status: 400 },
      );
    }

    const routeTopics = await loadRouteTopics();

    if (!routeTopics.length) {
      return NextResponse.json(
        { error: "No topics are available." },
        { status: 500 },
      );
    }

    const topic = routeTopics.find((t) => t.id === body.topicId) ?? routeTopics[0];

    if (!topic) {
      return NextResponse.json(
        { error: "Unable to resolve a topic for this probe submission." },
        { status: 500 },
      );
    }

    const topicLabel = body.topicLabel || getRouteTopicLabel(topic);
    const chatHistory = buildChatHistoryFromBody(body);

    let modelSignals: ModelSignals = buildFallbackModelSignals();

    try {
      modelSignals = await scoreConfusionInsight({
        userMessage: rawResponse,
        chatHistory,
      });
    } catch (error) {
      modelSignals = buildFallbackModelSignals(
        error instanceof Error
          ? error.message
          : "Unknown confusion/insight scoring error",
      );
    }

    const vectorInfo = buildVectorInfo(topic);
    const provisionalDiagnosis = inferDiagnosisFromTopic(topic);

    const scoring = scoreResponse(rawResponse, {
      topic,
      prompt: body.prompt ?? topic.nextStep,
      activeDiagnosis: provisionalDiagnosis,
    });

    const replyBundle = buildResponseBundle({
      topicLabel,
      classification: scoring.classification,
      explanationQuality: scoring.explanationQuality,
      insight: scoring.insight,
      evidenceStrength: scoring.evidenceStrength,
      judgmentConfidence: scoring.judgmentConfidence,
      missingElements: scoring.missingElements,
      misconceptionTags: scoring.misconceptionTags,
    });

    const updatedTopicMetrics = buildTopicMetricUpdate(body.topicId, scoring);
    const updatedTopics = routeTopics.map((t) =>
      applyMetricUpdate(t, updatedTopicMetrics),
    );

    const judgedAttempt = buildJudgedAttempt({
      body: {
        ...body,
        response: rawResponse,
      },
      topic,
      scoring,
      activeDiagnosis: replyBundle.activeDiagnosis,
    });

    const nextProbePlan =
      replyBundle.nextMode === "probe" &&
      replyBundle.probeIntent &&
      replyBundle.probeType
        ? buildNextProbePlan({
            topic,
            activeDiagnosis: replyBundle.activeDiagnosis,
            probeIntent: replyBundle.probeIntent,
            probeType: replyBundle.probeType,
            classification: scoring.classification,
            evidenceStrength: scoring.evidenceStrength,
            judgmentConfidence: scoring.judgmentConfidence,
            missingElements: scoring.missingElements,
            misconceptionTags: scoring.misconceptionTags,
          })
        : buildNotApplicableProbePlan(topic);

    const nextDeliveredProbe =
      replyBundle.nextMode === "probe" && nextProbePlan.status === "applicable"
        ? buildDeliveredProbeFromPlan(nextProbePlan)
        : null;

    const decision = buildDecision({
      topic,
      scoring,
      replyBundle,
      modelSignals,
    });

    const engineFuel = buildEngineFuel({
      updatedTopics,
      decision,
      nextProbePlan,
      judgedAttempt,
    });

    const learningSpace: LearningSpace = buildLearningSpace(updatedTopics);
    const runId = makeId("run");

    const result: MyWayRunResult = {
      run_metadata: buildRunMetadata(engineFuel, runId),
      important_run_inputs: buildImportantRunInputs({
        body: { ...body, response: rawResponse },
        topic,
        vectorInfo,
        modelSignals,
        rawResponse,
      }),
      engine_fuel: engineFuel,
      delivered_response: buildDeliveredResponse(
        replyBundle.reply,
        replyBundle.nextMode,
        nextDeliveredProbe,
      ),
      learning_space: learningSpace,
    };

    const runResultJson = JSON.parse(JSON.stringify(result));
    const attemptJson = JSON.parse(JSON.stringify(judgedAttempt));
    const updatedPersistedTopic =
      updatedTopics.find((t) => t.id === topic.id) ?? topic;
    const embeddingFields = getEmbeddingPersistenceFields(updatedPersistedTopic);

    const topicJson = JSON.parse(
      JSON.stringify({
        ...(topic.topic_json ?? {}),
        topic_id: topic.id,
        topic_label: topicLabel,
        next_step: nextProbePlan.text_plan.instructional_goal ?? topic.nextStep,
        previous_probe_id: body.probeId,
        judged_attempt: judgedAttempt,
        updated_topic_metrics: updatedTopicMetrics,
        next_probe_plan: nextProbePlan,
        next_delivered_probe: nextDeliveredProbe,
        learning_space_topic:
          learningSpace.topics?.find((t) => t.topic_id === topic.id) ?? null,

        topic_position: updatedPersistedTopic.position,
        semantic_position: updatedPersistedTopic.semanticPosition ?? null,
        semantic_position_method:
          updatedPersistedTopic.semanticPositionMethod ?? null,
        semantic_position_updated_at:
          updatedPersistedTopic.semanticPositionUpdatedAt ?? null,

        topic_label_embedding_centroid: embeddingFields.topicLabelEmbeddingCentroid,
        topic_label_embedding_count: embeddingFields.topicLabelEmbeddingCount,
        topic_label_embedding_model: embeddingFields.topicLabelEmbeddingModel,
        topic_label_embedding_updated_at:
          embeddingFields.topicLabelEmbeddingUpdatedAt,

        topic_message_embedding_centroid:
          embeddingFields.topicMessageEmbeddingCentroid,
        topic_message_embedding_count: embeddingFields.topicMessageEmbeddingCount,
        topic_message_embedding_model: embeddingFields.topicMessageEmbeddingModel,
        topic_message_embedding_updated_at:
          embeddingFields.topicMessageEmbeddingUpdatedAt,
      }),
    );

    const sceneUpdate = buildSceneUpdate(topic.id, learningSpace);

    await insertRun({
      id: runId,
      runType: "probe_submit",
      userMessage: rawResponse,
      sourceMessageId: result.important_run_inputs.user_message.message_id,
      targetTopicId: topic.id,
      modeSelected: decision.mode_selected,
      activeDiagnosis: decision.active_diagnosis,
      replyText: replyBundle.reply,
      suggestedAction: replyBundle.suggestedAction,
      runResultJson,
    });

    await insertAttempt({
      id: judgedAttempt.attempt_id,
      runId,
      probeId: judgedAttempt.probe_id,
      topicId: judgedAttempt.topic_id,
      responseText:
        typeof judgedAttempt.raw_response.value === "string"
          ? judgedAttempt.raw_response.value
          : null,
      attemptJson,
    });

    await upsertTopicState({
      topicId: topic.id,
      lastRunId: runId,
      topicLabel,
      confusion: updatedTopicMetrics.confusion ?? null,
      insight: updatedTopicMetrics.insight ?? null,
      learningScore: updatedPersistedTopic.learningScore ?? null,
      diagnosis: decision.active_diagnosis,
      nextStep: nextProbePlan.text_plan.instructional_goal ?? topic.nextStep,
      topicJson,
      topicPosition: updatedPersistedTopic.position,
      semanticPosition: updatedPersistedTopic.semanticPosition ?? null,
      semanticPositionMethod: updatedPersistedTopic.semanticPositionMethod ?? null,
      semanticPositionUpdatedAt:
        updatedPersistedTopic.semanticPositionUpdatedAt ?? null,
      ...embeddingFields,
    });

    const response: ProbeSubmitRouteResponse = {
      result,
      scene_update: sceneUpdate,
      continue_probe_loop: nextDeliveredProbe !== null,
      next_probe: nextDeliveredProbe,
      updated_topic_metrics: {
        topicId: body.topicId,
        confusion: updatedTopicMetrics.confusion,
        insight: updatedTopicMetrics.insight,
        learningScore: updatedTopicMetrics.learningScore,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/probe/submit failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process probe submission.",
      },
      { status: 500 },
    );
  }
}