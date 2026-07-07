import type {
  VisualAssetRecord,
  VisualAssetRenderRole,
  VisualAssetType,
  VisualExperienceAssetRequest,
  VisualExperienceAssetUse,
  VisualExperienceCompilerOutput,
  VisualExperienceMode,
  VisualExperienceScenePlan,
  VisualExperienceValidationReport,
  VisualExperienceValidationResult,
  VisualRendererCapabilities,
  VisualSceneAction,
  VisualSceneBeat,
  VisualSceneEntity,
} from "./schema";

const MAX_TITLE_CHARS = 140;
const MAX_ORIENTATION_CHARS = 1600;
const MAX_TAKEAWAY_CHARS = 700;
const MAX_CHECK_PROMPT_CHARS = 700;
const MAX_ASSET_USES = 8;
const MAX_ASSET_REQUESTS = 8;
const MAX_ENTITIES = 24;
const MAX_BEATS = 12;
const MAX_ACTIONS_PER_BEAT = 24;

const RENDER_ROLES: VisualAssetRenderRole[] = [
  "reference_object",
  "opening_context",
  "zoom_context",
  "zoom_target",
  "scene_environment",
  "process_part",
  "token",
  "label_anchor",
  "background",
  "material",
  "lighting",
  "other",
];

const ASSET_TYPES: VisualAssetType[] = ["glb", "gltf", "texture", "hdri", "primitive"];
const EXPERIENCE_MODES: VisualExperienceMode[] = [
  "asset_preview",
  "model_selected_scene",
  "visual_story",
  "body_zoom",
  "cell_cutaway",
  "process_loop",
  "mechanism",
  "compare_contrast",
  "spatial_structure",
  "generic_scene",
];

const ACTION_TYPES: VisualSceneAction["type"][] = [
  "show_asset",
  "highlight_asset",
  "move_camera",
  "show_label",
  "trace_path",
  "show_relationship",
  "fade_in",
  "fade_out",
  "pause_for_check",
];

const PRIMITIVE_FALLBACKS: NonNullable<VisualSceneEntity["primitive_fallback"]>[] = [
  "sphere",
  "box",
  "arrow",
  "path",
  "label",
  "particle",
  "none",
];

const VISUAL_STYLES: VisualExperienceScenePlan["visual_style"][] = [
  "simple_preview",
  "diagrammatic",
  "cinematic_learning",
  "minimal_story",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function compactString(value: unknown, fallback: string, maxChars: number, notes: string[], label: string) {
  const text = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

  if (text.length > maxChars) {
    notes.push(`${label} was trimmed to ${maxChars} characters.`);
    return text.slice(0, maxChars).trim();
  }

  return text;
}

function optionalString(value: unknown, maxChars: number, notes: string[], label: string) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return compactString(value, "", maxChars, notes, label);
}

function stringArray(value: unknown, maxItems = 24, maxChars = 120) {
  if (!Array.isArray(value)) return [];

  return unique(
    value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().slice(0, maxChars)),
  ).slice(0, maxItems);
}

function sanitizeId(value: unknown, fallback: string, notes: string[], label: string) {
  const raw = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  const safe = cleaned || fallback;
  if (safe !== raw) notes.push(`${label} id was normalized from "${raw}" to "${safe}".`);

  return safe;
}

function uniqueId(base: string, used: Set<string>) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  const next = `${base}_${index}`;
  used.add(next);
  return next;
}

function tuple3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;

  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

  return [
    Math.max(-100, Math.min(100, x)),
    Math.max(-100, Math.min(100, y)),
    Math.max(-100, Math.min(100, z)),
  ];
}

function normalizeFromList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  notes: string[],
  label: string,
): T {
  if (typeof value === "string" && allowed.includes(value as T)) return value as T;

  if (typeof value === "string" && value.trim().length > 0) {
    notes.push(`${label} "${value}" is not supported; using "${fallback}".`);
  }

  return fallback;
}

function clampDuration(value: unknown, notes: string[], beatId: string) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    notes.push(`${beatId} duration was missing or invalid; using 4500ms.`);
    return 4500;
  }

  const clamped = Math.max(800, Math.min(20000, Math.round(numberValue)));
  if (clamped !== numberValue) notes.push(`${beatId} duration was clamped to ${clamped}ms.`);

  return clamped;
}

function blankValidationReport(): VisualExperienceValidationReport {
  return {
    valid: false,
    fatal_errors: [],
    warnings: [],
    missing_asset_ids: [],
    unsupported_asset_types: [],
    unsupported_experience_modes: [],
    scene_plan_warnings: [],
    used_asset_ids: [],
    unknown_entity_ids: [],
    invalid_action_targets: [],
    normalization_notes: [],
  };
}

function fallbackOutput(): VisualExperienceCompilerOutput {
  return {
    schema_version: "myway_visual_experience_compiler_output_v1",
    title: "Visual experience draft needs repair",
    orientation:
      "MyWay received a visual experience draft, but it needs repair before it can safely render.",
    target_takeaway:
      "The renderer should only receive validated asset ids, safe scene entities, and bounded scene actions.",
    experience_mode: "model_selected_scene",
    asset_uses: [],
    asset_requests: [],
    scene_plan: {
      renderer: "react_three_fiber_sandbox",
      visual_style: "simple_preview",
      entities: [],
      beats: [],
      camera_notes: null,
      interaction_notes: null,
    },
    check_prompt: null,
  };
}

function normalizeAssetUses(input: {
  value: unknown;
  assetIds: Set<string>;
  report: VisualExperienceValidationReport;
}) {
  if (!Array.isArray(input.value)) return [];

  const usedIds = new Set<string>();

  return input.value
    .slice(0, MAX_ASSET_USES)
    .map((raw, index): VisualExperienceAssetUse | null => {
      if (!isRecord(raw)) {
        input.report.warnings.push(`asset_uses[${index}] was ignored because it was not an object.`);
        return null;
      }

      const assetId = typeof raw.asset_id === "string" ? raw.asset_id.trim() : "";
      if (!assetId) {
        input.report.warnings.push(`asset_uses[${index}] was ignored because it had no asset_id.`);
        return null;
      }

      if (!input.assetIds.has(assetId)) {
        input.report.missing_asset_ids.push(assetId);
        input.report.fatal_errors.push(`asset_uses[${index}] references unknown asset_id "${assetId}".`);
        return null;
      }

      if (usedIds.has(assetId)) {
        input.report.normalization_notes.push(`Duplicate asset use for "${assetId}" was collapsed.`);
        return null;
      }

      usedIds.add(assetId);
      input.report.used_asset_ids.push(assetId);

      return {
        asset_id: assetId,
        role: normalizeFromList(raw.role, RENDER_ROLES, "reference_object", input.report.normalization_notes, "asset use role"),
        purpose: compactString(
          raw.purpose,
          "Use this registered asset as a safe visual anchor.",
          500,
          input.report.normalization_notes,
          `asset_uses[${index}].purpose`,
        ),
        beat_id: optionalString(raw.beat_id, 120, input.report.normalization_notes, `asset_uses[${index}].beat_id`),
      };
    })
    .filter((item): item is VisualExperienceAssetUse => Boolean(item));
}

function normalizeAssetRequests(input: {
  value: unknown;
  rendererCapabilities: VisualRendererCapabilities;
  report: VisualExperienceValidationReport;
}) {
  if (!Array.isArray(input.value)) return [];

  const supportedTypes = new Set(input.rendererCapabilities.supported_asset_types);
  const usedIds = new Set<string>();

  return input.value
    .slice(0, MAX_ASSET_REQUESTS)
    .map((raw, index): VisualExperienceAssetRequest | null => {
      if (!isRecord(raw)) {
        input.report.warnings.push(`asset_requests[${index}] was ignored because it was not an object.`);
        return null;
      }

      const needId = uniqueId(
        sanitizeId(raw.need_id, `asset_need_${index + 1}`, input.report.normalization_notes, `asset_requests[${index}].need_id`),
        usedIds,
      );
      const requestedType = normalizeFromList(
        raw.preferred_asset_type,
        ASSET_TYPES,
        "glb",
        input.report.normalization_notes,
        `asset_requests[${index}].preferred_asset_type`,
      );

      if (!supportedTypes.has(requestedType)) {
        input.report.unsupported_asset_types.push(requestedType);
        input.report.warnings.push(`asset_requests[${index}] asks for unsupported asset type "${requestedType}".`);
      }

      return {
        need_id: needId,
        description: compactString(
          raw.description,
          "A missing asset that would make the visual experience clearer.",
          700,
          input.report.normalization_notes,
          `asset_requests[${index}].description`,
        ),
        semantic_tags: stringArray(raw.semantic_tags, 16, 80),
        preferred_asset_type: requestedType,
        required: raw.required === true,
        fallback_strategy: normalizeFromList(
          raw.fallback_strategy,
          ["use_primitive", "use_generic_asset", "skip"] as const,
          "use_primitive",
          input.report.normalization_notes,
          `asset_requests[${index}].fallback_strategy`,
        ),
      };
    })
    .filter((item): item is VisualExperienceAssetRequest => Boolean(item));
}

function normalizeEntities(input: {
  value: unknown;
  assetIds: Set<string>;
  report: VisualExperienceValidationReport;
}) {
  const rawEntities = Array.isArray(input.value) ? input.value.slice(0, MAX_ENTITIES) : [];
  const usedEntityIds = new Set<string>();
  const assetIdsReferencedByScene = new Set<string>();

  const entities = rawEntities
    .map((raw, index): VisualSceneEntity | null => {
      if (!isRecord(raw)) {
        input.report.scene_plan_warnings.push(`scene_plan.entities[${index}] was ignored because it was not an object.`);
        return null;
      }

      const id = uniqueId(
        sanitizeId(raw.id, `entity_${index + 1}`, input.report.normalization_notes, `scene_plan.entities[${index}].id`),
        usedEntityIds,
      );

      const rawAssetId = typeof raw.asset_id === "string" && raw.asset_id.trim().length > 0 ? raw.asset_id.trim() : null;
      const asset_id = rawAssetId && input.assetIds.has(rawAssetId) ? rawAssetId : null;

      if (rawAssetId && !asset_id) {
        input.report.missing_asset_ids.push(rawAssetId);
        input.report.fatal_errors.push(`scene_plan.entities[${index}] references unknown asset_id "${rawAssetId}".`);
        input.report.scene_plan_warnings.push(`Removed missing asset_id "${rawAssetId}" from entity "${id}".`);
      }

      if (asset_id) {
        assetIdsReferencedByScene.add(asset_id);
        input.report.used_asset_ids.push(asset_id);
      }

      return {
        id,
        display_name: compactString(
          raw.display_name,
          id.replace(/_/g, " "),
          140,
          input.report.normalization_notes,
          `scene_plan.entities[${index}].display_name`,
        ),
        semantic_role: compactString(
          raw.semantic_role,
          "visible part of the explanation",
          400,
          input.report.normalization_notes,
          `scene_plan.entities[${index}].semantic_role`,
        ),
        asset_id,
        primitive_fallback: normalizeFromList(
          raw.primitive_fallback,
          PRIMITIVE_FALLBACKS,
          asset_id ? "none" : "sphere",
          input.report.normalization_notes,
          `scene_plan.entities[${index}].primitive_fallback`,
        ),
        position_hint: tuple3(raw.position_hint),
      };
    })
    .filter((item): item is VisualSceneEntity => Boolean(item));

  return { entities, entityIds: usedEntityIds, assetIdsReferencedByScene };
}

function normalizeAction(input: {
  raw: unknown;
  index: number;
  beatId: string;
  entityIds: Set<string>;
  assetIds: Set<string>;
  report: VisualExperienceValidationReport;
}): VisualSceneAction | null {
  if (!isRecord(input.raw)) {
    input.report.scene_plan_warnings.push(`${input.beatId}.actions[${input.index}] was ignored because it was not an object.`);
    return null;
  }

  const actionId = sanitizeId(
    input.raw.id,
    `${input.beatId}_action_${input.index + 1}`,
    input.report.normalization_notes,
    `${input.beatId}.actions[${input.index}].id`,
  );

  const targetEntityId =
    typeof input.raw.target_entity_id === "string" && input.raw.target_entity_id.trim().length > 0
      ? input.raw.target_entity_id.trim()
      : null;

  const safeTargetEntityId = targetEntityId && input.entityIds.has(targetEntityId) ? targetEntityId : null;

  if (targetEntityId && !safeTargetEntityId) {
    input.report.invalid_action_targets.push(`${input.beatId}:${actionId}->${targetEntityId}`);
    input.report.unknown_entity_ids.push(targetEntityId);
    input.report.scene_plan_warnings.push(`${input.beatId}.actions[${input.index}] referenced missing target_entity_id "${targetEntityId}".`);
  }

  const rawAssetId =
    typeof input.raw.asset_id === "string" && input.raw.asset_id.trim().length > 0 ? input.raw.asset_id.trim() : null;
  const safeAssetId = rawAssetId && input.assetIds.has(rawAssetId) ? rawAssetId : null;

  if (rawAssetId && !safeAssetId) {
    input.report.missing_asset_ids.push(rawAssetId);
    input.report.fatal_errors.push(`${input.beatId}.actions[${input.index}] references unknown asset_id "${rawAssetId}".`);
    input.report.scene_plan_warnings.push(`Removed missing asset_id "${rawAssetId}" from ${input.beatId}.actions[${input.index}].`);
  }

  if (safeAssetId) input.report.used_asset_ids.push(safeAssetId);

  return {
    id: actionId,
    type: normalizeFromList(
      input.raw.type,
      ACTION_TYPES,
      safeAssetId ? "show_asset" : "show_label",
      input.report.normalization_notes,
      `${input.beatId}.actions[${input.index}].type`,
    ),
    target_entity_id: safeTargetEntityId,
    asset_id: safeAssetId,
    narration: optionalString(input.raw.narration, 500, input.report.normalization_notes, `${input.beatId}.actions[${input.index}].narration`),
    params: isRecord(input.raw.params) ? input.raw.params : null,
  };
}

function normalizeBeats(input: {
  value: unknown;
  entityIds: Set<string>;
  assetIds: Set<string>;
  report: VisualExperienceValidationReport;
}) {
  const rawBeats = Array.isArray(input.value) ? input.value.slice(0, MAX_BEATS) : [];
  const usedBeatIds = new Set<string>();

  return rawBeats
    .map((raw, index): VisualSceneBeat | null => {
      if (!isRecord(raw)) {
        input.report.scene_plan_warnings.push(`scene_plan.beats[${index}] was ignored because it was not an object.`);
        return null;
      }

      const id = uniqueId(
        sanitizeId(raw.id, `beat_${index + 1}`, input.report.normalization_notes, `scene_plan.beats[${index}].id`),
        usedBeatIds,
      );

      const activeEntityIds = stringArray(raw.active_entity_ids, 16, 80).filter((entityId) => {
        if (input.entityIds.has(entityId)) return true;
        input.report.unknown_entity_ids.push(entityId);
        input.report.scene_plan_warnings.push(`${id}.active_entity_ids references missing entity "${entityId}".`);
        return false;
      });

      const activeAssetIds = stringArray(raw.active_asset_ids, 16, 100).filter((assetId) => {
        if (input.assetIds.has(assetId)) {
          input.report.used_asset_ids.push(assetId);
          return true;
        }
        input.report.missing_asset_ids.push(assetId);
        input.report.fatal_errors.push(`${id}.active_asset_ids references unknown asset_id "${assetId}".`);
        input.report.scene_plan_warnings.push(`${id}.active_asset_ids removed missing asset_id "${assetId}".`);
        return false;
      });

      const rawActions = Array.isArray(raw.actions) ? raw.actions.slice(0, MAX_ACTIONS_PER_BEAT) : [];
      const actions = rawActions
        .map((action, actionIndex) =>
          normalizeAction({
            raw: action,
            index: actionIndex,
            beatId: id,
            entityIds: input.entityIds,
            assetIds: input.assetIds,
            report: input.report,
          }),
        )
        .filter((action): action is VisualSceneAction => Boolean(action));

      return {
        id,
        title: compactString(raw.title, `Beat ${index + 1}`, 140, input.report.normalization_notes, `${id}.title`),
        script_segment: compactString(
          raw.script_segment,
          "Show one clear part of the visual explanation.",
          700,
          input.report.normalization_notes,
          `${id}.script_segment`,
        ),
        duration_ms: clampDuration(raw.duration_ms, input.report.normalization_notes, id),
        active_entity_ids: activeEntityIds,
        active_asset_ids: activeAssetIds,
        actions,
      };
    })
    .filter((item): item is VisualSceneBeat => Boolean(item));
}

function normalizeScenePlan(input: {
  value: unknown;
  assetIds: Set<string>;
  report: VisualExperienceValidationReport;
}): VisualExperienceScenePlan {
  const rawPlan = isRecord(input.value) ? input.value : {};

  if (!isRecord(input.value)) {
    input.report.scene_plan_warnings.push("scene_plan was missing or invalid; using an empty safe scene plan.");
  }

  const { entities, entityIds } = normalizeEntities({
    value: rawPlan.entities,
    assetIds: input.assetIds,
    report: input.report,
  });

  const beats = normalizeBeats({
    value: rawPlan.beats,
    entityIds,
    assetIds: input.assetIds,
    report: input.report,
  });

  if (entities.length === 0) {
    input.report.warnings.push("scene_plan contains no renderable entities.");
  }

  if (beats.length === 0) {
    input.report.warnings.push("scene_plan contains no beats yet.");
  }

  return {
    renderer: "react_three_fiber_sandbox",
    visual_style: normalizeFromList(
      rawPlan.visual_style,
      VISUAL_STYLES,
      "simple_preview",
      input.report.normalization_notes,
      "scene_plan.visual_style",
    ),
    entities,
    beats,
    camera_notes: optionalString(rawPlan.camera_notes, 700, input.report.normalization_notes, "scene_plan.camera_notes"),
    interaction_notes: optionalString(rawPlan.interaction_notes, 700, input.report.normalization_notes, "scene_plan.interaction_notes"),
  };
}

export function validateAndNormalizeVisualExperienceOutput(input: {
  rawOutput: unknown;
  assets: VisualAssetRecord[];
  rendererCapabilities: VisualRendererCapabilities;
}): VisualExperienceValidationResult {
  const report = blankValidationReport();
  const assetIds = new Set(input.assets.map((asset) => asset.asset_id));
  const supportedExperienceModes = new Set(input.rendererCapabilities.supported_experience_modes);

  if (!isRecord(input.rawOutput)) {
    report.fatal_errors.push("Model output was not a JSON object.");
    report.valid = false;
    return { output: fallbackOutput(), validation: report };
  }

  const raw = input.rawOutput;

  if (raw.schema_version !== "myway_visual_experience_compiler_output_v1") {
    report.fatal_errors.push("Unsupported visual experience output schema_version.");
  }

  const title = compactString(raw.title, "Visual experience draft", MAX_TITLE_CHARS, report.normalization_notes, "title");
  const orientation = compactString(raw.orientation, "This visual experience draft needs a clearer orientation.", MAX_ORIENTATION_CHARS, report.normalization_notes, "orientation");
  const target_takeaway = compactString(raw.target_takeaway, "The learner should leave with one clearer mental picture.", MAX_TAKEAWAY_CHARS, report.normalization_notes, "target_takeaway");

  if (typeof raw.title !== "string" || raw.title.trim().length === 0) report.fatal_errors.push("Output is missing title.");
  if (typeof raw.orientation !== "string" || raw.orientation.trim().length === 0) report.fatal_errors.push("Output is missing orientation.");
  if (typeof raw.target_takeaway !== "string" || raw.target_takeaway.trim().length === 0) report.fatal_errors.push("Output is missing target_takeaway.");

  const rawExperienceMode = typeof raw.experience_mode === "string" ? raw.experience_mode : "model_selected_scene";
  const experience_mode = normalizeFromList(
    rawExperienceMode,
    EXPERIENCE_MODES,
    "model_selected_scene",
    report.normalization_notes,
    "experience_mode",
  );

  if (!supportedExperienceModes.has(experience_mode)) {
    report.unsupported_experience_modes.push(experience_mode);
    report.fatal_errors.push(`Unsupported experience_mode: ${experience_mode}`);
  }

  if (!supportedExperienceModes.has(rawExperienceMode as VisualExperienceMode)) {
    report.unsupported_experience_modes.push(rawExperienceMode);
    if (rawExperienceMode !== experience_mode) {
      report.fatal_errors.push(`Unsupported experience_mode: ${rawExperienceMode}`);
    }
  }

  const asset_uses = normalizeAssetUses({
    value: raw.asset_uses,
    assetIds,
    report,
  });

  const asset_requests = normalizeAssetRequests({
    value: raw.asset_requests,
    rendererCapabilities: input.rendererCapabilities,
    report,
  });

  const scene_plan = normalizeScenePlan({
    value: raw.scene_plan,
    assetIds,
    report,
  });

  if (!asset_uses.length && !asset_requests.length) {
    report.warnings.push("Output uses no registered assets and declares no asset requests.");
  }

  const output: VisualExperienceCompilerOutput = {
    schema_version: "myway_visual_experience_compiler_output_v1",
    title,
    orientation,
    target_takeaway,
    experience_mode,
    asset_uses,
    asset_requests,
    scene_plan,
    check_prompt: optionalString(raw.check_prompt, MAX_CHECK_PROMPT_CHARS, report.normalization_notes, "check_prompt"),
  };

  report.missing_asset_ids = unique(report.missing_asset_ids);
  report.unsupported_asset_types = unique(report.unsupported_asset_types);
  report.unsupported_experience_modes = unique(report.unsupported_experience_modes);
  report.scene_plan_warnings = unique(report.scene_plan_warnings);
  report.used_asset_ids = unique(report.used_asset_ids);
  report.unknown_entity_ids = unique(report.unknown_entity_ids);
  report.invalid_action_targets = unique(report.invalid_action_targets);
  report.normalization_notes = unique(report.normalization_notes);
  report.fatal_errors = unique(report.fatal_errors);
  report.warnings = unique(report.warnings);
  report.valid = report.fatal_errors.length === 0;

  return { output, validation: report };
}

export function validateVisualExperienceOutput(input: {
  output: VisualExperienceCompilerOutput;
  assets: VisualAssetRecord[];
  rendererCapabilities: VisualRendererCapabilities;
}): VisualExperienceValidationReport {
  return validateAndNormalizeVisualExperienceOutput({
    rawOutput: input.output,
    assets: input.assets,
    rendererCapabilities: input.rendererCapabilities,
  }).validation;
}
