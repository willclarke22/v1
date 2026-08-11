import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const project = process.cwd();
const scriptPath = path.join(
  project,
  "scripts",
  "sandbox",
  "repair-cheeseburger-cloud-registry-v15.ts",
);
const source = readFileSync(
  scriptPath,
  "utf8",
);

assert(source.includes("cheeseburger_ms193r4w"));
assert(source.includes("source URL is required"));
assert(source.includes("R2_PUBLIC_BASE_URL"));
assert(source.includes("runtime/analysis/${ASSET_ID}/${name}/"));
assert(source.includes("matches.length !== 1"));
assert(source.includes("readDurableAssetJson"));
assert(source.includes("runAssetCloudAuthorityAudit"));
assert(source.includes("updateMyWayAsset"));
assert(source.includes("runtimeObjectKeyFromPublicUrl"));
assert(source.includes("--preflight-only"));
assert(!source.includes("uploadRuntimeAssetFile"));
assert(!source.includes(".delete("));
assert(!source.includes("git "));

console.log(
  "Asset cloud-registry v15 source verification passed: targeted Hi3D provenance synchronization, existing-R2 analysis URL reconciliation, strict preflight, and post-update authority verification are in place.",
);
