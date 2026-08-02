import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  normalizeAssetDesignBrief,
} from "../asset-design-brief";
import {
  buildFoundryHelperContractPrompt,
} from "../blender-helper-contract";
import {
  validateBlenderPythonPreflight,
} from "../blender-python-preflight";

async function main() {

const brief = normalizeAssetDesignBrief(
  {
    asset_id: "wheelchair_contract_fixture",
    concept: "stylized manual wheelchair",
    target_extent_m: 1.12,
    max_triangles: 95_000,
    quality_mode: "standard",
    realism: "stylized",
    parts: [
      {
        part_id: "WheelchairFrame",
        semantic_role: "connected tubular frame",
        geometry_strategy: ["tubes"],
        parent_part_id: null,
        connection_strategy: "root",
        material_slot_id: "tubular_frame_metal",
        animation_role: null,
        pivot_requirement: null,
        required: true,
        identifying_features: ["connected rails"],
      },
      {
        part_id: "RearWheel_L",
        semantic_role: "left rear wheel",
        geometry_strategy: ["torus", "spokes"],
        parent_part_id: "WheelchairFrame",
        connection_strategy: "axle",
        material_slot_id: "wheelchair_tire_rubber",
        animation_role: "wheel rotation",
        pivot_requirement: "hub centre",
        required: true,
        identifying_features: ["tire", "rim", "spokes"],
      },
    ],
    material_slots: [
      {
        slot_id: "tubular_frame_metal",
        display_name: "Tubular frame metal",
        assigned_part_ids: ["WheelchairFrame"],
        material_family: "metal",
        intent: "painted tubular metal",
        semantic_tags: ["metal", "frame"],
        color_hint: "dark",
        roughness_hint: "medium",
        metallic_hint: "metallic",
        physical_scale_m: 0.2,
        required_maps: ["base_color", "roughness", "normal_gl"],
        procedural_fallback: {
          color_rgba: [0.08, 0.1, 0.12, 1],
          metallic: 0.75,
          roughness: 0.35,
        },
      },
      {
        slot_id: "wheelchair_tire_rubber",
        display_name: "Wheelchair tire rubber",
        assigned_part_ids: ["RearWheel_L"],
        material_family: "rubber",
        intent: "matte black tire rubber",
        semantic_tags: ["rubber", "tire"],
        color_hint: "black",
        roughness_hint: "high",
        metallic_hint: "nonmetal",
        physical_scale_m: 0.1,
        required_maps: ["base_color", "roughness", "normal_gl"],
        procedural_fallback: {
          color_rgba: [0.02, 0.02, 0.025, 1],
          metallic: 0,
          roughness: 0.82,
        },
      },
    ],
    requirements: {
      uv_required: true,
      rig_required: false,
      collision_required: false,
      ground_contact_required: true,
      animation_ready: true,
      movable_part_ids: ["RearWheel_L"],
    },
  },
  {
    concept: "stylized manual wheelchair",
    target_extent_m: 1.12,
    max_triangles: 95_000,
    quality_mode: "standard",
    style: "clean stylized",
    animation_ready: true,
  },
);

const badCode = `
import bpy
import math

myway_reset_scene()
myway_material_slot("mat_metal_frame")

def make_tube(name, p1, p2, radius):
    return myway_tube_between_points(p1, p2, radius, resolution=12)

def make_box(size):
    return myway_box(size[0], size[1], size[2])

parts = []
parts.append(make_tube("rail", (0, 0, 0), (0, 1, 0), 0.02))
frame = myway_join(parts[0])
tire = myway_torus(0.3, 0.02, major_segments=32, minor_segments=8)
tire.rotation_euler = (math.radians(90), 0, 0)
myway_print_progress("MYWAY_PROGRESS: Building")
myway_normalize_extent(2.0, frame)
`;

const bad = validateBlenderPythonPreflight(
  badCode,
  {
    designBrief: brief,
    enforceDesignBrief: true,
  },
);
assert.equal(bad.valid, false);
const badCodes = new Set(bad.errors.map((item) => item.code));
assert.ok(badCodes.has("unexpected_keyword_argument"));
assert.ok(badCodes.has("constructor_name_missing_or_misplaced"));
assert.ok(badCodes.has("missing_required_argument"));
assert.ok(badCodes.has("unapproved_material_slot"));
assert.ok(badCodes.has("required_part_id_not_declared"));
assert.ok(badCodes.has("hardcoded_target_extent_mismatch"));
assert.ok(
  bad.warnings.some((item) => item.code === "duplicate_progress_prefix"),
);
assert.ok(
  bad.warnings.some((item) => item.code === "torus_x_rotation_orientation_check"),
);
assert.ok(
  bad.errors.length >= 8,
  "Preflight should aggregate related failures instead of stopping at the first helper error.",
);

const goodCode = `
import bpy
import math

myway_reset_scene()
myway_material_slot("tubular_frame_metal")
myway_material_slot("wheelchair_tire_rubber")
rail = myway_tube_between_points(
    "FrameRail_L",
    start=(-0.28, -0.2, 0.48),
    end=(-0.28, 0.2, 0.48),
    radius=0.018,
    vertices=24,
)
frame = myway_join([rail], "WheelchairFrame")
myway_assign_material_slot(frame, "tubular_frame_metal")
tire = myway_torus(
    "RearWheel_L",
    location=(-0.36, 0.0, 0.34),
    major_radius=0.30,
    minor_radius=0.025,
    major_segments=48,
    minor_segments=12,
)
tire.rotation_euler = (0.0, math.radians(90.0), 0.0)
myway_assign_material_slot(tire, "wheelchair_tire_rubber")
myway_parent_keep_transform(tire, frame)
myway_ground_asset(frame)
myway_normalize_extent(1.12, frame)
myway_print_progress("Wheelchair complete")
`;

const good = validateBlenderPythonPreflight(
  goodCode,
  {
    designBrief: brief,
    enforceDesignBrief: true,
  },
);
assert.equal(good.valid, true, JSON.stringify(good.errors, null, 2));
assert.equal(good.errors.length, 0);

const prompt = buildFoundryHelperContractPrompt();
for (const expected of [
  "myway_tube_between_points(name, start, end, radius=0.04, material=None, vertices=32)",
  "myway_box(name, location=(0, 0, 0), dimensions=(1, 1, 1)",
  "myway_join(objects, name)",
  "uses vertices, not resolution",
  "rotate around Y",
]) {
  assert.ok(prompt.includes(expected), `Missing helper-contract prompt term: ${expected}`);
}

const glmSource = await readFile(
  "sandbox/probe-lab/blender-python-builder/glm-blender-python.server.ts",
  "utf8",
);
assert.match(glmSource, /buildFoundryHelperContractPrompt/);
assert.match(glmSource, /repairGeneratedCodeAfterPreflight/);
assert.match(glmSource, /preflight_validation/);

const runnerSource = await readFile(
  "sandbox/probe-lab/blender-python-builder/blender-python-runner.server.ts",
  "utf8",
);
assert.match(runnerSource, /validateBlenderPythonPreflight/);
assert.match(runnerSource, /formatBlenderPythonPreflightFailure/);

console.log(
  "Foundry exact helper contract, aggregated preflight, and bounded preflight correction fixture passed.",
);
}

void main();
