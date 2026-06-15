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
  expected_attempt_type?: unknown;
  expectedAttemptType?: unknown;
  prompt?: unknown;
  answer_key?: unknown;
  answerKey?: unknown;
  misconception_markers?: unknown;
  misconceptionMarkers?: unknown;
  delivery_context?: unknown;
  deliveryContext?: unknown;
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
  nextProbePlan?: ProbePlanLike | null;
};

export type ProbeSubmitEngineShadowResult =
  | {
      status: "ok";
      route_next_action: string;
      keep_topic_open: boolean;
      validation_issue_count: number;
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

function coerceProbeType(
  snapshot: ProbeContractSnapshotLike,
  nextProbePlan?: ProbePlanLike | null,
): ProbeType {
  if (isProbeType(snapshot.probe_type)) return snapshot.probe_type;
  if (isProbeType(snapshot.probeType)) return snapshot.probeType;
  if (nextProbePlan && isProbeType(nextProbePlan.probe_type)) return nextProbePlan.probe_type;
  if (nextProbePlan && isProbeType(nextProbePlan.probeType)) return nextProbePlan.probeType;

  return "explain";
}

function coerceExpectedAttemptType(
  snapshot: ProbeContractSnapshotLike,
  nextProbePlan?: ProbePlanLike | null,
): ProbeAttemptType {
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
  body: ProbeSubmitShadowBody;
  topic: ProbeSubmitShadowTopic;
  topicLabel: string;
}): ProbePrompt {
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

function coerceAnswerKey(snapshot: ProbeContractSnapshotLike): AnswerKey | null {
  const answerKey = snapshot.answer_key ?? snapshot.answerKey;

  if (!isRecord(answerKey)) {
    return null;
  }

  return answerKey as AnswerKey;
}

function coerceMisconceptionMarkers(
  snapshot: ProbeContractSnapshotLike,
): MisconceptionMarker[] {
  const markers = snapshot.misconception_markers ?? snapshot.misconceptionMarkers;

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

function coerceDeliveryContext(
  snapshot: ProbeContractSnapshotLike,
): ProbeDeliveryContext | null {
  const deliveryContext = snapshot.delivery_context ?? snapshot.deliveryContext;

  if (!isRecord(deliveryContext)) {
    return null;
  }

  return deliveryContext as ProbeDeliveryContext;
}

function buildShadowAttemptInput(
  input: ProbeSubmitEngineShadowInput,
): ProbeAttemptEvaluatorInput {
  const snapshot = getSnapshot(input);
  const probeType = coerceProbeType(snapshot, input.nextProbePlan);
  const expectedAttemptType = coerceExpectedAttemptType(snapshot, input.nextProbePlan);
  const prompt = coercePrompt({
    snapshot,
    body: input.body,
    topic: input.topic,
    topicLabel: input.topicLabel,
  });

  return {
    schema_version: "probe_attempt_evaluator_input_v1",
    probe: {
      probe_type: probeType,
      expected_attempt_type: expectedAttemptType,
      prompt,
      target_diagnosis: isDiagnosisLabel(input.activeDiagnosis)
        ? input.activeDiagnosis
        : "unknown",
    },
    answer_key: coerceAnswerKey(snapshot),
    attempt: {
      attempt_type: expectedAttemptType === "unknown" ? "text" : expectedAttemptType,
      text_response: input.rawResponse,
    },
    misconception_markers: coerceMisconceptionMarkers(snapshot),
    delivery_context: coerceDeliveryContext(snapshot),
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
    const modelInput = buildShadowAttemptInput(input);

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
        response_summary: input.rawResponse,
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
        },
      }),
    );

    if (shouldLogShadowOutput()) {
      console.info("[MyWay engine shadow/probe-submit]", {
        runId: input.runId,
        route,
        validation_issue_count: run.validation.issues.length,
        evaluated_signal_next_action: evaluatedSignal.evaluation.next_action,
      });
    }

    return {
      status: "ok",
      route_next_action: route.next_action,
      keep_topic_open: route.keep_topic_open,
      validation_issue_count: run.validation.issues.length,
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

