import registryJson from "./assets/registry.json";

import {
  VISUAL_EXPERIENCE_PUBLIC_ASSET_ROOT,
  VISUAL_EXPERIENCE_REGISTRY_PROJECT_PATH,
  normalizeVisualAssetRecord,
  publicPathToProjectRelativePath,
  scoreVisualAsset,
  toModelAssetSummary,
} from "./assets";

import type {
  VisualAssetFileStats,
  VisualAssetRecord,
  VisualAssetRegistry,
  VisualAssetSelectionInput,
  VisualAssetSummaryForModel,
  VisualAssetWithStats,
} from "./schema";

export function getVisualAssetRegistryPath() {
  return VISUAL_EXPERIENCE_REGISTRY_PROJECT_PATH;
}

function readRegistryJson(): Partial<VisualAssetRegistry> {
  return registryJson as Partial<VisualAssetRegistry>;
}

export async function loadVisualAssetRegistry(): Promise<VisualAssetRegistry> {
  const parsed = readRegistryJson();

  return {
    schema_version: "myway_visual_asset_registry_v1",
    updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
    asset_root_public_url:
      typeof parsed.asset_root_public_url === "string"
        ? parsed.asset_root_public_url
        : VISUAL_EXPERIENCE_PUBLIC_ASSET_ROOT,
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
    assets: Array.isArray(parsed.assets)
      ? parsed.assets.map(normalizeVisualAssetRecord).filter((asset): asset is VisualAssetRecord => Boolean(asset))
      : [],
  };
}

function registeredFileStats(publicPath: string): VisualAssetFileStats {
  return {
    exists: true,
    file_size_bytes: null,
    file_size_label: "registered browser asset",
    project_relative_path: publicPathToProjectRelativePath(publicPath),
  };
}

export async function listVisualAssets(): Promise<VisualAssetWithStats[]> {
  const registry = await loadVisualAssetRegistry();

  return registry.assets
    .map((asset) => ({
      ...asset,
      file_stats:
        asset.asset_type === "primitive"
          ? {
              exists: true,
              file_size_bytes: null,
              file_size_label: "built-in primitive",
              project_relative_path: null,
            }
          : registeredFileStats(asset.public_path),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.display_name.localeCompare(b.display_name));
}

export async function selectAssetsForVisualExperience(
  input: VisualAssetSelectionInput,
): Promise<VisualAssetSummaryForModel[]> {
  const registry = await loadVisualAssetRegistry();
  const maxAssets = input.max_assets ?? 8;

  return registry.assets
    .filter((asset) => asset.safe_to_use_in_sandbox)
    .map((asset) => ({ asset, score: scoreVisualAsset(asset, input) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.display_name.localeCompare(b.asset.display_name))
    .slice(0, maxAssets)
    .map((entry) => toModelAssetSummary(entry.asset));
}
