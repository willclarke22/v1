export const PROCEDURAL_ASSET_SPEC_SCHEMA_VERSION =
  "myway_procedural_asset_spec_v1" as const;

export const PROCEDURAL_ASSET_GEOMETRY_INTENTS = [
  "box",
  "cylinder",
  "sphere",
  "cone",
  "torus",
  "curve",
  "lathe",
  "extrusion",
  "compound",
  "organic",
] as const;

export type ProceduralAssetGeometryIntent =
  (typeof PROCEDURAL_ASSET_GEOMETRY_INTENTS)[number];

export type ProceduralAssetSpecPartV1 = {
  part_id: string;
  semantic_role: string;
  geometry_intent:
    ProceduralAssetGeometryIntent;
  parent_part_id: string | null;
  material_intent: string | null;
  animation_role: string | null;
  required: boolean;
};

export type ProceduralAssetSpecV1 = {
  schema_version:
    typeof PROCEDURAL_ASSET_SPEC_SCHEMA_VERSION;
  asset_id: string;
  concept: string;
  target_extent_m: number;
  max_triangles: number;
  style_tags: string[];
  realism:
    | "diagrammatic"
    | "stylized"
    | "realistic";
  parts:
    ProceduralAssetSpecPartV1[];
  requirements: {
    uv_required: boolean;
    rig_required: boolean;
    movable_parts: string[];
    collision_required: boolean;
    ground_contact_required: boolean;
  };
};

export type ProceduralAssetSpecValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function cleanId(
  value: unknown,
  fallback: string,
) {
  const source =
    typeof value === "string"
      ? value.trim()
      : "";
  return (
    source
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) ||
    fallback
  );
}

function text(
  value: unknown,
  fallback: string,
) {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? Math.max(
        min,
        Math.min(max, value),
      )
    : fallback;
}

function stringArray(
  value: unknown,
) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) =>
              typeof item === "string"
                ? item.trim()
                : "",
            )
            .filter(Boolean),
        ),
      )
    : [];
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function geometryIntent(
  value: unknown,
): ProceduralAssetGeometryIntent {
  return PROCEDURAL_ASSET_GEOMETRY_INTENTS.includes(
    value as ProceduralAssetGeometryIntent,
  )
    ? value as ProceduralAssetGeometryIntent
    : "compound";
}

export function normalizeProceduralAssetSpec(
  value: unknown,
  fallback: {
    concept: string;
    target_extent_m: number;
    max_triangles: number;
    animation_ready?: boolean;
  },
): ProceduralAssetSpecV1 {
  const root =
    asRecord(value);
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
      .map((entry, index) => {
        const part =
          asRecord(entry);
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
          geometry_intent:
            geometryIntent(
              part.geometry_intent,
            ),
          parent_part_id:
            typeof part.parent_part_id ===
              "string" &&
            part.parent_part_id.trim()
              ? cleanId(
                  part.parent_part_id,
                  "",
                )
              : null,
          material_intent:
            typeof part.material_intent ===
              "string" &&
            part.material_intent.trim()
              ? part.material_intent.trim()
              : null,
          animation_role:
            typeof part.animation_role ===
              "string" &&
            part.animation_role.trim()
              ? part.animation_role.trim()
              : null,
          required:
            part.required !== false,
        };
      });

  if (!parts.length) {
    parts.push({
      part_id: "main_body",
      semantic_role:
        `main ${concept} body`,
      geometry_intent: "compound",
      parent_part_id: null,
      material_intent: null,
      animation_role: null,
      required: true,
    });
  }

  const requirements =
    asRecord(root.requirements);
  const realism =
    root.realism === "diagrammatic" ||
    root.realism === "realistic"
      ? root.realism
      : "stylized";

  return {
    schema_version:
      PROCEDURAL_ASSET_SPEC_SCHEMA_VERSION,
    asset_id:
      cleanId(
        root.asset_id,
        cleanId(
          concept,
          "generated_asset",
        ),
      ),
    concept,
    target_extent_m:
      numberValue(
        root.target_extent_m,
        fallback.target_extent_m,
        0.02,
        100,
      ),
    max_triangles:
      Math.round(
        numberValue(
          root.max_triangles,
          fallback.max_triangles,
          100,
          2_000_000,
        ),
      ),
    style_tags:
      stringArray(
        root.style_tags,
      ),
    realism,
    parts,
    requirements: {
      uv_required:
        requirements.uv_required !==
        false,
      rig_required:
        requirements.rig_required ===
        true,
      movable_parts:
        stringArray(
          requirements.movable_parts,
        ).map((value, index) =>
          cleanId(
            value,
            `movable_part_${index + 1}`,
          ),
        ),
      collision_required:
        requirements.collision_required ===
        true,
      ground_contact_required:
        requirements.ground_contact_required !==
        false,
    },
  };
}

export function validateProceduralAssetSpec(
  spec: ProceduralAssetSpecV1,
): ProceduralAssetSpecValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids =
    spec.parts.map(
      (part) =>
        part.part_id,
    );
  const idSet =
    new Set(ids);

  if (
    spec.schema_version !==
    PROCEDURAL_ASSET_SPEC_SCHEMA_VERSION
  ) {
    errors.push(
      "Unsupported procedural asset spec schema.",
    );
  }
  if (!spec.asset_id) {
    errors.push(
      "asset_id is required.",
    );
  }
  if (!spec.concept.trim()) {
    errors.push(
      "concept is required.",
    );
  }
  if (
    ids.length !== idSet.size
  ) {
    errors.push(
      "part_id values must be unique.",
    );
  }

  const parentById =
    new Map(
      spec.parts.map((part) => [
        part.part_id,
        part.parent_part_id,
      ]),
    );

  for (const part of
    spec.parts) {
    if (
      part.parent_part_id ===
      part.part_id
    ) {
      errors.push(
        `${part.part_id} cannot parent itself.`,
      );
    } else if (
      part.parent_part_id &&
      !idSet.has(
        part.parent_part_id,
      )
    ) {
      errors.push(
        `${part.part_id} references missing parent ${part.parent_part_id}.`,
      );
    }

    const visited =
      new Set<string>();
    let cursor:
      | string
      | null = part.part_id;
    while (cursor) {
      if (visited.has(cursor)) {
        errors.push(
          `Parent cycle detected from ${part.part_id}.`,
        );
        break;
      }
      visited.add(cursor);
      cursor =
        parentById.get(cursor) ??
        null;
    }
  }

  for (const movable of
    spec.requirements
      .movable_parts) {
    if (!idSet.has(movable)) {
      warnings.push(
        `Movable part ${movable} is not declared in parts.`,
      );
    }
  }

  if (
    spec.max_triangles >
    250_000
  ) {
    warnings.push(
      "The requested triangle budget is high for an interactive browser asset.",
    );
  }

  return {
    valid:
      errors.length === 0,
    errors,
    warnings,
  };
}
