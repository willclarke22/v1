import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const workerPath = path.join(
  root,
  "sandbox/probe-lab/assets/enrichment/asset-enrichment-worker.server.ts",
);
const source = await readFile(workerPath, "utf8");

const failures = [];
function requireText(text, label) {
  if (!source.includes(text)) failures.push(`Missing ${label}: ${text}`);
}
function forbidText(text, label) {
  if (source.includes(text)) failures.push(`Unexpected ${label}: ${text}`);
}

requireText("MYWAY_PUBLIC_ASSET_FILE_ROOT", "fixed public asset filesystem root");
requireText("MYWAY_LOCAL_ANALYSIS_FILE_ROOT", "fixed local analysis root");
requireText("localPublicAssetPath", "opaque local public asset resolver");
requireText("opaqueRuntimeChild", "opaque runtime child helper");
requireText("hashRuntimeFile", "trace-safe runtime hash helper");
requireText("writeRuntimeFile", "trace-safe runtime write helper");
requireText("turbopackIgnore: true", "Turbopack filesystem ignore marker");
requireText('process.cwd(),\n    "public",\n    "sandbox-assets",\n    "myway"', "static MyWay public root");

forbidText("publicUrlToProjectPath", "generic project-root public path resolver");
forbidText("projectPath(", "generic projectPath call");
forbidText("hashFile(", "generic hashFile call");

const pathJoinCount = (source.match(/path\.join\(/g) ?? []).length;
if (pathJoinCount !== 1) {
  failures.push(
    `Expected exactly one path.join() in the enrichment worker (the static public asset root); found ${pathJoinCount}.`,
  );
}

if (failures.length) {
  console.error("Asset enrichment Turbopack boundary v7 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Asset enrichment Turbopack boundary v7 source verification passed: generic project-root/path hashing removed and only one static path.join root remains.",
);
