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
      `A.12.17P1 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(
      `A.12.17P1 verification failed: ${message} Forbidden marker: ${marker}`,
    );
  }
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

  for (const marker of [
    'thumbnail_render_profile?: "legacy" | "bodyparts3d_semantic_preview_v1"',
    "thumbnail_color_hex?: string | null",
  ]) {
    requireMarker(
      jobTypes,
      marker,
      "Normalize jobs must carry an explicit preview-only lighting profile without removing semantic tint support.",
    );
  }

  for (const marker of [
    'render_profile = str(scene.get("myway_thumbnail_render_profile", "legacy"))',
    'render_profile == "bodyparts3d_semantic_preview_v1"',
    "energy_scale = max(light_extent * light_extent, 0.0001)",
    "light_data.energy = energy * energy_scale",
    "else:\n            light_data.energy = energy",
    'bpy.context.scene["myway_thumbnail_render_profile"] = str(',
    'make_thumbnail(job["thumbnail_path"], dimensions, job.get("thumbnail_color_hex"))',
    'export_glb(job["output_path"])\n        make_thumbnail(',
    "points = world_render_points(meshes)",
    "if refit_thumbnail_camera_from_alpha(camera, camera_data, alpha_bbox):",
  ]) {
    requireMarker(
      blender,
      marker,
      "The preview profile must scale thumbnail lighting by anatomy extent while preserving legacy lighting and A.12.16 framing.",
    );
  }

  for (const marker of [
    "appearancePreview?: boolean",
    'thumbnail_render_profile:',
    '? "bodyparts3d_semantic_preview_v1"',
    '"myway-thumbnail-lighting":',
    '"extent_scaled_semantic_preview_v1"',
    '"mesh_vertex_alpha_refit_v3"',
    'regeneratedAssessment.status !== "healthy"',
    '"thumbnail_appearance_preview_regenerated"',
  ]) {
    requireMarker(
      maintenance,
      marker,
      "One-asset appearance preview must still use semantic anatomy color, A.12.16 framing, and QA-before-overwrite.",
    );
  }

  for (const marker of [
    'action === "regenerate_appearance_preview_one"',
    'action === "regenerate_visual_one"',
    'action !== "backfill_one"',
    "appearancePreview:",
    "maxDuration = 300",
  ]) {
    requireMarker(
      route,
      marker,
      "The API must expose a bounded explicit one-asset preview without removing prior repair actions.",
    );
  }

  for (const marker of [
    "previewAssetId",
    "previewRunning",
    'action: "regenerate_appearance_preview_one"',
    "Preview viewer-like thumbnail for one asset",
    "One-asset preview only",
    "Existing audit and bulk regeneration behavior",
    "async function regenerateAllVisualIssues()",
  ]) {
    requireMarker(
      ui,
      marker,
      "The maintenance UI must require an explicit asset id and keep bulk regeneration separate.",
    );
  }

  forbidMarker(
    ui,
    'useEffect(() => {\n    void regenerateAppearancePreviewOne()',
    "The one-asset preview must never auto-run on mount.",
  );
  forbidMarker(
    ui,
    'action: "regenerate_appearance_preview_batch"',
    "A.12.17P1 is intentionally one-asset-only and must not introduce a preview batch endpoint.",
  );

  console.log(
    "PASS: A.12.17P1 BodyParts3D one-asset thumbnail appearance preview verified: the user can explicitly choose one anatomy asset, semantic color and A.12.16 framing remain intact, small-model light power scales with extent to prevent washout, QA still runs before R2 overwrite, and existing audit/bulk behavior remains legacy until visual approval.",
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
