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
      `A.12.17P3 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(
      `A.12.17P3 verification failed: ${message} Forbidden marker: ${marker}`,
    );
  }
}

function between(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      `A.12.17P3 verification failed: could not isolate ${startMarker}`,
    );
  }
  return source.slice(start, end);
}

function main() {
  const jobTypes = read(
    "sandbox/probe-lab/assets/blender/blender-job-types.ts",
  );
  const blender = read(
    "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
  );
  const maintenance = read(
    "sandbox/probe-lab/assets/bodyparts3d-thumbnail-maintenance.server.ts",
  );
  const route = read(
    "sandbox/probe-lab/assets/routes/bodyparts3d-thumbnails.ts",
  );
  const ui = read(
    "sandbox/probe-lab/assets/ui/bodyparts3d-thumbnail-maintenance-lab.tsx",
  );

  requireMarker(
    jobTypes,
    '"bodyparts3d_viewer_match_refined_v1"',
    "Normalize jobs must expose the refined viewer-match thumbnail profile.",
  );

  for (const marker of [
    'render_profile == "bodyparts3d_viewer_match_refined_v1"',
    'set_thumbnail_view_transform(scene, "AgX", 0.42)',
    '"ViewerMatchRefinedKey"',
    '"ViewerMatchRefinedFill"',
    '"ViewerMatchRefinedRim"',
    "1.95",
    "1.15",
    "0.38",
    'or render_profile == "bodyparts3d_viewer_match_refined_v1"',
    "apply_calibration_thumbnail_color(color_hex, render_profile)",
    "points = world_render_points(meshes)",
    "if refit_thumbnail_camera_from_alpha(camera, camera_data, alpha_bbox):",
    'export_glb(job["output_path"])\n        make_thumbnail(',
  ]) {
    requireMarker(
      blender,
      marker,
      "The refined profile must use scene-linear semantic color, a brighter/fuller D-derived studio treatment, and retain A.12.16 framing.",
    );
  }

  for (const marker of [
    "viewerMatchRefined?: boolean",
    'input.viewerMatchRefined === true',
    '? "bodyparts3d_viewer_match_refined_v1"',
    '"viewer_match_refined_v1"',
    '"thumbnail_viewer_match_refined_regenerated"',
    'regeneratedAssessment.status !== "healthy"',
    '"mesh_vertex_alpha_refit_v3"',
    '"alpha_bbox_v1"',
  ]) {
    requireMarker(
      maintenance,
      marker,
      "The one-asset refined promotion must still pass QA before overwriting R2 and preserve framing metadata.",
    );
  }

  for (const marker of [
    'action === "regenerate_viewer_match_refined_one"',
    "viewerMatchRefined:",
    'action === "regenerate_appearance_preview_one"',
    'action === "render_appearance_calibration_one"',
    "maxDuration = 300",
  ]) {
    requireMarker(
      route,
      marker,
      "The API must expose the refined one-asset action without removing calibration or earlier preview actions.",
    );
  }

  for (const marker of [
    "refinedRunning",
    "regenerateViewerMatchRefinedOne",
    'action: "regenerate_viewer_match_refined_one"',
    '"thumbnail_viewer_match_refined_regenerated"',
    "Apply refined D to one asset (overwrites thumbnail)",
    "overwrites only",
    "Render 4 calibration candidates (no overwrite)",
    "Preview viewer-like thumbnail for one asset",
    "async function regenerateAllVisualIssues()",
  ]) {
    requireMarker(
      ui,
      marker,
      "The UI must make the storage-mutating refined-D action explicit and keep calibration, legacy preview, and bulk controls separate.",
    );
  }

  const bulkFunction = between(
    ui,
    "async function regenerateAllVisualIssues()",
    "\n\n  return (",
  );
  forbidMarker(
    bulkFunction,
    "regenerate_viewer_match_refined_one",
    "A.12.17P3 must not silently switch bulk regeneration to the refined profile.",
  );
  forbidMarker(
    ui,
    'useEffect(() => {\n    void regenerateViewerMatchRefinedOne()',
    "The refined overwrite must never auto-run on mount.",
  );

  console.log(
    "PASS: A.12.17P3 BodyParts3D refined viewer-match promotion verified: candidate D is promoted only through an explicit one-asset overwrite path, with scene-linear semantic color, slightly brighter AgX/fill-balanced lighting, A.12.16 framing, QA-before-overwrite, and no change to bulk regeneration.",
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
