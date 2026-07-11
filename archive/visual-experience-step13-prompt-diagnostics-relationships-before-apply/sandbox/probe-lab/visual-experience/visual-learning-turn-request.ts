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

export type VisualLearningTurnRequestBody = {
  learner_message?: string;
  input_kind?: "user_message" | "evaluated_probe_attempt";
  topic_label?: string | null;
  root_problem?: string | null;
  bridge_level?: string | null;
  jargon_level?: string | null;
  preferred_style?: string | null;
  user_interests?: string[] | string | null;
  available_probe_types?: ProbeType[];
  force_clarification?: boolean;
  provider?: "scaffold" | "deepseek" | "glm" | "openai" | string;
  generation_preset?: "reliable" | "cinematic" | string;
  enable_streaming?: boolean;
  retry_transient_errors?: boolean;
  fallback_provider?: "none" | "scaffold" | "deepseek" | "glm" | string;
  use_fallback_on_invalid?: boolean;
  example?: "krebs" | "unclear" | string;
};

export type VisualLearningTurnModelRequest = {
  model_task: "visual_learning_semantic_draft_planner";
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

export const VISUAL_LEARNING_TURN_SYSTEM_PROMPT = `You are the MyWay Directed Visual Learning Scene Planner.

Return JSON only.

Your job: provide semantic teaching intelligence and rich visual direction for one learning turn.
MyWay will add wrappers, validation, asset resolution, directed-scene compilation, rendering, and probe runtime behavior.

Return a compact semantic draft, not the final app object.

Design the scene like a director, not like a template.
The scene.directed_scene field is the source of truth for the visual story: metaphor, spatial design, cinematography, caption style, label behavior, emotional tone, spatial constraints, and motion direction.
Do not output experience_mode or layout_mode. MyWay no longer wants template/layout category hints.

Decide:
- whether to proceed or ask a clarification question
- topic and diagnosis
- root problem, target takeaway, and why visual-first
- learner-facing orientation
- a personalization_decision that explicitly says whether/how to use interests
- a rich directed_scene that describes what should be seen, where it should appear, how it moves, and what should be felt
- executable entities, relationships, beats, actions, story_beats, and captions
- guided interaction after the story
- follow-up probe and misconception markers
- tentative personalization hypotheses only

Rules:
- Use plain language when bridge_level is bridge_0 or jargon_level is none.
- Preserve the learner's stuck point in natural words before becoming cinematic.
- Use user_interests/example domains only when they reveal the hidden structure of the concept; do not decorate the scene with them.
- When using an interest, map it to an underlying operation (for example translate, compare, loop, signal, pressure, sequence), and include an anti-distortion guard.
- Describe visual needs; do not use asset ids or file paths.
- Do not rely on a rigid scene template. Do not choose a layout category. Give enough spatial and motion direction that a directed-scene compiler can follow it.
- Captions should default to short phrase chunks for bridge_0: 3-6 words on screen, natural speech cadence, important words linger. Use one_word_at_a_time only for language/audio timing tasks.
- Labels should not cover the important motion; prefer active/selected labels only.
- Every executable beat must cite orientation segment ids.
- The probe must test the target takeaway.
- Do not create durable personalization_delta before a learner attempt.`;

export const VISUAL_LEARNING_SEMANTIC_DRAFT_RESPONSE_CONTRACT = {
  schema_version: "myway_visual_learning_semantic_draft_v1",
  turn_status: "proceed | needs_clarification",
  clarification: {
    question: "string or null",
    reason: "why MyWay should proceed or ask this question",
    confidence: { overall: "0-1", topic: "0-1", learner_goal: "0-1" },
  },
  topic: { label: "short topic label", confidence: "0-1", reason: "why this topic was inferred" },
  diagnosis: {
    label: "unknown | no_gap_detected | recall_gap | representation_gap | procedure_gap | discrimination_gap | transfer_gap | metacognitive_gap",
    confidence: "0-1",
    reason: "why this diagnosis fits the learner signal",
  },
  learning_focus: {
    root_problem: "what is keeping the learner stuck",
    target_takeaway: "one mental model this turn should build",
    why_visual_first: "why a visual scene should come before the probe",
  },
  orientation_segments: [{ id: "orientation_1", text: "learner-facing sentence", purpose: "introduce_scene | show_main_structure | show_motion_or_change | show_relationship | prepare_interaction | connect_to_probe" }],
  personalization_decision: {
    chosen_interest: "string or null",
    use_interest: "structural_bridge | light_tone | do_not_use",
    reason: "why this interest should or should not shape the scene",
    structural_mapping: "interest-to-concept operation mapping, or null",
    anti_distortion_guard: "what must stay accurate about the actual concept",
  },
  scene: {
    title: "short title",
    directed_scene: {
      scene_concept: "freeform description of the scene the renderer should create",
      visual_metaphor: "concrete metaphor that organizes the scene",
      emotional_tone: "clear, calm, cinematic, curious, etc.",
      spatial_design: "where objects live, how space is arranged, what must remain visible",
      cinematography: {
        opening_shot: "first camera view",
        camera_motion: "how camera moves across the story",
        focus_strategy: "what should be bright, dim, foregrounded, or followed",
        label_strategy: "when labels appear and how they avoid covering motion",
      },
      caption_policy: { display_mode: "short_phrase", cadence: "natural_speech", max_words_on_screen: 5, important_words_linger: true },
      label_policy: { default_visibility: "active_only", show_labels_when: "introduced_or_selected", avoid_covering_core_motion: true },
    },
    entities: [{ id: "entity_id", display_name: "learner-facing name", semantic_role: "what this entity means", visual_need: "what should be visible", semantic_tags: ["tag"], preferred_render_kind: "sphere | box | arrow | path | label | particle | registered_asset | any" }],
    relationships: [{ id: "relationship_id", source_entity_id: "entity_id", target_entity_ids: ["entity_id"], relationship_type: "connects_to | contrasts_with | causes | becomes | enters | leaves | cycles_back | supports_takeaway", explanation: "why these entities relate" }],
    beats: [{ id: "beat_1", title: "beat title", source_orientation_segment_ids: ["orientation_1"], active_entity_ids: ["entity_id"], actions: [{ type: "show_entity | highlight_entity | move_entity | trace_path | show_label | show_relationship | fade_in | fade_out | pause_for_check", target_entity_id: "entity_id", narration: "what the learner should notice" }] }],
    story_beats: [{ id: "beat_1", title: "beat title", director_intent: "what the learner should feel/notice in this shot", camera: { shot_type: "wide | close_up | push_in | pull_back | follow | orbit", focus_entity_ids: ["entity_id"], movement: "semantic camera movement" }, visual_events: [{ type: "move | merge | split | fade | pop | glow | trace | transform", entity_id: "entity_id", description: "visible event the renderer should execute" }], spoken_caption: { text: "short spoken narration", display_mode: "short_phrase", cadence: "natural_speech", max_words_on_screen: 5 } }],
    camera_notes: "legacy semantic camera intent",
    interaction_notes: "what learner should inspect after story playback",
  },
  guided_interaction: { instruction: "learner-facing instruction", required_action_type: "orbit | zoom | scrub_beats | inspect_entity | compare_entities | drag_object | toggle_layer | answer_in_scene | none", target_entity_ids: ["entity_id"], success_observation: "what successful interaction would show" },
  probe: { probe_type: "one of allowed probe types", question: "learner-facing question", options: [{ id: "option_a", text: "choice text" }], correct_option_id: "option id for single choice", expected_ideas: ["for explain/text probes"], misconception_markers: [{ misconception_id: "stable id", label: "short label", description: "what this misconception would reveal" }], what_it_measures: "understanding this probe checks" },
  personalization_hypotheses: [{ kind: "bridge_level | jargon_level | presentation_style | support_kind | probe_type | verification_pattern", value: "signal value", direction: "prefer | avoid | verify", scope: "global | topic | diagnosis_label | probe_type", scope_key: "string or null", confidence: "0-1", reason: "why this is only a hypothesis" }],
  confidence: { overall: "0-1", scene: "0-1", probe: "0-1" },
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

function normalizeGenerationPreset(value: unknown): "reliable" | "cinematic" {
  return value === "cinematic" ? "cinematic" : "reliable";
}

export function buildVisualLearningTurnInput(body: VisualLearningTurnRequestBody = {}): VisualLearningTurnInput {
  if (body.example === "krebs") return krebsVisualLearningTurnInputExample;

  const learnerMessage = asString(body.learner_message, "I can’t picture the Krebs cycle.");
  const generationPreset = normalizeGenerationPreset(body.generation_preset);
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
      max_orientation_segments: generationPreset === "cinematic" ? 4 : 3,
      max_visual_beats: generationPreset === "cinematic" ? 6 : 4,
      max_probe_options: 4,
      include_personalization_hypotheses: true,
      durable_personalization_delta_after_attempt_only: true,
    },
  };
}

function compactLearnerContext(input: VisualLearningTurnInput) {
  return {
    learner_message: input.user_message?.text ?? null,
    topic_label: input.known_topic_state?.topic_label ?? null,
    bridge_level: input.personalization_context.bridge_level,
    jargon_level: input.personalization_context.language_policy.jargon_level,
    preferred_style: input.personalization_context.preferred_style ?? null,
    user_interests: input.personalization_context.user_interests ?? [],
    known_recent_diagnoses: input.known_topic_state?.recent_diagnoses ?? [],
    generation_mode: input.output_preferences.max_visual_beats <= 4 ? "reliable" : "cinematic",
  };
}

function compactCapabilities(input: VisualLearningTurnInput) {
  return {
    allowed_diagnosis_labels: [
      "unknown",
      "no_gap_detected",
      "recall_gap",
      "representation_gap",
      "procedure_gap",
      "discrimination_gap",
      "transfer_gap",
      "metacognitive_gap",
    ],
    allowed_probe_types: input.available_probe_types,
    allowed_render_kinds: [...input.renderer_capabilities.supported_primitives, "registered_asset", "any"],
    allowed_scene_actions: input.renderer_capabilities.supported_scene_actions,
    limits: {
      max_orientation_segments: input.output_preferences.max_orientation_segments,
      max_scene_beats: input.output_preferences.max_visual_beats,
      max_probe_options: input.output_preferences.max_probe_options,
    },
  };
}

function buildUserPrompt(input: VisualLearningTurnInput) {
  const context = compactLearnerContext(input);
  const capabilities = compactCapabilities(input);

  const outputShapeForPrompt = {
    schema_version: "myway_visual_learning_semantic_draft_v1",
    turn_status: "proceed | needs_clarification",
    clarification: {
      question: null,
      reason: "string",
      confidence: { overall: 0, topic: 0, learner_goal: 0 },
    },
    topic: { label: "string", confidence: 0, reason: "string" },
    diagnosis: { label: "one allowed diagnosis label", confidence: 0, reason: "string" },
    learning_focus: {
      root_problem: "string",
      target_takeaway: "string",
      why_visual_first: "string",
    },
    orientation_segments: [
      { id: "orientation_1", text: "learner-facing sentence", purpose: "introduce_scene | show_main_structure | show_motion_or_change | show_relationship | prepare_interaction | connect_to_probe" },
    ],
    personalization_decision: {
      chosen_interest: "string or null",
      use_interest: "structural_bridge | light_tone | do_not_use",
      reason: "string",
      structural_mapping: "string or null",
      anti_distortion_guard: "string",
    },
    scene: {
      title: "string",
      directed_scene: {
        scene_concept: "rich freeform description of the exact visual scene",
        visual_metaphor: "concrete metaphor or visual world",
        emotional_tone: "clear, calm, cinematic, etc.",
        spatial_design: "where objects live and what must stay visible",
        cinematography: {
          opening_shot: "first shot",
          camera_motion: "camera path across the story",
          focus_strategy: "what is emphasized or dimmed",
          label_strategy: "how labels appear without blocking motion",
        },
        caption_policy: { display_mode: "short_phrase", cadence: "natural_speech", max_words_on_screen: 5, important_words_linger: true },
        label_policy: { default_visibility: "active_only", show_labels_when: "introduced_or_selected", avoid_covering_core_motion: true },
      },
      entities: [
        { id: "entity_id", display_name: "learner-facing name", semantic_role: "what this entity means", visual_need: "what should be visible", semantic_tags: ["tag"], preferred_render_kind: "one allowed render kind" },
      ],
      relationships: [
        { id: "relationship_id", source_entity_id: "entity_id", target_entity_ids: ["entity_id"], relationship_type: "connects_to | contrasts_with | causes | becomes | enters | leaves | cycles_back | supports_takeaway", explanation: "string" },
      ],
      beats: [
        { id: "beat_1", title: "string", source_orientation_segment_ids: ["orientation_1"], active_entity_ids: ["entity_id"], actions: [{ type: "one allowed scene action", target_entity_id: "entity_id", narration: "what the learner should notice" }] },
      ],
      story_beats: [
        {
          id: "beat_1",
          title: "string",
          director_intent: "what the learner should feel or notice in this shot",
          camera: { shot_type: "wide | close_up | push_in | pull_back | follow | orbit", focus_entity_ids: ["entity_id"], movement: "semantic camera movement" },
          visual_events: [{ type: "move | merge | split | fade | pop | glow | trace | transform", entity_id: "entity_id", description: "visible event the renderer should execute" }],
          spoken_caption: { text: "short spoken narration", display_mode: "short_phrase", cadence: "natural_speech", max_words_on_screen: 5 },
        },
      ],
      camera_notes: "legacy semantic camera intent",
      interaction_notes: "what learner should inspect after story playback",
    },
    guided_interaction: { instruction: "learner-facing instruction", required_action_type: "orbit | zoom | scrub_beats | inspect_entity | compare_entities | drag_object | toggle_layer | answer_in_scene | none", target_entity_ids: ["entity_id"], success_observation: "string" },
    probe: {
      probe_type: "one allowed probe type",
      question: "learner-facing question",
      options: [{ id: "option_a", text: "choice text" }],
      correct_option_id: "option id for single_choice",
      expected_ideas: ["for explain/text probes"],
      misconception_markers: [{ misconception_id: "stable id", label: "short label", description: "what this misconception would reveal" }],
      what_it_measures: "string",
    },
    personalization_hypotheses: [{ kind: "bridge_level | jargon_level | presentation_style | support_kind | probe_type | verification_pattern", value: "string", direction: "prefer | avoid | verify", scope: "global | topic | diagnosis_label | probe_type", scope_key: "string or null", confidence: 0, reason: "string" }],
    confidence: { overall: 0, scene: 0, probe: 0 },
  };

  return `TASK
###
Build a compact MyWay semantic draft for this visual learning turn.
Return exactly one JSON object matching OUTPUT_JSON_SHAPE.
Make scene.directed_scene rich enough that a directed-scene compiler can derive spatial constraints, motion tracks, camera tracks, label rules, and caption timing without a template or layout mode.
###

CONTEXT
"""
${JSON.stringify(context, null, 2)}
"""

ALLOWED_VALUES_AND_LIMITS
"""
${JSON.stringify(capabilities, null, 2)}
"""

OUTPUT_JSON_SHAPE
"""
${JSON.stringify(outputShapeForPrompt, null, 2)}
"""

RULES
###
If the learner request is unclear, set turn_status to "needs_clarification" and only include clarification fields that matter.

If proceeding:
- include topic, diagnosis, learning_focus, orientation_segments, personalization_decision, scene, guided_interaction, probe, personalization_hypotheses, and confidence
- obey generation_mode: reliable means compact, clear, 3-4 visual beats; cinematic may use richer camera language up to the allowed limit
- use plain language
- first name the stuck point in the learner's words, then build the visual model
- make a real use/do_not_use decision for interests; use them only as structural bridges, not decoration
- when interests are useful, map them to a concept operation and state what must stay accurate
- treat scene.directed_scene as the primary visual direction
- keep orientation_segments, scene.beats, story_beats, and probe options within the limits
- describe visual_need only; do not use asset ids or file paths
- every executable scene beat must cite at least one orientation segment id
- story_beats should include director_intent, camera, visual_events, and spoken_caption
- spoken_caption should use short_phrase display by default, with 3-6 words visible at once and natural_speech cadence
- labels should avoid covering the core motion; prefer active/selected labels
- the probe must test learning_focus.target_takeaway
- do not create durable personalization_delta before an attempt
###`;
}

export function buildVisualLearningTurnModelRequest(input: VisualLearningTurnInput): VisualLearningTurnModelRequest {
  const userPrompt = buildUserPrompt(input);

  return {
    model_task: "visual_learning_semantic_draft_planner",
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
    response_contract: VISUAL_LEARNING_SEMANTIC_DRAFT_RESPONSE_CONTRACT,
    compiler_input: input,
    tuning_notes: [
      "Step 11: reliable mode requests a compact semantic draft to reduce provider timeouts; cinematic mode permits richer direction.",
      "Step 9: model must make an explicit personalization_decision and use interests only as structural bridges.",
      "Step 8 directed cinematic scene schema: the model provides a director-style scene brief plus executable semantic fields.",
      "scene.directed_scene is primary visual direction; model should not output experience_mode or layout_mode.",
      "MyWay wraps the compact semantic draft into strict VisualLearningTurnOutput deterministically.",
      "Durable personalization_delta still belongs to the Attempt Evaluator after the learner attempts the probe.",
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
