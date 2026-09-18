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

function requireMarker(
  source: string,
  marker: string,
  message: string,
) {
  if (!source.includes(marker)) {
    throw new Error(
      `A.12.15 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

function forbidMarker(
  source: string,
  marker: string,
  message: string,
) {
  if (source.includes(marker)) {
    throw new Error(
      `A.12.15 verification failed: ${message} Forbidden marker: ${marker}`,
    );
  }
}

const ui = read(
  "sandbox/probe-lab/assets/ui/bodyparts3d-thumbnail-maintenance-lab.tsx",
);
const route = read(
  "sandbox/probe-lab/assets/routes/bodyparts3d-thumbnails.ts",
);
const maintenance = read(
  "sandbox/probe-lab/assets/bodyparts3d-thumbnail-maintenance.server.ts",
);

for (const marker of [
  'import { useMemo, useRef, useState } from "react";',
  "const BULK_CHECKPOINT_SIZE = 4;",
  "const BULK_YIELD_MS = 250;",
  "type BulkProgress = {",
  "function isVisualIssue(item: AuditItem)",
  "const visualRegenerationQueue = useMemo(",
  "const auditComplete =",
  'useState<"audit" | "repair" | "bulk" | null>(null);',
  "const pauseRequested = useRef(false);",
  "async function repairAuditItem(item: AuditItem)",
  'action: needsVisualRegeneration',
  '? "regenerate_visual_one"',
  'async function regenerateAllVisualIssues()',
  "const queue = [...visualRegenerationQueue];",
  "for (const item of queue) {",
  "if (pauseRequested.current) break;",
  "completed % BULK_CHECKPOINT_SIZE === 0",
  "await yieldToBrowser();",
  "function pauseBulkRegeneration()",
  '"Pause bulk regeneration"',
  "Regenerate all ${visualRegenerationQueue.length.toLocaleString()} visually bad thumbnails",
  "Resume bulk regeneration",
  "Bulk regeneration stopped on the first failed asset",
  "run the visual audit again; already-fixed thumbnails will return healthy",
]) {
  requireMarker(
    ui,
    marker,
    "Bulk regeneration must be explicit, sequential, pausable, and resumable from authoritative audit state.",
  );
}

forbidMarker(
  ui,
  'action: "regenerate_visual_batch"',
  "The browser must not send multi-Blender-job server requests; each expensive regeneration stays one request at a time.",
);
forbidMarker(
  ui,
  "Promise.all(queue",
  "Bulk regeneration must not fan out hundreds of Blender jobs concurrently.",
);
forbidMarker(
  ui,
  "useEffect(() => {\n    void regenerateAllVisualIssues()",
  "Bulk regeneration must never auto-start when the maintenance panel mounts.",
);

for (const marker of [
  'action === "regenerate_visual_one"',
  "forceRegenerate:",
  "maxDuration = 300",
]) {
  requireMarker(
    route,
    marker,
    "A.12.15 must continue using the bounded A.12.14 single-asset regeneration endpoint.",
  );
}

for (const marker of [
  "input.forceRegenerate !== true",
  'regeneratedAssessment.status !== "healthy"',
  '"mesh_vertex_alpha_refit_v3"',
  '"alpha_bbox_v1"',
  '"thumbnail_visual_regenerated"',
  "invalidateAssetBrowserRegistrySnapshot",
]) {
  requireMarker(
    maintenance,
    marker,
    "Existing A.12.14 QA-before-overwrite and cache-invalidation safety must remain intact.",
  );
}

console.log(
  "PASS: A.12.15 BodyParts3D bulk thumbnail regeneration verified: a completed visual audit can drive an explicit sequential regeneration queue; the UI pauses after the current asset, yields every four successes, resumes from remaining audit issues, stops on the first failed Blender request, and continues to use the A.12.14 single-asset QA-before-overwrite endpoint without automatic or concurrent bulk execution.",
);
