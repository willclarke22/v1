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
    radius: number;
    surface_noise: number;
    spin_rate: number;
    saturation: number;
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