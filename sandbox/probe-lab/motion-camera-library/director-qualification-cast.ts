import type { MyWayAssetRecord } from "../assets/asset-types";

export const DIRECTOR_QUALIFICATION_CAST_SLOT_IDS = [
  "character",
  "compact_rigid",
  "small_asymmetric",
  "furniture",
  "small_detail",
  "simple_rigid",
  "irregular_hero",
  "organic_elongated",
  "vehicle",
] as const;

export type DirectorQualificationCastSlotId =
  (typeof DIRECTOR_QUALIFICATION_CAST_SLOT_IDS)[number];

export type DirectorQualificationCastSlot = {
  id: DirectorQualificationCastSlotId;
  label: string;
  purpose: string;
  preferred_asset_ids?: string[];
  concepts: string[];
  /** Maximum number of reviewed real assets kept in this class's rotating pool. */
  pool_size: number;
  /** Plausible real-world reference used only when the existing logical-size library has no better match. */
  physical_reference_extent_m: number;
  /** Comparable display extent used by fair visual auditions so tiny/huge source assets do not create false negatives. */
  presentation_extent_m: number;
};

export const DIRECTOR_QUALIFICATION_CAST: DirectorQualificationCastSlot[] = [
  {
    id: "character",
    label: "Character",
    purpose:
      "Tall, directional, asymmetric actors for framing, entry, tracking, and facing tests.",
    preferred_asset_ids: ["soldier_polyp_ul46oxezyk"],
    concepts: ["soldier", "character", "human", "person", "adult"],
    pool_size: 4,
    physical_reference_extent_m: 1.75,
    presentation_extent_m: 1.7,
  },
  {
    id: "compact_rigid",
    label: "Compact rigid",
    purpose:
      "Compact rigid counterexamples for camera, blocking, and relationship tests.",
    preferred_asset_ids: ["fire_hydrant_bk_mrjsn0wl"],
    concepts: ["fire hydrant", "hydrant", "traffic cone", "compact object", "barrel"],
    pool_size: 4,
    physical_reference_extent_m: 0.85,
    presentation_extent_m: 1.2,
  },
  {
    id: "small_asymmetric",
    label: "Small asymmetric",
    purpose:
      "Small props with readable orientation for lighting, profile, rotation, and emphasis tests.",
    preferred_asset_ids: ["lantern_bk_mrqk238f"],
    concepts: ["lantern", "lamp", "camera", "hair dryer", "tool", "light source"],
    pool_size: 4,
    physical_reference_extent_m: 0.45,
    presentation_extent_m: 1.05,
  },
  {
    id: "furniture",
    label: "Furniture",
    purpose:
      "Front/back-readable furniture for orbit, reveal, angle, placement, and orientation tests.",
    concepts: ["office chair", "chair", "stool", "desk", "table", "furniture"],
    pool_size: 5,
    physical_reference_extent_m: 1.1,
    presentation_extent_m: 1.5,
  },
  {
    id: "small_detail",
    label: "Small detail",
    purpose:
      "Small detailed props for macro, insert, profile, hero, and fine-rotation tests.",
    concepts: ["coffee mug", "mug", "cup", "phone", "book", "bottle", "apple"],
    pool_size: 5,
    physical_reference_extent_m: 0.18,
    presentation_extent_m: 0.95,
  },
  {
    id: "simple_rigid",
    label: "Simple rigid",
    purpose:
      "Simple geometry controls that separate capability failures from complicated asset-shape failures.",
    concepts: ["cardboard box", "box", "crate", "block", "container"],
    pool_size: 5,
    physical_reference_extent_m: 0.65,
    presentation_extent_m: 1.2,
  },
  {
    id: "irregular_hero",
    label: "Irregular hero",
    purpose:
      "Visually rich irregular objects for hero framing, reveal, highlight, and presentation.",
    preferred_asset_ids: ["cheeseburger_ms193r4w"],
    concepts: ["cheeseburger", "burger", "hamburger", "pineapple", "food", "sculpture"],
    pool_size: 5,
    physical_reference_extent_m: 0.3,
    presentation_extent_m: 1.25,
  },
  {
    id: "organic_elongated",
    label: "Organic elongated",
    purpose:
      "Directional organic silhouettes for motion, entry, reveal, profile, and orientation stress.",
    concepts: ["goldfish", "fish", "animal", "bird", "snake"],
    pool_size: 4,
    physical_reference_extent_m: 0.35,
    presentation_extent_m: 1.3,
  },
  {
    id: "vehicle",
    label: "Vehicle",
    purpose:
      "Large horizontal travelling actors for tracking, mounted-camera, framing, and scale stress.",
    concepts: ["race car", "sports car", "automobile", "car", "vehicle", "bicycle", "bike"],
    pool_size: 5,
    physical_reference_extent_m: 4.4,
    presentation_extent_m: 2.15,
  },
];

export function directorQualificationCastSlot(
  id: DirectorQualificationCastSlotId,
) {
  return DIRECTOR_QUALIFICATION_CAST.find((slot) => slot.id === id) ?? null;
}


export type DirectorQualificationMountedCameraHostSuitability = {
  suitable: boolean;
  score: number;
  reason: string;
};

function qualificationAssetSemanticText(
  asset: Pick<
    MyWayAssetRecord,
    | "canonical_label"
    | "display_name"
    | "verified_canonical_label"
    | "aliases"
    | "verified_aliases"
    | "semantic_tags"
    | "contains"
    | "affordances"
    | "preferred_for_concepts"
  >,
) {
  return [
    asset.canonical_label,
    asset.display_name,
    asset.verified_canonical_label ?? "",
    ...(asset.aliases ?? []),
    ...(asset.verified_aliases ?? []),
    ...(asset.semantic_tags ?? []),
    ...(asset.contains ?? []),
    ...(asset.affordances ?? []),
    ...(asset.preferred_for_concepts ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function hasQualificationSemanticTerm(text: string, terms: string[]) {
  return terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
  });
}

/**
 * Suitability gate for the current canonical mounted-camera primitive.
 *
 * The general Vehicle cast intentionally includes bicycles because they are useful
 * tracking counterexamples. A mounted-camera proof is narrower: the current primitive
 * needs a broad, visually continuous host body (hood/deck/body shell) that can remain in
 * the lower frame as a mount reference. Open-frame vehicles should not be scheduled as
 * fake "diversity" until MyWay has a handlebar/fork/rider-specific mount primitive.
 */
export function directorQualificationMountedCameraHostSuitability(
  asset: MyWayAssetRecord,
): DirectorQualificationMountedCameraHostSuitability {
  const semanticText = qualificationAssetSemanticText(asset);
  const openFrameTerms = [
    "bicycle",
    "bike",
    "motorcycle",
    "motorbike",
    "scooter",
    "skateboard",
    "unicycle",
    "tricycle",
  ];
  if (hasQualificationSemanticTerm(semanticText, openFrameTerms)) {
    return {
      suitable: false,
      score: 0,
      reason: "open_frame_vehicle_requires_specialized_mount",
    };
  }

  const bodyHostTerms = [
    "car",
    "automobile",
    "sedan",
    "coupe",
    "suv",
    "supercar",
    "sports car",
    "race car",
    "racecar",
    "truck",
    "pickup",
    "van",
    "bus",
    "hood",
    "bonnet",
    "body shell",
    "bodywork",
  ];
  const bodySemantic = hasQualificationSemanticTerm(semanticText, bodyHostTerms);

  const [rawX, rawY, rawZ] = asset.dimensions_m ?? [0, 0, 0];
  const x = Math.abs(Number(rawX) || 0);
  const y = Math.abs(Number(rawY) || 0);
  const z = Math.abs(Number(rawZ) || 0);
  const longHorizontal = Math.max(x, z);
  const shortHorizontal = Math.min(x, z);
  const height = Math.max(0.001, y);
  const broadBodyGeometry =
    longHorizontal / height >= 1.35 && shortHorizontal / height >= 0.58;

  const score = (bodySemantic ? 100 : 0) + (broadBodyGeometry ? 20 : 0);
  if (score >= 20) {
    return {
      suitable: true,
      score,
      reason: bodySemantic
        ? "body_host_semantics"
        : "broad_body_geometry",
    };
  }

  return {
    suitable: false,
    score,
    reason: "no_canonical_body_mount_reference",
  };
}
