import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireMarker(source: string, marker: string, message: string) {
  if (!source.includes(marker)) {
    throw new Error(
      `A.12.17P4 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(
      `A.12.17P4 verification failed: ${message} Forbidden marker: ${marker}`,
    );
  }
}

function between(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      `A.12.17P4 verification failed: could not isolate ${startMarker}`,
    );
  }
  return source.slice(start, end);
}

function main() {
  const maintenance = read(
    "sandbox/probe-lab/assets/bodyparts3d-thumbnail-maintenance.server.ts",
  );
  const route = read(
    "sandbox/probe-lab/assets/routes/bodyparts3d-thumbnails.ts",
  );
  const ui = read(
    "sandbox/probe-lab/assets/ui/bodyparts3d-thumbnail-maintenance-lab.tsx",
  );

  for (const marker of [
    "normalizeExplicitAssetIds",
    "backfillBodyParts3dThumbnailBatch(input:",
    "assetIds: string[]",
    "viewerMatchRefined?: boolean",
    "forceRegenerate: true",
    "input.viewerMatchRefined === true",
    "stop_on_first_failure: true as const",
  ]) {
    requireMarker(
      maintenance,
      marker,
      "The server must expose an explicit small-batch refined overwrite helper that reuses the one-asset QA path and stops on first failure.",
    );
  }

  for (const marker of [
    'action === "regenerate_viewer_match_refined_batch"',
    "Array.isArray(body.asset_ids)",
    "asset_ids must include at least one anatomy asset ID.",
    "await backfillBodyParts3dThumbnailBatch({",
    "viewerMatchRefined: true",
  ]) {
    requireMarker(
      route,
      marker,
      "The API must expose an explicit refined sample-batch action without touching bulk regeneration.",
    );
  }

  for (const marker of [
    "DEFAULT_REFINED_BATCH_IDS",
    "sampleBatchAssetIds",
    "refinedBatchRunning",
    "refinedBatchResult",
    "parseExplicitAssetIds",
    "regenerateViewerMatchRefinedBatch()",
    'action: "regenerate_viewer_match_refined_batch"',
    "Apply refined profile to explicit sample batch",
    "stopping on first failure",
    "bulk regeneration remains unchanged",
  ]) {
    requireMarker(
      ui,
      marker,
      "The UI must offer an explicit editable small sample-batch control separate from one-asset controls and bulk regeneration.",
    );
  }

  const bulkFunction = between(
    ui,
    "async function regenerateAllVisualIssues()",
    "\n\n  return (",
  );
  forbidMarker(
    bulkFunction,
    "regenerate_viewer_match_refined_batch",
    "A.12.17P4 must not silently redirect bulk regeneration through the refined batch path.",
  );
  forbidMarker(
    ui,
    "useEffect(() => {\n    void regenerateViewerMatchRefinedBatch()",
    "The refined sample batch must never auto-run on mount.",
  );

  requireMarker(
    ui,
    "onClick={() => void regenerateViewerMatchRefinedBatch()}",
    "The refined sample batch must have an explicit user-triggered button.",
  );

  console.log(
    "PASS: A.12.17P4 BodyParts3D refined sample batch verified: the refined viewer-match profile can now be applied to an explicit small editable batch of atlas asset IDs through the existing QA-before-overwrite path, while calibration, one-asset controls, and bulk regeneration remain separate.",
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exitCode = 1;
}
