export const ASSET_DESIGN_BRIEF_SCHEMA_VERSION =
  "myway_asset_design_brief_v2" as const;

export const ASSET_VISUAL_DESCRIPTION_SCHEMA_VERSION =
  "myway_asset_visual_description_v1" as const;

export type AssetVisualDescriptionV1 = {
  schema_version:
    typeof ASSET_VISUAL_DESCRIPTION_SCHEMA_VERSION;
  design_summary: string;
  shape_language: {
    primary_forms: string[];
    edge_character: string;
    symmetry: string;
    detail_density:
      | "low"
      | "medium"
      | "high";
    proportion_emphasis: string[];
  };
  orthographic_views: {
    front: string;
    right: string;
    top: string;
    three_quarter: string;
  };
  overall_dimensions_m:
    | [number, number, number]
    | null;
  normalized_proportions: Array<{
    relationship: string;
    ratio: number;
    tolerance: number;
  }>;
  part_layout: Array<{
    part_id: string;
    shape_description: string;
    dimensions_m:
      | [number, number, number]
      | null;
    position_m:
      | [number, number, number]
      | null;
    rotation_degrees:
      [number, number, number];
    visible_from: string[];
    construction_notes: string[];
  }>;
  material_regions: Array<{
    slot_id: string;
    visible_description: string;
    dominant_color_hex: string | null;
    finish: string;
    mapping_intent: string;
  }>;
  visual_acceptance_tests: string[];
  uncertainty_notes: string[];
};

export const FOUNDRY_ASSET_CLASSES = [
  "hard_surface_assembly",
  "furniture_architecture",
  "mechanical_vehicle",
  "soft_goods_upholstery",
  "layered_organic",
  "plant",
  "educational_anatomy",
  "advanced_organic",
  "character",
  "general",
] as const;

export type FoundryAssetClass =
  (typeof FOUNDRY_ASSET_CLASSES)[number];

export const FOUNDRY_QUALITY_MODES = [
  "draft",
  "standard",
  "hero",
] as const;

export type FoundryQualityMode =
  (typeof FOUNDRY_QUALITY_MODES)[number];

export type AssetDesignPartV2 = {
  part_id: string;
  semantic_role: string;
  geometry_strategy: string[];
  parent_part_id: string | null;
  connection_strategy: string | null;
  material_slot_id: string | null;
  animation_role: string | null;
  pivot_requirement: string | null;
  required: boolean;
  identifying_features: string[];
};

export type AssetMaterialSlotIntentV2 = {
  slot_id: string;
  display_name: string;
  assigned_part_ids: string[];
  material_family: string;
  intent: string;
  semantic_tags: string[];
  color_hint: string | null;
  roughness_hint: string | null;
  metallic_hint: string | null;
  texture_hint?: string | null;
  brightness_hint?: string | null;
  avoid_tags?: string[];
  physical_scale_m: number | null;
  required_maps: Array<
    | "base_color"
    | "roughness"
    | "normal_gl"
    | "metallic"
    | "ambient_occlusion"
    | "height"
    | "opacity"
    | "emission"
  >;
  procedural_fallback: {
    color_rgba: [number, number, number, number];
    metallic: number;
    roughness: number;
  };
};

export type AssetEnvironmentIntentV2 = {
  intent: string;
  semantic_tags: string[];
  preferred_environment_class: string;
  strength: number;
  rotation_degrees: number;
  background_visible: boolean;
};

export type AssetDesignBriefV2 = {
  schema_version:
    typeof ASSET_DESIGN_BRIEF_SCHEMA_VERSION;
  asset_id: string;
  concept: string;
  asset_class: FoundryAssetClass;
  intended_use: string[];
  target_extent_m: number;
  axis_dimensions_m:
    | [number, number, number]
    | null;
  max_triangles: number;
  quality_mode: FoundryQualityMode;
  realism:
    | "diagrammatic"
    | "stylized"
    | "realistic";
  style_tags: string[];
  silhouette: {
    primary_shapes: string[];
    identifying_features: string[];
    important_negative_spaces: string[];
    camera_readability: string[];
  };
  proportions: string[];
  /**
   * A text-authored visual blueprint. Optional on legacy fixtures, but every
   * newly normalized/planned brief receives a complete V1 value.
   */
  visual_description?:
    AssetVisualDescriptionV1;
  parts: AssetDesignPartV2[];
  material_slots:
    AssetMaterialSlotIntentV2[];
  environment:
    AssetEnvironmentIntentV2;
  requirements: {
    uv_required: boolean;
    rig_required: boolean;
    collision_required: boolean;
    ground_contact_required: boolean;
    animation_ready: boolean;
    movable_part_ids: string[];
  };
  acceptance_criteria: string[];
  benchmark_priorities: string[];
};

export type AssetDesignBriefValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const MATERIAL_MAPS =
  new Set<
    AssetMaterialSlotIntentV2[
      "required_maps"
    ][number]
  >([
    "base_color",
    "roughness",
    "normal_gl",
    "metallic",
    "ambient_occlusion",
    "height",
    "opacity",
    "emission",
  ]);

function record(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(
  value: unknown,
  fallback = "",
) {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function cleanId(
  value: unknown,
  fallback: string,
) {
  return (
    text(value)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) ||
    fallback
  );
}

function stringArray(
  value: unknown,
  max = 64,
) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) =>
              text(item),
            )
            .filter(Boolean),
        ),
      ).slice(0, max)
    : [];
}

function numberValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);
  return Number.isFinite(parsed)
    ? Math.max(
        min,
        Math.min(max, parsed),
      )
    : fallback;
}

function nullableNumber(
  value: unknown,
  min: number,
  max: number,
) {
  if (
    value == null ||
    value === ""
  ) {
    return null;
  }
  const parsed =
    Number(value);
  return Number.isFinite(parsed)
    ? Math.max(
        min,
        Math.min(max, parsed),
      )
    : null;
}

function nullableVector3(
  value: unknown,
  min: number,
  max: number,
): [number, number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length < 3
  ) {
    return null;
  }
  const parsed =
    value.slice(0, 3).map(
      (item) => Number(item),
    );
  if (
    parsed.some(
      (item) =>
        !Number.isFinite(item),
    )
  ) {
    return null;
  }
  return parsed.map(
    (item) =>
      Math.max(
        min,
        Math.min(max, item),
      ),
  ) as [number, number, number];
}

function vector3(
  value: unknown,
  fallback:
    [number, number, number],
  min: number,
  max: number,
): [number, number, number] {
  return nullableVector3(
    value,
    min,
    max,
  ) ?? fallback;
}

function rgba(
  value: unknown,
): [number, number, number, number] {
  const values =
    Array.isArray(value)
      ? value
      : [];
  return [
    numberValue(values[0], 0.5, 0, 1),
    numberValue(values[1], 0.5, 0, 1),
    numberValue(values[2], 0.5, 0, 1),
    numberValue(values[3], 1, 0, 1),
  ];
}

function assetClass(
  value: unknown,
): FoundryAssetClass {
  return FOUNDRY_ASSET_CLASSES.includes(
    value as FoundryAssetClass,
  )
    ? value as FoundryAssetClass
    : "general";
}

function qualityMode(
  value: unknown,
  fallback: FoundryQualityMode,
): FoundryQualityMode {
  return FOUNDRY_QUALITY_MODES.includes(
    value as FoundryQualityMode,
  )
    ? value as FoundryQualityMode
    : fallback;
}

function normalizeMaterialSlot(
  value: unknown,
  index: number,
): AssetMaterialSlotIntentV2 {
  const item =
    record(value);
  const slotId =
    cleanId(
      item.slot_id,
      `material_${index + 1}`,
    );
  const fallback =
    record(
      item.procedural_fallback,
    );
  const requiredMaps =
    stringArray(
      item.required_maps,
      12,
    ).filter(
      (map): map is
        AssetMaterialSlotIntentV2[
          "required_maps"
        ][number] =>
        MATERIAL_MAPS.has(
          map as AssetMaterialSlotIntentV2[
            "required_maps"
          ][number],
        ),
    );

  return {
    slot_id: slotId,
    display_name:
      text(
        item.display_name,
        slotId.replaceAll(
          "_",
          " ",
        ),
      ),
    assigned_part_ids:
      stringArray(
        item.assigned_part_ids,
        64,
      ).map((partId, partIndex) =>
        cleanId(
          partId,
          `part_${partIndex + 1}`,
        ),
      ),
    material_family:
      text(
        item.material_family,
        "general",
      ),
    intent:
      text(
        item.intent,
        "visually suitable surface",
      ),
    semantic_tags:
      stringArray(
        item.semantic_tags,
        32,
      ),
    color_hint:
      text(
        item.color_hint,
      ) || null,
    roughness_hint:
      text(
        item.roughness_hint,
      ) || null,
    metallic_hint:
      text(
        item.metallic_hint,
      ) || null,
    texture_hint:
      text(
        item.texture_hint,
      ) || null,
    brightness_hint:
      text(
        item.brightness_hint,
      ) || null,
    avoid_tags:
      stringArray(
        item.avoid_tags,
        24,
      ),
    physical_scale_m:
      nullableNumber(
        item.physical_scale_m,
        0.001,
        100,
      ),
    required_maps:
      requiredMaps.length
        ? requiredMaps
        : [
            "base_color",
            "roughness",
            "normal_gl",
          ],
    procedural_fallback: {
      color_rgba:
        rgba(
          fallback.color_rgba,
        ),
      metallic:
        numberValue(
          fallback.metallic,
          0,
          0,
          1,
        ),
      roughness:
        numberValue(
          fallback.roughness,
          0.55,
          0,
          1,
        ),
    },
  };
}

export function normalizeAssetDesignBrief(
  value: unknown,
  fallback: {
    concept: string;
    target_extent_m: number;
    max_triangles: number;
    quality_mode?: FoundryQualityMode;
    style?: string;
    animation_ready?: boolean;
  },
): AssetDesignBriefV2 {
  const root =
    record(value);
  const concept =
    text(
      root.concept,
      fallback.concept,
    );
  const rawParts =
    Array.isArray(root.parts)
      ? root.parts
      : [];
  const parts =
    rawParts
      .slice(0, 128)
      .map((value, index) => {
        const part =
          record(value);
        const partId =
          cleanId(
            part.part_id,
            `part_${index + 1}`,
          );
        return {
          part_id: partId,
          semantic_role:
            text(
              part.semantic_role,
              partId.replaceAll(
                "_",
                " ",
              ),
            ),
          geometry_strategy:
            stringArray(
              part.geometry_strategy,
              16,
            ),
          parent_part_id:
            text(
              part.parent_part_id,
            )
              ? cleanId(
                  part.parent_part_id,
                  "",
                )
              : null,
          connection_strategy:
            text(
              part.connection_strategy,
            ) || null,
          material_slot_id:
            text(
              part.material_slot_id,
            )
              ? cleanId(
                  part.material_slot_id,
                  "",
                )
              : null,
          animation_role:
            text(
              part.animation_role,
            ) || null,
          pivot_requirement:
            text(
              part.pivot_requirement,
            ) || null,
          required:
            part.required !== false,
          identifying_features:
            stringArray(
              part.identifying_features,
              24,
            ),
        };
      });

  if (!parts.length) {
    parts.push({
      part_id: "main_body",
      semantic_role:
        `main ${concept} body`,
      geometry_strategy: [
        "compound",
      ],
      parent_part_id: null,
      connection_strategy: null,
      material_slot_id:
        "primary_surface",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [],
    });
  }

  const rawSlots =
    Array.isArray(
      root.material_slots,
    )
      ? root.material_slots
      : [];
  const materialSlots =
    rawSlots
      .slice(0, 32)
      .map(
        normalizeMaterialSlot,
      );

  if (!materialSlots.length) {
    materialSlots.push(
      normalizeMaterialSlot(
        {
          slot_id:
            "primary_surface",
          display_name:
            "Primary surface",
          assigned_part_ids:
            parts.map(
              (part) =>
                part.part_id,
            ),
          material_family:
            "general",
          semantic_tags:
            [
              concept,
              fallback.style ??
                "",
            ].filter(Boolean),
        },
        0,
      ),
    );
  }

  const requirements =
    record(root.requirements);
  const silhouette =
    record(root.silhouette);
  const environment =
    record(root.environment);
  const rawDimensions =
    Array.isArray(
      root.axis_dimensions_m,
    )
      ? root.axis_dimensions_m
      : [];
  const dimensions:
    | [number, number, number]
    | null =
    rawDimensions.length >= 3
      ? [
          numberValue(
            rawDimensions[0],
            fallback.target_extent_m,
            0.001,
            100,
          ),
          numberValue(
            rawDimensions[1],
            fallback.target_extent_m,
            0.001,
            100,
          ),
          numberValue(
            rawDimensions[2],
            fallback.target_extent_m,
            0.001,
            100,
          ),
        ]
      : null;

  const visualRoot =
    record(
      root.visual_description,
    );
  const shapeLanguage =
    record(
      visualRoot.shape_language,
    );
  const orthographicViews =
    record(
      visualRoot.orthographic_views,
    );
  const partIdSet =
    new Set(
      parts.map(
        (part) => part.part_id,
      ),
    );
  const slotIdSet =
    new Set(
      materialSlots.map(
        (slot) => slot.slot_id,
      ),
    );
  const rawPartLayout =
    Array.isArray(
      visualRoot.part_layout,
    )
      ? visualRoot.part_layout
      : [];
  const normalizedPartLayout =
    rawPartLayout
      .slice(0, 128)
      .map((value, index) => {
        const item =
          record(value);
        const partId =
          cleanId(
            item.part_id,
            parts[index]
              ?.part_id ??
              `part_${index + 1}`,
          );
        return {
          part_id: partId,
          shape_description:
            text(
              item.shape_description,
              parts.find(
                (part) =>
                  part.part_id ===
                  partId,
              )?.semantic_role ??
                partId.replaceAll(
                  "_",
                  " ",
                ),
            ),
          dimensions_m:
            nullableVector3(
              item.dimensions_m,
              0,
              100,
            ),
          position_m:
            nullableVector3(
              item.position_m,
              -100,
              100,
            ),
          rotation_degrees:
            vector3(
              item.rotation_degrees,
              [0, 0, 0],
              -360,
              360,
            ),
          visible_from:
            stringArray(
              item.visible_from,
              12,
            ),
          construction_notes:
            stringArray(
              item.construction_notes,
              16,
            ),
        };
      })
      .filter((item) =>
        partIdSet.has(
          item.part_id,
        ),
      );

  for (const part of parts) {
    if (
      !normalizedPartLayout.some(
        (item) =>
          item.part_id ===
          part.part_id,
      )
    ) {
      normalizedPartLayout.push({
        part_id:
          part.part_id,
        shape_description:
          part.semantic_role,
        dimensions_m: null,
        position_m: null,
        rotation_degrees:
          [0, 0, 0],
        visible_from: [],
        construction_notes:
          part.geometry_strategy,
      });
    }
  }

  const rawMaterialRegions =
    Array.isArray(
      visualRoot.material_regions,
    )
      ? visualRoot.material_regions
      : [];
  const normalizedMaterialRegions =
    rawMaterialRegions
      .slice(0, 32)
      .map((value, index) => {
        const item =
          record(value);
        const slotId =
          cleanId(
            item.slot_id,
            materialSlots[index]
              ?.slot_id ??
              `material_${index + 1}`,
          );
        return {
          slot_id: slotId,
          visible_description:
            text(
              item.visible_description,
              materialSlots.find(
                (slot) =>
                  slot.slot_id ===
                  slotId,
              )?.intent ??
                "visible material region",
            ),
          dominant_color_hex:
            text(
              item.dominant_color_hex,
            ) || null,
          finish:
            text(
              item.finish,
              "matte to satin",
            ),
          mapping_intent:
            text(
              item.mapping_intent,
              "scale-consistent mapping",
            ),
        };
      })
      .filter((item) =>
        slotIdSet.has(
          item.slot_id,
        ),
      );

  for (const slot of materialSlots) {
    if (
      !normalizedMaterialRegions.some(
        (item) =>
          item.slot_id ===
          slot.slot_id,
      )
    ) {
      normalizedMaterialRegions.push({
        slot_id:
          slot.slot_id,
        visible_description:
          slot.intent,
        dominant_color_hex:
          slot.color_hint,
        finish:
          slot.roughness_hint ??
          "matte to satin",
        mapping_intent:
          slot.texture_hint ??
          "scale-consistent mapping",
      });
    }
  }

  const rawRatios =
    Array.isArray(
      visualRoot.normalized_proportions,
    )
      ? visualRoot.normalized_proportions
      : [];
  const normalizedRatios =
    rawRatios
      .slice(0, 48)
      .map((value) => {
        const item =
          record(value);
        return {
          relationship:
            text(
              item.relationship,
            ),
          ratio:
            numberValue(
              item.ratio,
              1,
              0.001,
              1000,
            ),
          tolerance:
            numberValue(
              item.tolerance,
              0.08,
              0,
              1,
            ),
        };
      })
      .filter((item) =>
        Boolean(
          item.relationship,
        ),
      );

  const visualDescription:
    AssetVisualDescriptionV1 = {
    schema_version:
      ASSET_VISUAL_DESCRIPTION_SCHEMA_VERSION,
    design_summary:
      text(
        visualRoot.design_summary,
        `Buildable visual blueprint for ${concept}.`,
      ),
    shape_language: {
      primary_forms:
        stringArray(
          shapeLanguage.primary_forms,
          24,
        ),
      edge_character:
        text(
          shapeLanguage.edge_character,
          "softened manufactured edges",
        ),
      symmetry:
        text(
          shapeLanguage.symmetry,
          "use symmetry where structurally appropriate",
        ),
      detail_density:
        shapeLanguage.detail_density ===
          "low" ||
        shapeLanguage.detail_density ===
          "high"
          ? shapeLanguage.detail_density
          : "medium",
      proportion_emphasis:
        stringArray(
          shapeLanguage.proportion_emphasis,
          24,
        ),
    },
    orthographic_views: {
      front:
        text(
          orthographicViews.front,
          `Front view of ${concept}.`,
        ),
      right:
        text(
          orthographicViews.right,
          `Right-side view of ${concept}.`,
        ),
      top:
        text(
          orthographicViews.top,
          `Top view of ${concept}.`,
        ),
      three_quarter:
        text(
          orthographicViews.three_quarter,
          `Three-quarter hero view of ${concept}.`,
        ),
    },
    overall_dimensions_m:
      nullableVector3(
        visualRoot.overall_dimensions_m,
        0.001,
        100,
      ) ?? dimensions,
    normalized_proportions:
      normalizedRatios,
    part_layout:
      normalizedPartLayout,
    material_regions:
      normalizedMaterialRegions,
    visual_acceptance_tests:
      stringArray(
        visualRoot.visual_acceptance_tests,
        40,
      ),
    uncertainty_notes:
      stringArray(
        visualRoot.uncertainty_notes,
        24,
      ),
  };

  const realism =
    root.realism ===
      "diagrammatic" ||
    root.realism ===
      "realistic"
      ? root.realism
      : "stylized";

  return {
    schema_version:
      ASSET_DESIGN_BRIEF_SCHEMA_VERSION,
    asset_id:
      cleanId(
        root.asset_id,
        cleanId(
          concept,
          "generated_asset",
        ),
      ),
    concept,
    asset_class:
      assetClass(
        root.asset_class,
      ),
    intended_use:
      stringArray(
        root.intended_use,
        24,
      ),
    target_extent_m:
      numberValue(
        root.target_extent_m,
        fallback.target_extent_m,
        0.02,
        100,
      ),
    axis_dimensions_m:
      dimensions,
    max_triangles:
      Math.round(
        numberValue(
          root.max_triangles,
          fallback.max_triangles,
          100,
          2_000_000,
        ),
      ),
    quality_mode:
      qualityMode(
        root.quality_mode,
        fallback.quality_mode ??
          "standard",
      ),
    realism,
    style_tags:
      Array.from(
        new Set([
          ...stringArray(
            root.style_tags,
            32,
          ),
          ...(
            fallback.style
              ? [fallback.style]
              : []
          ),
        ]),
      ),
    silhouette: {
      primary_shapes:
        stringArray(
          silhouette.primary_shapes,
          24,
        ),
      identifying_features:
        stringArray(
          silhouette.identifying_features,
          32,
        ),
      important_negative_spaces:
        stringArray(
          silhouette.important_negative_spaces,
          24,
        ),
      camera_readability:
        stringArray(
          silhouette.camera_readability,
          24,
        ),
    },
    proportions:
      stringArray(
        root.proportions,
        32,
      ),
    visual_description:
      visualDescription,
    parts,
    material_slots:
      materialSlots,
    environment: {
      intent:
        text(
          environment.intent,
          "neutral product look development",
        ),
      semantic_tags:
        stringArray(
          environment.semantic_tags,
          24,
        ),
      preferred_environment_class:
        text(
          environment.preferred_environment_class,
          "studio",
        ),
      strength:
        numberValue(
          environment.strength,
          0.8,
          0,
          8,
        ),
      rotation_degrees:
        numberValue(
          environment.rotation_degrees,
          0,
          -360,
          360,
        ),
      background_visible:
        environment.background_visible ===
        true,
    },
    requirements: {
      uv_required:
        requirements.uv_required !==
        false,
      rig_required:
        requirements.rig_required ===
        true,
      collision_required:
        requirements.collision_required ===
        true,
      ground_contact_required:
        requirements.ground_contact_required !==
        false,
      animation_ready:
        requirements.animation_ready ===
          true ||
        fallback.animation_ready ===
          true,
      movable_part_ids:
        stringArray(
          requirements.movable_part_ids,
          64,
        ).map(
          (partId, index) =>
            cleanId(
              partId,
              `movable_${index + 1}`,
            ),
        ),
    },
    acceptance_criteria:
      stringArray(
        root.acceptance_criteria,
        40,
      ),
    benchmark_priorities:
      stringArray(
        root.benchmark_priorities,
        32,
      ),
  };
}

export function validateAssetDesignBrief(
  brief: AssetDesignBriefV2,
): AssetDesignBriefValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const partIds =
    brief.parts.map(
      (part) =>
        part.part_id,
    );
  const partIdSet =
    new Set(partIds);
  const slotIds =
    brief.material_slots.map(
      (slot) =>
        slot.slot_id,
    );
  const slotIdSet =
    new Set(slotIds);

  if (
    brief.schema_version !==
    ASSET_DESIGN_BRIEF_SCHEMA_VERSION
  ) {
    errors.push(
      "Unsupported asset design brief schema.",
    );
  }
  if (!brief.concept.trim()) {
    errors.push(
      "concept is required.",
    );
  }
  if (
    partIdSet.size !==
    partIds.length
  ) {
    errors.push(
      "part_id values must be unique.",
    );
  }
  if (
    slotIdSet.size !==
    slotIds.length
  ) {
    errors.push(
      "material slot ids must be unique.",
    );
  }

  for (const part of
    brief.parts) {
    if (
      part.parent_part_id &&
      !partIdSet.has(
        part.parent_part_id,
      )
    ) {
      errors.push(
        `${part.part_id} references missing parent ${part.parent_part_id}.`,
      );
    }
    if (
      part.material_slot_id &&
      !slotIdSet.has(
        part.material_slot_id,
      )
    ) {
      errors.push(
        `${part.part_id} references missing material slot ${part.material_slot_id}.`,
      );
    }
  }

  for (const slot of
    brief.material_slots) {
    for (const partId of
      slot.assigned_part_ids) {
      if (!partIdSet.has(partId)) {
        warnings.push(
          `${slot.slot_id} assigns missing part ${partId}.`,
        );
      }
    }
  }

  const visual =
    brief.visual_description;
  if (!visual) {
    warnings.push(
      "The design brief is missing its visual description blueprint.",
    );
  } else {
    if (
      visual.shape_language
        .primary_forms.length < 2
    ) {
      warnings.push(
        "The visual description needs at least two primary forms.",
      );
    }
    if (
      visual.normalized_proportions.length <
      3
    ) {
      warnings.push(
        "The visual description needs at least three measurable proportion relationships.",
      );
    }
    const dimensionedPartCount =
      visual.part_layout.filter(
        (item) =>
          item.dimensions_m &&
          item.position_m,
      ).length;
    if (
      dimensionedPartCount <
      Math.min(
        3,
        brief.parts.length,
      )
    ) {
      warnings.push(
        "Too few visual-description parts have both dimensions and positions.",
      );
    }
    const missingVisualPartIds =
      brief.parts
        .filter((part) =>
          !visual.part_layout.some(
            (item) =>
              item.part_id ===
              part.part_id,
          ),
        )
        .map((part) =>
          part.part_id,
        );
    if (missingVisualPartIds.length) {
      warnings.push(
        `Visual description is missing part layouts: ${missingVisualPartIds.join(", ")}.`,
      );
    }
    if (
      visual.visual_acceptance_tests.length <
      3
    ) {
      warnings.push(
        "The visual description needs at least three visual acceptance tests.",
      );
    }
  }

  const partsWithoutGeometry =
    brief.parts
      .filter((part) =>
        part.geometry_strategy.length ===
        0,
      )
      .map((part) =>
        part.part_id,
      );
  if (partsWithoutGeometry.length) {
    warnings.push(
      `Parts need explicit geometry strategies: ${partsWithoutGeometry.join(", ")}.`,
    );
  }

  if (
    brief.acceptance_criteria.length <
    3
  ) {
    warnings.push(
      "Add at least three measurable acceptance criteria before final generation.",
    );
  }
  if (
    brief.silhouette
      .identifying_features.length <
    2
  ) {
    warnings.push(
      "The design brief has few silhouette-identifying features.",
    );
  }
  if (
    brief.max_triangles >
    250_000
  ) {
    warnings.push(
      "The requested triangle budget is high for a browser asset.",
    );
  }

  return {
    valid:
      errors.length === 0,
    errors,
    warnings,
  };
}

export function designBriefToProceduralSpec(
  brief: AssetDesignBriefV2,
) {
  return {
    schema_version:
      "myway_procedural_asset_spec_v1" as const,
    asset_id:
      brief.asset_id,
    concept:
      brief.concept,
    target_extent_m:
      brief.target_extent_m,
    max_triangles:
      brief.max_triangles,
    style_tags:
      brief.style_tags,
    realism:
      brief.realism,
    parts:
      brief.parts.map(
        (part) => ({
          part_id:
            part.part_id,
          semantic_role:
            part.semantic_role,
          geometry_intent:
            part.geometry_strategy.some(
              (value) =>
                /organic|metaball|remesh|sculpt/i.test(
                  value,
                ),
            )
              ? "organic" as const
              : part.geometry_strategy.some(
                  (value) =>
                    /lathe|screw/i.test(
                      value,
                    ),
                )
                ? "lathe" as const
                : part.geometry_strategy.some(
                    (value) =>
                      /extrud|profile|loft/i.test(
                        value,
                      ),
                  )
                  ? "extrusion" as const
                  : "compound" as const,
          parent_part_id:
            part.parent_part_id,
          material_intent:
            part.material_slot_id,
          animation_role:
            part.animation_role,
          required:
            part.required,
        }),
      ),
    requirements: {
      uv_required:
        brief.requirements
          .uv_required,
      rig_required:
        brief.requirements
          .rig_required,
      movable_parts:
        brief.requirements
          .movable_part_ids,
      collision_required:
        brief.requirements
          .collision_required,
      ground_contact_required:
        brief.requirements
          .ground_contact_required,
    },
  };
}
