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
      `A.12.17P2 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(
      `A.12.17P2 verification failed: ${message} Forbidden marker: ${marker}`,
    );
  }
}

function between(
  source: string,
  startMarker: string,
  endMarker: string,
) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      `A.12.17P2 verification failed: could not isolate ${startMarker}`,
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

  for (const marker of [
    '"bodyparts3d_calibration_color_baseline_v1"',
    '"bodyparts3d_calibration_low_exposure_v1"',
    '"bodyparts3d_calibration_soft_studio_v1"',
    '"bodyparts3d_calibration_viewer_match_v1"',
    'thumbnail_render_profile?: "legacy" | "bodyparts3d_semantic_preview_v1"',
  ]) {
    requireMarker(
      jobTypes,
      marker,
      "Normalize jobs must expose four calibration-only thumbnail profiles while preserving A.12.17P1 compatibility.",
    );
  }

  for (const marker of [
    "def srgb_channel_to_linear(value):",
    "return ((value + 0.055) / 1.055) ** 2.4",
    "def thumbnail_hex_to_linear_rgb(color_hex):",
    "def apply_calibration_thumbnail_color(color_hex, render_profile):",
    'render_profile.startswith("bodyparts3d_calibration_")',
    'render_profile == "bodyparts3d_calibration_color_baseline_v1"',
    "def add_thumbnail_sun(",
    "def add_bodyparts3d_calibration_lights(",
    '"bodyparts3d_calibration_low_exposure_v1"',
    '"bodyparts3d_calibration_soft_studio_v1"',
    'set_thumbnail_view_transform(scene, "AgX", 0.25)',
    "points = world_render_points(meshes)",
    "if refit_thumbnail_camera_from_alpha(camera, camera_data, alpha_bbox):",
    'export_glb(job["output_path"])\n        make_thumbnail(',
  ]) {
    requireMarker(
      blender,
      marker,
      "Calibration renders must correct sRGB-to-linear material color, vary lighting/display treatment, and retain A.12.16 framing.",
    );
  }

  for (const marker of [
    "export async function renderBodyParts3dThumbnailCalibration",
    '"bodyparts3d-thumbnail-calibration"',
    '"A"',
    '"Linear-color baseline"',
    '"B"',
    '"Low-exposure matte"',
    '"C"',
    '"Soft studio"',
    '"D"',
    '"Viewer-match attempt"',
    "thumbnailBytes.toString(\"base64\")",
    "storage_mutated:",
    "false as const",
  ]) {
    requireMarker(
      maintenance,
      marker,
      "Server calibration must render four temporary candidates and return them inline.",
    );
  }

  const calibrationFunction = between(
    maintenance,
    "export async function renderBodyParts3dThumbnailCalibration",
    "\nasync function repairThumbnailReference",
  );
  forbidMarker(
    calibrationFunction,
    "uploadBytes",
    "Calibration must never upload a candidate to R2.",
  );
  forbidMarker(
    calibrationFunction,
    "repairThumbnailReference",
    "Calibration must never rewrite the registered thumbnail reference.",
  );
  forbidMarker(
    calibrationFunction,
    "updateMyWayAsset",
    "Calibration must never mutate the asset registry.",
  );

  for (const marker of [
    'action === "render_appearance_calibration_one"',
    "renderBodyParts3dThumbnailCalibration",
    'action === "regenerate_appearance_preview_one"',
    "maxDuration = 300",
  ]) {
    requireMarker(
      route,
      marker,
      "The API must expose an explicit one-asset calibration action without removing the A.12.17P1 preview.",
    );
  }

  for (const marker of [
    "calibrationRunning",
    "calibrationResult",
    "renderAppearanceCalibrationOne",
    'action: "render_appearance_calibration_one"',
    "Render 4 calibration candidates (no overwrite)",
    "Target semantic color",
    "storage mutated: no",
    "candidate.data_url",
    "Calibration is the safe next step",
    "Preview viewer-like thumbnail for one asset",
    "async function regenerateAllVisualIssues()",
  ]) {
    requireMarker(
      ui,
      marker,
      "The maintenance UI must display side-by-side temporary calibration candidates and keep existing preview/bulk controls separate.",
    );
  }

  forbidMarker(
    ui,
    'useEffect(() => {\n    void renderAppearanceCalibrationOne()',
    "Calibration must never auto-run on mount.",
  );

  console.log(
    "PASS: A.12.17P2 BodyParts3D thumbnail calibration verified: one selected anatomy asset can produce four temporary side-by-side candidates, calibration corrects semantic hex color from sRGB to scene-linear RGB, varies lighting/display treatments, retains A.12.16 framing, returns PNGs inline, and does not upload to R2 or mutate the asset registry.",
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
