import type {
  TopicLayoutMetadata,
  TopicPosition3D,
} from "@/lib/learning-space/topic-position";

export type LearningSpaceRelationshipType =
  | "semantic"
  | "shared_confusion"
  | "prerequisite"
  | "strategy"
  | "temporal";

export type LearningSpaceRelationshipVisualStyle =
  | "arc"
  | "thread"
  | "arrow"
  | "halo"
  | "trail";

export type LearningSpaceViewpointType =
  | "overview"
  | "semantic_neighborhood"
  | "confusion_alignment"
  | "prerequisite_chain"
  | "bridge"
  | "growth_path";

export type LearningSpaceRelationshipBasis = {
  /**
   * Continuous relationship score in the relationship's native scale.
   * For semantic relationships, this is usually cosine similarity.
   */
  similarity: number | null;

  /**
   * Similarity normalized inside the current learning-space snapshot.
   * This is useful for ranking/display, but should not replace raw evidence.
   */
  normalized_similarity: number | null;

  /**
   * Optional backend diagnostic target distance for this relationship.
   */
  desired_distance: number | null;

  /**
   * Optional actual 3D/canonical distance after layout.
   */
  actual_distance: number | null;

  /**
   * Human/debug-readable method name for how the relationship was computed.
   */
  diagnostic_method: string | null;
};

export type LearningSpaceRelationshipDisplayPolicy = {
  /**
   * Overview should stay calm. Most relationships should be false here.
   */
  show_in_overview: boolean;

  /**
   * Whether the relationship can appear when either endpoint topic is focused.
   */
  show_on_focus: boolean;

  /**
   * Upper opacity limit the renderer should respect for this relationship.
   */
  max_opacity: number;

  /**
   * Renderer hint only. It does not define the relationship's meaning.
   */
  visual_style: LearningSpaceRelationshipVisualStyle;

  /**
   * Higher priority relationships should be revealed first when the scene is busy.
   */
  priority: number;
};

export type LearningSpaceRelationship = {
  relationship_id: string;
  source_topic_id: string;
  target_topic_id: string;
  relationship_type: LearningSpaceRelationshipType;

  /**
   * Strength is continuous and relationship-specific. For semantic links it is
   * generally derived from embedding similarity.
   */
  strength: number;

  /**
   * Confidence reflects evidence quality, not relationship strength.
   */
  confidence: number;

  /**
   * Short source tags such as topic_label_embedding, shared_diagnosis, attempt.
   */
  evidence_source: string[];

  /**
   * Optional human-facing/debug summary of why this relationship exists.
   */
  evidence_summary: string | null;

  basis: LearningSpaceRelationshipBasis;
  display_policy: LearningSpaceRelationshipDisplayPolicy;
};

export type LearningSpaceViewpointCamera = {
  /**
   * Camera values are optional in early contract phases. A viewpoint can first
   * identify what should be revealed before the frontend knows the exact camera.
   */
  position: TopicPosition3D | null;
  target: TopicPosition3D | null;
  up: TopicPosition3D | null;
  distance: number | null;
};

export type LearningSpaceViewpoint = {
  viewpoint_id: string;
  viewpoint_type: LearningSpaceViewpointType;
  label: string;

  /**
   * Why this viewpoint exists, e.g. reveal semantic neighbors or align confusion.
   */
  intent: string;

  focus_topic_ids: string[];
  relationship_ids: string[];
  camera: LearningSpaceViewpointCamera;

  relationship_filter: {
    relationship_types: LearningSpaceRelationshipType[];
    max_visible_relationships: number;
  };

  explanation: string | null;
};

export type LearningSpaceProjectionMetadata = {
  projection_id: string;
  projection_method: string;
  dimensionality: 2 | 3;

  /**
   * What evidence sources shaped this projection.
   */
  relationship_basis: string[];

  generated_at: string | null;
  confidence: number | null;
  notes: string[];
};

export type LearningSpaceTopic = {
  topic_id: string;
  topic_label: string;

  /**
   * Renderer-safe current committed visual position.
   */
  position: TopicPosition3D;

  /**
   * Layout metadata for debugging and future animation/commit behavior.
   * The renderer may inspect this, but it should not become the source of truth.
   */
  layout: TopicLayoutMetadata;

  render_state: {
    /**
     * Visible sphere radius. This controls the rendered body size.
     */
    radius: number;

    /**
     * Minimum world-space clearance the layout/renderer should reserve for this
     * topic. This may be larger than radius because future shape noise, badges,
     * rings, probe markers, local bobbing, and satellites can occupy visual
     * space beyond the sphere.
     */
    collision_radius: number;

    /**
     * Visual roughness/blobiness proxy. Currently derived from confusion.
     */
    surface_noise: number;

    /**
     * Visual activation/motion proxy. This should remain subtle and renderer-safe.
     */
    spin_rate: number;

    /**
     * Visual richness/color-presence proxy. Currently derived from insight.
     */
    saturation: number;

    /**
     * Reserved high-mastery visual state.
     */
    is_star: boolean;
  };

  satellite_count: number;
  satellites: {
    satellite_id: string;
    orbit_angle: number;
    linked_attempt_id: string | null;
  }[];
};

export type LearningSpaceCluster = {
  cluster_id: string;
  cluster_label?: string;
  cluster_centroid: TopicPosition3D;
  member_topic_ids: string[];
};

export type LearningSpace = {
  space_version: "v1";
  topics: LearningSpaceTopic[];
  clusters: LearningSpaceCluster[];

  /**
   * Relationship truth layer. Positions suggest relationships; relationship
   * objects explain which connections should be revealed from viewpoints.
   */
  relationships: LearningSpaceRelationship[];

  /**
   * Camera/intention layer. Viewpoints reveal relationships through purposeful
   * framing rather than always-on graph clutter.
   */
  viewpoints: LearningSpaceViewpoint[];

  /**
   * Debug/contract metadata for how this learning-space projection was created.
   */
  projection: LearningSpaceProjectionMetadata;
};
