export type LearningSpaceTopic = {
  topic_id: string;
  topic_name: string;
  label?: string;
  position: [number, number, number];
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
  cluster_centroid: [number, number, number];
  member_topic_ids: string[];
};

export type LearningSpace = {
  space_version: "v1";
  topics: LearningSpaceTopic[];
  clusters: LearningSpaceCluster[];
};