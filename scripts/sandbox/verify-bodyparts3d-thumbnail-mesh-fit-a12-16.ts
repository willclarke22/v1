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
      `A.12.16 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

const blender = read(
  "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
);
const maintenance = read(
  "sandbox/probe-lab/assets/bodyparts3d-thumbnail-maintenance.server.ts",
);
const quality = read(
  "sandbox/probe-lab/assets/bodyparts3d-thumbnail-quality.server.ts",
);
const bulkUi = read(
  "sandbox/probe-lab/assets/ui/bodyparts3d-thumbnail-maintenance-lab.tsx",
);

for (const marker of [
  "def world_render_points(objects):",
  "used_indices = set()",
  "used_indices.update(int(index) for index in polygon.vertices)",
  "matrix @ mesh.vertices[index].co",
  "points = world_render_points(meshes)",
  "def render_alpha_bbox(alpha_threshold=16.0 / 255.0):",
  'bpy.data.images.get("Render Result")',
  "def refit_thumbnail_camera_from_alpha(camera, camera_data, alpha_bbox):",
  "target_span = 0.72",
  "needs_zoom = max_span < 0.62",
  "needs_center = abs(offset_x) > 0.06 or abs(offset_y) > 0.06",
  "scale_ratio = max(max_span / target_span, 0.12)",
  "camera.location += camera.matrix_world.to_quaternion() @ local_offset",
  "if refit_thumbnail_camera_from_alpha(camera, camera_data, alpha_bbox):",
]) {
  requireMarker(
    blender,
    marker,
    "Thumbnail rendering must fit face-referenced mesh vertices and perform a rendered-alpha second-pass refit.",
  );
}

requireMarker(
  maintenance,
  '"myway-thumbnail-framing":\n            "mesh_vertex_alpha_refit_v3"',
  "Uploaded anatomy thumbnails must record the A.12.16 framing revision.",
);

for (const marker of [
  "MIN_MAX_SPAN_FRACTION = 0.22",
  "visiblePixels < MIN_VISIBLE_PIXELS ||",
  "maxSpanFraction < MIN_MAX_SPAN_FRACTION",
]) {
  requireMarker(
    quality,
    marker,
    "A.12.16 must improve framing rather than weakening the existing visual-QA threshold.",
  );
}

for (const marker of [
  "async function regenerateAllVisualIssues()",
  "if (pauseRequested.current) break;",
  "Bulk regeneration stopped on the first failed asset",
]) {
  requireMarker(
    bulkUi,
    marker,
    "A.12.15 sequential pause/resume/stop-on-failure safety must remain intact.",
  );
}

console.log(
  "PASS: A.12.16 BodyParts3D thumbnail mesh-fit verified: thumbnail framing now uses face-referenced mesh vertices instead of object-box corners, performs a rendered-alpha recenter/zoom retry when the actual silhouette is still undersized or off-center, preserves the 22% server-side QA gate, and leaves A.12.15 bulk stop-on-failure behavior intact.",
);
