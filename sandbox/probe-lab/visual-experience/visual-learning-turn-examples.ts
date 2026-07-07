import type { ProbeAttemptEvaluatorInput } from "@/lib/engine/schemas/probe-attempt-evaluator";
import type {
  MyWayResolvedVisualLearningTurn,
  VisualLearningTurnInput,
  VisualLearningTurnNeedsClarificationOutput,
  VisualLearningTurnProceedOutput,
} from "./visual-learning-turn";
import {
  DEFAULT_BRIDGE_LEVEL,
  DEFAULT_JARGON_LEVEL,
  DEFAULT_VISUAL_LEARNING_PROBE_TYPES,
  DEFAULT_VISUAL_LEARNING_RENDERER_CAPABILITIES,
} from "./visual-learning-turn";

export const krebsVisualLearningTurnInputExample: VisualLearningTurnInput = {
  schema_version: "myway_visual_learning_turn_input_v1",
  input_kind: "user_message",
  user_message: { text: "I can’t picture the Krebs cycle." },
  evaluated_probe_attempt: null,
  known_topic_state: null,
  personalization_context: {
    bridge_level: DEFAULT_BRIDGE_LEVEL,
    language_policy: { jargon_level: DEFAULT_JARGON_LEVEL },
    preferred_style: "visual_description",
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
  available_probe_types: DEFAULT_VISUAL_LEARNING_PROBE_TYPES,
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
    no_jargon: true,
    max_orientation_segments: 5,
    max_visual_beats: 5,
    max_probe_options: 4,
    include_personalization_hypotheses: true,
    durable_personalization_delta_after_attempt_only: true,
  },
};

export const krebsVisualLearningTurnProceedExample: VisualLearningTurnProceedOutput = {
  schema_version: "myway_visual_learning_turn_output_v1",
  turn_status: "proceed",
  clarification_gate: {
    schema_version: "myway_turn_clarification_gate_output_v1",
    action: "proceed",
    confidence: { overall: 0.91, topic: 0.96, learner_goal: 0.91 },
    clarification_question: null,
    scope_choices: [],
    reason: "The learner directly named the Krebs cycle and said they cannot picture it, so MyWay has enough signal to proceed.",
  },
  topic_resolution: {
    topic_label: "Krebs cycle",
    topic_id: null,
    topic_confidence: 0.96,
    topic_reference_type: "new_topic",
    reason: "The learner directly named the topic.",
  },
  diagnosis: {
    schema_version: "diagnosis_model_output_v1",
    diagnosis: "representation_gap",
    diagnosis_confidence: 0.92,
    next_action: "generate_probe_contract",
    next_action_confidence: 0.89,
    suggested_question: null,
  },
  learning_focus: {
    root_problem:
      "The learner is treating the Krebs cycle like a list of disconnected terms instead of picturing it as a repeating loop with things entering, leaving, and resetting.",
    target_takeaway:
      "The Krebs cycle is a repeating loop: some things enter, some things leave, and the loop resets so it can go around again.",
    why_visual_first:
      "The learner specifically said they cannot picture it, so the first move should build a mental image before testing details.",
  },
  visual_experience: {
    schema_version: "myway_visual_experience_compiler_output_v1",
    title: "The Krebs Cycle as a Resetting Loop",
    experience_mode: "process_loop",
    orientation_segments: [
      {
        id: "orientation_1_loop",
        text: "Picture the Krebs cycle as a loop that keeps coming back to its starting shape.",
        purpose: "show_main_structure",
      },
      {
        id: "orientation_2_enter_leave",
        text: "A small piece enters the loop, some pieces leave, and the loop resets so it can go around again.",
        purpose: "show_motion_or_change",
      },
      {
        id: "orientation_3_distinction",
        text: "The main thing to notice is the difference between what keeps cycling and what enters or leaves.",
        purpose: "show_relationship",
      },
    ],
    semantic_scene_plan: {
      entities: [
        {
          id: "loop_path",
          display_name: "the loop",
          semantic_role: "the part that keeps cycling",
          visual_need: {
            description: "A clear circular path showing a repeating process.",
            semantic_tags: ["cycle", "loop", "path", "repeating process"],
            preferred_render_kind: "path",
            fallback_allowed: true,
          },
          position_hint: [0, 0, 0],
        },
        {
          id: "entering_piece",
          display_name: "piece entering",
          semantic_role: "something that joins the loop",
          visual_need: {
            description: "A small token moving from outside the loop into the loop.",
            semantic_tags: ["input", "token", "enters", "cycle"],
            preferred_render_kind: "sphere",
            fallback_allowed: true,
          },
          position_hint: [-2, 0, 0],
        },
        {
          id: "leaving_piece",
          display_name: "piece leaving",
          semantic_role: "something that exits while the loop continues",
          visual_need: {
            description: "Small tokens moving away from the loop.",
            semantic_tags: ["output", "token", "leaves", "cycle"],
            preferred_render_kind: "particle",
            fallback_allowed: true,
          },
          position_hint: [2, 0, 0],
        },
        {
          id: "reset_marker",
          display_name: "reset point",
          semantic_role: "the moment the loop is ready to go around again",
          visual_need: {
            description: "A visible marker showing the loop returning to its starting state.",
            semantic_tags: ["reset", "start", "loop", "returns"],
            preferred_render_kind: "label",
            fallback_allowed: true,
          },
          position_hint: [0, 1.4, 0],
        },
      ],
      relationships: [
        {
          id: "loop_vs_enter_leave",
          source_entity_id: "loop_path",
          target_entity_ids: ["entering_piece", "leaving_piece"],
          relationship_type: "contrasts_with",
          explanation: "The loop keeps cycling, while some pieces enter or leave.",
        },
      ],
      beats: [
        {
          id: "beat_1_show_loop",
          title: "See the loop first",
          source_orientation_segment_ids: ["orientation_1_loop"],
          duration_ms: 4500,
          active_entity_ids: ["loop_path"],
          actions: [
            {
              id: "action_trace_loop",
              type: "trace_path",
              target_entity_id: "loop_path",
              narration: "First, hold onto the loop shape.",
              params: { loop_count: 1 },
            },
          ],
        },
        {
          id: "beat_2_enter_leave",
          title: "See what enters and leaves",
          source_orientation_segment_ids: ["orientation_2_enter_leave"],
          duration_ms: 5500,
          active_entity_ids: ["loop_path", "entering_piece", "leaving_piece", "reset_marker"],
          actions: [
            {
              id: "action_show_entering",
              type: "move_entity",
              target_entity_id: "entering_piece",
              narration: "This piece enters the loop.",
              params: { from: [-2.4, 0, 0], to: [-0.8, 0, 0] },
            },
            {
              id: "action_show_leaving",
              type: "move_entity",
              target_entity_id: "leaving_piece",
              narration: "This piece leaves the loop.",
              params: { from: [0.8, 0, 0], to: [2.4, 0, 0] },
            },
            {
              id: "action_show_reset",
              type: "show_label",
              target_entity_id: "reset_marker",
              narration: "The loop is ready to go around again.",
              params: {},
            },
          ],
        },
        {
          id: "beat_3_compare",
          title: "Separate the loop from the pieces",
          source_orientation_segment_ids: ["orientation_3_distinction"],
          duration_ms: 5000,
          active_entity_ids: ["loop_path", "entering_piece", "leaving_piece"],
          actions: [
            {
              id: "action_highlight_loop",
              type: "highlight_entity",
              target_entity_id: "loop_path",
              narration: "This is what keeps cycling.",
              params: {},
            },
            {
              id: "action_highlight_enter_leave",
              type: "show_relationship",
              target_entity_id: "entering_piece",
              narration: "These are the pieces that enter or leave.",
              params: { related_entity_ids: ["leaving_piece"] },
            },
          ],
        },
      ],
      camera_notes: "Start above the loop. Then gently focus on the entering and leaving pieces.",
      interaction_notes: "Let the learner scrub the beats and inspect which part keeps cycling.",
    },
  },
  guided_interaction: {
    instruction:
      "Scrub through the loop once. First point to what keeps cycling. Then point to one thing that enters and one thing that leaves.",
    required_action_type: "scrub_beats",
    target_entity_ids: ["loop_path", "entering_piece", "leaving_piece"],
    success_observation: "The learner separates the repeating loop from the pieces that enter or leave.",
  },
  followup_probe: {
    schema_version: "probe_contract_model_output_v1",
    probe_type: "single_choice",
    expected_attempt_type: "single_choice",
    prompt: {
      root_problem_explanation: "The learner was having trouble picturing the cycle as a repeating loop.",
      reshaping_explanation: "The visual scene separated the repeating loop from the pieces that enter or leave.",
      task: "Choose the statement that best matches the scene.",
      full_prompt: "Based on the loop you just explored, which statement best matches the Krebs cycle?",
    },
    presentation_support: [
      {
        kind: "visual_description",
        style_used: "visual_description",
        text: "The probe points back to the loop, the entering piece, and the leaving piece.",
        user_interest_used: null,
        confidence: 0.78,
      },
    ],
    answer_key: { kind: "single_choice", correct_option_id: "loop_enters_leaves_resets" },
    misconception_markers: [
      {
        misconception_id: "straight_list_not_loop",
        label: "Treats the cycle as a straight list",
        marker: "straight list",
        description: "The learner thinks the process moves forward once instead of resetting.",
        confidence: 0.82,
      },
      {
        misconception_id: "closed_loop_nothing_enters_or_leaves",
        label: "Thinks nothing enters or leaves",
        marker: "nothing enters or leaves",
        description: "The learner misses that some pieces enter or leave while the loop continues.",
        confidence: 0.76,
      },
    ],
    renderer_params: {
      options: [
        { id: "straight_list", label: "A", text: "It is a straight list where each step happens once and then stops." },
        {
          id: "loop_enters_leaves_resets",
          label: "B",
          text: "It is a loop where some things enter, some things leave, and the loop resets.",
        },
        { id: "closed_loop", label: "C", text: "It is a closed loop where nothing enters or leaves." },
      ],
    },
    delivery_context: {
      bridge_level: "bridge_0",
      language_policy: { jargon_level: "none" },
      presentation_styles_used: ["visual_description", "step_by_step"],
      support_kinds_used: ["visual_description", "step_by_step_frame"],
      example_domains_used: [],
      personalization_signals_used: [{ kind: "presentation_style", value: "visual_description", confidence: 0.55 }],
    },
    confidence: 0.89,
  },
  personalization_hypotheses: [
    {
      kind: "presentation_style",
      value: "visual_description",
      direction: "prefer",
      scope: "diagnosis_label",
      scope_key: "representation_gap",
      confidence: 0.45,
      reason:
        "The learner said they could not picture the idea. This should only become durable if the follow-up attempt shows it helped.",
    },
  ],
  confidence: 0.9,
};

export const unclearVisualLearningTurnOutputExample: VisualLearningTurnNeedsClarificationOutput = {
  schema_version: "myway_visual_learning_turn_output_v1",
  turn_status: "needs_clarification",
  clarification_gate: {
    schema_version: "myway_turn_clarification_gate_output_v1",
    action: "ask_clarifying_question",
    confidence: { overall: 0.38, topic: 0.12, learner_goal: 0.58 },
    clarification_question: "What topic or problem are you trying to understand?",
    scope_choices: [],
    reason:
      "The learner says they are confused, but MyWay does not know what topic or problem they mean.",
  },
};

export const krebsResolvedVisualLearningTurnExample: MyWayResolvedVisualLearningTurn = {
  schema_version: "myway_resolved_visual_learning_turn_v1",
  source_output_valid: true,
  render_bindings: [
    {
      entity_id: "loop_path",
      binding: {
        kind: "primitive",
        primitive: "path",
        reason:
          "The model requested a circular loop path. No registered rich Krebs-cycle asset is required for the first render.",
      },
    },
    {
      entity_id: "entering_piece",
      binding: {
        kind: "primitive",
        primitive: "sphere",
        reason: "The model requested a small entering token. A sphere is enough to preserve the scene structure.",
      },
    },
    {
      entity_id: "leaving_piece",
      binding: {
        kind: "primitive",
        primitive: "particle",
        reason: "The model requested small leaving tokens. Particles preserve the intended visual motion.",
      },
    },
    {
      entity_id: "reset_marker",
      binding: {
        kind: "primitive",
        primitive: "label",
        reason: "The model requested a reset marker. A label is enough for the first sandbox version.",
      },
    },
  ],
  queued_asset_needs: [
    {
      source_entity_id: "loop_path",
      description: "A clear circular path showing a repeating process.",
      semantic_tags: ["cycle", "loop", "path", "repeating process"],
      priority: "medium",
    },
  ],
  validation: {
    valid: true,
    root_problem_present: true,
    orientation_coverage_valid: true,
    covered_orientation_segment_ids: ["orientation_1_loop", "orientation_2_enter_leave", "orientation_3_distinction"],
    uncovered_orientation_segment_ids: [],
    all_action_targets_valid: true,
    unknown_action_target_entity_ids: [],
    followup_probe_valid: true,
    bridge_policy_valid: true,
    fatal_errors: [],
    warnings: [],
  },
};

export const krebsProbeAttemptEvaluatorInputExample: ProbeAttemptEvaluatorInput = {
  schema_version: "probe_attempt_evaluator_input_v1",
  probe: {
    probe_type: "single_choice",
    expected_attempt_type: "single_choice",
    prompt: krebsVisualLearningTurnProceedExample.followup_probe.prompt,
    target_diagnosis: "representation_gap",
  },
  answer_key: krebsVisualLearningTurnProceedExample.followup_probe.answer_key,
  attempt: {
    attempt_type: "single_choice",
    selected_option_id: "loop_enters_leaves_resets",
    self_reported_confidence: 0.35,
  },
  misconception_markers: krebsVisualLearningTurnProceedExample.followup_probe.misconception_markers,
  delivery_context: krebsVisualLearningTurnProceedExample.followup_probe.delivery_context,
};
