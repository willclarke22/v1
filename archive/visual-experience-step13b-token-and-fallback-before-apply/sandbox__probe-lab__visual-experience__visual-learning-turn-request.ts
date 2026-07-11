import type { ProbeType } from "@/lib/engine/schemas/shared";
import type { VisualLearningTurnInput, VisualLearningTurnOutput } from "./visual-learning-turn";
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
import { SHARED_CONFUSION_LABELS, SHARED_INSIGHT_LABELS } from "./diagnostic-relationships";

export type VisualLearningTurnRequestBody = {
  learner_message?: string;
  input_kind?: "user_message" | "evaluated_probe_attempt";
  /** Legacy field accepted by older clients, but ignored by the v2 sandbox prompt. */
  topic_label?: string | null;
  root_problem?: string | null;
  bridge_level?: string | null;
  jargon_level?: string | null;
  preferred_style?: string | null;
  user_interests?: string[] | string | null;
  available_probe_types?: ProbeType[];
  force_clarification?: boolean;
  provider?: "scaffold" | "deepseek" | "glm" | "openai" | string;
  /** Legacy field accepted by older clients. Step 13 always builds cinematic-by-default prompts. */
  generation_preset?: "reliable" | "cinematic" | string;
  enable_streaming?: boolean;
  retry_transient_errors?: boolean;
  fallback_provider?: "none" | "scaffold" | "deepseek" | "glm" | string;
  use_fallback_on_invalid?: boolean;
  example?: "krebs" | "unclear" | string;
};

export type VisualLearningTurnModelRequest = {
  model_task: "visual_learning_semantic_draft_planner";
  schema_version: "myway_visual_learning_turn_model_request_debug_v2";
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

export const VISUAL_LEARNING_TURN_SYSTEM_PROMPT = `You are MyWay's Visual Learning Semantic Draft Model.

Return only valid JSON. Do not include markdown, commentary, or code fences.

Your job is to produce a structured semantic draft for one learning turn.

You are given only the current learner message, personalization context, recent lightweight context, and output policy. You are not responsible for remembering the full learning space, comparing all topics, creating durable personalization, or creating learning-space relationships.

MyWay handles:
- topic memory
- long-term state
- relationship building
- durable personalization
- rendering
- validation
- fallback behavior

You handle:
- inferring topic_label from learner_message
- diagnosing the current learning need
- scoring current confusion and insight
- identifying reusable diagnostic pattern candidates for this topic
- creating a learner-facing full_prompt
- creating explanation_pieces inside that full_prompt
- creating a visual scene that proves the full_prompt
- creating a follow-up probe

The learner_facing_prompt.full_prompt is the source of truth.

Build the full_prompt from first principles. Use explanation_pieces to make the teaching path clear:
1. start from a basic need
2. hit a wall
3. introduce the needed part or idea
4. show how that part helps
5. hit the next wall if needed
6. connect the parts
7. land the takeaway
8. prepare the follow-up probe

Do not use phrases like "the confusing part is" unless the learner directly asks for that framing. Assume the learner does not yet know the topic. Make the explanation feel like the idea becomes necessary piece by piece.

The scene must be built around the full_prompt. It should not be a separate cinematic idea. If it helps understanding, the scene should introduce visual elements one at a time. Previous elements may remain visible when that makes the system easier to follow.

Use interests only when they clarify the hidden structure of the idea. Do not force interests into the explanation. If an interest is used, it must preserve the truth of the topic.

Do not create personalization_hypotheses. Do not create durable personalization deltas. Those happen after the learner attempts something.

For diagnostic_signal:
- confusion.score is 0.0 to 1.0.
- confusion.confidence is 0.0 to 1.0.
- insight.score is 0.0 to 1.0.
- insight.confidence is 0.0 to 1.0.
- pattern_candidates are reusable topic-level patterns that MyWay may later compare across topics.
- pattern_candidates must include id, kind, shared_label, short_explanation, evidence, and confidence.
- shared_label must come from the allowed confusion or insight label set.
- Do not create relationship objects. MyWay creates relationships later by comparing pattern candidates across topics.

Allowed SharedConfusionLabel values:
${SHARED_CONFUSION_LABELS.map((label) => `- ${label}`).join("\n")}

Allowed SharedInsightLabel values:
${SHARED_INSIGHT_LABELS.map((label) => `- ${label}`).join("\n")}

Output must match schema_version myway_visual_learning_semantic_draft_v2.`;

export const VISUAL_LEARNING_SEMANTIC_DRAFT_RESPONSE_CONTRACT = {
  schema_version: "myway_visual_learning_semantic_draft_v2",
  turn_status: "proceed | needs_clarification",
  clarification: {
    question: "string or null",
    reason: "why MyWay should proceed or ask this question",
    confidence: { overall: "0-1", topic: "0-1", learner_goal: "0-1" },
  },
  topic_label: "short topic label inferred from learner_message",
  diagnosis: {
    label: "unknown | no_gap_detected | recall_gap | representation_gap | procedure_gap | discrimination_gap | transfer_gap | metacognitive_gap",
    confidence: "0-1",
    reason: "why this diagnosis fits the learner signal",
  },
  diagnostic_signal: {
    confusion: { score: "0-1", confidence: "0-1" },
    insight: { score: "0-1", confidence: "0-1" },
    pattern_candidates: [
      {
        id: "stable id for this topic-level pattern",
        kind: "confusion | insight",
        shared_label: "one allowed shared label",
        short_explanation: "short learner-facing explanation of this pattern",
        evidence: "why this current message suggests this pattern",
        confidence: "0-1",
      },
    ],
  },
  learning_focus: {
    root_problem: "what is keeping the learner stuck",
    target_takeaway: "one mental model this turn should build",
    misconception_to_surface: "string or null",
  },
  personalization_decision: {
    chosen_interest: "string or null",
    use_interest: "structural_bridge | light_tone | do_not_use",
    reason: "why this interest should or should not shape the scene",
    structural_mapping: "interest-to-concept operation mapping, or null",
    interest_bridge_line: "optional learner-facing line, or null",
    anti_distortion_guard: "what must stay accurate about the actual concept",
  },
  learner_facing_prompt: {
    title: "short title",
    full_prompt: "polished learner-facing full prompt built from first principles",
    explanation_pieces: [
      {
        id: "piece_1",
        text: "one teaching move from the full_prompt",
        role: "start_from_basic_need | hit_a_wall | introduce_needed_part | show_how_part_helps | hit_next_wall | connect_parts | land_the_takeaway | prepare_followup_probe",
      },
    ],
    what_to_watch_for: ["short thing to watch for in the scene"],
    tone: "calm | curious | encouraging | cinematic | direct",
  },
  scene: {
    title: "short title",
    directed_scene: {
      scene_concept: "rich freeform description of the exact visual scene",
      visual_metaphor: "concrete metaphor or null",
      emotional_tone: "clear, calm, cinematic, etc.",
      spatial_design: "where objects live and what must stay visible",
      cinematography: {
        opening_shot: "first camera view",
        camera_motion: "camera path across the story",
        focus_strategy: "what is emphasized or dimmed",
      },
      reveal_strategy: {
        reveal_elements_one_at_a_time: true,
        reason: "why progressive reveal helps or does not help",
        reveal_order_entity_ids: ["entity_id"],
        keep_previous_elements_visible: true,
      },
    },
    scene_moments: [
      {
        id: "moment_1",
        title: "moment title",
        source_explanation_piece_ids: ["piece_1"],
        introduces_entity_ids: ["entity_id"],
        keeps_visible_entity_ids: [],
        active_entity_ids: ["entity_id"],
        director_intent: "what the learner should notice in this moment",
        camera: {
          shot_type: "wide | close_up | push_in | pull_back | follow | orbit",
          focus_entity_ids: ["entity_id"],
          movement: "semantic camera movement",
        },
        visual_events: [
          {
            type: "move | merge | split | fade | pop | glow | trace | transform",
            entity_id: "entity_id",
            description: "visible event the renderer should execute",
          },
        ],
      },
    ],
    entities: [
      {
        id: "entity_id",
        display_name: "learner-facing name",
        semantic_role: "what this entity means",
        visual_need: "what should be visible",
        semantic_tags: ["tag"],
        preferred_render_kind: "sphere | box | arrow | path | label | particle | registered_asset | any",
      },
    ],
    relationships: [
      {
        id: "relationship_id",
        source_entity_id: "entity_id",
        target_entity_ids: ["entity_id"],
        relationship_type: "connects_to | contrasts_with | causes | becomes | enters | leaves | cycles_back | supports_takeaway",
        explanation: "why these entities relate",
      },
    ],
  },
  guided_interaction: {
    instruction: "learner-facing instruction",
    required_action_type: "orbit | zoom | scrub_beats | inspect_entity | compare_entities | drag_object | toggle_layer | answer_in_scene | none",
    target_entity_ids: ["entity_id"],
    success_observation: "string",
  },
  probe: {
    probe_type: "one of allowed probe types",
    question: "short learner-facing question",
    full_prompt: "workbook-style follow-up prompt continuing from the full_prompt",
    options: [{ id: "option_a", text: "choice text", misconception_target: "string or null" }],
    correct_option_id: "option id for single_choice, or null",
    expected_ideas: ["for explain/text probes"],
    misconception_markers: [
      { misconception_id: "stable id", label: "short label", description: "what this misconception would reveal" },
    ],
    what_it_measures: "understanding this probe checks",
  },
  confidence: { overall: "0-1", prompt: "0-1", scene: "0-1", probe: "0-1" },
};

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeProbeTypes(value: unknown): ProbeType[] {
  if (!Array.isArray(value)) return DEFAULT_VISUAL_LEARNING_PROBE_TYPES;

  const allowed = new Set(DEFAULT_VISUAL_LEARNING_PROBE_TYPES);
  const normalized = value.filter((item): item is ProbeType => typeof item === "string" && allowed.has(item as ProbeType));

  return normalized.length ? normalized : DEFAULT_VISUAL_LEARNING_PROBE_TYPES;
}

function normalizeUserInterests(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/g)
      : [];

  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 80))
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 24);
}

export function buildVisualLearningTurnInput(body: VisualLearningTurnRequestBody = {}): VisualLearningTurnInput {
  if (body.example === "krebs") return krebsVisualLearningTurnInputExample;

  const learnerMessage = asString(body.learner_message, "I don't understand how pistons work or why they're important in engines.");
  const userInterests = normalizeUserInterests(body.user_interests);
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
    // Step 13: the model infers topic_label from learner_message. Legacy topic_label input is ignored.
    known_topic_state: null,
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
      user_interests: userInterests.map((interest) => ({
        interest,
        user_interest_confidence: 0.75,
      })),
      profile_snapshot: {
        schema_version: "personalization_profile_snapshot_v1",
        summary: userInterests.length
          ? `Known user interests/example domains for this lab run: ${userInterests.join(", ")}. Use these only when they genuinely help the explanation.`
          : "Prefer clear visual descriptions and step-by-step explanations unless stronger signals exist.",
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
      // Legacy renderer compatibility limits. The model-facing prompt uses explanation_pieces/scene_moments instead.
      max_orientation_segments: 6,
      max_visual_beats: 6,
      max_probe_options: 4,
      include_personalization_hypotheses: false,
      durable_personalization_delta_after_attempt_only: true,
      full_prompt_drives_scene: true,
      cinematic_by_default: true,
      introduce_visual_elements_one_at_a_time_when_helpful: true,
    },
  };
}

function compactLearnerContext(input: VisualLearningTurnInput) {
  return {
    learner_message: input.user_message?.text ?? null,
    bridge_level: input.personalization_context.bridge_level,
    jargon_level: input.personalization_context.language_policy.jargon_level,
    preferred_style: input.personalization_context.preferred_style ?? null,
    user_interests: input.personalization_context.user_interests ?? [],
    known_recent_diagnoses: input.known_topic_state?.recent_diagnoses ?? [],
  };
}

function compactPolicy(input: VisualLearningTurnInput) {
  return {
    visual_first: true,
    full_prompt_drives_scene: true,
    plain_language_required: input.output_preferences.no_jargon,
    cinematic_by_default: true,
    introduce_visual_elements_one_at_a_time_when_helpful: true,
    use_interests_only_when_structural: true,
    no_durable_personalization_before_attempt: true,
  };
}

function buildUserPrompt(input: VisualLearningTurnInput) {
  const context = compactLearnerContext(input);
  const outputPolicy = compactPolicy(input);

  const outputShapeForPrompt = VISUAL_LEARNING_SEMANTIC_DRAFT_RESPONSE_CONTRACT;

  return `Create a MyWay visual learning semantic draft from this input.

MODEL_INPUT_JSON:
${JSON.stringify(
  {
    schema_version: "myway_visual_learning_model_input_v2",
    learner_message: context.learner_message,
    personalization_context: {
      bridge_level: context.bridge_level,
      jargon_level: context.jargon_level,
      preferred_style: context.preferred_style,
      user_interests: context.user_interests,
      profile_summary: input.personalization_context.profile_snapshot?.summary ?? null,
    },
    recent_context: {
      recent_topic_labels: [],
      recent_diagnoses: context.known_recent_diagnoses,
      recent_user_messages: [],
    },
    output_policy: outputPolicy,
  },
  null,
  2,
)}

OUTPUT_JSON_SHAPE:
${JSON.stringify(outputShapeForPrompt, null, 2)}

RULES:
- Return only JSON matching myway_visual_learning_semantic_draft_v2.
- Infer topic_label from learner_message. Do not depend on a topic hint.
- Include diagnostic_signal with confusion score/confidence, insight score/confidence, and pattern_candidates.
- Use only the allowed shared labels for pattern_candidates.
- Do not create relationship objects.
- Do not create personalization_hypotheses or durable personalization deltas.
- learner_facing_prompt.full_prompt is the source of truth.
- Build full_prompt from first principles using explanation_pieces.
- Do not output orientation_segments, key_takeaway, why_visual_first, label_policy, spoken_caption, or personalization_hypotheses.
- scene.scene_moments should visually prove the explanation_pieces and should reveal elements one at a time when useful.
- probe.full_prompt should be workbook-style and should test the target_takeaway.`;
}

export function buildVisualLearningTurnModelRequest(input: VisualLearningTurnInput): VisualLearningTurnModelRequest {
  const userPrompt = buildUserPrompt(input);

  return {
    model_task: "visual_learning_semantic_draft_planner",
    schema_version: "myway_visual_learning_turn_model_request_debug_v2",
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
    response_contract: VISUAL_LEARNING_SEMANTIC_DRAFT_RESPONSE_CONTRACT,
    compiler_input: input,
    tuning_notes: [
      "Step 13: full_prompt is the source of truth; explanation_pieces drive progressive reveal.",
      "Step 13: topic_label is inferred by the model; legacy topic_label input is ignored.",
      "Step 13: diagnostic_signal now carries confusion/insight scores and shared pattern candidates.",
      "Step 13: MyWay creates sandbox relationship previews deterministically from shared_label matches.",
      "Pre-attempt personalization_hypotheses are removed; durable personalization still belongs after attempts.",
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
