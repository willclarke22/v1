import { visualExperienceRendererCapabilities } from "./assets";
import { selectAssetsForVisualExperience } from "./asset-store.server";
import { buildVisualExperienceModelRequest } from "./model-request";

import type {
  VisualAssetSelectionInput,
  VisualBridgeLevel,
  VisualDiagnosisLabel,
  VisualExperienceCompilerInput,
  VisualExperienceCompilerOutput,
  VisualExperienceMode,
  VisualExperienceModelRequest,
  VisualJargonLevel,
  VisualPresentationStyle,
} from "./schema";

export type VisualExperienceCompilerBuildInput = {
  learner_message: string;
  topic_id?: string | null;
  topic_label?: string | null;
  diagnosis?: VisualDiagnosisLabel | string | null;
  root_problem?: string | null;
  bridge_level?: VisualBridgeLevel | null;
  jargon_level?: VisualJargonLevel | null;
  preferred_style?: VisualPresentationStyle | null;
  requested_experience_mode?: VisualExperienceMode | null;
  semantic_tags?: string[];
  max_assets?: number | null;
  asset_selection?: VisualAssetSelectionInput;
};

const DEFAULT_LEARNER_MESSAGE = "I can’t picture how this idea works.";

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function cleanOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBridgeLevel(value: unknown): VisualBridgeLevel {
  return value === "bridge_1" || value === "bridge_2" || value === "full_bridge" ? value : "bridge_0";
}

function normalizeJargonLevel(value: unknown, bridgeLevel: VisualBridgeLevel): VisualJargonLevel {
  if (value === "light" || value === "standard" || value === "full") return value;
  return bridgeLevel === "bridge_0" ? "none" : "light";
}

function normalizeExperienceMode(value: unknown): VisualExperienceMode | null {
  return value === "asset_preview" ||
    value === "model_selected_scene" ||
    value === "visual_story" ||
    value === "body_zoom" ||
    value === "cell_cutaway" ||
    value === "process_loop" ||
    value === "mechanism" ||
    value === "compare_contrast" ||
    value === "spatial_structure" ||
    value === "generic_scene"
    ? value
    : null;
}

function normalizePreferredStyle(value: unknown): VisualPresentationStyle | null {
  return value === "plain_direct" ||
    value === "gentle_coaching" ||
    value === "analogy_based" ||
    value === "metaphor_based" ||
    value === "concrete_examples" ||
    value === "step_by_step" ||
    value === "visual_description" ||
    value === "curiosity_question" ||
    value === "real_world_connection"
    ? value
    : null;
}

export async function buildVisualExperienceCompilerInput(
  input: VisualExperienceCompilerBuildInput,
): Promise<VisualExperienceCompilerInput> {
  const learner_message = cleanString(input.learner_message, DEFAULT_LEARNER_MESSAGE);
  const diagnosis = input.diagnosis ?? "representation_gap";
  const topic_label = cleanString(input.topic_label, inferTopicLabel(learner_message));
  const bridge_level = normalizeBridgeLevel(input.bridge_level);
  const jargon_level = normalizeJargonLevel(input.jargon_level, bridge_level);
  const semantic_tags = input.semantic_tags ?? input.asset_selection?.semantic_tags ?? [];
  const max_assets = input.max_assets ?? input.asset_selection?.max_assets ?? 8;

  const available_assets = await selectAssetsForVisualExperience({
    learner_message,
    diagnosis,
    semantic_tags,
    topic_label,
    max_assets,
  });

  return {
    schema_version: "myway_visual_experience_compiler_input_v1",
    learner_message,
    diagnosis,
    root_problem: cleanOptionalString(input.root_problem),
    target_topic: {
      topic_id: cleanOptionalString(input.topic_id),
      topic_label,
    },
    target_diagnosis: diagnosis,
    learner_signal: {
      signal_kind: "user_message",
      user_message: learner_message,
    },
    personalization_context: {
      bridge_level,
      language_policy: {
        jargon_level,
      },
      preferred_style: normalizePreferredStyle(input.preferred_style) ?? "visual_description",
      preferred_order: ["visual_description", "step_by_step", "concrete_examples"],
      preferred_order_confidence: 0.55,
      user_interests: [],
      profile_snapshot: {
        summary:
          "Sandbox default profile: prefer clear visual descriptions and step-by-step explanations unless stronger personalization signals are available.",
      },
    },
    available_assets,
    renderer_capabilities: visualExperienceRendererCapabilities,
    requested_experience_mode: normalizeExperienceMode(input.requested_experience_mode),
    output_preferences: {
      no_jargon: jargon_level === "none" || bridge_level === "bridge_0",
      model_must_use_registered_asset_ids: true,
      prefer_existing_assets_over_requests: true,
      keep_scene_plan_renderer_facing: true,
      include_optional_check: true,
      max_beats: 5,
      max_asset_uses: 5,
    },
    allow_asset_requests: true,
  };
}

export function buildVisualExperienceRequestDebug(
  input: VisualExperienceCompilerInput,
): VisualExperienceModelRequest {
  return buildVisualExperienceModelRequest(input);
}

export async function buildVisualExperienceModelRequestDebug(
  input: VisualExperienceCompilerBuildInput,
): Promise<VisualExperienceModelRequest> {
  const compilerInput = await buildVisualExperienceCompilerInput(input);
  return buildVisualExperienceRequestDebug(compilerInput);
}

export async function compileVisualExperienceScaffold(input: VisualExperienceCompilerBuildInput): Promise<{
  compiler_input: VisualExperienceCompilerInput;
  model_request: VisualExperienceModelRequest;
  scaffold_output: VisualExperienceCompilerOutput;
}> {
  const compiler_input = await buildVisualExperienceCompilerInput(input);
  const model_request = buildVisualExperienceRequestDebug(compiler_input);
  const firstAsset = compiler_input.available_assets[0];
  const firstAssetRole = firstAsset?.render_roles[0] ?? "reference_object";
  const experience_mode = compiler_input.requested_experience_mode ?? "model_selected_scene";

  return {
    compiler_input,
    model_request,
    scaffold_output: {
      schema_version: "myway_visual_experience_compiler_output_v1",
      title: firstAsset ? `${firstAsset.display_name} visual experience` : "Visual experience scaffold",
      orientation: firstAsset
        ? `We will use ${firstAsset.display_name} as a visible anchor, then connect that object back to the idea the learner is trying to picture.`
        : "We will first build a simple visible version of the idea, then ask for better assets if the current shelf does not contain the right object yet.",
      target_takeaway:
        "A visual experience can be planned from learner context, registered assets, and renderer capabilities before a real model provider is connected.",
      experience_mode,
      asset_uses: firstAsset
        ? [
            {
              asset_id: firstAsset.asset_id,
              role: firstAssetRole,
              purpose: "Use this registered asset as the first visible anchor in the scene.",
              beat_id: "beat_1_anchor",
            },
          ]
        : [],
      asset_requests: firstAsset
        ? []
        : [
            {
              need_id: "missing_topic_anchor_asset",
              description: `A clear GLB asset that can visually anchor ${compiler_input.target_topic.topic_label}.`,
              semantic_tags: [compiler_input.target_topic.topic_label, "visual_anchor"],
              preferred_asset_type: "glb",
              required: false,
              fallback_strategy: "use_primitive",
            },
          ],
      scene_plan: {
        renderer: "react_three_fiber_sandbox",
        visual_style: "simple_preview",
        entities: firstAsset
          ? [
              {
                id: "entity_anchor_asset",
                display_name: firstAsset.display_name,
                semantic_role: "visible anchor for the learner's mental model",
                asset_id: firstAsset.asset_id,
                primitive_fallback: "none",
                position_hint: [0, 0, 0],
              },
            ]
          : [
              {
                id: "entity_primitive_anchor",
                display_name: "simple anchor",
                semantic_role: "temporary primitive fallback until a better asset is registered",
                asset_id: null,
                primitive_fallback: "sphere",
                position_hint: [0, 0, 0],
              },
            ],
        beats: [
          {
            id: "beat_1_anchor",
            title: "Show the visual anchor",
            script_segment: "Start with one visible thing the learner can hold onto.",
            duration_ms: 4200,
            active_entity_ids: [firstAsset ? "entity_anchor_asset" : "entity_primitive_anchor"],
            active_asset_ids: firstAsset ? [firstAsset.asset_id] : [],
            actions: [
              {
                id: "action_1_show_anchor",
                type: firstAsset ? "show_asset" : "show_label",
                target_entity_id: firstAsset ? "entity_anchor_asset" : "entity_primitive_anchor",
                asset_id: firstAsset?.asset_id ?? null,
                narration: "Here is the first visual anchor for the explanation.",
                params: null,
              },
            ],
          },
          {
            id: "beat_2_connect_to_gap",
            title: "Connect it to the learner's gap",
            script_segment: "Then connect that visible thing to what was hard to picture.",
            duration_ms: 5200,
            active_entity_ids: [firstAsset ? "entity_anchor_asset" : "entity_primitive_anchor"],
            active_asset_ids: firstAsset ? [firstAsset.asset_id] : [],
            actions: [
              {
                id: "action_2_highlight_anchor",
                type: firstAsset ? "highlight_asset" : "show_label",
                target_entity_id: firstAsset ? "entity_anchor_asset" : "entity_primitive_anchor",
                asset_id: firstAsset?.asset_id ?? null,
                narration: compiler_input.root_problem ?? "This connects the visual anchor to the learner's root problem.",
                params: null,
              },
            ],
          },
        ],
        camera_notes: "Start wide, then gently focus on the anchor asset.",
        interaction_notes: "After the short scene, let the learner orbit and inspect the selected asset.",
      },
      check_prompt: "What did the visual anchor help you picture that was hard to picture before?",
    },
  };
}

function inferTopicLabel(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("krebs")) return "Krebs cycle";
  if (lower.includes("mitochond")) return "mitochondria";
  if (lower.includes("debug") || lower.includes("code")) return "debugging";
  if (lower.includes("pipe") || lower.includes("plumb")) return "plumbing";
  if (lower.includes("force") || lower.includes("motion")) return "forces and motion";
  return "visual learning request";
}
