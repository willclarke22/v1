import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeMyWayAssetRecord,
} from "../../sandbox/probe-lab/assets/normalize-asset-record";
import type {
  MyWayAssetRegistryV2,
} from "../../sandbox/probe-lab/assets/asset-types";

async function main() {
  const registryPath = path.join(
    process.cwd(),
    "sandbox",
    "probe-lab",
    "assets",
    "library",
    "registry.json",
  );
  const raw = JSON.parse(
    await readFile(registryPath, "utf8"),
  ) as {
    schema_version?: string;
    updated_at?: string;
    asset_root_public_url?: string;
    notes?: string | null;
    assets?: unknown[];
  };
  const assets = (raw.assets ?? [])
    .map(normalizeMyWayAssetRecord)
    .filter(
      (
        asset,
      ): asset is NonNullable<typeof asset> =>
        Boolean(asset),
    );
  const registry: MyWayAssetRegistryV2 = {
    schema_version: "myway_asset_registry_v2",
    updated_at: new Date().toISOString(),
    asset_root_public_url:
      "/sandbox-assets/myway",
    notes:
      raw.notes ??
      "Geometry Profile v1 migration. Legacy ratio-only surfaces remain low-confidence and are ignored by the runtime geometry solver.",
    assets,
  };

  await writeFile(
    registryPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );

  const geometryProfiles = assets.filter(
    (asset) => asset.geometry_profile,
  ).length;
  const legacySurfaces = assets.reduce(
    (count, asset) =>
      count +
      (asset.support_surfaces ?? []).filter(
        (surface) =>
          surface.source === "legacy_ratio",
      ).length,
    0,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        assets: assets.length,
        geometry_profiles:
          geometryProfiles,
        legacy_ratio_surfaces:
          legacySurfaces,
        registry_path: registryPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
