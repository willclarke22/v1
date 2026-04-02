import { NextRequest, NextResponse } from "next/server";
import { mockTopics } from "@/lib/mock-topics";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { insertAttempt, insertRun, upsertTopicState } from "@/lib/persistence/myway";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type {
  DeliveredProbe,
  DeliveredResponse,
  DiagnosisDelta,
  DiagnosisType,
  EngineFuel,
  FrontendTopicMetricUpdate,
  ImportantRunInputs,
  InterventionModeDecision,
  JudgedAttempt,
  LearningSpace,
  MyWayRunResult,
  PreviousModeOutcome,
  ProbeExpectedResponseType,
  ProbeIntent,
  ProbePlan,
  ProbeSubmitRouteRequest,
  ProbeSubmitRouteResponse,
  ProbeType,
  RendererGenerator,
  RendererModality,
  RunMetadata,
  TopicState,
  VectorInfo,
} from "@/types/contracts";

type TopicMetricUpdate = FrontendTopicMetricUpdate;

type ProbeAttemptPayload = ProbeSubmitRouteRequest & {
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

type MockTopic = (typeof mockTopics)[number];
type RouteTopic = MockTopic;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function normalizeDiagnosis(raw: unknown): DiagnosisType | null {
  if (
    raw === "recall_gap" ||
    raw === "representation_gap" ||
    raw === "procedure_gap" ||
    raw === "discrimination_gap" ||
    raw === "transfer_gap"
  ) {
    return raw;
  }

  return null;
}

function isPosition(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number")
  );
}

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
      confusion: clamp(row.confusion ?? fallback?.confusion ?? 0.5, 0, 1),
      insight: clamp(row.insight ?? fallback?.insight ?? 0.5, 0, 1),
      learningScore: clamp(
        row.learning_score ?? fallback?.learningScore ?? 0.5,
        0,
        1
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

function inferDiagnosisFromTopic(topic: RouteTopic): DiagnosisType {
  return (
    normalizeDiagnosis((topic as { diagnosis?: unknown }).diagnosis) ??
    "representation_gap"
  );
}

function scoreResponse(response: string) {
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

function buildResponseBundle(args: {
  topicName: string;
  classification:
    | "success"
    | "near_miss"
    | "structural_failure"
    | "guess"
    | "no_response";
  explanationQuality: number;
  insight: number;
}) {
  const { topicName, classification, explanationQuality, insight } = args;

  if (classification === "no_response") {
    return {
      reply: `I didn’t get enough evidence yet on ${topicName}. Let’s keep the next step smaller and more concrete.`,
      suggestedAction: "Try a shorter guided probe",
      statusLabel: "Need more evidence",
      whyThisNextStep:
        "No usable attempt evidence was captured, so the safest next move is a smaller follow-up probe.",
      activeDiagnosis: "representation_gap" as DiagnosisType,
      nextMode: "probe" as const,
      probeIntent: "diagnostic" as ProbeIntent,
      probeType: "explain" as ProbeType,
    };
  }

  if (classification === "guess") {
    return {
      reply: `You gave me a first pass on ${topicName}, but it still looks a bit surface-level. I’d like to test whether the idea is really connected or still fragile.`,
      suggestedAction: "Follow with a deeper check",
      statusLabel: "Partial signal",
      whyThisNextStep:
        "The response was brief and low-evidence, so the system should gather stronger evidence before assuming understanding.",
      activeDiagnosis: "recall_gap" as DiagnosisType,
      nextMode: "probe" as const,
      probeIntent: "diagnostic" as ProbeIntent,
      probeType: "predict" as ProbeType,
    };
  }

  if (classification === "near_miss") {
    return {
      reply:
        explanationQuality >= 0.55 || insight >= 0.55
          ? `You seem partly on track with ${topicName}. There’s some real structure there, but it still needs sharpening.`
          : `You’re engaging with ${topicName}, but I’m not confident the structure is solid yet.`,
      suggestedAction: "Clarify the weak point, then re-check",
      statusLabel: "Developing understanding",
      whyThisNextStep:
        "The attempt shows meaningful progress but not enough stability to treat the concept as resolved.",
      activeDiagnosis: "representation_gap" as DiagnosisType,
      nextMode: "clarify" as const,
      probeIntent: null,
      probeType: null,
    };
  }

  if (classification === "success") {
    return {
      reply: `Nice — your response on ${topicName} shows more structure and reasoning. I’d move the next step toward transfer or application rather than repeating the same surface check.`,
      suggestedAction: "Advance to transfer/application",
      statusLabel: "Good evidence",
      whyThisNextStep:
        "The attempt contains stronger explanatory structure, so the next useful move is a harder probe rather than repeating the same check.",
      activeDiagnosis: "transfer_gap" as DiagnosisType,
      nextMode: "probe" as const,
      probeIntent: "verification" as ProbeIntent,
      probeType: "apply_transfer" as ProbeType,
    };
  }

  return {
    reply: `I got a response for ${topicName}, but I still need a little more evidence before I treat it as stable understanding.`,
    suggestedAction: "Continue probing",
    statusLabel: "Ongoing assessment",
    whyThisNextStep:
      "The evidence remains mixed, so the next step should preserve measurement while narrowing the likely block.",
    activeDiagnosis: "representation_gap" as DiagnosisType,
    nextMode: "probe" as const,
    probeIntent: "diagnostic" as ProbeIntent,
    probeType: "explain" as ProbeType,
  };
}

function buildTopicMetricUpdate(
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

function applyMetricUpdate(topic: RouteTopic, update: TopicMetricUpdate): RouteTopic {
  if (topic.id !== update.topicId) return topic;

  return {
    ...topic,
    confusion: update.confusion ?? topic.confusion,
    insight: update.insight ?? topic.insight,
    learningScore: clamp(topic.learningScore + (update.learningScore ?? 0), 0, 1),
  };
}

function buildVectorInfo(topic: RouteTopic): VectorInfo {
  return {
    top_k_topic_names: [topic.name],
    top_k_topic_ids: [topic.id],
    top_k_similarity_scores: [0.92],
  };
}

function buildImportantRunInputs(
  body: ProbeAttemptPayload,
  topic: RouteTopic,
  vectorInfo: VectorInfo
): ImportantRunInputs {
  return {
    user_message: {
      message_id: null,
      timestamp: body.submittedAt || nowIso(),
      content:
        typeof body.response === "string" ? body.response : JSON.stringify(body.response),
    },
    model_signals: {
      model_confusion: null,
      model_insight: null,
      model_version: null,
      inference_mode: null,
      latency_ms: null,
      status: "unavailable",
      error_message: null,
    },
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

function buildDiagnosisDelta(
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

function buildJudgedAttempt(args: {
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

function buildNextProbePlan(args: {
  topic: RouteTopic;
  activeDiagnosis: DiagnosisType;
  probeIntent: ProbeIntent;
  probeType: ProbeType;
  classification: ReturnType<typeof scoreResponse>["classification"];
}): ProbePlan {
  const { topic, activeDiagnosis, probeIntent, probeType, classification } = args;
  const probeId = makeId(`probe-${topic.id}`);

  const prompt =
    classification === "success"
      ? `Now apply ${topic.name} in a slightly different situation. What changes, and what stays the same?`
      : `Can you explain ${topic.name} in a more concrete way, using a specific example or clear cause-and-effect chain?`;

  const title =
    classification === "success"
      ? `Apply ${topic.name} in a new situation`
      : `Explain ${topic.name} more concretely`;

  const preferredModality: RendererModality = "text";
  const preferredGenerator: RendererGenerator = "chatgpt";
  const expectedResponseType: ProbeExpectedResponseType = "text";

  return {
    status: "applicable",
    probe_id: probeId,
    target_topic_id: topic.id,
    target_diagnosis: activeDiagnosis,
    intent: probeIntent,
    probe_type: probeType,
    expected_response_type: expectedResponseType,

    renderer_request: {
      preferred_modality: preferredModality,
      preferred_generator: preferredGenerator,
      allowed_modalities: ["text", "video", "interactive"],
      allowed_generators: ["chatgpt", "sora", "custom"],
      fallback_renderer_order: ["text", "video", "interactive"],
      must_preserve_probe_intent: true,
      must_match_requested_modality: false,
      allow_null_delivery_on_failure: false,
    },

    judging_support: {
      rubric_notes: [
        "Judge whether the learner can produce stronger structural evidence than before.",
      ],
      evidence_type_expected:
        probeType === "apply_transfer" ? ["apply_transfer"] : ["explain"],
      response_features_to_extract: ["structure", "causal_chain", "transfer_success"],
      target_misconceptions: ["surface wording without underlying model"],
      success_indicators: [
        "The learner explains the concept with connected reasoning.",
        "The learner transfers the idea into a new setup when asked.",
      ],
      failure_indicators: [
        "The learner remains vague or disconnected.",
        "The learner cannot adapt the concept outside the original wording.",
      ],
    },

    text_plan: {
      status: "planned",
      pedagogical_role: "guided_question",
      diagnostic_goal:
        probeType === "apply_transfer"
          ? `Check whether the learner can transfer ${topic.name} into a new case.`
          : `Check whether the learner can explain ${topic.name} with stronger structure.`,
      instructional_goal: title,
      why_text: [
        "Text remains the safest renderer during this contract-proving stage.",
      ],
      content_selection: {
        source_mode: "generated",
        selected_concepts: [topic.name],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: ["surface familiarity without deep structure"],
        selected_context: prompt,
      },
      scaffolding: {
        hint_policy: "available_on_request",
        max_hint_steps: 2,
        allow_partial_credit: true,
        allow_retry: true,
        max_retries: 1,
      },
      personalization_application: {
        tone: "encouraging",
        verbosity: "medium",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Stay focused on ${topic.name} and the immediate next evidence need.`,
        motivation_strategy: "curiosity_based",
        adaptation_reasons: [
          "Preserve measurement while making the next prompt concrete.",
        ],
      },
      measurement_intent: {
        what_response_should_reveal:
          probeType === "apply_transfer"
            ? ["Whether the learner can transfer the idea into a new case."]
            : ["Whether the learner can explain the concept with stronger structure."],
        what_would_count_as_progress: [
          "A more connected, concrete, or transferable explanation than the prior attempt.",
        ],
      },
    },

    video_plan: {
      status: "not_selected",
      pedagogical_role: "micro_explanation",
      diagnostic_goal: null,
      instructional_goal: null,
      why_video: [],
      visual_learning_goal: {
        what_the_learner_should_notice_first: [],
        what_should_change_over_time: [],
        what_should_remain_fixed: [],
        target_visual_contrast: [],
      },
      content_selection: {
        source_mode: null,
        selected_concepts: [],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: [],
        selected_context: null,
      },
      storyboard_intent: {
        shot_count: null,
        single_shot_vs_sequence: null,
        timing_beats: [],
        pause_for_attempt: null,
        pause_goal: null,
        must_stop_before_full_answer: null,
      },
      personalization_application: {
        tone: null,
        pacing: null,
        language_style: null,
        context_framing: null,
        visual_complexity: null,
        visual_style_preference: null,
        adaptation_reasons: [],
      },
      measurement_intent: {
        what_response_should_reveal: [],
        what_visual_takeaway_should_precede_response: [],
      },
    },

    interactive_plan: {
      status: "placeholder",
      pedagogical_role: "manipulate_and_predict",
      diagnostic_goal: null,
      instructional_goal: null,
      why_interactive: ["Future seam only during current stage."],
      task_model: {
        interaction_type: "multi_stage",
        cognitive_operation: "predict",
        statefulness: "multi_step",
      },
      scaffolding: {
        hint_policy: "available_on_request",
        max_hint_steps: 2,
        allow_partial_credit: true,
        allow_retry: true,
        max_retries: 1,
        feedback_timing: "after_submit",
      },
      personalization_application: {
        tone: "encouraging",
        pacing: "normal",
        interaction_density: "medium",
        adaptation_reasons: [],
      },
      measurement_intent: {
        telemetry_to_watch: ["latency", "revision_count", "hint_usage", "error_pattern"],
        what_response_should_reveal: [],
      },
    },

    text_payload: {
      ready_to_send: true,
      api: "responses",
      model: "gpt-5.4",
      instructions:
        "You are rendering a MyWay follow-up probe. Do not over-explain. Ask only enough to reveal learner understanding.",
      input: `${title}\n\n${prompt}`,
      personalization_snapshot: {
        tone: "encouraging",
        verbosity: "medium",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Stay focused on ${topic.name}.`,
      },
      rendering_contract: {
        output_form: "guided_question",
        answer_reveal_policy: "do_not_reveal",
        closing_action:
          probeType === "apply_transfer"
            ? "ask_for_transformation"
            : "ask_for_explanation",
        max_length: "medium",
      },
    },

    video_payload: {
      ready_to_send: false,
      api: "videos",
      endpoint: "/v1/videos",
      model: null,
      size: null,
      seconds: null,
      prompt: null,
      narration: null,
      visual_constraints: [],
    },

    interactive_payload: {
      ready_to_send: false,
      renderer: null,
      task_type: null,
      prompt: null,
      config: null,
    },
  };
}

function buildNotApplicableProbePlan(topic: RouteTopic): ProbePlan {
  return {
    status: "not_applicable",
    probe_id: makeId(`probe-na-${topic.id}`),
    target_topic_id: topic.id,
    target_diagnosis: inferDiagnosisFromTopic(topic),
    intent: null,
    probe_type: null,
    expected_response_type: null,

    renderer_request: {
      preferred_modality: null,
      preferred_generator: null,
      allowed_modalities: ["text", "video", "interactive"],
      allowed_generators: ["chatgpt", "sora", "custom"],
      fallback_renderer_order: ["text", "video", "interactive"],
      must_preserve_probe_intent: false,
      must_match_requested_modality: false,
      allow_null_delivery_on_failure: true,
    },

    judging_support: {
      rubric_notes: [],
      evidence_type_expected: [],
      response_features_to_extract: [],
      target_misconceptions: [],
      success_indicators: [],
      failure_indicators: [],
    },

    text_plan: {
      status: "not_applicable",
      pedagogical_role: null,
      diagnostic_goal: null,
      instructional_goal: null,
      why_text: [],
      content_selection: {
        source_mode: null,
        selected_concepts: [],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: [],
        selected_context: null,
      },
      scaffolding: {
        hint_policy: null,
        max_hint_steps: null,
        allow_partial_credit: null,
        allow_retry: null,
        max_retries: null,
      },
      personalization_application: {
        tone: null,
        verbosity: null,
        pacing: null,
        language_style: null,
        context_framing: null,
        motivation_strategy: null,
        adaptation_reasons: [],
      },
      measurement_intent: {
        what_response_should_reveal: [],
        what_would_count_as_progress: [],
      },
    },

    video_plan: {
      status: "not_applicable",
      pedagogical_role: null,
      diagnostic_goal: null,
      instructional_goal: null,
      why_video: [],
      visual_learning_goal: {
        what_the_learner_should_notice_first: [],
        what_should_change_over_time: [],
        what_should_remain_fixed: [],
        target_visual_contrast: [],
      },
      content_selection: {
        source_mode: null,
        selected_concepts: [],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: [],
        selected_context: null,
      },
      storyboard_intent: {
        shot_count: null,
        single_shot_vs_sequence: null,
        timing_beats: [],
        pause_for_attempt: null,
        pause_goal: null,
        must_stop_before_full_answer: null,
      },
      personalization_application: {
        tone: null,
        pacing: null,
        language_style: null,
        context_framing: null,
        visual_complexity: null,
        visual_style_preference: null,
        adaptation_reasons: [],
      },
      measurement_intent: {
        what_response_should_reveal: [],
        what_visual_takeaway_should_precede_response: [],
      },
    },

    interactive_plan: {
      status: "not_applicable",
      pedagogical_role: null,
      diagnostic_goal: null,
      instructional_goal: null,
      why_interactive: [],
      task_model: {
        interaction_type: null,
        cognitive_operation: null,
        statefulness: null,
      },
      scaffolding: {
        hint_policy: null,
        max_hint_steps: null,
        allow_partial_credit: null,
        allow_retry: null,
        max_retries: null,
        feedback_timing: null,
      },
      personalization_application: {
        tone: null,
        pacing: null,
        interaction_density: null,
        adaptation_reasons: [],
      },
      measurement_intent: {
        telemetry_to_watch: [],
        what_response_should_reveal: [],
      },
    },

    text_payload: {
      ready_to_send: false,
      api: "responses",
      model: null,
      instructions: null,
      input: null,
      personalization_snapshot: {
        tone: null,
        verbosity: null,
        pacing: null,
        language_style: null,
        context_framing: null,
      },
      rendering_contract: {
        output_form: null,
        answer_reveal_policy: null,
        closing_action: null,
        max_length: null,
      },
    },

    video_payload: {
      ready_to_send: false,
      api: "videos",
      endpoint: "/v1/videos",
      model: null,
      size: null,
      seconds: null,
      prompt: null,
      narration: null,
      visual_constraints: [],
    },

    interactive_payload: {
      ready_to_send: false,
      renderer: null,
      task_type: null,
      prompt: null,
      config: null,
    },
  };
}

function buildDeliveredProbeFromPlan(plan: ProbePlan): DeliveredProbe {
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
}): InterventionModeDecision {
  const { topic, scoring, replyBundle } = args;
  const continueWithProbe = replyBundle.nextMode === "probe";

  return {
    mode_selected: continueWithProbe ? "probe" : "clarify",
    target_topic_id: topic.id,
    active_diagnosis: replyBundle.activeDiagnosis,
    primary_block: topic.nextStep,
    decision_confidence:
      scoring.classification === "success"
        ? 0.82
        : scoring.classification === "near_miss"
          ? 0.72
          : 0.64,
    decision_reasons: [
      "This run is directly downstream of a delivered probe.",
      `The judged attempt classification was ${scoring.classification}.`,
      replyBundle.whyThisNextStep,
    ],
    clarify_score: continueWithProbe ? 0.42 : 0.76,
    probe_score: continueWithProbe ? 0.78 : 0.44,
    signal_summary: {
      raw_response_signal: bodyResponseSignal(scoring),
      evidence_quality_signal: scoring.explanationQuality,
      active_problem_signal: 0.72,
      readiness_signal: scoring.correctnessEstimate,
      history_signal: 0.66,
    },
  };
}

function buildEngineFuel(args: {
  updatedTopics: RouteTopic[];
  decision: InterventionModeDecision;
  nextProbePlan: ProbePlan;
  judgedAttempt: JudgedAttempt;
}): EngineFuel {
  const { updatedTopics, decision, nextProbePlan, judgedAttempt } = args;

  return {
    intervention_mode_decision: decision,
    previous_mode_outcome: buildPreviousModeOutcome(),
    probe_plan: nextProbePlan,
    topics: buildTopicStates(updatedTopics),
    clusters: [],
    linked_pairs: [],
    attempts: [judgedAttempt],
  };
}

function buildRunMetadata(engineFuel: EngineFuel, runId: string): RunMetadata {
  return {
    run_id: runId,
    timestamp: nowIso(),
    engine_version: "mock-contract-v2",
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
    const body = (await request.json()) as ProbeAttemptPayload;

    const rawResponse =
      typeof body?.response === "string" ? body.response : JSON.stringify(body?.response ?? "");

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

    const topicName = body.topicName || topic.name;
    const scoring = scoreResponse(rawResponse);

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
    const vectorInfo = buildVectorInfo(topic);

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
      important_run_inputs: buildImportantRunInputs(
        { ...body, response: rawResponse },
        topic,
        vectorInfo
      ),
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
        next_step:
          nextProbePlan.text_plan.instructional_goal ??
          topic.nextStep,
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
      classification: judgedAttempt.outcome.classification,
      correctnessEstimate:
        judgedAttempt.features.correctness != null
          ? String(judgedAttempt.features.correctness)
          : null,
      explanationQuality:
        judgedAttempt.features.explanation_quality != null
          ? String(judgedAttempt.features.explanation_quality)
          : null,
      insight: updatedTopicMetrics.insight ?? null,
      confusion: updatedTopicMetrics.confusion ?? null,
      attemptJson,
    });

    await upsertTopicState({
      topicId: topic.id,
      lastRunId: runId,
      topicName,
      confusion: updatedTopicMetrics.confusion ?? null,
      insight: updatedTopicMetrics.insight ?? null,
      learningScore:
        updatedTopics.find((t) => t.id === topic.id)?.learningScore ?? null,
      diagnosis: decision.active_diagnosis,
      nextStep:
        nextProbePlan.text_plan.instructional_goal ??
        topic.nextStep,
      topicJson,
    });

    const response: ProbeSubmitRouteResponse = {
      result,
      scene_update: sceneUpdate,
      continue_probe_loop:
        decision.mode_selected === "probe" && nextDeliveredProbe !== null,
      next_probe:
        decision.mode_selected === "probe" ? nextDeliveredProbe : null,
      updated_topic_metrics: updatedTopicMetrics,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in /api/probe/submit:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to submit probe attempt.",
      },
      { status: 500 }
    );
  }
}