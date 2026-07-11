import type {
  MyWayResolvedVisualLearningTurn,
  QueuedAssetNeed,
  RenderBinding,
  VisualLearningTurnInput,
  VisualLearningTurnOutput,
  VisualPrimitiveKind,
} from "./visual-learning-turn";
import { validateVisualLearningTurnOutput } from "./validate-visual-learning-turn";

function choosePrimitive(
  preferred: string,
  supportedPrimitives: VisualPrimitiveKind[],
  description = "",
  semanticTags: string[] = [],
): VisualPrimitiveKind | null {
  if (supportedPrimitives.includes(preferred as VisualPrimitiveKind)) return preferred as VisualPrimitiveKind;

  const combined = `${description} ${semanticTags.join(" ")}`.toLowerCase();
  const preferredFallback = (() => {
    if (combined.includes("wheel") || combined.includes("spoke") || combined.includes("circle") || combined.includes("cycle")) return "path";
    if (combined.includes("rod") || combined.includes("shaft") || combined.includes("connector") || combined.includes("link")) return "arrow";
    if (combined.includes("gas") || combined.includes("cloud") || combined.includes("particle") || combined.includes("energy")) return "particle";
    if (combined.includes("cylinder") || combined.includes("tube") || combined.includes("chamber") || combined.includes("container")) return "box";
    if (combined.includes("piston") || combined.includes("plug") || combined.includes("disc") || combined.includes("disk")) return "box";
    return "sphere";
  })();

  if (supportedPrimitives.includes(preferredFallback as VisualPrimitiveKind)) return preferredFallback as VisualPrimitiveKind;
  if (supportedPrimitives.includes("sphere")) return "sphere";
  if (supportedPrimitives.includes("label")) return "label";
  return supportedPrimitives[0] ?? null;
}

function priorityForNeed(preferredRenderKind: string): QueuedAssetNeed["priority"] {
  if (preferredRenderKind === "registered_asset") return "high";
  if (preferredRenderKind === "any") return "medium";
  return "medium";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function resolveVisualLearningTurn(
  output: VisualLearningTurnOutput,
  input: VisualLearningTurnInput,
): MyWayResolvedVisualLearningTurn {
  const validation = validateVisualLearningTurnOutput(output, input);

  if (output.turn_status === "needs_clarification") {
    return {
      schema_version: "myway_resolved_visual_learning_turn_v1",
      source_output_valid: validation.valid,
      render_bindings: [],
      queued_asset_needs: [],
      validation,
    };
  }

  const visualExperience = asRecord(output.visual_experience);
  const scenePlan = asRecord(visualExperience?.semantic_scene_plan);
  const entities = Array.isArray(scenePlan?.entities) ? scenePlan.entities : [];

  if (!validation.valid || !entities.length) {
    return {
      schema_version: "myway_resolved_visual_learning_turn_v1",
      source_output_valid: validation.valid,
      render_bindings: [],
      queued_asset_needs: [],
      validation,
    };
  }

  const renderBindings: RenderBinding[] = [];
  const queuedAssetNeeds: QueuedAssetNeed[] = [];

  for (const rawEntity of entities) {
    const entity = asRecord(rawEntity);
    const visualNeed = asRecord(entity?.visual_need);
    const entityId = String(entity?.id ?? "unknown_entity");
    const displayName = String(entity?.display_name ?? entityId);
    const preferredRenderKind = String(visualNeed?.preferred_render_kind ?? "label");
    const semanticTags = safeStringArray(visualNeed?.semantic_tags);
    const description = String(visualNeed?.description ?? displayName);
    const primitive = choosePrimitive(
      preferredRenderKind,
      input.renderer_capabilities.supported_primitives,
      description,
      semanticTags,
    );

    if (primitive) {
      renderBindings.push({
        entity_id: entityId,
        binding: {
          kind: "primitive",
          primitive,
          reason:
            preferredRenderKind === primitive
              ? `The model requested ${primitive}. MyWay can render that directly as a primitive.`
              : `The model requested ${preferredRenderKind}. MyWay does not have that as a primitive, so it will use ${primitive} for now.`,
        },
      });
    } else {
      renderBindings.push({
        entity_id: entityId,
        binding: {
          kind: "placeholder",
          label: displayName,
          reason: "No supported primitive fallback was available, so MyWay will render a label placeholder.",
        },
      });
    }

    if (
      preferredRenderKind === "registered_asset" ||
      preferredRenderKind === "any" ||
      semanticTags.some((tag) => tag.toLowerCase().includes("biology"))
    ) {
      queuedAssetNeeds.push({
        source_entity_id: entityId,
        description,
        semantic_tags: semanticTags,
        priority: priorityForNeed(preferredRenderKind),
      });
    }
  }

  return {
    schema_version: "myway_resolved_visual_learning_turn_v1",
    source_output_valid: validation.valid,
    render_bindings: renderBindings,
    queued_asset_needs: queuedAssetNeeds,
    validation,
  };
}
