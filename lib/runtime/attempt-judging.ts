import type {
  DiagnosisDelta,
  DiagnosisType,
  FrontendTopicMetricUpdate,
  JudgedAttempt,
  ProbeSubmitRouteRequest,
  VectorInfo,
} from "@/types/contracts";
import { clamp, normalizeDiagnosis, nowIso, normalizeText } from "./shared";
import type { RouteTopic } from "./route-topics";

type TopicMetricUpdate = FrontendTopicMetricUpdate;

export type ProbeAttemptPayload = ProbeSubmitRouteRequest & {
  attemptId?: string;
  topicLabel?: string;
  prompt?: string;
  responseType?: "text";
  metadata?: {
    latencyMs?: number | null;
    revisionCount?: number | null;
    usedHint?: boolean | null;
    requestedClarificationBeforeAnswering?: boolean | null;
  };
};

type ScoreResponseOptions = {
  topic?: RouteTopic;
  prompt?: string | null;
  activeDiagnosis?: DiagnosisType | null;
};

type ResponseScoring = {
  correctnessEstimate: number;
  explanationQuality: number;
  confusion: number;
  insight: number;
  learningScoreDelta: number;
  evidenceStrength: number;
  judgmentConfidence: number;
  missingElements: string | null;
  misconceptionTags: string[];
  classification:
    | "success"
    | "near_miss"
    | "structural_failure"
    | "guess"
    | "no_response";
  wordCount: number;
  reasoningHits: number;
  uncertaintyHits: number;
  conceptCoverage: number;
  taskFitScore: number;
  causalChainScore: number;
  transferSignalScore: number;
  structuralSignalScore: number;
};

function getRouteTopicLabel(topic: RouteTopic) {
  return topic.topic_label.trim() || "Untitled Topic";
}

export function inferDiagnosisFromTopic(topic: RouteTopic): DiagnosisType {
  return (
    normalizeDiagnosis((topic as { diagnosis?: unknown }).diagnosis) ??
    "representation_gap"
  );
}

function tokenizeNormalized(text: string) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeSemanticToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ses") || token.endsWith("xes")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function uniqueNormalizedTokens(text: string) {
  return Array.from(
    new Set(tokenizeNormalized(text).map(normalizeSemanticToken))
  );
}

function extractTopicConceptTokens(topic?: RouteTopic) {
  const topicLabel = topic ? getRouteTopicLabel(topic) : null;

  if (!topicLabel) return [];

  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "to",
    "of",
    "for",
    "in",
    "on",
    "with",
    "by",
    "from",
    "into",
    "through",
    "how",
    "what",
    "why",
    "when",
    "where",
    "which",
    "is",
    "are",
    "was",
    "were",
    "be",
    "being",
    "been",
    "do",
    "does",
    "did",
    "can",
    "could",
    "would",
    "should",
    "concept",
    "topic",
    "idea",
  ]);

  return uniqueNormalizedTokens(topicLabel)
    .filter((token) => token.length >= 4 && !stopWords.has(token))
    .slice(0, 6);
}

function extractTaskTokens(prompt?: string | null) {
  if (!prompt) return [];

  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "to",
    "of",
    "for",
    "in",
    "on",
    "with",
    "by",
    "from",
    "into",
    "through",
    "how",
    "what",
    "why",
    "when",
    "where",
    "which",
    "is",
    "are",
    "was",
    "were",
    "be",
    "being",
    "been",
    "do",
    "does",
    "did",
    "can",
    "could",
    "would",
    "should",
    "your",
    "own",
    "words",
    "explain",
    "describe",
    "apply",
    "transfer",
    "predict",
    "compare",
    "contrast",
    "more",
    "concretely",
    "simple",
    "case",
    "involving",
    "focus",
    "especially",
    "missing",
    "piece",
    "response",
    "target",
    "concept",
    "clearer",
    "relationship",
    "mechanism",
    "cause",
    "effect",
    "chain",
  ]);

  return uniqueNormalizedTokens(prompt)
    .filter((token) => token.length >= 4 && !stopWords.has(token))
    .slice(0, 6);
}

function countHits(normalized: string, signals: string[]) {
  return signals.filter((signal) => normalized.includes(signal)).length;
}

function buildMissingElementsSummary(items: string[]) {
  const unique = Array.from(new Set(items.filter(Boolean)));
  if (!unique.length) return null;
  return unique.join("; ");
}

function inferMisconceptionTags(args: {
  classification: ResponseScoring["classification"];
  uncertaintyHits: number;
  conceptCoverage: number;
  causalChainScore: number;
  transferSignalScore: number;
  wordCount: number;
  activeDiagnosis?: DiagnosisType | null;
}) {
  const tags = new Set<string>();

  if (args.classification === "guess") {
    tags.add("low_evidence_response");
  }

  if (args.classification === "no_response") {
    tags.add("no_usable_attempt");
  }

  if (args.wordCount > 0 && args.wordCount < 6) {
    tags.add("overcompressed_response");
  }

  if (args.conceptCoverage < 0.22) {
    tags.add("weak_topic_grounding");
  }

  if (args.causalChainScore < 0.22 && args.wordCount >= 8) {
    tags.add("missing_mechanism");
  }

  if (
    args.activeDiagnosis === "transfer_gap" &&
    args.transferSignalScore < 0.18 &&
    args.wordCount >= 12
  ) {
    tags.add("weak_generalization");
  }

  if (args.uncertaintyHits >= 2) {
    tags.add("unstable_confidence");
  }

  return Array.from(tags);
}

function inferMentalModel(args: {
  classification: ResponseScoring["classification"];
  conceptCoverage: number;
  causalChainScore: number;
  structuralSignalScore: number;
}) {
  if (
    args.classification === "success" &&
    args.conceptCoverage >= 0.42 &&
    args.causalChainScore >= 0.36
  ) {
    return "coherent_structural_model";
  }

  if (
    args.classification === "near_miss" &&
    args.structuralSignalScore >= 0.34
  ) {
    return "fragile_partial_model";
  }

  if (args.classification === "guess") {
    return "surface_label_only";
  }

  return null;
}

function inferStruggleType(args: {
  classification: ResponseScoring["classification"];
  causalChainScore: number;
  conceptCoverage: number;
}) {
  if (args.classification === "no_response") return "non_response";
  if (args.classification === "guess") return "surface_recall";
  if (args.classification === "structural_failure") {
    return "misstructured_reasoning";
  }
  if (args.classification === "near_miss") {
    return args.causalChainScore >= 0.24 || args.conceptCoverage >= 0.28
      ? "productive_partial_structure"
      : "incomplete_structure";
  }
  return null;
}

function inferErrorTypes(args: {
  classification: ResponseScoring["classification"];
  causalChainScore: number;
  conceptCoverage: number;
  transferSignalScore: number;
  uncertaintyHits: number;
  activeDiagnosis?: DiagnosisType | null;
}) {
  const errors = new Set<string>();

  if (args.classification === "guess") errors.add("low_evidence");
  if (args.classification === "no_response") errors.add("no_response");
  if (args.classification === "structural_failure") {
    errors.add("misstructured_reasoning");
  }
  if (args.classification === "near_miss") errors.add("partial_structure");

  if (args.conceptCoverage < 0.22) errors.add("weak_topic_grounding");
  if (args.causalChainScore < 0.22) errors.add("missing_mechanism");
  if (
    args.activeDiagnosis === "transfer_gap" &&
    args.transferSignalScore < 0.18
  ) {
    errors.add("weak_transfer");
  }
  if (args.uncertaintyHits >= 2) errors.add("unstable_commitment");

  return Array.from(errors);
}

export function scoreResponse(
  response: string,
  options?: ScoreResponseOptions
): ResponseScoring {
  const trimmed = response.trim();
  const normalized = normalizeText(response);
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
  const activeDiagnosis = options?.activeDiagnosis ?? null;

  const strongReasoningSignals = [
    "because",
    "therefore",
    "so that",
    "which means",
    "if",
    "then",
    "causes",
    "lead to",
    "leads to",
    "due to",
    "results in",
    "as a result",
    "changes",
    "affects",
    "allows",
    "enables",
  ];

  const uncertaintySignals = [
    "not sure",
    "i think",
    "maybe",
    "kind of",
    "guess",
    "unsure",
    "probably",
    "perhaps",
    "might be",
  ];

  const structuralSignals = [
    "first",
    "next",
    "then",
    "finally",
    "step",
    "process",
    "relationship",
    "mechanism",
    "structure",
    "depends on",
    "in contrast",
    "whereas",
    "unlike",
  ];

  const transferSignals = [
    "in another case",
    "in a different situation",
    "if this changed",
    "still",
    "instead",
    "would happen",
    "similar",
    "different",
    "compare",
    "contrast",
    "applies to",
  ];

  const exampleSignals = [
    "for example",
    "for instance",
    "such as",
    "imagine",
    "suppose",
  ];

  const mechanismSignals = [
    "release",
    "released",
    "releases",
    "bind",
    "binds",
    "binding",
    "receptor",
    "receptors",
    "synapse",
    "synapses",
    "signal",
    "signals",
    "respond",
    "response",
    "change",
    "changes",
    "chemical",
    "chemicals",
    "neuron",
    "neurons",
    "cell",
    "cells",
    "across",
  ];

  const topicConceptTokens = extractTopicConceptTokens(options?.topic);
  const taskTokens = extractTaskTokens(options?.prompt);
  const responseTokens = uniqueNormalizedTokens(response);

  const reasoningHits = countHits(normalized, strongReasoningSignals);
  const uncertaintyHits = countHits(normalized, uncertaintySignals);
  const structuralHits = countHits(normalized, structuralSignals);
  const transferHits = countHits(normalized, transferSignals);
  const exampleHits = countHits(normalized, exampleSignals);
  const mechanismHits = countHits(normalized, mechanismSignals);

  const conceptHits = topicConceptTokens.filter((token) =>
    responseTokens.includes(token)
  ).length;

  const taskHits = taskTokens.filter((token) =>
    responseTokens.includes(token)
  ).length;

  const conceptCoverage =
    topicConceptTokens.length > 0
      ? clamp(conceptHits / topicConceptTokens.length, 0, 1)
      : clamp(wordCount >= 10 ? 0.45 : wordCount >= 5 ? 0.3 : 0.15, 0, 1);

  const taskFitScore =
    taskTokens.length > 0 ? clamp(taskHits / taskTokens.length, 0, 1) : 0.35;

  const causalChainScore = clamp(
    reasoningHits * 0.16 +
      structuralHits * 0.08 +
      exampleHits * 0.1 +
      mechanismHits * 0.08,
    0,
    1
  );

  const transferSignalScore = clamp(
    transferHits * 0.24 + (normalized.includes("same") ? 0.08 : 0),
    0,
    1
  );

  const structuralSignalScore = clamp(
    conceptCoverage * 0.4 +
      causalChainScore * 0.38 +
      clamp(mechanismHits * 0.04, 0, 0.2),
    0,
    1
  );

  const empty = wordCount === 0;
  const veryShort = wordCount > 0 && wordCount < 4;
  const shortButUsable = wordCount >= 4 && wordCount < 10;
  const developed = wordCount >= 10;

  let correctnessEstimate = 0.22;
  let explanationQuality = 0.18;
  let confusion = 0.7;
  let insight = 0.24;
  let learningScoreDelta = 0;
  let evidenceStrength = 0.08;
  let judgmentConfidence = 0.2;
  let classification:
    | "success"
    | "near_miss"
    | "structural_failure"
    | "guess"
    | "no_response" = "guess";

  const missingElements: string[] = [];

  if (empty) {
    correctnessEstimate = 0;
    explanationQuality = 0;
    confusion = 0.82;
    insight = 0.08;
    learningScoreDelta = -0.02;
    evidenceStrength = 0;
    judgmentConfidence = 0.96;
    classification = "no_response";
    missingElements.push("No usable response was provided.");
  } else if (veryShort) {
    correctnessEstimate = 0.14;
    explanationQuality = 0.1;
    confusion = 0.72;
    insight = 0.16;
    learningScoreDelta = 0.005;
    evidenceStrength = 0.14;
    judgmentConfidence = 0.84;
    classification = "guess";
    missingElements.push(
      "A fuller explanation or more complete evidence is needed."
    );
  } else {
    correctnessEstimate = clamp(
      0.16 +
        conceptCoverage * 0.38 +
        causalChainScore * 0.22 +
        (activeDiagnosis === "transfer_gap"
          ? transferSignalScore * 0.12
          : taskFitScore * 0.08) -
        uncertaintyHits * 0.05,
      0,
      1
    );

    explanationQuality = clamp(
      0.14 +
        causalChainScore * 0.34 +
        conceptCoverage * 0.26 +
        clamp(mechanismHits * 0.03, 0, 0.18) +
        clamp(exampleHits * 0.06, 0, 0.12) -
        uncertaintyHits * 0.04,
      0,
      1
    );

    evidenceStrength = clamp(
      0.12 +
        Math.min(wordCount / 24, 1) * 0.18 +
        conceptCoverage * 0.24 +
        structuralSignalScore * 0.2 +
        taskFitScore * 0.08,
      0,
      1
    );

    judgmentConfidence = clamp(
      0.26 +
        evidenceStrength * 0.32 +
        conceptCoverage * 0.18 +
        (empty ? 0.4 : 0) -
        uncertaintyHits * 0.05,
      0,
      0.96
    );

    confusion = clamp(
      0.74 -
        correctnessEstimate * 0.32 -
        explanationQuality * 0.2 +
        uncertaintyHits * 0.05,
      0,
      1
    );

    insight = clamp(
      0.14 +
        correctnessEstimate * 0.32 +
        explanationQuality * 0.24 -
        uncertaintyHits * 0.04,
      0,
      1
    );

    learningScoreDelta = clamp(
      -0.01 +
        correctnessEstimate * 0.08 +
        evidenceStrength * 0.05 -
        confusion * 0.015,
      -0.1,
      0.2
    );

    if (conceptCoverage < 0.2) {
      missingElements.push(
        "The response does not stay grounded in the target concept."
      );
    }

    if (causalChainScore < 0.18 && developed) {
      missingElements.push(
        "The response needs a clearer relationship, mechanism, or cause-and-effect chain."
      );
    }

    if (
      activeDiagnosis === "transfer_gap" &&
      developed &&
      transferSignalScore < 0.12
    ) {
      missingElements.push(
        "The response does not yet adapt the idea clearly enough to a changed situation."
      );
    }

    if (
      developed &&
      conceptCoverage >= 0.38 &&
      (causalChainScore >= 0.28 || mechanismHits >= 2)
    ) {
      classification = "success";
    } else if (
      shortButUsable &&
      conceptCoverage < 0.2 &&
      causalChainScore < 0.14
    ) {
      classification = "guess";
    } else if (
      developed &&
      conceptCoverage < 0.16 &&
      causalChainScore < 0.12 &&
      mechanismHits < 1
    ) {
      classification = "structural_failure";
    } else {
      classification = "near_miss";
    }
  }

  const misconceptionTags = inferMisconceptionTags({
    classification,
    uncertaintyHits,
    conceptCoverage,
    causalChainScore,
    transferSignalScore,
    wordCount,
    activeDiagnosis,
  });

  if (
    activeDiagnosis === "transfer_gap" &&
    transferSignalScore < 0.18 &&
    !empty
  ) {
    misconceptionTags.push("failed_transfer_mapping");
  }

  if (
    activeDiagnosis === "representation_gap" &&
    causalChainScore < 0.18 &&
    mechanismHits < 2 &&
    !empty
  ) {
    misconceptionTags.push("weak_structural_representation");
  }

  return {
    correctnessEstimate: clamp(correctnessEstimate, 0, 1),
    explanationQuality: clamp(explanationQuality, 0, 1),
    confusion: clamp(confusion, 0, 1),
    insight: clamp(insight, 0, 1),
    learningScoreDelta: clamp(learningScoreDelta, -0.1, 0.2),
    evidenceStrength: clamp(evidenceStrength, 0, 1),
    judgmentConfidence: clamp(judgmentConfidence, 0, 1),
    missingElements: buildMissingElementsSummary(missingElements),
    misconceptionTags: Array.from(new Set(misconceptionTags)),
    classification,
    wordCount,
    reasoningHits,
    uncertaintyHits,
    conceptCoverage,
    taskFitScore,
    causalChainScore,
    transferSignalScore,
    structuralSignalScore,
  };
}

export function buildDiagnosisDelta(
  scoring: ReturnType<typeof scoreResponse>,
  diagnosis: DiagnosisType
): DiagnosisDelta {
  const lowEvidence =
    scoring.classification === "no_response" ||
    scoring.classification === "guess";

  const success = scoring.classification === "success";
  const evidenceScale = clamp(
    0.35 + scoring.evidenceStrength * 0.45 + scoring.judgmentConfidence * 0.2,
    0.25,
    1
  );

  function scaled(value: number) {
    return Number((value * evidenceScale).toFixed(4));
  }

  return {
    recall_gap:
      diagnosis === "recall_gap"
        ? success
          ? scaled(-0.15)
          : lowEvidence
            ? scaled(0.12)
            : scaled(0.05)
        : 0,
    representation_gap:
      diagnosis === "representation_gap"
        ? success
          ? scaled(-0.18)
          : lowEvidence
            ? scaled(0.1)
            : scoring.classification === "structural_failure"
              ? scaled(0.12)
              : scaled(0.04)
        : 0,
    procedure_gap:
      diagnosis === "procedure_gap"
        ? success
          ? scaled(-0.12)
          : lowEvidence
            ? scaled(0.05)
            : scaled(0.03)
        : 0,
    discrimination_gap:
      diagnosis === "discrimination_gap"
        ? success
          ? scaled(-0.1)
          : lowEvidence
            ? scaled(0.04)
            : scaled(0.02)
        : 0,
    transfer_gap:
      diagnosis === "transfer_gap"
        ? success
          ? scaled(-0.08)
          : lowEvidence
            ? scaled(0.09)
            : scaled(0.08)
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
  const topicLabel = getRouteTopicLabel(topic);
  const rawText =
    typeof body.response === "string"
      ? body.response
      : JSON.stringify(body.response);

  const normalizedResponse = normalizeText(rawText);

  const confidenceAlignment =
    scoring.classification === "success" && scoring.uncertaintyHits >= 2
      ? "underconfident"
      : scoring.classification !== "success" &&
          normalizedResponse.includes("definitely")
        ? "overconfident"
        : scoring.uncertaintyHits > 0
          ? "underconfident"
          : "aligned";

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
      constraints: body.prompt ? [body.prompt] : [],
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
          `Prompting the learner about ${topicLabel}.`,
      },
    },
    raw_response: {
      type: rawText.trim().length === 0 ? "none" : "text",
      value: rawText.trim().length === 0 ? null : rawText,
    },
    features: {
      correctness: scoring.correctnessEstimate,
      error_types: inferErrorTypes({
        classification: scoring.classification,
        causalChainScore: scoring.causalChainScore,
        conceptCoverage: scoring.conceptCoverage,
        transferSignalScore: scoring.transferSignalScore,
        uncertaintyHits: scoring.uncertaintyHits,
        activeDiagnosis,
      }),
      explanation_quality: scoring.explanationQuality,
      transfer_distance:
        activeDiagnosis === "transfer_gap"
          ? clamp(scoring.transferSignalScore, 0, 1)
          : null,
      confidence_alignment: confidenceAlignment,
      mental_model_inferred: inferMentalModel({
        classification: scoring.classification,
        conceptCoverage: scoring.conceptCoverage,
        causalChainScore: scoring.causalChainScore,
        structuralSignalScore: scoring.structuralSignalScore,
      }),
      struggle_type: inferStruggleType({
        classification: scoring.classification,
        causalChainScore: scoring.causalChainScore,
        conceptCoverage: scoring.conceptCoverage,
      }),
      evidence_strength: scoring.evidenceStrength,
      judgment_confidence: scoring.judgmentConfidence,
      missing_elements: scoring.missingElements,
      misconception_tags: scoring.misconceptionTags,
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
    learningScore: clamp(
      topic.learningScore + (update.learningScore ?? 0),
      0,
      1
    ),
  };
}

export function buildVectorInfo(topic: RouteTopic): VectorInfo {
  const topicLabel = getRouteTopicLabel(topic);

  return {
    top_k_topic_labels: [topicLabel],
    top_k_topic_ids: [topic.id],
    top_k_similarity_scores: [0.92],
  };
}