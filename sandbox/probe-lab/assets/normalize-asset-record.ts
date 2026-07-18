import type {
  MyWayAssetCollisionBox,
  MyWayAssetContactRegion,
  MyWayAssetGeometryProfileV1,
  MyWayAssetInteriorVolume,
  MyWayAssetObjectComposition,
  MyWayAssetRecord,
  MyWayAssetSemanticReviewStatus,
  MyWayAssetStorageProvider,
  MyWayAssetSupportSurface,
  Vec3,
} from "./asset-types";

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [0, 1, 2].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number)
      ? number
      : fallback[index];
  }) as Vec3;
}

function numberOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function storageProvider(
  value: unknown,
  fallback: MyWayAssetStorageProvider | null,
) {
  return value === "local" || value === "r2"
    ? value
    : fallback;
}

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizePhrase(value).replace(/\s+/g, "_");
}

function tokens(value: string) {
  return normalizePhrase(value).split(" ").filter(Boolean);
}

function singular(value: string) {
  return value.endsWith("s") && value.length > 4
    ? value.slice(0, -1)
    : value;
}

const TOKEN_EQUIVALENCE_GROUPS = [
  ["mug", "cup"],
  ["sofa", "couch"],
  ["refrigerator", "fridge"],
  ["automobile", "car"],
  ["television", "tv"],
  ["trash", "garbage"],
  ["bin", "can"],
  ["stool", "seat"],
  ["flashlight", "torch"],
  ["sneaker", "shoe"],
] as const;

function equivalentToken(a: string, b: string) {
  return TOKEN_EQUIVALENCE_GROUPS.some(
    (group) =>
      group.includes(a as never) &&
      group.includes(b as never),
  );
}

function tokenMatches(a: string, b: string) {
  if (a === b) return true;

  const left = singular(a);
  const right = singular(b);
  if (left === right) return true;
  if (equivalentToken(left, right)) return true;

  return (
    left.length >= 4 &&
    right.length >= 4 &&
    (left.includes(right) || right.includes(left))
  );
}

const IDENTITY_STOP_WORDS = new Set([
  "generic",
  "simple",
  "basic",
  "realistic",
  "small",
  "large",
  "medium",
  "modern",
  "classic",
  "wooden",
  "plastic",
  "metal",
  "outdoor",
  "indoor",
]);

function identityMatches(
  requested: string,
  sourceName: string | null,
) {
  if (!sourceName) return true;

  const requestedTokens = tokens(requested).filter(
    (token) => !IDENTITY_STOP_WORDS.has(token),
  );
  const sourceTokens = tokens(sourceName);

  if (!requestedTokens.length || !sourceTokens.length) {
    return true;
  }

  const core = requestedTokens.at(-1)!;
  return sourceTokens.some((candidate) =>
    tokenMatches(core, candidate),
  );
}

function objectComposition(
  value: unknown,
): MyWayAssetObjectComposition {
  if (
    value === "single_object" ||
    value === "object_set" ||
    value === "environment_piece" ||
    value === "unknown"
  ) {
    return value;
  }

  // Composition is reviewed metadata. It is not inferred from names because
  // source titles such as "set" and "scene" are not reliable geometry.
  return "unknown";
}

function vec2(
  value: unknown,
  fallback: [number, number],
): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    return fallback;
  }

  return [0, 1].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number)
      ? number
      : fallback[index];
  }) as [number, number];
}

function normalizedDirection(
  value: unknown,
  fallback: Vec3,
): Vec3 {
  const result = vec3(value, fallback);
  const length = Math.hypot(
    result[0],
    result[1],
    result[2],
  );

  if (length <= 1e-9) return fallback;

  return result.map(
    (entry) => entry / length,
  ) as Vec3;
}

function supportSurfaces(
  value: unknown,
): MyWayAssetSupportSurface[] {
  const raw = Array.isArray(value) ? value : [];

  return raw
    .map(
      (
        entry,
        index,
      ): MyWayAssetSupportSurface | null => {
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry)
        ) {
          return null;
        }

        const item =
          entry as Record<string, unknown>;
        const id = safeAssetId(
          String(
            item.id ?? `surface_${index + 1}`,
          ),
        );
        if (!id) return null;

        const legacyHeight = numberOr(
          item.height_ratio,
          1,
        );
        const legacyFootprint = vec2(
          item.footprint_ratio,
          [0.82, 0.82],
        );
        const size = vec2(item.size, [
          Math.max(0.01, legacyFootprint[0]),
          Math.max(0.01, legacyFootprint[1]),
        ]);
        const center = vec3(item.center, [
          0,
          legacyHeight,
          0,
        ]);
        const source =
          item.source === "blender_geometry" ||
          item.source === "runtime_geometry" ||
          item.source === "manual" ||
          item.source === "legacy_ratio"
            ? item.source
            : "legacy_ratio";

        return {
          id,
          label:
            nullableString(item.label) ??
            id.replace(/_/g, " "),
          center,
          normal: normalizedDirection(
            item.normal,
            [0, 1, 0],
          ),
          u_axis: normalizedDirection(
            item.u_axis,
            [1, 0, 0],
          ),
          v_axis: normalizedDirection(
            item.v_axis,
            [0, 0, 1],
          ),
          size: [
            Math.max(0.001, Math.abs(size[0])),
            Math.max(0.001, Math.abs(size[1])),
          ],
          area: Math.max(
            0,
            numberOr(
              item.area,
              Math.abs(size[0] * size[1]),
            ),
          ),
          confidence: Math.max(
            0,
            Math.min(
              1,
              numberOr(
                item.confidence,
                source === "legacy_ratio"
                  ? 0.1
                  : 0.7,
              ),
            ),
          ),
          source,
          height_ratio: Math.max(
            0,
            Math.min(1.5, legacyHeight),
          ),
          footprint_ratio: [
            Math.max(
              0.001,
              Math.min(
                2,
                Math.abs(legacyFootprint[0]),
              ),
            ),
            Math.max(
              0.001,
              Math.min(
                2,
                Math.abs(legacyFootprint[1]),
              ),
            ),
          ],
        };
      },
    )
    .filter(
      (
        entry,
      ): entry is MyWayAssetSupportSurface =>
        Boolean(entry),
    )
    .slice(0, 32);
}

function contactRegion(
  value: unknown,
  bounds: {
    min: Vec3;
    size: Vec3;
    center: Vec3;
  },
): MyWayAssetContactRegion {
  const item =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const size = vec2(item.size, [
    bounds.size[0],
    bounds.size[2],
  ]);

  return {
    id:
      safeAssetId(
        String(item.id ?? "bottom_contact"),
      ) || "bottom_contact",
    center: vec3(item.center, [
      bounds.center[0],
      bounds.min[1],
      bounds.center[2],
    ]),
    normal: normalizedDirection(
      item.normal,
      [0, 1, 0],
    ),
    size: [
      Math.max(0.001, Math.abs(size[0])),
      Math.max(0.001, Math.abs(size[1])),
    ],
    area: Math.max(
      0,
      numberOr(
        item.area,
        Math.abs(size[0] * size[1]),
      ),
    ),
    confidence: Math.max(
      0,
      Math.min(
        1,
        numberOr(item.confidence, 0.5),
      ),
    ),
  };
}

function collisionBoxes(
  value: unknown,
): MyWayAssetCollisionBox[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(
      (
        entry,
      ): MyWayAssetCollisionBox | null => {
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry)
        ) {
          return null;
        }

        const item =
          entry as Record<string, unknown>;
        const size = vec3(item.size, [
          1,
          1,
          1,
        ]);

        return {
          center: vec3(item.center, [0, 0.5, 0]),
          size: size.map((entry) =>
            Math.max(0.001, Math.abs(entry)),
          ) as Vec3,
          rotation: vec3(
            item.rotation,
            [0, 0, 0],
          ),
        };
      },
    )
    .filter(
      (
        entry,
      ): entry is MyWayAssetCollisionBox =>
        Boolean(entry),
    )
    .slice(0, 16);
}

function interiorVolumes(
  value: unknown,
): MyWayAssetInteriorVolume[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(
      (
        entry,
        index,
      ): MyWayAssetInteriorVolume | null => {
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry)
        ) {
          return null;
        }

        const item =
          entry as Record<string, unknown>;
        const size = vec3(
          item.size,
          [1, 1, 1],
        );

        return {
          id:
            safeAssetId(
              String(
                item.id ??
                  `interior_${index + 1}`,
              ),
            ) || `interior_${index + 1}`,
          center: vec3(
            item.center,
            [0, 0.5, 0],
          ),
          size: size.map((entry) =>
            Math.max(0.001, Math.abs(entry)),
          ) as Vec3,
          rotation: vec3(
            item.rotation,
            [0, 0, 0],
          ),
          confidence: Math.max(
            0,
            Math.min(
              1,
              numberOr(item.confidence, 0.5),
            ),
          ),
        };
      },
    )
    .filter(
      (
        entry,
      ): entry is MyWayAssetInteriorVolume =>
        Boolean(entry),
    )
    .slice(0, 16);
}

function geometryProfile(
  value: unknown,
): MyWayAssetGeometryProfileV1 | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (
    item.schema_version !==
    "myway_asset_geometry_profile_v1"
  ) {
    return null;
  }

  const rawBounds =
    item.local_bounds &&
    typeof item.local_bounds === "object" &&
    !Array.isArray(item.local_bounds)
      ? (item.local_bounds as Record<
          string,
          unknown
        >)
      : {};
  const minimum = vec3(
    rawBounds.min,
    [-0.5, 0, -0.5],
  );
  const maximum = vec3(
    rawBounds.max,
    [0.5, 1, 0.5],
  );
  const size = vec3(rawBounds.size, [
    Math.max(0.001, maximum[0] - minimum[0]),
    Math.max(0.001, maximum[1] - minimum[1]),
    Math.max(0.001, maximum[2] - minimum[2]),
  ]).map((entry) =>
    Math.max(0.001, Math.abs(entry)),
  ) as Vec3;
  const center = vec3(rawBounds.center, [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  ]);
  const bounds = {
    min: minimum,
    max: maximum,
    size,
    center,
  };
  const surfaces = supportSurfaces(
    item.support_surfaces,
  );

  return {
    schema_version:
      "myway_asset_geometry_profile_v1",
    coordinate_space:
      "normalized_glb_y_up",
    local_bounds: bounds,
    orientation: {
      up_axis: normalizedDirection(
        (
          item.orientation as
            | Record<string, unknown>
            | undefined
        )?.up_axis,
        [0, 1, 0],
      ),
      forward_axis: normalizedDirection(
        (
          item.orientation as
            | Record<string, unknown>
            | undefined
        )?.forward_axis,
        [0, 0, 1],
      ),
    },
    bottom_contact_region: contactRegion(
      item.bottom_contact_region,
      bounds,
    ),
    support_surfaces: surfaces,
    interior_volumes: interiorVolumes(
      item.interior_volumes,
    ),
    collision_boxes: collisionBoxes(
      item.collision_boxes,
    ),
    generated_at:
      nullableString(item.generated_at) ??
      new Date(0).toISOString(),
    generator:
      nullableString(item.generator) ??
      "unknown",
  };
}

export function safeAssetId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

export function normalizeMyWayAssetRecord(
  raw: unknown,
): MyWayAssetRecord | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const assetId = safeAssetId(
    String(item.asset_id ?? ""),
  );
  const publicPath =
    typeof item.public_path === "string"
      ? item.public_path.trim()
      : "";

  if (!assetId || !publicPath) return null;

  const now = new Date().toISOString();
  const sourceType = [
    "blenderkit",
    "trellis",
    "manual",
    "procedural",
  ].includes(String(item.source_type))
    ? (item.source_type as MyWayAssetRecord["source_type"])
    : "manual";

  const status = [
    "inbox",
    "normalized",
    "approved",
    "rejected",
  ].includes(String(item.status))
    ? (item.status as MyWayAssetRecord["status"])
    : "normalized";

  const sceneReviewStatus = [
    "pending",
    "approved",
    "rejected",
  ].includes(String(item.scene_review_status))
    ? (item.scene_review_status as MyWayAssetRecord["scene_review_status"])
    : "pending";

  const licenseKind = [
    "cc0",
    "royalty_free",
    "self_owned",
    "unknown",
  ].includes(String(item.license_kind))
    ? (item.license_kind as MyWayAssetRecord["license_kind"])
    : "unknown";

  const licenseStatus = [
    "recorded",
    "needs_review",
    "sandbox_only",
    "app_ready",
  ].includes(String(item.license_status))
    ? (item.license_status as MyWayAssetRecord["license_status"])
    : "needs_review";

  const label =
    String(
      item.canonical_label ??
        item.display_name ??
        assetId,
    ).trim() || assetId;
  const displayName =
    String(item.display_name ?? label).trim() ||
    label;
  const requestedConcept =
    nullableString(item.requested_concept) ??
    label;
  const sourceDisplayName =
    nullableString(item.source_display_name) ??
    displayName;

  let semanticReviewStatus:
    MyWayAssetSemanticReviewStatus;

  if (
    item.semantic_review_status === "pending" ||
    item.semantic_review_status === "verified" ||
    item.semantic_review_status === "mismatch" ||
    item.semantic_review_status === "rejected"
  ) {
    semanticReviewStatus =
      item.semantic_review_status;
  } else if (
    sourceType === "blenderkit" &&
    !identityMatches(label, sourceDisplayName)
  ) {
    semanticReviewStatus = "mismatch";
  } else if (sceneReviewStatus === "approved") {
    semanticReviewStatus = "verified";
  } else {
    semanticReviewStatus = "pending";
  }

  const verifiedCanonicalLabel =
    nullableString(item.verified_canonical_label) ??
    (semanticReviewStatus === "verified"
      ? label.toLowerCase()
      : null);
  const verifiedAliases = stringList(
    item.verified_aliases,
  );
  const geometry = geometryProfile(
    item.geometry_profile,
  );
  const affordances = stringList(
    item.affordances,
  );
  if (
    geometry?.support_surfaces.length &&
    !affordances.includes("support_surface")
  ) {
    affordances.push("support_surface");
  }

  const inferredStorageProvider =
    /^https?:\/\//i.test(publicPath)
      ? "r2"
      : "local";

  return {
    asset_id: assetId,
    canonical_label: label.toLowerCase(),
    display_name: displayName,
    aliases: stringList(item.aliases),
    semantic_tags: stringList(item.semantic_tags),
    style_tags: stringList(item.style_tags),
    asset_type:
      item.asset_type === "gltf" ||
      item.asset_type === "primitive"
        ? item.asset_type
        : "glb",
    domain:
      String(item.domain ?? "generic")
        .trim()
        .toLowerCase() || "generic",

    requested_concept: requestedConcept,
    source_display_name: sourceDisplayName,
    verified_canonical_label:
      verifiedCanonicalLabel?.toLowerCase() ?? null,
    verified_aliases: verifiedAliases,
    semantic_review_status: semanticReviewStatus,
    semantic_reviewed_at: nullableString(
      item.semantic_reviewed_at,
    ),
    semantic_review_notes: nullableString(
      item.semantic_review_notes,
    ),
    object_composition: objectComposition(
      item.object_composition,
    ),
    contains: stringList(item.contains),
    affordances,
    support_surfaces:
      geometry?.support_surfaces ??
      supportSurfaces(item.support_surfaces),
    geometry_profile: geometry,
    preferred_for_concepts: stringList(
      item.preferred_for_concepts,
    ).map(normalizePhrase),

    source_type: sourceType,
    source_asset_id: nullableString(
      item.source_asset_id,
    ),
    source_prompt: nullableString(item.source_prompt),
    source_url: nullableString(item.source_url),
    source_path: nullableString(item.source_path),

    public_path: publicPath,
    thumbnail_path: nullableString(
      item.thumbnail_path,
    ),
    license_record_path: nullableString(
      item.license_record_path,
    ),

    storage_provider:
      storageProvider(
        item.storage_provider,
        inferredStorageProvider,
      ) ?? inferredStorageProvider,
    storage_object_key: nullableString(
      item.storage_object_key,
    ),
    storage_etag: nullableString(item.storage_etag),
    file_size_bytes: nullableNumber(
      item.file_size_bytes,
    ),

    thumbnail_storage_provider: storageProvider(
      item.thumbnail_storage_provider,
      item.thumbnail_path
        ? /^https?:\/\//i.test(
            String(item.thumbnail_path),
          )
          ? "r2"
          : "local"
        : null,
    ),
    thumbnail_object_key: nullableString(
      item.thumbnail_object_key,
    ),
    thumbnail_etag: nullableString(
      item.thumbnail_etag,
    ),
    thumbnail_file_size_bytes: nullableNumber(
      item.thumbnail_file_size_bytes,
    ),

    source_storage_provider: storageProvider(
      item.source_storage_provider,
      null,
    ),
    source_object_key: nullableString(
      item.source_object_key,
    ),
    source_storage_etag: nullableString(
      item.source_storage_etag,
    ),
    source_file_size_bytes: nullableNumber(
      item.source_file_size_bytes,
    ),
    source_archived_at: nullableString(
      item.source_archived_at,
    ),

    promoted_at: nullableString(item.promoted_at),
    license_review_id: nullableString(
      item.license_review_id,
    ),

    dimensions_m:
      geometry?.local_bounds.size ??
      vec3(
        item.dimensions_m,
        [1, 1, 1],
      ),
    default_scale: Math.max(
      0.0001,
      numberOr(item.default_scale, 1),
    ),
    default_rotation: vec3(
      item.default_rotation,
      [0, 0, 0],
    ),
    ground_offset_m: numberOr(
      item.ground_offset_m,
      0,
    ),
    polygon_count:
      item.polygon_count == null
        ? null
        : Math.max(
            0,
            Math.floor(
              numberOr(item.polygon_count, 0),
            ),
          ),
    rigged: booleanOr(item.rigged, false),
    animation_clips: stringList(
      item.animation_clips,
    ),

    content_hash: nullableString(item.content_hash),
    quality_score: Math.min(
      1,
      Math.max(
        0,
        numberOr(item.quality_score, 0.5),
      ),
    ),
    reuse_count: Math.max(
      0,
      Math.floor(numberOr(item.reuse_count, 0)),
    ),

    license_kind: licenseKind,
    license_status: licenseStatus,
    commercial_use_allowed: booleanOr(
      item.commercial_use_allowed,
      false,
    ),
    raw_redistribution_allowed: booleanOr(
      item.raw_redistribution_allowed,
      false,
    ),
    safe_to_use_in_sandbox: booleanOr(
      item.safe_to_use_in_sandbox,
      false,
    ),
    safe_to_promote_to_app: booleanOr(
      item.safe_to_promote_to_app,
      false,
    ),
    status,

    scene_review_status: sceneReviewStatus,
    scene_reviewed_at: nullableString(
      item.scene_reviewed_at,
    ),
    scene_review_notes: nullableString(
      item.scene_review_notes,
    ),

    notes: nullableString(item.notes),
    created_at:
      nullableString(item.created_at) ?? now,
    updated_at:
      nullableString(item.updated_at) ?? now,
  };
}


