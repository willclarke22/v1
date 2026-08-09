
import {
  DIRECTOR_ACTOR_KINDS,
  DIRECTOR_BEHAVIOURS,
  DIRECTOR_CAMERA_ANGLES,
  DIRECTOR_CAMERA_FRAMINGS,
  DIRECTOR_CAMERA_LENSES,
  DIRECTOR_CAMERA_MOVEMENTS,
  DIRECTOR_CAMERA_SHOTS,
  DIRECTOR_CAPTION_SAFE_REGIONS,
  DIRECTOR_CONTINUITY_RULES,
  DIRECTOR_COORDINATE_SPACES,
  DIRECTOR_LIGHTING_INTENTS,
  DIRECTOR_KINEMATIC_CONSTRAINTS,
  DIRECTOR_NARRATIVE_JOBS,
  DIRECTOR_SCREEN_ANCHORS,
  DIRECTOR_BLOCKING_RELATIONS,
  DIRECTOR_EASINGS,
  DIRECTOR_FALLBACK_REPRESENTATIONS,
  DIRECTOR_REPRESENTATION_MODES,
  DIRECTOR_TEXT_KINDS,
  DIRECTOR_TEXT_PLACEMENTS,
  type DirectorActorKind,
  type DirectorBehaviour,
  type DirectorBlockingRelation,
  type DirectorCameraAngle,
  type DirectorCameraFraming,
  type DirectorCameraLens,
  type DirectorCameraMovement,
  type DirectorCameraMovementStep,
  type DirectorCameraShot,
  type DirectorCaptionSafeRegion,
  type DirectorContinuityRule,
  type DirectorCoordinateSpace,
  type DirectorEasing,
  type DirectorEntityIntent,
  type DirectorLightingIntent,
  type DirectorKinematicConstraintKind,
  type DirectorNarrativeJob,
  type DirectorFallbackRepresentation,
  type DirectorMoment,
  type DirectorRelationshipIntent,
  type DirectorScreenAnchor,
  type DirectorShotDirectionV2,
  type DirectorRepresentationMode,
  type DirectorTextKind,
  type DirectorTextPlacement,
  type EducationalSceneDirectorPlanV1,
  type EducationalSceneDirectorValidationIssue,
  type EducationalSceneDirectorValidationReport,
} from "./director-contract";

export type DirectorNormalizationContext = {
  source?: EducationalSceneDirectorPlanV1["source"];
  title?: string;
  scene_thesis?: string;
  learner_takeaway?: string;
  entities?: unknown;
  relationships?: unknown;
  explanation_pieces?: unknown;
  legacy_directed_scene?: unknown;
  legacy_story_beats?: unknown;
  legacy_beats?: unknown;
  style?: unknown;
  default_duration_ms?: number;
};

export type DirectorNormalizationResult = {
  plan: EducationalSceneDirectorPlanV1;
  validation: EducationalSceneDirectorValidationReport;
  warnings: string[];
};

const representationModeSet = new Set<string>(
  DIRECTOR_REPRESENTATION_MODES,
);
const actorKindSet = new Set<string>(
  DIRECTOR_ACTOR_KINDS,
);
const fallbackRepresentationSet = new Set<string>(
  DIRECTOR_FALLBACK_REPRESENTATIONS,
);
const behaviourSet = new Set<string>(
  DIRECTOR_BEHAVIOURS,
);
const cameraShotSet = new Set<string>(
  DIRECTOR_CAMERA_SHOTS,
);
const cameraMovementSet = new Set<string>(
  DIRECTOR_CAMERA_MOVEMENTS,
);
const cameraFramingSet = new Set<string>(
  DIRECTOR_CAMERA_FRAMINGS,
);
const cameraAngleSet = new Set<string>(
  DIRECTOR_CAMERA_ANGLES,
);
const cameraLensSet = new Set<string>(
  DIRECTOR_CAMERA_LENSES,
);
const narrativeJobSet = new Set<string>(
  DIRECTOR_NARRATIVE_JOBS,
);
const screenAnchorSet = new Set<string>(
  DIRECTOR_SCREEN_ANCHORS,
);
const captionSafeRegionSet = new Set<string>(
  DIRECTOR_CAPTION_SAFE_REGIONS,
);
const coordinateSpaceSet = new Set<string>(
  DIRECTOR_COORDINATE_SPACES,
);
const blockingRelationSet = new Set<string>(
  DIRECTOR_BLOCKING_RELATIONS,
);
const lightingIntentSet = new Set<string>(
  DIRECTOR_LIGHTING_INTENTS,
);
const kinematicConstraintSet = new Set<string>(
  DIRECTOR_KINEMATIC_CONSTRAINTS,
);
const continuityRuleSet = new Set<string>(
  DIRECTOR_CONTINUITY_RULES,
);
const textKindSet = new Set<string>(
  DIRECTOR_TEXT_KINDS,
);
const textPlacementSet = new Set<string>(
  DIRECTOR_TEXT_PLACEMENTS,
);
const easingSet = new Set<string>(
  DIRECTOR_EASINGS,
);

function record(
  value: unknown,
): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value.trim()
    : fallback;
}

function cleanId(
  value: unknown,
  fallback: string,
): string {
  const source = text(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);

  return source || fallback;
}

function finite(
  value: unknown,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function bounded(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.max(
    min,
    Math.min(max, finite(value, fallback)),
  );
}

function strings(
  value: unknown,
  max = 24,
): string[] {
  return Array.from(
    new Set(
      list(value)
        .map((item) => text(item))
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  return typeof value === "string" &&
    allowed.has(value)
    ? (value as T)
    : fallback;
}

function shortCue(
  value: unknown,
  fallback: string,
  maxWords = 18,
): string {
  const source = text(value, fallback);
  const words = source.split(/\s+/g);
  return words.length <= maxWords
    ? source
    : `${words.slice(0, maxWords).join(" ")}…`;
}

function preferredRenderKind(
  entity: Record<string, unknown>,
) {
  const visualNeed = record(entity.visual_need);
  return text(
    visualNeed?.preferred_render_kind ??
      entity.preferred_render_kind,
    "any",
  );
}

function actorKindForEntity(
  entity: Record<string, unknown>,
): DirectorActorKind {
  const explicit = text(
    entity.actor_kind,
  );
  if (actorKindSet.has(explicit)) {
    return explicit as DirectorActorKind;
  }

  const renderKind = preferredRenderKind(entity);
  if (renderKind === "registered_asset") {
    return "physical_asset";
  }
  if (renderKind === "path") {
    return "path";
  }
  if (renderKind === "label") {
    return "label";
  }
  if (renderKind === "particle") {
    return "procedural_effect";
  }
  if (
    renderKind === "sphere" ||
    renderKind === "box" ||
    renderKind === "arrow"
  ) {
    return "diagrammatic_actor";
  }
  return "any";
}

function visualNeedText(
  entity: Record<string, unknown>,
) {
  if (typeof entity.visual_need === "string") {
    return text(
      entity.visual_need,
      "A clear visual actor.",
    );
  }

  const visualNeed = record(entity.visual_need);
  return text(
    visualNeed?.description,
    "A clear visual actor.",
  );
}

function semanticTags(
  entity: Record<string, unknown>,
) {
  const visualNeed = record(entity.visual_need);
  return Array.from(
    new Set([
      ...strings(entity.semantic_tags),
      ...strings(visualNeed?.semantic_tags),
    ]),
  ).slice(0, 24);
}

function normalizeEntity(
  value: unknown,
  index: number,
): DirectorEntityIntent | null {
  const item = record(value);
  if (!item) return null;

  const id = cleanId(
    item.id ?? item.instance_id,
    `entity_${index + 1}`,
  );
  const actorKind = actorKindForEntity(item);
  const rawPolicy =
    record(item.asset_policy) ?? {};
  const fallback =
    oneOf<DirectorFallbackRepresentation>(
      rawPolicy.fallback_representation,
      fallbackRepresentationSet,
      actorKind === "physical_asset" ||
        actorKind === "any"
        ? "diagrammatic_proxy"
        : "abstract_proxy",
    );

  return {
    id,
    display_name: text(
      item.display_name ?? item.concept,
      id.replace(/_/g, " "),
    ),
    semantic_role: text(
      item.semantic_role ??
        item.motion_role,
      "an actor in the explanation",
    ),
    visual_need: visualNeedText(item),
    semantic_tags: semanticTags(item),
    actor_kind: actorKind,
    asset_policy: {
      asset_required:
        typeof rawPolicy.asset_required ===
        "boolean"
          ? rawPolicy.asset_required
          : actorKind === "physical_asset",
      can_use_proxy_until_asset_ready:
        rawPolicy.can_use_proxy_until_asset_ready !==
        false,
      fallback_representation: fallback,
      capability_needs: strings(
        rawPolicy.capability_needs,
      ),
      anchor_needs: strings(
        rawPolicy.anchor_needs,
      ),
    },
  };
}

function normalizeRelationship(
  value: unknown,
  index: number,
): DirectorRelationshipIntent | null {
  const item = record(value);
  if (!item) return null;

  const source = cleanId(
    item.source_entity_id ??
      item.source,
    "",
  );
  const targets = strings(
    item.target_entity_ids ??
      (item.target_entity_id
        ? [item.target_entity_id]
        : item.target
          ? [item.target]
          : []),
  ).map((id, targetIndex) =>
    cleanId(
      id,
      `target_${targetIndex + 1}`,
    ),
  );

  if (!source || !targets.length) {
    return null;
  }

  return {
    id: cleanId(
      item.id,
      `relationship_${index + 1}`,
    ),
    source_entity_id: source,
    target_entity_ids: targets,
    relationship_type: text(
      item.relationship_type ??
        item.type,
      "connects_to",
    ),
    explanation: text(
      item.explanation ??
        item.description,
      "These actors are connected in the explanation.",
    ),
  };
}

function canonicalBehaviour(
  value: unknown,
  description: string,
): DirectorBehaviour {
  const explicit = text(value);
  if (behaviourSet.has(explicit)) {
    return explicit as DirectorBehaviour;
  }

  const normalized =
    `${explicit} ${description}`.toLowerCase();

  if (
    normalized.includes("pour")
  ) {
    return "pour";
  }
  if (
    normalized.includes("fill")
  ) {
    return "fill";
  }
  if (
    normalized.includes("drain")
  ) {
    return "drain";
  }
  if (
    normalized.includes("filter")
  ) {
    return "filter";
  }
  if (
    normalized.includes("insert") ||
    normalized.includes("enter")
  ) {
    return "insert_into";
  }
  if (
    normalized.includes("remove") ||
    normalized.includes("leave")
  ) {
    return "remove_from";
  }
  if (
    normalized.includes("rotate") ||
    normalized.includes("spin")
  ) {
    return "rotate";
  }
  if (
    normalized.includes("orbit")
  ) {
    return "orbit";
  }
  if (
    normalized.includes("trace") ||
    normalized.includes("flow")
  ) {
    return "trace";
  }
  if (
    normalized.includes("merge") ||
    normalized.includes("assemble") ||
    normalized.includes("connect")
  ) {
    return "merge";
  }
  if (
    normalized.includes("split") ||
    normalized.includes("break") ||
    normalized.includes("disconnect")
  ) {
    return "split";
  }
  if (
    normalized.includes("fade") ||
    normalized.includes("hide")
  ) {
    return "hide";
  }
  if (
    normalized.includes("glow") ||
    normalized.includes("highlight")
  ) {
    return "highlight";
  }
  if (
    normalized.includes("pulse") ||
    normalized.includes("pop")
  ) {
    return "pulse";
  }
  if (
    normalized.includes("move") ||
    normalized.includes("slide") ||
    normalized.includes("follow")
  ) {
    return "move_to";
  }
  if (
    normalized.includes("transform") ||
    normalized.includes("become") ||
    normalized.includes("change")
  ) {
    return "transform";
  }
  if (
    normalized.includes("show") ||
    normalized.includes("reveal")
  ) {
    return "show";
  }

  return "custom_semantic";
}

function normalizeEvent(
  value: unknown,
  index: number,
  momentDurationMs: number,
): {
  event: DirectorMoment["events"][number] | null;
  referenced_entity_ids: string[];
} {
  const item = record(value);
  if (!item) {
    return {
      event: null,
      referenced_entity_ids: [],
    };
  }

  const description = text(
    item.description ??
      item.narration,
    "Show the requested visual change.",
  );
  const actorId = cleanId(
    item.actor_entity_id ??
      item.entity_id ??
      item.target_entity_id,
    "",
  );
  const targetId = cleanId(
    item.target_entity_id ??
      item.to,
    "",
  );
  const supportingIds = strings(
    item.supporting_entity_ids ??
      item.entity_ids,
  ).map((id, itemIndex) =>
    cleanId(
      id,
      `support_${itemIndex + 1}`,
    ),
  );

  if (!actorId) {
    return {
      event: null,
      referenced_entity_ids: [
        ...supportingIds,
        ...(targetId ? [targetId] : []),
      ],
    };
  }

  const behaviour = canonicalBehaviour(
    item.behaviour ?? item.type,
    description,
  );
  const startMs = bounded(
    item.start_ms,
    0,
    0,
    momentDurationMs,
  );
  const durationMs = bounded(
    item.duration_ms,
    Math.max(
      450,
      momentDurationMs - startMs,
    ),
    100,
    Math.max(100, momentDurationMs),
  );

  return {
    event: {
      id: cleanId(
        item.id,
        `event_${index + 1}`,
      ),
      behaviour,
      actor_entity_id: actorId,
      target_entity_id:
        targetId || null,
      supporting_entity_ids:
        supportingIds,
      start_ms: startMs,
      duration_ms: Math.min(
        durationMs,
        Math.max(
          100,
          momentDurationMs - startMs,
        ),
      ),
      easing: oneOf<DirectorEasing>(
        item.easing,
        easingSet,
        "ease_in_out",
      ),
      path_hint:
        text(item.path_hint ?? item.from)
          ? text(
              item.path_hint ??
                item.from,
            )
          : null,
      description,
      parameters:
        record(item.parameters ??
          item.params) ?? {},
      fallback_behaviour:
        behaviour === "custom_semantic"
          ? "highlight"
          : null,
    },
    referenced_entity_ids: [
      actorId,
      ...supportingIds,
      ...(targetId ? [targetId] : []),
    ],
  };
}

function normalizeTextCue(
  value: unknown,
  index: number,
  momentDurationMs: number,
  fallbackText: string,
): DirectorMoment["text_cues"][number] | null {
  const item = record(value);
  const cueText = shortCue(
    item?.text ?? value,
    fallbackText,
  );
  if (!cueText) return null;

  const startMs = bounded(
    item?.start_ms,
    200,
    0,
    momentDurationMs,
  );
  const endMs = bounded(
    item?.end_ms,
    Math.max(
      startMs + 800,
      momentDurationMs - 250,
    ),
    startMs + 100,
    momentDurationMs,
  );
  const anchorId = cleanId(
    item?.anchor_entity_id,
    "",
  );

  return {
    id: cleanId(
      item?.id,
      `text_${index + 1}`,
    ),
    kind: oneOf<DirectorTextKind>(
      item?.kind,
      textKindSet,
      anchorId
        ? "object_anchor"
        : "screen_caption",
    ),
    text: cueText,
    anchor_entity_id:
      anchorId || null,
    placement: oneOf<DirectorTextPlacement>(
      item?.placement,
      textPlacementSet,
      anchorId ? "above" : "bottom",
    ),
    start_ms: startMs,
    end_ms: endMs,
    emphasis_words: strings(
      item?.emphasis_words,
      8,
    ),
    entrance:
      item?.entrance === "pop" ||
      item?.entrance === "type_on" ||
      item?.entrance === "none"
        ? item.entrance
        : item?.entrance === "fade"
          ? "fade"
          : "fade_up",
    exit:
      item?.exit === "hold" ||
      item?.exit === "none"
        ? item.exit
        : "fade",
  };
}

function explanationPieceTextById(
  value: unknown,
) {
  const result = new Map<string, string>();
  list(value).forEach((entry, index) => {
    const item = record(entry);
    if (!item) return;
    result.set(
      cleanId(
        item.id,
        `piece_${index + 1}`,
      ),
      text(item.text),
    );
  });
  return result;
}

function normalizeCamera(
  value: unknown,
  activeIds: string[],
  keptIds: string[],
) {
  const item = record(value) ?? {};
  const rawShot = text(
    item.shot_type ??
      item.preset,
  );
  const shotType: DirectorCameraShot =
    rawShot === "close"
      ? "close_up"
      : rawShot === "top"
        ? "top_down"
        : oneOf<DirectorCameraShot>(
            rawShot,
            cameraShotSet,
            activeIds.length <= 1
              ? "close_up"
              : "medium",
          );

  const rawMovement = text(
    item.movement,
  );
  const movement: DirectorCameraMovement =
    rawMovement.includes("push")
      ? "push_in"
      : rawMovement.includes("pull")
        ? "pull_back"
        : rawMovement.includes("follow")
          ? "follow"
          : rawMovement.includes("orbit")
            ? "orbit"
            : oneOf<DirectorCameraMovement>(
                rawMovement,
                cameraMovementSet,
                "semantic",
              );

  const focusIds = strings(
    item.focus_entity_ids,
  ).map((id, index) =>
    cleanId(id, `focus_${index + 1}`),
  );

  return {
    shot_type: shotType,
    movement,
    focus_entity_ids:
      focusIds.length
        ? focusIds
        : activeIds.slice(0, 3),
    framing_intent: text(
      item.framing_intent ??
        item.description,
      "Keep the active causal relationship readable and avoid hiding the result.",
    ),
    keep_visible_entity_ids:
      strings(
        item.keep_visible_entity_ids,
      ).length
        ? strings(
            item.keep_visible_entity_ids,
          ).map((id, index) =>
            cleanId(
              id,
              `kept_${index + 1}`,
            ),
          )
        : keptIds.slice(0, 12),
  };
}


function legacyFramingFromShot(
  shot: DirectorCameraShot,
): DirectorCameraFraming {
  if (shot === "wide") return "wide";
  if (shot === "close_up") return "close";
  if (shot === "macro") return "macro";
  if (shot === "cutaway") return "cutaway";
  return "medium";
}

function legacyAngleFromShot(
  shot: DirectorCameraShot,
): DirectorCameraAngle {
  if (shot === "top_down") return "top_down";
  if (shot === "isometric") return "isometric";
  if (shot === "side_profile") return "side_profile";
  return "three_quarter_front";
}

function legacyMovementToStep(
  movement: DirectorCameraMovement,
): DirectorCameraMovementStep {
  return {
    movement,
    start_progress: 0,
    end_progress: 1,
    strength: movement === "static" ? 0 : 0.55,
    easing: "ease_in_out",
    coordinate_space: "target_relative",
    target_entity_id: null,
    parameters: {},
  };
}

function normalizeMovementStep(
  value: unknown,
  fallbackMovement: DirectorCameraMovement,
): DirectorCameraMovementStep {
  const item = record(value) ?? {};
  const rawMovement = text(item.movement ?? item.capability, fallbackMovement);
  const movement = oneOf<DirectorCameraMovement>(
    rawMovement === "pull_out" ? "pull_back" : rawMovement === "truck_right" ? "truck" : rawMovement,
    cameraMovementSet,
    fallbackMovement,
  );
  const start = bounded(item.start_progress, 0, 0, 0.99);
  const end = bounded(item.end_progress, 1, Math.min(1, start + 0.01), 1);
  return {
    movement,
    start_progress: start,
    end_progress: end,
    strength: bounded(item.strength, movement === "static" ? 0 : 0.55, 0, 1.5),
    easing: oneOf<DirectorEasing>(item.easing, easingSet, "ease_in_out"),
    coordinate_space: oneOf<DirectorCoordinateSpace>(
      item.coordinate_space,
      coordinateSpaceSet,
      "target_relative",
    ),
    target_entity_id: text(item.target_entity_id) ? cleanId(item.target_entity_id, "") : null,
    parameters: record(item.parameters) ?? {},
  };
}

function normalizeShotDirectionV2(
  value: unknown,
  legacyCamera: ReturnType<typeof normalizeCamera>,
  activeIds: string[],
  keptIds: string[],
  directorIntent: string,
  successObservation: string | null,
): DirectorShotDirectionV2 {
  const item = record(value) ?? {};
  const composition = record(item.composition) ?? {};
  const lens = record(item.lens) ?? {};
  const camera = record(item.camera) ?? {};
  const lighting = record(item.lighting) ?? {};
  const continuity = record(item.continuity) ?? {};

  const rawSteps = list(camera.movement_steps ?? item.movement_steps);
  const movementSteps = rawSteps.length
    ? rawSteps.slice(0, 4).map((step) =>
        normalizeMovementStep(step, legacyCamera.movement),
      )
    : [legacyMovementToStep(legacyCamera.movement)];

  const focusIds = strings(camera.focus_entity_ids ?? legacyCamera.focus_entity_ids)
    .map((id, index) => cleanId(id, `focus_${index + 1}`));
  const keepVisible = strings(
    composition.keep_visible_entity_ids ??
      legacyCamera.keep_visible_entity_ids ??
      keptIds,
  ).map((id, index) => cleanId(id, `kept_${index + 1}`));

  const rawNarrative = text(item.narrative_job);
  const narrativeJob = oneOf<DirectorNarrativeJob>(
    rawNarrative,
    narrativeJobSet,
    "orient",
  );

  const framing = oneOf<DirectorCameraFraming>(
    composition.framing,
    cameraFramingSet,
    legacyFramingFromShot(legacyCamera.shot_type),
  );
  const angle = oneOf<DirectorCameraAngle>(
    composition.angle,
    cameraAngleSet,
    legacyAngleFromShot(legacyCamera.shot_type),
  );
  const screenAnchor = oneOf<DirectorScreenAnchor>(
    composition.screen_anchor,
    screenAnchorSet,
    "center",
  );
  const captionSafeRegion = oneOf<DirectorCaptionSafeRegion>(
    composition.caption_safe_region,
    captionSafeRegionSet,
    "auto",
  );
  const lensPreset = oneOf<DirectorCameraLens>(
    lens.preset,
    cameraLensSet,
    framing === "extreme_wide" ? "wide" : framing === "macro" ? "macro" : "normal",
  );
  const lightingIntents = strings(lighting.intents, 5)
    .map((entry) => oneOf<DirectorLightingIntent>(entry, lightingIntentSet, "neutral_studio"));
  const continuityRules = strings(continuity.rules, 8)
    .map((entry) => oneOf<DirectorContinuityRule>(entry, continuityRuleSet, "keep_visible"));

  const blocking = list(item.blocking)
    .slice(0, 12)
    .map((entry) => {
      const cue = record(entry) ?? {};
      return {
        relation: oneOf<DirectorBlockingRelation>(
          cue.relation,
          blockingRelationSet,
          "beside",
        ),
        actor_entity_id: cleanId(
          cue.actor_entity_id,
          activeIds[0] ?? focusIds[0] ?? "main_actor",
        ),
        target_entity_id: text(cue.target_entity_id)
          ? cleanId(cue.target_entity_id, "")
          : null,
        screen_region: text(cue.screen_region)
          ? oneOf<DirectorScreenAnchor>(cue.screen_region, screenAnchorSet, "center")
          : null,
        preserve_clearance: cue.preserve_clearance !== false,
        parameters: record(cue.parameters) ?? {},
      };
    });

  const constraints = list(item.constraints)
    .slice(0, 12)
    .map((entry) => {
      const cue = record(entry) ?? {};
      return {
        kind: oneOf<DirectorKinematicConstraintKind>(
          cue.kind,
          kinematicConstraintSet,
          "axis_lock",
        ),
        actor_entity_id: cleanId(
          cue.actor_entity_id,
          activeIds[0] ?? focusIds[0] ?? "main_actor",
        ),
        target_entity_id: text(cue.target_entity_id)
          ? cleanId(cue.target_entity_id, "")
          : null,
        secondary_target_entity_id: text(cue.secondary_target_entity_id)
          ? cleanId(cue.secondary_target_entity_id, "")
          : null,
        axis: (
          cue.axis === "x" || cue.axis === "y" || cue.axis === "z"
            ? cue.axis
            : "auto"
        ) as "x" | "y" | "z" | "auto",
        distance_m:
          cue.distance_m === null || typeof cue.distance_m === "undefined"
            ? null
            : bounded(cue.distance_m, 1, 0, 100),
        parameters: record(cue.parameters) ?? {},
      };
    });

  const fovDefault = lensPreset === "ultra_wide"
    ? 72
    : lensPreset === "wide"
      ? 58
      : lensPreset === "portrait"
        ? 34
        : lensPreset === "telephoto"
          ? 24
          : lensPreset === "macro"
            ? 28
            : 44;
  const focalDefault = lensPreset === "ultra_wide"
    ? 18
    : lensPreset === "wide"
      ? 28
      : lensPreset === "portrait"
        ? 85
        : lensPreset === "telephoto"
          ? 135
          : lensPreset === "macro"
            ? 100
            : 50;

  return {
    narrative_job: narrativeJob,
    visual_claim: text(item.visual_claim, directorIntent),
    composition: {
      framing,
      angle,
      screen_anchor: screenAnchor,
      keep_visible_entity_ids: keepVisible,
      foreground_entity_ids: strings(composition.foreground_entity_ids).map((id, index) => cleanId(id, `foreground_${index + 1}`)),
      background_entity_ids: strings(composition.background_entity_ids).map((id, index) => cleanId(id, `background_${index + 1}`)),
      preserve_relationship_entity_ids: strings(composition.preserve_relationship_entity_ids).map((id, index) => cleanId(id, `relationship_${index + 1}`)),
      preserve_relative_scale: composition.preserve_relative_scale === true,
      caption_safe_region: captionSafeRegion,
      negative_space_side:
        composition.negative_space_side === "left" || composition.negative_space_side === "right"
          ? composition.negative_space_side
          : "none",
    },
    lens: {
      preset: lensPreset,
      focal_length_mm: bounded(lens.focal_length_mm, focalDefault, 8, 300),
      field_of_view_degrees: bounded(lens.field_of_view_degrees, fovDefault, 10, 100),
      depth_of_field:
        lens.depth_of_field === "shallow" || lens.depth_of_field === "moderate"
          ? lens.depth_of_field
          : "deep",
      aperture_f: bounded(lens.aperture_f, lens.depth_of_field === "shallow" ? 2.8 : 5.6, 1, 22),
      focus_entity_id: text(lens.focus_entity_id)
        ? cleanId(lens.focus_entity_id, "")
        : focusIds[0] ?? null,
    },
    camera: {
      focus_entity_ids: focusIds.length ? focusIds : activeIds.slice(0, 3),
      movement_steps: movementSteps,
      start_intent: text(camera.start_intent, legacyCamera.framing_intent),
      end_intent: text(camera.end_intent, "End with the teaching relationship readable and settled."),
      movement_reason: text(camera.movement_reason, legacyCamera.framing_intent),
    },
    blocking,
    constraints,
    lighting: {
      intents: lightingIntents.length ? lightingIntents : ["neutral_studio"],
      motivated_source_entity_id: text(lighting.motivated_source_entity_id)
        ? cleanId(lighting.motivated_source_entity_id, "")
        : null,
      emphasized_entity_ids: strings(lighting.emphasized_entity_ids).map((id, index) => cleanId(id, `emphasis_${index + 1}`)),
      preserve_shadow_entity_ids: strings(lighting.preserve_shadow_entity_ids).map((id, index) => cleanId(id, `shadow_${index + 1}`)),
    },
    continuity: {
      rules: continuityRules.length ? continuityRules : ["keep_visible", "avoid_occlusion"],
      maximum_occlusion_ratio: bounded(continuity.maximum_occlusion_ratio, 0.2, 0, 1),
      maintain_axis_entity_ids: strings(continuity.maintain_axis_entity_ids).map((id, index) => cleanId(id, `axis_${index + 1}`)),
    },
    reveal_at:
      item.reveal_at === null || typeof item.reveal_at === "undefined"
        ? null
        : bounded(item.reveal_at, 0.55, 0, 1),
    hold_after_ms: bounded(item.hold_after_ms, 700, 0, 5000),
    success_observation: text(item.success_observation, successObservation ?? "") || null,
  };
}

function referencedIdsFromShot(shot: DirectorShotDirectionV2): string[] {
  return Array.from(
    new Set([
      ...shot.composition.keep_visible_entity_ids,
      ...shot.composition.foreground_entity_ids,
      ...shot.composition.background_entity_ids,
      ...shot.camera.focus_entity_ids,
      ...(shot.lens.focus_entity_id ? [shot.lens.focus_entity_id] : []),
      ...(shot.lighting.motivated_source_entity_id ? [shot.lighting.motivated_source_entity_id] : []),
      ...shot.lighting.emphasized_entity_ids,
      ...shot.lighting.preserve_shadow_entity_ids,
      ...shot.blocking.flatMap((cue) => [cue.actor_entity_id, cue.target_entity_id].filter((id): id is string => Boolean(id))),
      ...shot.constraints.flatMap((cue) => [cue.actor_entity_id, cue.target_entity_id, cue.secondary_target_entity_id].filter((id): id is string => Boolean(id))),
      ...shot.camera.movement_steps.map((step) => step.target_entity_id).filter((id): id is string => Boolean(id)),
    ].filter((id): id is string => Boolean(id))),
  );
}

function sourceMoments(
  rawPlan: Record<string, unknown>,
  context: DirectorNormalizationContext,
) {
  const candidates = [
    rawPlan.moments,
    rawPlan.scene_moments,
    context.legacy_story_beats,
    context.legacy_beats,
  ];

  for (const candidate of candidates) {
    const items = list(candidate);
    if (items.length) return items;
  }

  return list(context.explanation_pieces).map(
    (piece, index) => {
      const item = record(piece) ?? {};
      return {
        id: `moment_${index + 1}`,
        title: text(
          item.text,
          `Moment ${index + 1}`,
        ),
        source_explanation_piece_ids: [
          cleanId(
            item.id,
            `piece_${index + 1}`,
          ),
        ],
        director_intent: text(
          item.text,
          "Make the next part necessary and visible.",
        ),
        visual_events: [],
      };
    },
  );
}

function normalizeMoment(
  value: unknown,
  index: number,
  pieceText: Map<string, string>,
  defaultDurationMs: number,
): {
  moment: DirectorMoment | null;
  referenced_entity_ids: string[];
} {
  const item = record(value);
  if (!item) {
    return {
      moment: null,
      referenced_entity_ids: [],
    };
  }

  const durationMs = bounded(
    item.duration_ms,
    defaultDurationMs,
    900,
    30000,
  );
  const sourcePieceIds = strings(
    item.source_explanation_piece_ids ??
      item.source_orientation_segment_ids,
  ).map((id, itemIndex) =>
    cleanId(
      id,
      `piece_${itemIndex + 1}`,
    ),
  );
  const sourceText = sourcePieceIds
    .map((id) => pieceText.get(id))
    .filter(Boolean)
    .join(" ");
  const directorIntent = text(
    item.director_intent ??
      item.learning_job ??
      item.title,
    sourceText ||
      "Make one important relationship visually obvious.",
  );

  const introducedIds = strings(
    item.introduces_entity_ids ??
      item.reveal,
  ).map((id, itemIndex) =>
    cleanId(
      id,
      `introduced_${itemIndex + 1}`,
    ),
  );
  const keptIds = strings(
    item.keeps_visible_entity_ids,
  ).map((id, itemIndex) =>
    cleanId(
      id,
      `kept_${itemIndex + 1}`,
    ),
  );
  const explicitActiveIds = strings(
    item.active_entity_ids ??
      item.emphasize,
  ).map((id, itemIndex) =>
    cleanId(
      id,
      `active_${itemIndex + 1}`,
    ),
  );

  const rawEvents =
    list(item.events).length
      ? list(item.events)
      : list(item.visual_events).length
        ? list(item.visual_events)
        : list(item.actions);
  const normalizedEvents =
    rawEvents.map((event, eventIndex) =>
      normalizeEvent(
        event,
        eventIndex,
        durationMs,
      ),
    );
  const events = normalizedEvents
    .map((entry) => entry.event)
    .filter(
      (
        event,
      ): event is DirectorMoment["events"][number] =>
        Boolean(event),
    );
  const eventEntityIds =
    normalizedEvents.flatMap(
      (entry) =>
        entry.referenced_entity_ids,
    );
  const activeIds = Array.from(
    new Set([
      ...explicitActiveIds,
      ...eventEntityIds,
      ...introducedIds,
    ]),
  ).filter(Boolean);

  const camera = normalizeCamera(
    item.camera,
    activeIds,
    keptIds,
  );
  const successObservation =
    text(item.success_observation)
      ? text(item.success_observation)
      : null;
  const shot = normalizeShotDirectionV2(
    item.shot ?? item.shot_v2,
    camera,
    activeIds,
    keptIds,
    directorIntent,
    successObservation,
  );
  const rawTextCues = list(
    item.text_cues,
  );
  const spokenCaption =
    record(item.spoken_caption);
  const fallbackCue = shortCue(
    spokenCaption?.text ??
      sourceText ??
      directorIntent,
    directorIntent,
  );
  const textCues = (
    rawTextCues.length
      ? rawTextCues
      : fallbackCue
        ? [
            {
              text: fallbackCue,
              anchor_entity_id:
                camera.focus_entity_ids[0] ??
                activeIds[0] ??
                null,
            },
          ]
        : []
  )
    .map((cue, cueIndex) =>
      normalizeTextCue(
        cue,
        cueIndex,
        durationMs,
        fallbackCue,
      ),
    )
    .filter(
      (
        cue,
      ): cue is DirectorMoment["text_cues"][number] =>
        Boolean(cue),
    );

  return {
    moment: {
      id: cleanId(
        item.id,
        `moment_${index + 1}`,
      ),
      title: text(
        item.title,
        `Moment ${index + 1}`,
      ),
      learning_job: text(
        item.learning_job,
        directorIntent,
      ),
      director_intent:
        directorIntent,
      source_explanation_piece_ids:
        sourcePieceIds,
      duration_ms: durationMs,
      introduces_entity_ids:
        introducedIds,
      keeps_visible_entity_ids:
        keptIds,
      active_entity_ids:
        activeIds,
      camera,
      shot,
      events,
      text_cues: textCues,
      success_observation: successObservation,
    },
    referenced_entity_ids: Array.from(
      new Set([
        ...introducedIds,
        ...keptIds,
        ...activeIds,
        ...camera.focus_entity_ids,
        ...camera.keep_visible_entity_ids,
        ...referencedIdsFromShot(shot),
        ...textCues
          .map(
            (cue) =>
              cue.anchor_entity_id,
          )
          .filter(
            (
              id,
            ): id is string =>
              Boolean(id),
          ),
      ]),
    ),
  };
}

function placeholderEntity(
  id: string,
): DirectorEntityIntent {
  return {
    id,
    display_name:
      id.replace(/_/g, " "),
    semantic_role:
      "an actor referenced by the scene direction",
    visual_need:
      "A clear placeholder actor that preserves the intended motion and can be replaced by a resolved asset later.",
    semantic_tags: [
      "late_binding",
      "director_reference",
    ],
    actor_kind: "any",
    asset_policy: {
      asset_required: false,
      can_use_proxy_until_asset_ready:
        true,
      fallback_representation:
        "diagrammatic_proxy",
      capability_needs: [],
      anchor_needs: [],
    },
  };
}

function inferRepresentationMode(
  rawPlan: Record<string, unknown>,
  entities: DirectorEntityIntent[],
): DirectorRepresentationMode {
  const strategy =
    record(rawPlan.representation_strategy) ??
    {};
  const explicit = text(
    strategy.primary_mode,
  );
  if (representationModeSet.has(explicit)) {
    return explicit as DirectorRepresentationMode;
  }

  const hasPhysical = entities.some(
    (entity) =>
      entity.actor_kind ===
      "physical_asset",
  );
  const hasDiagram = entities.some(
    (entity) =>
      entity.actor_kind ===
        "diagrammatic_actor" ||
      entity.actor_kind === "path" ||
      entity.actor_kind ===
        "procedural_effect",
  );

  if (hasPhysical && hasDiagram) {
    return "mixed_representation";
  }
  if (hasPhysical) {
    return "mechanistic_3d";
  }
  return "animated_diagram";
}

function normalizeSource(
  value: unknown,
  fallback:
    EducationalSceneDirectorPlanV1["source"],
) {
  return value === "visual_experience" ||
    value === "primitive_builder" ||
    value === "scaffold" ||
    value === "compatibility_adapter"
    ? value
    : fallback;
}

export function normalizeEducationalSceneDirectorPlan(
  raw: unknown,
  context: DirectorNormalizationContext = {},
): DirectorNormalizationResult {
  const warnings: string[] = [];
  const root = record(raw) ?? {};
  const rawPlan =
    record(root.director_plan) ??
    record(root.educational_director) ??
    root;
  const legacyDirectedScene =
    record(context.legacy_directed_scene) ??
    {};
  const style =
    record(rawPlan.style) ??
    record(context.style) ??
    {};

  const rawEntities =
    list(rawPlan.entities).length
      ? list(rawPlan.entities)
      : list(context.entities);
  const entities = rawEntities
    .map(normalizeEntity)
    .filter(
      (
        entity,
      ): entity is DirectorEntityIntent =>
        Boolean(entity),
    );
  const rawRelationships =
    list(rawPlan.relationships).length
      ? list(rawPlan.relationships)
      : list(context.relationships);
  const relationships =
    rawRelationships
      .map(normalizeRelationship)
      .filter(
        (
          relationship,
        ): relationship is DirectorRelationshipIntent =>
          Boolean(relationship),
      );
  const pieceText =
    explanationPieceTextById(
      context.explanation_pieces,
    );
  const normalizedMoments =
    sourceMoments(
      rawPlan,
      context,
    ).map((moment, index) =>
      normalizeMoment(
        moment,
        index,
        pieceText,
        bounded(
          context.default_duration_ms,
          4200,
          900,
          30000,
        ),
      ),
    );
  const moments = normalizedMoments
    .map((entry) => entry.moment)
    .filter(
      (
        moment,
      ): moment is DirectorMoment =>
        Boolean(moment),
    );
  const referencedIds = new Set(
    normalizedMoments.flatMap(
      (entry) =>
        entry.referenced_entity_ids,
    ),
  );
  const entityIds = new Set(
    entities.map(
      (entity) => entity.id,
    ),
  );

  for (const id of referencedIds) {
    if (!id || entityIds.has(id)) {
      continue;
    }
    entities.push(
      placeholderEntity(id),
    );
    entityIds.add(id);
    warnings.push(
      `Director reference ${id} did not have an entity definition; a late-binding placeholder entity was added.`,
    );
  }

  if (!entities.length) {
    entities.push(
      placeholderEntity(
        "main_actor",
      ),
    );
    warnings.push(
      "The director plan had no entities; a main_actor placeholder was added so direction survives missing asset definitions.",
    );
  }

  if (!moments.length) {
    moments.push({
      id: "moment_1",
      title: "Establish the mental model",
      learning_job:
        "Show the basic system need and the actor that responds to it.",
      director_intent:
        "Give the learner one clear visual relationship before adding complexity.",
      source_explanation_piece_ids: [],
      duration_ms: 4200,
      introduces_entity_ids: [
        entities[0].id,
      ],
      keeps_visible_entity_ids: [],
      active_entity_ids: [
        entities[0].id,
      ],
      camera: {
        shot_type: "medium",
        movement: "push_in",
        focus_entity_ids: [
          entities[0].id,
        ],
        framing_intent:
          "Keep the first actor centered and leave room for later actors.",
        keep_visible_entity_ids: [],
      },
      shot: normalizeShotDirectionV2(
        null,
        {
          shot_type: "medium",
          movement: "push_in",
          focus_entity_ids: [entities[0].id],
          framing_intent: "Keep the first actor centered and leave room for later actors.",
          keep_visible_entity_ids: [],
        },
        [entities[0].id],
        [],
        "Give the learner one clear visual relationship before adding complexity.",
        "The first actor and its role are visually clear.",
      ),
      events: [
        {
          id: "event_1",
          behaviour: "show",
          actor_entity_id:
            entities[0].id,
          target_entity_id: null,
          supporting_entity_ids: [],
          start_ms: 0,
          duration_ms: 1500,
          easing: "ease_out",
          path_hint: null,
          description:
            "Reveal the first actor clearly.",
          parameters: {},
          fallback_behaviour: null,
        },
      ],
      text_cues: [
        {
          id: "text_1",
          kind: "object_anchor",
          text: shortCue(
            context.scene_thesis,
            "Start with what the system needs.",
          ),
          anchor_entity_id:
            entities[0].id,
          placement: "above",
          start_ms: 250,
          end_ms: 3600,
          emphasis_words: [],
          entrance: "fade_up",
          exit: "fade",
        },
      ],
      success_observation:
        "The learner can identify the first actor and its job.",
    });
    warnings.push(
      "The director plan had no moments; a minimal first-principles moment was generated.",
    );
  }

  const strategy =
    record(rawPlan.representation_strategy) ??
    {};
  const directedCinematography =
    record(
      legacyDirectedScene.cinematography,
    ) ?? {};
  const primaryMode =
    inferRepresentationMode(
      rawPlan,
      entities,
    );
  const secondaryModes = strings(
    strategy.secondary_modes,
  )
    .filter(
      (mode) =>
        representationModeSet.has(mode),
    )
    .map(
      (mode) =>
        mode as DirectorRepresentationMode,
    )
    .filter(
      (mode) =>
        mode !== primaryMode,
    );

  const plan: EducationalSceneDirectorPlanV1 = {
    schema_version:
      "myway_educational_scene_director_v1",
    capability_language_version: "v2",
    source: normalizeSource(
      rawPlan.source,
      context.source ??
        "compatibility_adapter",
    ),
    title: text(
      rawPlan.title,
      context.title ??
        "Directed educational scene",
    ),
    scene_thesis: text(
      rawPlan.scene_thesis ??
        legacyDirectedScene.scene_concept,
      context.scene_thesis ??
        "Build a clear causal mental model.",
    ),
    learner_takeaway: text(
      rawPlan.learner_takeaway,
      context.learner_takeaway ??
        "The learner can connect the parts into one useful mental model.",
    ),
    representation_strategy: {
      primary_mode: primaryMode,
      secondary_modes:
        secondaryModes,
      reason: text(
        strategy.reason,
        "Choose the representation that makes the hidden relationship visible rather than forcing literal 3D.",
      ),
      fidelity_priority:
        strategy.fidelity_priority ===
          "spatial_clarity" ||
        strategy.fidelity_priority ===
          "comparison_clarity" ||
        strategy.fidelity_priority ===
          "literal_fidelity"
          ? strategy.fidelity_priority
          : "causal_clarity",
    },
    style: {
      look: text(
        style.look,
        "clean_stylized",
      ),
      mood: text(
        style.mood ??
          legacyDirectedScene.emotional_tone,
        "clear and calm",
      ),
      continuity: text(
        style.continuity,
        "Keep previously introduced actors visible when they help preserve the causal chain.",
      ),
      attention_policy: text(
        style.attention_policy ??
          directedCinematography.focus_strategy,
        "One visual job per moment; emphasize the active relationship and dim distractions.",
      ),
    },
    entities,
    relationships,
    moments,
    global_text_policy: {
      max_words_per_cue: bounded(
        record(
          rawPlan.global_text_policy,
        )?.max_words_per_cue,
        18,
        4,
        40,
      ),
      max_lines: bounded(
        record(
          rawPlan.global_text_policy,
        )?.max_lines,
        2,
        1,
        4,
      ),
      avoid_covering_core_motion:
        record(
          rawPlan.global_text_policy,
        )
          ?.avoid_covering_core_motion !==
        false,
      prefer_object_anchored_text:
        record(
          rawPlan.global_text_policy,
        )
          ?.prefer_object_anchored_text !==
        false,
    },
    execution_policy: {
      direction_survives_missing_assets:
        true,
      preserve_entity_ids_for_late_binding:
        true,
      asset_resolution_owner:
        "myway",
      renderer_compiles_behaviours:
        true,
      allow_abstract_proxy_until_asset_ready:
        record(
          rawPlan.execution_policy,
        )
          ?.allow_abstract_proxy_until_asset_ready !==
        false,
    },
  };

  const validation =
    validateEducationalSceneDirectorPlan(
      plan,
    );

  return {
    plan,
    validation,
    warnings: [
      ...warnings,
      ...validation.issues
        .filter(
          (issue) =>
            issue.severity ===
            "warning",
        )
        .map(
          (issue) =>
            `${issue.path}: ${issue.message}`,
        ),
    ],
  };
}

export function validateEducationalSceneDirectorPlan(
  plan: EducationalSceneDirectorPlanV1,
): EducationalSceneDirectorValidationReport {
  const issues:
    EducationalSceneDirectorValidationIssue[] =
    [];
  const entityIds = new Set(
    plan.entities.map(
      (entity) => entity.id,
    ),
  );
  const coveredIds = new Set<string>();
  let eventCount = 0;
  let textCueCount = 0;
  let unresolvedReferenceCount = 0;

  if (!plan.scene_thesis.trim()) {
    issues.push({
      severity: "error",
      code: "missing_scene_thesis",
      path: "scene_thesis",
      message:
        "A director plan needs one clear scene thesis.",
    });
  }

  if (!plan.entities.length) {
    issues.push({
      severity: "error",
      code: "missing_entities",
      path: "entities",
      message:
        "At least one visual actor is required.",
    });
  }

  if (!plan.moments.length) {
    issues.push({
      severity: "error",
      code: "missing_moments",
      path: "moments",
      message:
        "At least one directed moment is required.",
    });
  }

  const seenMomentIds =
    new Set<string>();
  plan.moments.forEach(
    (moment, momentIndex) => {
      const momentPath =
        `moments[${momentIndex}]`;
      if (
        seenMomentIds.has(moment.id)
      ) {
        issues.push({
          severity: "error",
          code: "duplicate_moment_id",
          path: `${momentPath}.id`,
          message:
            `Duplicate moment id ${moment.id}.`,
        });
      }
      seenMomentIds.add(moment.id);

      if (
        !moment.director_intent.trim()
      ) {
        issues.push({
          severity: "error",
          code: "missing_director_intent",
          path:
            `${momentPath}.director_intent`,
          message:
            "Every moment needs a precise learner-attention goal.",
        });
      }

      const references = [
        ...moment.introduces_entity_ids,
        ...moment.keeps_visible_entity_ids,
        ...moment.active_entity_ids,
        ...moment.camera.focus_entity_ids,
        ...moment.camera
          .keep_visible_entity_ids,
      ];
      references.forEach((id) => {
        coveredIds.add(id);
        if (!entityIds.has(id)) {
          unresolvedReferenceCount +=
            1;
          issues.push({
            severity: "error",
            code: "unknown_entity_reference",
            path: momentPath,
            message:
              `Moment references unknown entity ${id}.`,
          });
        }
      });

      if (
        !moment.camera.focus_entity_ids
          .length
      ) {
        issues.push({
          severity: "warning",
          code: "camera_has_no_focus",
          path: `${momentPath}.camera`,
          message:
            "The camera cue has no explicit focus actor.",
        });
      }

      eventCount +=
        moment.events.length;
      textCueCount +=
        moment.text_cues.length;

      if (!moment.events.length) {
        issues.push({
          severity: "warning",
          code: "moment_has_no_event",
          path: `${momentPath}.events`,
          message:
            "This moment relies only on framing; add an executable visual event when a visible change should occur.",
        });
      }

      if (!moment.text_cues.length) {
        issues.push({
          severity: "warning",
          code: "moment_has_no_text_cue",
          path:
            `${momentPath}.text_cues`,
          message:
            "The moment has no timed teaching text.",
        });
      }

      moment.events.forEach(
        (event, eventIndex) => {
          const eventPath =
            `${momentPath}.events[${eventIndex}]`;
          const eventReferences = [
            event.actor_entity_id,
            ...(event.target_entity_id
              ? [
                  event.target_entity_id,
                ]
              : []),
            ...event.supporting_entity_ids,
          ];
          eventReferences.forEach(
            (id) => {
              coveredIds.add(id);
              if (!entityIds.has(id)) {
                unresolvedReferenceCount +=
                  1;
                issues.push({
                  severity: "error",
                  code:
                    "unknown_event_entity",
                  path: eventPath,
                  message:
                    `Event references unknown entity ${id}.`,
                });
              }
            },
          );

          if (
            event.start_ms +
              event.duration_ms >
            moment.duration_ms + 1
          ) {
            issues.push({
              severity: "warning",
              code:
                "event_exceeds_moment",
              path: eventPath,
              message:
                "Event timing extends beyond the containing moment.",
            });
          }
        },
      );

      moment.text_cues.forEach(
        (cue, cueIndex) => {
          const cuePath =
            `${momentPath}.text_cues[${cueIndex}]`;
          if (
            cue.anchor_entity_id &&
            !entityIds.has(
              cue.anchor_entity_id,
            )
          ) {
            unresolvedReferenceCount +=
              1;
            issues.push({
              severity: "error",
              code:
                "unknown_text_anchor",
              path: cuePath,
              message:
                `Text cue anchors to unknown entity ${cue.anchor_entity_id}.`,
            });
          }
          if (
            cue.end_ms >
            moment.duration_ms + 1
          ) {
            issues.push({
              severity: "warning",
              code:
                "text_exceeds_moment",
              path: cuePath,
              message:
                "Text timing extends beyond the containing moment.",
            });
          }
        },
      );
    },
  );

  const uncoveredEntityIds =
    plan.entities
      .map((entity) => entity.id)
      .filter(
        (id) =>
          !coveredIds.has(id),
      );
  if (uncoveredEntityIds.length) {
    issues.push({
      severity: "warning",
      code: "uncovered_entities",
      path: "entities",
      message:
        `These actors are never used by a directed moment: ${uncoveredEntityIds.join(", ")}.`,
    });
  }

  return {
    valid: !issues.some(
      (issue) =>
        issue.severity === "error",
    ),
    entity_count:
      plan.entities.length,
    relationship_count:
      plan.relationships.length,
    moment_count:
      plan.moments.length,
    event_count: eventCount,
    text_cue_count: textCueCount,
    unresolved_reference_count:
      unresolvedReferenceCount,
    uncovered_entity_ids:
      uncoveredEntityIds,
    issues,
  };
}

function legacyEventType(
  behaviour: DirectorBehaviour,
) {
  if (
    behaviour === "move_to" ||
    behaviour === "move_along_path" ||
    behaviour === "insert_into" ||
    behaviour === "remove_from" ||
    behaviour === "rotate" ||
    behaviour === "orbit" ||
    behaviour === "pour"
  ) {
    return "move";
  }
  if (
    behaviour === "trace" ||
    behaviour === "flow" ||
    behaviour === "fill" ||
    behaviour === "drain" ||
    behaviour === "filter"
  ) {
    return "trace";
  }
  if (
    behaviour === "merge" ||
    behaviour === "assemble" ||
    behaviour === "connect"
  ) {
    return "merge";
  }
  if (
    behaviour === "split" ||
    behaviour === "disassemble" ||
    behaviour === "disconnect"
  ) {
    return "split";
  }
  if (
    behaviour === "hide"
  ) {
    return "fade";
  }
  if (
    behaviour === "highlight" ||
    behaviour === "dim_others" ||
    behaviour === "pulse" ||
    behaviour === "pause"
  ) {
    return "glow";
  }
  if (
    behaviour === "show" ||
    behaviour === "emit" ||
    behaviour === "accumulate"
  ) {
    return "pop";
  }
  return "transform";
}

function legacyCameraShot(
  shot: DirectorCameraShot,
) {
  if (shot === "close_up" || shot === "macro") {
    return "close_up";
  }
  if (shot === "top_down") {
    return "top";
  }
  if (
    shot === "side_profile" ||
    shot === "medium"
  ) {
    return "medium";
  }
  if (
    shot === "push_in" ||
    shot === "pull_back" ||
    shot === "follow" ||
    shot === "orbit" ||
    shot === "wide"
  ) {
    return shot;
  }
  return "wide";
}

export function directorPlanToLegacyStoryBeats(
  plan: EducationalSceneDirectorPlanV1,
): Array<Record<string, unknown>> {
  return plan.moments.map(
    (moment) => ({
      id: moment.id,
      title: moment.title,
      duration_ms:
        moment.duration_ms,
      director_intent:
        moment.director_intent,
      learning_job:
        moment.learning_job,
      camera: {
        shot_type:
          legacyCameraShot(
            moment.camera.shot_type,
          ),
        focus_entity_ids:
          moment.camera.focus_entity_ids,
        movement:
          moment.camera.movement,
        framing_intent:
          moment.camera.framing_intent,
        keep_visible_entity_ids:
          moment.camera
            .keep_visible_entity_ids,
      },
      visual_events:
        moment.events.map(
          (event) => ({
            id: event.id,
            type: legacyEventType(
              event.behaviour,
            ),
            behaviour:
              event.behaviour,
            entity_id:
              event.actor_entity_id,
            target_entity_id:
              event.target_entity_id,
            entity_ids:
              event.supporting_entity_ids,
            description:
              event.description,
            start_ms:
              event.start_ms,
            duration_ms:
              event.duration_ms,
            easing:
              event.easing,
            path_hint:
              event.path_hint,
            params:
              event.parameters,
            fallback_behaviour:
              event.fallback_behaviour,
          }),
        ),
      spoken_caption:
        moment.text_cues[0]
          ? {
              text:
                moment.text_cues[0]
                  .text,
              display_mode:
                "short_phrase",
              cadence:
                "natural_speech",
            }
          : null,
      text_cues:
        moment.text_cues,
      source_explanation_piece_ids:
        moment
          .source_explanation_piece_ids,
      introduces_entity_ids:
        moment.introduces_entity_ids,
      keeps_visible_entity_ids:
        moment.keeps_visible_entity_ids,
      active_entity_ids:
        moment.active_entity_ids,
      success_observation:
        moment.success_observation ??
        null,
    }),
  );
}

function supportedLegacyAction(
  behaviour: DirectorBehaviour,
) {
  if (
    behaviour === "show"
  ) {
    return "show_entity";
  }
  if (
    behaviour === "hide"
  ) {
    return "fade_out";
  }
  if (
    behaviour === "trace" ||
    behaviour === "flow" ||
    behaviour === "fill" ||
    behaviour === "drain" ||
    behaviour === "filter"
  ) {
    return "trace_path";
  }
  if (
    behaviour === "move_to" ||
    behaviour === "move_along_path" ||
    behaviour === "insert_into" ||
    behaviour === "remove_from" ||
    behaviour === "rotate" ||
    behaviour === "orbit" ||
    behaviour === "pour"
  ) {
    return "move_entity";
  }
  if (
    behaviour === "pause"
  ) {
    return "pause_for_check";
  }
  return "highlight_entity";
}

export function directorPlanToLegacySemanticBeats(
  plan: EducationalSceneDirectorPlanV1,
  orientationIds: string[] = [],
): Array<Record<string, unknown>> {
  return plan.moments.map(
    (moment, momentIndex) => {
      const actions: Array<
        Record<string, unknown>
      > =
        moment.events.map(
          (event, eventIndex) => ({
            id:
              `${moment.id}_action_${eventIndex + 1}`,
            type:
              supportedLegacyAction(
                event.behaviour,
              ),
            target_entity_id:
              event.actor_entity_id,
            narration:
              moment.text_cues[0]
                ?.text ??
              event.description,
            params: {
              canonical_behaviour:
                event.behaviour,
              target_entity_id:
                event.target_entity_id,
              supporting_entity_ids:
                event.supporting_entity_ids,
              start_ms:
                event.start_ms,
              duration_ms:
                event.duration_ms,
              easing:
                event.easing,
              path_hint:
                event.path_hint,
              ...event.parameters,
            },
          }),
        );

      if (!actions.length) {
        actions.push({
          id:
            `${moment.id}_action_1`,
          type:
            "highlight_entity",
          target_entity_id:
            moment.active_entity_ids[0] ??
            plan.entities[0]?.id ??
            "main_actor",
          narration:
            moment.text_cues[0]
              ?.text ??
            moment.director_intent,
          params: {
            canonical_behaviour:
              "highlight",
          },
        });
      }

      return {
        id: moment.id,
        title: moment.title,
        source_orientation_segment_ids:
          moment
            .source_explanation_piece_ids
            .length
            ? moment
                .source_explanation_piece_ids
            : orientationIds.length
              ? [
                  orientationIds[
                    Math.min(
                      momentIndex,
                      orientationIds.length -
                        1,
                    )
                  ],
                ]
              : [],
        duration_ms:
          moment.duration_ms,
        active_entity_ids:
          moment.active_entity_ids
            .length
            ? moment.active_entity_ids
            : [
                actions[0]
                  .target_entity_id,
              ],
        actions,
      };
    },
  );
}

export function directorPlanToPrimitiveBeats(
  plan: EducationalSceneDirectorPlanV1,
): Array<{
  id: string;
  title: string;
  reveal: string[];
  emphasize?: string[];
  camera:
    | "wide"
    | "medium"
    | "close"
    | "top"
    | "isometric"
    | "orbit";
}> {
  const visible = new Set<string>();
  return plan.moments.map(
    (moment) => {
      moment.introduces_entity_ids.forEach(
        (id) => visible.add(id),
      );
      moment.keeps_visible_entity_ids.forEach(
        (id) => visible.add(id),
      );
      moment.active_entity_ids.forEach(
        (id) => visible.add(id),
      );

      const shot =
        moment.camera.shot_type;
      const camera =
        shot === "close_up" ||
        shot === "macro"
          ? "close"
          : shot === "top_down"
            ? "top"
            : shot === "isometric"
              ? "isometric"
              : shot === "orbit"
                ? "orbit"
                : shot === "wide"
                  ? "wide"
                  : "medium";

      return {
        id: moment.id,
        title: moment.title,
        reveal:
          Array.from(visible),
        emphasize:
          moment.active_entity_ids
            .length
            ? moment.active_entity_ids
            : undefined,
        camera,
      };
    },
  );
}

export function directorPlanToLegacyDirectedScene(
  plan: EducationalSceneDirectorPlanV1,
): Record<string, unknown> {
  return {
    scene_concept:
      plan.scene_thesis,
    visual_metaphor:
      plan.representation_strategy
        .reason,
    emotional_tone:
      plan.style.mood,
    spatial_design:
      plan.style.continuity,
    cinematography: {
      opening_shot:
        plan.moments[0]?.camera
          .shot_type ??
        "wide",
      camera_motion:
        plan.moments
          .map(
            (moment) =>
              moment.camera.movement,
          )
          .join(" → "),
      focus_strategy:
        plan.style.attention_policy,
    },
    reveal_strategy: {
      reveal_elements_one_at_a_time:
        true,
      reason:
        "Each directed moment has one learner-attention job.",
      reveal_order_entity_ids:
        Array.from(
          new Set(
            plan.moments.flatMap(
              (moment) =>
                moment
                  .introduces_entity_ids,
            ),
          ),
        ),
      keep_previous_elements_visible:
        true,
    },
    renderer_directive:
      "Compile the canonical educational director plan. Preserve entity ids and direction even when an asset is unresolved.",
  };
}

export function directorPlanToCaptionPolicy(
  plan: EducationalSceneDirectorPlanV1,
): Record<string, unknown> {
  return {
    display_mode:
      "short_phrase",
    cadence:
      "natural_speech",
    max_words_on_screen:
      plan.global_text_policy
        .max_words_per_cue,
    max_lines:
      plan.global_text_policy
        .max_lines,
    important_words_linger:
      true,
    avoid_covering_core_motion:
      plan.global_text_policy
        .avoid_covering_core_motion,
    prefer_object_anchored_text:
      plan.global_text_policy
        .prefer_object_anchored_text,
  };
}
