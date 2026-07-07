import { NextResponse } from "next/server";

import { visualExperienceRendererCapabilities } from "../assets";
import {
  getVisualAssetRegistryPath,
  listVisualAssets,
  loadVisualAssetRegistry,
  selectAssetsForVisualExperience,
} from "../asset-store.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const tags = url.searchParams
    .getAll("tag")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  const registry = await loadVisualAssetRegistry();
  const assets = await listVisualAssets();
  const selected_assets_for_model = await selectAssetsForVisualExperience({
    learner_message: query,
    semantic_tags: tags,
    max_assets: 8,
  });

  const counts = assets.reduce(
    (acc, asset) => {
      acc.total += 1;
      acc.by_domain[asset.domain] = (acc.by_domain[asset.domain] ?? 0) + 1;
      acc.by_license_status[asset.license_status] =
        (acc.by_license_status[asset.license_status] ?? 0) + 1;
      if (asset.file_stats.exists) acc.files_found += 1;
      else acc.files_missing += 1;
      return acc;
    },
    {
      total: 0,
      files_found: 0,
      files_missing: 0,
      by_domain: {} as Record<string, number>,
      by_license_status: {} as Record<string, number>,
    },
  );

  return NextResponse.json({
    ok: true,
    registry_path: getVisualAssetRegistryPath(),
    registry: {
      schema_version: registry.schema_version,
      updated_at: registry.updated_at,
      asset_root_public_url: registry.asset_root_public_url,
      notes: registry.notes,
    },
    renderer_capabilities: visualExperienceRendererCapabilities,
    counts,
    assets,
    selected_assets_for_model,
    note: "Step 3b: registry is loaded from the static sandbox registry JSON. Browser preview remains the source of truth for whether a public asset URL loads correctly.",
  });
}
