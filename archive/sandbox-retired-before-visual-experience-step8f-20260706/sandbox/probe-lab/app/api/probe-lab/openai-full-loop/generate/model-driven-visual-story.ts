export type ModelDrivenVisualStoryRequest = {
  learnerMessage: string;
  topicLabel: string;
  bridgeLevel: string;
  jargonLevel: string;
  preferredStyle?: string | null;
  topicMode?: string | null;
  activeTopicId?: string | null;
  generateReason?: string | null;
  turnMode?: string | null;
};

export type ModelDrivenVisualStoryDraft = {
  schema_version: "myway_model_visual_story_draft_v1";
  orientation: {
    title: string;
    body: string;
  };
  topic: {
    topic_id: string;
    topic_label: string;
  };
  diagnosis: {
    label: string;
    root_problem: string;
  };
  visual_story: Record<string, unknown>;
  answer_key: Record<string, unknown>;
  misconception_markers: Array<{
    id: string;
    marker: string;
  }>;
  rationale?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, fallback: string, max = 2000) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, max)
    : fallback.slice(0, max);
}

function optionalString(value: unknown, max = 1000) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, max)
    : null;
}

function slug(value: string, fallback = "visual_story_topic") {
  const cleaned = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return cleaned || fallback;
}

function jsonShape(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function normalizeEntity(value: unknown, index: number) {
  const entity = asRecord(value);
  return {
    id: readString(entity.id, "entity_" + (index + 1), 120),
    kind: readString(entity.kind ?? entity.type, "custom", 80),
    display_name: optionalString(entity.display_name ?? entity.label ?? entity.name, 120),
    semantic_role: readString(entity.semantic_role ?? entity.role, "visible_idea", 160),
    meaning: optionalString(entity.meaning ?? entity.description, 500),
    visual_style: isRecord(entity.visual_style ?? entity.visualStyle)
      ? asRecord(entity.visual_style ?? entity.visualStyle)
      : {
          shape: optionalString(entity.shape, 120) ?? "simple glowing shape",
          color: optionalString(entity.color, 80) ?? "gold",
          visual_cues: asArray(entity.visual_cues ?? entity.visualCues)
            .filter((item): item is string => typeof item === "string")
            .slice(0, 4),
        },
  };
}

function normalizeRelationship(value: unknown, index: number) {
  const relationship = asRecord(value);

  return {
    id: readString(relationship.id, "relationship_" + (index + 1), 120),
    relationship_type: readString(
      relationship.relationship_type ?? relationship.relationshipType ?? relationship.type,
      "maps_to",
      100,
    ),
    from_entity_id: readString(
      relationship.from_entity_id ??
        relationship.source_entity_id ??
        relationship.sourceEntityId ??
        relationship.source ??
        relationship.from,
      "source",
      120,
    ),
    to_entity_id: readString(
      relationship.to_entity_id ??
        relationship.target_entity_id ??
        relationship.targetEntityId ??
        relationship.target ??
        relationship.to,
      "target",
      120,
    ),
    explanation: readString(
      relationship.explanation ?? relationship.description ?? relationship.meaning,
      "These parts are connected.",
      500,
    ),
  };
}

function normalizeTransformation(value: unknown, index: number) {
  const transformation = asRecord(value);

  return {
    id: readString(transformation.id, "transformation_" + (index + 1), 120),
    transformation_type: readString(
      transformation.transformation_type ??
        transformation.transformationType ??
        transformation.type,
      "show_cause_effect",
      100,
    ),
    entities: asArray(transformation.entities ?? transformation.entity_ids ?? transformation.entityIds)
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 8),
    explanation: readString(
      transformation.explanation ?? transformation.description,
      "A visible change shows the idea.",
      500,
    ),
  };
}

function normalizeAction(value: unknown, index: number) {
  const action = asRecord(value);
  const params: Record<string, unknown> = { ...action };

  delete params.id;
  delete params.type;
  delete params.entity_id;
  delete params.entityId;
  delete params.target_entity_id;
  delete params.targetEntityId;
  delete params.relationship_id;
  delete params.relationshipId;

  return {
    id: readString(action.id, "action_" + (index + 1), 120),
    type: readString(action.type, "show_entity", 80),
    entity_id: optionalString(action.entity_id ?? action.entityId ?? action.target, 120),
    target_entity_id: optionalString(action.target_entity_id ?? action.targetEntityId ?? action.to, 120),
    relationship_id: optionalString(action.relationship_id ?? action.relationshipId, 120),
    params: Object.keys(params).length ? params : null,
  };
}

function normalizeBeat(value: unknown, index: number, fallbackScript: string) {
  const beat = asRecord(value);
  const scriptSegment = readString(
    beat.script_segment ?? beat.scriptSegment ?? beat.text ?? beat.words,
    fallbackScript,
    700,
  );

  return {
    id: readString(beat.id, "beat_" + (index + 1), 120),
    script_segment: scriptSegment,
    title: optionalString(beat.title, 120) ?? scriptSegment.split(/\s+/).slice(0, 5).join(" "),
    duration_ms:
      typeof beat.duration_ms === "number"
        ? Math.min(8000, Math.max(1500, beat.duration_ms))
        : 3800,
    active_entity_ids: asArray(beat.active_entity_ids ?? beat.activeEntityIds)
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 8),
    actions: asArray(beat.actions).map(normalizeAction).slice(0, 8),
    camera: isRecord(beat.camera) ? beat.camera : null,
    text_overlay: isRecord(beat.text_overlay ?? beat.textOverlay)
      ? asRecord(beat.text_overlay ?? beat.textOverlay)
      : { layout: "bottom_caption", emphasis: "medium" },
  };
}

function fallbackBeats(orientationBody: string, entityIds: string[]) {
  const pieces = orientationBody
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  const segments = pieces.length ? pieces : [orientationBody];

  return segments.map((segment, index) => ({
    id: "beat_" + (index + 1),
    script_segment: segment,
    title: segment.split(/\s+/).slice(0, 5).join(" "),
    duration_ms: 3800,
    active_entity_ids: entityIds.slice(0, 3),
    actions: entityIds.slice(0, 3).map((id, actionIndex) => ({
      id: "action_" + (index + 1) + "_" + (actionIndex + 1),
      type: actionIndex === 0 ? "highlight_entity" : "show_entity",
      entity_id: id,
      target_entity_id: null,
      relationship_id: null,
      params: null,
    })),
    camera: null,
    text_overlay: { layout: "bottom_caption", emphasis: "medium" },
  }));
}

export function buildModelDrivenVisualStoryPrompts(input: ModelDrivenVisualStoryRequest) {
  const system = [
    "You create compact visual-story drafts for MyWay.",
    "Return ONLY valid JSON. No markdown. No code fences. No comments.",
    "You are NOT generating the full app response.",
    "The learner-facing orientation paragraph is the source of truth.",
    "Use plain language for bridge_0. Avoid jargon unless the learner used it.",
    "The model drives the scene idea. MyWay will wrap and render it.",
    "Keep the output small: 4-6 entities, 3-5 relationships, 3-5 transformations, 3-4 beats.",
  ].join("\n");

  const user = [
    "Learner message:",
    input.learnerMessage,
    "",
    "Context:",
    jsonShape({
      topic_hint: input.topicLabel,
      bridge_level: input.bridgeLevel,
      jargon_level: input.jargonLevel,
      preferred_style: input.preferredStyle ?? "visual_description",
    }),
    "",
    "Return exactly this JSON shape. Do not add other top-level keys:",
    jsonShape({
      schema_version: "myway_model_visual_story_draft_v1",
      orientation: {
        title: "short title",
        body: "one short plain-language paragraph that gives the learner a picture",
      },
      topic: {
        topic_id: "short_snake_case_id",
        topic_label: "short label",
      },
      diagnosis: {
        label: "representation_gap",
        root_problem: "the missing picture or relationship",
      },
      scene: {
        family: "process_flow",
        entities: [
          {
            id: "entity_id",
            kind: "container",
            display_name: "plain label",
            semantic_role: "input",
            meaning: "short meaning",
            shape: "simple shape",
            color: "color hint",
            visual_cues: ["flowing"],
          },
        ],
        relationships: [
          {
            id: "relationship_id",
            type: "becomes",
            from: "entity_id",
            to: "entity_id",
            explanation: "short explanation",
          },
        ],
        transformations: [
          {
            id: "transformation_id",
            type: "trace_motion",
            entities: ["entity_id"],
            explanation: "short explanation",
          },
        ],
        beats: [
          {
            id: "beat_1",
            script_segment: "short slice of the orientation body",
            active_entity_ids: ["entity_id"],
            actions: [
              {
                type: "show_entity",
                entity_id: "entity_id",
              },
            ],
            text_overlay: "short caption",
          },
        ],
        check_prompt: "one short check question",
        success_markers: ["short marker"],
      },
      answer_key: {
        expected_elements: ["short marker"],
        minimum_elements_for_pass: 1,
      },
      misconception_markers: [
        {
          id: "short_id",
          marker: "short misconception marker",
        },
      ],
      rationale: "one short sentence",
    }),
    "",
    "Hard limits:",
    "- JSON only.",
    "- Keep total output under about 4500 characters.",
    "- Do not output visual_story. Output scene instead.",
    "- MyWay will turn scene into renderer_params.visual_story.",
  ].join("\n");

  return { system, user };
}

function sceneFromRaw(raw: Record<string, unknown>) {
  const visualStory = asRecord(raw.visual_story ?? raw.visualStory);
  const story = asRecord(visualStory.story);
  const semantics = asRecord(story.visual_semantics ?? story.visualSemantics);

  if (isRecord(raw.scene)) return asRecord(raw.scene);

  if (Object.keys(visualStory).length || Object.keys(story).length || Object.keys(semantics).length) {
    return {
      family: story.scene_family ?? story.sceneFamily,
      entities: semantics.key_entities ?? semantics.entities,
      relationships: semantics.key_relationships ?? semantics.relationships,
      transformations: semantics.key_transformations ?? semantics.transformations,
      beats: story.beats,
      check_prompt: asRecord(visualStory.optional_check ?? visualStory.optionalCheck).prompt,
      success_markers: asRecord(visualStory.optional_check ?? visualStory.optionalCheck).success_markers,
    };
  }

  return {};
}

export function normalizeModelDrivenVisualStoryDraft(
  value: unknown,
  input: ModelDrivenVisualStoryRequest,
): ModelDrivenVisualStoryDraft {
  const raw = asRecord(value);
  const orientation = asRecord(raw.orientation);
  const topic = asRecord(raw.topic);
  const diagnosis = asRecord(raw.diagnosis);
  const scene = sceneFromRaw(raw);

  const orientationTitle = readString(
    orientation.title,
    "Visual story",
    180,
  );

  const orientationBody = readString(
    orientation.body,
    input.learnerMessage,
    1200,
  );

  const topicLabel = readString(
    topic.topic_label ?? topic.topicLabel,
    input.topicLabel === "Auto-detect from learner message" ? orientationTitle : input.topicLabel,
    180,
  );

  const topicId = readString(
    topic.topic_id ?? topic.topicId,
    slug(topicLabel),
    120,
  );

  const entities = asArray(scene.entities)
    .map(normalizeEntity)
    .slice(0, 7);

  const safeEntities = entities.length
    ? entities
    : [
        {
          id: "main_idea",
          kind: "custom",
          display_name: "main idea",
          semantic_role: "core_picture",
          meaning: "The main idea the learner is trying to picture.",
          visual_style: { shape: "glowing node", color: "gold", visual_cues: ["glowing"] },
        },
      ];

  const entityIds = safeEntities.map((entity) => entity.id);

  const relationships = asArray(scene.relationships)
    .map(normalizeRelationship)
    .slice(0, 6);

  const transformations = asArray(scene.transformations)
    .map(normalizeTransformation)
    .slice(0, 6);

  const beats = asArray(scene.beats)
    .map((beat, index) => normalizeBeat(beat, index, orientationBody))
    .slice(0, 4);

  const checkPrompt = readString(
    scene.check_prompt ?? scene.checkPrompt,
    "In your own words, what is the main flow in this visual story?",
    300,
  );

  const successMarkers = asArray(scene.success_markers ?? scene.successMarkers)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 5);

  const normalizedVisualStory = {
    schema_version: "myway_visual_story_renderer_v1",
    scene_kind: "visual_story",
    story: {
      orientation_script: orientationBody,
      title: orientationTitle,
      root_problem_focus: readString(
        diagnosis.root_problem,
        "The learner needs a usable picture of the idea.",
        700,
      ),
      target_takeaway: "The idea can be understood as a visible flow or relationship, not just a list of words.",
      scene_family: readString(scene.family ?? scene.scene_family ?? scene.sceneFamily, "model_directed_scene", 120),
      visual_semantics: {
        key_entities: safeEntities,
        key_relationships: relationships,
        key_transformations: transformations,
        supporting_examples: [],
      },
      beats: beats.length ? beats : fallbackBeats(orientationBody, entityIds),
      script_display: {
        show_full_script: true,
        reveal_mode: "beat_synced",
        layout: "bottom_caption",
        max_visible_segments: 1,
        animate_text: true,
      },
    },
    interaction_phase: {
      unlock_after: "animation_complete",
      instructions: "Replay or scrub the story and explain the main flow in your own words.",
      controls: ["pause", "replay", "scrub_story", "zoom"],
    },
    optional_check: {
      prompt: checkPrompt,
      expected_response_type: "text",
      success_markers: successMarkers.length ? successMarkers : ["explains the main visual flow"],
    },
  };

  const markers = asArray(raw.misconception_markers ?? raw.misconceptionMarkers)
    .map((item, index) => {
      const marker = asRecord(item);
      return {
        id: readString(marker.id ?? marker.misconception_id, "misconception_" + (index + 1), 120),
        marker: readString(marker.marker ?? marker.description, "Possible misconception pattern.", 400),
      };
    })
    .slice(0, 4);

  return {
    schema_version: "myway_model_visual_story_draft_v1",
    orientation: {
      title: orientationTitle,
      body: orientationBody,
    },
    topic: {
      topic_id: topicId,
      topic_label: topicLabel,
    },
    diagnosis: {
      label: readString(diagnosis.label ?? diagnosis.diagnosis, "representation_gap", 80),
      root_problem: readString(
        diagnosis.root_problem,
        "The learner needs a usable picture of the idea before details will stick.",
        700,
      ),
    },
    visual_story: normalizedVisualStory,
    answer_key: isRecord(raw.answer_key ?? raw.answerKey)
      ? asRecord(raw.answer_key ?? raw.answerKey)
      : {
          expected_elements: ["explains the main visual flow in plain language"],
          acceptable_paraphrases: true,
          minimum_elements_for_pass: 1,
        },
    misconception_markers: markers.length
      ? markers
      : [
          {
            id: "memorized_without_picture",
            marker: "Learner treats the idea as a list of names instead of a flow or relationship.",
          },
        ],
    rationale: optionalString(raw.rationale, 500) ?? "A visual story is useful because the learner said they cannot picture the idea.",
  };
}

export function buildGenerateOutputFromVisualDraft(
  draft: ModelDrivenVisualStoryDraft,
  input: ModelDrivenVisualStoryRequest,
) {
  const diagnosisLabel = [
    "unknown",
    "no_gap_detected",
    "recall_gap",
    "representation_gap",
    "procedure_gap",
    "discrimination_gap",
    "transfer_gap",
    "metacognitive_gap",
  ].includes(draft.diagnosis.label)
    ? draft.diagnosis.label
    : "representation_gap";

  const probe = {
    schema_version: "engine_renderable_probe_v1",
    probe_type: "video_explanation",
    expected_attempt_type: "text",
    prompt: {
      root_problem_explanation: draft.diagnosis.root_problem,
      reshaping_explanation: draft.orientation.body,
      task: "Watch the visual story, then explain the main flow in your own words.",
      full_prompt: draft.orientation.body,
    },
    presentation_support: ["visual_story"],
    answer_key: draft.answer_key,
    misconception_markers: draft.misconception_markers.map((marker, index) => ({
      misconception_id: marker.id || "misconception_" + (index + 1),
      label: marker.id || "Misconception " + (index + 1),
      marker: marker.marker,
      description: marker.marker,
      confidence: 0.6,
    })),
    renderer_params: {
      visual_story: draft.visual_story,
    },
    delivery_context: {
      probe_intent: "orient_missing_picture",
      root_problem_pattern: "representation_mapping_gap",
      bridge_level: input.bridgeLevel,
      language_policy: { jargon_level: input.jargonLevel },
      model_driven_visual_story: true,
      model_output_schema: "myway_model_visual_story_draft_v1",
      model_returned_scene_not_visual_story: true,
    },
    confidence: 0.76,
    renderer_compatibility: {
      renderer_kind: "video_explanation",
      is_renderable: true,
      blocking_reasons: [],
      warnings: [],
    },
  };

  return {
    schema_version: "myway_openai_full_loop_generate_output_v1",
    message_understanding: {
      confidence: 0.82,
      what_myway_thinks_user_means: "The learner needs a visual mental model before details will make sense.",
      ambiguity: null,
      needs_clarification: false,
      reason: "The learner directly asked for a way to picture the idea.",
    },
    turn_mode: "teach_then_check",
    clarification: null,
    orientation: {
      title: draft.orientation.title,
      body: draft.orientation.body,
      visual_scene: null,
      key_points: [],
      bridge_note: null,
    },
    interest_discovery: {
      should_ask: false,
      question: null,
      inferred_candidates: [],
    },
    topic_decision: {
      action:
        input.topicMode === "continue_active" && input.activeTopicId
          ? "continue_existing_topic"
          : "create_new_topic",
      topic_id:
        input.topicMode === "continue_active" && input.activeTopicId
          ? input.activeTopicId
          : draft.topic.topic_id,
      topic_label: draft.topic.topic_label,
      confidence: 0.88,
      reason: "MyWay used the model's compact topic label and kept topic bookkeeping local.",
    },
    diagnosis: {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: diagnosisLabel,
      diagnosis_confidence: 0.82,
      next_action: "generate_probe_contract",
      next_action_confidence: 0.84,
      suggested_question: null,
      root_problem: draft.diagnosis.root_problem,
      target_topic_label: draft.topic.topic_label,
    },
    probe,
    confusion_judgment: {
      score: 0.68,
      rubric_anchor: "Learner explicitly reports not being able to picture the idea.",
      evidence: input.learnerMessage,
      confidence: 0.74,
    },
    insight_judgment: {
      score: 0.18,
      rubric_anchor: "No attempt evidence yet; this is an orientation turn.",
      evidence: "Generated visual story before checking understanding.",
      confidence: 0.62,
    },
    metric_delta: {
      confusion_delta: 0.04,
      insight_delta: 0.03,
      mastery_delta: 0,
      evidence_count_delta: 1,
      verification_needed: true,
      reason: "The learner needs a visual orientation and then a small explanation check.",
    },
    personalization_delta: null,
    image_prompt: null,
    image_use_case: null,
    rationale: {
      why_this_probe_type: draft.rationale ?? "A visual story fits a learner who says they cannot picture the idea.",
      what_it_measures: "Whether the learner can explain the main visual flow after seeing it.",
      cost_note: "The model only drafts the scene; MyWay wraps and renders it locally.",
    },
  };
}
