import type {
  FoundryQualityMode,
} from "./asset-design-brief";
import type {
  FoundryVisualCritiqueReport,
} from "./foundry-visual-critic.server";

export const FOUNDRY_BENCHMARK_MANIFEST_SCHEMA_VERSION =
  "myway_foundry_benchmark_manifest_v1" as const;
export const FOUNDRY_BENCHMARK_RESULT_SCHEMA_VERSION =
  "myway_foundry_benchmark_result_v1" as const;

export type FoundryBenchmarkCase = {
  case_id: string;
  request: string;
  style: string;
  quality_mode:
    FoundryQualityMode;
  target_extent_m: number;
  max_triangles: number;
  animation_ready: boolean;
  expected_asset_class: string;
  expected_required_part_roles: string[];
  benchmark_tags: string[];
  is_holdout: boolean;
  repeat_count: number;
  stability_group: string | null;
};

export const FOUNDRY_BENCHMARK_CASES = [
  {
    case_id:
      "vintage_camera_reference",
    request:
      "Build a realistic vintage rangefinder camera with a compact black body, layered stepped lens, recessed glass, leatherette grip panels, brass controls, readable shutter and focus controls, softened manufactured edges, and animation-ready focus-ring and shutter-dial pivots.",
    style:
      "realistic product visualization",
    quality_mode: "hero",
    target_extent_m: 0.24,
    max_triangles: 65_000,
    animation_ready: true,
    expected_asset_class:
      "hard_surface_assembly",
    expected_required_part_roles: [
      "camera body",
      "layered lens",
      "recessed glass",
      "focus control",
      "shutter control",
    ],
    benchmark_tags: [
      "hard_surface",
      "layered_construction",
      "small_controls",
      "material_regions",
    ],
    is_holdout: false,
    repeat_count: 1,
    stability_group: null,
  },
  {
    case_id:
      "treasure_chest_connections",
    request:
      "Build a high-quality stylized wooden treasure chest with a curved separate lid, substantial dark metal bands, visible hinges, corner hardware, side handles, a front lock, softened manufactured edges, and a useful opening pivot.",
    style:
      "high-quality clean stylized",
    quality_mode:
      "standard",
    target_extent_m: 1.4,
    max_triangles: 45_000,
    animation_ready: true,
    expected_asset_class:
      "hard_surface_assembly",
    expected_required_part_roles: [
      "chest body",
      "curved lid",
      "hinges",
      "front lock",
      "side handles",
    ],
    benchmark_tags: [
      "connections",
      "curved_lid",
      "wood_metal",
      "negative_space",
    ],
    is_holdout: false,
    repeat_count: 1,
    stability_group: null,
  },
  {
    case_id:
      "desk_fan_thin_parts",
    request:
      "Build a believable vintage desk fan with a weighted base, narrow support neck, cylindrical motor housing, central hub, five thin pitched blades, concentric wire safety cage, rear controls, and animation-ready blade and tilt pivots.",
    style:
      "clean realistic industrial product",
    quality_mode:
      "standard",
    target_extent_m: 0.55,
    max_triangles: 58_000,
    animation_ready: true,
    expected_asset_class:
      "mechanical_vehicle",
    expected_required_part_roles: [
      "weighted base",
      "support neck",
      "motor housing",
      "fan blades",
      "wire cage",
    ],
    benchmark_tags: [
      "thin_parts",
      "radial_repetition",
      "pivots",
      "structural_connections",
    ],
    is_holdout: false,
    repeat_count: 1,
    stability_group: null,
  },
  {
    case_id:
      "upholstered_reading_chair",
    request:
      "Build a comfortable upholstered reading chair with a solid wood frame, four connected legs, broad seat cushion, padded back cushion, rounded arm pads, visible upholstery seams, believable cushion thickness, and distinct wood and woven-fabric material regions.",
    style:
      "warm realistic furniture catalogue",
    quality_mode:
      "standard",
    target_extent_m: 1.15,
    max_triangles: 60_000,
    animation_ready: false,
    expected_asset_class:
      "soft_goods_upholstery",
    expected_required_part_roles: [
      "wood frame",
      "connected legs",
      "seat cushion",
      "back cushion",
      "arm pads",
    ],
    benchmark_tags: [
      "soft_goods",
      "seams",
      "frame_connections",
      "material_scale",
    ],
    is_holdout: false,
    repeat_count: 1,
    stability_group: null,
  },
  {
    case_id:
      "stacked_burger_layers",
    request:
      "Build a realistic restaurant burger with an irregular toasted top bun, sesame seeds, lettuce folds, tomato slices, cheese drape, textured patty, onion rings, sauce edge, and bottom bun. Keep every ingredient layer distinct, readable, slightly asymmetric, and free of obvious intersections.",
    style:
      "realistic food advertisement",
    quality_mode:
      "hero",
    target_extent_m: 0.18,
    max_triangles: 70_000,
    animation_ready: false,
    expected_asset_class:
      "layered_organic",
    expected_required_part_roles: [
      "top bun",
      "lettuce",
      "tomato",
      "cheese",
      "patty",
      "bottom bun",
    ],
    benchmark_tags: [
      "organic_layers",
      "controlled_asymmetry",
      "repeated_detail",
      "surface_response",
    ],
    is_holdout: false,
    repeat_count: 1,
    stability_group: null,
  },
  {
    case_id:
      "hand_crank_egg_beater_holdout",
    request:
      "Build a believable hand-crank egg beater with a shaped handle, compact gear housing, visible crank arm and knob, two meshing gear wheels, twin parallel shafts, two looped wire beaters, clean axle connections, and animation-ready crank, gear, and beater pivots.",
    style:
      "realistic utilitarian kitchen tool",
    quality_mode:
      "standard",
    target_extent_m: 0.34,
    max_triangles: 55_000,
    animation_ready: true,
    expected_asset_class:
      "hard_surface_assembly",
    expected_required_part_roles: [
      "handle",
      "gear housing",
      "crank arm",
      "gear wheels",
      "parallel shafts",
      "wire beaters",
    ],
    benchmark_tags: [
      "holdout",
      "mechanical_relationships",
      "thin_wire",
      "small_parts",
    ],
    is_holdout: true,
    repeat_count: 2,
    stability_group:
      "hand_crank_egg_beater",
  },
] satisfies FoundryBenchmarkCase[];

export type FoundryBenchmarkHumanReview = {
  status:
    | "not_reviewed"
    | "approved"
    | "rejected";
  reviewer: string | null;
  reviewed_at: string | null;
  notes: string | null;
};

export type FoundryBenchmarkExecutionEvidence = {
  ok?: boolean;
  status?: string;
  glb_url?: string | null;
  glb_bytes?: number | null;
  asset_name?: string;
  design_brief?: {
    asset_class?: string;
    parts?: Array<{
      part_id?: string;
      semantic_role?: string;
      required?: boolean;
    }>;
  } | null;
  compile_smoke?: {
    valid?: boolean;
    elapsed_ms?: number;
  } | null;
  build_validation?: {
    valid?: boolean;
    required_part_count?: number;
    matched_required_part_count?: number;
    footer?: {
      triangle_count?: number;
      topology_totals?: {
        non_manifold_edges?: number;
        degenerate_faces?: number;
      };
    } | null;
  } | null;
  quality_report?: {
    score?: number;
    grade?: string;
  } | null;
  repair_attempts?: Array<{
    status?: string;
  }>;
  resource_plan?: {
    material_bindings?: Array<{
      slot?: {
        slot_id?: string;
      };
      selected?: {
        resource_id?: string | null;
        source_asset_id?: string | null;
        variant_id?: string | null;
      };
    }>;
    environment?: {
      selected?: {
        resource_id?: string | null;
        source_asset_id?: string | null;
        variant_id?: string | null;
      };
    };
  } | null;
  look_adjustments?: unknown;
  helper_library_version?: string;
  inspection_footer_version?: string;
  blender_runtime?: unknown;
  elapsed_ms?: number;
};

export type FoundryBenchmarkGateResult = {
  schema_version:
    typeof FOUNDRY_BENCHMARK_RESULT_SCHEMA_VERSION;
  case_id: string;
  evaluated_at: string;
  status:
    | "incomplete"
    | "failed"
    | "pending_human_review"
    | "passed";
  technical_gate: {
    passed: boolean;
    checks: Record<string, boolean>;
    failures: string[];
  };
  visual_gate: {
    status:
      | "not_run"
      | "failed"
      | "automated_pass";
    blocker_count: number;
    blockers: Array<{
      finding_id: string;
      revision_route: string;
      category: string;
      confidence: number;
      finding: string;
    }>;
  };
  human_review_gate: {
    passed: boolean;
    status:
      FoundryBenchmarkHumanReview[
        "status"
      ];
  };
  metrics: {
    technical_score: number | null;
    triangle_count: number | null;
    glb_bytes: number | null;
    repair_count: number;
    execution_elapsed_ms: number | null;
    visual_finding_count: number;
    expected_role_count: number;
    matched_expected_role_count: number;
  };
};

function numberOrNull(
  value: unknown,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function roleTokens(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      token.length > 3 &&
      token.endsWith("s")
        ? token.slice(0, -1)
        : token,
    );
}

function benchmarkRoleCoverage(
  benchmarkCase:
    FoundryBenchmarkCase,
  execution:
    FoundryBenchmarkExecutionEvidence,
) {
  const parts =
    execution.design_brief
      ?.parts?.filter(
        (part) =>
          part.required !== false,
      ) ?? [];
  const candidateTokens =
    parts.map((part) =>
      new Set(
        roleTokens(
          [
            part.part_id ?? "",
            part.semantic_role ?? "",
          ].join(" "),
        ),
      ),
    );
  const matched =
    benchmarkCase
      .expected_required_part_roles
      .filter((expectedRole) => {
        const expected =
          roleTokens(expectedRole);
        return candidateTokens.some(
          (candidate) =>
            expected.length > 0 &&
            expected.every(
              (token) =>
                candidate.has(token),
            ),
        );
      });
  return {
    expected_count:
      benchmarkCase
        .expected_required_part_roles
        .length,
    matched_count:
      matched.length,
    missing:
      benchmarkCase
        .expected_required_part_roles
        .filter(
          (role) =>
            !matched.includes(role),
        ),
  };
}

function selectedResourceKeys(
  execution:
    FoundryBenchmarkExecutionEvidence,
) {
  const materials =
    execution.resource_plan
      ?.material_bindings ?? [];
  return materials.map(
    (binding) => ({
      slot_id:
        binding.slot?.slot_id ??
        "unknown",
      resource:
        binding.selected
          ?.resource_id ??
        binding.selected
          ?.source_asset_id ??
        "procedural",
      variant:
        binding.selected
          ?.variant_id ??
        null,
    }),
  );
}

export function evaluateFoundryBenchmarkCase(
  input: {
    benchmarkCase:
      FoundryBenchmarkCase;
    execution:
      FoundryBenchmarkExecutionEvidence;
    visualCritique?:
      FoundryVisualCritiqueReport | null;
    humanReview?:
      FoundryBenchmarkHumanReview | null;
    evaluatedAt?: string;
  },
): FoundryBenchmarkGateResult {
  const execution =
    input.execution ?? {};
  const validation =
    execution.build_validation;
  const footer =
    validation?.footer;
  const topology =
    footer?.topology_totals;
  const requiredCount =
    validation
      ?.required_part_count ??
    0;
  const matchedCount =
    validation
      ?.matched_required_part_count ??
    0;
  const triangleCount =
    numberOrNull(
      footer?.triangle_count,
    );
  const roleCoverage =
    benchmarkRoleCoverage(
      input.benchmarkCase,
      execution,
    );

  const checks = {
    execution_ok:
      execution.ok === true,
    compile_smoke_passed:
      execution.compile_smoke
        ?.valid === true,
    build_validation_passed:
      validation?.valid === true,
    required_parts_present:
      requiredCount > 0 &&
      matchedCount >= requiredCount,
    topology_acceptable:
      (
        topology
          ?.non_manifold_edges ??
        0
      ) === 0 &&
      (
        topology
          ?.degenerate_faces ??
        0
      ) === 0,
    triangle_budget_respected:
      triangleCount != null &&
      triangleCount <=
        input.benchmarkCase
          .max_triangles,
    glb_created:
      Boolean(
        execution.glb_url &&
        (
          execution.glb_bytes ??
          0
        ) > 0,
      ),
    expected_asset_class:
      execution.design_brief
        ?.asset_class ===
      input.benchmarkCase
        .expected_asset_class,
    benchmark_roles_covered:
      roleCoverage.expected_count > 0 &&
      roleCoverage.matched_count >=
        roleCoverage.expected_count,
  };
  const failures =
    Object.entries(checks)
      .filter(([, passed]) =>
        !passed,
      )
      .map(([name]) =>
        name,
      );
  const technicalPassed =
    failures.length === 0;

  const report =
    input.visualCritique ??
    null;
  const blockers =
    report?.findings
      .filter(
        (finding) =>
          finding.severity ===
            "error" &&
          finding.confidence >=
            0.7 &&
          finding.revision_route !==
            "human_review",
      )
      .map((finding) => ({
        finding_id:
          finding.finding_id,
        revision_route:
          finding.revision_route,
        category:
          finding.category,
        confidence:
          finding.confidence,
        finding:
          finding.finding,
      })) ?? [];
  const visualStatus =
    !report
      ? "not_run" as const
      : blockers.length
        ? "failed" as const
        : "automated_pass" as const;

  const humanReview =
    input.humanReview ?? {
      status:
        "not_reviewed" as const,
      reviewer: null,
      reviewed_at: null,
      notes: null,
    };
  const humanPassed =
    humanReview.status ===
    "approved";
  const status =
    !technicalPassed ||
    visualStatus === "failed" ||
    humanReview.status ===
      "rejected"
      ? "failed" as const
      : visualStatus ===
          "not_run"
        ? "incomplete" as const
        : humanPassed
          ? "passed" as const
          : "pending_human_review" as const;

  return {
    schema_version:
      FOUNDRY_BENCHMARK_RESULT_SCHEMA_VERSION,
    case_id:
      input.benchmarkCase
        .case_id,
    evaluated_at:
      input.evaluatedAt ??
      new Date().toISOString(),
    status,
    technical_gate: {
      passed:
        technicalPassed,
      checks,
      failures,
    },
    visual_gate: {
      status:
        visualStatus,
      blocker_count:
        blockers.length,
      blockers,
    },
    human_review_gate: {
      passed:
        humanPassed,
      status:
        humanReview.status,
    },
    metrics: {
      technical_score:
        numberOrNull(
          execution
            .quality_report
            ?.score,
        ),
      triangle_count:
        triangleCount,
      glb_bytes:
        numberOrNull(
          execution.glb_bytes,
        ),
      repair_count:
        execution
          .repair_attempts
          ?.filter(
            (attempt) =>
              attempt.status ===
              "repaired",
          ).length ?? 0,
      execution_elapsed_ms:
        numberOrNull(
          execution.elapsed_ms,
        ),
      visual_finding_count:
        report?.findings.length ??
        0,
      expected_role_count:
        roleCoverage.expected_count,
      matched_expected_role_count:
        roleCoverage.matched_count,
    },
  };
}

export type FoundryBenchmarkStabilityComparison = {
  schema_version:
    "myway_foundry_benchmark_stability_v1";
  stability_group: string;
  stable: boolean;
  checks: {
    same_asset_class: boolean;
    required_part_match_delta: number;
    repair_count_delta: number;
    visual_blocker_delta: number;
    material_selection_changed: boolean;
  };
  notes: string[];
};

export function compareFoundryBenchmarkStability(
  input: {
    stabilityGroup: string;
    firstExecution:
      FoundryBenchmarkExecutionEvidence;
    secondExecution:
      FoundryBenchmarkExecutionEvidence;
    firstEvaluation:
      FoundryBenchmarkGateResult;
    secondEvaluation:
      FoundryBenchmarkGateResult;
  },
): FoundryBenchmarkStabilityComparison {
  const firstMatched =
    input.firstExecution
      .build_validation
      ?.matched_required_part_count ??
    0;
  const secondMatched =
    input.secondExecution
      .build_validation
      ?.matched_required_part_count ??
    0;
  const repairDelta =
    Math.abs(
      input.firstEvaluation
        .metrics.repair_count -
      input.secondEvaluation
        .metrics.repair_count,
    );
  const blockerDelta =
    Math.abs(
      input.firstEvaluation
        .visual_gate
        .blocker_count -
      input.secondEvaluation
        .visual_gate
        .blocker_count,
    );
  const firstResources =
    JSON.stringify(
      selectedResourceKeys(
        input.firstExecution,
      ),
    );
  const secondResources =
    JSON.stringify(
      selectedResourceKeys(
        input.secondExecution,
      ),
    );
  const checks = {
    same_asset_class:
      input.firstExecution
        .design_brief
        ?.asset_class ===
      input.secondExecution
        .design_brief
        ?.asset_class,
    required_part_match_delta:
      Math.abs(
        firstMatched -
        secondMatched,
      ),
    repair_count_delta:
      repairDelta,
    visual_blocker_delta:
      blockerDelta,
    material_selection_changed:
      firstResources !==
      secondResources,
  };
  const notes: string[] = [];
  if (!checks.same_asset_class) {
    notes.push(
      "The planner changed asset class between identical holdout runs.",
    );
  }
  if (
    checks.required_part_match_delta >
    1
  ) {
    notes.push(
      "Required-part coverage changed materially between runs.",
    );
  }
  if (
    checks.repair_count_delta >
    1
  ) {
    notes.push(
      "Bounded repair demand changed materially between runs.",
    );
  }
  if (
    checks.visual_blocker_delta >
    1
  ) {
    notes.push(
      "Visual blocker count changed materially between runs.",
    );
  }
  if (
    checks.material_selection_changed
  ) {
    notes.push(
      "Reviewed material selection changed between identical requests; inspect whether the score margin justified the change.",
    );
  }

  return {
    schema_version:
      "myway_foundry_benchmark_stability_v1",
    stability_group:
      input.stabilityGroup,
    stable:
      checks.same_asset_class &&
      checks.required_part_match_delta <=
        1 &&
      checks.repair_count_delta <=
        1 &&
      checks.visual_blocker_delta <=
        1,
    checks,
    notes,
  };
}

export const FOUNDRY_BENCHMARK_MANIFEST = {
  schema_version:
    FOUNDRY_BENCHMARK_MANIFEST_SCHEMA_VERSION,
  frozen_at:
    "2026-08-03T00:00:00.000Z",
  release_policy: {
    technical_gate:
      "All measurable execution, frozen benchmark-role, required-part, topology, triangle-budget, and GLB checks must pass.",
    visual_gate:
      "No unresolved error-level non-human-review finding at confidence 0.70 or higher.",
    human_gate:
      "A human reviewer must approve the final revision before release.",
  },
  cases:
    FOUNDRY_BENCHMARK_CASES,
} as const;
