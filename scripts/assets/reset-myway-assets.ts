import {
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  ensureAssetDirectories,
  MYWAY_ASSET_REGISTRY_PROJECT_PATH,
  projectPath,
} from "../../sandbox/probe-lab/assets/paths.server";

async function removeIfPresent(relativePath: string) {
  await rm(projectPath(relativePath), {
    recursive: true,
    force: true,
  });
}

async function main() {
  const removalTargets = [
    "public/sandbox-assets/myway",
    "public/sandbox-assets/visual-experience",
    "sandbox/probe-lab/assets/inbox",
    "sandbox/probe-lab/assets/jobs",
    "sandbox/probe-lab/assets/debug",
    "sandbox/probe-lab/assets/library/licenses",
    "sandbox/probe-lab/assets/library/source-records",
    "sandbox/probe-lab/scenes/manifests",
    "sandbox/probe-lab/visual-experience/assets",
  ];

  for (const target of removalTargets) {
    await removeIfPresent(target);
  }

  await removeIfPresent(
    `${MYWAY_ASSET_REGISTRY_PROJECT_PATH}.before-r2-promotion.backup`,
  );
  await removeIfPresent(MYWAY_ASSET_REGISTRY_PROJECT_PATH);

  await ensureAssetDirectories();

  const emptyRegistry = {
    schema_version: "myway_asset_registry_v1",
    updated_at: new Date().toISOString(),
    asset_root_public_url: "/sandbox-assets/myway",
    notes:
      "Clean MyWay asset library. BlendKit intake is CC0-only. Runtime assets are uploaded to Cloudflare R2 only after visual review.",
    assets: [],
  };

  await writeFile(
    projectPath(MYWAY_ASSET_REGISTRY_PROJECT_PATH),
    `${JSON.stringify(emptyRegistry, null, 2)}\n`,
    "utf8",
  );

  await mkdir(
    projectPath(
      "sandbox/probe-lab/assets/library/licenses",
    ),
    { recursive: true },
  );
  await writeFile(
    projectPath(
      "sandbox/probe-lab/assets/library/licenses/README.md",
    ),
    [
      "# MyWay asset license reviews",
      "",
      "Each public runtime asset requires an explicit JSON review.",
      "",
      "BlendKit intake is restricted to exact CC0 results. Royalty Free assets are blocked from standalone public GLB distribution.",
      "",
      "TRELLIS outputs remain sandbox-only until production-use and public-distribution terms are independently confirmed.",
      "",
    ].join("\n"),
    "utf8",
  );

  const registry = JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile(
      projectPath(MYWAY_ASSET_REGISTRY_PROJECT_PATH),
      "utf8",
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        removed_targets: removalTargets,
        registry_assets: registry.assets.length,
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
