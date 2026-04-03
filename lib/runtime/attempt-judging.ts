import type {
  DiagnosisDelta,
  DiagnosisType,
  FrontendTopicMetricUpdate,
  JudgedAttempt,
  ProbeSubmitRouteRequest,
  VectorInfo,
} from "@/types/contracts";
import { clamp, normalizeDiagnosis, nowIso, normalizeText } from "./shared";
import type { RouteTopic } from "./topic-resolution";

type TopicMetricUpdate = FrontendTopicMetricUpdate;

export type ProbeAttemptPayload = ProbeSubmitRouteRequest & {
  attemptId?: string;
  topicName?: string;
  prompt?: string;
  responseType?: "text";
  metadata?: {
    latencyMs?: number | null;
    revisionCount?: number | null;
    usedHint?: boolean | null;
    requestedClarificationBeforeAnswering?: boolean | null;
  };
};

export function inferDiagnosisFromTopic(topic: RouteTopic): DiagnosisType {
  return (
    normalizeDiagnosis((topic as { diagnosis?: unknown }).diagnosis) ??
    "representation_gap"
  );
}

export function scoreResponse(response: string) {
  const trimmed = response.trim();
  const normalized = normalizeText(response);
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;

  const strongReasoningSignals = [
    "because",
    "therefore",
    "so that",
    "which means",
    "if",
    "then",
    "causes",
    "leads to",
    "due to",
  ];

  const uncertaintySignals = [
    "not sure",
    "i think",
    "maybe",
    "kind of",
    "guess",
    "unsure",
    "probably",
  ];

  const empty = wordCount === 0;
  const veryShort = wordCount > 0 && wordCount < 4;
  const moderate = wordCount >= 4 && wordCount < 12;
  const substantial = wordCount >= 12;

  const reasoningHits = strongReasoningSignals.filter((signal) =>
    normalized.includes(signal)
  ).length;

  const uncertaintyHits = uncertaintySignals.filter((signal) =>
    normalized.includes(signal)
  ).length;

  let correctnessEstimate = 0.35;
  let explanationQuality = 0.3;
  let confusion = 0.65;
  let insight = 0.3;
  let learningScoreDelta = 0.03;
  let classification:
    | "success"
    | "near_miss"
    | "structural_failure"
    | "guess"
    | "no_response" = "near_miss";

  if (empty) {
    correctnessEstimate = 0;
    explanationQuality = 0;
    confusion = 0.8;
    insight = 0.1;
    learningScoreDelta = -0.02;
    classification = "no_response";
  } else if (veryShort) {
    correctnessEstimate = 0.25;
    explanationQuality = 0.15;
    confusion = 0.7;
    insight = 0.2;
    learningScoreDelta = 0.01;
    classification = "guess";
  } else if (moderate) {
    correctnessEstimate = 0.45 + reasoningHits * 0.05 - uncertaintyHits * 0.03;
    explanationQuality = 0.4 + reasoningHits * 0.06 - uncertaintyHits * 0.04;
    confusion = 0.5 - reasoningHits * 0.04 + uncertaintyHits * 0.05;
    insight = 0.45 + reasoningHits * 0.05 - uncertaintyHits * 0.03;
    learningScoreDelta = 0.04 + reasoningHits * 0.01 - uncertaintyHits * 0.01;
    classification = reasoningHits >= 1 ? "near_miss" : "guess";
  } else if (substantial) {
    correctnessEstimate = 0.6 + reasoningHits * 0.06 - uncertaintyHits * 0.03;
    explanationQuality = 0.6 + reasoningHits * 0.07 - uncertaintyHits * 0.04;
    confusion = 0.38 - reasoningHits * 0.04 + uncertaintyHits * 0.04;
    insight = 0.62 + reasoningHits * 0.05 - uncertaintyHits * 0.03;
    learningScoreDelta = 0.08 + reasoningHits * 0.01 - uncertaintyHits * 0.01;
    classification = reasoningHits >= 1 ? "success" : "near_miss";
  }

  return {
    correctnessEstimate: clamp(correctnessEstimate),
    explanationQuality: clamp(explanationQuality),
    confusion: clamp(confusion),
    insight: clamp(insight),
    learningScoreDelta: clamp(learningScoreDelta, -0.1, 0.2),
    classification,
    wordCount,
    reasoningHits,
    uncertaintyHits,
  };
}

export function buildDiagnosisDelta(
  scoring: ReturnType<typeof scoreResponse>,
  diagnosis: DiagnosisType
): DiagnosisDelta {
  const lowEvidence =
    scoring.classification === "no_response" || scoring.classification === "guess";
  const success = scoring.classification === "success";

  return {
    recall_gap:
      diagnosis === "recall_gap"
        ? success
          ? -0.15
          : lowEvidence
            ? 0.12
            : 0.05
        : 0,
    representation_gap:
      diagnosis === "representation_gap"
        ? success
          ? -0.18
          : lowEvidence
            ? 0.1
            : 0.04
        : 0,
    procedure_gap:
      diagnosis === "procedure_gap"
        ? success
          ? -0.12
          : 0.03
        : 0,
    discrimination_gap:
      diagnosis === "discrimination_gap"
        ? success
          ? -0.1
          : 0.02
        : 0,
    transfer_gap:
      diagnosis === "transfer_gap"
        ? success
          ? -0.08
          : 0.08
        : 0,
  };
}

export function buildJudgedAttempt(args: {
  body: ProbeAttemptPayload;
  topic: RouteTopic;
  scoring: ReturnType<typeof scoreResponse>;
  activeDiagnosis: DiagnosisType;
}): JudgedAttempt {
  const { body, topic, scoring, activeDiagnosis } = args;
  const rawText =
    typeof body.response === "string" ? body.response : JSON.stringify(body.response);

  return {
    attempt_id:
      body.attemptId ?? `attempt_${body.topicId}_${body.probeId}_${Date.now()}`,
    timestamp: body.submittedAt || nowIso(),
    topic_id: body.topicId,
    probe_id: body.probeId,
    stimulus: {
      stimulus_id: null,
      modality: "text",
      source: "generated",
      generator: "chatgpt",
      constraints: [],
    },
    renderer: {
      renderer_type: body.deliveryContext?.renderer_type ?? "text_renderer",
      personalization_applied: {
        tone: body.deliveryContext?.tone ?? "encouraging",
        verbosity: "medium",
        pacing: body.deliveryContext?.pacing ?? "normal",
        language_style: body.deliveryContext?.language_style ?? "plain",
        context_framing:
          body.deliveryContext?.context_framing ??
          `Prompting the learner about ${topic.name}.`,
      },
    },
    raw_response: {
      type: rawText.trim().length === 0 ? "none" : "text",
      value: rawText.trim().length === 0 ? null : rawText,
    },
    features: {
      correctness: scoring.correctnessEstimate,
      error_types:
        scoring.classification === "guess"
          ? ["low_evidence"]
          : scoring.classification === "no_response"
            ? ["no_response"]
            : scoring.classification === "near_miss"
              ? ["partial_structure"]
              : [],
      explanation_quality: scoring.explanationQuality,
      transfer_distance: null,
      confidence_alignment:
        scoring.uncertaintyHits > 0 ? "underconfident" : "aligned",
      mental_model_inferred:
        scoring.classification === "success"
          ? "partially_structured_mechanistic_model"
          : scoring.classification === "near_miss"
            ? "fragile_partial_model"
            : null,
      struggle_type:
        scoring.classification === "no_response"
          ? "non_response"
          : scoring.classification === "guess"
            ? "surface_recall"
            : scoring.classification === "near_miss"
              ? "incomplete_structure"
              : null,
    },
    mental_model_hypothesis_ids: [],
    outcome: {
      classification: scoring.classification,
      role: "diagnostic",
    },
    diagnosis_delta: buildDiagnosisDelta(scoring, activeDiagnosis),
  };
}

export function buildTopicMetricUpdate(
  topicId: string,
  scoring: ReturnType<typeof scoreResponse>
): TopicMetricUpdate {
  return {
    topicId,
    confusion: scoring.confusion,
    insight: scoring.insight,
    learningScore: scoring.learningScoreDelta,
  };
}

export function applyMetricUpdate(
  topic: RouteTopic,
  update: TopicMetricUpdate
): RouteTopic {
  if (topic.id !== update.topicId) return topic;

  return {
    ...topic,
    confusion: update.confusion ?? topic.confusion,
    insight: update.insight ?? topic.insight,
    learningScore: clamp(topic.learningScore + (update.learningScore ?? 0), 0, 1),
  };
}

export function buildVectorInfo(topic: RouteTopic): VectorInfo {
  return {
    top_k_topic_names: [topic.name],
    top_k_topic_ids: [topic.id],
    top_k_similarity_scores: [0.92],
  };
}