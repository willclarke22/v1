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

type AttemptClassification =
  | "success"
  | "near_miss"
  | "structural_failure"
  | "guess"
  | "no_response";

type ResponseBundleArgs = {
  topicName: string;
  classification: AttemptClassification;
  explanationQuality: number;
  insight: number;
  evidenceStrength?: number | null;
  judgmentConfidence?: number | null;
  missingElements?: string | null;
  misconceptionTags?: string[] | null;
};

type NextProbePlanArgs = {
  topic: RouteTopic;
  activeDiagnosis: DiagnosisType;
  probeIntent: ProbeIntent;
  probeType: ProbeType;
  classification: AttemptClassification;
  evidenceStrength?: number | null;
  judgmentConfidence?: number | null;
  missingElements?: string | null;
  misconceptionTags?: string[] | null;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function selectFollowupDiagnosis(args: {
  classification: AttemptClassification;
  activeDiagnosis: DiagnosisType;
  misconceptionTags: string[];
}) {
  const { classification, activeDiagnosis, misconceptionTags } = args;

  if (classification === "success") {
    return "transfer_gap" as DiagnosisType;
  }

  if (classification === "no_response") {
    return "representation_gap" as DiagnosisType;
  }

  if (misconceptionTags.includes("failed_transfer_mapping")) {
    return "transfer_gap" as DiagnosisType;
  }

  if (
    misconceptionTags.includes("weak_structural_representation") ||
    misconceptionTags.includes("missing_mechanism")
  ) {
    return "representation_gap" as DiagnosisType;
  }

  if (misconceptionTags.includes("weak_topic_grounding")) {
    return "recall_gap" as DiagnosisType;
  }

  return activeDiagnosis;
}

function selectProbeTypeForDiagnosis(
  diagnosis: DiagnosisType,
  classification: AttemptClassification
): ProbeType {
  if (classification === "success") {
    return "apply_transfer";
  }

  switch (diagnosis) {
    case "recall_gap":
      return "predict";
    case "representation_gap":
      return "explain";
    case "procedure_gap":
      return "transform";
    case "discrimination_gap":
      return "discriminate";
    case "transfer_gap":
      return "apply_transfer";
    default:
      return "explain";
  }
}

function buildPromptForProbe(args: {
  topic: RouteTopic;
  probeType: ProbeType;
  classification: AttemptClassification;
  missingElements?: string | null;
}) {
  const { topic, probeType, classification, missingElements } = args;
  const missingSuffix = missingElements
    ? ` Focus especially on this missing piece: ${missingElements}`
    : "";

  switch (probeType) {
    case "predict":
      return `Without just repeating a definition, predict what would happen in a simple case involving ${topic.name}, and explain why.${missingSuffix}`;

    case "discriminate":
      return `What is the key difference that helps distinguish ${topic.name} from a closely related idea? Explain the difference clearly.${missingSuffix}`;

    case "transform":
      return `Walk through ${topic.name} as a step-by-step process. What happens first, what happens next, and why does the order matter?${missingSuffix}`;

    case "apply_transfer":
      return classification === "success"
        ? `Now apply ${topic.name} in a slightly different situation. What changes, what stays the same, and why?${missingSuffix}`
        : `Apply ${topic.name} in a new but related situation. Show how the same core idea still works.${missingSuffix}`;

    case "explain":
    default:
      return `Can you explain ${topic.name} in a more concrete way, using a specific example or clear cause-and-effect chain?${missingSuffix}`;
  }
}

function buildTitleForProbe(topic: RouteTopic, probeType: ProbeType) {
  switch (probeType) {
    case "predict":
      return `Predict what happens in ${topic.name}`;
    case "discriminate":
      return `Distinguish ${topic.name} clearly`;
    case "transform":
      return `Walk through ${topic.name} step by step`;
    case "apply_transfer":
      return `Apply ${topic.name} in a new situation`;
    case "explain":
    default:
      return `Explain ${topic.name} more concretely`;
  }
}

function buildJudgingSupport(args: {
  topic: RouteTopic;
  activeDiagnosis: DiagnosisType;
  probeType: ProbeType;
  missingElements?: string | null;
  misconceptionTags?: string[] | null;
}) {
  const { topic, activeDiagnosis, probeType, missingElements } = args;
  const misconceptionTags = args.misconceptionTags ?? [];

  if (probeType === "apply_transfer") {
    return {
      rubric_notes: [
        `Judge whether the learner can carry the core idea of ${topic.name} into a changed setting without losing the underlying structure.`,
        "Prefer preserved structure over surface wording.",
      ],
      evidence_type_expected: ["apply_transfer"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "structure_preservation",
        "changed_condition_handling",
        "transfer_success",
      ],
      target_misconceptions: Array.from(
        new Set([
          "surface wording without underlying model",
          "failed transfer despite apparent familiarity",
          ...misconceptionTags,
        ])
      ),
      success_indicators: [
        "The learner identifies what stays the same across cases.",
        "The learner identifies what changes in the new situation.",
        "The learner preserves the core mechanism or structure.",
      ],
      failure_indicators: [
        "The learner only repeats the original wording.",
        "The learner cannot adapt the idea to the changed case.",
        "The learner changes the core structure instead of the surface details.",
      ],
    };
  }

  if (probeType === "predict") {
    return {
      rubric_notes: [
        `Judge whether the learner can anticipate what happens in ${topic.name} rather than only naming it.`,
        "Look for a prediction tied to reasoning, not just a guess.",
      ],
      evidence_type_expected: ["predict"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "prediction_quality",
        "causal_basis",
        "topic_grounding",
      ],
      target_misconceptions: Array.from(
        new Set([
          "surface recall without usable prediction",
          ...misconceptionTags,
        ])
      ),
      success_indicators: [
        "The learner makes a concrete prediction.",
        "The learner links the prediction to a meaningful reason.",
      ],
      failure_indicators: [
        "The learner gives only a vague or unsupported prediction.",
        "The learner cannot connect the prediction to the topic structure.",
      ],
    };
  }

  if (probeType === "discriminate") {
    return {
      rubric_notes: [
        `Judge whether the learner can distinguish ${topic.name} from nearby ideas using a decisive difference.`,
        "Prefer boundary clarity over listing multiple vague similarities.",
      ],
      evidence_type_expected: ["discriminate"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "contrast_quality",
        "boundary_marker",
        "decisive_difference",
      ],
      target_misconceptions: Array.from(
        new Set(["blurred category boundary", ...misconceptionTags])
      ),
      success_indicators: [
        "The learner names a decisive contrast.",
        "The learner explains why that contrast matters.",
      ],
      failure_indicators: [
        "The learner stays vague about the difference.",
        "The learner lists features without drawing a clear boundary.",
      ],
    };
  }

  if (probeType === "transform") {
    return {
      rubric_notes: [
        `Judge whether the learner can transform ${topic.name} into a coherent ordered process.`,
        "Look for correct sequencing and why the order matters.",
      ],
      evidence_type_expected: ["explain"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "sequencing",
        "step_linkage",
        "order_dependence",
      ],
      target_misconceptions: Array.from(
        new Set([
          "misordered reasoning",
          "step list without connection",
          ...misconceptionTags,
        ])
      ),
      success_indicators: [
        "The learner describes the process in a sensible order.",
        "The learner explains why one step leads to the next.",
      ],
      failure_indicators: [
        "The learner gives disconnected steps.",
        "The learner cannot explain why the sequence works.",
      ],
    };
  }

  return {
    rubric_notes: [
      `Judge whether the learner can explain ${topic.name} with stronger structure than before.`,
      `The current diagnosis focus is ${activeDiagnosis}.`,
      missingElements
        ? `Pay special attention to the previously missing piece: ${missingElements}`
        : "Pay special attention to whether the learner shows connected reasoning rather than isolated facts.",
    ],
    evidence_type_expected: ["explain"] as Array<
      "predict" | "explain" | "discriminate" | "apply_transfer"
    >,
    response_features_to_extract: [
      "structure",
      "causal_chain",
      "topic_grounding",
      "mechanistic_clarity",
    ],
    target_misconceptions: Array.from(
      new Set([
        "surface wording without underlying model",
        ...misconceptionTags,
      ])
    ),
    success_indicators: [
      "The learner explains the concept with connected reasoning.",
      "The learner names an important relationship, mechanism, or dependency.",
      "The learner stays grounded in the target concept rather than giving generic wording.",
    ],
    failure_indicators: [
      "The learner remains vague or disconnected.",
      "The learner gives isolated facts without a relationship or mechanism.",
      "The learner cannot connect the explanation to the requested task.",
    ],
  };
}

function buildTextDiagnosticGoal(topic: RouteTopic, probeType: ProbeType) {
  switch (probeType) {
    case "predict":
      return `Check whether the learner can anticipate outcomes in ${topic.name} rather than only naming the concept.`;
    case "discriminate":
      return `Check whether the learner can distinguish ${topic.name} from nearby ideas.`;
    case "transform":
      return `Check whether the learner can restructure ${topic.name} into a coherent ordered process.`;
    case "apply_transfer":
      return `Check whether the learner can transfer ${topic.name} into a new case.`;
    case "explain":
    default:
      return `Check whether the learner can explain ${topic.name} with stronger structure.`;
  }
}

function buildMeasurementIntent(probeType: ProbeType) {
  switch (probeType) {
    case "predict":
      return {
        what_response_should_reveal: [
          "Whether the learner can make a justified prediction.",
        ],
        what_would_count_as_progress: [
          "A prediction tied to the topic structure rather than a guess.",
        ],
      };
    case "discriminate":
      return {
        what_response_should_reveal: [
          "Whether the learner can identify the decisive difference between closely related ideas.",
        ],
        what_would_count_as_progress: [
          "A clear contrast with an explanation of why it matters.",
        ],
      };
    case "transform":
      return {
        what_response_should_reveal: [
          "Whether the learner can convert the concept into a coherent ordered process.",
        ],
        what_would_count_as_progress: [
          "A connected sequence with meaningful step linkage.",
        ],
      };
    case "apply_transfer":
      return {
        what_response_should_reveal: [
          "Whether the learner can preserve the core idea in a changed setting.",
        ],
        what_would_count_as_progress: [
          "Correctly mapping the same structure into a new case.",
        ],
      };
    case "explain":
    default:
      return {
        what_response_should_reveal: [
          "Whether the learner can explain the concept with stronger structure.",
        ],
        what_would_count_as_progress: [
          "A more connected, concrete explanation than the prior attempt.",
        ],
      };
  }
}

export function buildResponseBundle(args: ResponseBundleArgs) {
  const {
    topicName,
    classification,
    explanationQuality,
    insight,
    evidenceStrength,
    judgmentConfidence,
    missingElements,
    misconceptionTags,
  } = args;

  const evidence = clamp01(evidenceStrength ?? 0.35);
  const judgment = clamp01(judgmentConfidence ?? 0.45);
  const misconceptions = misconceptionTags ?? [];
  const activeDiagnosis = selectFollowupDiagnosis({
    classification,
    activeDiagnosis:
      classification === "guess" ? "recall_gap" : "representation_gap",
    misconceptionTags: misconceptions,
  });

  if (classification === "no_response") {
    return {
      reply: `I didn’t get enough evidence yet on ${topicName}. Let’s keep the next step smaller and more concrete.`,
      suggestedAction: "Try a shorter guided probe",
      statusLabel: "Need more evidence",
      whyThisNextStep:
        "No usable attempt evidence was captured, so the safest next move is a smaller follow-up probe rather than a strong learning claim.",
      activeDiagnosis: "representation_gap" as DiagnosisType,
      nextMode: "probe" as const,
      probeIntent: "diagnostic" as ProbeIntent,
      probeType: "explain" as ProbeType,
    };
  }

  if (classification === "guess") {
    return {
      reply:
        evidence >= 0.22
          ? `You gave me a first pass on ${topicName}, but it still looks surface-level. I want to check whether the idea is really connected or still fragile.`
          : `I’m seeing very light evidence on ${topicName} so far. Before I treat this as understanding, I want one smaller, clearer check.`,
      suggestedAction: "Follow with a deeper check",
      statusLabel: "Partial signal",
      whyThisNextStep:
        "The response was low-evidence, so the system should gather stronger diagnostic evidence before assuming real understanding.",
      activeDiagnosis: "recall_gap" as DiagnosisType,
      nextMode: "probe" as const,
      probeIntent: "diagnostic" as ProbeIntent,
      probeType: "predict" as ProbeType,
    };
  }

  if (classification === "structural_failure") {
    return {
      reply: missingElements
        ? `You’re engaging with ${topicName}, but the structure is still breaking down in an important place: ${missingElements}.`
        : `You’re engaging with ${topicName}, but the structure is still not holding together clearly enough yet.`,
      suggestedAction: "Clarify the structure, then re-check",
      statusLabel: "Structure needs repair",
      whyThisNextStep:
        "The attempt contains usable evidence, but the reasoning structure is breaking down enough that a focused clarification is better than repeating the same probe immediately.",
      activeDiagnosis: activeDiagnosis,
      nextMode: "clarify" as const,
      probeIntent: null,
      probeType: null,
    };
  }

  if (classification === "near_miss") {
    const strongPartial =
      explanationQuality >= 0.55 ||
      insight >= 0.55 ||
      evidence >= 0.55 ||
      judgment >= 0.65;

    return {
      reply: strongPartial
        ? `You seem partly on track with ${topicName}. There’s some real structure there, but it still needs sharpening.`
        : `You’re engaging with ${topicName}, but I’m not confident the structure is solid yet.`,
      suggestedAction: "Clarify the weak point, then re-check",
      statusLabel: "Developing understanding",
      whyThisNextStep:
        "The attempt shows meaningful progress but not enough stability to treat the concept as resolved, so the best next move is a targeted clarification rather than a stronger transfer probe.",
      activeDiagnosis: activeDiagnosis,
      nextMode: "clarify" as const,
      probeIntent: null,
      probeType: null,
    };
  }

  if (classification === "success") {
    return {
      reply:
        judgment >= 0.7
          ? `Nice — your response on ${topicName} shows stronger structure and reasoning. I’d move the next step toward transfer or application rather than repeating the same surface check.`
          : `This looks promising on ${topicName}. I have enough evidence to push the next step harder and see whether the understanding holds in a new case.`,
      suggestedAction: "Advance to transfer/application",
      statusLabel: "Good evidence",
      whyThisNextStep:
        "The attempt contains stronger explanatory structure, so the next useful move is a harder verification probe rather than repeating the same check.",
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
    activeDiagnosis: activeDiagnosis,
    nextMode: "probe" as const,
    probeIntent: "diagnostic" as ProbeIntent,
    probeType: selectProbeTypeForDiagnosis(activeDiagnosis, classification),
  };
}

export function buildNextProbePlan(args: NextProbePlanArgs): ProbePlan {
  const {
    topic,
    activeDiagnosis,
    probeIntent,
    classification,
    evidenceStrength,
    judgmentConfidence,
    missingElements,
    misconceptionTags,
  } = args;

  const probeId = makeId(`probe-${topic.id}`);
  const finalProbeType = selectProbeTypeForDiagnosis(activeDiagnosis, classification);
  const prompt = buildPromptForProbe({
    topic,
    probeType: finalProbeType,
    classification,
    missingElements,
  });
  const title = buildTitleForProbe(topic, finalProbeType);

  const preferredModality: RendererModality = "text";
  const preferredGenerator: RendererGenerator = "chatgpt";
  const expectedResponseType: ProbeExpectedResponseType = "text";

  const evidence = clamp01(evidenceStrength ?? 0.35);
  const judgment = clamp01(judgmentConfidence ?? 0.45);

  return {
    status: "applicable",
    probe_id: probeId,
    target_topic_id: topic.id,
    target_diagnosis: activeDiagnosis,
    intent: probeIntent,
    probe_type: finalProbeType,
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

    judging_support: buildJudgingSupport({
      topic,
      activeDiagnosis,
      probeType: finalProbeType,
      missingElements,
      misconceptionTags: misconceptionTags ?? undefined,
    }),

    text_plan: {
      status: "planned",
      pedagogical_role: "guided_question",
      diagnostic_goal: buildTextDiagnosticGoal(topic, finalProbeType),
      instructional_goal: title,
      why_text: [
        "Text remains the safest renderer during this contract-proving stage.",
        evidence < 0.35
          ? "The prior evidence is still light, so a compact text probe is the safest next measurement."
          : "The next text probe can target the specific missing evidence cleanly.",
      ],
      content_selection: {
        source_mode: "generated",
        selected_concepts: [topic.name],
        selected_examples:
          finalProbeType === "apply_transfer" || finalProbeType === "predict"
            ? ["Use a simple changed case or scenario."]
            : [],
        selected_contrasts:
          finalProbeType === "discriminate"
            ? ["Contrast against a nearby but importantly different idea."]
            : [],
        selected_misconceptions: misconceptionTags ?? [],
        selected_context: prompt,
      },
      scaffolding: {
        hint_policy: "available_on_request",
        max_hint_steps: evidence < 0.3 ? 3 : 2,
        allow_partial_credit: true,
        allow_retry: true,
        max_retries: judgment < 0.45 ? 2 : 1,
      },
      personalization_application: {
        tone: "encouraging",
        verbosity: evidence < 0.3 ? "low" : "medium",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Stay focused on ${topic.name} and the immediate next evidence need.`,
        motivation_strategy: "curiosity_based",
        adaptation_reasons: [
          "Preserve measurement while making the next prompt concrete.",
          missingElements
            ? "The prompt is shaped by what was missing in the prior attempt."
            : "The prompt is shaped by the current diagnosis and probe type.",
        ],
      },
      measurement_intent: buildMeasurementIntent(finalProbeType),
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
        cognitive_operation:
          finalProbeType === "predict"
            ? "predict"
            : finalProbeType === "discriminate"
              ? "compare"
              : finalProbeType === "transform"
                ? "transform"
                : finalProbeType === "apply_transfer"
                  ? "construct"
                  : "predict",
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
        telemetry_to_watch: [
          "latency",
          "revision_count",
          "hint_usage",
          "error_pattern",
        ],
        what_response_should_reveal: [],
      },
    },

    text_payload: {
      ready_to_send: true,
      api: "responses",
      model: "gpt-5.4",
      instructions:
        "You are rendering a MyWay follow-up probe. Do not over-explain. Ask only enough to reveal learner understanding. Preserve the requested probe intent and avoid giving the final answer.",
      input: `${title}\n\n${prompt}`,
      personalization_snapshot: {
        tone: "encouraging",
        verbosity: evidence < 0.3 ? "low" : "medium",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Stay focused on ${topic.name}.`,
      },
      rendering_contract: {
        output_form: "guided_question",
        answer_reveal_policy: "do_not_reveal",
        closing_action:
          finalProbeType === "predict"
            ? "ask_for_prediction"
            : finalProbeType === "apply_transfer" ||
                finalProbeType === "transform"
              ? "ask_for_transformation"
              : "ask_for_explanation",
        max_length: evidence < 0.3 ? "short" : "medium",
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