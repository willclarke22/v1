import type {
  TopicLayoutMetadata,
  TopicPosition3D,
} from "@/lib/learning-space/topic-position";

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
  cluster_centroid: TopicPosition3D;
  member_topic_ids: string[];
};

export type LearningSpace = {
  space_version: "v1";
  topics: LearningSpaceTopic[];
  clusters: LearningSpaceCluster[];
};
