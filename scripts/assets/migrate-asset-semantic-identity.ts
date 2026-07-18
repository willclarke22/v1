import { loadEnvConfig } from "@next/env";

import {
  loadMyWayAssetRegistry,
  saveMyWayAssetRegistry,
} from "../../sandbox/probe-lab/assets/asset-library.server";

loadEnvConfig(process.cwd());

async function main() {
  const registry =
    await loadMyWayAssetRegistry();

  for (const asset of registry.assets) {
    if (
      asset.semantic_review_status === "mismatch" ||
      asset.semantic_review_status === "rejected"
    ) {
      asset.scene_review_status = "pending";
      asset.scene_reviewed_at = null;
    }
  }

  await saveMyWayAssetRegistry(registry);

  const summary = registry.assets.reduce(
    (counts, asset) => {
      const semantic =
        asset.semantic_review_status ??
        "pending";
      counts[semantic] =
        (counts[semantic] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        schema_version:
          "myway_asset_semantic_identity_migration_v1",
        asset_count: registry.assets.length,
        semantic_review_counts: summary,
        note:
          "Requested concepts were preserved as provenance. Existing source-title conflicts were marked mismatch; scene-approved records with compatible source titles were backfilled as verified.",
      },
      null,
      2,
    ),
  );
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ?? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
