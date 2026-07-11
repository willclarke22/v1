import type {
  SemanticSceneBeat,
  SemanticSceneEntity,
  SemanticSceneRelationship,
  VisualPrimitiveKind,
} from "../../visual-learning-turn";

export type Vec3 = [number, number, number];

export type SpatialConstraint =
  | { type: "centered"; entity_id: string; evidence: string }
  | { type: "vertical_orientation"; entity_id: string; evidence: string }
  | { type: "horizontal_orientation"; entity_id: string; evidence: string }
  | { type: "inside"; entity_id: string; reference_entity_id: string; evidence: string }
  | { type: "above"; entity_id: string; reference_entity_id: string; evidence: string }
  | { type: "below"; entity_id: string; reference_entity_id: string; evidence: string }
  | { type: "left_of"; entity_id: string; reference_entity_id: string; evidence: string }
  | { type: "right_of"; entity_id: string; reference_entity_id: string; evidence: string }
  | { type: "connects"; entity_id: string; from_entity_id: string; to_entity_id: string; evidence: string }
  | { type: "focus"; entity_id: string; evidence: string };

export type RenderRole =
  | "transparent_container"
  | "cylindrical_container"
  | "solid_body"
  | "piston_body"
  | "moving_body"
  | "connector"
  | "rod_connector"
  | "rotating_body"
  | "shaft_body"
  | "wheel_body"
  | "particle_burst"
  | "path"
  | "label"
  | "generic_body";

export type MotionTrack = {
  entity_id: string;
  kind: "fade" | "pop" | "glow" | "slide" | "rotate" | "trace" | "transform" | "connector_follow" | "none";
  beat_id?: string | null;
  axis?: "x" | "y" | "z";
  direction?: "up" | "down" | "left" | "right" | "forward" | "back";
  amount?: number;
  rotate_axis?: "x" | "y" | "z";
  rotate_amount?: number;
  from_entity_id?: string | null;
  to_entity_id?: string | null;
  evidence: string;
};

export type CameraTrack = {
  beat_id: string;
  shot_type: string;
  focus_entity_ids: string[];
  movement: string;
  target: Vec3;
  wide_position: Vec3;
  close_position: Vec3;
};

export type CompiledEntityGeometry = {
  entity_id: string;
  position: Vec3;
  scale: Vec3;
  render_role: RenderRole;
  render_kind: VisualPrimitiveKind | "registered_asset" | "any" | "placeholder";
  connector_from_id?: string | null;
  connector_to_id?: string | null;
  connector_from_position?: Vec3 | null;
  connector_to_position?: Vec3 | null;
  label_anchor: Vec3;
  evidence: string[];
};

export type DirectedSceneRenderPlan = {
  kind: "directed_scene_constraint_plan_v1";
  source: "directed_scene";
  spatial_constraints: SpatialConstraint[];
  motion_tracks: MotionTrack[];
  camera_tracks: CameraTrack[];
  entity_geometry: CompiledEntityGeometry[];
  faithfulness_warnings: string[];
};

type CompileInput = {
  title: string;
  directedScene: Record<string, unknown> | null;
  storyBeats: Array<Record<string, unknown>>;
  entities: SemanticSceneEntity[];
  relationships: SemanticSceneRelationship[];
  beats: SemanticSceneBeat[];
  activeBeatIndex: number;
  activeEntityIds: Set<string>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function entityWords(entity: SemanticSceneEntity) {
  const base = [entity.id, entity.display_name]
    .flatMap((item) => [item, item.replace(/_/g, " ")])
    .map(norm)
    .filter(Boolean);
  return Array.from(new Set(base)).sort((a, b) => b.length - a.length);
}

function entityText(entity: SemanticSceneEntity) {
  return norm([
    entity.id,
    entity.display_name,
    entity.semantic_role,
    entity.visual_need?.description,
    ...(entity.visual_need?.semantic_tags ?? []),
    entity.visual_need?.preferred_render_kind,
  ].join(" "));
}

function entityLabel(entity: SemanticSceneEntity) {
  return entity.display_name || entity.id.replace(/_/g, " ");
}

function wordsMention(textValue: string, entity: SemanticSceneEntity) {
  return entityWords(entity).some((word) => textValue.includes(word));
}

function hasExplicitInsideStatement(textValue: string, entity: SemanticSceneEntity, reference: SemanticSceneEntity) {
  const entityWordsList = entityWords(entity);
  const referenceWords = entityWords(reference);

  return entityWordsList.some((e) =>
    referenceWords.some((r) =>
      textValue.includes(`${e} inside ${r}`) ||
      textValue.includes(`${e} is inside ${r}`) ||
      textValue.includes(`${e} appears inside ${r}`) ||
      textValue.includes(`${e} moves inside ${r}`) ||
      textValue.includes(`${e} within ${r}`) ||
      textValue.includes(`${e} in the ${r}`) ||
      textValue.includes(`${e} in ${r}`),
    ),
  );
}

function eventDescriptionsForEntity(input: CompileInput, entityId: string) {
  return input.storyBeats
    .flatMap((beat) => asArray(beat.visual_events))
    .map(asRecord)
    .filter((event): event is Record<string, unknown> => {
      if (!event) return false;
      return text(event.entity_id, "") === entityId;
    })
    .map((event) => norm(text(event.description, "")))
    .join(" ");
}

function isClearlyParticleOrSubstance(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["particle", "mist", "gas", "smoke", "cloud", "fluid", "water", "air", "fuel", "flow", "liquid"].some((token) => combined.includes(token));
}

function sideBias(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  if (combined.includes("left") || combined.includes("intake")) return -1;
  if (combined.includes("right") || combined.includes("exhaust") || combined.includes("opposite")) return 1;
  return 0;
}

function fullSceneText(input: CompileInput) {
  const directed = input.directedScene ?? {};
  const cinematography = asRecord(directed.cinematography) ?? {};
  const storyText = input.storyBeats
    .map((beat) => {
      const camera = asRecord(beat.camera) ?? {};
      const caption = asRecord(beat.spoken_caption) ?? {};
      const visualEvents = asArray(beat.visual_events).map((event) => text(asRecord(event)?.description, "")).join(" ");
      return [beat.title, beat.director_intent, camera.shot_type, camera.movement, caption.text, visualEvents].join(" ");
    })
    .join(" ");

  return norm([
    input.title,
    directed.scene_concept,
    directed.visual_metaphor,
    directed.emotional_tone,
    directed.spatial_design,
    cinematography.opening_shot,
    cinematography.camera_motion,
    cinematography.focus_strategy,
    cinematography.label_strategy,
    storyText,
    input.relationships.map((relationship) => relationship.explanation).join(" "),
    input.entities.map((entity) => entityText(entity)).join(" "),
  ].join(" "));
}

function includesNear(haystack: string, parts: string[]) {
  let cursor = 0;
  for (const part of parts) {
    const found = haystack.indexOf(norm(part), cursor);
    if (found < 0) return false;
    cursor = found + norm(part).length;
  }
  return true;
}

function hasPhraseNearEntity(textValue: string, entity: SemanticSceneEntity, phrases: string[]) {
  const words = entityWords(entity);
  return words.some((word) => phrases.some((phrase) => textValue.includes(`${word} ${phrase}`) || textValue.includes(`${phrase} ${word}`)));
}

function hasWord(textValue: string, word: string) {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(textValue);
}

function isContainerLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["container", "tube", "chamber", "vessel", "wall", "inside", "transparent", "hollow", "shell", "can", "pipe"].some((token) => combined.includes(token));
}

function isConnectorLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["connector", "connect", "link", "rod", "bar", "bridge", "lever", "wire", "path", "line", "arrow"].some((token) => combined.includes(token));
}

function isRotatingLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["rotate", "rotating", "spin", "spinning", "wheel", "disc", "circle", "circular", "shaft", "rotator"].some((token) => combined.includes(token));
}

function isParticleLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  const preferred = entity.visual_need?.preferred_render_kind;

  if (preferred === "particle") return true;
  if (combined.includes("plug") && !combined.includes("particle") && !combined.includes("burst") && !combined.includes("cloud")) return false;

  return ["particle", "burst", "flash", "glow", "energy", "pop", "mist", "gas", "smoke", "cloud"].some((token) => combined.includes(token));
}

function isMovingLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["move", "moving", "mover", "dynamic", "slide", "slides", "flow", "travels", "shifts"].some((token) => combined.includes(token));
}

function isCylinderLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["cylinder", "cylindrical", "tube", "chamber", "barrel", "pipe", "glass like cylinder"].some((token) => combined.includes(token));
}

function isPistonLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["piston", "plug", "disc shaped", "disc", "disk", "sliding plug", "piston head"].some((token) => combined.includes(token));
}

function isRodLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["rod", "connecting rod", "linkage", "bar", "lever"].some((token) => combined.includes(token));
}

function isCrankshaftLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["crankshaft", "crank shaft", "shaft", "crank", "off center", "off centre"].some((token) => combined.includes(token));
}

function isWheelLike(entity: SemanticSceneEntity) {
  const combined = entityText(entity);
  return ["wheel", "spoked", "tire", "tyre", "rim", "car wheel", "rotating wheel"].some((token) => combined.includes(token));
}

function renderRoleForEntity(entity: SemanticSceneEntity): RenderRole {
  if (isParticleLike(entity)) return "particle_burst";
  if (isCylinderLike(entity)) return "cylindrical_container";
  if (isPistonLike(entity)) return "piston_body";
  if (isWheelLike(entity)) return "wheel_body";
  if (isCrankshaftLike(entity)) return "shaft_body";
  if (isRodLike(entity)) return "rod_connector";
  if (isRotatingLike(entity)) return "rotating_body";
  if (isConnectorLike(entity)) return "connector";
  if (isContainerLike(entity)) return "transparent_container";
  if (isMovingLike(entity)) return "moving_body";
  if (entity.visual_need?.preferred_render_kind === "path") return "path";
  if (entity.visual_need?.preferred_render_kind === "label") return "label";
  if (entity.visual_need?.preferred_render_kind === "box" || entity.visual_need?.preferred_render_kind === "sphere") return "solid_body";
  return "generic_body";
}

function pushConstraint(constraints: SpatialConstraint[], constraint: SpatialConstraint) {
  const key = JSON.stringify({ ...constraint, evidence: undefined });
  if (!constraints.some((candidate) => JSON.stringify({ ...candidate, evidence: undefined }) === key)) {
    constraints.push(constraint);
  }
}

function inferInsideConstraints(input: CompileInput, allText: string, constraints: SpatialConstraint[]) {
  for (const entity of input.entities) {
    const currentText = entityText(entity);
    const eventText = eventDescriptionsForEntity(input, entity.id);

    for (const reference of input.entities) {
      if (entity.id === reference.id) continue;

      const referenceLooksLikeContainer = isContainerLike(reference);
      const explicitEntityInsideReference =
        hasExplicitInsideStatement(allText, entity, reference) ||
        hasExplicitInsideStatement(currentText, entity, reference) ||
        hasExplicitInsideStatement(eventText, entity, reference);

      const relationshipInside = input.relationships.some((relationship) => {
        if (relationship.source_entity_id !== entity.id || !relationship.target_entity_ids.includes(reference.id)) return false;

        const explanation = norm(relationship.explanation);
        const explicitInExplanation = hasExplicitInsideStatement(explanation, entity, reference);
        const explanationMentionsBoth = wordsMention(explanation, entity) && wordsMention(explanation, reference);
        const saysInside = explanation.includes("inside") || explanation.includes("within") || explanation.includes("contained");

        // Do not treat a generic “A enters B” relationship as containment unless B is actually container-like.
        // This avoids false layouts like “valve inside mist” for relationships that really mean “mist enters through valve.”
        return explicitInExplanation || (referenceLooksLikeContainer && explanationMentionsBoth && saysInside);
      });

      if ((referenceLooksLikeContainer && explicitEntityInsideReference) || relationshipInside) {
        pushConstraint(constraints, {
          type: "inside",
          entity_id: entity.id,
          reference_entity_id: reference.id,
          evidence: relationshipInside
            ? `relationship says ${entity.id} is inside ${reference.id}`
            : `${entityLabel(entity)} appears inside ${entityLabel(reference)}`,
        });
      }
    }
  }
}

function inferDirectionalConstraints(input: CompileInput, allText: string, constraints: SpatialConstraint[]) {
  for (const entity of input.entities) {
    const words = entityWords(entity);
    const currentText = entityText(entity);
    const eventText = eventDescriptionsForEntity(input, entity.id);
    const combinedEntityText = `${currentText} ${eventText}`;

    if (hasPhraseNearEntity(allText, entity, ["is vertical", "vertical", "vertical and", "upright"]) || currentText.includes("vertical")) {
      pushConstraint(constraints, { type: "vertical_orientation", entity_id: entity.id, evidence: `${entityLabel(entity)} described as vertical/upright` });
    }
    if (hasPhraseNearEntity(allText, entity, ["is horizontal", "horizontal", "sideways"]) || currentText.includes("horizontal")) {
      pushConstraint(constraints, { type: "horizontal_orientation", entity_id: entity.id, evidence: `${entityLabel(entity)} described as horizontal/sideways` });
    }
    if (words.some((word) => allText.includes(`${word} is centered`) || allText.includes(`${word} centered`) || allText.includes(`centered ${word}`))) {
      pushConstraint(constraints, { type: "centered", entity_id: entity.id, evidence: `${entityLabel(entity)} described as centered` });
    }

    for (const reference of input.entities) {
      if (entity.id === reference.id) continue;
      const referenceWords = entityWords(reference);
      const entityWordsList = entityWords(entity);
      const pairs = entityWordsList.flatMap((e) => referenceWords.map((r) => [e, r] as const));

      for (const [e, r] of pairs) {
        if (allText.includes(`${e} above ${r}`) || allText.includes(`${e} appears above ${r}`) || combinedEntityText.includes(`above ${r}`)) {
          pushConstraint(constraints, { type: "above", entity_id: entity.id, reference_entity_id: reference.id, evidence: `${entityLabel(entity)} described as above ${entityLabel(reference)}` });
        }
        if (allText.includes(`${e} below ${r}`) || allText.includes(`${e} appears below ${r}`) || combinedEntityText.includes(`below ${r}`)) {
          pushConstraint(constraints, { type: "below", entity_id: entity.id, reference_entity_id: reference.id, evidence: `${entityLabel(entity)} described as below ${entityLabel(reference)}` });
        }
        if (allText.includes(`${e} left of ${r}`) || allText.includes(`${e} on the left of ${r}`) || combinedEntityText.includes(`left of ${r}`)) {
          pushConstraint(constraints, { type: "left_of", entity_id: entity.id, reference_entity_id: reference.id, evidence: `${entityLabel(entity)} described as left of ${entityLabel(reference)}` });
        }
        if (allText.includes(`${e} right of ${r}`) || allText.includes(`${e} on the right of ${r}`) || combinedEntityText.includes(`right of ${r}`)) {
          pushConstraint(constraints, { type: "right_of", entity_id: entity.id, reference_entity_id: reference.id, evidence: `${entityLabel(entity)} described as right of ${entityLabel(reference)}` });
        }
      }
    }
  }

  // Generic fallback for “at the bottom” / “at the top” when the sentence does not name the reference.
  const likelyCenter = input.entities.find(isContainerLike)
    ?? input.entities.find((entity) => constraints.some((constraint) => constraint.type === "centered" && constraint.entity_id === entity.id))
    ?? input.entities[0];

  if (likelyCenter) {
    for (const entity of input.entities) {
      if (entity.id === likelyCenter.id) continue;
      const currentText = entityText(entity);
      const eventText = eventDescriptionsForEntity(input, entity.id);
      const combined = `${currentText} ${eventText}`;

      if (combined.includes("at the bottom") || combined.includes("below") || combined.includes("downwards") || combined.includes("downward") || combined.includes("lower assembly")) {
        pushConstraint(constraints, { type: "below", entity_id: entity.id, reference_entity_id: likelyCenter.id, evidence: `${entityLabel(entity)} described as bottom/downward in scene` });
      }
      if (combined.includes("at the top") || combined.includes("from the top") || combined.includes("enters from the top") || combined.includes("above") || combined.includes("upwards") || combined.includes("upward")) {
        pushConstraint(constraints, { type: "above", entity_id: entity.id, reference_entity_id: likelyCenter.id, evidence: `${entityLabel(entity)} described as top/upward in scene` });
      }
      if (combined.includes("far to the right") || combined.includes("on the right") || combined.includes("right side") || combined.includes("to the right")) {
        pushConstraint(constraints, { type: "right_of", entity_id: entity.id, reference_entity_id: likelyCenter.id, evidence: `${entityLabel(entity)} described as right side of scene` });
      }
      if (combined.includes("far to the left") || combined.includes("on the left") || combined.includes("left side") || combined.includes("to the left")) {
        pushConstraint(constraints, { type: "left_of", entity_id: entity.id, reference_entity_id: likelyCenter.id, evidence: `${entityLabel(entity)} described as left side of scene` });
      }

      for (const reference of input.entities) {
        if (entity.id === reference.id) continue;
        const referenceMentioned = entityWords(reference).some((word) => combined.includes(`above ${word}`) || combined.includes(`below ${word}`));
        if (!referenceMentioned) continue;
        if (entityWords(reference).some((word) => combined.includes(`above ${word}`))) {
          pushConstraint(constraints, { type: "above", entity_id: entity.id, reference_entity_id: reference.id, evidence: `${entityLabel(entity)} event described as above ${entityLabel(reference)}` });
        }
        if (entityWords(reference).some((word) => combined.includes(`below ${word}`))) {
          pushConstraint(constraints, { type: "below", entity_id: entity.id, reference_entity_id: reference.id, evidence: `${entityLabel(entity)} event described as below ${entityLabel(reference)}` });
        }
      }
    }
  }
}

function inferConnectors(input: CompileInput, allText: string, constraints: SpatialConstraint[]) {
  for (const relationship of input.relationships) {
    const source = input.entities.find((entity) => entity.id === relationship.source_entity_id);
    if (!source) continue;
    for (const targetId of relationship.target_entity_ids) {
      const target = input.entities.find((entity) => entity.id === targetId);
      if (!target) continue;
      if (relationship.relationship_type === "connects_to" || relationship.relationship_type === "becomes" || relationship.relationship_type === "causes") {
        const connector = input.entities.find((candidate) => {
          if (!isConnectorLike(candidate)) return false;
          const candidateText = entityText(candidate);
          return candidate.id !== source.id && candidate.id !== target.id &&
            (candidateText.includes(norm(source.display_name)) || candidateText.includes(norm(source.id)) || allText.includes(`${norm(candidate.display_name)} links ${norm(source.display_name)}`)) &&
            (candidateText.includes(norm(target.display_name)) || candidateText.includes(norm(target.id)) || allText.includes(`${norm(candidate.display_name)} links ${norm(source.display_name)} to ${norm(target.display_name)}`));
        });

        if (connector) {
          pushConstraint(constraints, {
            type: "connects",
            entity_id: connector.id,
            from_entity_id: source.id,
            to_entity_id: target.id,
            evidence: `${entityLabel(connector)} links ${entityLabel(source)} to ${entityLabel(target)}`,
          });
        }
      }
    }
  }

  for (const connector of input.entities.filter(isConnectorLike)) {
    const connectorText = entityText(connector);
    const mentioned = input.entities.filter((entity) => entity.id !== connector.id && entityWords(entity).some((word) => connectorText.includes(word) || allText.includes(`${norm(connector.display_name)} links ${word}`) || allText.includes(`${norm(connector.display_name)} connecting ${word}`)));

    if (mentioned.length >= 2) {
      pushConstraint(constraints, {
        type: "connects",
        entity_id: connector.id,
        from_entity_id: mentioned[0].id,
        to_entity_id: mentioned[1].id,
        evidence: `${entityLabel(connector)} text mentions ${entityLabel(mentioned[0])} and ${entityLabel(mentioned[1])}`,
      });
    }
  }
}

function inferSpatialConstraints(input: CompileInput): SpatialConstraint[] {
  const allText = fullSceneText(input);
  const constraints: SpatialConstraint[] = [];

  inferInsideConstraints(input, allText, constraints);
  inferDirectionalConstraints(input, allText, constraints);
  inferConnectors(input, allText, constraints);

  const focusedIds = new Set<string>();
  for (const beat of input.storyBeats) {
    const camera = asRecord(beat.camera) ?? {};
    for (const id of asArray(camera.focus_entity_ids).map(String)) focusedIds.add(id);
  }
  for (const id of input.activeEntityIds) focusedIds.add(id);
  for (const id of focusedIds) {
    if (input.entities.some((entity) => entity.id === id)) {
      pushConstraint(constraints, { type: "focus", entity_id: id, evidence: "entity appears in camera focus or active beat" });
    }
  }

  return constraints;
}

function cloneVec(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function midVec(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function relationPriority(constraint: SpatialConstraint) {
  if (constraint.type === "centered") return 1;
  if (constraint.type === "inside") return 2;
  if (constraint.type === "above" || constraint.type === "below" || constraint.type === "left_of" || constraint.type === "right_of") return 3;
  if (constraint.type === "connects") return 4;
  return 5;
}

function defaultScaleForRole(role: RenderRole, entity: SemanticSceneEntity, constraints: SpatialConstraint[]): Vec3 {
  const vertical = constraints.some((constraint) => constraint.type === "vertical_orientation" && constraint.entity_id === entity.id);
  const horizontal = constraints.some((constraint) => constraint.type === "horizontal_orientation" && constraint.entity_id === entity.id);

  if (role === "cylindrical_container") return vertical ? [0.95, 2.75, 0.95] : horizontal ? [2.45, 0.78, 0.78] : [1.25, 1.25, 1.25];
  if (role === "transparent_container") return vertical ? [0.95, 2.6, 0.72] : horizontal ? [2.25, 0.7, 0.72] : [1.25, 1.25, 0.84];
  if (role === "piston_body") return [0.78, 0.26, 0.78];
  if (role === "moving_body") return [0.62, 0.42, 0.56];
  if (role === "rod_connector" || role === "connector") return [1, 1, 1];
  if (role === "shaft_body") return [0.95, 0.95, 0.28];
  if (role === "wheel_body") return [1.08, 1.08, 0.28];
  if (role === "rotating_body") return [0.82, 0.82, 0.22];
  if (role === "particle_burst") return [0.62, 0.62, 0.62];
  if (role === "path") return [1, 1, 1];
  return [0.72, 0.72, 0.72];
}

function groupKeyForConstraint(constraint: SpatialConstraint) {
  if (!("reference_entity_id" in constraint)) return null;
  if (!["above", "below", "left_of", "right_of"].includes(constraint.type)) return null;
  return `${constraint.type}:${constraint.reference_entity_id}`;
}

function spreadDirectionalSiblings(
  input: CompileInput,
  constraints: SpatialConstraint[],
  geometry: Map<string, CompiledEntityGeometry>,
) {
  const groups = new Map<string, SpatialConstraint[]>();

  for (const constraint of constraints) {
    const key = groupKeyForConstraint(constraint);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(constraint);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const unique = Array.from(new Map(group.map((constraint) => [constraint.entity_id, constraint])).values());
    if (unique.length <= 1) continue;

    const sorted = unique.sort((a, b) => {
      const entityA = input.entities.find((entity) => entity.id === a.entity_id);
      const entityB = input.entities.find((entity) => entity.id === b.entity_id);
      const biasA = entityA ? sideBias(entityA) : 0;
      const biasB = entityB ? sideBias(entityB) : 0;
      if (biasA !== biasB) return biasA - biasB;
      return a.entity_id.localeCompare(b.entity_id);
    });

    sorted.forEach((constraint, index) => {
      const item = geometry.get(constraint.entity_id);
      if (!item) return;
      const offset = (index - (sorted.length - 1) / 2) * 0.72;
      if (constraint.type === "above" || constraint.type === "below") item.position = [item.position[0] + offset, item.position[1], item.position[2]];
      else item.position = [item.position[0], item.position[1], item.position[2] + offset * 0.55];
      item.evidence.push("spread sibling entities that shared the same directional relation");
    });
  }
}

function separateOverlappingGeometry(input: CompileInput, geometry: Map<string, CompiledEntityGeometry>) {
  const buckets = new Map<string, CompiledEntityGeometry[]>();

  for (const item of geometry.values()) {
    if (item.render_role === "connector") continue;
    const key = item.position.map((part) => Math.round(part * 10) / 10).join(":");
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }

  for (const bucket of buckets.values()) {
    if (bucket.length <= 1) continue;
    const sorted = bucket.sort((a, b) => {
      const entityA = input.entities.find((entity) => entity.id === a.entity_id);
      const entityB = input.entities.find((entity) => entity.id === b.entity_id);
      const biasA = entityA ? sideBias(entityA) : 0;
      const biasB = entityB ? sideBias(entityB) : 0;
      if (biasA !== biasB) return biasA - biasB;
      return a.entity_id.localeCompare(b.entity_id);
    });

    sorted.forEach((item, index) => {
      if (index === 0 && item.render_role === "transparent_container") return;
      const offset = (index - (sorted.length - 1) / 2) * 0.48;
      item.position = [item.position[0] + offset, item.position[1], item.position[2] + Math.abs(offset) * 0.14];
      item.evidence.push("separated overlapping entities without using a template layout");
    });
  }
}

function resolveEntityGeometry(input: CompileInput, constraints: SpatialConstraint[]): CompiledEntityGeometry[] {
  const geometry = new Map<string, CompiledEntityGeometry>();
  const focus = input.entities.find(isContainerLike)
    ?? input.entities.find((entity) => constraints.some((constraint) => constraint.type === "centered" && constraint.entity_id === entity.id))
    ?? input.entities.find((entity) => constraints.some((constraint) => constraint.type === "focus" && constraint.entity_id === entity.id))
    ?? input.entities[0];

  input.entities.forEach((entity, index) => {
    const role = renderRoleForEntity(entity);
    const isFocus = focus?.id === entity.id;
    const initial: Vec3 = isFocus ? [0, 0.15, 0] : [Math.cos(index * 1.7) * 1.7, 0, Math.sin(index * 1.7) * 1.05];
    const scale = defaultScaleForRole(role, entity, constraints);
    geometry.set(entity.id, {
      entity_id: entity.id,
      position: initial,
      scale,
      render_role: role,
      render_kind: entity.visual_need?.preferred_render_kind ?? "placeholder",
      connector_from_id: null,
      connector_to_id: null,
      connector_from_position: null,
      connector_to_position: null,
      label_anchor: [0, scale[1] / 2 + 0.35, 0],
      evidence: isFocus ? ["chosen as directed-scene center/focus"] : ["initial generic non-template placement"],
    });
  });

  const sorted = [...constraints].sort((a, b) => relationPriority(a) - relationPriority(b));

  for (let pass = 0; pass < 4; pass += 1) {
    for (const constraint of sorted) {
      if (constraint.type === "centered") {
        const item = geometry.get(constraint.entity_id);
        if (item) {
          item.position = [0, item.render_role === "transparent_container" ? 0.15 : 0, 0];
          item.evidence.push(constraint.evidence);
        }
      }

      if (constraint.type === "inside") {
        const item = geometry.get(constraint.entity_id);
        const reference = geometry.get(constraint.reference_entity_id);
        if (item && reference) {
          const nearTop = entityText(input.entities.find((candidate) => candidate.id === item.entity_id) ?? ({ id: item.entity_id, display_name: item.entity_id, semantic_role: "", visual_need: { description: "", semantic_tags: [], preferred_render_kind: "sphere", fallback_allowed: true } })).includes("near the top");
          item.position = [reference.position[0], reference.position[1] + (nearTop ? reference.scale[1] * 0.26 : 0.18), reference.position[2]];
          item.scale = [Math.min(item.scale[0], reference.scale[0] * 0.78), Math.min(item.scale[1], reference.scale[1] * 0.24), Math.min(item.scale[2], reference.scale[2] * 0.86)];
          item.evidence.push(constraint.evidence);
        }
      }

      if (constraint.type === "above" || constraint.type === "below" || constraint.type === "left_of" || constraint.type === "right_of") {
        const item = geometry.get(constraint.entity_id);
        const reference = geometry.get(constraint.reference_entity_id);
        if (item && reference) {
          const offset: Vec3 =
            constraint.type === "above" ? [0, reference.scale[1] * 0.45 + 0.62, 0]
            : constraint.type === "below" ? [0, -(reference.scale[1] * 0.5 + 0.92), 0]
            : constraint.type === "left_of" ? [-(reference.scale[0] * 0.65 + 0.92), 0, 0]
            : [reference.scale[0] * 0.65 + 0.92, 0, 0];
          item.position = addVec(reference.position, offset);
          item.evidence.push(constraint.evidence);
        }
      }

      if (constraint.type === "vertical_orientation" || constraint.type === "horizontal_orientation") {
        const item = geometry.get(constraint.entity_id);
        const entity = input.entities.find((candidate) => candidate.id === constraint.entity_id);
        if (item && entity) {
          item.scale = defaultScaleForRole(item.render_role, entity, constraints);
          item.evidence.push(constraint.evidence);
        }
      }
    }
  }

  for (const constraint of sorted) {
    if (constraint.type !== "connects") continue;
    const item = geometry.get(constraint.entity_id);
    const from = geometry.get(constraint.from_entity_id);
    const to = geometry.get(constraint.to_entity_id);
    if (item && from && to) {
      item.position = midVec(from.position, to.position);
      item.connector_from_id = from.entity_id;
      item.connector_to_id = to.entity_id;
      item.connector_from_position = cloneVec(from.position);
      item.connector_to_position = cloneVec(to.position);
      item.render_role = item.render_role === "rod_connector" ? "rod_connector" : "connector";
      item.evidence.push(constraint.evidence);
    }
  }

  // If there are still unconstrained entities, place them around the resolved hero geometry without using old layout modes.
  const constrained = new Set(constraints.flatMap((constraint) => {
    if (constraint.type === "connects") return [constraint.entity_id, constraint.from_entity_id, constraint.to_entity_id];
    if ("reference_entity_id" in constraint) return [constraint.entity_id, constraint.reference_entity_id];
    return [constraint.entity_id];
  }));
  const unconstrained = input.entities.filter((entity) => !constrained.has(entity.id));
  unconstrained.forEach((entity, index) => {
    const item = geometry.get(entity.id);
    if (!item) return;
    const angle = (index / Math.max(1, unconstrained.length)) * Math.PI * 2 - Math.PI / 2;
    item.position = [Math.cos(angle) * 2.2, 0, Math.sin(angle) * 1.35];
    item.evidence.push("placed as unconstrained support entity around directed scene center");
  });

  spreadDirectionalSiblings(input, sorted, geometry);
  separateOverlappingGeometry(input, geometry);

  return input.entities.map((entity) => geometry.get(entity.id)).filter((item): item is CompiledEntityGeometry => Boolean(item));
}

function inferMotionKind(eventType: string, description: string, entity: SemanticSceneEntity | undefined): MotionTrack["kind"] {
  const lower = norm(`${eventType} ${description} ${entity ? entityText(entity) : ""}`);
  if (eventType === "pop" || lower.includes("burst") || lower.includes("expanding")) return "pop";
  if (eventType === "glow" || lower.includes("glow") || lower.includes("highlight")) return "glow";
  if (eventType === "fade" || eventType === "fade_in" || eventType === "fade_out") return "fade";
  if (eventType === "trace" || lower.includes("trace") || lower.includes("trail")) return "trace";
  if (eventType === "transform") return lower.includes("rotate") || lower.includes("spin") || lower.includes("turn") ? "rotate" : "transform";
  if (eventType === "move" || lower.includes("slide") || lower.includes("move") || lower.includes("travel")) return "slide";
  return "none";
}

function inferMotionDirection(description: string): MotionTrack["direction"] | undefined {
  const lower = norm(description);
  if (hasWord(lower, "down") || lower.includes("downward") || lower.includes("downwards") || lower.includes("desc")) return "down";
  if (hasWord(lower, "up") || lower.includes("upward") || lower.includes("upwards") || lower.includes("asc")) return "up";
  if (hasWord(lower, "left")) return "left";
  if (hasWord(lower, "right")) return "right";
  if (hasWord(lower, "forward")) return "forward";
  if (hasWord(lower, "back")) return "back";
  return undefined;
}

function inferMotionTracks(input: CompileInput, constraints: SpatialConstraint[]): MotionTrack[] {
  const tracks: MotionTrack[] = [];

  for (const beat of input.storyBeats) {
    const beatId = text(beat.id, "");
    for (const event of asArray(beat.visual_events)) {
      const record = asRecord(event) ?? {};
      const entityId = text(record.entity_id, text(asArray(record.entity_ids)[0], ""));
      if (!entityId || !input.entities.some((entity) => entity.id === entityId)) continue;
      const entity = input.entities.find((candidate) => candidate.id === entityId);
      const eventType = text(record.type, "none");
      const description = text(record.description, eventType);
      const kind = inferMotionKind(eventType, description, entity);
      const direction = inferMotionDirection(description);
      const rotateAmount = norm(description).includes("quarter") ? Math.PI / 2 : norm(description).includes("half") ? Math.PI : Math.PI * 2;

      tracks.push({
        entity_id: entityId,
        kind,
        beat_id: beatId,
        axis: direction === "left" || direction === "right" ? "x" : direction === "forward" || direction === "back" ? "z" : "y",
        direction,
        amount: kind === "slide" ? 0.92 : undefined,
        rotate_axis: "z",
        rotate_amount: kind === "rotate" ? rotateAmount : undefined,
        evidence: description,
      });
    }
  }

  for (const constraint of constraints) {
    if (constraint.type === "connects") {
      tracks.push({
        entity_id: constraint.entity_id,
        kind: "connector_follow",
        from_entity_id: constraint.from_entity_id,
        to_entity_id: constraint.to_entity_id,
        evidence: constraint.evidence,
      });
    }
  }

  return tracks;
}

function entityGeometryById(geometry: CompiledEntityGeometry[], id: string) {
  return geometry.find((item) => item.entity_id === id) ?? null;
}

function average(points: Vec3[], fallback: Vec3): Vec3 {
  if (!points.length) return fallback;
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
    points.reduce((sum, point) => sum + point[2], 0) / points.length,
  ];
}

function inferCameraTracks(input: CompileInput, geometry: CompiledEntityGeometry[]): CameraTrack[] {
  return input.beats.map((beat, index) => {
    const storyBeat = input.storyBeats.find((candidate) => text(candidate.id, "") === beat.id) ?? input.storyBeats[index] ?? {};
    const camera = asRecord(storyBeat.camera) ?? {};
    const focusIds = asArray(camera.focus_entity_ids).map(String).filter((id) => input.entities.some((entity) => entity.id === id));
    const focusPositions = focusIds.map((id) => entityGeometryById(geometry, id)?.position).filter((point): point is Vec3 => Boolean(point));
    const target = average(focusPositions, [0, 0, 0]);
    const shotType = text(camera.shot_type, "wide").toLowerCase();
    const movement = text(camera.movement, "follow the active entities");

    const distance = shotType.includes("close") ? 2.8 : shotType.includes("pull") || shotType.includes("wide") ? 5.0 : 3.8;
    const height = shotType.includes("close") ? 1.75 : shotType.includes("wide") ? 3.2 : 2.45;
    const zOffset = movement.toLowerCase().includes("side") || movement.toLowerCase().includes("profile") ? 4.1 : 4.8;

    return {
      beat_id: beat.id,
      shot_type: shotType,
      focus_entity_ids: focusIds.length ? focusIds : beat.active_entity_ids,
      movement,
      target: [target[0], target[1] + 0.08, target[2]],
      wide_position: [target[0] + distance, target[1] + height, target[2] + zOffset],
      close_position: [target[0] + Math.max(1.8, distance * 0.46), target[1] + Math.max(1.35, height * 0.68), target[2] + Math.max(2.2, zOffset * 0.58)],
    };
  });
}

function addFaithfulnessWarnings(input: CompileInput, constraints: SpatialConstraint[], geometry: CompiledEntityGeometry[]) {
  const warnings: string[] = [];
  const allText = fullSceneText(input);
  const inferredTracks = inferMotionTracks(input, constraints);

  for (const constraint of constraints) {
    const entity = entityGeometryById(geometry, constraint.entity_id);
    if (!entity) continue;
    if (constraint.type === "inside") {
      const ref = entityGeometryById(geometry, constraint.reference_entity_id);
      if (ref) {
        const dx = Math.abs(entity.position[0] - ref.position[0]);
        const dz = Math.abs(entity.position[2] - ref.position[2]);
        if (dx > Math.max(0.35, ref.scale[0] * 0.55) || dz > Math.max(0.35, ref.scale[2] * 0.65)) {
          warnings.push(`Directed scene says ${constraint.entity_id} is inside ${constraint.reference_entity_id}, but compiled positions are separated.`);
        }
      }
    }
    if (constraint.type === "above" || constraint.type === "below") {
      const ref = entityGeometryById(geometry, constraint.reference_entity_id);
      if (ref) {
        const delta = entity.position[1] - ref.position[1];
        if (constraint.type === "above" && delta <= 0.15) warnings.push(`Directed scene says ${constraint.entity_id} is above ${constraint.reference_entity_id}, but compiled y-position is not above.`);
        if (constraint.type === "below" && delta >= -0.15) warnings.push(`Directed scene says ${constraint.entity_id} is below ${constraint.reference_entity_id}, but compiled y-position is not below.`);
      }
    }
    if (constraint.type === "connects") {
      if (!entity.connector_from_position || !entity.connector_to_position) {
        warnings.push(`Directed scene says ${constraint.entity_id} connects ${constraint.from_entity_id} to ${constraint.to_entity_id}, but no connector endpoints were resolved.`);
      }
    }
  }

  for (const entity of input.entities) {
    const geometryItem = entityGeometryById(geometry, entity.id);
    if (!geometryItem) continue;
    const combined = entityText(entity);
    const entityTracks = inferredTracks.filter((track) => track.entity_id === entity.id);

    if ((combined.includes("cylinder") || combined.includes("tube") || combined.includes("chamber")) && geometryItem.render_role !== "cylindrical_container") {
      warnings.push(`${entity.id} is described as a cylinder/tube, but the render role is ${geometryItem.render_role}.`);
    }
    if ((combined.includes("wheel") || combined.includes("spoked")) && geometryItem.render_role !== "wheel_body") {
      warnings.push(`${entity.id} is described as a wheel, but the render role is ${geometryItem.render_role}.`);
    }
    if ((combined.includes("piston") || combined.includes("disc") || combined.includes("plug")) && geometryItem.render_role !== "piston_body") {
      warnings.push(`${entity.id} is described as a piston/disc/plug, but the render role is ${geometryItem.render_role}.`);
    }
    if (entityTracks.some((track) => track.kind === "slide") && !["piston_body", "moving_body", "particle_burst", "generic_body", "solid_body"].includes(geometryItem.render_role)) {
      warnings.push(`${entity.id} has directed slide motion, but its render role may not visibly slide.`);
    }
  }

  if ((allText.includes("inside") || allText.includes("above") || allText.includes("below") || allText.includes("connect")) && constraints.length < 2) {
    warnings.push("Directed scene contains spatial language, but the compiler found very few spatial constraints. The render may still be too generic.");
  }

  return Array.from(new Set(warnings));
}

export function compileDirectedSceneRenderPlan(input: CompileInput): DirectedSceneRenderPlan {
  const spatialConstraints = inferSpatialConstraints(input);
  const entityGeometry = resolveEntityGeometry(input, spatialConstraints);
  const motionTracks = inferMotionTracks(input, spatialConstraints);
  const cameraTracks = inferCameraTracks(input, entityGeometry);
  const faithfulnessWarnings = addFaithfulnessWarnings(input, spatialConstraints, entityGeometry);

  return {
    kind: "directed_scene_constraint_plan_v1",
    source: "directed_scene",
    spatial_constraints: spatialConstraints,
    motion_tracks: motionTracks,
    camera_tracks: cameraTracks,
    entity_geometry: entityGeometry,
    faithfulness_warnings: faithfulnessWarnings,
  };
}
