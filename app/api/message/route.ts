import { NextResponse } from "next/server";
import { mockTopics } from "@/lib/mock-topics";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { insertRun, upsertTopicState } from "@/lib/persistence/myway";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type {
  DiagnosisType,
  DeliveredProbe,
  DeliveredResponse,
  EngineFuel,
  FrontendTopicMetricUpdate,
  ImportantRunInputs,
  InterventionModeDecision,
  LearningSpace,
  MessageRouteRequest,
  MessageRouteResponse,
  MyWayRunResult,
  PreviousModeOutcome,
  ProbePlan,
  RendererModality,
  RunMetadata,
  TopicState,
  VectorInfo,
} from "@/types/contracts";

type TopicMetricUpdate = FrontendTopicMetricUpdate;

type MockTopic = (typeof mockTopics)[number];
type RouteTopic = MockTopic;

type TopicMatchResult = {
  matchedTopic: RouteTopic | null;
  vectorInfo: VectorInfo;
  shouldCreateNewTopic: boolean;
};

const REUSE_TOPIC_THRESHOLD = 0.58;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nowIso() {
  return new Date().toISOString();
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

function inferDiagnosisFromTopic(topic: RouteTopic): DiagnosisType {
  return (
    normalizeDiagnosis((topic as { diagnosis?: unknown }).diagnosis) ??
    "representation_gap"
  );
}

function isPosition(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number")
  );
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function overlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;

  const aSet = new Set(a);
  const bSet = new Set(b);

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  return overlap / Math.max(aSet.size, bSet.size);
}

function titleCaseFromMessage(message: string) {
  const cleaned = message
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/g, "");

  if (!cleaned) return "New Topic";

  const shortened =
    cleaned.length > 36 ? `${cleaned.slice(0, 36).trim()}...` : cleaned;

  return shortened.charAt(0).toUpperCase() + shortened.slice(1);
}

function inferSeededNextStep(message: string) {
  const cleaned = message.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "Explain this idea in your own words.";
  }

  return `Explain ${cleaned.toLowerCase()} in your own words.`;
}

function inferKeywordsFromMessage(message: string): string[] {
  return tokenize(message).filter((token) => token.length > 2).slice(0, 8);
}

function computeNextTopicPosition(
  existingTopics: RouteTopic[]
): [number, number, number] {
  const count = existingTopics.length;

  if (count === 0) {
    return [0, 0, 0];
  }

  const angle = count * 1.35;
  const radius = 2.8 + count * 0.65;
  const x = Math.cos(angle) * radius;
  const y = ((count % 3) - 1) * 0.9;
  const z = Math.sin(angle) * radius * 0.75;

  return [x, y, z];
}

function buildSeededTopicFromMessage(
  message: string,
  existingTopics: RouteTopic[]
): RouteTopic {
  const baseMock = mockTopics[0];

  return {
    ...baseMock,
    id: makeId("topic"),
    name: titleCaseFromMessage(message),
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(message),
    confusion: 0.72,
    insight: 0.24,
    learningScore: 0.12,
    position: computeNextTopicPosition(existingTopics),
    scale: baseMock.scale,
  };
}

async function loadRouteTopics(): Promise<RouteTopic[]> {
  const rows = await getLatestTopicState();

  if (!rows.length) {
    return [];
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

function getTopicKeywords(topicId: string): string[] {
  switch (topicId) {
    case "topic-1":
      return ["neural", "neuron", "neurons", "signal", "signaling"];
    case "topic-2":
      return ["synaptic", "plasticity", "synapse", "learning", "change"];
    case "topic-3":
      return [
        "action",
        "potential",
        "potentials",
        "depolarization",
        "repolarization",
        "membrane",
      ];
    case "topic-4":
      return [
        "neurotransmitter",
        "neurotransmitters",
        "dopamine",
        "serotonin",
        "gaba",
        "glutamate",
      ];
    default:
      return [];
  }
}

function scoreTopicMatch(message: string, topic: RouteTopic): number {
  const normalizedMessage = normalizeText(message);
  const messageTokens = tokenize(message);
  const topicNameTokens = tokenize(topic.name);
  const fallbackKeywords = getTopicKeywords(topic.id);
  const topicKeywords =
    fallbackKeywords.length > 0 ? fallbackKeywords : topicNameTokens;

  const exactNameMatch =
    normalizedMessage === normalizeText(topic.name) ? 1 : 0;

  const topicNameContained =
    normalizedMessage.includes(normalizeText(topic.name)) ? 1 : 0;

  const keywordHits = topicKeywords.reduce((count, keyword) => {
    return count + (normalizedMessage.includes(keyword.toLowerCase()) ? 1 : 0);
  }, 0);

  const keywordScore =
    topicKeywords.length > 0 ? keywordHits / topicKeywords.length : 0;

  const tokenOverlap = overlapScore(messageTokens, topicNameTokens);
  const semanticishScore = Math.max(keywordScore, tokenOverlap);

  const score =
    exactNameMatch * 1.0 +
    topicNameContained * 0.78 +
    semanticishScore * 0.72;

  return clamp(score, 0, 1);
}

function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[]
): TopicMatchResult {
  if (!existingTopics.length) {
    return {
      matchedTopic: null,
      vectorInfo: {
        top_k_topic_names: [],
        top_k_topic_ids: [],
        top_k_similarity_scores: [],
      },
      shouldCreateNewTopic: true,
    };
  }

  const scored = existingTopics
    .map((topic) => {
      const similarity = scoreTopicMatch(message, topic);

      return {
        topic,
        similarity,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0] ?? null;

  return {
    matchedTopic:
      best && best.similarity >= REUSE_TOPIC_THRESHOLD ? best.topic : null,
    vectorInfo: {
      top_k_topic_names: scored.slice(0, 3).map((item) => item.topic.name),
      top_k_topic_ids: scored.slice(0, 3).map((item) => item.topic.id),
      top_k_similarity_scores: scored
        .slice(0, 3)
        .map((item) => clamp(item.similarity, 0, 0.98)),
    },
    shouldCreateNewTopic: !best || best.similarity < REUSE_TOPIC_THRESHOLD,
  };
}

function inferPreferredModality(message: string): RendererModality {
  const lower = message.toLowerCase();

  if (
    lower.includes("show me") ||
    lower.includes("visual") ||
    lower.includes("diagram") ||
    lower.includes("video")
  ) {
    return "video";
  }

  if (
    lower.includes("interactive") ||
    lower.includes("quiz") ||
    lower.includes("let me try")
  ) {
    return "interactive";
  }

  return "text";
}

function messageLooksClarifySeeking(message: string) {
  const lower = message.toLowerCase();

  return (
    lower.startsWith("what is ") ||
    lower.startsWith("what are ") ||
    lower.startsWith("how does ") ||
    lower.startsWith("can you explain ") ||
    lower.startsWith("explain ") ||
    lower.includes("i don't understand") ||
    lower.includes("i dont understand") ||
    lower.includes("i am confused") ||
    lower.includes("i'm confused") ||
    lower.includes("confused about") ||
    lower.includes("help me understand") ||
    lower.includes("what does") ||
    lower.includes("why is")
  );
}

function buildProbeReply(topicName: string, diagnosis: DiagnosisType): string {
  const diagnosisText =
    diagnosis === "representation_gap"
      ? "your understanding may still need a cleaner mental model"
      : diagnosis === "procedure_gap"
      ? "you may need more step-by-step execution support"
      : diagnosis === "recall_gap"
      ? "the main issue may be retrieval rather than deep structure"
      : diagnosis === "discrimination_gap"
      ? "the main issue may be distinguishing similar concepts"
      : "the main issue may be transferring the idea into a new setting";

  return `I think your message connects most strongly to ${topicName}. Right now, ${diagnosisText}, so I’m moving us there and preparing a focused next step to reveal what you already understand.`;
}

function buildClarifyReply(topicName: string, diagnosis: DiagnosisType): string {
  const diagnosisText =
    diagnosis === "representation_gap"
      ? "a cleaner mental model"
      : diagnosis === "procedure_gap"
      ? "a clearer sequence of steps"
      : diagnosis === "recall_gap"
      ? "a quick retrieval-oriented reminder"
      : diagnosis === "discrimination_gap"
      ? "a sharper contrast between similar ideas"
      : "help bridging the idea into a new setting";

  return `I think your message connects most strongly to ${topicName}. Right now, the best next move is clarification rather than measurement, because you may first need ${diagnosisText}. I’ll stabilize the idea a bit before asking you to demonstrate it.`;
}

function buildSuggestedAction(
  topicName: string,
  nextStep: string,
  mode: "clarify" | "probe"
): string {
  if (mode === "clarify") {
    return `First, let’s stabilize ${topicName.toLowerCase()} so the next step feels clearer: ${nextStep}`;
  }

  return `Next, let’s work on ${topicName.toLowerCase()}: ${nextStep}`;
}

function buildStatusLabel(createdTopic: boolean, mode: "clarify" | "probe") {
  const topicLabel = createdTopic ? "Created new topic" : "Matched existing topic";
  return `${topicLabel} • ${mode === "clarify" ? "Clarify mode" : "Probe mode"}`;
}

function buildUpdatedMetrics(topicId: string, topic: RouteTopic): TopicMetricUpdate {
  return {
    topicId,
    confusion: clamp(topic.confusion - 0.06, 0, 1),
    insight: clamp(topic.insight + 0.08, 0, 1),
    learningScore: clamp(topic.learningScore + 0.07, 0, 1),
  };
}

function applyMetricUpdate(topic: RouteTopic, update: TopicMetricUpdate): RouteTopic {
  if (topic.id !== update.topicId) return topic;

  return {
    ...topic,
    confusion: update.confusion ?? topic.confusion,
    insight: update.insight ?? topic.insight,
    learningScore: update.learningScore ?? topic.learningScore,
  };
}

function buildImportantRunInputs(
  message: string,
  vectorInfo: VectorInfo
): ImportantRunInputs {
  return {
    user_message: {
      message_id: null,
      timestamp: nowIso(),
      content: message,
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
      run_kind: "initial_question",
      is_response_to_delivered_probe: false,
      prior_mode_selected: null,
      prior_probe_was_applicable: null,
      prior_probe_id: null,
      prior_mode_outcome_available: null,
    },
    new_attempt: {
      status: "absent",
      attempt_id: null,
      timestamp: null,
      originating_run_id: null,
      source_message_id: null,
      linked_probe_id: null,
      linked_stimulus_id: null,
      linked_topic_id: null,
      linked_cluster_id: null,
      linked_resolution_contract_id: null,
      response_type: null,
      completion_status: null,
      raw_response: null,
      delivery_context: {
        renderer_type: null,
        generator: null,
        modality: null,
        tone: null,
        pacing: null,
        language_style: null,
        context_framing: null,
      },
      submission_metadata: {
        latency_ms: null,
        revision_count: null,
        used_hint: null,
        requested_clarification_before_answering: null,
      },
    },
    vector_info: vectorInfo,
    uploaded_content: [],
  };
}

function buildInterventionModeDecision(
  topic: RouteTopic,
  vectorInfo: VectorInfo,
  preferredModality: RendererModality,
  message: string,
  createdTopic: boolean
): InterventionModeDecision {
  const diagnosis = inferDiagnosisFromTopic(topic);
  const topSimilarity = vectorInfo.top_k_similarity_scores[0] ?? 0.3;
  const clarifySeeking = messageLooksClarifySeeking(message);

  const readinessSignal =
    preferredModality === "interactive"
      ? 0.74
      : preferredModality === "video"
      ? 0.66
      : 0.62;

  const clarifyScore = clamp(
    0.22 +
      (createdTopic ? 0.22 : 0) +
      (clarifySeeking ? 0.26 : 0) +
      (topSimilarity < 0.62 ? 0.14 : 0),
    0,
    0.95
  );

  const probeScore = clamp(
    0.28 +
      (!createdTopic ? 0.18 : 0) +
      (topSimilarity >= 0.62 ? 0.18 : 0.06) +
      (clarifySeeking ? 0.02 : 0.14) +
      (topic.nextStep ? 0.1 : 0),
    0,
    0.95
  );

  const mode_selected: "clarify" | "probe" =
    clarifyScore >= probeScore ? "clarify" : "probe";

  const decision_reasons =
    mode_selected === "clarify"
      ? [
          `The message matched most strongly to ${topic.name}.`,
          createdTopic
            ? "This is a very fresh or newly created topic, so stabilization is safer than immediate measurement."
            : "The message reads more like a request for explanation than a readiness signal for assessment.",
          `The current block still appears to be: ${topic.nextStep}.`,
        ]
      : [
          `The message matched most strongly to ${topic.name}.`,
          `The next unresolved learning move appears to be: ${topic.nextStep}.`,
          "This run looks ready for a focused measurement step rather than clarification-only stabilization.",
        ];

  return {
    mode_selected,
    target_topic_id: topic.id,
    active_diagnosis: diagnosis,
    primary_block: topic.nextStep,
    decision_confidence:
      mode_selected === "clarify"
        ? clamp(0.52 + clarifyScore * 0.32, 0, 0.95)
        : clamp(0.52 + probeScore * 0.32, 0, 0.95),
    decision_reasons,
    clarify_score: clarifyScore,
    probe_score: probeScore,
    signal_summary: {
      raw_response_signal: null,
      evidence_quality_signal: null,
      active_problem_signal: 0.72,
      readiness_signal: readinessSignal,
      history_signal: createdTopic ? 0.18 : 0.42,
    },
  };
}

function buildPreviousModeOutcome(): PreviousModeOutcome {
  return {
    mode_selected: "clarify",
    reasons: [
      "No previous run is available in this mock route, so this is a cold-start placeholder.",
    ],
    confidence: 0.18,
    clarify_outcome: "not_applicable",
  };
}

function buildProbePlan(
  topic: RouteTopic,
  decision: InterventionModeDecision,
  message: string
): ProbePlan {
  const preferredModality = inferPreferredModality(message);
  const probeId = makeId(`probe-${topic.id}`);
  const title = topic.nextStep;
  const instruction = `Work on ${topic.name.toLowerCase()} by completing this task: ${topic.nextStep}`;

  return {
    status: "applicable",
    probe_id: probeId,
    target_topic_id: topic.id,
    target_diagnosis: decision.active_diagnosis,
    intent: "diagnostic",
    probe_type: "explain",
    expected_response_type: "text",

    renderer_request: {
      preferred_modality: preferredModality,
      preferred_generator:
        preferredModality === "video"
          ? "sora"
          : preferredModality === "interactive"
          ? "custom"
          : "chatgpt",
      allowed_modalities: ["text", "video", "interactive"],
      allowed_generators: ["chatgpt", "sora", "custom"],
      fallback_renderer_order: ["text", "video", "interactive"],
      must_preserve_probe_intent: true,
      must_match_requested_modality: false,
      allow_null_delivery_on_failure: false,
    },

    judging_support: {
      rubric_notes: [
        "Look for whether the learner can explain the mechanism in their own words.",
        "Prefer structural understanding over phrase matching.",
      ],
      evidence_type_expected: ["explain"],
      response_features_to_extract: [
        "mechanistic clarity",
        "missing step",
        "misordered reasoning",
      ],
      target_misconceptions: [
        "surface familiarity without mechanism",
        "memorized wording without causal structure",
      ],
      success_indicators: [
        "The learner explains the concept in a connected way.",
        "The learner names the critical steps or relationships.",
      ],
      failure_indicators: [
        "The learner gives only isolated facts.",
        "The learner cannot connect the concept to the asked task.",
      ],
    },

    text_plan: {
      status: "planned",
      pedagogical_role: "guided_question",
      diagnostic_goal: `Check whether the learner can explain ${topic.name} coherently.`,
      instructional_goal: `Move the learner one step closer to ${topic.nextStep}.`,
      why_text: [
        "Text is the safest fallback renderer during contract-proving.",
        "A text prompt keeps the plan easy to judge and easy to store.",
      ],
      content_selection: {
        source_mode: "generated",
        selected_concepts: [topic.name],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: ["surface familiarity without mechanism"],
        selected_context: topic.nextStep,
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
        context_framing: `Stay grounded in ${topic.name} and the learner's current next step.`,
        motivation_strategy: "curiosity_based",
        adaptation_reasons: [
          "Use supportive prompting while preserving measurement value.",
        ],
      },
      measurement_intent: {
        what_response_should_reveal: [
          "Whether the learner understands the key structure of the topic.",
          "Whether the learner can explain rather than merely name it.",
        ],
        what_would_count_as_progress: [
          "A coherent explanation with at least one meaningful relationship or mechanism.",
        ],
      },
    },

    video_plan: {
      status: preferredModality === "video" ? "planned" : "not_selected",
      pedagogical_role: "micro_explanation",
      diagnostic_goal: `Support visual grounding for ${topic.name}.`,
      instructional_goal: `Make the next step more concrete before asking for a response.`,
      why_video: ["The message suggests a visual explanation may help."],
      visual_learning_goal: {
        what_the_learner_should_notice_first: [topic.name],
        what_should_change_over_time: [
          "The causal or temporal progression of the concept.",
        ],
        what_should_remain_fixed: ["The core entities involved."],
        target_visual_contrast: ["correct progression vs incomplete mental model"],
      },
      content_selection: {
        source_mode: "generated",
        selected_concepts: [topic.name],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: [],
        selected_context: topic.nextStep,
      },
      storyboard_intent: {
        shot_count: 3,
        single_shot_vs_sequence: "multi_shot",
        timing_beats: [
          "Introduce the concept",
          "Show the key relationship",
          "Pause before full resolution",
        ],
        pause_for_attempt: true,
        pause_goal:
          "Invite the learner to explain what they now think is happening.",
        must_stop_before_full_answer: true,
      },
      personalization_application: {
        tone: "encouraging",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Explain only enough to support the next attempt in ${topic.name}.`,
        visual_complexity: "moderate",
        visual_style_preference: "diagrammatic",
        adaptation_reasons: [
          "The user may benefit from a visual bridge into the probe.",
        ],
      },
      measurement_intent: {
        what_response_should_reveal: [
          "Whether the learner can describe the core mechanism after visual support.",
        ],
        what_visual_takeaway_should_precede_response: [
          "The learner should notice the central structural relationship before answering.",
        ],
      },
    },

    interactive_plan: {
      status: preferredModality === "interactive" ? "planned" : "placeholder",
      pedagogical_role: "manipulate_and_predict",
      diagnostic_goal: `Eventually test whether the learner can act on ${topic.name}, not just describe it.`,
      instructional_goal: `Preserve a future seam for richer interactive probes.`,
      why_interactive: [
        "This remains a placeholder seam during the current contract-proving phase.",
      ],
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
        adaptation_reasons: ["Reserved for future interactive renderer support."],
      },
      measurement_intent: {
        telemetry_to_watch: [
          "latency",
          "revision_count",
          "hint_usage",
          "error_pattern",
        ],
        what_response_should_reveal: [
          "Whether the learner can successfully manipulate the concept.",
        ],
      },
    },

    text_payload: {
      ready_to_send: true,
      api: "responses",
      model: "gpt-5.4",
      instructions:
        "You are rendering a MyWay probe. Do not over-explain. Ask only enough to reveal the learner's understanding.",
      input: `${title}\n\n${instruction}\n\nAsk the learner to explain what is happening in their own words.`,
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
        closing_action: "ask_for_explanation",
        max_length: "medium",
      },
    },

    video_payload: {
      ready_to_send: preferredModality === "video",
      api: "videos",
      endpoint: "/v1/videos",
      model: preferredModality === "video" ? "sora-2" : null,
      size: "1280x720",
      seconds: 8,
      prompt:
        preferredModality === "video"
          ? `Create a concise educational animation about ${topic.name}. Show only enough to prepare the learner for a follow-up explanation task about: ${topic.nextStep}.`
          : null,
      narration:
        preferredModality === "video"
          ? `Guide the learner toward the key structure of ${topic.name}, then pause before giving the full answer.`
          : null,
      visual_constraints: [
        "Keep visuals clean and educational.",
        "Do not fully resolve the answer before the learner responds.",
      ],
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

function buildDeliveredProbe(
  probePlan: ProbePlan,
  topic: RouteTopic
): DeliveredProbe {
  const modality = probePlan.renderer_request.preferred_modality ?? "text";
  const generator = probePlan.renderer_request.preferred_generator ?? "chatgpt";

  const title = topic.nextStep;
  const instructions = `Work on ${topic.name.toLowerCase()} by completing this task: ${topic.nextStep}`;

  return {
    probe_id: probePlan.probe_id,
    target_topic_id: probePlan.target_topic_id,
    target_diagnosis: probePlan.target_diagnosis,
    intent: probePlan.intent,
    probe_type: probePlan.probe_type,

    renderer_type:
      modality === "interactive"
        ? "interactive_renderer"
        : modality === "video"
        ? "video_renderer"
        : "text_renderer",
    generator,
    modality,

    title,
    instructions,

    actual_tone: "encouraging",
    actual_pacing: "normal",
    actual_language_style: "plain",
    actual_context_framing: `Stay focused on ${topic.name} and reveal learner understanding.`,

    expected_response_type: probePlan.expected_response_type,

    stimulus_id: `stimulus-${probePlan.probe_id}`,
    payload_snapshot:
      modality === "video"
        ? { video_payload: probePlan.video_payload }
        : modality === "interactive"
        ? { interactive_payload: probePlan.interactive_payload }
        : { text_payload: probePlan.text_payload },
  };
}

function buildDeliveredResponse(
  topic: RouteTopic,
  decision: InterventionModeDecision,
  probePlan: ProbePlan
): DeliveredResponse {
  const reply =
    decision.mode_selected === "clarify"
      ? buildClarifyReply(
          topic.name,
          decision.active_diagnosis ?? "representation_gap"
        )
      : buildProbeReply(
          topic.name,
          decision.active_diagnosis ?? "representation_gap"
        );

  return {
    learner_message: {
      text: reply,
      tone: "encouraging",
      mode: decision.mode_selected,
    },
    delivered_probe:
      decision.mode_selected === "probe" && probePlan.status === "applicable"
        ? buildDeliveredProbe(probePlan, topic)
        : null,
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

function buildEngineFuel(
  updatedTopics: RouteTopic[],
  decision: InterventionModeDecision,
  probePlan: ProbePlan
): EngineFuel {
  return {
    intervention_mode_decision: decision,
    previous_mode_outcome: buildPreviousModeOutcome(),
    probe_plan: probePlan,
    topics: buildTopicStates(updatedTopics),
    clusters: [],
    linked_pairs: [],
    attempts: [],
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
  targetTopicId: string,
  learningSpace: LearningSpace
): MessageRouteResponse["scene_update"] {
  return {
    target_topic_id: targetTopicId,
    camera_destination_topic_id: targetTopicId,
    arrival_mode: "warp",
    learning_space: learningSpace,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MessageRouteRequest & {
      message?: string;
    };

    const message = body.messageText?.trim() || body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 }
      );
    }

    const existingTopics = await loadRouteTopics();
    const matchResult = resolveTopicForMessage(message, existingTopics);

    const createdTopic = matchResult.shouldCreateNewTopic
      ? buildSeededTopicFromMessage(message, existingTopics)
      : null;

    const routeTopics = createdTopic
      ? [...existingTopics, createdTopic]
      : existingTopics;

    if (!routeTopics.length) {
      return NextResponse.json(
        { error: "No topics are available." },
        { status: 500 }
      );
    }

    const topic = createdTopic ?? matchResult.matchedTopic ?? routeTopics[0];

    if (!topic) {
      return NextResponse.json(
        { error: "Unable to resolve a topic." },
        { status: 500 }
      );
    }

    const targetTopicId = topic.id;

    const vectorInfo: VectorInfo = {
      ...matchResult.vectorInfo,
      top_k_topic_names:
        matchResult.vectorInfo.top_k_topic_names.length > 0
          ? matchResult.vectorInfo.top_k_topic_names
          : [topic.name],
      top_k_topic_ids:
        matchResult.vectorInfo.top_k_topic_ids.length > 0
          ? matchResult.vectorInfo.top_k_topic_ids
          : [topic.id],
      top_k_similarity_scores:
        matchResult.vectorInfo.top_k_similarity_scores.length > 0
          ? matchResult.vectorInfo.top_k_similarity_scores
          : [createdTopic ? 0.24 : 0.72],
    };

    const updatedTopicMetrics = buildUpdatedMetrics(targetTopicId, topic);
    const updatedTopics = routeTopics.map((t) =>
      applyMetricUpdate(t, updatedTopicMetrics)
    );

    const preferredModality = inferPreferredModality(message);
    const decision = buildInterventionModeDecision(
      topic,
      vectorInfo,
      preferredModality,
      message,
      Boolean(createdTopic)
    );

    const probePlan =
      decision.mode_selected === "probe"
        ? buildProbePlan(topic, decision, message)
        : buildNotApplicableProbePlan(topic);

    const deliveredResponse = buildDeliveredResponse(topic, decision, probePlan);
    const engineFuel = buildEngineFuel(updatedTopics, decision, probePlan);
    const learningSpace = buildLearningSpace(updatedTopics) as LearningSpace;

    const runId = makeId("run");

    const result: MyWayRunResult = {
      run_metadata: buildRunMetadata(engineFuel, runId),
      important_run_inputs: buildImportantRunInputs(message, vectorInfo),
      engine_fuel: engineFuel,
      delivered_response: deliveredResponse,
      learning_space: learningSpace,
    };

    const sceneUpdate = buildSceneUpdate(targetTopicId, learningSpace);
    const suggestedAction = buildSuggestedAction(
      topic.name,
      topic.nextStep,
      decision.mode_selected
    );
    const statusLabel = buildStatusLabel(
      Boolean(createdTopic),
      decision.mode_selected
    );

    await insertRun({
      id: runId,
      runType: "message",
      userMessage: message,
      sourceMessageId: result.important_run_inputs.user_message.message_id,
      targetTopicId,
      modeSelected: decision.mode_selected,
      activeDiagnosis: decision.active_diagnosis,
      replyText: deliveredResponse.learner_message.text,
      suggestedAction,
      runResultJson: result,
    });

    await upsertTopicState({
      topicId: topic.id,
      lastRunId: runId,
      topicName: topic.name,
      confusion: updatedTopicMetrics.confusion ?? null,
      insight: updatedTopicMetrics.insight ?? null,
      learningScore:
        updatedTopics.find((t) => t.id === topic.id)?.learningScore ?? null,
      diagnosis: decision.active_diagnosis,
      nextStep: topic.nextStep,
      topicJson: {
        topic_id: topic.id,
        topic_name: topic.name,
        next_step: topic.nextStep,
        inferred_keywords: inferKeywordsFromMessage(message),
        updated_topic_metrics: updatedTopicMetrics,
        learning_space_topic:
          learningSpace.topics?.find((t) => t.topic_id === topic.id) ?? null,
      },
    });

    const response: MessageRouteResponse = {
      result,
      scene_update: sceneUpdate,
      intervention: {
        mode_selected: decision.mode_selected,
        target_topic_id: decision.target_topic_id,
        active_diagnosis: decision.active_diagnosis,
        probe_available:
          deliveredResponse.delivered_probe !== null
            ? "available"
            : "not_applicable",
      },
      suggested_action: suggestedAction,
      status_label: statusLabel,
      updated_topic_metrics: updatedTopicMetrics,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/message failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while processing the message.",
      },
      { status: 500 }
    );
  }
}