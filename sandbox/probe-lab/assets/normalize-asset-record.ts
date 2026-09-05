import type {
  MyWayAssetAppearanceEmbeddingV1,
  MyWayAssetAppearanceProfileV1,
  MyWayAssetAppearanceViewName,
  MyWayAssetAttachmentRegion,
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
import {
  normalizeAssetAttribution,
} from "./asset-attribution";
import {
  normalizeAssetDirectabilityOverrides,
} from "../directability/asset-directability-contract";
import {
  normalizeAssetIdLike,
  normalizeAssetUid,
  normalizeLegacyAssetIds,
} from "./asset-stable-identity";

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
  return value === "local" ||
    value === "r2_private_pending" ||
    value === "r2"
    ? value
    : fallback;
}


const APPEARANCE_VIEW_NAMES = new Set<MyWayAssetAppearanceViewName>([
  "front_three_quarter",
  "rear_three_quarter",
  "side",
  "elevated_front",
]);

function appearanceProfile(
  value: unknown,
  contentHash: string | null,
): MyWayAssetAppearanceProfileV1 {
  const item =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const storedHash = nullableString(item.content_hash);
  const hashChanged = Boolean(
    contentHash && storedHash && contentHash !== storedHash,
  );
  const rawStatus = item.status;
  const status = hashChanged
    ? "pending"
    : rawStatus === "rendering" ||
        rawStatus === "analyzing" ||
        rawStatus === "ready" ||
        rawStatus === "failed"
      ? rawStatus
      : "pending";
  const analysisViews = Array.isArray(item.analysis_views)
    ? item.analysis_views
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const view = entry as Record<string, unknown>;
          const name = view.name;
          const publicPath = nullableString(view.public_path);
          if (
            typeof name !== "string" ||
            !APPEARANCE_VIEW_NAMES.has(name as MyWayAssetAppearanceViewName) ||
            !publicPath
          ) {
            return null;
          }
          return {
            name: name as MyWayAssetAppearanceViewName,
            public_path: publicPath,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  return {
    schema_version: "myway_asset_appearance_profile_v1",
    status,
    summary: hashChanged ? "" : nullableString(item.summary) ?? "",
    style_descriptors: hashChanged ? [] : stringList(item.style_descriptors),
    design_era: hashChanged ? [] : stringList(item.design_era),
    realism_level: hashChanged ? [] : stringList(item.realism_level),
    shape_language: hashChanged ? [] : stringList(item.shape_language),
    material_treatment: hashChanged ? [] : stringList(item.material_treatment),
    color_palette: hashChanged ? [] : stringList(item.color_palette),
    surface_condition: hashChanged ? [] : stringList(item.surface_condition),
    ornamentation: hashChanged ? [] : stringList(item.ornamentation),
    visual_mood: hashChanged ? [] : stringList(item.visual_mood),
    detail_level: hashChanged ? [] : stringList(item.detail_level),
    scene_compatibility: hashChanged ? [] : stringList(item.scene_compatibility),
    descriptors: hashChanged ? [] : stringList(item.descriptors),
    materials: hashChanged ? [] : stringList(item.materials),
    colors: hashChanged ? [] : stringList(item.colors),
    geometry: hashChanged ? [] : stringList(item.geometry),
    warnings: hashChanged ? [] : stringList(item.warnings),
    confidence: hashChanged
      ? 0
      : Math.max(0, Math.min(1, numberOr(item.confidence, 0))),
    analysis_views: hashChanged ? [] : analysisViews,
    model: hashChanged ? null : nullableString(item.model),
    prompt_version:
      nullableString(item.prompt_version) ??
      "myway_asset_appearance_prompt_v1",
    render_version:
      nullableString(item.render_version) ??
      "myway_asset_analysis_render_v1",
    content_hash: contentHash,
    analyzed_at: hashChanged ? null : nullableString(item.analyzed_at),
    error: hashChanged ? null : nullableString(item.error),
  };
}

function appearanceEmbedding(
  value: unknown,
): MyWayAssetAppearanceEmbeddingV1 {
  const item =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawStatus = item.status;

  return {
    schema_version: "myway_asset_appearance_embedding_v1",
    status:
      rawStatus === "ready" || rawStatus === "failed"
        ? rawStatus
        : "pending",
    model:
      nullableString(item.model) ?? "nvidia/nemotron-3-embed-1b",
    dimensions: nullableNumber(item.dimensions),
    vector_key: nullableString(item.vector_key),
    source_text_hash: nullableString(item.source_text_hash),
    embedded_at: nullableString(item.embedded_at),
    error: nullableString(item.error),
  };
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
          region_kind: "support",
          exposure:
            item.exposure === "exterior" ||
            item.exposure === "interior"
              ? item.exposure
              : "unknown",
          orientation:
            item.orientation === "upward" ||
            item.orientation === "vertical" ||
            item.orientation === "downward" ||
            item.orientation === "sloped"
              ? item.orientation
              : "upward",
          openness:
            item.openness === "open" ||
            item.openness === "enclosed"
              ? item.openness
              : "unknown",
          vertical_rank: Math.max(
            0,
            Math.round(
              numberOr(item.vertical_rank, index),
            ),
          ),
          clearance_above_m:
            item.clearance_above_m == null
              ? null
              : Math.max(
                  0,
                  numberOr(item.clearance_above_m, 0),
                ),
          blocked_fraction: Math.max(
            0,
            Math.min(
              1,
              numberOr(item.blocked_fraction, 0),
            ),
          ),
          enclosure_confidence: Math.max(
            0,
            Math.min(
              1,
              numberOr(item.enclosure_confidence, 0),
            ),
          ),
          edge_margin_m: Math.max(
            0,
            numberOr(item.edge_margin_m, 0.01),
          ),
          usable_size: (() => {
            const usable = vec2(item.usable_size, size);
            return [
              Math.max(0.001, Math.abs(usable[0])),
              Math.max(0.001, Math.abs(usable[1])),
            ] as [number, number];
          })(),
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
          coverage_ratio: Math.max(
            0,
            Math.min(
              1,
              numberOr(item.coverage_ratio, 1),
            ),
          ),
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
          id: nullableString(item.id) ?? undefined,
          label: nullableString(item.label) ?? undefined,
          center: vec3(item.center, [0, 0.5, 0]),
          size: size.map((entry) =>
            Math.max(0.001, Math.abs(entry)),
          ) as Vec3,
          rotation: vec3(
            item.rotation,
            [0, 0, 0],
          ),
          confidence: Math.max(
            0,
            Math.min(1, numberOr(item.confidence, 0.7)),
          ),
          source:
            item.source === "blender_geometry" ||
            item.source === "runtime_geometry" ||
            item.source === "manual" ||
            item.source === "legacy_ratio"
              ? item.source
              : "blender_geometry",
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
          label: nullableString(item.label) ?? undefined,
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
          source:
            item.source === "manual" ||
            item.source === "runtime_geometry"
              ? item.source
              : "blender_geometry",
          exposure:
            item.exposure === "exterior"
              ? "exterior"
              : "interior",
          openness:
            item.openness === "open"
              ? "open"
              : item.openness === "enclosed"
                ? "enclosed"
                : "unknown",
          access_direction: normalizedDirection(
            item.access_direction,
            [0, 1, 0],
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

function attachmentRegions(
  value: unknown,
): MyWayAssetAttachmentRegion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index): MyWayAssetAttachmentRegion | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const item = entry as Record<string, unknown>;
      const size = vec2(item.size, [1, 1]);
      const side =
        item.side === "left" ||
        item.side === "right" ||
        item.side === "front" ||
        item.side === "back" ||
        item.side === "top" ||
        item.side === "bottom"
          ? item.side
          : "unknown";

      return {
        id:
          safeAssetId(String(item.id ?? `attachment_${index + 1}`)) ||
          `attachment_${index + 1}`,
        label: nullableString(item.label) ?? `Attachment region ${index + 1}`,
        center: vec3(item.center, [0, 0.5, 0]),
        normal: normalizedDirection(item.normal, [0, 0, 1]),
        u_axis: normalizedDirection(item.u_axis, [1, 0, 0]),
        v_axis: normalizedDirection(item.v_axis, [0, 1, 0]),
        size: [
          Math.max(0.001, Math.abs(size[0])),
          Math.max(0.001, Math.abs(size[1])),
        ],
        confidence: Math.max(
          0,
          Math.min(1, numberOr(item.confidence, 0.5)),
        ),
        source:
          item.source === "manual" ||
          item.source === "runtime_geometry"
            ? item.source
            : "blender_geometry",
        exposure:
          item.exposure === "interior" ? "interior" : "exterior",
        orientation:
          item.orientation === "upward" ||
          item.orientation === "downward" ||
          item.orientation === "sloped"
            ? item.orientation
            : "vertical",
        side,
      };
    })
    .filter((entry): entry is MyWayAssetAttachmentRegion => Boolean(entry))
    .slice(0, 24);
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
    attachment_regions: attachmentRegions(
      item.attachment_regions,
    ),
    collision_boxes: collisionBoxes(
      item.collision_boxes,
    ),
    primary_support_surface_id:
      nullableString(
        item.primary_support_surface_id,
      ),
    audit:
      item.audit &&
      typeof item.audit === "object" &&
      !Array.isArray(item.audit)
        ? (() => {
            const audit =
              item.audit as Record<
                string,
                unknown
              >;
            return {
              status:
                audit.status ===
                "review_required"
                  ? "review_required"
                  : "measured",
              confidence: Math.max(
                0,
                Math.min(
                  1,
                  numberOr(
                    audit.confidence,
                    0,
                  ),
                ),
              ),
              warnings: stringList(
                audit.warnings,
              ),
              mesh_object_count: Math.max(
                0,
                Math.round(
                  numberOr(
                    audit.mesh_object_count,
                    0,
                  ),
                ),
              ),
              included_mesh_count: Math.max(
                0,
                Math.round(
                  numberOr(
                    audit.included_mesh_count,
                    0,
                  ),
                ),
              ),
              excluded_mesh_names:
                stringList(
                  audit.excluded_mesh_names,
                ),
              triangle_count: Math.max(
                0,
                Math.round(
                  numberOr(
                    audit.triangle_count,
                    0,
                  ),
                ),
              ),
              support_surface_count:
                Math.max(
                  0,
                  Math.round(
                    numberOr(
                      audit.support_surface_count,
                      surfaces.length,
                    ),
                  ),
                ),
            };
          })()
        : undefined,
    content_hash:
      nullableString(item.content_hash),
    generated_at:
      nullableString(item.generated_at) ??
      new Date(0).toISOString(),
    generator:
      nullableString(item.generator) ??
      "unknown",
  };
}

export function safeAssetId(value: string) {
  return normalizeAssetIdLike(value);
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
    "cc_by",
    "cc_by_4_0",
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
  const attribution = normalizeAssetAttribution(
    item.attribution,
    {
      licenseKind,
      attributionText: nullableString(
        item.attribution_text,
      ),
      assetTitle:
        nullableString(item.asset_title) ??
        displayName,
      creatorName: nullableString(
        item.creator_name,
      ),
      sourceProvider:
        nullableString(item.source_provider) ??
        (sourceDisplayName.includes(":")
          ? sourceDisplayName.split(":")[0]
          : null),
      sourceAssetId: nullableString(
        item.source_asset_id,
      ),
      sourceUrl: nullableString(
        item.source_url,
      ),
      modificationNotice:
        nullableString(
          item.modification_notice,
        ) ??
        ((licenseKind === "cc_by" ||
          licenseKind === "cc_by_4_0") &&
        nullableString(item.notes)
          ? "Processed and normalized for real-time use by MyWay."
          : null),
      downloadedAt: nullableString(
        item.downloaded_at,
      ),
      notes: nullableString(item.notes),
    },
  );

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
  // Geometric support regions are kept in support_surfaces. They do not
  // automatically imply the semantic affordance "support_surface"; a mouse,
  // sculpture, or appliance may contain upward polygons without being a surface
  // that scene composition should place other objects on.
  const affordances = stringList(
    item.affordances,
  );

  const contentHash = nullableString(item.content_hash);
  const normalizedAppearanceProfile = appearanceProfile(
    item.appearance_profile,
    contentHash,
  );
  const normalizedAppearanceEmbedding = appearanceEmbedding(
    item.appearance_embedding,
  );

  const inferredStorageProvider =
    /^https?:\/\//i.test(publicPath)
      ? "r2"
      : "local";

  return {
    asset_id: assetId,
    asset_uid: normalizeAssetUid(
      nullableString(item.asset_uid),
      assetId,
    ),
    legacy_asset_ids: normalizeLegacyAssetIds(
      item.legacy_asset_ids,
      assetId,
    ),
    canonical_label: label.toLowerCase(),
    display_name: displayName,
    aliases: stringList(item.aliases),
    semantic_tags: stringList(item.semantic_tags),
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
    directability_overrides: normalizeAssetDirectabilityOverrides(
      item.directability_overrides,
    ),
    preferred_for_concepts: stringList(
      item.preferred_for_concepts,
    ).map(normalizePhrase),
    appearance_profile: normalizedAppearanceProfile,
    appearance_embedding: normalizedAppearanceEmbedding,

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

    content_hash: contentHash,
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
    attribution,
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

