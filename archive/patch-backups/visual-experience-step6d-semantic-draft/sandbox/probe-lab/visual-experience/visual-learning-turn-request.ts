import type { ProbeType } from "@/lib/engine/schemas/shared";
import type {
  VisualLearningTurnInput,
  VisualLearningTurnOutput,
} from "./visual-learning-turn";
import {
  DEFAULT_BRIDGE_LEVEL,
  DEFAULT_JARGON_LEVEL,
  DEFAULT_VISUAL_LEARNING_PROBE_TYPES,
  DEFAULT_VISUAL_LEARNING_RENDERER_CAPABILITIES,
} from "./visual-learning-turn";
import {
  krebsVisualLearningTurnInputExample,
  krebsVisualLearningTurnProceedExample,
  unclearVisualLearningTurnOutputExample,
} from "./visual-learning-turn-examples";

export type VisualLearningTurnRequestBody = {
  learner_message?: string;
  input_kind?: "user_message" | "evaluated_probe_attempt";
  topic_label?: string | null;
  root_problem?: string | null;
  bridge_level?: string | null;
  jargon_level?: string | null;
  preferred_style?: string | null;
  available_probe_types?: ProbeType[];
  force_clarification?: boolean;
  provider?: "scaffold" | "deepseek" | "openai" | string;
  use_fallback_on_invalid?: boolean;
  example?: "krebs" | "unclear" | string;
};

export type VisualLearningTurnModelRequest = {
  model_task: "visual_learning_turn_planner";
  schema_version: "myway_visual_learning_turn_model_request_debug_v1";
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
  response_contract: Record<string, unknown>;
  compiler_input: VisualLearningTurnInput;
  tuning_notes: string[];
  prompt_stats: {
    system_chars: number;
    user_chars: number;
    total_chars: number;
    available_probe_type_count: number;
  };
};

export const VISUAL_LEARNING_TURN_SYSTEM_PROMPT = `You are the MyWay Visual Learning Turn Planner.

Return JSON only. Match the exact wrapper shape.

First decide whether to proceed or ask one clarification question.

If unclear, return only:
schema_version, turn_status: "needs_clarification", clarification_gate.

If clear, return turn_status: "proceed" and include:
clarification_gate, topic_resolution, diagnosis, learning_focus, visual_experience, guided_interaction, followup_probe, personalization_hypotheses, confidence.

Hard nesting rules:
- root_problem and target_takeaway belong inside learning_focus.
- orientation_segments belongs inside visual_experience.
- semantic_scene_plan belongs inside visual_experience.
- scene entities are visual_experience.semantic_scene_plan.entities.
- scene beats are visual_experience.semantic_scene_plan.beats.
- each beat must cite source_orientation_segment_ids.
- followup_probe must be a full ProbeContractModelOutput.

Root problem = why the learner is stuck.
Orientation = learner-facing source of truth for the scene.
Scene plan = visual version of the orientation.
Probe = tests learning_focus.target_takeaway.

Do not use asset ids or file paths. Describe visual_need only. MyWay resolves assets later.
Use plain language when bridge_level is bridge_0 or jargon_level is none.
Return no durable personalization_delta before an attempt; only personalization_hypotheses.`;

export const VISUAL_LEARNING_TURN_RESPONSE_CONTRACT = {
  schema_version: "myway_visual_learning_turn_output_v1",
  turn_status: '"needs_clarification" or "proceed"',
  clarification_gate: {
    schema_version: "myway_turn_clarification_gate_output_v1",
    action:
      '"proceed" | "ask_clarifying_question" | "offer_scope_choices" | "confirm_interpretation"',
    confidence: {
      overall: "number from 0 to 1",
      topic: "number from 0 to 1",
      learner_goal: "number from 0 to 1",
    },
    clarification_question: "string or null",
    scope_choices: [
      {
        id: "string",
        label: "string",
        description: "string",
      },
    ],
    reason: "string",
  },
  topic_resolution: {
    topic_label: "required only when turn_status is proceed",
    topic_id: "string or null",
    topic_confidence: "number from 0 to 1",
    topic_reference_type: '"new_topic" | "existing_topic" | "topic_refinement" | "unknown"',
    reason: "string",
  },
  diagnosis: {
    schema_version: "diagnosis_model_output_v1",
    diagnosis:
      '"unknown" | "no_gap_detected" | "recall_gap" | "representation_gap" | "procedure_gap" | "discrimination_gap" | "transfer_gap" | "metacognitive_gap"',
    diagnosis_confidence: "number from 0 to 1",
    next_action:
      '"ask_clarifying_question" | "generate_probe_contract" | "give_feedback" | "summarize_progress"',
    next_action_confidence: "number from 0 to 1",
    suggested_question: "string or null",
  },
  learning_focus: {
    root_problem: "required only when turn_status is proceed",
    target_takeaway: "required only when turn_status is proceed",
    why_visual_first: "required only when turn_status is proceed",
  },
  visual_experience: {
    schema_version: "myway_visual_experience_compiler_output_v1",
    title: "string",
    experience_mode:
      '"model_selected_scene" | "process_loop" | "mechanism" | "compare_contrast" | "spatial_structure" | "generic_scene"',
    orientation_segments: [
      {
        id: "string",
        text: "learner-facing sentence",
        purpose:
          '"introduce_scene" | "show_main_structure" | "show_motion_or_change" | "show_relationship" | "prepare_interaction" | "connect_to_probe"',
      },
    ],
    semantic_scene_plan: {
      entities: [
        {
          id: "string",
          display_name: "string",
          semantic_role: "string",
          visual_need: {
            description: "string",
            semantic_tags: ["string"],
            preferred_render_kind:
              '"sphere" | "box" | "arrow" | "path" | "label" | "particle" | "registered_asset" | "any"',
            fallback_allowed: true,
          },
          position_hint: [0, 0, 0],
        },
      ],
      relationships: [
        {
          id: "string",
          source_entity_id: "entity id",
          target_entity_ids: ["entity id"],
          relationship_type:
            '"connects_to" | "contrasts_with" | "causes" | "becomes" | "enters" | "leaves" | "cycles_back" | "supports_takeaway"',
          explanation: "string",
        },
      ],
      beats: [
        {
          id: "string",
          title: "string",
          source_orientation_segment_ids: ["orientation segment id"],
          duration_ms: 4500,
          active_entity_ids: ["entity id"],
          actions: [
            {
              id: "string",
              type:
                '"show_entity" | "highlight_entity" | "move_entity" | "trace_path" | "show_label" | "show_relationship" | "fade_in" | "fade_out" | "pause_for_check"',
              target_entity_id: "entity id",
              narration: "string or null",
              params: {},
            },
          ],
        },
      ],
      camera_notes: "string or null",
      interaction_notes: "string or null",
    },
  },
  guided_interaction: {
    instruction: "string",
    required_action_type:
      '"orbit" | "zoom" | "scrub_beats" | "inspect_entity" | "compare_entities" | "drag_object" | "toggle_layer" | "answer_in_scene" | "none"',
    target_entity_ids: ["entity id"],
    success_observation: "string or null",
  },
  followup_probe: {
    schema_version: "probe_contract_model_output_v1",
    probe_type: "must be one of available_probe_types",
    expected_attempt_type:
      "text | single_choice | multi_choice | ordered_items | drag_drop_placements | numeric | graph | audio_response | video_click | none | unknown",
    prompt: {
      root_problem_explanation: "string",
      reshaping_explanation: "string",
      task: "string",
      full_prompt: "string",
    },
    presentation_support: [],
    answer_key: {},
    misconception_markers: [],
    renderer_params: {},
    delivery_context: {
      bridge_level: "bridge_0 | bridge_1 | bridge_2 | full_bridge",
      language_policy: {
        jargon_level: "none | light | standard | full",
      },
      presentation_styles_used: [],
      support_kinds_used: [],
      example_domains_used: [],
      personalization_signals_used: [],
    },
    confidence: "number from 0 to 1",
  },
  personalization_hypotheses: [
    {
      kind: "bridge_level | jargon_level | presentation_style | support_kind | probe_type | verification_pattern",
      value: "string",
      direction: "prefer | avoid | verify",
      scope: "global | topic | diagnosis_label | probe_type",
      scope_key: "string or null",
      confidence: "number from 0 to 1",
      reason: "string",
    },
  ],
  confidence: "number from 0 to 1",
};

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeProbeTypes(value: unknown): ProbeType[] {
  if (!Array.isArray(value)) return DEFAULT_VISUAL_LEARNING_PROBE_TYPES;

  const allowed = new Set(DEFAULT_VISUAL_LEARNING_PROBE_TYPES);
  const normalized = value.filter((item): item is ProbeType => typeof item === "string" && allowed.has(item as ProbeType));

  return normalized.length ? normalized : DEFAULT_VISUAL_LEARNING_PROBE_TYPES;
}

export function buildVisualLearningTurnInput(
  body: VisualLearningTurnRequestBody = {},
): VisualLearningTurnInput {
  if (body.example === "krebs") return krebsVisualLearningTurnInputExample;

  const learnerMessage = asString(body.learner_message, "I can’t picture the Krebs cycle.");
  const bridgeLevel = body.bridge_level === "bridge_1" || body.bridge_level === "bridge_2" || body.bridge_level === "full_bridge"
    ? body.bridge_level
    : DEFAULT_BRIDGE_LEVEL;

  const jargonLevel = body.jargon_level === "light" || body.jargon_level === "standard" || body.jargon_level === "full"
    ? body.jargon_level
    : DEFAULT_JARGON_LEVEL;

  return {
    schema_version: "myway_visual_learning_turn_input_v1",
    input_kind: "user_message",
    user_message: {
      text: learnerMessage,
    },
    evaluated_probe_attempt: null,
    known_topic_state: body.topic_label
      ? {
          topic_id: null,
          topic_label: body.topic_label,
          recent_diagnoses: [],
        }
      : null,
    personalization_context: {
      bridge_level: bridgeLevel,
      language_policy: {
        jargon_level: jargonLevel,
      },
      preferred_style:
        body.preferred_style === "plain_direct" ||
        body.preferred_style === "gentle_coaching" ||
        body.preferred_style === "analogy_based" ||
        body.preferred_style === "metaphor_based" ||
        body.preferred_style === "concrete_examples" ||
        body.preferred_style === "step_by_step" ||
        body.preferred_style === "visual_description" ||
        body.preferred_style === "curiosity_question" ||
        body.preferred_style === "real_world_connection"
          ? body.preferred_style
          : "visual_description",
      preferred_order: ["visual_description", "step_by_step", "concrete_examples"],
      preferred_order_confidence: 0.55,
      user_interests: [],
      profile_snapshot: {
        schema_version: "personalization_profile_snapshot_v1",
        summary: "Prefer clear visual descriptions and step-by-step explanations unless stronger signals exist.",
        teaching_signals: [],
        example_domains: [],
      },
    },
    renderer_capabilities: DEFAULT_VISUAL_LEARNING_RENDERER_CAPABILITIES,
    available_probe_types: normalizeProbeTypes(body.available_probe_types),
    asset_resolution_policy: {
      myway_will_resolve_assets_after_model_output: true,
      model_should_not_use_asset_ids: true,
      model_should_not_invent_file_paths: true,
      model_should_describe_visual_needs: true,
      allow_primitive_fallbacks: true,
      prefer_scene_integrity_over_asset_availability: true,
    },
    output_preferences: {
      visual_first: true,
      probe_after_visual: true,
      no_jargon: jargonLevel === "none",
      max_orientation_segments: 5,
      max_visual_beats: 5,
      max_probe_options: 4,
      include_personalization_hypotheses: true,
      durable_personalization_delta_after_attempt_only: true,
    },
  };
}

function buildUserPrompt(input: VisualLearningTurnInput) {
  const proceedSkeleton = {
    schema_version: "myway_visual_learning_turn_output_v1",
    turn_status: "proceed",
    clarification_gate: {
      schema_version: "myway_turn_clarification_gate_output_v1",
      action: "proceed",
      confidence: { overall: 0.9, topic: 0.9, learner_goal: 0.9 },
      clarification_question: null,
      scope_choices: [],
      reason: "why it is safe to proceed",
    },
    topic_resolution: {
      topic_label: "topic label",
      topic_id: null,
      topic_confidence: 0.9,
      topic_reference_type: "new_topic",
      reason: "why this topic label was chosen",
    },
    diagnosis: {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: "representation_gap",
      diagnosis_confidence: 0.9,
      next_action: "generate_probe_contract",
      next_action_confidence: 0.9,
      suggested_question: null,
    },
    learning_focus: {
      root_problem: "what is keeping the learner stuck",
      target_takeaway: "one mental model the scene should build",
      why_visual_first: "why visual scene comes before probe",
    },
    visual_experience: {
      schema_version: "myway_visual_experience_compiler_output_v1",
      title: "short title",
      experience_mode: "process_loop",
      orientation_segments: [
        { id: "orientation_1", text: "learner-facing sentence", purpose: "show_main_structure" },
        { id: "orientation_2", text: "learner-facing sentence", purpose: "show_motion_or_change" },
      ],
      semantic_scene_plan: {
        entities: [
          {
            id: "entity_1",
            display_name: "visible name",
            semantic_role: "what this entity means",
            visual_need: {
              description: "what MyWay should render",
              semantic_tags: ["tag"],
              preferred_render_kind: "sphere",
              fallback_allowed: true,
            },
            position_hint: [0, 0, 0],
          },
        ],
        relationships: [],
        beats: [
          {
            id: "beat_1",
            title: "beat title",
            source_orientation_segment_ids: ["orientation_1"],
            duration_ms: 3500,
            active_entity_ids: ["entity_1"],
            actions: [
              { id: "action_1", type: "show_entity", target_entity_id: "entity_1", narration: "what happens", params: {} },
            ],
          },
        ],
        camera_notes: "camera notes",
        interaction_notes: "interaction notes",
      },
    },
    guided_interaction: {
      instruction: "what the learner should do in the scene",
      required_action_type: "scrub_beats",
      target_entity_ids: ["entity_1"],
      success_observation: "what success looks like",
    },
    followup_probe: {
      schema_version: "probe_contract_model_output_v1",
      probe_type: "single_choice",
      expected_attempt_type: "single_choice",
      prompt: {
        root_problem_explanation: "short root problem",
        reshaping_explanation: "how the scene helped",
        task: "choose the best answer",
        full_prompt: "learner-facing probe prompt",
      },
      presentation_support: [],
      answer_key: { kind: "single_choice", correct_option_id: "option_b" },
      misconception_markers: [],
      renderer_params: {
        options: [
          { id: "option_a", label: "A", text: "wrong option" },
          { id: "option_b", label: "B", text: "correct option" },
        ],
      },
      delivery_context: {
        bridge_level: input.personalization_context.bridge_level,
        language_policy: input.personalization_context.language_policy,
        presentation_styles_used: [input.personalization_context.preferred_style ?? "visual_description"],
        support_kinds_used: ["visual_description"],
        example_domains_used: [],
        personalization_signals_used: [],
      },
      confidence: 0.9,
    },
    personalization_hypotheses: [],
    confidence: 0.9,
  };

  const clarificationSkeleton = {
    schema_version: "myway_visual_learning_turn_output_v1",
    turn_status: "needs_clarification",
    clarification_gate: {
      schema_version: "myway_turn_clarification_gate_output_v1",
      action: "ask_clarifying_question",
      confidence: { overall: 0.4, topic: 0.2, learner_goal: 0.5 },
      clarification_question: "one focused question",
      scope_choices: [],
      reason: "why the request is not clear enough",
    },
  };

  const compactContract = {
    required_top_level_when_proceed: [
      "schema_version",
      "turn_status",
      "clarification_gate",
      "topic_resolution",
      "diagnosis",
      "learning_focus",
      "visual_experience",
      "guided_interaction",
      "followup_probe",
      "personalization_hypotheses",
      "confidence",
    ],
    required_top_level_when_needs_clarification: ["schema_version", "turn_status", "clarification_gate"],
    allowed_probe_types: input.available_probe_types,
    allowed_scene_actions: input.renderer_capabilities.supported_scene_actions,
    allowed_primitives: input.renderer_capabilities.supported_primitives,
  };

  return `Build a MyWay VisualLearningTurnOutput for this input.

INPUT JSON
${JSON.stringify(input, null, 2)}

COMPACT CONTRACT
${JSON.stringify(compactContract, null, 2)}

EXACT PROCEED SKELETON
${JSON.stringify(proceedSkeleton, null, 2)}

EXACT CLARIFICATION SKELETON
${JSON.stringify(clarificationSkeleton, null, 2)}

Hard rules:
- Return one JSON object only.
- If unclear, return only the clarification skeleton shape.
- If proceeding, keep root_problem inside learning_focus.root_problem.
- Keep orientation_segments inside visual_experience.orientation_segments.
- Keep semantic_scene_plan inside visual_experience.semantic_scene_plan.
- Use semantic_scene_plan.entities, not visual_entities.
- Use entity.id, beat.id, and action.type.
- Every action must have target_entity_id.
- Every beat.source_orientation_segment_ids value must match an orientation segment id.
- Do not use asset IDs or file paths. Use visual_need only.
- Follow-up probe must test learning_focus.target_takeaway.
- Keep output compact enough to fit max tokens.`;
}

export function buildVisualLearningTurnModelRequest(
  input: VisualLearningTurnInput,
): VisualLearningTurnModelRequest {
  const userPrompt = buildUserPrompt(input);

  return {
    model_task: "visual_learning_turn_planner",
    schema_version: "myway_visual_learning_turn_model_request_debug_v1",
    messages: [
      {
        role: "system",
        content: VISUAL_LEARNING_TURN_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_contract: VISUAL_LEARNING_TURN_RESPONSE_CONTRACT,
    compiler_input: input,
    tuning_notes: [
      "The model plans the ideal learning turn; MyWay resolves assets after output.",
      "The model must return needs_clarification or proceed as a discriminated union.",
      "Root problem and orientation are the source-of-truth fields for Step 6 rendering.",
      "Durable personalization_delta is not created here; it belongs to the Attempt Evaluator after the learner attempts the probe.",
    ],
    prompt_stats: {
      system_chars: VISUAL_LEARNING_TURN_SYSTEM_PROMPT.length,
      user_chars: userPrompt.length,
      total_chars: VISUAL_LEARNING_TURN_SYSTEM_PROMPT.length + userPrompt.length,
      available_probe_type_count: input.available_probe_types.length,
    },
  };
}

function messageLooksUnclear(input: VisualLearningTurnInput, body: VisualLearningTurnRequestBody) {
  if (body.force_clarification) return true;
  const text = input.user_message?.text.trim().toLowerCase() ?? "";
  if (!text) return true;

  const unclearMessages = new Set([
    "i don't get this",
    "i don’t get this",
    "i dont get this",
    "help",
    "i'm confused",
    "im confused",
    "i am confused",
  ]);

  return unclearMessages.has(text);
}

export function buildVisualLearningTurnScaffoldOutput(
  input: VisualLearningTurnInput,
  body: VisualLearningTurnRequestBody = {},
): VisualLearningTurnOutput {
  if (body.example === "unclear" || messageLooksUnclear(input, body)) {
    return unclearVisualLearningTurnOutputExample;
  }

  return krebsVisualLearningTurnProceedExample;
}
