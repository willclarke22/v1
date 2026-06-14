import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type {
  LearningSpaceRelationship,
  LearningSpaceTopic,
  RelationshipViewMode,
} from "@/types/learning-space";
import {
  SEMANTIC_RELATIONSHIP_ARC_SEGMENTS,
  SEMANTIC_RELATIONSHIP_ARC_MIN_OPACITY,
  SEMANTIC_RELATIONSHIP_ARC_BASE_OPACITY,
  SEMANTIC_RELATIONSHIP_ARC_FOCUSED_OPACITY_BOOST,
  SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MIN,
  SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MAX,
  SEMANTIC_RELATIONSHIP_ARC_LIFT_DISTANCE_FACTOR,
  SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX,
  SEMANTIC_RELATIONSHIP_MAX_SCREEN_FRACTION,
  VIEWPOINT_SCANNER_RELATIONSHIP_MAX_COUNT,
  VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX,
  VIEWPOINT_SCANNER_CORE_RADIUS_PX,
  VIEWPOINT_SCANNER_MAX_SCREEN_FRACTION,
  VIEWPOINT_SCANNER_FAR_CORRIDOR_MIN_SCORE,
  VIEWPOINT_SCANNER_MIN_SCORE,
  VIEWPOINT_SCANNER_ACTIVE_TOPIC_BIAS,
  RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MIN,
  RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MAX,
  RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MIN,
  RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MAX,
  RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MIN,
  RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MAX,
  RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS,
  RELATIONSHIP_ARC_TUBE_SEGMENTS,
  RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION,
  VIEWPOINT_SCANNER_BLUE,
  CONFUSION_SIGNAL_RELATIONSHIP_RED,
  INSIGHT_SIGNAL_RELATIONSHIP_GREEN,
  RELATIONSHIP_DEFAULT_ENDPOINT_ACTIVE_COLOR,
  RELATIONSHIP_DEFAULT_ENDPOINT_BACKGROUND_COLOR,
  RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER,
  RELATIONSHIP_ARC_RENDER_ORDER,
  RELATIONSHIP_STENCIL_REF_MIN,
  RELATIONSHIP_STENCIL_REF_MAX,
} from "./constants";
import {
  getAnimatedTopicPosition,
  getProjectedScreenPoint,
  getTopicVisualRadius,
  stableHash,
  clampOpacity,
  type AnimatedTopicPositionsRef,
} from "./geometry-utils";

export type RelationshipArcVariant = "default" | "scanner" | "settled_scan";

export function getRelationshipOtherTopicId(
  relationship: LearningSpaceRelationship,
  topicId: string,
) {
  if (relationship.source_topic_id === topicId)
    return relationship.target_topic_id;
  if (relationship.target_topic_id === topicId)
    return relationship.source_topic_id;
  return null;
}

export function relationshipTouchesTopic(
  relationship: LearningSpaceRelationship,
  topicId: string | null,
) {
  if (!topicId) return false;

  return (
    relationship.source_topic_id === topicId ||
    relationship.target_topic_id === topicId
  );
}

export function isSemanticSimilarityRelationship(
  relationship: LearningSpaceRelationship,
) {
  return relationship.relationship_type === "semantic_similarity";
}

export function isConfusionSignalRelationship(
  relationship: LearningSpaceRelationship,
) {
  return relationship.relationship_type === "shared_confusion_pattern";
}

export function isInsightSignalRelationship(
  relationship: LearningSpaceRelationship,
) {
  return relationship.relationship_type === "shared_insight_pattern";
}

export function isDiagnosticSignalRelationship(
  relationship: LearningSpaceRelationship,
) {
  return (
    isConfusionSignalRelationship(relationship) ||
    isInsightSignalRelationship(relationship)
  );
}

export function relationshipMatchesViewMode(
  relationship: LearningSpaceRelationship,
  relationshipViewMode: RelationshipViewMode,
) {
  if (relationshipViewMode === "semantic_similarity") {
    return isSemanticSimilarityRelationship(relationship);
  }

  if (relationshipViewMode === "confusion") {
    return isConfusionSignalRelationship(relationship);
  }

  if (relationshipViewMode === "insight") {
    return isInsightSignalRelationship(relationship);
  }

  return false;
}

export function shouldShowRelationshipOnFocus(args: {
  relationship: LearningSpaceRelationship;
  relationshipViewMode: RelationshipViewMode;
  activeTopicId: string;
  topicsById: Map<string, LearningSpaceTopic>;
}) {
  const { relationship, relationshipViewMode, activeTopicId, topicsById } = args;

  if (!relationshipMatchesViewMode(relationship, relationshipViewMode)) {
    return false;
  }

  if (!relationshipTouchesTopic(relationship, activeTopicId)) return false;
  if (!topicsById.has(relationship.source_topic_id)) return false;
  if (!topicsById.has(relationship.target_topic_id)) return false;

  return relationship.display_policy?.show_on_focus !== false;
}

export function getRelationshipSortScore(relationship: LearningSpaceRelationship) {
  const priority = Number.isFinite(relationship.display_policy?.priority)
    ? relationship.display_policy.priority
    : 0;
  const strength = Number.isFinite(relationship.strength)
    ? relationship.strength
    : 0;
  const confidence = Number.isFinite(relationship.confidence)
    ? relationship.confidence
    : 0;
  const similarity =
    typeof relationship.basis?.similarity === "number" &&
    Number.isFinite(relationship.basis.similarity)
      ? relationship.basis.similarity
      : 0;

  return priority * 4 + strength * 2 + confidence + similarity;
}

export function getRelationshipLineStrength(relationship: LearningSpaceRelationship) {
  if (
    typeof relationship.strength === "number" &&
    Number.isFinite(relationship.strength)
  ) {
    return THREE.MathUtils.clamp(relationship.strength, 0, 1);
  }

  if (
    typeof relationship.basis?.similarity === "number" &&
    Number.isFinite(relationship.basis.similarity)
  ) {
    return THREE.MathUtils.clamp(relationship.basis.similarity, 0, 1);
  }

  return 0.4;
}

export function getRelationshipTubeRadius(args: {
  variant: RelationshipArcVariant;
  strength: number;
}) {
  const strength = THREE.MathUtils.clamp(args.strength, 0, 1);

  /**
   * Relationship values tend to live in a fairly narrow middle range right now,
   * so a stronger shaping curve makes thickness differences readable without
   * making weak relationships disappear.
   */
  const shapedStrength = Math.pow(strength, 0.52);

  if (args.variant === "scanner") {
    return THREE.MathUtils.lerp(
      RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MIN,
      RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MAX,
      shapedStrength,
    );
  }

  if (args.variant === "settled_scan") {
    return THREE.MathUtils.lerp(
      RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MIN,
      RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MAX,
      shapedStrength,
    );
  }

  return THREE.MathUtils.lerp(
    RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MIN,
    RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MAX,
    shapedStrength,
  );
}

export function getRelationshipBaseColor(args: {
  relationship: LearningSpaceRelationship;
  variant: RelationshipArcVariant;
}) {
  if (isConfusionSignalRelationship(args.relationship)) {
    return CONFUSION_SIGNAL_RELATIONSHIP_RED;
  }

  if (isInsightSignalRelationship(args.relationship)) {
    return INSIGHT_SIGNAL_RELATIONSHIP_GREEN;
  }

  if (isSemanticSimilarityRelationship(args.relationship)) {
    return VIEWPOINT_SCANNER_BLUE;
  }

  if (args.variant === "scanner" || args.variant === "settled_scan") {
    return VIEWPOINT_SCANNER_BLUE;
  }

  return "#f8fafc";
}

export function getRelationshipStencilRef(relationshipId: string) {
  const range = RELATIONSHIP_STENCIL_REF_MAX - RELATIONSHIP_STENCIL_REF_MIN + 1;

  return (
    RELATIONSHIP_STENCIL_REF_MIN + (stableHash(relationshipId) % range)
  );
}

export function getRelationshipEndpointVisualRadius(args: {
  topic: LearningSpaceTopic;
  activeTopicId: string;
  isAnyTopicFocused: boolean;
}) {
  const isActiveTopic = args.topic.topic_id === args.activeTopicId;

  return getTopicVisualRadius({
    topic: args.topic,
    isSelected: isActiveTopic,
    isFocused: isActiveTopic && args.isAnyTopicFocused,
    isAnyTopicFocused: args.isAnyTopicFocused,
  });
}


export function getRelationshipEndpointColor(args: {
  topic: LearningSpaceTopic;
  activeTopicId: string;
  isAnyTopicFocused: boolean;
}) {
  const isActiveTopic = args.topic.topic_id === args.activeTopicId;

  if (isActiveTopic) {
    return RELATIONSHIP_DEFAULT_ENDPOINT_ACTIVE_COLOR;
  }

  if (args.isAnyTopicFocused) {
    return "#a1a1aa";
  }

  return RELATIONSHIP_DEFAULT_ENDPOINT_BACKGROUND_COLOR;
}

export function applyRelationshipArcVertexColors(args: {
  geometry: THREE.BufferGeometry;
  startColor: string;
  middleColor: string;
  endColor: string;
}) {
  const startColor = new THREE.Color(args.startColor);
  const middleColor = new THREE.Color(args.middleColor);
  const endColor = new THREE.Color(args.endColor);
  const colorValues: number[] = [];
  const rowLength = RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS + 1;
  const positionAttribute = args.geometry.getAttribute("position");
  const vertexCount = positionAttribute.count;

  for (let index = 0; index < vertexCount; index += 1) {
    const segmentIndex = Math.floor(index / rowLength);
    const u = THREE.MathUtils.clamp(
      segmentIndex / RELATIONSHIP_ARC_TUBE_SEGMENTS,
      0,
      1,
    );
    let color = middleColor.clone();

    if (u < RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION) {
      color = startColor
        .clone()
        .lerp(middleColor, u / RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION);
    } else if (u > 1 - RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION) {
      color = middleColor
        .clone()
        .lerp(
          endColor,
          (u - (1 - RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION)) /
            RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION,
        );
    }

    colorValues.push(color.r, color.g, color.b);
  }

  args.geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colorValues, 3),
  );
}

export function disposeRelationshipGroupChildren(group: THREE.Group) {
  for (const child of [...group.children]) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }

    group.remove(child);
  }
}

export function buildArcPoints(args: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  strength: number;
}) {
  const distance = args.start.distanceTo(args.end);
  const lift =
    Math.min(
      SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MAX,
      Math.max(
        SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MIN,
        distance * SEMANTIC_RELATIONSHIP_ARC_LIFT_DISTANCE_FACTOR,
      ),
    ) *
    (0.82 + Math.max(0, Math.min(1, args.strength)) * 0.18);

  const midpoint = args.start.clone().lerp(args.end, 0.5);
  const control = midpoint.clone().add(new THREE.Vector3(0, lift, 0));
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= SEMANTIC_RELATIONSHIP_ARC_SEGMENTS; index += 1) {
    const t = index / SEMANTIC_RELATIONSHIP_ARC_SEGMENTS;
    const oneMinusT = 1 - t;
    const point = args.start
      .clone()
      .multiplyScalar(oneMinusT * oneMinusT)
      .add(control.clone().multiplyScalar(2 * oneMinusT * t))
      .add(args.end.clone().multiplyScalar(t * t));

    points.push(point);
  }

  return points;
}

export function getCameraAngleRelationshipLegibility(args: {
  camera: THREE.Camera;
  size: { width: number; height: number };
  sourcePosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
}) {
  /**
   * Free-exploration rule: relationships should feel like they appear from the
   * current viewpoint when both endpoints are in front of the camera and the
   * relationship is visually legible in screen space. This is not a hard mode;
   * it is a soft opacity gate driven by camera angle and line of sight.
   */
  const source = getProjectedScreenPoint({
    point: args.sourcePosition,
    camera: args.camera,
    size: args.size,
  });
  const target = getProjectedScreenPoint({
    point: args.targetPosition,
    camera: args.camera,
    size: args.size,
  });

  const sourceInFront = source.z > -1 && source.z < 1;
  const targetInFront = target.z > -1 && target.z < 1;

  if (!sourceInFront || !targetInFront) return 0;

  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const screenDistance = Math.sqrt(dx * dx + dy * dy);
  const screenMax = Math.max(args.size.width, args.size.height);

  const tooCloseFade = THREE.MathUtils.clamp(
    (screenDistance - SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX) /
      SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX,
    0,
    1,
  );
  const tooFarFade = THREE.MathUtils.clamp(
    (screenMax * SEMANTIC_RELATIONSHIP_MAX_SCREEN_FRACTION - screenDistance) /
      Math.max(1, screenMax * 0.22),
    0.18,
    1,
  );

  return tooCloseFade * tooFarFade;
}



export function RelationshipEndpointStencilMask({
  topic,
  activeTopicId,
  isAnyTopicFocused,
  animatedTopicPositionsRef,
  stencilRef,
}: {
  topic: LearningSpaceTopic;
  activeTopicId: string;
  isAnyTopicFocused: boolean;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  stencilRef: number;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const position = getAnimatedTopicPosition(topic, animatedTopicPositionsRef);
    const visualRadius = getRelationshipEndpointVisualRadius({
      topic,
      activeTopicId,
      isAnyTopicFocused,
    });

    mesh.position.copy(position);
    mesh.scale.setScalar(visualRadius * 1.012);
    mesh.renderOrder = RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER;
  });

  return (
    <mesh ref={meshRef} renderOrder={RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        depthTest
        stencilWrite
        stencilRef={stencilRef}
        stencilFunc={THREE.AlwaysStencilFunc}
        stencilFail={THREE.KeepStencilOp}
        stencilZFail={THREE.KeepStencilOp}
        stencilZPass={THREE.ReplaceStencilOp}
      />
    </mesh>
  );
}

export function SemanticRelationshipArc({
  relationship,
  activeTopicId,
  topicsById,
  animatedTopicPositionsRef,
  isAnyTopicFocused,
  hideBecauseUserIsControlling,
  isEnteringProbe,
  variant = "default",
}: {
  relationship: LearningSpaceRelationship;
  activeTopicId: string;
  topicsById: Map<string, LearningSpaceTopic>;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  isAnyTopicFocused: boolean;
  hideBecauseUserIsControlling: boolean;
  isEnteringProbe: boolean;
  variant?: RelationshipArcVariant;
}) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const opacityRef = useRef(0);

  const sourceTopic = topicsById.get(relationship.source_topic_id) ?? null;
  const targetTopic = topicsById.get(relationship.target_topic_id) ?? null;
  const otherTopicId = getRelationshipOtherTopicId(relationship, activeTopicId);

  const strength = getRelationshipLineStrength(relationship);
  const maxOpacity =
    typeof relationship.display_policy?.max_opacity === "number" &&
    Number.isFinite(relationship.display_policy.max_opacity)
      ? relationship.display_policy.max_opacity
      : 0.45;

  const isScannerVariant = variant === "scanner" || variant === "settled_scan";
  const arcColor = getRelationshipBaseColor({ relationship, variant });
  const tubeRadius = getRelationshipTubeRadius({ variant, strength });
  const stencilRef = getRelationshipStencilRef(relationship.relationship_id);

  useFrame(() => {
    const group = groupRef.current;

    if (!group || !sourceTopic || !targetTopic || !otherTopicId) {
      return;
    }

    group.renderOrder = RELATIONSHIP_ARC_RENDER_ORDER;

    const sourcePosition = getAnimatedTopicPosition(
      sourceTopic,
      animatedTopicPositionsRef,
    );
    const targetPosition = getAnimatedTopicPosition(
      targetTopic,
      animatedTopicPositionsRef,
    );

    const arcPoints = buildArcPoints({
      start: sourcePosition,
      end: targetPosition,
      strength,
    });

    const cameraLegibility = getCameraAngleRelationshipLegibility({
      camera,
      size,
      sourcePosition,
      targetPosition,
    });

    const scannerOpacityBoost =
      variant === "scanner" ? 0.18 : variant === "settled_scan" ? 0.1 : 0;
    const scannerLegibilityFloor = isScannerVariant ? 0.42 : 0;
    const effectiveCameraLegibility = Math.max(
      scannerLegibilityFloor,
      cameraLegibility,
    );

    const targetOpacity =
      hideBecauseUserIsControlling || isEnteringProbe
        ? 0
        : clampOpacity(
            Math.min(
              maxOpacity,
              SEMANTIC_RELATIONSHIP_ARC_BASE_OPACITY +
                scannerOpacityBoost +
                strength * 0.32 +
                (isAnyTopicFocused
                  ? SEMANTIC_RELATIONSHIP_ARC_FOCUSED_OPACITY_BOOST
                  : 0),
            ) * effectiveCameraLegibility,
          );

    const alpha = targetOpacity > opacityRef.current ? 0.085 : 0.16;
    opacityRef.current += (targetOpacity - opacityRef.current) * alpha;

    if (opacityRef.current < SEMANTIC_RELATIONSHIP_ARC_MIN_OPACITY) {
      opacityRef.current = targetOpacity === 0 ? 0 : opacityRef.current;
    }

    disposeRelationshipGroupChildren(group);

    if (opacityRef.current <= 0.002 || arcPoints.length < 2) {
      return;
    }

    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(arcPoints),
      RELATIONSHIP_ARC_TUBE_SEGMENTS,
      tubeRadius,
      RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS,
      false,
    );
    applyRelationshipArcVertexColors({
      geometry,
      startColor: getRelationshipEndpointColor({
        topic: sourceTopic,
        activeTopicId,
        isAnyTopicFocused,
      }),
      middleColor: arcColor,
      endColor: getRelationshipEndpointColor({
        topic: targetTopic,
        activeTopicId,
        isAnyTopicFocused,
      }),
    });

    const material = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      vertexColors: true,
      transparent: true,
      opacity: opacityRef.current,

      /**
       * Normal depth handles non-connected topics. The relationship-specific
       * stencil handles only this relationship's two endpoint topics.
       */
      depthTest: true,
      depthWrite: false,
      stencilWrite: false,
      stencilRef,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = RELATIONSHIP_ARC_RENDER_ORDER;
    group.add(mesh);
  });

  useEffect(() => {
    return () => {
      if (groupRef.current) {
        disposeRelationshipGroupChildren(groupRef.current);
      }
    };
  }, []);

  if (!sourceTopic || !targetTopic || !otherTopicId) {
    return null;
  }

  return (
    <>
      <RelationshipEndpointStencilMask
        topic={sourceTopic}
        activeTopicId={activeTopicId}
        isAnyTopicFocused={isAnyTopicFocused}
        animatedTopicPositionsRef={animatedTopicPositionsRef}
        stencilRef={stencilRef}
      />
      <RelationshipEndpointStencilMask
        topic={targetTopic}
        activeTopicId={activeTopicId}
        isAnyTopicFocused={isAnyTopicFocused}
        animatedTopicPositionsRef={animatedTopicPositionsRef}
        stencilRef={stencilRef}
      />
      <group ref={groupRef} renderOrder={RELATIONSHIP_ARC_RENDER_ORDER} />
    </>
  );
}

export function areStringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }

  return true;
}

export function getRelationshipByIdMap(relationships: LearningSpaceRelationship[]) {
  return new Map(
    relationships.map((relationship) => [
      relationship.relationship_id,
      relationship,
    ]),
  );
}

export function getRelationshipListFromIds(args: {
  relationshipIds: string[];
  relationshipsById: Map<string, LearningSpaceRelationship>;
}) {
  return args.relationshipIds
    .map((relationshipId) => args.relationshipsById.get(relationshipId) ?? null)
    .filter((relationship): relationship is LearningSpaceRelationship =>
      Boolean(relationship),
    );
}

export function getScannerRelationshipScore(args: {
  relationship: LearningSpaceRelationship;
  activeTopicId: string;
  topicsById: Map<string, LearningSpaceTopic>;
  camera: THREE.Camera;
  size: { width: number; height: number };
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
}) {
  const activeTopic = args.topicsById.get(args.activeTopicId);
  const otherTopicId = getRelationshipOtherTopicId(
    args.relationship,
    args.activeTopicId,
  );

  if (!activeTopic || !otherTopicId) return null;

  const otherTopic = args.topicsById.get(otherTopicId);
  if (!otherTopic) return null;

  const activePosition = getAnimatedTopicPosition(
    activeTopic,
    args.animatedTopicPositionsRef,
  );
  const otherPosition = getAnimatedTopicPosition(
    otherTopic,
    args.animatedTopicPositionsRef,
  );
  const activeProjected = getProjectedScreenPoint({
    point: activePosition,
    camera: args.camera,
    size: args.size,
  });
  const otherProjected = getProjectedScreenPoint({
    point: otherPosition,
    camera: args.camera,
    size: args.size,
  });

  if (
    activeProjected.z <= -1 ||
    activeProjected.z >= 1 ||
    otherProjected.z <= -1 ||
    otherProjected.z >= 1
  ) {
    return null;
  }

  const screenDx = otherProjected.x - activeProjected.x;
  const screenDy = otherProjected.y - activeProjected.y;
  const screenDistance = Math.sqrt(screenDx * screenDx + screenDy * screenDy);

  const screenMax = Math.max(args.size.width, args.size.height);
  const farCorridorRadius = Math.max(
    VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX,
    screenMax * VIEWPOINT_SCANNER_MAX_SCREEN_FRACTION,
  );

  if (screenDistance > farCorridorRadius) {
    return null;
  }

  const corridorScore = THREE.MathUtils.clamp(
    (farCorridorRadius - screenDistance) /
      Math.max(1, farCorridorRadius - VIEWPOINT_SCANNER_CORE_RADIUS_PX),
    0,
    1,
  );
  const coreBonus =
    screenDistance <= VIEWPOINT_SCANNER_CORE_RADIUS_PX
      ? VIEWPOINT_SCANNER_ACTIVE_TOPIC_BIAS
      : 0;
  const cameraLegibility = getCameraAngleRelationshipLegibility({
    camera: args.camera,
    size: args.size,
    sourcePosition: activePosition,
    targetPosition: otherPosition,
  });
  const relationshipScore = getRelationshipSortScore(args.relationship);
  const normalizedRelationshipScore = THREE.MathUtils.clamp(
    relationshipScore / 8,
    0,
    1,
  );
  const score =
    (normalizedRelationshipScore * 0.55 + corridorScore * 0.45 + coreBonus) *
    Math.max(0.22, cameraLegibility);

  const minimumScore =
    screenDistance > VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX
      ? VIEWPOINT_SCANNER_FAR_CORRIDOR_MIN_SCORE
      : VIEWPOINT_SCANNER_MIN_SCORE;

  if (score < minimumScore) return null;

  return {
    relationship: args.relationship,
    score,
  };
}

export function ViewpointRelationshipScanner({
  activeTopicId,
  relationships,
  topicsById,
  animatedTopicPositionsRef,
  isScanning,
  isEnteringProbe,
  relationshipViewMode,
  onScannerRelationshipIdsChange,
}: {
  activeTopicId: string | null;
  relationships: LearningSpaceRelationship[];
  relationshipViewMode: RelationshipViewMode;
  topicsById: Map<string, LearningSpaceTopic>;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  isScanning: boolean;
  isEnteringProbe: boolean;
  onScannerRelationshipIdsChange: (relationshipIds: string[]) => void;
}) {
  const { camera, size } = useThree();
  const lastRelationshipIdsKeyRef = useRef("");

  useFrame(() => {
    if (!isScanning || isEnteringProbe || !activeTopicId) {
      /**
       * Do not clear scanner ids here. On mouse release, SpaceCanvas copies the
       * latest scanner ids into the settled-scanner state so the blue scanner
       * lines can remain on screen for a few seconds. Clearing from this frame
       * loop creates an extra state transition and can look like a flicker.
       * The next scan is explicitly reset in beginRelationshipScan().
       */
      lastRelationshipIdsKeyRef.current = "";
      return;
    }

    const nextRelationshipIds = relationships
      .filter((relationship) =>
        relationshipMatchesViewMode(relationship, relationshipViewMode),
      )
      .filter((relationship) =>
        relationshipTouchesTopic(relationship, activeTopicId),
      )
      .map((relationship) =>
        getScannerRelationshipScore({
          relationship,
          activeTopicId,
          topicsById,
          camera,
          size,
          animatedTopicPositionsRef,
        }),
      )
      .filter(
        (
          scored,
        ): scored is {
          relationship: LearningSpaceRelationship;
          score: number;
        } => Boolean(scored),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, VIEWPOINT_SCANNER_RELATIONSHIP_MAX_COUNT)
      .map((scored) => scored.relationship.relationship_id);

    const nextKey = nextRelationshipIds.join("|");

    if (nextKey === lastRelationshipIdsKeyRef.current) return;

    lastRelationshipIdsKeyRef.current = nextKey;
    onScannerRelationshipIdsChange(nextRelationshipIds);
  });

  return null;
}
