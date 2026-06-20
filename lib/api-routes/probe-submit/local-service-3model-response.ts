import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import { runAttemptEvaluation } from "@/lib/engine/orchestration/run-attempt-evaluation";
import { runDiagnosis } from "@/lib/engine/orchestration/run-diagnosis";
import { runProbeContract } from "@/lib/engine/orchestration/run-probe-contract";
import { buildEngineProviderSet } from "@/lib/engine/providers";
import { adaptProbeContractForRenderer } from "@/lib/engine/renderers";
import { insertAttempt, insertRun, upsertTopicState } from "@/lib/persistence/myway";
import {
  scoreConfusionInsight,
  type ConfusionInsightSignals,
  type ConfusionInsightStructuredInput,
} from "@/lib/model-adapters/confusion-insight/confusion-insight-client";
import type {
  DiagnosisModelInput,
  EvaluatedProbeAttemptSignal,
  ProbeAttemptEvaluatorInput,
  ProbeAttemptType,
  ProbeContractModelInput,
  ProbeContractModelOutput,
  ProbePrompt,
} from "@/lib/engine/schemas";
import {
  buildSeededTopicFromResolvedLabel,
  loadRouteTopics,
  type RouteTopic,
} from "@/lib/topic-routing/route-topics";
import type {
  DeliveredProbe,
  LearningSpace,
  MessageRouteResponse,
  MyWayRunResult,
} from "@/types/contracts";

type PersistenceRunJson = Parameters<typeof insertRun>[0]["runResultJson"];
type PersistenceAttemptJson = Parameters<typeof insertAttempt>[0]["attemptJson"];
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

function confusionInsightInputTypeFromAttempt(
  attemptType: ProbeAttemptType,
): ConfusionInsightStructuredInput["input_type"] {
  if (attemptType === "text") return "text_attempt";
  if (attemptType === "audio_response") return "spoken_attempt";
  if (attemptType === "video_click") return "video_checkpoint_attempt";

  return "interactive_attempt";
}

export function shouldUseLocalServiceThreeModelProbeSubmitRoute() {
  return (
    flagEnabled(process.env.MYWAY_USE_LOCAL_SERVICE_3MODEL_PROBE_SUBMIT) ||
    flagEnabled(process.env.MYWAY_USE_LOCAL_SERVICE_3MODEL)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getString(value: unknown, fallback: string) {
  return asString(value) ?? fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNumber(value: unknown, fallback: number) {
  return asNumber(value) ?? fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  const output: Record<string, string> = {};

  for (const [key, childValue] of Object.entries(record)) {
    if (typeof childValue === "string") {
      output[key] = childValue;
    }
  }

  return output;
}

function normalizeAttemptType(value: unknown): ProbeAttemptType {
  if (
    value === "text" ||
    value === "single_choice" ||
    value === "multi_choice" ||
    value === "ordered_items" ||
    value === "drag_drop_placements" ||
    value === "numeric" ||
    value === "graph" ||
    value === "audio_response" ||
    value === "video_click" ||
    value === "none" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}


function isBridgeLevel(value: unknown) {
  return (
    value === "bridge_0" ||
    value === "bridge_1" ||
    value === "bridge_2" ||
    value === "full_bridge"
  );
}

function isJargonLevel(value: unknown) {
  return (
    value === "none" ||
    value === "light" ||
    value === "standard" ||
    value === "full"
  );
}

function normalizeDeliveryContext(
  value: unknown,
): NonNullable<ProbeAttemptEvaluatorInput["delivery_context"]> | null {
  const record = asRecord(value);
  const languagePolicy = asRecord(record.language_policy);

  if (!isBridgeLevel(record.bridge_level)) {
    return null;
  }

  if (!isJargonLevel(languagePolicy.jargon_level)) {
    return null;
  }

  return {
    ...record,
    bridge_level: record.bridge_level,
    language_policy: {
      ...languagePolicy,
      jargon_level: languagePolicy.jargon_level,
    },
  } as NonNullable<ProbeAttemptEvaluatorInput["delivery_context"]>;
}

function defaultPromptFromBody(body: Record<string, unknown>): ProbePrompt {
  const promptText = getString(body.prompt, "Answer the probe in your own words.");

  return {
    root_problem_explanation:
      "The submitted probe did not include a full engine prompt snapshot.",
    reshaping_explanation:
      "MyWay is using the safest available prompt fallback for attempt evaluation.",
    task: promptText,
    full_prompt: promptText,
  };
}

function getAnsweredSnapshot(body: Record<string, unknown>) {
  return asRecord(
    body.answeredProbeContractSnapshot ?? body.probeContractSnapshot ?? null,
  );
}

function getEngineRenderableProbe(body: Record<string, unknown>) {
  const answeredSnapshot = getAnsweredSnapshot(body);

  return asRecord(
    body.engineRenderableProbe ??
      answeredSnapshot.engine_renderable_probe ??
      asRecord(body.probe).engineRenderableProbe ??
      null,
  );
}

function getPromptFromRenderableOrBody(
  renderable: Record<string, unknown>,
  body: Record<string, unknown>,
): ProbePrompt {
  const prompt = asRecord(renderable.prompt);

  if (
    typeof prompt.root_problem_explanation === "string" &&
    typeof prompt.reshaping_explanation === "string" &&
    typeof prompt.task === "string" &&
    typeof prompt.full_prompt === "string"
  ) {
    return prompt as unknown as ProbePrompt;
  }

  return defaultPromptFromBody(body);
}

function getTargetTopicFromBody(args: {
  body: Record<string, unknown>;
  answeredSnapshot: Record<string, unknown>;
  routeTopics: RouteTopic[];
}) {
  const targetTopicId =
    asString(args.answeredSnapshot.target_topic_id) ??
    asString(args.body.topicId) ??
    asString(args.body.targetTopicId) ??
    "topic_probe_submit";

  const targetTopicLabel =
    asString(args.answeredSnapshot.target_topic_label) ??
    asString(args.body.topicLabel) ??
    asString(args.body.targetTopicLabel) ??
    "this topic";

  const existing =
    args.routeTopics.find((topic) => topic.id === targetTopicId) ??
    args.routeTopics.find(
      (topic) =>
        topic.topic_label.trim().toLowerCase() ===
        targetTopicLabel.trim().toLowerCase(),
    ) ??
    null;

  if (existing) {
    return existing;
  }

  const seeded = buildSeededTopicFromResolvedLabel({
    resolvedLabel: targetTopicLabel,
    existingTopics: args.routeTopics,
    frame: "attempt_like",
  });

  return {
    ...seeded,
    id: targetTopicId,
    topic_label: targetTopicLabel,
    hasAvailableProbe: true,
  } as RouteTopic;
}

function summarizeAttempt(attempt: ProbeAttemptEvaluatorInput["attempt"]) {
  if (attempt.text_response?.trim()) return attempt.text_response.trim();
  if (attempt.selected_option_id?.trim()) return attempt.selected_option_id.trim();
  if (attempt.selected_option_ids?.length) {
    return attempt.selected_option_ids.join(", ");
  }
  if (attempt.ordered_item_ids?.length) {
    return attempt.ordered_item_ids.join(" → ");
  }
  if (attempt.placements && Object.keys(attempt.placements).length > 0) {
    return Object.entries(attempt.placements)
      .map(([itemId, targetId]) => `${itemId}=${targetId}`)
      .join(", ");
  }
  if (typeof attempt.numeric_response === "number") {
    return String(attempt.numeric_response);
  }
  if (attempt.graph_features?.length) {
    return attempt.graph_features.join(", ");
  }
  if (attempt.audio_response_transcript?.trim()) {
    return attempt.audio_response_transcript.trim();
  }
  if (typeof attempt.selected_click_seconds === "number") {
    return `${attempt.selected_click_seconds}s`;
  }

  return "No response content was captured.";
}

async function scoreForegroundProbeSubmitConfusionInsight(args: {
  targetTopic: RouteTopic;
  answeredSnapshot: Record<string, unknown>;
  renderable: Record<string, unknown>;
  prompt: ProbePrompt;
  attempt: ProbeAttemptEvaluatorInput["attempt"];
  attemptSummary: string;
}): Promise<ConfusionInsightSignals> {
  if (!shouldUseForegroundConfusionInsight()) {
    return emptyForegroundConfusionInsightSignals({
      status: "unavailable",
      errorMessage:
        "Foreground confusion/insight is disabled. Set MYWAY_USE_CONFUSION_INSIGHT_IN_FOREGROUND=1 to enable it.",
    });
  }

  const diagnosisOutput = asRecord(args.answeredSnapshot.diagnosis_output);
  const answerKey = asRecord(args.renderable.answer_key);
  const successMarkers = Array.isArray(answerKey.success_markers)
    ? answerKey.success_markers.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return scoreConfusionInsight({
    timeoutMs: getForegroundConfusionInsightTimeoutMs(),
    input: {
      input_type: confusionInsightInputTypeFromAttempt(args.attempt.attempt_type),
      current_attempt_type: args.attempt.attempt_type,
      current_evidence: args.attemptSummary,

      previous_active_topic_label: args.targetTopic.topic_label,
      target_topic_label: args.targetTopic.topic_label,
      topic_transition_type: "same_topic",
      topic_similarity: 1,

      previous_mode: "probe",
      is_response_to_clarify: false,
      is_response_to_probe: true,

      target_topic_recent_events: [
        {
          event_type: "probe",
          topic_label: args.targetTopic.topic_label,
          diagnosis_label: asString(diagnosisOutput.diagnosis),
          probe_type: asString(args.renderable.probe_type),
          modality: "interactive",
          probe_prompt: args.prompt.full_prompt,
          learning_objective: args.prompt.root_problem_explanation,
          expected_attempt_type: asString(args.renderable.expected_attempt_type),
          success_marker: successMarkers[0] ?? null,
          misconception_being_tested: null,
          attempt_type: args.attempt.attempt_type,
          evidence: args.attemptSummary,
        },
      ],

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


function buildAttemptFromBody(args: {
  body: Record<string, unknown>;
  renderable: Record<string, unknown>;
}) {
  const structuredAttempt = asRecord(
    args.body.structuredAttempt ?? args.body.attempt ?? {},
  );

  const expectedAttemptType = normalizeAttemptType(
    args.renderable.expected_attempt_type ?? args.body.responseType,
  );

  const attemptType = normalizeAttemptType(
    structuredAttempt.attempt_type ?? expectedAttemptType,
  );

  const responseString =
    asString(args.body.response) ??
    asString(structuredAttempt.text_response) ??
    asString(structuredAttempt.selected_option_id) ??
    null;

  return {
    attempt_type: attemptType === "unknown" ? expectedAttemptType : attemptType,

    text_response:
      asString(structuredAttempt.text_response) ??
      (attemptType === "text" ? responseString : null),

    selected_option_id:
      asString(structuredAttempt.selected_option_id) ??
      asString(args.body.selectedOptionId) ??
      (attemptType === "single_choice" ? responseString : null),

    selected_option_ids:
      asStringArray(structuredAttempt.selected_option_ids).length > 0
        ? asStringArray(structuredAttempt.selected_option_ids)
        : asStringArray(args.body.selectedOptionIds),

    ordered_item_ids: asStringArray(structuredAttempt.ordered_item_ids),

    placements: asStringRecord(structuredAttempt.placements),

    numeric_response:
      asNumber(structuredAttempt.numeric_response) ??
      asNumber(args.body.numericResponse),

    graph_features: asStringArray(structuredAttempt.graph_features),

    audio_response_transcript:
      asString(structuredAttempt.audio_response_transcript) ?? null,

    selected_click_seconds:
      asNumber(structuredAttempt.selected_click_seconds) ??
      asNumber(args.body.selectedClickSeconds),

    self_reported_confidence:
      asNumber(structuredAttempt.self_reported_confidence) ??
      asNumber(args.body.selfReportedConfidence),
  };
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

function buildDeliveredProbeFromProbeContract(args: {
  targetTopicId: string;
  targetTopicLabel: string;
  probeContract: ProbeContractModelOutput;
  probeContractSnapshot: Record<string, unknown>;
}): DeliveredProbe {
  const prompt = args.probeContract.prompt;
  const probeId = `local-service-followup-probe-${args.targetTopicId}-${Date.now()}`;

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
      "MyWay generated this follow-up from the local 3-model submit loop.",
    probe_contract_snapshot: args.probeContractSnapshot,
    stimulus_id: `stimulus-${probeId}`,
    payload_snapshot: {
      local_service_3model_probe_submit: true,
      probe_contract_snapshot: args.probeContractSnapshot,
      engine_renderable_probe:
        args.probeContractSnapshot.engine_renderable_probe ?? null,
      renderer_adapter: args.probeContractSnapshot.renderer_adapter ?? null,
    },
  } as unknown as DeliveredProbe;
}

function buildProbeContractSnapshot(args: {
  targetTopicId: string;
  targetTopicLabel: string;
  answeredProbeContractSnapshot: Record<string, unknown>;
  attemptEvaluationRun: Awaited<ReturnType<typeof runAttemptEvaluation>>;
  diagnosisRun: Awaited<ReturnType<typeof runDiagnosis>>;
  probeContractRun: Awaited<ReturnType<typeof runProbeContract>>;
  rendererAdapter: ReturnType<typeof adaptProbeContractForRenderer>;
  confusionInsightSignals: ConfusionInsightSignals;
}) {
  return {
    schema_version: "local_service_probe_submit_contract_snapshot_v1",
    source: "local_service_3model_probe_submit_route",
    target_topic_id: args.targetTopicId,
    target_topic_label: args.targetTopicLabel,

    previous_probe_contract_snapshot: args.answeredProbeContractSnapshot,

    confusion_insight_signals: args.confusionInsightSignals,

    attempt_evaluation_output: args.attemptEvaluationRun.output,
    attempt_evaluation_provider_meta:
      args.attemptEvaluationRun.provider_result.meta,
    attempt_evaluation_validation: args.attemptEvaluationRun.validation,

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

function buildEvaluatedProbeAttemptSignal(args: {
  probe: ProbeAttemptEvaluatorInput["probe"];
  attempt: ProbeAttemptEvaluatorInput["attempt"];
  attemptEvaluationRun: Awaited<ReturnType<typeof runAttemptEvaluation>>;
}): EvaluatedProbeAttemptSignal {
  const output = args.attemptEvaluationRun.output;

  return {
    probe: args.probe,
    attempt: {
      attempt_type: args.attempt.attempt_type,
      response_summary: summarizeAttempt(args.attempt),
    },
    evaluation: {
      correctness: output.correctness,
      correctness_summary: output.correctness_summary,
      understanding_evidence: output.understanding_evidence,
      misconception_hits: output.misconception_hits,
      next_action: output.next_action,
      personalization_delta: output.personalization_delta ?? null,
    },
  };
}

function buildResult(args: {
  body: Record<string, unknown>;
  targetTopic: RouteTopic;
  learningSpace: LearningSpace;
  attemptInput: ProbeAttemptEvaluatorInput;
  attemptEvaluationRun: Awaited<ReturnType<typeof runAttemptEvaluation>>;
  diagnosisRun: Awaited<ReturnType<typeof runDiagnosis>>;
  probeContractRun: Awaited<ReturnType<typeof runProbeContract>>;
  deliveredProbe: DeliveredProbe;
  confusionInsightSignals: ConfusionInsightSignals;
}) {
  const targetTopicId = args.targetTopic.id;
  const targetTopicLabel = args.targetTopic.topic_label;
  const evaluation = args.attemptEvaluationRun.output;

  return {
    run_metadata: {
      run_id: `local-service-probe-submit-route-${Date.now()}`,
      run_type: "probe_submit",
      created_at: new Date().toISOString(),
      source: "local_service_3model_probe_submit_route",
      debug: {
        enabled_by_env:
          "MYWAY_USE_LOCAL_SERVICE_3MODEL or MYWAY_USE_LOCAL_SERVICE_3MODEL_PROBE_SUBMIT",
      },
    },
    important_run_inputs: {
      user_message: {
        message_id: null,
        timestamp: new Date().toISOString(),
        content: summarizeAttempt(args.attemptInput.attempt),
      },
      model_signals: args.confusionInsightSignals,
      current_interaction_context: {
        run_kind: "probe_submit",
        is_response_to_delivered_probe: true,
        prior_mode_selected: "probe",
        prior_probe_was_applicable: true,
        prior_probe_id: asString(args.body.probeId),
        prior_mode_outcome_available: true,
      },
      new_attempt: {
        status: "present",
        attempt_type: args.attemptInput.attempt.attempt_type,
        response_summary: summarizeAttempt(args.attemptInput.attempt),
      },
      vector_info: {
        query_text: summarizeAttempt(args.attemptInput.attempt),
        top_k_similarity_scores: [],
        selected_topic_id: targetTopicId,
        selected_topic_label: targetTopicLabel,
        source: "answered_probe_contract_snapshot_no_embedding",
      },
      uploaded_content: [],
    },
    engine_fuel: {
      schema_version: "local_service_3model_probe_submit_adapter_v0",
      source: "local_service_3model_probe_submit_route",
      topics: [
        {
          topic_id: targetTopicId,
          topic_label: targetTopicLabel,
          topic_confusion_average:
            args.confusionInsightSignals.model_confusion ??
            getNumber(args.targetTopic.confusion, 0.62),
          topic_insight_average:
            args.confusionInsightSignals.model_insight ??
            getNumber(args.targetTopic.insight, 0.38),
          topic_learning_score: getNumber(args.targetTopic.learningScore, 0.42),
          topic_centroid: Array.isArray(args.targetTopic.position)
            ? args.targetTopic.position
            : [0, 0, 0],
        },
      ],
      intervention_mode_decision: {
        mode_selected: "probe",
        target_topic_id: targetTopicId,
        active_diagnosis: args.diagnosisRun.output.diagnosis,
        primary_block: evaluation.correctness_summary,
        decision_confidence: evaluation.next_action_confidence,
        decision_reasons: [
          "Local service 3-model probe-submit route is enabled.",
          "Probe submit used answeredProbeContractSnapshot as topic source of truth.",
          `Attempt Evaluator requested: ${evaluation.next_action}.`,
          `Follow-up Probe Contract Model returned: ${args.probeContractRun.output.probe_type}.`,
          `Confusion/insight status: ${args.confusionInsightSignals.status}.`,
        ],
        clarify_score:
          evaluation.next_action === "ask_clarifying_question"
            ? evaluation.next_action_confidence
            : 0.15,
        probe_score:
          evaluation.next_action === "generate_followup_probe" ||
          evaluation.next_action === "target_misconception"
            ? evaluation.next_action_confidence
            : 0.62,
        signal_summary: {
          raw_response_signal: evaluation.correctness,
          evidence_quality_signal:
            evaluation.understanding_evidence.evidence_strength,
          active_problem_signal: evaluation.next_action_confidence,
          readiness_signal: args.probeContractRun.usable ? 0.8 : 0.35,
          history_signal: 0.5,
          model_confusion_signal: args.confusionInsightSignals.model_confusion,
          model_insight_signal: args.confusionInsightSignals.model_insight,
        },
      },
      foreground_confusion_insight: args.confusionInsightSignals,
      probe_plan: {
        status: "applicable",
        probe_id: args.deliveredProbe.probe_id,
        target_topic_id: targetTopicId,
        target_diagnosis: args.diagnosisRun.output.diagnosis,
        intent: "diagnostic",
        probe_type: args.probeContractRun.output.probe_type,
        expected_response_type: args.probeContractRun.output.expected_attempt_type,
        text_plan: {
          instructional_goal: args.probeContractRun.output.prompt.task,
        },
        probe_contract_snapshot: args.deliveredProbe.probe_contract_snapshot,
      },
      local_service_3model_probe_submit: {
        attempt_evaluation_provider_meta:
          args.attemptEvaluationRun.provider_result.meta,
        diagnosis_provider_meta: args.diagnosisRun.provider_result.meta,
        probe_contract_provider_meta: args.probeContractRun.provider_result.meta,
        attempt_evaluation_validation: args.attemptEvaluationRun.validation,
        diagnosis_validation: args.diagnosisRun.validation,
        probe_contract_validation: args.probeContractRun.validation,
      },
    },
    delivered_response: {
      learner_message: {
        text:
          evaluation.correctness_summary ||
          "I checked your response and generated a follow-up probe.",
        tone: "encouraging",
        mode: "probe",
      },
      delivered_probe: args.deliveredProbe,
    },
    learning_space: args.learningSpace,
  } as unknown as MyWayRunResult;
}


async function persistLocalServiceProbeSubmitRoute(args: {
  runId: string;
  body: Record<string, unknown>;
  result: MyWayRunResult;
  targetTopic: RouteTopic;
  targetTopicId: string;
  targetTopicLabel: string;
  deliveredProbe: DeliveredProbe;
  probeContractSnapshot: Record<string, unknown>;
  attempt: ProbeAttemptEvaluatorInput["attempt"];
  attemptSummary: string;
  attemptEvaluationRun: Awaited<ReturnType<typeof runAttemptEvaluation>>;
  diagnosisRun: Awaited<ReturnType<typeof runDiagnosis>>;
  confusionInsightSignals: ConfusionInsightSignals;
  replyText: string;
  suggestedAction: string;
}) {
  const now = new Date().toISOString();
  const topicPosition = Array.isArray(args.targetTopic.position)
    ? args.targetTopic.position
    : [0, 0, 0];

  const topicJson = toPersistenceJson<PersistenceTopicJson>({
    ...(args.targetTopic as unknown as Record<string, unknown>),

    id: args.targetTopicId,
    topic_id: args.targetTopicId,
    topic_label: args.targetTopicLabel,
    label: args.targetTopicLabel,

    confusion:
      args.confusionInsightSignals.model_confusion ??
      getNumber(args.targetTopic.confusion, 0.62),
    insight:
      args.confusionInsightSignals.model_insight ??
      getNumber(args.targetTopic.insight, 0.38),
    learningScore: getNumber(args.targetTopic.learningScore, 0.42),

    hasAvailableProbe: true,
    latest_delivered_probe: args.deliveredProbe,
    current_probe_contract_snapshot: args.probeContractSnapshot,
    latest_attempt_evaluation: args.attemptEvaluationRun.output,
    foreground_persistence: {
      source: "local_service_3model_probe_submit_route",
      persisted_at: now,
      run_id: args.runId,
      embedding_behavior: "foreground_no_embedding_background_later",
    },

    semantic_enrichment_status: {
      status: "skipped_for_fast_model_route",
      reason:
        "Foreground local 3-model probe-submit route intentionally persisted topic_state without waiting for embeddings.",
      updated_at: now,
    },
    needs_embedding_centroid: true,
    should_schedule_enrichment: true,
    semantic_enrichment_prompt_text: args.attemptSummary,
    layout_status: "pending_semantic_enrichment",
    embedding_skip_reason: "foreground_local_service_probe_submit_route",
  });

  try {
    await insertRun({
      id: args.runId,
      runType: "probe_submit",
      userMessage: args.attemptSummary,
      targetTopicId: args.targetTopicId,
      modeSelected: "probe",
      activeDiagnosis: args.diagnosisRun.output.diagnosis,
      replyText: args.replyText,
      suggestedAction: args.suggestedAction,
      runResultJson: toPersistenceJson<PersistenceRunJson>(args.result),
    });

    await insertAttempt({
      id: `attempt-${args.runId}`,
      runId: args.runId,
      probeId: asString(args.body.probeId),
      topicId: args.targetTopicId,
      responseText: args.attemptSummary,
      classification: args.attemptEvaluationRun.output.next_action,
      correctnessEstimate: String(args.attemptEvaluationRun.output.correctness),
      explanationQuality: String(
        args.attemptEvaluationRun.output.understanding_evidence.evidence_strength,
      ),
      insight: args.confusionInsightSignals.model_insight,
      confusion: args.confusionInsightSignals.model_confusion,
      attemptJson: toPersistenceJson<PersistenceAttemptJson>({
        attempt: args.attempt,
        attempt_summary: args.attemptSummary,
        attempt_evaluation_output: args.attemptEvaluationRun.output,
        confusion_insight_signals: args.confusionInsightSignals,
      }),
    });

    await upsertTopicState({
      topicId: args.targetTopicId,
      lastRunId: args.runId,
      topicLabel: args.targetTopicLabel,
      confusion:
        args.confusionInsightSignals.model_confusion ??
        getNumber(args.targetTopic.confusion, 0.62),
      insight:
        args.confusionInsightSignals.model_insight ??
        getNumber(args.targetTopic.insight, 0.38),
      learningScore: getNumber(args.targetTopic.learningScore, 0.42),
      diagnosis: args.diagnosisRun.output.diagnosis,
      nextStep: args.suggestedAction,
      topicJson,
      topicPosition: topicPosition as Parameters<typeof upsertTopicState>[0]["topicPosition"],
    });

    return {
      ok: true,
      run_id: args.runId,
      topic_id: args.targetTopicId,
      topic_label: args.targetTopicLabel,
      wrote_run: true,
      wrote_attempt: true,
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
      wrote_attempt: false,
      upserted_topic_state: false,
      error_message: persistenceErrorMessage(error),
    };
  }
}

export async function buildLocalServiceThreeModelProbeSubmitResponse(
  body: unknown,
) {
  const record = asRecord(body);
  const answeredSnapshot = getAnsweredSnapshot(record);
  const renderable = getEngineRenderableProbe(record);
  const prompt = getPromptFromRenderableOrBody(renderable, record);
  const routeTopics = await loadRouteTopics();
  const targetTopic = getTargetTopicFromBody({
    body: record,
    answeredSnapshot,
    routeTopics,
  });
  const targetTopicId = targetTopic.id;
  const targetTopicLabel = targetTopic.topic_label;

  const probeType = getString(renderable.probe_type, "explain");
  const expectedAttemptType = normalizeAttemptType(
    renderable.expected_attempt_type,
  );

  const probeForEvaluation: ProbeAttemptEvaluatorInput["probe"] = {
    probe_type: probeType as ProbeAttemptEvaluatorInput["probe"]["probe_type"],
    expected_attempt_type:
      expectedAttemptType === "unknown" ? "text" : expectedAttemptType,
    prompt,
    target_diagnosis: null,
  };

  const attempt = buildAttemptFromBody({
    body: record,
    renderable,
  }) as ProbeAttemptEvaluatorInput["attempt"];

  const attemptSummary = summarizeAttempt(attempt);
  const confusionInsightSignals = await scoreForegroundProbeSubmitConfusionInsight({
    targetTopic,
    answeredSnapshot,
    renderable,
    prompt,
    attempt,
    attemptSummary,
  });

  const attemptEvaluationInput: ProbeAttemptEvaluatorInput = {
    schema_version: "probe_attempt_evaluator_input_v1",
    probe: probeForEvaluation,
    answer_key: asRecord(renderable.answer_key).kind
      ? (renderable.answer_key as ProbeAttemptEvaluatorInput["answer_key"])
      : (asRecord(answeredSnapshot.probe_contract_output).answer_key as
          | ProbeAttemptEvaluatorInput["answer_key"]
          | undefined) ?? null,
    attempt,
    misconception_markers: Array.isArray(renderable.misconception_markers)
      ? (renderable.misconception_markers as ProbeAttemptEvaluatorInput["misconception_markers"])
      : [],
    delivery_context:
      normalizeDeliveryContext(renderable.delivery_context) ??
      normalizeDeliveryContext(answeredSnapshot.delivery_context) ??
      normalizeDeliveryContext(
        asRecord(answeredSnapshot.probe_contract_output).delivery_context,
      ),
  };

  const providers = buildEngineProviderSet();
  const probeContractProvider = providers.probe_contract;

  if (!probeContractProvider) {
    throw new Error("No probe contract provider is configured.");
  }

  const attemptEvaluationRun = await runAttemptEvaluation({
    provider: providers.attempt_evaluator,
    model_input: attemptEvaluationInput,
  });

  const evaluatedProbeAttempt = buildEvaluatedProbeAttemptSignal({
    probe: probeForEvaluation,
    attempt,
    attemptEvaluationRun,
  });

  const diagnosisInput: DiagnosisModelInput = {
    schema_version: "diagnosis_model_input_v1",
    input_kind: "evaluated_probe_attempt",
    evaluated_probe_attempt: evaluatedProbeAttempt,
  };

  const diagnosisRun = await runDiagnosis({
    provider: providers.diagnosis,
    model_input: diagnosisInput,
  });

  const probeContractInput: ProbeContractModelInput = {
    schema_version: "probe_contract_model_input_v1",
    target_topic: {
      topic_id: targetTopicId,
      topic_label: targetTopicLabel,
    },
    target_diagnosis: diagnosisRun.output.diagnosis,
    learner_signal: {
      signal_kind: "evaluated_probe_attempt",
      evaluated_probe_attempt: evaluatedProbeAttempt,
    },
    personalization_context: {
      bridge_level: "bridge_0",
      language_policy: {
        jargon_level: "none",
      },
    },
  };

  const probeContractRun = await runProbeContract({
    provider: probeContractProvider,
    model_input: probeContractInput,
  });

  const rendererAdapter = adaptProbeContractForRenderer(probeContractRun.output);

  const probeContractSnapshot = buildProbeContractSnapshot({
    targetTopicId,
    targetTopicLabel,
    answeredProbeContractSnapshot: answeredSnapshot,
    attemptEvaluationRun,
    diagnosisRun,
    probeContractRun,
    rendererAdapter,
    confusionInsightSignals,
  }) as Record<string, unknown>;

  const deliveredProbe = buildDeliveredProbeFromProbeContract({
    targetTopicId,
    targetTopicLabel,
    probeContract: probeContractRun.output,
    probeContractSnapshot,
  });

  const learningSpace = buildLearningSpace([targetTopic]) as unknown as LearningSpace;

  const result = buildResult({
    body: record,
    targetTopic,
    learningSpace,
    attemptInput: attemptEvaluationInput,
    attemptEvaluationRun,
    diagnosisRun,
    probeContractRun,
    deliveredProbe,
    confusionInsightSignals,
  });

  const reply =
    attemptEvaluationRun.output.correctness_summary ||
    "I checked your response and generated the next focused probe.";

  const suggestedAction =
    attemptEvaluationRun.output.next_action === "target_misconception"
      ? "Target the exposed misconception"
      : attemptEvaluationRun.output.next_action === "generate_followup_probe"
        ? "Continue with the follow-up probe"
        : "Review the feedback and continue";

  const runId = getString(
    asRecord((result as unknown as Record<string, unknown>).run_metadata).run_id,
    `local-service-probe-submit-route-${Date.now()}`,
  );

  const persistence = await persistLocalServiceProbeSubmitRoute({
    runId,
    body: record,
    result,
    targetTopic,
    targetTopicId,
    targetTopicLabel,
    deliveredProbe,
    probeContractSnapshot,
    attempt,
    attemptSummary,
    attemptEvaluationRun,
    diagnosisRun,
    confusionInsightSignals,
    replyText: reply,
    suggestedAction,
  });

  return {
    result,
    scene_update: {
      target_topic_id: targetTopicId,
      camera_destination_topic_id: targetTopicId,
      arrival_mode: "focus",
      learning_space: learningSpace,
      source: "local_service_3model_probe_submit_route",
    },
    intervention: {
      mode_selected: "probe",
      target_topic_id: targetTopicId,
      active_diagnosis: diagnosisRun.output.diagnosis,
      probe_available: "available",
      status_label: "Local 3-model follow-up probe",
      suggested_action: suggestedAction,
    },
    continue_probe_loop: true,
    next_probe: deliveredProbe,
    nextProbe: deliveredProbe,
    reply,
    suggestedAction,
    persistence_debug: persistence,
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
    judgedAttempt: {
      schema_version: "local_service_judged_attempt_v1",
      source: "local_service_3model_probe_submit_route",
      probeId: asString(record.probeId),
      topicId: targetTopicId,
      topicLabel: targetTopicLabel,
      submitted_attempt: attempt,
      confusion_insight_signals: confusionInsightSignals,
      persistence,
      attempt_evaluation_output: attemptEvaluationRun.output,
      attempt_evaluation_provider_meta:
        attemptEvaluationRun.provider_result.meta,
      diagnosis_output: diagnosisRun.output,
      evaluated_probe_attempt_signal: evaluatedProbeAttempt,
    },
    local_service_3model_submit_debug: {
      enabled: true,
      topic_source: "answered_probe_contract_snapshot_no_embedding",
      target_topic_id: targetTopicId,
      target_topic_label: targetTopicLabel,
      confusion_insight_signals: confusionInsightSignals,
      persistence,
      attempt_evaluation_output: attemptEvaluationRun.output,
      attempt_evaluation_provider_meta:
        attemptEvaluationRun.provider_result.meta,
      diagnosis_output: diagnosisRun.output,
      diagnosis_provider_meta: diagnosisRun.provider_result.meta,
      probe_contract_output: probeContractRun.output,
      probe_contract_provider_meta: probeContractRun.provider_result.meta,
      renderer_adapter: rendererAdapter,
    },
  } as unknown as MessageRouteResponse & {
    continue_probe_loop: boolean;
    next_probe: DeliveredProbe;
    nextProbe: DeliveredProbe;
    reply: string;
    suggestedAction: string;
  };
}
