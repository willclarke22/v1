import assert from "node:assert/strict";
import {
  access,
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";

import {
  normalizeAssetDesignBrief,
} from "../asset-design-brief";
import {
  applyBoundedFoundryAdjustment,
  createDefaultFoundryLookAdjustments,
  normalizeFoundryLookAdjustments,
} from "../foundry-look-adjustments";
import {
  evaluateFoundryBenchmarkCase,
  FOUNDRY_BENCHMARK_CASES,
} from "../foundry-benchmark";

async function main() {
  const brief =
    normalizeAssetDesignBrief({
      asset_id:
        "lookdev_fixture",
      concept:
        "small wooden box",
      asset_class:
        "hard_surface_assembly",
      quality_mode:
        "standard",
      target_extent_m: 1,
      max_triangles:
        20_000,
      parts: [
        {
          part_id:
            "box_body",
          semantic_role:
            "box body",
          geometry_strategy: [
            "beveled box",
          ],
          parent_part_id: null,
          connection_strategy:
            null,
          material_slot_id:
            "wood",
          animation_role: null,
          pivot_requirement: null,
          required: true,
          identifying_features: [],
        },
      ],
      material_slots: [
        {
          slot_id: "wood",
          display_name:
            "Wood",
          assigned_part_ids: [
            "box_body",
          ],
          material_family:
            "wood",
          intent:
            "fine wood grain",
          semantic_tags: [
            "wood",
          ],
          physical_scale_m:
            0.2,
          required_maps: [
            "base_color",
            "roughness",
            "normal_gl",
          ],
          procedural_fallback: {
            color_rgba: [
              0.4,
              0.2,
              0.1,
              1,
            ],
            metallic: 0,
            roughness: 0.55,
          },
        },
      ],
      environment: {
        intent:
          "neutral studio",
        semantic_tags: [
          "studio",
        ],
        preferred_environment_class:
          "studio",
        strength: 0.8,
        rotation_degrees: 0,
        background_visible: false,
      },
    }, {
      concept:
        "small wooden box",
      target_extent_m: 1,
      max_triangles:
        20_000,
      quality_mode:
        "standard",
    });

  const defaults =
    createDefaultFoundryLookAdjustments(
      brief,
    );
  assert.equal(
    defaults.material_slots.wood
      ?.physical_scale_m,
    0.2,
  );
  assert.equal(
    defaults.material_slots.wood
      ?.mapping_mode,
    "uv",
  );

  const normalized =
    normalizeFoundryLookAdjustments(
      {
        material_slots: {
          wood: {
            mapping_mode:
              "object_box",
            uv_repeat: [2, 3],
            normal_strength: 99,
            part_overrides: {
              box_body: {
                roughness_factor:
                  1.2,
              },
              invented_part: {
                roughness_factor:
                  0.1,
              },
            },
          },
        },
        environment: {
          exposure: 99,
        },
      },
      brief,
    );
  assert.equal(
    normalized.material_slots.wood
      ?.mapping_mode,
    "object_box",
  );
  assert.equal(
    normalized.material_slots.wood
      ?.normal_strength,
    4,
  );
  assert.equal(
    normalized.environment
      .exposure,
    8,
  );
  assert.ok(
    normalized.material_slots.wood
      ?.part_overrides.box_body,
  );
  assert.equal(
    normalized.material_slots.wood
      ?.part_overrides
      .invented_part,
    undefined,
  );

  const adjusted =
    applyBoundedFoundryAdjustment(
      defaults,
      {
        direction:
          "reduce_normal_strength",
        affected_material_slot_ids: [
          "wood",
        ],
        affected_part_ids: [
          "box_body",
        ],
      },
    );
  assert.equal(
    adjusted.material_slots.wood
      ?.normal_strength,
    1,
    "A part-specific adjustment must not mutate the slot default.",
  );
  assert.equal(
    adjusted.material_slots.wood
      ?.part_overrides.box_body
      .normal_strength,
    0.85,
  );
  const untargeted =
    applyBoundedFoundryAdjustment(
      defaults,
      {
        direction:
          "reduce_normal_strength",
        affected_material_slot_ids: [],
      },
    );
  assert.equal(
    untargeted.material_slots.wood
      ?.normal_strength,
    1,
    "A missing material-slot id must never mutate an arbitrary slot.",
  );

  const holdout =
    FOUNDRY_BENCHMARK_CASES.find(
      (item) =>
        item.is_holdout,
    );
  assert.ok(holdout);
  assert.equal(
    holdout?.repeat_count,
    2,
    "The frozen holdout must run twice for stability comparison.",
  );
  assert.ok(
    FOUNDRY_BENCHMARK_CASES.length >=
      6,
  );

  const benchmarkCase =
    FOUNDRY_BENCHMARK_CASES[1]!;
  const evaluation =
    evaluateFoundryBenchmarkCase({
      benchmarkCase,
      execution: {
        ok: true,
        glb_url:
          "/asset.glb",
        glb_bytes: 1024,
        design_brief: {
          asset_class:
            benchmarkCase
              .expected_asset_class,
          parts:
            benchmarkCase
              .expected_required_part_roles
              .map(
                (role, index) => ({
                  part_id:
                    `fixture_${index + 1}`,
                  semantic_role:
                    role,
                  required: true,
                }),
              ),
        },
        compile_smoke: {
          valid: true,
        },
        build_validation: {
          valid: true,
          required_part_count: 5,
          matched_required_part_count: 5,
          footer: {
            triangle_count:
              benchmarkCase
                .max_triangles -
              1,
            topology_totals: {
              non_manifold_edges: 0,
              degenerate_faces: 0,
            },
          },
        },
        quality_report: {
          score: 91,
          grade:
            "technical_ready",
        },
      },
      visualCritique: {
        schema_version:
          "myway_foundry_visual_critique_v2",
        prompt_version:
          "myway_foundry_visual_critic_v2_actionable_lookdev",
        job_id:
          "fixture-job",
        asset_id:
          "fixture",
        asset_class:
          benchmarkCase
            .expected_asset_class,
        model: "fixture",
        created_at:
          "2026-08-03T00:00:00.000Z",
        analyzed_views: [
          "hero",
          "front",
          "right",
        ],
        overall_assessment:
          "passes_visual_review",
        summary: "pass",
        findings: [],
        routing_summary: {
          blender_code: 0,
          material_mapping: 0,
          look_development: 0,
          human_review: 0,
        },
      },
      humanReview: {
        status: "not_reviewed",
        reviewer: null,
        reviewed_at: null,
        notes: null,
      },
      evaluatedAt:
        "2026-08-03T00:00:00.000Z",
    });
  assert.equal(
    evaluation.status,
    "pending_human_review",
  );
  assert.equal(
    evaluation.technical_gate
      .passed,
    true,
  );
  assert.equal(
    evaluation.metrics
      .matched_expected_role_count,
    benchmarkCase
      .expected_required_part_roles
      .length,
  );

  const root = process.cwd();
  const requiredPaths = [
    "sandbox/probe-lab/blender-python-builder/foundry-look-adjustments.ts",
    "sandbox/probe-lab/blender-python-builder/foundry-benchmark.ts",
    "sandbox/probe-lab/blender-python-builder/routes/benchmark.ts",
    "app/api/sandbox/probe-lab/blender-python-builder/benchmark/route.ts",
    "sandbox/probe-lab/blender-python-builder/scripts/run-foundry-benchmark.ps1",
  ];
  await Promise.all(
    requiredPaths.map(
      (relativePath) =>
        access(
          resolve(
            root,
            relativePath,
          ),
        ),
    ),
  );

  const helper =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/blender-helper-library.ts",
      ),
      "utf8",
    );
  for (const term of [
    "object_box",
    "projection_blend",
    "normal_strength",
    "roughness_factor",
    "height_strength",
    "part_overrides",
    "view_settings.exposure",
  ]) {
    assert.ok(
      helper.includes(term),
      `Trusted helper must include ${term}.`,
    );
  }

  const runner =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/blender-python-runner.server.ts",
      ),
      "utf8",
    );
  assert.match(
    runner,
    /look-adjustments\.json/,
  );
  assert.match(
    runner,
    /visual_and_human_review_required/,
  );

  const ui =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/ui/blender-python-builder-lab.tsx",
      ),
      "utf8",
    );
  assert.match(
    ui,
    /Re-run same code with look adjustments/,
  );
  assert.match(
    ui,
    /Apply bounded/,
  );

  console.log(
    "Foundry Patch 3C look-development and Patch 3D benchmark fixture passed.",
  );
}

void main();
