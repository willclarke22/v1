// lib/learning-space/build-learning-space.ts

import type { DiagnosisType } from "@/types/contracts";
import type { DiagnosisState } from "@/lib/learning-space/relationship-graph";
import type {
  AttemptSatellite,
  LearningSpace,
  LearningSpaceProjectionMetadata,
  LearningSpaceRelationship,
  LearningSpaceViewpoint,
  TopicPanelProjection,
  TopicRing,
  TopicSurfaceMarker,
  TopicSurfaceMarkerThumbnailStyle,
} from "@/types/learning-space";
import type {
  TopicPosition3D,
  TopicPositionSource,
} from "@/lib/learning-space/topic-position";
import {
  buildTopicRelationships,
  type RelationshipGraphTopic,
} from "@/lib/learning-space/relationship-graph";

type LearningSpaceInputTopic = {
  id: string;
  topic_label: string;
  diagnosis?: DiagnosisType | null;
  nextStep?: string | null;
  confusion?: number | null;
  insight?: number | null;
  learningScore?: number | null;

  /**
   * Current committed renderer position.
   *
   * Important: this stays in canonical semantic-map units. SpaceCanvas applies
   * renderer-only visual expansion so persisted topic_position values are not
   * polluted by camera/composition scaling.
   */
  position: TopicPosition3D;

  /**
   * Optional semantic target position.
   */
  semanticPosition?: TopicPosition3D | null;
  semanticPositionMethod?: string | null;
  semanticPositionUpdatedAt?: string | null;
  positionSource?: TopicPositionSource | null;

  scale?: number | null;
  messageCount?: number | null;
  hasAvailableProbe?: boolean | null;

  /**
   * Optional engine state transported from topic_json / persistence.
   *
   * These are intentionally loose because buildLearningSpace is a projection
   * boundary. The engine owns the exact diagnosis/probe schema; this file only
   * reads stable fields when present.
   */
  topicJson?: Record<string, unknown> | null;
  diagnosisState?: unknown;
  activeDiagnosisConfidence?: number | null;
  activeProbeContractSnapshot?: unknown;
  nextProbeContractSnapshot?: unknown;
  lastProbeContractSnapshot?: unknown;

  /**
   * Optional global learning-space relationship/viewpoint transport.
   *
   * Bootstrap attaches these to each topic as a convenient transport layer from
   * persisted topic_json -> app Topic[] -> buildLearningSpace(). They are global
   * scene objects, not per-topic-owned objects, so buildLearningSpace dedupes
   * them before emitting the renderer contract.
   */
  learningSpaceRelationships?: LearningSpaceRelationship[] | null;
  learningSpaceViewpoints?: LearningSpaceViewpoint[] | null;
  learningSpaceProjection?: LearningSpaceProjectionMetadata | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function safeNumber(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isDiagnosisState(value: unknown): value is DiagnosisState {
  const record = asRecord(value);

  return Boolean(
    record &&
      typeof record.version === "string" &&
      (typeof record.active_diagnosis === "string" ||
        record.active_diagnosis === null) &&
      record.beliefs &&
      typeof record.beliefs === "object" &&
      !Array.isArray(record.beliefs) &&
      Array.isArray(record.history),
  );
}

function readDiagnosisState(topic: LearningSpaceInputTopic): DiagnosisState | null {
  if (isDiagnosisState(topic.diagnosisState)) {
    return topic.diagnosisState;
  }

  const topicJson = asRecord(topic.topicJson);
  const jsonDiagnosisState = topicJson?.diagnosis_state;

  return isDiagnosisState(jsonDiagnosisState) ? jsonDiagnosisState : null;
}

function readDiagnosisBeliefEntry(args: {
  topic: LearningSpaceInputTopic;
  diagnosis: DiagnosisType | null;
}): Record<string, unknown> | null {
  if (!args.diagnosis) return null;

  const diagnosisState = readDiagnosisState(args.topic);
  const beliefs = asRecord(diagnosisState?.beliefs);

  return asRecord(beliefs?.[args.diagnosis]);
}

function readActiveDiagnosisConfidence(topic: LearningSpaceInputTopic) {
  const diagnosis = topic.diagnosis ?? null;
  const explicit = readNumber(topic.activeDiagnosisConfidence);

  if (explicit !== null) return clamp(explicit, 0, 1);

  const beliefEntry = readDiagnosisBeliefEntry({ topic, diagnosis });
  const confidence = readNumber(beliefEntry?.confidence);

  return confidence !== null ? clamp(confidence, 0, 1) : diagnosis ? 0.55 : null;
}

function readActiveDiagnosisEvidenceCount(topic: LearningSpaceInputTopic) {
  const diagnosis = topic.diagnosis ?? null;
  const beliefEntry = readDiagnosisBeliefEntry({ topic, diagnosis });
  const evidenceCount = readNumber(beliefEntry?.evidence_count);

  return evidenceCount !== null ? Math.max(0, Math.floor(evidenceCount)) : null;
}

function readProbeContractRendererKind(value: unknown): string | null {
  const snapshot = asRecord(value);
  const rendererKind = snapshot?.renderer_kind;

  return typeof rendererKind === "string" && rendererKind.trim()
    ? rendererKind.trim()
    : null;
}

function readBestProbeContractRendererKind(topic: LearningSpaceInputTopic) {
  return (
    readProbeContractRendererKind(topic.activeProbeContractSnapshot) ??
    readProbeContractRendererKind(topic.nextProbeContractSnapshot) ??
    readProbeContractRendererKind(topic.lastProbeContractSnapshot) ??
    readProbeContractRendererKind(topic.topicJson?.next_probe_contract) ??
    readProbeContractRendererKind(topic.topicJson?.last_probe_contract) ??
    readProbeContractRendererKind(topic.topicJson?.next_delivered_probe)
  );
}

function normalizeTopicPosition(topic: LearningSpaceInputTopic): TopicPosition3D {
  return topic.position;
}

function getTopicLabel(topic: LearningSpaceInputTopic) {
  return topic.topic_label.trim() || "Untitled Topic";
}

function getSemanticOrCurrentTarget(topic: LearningSpaceInputTopic): TopicPosition3D {
  return topic.semanticPosition ?? topic.position;
}

function inferLayoutConfidence(topic: LearningSpaceInputTopic) {
  if (!topic.semanticPosition) return 0.35;

  const method = topic.semanticPositionMethod ?? "";
  if (method.includes("semantic") && method.includes("force")) return 0.78;
  if (method.includes("semantic")) return 0.68;
  if (method.includes("seed")) return 0.42;

  return 0.55;
}

function buildMovementPolicy(topic: LearningSpaceInputTopic) {
  const confidence = inferLayoutConfidence(topic);

  return {
    easing: confidence >= 0.7 ? "normal" : "slow",
    max_step_per_update: round(confidence >= 0.7 ? 0.42 : 0.24),
    preserve_user_spatial_memory: true,
  } as const;
}

function buildRenderState(topic: LearningSpaceInputTopic) {
  const learningScore = clamp(safeNumber(topic.learningScore, 0.5), 0, 1);
  const confusion = clamp(safeNumber(topic.confusion, 0.3), 0, 1);
  const insight = clamp(safeNumber(topic.insight, 0.5), 0, 1);
  const baseScale = safeNumber(topic.scale, 0.7);

  /**
   * Radius represents evidence-backed topic development/solidity. It should not
   * explode from one strong interaction; richer evidence_count support can be
   * added once attempts become first-class in the projection.
   */
  const radius = clamp(baseScale * 0.9 + learningScore * 1.0, 0.48, 1.58);

  /**
   * Current visual direction:
   * - topic spheres stay stable, simple, and sphere-like
   * - confusion/diagnosis should show up through external overlays, markers,
   *   rings, lenses, or relationship views instead of permanent deformation
   *
   * Therefore surface_noise is kept near zero even when confusion is high.
   */
  const surfaceNoise = 0;
  const smoothness = 0.96;
  const collisionRadius = radius + 0.26;
  const isStar = learningScore > 0.9 && confusion < 0.15 && insight > 0.65;
  const glowIntensity = isStar
    ? 0.95
    : clamp(insight * 0.72 + learningScore * 0.12 - confusion * 0.18, 0, 0.82);

  const glowSource: "star_state" | "insight" | "none" = isStar
    ? "star_state"
    : glowIntensity > 0.08
      ? "insight"
      : "none";

  return {
    radius: round(radius),
    collision_radius: round(collisionRadius),
    surface_noise: round(surfaceNoise),
    smoothness: round(smoothness),
    spin_rate: round(0.0015 + learningScore * 0.002),
    saturation: round(clamp(0.42 + insight * 0.42, 0.2, 1)),
    is_star: isStar,
    glow_intensity: round(glowIntensity),
    glow_source: glowSource,
  };
}

function buildSatelliteCount(topic: LearningSpaceInputTopic) {
  const messageCount =
    typeof topic.messageCount === "number" && Number.isFinite(topic.messageCount)
      ? topic.messageCount
      : 0;

  /**
   * Keep this capped for scalability. Later, satellites can represent attempts,
   * not raw message count.
   */
  return Math.min(5, Math.max(0, Math.floor(messageCount)));
}

function inferProbeThumbnailStyle(topic: LearningSpaceInputTopic): TopicSurfaceMarkerThumbnailStyle {
  const rendererKind = readBestProbeContractRendererKind(topic);

  if (rendererKind === "drag_drop_match") return "drag_drop_card";
  if (rendererKind === "slider_prediction") return "slider_card";
  if (rendererKind === "multiple_choice") return "choice_card";
  if (rendererKind === "video_checkpoint") return "video_card";
  if (rendererKind === "audio_explanation") return "audio_card";

  const nextStep = (topic.nextStep ?? "").toLowerCase();

  if (nextStep.includes("drag") || nextStep.includes("sort")) return "drag_drop_card";
  if (nextStep.includes("slider") || nextStep.includes("predict")) return "slider_card";
  if (nextStep.includes("choice") || nextStep.includes("choose")) return "choice_card";
  if (nextStep.includes("video")) return "video_card";
  if (nextStep.includes("audio") || nextStep.includes("say")) return "audio_card";

  return "text_card";
}

function buildSurfaceMarkers(topic: LearningSpaceInputTopic): TopicSurfaceMarker[] {
  const markers: TopicSurfaceMarker[] = [];

  if (topic.hasAvailableProbe) {
    const thumbnailStyle = inferProbeThumbnailStyle(topic);

    markers.push({
      marker_id: `${topic.id}-surface-marker-probe`,
      marker_type: "probe_available",
      visible_by_default: true,
      priority: 100,
      surface_anchor: {
        anchor_mode: "sphere_surface",
        normal_hint: [0.36, 0.76, 0.54],
        avoid_label_overlap: true,
      },
      preview: {
        title:
          thumbnailStyle === "slider_card"
            ? "Prediction probe"
            : thumbnailStyle === "drag_drop_card"
              ? "Interactive probe"
              : thumbnailStyle === "choice_card"
                ? "Choice probe"
                : thumbnailStyle === "video_card"
                  ? "Video probe"
                  : thumbnailStyle === "audio_card"
                    ? "Audio probe"
                    : "Probe available",
        thumbnail_style: thumbnailStyle,
        modality:
          thumbnailStyle === "video_card"
            ? "video"
            : thumbnailStyle === "audio_card"
              ? "audio"
              : thumbnailStyle === "drag_drop_card" || thumbnailStyle === "slider_card"
                ? "interactive"
                : "text",
        probe_type: thumbnailStyle === "slider_card" ? "predict" : null,
        short_prompt: topic.nextStep ?? null,
      },
    });
  }

  return markers;
}

function buildRings(_topic: LearningSpaceInputTopic): TopicRing[] {
  /**
   * Ring semantics are intentionally deferred. This keeps the renderer contract
   * ready without forcing UX decisions too early.
   */
  return [];
}

function buildSatellites(
  topic: LearningSpaceInputTopic,
  satelliteCount: number,
): AttemptSatellite[] {
  return Array.from({ length: satelliteCount }, (_, index) => ({
    satellite_id: `${topic.id}-sat-${index}`,
    orbit_angle: (index / Math.max(1, satelliteCount)) * Math.PI * 2,
    linked_attempt_id: null,
  }));
}

function diagnosisPlainLanguage(diagnosis: DiagnosisType | null | undefined) {
  switch (diagnosis) {
    case "recall_gap":
      return "This may need a stronger memory hook or key fact retrieval.";
    case "representation_gap":
      return "The mental model or representation may still be unstable.";
    case "procedure_gap":
      return "The steps or sequence may need to become clearer.";
    case "discrimination_gap":
      return "Similar ideas may still be getting mixed together.";
    case "transfer_gap":
      return "The idea may make sense here but still be hard to apply elsewhere.";
    default:
      return null;
  }
}

function buildTopicPanelProjection(topic: LearningSpaceInputTopic): TopicPanelProjection {
  const confusion = clamp(safeNumber(topic.confusion, 0.3), 0, 1);
  const insight = clamp(safeNumber(topic.insight, 0.5), 0, 1);
  const learningScore = clamp(safeNumber(topic.learningScore, 0.5), 0, 1);
  const diagnosis = topic.diagnosis ?? null;
  const diagnosisConfidence = readActiveDiagnosisConfidence(topic);
  const diagnosisEvidenceCount = readActiveDiagnosisEvidenceCount(topic);

  const currentStateSummary =
    confusion > 0.68
      ? "This topic still looks unstable and may need targeted repair."
      : insight > 0.68 && learningScore > 0.65
        ? "This topic is starting to look coherent and evidence-backed."
        : "This topic is still forming; more evidence will make the state clearer.";

  return {
    current_state_summary: currentStateSummary,
    active_diagnosis: {
      label: diagnosis,
      confidence: diagnosisConfidence,
      plain_language: diagnosisPlainLanguage(diagnosis),
    },
    primary_block: topic.nextStep ?? null,
    next_step: {
      mode: topic.hasAvailableProbe ? "probe" : "clarify",
      text: topic.nextStep ?? null,
      reason: topic.hasAvailableProbe
        ? "A probe is available to gather stronger evidence."
        : "More clarification may help identify the next useful probe.",
    },
    recent_evidence_summary:
      diagnosisEvidenceCount !== null
        ? [
            {
              kind: "probe",
              summary: `${diagnosisEvidenceCount} evidence event(s) currently support the active diagnosis estimate.`,
              strength: diagnosisConfidence,
              timestamp: null,
            },
          ]
        : [],
    why_this_topic_matters: [],
    available_actions: topic.hasAvailableProbe
      ? [
          {
            action_type: "open_probe",
            label: "Open probe",
            priority: 100,
          },
          {
            action_type: "inspect_evidence",
            label: "Inspect evidence",
            priority: 30,
          },
        ]
      : [
          {
            action_type: "ask_clarify",
            label: "Clarify this topic",
            priority: 50,
          },
          {
            action_type: "inspect_evidence",
            label: "Inspect evidence",
            priority: 30,
          },
        ],
  };
}

function buildFallbackProjectionMetadata(): LearningSpaceProjectionMetadata {
  return {
    projection_id: "local_build_learning_space_projection",
    projection_method: "committed_topic_position_passthrough",
    dimensionality: 3,
    relationship_basis: [
      "local_derived_shared_diagnosis",
      "local_derived_shared_confusion_pattern",
      "local_derived_shared_insight_pattern",
    ],
    generated_at: null,
    confidence: null,
    notes: [
      "Local buildLearningSpace fallback: no backend relationship/viewpoint layer was supplied. Positions are committed topic_position values only.",
    ],
  };
}

function normalizeRelationshipForContract(
  relationship: LearningSpaceRelationship,
): LearningSpaceRelationship {
  const visibleByDefault =
    relationship.visible_by_default ??
    relationship.display_policy?.visible_by_default ??
    relationship.display_policy?.show_in_overview ??
    false;

  const affectsLayout =
    relationship.affects_layout ??
    relationship.display_policy?.affects_layout ??
    (relationship.relationship_type === "semantic" ||
      relationship.relationship_type === "semantic_similarity");

  return {
    ...relationship,
    relationship_type:
      relationship.relationship_type === "semantic"
        ? "semantic_similarity"
        : relationship.relationship_type,
    evidence_count: relationship.evidence_count ?? relationship.evidence_source?.length ?? 1,
    affects_layout: affectsLayout,
    visible_by_default: visibleByDefault,
    reasons: relationship.reasons ?? [],
    display_policy: {
      ...relationship.display_policy,
      show_in_overview: relationship.display_policy?.show_in_overview ?? visibleByDefault,
      show_on_focus: relationship.display_policy?.show_on_focus ?? true,
      visible_by_default: visibleByDefault,
      affects_layout: affectsLayout,
      max_opacity: relationship.display_policy?.max_opacity ?? 0.35,
      visual_style: relationship.display_policy?.visual_style ?? "thread",
      priority: relationship.display_policy?.priority ?? relationship.strength,
    },
  };
}

function relationshipSortPriority(relationship: LearningSpaceRelationship) {
  return relationship.display_policy?.priority ?? relationship.strength ?? 0;
}

function relationshipDedupeKey(relationship: LearningSpaceRelationship) {
  const [a, b] =
    relationship.source_topic_id < relationship.target_topic_id
      ? [relationship.source_topic_id, relationship.target_topic_id]
      : [relationship.target_topic_id, relationship.source_topic_id];

  return `${relationship.relationship_type}:${a}::${b}`;
}

function mergeLearningSpaceRelationships(args: {
  transported: LearningSpaceRelationship[];
  derived: LearningSpaceRelationship[];
}) {
  const relationshipsByKey = new Map<string, LearningSpaceRelationship>();

  for (const relationship of [...args.derived, ...args.transported]) {
    const normalized = normalizeRelationshipForContract(relationship);
    const key = relationshipDedupeKey(normalized);
    const existing = relationshipsByKey.get(key);

    if (!existing || relationshipSortPriority(normalized) > relationshipSortPriority(existing)) {
      relationshipsByKey.set(key, normalized);
    }
  }

  return [...relationshipsByKey.values()].sort((a, b) => {
    const priorityA = relationshipSortPriority(a);
    const priorityB = relationshipSortPriority(b);

    if (priorityB !== priorityA) return priorityB - priorityA;
    if (b.strength !== a.strength) return b.strength - a.strength;

    return a.relationship_id.localeCompare(b.relationship_id);
  });
}

function buildLocalDerivedRelationships(
  topics: LearningSpaceInputTopic[],
): LearningSpaceRelationship[] {
  type ExtendedRelationshipGraphTopic = RelationshipGraphTopic & {
    diagnosisState?: DiagnosisState | null;
  };

  const graphTopics: ExtendedRelationshipGraphTopic[] = topics.map((topic) => ({
    id: topic.id,
    topic_label: topic.topic_label,
    diagnosis: topic.diagnosis ?? null,
    confusion: topic.confusion ?? null,
    insight: topic.insight ?? null,
    learningScore: topic.learningScore ?? null,
    position: topic.position,
    semanticPosition: topic.semanticPosition ?? null,
    semanticPositionMethod: topic.semanticPositionMethod ?? null,
    semanticPositionUpdatedAt: topic.semanticPositionUpdatedAt ?? null,
    messageCount: topic.messageCount ?? null,
    diagnosisState: readDiagnosisState(topic),
  }));

  return buildTopicRelationships(graphTopics, {
    generatedAt: new Date().toISOString(),
  }).relationships;
}

function collectLearningSpaceRelationships(
  topics: LearningSpaceInputTopic[],
): LearningSpaceRelationship[] {
  const transported: LearningSpaceRelationship[] = [];

  for (const topic of topics) {
    for (const relationship of topic.learningSpaceRelationships ?? []) {
      transported.push(relationship);
    }
  }

  const derived = buildLocalDerivedRelationships(topics);

  return mergeLearningSpaceRelationships({
    transported,
    derived,
  });
}

function collectLearningSpaceViewpoints(
  topics: LearningSpaceInputTopic[],
): LearningSpaceViewpoint[] {
  const viewpointsById = new Map<string, LearningSpaceViewpoint>();

  for (const topic of topics) {
    for (const viewpoint of topic.learningSpaceViewpoints ?? []) {
      viewpointsById.set(viewpoint.viewpoint_id, viewpoint);
    }
  }

  return [...viewpointsById.values()].sort((a, b) => {
    if (a.viewpoint_type !== b.viewpoint_type) {
      if (a.viewpoint_type === "overview") return -1;
      if (b.viewpoint_type === "overview") return 1;
      if (a.viewpoint_type === "bridge") return -1;
      if (b.viewpoint_type === "bridge") return 1;
    }

    return a.viewpoint_id.localeCompare(b.viewpoint_id);
  });
}

function resolveLearningSpaceProjection(
  topics: LearningSpaceInputTopic[],
): LearningSpaceProjectionMetadata {
  const projection = topics.find(
    (topic) => topic.learningSpaceProjection,
  )?.learningSpaceProjection;

  return projection ?? buildFallbackProjectionMetadata();
}

export function buildLearningSpace(
  topics: LearningSpaceInputTopic[],
): LearningSpace {
  const relationships = collectLearningSpaceRelationships(topics);
  const viewpoints = collectLearningSpaceViewpoints(topics);
  const projection = resolveLearningSpaceProjection(topics);

  return {
    space_version: "v1",
    topics: topics.map((topic) => {
      const topicLabel = getTopicLabel(topic);
      const satelliteCount = buildSatelliteCount(topic);
      const currentPosition = normalizeTopicPosition(topic);
      const renderedTargetPosition = getSemanticOrCurrentTarget(topic);

      return {
        topic_id: topic.id,
        topic_label: topicLabel,
        position: currentPosition,
        layout: {
          position_source: topic.positionSource ?? "topic_position",
          semantic_position: topic.semanticPosition ?? null,
          semantic_position_method: topic.semanticPositionMethod ?? null,
          semantic_position_updated_at: topic.semanticPositionUpdatedAt ?? null,
          current_position: currentPosition,
          rendered_target_position: renderedTargetPosition,
          layout_confidence: round(inferLayoutConfidence(topic)),
          movement_policy: buildMovementPolicy(topic),
        },
        render_state: buildRenderState(topic),
        surface_markers: buildSurfaceMarkers(topic),
        rings: buildRings(topic),
        satellite_count: satelliteCount,
        satellites: buildSatellites(topic, satelliteCount),
        topic_panel: buildTopicPanelProjection(topic),
      };
    }),
    clusters: [],
    relationships,
    viewpoints,
    projection,
  };
}


