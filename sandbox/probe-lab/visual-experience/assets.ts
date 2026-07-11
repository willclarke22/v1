import type {
  VisualAssetRecord,
  VisualAssetSelectionInput,
  VisualAssetSummaryForModel,
  VisualRendererCapabilities,
} from "./schema";

export const VISUAL_EXPERIENCE_PUBLIC_ASSET_ROOT = "/sandbox-assets/myway";

export const VISUAL_EXPERIENCE_REGISTRY_PROJECT_PATH =
  "sandbox/probe-lab/assets/library/registry.json";

export const VISUAL_EXPERIENCE_PUBLIC_PROJECT_PATH =
  "public/sandbox-assets/myway";

export const visualExperienceRendererCapabilities: VisualRendererCapabilities = {
  renderer: "react_three_fiber_sandbox",
  can_load_glb: true,
  can_orbit_camera: true,
  can_show_captions: true,
  can_show_asset_cards: true,
  supported_asset_types: ["glb", "gltf", "texture", "hdri", "primitive"],
  supported_experience_modes: [
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
  ],
};

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .filter((item, index, all) => all.indexOf(item) === index);
}

export function normalizeVisualAssetRecord(raw: unknown): VisualAssetRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const item = raw as Record<string, unknown>;
  const assetId = typeof item.asset_id === "string" ? item.asset_id.trim() : "";
  const publicPath = typeof item.public_path === "string" ? item.public_path.trim() : "";

  if (!assetId || !publicPath) return null;

  const today = new Date().toISOString().slice(0, 10);

  return {
    asset_id: assetId,
    display_name:
      typeof item.display_name === "string" && item.display_name.trim().length > 0
        ? item.display_name.trim()
        : assetId,
    asset_type:
      item.asset_type === "gltf" ||
      item.asset_type === "texture" ||
      item.asset_type === "hdri" ||
      item.asset_type === "primitive"
        ? item.asset_type
        : "glb",
    domain:
      item.domain === "biology" ||
      item.domain === "chemistry" ||
      item.domain === "physics" ||
      item.domain === "medicine" ||
      item.domain === "math" ||
      item.domain === "law" ||
      item.domain === "coding" ||
      item.domain === "automotive" ||
      item.domain === "plumbing" ||
      item.domain === "other"
        ? item.domain
        : "generic",
    source_type:
      item.source_type === "blenderkit" ||
      item.source_type === "blendkit" ||
      item.source_type === "self_made" ||
      item.source_type === "built_in" ||
      item.source_type === "unknown"
        ? item.source_type
        : "blender_manual_export",
    public_path: publicPath,
    source_path: typeof item.source_path === "string" ? item.source_path : null,
    license_record_path:
      typeof item.license_record_path === "string" ? item.license_record_path : null,
    semantic_tags: normalizeStringArray(item.semantic_tags),
    render_roles: normalizeStringArray(item.render_roles) as VisualAssetRecord["render_roles"],
    experience_modes: normalizeStringArray(item.experience_modes) as VisualAssetRecord["experience_modes"],
    license_kind:
      item.license_kind === "cc0" ||
      item.license_kind === "royalty_free" ||
      item.license_kind === "self_owned"
        ? item.license_kind
        : "unknown",
    license_status:
      item.license_status === "recorded" ||
      item.license_status === "sandbox_only" ||
      item.license_status === "app_ready"
        ? item.license_status
        : "needs_review",
    commercial_use_allowed: item.commercial_use_allowed !== false,
    raw_redistribution_allowed: item.raw_redistribution_allowed === true,
    safe_to_use_in_sandbox: item.safe_to_use_in_sandbox !== false,
    safe_to_promote_to_app: item.safe_to_promote_to_app === true,
    notes: typeof item.notes === "string" ? item.notes : null,
    created_at: typeof item.created_at === "string" ? item.created_at : today,
    updated_at: typeof item.updated_at === "string" ? item.updated_at : today,
  };
}

export function toModelAssetSummary(asset: VisualAssetRecord): VisualAssetSummaryForModel {
  return {
    asset_id: asset.asset_id,
    display_name: asset.display_name,
    asset_type: asset.asset_type,
    domain: asset.domain,
    semantic_tags: asset.semantic_tags,
    render_roles: asset.render_roles,
    experience_modes: asset.experience_modes,
    license_status: asset.license_status,
  };
}

function tokenize(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function scoreVisualAsset(asset: VisualAssetRecord, input: VisualAssetSelectionInput) {
  const wanted = new Set<string>();

  for (const token of tokenize(input.topic_label)) wanted.add(token);
  for (const token of tokenize(input.learner_message)) wanted.add(token);
  for (const token of tokenize(input.diagnosis)) wanted.add(token);
  for (const tag of input.semantic_tags ?? []) wanted.add(tag.toLowerCase());

  if (!wanted.size) return asset.safe_to_use_in_sandbox ? 1 : 0;

  const searchable = new Set<string>();
  searchable.add(asset.domain.toLowerCase());
  searchable.add(asset.asset_id.toLowerCase());
  searchable.add(asset.display_name.toLowerCase());
  for (const tag of asset.semantic_tags) searchable.add(tag.toLowerCase());
  for (const role of asset.render_roles) searchable.add(role.toLowerCase());
  for (const mode of asset.experience_modes) searchable.add(mode.toLowerCase());

  let score = 0;
  for (const token of wanted) {
    if (searchable.has(token)) score += 4;
    for (const term of searchable) {
      if (term.includes(token) || token.includes(term)) score += 1;
    }
  }

  if (asset.safe_to_use_in_sandbox) score += 2;

  return score;
}

export function publicPathToProjectRelativePath(publicPath: string) {
  const normalizedPublicPath = publicPath.replace(/\\/g, "/");

  if (!normalizedPublicPath.startsWith(`${VISUAL_EXPERIENCE_PUBLIC_ASSET_ROOT}/`)) {
    return `${VISUAL_EXPERIENCE_PUBLIC_PROJECT_PATH}/__invalid_public_path__`;
  }

  const relativeAssetPath = normalizedPublicPath
    .slice(VISUAL_EXPERIENCE_PUBLIC_ASSET_ROOT.length)
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

  return `${VISUAL_EXPERIENCE_PUBLIC_PROJECT_PATH}/${relativeAssetPath}`;
}
