import type {
  AssetDesignBriefV2,
} from "./asset-design-brief";
import type {
  FoundryResourcePlanV1,
} from "./foundry-resource-plan";

export const FOUNDRY_LOOK_ADJUSTMENTS_SCHEMA_VERSION =
  "myway_foundry_look_adjustments_v1" as const;

export const FOUNDRY_MAPPING_MODES = [
  "uv",
  "object_box",
] as const;

export type FoundryMappingMode =
  (typeof FOUNDRY_MAPPING_MODES)[number];

export const FOUNDRY_LOOK_ADJUSTMENT_DIRECTIONS = [
  "make_texture_finer",
  "make_texture_coarser",
  "rotate_mapping_clockwise",
  "rotate_mapping_counterclockwise",
  "switch_to_object_box",
  "switch_to_uv",
  "increase_normal_strength",
  "reduce_normal_strength",
  "increase_roughness",
  "decrease_roughness",
  "increase_height_strength",
  "reduce_height_strength",
  "increase_exposure",
  "decrease_exposure",
  "increase_environment_strength",
  "decrease_environment_strength",
  "rotate_environment_clockwise",
  "rotate_environment_counterclockwise",
  "increase_fallback_light_energy",
  "reduce_fallback_light_energy",
] as const;

export type FoundryLookAdjustmentDirection =
  (typeof FOUNDRY_LOOK_ADJUSTMENT_DIRECTIONS)[number];

export type FoundryMaterialLookOverrideV1 = {
  physical_scale_m: number | null;
  uv_repeat: [number, number];
  rotation_degrees: number;
  offset: [number, number];
  normal_strength: number;
  roughness_factor: number;
  height_strength: number;
  mapping_mode: FoundryMappingMode;
};

export type FoundryMaterialSlotLookAdjustmentV1 =
  FoundryMaterialLookOverrideV1 & {
    part_overrides: Record<
      string,
      FoundryMaterialLookOverrideV1
    >;
  };

export type FoundryEnvironmentLookAdjustmentV1 = {
  strength: number;
  rotation_degrees: number;
  exposure: number;
  background_visible: boolean;
  fallback_light_energy_scale: number;
};

export type FoundryLookAdjustmentsV1 = {
  schema_version:
    typeof FOUNDRY_LOOK_ADJUSTMENTS_SCHEMA_VERSION;
  material_slots: Record<
    string,
    FoundryMaterialSlotLookAdjustmentV1
  >;
  environment:
    FoundryEnvironmentLookAdjustmentV1;
};

export type FoundryBoundedAdjustmentSuggestion = {
  direction:
    FoundryLookAdjustmentDirection;
  affected_material_slot_ids?: string[];
  affected_part_ids?: string[];
};

function record(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(
        minimum,
        Math.min(maximum, parsed),
      )
    : fallback;
}

function optionalPositive(
  value: unknown,
  fallback: number | null,
) {
  if (
    value == null ||
    value === ""
  ) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed > 0.000001
    ? Math.min(parsed, 1000)
    : fallback;
}

function pair(
  value: unknown,
  fallback: [number, number],
  minimum: number,
  maximum: number,
): [number, number] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return [
    finite(
      value[0],
      fallback[0],
      minimum,
      maximum,
    ),
    finite(
      value[1],
      fallback[1],
      minimum,
      maximum,
    ),
  ];
}

function mappingMode(
  value: unknown,
  fallback: FoundryMappingMode,
): FoundryMappingMode {
  return FOUNDRY_MAPPING_MODES.includes(
    value as FoundryMappingMode,
  )
    ? value as FoundryMappingMode
    : fallback;
}

function materialDefault(
  physicalScaleM: number | null,
): FoundryMaterialLookOverrideV1 {
  return {
    physical_scale_m:
      physicalScaleM,
    uv_repeat: [1, 1],
    rotation_degrees: 0,
    offset: [0, 0],
    normal_strength: 1,
    roughness_factor: 1,
    height_strength: 0.18,
    mapping_mode: "uv",
  };
}

function normalizeMaterialOverride(
  value: unknown,
  fallback:
    FoundryMaterialLookOverrideV1,
): FoundryMaterialLookOverrideV1 {
  const item = record(value);
  return {
    physical_scale_m:
      optionalPositive(
        item.physical_scale_m,
        fallback.physical_scale_m,
      ),
    uv_repeat:
      pair(
        item.uv_repeat,
        fallback.uv_repeat,
        0.05,
        100,
      ),
    rotation_degrees:
      finite(
        item.rotation_degrees,
        fallback.rotation_degrees,
        -3600,
        3600,
      ),
    offset:
      pair(
        item.offset,
        fallback.offset,
        -100,
        100,
      ),
    normal_strength:
      finite(
        item.normal_strength,
        fallback.normal_strength,
        0,
        4,
      ),
    roughness_factor:
      finite(
        item.roughness_factor,
        fallback.roughness_factor,
        0,
        2,
      ),
    height_strength:
      finite(
        item.height_strength,
        fallback.height_strength,
        0,
        1,
      ),
    mapping_mode:
      mappingMode(
        item.mapping_mode,
        fallback.mapping_mode,
      ),
  };
}

function bindingScale(
  brief: AssetDesignBriefV2,
  plan: FoundryResourcePlanV1 | null,
  slotId: string,
) {
  const binding =
    plan?.material_bindings.find(
      (item) =>
        item.slot.slot_id === slotId,
    );
  const slot =
    brief.material_slots.find(
      (item) =>
        item.slot_id === slotId,
    );
  return binding?.texture_scale_m ??
    slot?.physical_scale_m ??
    null;
}

export function createDefaultFoundryLookAdjustments(
  brief: AssetDesignBriefV2,
  plan?: FoundryResourcePlanV1 | null,
): FoundryLookAdjustmentsV1 {
  return {
    schema_version:
      FOUNDRY_LOOK_ADJUSTMENTS_SCHEMA_VERSION,
    material_slots:
      Object.fromEntries(
        brief.material_slots.map(
          (slot) => [
            slot.slot_id,
            {
              ...materialDefault(
                bindingScale(
                  brief,
                  plan ?? null,
                  slot.slot_id,
                ),
              ),
              part_overrides: {},
            },
          ],
        ),
      ),
    environment: {
      strength:
        brief.environment.strength,
      rotation_degrees:
        brief.environment
          .rotation_degrees,
      exposure: 0,
      background_visible:
        brief.environment
          .background_visible,
      fallback_light_energy_scale: 1,
    },
  };
}

export function normalizeFoundryLookAdjustments(
  value: unknown,
  brief: AssetDesignBriefV2,
  plan?: FoundryResourcePlanV1 | null,
): FoundryLookAdjustmentsV1 {
  const defaults =
    createDefaultFoundryLookAdjustments(
      brief,
      plan,
    );
  const root = record(value);
  const rawSlots =
    record(root.material_slots);
  const validPartIds =
    new Set(
      brief.parts.map(
        (part) =>
          part.part_id,
      ),
    );

  const materialSlots =
    Object.fromEntries(
      brief.material_slots.map(
        (slot) => {
          const fallback =
            defaults.material_slots[
              slot.slot_id
            ];
          const raw =
            record(
              rawSlots[
                slot.slot_id
              ],
            );
          const normalized =
            normalizeMaterialOverride(
              raw,
              fallback,
            );
          const rawPartOverrides =
            record(
              raw.part_overrides,
            );
          const partOverrides =
            Object.fromEntries(
              Object.entries(
                rawPartOverrides,
              )
                .filter(
                  ([partId]) =>
                    validPartIds.has(
                      partId,
                    ),
                )
                .map(
                  ([partId, override]) => [
                    partId,
                    normalizeMaterialOverride(
                      override,
                      normalized,
                    ),
                  ],
                ),
            );

          return [
            slot.slot_id,
            {
              ...normalized,
              part_overrides:
                partOverrides,
            },
          ];
        },
      ),
    );

  const environment =
    record(root.environment);
  return {
    schema_version:
      FOUNDRY_LOOK_ADJUSTMENTS_SCHEMA_VERSION,
    material_slots:
      materialSlots,
    environment: {
      strength:
        finite(
          environment.strength,
          defaults.environment
            .strength,
          0,
          8,
        ),
      rotation_degrees:
        finite(
          environment
            .rotation_degrees,
          defaults.environment
            .rotation_degrees,
          -3600,
          3600,
        ),
      exposure:
        finite(
          environment.exposure,
          defaults.environment
            .exposure,
          -8,
          8,
        ),
      background_visible:
        typeof environment
          .background_visible ===
          "boolean"
          ? environment
              .background_visible
          : defaults.environment
              .background_visible,
      fallback_light_energy_scale:
        finite(
          environment
            .fallback_light_energy_scale,
          defaults.environment
            .fallback_light_energy_scale,
          0,
          8,
        ),
    },
  };
}

function applyMaterialDirection(
  current:
    FoundryMaterialLookOverrideV1,
  direction:
    FoundryLookAdjustmentDirection,
): FoundryMaterialLookOverrideV1 {
  const physicalScale =
    current.physical_scale_m ?? 1;
  switch (direction) {
    case "make_texture_finer":
      return {
        ...current,
        physical_scale_m:
          Math.max(
            0.000001,
            physicalScale * 0.75,
          ),
      };
    case "make_texture_coarser":
      return {
        ...current,
        physical_scale_m:
          physicalScale * 1.333333,
      };
    case "rotate_mapping_clockwise":
      return {
        ...current,
        rotation_degrees:
          current.rotation_degrees - 15,
      };
    case "rotate_mapping_counterclockwise":
      return {
        ...current,
        rotation_degrees:
          current.rotation_degrees + 15,
      };
    case "switch_to_object_box":
      return {
        ...current,
        mapping_mode:
          "object_box",
      };
    case "switch_to_uv":
      return {
        ...current,
        mapping_mode: "uv",
      };
    case "increase_normal_strength":
      return {
        ...current,
        normal_strength:
          Math.min(
            4,
            current.normal_strength +
              0.15,
          ),
      };
    case "reduce_normal_strength":
      return {
        ...current,
        normal_strength:
          Math.max(
            0,
            current.normal_strength -
              0.15,
          ),
      };
    case "increase_roughness":
      return {
        ...current,
        roughness_factor:
          Math.min(
            2,
            current.roughness_factor +
              0.1,
          ),
      };
    case "decrease_roughness":
      return {
        ...current,
        roughness_factor:
          Math.max(
            0,
            current.roughness_factor -
              0.1,
          ),
      };
    case "increase_height_strength":
      return {
        ...current,
        height_strength:
          Math.min(
            1,
            current.height_strength +
              0.08,
          ),
      };
    case "reduce_height_strength":
      return {
        ...current,
        height_strength:
          Math.max(
            0,
            current.height_strength -
              0.08,
          ),
      };
    default:
      return current;
  }
}

export function applyBoundedFoundryAdjustment(
  value: FoundryLookAdjustmentsV1,
  suggestion:
    FoundryBoundedAdjustmentSuggestion,
): FoundryLookAdjustmentsV1 {
  const next:
    FoundryLookAdjustmentsV1 = {
    ...value,
    material_slots:
      Object.fromEntries(
        Object.entries(
          value.material_slots,
        ).map(
          ([slotId, slot]) => [
            slotId,
            {
              ...slot,
              uv_repeat: [
                ...slot.uv_repeat,
              ] as [number, number],
              offset: [
                ...slot.offset,
              ] as [number, number],
              part_overrides:
                Object.fromEntries(
                  Object.entries(
                    slot.part_overrides,
                  ).map(
                    ([partId, override]) => [
                      partId,
                      {
                        ...override,
                        uv_repeat: [
                          ...override
                            .uv_repeat,
                        ] as [number, number],
                        offset: [
                          ...override.offset,
                        ] as [number, number],
                      },
                    ],
                  ),
                ),
            },
          ],
        ),
      ),
    environment: {
      ...value.environment,
    },
  };

  const materialDirections =
    new Set<
      FoundryLookAdjustmentDirection
    >([
      "make_texture_finer",
      "make_texture_coarser",
      "rotate_mapping_clockwise",
      "rotate_mapping_counterclockwise",
      "switch_to_object_box",
      "switch_to_uv",
      "increase_normal_strength",
      "reduce_normal_strength",
      "increase_roughness",
      "decrease_roughness",
      "increase_height_strength",
      "reduce_height_strength",
    ]);

  if (
    materialDirections.has(
      suggestion.direction,
    )
  ) {
    const targetSlots =
      suggestion
        .affected_material_slot_ids
        ?.filter(
          (slotId) =>
            Boolean(
              next.material_slots[
                slotId
              ],
            ),
        ) ?? [];
    const slotIds =
      targetSlots;
    if (!slotIds.length) {
      return next;
    }

    for (const slotId of
      slotIds) {
      const slot =
        next.material_slots[
          slotId
        ];
      if (!slot) continue;
      const parts =
        suggestion
          .affected_part_ids
          ?.filter(Boolean) ?? [];
      if (parts.length) {
        for (const partId of
          parts) {
          const current =
            slot.part_overrides[
              partId
            ] ?? {
              physical_scale_m:
                slot.physical_scale_m,
              uv_repeat: [
                ...slot.uv_repeat,
              ] as [number, number],
              rotation_degrees:
                slot.rotation_degrees,
              offset: [
                ...slot.offset,
              ] as [number, number],
              normal_strength:
                slot.normal_strength,
              roughness_factor:
                slot.roughness_factor,
              height_strength:
                slot.height_strength,
              mapping_mode:
                slot.mapping_mode,
            };
          slot.part_overrides[
            partId
          ] =
            applyMaterialDirection(
              current,
              suggestion.direction,
            );
        }
      } else {
        const adjusted =
          applyMaterialDirection(
            slot,
            suggestion.direction,
          );
        Object.assign(
          slot,
          adjusted,
        );
      }
    }
    return next;
  }

  switch (suggestion.direction) {
    case "increase_exposure":
      next.environment.exposure =
        Math.min(
          8,
          next.environment.exposure +
            0.25,
        );
      break;
    case "decrease_exposure":
      next.environment.exposure =
        Math.max(
          -8,
          next.environment.exposure -
            0.25,
        );
      break;
    case "increase_environment_strength":
      next.environment.strength =
        Math.min(
          8,
          next.environment.strength +
            0.15,
        );
      break;
    case "decrease_environment_strength":
      next.environment.strength =
        Math.max(
          0,
          next.environment.strength -
            0.15,
        );
      break;
    case "rotate_environment_clockwise":
      next.environment.rotation_degrees -=
        15;
      break;
    case "rotate_environment_counterclockwise":
      next.environment.rotation_degrees +=
        15;
      break;
    case "increase_fallback_light_energy":
      next.environment
        .fallback_light_energy_scale =
        Math.min(
          8,
          next.environment
            .fallback_light_energy_scale +
            0.15,
        );
      break;
    case "reduce_fallback_light_energy":
      next.environment
        .fallback_light_energy_scale =
        Math.max(
          0,
          next.environment
            .fallback_light_energy_scale -
            0.15,
        );
      break;
    default:
      break;
  }

  return next;
}
