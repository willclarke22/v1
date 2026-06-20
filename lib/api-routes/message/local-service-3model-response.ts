import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import { runDiagnosis } from "@/lib/engine/orchestration/run-diagnosis";
import { runProbeContract } from "@/lib/engine/orchestration/run-probe-contract";
import { buildEngineProviderSet } from "@/lib/engine/providers";
import { adaptProbeContractForRenderer } from "@/lib/engine/renderers";
import { insertRun, upsertTopicState } from "@/lib/persistence/myway";
import {
  scoreConfusionInsight,
  type ConfusionInsightSignals,
  type ConfusionInsightStructuredInput,
} from "@/lib/model-adapters/confusion-insight/confusion-insight-client";
import type {
  DiagnosisModelInput,
  ProbeContractModelInput,
  ProbeContractModelOutput,
} from "@/lib/engine/schemas";
import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import { loadRouteTopics } from "@/lib/topic-routing/route-topics";
import {
  resolveForegroundTopicForMessage,
  type ForegroundTopicResolution,
} from "@/lib/topic-routing/foreground-topic-resolver";
import type {
  DeliveredProbe,
  LearningSpace,
  MessageRouteResponse,
  MyWayRunResult,
} from "@/types/contracts";

type PersistenceRunJson = Parameters<typeof insertRun>[0]["runResultJson"];
type PersistenceTopicJson = Parameters<typeof upsertTopicState>[0]["topicJson"];

function toPersistenceJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function persistenceErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown persistence error.";
}

function flagEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

const DEFAULT_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS = 1_200;
const MIN_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS = 250;
const MAX_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS = 10_000;

function shouldUseForegroundConfusionInsight() {
  return flagEnabled(process.env.MYWAY_USE_CONFUSION_INSIGHT_IN_FOREGROUND);
}

function getForegroundConfusionInsightTimeoutMs() {
  const raw = process.env.MYWAY_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS;
  }

  return Math.min(
    Math.max(Math.round(parsed), MIN_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS),
    MAX_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS,
  );
}

function emptyForegroundConfusionInsightSignals(args: {
  status: ConfusionInsightSignals["status"];
  errorMessage: string | null;
}): ConfusionInsightSignals {
  return {
    model_confusion: null,
    model_insight: null,
    model_version: null,
    inference_mode: null,
    latency_ms: null,
    status: args.status,
    error_message: args.errorMessage,
  };
}

function getOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function topicTransitionTypeFromResolution(
  kind: ForegroundTopicResolution["resolution_kind"],
): ConfusionInsightStructuredInput["topic_transition_type"] {
  if (
    kind === "topic_labeler_seeded_topic" ||
    kind === "deterministic_label_seeded_topic" ||
    kind === "empty_message_seeded_topic"
  ) {
    return "new_topic";
  }

  if (
    kind === "message_lexical_topic_match" ||
    kind === "topic_labeler_existing_topic" ||
    kind === "deterministic_label_existing_topic"
  ) {
    return "nearby_topic";
  }

  return "same_topic";
}

async function scoreForegroundMessageConfusionInsight(args: {
  message: string;
  targetTopic: RouteTopic;
  topicResolution: ForegroundTopicResolution;
}): Promise<ConfusionInsightSignals> {
  if (!shouldUseForegroundConfusionInsight()) {
    return emptyForegroundConfusionInsightSignals({
      status: "unavailable",
      errorMessage:
        "Foreground confusion/insight is disabled. Set MYWAY_USE_CONFUSION_INSIGHT_IN_FOREGROUND=1 to enable it.",
    });
  }

  return scoreConfusionInsight({
    timeoutMs: getForegroundConfusionInsightTimeoutMs(),
    input: {
      input_type: "message",
      current_attempt_type: null,
      current_evidence: args.message,

      previous_active_topic_label: null,
      target_topic_label: args.targetTopic.topic_label,
      topic_transition_type: topicTransitionTypeFromResolution(
        args.topicResolution.resolution_kind,
      ),
      topic_similarity: args.topicResolution.match_confidence,

      previous_mode: "no_previous",
      is_response_to_clarify: false,
      is_response_to_probe: false,

      target_topic_recent_events: [],

      most_related_topic_label: null,
      most_related_topic_similarity: null,
      most_related_topic_similarity_threshold: 0.65,
      most_related_topic_recent_events: [],

      target_topic_confusion_average: getOptionalNumber(
        (args.targetTopic as { confusion?: unknown }).confusion,
      ),
      target_topic_insight_average: getOptionalNumber(
        (args.targetTopic as { insight?: unknown }).insight,
      ),

      most_related_topic_confusion_average: null,
      most_related_topic_insight_average: null,
    },
  });
}

export function shouldUseLocalServiceThreeModelMessageRoute() {
  return flagEnabled(process.env.MYWAY_USE_LOCAL_SERVICE_3MODEL);
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getTopicPosition(topic: RouteTopic | null | undefined) {
  return Array.isArray(topic?.position) ? topic.position : [0, 0, 0];
}

function getProbeTitle(args: {
  topicLabel: string;
  probeContract: ProbeContractModelOutput;
}) {
  const task = args.probeContract.prompt.task?.trim();

  if (task && task.length <= 72) {
    return task;
  }

  return `Check ${args.topicLabel}`;
}

function buildRendererAdapterSnapshot(input: {
  ok: boolean;
  warnings: string[];
  blocking_reasons: string[];
}) {
  return {
    ok: input.ok,
    warnings: input.warnings,
    blocking_reasons: input.blocking_reasons,
  };
}

function buildProbeContractSnapshot(args: {
  targetTopicId: string;
  targetTopicLabel: string;
  diagnosisRun: Awaited<ReturnType<typeof runDiagnosis>>;
  probeContractRun: Awaited<ReturnType<typeof runProbeContract>>;
  rendererAdapter: ReturnType<typeof adaptProbeContractForRenderer>;
  topicResolution: ForegroundTopicResolution;
  confusionInsightSignals: ConfusionInsightSignals;
}) {
  return {
    schema_version: "local_service_probe_contract_snapshot_v1",
    source: "local_service_3model_message_route",
    target_topic_id: args.targetTopicId,
    target_topic_label: args.targetTopicLabel,

    foreground_topic_resolution: {
      resolution_kind: args.topicResolution.resolution_kind,
      resolved_label: args.topicResolution.resolved_label,
      match_confidence: args.topicResolution.match_confidence,
      authority_source: args.topicResolution.authority_source,
      warnings: args.topicResolution.warnings,
      rejected_request_topic: args.topicResolution.rejected_request_topic ?? null,
      topic_labeler_debug: args.topicResolution.topic_labeler_debug ?? null,
    },

    confusion_insight_signals: args.confusionInsightSignals,

    diagnosis_output: args.diagnosisRun.output,
    diagnosis_provider_meta: args.diagnosisRun.provider_result.meta,
    diagnosis_validation: args.diagnosisRun.validation,

    probe_contract_output: args.probeContractRun.output,
    probe_contract_provider_meta: args.probeContractRun.provider_result.meta,
    probe_contract_validation: args.probeContractRun.validation,

    engine_renderable_probe: args.rendererAdapter.renderable_probe ?? null,
    renderer_adapter: buildRendererAdapterSnapshot(args.rendererAdapter),
  };
}

function buildDeliveredProbeFromLocalService(args: {
  targetTopicId: string;
  targetTopicLabel: string;
  probeContract: ProbeContractModelOutput;
  probeContractSnapshot: Record<string, unknown>;
}): DeliveredProbe {
  const prompt = args.probeContract.prompt;
  const probeId = `local-service-probe-${args.targetTopicId}-${Date.now()}`;

  return {
    probe_id: probeId,
    target_topic_id: args.targetTopicId,
    target_topic_label: args.targetTopicLabel,
    title: getProbeTitle({
      topicLabel: args.targetTopicLabel,
      probeContract: args.probeContract,
    }),
    instructions: prompt.full_prompt || prompt.task,
    status: "available",
    intent: "diagnostic",
    probe_type: args.probeContract.probe_type,
    expected_response_type: args.probeContract.expected_attempt_type,
    renderer_modality: "interactive",
    renderer_generator: "custom",
    actual_tone: "encouraging",
    actual_pacing: "normal",
    actual_language_style: "plain",
    actual_context_framing:
      prompt.reshaping_explanation ||
      "MyWay is using a local Probe Contract Model output.",
    probe_contract_snapshot: args.probeContractSnapshot,
    stimulus_id: `stimulus-${probeId}`,
    payload_snapshot: {
      local_service_3model: true,
      probe_contract_snapshot: args.probeContractSnapshot,
      engine_renderable_probe:
        args.probeContractSnapshot.engine_renderable_probe ?? null,
      renderer_adapter: args.probeContractSnapshot.renderer_adapter ?? null,
    },
  } as unknown as DeliveredProbe;
}

function buildLocalServiceEngineFuel(args: {
  topic: RouteTopic;
  targetTopicId: string;
  targetTopicLabel: string;
  diagnosisRun: Awaited<ReturnType<typeof runDiagnosis>>;
  probeContractRun: Awaited<ReturnType<typeof runProbeContract>>;
  probeContractSnapshot: Record<string, unknown>;
  topicResolution: ForegroundTopicResolution;
  confusionInsightSignals: ConfusionInsightSignals;
}) {
  return {
    schema_version: "local_service_3model_route_adapter_v0",
    source: "local_service_3model_message_route",
    topics: [
      {
        topic_id: args.targetTopicId,
        topic_label: args.targetTopicLabel,
        topic_confusion_average:
          args.confusionInsightSignals.model_confusion ??
          getNumber((args.topic as { confusion?: unknown }).confusion, 0.62),
        topic_insight_average:
          args.confusionInsightSignals.model_insight ??
          getNumber((args.topic as { insight?: unknown }).insight, 0.38),
        topic_learning_score: getNumber(
          (args.topic as { learningScore?: unknown }).learningScore,
          0.42,
        ),
        topic_centroid: getTopicPosition(args.topic),
      },
    ],
    intervention_mode_decision: {
      mode_selected: "probe",
      target_topic_id: args.targetTopicId,
      active_diagnosis: args.diagnosisRun.output.diagnosis,
      primary_block:
        args.probeContractRun.output.prompt.root_problem_explanation ||
        "The local Diagnosis Model found a learning signal that can be checked with a probe.",
      decision_confidence: args.diagnosisRun.output.next_action_confidence,
      decision_reasons: [
        "Local service 3-model route is enabled with MYWAY_USE_LOCAL_SERVICE_3MODEL.",
        "Foreground topic resolver ran without starting embedding-backed semantic services.",
        `Topic resolution: ${args.topicResolution.resolution_kind} (${args.topicResolution.resolved_label}).`,
        `Diagnosis Model requested: ${args.diagnosisRun.output.next_action}.`,
        `Probe Contract Model returned: ${args.probeContractRun.output.probe_type}.`,
        `Confusion/insight status: ${args.confusionInsightSignals.status}.`,
      ],
      clarify_score:
        args.diagnosisRun.output.next_action === "ask_clarifying_question"
          ? args.diagnosisRun.output.next_action_confidence
          : 0.18,
      probe_score:
        args.diagnosisRun.output.next_action === "generate_probe_contract"
          ? args.diagnosisRun.output.next_action_confidence
          : 0.72,
      signal_summary: {
        raw_response_signal: args.diagnosisRun.output.diagnosis_confidence,
        evidence_quality_signal: args.probeContractRun.output.confidence,
        active_problem_signal: args.diagnosisRun.output.next_action_confidence,
        readiness_signal: args.probeContractRun.usable ? 0.8 : 0.35,
        history_signal: args.topicResolution.match_confidence,
        model_confusion_signal: args.confusionInsightSignals.model_confusion,
        model_insight_signal: args.confusionInsightSignals.model_insight,
      },
    },
    foreground_confusion_insight: args.confusionInsightSignals,
    probe_plan: {
      status: "applicable",
      probe_id: `local-service-probe-${args.targetTopicId}`,
      target_topic_id: args.targetTopicId,
      target_diagnosis: args.diagnosisRun.output.diagnosis,
      intent: "diagnostic",
      probe_type: args.probeContractRun.output.probe_type,
      expected_response_type: args.probeContractRun.output.expected_attempt_type,
      text_plan: {
        instructional_goal: args.probeContractRun.output.prompt.task,
      },
      probe_contract_snapshot: args.probeContractSnapshot,
    },
    local_service_3model: {
      topic_resolution: {
        resolution_kind: args.topicResolution.resolution_kind,
        resolved_label: args.topicResolution.resolved_label,
        match_confidence: args.topicResolution.match_confidence,
        authority_source: args.topicResolution.authority_source,
        warnings: args.topicResolution.warnings,
        rejected_request_topic: args.topicResolution.rejected_request_topic ?? null,
      },
      diagnosis_provider_meta: args.diagnosisRun.provider_result.meta,
      probe_contract_provider_meta: args.probeContractRun.provider_result.meta,
      diagnosis_validation: args.diagnosisRun.validation,
      probe_contract_validation: args.probeContractRun.validation,
    },
  };
}


async function persistLocalServiceMessageRoute(args: {
  runId: string;
  message: string;
  result: MyWayRunResult;
  targetTopic: RouteTopic;
  targetTopicId: string;
  targetTopicLabel: string;
  deliveredProbe: DeliveredProbe;
  probeContractSnapshot: Record<string, unknown>;
  diagnosisRun: Awaited<ReturnType<typeof runDiagnosis>>;
  confusionInsightSignals: ConfusionInsightSignals;
  replyText: string;
}) {
  const now = new Date().toISOString();
  const topicPosition = getTopicPosition(args.targetTopic);

  const topicJson = toPersistenceJson<PersistenceTopicJson>({
    ...(args.targetTopic as unknown as Record<string, unknown>),

    id: args.targetTopicId,
    topic_id: args.targetTopicId,
    topic_label: args.targetTopicLabel,
    label: args.targetTopicLabel,

    confusion:
      args.confusionInsightSignals.model_confusion ??
      getNumber((args.targetTopic as { confusion?: unknown }).confusion, 0.62),
    insight:
      args.confusionInsightSignals.model_insight ??
      getNumber((args.targetTopic as { insight?: unknown }).insight, 0.38),
    learningScore: getNumber(
      (args.targetTopic as { learningScore?: unknown }).learningScore,
      0.42,
    ),

    hasAvailableProbe: true,
    latest_delivered_probe: args.deliveredProbe,
    current_probe_contract_snapshot: args.probeContractSnapshot,
    foreground_persistence: {
      source: "local_service_3model_message_route",
      persisted_at: now,
      run_id: args.runId,
      embedding_behavior: "foreground_no_embedding_background_later",
    },

    semantic_enrichment_status: {
      status: "skipped_for_fast_model_route",
      reason:
        "Foreground local 3-model route intentionally persisted topic_state without waiting for embeddings.",
      updated_at: now,
    },
    needs_embedding_centroid: true,
    should_schedule_enrichment: true,
    semantic_enrichment_prompt_text: args.message,
    layout_status: "pending_semantic_enrichment",
    embedding_skip_reason: "foreground_local_service_route",
  });

  try {
    await insertRun({
      id: args.runId,
      runType: "message",
      userMessage: args.message,
      targetTopicId: args.targetTopicId,
      modeSelected: "probe",
      activeDiagnosis: args.diagnosisRun.output.diagnosis,
      replyText: args.replyText,
      suggestedAction: "Open the generated probe",
      runResultJson: toPersistenceJson<PersistenceRunJson>(args.result),
    });

    await upsertTopicState({
      topicId: args.targetTopicId,
      lastRunId: args.runId,
      topicLabel: args.targetTopicLabel,
      confusion:
        args.confusionInsightSignals.model_confusion ??
        getNumber((args.targetTopic as { confusion?: unknown }).confusion, 0.62),
      insight:
        args.confusionInsightSignals.model_insight ??
        getNumber((args.targetTopic as { insight?: unknown }).insight, 0.38),
      learningScore: getNumber(
        (args.targetTopic as { learningScore?: unknown }).learningScore,
        0.42,
      ),
      diagnosis: args.diagnosisRun.output.diagnosis,
      nextStep: "Open the generated probe",
      topicJson,
      topicPosition: topicPosition as Parameters<typeof upsertTopicState>[0]["topicPosition"],
    });

    return {
      ok: true,
      run_id: args.runId,
      topic_id: args.targetTopicId,
      topic_label: args.targetTopicLabel,
      wrote_run: true,
      upserted_topic_state: true,
      error_message: null,
    };
  } catch (error) {
    return {
      ok: false,
      run_id: args.runId,
      topic_id: args.targetTopicId,
      topic_label: args.targetTopicLabel,
      wrote_run: false,
      upserted_topic_state: false,
      error_message: persistenceErrorMessage(error),
    };
  }
}

export async function buildLocalServiceThreeModelMessageRouteResponse(args: {
  message: string;
  requestBody?: unknown;
}): Promise<MessageRouteResponse> {
  const providers = buildEngineProviderSet();
  const probeContractProvider = providers.probe_contract;

  if (!probeContractProvider) {
    throw new Error("No probe contract provider is configured.");
  }

  const diagnosisInput: DiagnosisModelInput = {
    schema_version: "diagnosis_model_input_v1",
    input_kind: "user_message",
    user_message: {
      text: args.message,
    },
  };

  /**
   * Foreground latency optimization:
   *
   * Diagnosis only depends on the current user message, so it can run while
   * route topics are loading and the foreground topic resolver/topic-labeler is
   * working. Confusion/insight still waits for topic resolution because its
   * structured input uses target topic label, transition type, and match
   * confidence. Probe Contract still waits for diagnosis + resolved topic.
   */
  const routeTopicsPromise = loadRouteTopics();

  const diagnosisRunPromise = runDiagnosis({
    provider: providers.diagnosis,
    model_input: diagnosisInput,
  });

  const routeTopics = await routeTopicsPromise;

  const topicResolution = await resolveForegroundTopicForMessage({
    message: args.message,
    existingTopics: routeTopics,
    requestBody: args.requestBody,
  });

  const targetTopic = topicResolution.topic;
  const routeTopicsForScene = topicResolution.topicsForScene;
  const targetTopicId = targetTopic.id;
  const targetTopicLabel = targetTopic.topic_label;

  const confusionInsightSignalsPromise = scoreForegroundMessageConfusionInsight({
    message: args.message,
    targetTopic,
    topicResolution,
  });

  const diagnosisRun = await diagnosisRunPromise;

  const probeContractInput: ProbeContractModelInput = {
    schema_version: "probe_contract_model_input_v1",
    target_topic: {
      topic_id: targetTopicId,
      topic_label: targetTopicLabel,
    },
    target_diagnosis: diagnosisRun.output.diagnosis,
    learner_signal: {
      signal_kind: "user_message",
      user_message: args.message,
    },
    personalization_context: {
      bridge_level: "bridge_0",
      language_policy: {
        jargon_level: "none",
      },
    },
  };

  const probeContractRunPromise = runProbeContract({
    provider: probeContractProvider,
    model_input: probeContractInput,
  });

  const [probeContractRun, confusionInsightSignals] = await Promise.all([
    probeContractRunPromise,
    confusionInsightSignalsPromise,
  ]);

  const rendererAdapter = adaptProbeContractForRenderer(probeContractRun.output);

  const probeContractSnapshot = buildProbeContractSnapshot({
    targetTopicId,
    targetTopicLabel,
    diagnosisRun,
    probeContractRun,
    rendererAdapter,
    topicResolution,
    confusionInsightSignals,
  }) as Record<string, unknown>;

  const deliveredProbe = buildDeliveredProbeFromLocalService({
    targetTopicId,
    targetTopicLabel,
    probeContract: probeContractRun.output,
    probeContractSnapshot,
  });

  const learningSpace = buildLearningSpace(routeTopicsForScene) as unknown as LearningSpace;

  const runId = `local-service-message-route-${Date.now()}`;
  const learnerMessageText =
    rendererAdapter.ok && rendererAdapter.renderable_probe
      ? "I found a specific spot to check. Open the probe and answer it in the way that makes the most sense to you."
      : "I found a learning signal, but the generated probe needs a renderer fallback. I am giving the safest available probe view.";

  const result: MyWayRunResult = {
    run_metadata: {
      run_id: runId,
      run_type: "message",
      created_at: new Date().toISOString(),
      source: "local_service_3model_message_route",
      debug: {
        enabled_by_env: "MYWAY_USE_LOCAL_SERVICE_3MODEL",
        topic_resolution_kind: topicResolution.resolution_kind,
      },
    } as unknown as MyWayRunResult["run_metadata"],
    important_run_inputs: {
      user_message: {
        message_id: null,
        timestamp: new Date().toISOString(),
        content: args.message,
      },
      model_signals: confusionInsightSignals,
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
        top_k_similarity_scores: [topicResolution.match_confidence],
        selected_topic_id: targetTopicId,
        selected_topic_label: targetTopicLabel,
        source: "foreground_topic_resolver_no_embedding",
        resolution_kind: topicResolution.resolution_kind,
        authority_source: topicResolution.authority_source,
      },
      uploaded_content: [],
    } as unknown as MyWayRunResult["important_run_inputs"],
    engine_fuel: buildLocalServiceEngineFuel({
      topic: targetTopic,
      targetTopicId,
      targetTopicLabel,
      diagnosisRun,
      probeContractRun,
      probeContractSnapshot,
      topicResolution,
      confusionInsightSignals,
    }) as unknown as MyWayRunResult["engine_fuel"],
    delivered_response: {
      learner_message: {
        text: learnerMessageText,
        tone: "encouraging",
        mode: "probe",
      },
      delivered_probe: deliveredProbe,
    },
    learning_space: learningSpace,
  };

  const persistence = await persistLocalServiceMessageRoute({
    runId,
    message: args.message,
    result,
    targetTopic,
    targetTopicId,
    targetTopicLabel,
    deliveredProbe,
    probeContractSnapshot,
    diagnosisRun,
    confusionInsightSignals,
    replyText: learnerMessageText,
  });

  return {
    result,
    scene_update: {
      target_topic_id: targetTopicId,
      camera_destination_topic_id: targetTopicId,
      arrival_mode: "focus",
      learning_space: learningSpace,
      source: "local_service_3model_message_route",
    },
    intervention: {
      mode_selected: "probe",
      target_topic_id: targetTopicId,
      active_diagnosis: diagnosisRun.output.diagnosis,
      probe_available: "available",
      status_label: "Local 3-model probe",
      suggested_action: "Open the generated probe",
    },
    updated_topic_metrics: {
      topicId: targetTopicId,
      confusion:
        confusionInsightSignals.model_confusion ??
        getNumber(targetTopic.confusion, 0.62),
      insight:
        confusionInsightSignals.model_insight ??
        getNumber(targetTopic.insight, 0.38),
      learningScore: getNumber(targetTopic.learningScore, 0.42),
    },
    persistence_debug: persistence,
    local_service_3model_debug: {
      enabled: true,
      topic_resolution: {
        resolution_kind: topicResolution.resolution_kind,
        resolved_label: topicResolution.resolved_label,
        match_confidence: topicResolution.match_confidence,
        authority_source: topicResolution.authority_source,
        warnings: topicResolution.warnings,
        rejected_request_topic: topicResolution.rejected_request_topic ?? null,
      },
      confusion_insight_signals: confusionInsightSignals,
      persistence,
      diagnosis_output: diagnosisRun.output,
      diagnosis_provider_meta: diagnosisRun.provider_result.meta,
      probe_contract_output: probeContractRun.output,
      probe_contract_provider_meta: probeContractRun.provider_result.meta,
      renderer_adapter: rendererAdapter,
    },
  } as unknown as MessageRouteResponse;
}

