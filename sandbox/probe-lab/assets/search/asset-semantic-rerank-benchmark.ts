export const ASSET_SEMANTIC_RERANK_BENCHMARK_V1_SCHEMA_VERSION =
  "myway_asset_semantic_rerank_benchmark_v1" as const;

export type AssetSemanticRerankBenchmarkCaseV1 = {
  id: string;
  category: string;
  description: string;
  query: Record<string, unknown>;
  accepted_asset_ids: string[];
};

export const ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES: AssetSemanticRerankBenchmarkCaseV1[] = [
  {
    id: "femur_functional_endpoint_vs_intermediary",
    category: "endpoint_vs_intermediary",
    description: "Functional paraphrase should retrieve/rerank the role-fulfilling femur against hip/knee endpoint overlap.",
    query: {
      semantic_name: "bone that carries rotation from the hip down toward the knee",
      visual_role: "rigid structure whose orientation at the hip determines the direction the knee faces",
      semantic_tags: ["hip", "knee", "rotation"],
      anchors: [
        { concept: "hip", role: "context_anchor" },
        { concept: "knee", role: "context_anchor" },
        { concept: "rotation", role: "context_anchor" },
      ],
    },
    accepted_asset_ids: ["left_femur_man_c59baf4d", "right_femur_man_57167925"],
  },
  {
    id: "left_femur_laterality",
    category: "laterality",
    description: "Explicit laterality should distinguish left from right femur.",
    query: {
      semantic_name: "left femur",
      visual_role: "the long bone of the left thigh",
      semantic_tags: ["femur", "thigh", "left"],
      laterality: { value: "left", required: true },
    },
    accepted_asset_ids: ["left_femur_man_c59baf4d"],
  },
  {
    id: "right_fibula_functional",
    category: "functional_paraphrase",
    description: "Functional description of the slender lateral lower-leg bone.",
    query: {
      semantic_name: "slender bone on the outer side of the right lower leg",
      visual_role: "show the lateral long bone beside the shin on the right side",
      semantic_tags: ["lower leg", "lateral", "right"],
      laterality: { value: "right", required: true },
    },
    accepted_asset_ids: ["right_fibula_man_5cc04173"],
  },
  {
    id: "left_humerus_functional",
    category: "functional_paraphrase",
    description: "Upper-arm relationship description should identify left humerus.",
    query: {
      semantic_name: "long bone between the left shoulder and elbow",
      visual_role: "show the rigid upper-arm structure connecting shoulder region toward elbow",
      semantic_tags: ["upper arm", "shoulder", "elbow", "left"],
      laterality: { value: "left", required: true },
    },
    accepted_asset_ids: ["left_humerus_man_15725de2"],
  },
  {
    id: "right_radius_functional",
    category: "functional_paraphrase",
    description: "Thumb-side forearm description should identify right radius.",
    query: {
      semantic_name: "forearm bone on the thumb side of the right arm",
      visual_role: "show the right forearm bone aligned with the thumb side",
      semantic_tags: ["forearm", "thumb side", "right"],
      laterality: { value: "right", required: true },
    },
    accepted_asset_ids: ["right_radius_man_57e3b059"],
  },
  {
    id: "mandible_functional",
    category: "whole_vs_neighbor",
    description: "Lower-jaw function should distinguish mandible from nearby head structures.",
    query: {
      semantic_name: "movable lower jaw bone",
      visual_role: "show the bony lower jaw that carries the lower teeth",
      semantic_tags: ["jaw", "lower jaw", "bone"],
    },
    accepted_asset_ids: ["mandible_man_7fc0bdf0"],
  },
  {
    id: "sacrum_functional",
    category: "functional_paraphrase",
    description: "Base-of-spine/hip relationship should identify sacrum.",
    query: {
      semantic_name: "triangular bone at the base of the spine between the hip bones",
      visual_role: "show the central bony structure linking the spine into the pelvis",
      semantic_tags: ["spine", "pelvis", "hip", "bone"],
    },
    accepted_asset_ids: ["sacrum_man_376343a1"],
  },
  {
    id: "left_ureter_functional",
    category: "source_destination",
    description: "Source-to-destination description should identify left ureter.",
    query: {
      semantic_name: "tube carrying urine from the left kidney toward the bladder",
      visual_role: "show the conduit connecting the left kidney to the urinary bladder",
      semantic_tags: ["kidney", "bladder", "urine", "left"],
      laterality: { value: "left", required: true },
    },
    accepted_asset_ids: ["left_ureter_man_707d1165"],
  },
  {
    id: "right_adrenal_relative_position",
    category: "relative_position",
    description: "Relative-position description should identify right adrenal gland.",
    query: {
      semantic_name: "gland sitting above the right kidney",
      visual_role: "show the endocrine gland positioned superior to the right kidney",
      semantic_tags: ["adrenal", "kidney", "above", "right"],
      laterality: { value: "right", required: true },
    },
    accepted_asset_ids: ["right_adrenal_gland_man_0f64e867"],
  },
  {
    id: "right_twelfth_rib_identity_context",
    category: "specificity",
    description: "Specific ordinal/laterality request should identify the right twelfth rib.",
    query: {
      semantic_name: "twelfth rib on the right side",
      visual_role: "show the lowest numbered rib on the right",
      semantic_tags: ["rib", "twelfth", "right"],
      laterality: { value: "right", required: true },
    },
    accepted_asset_ids: ["right_twelfth_rib_man_1c8a0bea"],
  },
  {
    id: "cricoid_cartilage_functional",
    category: "same_region_distractor",
    description: "Airway-region functional description should identify cricoid cartilage.",
    query: {
      semantic_name: "ring-shaped cartilage at the top of the airway below the voice box",
      visual_role: "show the complete cartilage ring supporting the airway",
      semantic_tags: ["cartilage", "airway", "larynx", "ring"],
    },
    accepted_asset_ids: ["cricoid_cartilage_man_1760e86d"],
  },
  {
    id: "right_cornea_functional",
    category: "part_vs_neighbor",
    description: "Functional eye-surface description should identify right cornea.",
    query: {
      semantic_name: "clear front surface of the right eye",
      visual_role: "show the transparent anterior eye surface that light first passes through",
      semantic_tags: ["eye", "front surface", "transparent", "right"],
      laterality: { value: "right", required: true },
    },
    accepted_asset_ids: ["right_cornea_man_d1f70038"],
  },
];

export function benchmarkFirstAcceptedRank(
  assetIds: string[],
  acceptedAssetIds: string[],
) {
  const accepted = new Set(acceptedAssetIds);
  const index = assetIds.findIndex((assetId) => accepted.has(assetId));
  return index >= 0 ? index + 1 : null;
}

export function benchmarkPercentile(values: number[], percentile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1),
  );
  return Number(sorted[index]!.toFixed(2));
}
