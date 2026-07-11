import {
  assetWithFileStats,
  listMyWayAssets,
  loadMyWayAssetRegistry,
} from "@/sandbox/probe-lab/assets/asset-library.server";
import { MYWAY_ASSET_REGISTRY_PROJECT_PATH } from "@/sandbox/probe-lab/assets/paths.server";

import { scoreVisualAsset, toModelAssetSummary } from "./assets";
import type {
  VisualAssetRecord,
  VisualAssetRegistry,
  VisualAssetSelectionInput,
  VisualAssetSummaryForModel,
  VisualAssetWithStats,
} from "./schema";

export function getVisualAssetRegistryPath() {
  return MYWAY_ASSET_REGISTRY_PROJECT_PATH;
}

function toVisualAsset(asset: Awaited<ReturnType<typeof listMyWayAssets>>[number]): VisualAssetRecord {
  const sourceType: VisualAssetRecord["source_type"] =
    asset.source_type === "blenderkit" ? "blenderkit" :
    asset.source_type === "procedural" ? "built_in" :
    asset.source_type === "manual" ? "blender_manual_export" : "self_made";
  return {
    asset_id: asset.asset_id,
    display_name: asset.display_name,
    asset_type: asset.asset_type,
    domain: (["generic", "biology", "chemistry", "physics", "medicine", "math", "law", "coding", "automotive", "plumbing", "other"] as const).includes(asset.domain as never)
      ? asset.domain as VisualAssetRecord["domain"]
      : "other",
    source_type: sourceType,
    public_path: asset.public_path,
    source_path: asset.source_path ?? null,
    license_record_path: asset.license_record_path ?? null,
    semantic_tags: asset.semantic_tags,
    render_roles: ["reference_object"],
    experience_modes: ["asset_preview", "model_selected_scene", "generic_scene"],
    license_kind: asset.license_kind,
    license_status: asset.license_status,
    commercial_use_allowed: asset.commercial_use_allowed,
    raw_redistribution_allowed: asset.raw_redistribution_allowed,
    safe_to_use_in_sandbox: asset.safe_to_use_in_sandbox,
    safe_to_promote_to_app: asset.safe_to_promote_to_app,
    notes: asset.notes ?? null,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  };
}

export async function loadVisualAssetRegistry(): Promise<VisualAssetRegistry> {
  const shared = await loadMyWayAssetRegistry();
  return {
    schema_version: "myway_visual_asset_registry_v1",
    updated_at: shared.updated_at,
    asset_root_public_url: shared.asset_root_public_url,
    notes: "Compatibility view over the shared MyWay asset library.",
    assets: shared.assets.map(toVisualAsset),
  };
}

export async function listVisualAssets(): Promise<VisualAssetWithStats[]> {
  const shared = await listMyWayAssets();
  return Promise.all(shared.map(async (asset) => {
    const stats = await assetWithFileStats(asset);
    return {
      ...toVisualAsset(asset),
      file_stats: {
        exists: stats.file_stats.exists,
        file_size_bytes: stats.file_stats.file_size_bytes,
        file_size_label: stats.file_stats.file_size_bytes == null ? null : `${stats.file_stats.file_size_bytes} bytes`,
        project_relative_path: stats.file_stats.project_relative_path,
      },
    };
  }));
}

export async function selectAssetsForVisualExperience(input: VisualAssetSelectionInput): Promise<VisualAssetSummaryForModel[]> {
  const assets = (await listMyWayAssets()).map(toVisualAsset);
  const maxAssets = input.max_assets ?? 8;
  return assets
    .filter((asset) => asset.safe_to_use_in_sandbox)
    .map((asset) => ({ asset, score: scoreVisualAsset(asset, input) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.display_name.localeCompare(b.asset.display_name))
    .slice(0, maxAssets)
    .map((entry) => toModelAssetSummary(entry.asset));
}
