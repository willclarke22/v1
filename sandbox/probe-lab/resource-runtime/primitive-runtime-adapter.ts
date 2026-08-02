import type {
  RuntimeSceneActorTransform,
  RuntimeScenePrimitiveBindingV1,
  RuntimeScenePrimitiveKind,
} from "./scene-runtime-contract";

export type PrimitiveRuntimeAdapterResult = {
  primitives: RuntimeScenePrimitiveBindingV1[];
  actor_transforms: Record<
    string,
    Partial<RuntimeSceneActorTransform>
  >;
  skipped_node_ids: string[];
  warnings: string[];
};

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tuple(
  value: unknown,
  fallback: [number, number, number],
) {
  if (
    Array.isArray(value) &&
    value.length >= 3 &&
    value
      .slice(0, 3)
      .every(
        (entry) =>
          typeof entry === "number" &&
          Number.isFinite(entry),
      )
  ) {
    return [
      value[0],
      value[1],
      value[2],
    ] as [number, number, number];
  }
  return [...fallback] as [
    number,
    number,
    number,
  ];
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

function cleanId(
  value: unknown,
  fallback: string,
) {
  const raw =
    typeof value === "string"
      ? value.trim()
      : "";
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) ||
    fallback
  );
}

function colorValue(
  value: unknown,
) {
  return typeof value === "string" &&
    /^#[0-9a-f]{3,8}$/i.test(
      value.trim(),
    )
    ? value.trim()
    : "#38bdf8";
}

function primitiveKind(
  value: unknown,
): RuntimeScenePrimitiveKind | null {
  if (
    value === "box" ||
    value === "cylinder" ||
    value === "sphere" ||
    value === "plane" ||
    value === "cone" ||
    value === "torus" ||
    value === "rod"
  ) {
    return value;
  }
  if (value === "softBox") {
    return "box";
  }
  if (value === "glow") {
    return "sphere";
  }
  return null;
}

function flattenNodes(
  values: unknown[],
) {
  const output: Record<string, unknown>[] =
    [];
  const visit = (
    value: unknown,
  ) => {
    const node = asRecord(value);
    if (!node) return;
    output.push(node);
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  values.forEach(visit);
  return output;
}

export function adaptPrimitiveSceneNodesToRuntime(
  nodes: unknown,
  options: {
    exclude_entity_ids?: string[];
    max_primitives?: number;
  } = {},
): PrimitiveRuntimeAdapterResult {
  const exclude = new Set(
    options.exclude_entity_ids ?? [],
  );
  const warnings: string[] = [];
  const skipped: string[] = [];
  const primitives:
    RuntimeScenePrimitiveBindingV1[] =
      [];
  const transforms: Record<
    string,
    Partial<RuntimeSceneActorTransform>
  > = {};
  const maxPrimitives =
    Math.max(
      1,
      Math.min(
        96,
        options.max_primitives ?? 48,
      ),
    );

  for (const [
    index,
    node,
  ] of flattenNodes(
    Array.isArray(nodes) ? nodes : [],
  ).entries()) {
    const entityId =
      cleanId(
        node.id,
        `primitive_${index + 1}`,
      );

    if (exclude.has(entityId)) {
      skipped.push(entityId);
      continue;
    }

    const kind =
      primitiveKind(node.kind);
    if (!kind) {
      skipped.push(entityId);
      warnings.push(
        `${entityId}: ${String(node.kind ?? "unknown")} remains on the compatibility renderer because it has no shared primitive runtime compiler.`,
      );
      continue;
    }

    if (
      primitives.length >=
      maxPrimitives
    ) {
      skipped.push(entityId);
      warnings.push(
        `The shared runtime primitive budget of ${maxPrimitives} actors was reached.`,
      );
      continue;
    }

    const scale =
      tuple(
        node.scale,
        [1, 1, 1],
      ).map((entry) =>
        Math.max(
          0.02,
          Math.abs(entry),
        ),
      ) as [number, number, number];
    const radius =
      numberValue(
        node.radius,
        0.5,
        0.01,
        24,
      );

    const dimensions: [
      number,
      number,
      number,
    ] =
      kind === "sphere"
        ? [
            radius * 2,
            radius * 2,
            radius * 2,
          ]
        : kind === "torus"
          ? [
              Math.max(
                scale[0],
                radius * 2,
              ),
              Math.max(
                scale[1],
                radius * 0.35,
              ),
              Math.max(
                scale[2],
                radius * 2,
              ),
            ]
          : scale;

    primitives.push({
      entity_id: entityId,
      primitive_kind: kind,
      dimensions,
      color:
        colorValue(node.color),
      metalness:
        numberValue(
          node.metalness,
          0.05,
          0,
          1,
        ),
      roughness:
        numberValue(
          node.roughness,
          0.72,
          0,
          1,
        ),
      opacity:
        numberValue(
          node.opacity,
          1,
          0.02,
          1,
        ),
      generated_uvs: true,
      cast_shadow:
        kind !== "plane",
      receive_shadow: true,
    });

    transforms[entityId] = {
      position:
        tuple(
          node.position,
          [0, 0, 0],
        ),
      rotation_radians:
        tuple(
          node.rotation,
          [0, 0, 0],
        ),
      scale: 1,
    };
  }

  return {
    primitives,
    actor_transforms:
      transforms,
    skipped_node_ids:
      skipped,
    warnings:
      Array.from(
        new Set(warnings),
      ),
  };
}
