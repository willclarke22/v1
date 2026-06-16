import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import { buildMockThreeModelTurn } from "@/lib/engine/providers/mock-model-artifacts";
import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import { loadRouteTopics } from "@/lib/topic-routing/route-topics";
import type {
  DeliveredProbe,
  LearningSpace,
  MessageRouteResponse,
  MyWayRunResult,
} from "@/types/contracts";

function flagEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function shouldUseMockThreeModelMessageRoute() {
  return flagEnabled(process.env.MYWAY_USE_MOCK_3MODEL);
}

function getRouteTopicLabel(topic: RouteTopic | null | undefined) {
  return topic?.topic_label?.trim() || "Spanish se";
}

function getTopicId(topic: RouteTopic | null | undefined) {
  return topic?.id?.trim() || "topic_spanish_se";
}

function getTopicPosition(topic: RouteTopic | null | undefined) {
  return Array.isArray(topic?.position) ? topic.position : [0, 0, 0];
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function findMockTargetTopic(topics: RouteTopic[]) {
  return (
    topics.find((topic) => topic.topic_label?.toLowerCase() === "spanish se") ??
    topics[0] ??
    null
  );
}

function buildMockRouteTopics(targetTopic: RouteTopic | null): RouteTopic[] {
  if (targetTopic) return [targetTopic];

  return [
    {
      id: "topic_spanish_se",
      topic_label: "Spanish se",
      diagnosis: "discrimination_gap",
      nextStep: "Check which job se is doing in a sentence pattern.",
      confusion: 0.62,
      insight: 0.38,
      learningScore: 0.42,
      position: [0, 0, 0],
      topic_json: {},
    } as unknown as RouteTopic,
  ];
}

function buildDeliveredProbeFromMockTurn(args: {
  topic: RouteTopic | null;
  turn: ReturnType<typeof buildMockThreeModelTurn>;
}): DeliveredProbe {
  const { topic, turn } = args;
  const targetTopicId = getTopicId(topic);
  const targetTopicLabel = getRouteTopicLabel(topic);
  const preview = turn.delivered_probe_preview;

  return {
    probe_id: preview.id,
    target_topic_id: targetTopicId,
    target_topic_label: targetTopicLabel,
    title: preview.title,
    instructions: preview.instruction,
    status: "available",
    intent: "diagnostic",
    probe_type: preview.probeType,
    expected_response_type: preview.expectedResponseType,
    renderer_modality: "interactive",
    renderer_generator: "custom",
    actual_tone: "encouraging",
    actual_pacing: "normal",
    actual_language_style: "plain",
    actual_context_framing: preview.helperText,
    probe_contract_snapshot: {
      ...preview.probeContractSnapshot,
      target_topic_id: targetTopicId,
      target_topic_label: targetTopicLabel,
    },
    stimulus_id: `stimulus-${preview.id}`,
    payload_snapshot: {
      mock_3model: true,
      probe_contract_snapshot: preview.probeContractSnapshot,
      engine_renderable_probe: preview.engineRenderableProbe,
    },
  } as unknown as DeliveredProbe;
}

function buildMockEngineFuel(args: {
  topic: RouteTopic | null;
  turn: ReturnType<typeof buildMockThreeModelTurn>;
}) {
  const { topic, turn } = args;
  const targetTopicId = getTopicId(topic);
  const targetTopicLabel = getRouteTopicLabel(topic);

  return {
    schema_version: "mock_3model_route_adapter_v0",
    source: "mock_3model_message_route",
    topics: [
      {
        topic_id: targetTopicId,
        topic_label: targetTopicLabel,
        topic_confusion_average: getNumber(
          (topic as { confusion?: unknown } | null)?.confusion,
          0.62,
        ),
        topic_insight_average: getNumber(
          (topic as { insight?: unknown } | null)?.insight,
          0.38,
        ),
        topic_learning_score: getNumber(
          (topic as { learningScore?: unknown } | null)?.learningScore,
          0.42,
        ),
        topic_centroid: getTopicPosition(topic),
      },
    ],
    intervention_mode_decision: {
      mode_selected: "probe",
      target_topic_id: targetTopicId,
      active_diagnosis: turn.diagnosis_output.diagnosis,
      primary_block: "The learner may be treating se as one fixed meaning.",
      decision_confidence: turn.diagnosis_route.confidence,
      decision_reasons: [
        "Mock 3-model path is enabled with MYWAY_USE_MOCK_3MODEL.",
        `Diagnosis model requested: ${turn.diagnosis_route.next_action}.`,
        "Probe Contract Model produced a renderable single-choice probe.",
      ],
      clarify_score: 0.18,
      probe_score: 0.82,
      signal_summary: {
        raw_response_signal: 0.66,
        evidence_quality_signal: 0.74,
        active_problem_signal: 0.76,
        readiness_signal: 0.8,
        history_signal: 0.32,
      },
    },
    probe_plan: {
      status: "applicable",
      probe_id: turn.delivered_probe_preview.id,
      target_topic_id: targetTopicId,
      target_diagnosis: turn.diagnosis_output.diagnosis,
      intent: "diagnostic",
      probe_type: turn.probe_contract_output.probe_type,
      expected_response_type: turn.probe_contract_output.expected_attempt_type,
      text_plan: {
        instructional_goal: "Check which job se is doing in a sentence pattern.",
      },
      probe_contract_snapshot: {
        ...turn.delivered_probe_preview.probeContractSnapshot,
        target_topic_id: targetTopicId,
        target_topic_label: targetTopicLabel,
      },
    },
    mock_3model: {
      scenario_id: turn.scenario_id,
      model_artifact_paths: turn.model_artifact_paths,
      diagnosis_route: turn.diagnosis_route,
      attempt_route: turn.attempt_route,
    },
  };
}

export async function buildMockThreeModelMessageRouteResponse(args: {
  message: string;
}): Promise<MessageRouteResponse> {
  const routeTopics = await loadRouteTopics();
  const targetTopic = findMockTargetTopic(routeTopics);
  const mockTopics = buildMockRouteTopics(targetTopic);
  const turn = buildMockThreeModelTurn();

  const learningSpace = buildLearningSpace(mockTopics) as unknown as LearningSpace;
  const targetTopicId = getTopicId(targetTopic);
  const deliveredProbe = buildDeliveredProbeFromMockTurn({
    topic: targetTopic,
    turn,
  });

  const result: MyWayRunResult = {
    run_metadata: {
      run_id: "mock-3model-message-route",
      run_type: "message",
      created_at: new Date().toISOString(),
      source: "mock_3model_message_route",
      debug: {
        enabled_by_env: "MYWAY_USE_MOCK_3MODEL",
        scenario_id: turn.scenario_id,
      },
    } as unknown as MyWayRunResult["run_metadata"],
    important_run_inputs: {
      user_message: {
        message_id: null,
        timestamp: new Date().toISOString(),
        content: args.message,
      },
      model_signals: {
        model_confusion: null,
        model_insight: null,
        model_version: "mock_3model_v0",
        inference_mode: "mock",
        latency_ms: null,
        status: "ok",
        error_message: null,
      },
      current_interaction_context: {
        run_kind: "initial_question",
        is_response_to_delivered_probe: false,
        prior_mode_selected: null,
        prior_probe_was_applicable: null,
        prior_probe_id: null,
        prior_mode_outcome_available: null,
      },
      new_attempt: {
        status: "absent",
      },
      vector_info: {
        query_text: args.message,
        top_k_similarity_scores: [0.86],
        selected_topic_id: targetTopicId,
        selected_topic_label: getRouteTopicLabel(targetTopic),
        source: "mock_3model_message_route",
      },
      uploaded_content: [],
    } as unknown as MyWayRunResult["important_run_inputs"],
    engine_fuel: buildMockEngineFuel({
      topic: targetTopic,
      turn,
    }) as unknown as MyWayRunResult["engine_fuel"],
    delivered_response: {
      learner_message: {
        text: "Mock 3-model path is active. I'm using the Diagnosis Model output to generate a focused probe from the Probe Contract Model.",
        tone: "encouraging",
        mode: "probe",
      },
      delivered_probe: deliveredProbe,
    },
    learning_space: learningSpace,
  };

  return {
    result,
    scene_update: {
      target_topic_id: targetTopicId,
      learning_space: learningSpace,
      source: "mock_3model_message_route",
    },
    intervention: {
      mode_selected: "probe",
      target_topic_id: targetTopicId,
      active_diagnosis: turn.diagnosis_output.diagnosis,
      probe_available: "available",
      status_label: "Mock 3-model probe",
      suggested_action: "Open the generated probe",
    },
    updated_topic_metrics: {
      topicId: targetTopicId,
      confusion: getNumber(
        (targetTopic as { confusion?: unknown } | null)?.confusion,
        0.62,
      ),
      insight: getNumber(
        (targetTopic as { insight?: unknown } | null)?.insight,
        0.38,
      ),
      learningScore: getNumber(
        (targetTopic as { learningScore?: unknown } | null)?.learningScore,
        0.42,
      ),
    },
    mock_3model_debug: {
      enabled: true,
      scenario_id: turn.scenario_id,
      model_artifact_paths: turn.model_artifact_paths,
      renderable_probe: turn.renderable_probe,
      diagnosis_output: turn.diagnosis_output,
      probe_contract_output: turn.probe_contract_output,
    },
  } as unknown as MessageRouteResponse;
}

