import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const cleanupPath = path.join(
  root,
  "sandbox/probe-lab/assets/storage/asset-historical-cleanup.server.ts",
);
const cliPath = path.join(
  root,
  "scripts/sandbox/asset-historical-cleanup-phase3.ts",
);
const readmePath = path.join(
  root,
  "sandbox/probe-lab/assets/storage/README.md",
);

const [cleanup, cli, readme] = await Promise.all([
  readFile(cleanupPath, "utf8"),
  readFile(cliPath, "utf8"),
  readFile(readmePath, "utf8"),
]);

const assertions = [
  [cleanup.includes("safe_to_remove"), "cleanup classifications"],
  [cleanup.includes("needs_review"), "needs-review classification"],
  [cleanup.includes("getR2RuntimeStorage"), "runtime R2 verification"],
  [cleanup.includes("getR2SourceStorage"), "private R2 verification"],
  [cleanup.includes("git") && cleanup.includes("ls-files"), "Git-tracked-file guard"],
  [cleanup.includes("activeBlenderJobState"), "active BlenderKit job guard"],
  [cleanup.includes(".blenderkit-download"), "legacy BlenderKit workspace audit"],
  [cleanup.includes("enrichment") && cleanup.includes("cache"), "legacy enrichment cache audit"],
  [cleanup.includes("runtime_model_copy"), "local runtime-model audit"],
  [cleanup.includes("thumbnail_copy"), "local thumbnail audit"],
  [cleanup.includes("analysis_render_copy"), "local analysis-render audit"],
  [cleanup.includes("source_copy"), "local source-copy audit"],
  [cleanup.includes("durable_metadata_copy"), "local durable-metadata audit"],
  [cleanup.includes("terminal_blender_job"), "terminal Blender-job retention audit"],
  [cleanup.includes("foundry_job_workspace"), "Foundry workspace audit"],
  [cleanup.includes("DELETE_VERIFIED_LOCAL_ASSET_DUPLICATES"), "explicit apply confirmation"],
  [cleanup.includes("isInsideAllowedGeneratedRoot"), "generated-root deletion boundary"],
  [cleanup.includes("MyWayCleanupReports"), "out-of-repo reports"],
  [cli.includes("--apply"), "CLI apply mode"],
  [cli.includes("--confirm"), "CLI confirmation"],
  [readme.includes("Phase 3 historical cleanup"), "Phase 3 README section"],
];

const failures = assertions
  .filter(([ok]) => !ok)
  .map(([, label]) => label);

if (failures.length) {
  throw new Error(
    `Phase 3 verifier failed:\n- ${failures.join("\n- ")}`,
  );
}

if (/runHistoricalLocalAssetCleanup\(\{\s*apply:\s*true/s.test(cleanup)) {
  throw new Error("Phase 3 module must not auto-run destructive cleanup during import.");
}

console.log(
  "Phase 3 historical cleanup verifier passed: dry-run first, R2 verification, Git/active-job guards, explicit apply confirmation, and generated-root deletion boundaries are present.",
);
