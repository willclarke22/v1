import type {
  VisualExperienceCompilerInput,
  VisualExperienceModelMessage,
  VisualExperienceModelRequest,
} from "./schema";

export const VISUAL_EXPERIENCE_COMPILER_SYSTEM_PROMPT = `You are the MyWay Visual Experience Compiler.

Your job is to convert a learner need into a renderer-facing visual learning experience.

You do not write code. You do not invent file paths. You do not invent asset ids.
You may only choose assets from compiler_input.available_assets by asset_id.
If a useful asset is missing, declare it in asset_requests instead of pretending it exists.

The orientation is the learner-facing source of truth. The scene plan must support the orientation, not drift into a separate lesson.

Follow the bridge/language policy. If bridge_level is bridge_0 or jargon_level is none, use plain everyday language and avoid jargon.

Return one valid JSON object matching the response contract. No Markdown. No commentary outside JSON.`;

export function buildVisualExperienceResponseContract() {
  return {
    schema_version: "myway_visual_experience_compiler_output_v1",
    title: "Short title for the visual experience.",
    orientation:
      "A short learner-facing explanation that describes what the learner is about to see. This is the source of truth for the scene.",
    target_takeaway: "The one mental model the learner should leave with.",
    experience_mode:
      "Must be one of compiler_input.renderer_capabilities.supported_experience_modes.",
    asset_uses: [
      {
        asset_id: "Must match one asset_id from compiler_input.available_assets.",
        role: "A render role that fits the asset and scene.",
        purpose: "Why this asset helps the learner picture the idea.",
        beat_id: "Optional id of the beat where this asset matters most.",
      },
    ],
    asset_requests: [
      {
        need_id: "Stable id for a missing asset request.",
        description: "What missing asset would improve this experience.",
        semantic_tags: ["tags", "that", "would", "find", "the", "asset"],
        preferred_asset_type: "glb | gltf | texture | hdri | primitive",
        required: false,
        fallback_strategy: "use_primitive | use_generic_asset | skip",
      },
    ],
    scene_plan: {
      renderer: "react_three_fiber_sandbox",
      visual_style: "simple_preview | diagrammatic | cinematic_learning | minimal_story",
      entities: [
        {
          id: "visible_entity_id",
          display_name: "Learner-facing name.",
          semantic_role: "What this visible thing means in the explanation.",
          asset_id: "Optional registered asset id, or null for primitive fallback.",
          primitive_fallback: "sphere | box | arrow | path | label | particle | none",
          position_hint: [0, 0, 0],
        },
      ],
      beats: [
        {
          id: "beat_1",
          title: "Short beat title.",
          script_segment: "One sentence or phrase from the orientation.",
          duration_ms: 4500,
          active_entity_ids: ["visible_entity_id"],
          active_asset_ids: ["registered_asset_id"],
          actions: [
            {
              id: "action_1",
              type: "show_asset | highlight_asset | move_camera | show_label | trace_path | show_relationship | fade_in | fade_out | pause_for_check",
              target_entity_id: "visible_entity_id",
              asset_id: "registered_asset_id",
              narration: "Optional short narration/caption.",
              params: {},
            },
          ],
        },
      ],
      camera_notes: "Renderer-facing camera intent, not raw code.",
      interaction_notes: "What the learner can inspect after the story.",
    },
    check_prompt: "Optional one-question check after the visual experience.",
  };
}

function summarizeAssetsForPrompt(input: VisualExperienceCompilerInput) {
  if (!input.available_assets.length) {
    return "No registered assets are currently available for this request. Use primitive fallback and declare asset_requests for missing helpful assets.";
  }

  return input.available_assets
    .map((asset, index) => {
      return `${index + 1}. ${asset.asset_id} (${asset.display_name}) — domain: ${asset.domain}; type: ${asset.asset_type}; tags: ${asset.semantic_tags.join(", ") || "none"}; roles: ${asset.render_roles.join(", ") || "none"}; modes: ${asset.experience_modes.join(", ") || "none"}; license_status: ${asset.license_status}`;
    })
    .join("\n");
}

export function buildVisualExperienceCompilerUserPrompt(input: VisualExperienceCompilerInput) {
  const noJargon = input.output_preferences.no_jargon;

  return `Build a VisualExperienceCompilerOutput for this MyWay learner request.

LEARNER + DIAGNOSIS
- learner_message: ${input.learner_message}
- topic_label: ${input.target_topic.topic_label}
- diagnosis: ${input.target_diagnosis}
- root_problem: ${input.root_problem ?? "not provided"}

PERSONALIZATION / LANGUAGE
- bridge_level: ${input.personalization_context.bridge_level}
- jargon_level: ${input.personalization_context.language_policy.jargon_level}
- preferred_style: ${input.personalization_context.preferred_style ?? "not provided"}
- no_jargon_required: ${noJargon ? "yes" : "no"}

REGISTERED ASSETS YOU MAY USE
${summarizeAssetsForPrompt(input)}

RENDERER CAPABILITIES
${JSON.stringify(input.renderer_capabilities, null, 2)}

OUTPUT PREFERENCES
${JSON.stringify(input.output_preferences, null, 2)}

FULL COMPILER INPUT JSON
${JSON.stringify(input, null, 2)}

Remember:
- Return JSON only.
- Use only registered asset ids from available_assets.
- If an asset does not exist, put it in asset_requests.
- Keep the scene plan renderer-facing and safe for MyWay to validate.
- The orientation must be learner-facing and should drive the beats.`;
}

export function buildVisualExperienceModelMessages(
  input: VisualExperienceCompilerInput,
): VisualExperienceModelMessage[] {
  return [
    {
      role: "system",
      content: VISUAL_EXPERIENCE_COMPILER_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: buildVisualExperienceCompilerUserPrompt(input),
    },
  ];
}

export function buildVisualExperienceModelRequest(
  input: VisualExperienceCompilerInput,
): VisualExperienceModelRequest {
  const messages = buildVisualExperienceModelMessages(input);
  const response_contract = buildVisualExperienceResponseContract();
  const system_chars = messages[0]?.content.length ?? 0;
  const user_chars = messages[1]?.content.length ?? 0;

  return {
    model_task: "visual_experience_compiler",
    schema_version: "myway_visual_experience_model_request_debug_v1",
    messages,
    response_contract,
    compiler_input: input,
    tuning_notes: [
      "This debug object is the exact shape that Step 7 can send to a model provider.",
      "Prompt wording lives in model-request.ts so we can tweak it without touching routes/UI.",
      "The model must choose existing assets by asset_id or declare asset_requests for missing assets.",
      "The output is renderer-facing JSON; MyWay validates before rendering.",
    ],
    prompt_stats: {
      system_chars,
      user_chars,
      total_chars: system_chars + user_chars,
      available_asset_count: input.available_assets.length,
    },
  };
}
