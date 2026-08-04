import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ASSET_VISUAL_DESCRIPTION_SCHEMA_VERSION,
  normalizeAssetDesignBrief,
  validateAssetDesignBrief,
} from "../asset-design-brief";

async function main() {
  const brief = normalizeAssetDesignBrief(
    {
      concept: "stylized mechanical desk fan",
      asset_id: "mechanical_desk_fan_visual_blueprint",
      asset_class: "mechanical_vehicle",
      axis_dimensions_m: [0.3, 0.17, 0.405],
      silhouette: {
        primary_shapes: [
          "circular cage",
          "stepped round base",
          "slender support column",
        ],
        identifying_features: [
          "three swept blades",
          "side tilt pivots",
        ],
      },
      proportions: [
        "cage diameter is about 74% of total height",
        "base diameter is about 72% of cage diameter",
      ],
      parts: [
        {
          part_id: "weighted_base",
          semantic_role: "weighted circular base",
          geometry_strategy: [
            "lathed stepped profile",
            "wide manufactured bevel",
          ],
          material_slot_id: "painted_metal",
        },
        {
          part_id: "support_column",
          semantic_role: "slender support column",
          geometry_strategy: [
            "tapered cylinder",
            "beveled collars",
          ],
          parent_part_id: "weighted_base",
          connection_strategy:
            "Centered socket and visible upper collar.",
          material_slot_id: "painted_metal",
        },
        {
          part_id: "fan_head",
          semantic_role: "cage, motor and blades",
          geometry_strategy: [
            "concentric wire rings",
            "radial spokes",
            "three swept blade profiles",
          ],
          parent_part_id: "support_column",
          connection_strategy:
            "Supported by a U-shaped yoke with two aligned tilt pivots.",
          material_slot_id: "painted_metal",
        },
      ],
      material_slots: [
        {
          slot_id: "painted_metal",
          display_name: "Painted blue-gray metal",
          assigned_part_ids: [
            "weighted_base",
            "support_column",
            "fan_head",
          ],
          material_family: "painted_metal",
          intent: "satin blue-gray powder coat",
          color_hint: "#687b8b",
          required_maps: ["base_color", "roughness"],
          procedural_fallback: {
            color_rgba: [0.14, 0.21, 0.27, 1],
            metallic: 0.55,
            roughness: 0.45,
          },
        },
      ],
      visual_description: {
        schema_version: "myway_asset_visual_description_v1",
        design_summary:
          "A compact retro-industrial desk fan with a readable circular head above a deliberately tall neck.",
        shape_language: {
          primary_forms: [
            "circular cage",
            "stepped circular base",
            "slender vertical column",
          ],
          edge_character: "soft manufactured bevels",
          symmetry: "bilateral around the vertical centreline",
          detail_density: "medium",
          proportion_emphasis: [
            "tall visible neck",
            "shallow fan head",
          ],
        },
        orthographic_views: {
          front:
            "The cage is centred over the base with the support column clearly visible below it.",
          right:
            "The motor projects behind a shallow cage and pivots inside a compact yoke.",
          top:
            "The cage, motor and base share one centreline.",
          three_quarter:
            "The circular cage dominates while the stepped base and long neck remain readable.",
        },
        overall_dimensions_m: [0.3, 0.17, 0.405],
        normalized_proportions: [
          {
            relationship: "cage_diameter / total_height",
            ratio: 0.74,
            tolerance: 0.04,
          },
          {
            relationship: "base_diameter / cage_diameter",
            ratio: 0.72,
            tolerance: 0.05,
          },
          {
            relationship: "visible_column_height / total_height",
            ratio: 0.25,
            tolerance: 0.04,
          },
        ],
        part_layout: [
          {
            part_id: "weighted_base",
            shape_description: "two-step flattened cylinder",
            dimensions_m: [0.22, 0.22, 0.034],
            position_m: [0, 0, 0.017],
            rotation_degrees: [0, 0, 0],
            visible_from: ["front", "right", "three_quarter"],
            construction_notes: ["lathed profile"],
          },
          {
            part_id: "support_column",
            shape_description: "slender tapered column",
            dimensions_m: [0.028, 0.028, 0.103],
            position_m: [0, 0, 0.105],
            rotation_degrees: [0, 0, 0],
            visible_from: ["front", "right", "three_quarter"],
            construction_notes: ["upper and lower collars"],
          },
          {
            part_id: "fan_head",
            shape_description: "shallow circular cage and motor assembly",
            dimensions_m: [0.3, 0.16, 0.3],
            position_m: [0, 0, 0.255],
            rotation_degrees: [0, 0, 0],
            visible_from: ["front", "right", "top", "three_quarter"],
            construction_notes: ["three blades", "concentric rings"],
          },
        ],
        material_regions: [
          {
            slot_id: "painted_metal",
            visible_description: "satin blue-gray powder-coated metal",
            dominant_color_hex: "#687b8b",
            finish: "satin",
            mapping_intent: "uniform object-space scale",
          },
        ],
        visual_acceptance_tests: [
          "The support column remains clearly visible in the front view.",
          "The fan head is centred over the base in the front and top views.",
          "The cage reads as shallow rather than spherical in the right view.",
        ],
        uncertainty_notes: [],
      },
      acceptance_criteria: [
        "The fan is grounded at Z=0.",
        "The three blades are separate from the cage.",
        "The head can rotate about aligned side pivots.",
      ],
    },
    {
      concept: "stylized mechanical desk fan",
      target_extent_m: 0.405,
      max_triangles: 45_000,
      quality_mode: "standard",
      style: "retro industrial",
      animation_ready: true,
    },
  );

  assert.equal(
    brief.visual_description?.schema_version,
    ASSET_VISUAL_DESCRIPTION_SCHEMA_VERSION,
  );
  assert.deepEqual(
    brief.visual_description?.overall_dimensions_m,
    [0.3, 0.17, 0.405],
  );
  assert.equal(
    brief.visual_description?.part_layout.length,
    brief.parts.length,
  );
  assert.equal(
    brief.visual_description?.normalized_proportions.length,
    3,
  );
  assert.equal(
    validateAssetDesignBrief(brief).valid,
    true,
  );

  const root = process.cwd();
  const [glm, context, ui, readme] = await Promise.all([
    readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/glm-blender-python.server.ts",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/direct-glm-context.server.ts",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/ui/blender-python-builder-lab.tsx",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/README.md",
      ),
      "utf8",
    ),
  ]);

  for (const term of [
    "myway_asset_visual_description_v1",
    "independent visual-design auditor",
    "visual_description.part_layout",
    "normalized proportions",
  ]) {
    assert.ok(
      glm.includes(term),
      `GLM planning/generation must contain ${term}.`,
    );
  }
  assert.match(
    context,
    /visual_description/,
    "The direct GLM context must retain the text-authored visual description.",
  );
  assert.match(
    context,
    /dimensioned_part_count/,
    "The public context summary must report dimensioned visual parts.",
  );
  assert.match(
    ui,
    /Create visual design \+ brief/,
  );
  assert.match(
    ui,
    /Text-authored visual reference/,
  );
  assert.match(
    readme,
    /Text-authored visual description V1/,
  );

  console.log(
    "Foundry text-authored visual-blueprint fixture passed.",
  );
}

void main();
