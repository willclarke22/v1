import type { ProbeType } from "@/lib/engine/schemas/shared";
import type {
  VisualLearningTurnInput,
  VisualLearningTurnOutput,
  VisualLearningTurnProceedOutput,
} from "./visual-learning-turn";
import {
  DEFAULT_BRIDGE_LEVEL,
  DEFAULT_JARGON_LEVEL,
  DEFAULT_VISUAL_LEARNING_PROBE_TYPES,
  DEFAULT_VISUAL_LEARNING_RENDERER_CAPABILITIES,
} from "./visual-learning-turn";
import {
  krebsVisualLearningTurnInputExample,
  unclearVisualLearningTurnOutputExample,
} from "./visual-learning-turn-examples";
import { SHARED_CONFUSION_LABELS, SHARED_INSIGHT_LABELS } from "./diagnostic-relationships";
import {
  DIRECTOR_BEHAVIOURS,
  DIRECTOR_CAMERA_MOVEMENTS,
  DIRECTOR_CAMERA_SHOTS,
  DIRECTOR_REPRESENTATION_MODES,
  directorPlanToCaptionPolicy,
  directorPlanToLegacyDirectedScene,
  directorPlanToLegacySemanticBeats,
  directorPlanToLegacyStoryBeats,
  normalizeEducationalSceneDirectorPlan,
} from "../director";

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
- directing a sequence of exceptional visual moments even before final assets exist
- creating a follow-up probe

The learner_facing_prompt.full_prompt is the source of truth.
The scene.director_plan is the source of truth for how that teaching path is staged.

Direct the lesson before casting final assets:
- Give every moment exactly one learner-attention job.
- Keep stable entity ids so actors can be replaced later without rewriting the scene.
- Never weaken or omit direction because an asset may be unavailable.
- Describe capability and anchor needs for physical actors, such as rotate, pour, contain, connect, open, or follow.
- Use camera framing, motion, timed text, and progressive reveal to make the causal relationship visible.
- Prefer a clear animated diagram or mechanistic abstraction over a poor literal reenactment.
- MyWay owns asset ids, file paths, geometry validation, collision safety, renderer math, and late binding.

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
    entities: [
      {
        id: "stable_entity_id",
        display_name: "learner-facing name",
        semantic_role: "what this actor means in the explanation",
        visual_need: {
          description: "what must be visible even if a final asset is not ready",
          semantic_tags: ["identity and scene-role tags"],
          preferred_render_kind: "sphere | box | arrow | path | label | particle | registered_asset | any",
        },
        actor_kind: "physical_asset | procedural_effect | diagrammatic_actor | path | label | symbolic_actor | any",
        asset_policy: {
          asset_required: false,
          can_use_proxy_until_asset_ready: true,
          fallback_representation: "diagrammatic_proxy | abstract_proxy | path_or_label | preserve_direction_without_actor | none",
          capability_needs: ["move, rotate, pour, contain, open, connect, etc."],
          anchor_needs: ["ground, center, output, input, handle, interior, etc."],
        },
      },
    ],
    relationships: [
      {
        id: "relationship_id",
        source_entity_id: "entity_id",
        target_entity_ids: ["entity_id"],
        relationship_type: "connects_to | contrasts_with | causes | becomes | enters | leaves | cycles_back | supports_takeaway",
        explanation: "why the relationship matters to the learner",
      },
    ],
    director_plan: {
      schema_version: "myway_educational_scene_director_v1",
      title: "short scene title",
      scene_thesis: "one sentence describing what the scene must make undeniable",
      learner_takeaway: "the mental model the learner should leave with",
      representation_strategy: {
        primary_mode: DIRECTOR_REPRESENTATION_MODES.join(" | "),
        secondary_modes: ["optional alternate representation"],
        reason: "why this representation best exposes the hidden relationship",
        fidelity_priority: "causal_clarity | spatial_clarity | comparison_clarity | literal_fidelity",
      },
      style: {
        look: "clean stylized, technical cutaway, diagrammatic, etc.",
        mood: "clear and calm",
        continuity: "what remains visible across moments",
        attention_policy: "how the scene keeps one visual job per moment",
      },
      moments: [
        {
          id: "moment_1",
          title: "short moment title",
          learning_job: "the single teaching job of this moment",
          director_intent: "exactly what the learner should notice",
          source_explanation_piece_ids: ["piece_1"],
          duration_ms: 4200,
          introduces_entity_ids: ["entity_id"],
          keeps_visible_entity_ids: [],
          active_entity_ids: ["entity_id"],
          camera: {
            shot_type: DIRECTOR_CAMERA_SHOTS.join(" | "),
            movement: DIRECTOR_CAMERA_MOVEMENTS.join(" | "),
            focus_entity_ids: ["entity_id"],
            framing_intent: "what must remain readable in frame",
            keep_visible_entity_ids: [],
          },
          events: [
            {
              id: "event_1",
              behaviour: DIRECTOR_BEHAVIOURS.join(" | "),
              actor_entity_id: "entity_id",
              target_entity_id: "optional entity id or null",
              supporting_entity_ids: [],
              start_ms: 0,
              duration_ms: 1800,
              easing: "linear | ease_in | ease_out | ease_in_out | spring | step",
              path_hint: "semantic path description or null",
              description: "the visible change the renderer should compile",
              parameters: {},
              fallback_behaviour: "optional simpler supported behaviour or null",
            },
          ],
          text_cues: [
            {
              id: "text_1",
              kind: "object_anchor | world_label | screen_caption | screen_center",
              text: "short learner-facing phrase",
              anchor_entity_id: "entity_id or null",
              placement: "above | below | left | right | center | top | bottom | auto",
              start_ms: 250,
              end_ms: 3600,
              emphasis_words: ["optional"],
              entrance: "fade | fade_up | pop | type_on | none",
              exit: "fade | hold | none",
            },
          ],
          success_observation: "what should be visually obvious by the end of the moment",
        },
      ],
      global_text_policy: {
        max_words_per_cue: 18,
        max_lines: 2,
        avoid_covering_core_motion: true,
        prefer_object_anchored_text: true,
      },
      execution_policy: {
        direction_survives_missing_assets: true,
        preserve_entity_ids_for_late_binding: true,
        asset_resolution_owner: "myway",
        renderer_compiles_behaviours: true,
        allow_abstract_proxy_until_asset_ready: true,
      },
    },
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
- scene.director_plan is primary. Do not output legacy directed_scene, scene_moments, story_beats, or beats; MyWay derives those compatibility views.
- Every director moment must have one learning_job, one director_intent, an explicit camera cue, at least one event, and concise timed text.
- Keep entity ids stable across all moments and relationships.
- Do not omit an entity or simplify the teaching sequence because a final asset may be missing.
- For physical actors, include capability_needs and anchor_needs inside the entity's director metadata when useful; MyWay will preserve those for late binding.
- Use semantic behaviours even when the current Three.js renderer cannot execute the premium version yet. Include a simpler fallback_behaviour when possible.
- Prefer causal clarity over spectacle, and prefer a controlled abstraction over a misleading literal scene.
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
      "Director consolidation: full_prompt is the teaching source of truth and scene.director_plan is the staging source of truth.",
      "Director consolidation: legacy scene moments, story beats, semantic beats, camera tracks, and motion tracks are compatibility views derived by MyWay.",
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


function fallbackId(value: string, fallback: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}

function inferFallbackTopicLabel(input: VisualLearningTurnInput) {
  const known = input.known_topic_state?.topic_label;
  if (known && known.trim()) return known.trim();

  const raw = input.user_message?.text.trim() ?? "";
  const lower = raw.toLowerCase();

  if (lower.includes("piston")) return "Pistons in engines";
  if (lower.includes("krebs")) return "Krebs cycle";
  if (lower.includes("circuit")) return "Electric circuits";
  if (lower.includes("mitochond")) return "Mitochondria";
  if (lower.includes("force") || lower.includes("motion")) return "Forces and motion";

  const withoutLeadIn = raw
    .replace(/^i\s+(do not|don't|dont)\s+understand\s+(how|why|what)?\s*/i, "")
    .replace(/^can you\s+(explain|show me|help me understand)\s*/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();

  const words = withoutLeadIn.split(/\s+/g).filter(Boolean).slice(0, 5).join(" ");
  if (words) return words.charAt(0).toUpperCase() + words.slice(1);

  return "Visual learning request";
}

function buildTopicAwareScaffoldOutput(input: VisualLearningTurnInput): VisualLearningTurnOutput {
  const topicLabel = inferFallbackTopicLabel(input);
  const topicId = fallbackId(topicLabel, "current_topic");
  const lower = input.user_message?.text.toLowerCase() ?? "";
  const isPiston = lower.includes("piston");

  const title = isPiston ? "How a Piston Turns Push Into Spin" : `A First-Principles View of ${topicLabel}`;
  const rootProblem = isPiston
    ? "The learner may see the piston as a named engine part before seeing the job it performs in the larger motion chain."
    : `The learner may be missing the basic system role and cause-effect structure behind ${topicLabel}.`;
  const targetTakeaway = isPiston
    ? "A piston matters because it catches a straight push from expanding gas and helps turn that push into spinning motion through the rod and crank."
    : `${topicLabel} becomes easier when you start with the system need, identify the wall, and then see how each part helps solve it.`;

  const explanationPieces = isPiston
    ? [
        {
          id: "piece_1_need_motion",
          text: "An engine needs useful motion. More specifically, it needs motion that can eventually spin something.",
          role: "start_from_basic_need" as const,
        },
        {
          id: "piece_2_push_not_spin",
          text: "Fuel does not directly give wheel-like spin. Burning fuel first creates a fast expanding push.",
          role: "hit_a_wall" as const,
        },
        {
          id: "piece_3_piston_catches_push",
          text: "The piston is the sliding wall that catches that push and moves straight down inside the cylinder.",
          role: "introduce_needed_part" as const,
        },
        {
          id: "piece_4_straight_to_spin",
          text: "A straight push still is not spin, so the rod and crank convert that sliding motion into rotation.",
          role: "connect_parts" as const,
        },
        {
          id: "piece_5_takeaway",
          text: "That is why the piston matters: it starts the chain that turns fuel's push into usable engine motion.",
          role: "land_the_takeaway" as const,
        },
      ]
    : [
        {
          id: "piece_1_need",
          text: `Start with what the system needs before naming the parts of ${topicLabel}.`,
          role: "start_from_basic_need" as const,
        },
        {
          id: "piece_2_wall",
          text: "Then identify the wall: what cannot happen yet, or what is missing from the picture?",
          role: "hit_a_wall" as const,
        },
        {
          id: "piece_3_part",
          text: "Introduce each part only when it solves that wall.",
          role: "introduce_needed_part" as const,
        },
        {
          id: "piece_4_takeaway",
          text: "The topic becomes clearer when the parts are connected into one cause-and-effect chain.",
          role: "land_the_takeaway" as const,
        },
      ];

  const fullPrompt = explanationPieces.map((piece) => piece.text).join("\n\n");
  const orientationSegments = explanationPieces.slice(0, 5).map((piece, index) => ({
    id: `orientation_${index + 1}`,
    text: piece.text,
    purpose:
      index === 0
        ? ("show_main_structure" as const)
        : index === explanationPieces.length - 1
          ? ("connect_to_probe" as const)
          : ("show_motion_or_change" as const),
  }));

  const primaryEntityId = isPiston ? "piston" : "main_part";
  const inputEntityId = isPiston ? "expanding_gas" : "system_input";
  const outputEntityId = isPiston ? "crank_spin" : "system_output";

  const scaffold: VisualLearningTurnProceedOutput = {
    schema_version: "myway_visual_learning_turn_output_v1",
    turn_status: "proceed",
    clarification_gate: {
      schema_version: "myway_turn_clarification_gate_output_v1",
      action: "proceed",
      confidence: { overall: 0.72, topic: 0.76, learner_goal: 0.7 },
      clarification_question: null,
      scope_choices: [],
      reason:
        "Step 13b topic-aware scaffold: the provider output was unavailable or unusable, but the learner message still contains enough topic signal to avoid a stale example fallback.",
    },
    topic_resolution: {
      topic_label: topicLabel,
      topic_id: null,
      topic_confidence: isPiston ? 0.9 : 0.66,
      topic_reference_type: "new_topic",
      reason: "Topic inferred from the learner message by the sandbox fallback.",
    },
    diagnosis: {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: "representation_gap",
      diagnosis_confidence: 0.7,
      next_action: "generate_probe_contract",
      next_action_confidence: 0.68,
      suggested_question: null,
    },
    diagnostic_signal: {
      confusion: { score: isPiston ? 0.62 : 0.55, confidence: 0.62 },
      insight: { score: isPiston ? 0.22 : 0.16, confidence: 0.55 },
      pattern_candidates: [
        {
          id: `${topicId}_part_without_a_job`,
          kind: "confusion",
          shared_label: "part_without_a_job",
          short_explanation: "This topic may feel confusing because a part or step only makes sense after you see the job it does in the larger system.",
          evidence: "The learner asks for how the topic works or why it matters, which suggests the part's role is not yet connected to the system purpose.",
          confidence: isPiston ? 0.78 : 0.62,
        },
        {
          id: `${topicId}_missing_input_output_change`,
          kind: "confusion",
          shared_label: "missing_input_output_change",
          short_explanation: "This topic may feel confusing because the important transformation is hidden: something goes in, changes form, and comes out as something more useful.",
          evidence: "The learner is asking for the mechanism, which often means the input-output change is not visible yet.",
          confidence: isPiston ? 0.74 : 0.58,
        },
        {
          id: `${topicId}_purpose_reveals_the_part`,
          kind: "insight",
          shared_label: "purpose_reveals_the_part",
          short_explanation: "A useful path is to start with what the larger system needs, then introduce the part as something that solves a problem.",
          evidence: "The learner asks why the topic is important, which gives MyWay a purpose-first explanation path.",
          confidence: isPiston ? 0.68 : 0.54,
        },
      ],
    },
    learning_focus: {
      root_problem: rootProblem,
      target_takeaway: targetTakeaway,
    },
    visual_experience: {
      schema_version: "myway_visual_experience_compiler_output_v1",
      title,
      full_prompt: fullPrompt,
      explanation_pieces: explanationPieces,
      what_to_watch_for: isPiston
        ? [
            "Watch the gas create a straight push.",
            "Watch the piston move straight instead of spinning.",
            "Watch the crank turn that straight motion into rotation.",
          ]
        : ["Watch what the system needs.", "Watch which part solves the wall.", "Watch what changes from input to output."],
      experience_mode: isPiston ? "mechanism" : "model_selected_scene",
      orientation_segments: orientationSegments,
      semantic_scene_plan: {
        directed_scene: {
          scene_concept: isPiston
            ? "A simple cutaway cylinder with a gas push above a sliding piston and a crank below."
            : `A simple progressive scene for ${topicLabel}: need, wall, part, and output.`,
          visual_metaphor: isPiston ? "straight push becomes spin" : "part gets meaning from its job",
          emotional_tone: "clear, calm, cinematic",
          spatial_design: "Reveal the input first, then the working part, then the output path. Keep earlier pieces visible so the chain is easy to follow.",
          cinematography: {
            opening_shot: "Start wide with only the system frame visible.",
            camera_motion: "Push in as the active part appears, then pull back to show the complete chain.",
            focus_strategy: "Glow only the active piece while keeping previously introduced pieces dimly visible.",
          },
          reveal_strategy: {
            reveal_elements_one_at_a_time: true,
            reason: "Progressive reveal avoids dumping the whole system on screen before the learner has the basic chain.",
            reveal_order_entity_ids: [inputEntityId, primaryEntityId, outputEntityId],
            keep_previous_elements_visible: true,
          },
        },
        scene_moments: explanationPieces.slice(0, 4).map((piece, index) => ({
          id: `moment_${index + 1}`,
          title: piece.text.slice(0, 54),
          source_explanation_piece_ids: [piece.id],
          introduces_entity_ids: index === 0 ? [inputEntityId] : index === 1 ? [primaryEntityId] : index === 2 ? [outputEntityId] : [],
          keeps_visible_entity_ids: index === 0 ? [] : [inputEntityId, primaryEntityId, outputEntityId].slice(0, Math.min(index + 1, 3)),
          active_entity_ids: index === 0 ? [inputEntityId] : index === 1 ? [primaryEntityId] : [outputEntityId],
          director_intent: piece.text,
          camera: {
            shot_type: index === 0 ? "wide" : index === 1 ? "push_in" : "pull_back",
            focus_entity_ids: index === 0 ? [inputEntityId] : index === 1 ? [primaryEntityId] : [outputEntityId],
            movement: "Move only enough to keep the active explanation piece centered.",
          },
          visual_events: [
            {
              type: index === 0 ? "pop" : index === 1 ? "move" : "trace",
              entity_id: index === 0 ? inputEntityId : index === 1 ? primaryEntityId : outputEntityId,
              description: piece.text,
            },
          ],
        })),
        entities: [
          {
            id: inputEntityId,
            display_name: isPiston ? "expanding gas" : "input",
            semantic_role: isPiston ? "the source of the straight push" : "what enters the system",
            visual_need: {
              description: isPiston ? "A glowing gas cloud pushing downward." : "A clear input token entering the system.",
              semantic_tags: ["input", "cause", "start"],
              preferred_render_kind: isPiston ? "particle" : "sphere",
              fallback_allowed: true,
            },
            position_hint: [-1.8, 0, 0],
          },
          {
            id: primaryEntityId,
            display_name: isPiston ? "piston" : "working part",
            semantic_role: isPiston ? "the sliding wall that catches the push" : "the part that solves the system wall",
            visual_need: {
              description: isPiston ? "A flat sliding wall inside a cylinder." : "A central part that changes the input.",
              semantic_tags: ["part", "job", "mechanism"],
              preferred_render_kind: "box",
              fallback_allowed: true,
            },
            position_hint: [0, 0, 0],
          },
          {
            id: outputEntityId,
            display_name: isPiston ? "spin" : "output",
            semantic_role: isPiston ? "the useful rotating motion created downstream" : "what the system produces",
            visual_need: {
              description: isPiston ? "A circular arrow or wheel showing rotation." : "A visible output path leaving the system.",
              semantic_tags: ["output", "result", "transformation"],
              preferred_render_kind: "path",
              fallback_allowed: true,
            },
            position_hint: [1.8, 0, 0],
          },
        ],
        relationships: [
          {
            id: "input_to_part",
            source_entity_id: inputEntityId,
            target_entity_ids: [primaryEntityId],
            relationship_type: "causes",
            explanation: "The input creates the need or push that the part responds to.",
          },
          {
            id: "part_to_output",
            source_entity_id: primaryEntityId,
            target_entity_ids: [outputEntityId],
            relationship_type: "becomes",
            explanation: "The part helps turn the input into the useful output.",
          },
        ],
        beats: orientationSegments.slice(0, 4).map((segment, index) => ({
          id: `beat_${index + 1}`,
          title: segment.text.slice(0, 54),
          source_orientation_segment_ids: [segment.id],
          duration_ms: 4200,
          active_entity_ids: index === 0 ? [inputEntityId] : index === 1 ? [primaryEntityId] : [outputEntityId],
          actions: [
            {
              id: `action_${index + 1}`,
              type: index === 0 ? "show_entity" : index === 1 ? "highlight_entity" : "trace_path",
              target_entity_id: index === 0 ? inputEntityId : index === 1 ? primaryEntityId : outputEntityId,
              narration: segment.text,
              params: {},
            },
          ],
        })),
        camera_notes: "Use a slow progressive reveal and avoid showing every element at once.",
        interaction_notes: "Let the learner scrub the chain from input to part to output.",
      },
    },
    guided_interaction: {
      instruction: isPiston
        ? "Scrub the scene once and point to what moves straight, then what spins."
        : "Scrub the scene once and point to the need, the part, and the output.",
      required_action_type: "scrub_beats",
      target_entity_ids: [inputEntityId, primaryEntityId, outputEntityId],
      success_observation: "The learner can separate the input, the working part, and the output.",
    },
    personalization_decision: {
      chosen_interest: null,
      use_interest: "do_not_use",
      reason: "The scaffold fallback avoids adding personalization unless the model successfully authors it.",
      structural_mapping: null,
      anti_distortion_guard: "Keep the mechanism truthful and simple.",
    },
    followup_probe: {
      schema_version: "probe_contract_model_output_v1",
      probe_type: "single_choice",
      expected_attempt_type: "single_choice",
      prompt: {
        root_problem_explanation: rootProblem,
        reshaping_explanation: targetTakeaway,
        task: "Choose the statement that best matches the scene.",
        full_prompt: isPiston
          ? "In the scene, what is the piston's main job in the chain from fuel to useful engine motion?"
          : `In the scene, what made ${topicLabel} easier to understand?`,
      },
      presentation_support: [
        {
          kind: "visual_description",
          style_used: "visual_description",
          text: "The fallback probe checks the simple input-part-output chain.",
          user_interest_used: null,
          confidence: 0.55,
        },
      ],
      answer_key: { kind: "single_choice", correct_option_id: "input_part_output" },
      misconception_markers: [
        {
          misconception_id: "part_without_system_role",
          label: "Part without system role",
          marker: "random part",
          description: "The learner still treats the part as isolated from the system job.",
          confidence: 0.62,
        },
      ],
      renderer_params: {
        options: [
          {
            id: "input_part_output",
            label: "A",
            text: isPiston
              ? "It catches a straight push and helps pass that motion toward spin."
              : "The part made sense after its job in the larger system was visible.",
          },
          {
            id: "part_alone",
            label: "B",
            text: isPiston ? "It spins by itself inside the cylinder." : "The part matters mostly because of its name.",
          },
          {
            id: "no_change",
            label: "C",
            text: isPiston ? "It blocks all gas so nothing moves." : "Nothing really changes from input to output.",
          },
        ],
      },
      delivery_context: {
        bridge_level: input.personalization_context.bridge_level,
        language_policy: input.personalization_context.language_policy,
        presentation_styles_used: ["visual_description", "step_by_step"],
        support_kinds_used: ["visual_description", "step_by_step_frame"],
        example_domains_used: [],
        personalization_signals_used: [],
      },
      confidence: 0.62,
    },
    confidence: 0.62,
  };

  const scenePlan =
    scaffold.visual_experience
      .semantic_scene_plan;
  const directorResult =
    normalizeEducationalSceneDirectorPlan(
      scenePlan.director_plan ??
        scenePlan.directed_scene ??
        {},
      {
        source: "scaffold",
        title:
          scaffold.visual_experience
            .title,
        scene_thesis:
          scaffold.visual_experience
            .full_prompt ??
          rootProblem,
        learner_takeaway:
          targetTakeaway,
        entities:
          scenePlan.entities,
        relationships:
          scenePlan.relationships,
        explanation_pieces:
          scaffold.visual_experience
            .explanation_pieces,
        legacy_directed_scene:
          scenePlan.directed_scene,
        legacy_story_beats:
          scenePlan.scene_moments ??
          scenePlan.story_beats,
        legacy_beats:
          scenePlan.beats,
      },
    );
  const storyBeats =
    directorPlanToLegacyStoryBeats(
      directorResult.plan,
    );
  const semanticBeats =
    directorPlanToLegacySemanticBeats(
      directorResult.plan,
      scaffold.visual_experience
        .orientation_segments.map(
          (segment) => segment.id,
        ),
    );

  return {
    ...scaffold,
    visual_experience: {
      ...scaffold.visual_experience,
      semantic_scene_plan: {
        ...scenePlan,
        director_plan:
          directorResult.plan,
        director_validation:
          directorResult.validation,
        directed_scene:
          directorPlanToLegacyDirectedScene(
            directorResult.plan,
          ),
        scene_moments:
          storyBeats,
        story_beats:
          storyBeats,
        caption_policy:
          directorPlanToCaptionPolicy(
            directorResult.plan,
          ),
        beats:
          semanticBeats.length
            ? (semanticBeats as unknown as typeof scenePlan.beats)
            : scenePlan.beats,
      },
    },
  };

}

export function buildVisualLearningTurnScaffoldOutput(
  input: VisualLearningTurnInput,
  body: VisualLearningTurnRequestBody = {},
): VisualLearningTurnOutput {
  if (body.example === "unclear" || messageLooksUnclear(input, body)) {
    return unclearVisualLearningTurnOutputExample;
  }

  // Step 13b: never fall back to a stale hard-coded Krebs example for a different
  // learner message. Provider/parse fallback should remain topic-aware so debug
  // output and sandbox relationship previews do not become misleading.
  return buildTopicAwareScaffoldOutput(input);
}
