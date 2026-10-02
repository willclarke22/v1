import {
  VISUAL_ORCHESTRATION_STAGE_DEFINITIONS,
  type VisualOrchestrationRequest,
} from "./contracts";

const SYSTEM_PROMPT = `You are the semantic reasoning component in MyWay's Visual Experience Orchestration Lab.

This is a calibration task, not a full Visual Experience turn. Return only valid JSON. Do not include markdown or commentary.

Authority boundary:
- You identify the learner's missing mental model and name the concrete visual assets/concepts needed to show it.
- Use ordinary canonical concept names such as femur, hip, knee, heart, car, battery, or wire.
- Never output BodyParts3D ids, asset ids, file paths, mesh ids, search keywords, ontology ids, camera coordinates, collision math, placement transforms, or renderer implementation.
- Do not make MyWay rediscover an obvious noun from an indirect description when you can name the noun directly.
- Keep identity separate from appearance: concept="car" with appearance.color="blue", not concept="blue car", when color is only a visual property.
- Laterality is semantic input, not a presentation choice. If the learner/context does not explicitly specify left, right, both sides, or bilateral anatomy, use laterality="unspecified"; never invent a side just to make the example concrete.
- MyWay deterministically grounds your simple asset intents into real assets and later compiles Director/runtime behavior.
- Keep the answer as small as the requested stage allows.`;

function assetIntentShape() {
  return {
    concept: "ordinary canonical asset/concept name",
    role: "primary_subject | context | supporting | environment | effect",
    importance: "required | preferred | optional",
    quantity: 1,
    laterality: "left | right | bilateral | unspecified",
    appearance: {
      color: "optional appearance only",
      material: "optional appearance only",
      style: "optional appearance only",
    },
  };
}

function outputShape(stage: VisualOrchestrationRequest["stage"]) {
  if (stage === 1) {
    return {
      schema_version: "myway_visual_orchestration_stage1_v1",
      topic_label: "short topic label",
      root_problem: "precise missing mental model that is keeping the learner stuck",
    };
  }
  if (stage === 2) {
    return {
      schema_version: "myway_visual_orchestration_stage2_v2",
      topic_label: "short topic label",
      root_problem: "precise missing mental model that is keeping the learner stuck",
      asset_intents: [assetIntentShape()],
    };
  }
  return {
    schema_version: "myway_visual_orchestration_stage3_v2",
    topic_label: "short topic label",
    root_problem: "precise missing mental model that is keeping the learner stuck",
    asset_intents: [assetIntentShape()],
    target_takeaway: "smallest new mental model that resolves the root problem",
    relationships: [
      {
        source_concept: "one concept from asset_intents",
        relationship: "short semantic mechanism relationship",
        target_concept: "another concept from asset_intents",
        learning_reason: "why seeing this relationship matters",
      },
    ],
  };
}

export function buildVisualOrchestrationMessages(input: VisualOrchestrationRequest) {
  const definition = VISUAL_ORCHESTRATION_STAGE_DEFINITIONS[input.stage];
  const user = `Run Visual Experience calibration stage ${input.stage}: ${definition.title}.

LEARNER_MESSAGE:
${input.learner_message}

AVAILABLE_ASSET_CONTEXT:
${
    input.asset_collection_mode === "bodyparts3d_full_atlas"
      ? "BodyParts3D 4.0 full human anatomy atlas is available. Name only the minimum anatomical structures needed. MyWay resolves exact atlas members after your response and preserves canonical shared-space placement."
      : "BodyParts3D SLP pilot anatomy collection is available. Name semantic anatomical structures only; MyWay resolves exact assets."
  }

STAGE_PURPOSE:
${definition.purpose}

OUTPUT_JSON_SHAPE:
${JSON.stringify(outputShape(input.stage))}

RULES:
- Return only this stage's JSON.
- Infer the topic from the learner message.
- root_problem must describe the missing mental model, not merely restate the learner's words.
- Do not teach the whole lesson yet.
- Do not create a Director plan, camera plan, animation plan, probe, or polished learner-facing explanation.
${
    input.stage >= 2
      ? "- asset_intents must be the minimum concrete cast needed. Prefer simple nouns. Do not output asset ids, aliases, search tags, or retrieval instructions. Omit appearance fields unless appearance genuinely matters. Use laterality=\"unspecified\" unless the learner/context explicitly names a side or bilateral anatomy."
      : ""
  }
${
    input.stage >= 3
      ? "- target_takeaway must directly resolve root_problem. Relationships must reference concept names from asset_intents."
      : ""
  }`;

  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: user },
  ];
}