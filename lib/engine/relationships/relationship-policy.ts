import type {
  LearningSpaceRelationship,
  LearningSpaceRelationshipType,
  LearningSpaceRelationshipVisualStyle,
} from "@/types/learning-space";
import type {
  BuiltTopicRelationshipType,
  RelationshipGraphBuildOptions,
} from "./relationship-types";

export const DEFAULT_RELATIONSHIP_GRAPH_OPTIONS = {
  /**
   * The sidebar now exposes multiple relationship lenses. The global budget
   * needs enough room for semantic/diagnostic relationship types to coexist in
   * the payload, even though only one lens is visible at a time.
   */
  maxRelationships: 72,
  maxRelationshipsPerTopic: 4,
  maxConfusionGap: 0.08,

  /**
   * Insight links are intentionally easier to emit than confusion links for the
   * current visual-testing phase.
   *
   * The confusion/insight model is still being improved, and insight values may
   * be less separated than we ultimately want. These links remain hidden by
   * default and non-layout-affecting; the sidebar Insight view is what reveals
   * them for visual inspection.
   */
  maxInsightGap: 0.14,
  minAverageConfusionForPattern: 0.5,
  minAverageInsightForPattern: 0.38,
  minStrength: 0.58,
  minMessageCountForDiagnosisOnly: 2,
  allowSharedDiagnosisWithSupportingSignals: false,
} satisfies Required<Omit<RelationshipGraphBuildOptions, "generatedAt">>;

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export function normalizeTopicLabel(label: string) {
  return label.trim() || "Untitled Topic";
}

export function makeRelationshipKey(args: {
  relationshipType: LearningSpaceRelationshipType;
  sourceTopicId: string;
  targetTopicId: string;
}) {
  const [a, b] =
    args.sourceTopicId < args.targetTopicId
      ? [args.sourceTopicId, args.targetTopicId]
      : [args.targetTopicId, args.sourceTopicId];

  return `${args.relationshipType}:${a}::${b}`;
}

export function makeRelationshipId(args: {
  relationshipType: LearningSpaceRelationshipType;
  sourceTopicId: string;
  targetTopicId: string;
}) {
  return `rel-${args.relationshipType}-${makeRelationshipKey(args)
    .replace(`${args.relationshipType}:`, "")
    .replaceAll("::", "--")}`;
}

export function defaultAffectsLayout(
  relationshipType: LearningSpaceRelationshipType,
) {
  switch (relationshipType) {
    case "semantic":
    case "semantic_similarity":
    case "same_cluster":
    case "prerequisite":
    case "transfer_bridge":
      return true;
    case "shared_diagnosis":
    case "shared_confusion_pattern":
    case "shared_insight_pattern":
    case "blocks":
    case "analogy":
    case "co_attempted":
    case "content_source_overlap":
    case "shared_confusion":
    case "strategy":
    case "temporal":
    default:
      return false;
  }
}

export function defaultVisibleByDefault(
  relationshipType: LearningSpaceRelationshipType,
  strength: number,
) {
  switch (relationshipType) {
    case "semantic":
    case "semantic_similarity":
      return strength >= 0.92;
    default:
      return false;
  }
}

export function defaultRelationshipVisualStyle(
  relationshipType: LearningSpaceRelationshipType,
): LearningSpaceRelationshipVisualStyle {
  switch (relationshipType) {
    case "blocks":
    case "prerequisite":
      return "arrow";
    case "shared_diagnosis":
    case "shared_confusion_pattern":
    case "shared_insight_pattern":
      return "dashed_line";
    case "semantic":
    case "semantic_similarity":
    case "transfer_bridge":
      return "arc";
    default:
      return "thread";
  }
}

export function relationshipPriority(args: {
  relationshipType: LearningSpaceRelationshipType;
  strength: number;
  confidence: number;
}) {
  const typeBoost =
    args.relationshipType === "semantic" ||
    args.relationshipType === "semantic_similarity"
      ? 0.16
      : args.relationshipType === "shared_insight_pattern"
        ? 0.06
        : args.relationshipType === "shared_diagnosis"
          ? 0.04
          : 0;

  return round4(clamp01(args.strength * 0.74 + args.confidence * 0.2 + typeBoost));
}

export function maxOpacityForRelationship(args: {
  relationshipType: LearningSpaceRelationshipType;
  strength: number;
}) {
  if (
    args.relationshipType === "semantic" ||
    args.relationshipType === "semantic_similarity"
  ) {
    return round4(Math.max(0.16, Math.min(0.74, 0.18 + args.strength * 0.52)));
  }

  return round4(Math.max(0.08, Math.min(0.42, 0.1 + args.strength * 0.28)));
}

export function buildRelationshipDisplayPolicy(args: {
  relationshipType: LearningSpaceRelationshipType;
  strength: number;
  confidence: number;
  affectsLayout?: boolean;
  visibleByDefault?: boolean;
}): LearningSpaceRelationship["display_policy"] {
  const affectsLayout =
    args.affectsLayout ?? defaultAffectsLayout(args.relationshipType);
  const visibleByDefault =
    args.visibleByDefault ??
    defaultVisibleByDefault(args.relationshipType, args.strength);

  return {
    show_in_overview: visibleByDefault,
    show_on_focus: true,
    visible_by_default: visibleByDefault,
    affects_layout: affectsLayout,
    max_opacity: maxOpacityForRelationship({
      relationshipType: args.relationshipType,
      strength: args.strength,
    }),
    visual_style: defaultRelationshipVisualStyle(args.relationshipType),
    priority: relationshipPriority({
      relationshipType: args.relationshipType,
      strength: args.strength,
      confidence: args.confidence,
    }),
  };
}

export function derivedRelationshipEvidenceSource(
  relationshipType: BuiltTopicRelationshipType,
) {
  switch (relationshipType) {
    case "shared_diagnosis":
      return ["topic_diagnosis"];
    case "shared_confusion_pattern":
      return ["topic_confusion_average"];
    case "shared_insight_pattern":
      return ["topic_insight_average"];
  }
}
