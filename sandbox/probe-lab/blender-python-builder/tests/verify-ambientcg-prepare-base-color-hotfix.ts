import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const downloader = await readFile(
    "sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-download.server.ts",
    "utf8",
  );
  const service = await readFile(
    "sandbox/probe-lab/blender-python-builder/foundry-resource-service.server.ts",
    "utf8",
  );

  assert.match(downloader, /ambientCgVariantFileExtension/);
  assert.match(downloader, /searchParams\.get\("file"\)/);
  assert.match(downloader, /fileLooksLikeZip/);
  assert.match(downloader, /basecolou\?r/);
  assert.match(downloader, /\"\.webp\"/);
  assert.match(downloader, /Inspected \${files\.length} file\(s\)/);

  assert.match(service, /variantLooksLikeZip/);
  assert.match(service, /catalogMaterialMapRole/);
  assert.match(service, /if \(!family\.compatible\)/);
  assert.match(
    service,
    /slot\.required_maps\.includes\(\s*"base_color"/,
  );

  console.log(
    "AmbientCG prepare/base-color hotfix fixture passed.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
