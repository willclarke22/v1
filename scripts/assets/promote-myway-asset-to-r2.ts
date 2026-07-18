import { loadEnvConfig } from "@next/env";

import { promoteMyWayAssetToR2 } from "../../sandbox/probe-lab/assets/asset-promotion.server";

loadEnvConfig(process.cwd());

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0
    ? process.argv[index + 1] ?? null
    : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const assetId = argument("--asset-id");
  const reviewFile = argument("--review-file");

  if (!assetId) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/assets/promote-myway-asset-to-r2.ts --asset-id <asset-id> [--review-file <review.json>] [--archive-source]",
    );
  }

  const result = await promoteMyWayAssetToR2({
    assetId,
    reviewFile,
    archiveSource: hasFlag("--archive-source"),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        asset_id: result.asset.asset_id,
        already_promoted: result.already_promoted,
        public_path: result.asset.public_path,
        thumbnail_path: result.asset.thumbnail_path,
        storage_object_key:
          result.asset.storage_object_key,
        source_object_key:
          result.asset.source_object_key,
      },
      null,
      2,
    ),
  );
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
