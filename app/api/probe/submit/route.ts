import { NextRequest, NextResponse } from "next/server";
import { mockTopics } from "@/lib/mock-topics";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { insertAttempt, insertRun, upsertTopicState } from "@/lib/persistence/myway";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type {
  DeliveredProbe,
  DeliveredResponse,
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
  type ProbeAttemptPayload,
  scoreResponse,
} from "@/lib/runtime/attempt-judging";
import {
  buildNextProbePlan,
  buildNotApplicableProbePlan,
  buildResponseBundle,
} from "@/lib/runtime/probe-runtime";
import { buildRecentChatHistory } from "@/lib/runtime/chat-history";
import { scoreConfusionInsight } from "@/lib/providers/confusion-insight";
import { isPosition, normalizeDiagnosis, nowIso } from "@/lib/runtime/shared";
import type { RouteTopic } from "@/lib/runtime/topic-resolution";

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

function buildSeededTopicFromProbe(body: ProbeAttemptPayload): RouteTopic {
  const baseMock = mockTopics[0];
  const safeTopicName = body.topicName?.trim() || "New Topic";

  return {
    ...baseMock,
    id: body.topicId || makeId("topic"),
    name: safeTopicName,
    diagnosis: "representation_gap",
    nextStep:
      body.prompt?.trim() ||
      `Explain ${safeTopicName.toLowerCase()} more concretely.`,
    confusion: 0.68,
    insight: 0.28,
    learningScore: 0.16,
    position: [0, 0, 0],
    scale: baseMock.scale,
  };
}

async function loadRouteTopics(body: ProbeAttemptPayload): Promise<RouteTopic[]> {
  const rows = await getLatestTopicState();

  if (!rows.length) {
    return [buildSeededTopicFromProbe(body)];
  }

  return rows.map((row, index) => {
    const fallback =
      mockTopics.find((topic) => topic.id === row.topic_id) ??
      mockTopics[index % Math.max(mockTopics.length, 1)];

    const topicJson =
      row.topic_json && typeof row.topic_json === "object" ? row.topic_json : {};

    const learningSpaceTopic =
      "learning_space_topic" in topicJson &&
      topicJson.learning_space_topic &&
      typeof topicJson.learning_space_topic === "object"
        ? (topicJson.learning_space_topic as Record<string, unknown>)
        : null;

    const storedPosition = learningSpaceTopic?.position;
    const storedNextStep =
      typeof topicJson.next_step === "string"
        ? topicJson.next_step
        : typeof row.next_step === "string" && row.next_step.trim().length > 0
          ? row.next_step
          : fallback?.nextStep ?? "Continue learning";

    return {
      ...(fallback ?? mockTopics[0]),
      id: row.topic_id,
      name: row.topic_name,
      confusion: Math.max(0, Math.min(1, row.confusion ?? fallback?.confusion ?? 0.5)),
      insight: Math.max(0, Math.min(1, row.insight ?? fallback?.insight ?? 0.5)),
      learningScore: Math.max(
        0,
        Math.min(1, row.learning_score ?? fallback?.learningScore ?? 0.5)
      ),
      position: isPosition(storedPosition)
        ? storedPosition
        : (fallback?.position ?? [0, 0, 0]),
      nextStep: storedNextStep,
      diagnosis:
        normalizeDiagnosis(row.diagnosis) ??
        normalizeDiagnosis(
          (fallback as { diagnosis?: unknown } | undefined)?.diagnosis
        ) ??
        "representation_gap",
    };
  });
}

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

function buildImportantRunInputs(args: {
  body: ProbeAttemptPayload;
  topic: RouteTopic;
  vectorInfo: VectorInfo;
  modelSignals: ModelSignals;
  rawResponse: string;
}): ImportantRunInputs {
  const { body, topic, vectorInfo, modelSignals, rawResponse } = args;

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
          body.deliveryContext?.context_framing ?? `Probe response for ${topic.name}.`,
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
  plan: ReturnType<typeof buildNextProbePlan>
): DeliveredProbe {
  return {
    probe_id: plan.probe_id,
    target_topic_id: plan.target_topic_id,
    target_diagnosis: plan.target_diagnosis,
    intent: plan.intent,
    probe_type: plan.probe_type,
    renderer_type: "text_renderer",
    generator: "chatgpt",
    modality: "text",
    title:
      plan.probe_type === "apply_transfer"
        ? "Apply the idea in a new situation"
        : "Explain the idea more concretely",
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
  nextProbe: DeliveredProbe | null
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
  return updatedTopics.map((topic) => ({
    topic_id: topic.id,
    topic_name: topic.name,
    topic_confusion_average: topic.confusion,
    topic_insight_average: topic.insight,
    topic_learning_score: topic.learningScore,
    topic_learning_velocity: 0,
    topic_novelty_score: 0.5,
    topic_message_count: 1,
    topic_difficulty: 0.5,
    topic_decay_rate: 0.05,
    topic_link_threshold: 0.5,
    topic_last_update: nowIso(),
    topic_centroid: topic.position as [number, number, number],
  }));
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

  const baseConfidence =
    scoring.classification === "success"
      ? 0.82
      : scoring.classification === "near_miss"
        ? 0.72
        : 0.64;

  const confusion = modelSignals.model_confusion;
  const insight = modelSignals.model_insight;

  const readinessSignal =
    typeof insight === "number"
      ? Math.max(
          0,
          Math.min(1, scoring.correctnessEstimate * 0.65 + insight * 0.35)
        )
      : scoring.correctnessEstimate;

  const evidenceQualitySignal =
    typeof confusion === "number" && typeof insight === "number"
      ? Math.max(
          0,
          Math.min(
            1,
            scoring.explanationQuality * 0.65 + insight * 0.25 - confusion * 0.15
          )
        )
      : scoring.explanationQuality;

  const decisionReasons = [
    "This run is directly downstream of a delivered probe.",
    `The judged attempt classification was ${scoring.classification}.`,
    replyBundle.whyThisNextStep,
  ];

  if (typeof confusion === "number") {
    decisionReasons.push(
      `Confusion signal for this attempt-like turn was ${confusion.toFixed(2)}.`
    );
  }

  if (typeof insight === "number") {
    decisionReasons.push(
      `Insight signal for this attempt-like turn was ${insight.toFixed(2)}.`
    );
  }

  const decision: InterventionModeDecision = {
    mode_selected: continueWithProbe ? "probe" : "clarify",
    target_topic_id: topic.id,
    active_diagnosis: replyBundle.activeDiagnosis,
    primary_block: topic.nextStep,
    decision_confidence:
      typeof confusion === "number" || typeof insight === "number"
        ? Math.max(
            0,
            Math.min(
              0.95,
              baseConfidence +
                (typeof insight === "number" ? insight * 0.06 : 0) -
                (typeof confusion === "number" ? confusion * 0.04 : 0)
            )
          )
        : baseConfidence,
    decision_reasons: decisionReasons,
    clarify_score: continueWithProbe ? 0.42 : 0.76,
    probe_score: continueWithProbe ? 0.78 : 0.44,
    signal_summary: {
      raw_response_signal: bodyResponseSignal(scoring),
      evidence_quality_signal: evidenceQualitySignal,
      active_problem_signal: 0.72,
      readiness_signal: readinessSignal,
      history_signal: 0.75,
    },
  };

  return decision;
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
    engine_version: "runtime-v1",
    previous_run_id: null,
    topic_count: engineFuel.topics.length,
    cluster_count: engineFuel.clusters.length,
    linked_pair_count: engineFuel.linked_pairs.length,
  };
}

function buildSceneUpdate(
  topicId: string,
  learningSpace: LearningSpace
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
        { status: 400 }
      );
    }

    const routeTopics = await loadRouteTopics(body);

    if (!routeTopics.length) {
      return NextResponse.json(
        { error: "No topics are available." },
        { status: 500 }
      );
    }

    const topic = routeTopics.find((t) => t.id === body.topicId) ?? routeTopics[0];

    if (!topic) {
      return NextResponse.json(
        { error: "Unable to resolve a topic for this probe submission." },
        { status: 500 }
      );
    }

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
          : "Unknown confusion/insight scoring error"
      );
    }

    const topicName = body.topicName || topic.name;
    const scoring = scoreResponse(rawResponse);
    const vectorInfo = buildVectorInfo(topic);

    const replyBundle = buildResponseBundle({
      topicName,
      classification: scoring.classification,
      explanationQuality: scoring.explanationQuality,
      insight: scoring.insight,
    });

    const updatedTopicMetrics = buildTopicMetricUpdate(body.topicId, scoring);
    const updatedTopics = routeTopics.map((t) =>
      applyMetricUpdate(t, updatedTopicMetrics)
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

    const learningSpace = buildLearningSpace(updatedTopics) as LearningSpace;
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
        nextDeliveredProbe
      ),
      learning_space: learningSpace,
    };

    const runResultJson = JSON.parse(JSON.stringify(result));
    const attemptJson = JSON.parse(JSON.stringify(judgedAttempt));
    const topicJson = JSON.parse(
      JSON.stringify({
        topic_id: topic.id,
        topic_name: topicName,
        next_step: nextProbePlan.text_plan.instructional_goal ?? topic.nextStep,
        previous_probe_id: body.probeId,
        judged_attempt: judgedAttempt,
        updated_topic_metrics: updatedTopicMetrics,
        next_probe_plan: nextProbePlan,
        next_delivered_probe: nextDeliveredProbe,
        learning_space_topic:
          learningSpace.topics?.find((t) => t.topic_id === topic.id) ?? null,
      })
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
      topicName: topicName,
      confusion: updatedTopicMetrics.confusion ?? null,
      insight: updatedTopicMetrics.insight ?? null,
      learningScore:
        updatedTopics.find((t) => t.id === topic.id)?.learningScore ?? null,
      diagnosis: decision.active_diagnosis,
      nextStep: nextProbePlan.text_plan.instructional_goal ?? topic.nextStep,
      topicJson,
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
      { error: "Failed to process probe submission." },
      { status: 500 }
    );
  }
}