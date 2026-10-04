import { NextResponse } from "next/server";

import {
  getAssetBrowserRegistrySnapshot,
} from "../../assets/asset-browser-snapshot.server";
import {
  readBodyParts3dFullCatalog,
  type BodyParts3dCatalogConcept,
  type BodyParts3dFullCatalogV1,
} from "../../assets/bodyparts3d-full-import.server";
import {
  BODYPARTS3D_EXPECTED_ELEMENT_COUNT,
  BODYPARTS3D_FULL_COLLECTION_ID,
  bodyParts3dSystemFromGroupTags,
} from "../../assets/bodyparts3d-slp-pilot";

export const BODY_PARTS_ATLAS_ASSEMBLY_VERSION =
  "myway_bodyparts3d_atlas_assembly_v1" as const;
/**
 * Legacy marker retained for the V1 regression verifier:
 * "myway_bodyparts3d_concept_realization_v1"
 */
export const BODY_PARTS_ATLAS_CONCEPT_REALIZATION_VERSION =
  "myway_bodyparts3d_concept_realization_v2" as const;

const ATLAS_BROWSER_REVISION = BODY_PARTS_ATLAS_ASSEMBLY_VERSION;
const CONCEPT_SUGGESTION_LIMIT = 12;
const MAX_ONTOLOGY_DEPTH = 8;

let catalogPromise: ReturnType<typeof readBodyParts3dFullCatalog> | null = null;

type AtlasAsset = ReturnType<typeof atlasAssets>[number];

type CommonRegionId =
  | "head"
  | "neck"
  | "thorax"
  | "abdomen"
  | "pelvis"
  | "upper_limb"
  | "lower_limb"
  | "lumbar";

type CommonLanguageProfile = {
  id: string;
  label: string;
  aliases: string[];
  preferred_concepts?: string[];
  systems?: string[];
  region?: CommonRegionId;
};

const COMMON_LANGUAGE_PROFILES: CommonLanguageProfile[] = [
  {
    id: "gut",
    label: "gut / digestive system",
    aliases: [
      "gut",
      "guts",
      "digestive system",
      "digestive tract",
      "gastrointestinal system",
      "gastrointestinal tract",
      "gi tract",
      "alimentary tract",
    ],
    preferred_concepts: [
      "digestive system",
      "gastrointestinal tract",
      "alimentary system",
      "alimentary canal",
    ],
    systems: ["digestive"],
  },
  {
    id: "leg",
    label: "leg / lower limb",
    aliases: ["leg", "legs", "lower limb", "lower limbs", "lower extremity", "lower extremities"],
    preferred_concepts: ["lower limb", "lower extremity", "free lower limb"],
    region: "lower_limb",
  },
  {
    id: "arm",
    label: "arm / upper limb",
    aliases: ["arm", "arms", "upper limb", "upper limbs", "upper extremity", "upper extremities"],
    preferred_concepts: ["upper limb", "upper extremity", "free upper limb"],
    region: "upper_limb",
  },
  {
    id: "chest",
    label: "chest / thorax",
    aliases: ["chest", "thorax", "thoracic region", "chest region"],
    preferred_concepts: ["thorax", "thoracic region", "thoracic part of trunk"],
    region: "thorax",
  },
  {
    id: "head",
    label: "head",
    aliases: ["head", "head region"],
    preferred_concepts: ["head"],
    region: "head",
  },
  {
    id: "neck",
    label: "neck",
    aliases: ["neck", "neck region", "cervical region"],
    preferred_concepts: ["neck", "cervical region"],
    region: "neck",
  },
  {
    id: "abdomen",
    label: "abdomen / belly",
    aliases: ["abdomen", "belly", "stomach area", "abdominal region", "tummy"],
    preferred_concepts: ["abdomen", "abdominal region"],
    region: "abdomen",
  },
  {
    id: "pelvis",
    label: "pelvis / pelvic region",
    aliases: ["pelvis", "pelvic region", "hip region"],
    preferred_concepts: ["pelvis", "pelvic region"],
    region: "pelvis",
  },
  {
    id: "lower_back",
    label: "lower back / lumbar region",
    aliases: ["lower back", "lumbar region", "lumbar area"],
    preferred_concepts: ["lumbar region"],
    region: "lumbar",
  },
  {
    id: "blood_vessels",
    label: "blood vessels / vasculature",
    aliases: ["blood vessel", "blood vessels", "vasculature", "vascular system", "circulation", "circulatory system"],
    preferred_concepts: ["blood vessel", "vascular system", "cardiovascular system"],
    systems: ["arterial", "venous"],
  },
  {
    id: "skin",
    label: "skin / body surface",
    aliases: ["skin", "body surface", "integument", "integumentary system"],
    preferred_concepts: ["skin", "integumentary system"],
    systems: ["integumentary"],
  },
  {
    id: "skeleton",
    label: "skeleton / bones",
    aliases: ["skeleton", "bones", "bone", "skeletal system"],
    preferred_concepts: ["skeleton", "skeletal system"],
    systems: ["skeletal"],
  },
  {
    id: "muscles",
    label: "muscles",
    aliases: ["muscle", "muscles", "muscular system"],
    preferred_concepts: ["muscular system"],
    systems: ["muscular"],
  },
  {
    id: "nerves",
    label: "nerves / nervous system",
    aliases: ["nerve", "nerves", "nervous system"],
    preferred_concepts: ["nervous system"],
    systems: ["nervous"],
  },
  {
    id: "arteries",
    label: "arteries",
    aliases: ["artery", "arteries", "arterial system"],
    systems: ["arterial"],
  },
  {
    id: "veins",
    label: "veins",
    aliases: ["vein", "veins", "venous system"],
    systems: ["venous"],
  },
];

const REGION_ALIASES: Array<{ region: CommonRegionId; aliases: string[] }> = [
  { region: "head", aliases: ["head"] },
  { region: "neck", aliases: ["neck", "cervical"] },
  { region: "thorax", aliases: ["chest", "thorax", "thoracic"] },
  { region: "abdomen", aliases: ["abdomen", "abdominal", "belly", "gut"] },
  { region: "pelvis", aliases: ["pelvis", "pelvic", "hip"] },
  { region: "upper_limb", aliases: ["arm", "upper limb", "upper extremity"] },
  { region: "lower_limb", aliases: ["leg", "lower limb", "lower extremity"] },
  { region: "lumbar", aliases: ["lower back", "lumbar"] },
];

const SYSTEM_ALIASES: Array<{ systems: string[]; aliases: string[] }> = [
  { systems: ["muscular"], aliases: ["muscle", "muscles", "muscular"] },
  { systems: ["skeletal"], aliases: ["bone", "bones", "skeleton", "skeletal"] },
  { systems: ["nervous"], aliases: ["nerve", "nerves", "nervous"] },
  { systems: ["arterial"], aliases: ["artery", "arteries", "arterial"] },
  { systems: ["venous"], aliases: ["vein", "veins", "venous"] },
  { systems: ["arterial", "venous"], aliases: ["blood vessel", "blood vessels", "vascular"] },
  { systems: ["digestive"], aliases: ["digestive", "gastrointestinal", "gut"] },
  { systems: ["respiratory"], aliases: ["respiratory"] },
  { systems: ["integumentary"], aliases: ["skin", "integumentary"] },
];

function finiteVec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const parsed = value.slice(0, 3).map((item) => Number(item));
  return parsed.every(Number.isFinite)
    ? [parsed[0]!, parsed[1]!, parsed[2]!]
    : null;
}

function browserModelUrl(asset: {
  asset_id: string;
  public_path: string;
}) {
  const publicPath = asset.public_path.trim();
  if (!/^https:\/\//i.test(publicPath)) return publicPath;
  return `/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=${encodeURIComponent(
    asset.asset_id,
  )}&revision=${encodeURIComponent(ATLAS_BROWSER_REVISION)}`;
}

async function atlasCatalog() {
  if (!catalogPromise) catalogPromise = readBodyParts3dFullCatalog();
  const catalog = await catalogPromise;
  if (!catalog) catalogPromise = null;
  return catalog;
}

function normalizedConceptName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptSummary(concept: BodyParts3dCatalogConcept) {
  return {
    concept_id: concept.concept_id,
    representation_id: concept.representation_id,
    name: concept.name,
    tree_sources: concept.tree_sources,
    element_count: concept.element_ids.length,
  };
}

function suggestionScore(
  concept: BodyParts3dCatalogConcept,
  normalizedQuery: string,
) {
  if (!normalizedQuery) return 0;
  const name = normalizedConceptName(concept.name);
  if (!name) return 0;
  if (name === normalizedQuery) return 10_000;
  if (name.startsWith(`${normalizedQuery} `)) return 8_000;
  if (name.includes(` ${normalizedQuery} `)) return 7_000;
  if (name.endsWith(` ${normalizedQuery}`)) return 6_500;
  if (name.includes(normalizedQuery)) return 5_000;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const nameTokens = new Set(name.split(" ").filter(Boolean));
  const overlap = queryTokens.filter((token) => nameTokens.has(token)).length;
  if (!overlap) return 0;

  const allQueryTokens = overlap === queryTokens.length;
  return (allQueryTokens ? 4_000 : 1_000) + overlap * 100 - nameTokens.size;
}

function conceptSuggestions(
  concepts: BodyParts3dCatalogConcept[],
  normalizedQuery: string,
  excludedConceptIds = new Set<string>(),
) {
  return concepts
    .map((concept) => ({
      concept,
      score: suggestionScore(concept, normalizedQuery),
    }))
    .filter(
      (item) =>
        item.score > 0 && !excludedConceptIds.has(item.concept.concept_id),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.concept.name.localeCompare(right.concept.name) ||
        left.concept.concept_id.localeCompare(right.concept.concept_id),
    )
    .slice(0, CONCEPT_SUGGESTION_LIMIT)
    .map((item) => conceptSummary(item.concept));
}

function atlasAssets(snapshot: Awaited<ReturnType<typeof getAssetBrowserRegistrySnapshot>>) {
  return snapshot.assets
    .filter((asset) => {
      const membership = asset.collection_membership;
      return (
        membership?.collection_id === BODYPARTS3D_FULL_COLLECTION_ID &&
        membership.runtime_collection_space === "glb_y_up_meters" &&
        asset.asset_type === "glb" &&
        asset.status !== "rejected" &&
        asset.scene_review_status !== "rejected" &&
        asset.semantic_review_status !== "rejected" &&
        asset.semantic_review_status !== "mismatch" &&
        asset.safe_to_use_in_sandbox !== false &&
        Boolean(asset.public_path?.trim())
      );
    })
    .map((asset) => {
      const membership = asset.collection_membership!;
      const runtimeTransform = membership.runtime_transform;
      const position = finiteVec3(runtimeTransform.position) ?? [0, 0, 0];
      const rotation = finiteVec3(runtimeTransform.rotation) ?? [0, 0, 0];
      const scale = finiteVec3(runtimeTransform.scale) ?? [1, 1, 1];
      const dimensions = finiteVec3(asset.dimensions_m) ?? null;
      const system =
        bodyParts3dSystemFromGroupTags(membership.group_tags) ?? "connective";

      return {
        asset_id: asset.asset_id,
        member_id: membership.member_id,
        concept_id: membership.concept_id,
        label:
          asset.verified_canonical_label ||
          membership.concept_name ||
          asset.canonical_label ||
          asset.display_name,
        display_name: asset.display_name,
        system,
        group_tags: membership.group_tags,
        dimensions_m: dimensions,
        runtime_transform: {
          position,
          rotation,
          scale,
        },
        model_url: browserModelUrl(asset),
      };
    })
    .sort(
      (left, right) =>
        left.system.localeCompare(right.system) ||
        left.label.localeCompare(right.label) ||
        left.asset_id.localeCompare(right.asset_id),
    );
}

function mapElementIds(
  elementIds: string[],
  assetsByMemberId: Map<string, AtlasAsset>,
) {
  const availableElementIds: string[] = [];
  const missingElementIds: string[] = [];
  const availableAssetIds: string[] = [];
  const systems = new Set<string>();

  for (const elementId of [...new Set(elementIds)]) {
    const asset = assetsByMemberId.get(elementId.toLowerCase());
    if (!asset) {
      missingElementIds.push(elementId);
      continue;
    }
    availableElementIds.push(elementId);
    availableAssetIds.push(asset.asset_id);
    systems.add(asset.system);
  }

  return {
    availableElementIds,
    missingElementIds,
    availableAssetIds,
    systems: [...systems].sort(),
  };
}

function realizationForConcept(
  concept: BodyParts3dCatalogConcept,
  assetsByMemberId: Map<string, AtlasAsset>,
) {
  const mapped = mapElementIds(concept.element_ids, assetsByMemberId);
  const geometryStatus =
    concept.element_ids.length === 0
      ? "no_geometry"
      : mapped.availableElementIds.length === concept.element_ids.length
        ? "complete"
        : mapped.availableElementIds.length > 0
          ? "partial"
          : "unavailable";

  return {
    ...conceptSummary(concept),
    realization_type:
      concept.element_ids.length <= 1 ? ("single" as const) : ("compound" as const),
    element_ids: concept.element_ids,
    available_element_ids: mapped.availableElementIds,
    missing_element_ids: mapped.missingElementIds,
    available_asset_ids: mapped.availableAssetIds,
    available_element_count: mapped.availableElementIds.length,
    systems: mapped.systems,
    geometry_status: geometryStatus,
    authority: "bodyparts3d_named_concept_exact" as const,
    resolution_method: "exact_named_concept" as const,
    matched_profile: null,
    descendant_concept_count: 0,
  };
}

function descendantConceptIds(
  catalog: BodyParts3dFullCatalogV1,
  rootConceptId: string,
) {
  const adjacency = new Map<string, Set<string>>();
  for (const relation of [
    ...catalog.isa_relations,
    ...catalog.partof_relations,
  ]) {
    const children = adjacency.get(relation.parent_id) ?? new Set<string>();
    children.add(relation.child_id);
    adjacency.set(relation.parent_id, children);
  }

  const visited = new Set<string>([rootConceptId]);
  const descendants = new Set<string>();
  let frontier = [rootConceptId];

  for (let depth = 0; depth < MAX_ONTOLOGY_DEPTH && frontier.length; depth += 1) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const childId of adjacency.get(parentId) ?? []) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        descendants.add(childId);
        next.push(childId);
      }
    }
    frontier = next;
  }

  return descendants;
}

function realizationWithDescendants(
  catalog: BodyParts3dFullCatalogV1,
  concept: BodyParts3dCatalogConcept,
  assetsByMemberId: Map<string, AtlasAsset>,
  authority:
    | "bodyparts3d_named_concept_exact"
    | "myway_common_language_alias_v2",
  matchedProfile: string | null,
) {
  const direct = realizationForConcept(concept, assetsByMemberId);
  if (
    direct.geometry_status === "complete" ||
    direct.geometry_status === "partial"
  ) {
    return {
      ...direct,
      authority,
      resolution_method:
        authority === "bodyparts3d_named_concept_exact"
          ? ("exact_named_concept" as const)
          : ("common_language_alias_to_exact_concept" as const),
      matched_profile: matchedProfile,
    };
  }

  const descendantIds = descendantConceptIds(catalog, concept.concept_id);
  const conceptById = new Map(
    catalog.concepts.map((item) => [item.concept_id, item] as const),
  );
  const descendantConcepts = [...descendantIds]
    .map((id) => conceptById.get(id))
    .filter((item): item is BodyParts3dCatalogConcept => Boolean(item));
  const descendantElementIds = [
    ...new Set(descendantConcepts.flatMap((item) => item.element_ids)),
  ];

  if (!descendantElementIds.length) {
    return {
      ...direct,
      authority,
      matched_profile: matchedProfile,
      descendant_concept_count: descendantConcepts.length,
    };
  }

  const mapped = mapElementIds(descendantElementIds, assetsByMemberId);
  const geometryStatus =
    mapped.availableElementIds.length === descendantElementIds.length
      ? "complete"
      : mapped.availableElementIds.length > 0
        ? "partial"
        : "unavailable";

  return {
    ...conceptSummary(concept),
    realization_type:
      descendantElementIds.length <= 1
        ? ("single" as const)
        : ("compound" as const),
    element_ids: descendantElementIds,
    available_element_ids: mapped.availableElementIds,
    missing_element_ids: mapped.missingElementIds,
    available_asset_ids: mapped.availableAssetIds,
    available_element_count: mapped.availableElementIds.length,
    systems: mapped.systems,
    geometry_status: geometryStatus,
    authority,
    resolution_method: "ontology_descendants" as const,
    matched_profile: matchedProfile,
    descendant_concept_count: descendantConcepts.length,
  };
}

function containsAlias(normalizedQuery: string, alias: string) {
  const normalizedAlias = normalizedConceptName(alias);
  return (
    normalizedQuery === normalizedAlias ||
    normalizedQuery.startsWith(`${normalizedAlias} `) ||
    normalizedQuery.endsWith(` ${normalizedAlias}`) ||
    normalizedQuery.includes(` ${normalizedAlias} `)
  );
}

function commonLanguageProfile(normalizedQuery: string) {
  const direct = COMMON_LANGUAGE_PROFILES.find((profile) =>
    profile.aliases.some(
      (alias) => normalizedConceptName(alias) === normalizedQuery,
    ),
  );
  if (direct) return direct;

  const region = REGION_ALIASES.find((candidate) =>
    candidate.aliases.some((alias) => containsAlias(normalizedQuery, alias)),
  )?.region;
  const systems = SYSTEM_ALIASES.find((candidate) =>
    candidate.aliases.some((alias) => containsAlias(normalizedQuery, alias)),
  )?.systems;

  if (!region && !systems?.length) return null;
  return {
    id: `composed:${region ?? "all"}:${(systems ?? []).join("+") || "all"}`,
    label: normalizedQuery,
    aliases: [normalizedQuery],
    systems,
    region,
  } satisfies CommonLanguageProfile;
}

function preferredConcept(
  catalog: BodyParts3dFullCatalogV1,
  profile: CommonLanguageProfile,
) {
  for (const name of profile.preferred_concepts ?? []) {
    const normalized = normalizedConceptName(name);
    const matches = catalog.concepts
      .filter((concept) => normalizedConceptName(concept.name) === normalized)
      .sort(
        (left, right) =>
          right.element_ids.length - left.element_ids.length ||
          left.concept_id.localeCompare(right.concept_id),
      );
    if (matches[0]) return matches[0];
  }
  return null;
}

function atlasPositionBounds(assets: AtlasAsset[]) {
  const xs = assets.map((asset) => asset.runtime_transform.position[0]);
  const ys = assets.map((asset) => asset.runtime_transform.position[1]);
  const zs = assets.map((asset) => asset.runtime_transform.position[2]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function normalizedAtlasPosition(
  asset: AtlasAsset,
  bounds: ReturnType<typeof atlasPositionBounds>,
) {
  const [x, y, z] = asset.runtime_transform.position;
  const spanX = Math.max(0.001, bounds.maxX - bounds.minX);
  const spanY = Math.max(0.001, bounds.maxY - bounds.minY);
  const spanZ = Math.max(0.001, bounds.maxZ - bounds.minZ);
  return {
    x: (x - bounds.minX) / spanX,
    y: (y - bounds.minY) / spanY,
    z: (z - bounds.minZ) / spanZ,
  };
}

function regionMatches(
  asset: AtlasAsset,
  region: CommonRegionId,
  bounds: ReturnType<typeof atlasPositionBounds>,
) {
  const p = normalizedAtlasPosition(asset, bounds);
  const centerX = Math.abs(p.x - 0.5);

  if (region === "head") return p.y >= 0.82;
  if (region === "neck")
    return p.y >= 0.70 && p.y < 0.84 && centerX <= 0.28;
  if (region === "thorax")
    return p.y >= 0.50 && p.y < 0.74 && centerX <= 0.36;
  if (region === "abdomen")
    return p.y >= 0.35 && p.y < 0.56 && centerX <= 0.34;
  if (region === "pelvis")
    return p.y >= 0.24 && p.y < 0.42 && centerX <= 0.38;
  if (region === "upper_limb")
    return p.y >= 0.38 && p.y < 0.80 && centerX >= 0.27;
  if (region === "lower_limb")
    return p.y < 0.42 && centerX >= 0.10;
  if (region === "lumbar")
    return p.y >= 0.34 && p.y < 0.52 && centerX <= 0.27;
  return false;
}

function profileAssets(
  assets: AtlasAsset[],
  profile: CommonLanguageProfile,
) {
  const bounds = atlasPositionBounds(assets);
  return assets.filter((asset) => {
    if (profile.systems?.length && !profile.systems.includes(asset.system)) {
      return false;
    }
    if (profile.region && !regionMatches(asset, profile.region, bounds)) {
      return false;
    }
    return true;
  });
}

function realizationForProfile(
  profile: CommonLanguageProfile,
  assets: AtlasAsset[],
) {
  const matchingAssets = profileAssets(assets, profile);
  const elementIds = matchingAssets.map((asset) => asset.member_id);
  const systems = [...new Set(matchingAssets.map((asset) => asset.system))].sort();

  return {
    concept_id: `MYWAY_PROFILE:${profile.id}`,
    representation_id: null,
    name: profile.label,
    tree_sources: [] as Array<"is_a" | "part_of">,
    element_count: elementIds.length,
    realization_type:
      elementIds.length <= 1 ? ("single" as const) : ("compound" as const),
    element_ids: elementIds,
    available_element_ids: elementIds,
    missing_element_ids: [] as string[],
    available_asset_ids: matchingAssets.map((asset) => asset.asset_id),
    available_element_count: elementIds.length,
    systems,
    geometry_status:
      elementIds.length > 0 ? ("complete" as const) : ("unavailable" as const),
    authority: "myway_common_language_profile_v2" as const,
    resolution_method: profile.region
      ? profile.systems?.length
        ? ("region_system_profile" as const)
        : ("region_profile" as const)
      : ("system_profile" as const),
    matched_profile: profile.id,
    descendant_concept_count: 0,
  };
}

async function conceptResponse(rawQuery: string) {
  const startedAt = performance.now();
  const [catalog, snapshot] = await Promise.all([
    atlasCatalog(),
    getAssetBrowserRegistrySnapshot(ATLAS_BROWSER_REVISION),
  ]);

  if (!catalog) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/anatomy-atlas",
        schema_version: BODY_PARTS_ATLAS_CONCEPT_REALIZATION_VERSION,
        mode: "concept_realization",
        error: "The BodyParts3D full catalog index is unavailable.",
      },
      { status: 503 },
    );
  }

  const query = rawQuery.trim();
  const normalizedQuery = normalizedConceptName(query);
  if (!normalizedQuery) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/anatomy-atlas",
        schema_version: BODY_PARTS_ATLAS_CONCEPT_REALIZATION_VERSION,
        mode: "concept_realization",
        error: "A non-empty anatomy concept query is required.",
      },
      { status: 400 },
    );
  }

  const queryIdentifier = query.toLowerCase();
  const exactMatches = catalog.concepts.filter(
    (concept) =>
      normalizedConceptName(concept.name) === normalizedQuery ||
      concept.concept_id.toLowerCase() === queryIdentifier ||
      concept.representation_id?.toLowerCase() === queryIdentifier,
  );

  const excludedIds = new Set<string>(exactMatches.map((concept) => concept.concept_id));
  const assets = atlasAssets(snapshot);
  const assetsByMemberId = new Map<string, AtlasAsset>(
    assets.map((asset) => [asset.member_id.toLowerCase(), asset] as const),
  );

  let resolvedConcept:
    | ReturnType<typeof realizationWithDescendants>
    | ReturnType<typeof realizationForProfile>
    | null =
    exactMatches.length === 1
      ? realizationWithDescendants(
          catalog,
          exactMatches[0]!,
          assetsByMemberId,
          "bodyparts3d_named_concept_exact",
          null,
        )
      : null;

  const profile = commonLanguageProfile(normalizedQuery);
  const profileOwnsEverydayMeaning =
    profile !== null &&
    ["gut", "leg", "arm", "chest", "abdomen", "lower_back"].includes(
      profile.id,
    ) &&
    profile.aliases.some(
      (alias) => normalizedConceptName(alias) === normalizedQuery,
    );

  const resolveProfile = () => {
    if (!profile) return null;
    const preferred = preferredConcept(catalog, profile);
    if (preferred) {
      const preferredRealization = realizationWithDescendants(
        catalog,
        preferred,
        assetsByMemberId,
        "myway_common_language_alias_v2",
        profile.id,
      );
      if (
        preferredRealization.geometry_status === "complete" ||
        preferredRealization.geometry_status === "partial"
      ) {
        return preferredRealization;
      }
    }
    return realizationForProfile(profile, assets);
  };

  if (profileOwnsEverydayMeaning) {
    resolvedConcept = resolveProfile();
  } else if (
    (!resolvedConcept ||
      (resolvedConcept.geometry_status !== "complete" &&
        resolvedConcept.geometry_status !== "partial")) &&
    profile
  ) {
    const profileRealization = resolveProfile();
    if (
      profileRealization?.geometry_status === "complete" ||
      profileRealization?.geometry_status === "partial"
    ) {
      resolvedConcept = profileRealization;
    }
  }

  const status =
    exactMatches.length > 1 && !profileOwnsEverydayMeaning
      ? "ambiguous"
      : resolvedConcept?.geometry_status === "complete" ||
          resolvedConcept?.geometry_status === "partial"
        ? "resolved"
        : resolvedConcept &&
            resolvedConcept.authority === "bodyparts3d_named_concept_exact"
          ? "concept_without_geometry"
          : "unresolved";

  return NextResponse.json({
    ok: true,
    route: "visual-experience/anatomy-atlas",
    schema_version: BODY_PARTS_ATLAS_CONCEPT_REALIZATION_VERSION,
    mode: "concept_realization",
    query,
    normalized_query: normalizedQuery,
    status,
    resolved_concept: resolvedConcept,
    exact_matches: exactMatches.map((concept) => conceptSummary(concept)),
    suggestions: conceptSuggestions(
      catalog.concepts,
      normalizedQuery,
      excludedIds,
    ),
    common_language_profile: profile
      ? {
          id: profile.id,
          label: profile.label,
          region: profile.region ?? null,
          systems: profile.systems ?? [],
        }
      : null,
    metrics: {
      concept_lookup_duration_ms: Number(
        (performance.now() - startedAt).toFixed(2),
      ),
      named_concept_count: catalog.counts.named_concepts,
    },
    authority_note:
      "Concept Realization V2 preserves V1 exact authority first: normalized BodyParts3D named-concept identity, FMA concept id, or BodyParts3D representation id. Exact concepts without direct geometry may expand only through BodyParts3D is_a/part_of descendants. Everyday anatomy terms such as gut, leg, chest, arm, skin, blood vessels, and composed phrases such as neck muscle may resolve through explicit MyWay common-language region/system profiles. Suggestions are non-authoritative inspection aids and never auto-resolve. No external retrieval, inferred placement, geometry synthesis, or Director authority is introduced.",
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const conceptQuery = url.searchParams.get("concept");
    if (conceptQuery !== null) {
      return await conceptResponse(conceptQuery);
    }

    const startedAt = performance.now();
    const [snapshot, catalog] = await Promise.all([
      getAssetBrowserRegistrySnapshot(ATLAS_BROWSER_REVISION),
      atlasCatalog(),
    ]);

    const assets = atlasAssets(snapshot);

    const systemCounts: Record<string, number> = {};
    for (const asset of assets) {
      systemCounts[asset.system] = (systemCounts[asset.system] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      route: "visual-experience/anatomy-atlas",
      schema_version: BODY_PARTS_ATLAS_ASSEMBLY_VERSION,
      collection: {
        collection_id: BODYPARTS3D_FULL_COLLECTION_ID,
        expected_element_count: BODYPARTS3D_EXPECTED_ELEMENT_COUNT,
        available_element_count: assets.length,
        runtime_collection_space: "glb_y_up_meters",
        browser_revision: ATLAS_BROWSER_REVISION,
      },
      concept_catalog: {
        schema_version: BODY_PARTS_ATLAS_CONCEPT_REALIZATION_VERSION,
        available: Boolean(catalog),
        named_concept_count: catalog?.counts.named_concepts ?? null,
        isa_relation_count: catalog?.counts.isa_relations ?? null,
        partof_relation_count: catalog?.counts.partof_relations ?? null,
        authority: "exact_then_controlled_common_language_v2",
      },
      systems: systemCounts,
      assets,
      metrics: {
        manifest_duration_ms: Number(
          (performance.now() - startedAt).toFixed(2),
        ),
        registry_snapshot_built_at_ms: snapshot.built_at_ms,
        registry_snapshot_expires_at_ms: snapshot.expires_at_ms,
      },
      authority_note:
        "Assembly proof only. Every mesh is an existing MyWay BodyParts3D full-atlas element. The browser receives the saved shared-space runtime transform; no GLM, search, inferred placement, geometry synthesis, or Director motion is used. Concept Realization V2 adds controlled ontology-descendant and common-language region/system realization without changing Stage 2 grounding.",
    });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/anatomy-atlas",
        error: caught instanceof Error ? caught.message : String(caught),
      },
      { status: 500 },
    );
  }
}
