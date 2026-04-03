import type {
  DiagnosisType,
  FrontendTopicMetricUpdate,
  ImportantRunInputs,
  InterventionModeDecision,
  ProbePlan,
  RendererModality,
  VectorInfo,
} from "@/types/contracts";
import { clamp, normalizeDiagnosis, nowIso } from "./shared";
import type { RouteTopic } from "./topic-resolution";
import { makeId } from "@/lib/utils/ids";

type TopicMetricUpdate = FrontendTopicMetricUpdate;

export function inferDiagnosisFromTopic(topic: RouteTopic): DiagnosisType {
  return (
    normalizeDiagnosis((topic as { diagnosis?: unknown }).diagnosis) ??
    "representation_gap"
  );
}

export function inferPreferredModality(message: string): RendererModality {
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

export function messageLooksClarifySeeking(message: string) {
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

export function buildImportantRunInputs(
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

export function buildInterventionModeDecision(
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

export function buildProbePlan(
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

export function buildNotApplicableProbePlan(topic: RouteTopic): ProbePlan {
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
      api: null,
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
      api: null,
      endpoint: null,
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

export function buildUpdatedMetrics(
  topicId: string,
  topic: RouteTopic
): TopicMetricUpdate {
  return {
    topicId,
    confusion: clamp(topic.confusion - 0.06, 0, 1),
    insight: clamp(topic.insight + 0.08, 0, 1),
    learningScore: clamp(topic.learningScore + 0.07, 0, 1),
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
    learningScore: update.learningScore ?? topic.learningScore,
  };
}