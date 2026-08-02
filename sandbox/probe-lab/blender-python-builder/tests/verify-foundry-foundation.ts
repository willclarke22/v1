import assert from "node:assert/strict";
import {
  access,
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";

import {
  designBriefToProceduralSpec,
  normalizeAssetDesignBrief,
  validateAssetDesignBrief,
} from "../asset-design-brief";
import {
  buildTrustedBlenderHelperPrelude,
} from "../blender-helper-library";
import {
  buildTrustedBlenderInspectionFooter,
} from "../blender-inspection-footer";
import {
  normalizeFoundryResourcePlan,
} from "../foundry-resource-plan";

async function fileContains(
  relativePath: string,
  terms: string[],
) {
  const text =
    await readFile(
      resolve(
        process.cwd(),
        relativePath,
      ),
      "utf8",
    );
  for (const term of
    terms) {
    assert.ok(
      text.includes(
        term,
      ),
      `${relativePath} must contain ${term}`,
    );
  }
}

async function main() {
  const brief =
    normalizeAssetDesignBrief(
      {
        concept:
          "benchmark treasure chest",
        asset_class:
          "hard_surface_assembly",
        quality_mode:
          "standard",
        target_extent_m:
          1.4,
        max_triangles:
          45_000,
        silhouette: {
          primary_shapes: [
            "rectangular body",
            "arched lid",
          ],
          identifying_features: [
            "wrapping metal bands",
            "front lock",
          ],
          important_negative_spaces: [
            "lid separation gap",
          ],
          camera_readability: [
            "three quarter",
          ],
        },
        proportions: [
          "lid is one third of total height",
        ],
        parts: [
          {
            part_id:
              "chest_body",
            semantic_role:
              "wooden chest body",
            geometry_strategy: [
              "profile extrusion",
              "bevel",
            ],
            material_slot_id:
              "wood_primary",
            required: true,
          },
          {
            part_id:
              "lid",
            semantic_role:
              "arched opening lid",
            geometry_strategy: [
              "profile extrusion",
            ],
            parent_part_id:
              "chest_body",
            material_slot_id:
              "wood_primary",
            animation_role:
              "opening lid",
            pivot_requirement:
              "rear hinge axis",
            required: true,
          },
          {
            part_id:
              "front_lock",
            semantic_role:
              "front lock",
            geometry_strategy: [
              "layered hard surface",
            ],
            parent_part_id:
              "chest_body",
            material_slot_id:
              "aged_metal",
            required: true,
          },
        ],
        material_slots: [
          {
            slot_id:
              "wood_primary",
            display_name:
              "Wood primary",
            assigned_part_ids: [
              "chest_body",
              "lid",
            ],
            material_family:
              "wood",
            intent:
              "warm visible grain",
            semantic_tags: [
              "wood",
              "aged",
            ],
            required_maps: [
              "base_color",
              "roughness",
              "normal_gl",
            ],
          },
          {
            slot_id:
              "aged_metal",
            display_name:
              "Aged metal",
            assigned_part_ids: [
              "front_lock",
            ],
            material_family:
              "metal",
            intent:
              "dark hammered iron",
            semantic_tags: [
              "metal",
              "dark",
            ],
            metallic_hint:
              "high",
            required_maps: [
              "base_color",
              "roughness",
              "normal_gl",
              "metallic",
            ],
          },
        ],
        environment: {
          intent:
            "neutral product studio",
          semantic_tags: [
            "studio",
            "neutral",
          ],
        },
        acceptance_criteria: [
          "silhouette reads without textures",
          "lid is a separate opening part",
          "wood and metal are separate regions",
        ],
        benchmark_priorities: [
          "substantial hardware",
          "softened edges",
        ],
      },
      {
        concept:
          "benchmark treasure chest",
        target_extent_m:
          1.4,
        max_triangles:
          45_000,
        quality_mode:
          "standard",
        style:
          "high quality stylized",
        animation_ready:
          true,
      },
    );
  const validation =
    validateAssetDesignBrief(
      brief,
    );
  assert.equal(
    validation.valid,
    true,
  );
  assert.equal(
    brief.parts.length,
    3,
  );
  assert.equal(
    brief.material_slots.length,
    2,
  );
  assert.equal(
    brief.requirements
      .animation_ready,
    true,
  );

  const spec =
    designBriefToProceduralSpec(
      brief,
    );
  assert.equal(
    spec.parts[1]
      ?.part_id,
    "lid",
  );
  assert.equal(
    spec.parts[1]
      ?.material_intent,
    "wood_primary",
  );

  const plan =
    normalizeFoundryResourcePlan(
      {
        material_bindings: [
          {
            slot:
              brief
                .material_slots[0],
            status:
              "catalog_match",
            selected: {
              candidate_kind:
                "ambientcg_catalog",
              source_asset_id:
                "WoodFloor051",
              variant_id:
                "2K-JPG",
              display_name:
                "WoodFloor051",
              score: 88,
            },
            candidates: [],
          },
        ],
      },
      brief,
    );
  assert.equal(
    plan.material_bindings
      .length,
    2,
  );
  assert.equal(
    plan.material_bindings[0]
      ?.slot.slot_id,
    "wood_primary",
  );
  assert.equal(
    plan.environment.status,
    "trusted_studio_fallback",
  );

  const helpers =
    buildTrustedBlenderHelperPrelude();
  for (const term of [
    "myway_material_slot",
    "myway_lathe_profile",
    "myway_extrude_profile",
    "myway_loft_sections",
    "myway_tube_between_points",
    "myway_boolean_difference",
    "myway_apply_foundry_environment",
  ]) {
    assert.ok(
      helpers.includes(term),
      `helper prelude must contain ${term}`,
    );
  }

  const footer =
    buildTrustedBlenderInspectionFooter();
  for (const term of [
    "preview_clay.png",
    "preview_wireframe.png",
    "preview_material_id.png",
    "preview_normals.png",
    "preview_dimensions.png",
    "quality.json",
    "non_manifold_edges",
  ]) {
    assert.ok(
      footer.includes(term),
      `inspection footer must contain ${term}`,
    );
  }

  await Promise.all([
    access(
      resolve(
        process.cwd(),
        "app/api/sandbox/probe-lab/blender-python-builder/plan/route.ts",
      ),
    ),
    access(
      resolve(
        process.cwd(),
        "app/api/sandbox/probe-lab/blender-python-builder/resources/route.ts",
      ),
    ),
    access(
      resolve(
        process.cwd(),
        "app/api/sandbox/probe-lab/blender-python-builder/improve/route.ts",
      ),
    ),
    access(
      resolve(
        process.cwd(),
        "app/api/sandbox/probe-lab/blender-python-builder/candidate/route.ts",
      ),
    ),
  ]);

  await fileContains(
    "sandbox/probe-lab/blender-python-builder/ui/blender-python-builder-lab.tsx",
    [
      "Guided build",
      "Code / paste",
      "Prepare uncached resources",
      "Critique + revise code",
      "Save as library candidate",
    ],
  );

  console.log(
    "Blender Asset Foundry foundation fixture passed.",
  );
}

void main();
