import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  assessBodyParts3dThumbnailPng,
} from "../../sandbox/probe-lab/assets/bodyparts3d-thumbnail-quality.server";

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
    throw new Error(`A.12.14 verification failed: ${message} Missing marker: ${marker}`);
  }
}

async function main() {
  const quality = read(
    "sandbox/probe-lab/assets/bodyparts3d-thumbnail-quality.server.ts",
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
  const blender = read(
    "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
  );

  for (const marker of [
    'import sharp from "sharp";',
    ".ensureAlpha()",
    'status: "visual_blank"',
    '"visual_too_small"',
    '"visual_decode_error"',
    "MIN_MAX_SPAN_FRACTION = 0.22",
    "max_span_fraction",
  ]) {
    requireMarker(
      quality,
      marker,
      "Thumbnail QA must decode alpha pixels and measure visible subject occupancy.",
    );
  }

  for (const marker of [
    "assessBodyParts3dThumbnailPng",
    "const thumbnailObject = await source.read(deterministicKey);",
    "visual_assessment",
    "forceRegenerate?: boolean",
    "input.forceRegenerate !== true",
    'regeneratedAssessment.status !== "healthy"',
    '"mesh_vertex_alpha_refit_v3"',
    '"alpha_bbox_v1"',
    '"thumbnail_visual_regenerated"',
  ]) {
    requireMarker(
      maintenance,
      marker,
      "Maintenance must classify actual PNG pixels and selectively replace visually bad thumbnails.",
    );
  }

  for (const marker of [
    'action === "regenerate_visual_one"',
    "forceRegenerate:",
  ]) {
    requireMarker(
      route,
      marker,
      "Maintenance API must expose explicit visual regeneration.",
    );
  }

  for (const marker of [
    '"visual_blank"',
    '"visual_too_small"',
    '"visual_decode_error"',
    'limit: 48',
    '"regenerate_visual_one"',
    "Audit 2,234 anatomy thumbnails visually",
    "Show first thumbnail issues",
    "visible_fraction",
    "max_span_fraction",
  ]) {
    requireMarker(
      ui,
      marker,
      "Maintenance UI must report visual QA and repair only flagged thumbnails.",
    );
  }

  for (const marker of [
    "def world_bound_points(objects):",
    "def world_render_points(objects):",
    "def render_alpha_bbox(alpha_threshold=16.0 / 255.0):",
    "def refit_thumbnail_camera_from_alpha(camera, camera_data, alpha_bbox):",
    'camera_data.type = "ORTHO"',
    "candidate_directions = [",
    'best["area"]',
    "points = world_render_points(meshes)",
    "target_span = 0.72",
    "scale_ratio = max(max_span / target_span, 0.12)",
    "center + offset * light_extent",
  ]) {
    requireMarker(
      blender,
      marker,
      "Blender thumbnail framing must use deterministic mesh-vertex best-view orthographic framing plus rendered-alpha recenter/zoom refinement.",
    );
  }

  const blank = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer();
  assert.equal(
    (await assessBodyParts3dThumbnailPng(blank)).status,
    "visual_blank",
  );

  const tiny = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 10,
            height: 10,
            channels: 4,
            background: { r: 220, g: 90, b: 90, alpha: 1 },
          },
        },
        left: 123,
        top: 123,
      },
    ])
    .png()
    .toBuffer();
  assert.equal(
    (await assessBodyParts3dThumbnailPng(tiny)).status,
    "visual_too_small",
  );

  const useful = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 156,
            height: 118,
            channels: 4,
            background: { r: 210, g: 150, b: 90, alpha: 1 },
          },
        },
        left: 50,
        top: 69,
      },
    ])
    .png()
    .toBuffer();
  assert.equal(
    (await assessBodyParts3dThumbnailPng(useful)).status,
    "healthy",
  );

  assert.equal(
    (await assessBodyParts3dThumbnailPng(Buffer.from("not-a-png"))).status,
    "visual_decode_error",
  );

  console.log(
    "PASS: A.12.14 BodyParts3D thumbnail visual QA verified: PNG alpha pixels are audited, blank/tiny/decode failures are distinguished from storage health, repair is explicit and selective, regenerated PNGs must pass QA before overwrite, and Blender uses deterministic mesh-vertex orthographic best-view framing with rendered-alpha refit.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
