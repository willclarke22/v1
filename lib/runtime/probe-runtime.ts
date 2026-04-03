import { makeId } from "@/lib/utils/ids";
import type {
  DiagnosisType,
  ProbeExpectedResponseType,
  ProbeIntent,
  ProbePlan,
  ProbeType,
  RendererGenerator,
  RendererModality,
} from "@/types/contracts";
import type { RouteTopic } from "./topic-resolution";
import { inferDiagnosisFromTopic } from "./attempt-judging";

export function buildResponseBundle(args: {
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

export function buildNextProbePlan(args: {
  topic: RouteTopic;
  activeDiagnosis: DiagnosisType;
  probeIntent: ProbeIntent;
  probeType: ProbeType;
  classification:
    | "success"
    | "near_miss"
    | "structural_failure"
    | "guess"
    | "no_response";
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