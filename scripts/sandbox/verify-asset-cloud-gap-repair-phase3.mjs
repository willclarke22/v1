import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const helper = await readFile(
  path.join(
    root,
    "sandbox/probe-lab/assets/storage/asset-cloud-gap-repair.server.ts",
  ),
  "utf8",
);
const cli = await readFile(
  path.join(
    root,
    "scripts/sandbox/repair-asset-cloud-gaps-phase3.ts",
  ),
  "utf8",
);

assert.match(
  helper,
  /REPAIR_MISSING_R2_ASSET_OBJECTS/,
);
assert.match(
  helper,
  /runtime\/models\/\$\{asset\.source_type\}/,
);
assert.match(
  helper,
  /runtime\/thumbnails\/\$\{asset\.asset_id\}/,
);
assert.match(
  helper,
  /runtime\/analysis\/\$\{asset\.asset_id\}/,
);
assert.match(
  helper,
  /ensureDurableAssetJson/,
);
assert.match(
  helper,
  /archivePrivateAssetSource/,
);
assert.doesNotMatch(
  helper,
  /\brm\s*\(/,
  "Repair helper must not delete local files.",
);
assert.match(
  cli,
  /Dry run only\. No R2 objects or registry records were changed\./,
);
assert.match(
  cli,
  /--apply/,
);
assert.match(
  cli,
  /--confirm=/,
);

console.log(
  "Phase 3 cloud-gap repair verifier passed: dry-run first, explicit apply confirmation, runtime/thumbnail/analysis/source/metadata repair paths, and no local deletion are present.",
);
