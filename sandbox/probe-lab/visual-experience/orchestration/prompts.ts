import {
  VISUAL_ORCHESTRATION_STAGE_DEFINITIONS,
  type VisualOrchestrationRequest,
} from "./contracts";

const SYSTEM_PROMPT = `You are the semantic reasoning component in MyWay's Visual Experience Orchestration Lab.

This is a calibration task, not a full Visual Experience turn. Return only valid JSON. Do not include markdown or commentary.

Authority boundary:
- You identify the learner's missing mental model and semantic visual requirements.
- Refer to anatomy by semantic name only. Never output BodyParts3D ids, file paths, mesh ids, camera coordinates, collision math, placement transforms, or renderer implementation.
- MyWay deterministically resolves exact assets and later compiles Director/runtime behavior.
- Keep the answer as small as the requested stage allows.`;

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
      schema_version: "myway_visual_orchestration_stage2_v1",
      topic_label: "short topic label",
      root_problem: "precise missing mental model that is keeping the learner stuck",
      required_visual_concepts: [
        {
          semantic_name: "anatomical structure name",
          role: "why this structure must be visible to solve the root problem",
          semantic_tags: ["optional concise anatomy aliases or category tags"],
        },
      ],
    };
  }
  return {
    schema_version: "myway_visual_orchestration_stage3_v1",
    topic_label: "short topic label",
    root_problem: "precise missing mental model that is keeping the learner stuck",
    required_visual_concepts: [
      {
        semantic_name: "anatomical structure name",
        role: "why this structure must be visible",
        semantic_tags: ["optional concise tags"],
      },
    ],
    target_takeaway: "smallest new mental model that resolves the root problem",
    relationships: [
      {
        source_semantic_name: "one requested visual concept",
        relationship: "short semantic mechanism relationship",
        target_semantic_name: "another requested visual concept",
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
      ? "BodyParts3D 4.0 full human anatomy atlas is available. Ask only for the minimum anatomical structures needed. MyWay resolves exact atlas members after your response and preserves canonical shared-space placement."
      : "BodyParts3D SLP pilot anatomy collection is available. Ask for semantic anatomical structures only; MyWay resolves exact assets."
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
      ? "- required_visual_concepts must be the minimum semantic anatomy cast that makes the root problem visible. Do not output asset ids."
      : ""
  }
${
    input.stage >= 3
      ? "- target_takeaway must directly resolve root_problem. Relationships must use semantic names from required_visual_concepts."
      : ""
  }`;

  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: user },
  ];
}
