import {
  buildEvaluatedProbeAttemptSignal,
  createDeterministicAttemptEvaluator,
  createModelCallRow,
  logModelCall,
  routeEngineNextAction,
  runAttemptEvaluation,
} from "@/lib/engine";
import type {
  AnswerKey,
  DiagnosisLabel,
  EngineRenderableProbe,
  MisconceptionMarker,
  ProbeAttemptEvaluatorInput,
  ProbeAttemptType,
  ProbeDeliveryContext,
  ProbePrompt,
  ProbeType,
} from "@/lib/engine";

type ProbeSubmitShadowBody = {
  topicId?: string | null;
  topicLabel?: string | null;
  prompt?: string | null;
  response?: unknown;
  structuredAttempt?: unknown;
  attempt?: unknown;
  engineRenderableProbe?: unknown;
};

type ProbeSubmitShadowTopic = {
  id?: string | null;
  label?: string | null;
  title?: string | null;
  name?: string | null;
  nextStep?: string | null;
};

type ProbeContractSnapshotLike = {
  probe_type?: unknown;
  probeType?: unknown;
  engine_probe_type?: unknown;
  engineProbeType?: unknown;

  expected_attempt_type?: unknown;
  expectedAttemptType?: unknown;

  prompt?: unknown;
  answer_key?: unknown;
  answerKey?: unknown;

  misconception_markers?: unknown;
  misconceptionMarkers?: unknown;

  delivery_context?: unknown;
  deliveryContext?: unknown;

  engine_renderable_probe?: unknown;
  engineRenderableProbe?: unknown;
};

type ProbePlanLike = {
  probe_type?: unknown;
  probeType?: unknown;
  expected_attempt_type?: unknown;
  expectedAttemptType?: unknown;
  probe_contract_snapshot?: unknown;
  probeContractSnapshot?: unknown;
};

export type ProbeSubmitEngineShadowInput = {
  runId: string;
  body: ProbeSubmitShadowBody;
  rawResponse: string;
  topic: ProbeSubmitShadowTopic;
  topicLabel: string;
  activeDiagnosis: unknown;
  answeredProbeContractSnapshot?: unknown;
  answeredEngineRenderableProbe?: EngineRenderableProbe | null;
  structuredAttempt?: unknown;
  nextProbePlan?: ProbePlanLike | null;
};

export type ProbeSubmitEngineShadowResult =
  | {
      status: "ok";
      route_next_action: string;
      keep_topic_open: boolean;
      validation_issue_count: number;
      used_structured_attempt: boolean;
      used_engine_renderable_probe: boolean;
    }
  | {
      status: "error";
      error: string;
    };

const PROBE_TYPES: ProbeType[] = [
  "explain",
  "discriminate",
  "apply_transfer",
  "sequence",
  "single_choice",
  "multi_choice",
  "drag_drop_placements",
  "predict",
  "slider",
  "graph_relationship",
  "audio_clip_question",
  "audio_response_question",
  "video_click_interval",
  "video_explanation",
];

const PROBE_ATTEMPT_TYPES: ProbeAttemptType[] = [
  "text",
  "single_choice",
  "multi_choice",
  "ordered_items",
  "drag_drop_placements",
  "numeric",
  "graph",
  "audio_response",
  "video_click",
  "none",
  "unknown",
];

const DIAGNOSIS_LABELS: DiagnosisLabel[] = [
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbeType(value: unknown): value is ProbeType {
  return typeof value === "string" && PROBE_TYPES.includes(value as ProbeType);
}

function isProbeAttemptType(value: unknown): value is ProbeAttemptType {
  return (
    typeof value === "string" &&
    PROBE_ATTEMPT_TYPES.includes(value as ProbeAttemptType)
  );
}

function isDiagnosisLabel(value: unknown): value is DiagnosisLabel {
  return typeof value === "string" && DIAGNOSIS_LABELS.includes(value as DiagnosisLabel);
}

function isEngineRenderableProbe(value: unknown): value is EngineRenderableProbe {
  return (
    isRecord(value) &&
    value.schema_version === "engine_renderable_probe_v1" &&
    isProbeType(value.probe_type) &&
    isProbeAttemptType(value.expected_attempt_type) &&
    isRecord(value.prompt)
  );
}

function getSnapshot(input: ProbeSubmitEngineShadowInput): ProbeContractSnapshotLike {
  if (isRecord(input.answeredProbeContractSnapshot)) {
    return input.answeredProbeContractSnapshot as ProbeContractSnapshotLike;
  }

  const nextProbePlan = input.nextProbePlan;

  if (nextProbePlan && isRecord(nextProbePlan.probe_contract_snapshot)) {
    return nextProbePlan.probe_contract_snapshot as ProbeContractSnapshotLike;
  }

  if (nextProbePlan && isRecord(nextProbePlan.probeContractSnapshot)) {
    return nextProbePlan.probeContractSnapshot as ProbeContractSnapshotLike;
  }

  return {};
}

function getRenderableProbe(input: ProbeSubmitEngineShadowInput): EngineRenderableProbe | null {
  if (isEngineRenderableProbe(input.answeredEngineRenderableProbe)) {
    return input.answeredEngineRenderableProbe;
  }

  if (isEngineRenderableProbe(input.body.engineRenderableProbe)) {
    return input.body.engineRenderableProbe;
  }

  const snapshot = getSnapshot(input);

  if (isEngineRenderableProbe(snapshot.engine_renderable_probe)) {
    return snapshot.engine_renderable_probe;
  }

  if (isEngineRenderableProbe(snapshot.engineRenderableProbe)) {
    return snapshot.engineRenderableProbe;
  }

  return null;
}

function getStructuredAttempt(input: ProbeSubmitEngineShadowInput): Record<string, unknown> | null {
  if (isRecord(input.structuredAttempt)) {
    return input.structuredAttempt;
  }

  if (isRecord(input.body.structuredAttempt)) {
    return input.body.structuredAttempt;
  }

  if (isRecord(input.body.attempt)) {
    return input.body.attempt;
  }

  if (isRecord(input.body.response)) {
    return input.body.response;
  }

  return null;
}

function coerceProbeType(args: {
  snapshot: ProbeContractSnapshotLike;
  renderableProbe: EngineRenderableProbe | null;
  nextProbePlan?: ProbePlanLike | null;
}): ProbeType {
  if (args.renderableProbe) return args.renderableProbe.probe_type;

  const snapshot = args.snapshot;
  const nextProbePlan = args.nextProbePlan;

  if (isProbeType(snapshot.engine_probe_type)) return snapshot.engine_probe_type;
  if (isProbeType(snapshot.engineProbeType)) return snapshot.engineProbeType;
  if (isProbeType(snapshot.probe_type)) return snapshot.probe_type;
  if (isProbeType(snapshot.probeType)) return snapshot.probeType;
  if (nextProbePlan && isProbeType(nextProbePlan.probe_type)) return nextProbePlan.probe_type;
  if (nextProbePlan && isProbeType(nextProbePlan.probeType)) return nextProbePlan.probeType;

  return "explain";
}

function coerceExpectedAttemptType(args: {
  snapshot: ProbeContractSnapshotLike;
  renderableProbe: EngineRenderableProbe | null;
  structuredAttempt: Record<string, unknown> | null;
  nextProbePlan?: ProbePlanLike | null;
}): ProbeAttemptType {
  if (args.structuredAttempt && isProbeAttemptType(args.structuredAttempt.attempt_type)) {
    return args.structuredAttempt.attempt_type;
  }

  if (args.renderableProbe) return args.renderableProbe.expected_attempt_type;

  const snapshot = args.snapshot;
  const nextProbePlan = args.nextProbePlan;

  if (isProbeAttemptType(snapshot.expected_attempt_type)) {
    return snapshot.expected_attempt_type;
  }

  if (isProbeAttemptType(snapshot.expectedAttemptType)) {
    return snapshot.expectedAttemptType;
  }

  if (nextProbePlan && isProbeAttemptType(nextProbePlan.expected_attempt_type)) {
    return nextProbePlan.expected_attempt_type;
  }

  if (nextProbePlan && isProbeAttemptType(nextProbePlan.expectedAttemptType)) {
    return nextProbePlan.expectedAttemptType;
  }

  return "text";
}

function coercePrompt(input: {
  snapshot: ProbeContractSnapshotLike;
  renderableProbe: EngineRenderableProbe | null;
  body: ProbeSubmitShadowBody;
  topic: ProbeSubmitShadowTopic;
  topicLabel: string;
}): ProbePrompt {
  if (input.renderableProbe) return input.renderableProbe.prompt;

  const prompt = input.snapshot.prompt;

  if (
    isRecord(prompt) &&
    typeof prompt.root_problem_explanation === "string" &&
    typeof prompt.reshaping_explanation === "string" &&
    typeof prompt.task === "string" &&
    typeof prompt.full_prompt === "string"
  ) {
    return {
      root_problem_explanation: prompt.root_problem_explanation,
      reshaping_explanation: prompt.reshaping_explanation,
      task: prompt.task,
      full_prompt: prompt.full_prompt,
    };
  }

  const fallbackTask =
    input.body.prompt ??
    input.topic.nextStep ??
    `Respond to the probe for ${input.topicLabel}.`;

  return {
    root_problem_explanation:
      "Shadow evaluation fallback: original probe contract prompt was not available in the submitted body.",
    reshaping_explanation:
      "Use the submitted prompt text as a minimal compatibility bridge for the new evaluator.",
    task: fallbackTask,
    full_prompt: fallbackTask,
  };
}

function coerceAnswerKey(args: {
  snapshot: ProbeContractSnapshotLike;
  renderableProbe: EngineRenderableProbe | null;
}): AnswerKey | null {
  if (args.renderableProbe?.answer_key) {
    return args.renderableProbe.answer_key;
  }

  const answerKey = args.snapshot.answer_key ?? args.snapshot.answerKey;

  if (!isRecord(answerKey)) {
    return null;
  }

  return answerKey as AnswerKey;
}

function coerceMisconceptionMarkers(args: {
  snapshot: ProbeContractSnapshotLike;
  renderableProbe: EngineRenderableProbe | null;
}): MisconceptionMarker[] {
  if (args.renderableProbe?.misconception_markers?.length) {
    return args.renderableProbe.misconception_markers;
  }

  const markers = args.snapshot.misconception_markers ?? args.snapshot.misconceptionMarkers;

  if (!Array.isArray(markers)) {
    return [];
  }

  return markers
    .filter(isRecord)
    .map((marker): MisconceptionMarker | null => {
      if (
        typeof marker.misconception_id !== "string" ||
        typeof marker.label !== "string" ||
        typeof marker.marker !== "string"
      ) {
        return null;
      }

      return {
        misconception_id: marker.misconception_id,
        label: marker.label,
        marker: marker.marker,
      };
    })
    .filter((marker): marker is MisconceptionMarker => marker !== null);
}

function coerceDeliveryContext(args: {
  snapshot: ProbeContractSnapshotLike;
  renderableProbe: EngineRenderableProbe | null;
}): ProbeDeliveryContext | null {
  if (args.renderableProbe?.delivery_context) {
    return args.renderableProbe.delivery_context;
  }

  const deliveryContext = args.snapshot.delivery_context ?? args.snapshot.deliveryContext;

  if (!isRecord(deliveryContext)) {
    return null;
  }

  return deliveryContext as ProbeDeliveryContext;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value.filter((item): item is string => typeof item === "string");
  return items.length ? items : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildAttempt(args: {
  structuredAttempt: Record<string, unknown> | null;
  fallbackAttemptType: ProbeAttemptType;
  rawResponse: string;
}): ProbeAttemptEvaluatorInput["attempt"] {
  const attempt = args.structuredAttempt;
  const attemptType =
    attempt && isProbeAttemptType(attempt.attempt_type)
      ? attempt.attempt_type
      : args.fallbackAttemptType === "unknown"
        ? "text"
        : args.fallbackAttemptType;

  if (!attempt) {
    return {
      attempt_type: attemptType,
      text_response: args.rawResponse,
    } as ProbeAttemptEvaluatorInput["attempt"];
  }

  return {
    attempt_type: attemptType,
    text_response:
      stringValue(attempt.text_response) ??
      stringValue(attempt.audio_response_transcript) ??
      (attemptType === "text" ? args.rawResponse : null),
    selected_option_id: stringValue(attempt.selected_option_id) ?? null,
    selected_option_ids: stringArray(attempt.selected_option_ids),
    ordered_item_ids: stringArray(attempt.ordered_item_ids),
    placements: stringRecord(attempt.placements),
    numeric_response: numberValue(attempt.numeric_response) ?? null,
    graph_features: stringArray(attempt.graph_features),
    audio_response_transcript: stringValue(attempt.audio_response_transcript) ?? null,
    selected_click_seconds: numberValue(attempt.selected_click_seconds) ?? null,
    self_reported_confidence: numberValue(attempt.self_reported_confidence) ?? null,
  } as ProbeAttemptEvaluatorInput["attempt"];
}

function summarizeAttempt(input: {
  attempt: ProbeAttemptEvaluatorInput["attempt"];
  rawResponse: string;
}) {
  if (input.attempt.text_response?.trim()) return input.attempt.text_response.trim();
  if (input.attempt.audio_response_transcript?.trim()) {
    return input.attempt.audio_response_transcript.trim();
  }
  if (input.attempt.selected_option_id) return input.attempt.selected_option_id;
  if (input.attempt.selected_option_ids?.length) {
    return input.attempt.selected_option_ids.join(", ");
  }
  if (input.attempt.ordered_item_ids?.length) {
    return input.attempt.ordered_item_ids.join(" -> ");
  }
  if (input.attempt.placements && Object.keys(input.attempt.placements).length) {
    return JSON.stringify(input.attempt.placements);
  }
  if (typeof input.attempt.numeric_response === "number") {
    return String(input.attempt.numeric_response);
  }
  if (input.attempt.graph_features?.length) {
    return input.attempt.graph_features.join(", ");
  }
  if (typeof input.attempt.selected_click_seconds === "number") {
    return String(input.attempt.selected_click_seconds);
  }

  return input.rawResponse;
}

function buildShadowAttemptInput(
  input: ProbeSubmitEngineShadowInput,
): {
  modelInput: ProbeAttemptEvaluatorInput;
  usedStructuredAttempt: boolean;
  usedEngineRenderableProbe: boolean;
} {
  const snapshot = getSnapshot(input);
  const renderableProbe = getRenderableProbe(input);
  const structuredAttempt = getStructuredAttempt(input);

  const probeType = coerceProbeType({
    snapshot,
    renderableProbe,
    nextProbePlan: input.nextProbePlan,
  });

  const expectedAttemptType = coerceExpectedAttemptType({
    snapshot,
    renderableProbe,
    structuredAttempt,
    nextProbePlan: input.nextProbePlan,
  });

  const prompt = coercePrompt({
    snapshot,
    renderableProbe,
    body: input.body,
    topic: input.topic,
    topicLabel: input.topicLabel,
  });

  const attempt = buildAttempt({
    structuredAttempt,
    fallbackAttemptType: expectedAttemptType,
    rawResponse: input.rawResponse,
  });

  return {
    modelInput: {
      schema_version: "probe_attempt_evaluator_input_v1",
      probe: {
        probe_type: probeType,
        expected_attempt_type: expectedAttemptType,
        prompt,
        target_diagnosis: isDiagnosisLabel(input.activeDiagnosis)
          ? input.activeDiagnosis
          : "unknown",
      },
      answer_key: coerceAnswerKey({ snapshot, renderableProbe }),
      attempt,
      misconception_markers: coerceMisconceptionMarkers({ snapshot, renderableProbe }),
      delivery_context: coerceDeliveryContext({ snapshot, renderableProbe }),
    },
    usedStructuredAttempt: structuredAttempt !== null,
    usedEngineRenderableProbe: renderableProbe !== null,
  };
}

function shouldLogShadowOutput(): boolean {
  return process.env.MYWAY_ENGINE_SHADOW_LOG === "1";
}

export async function runProbeSubmitEngineShadow(
  input: ProbeSubmitEngineShadowInput,
): Promise<ProbeSubmitEngineShadowResult> {
  try {
    const provider = createDeterministicAttemptEvaluator();
    const { modelInput, usedStructuredAttempt, usedEngineRenderableProbe } =
      buildShadowAttemptInput(input);

    const run = await runAttemptEvaluation({
      provider,
      model_input: modelInput,
    });

    const route = routeEngineNextAction({
      attempt_evaluation_output: run.output,
    });

    const evaluatedSignal = buildEvaluatedProbeAttemptSignal({
      probe: modelInput.probe,
      attempt: {
        attempt_type: modelInput.attempt.attempt_type,
        response_summary: summarizeAttempt({
          attempt: modelInput.attempt,
          rawResponse: input.rawResponse,
        }),
      },
      evaluation: run.output,
    });

    await logModelCall(
      createModelCallRow({
        call_kind: "attempt_evaluation",
        provider: {
          provider_kind: "fallback",
          provider_name: provider.provider_name,
          provider_version: provider.provider_kind,
        },
        input: modelInput,
        output: run.output,
        validation_issues: run.validation.issues,
        context: {
          request_id: input.runId,
          topic_id: input.topic.id ?? input.body.topicId ?? null,
          topic_label: input.topicLabel,
          used_structured_attempt: usedStructuredAttempt,
          used_engine_renderable_probe: usedEngineRenderableProbe,
        },
      }),
    );

    if (shouldLogShadowOutput()) {
      console.info("[MyWay engine shadow/probe-submit]", {
        runId: input.runId,
        route,
        validation_issue_count: run.validation.issues.length,
        evaluated_signal_next_action: evaluatedSignal.evaluation.next_action,
        used_structured_attempt: usedStructuredAttempt,
        used_engine_renderable_probe: usedEngineRenderableProbe,
        attempt_type: modelInput.attempt.attempt_type,
        probe_type: modelInput.probe.probe_type,
      });
    }

    return {
      status: "ok",
      route_next_action: route.next_action,
      keep_topic_open: route.keep_topic_open,
      validation_issue_count: run.validation.issues.length,
      used_structured_attempt: usedStructuredAttempt,
      used_engine_renderable_probe: usedEngineRenderableProbe,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown probe-submit engine shadow error.";

    console.warn("[MyWay engine shadow/probe-submit] skipped after error", {
      runId: input.runId,
      error: message,
    });

    return {
      status: "error",
      error: message,
    };
  }
}

