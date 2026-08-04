"use client";

import {
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import {
  Canvas,
} from "@react-three/fiber";
import {
  Suspense,
  useMemo,
  useState,
} from "react";

import type {
  AssetDesignBriefV2,
  FoundryQualityMode,
} from "../asset-design-brief";
import type {
  FoundryResourceCandidate,
  FoundryResourcePlanV1,
} from "../foundry-resource-plan";
import {
  applyBoundedFoundryAdjustment,
  createDefaultFoundryLookAdjustments,
  normalizeFoundryLookAdjustments,
  type FoundryLookAdjustmentDirection,
  type FoundryLookAdjustmentsV1,
  type FoundryMaterialLookOverrideV1,
} from "../foundry-look-adjustments";

type ApiBase = {
  ok: boolean;
  error?: string;
  model?: string;
  elapsed_ms?: number;
  transport?: string;
};

type PlanResponse =
  ApiBase & {
    design_brief?:
      AssetDesignBriefV2;
    design_brief_validation?: {
      valid?: boolean;
      errors?: string[];
      warnings?: string[];
    };
    design_review?: {
      schema_version?: string;
      reviewed?: boolean;
      draft_model?: string | null;
      review_model?: string | null;
      draft_elapsed_ms?: number | null;
      review_elapsed_ms?: number | null;
      review_error?: string | null;
    };
  };

type NativeProofFixtureResponse =
  ApiBase & {
    fixture?: {
      request: string;
      asset_name: string;
      style: string;
      quality_mode:
        FoundryQualityMode;
      target_extent_m:
        number;
      max_triangles:
        number;
      animation_ready:
        boolean;
      design_brief:
        AssetDesignBriefV2;
      code: string;
    };
  };

type ResourceResponse =
  ApiBase & {
    design_brief?:
      AssetDesignBriefV2;
    plan?:
      FoundryResourcePlanV1;
    prepared?: Array<{
      kind:
        | "material"
        | "hdri";
      slot_id:
        | string
        | null;
      display_name:
        string;
      resource_id:
        string;
    }>;
  };

type GenerateResponse =
  ApiBase & {
    code?: string;
    line_count?: number;
    asset_spec?:
      Record<
        string,
        unknown
      >;
    asset_spec_validation?: {
      valid?: boolean;
      errors?: string[];
      warnings?: string[];
    };
    design_brief?:
      AssetDesignBriefV2;
    design_brief_validation?: {
      valid?: boolean;
      errors?: string[];
      warnings?: string[];
    };
    resource_plan?:
      FoundryResourcePlanV1
      | null;
    preflight_validation?: {
      valid?: boolean;
      calls_checked?: number;
      errors?: Array<{
        code?: string;
        line?: number | null;
        helper?: string | null;
        message?: string;
      }>;
      warnings?: Array<{
        code?: string;
        line?: number | null;
        helper?: string | null;
        message?: string;
      }>;
    };
    preflight_repair?: {
      attempted?: boolean;
      model?: string | null;
      elapsed_ms?: number | null;
      initial_error_count?: number;
      final_error_count?: number;
    };
    context_package?: {
      schema_version?: string;
      modelling_strategy?: string;
      runtime?: {
        blender_version?: string;
        python_version?: string;
        execution_mode?: string;
      };
      asset_id?: string;
      asset_class?: string;
      required_part_count?: number;
      optional_part_count?: number;
      material_slot_count?: number;
      selected_material_count?: number;
      environment_selected?: boolean;
      reference_example?: {
        id?: string;
        line_count?: number;
        purpose?: string;
      };
      excluded_context?: string[];
    };
  };

type ExecuteResponse =
  ApiBase & {
    status?: string;
    job_id?: string;
    asset_name?: string;
    glb_url?: string;
    blend_url?:
      string | null;
    preview_url?:
      string | null;
    inspection_urls?:
      string[];
    validation_url?:
      string | null;
    quality_url?:
      string | null;
    glb_bytes?: number;
    stdout?: string;
    stderr?: string;
    final_code?: string;
    repair_attempts?: Array<{
      attempt: number;
      status:
        | "failed"
        | "repaired"
        | "succeeded";
      error:
        | string
        | null;
      repair_model:
        | string
        | null;
      repair_elapsed_ms:
        | number
        | null;
      execution_diagnostics?:
        unknown;
    }>;
    build_validation?: {
      valid?: boolean;
      errors?: string[];
      warnings?: string[];
      footer?: unknown;
      glb?: unknown;
    };
    quality_report?: {
      score?: number;
      grade?: string;
      findings?: Array<{
        severity?: string;
        code?: string;
        message?: string;
      }>;
      benchmark_checks?: Record<
        string,
        unknown
      >;
    } | null;
    design_brief?:
      AssetDesignBriefV2;
    resource_plan?:
      FoundryResourcePlanV1;
    resource_manifest?:
      Record<string, unknown>;
    look_adjustments?:
      FoundryLookAdjustmentsV1;
    technical_status?: string;
    release_status?: string;
    blender_runtime?: {
      blender_version?: string;
      python_version?: string;
      execution_mode?: string;
    };
    compile_smoke?: {
      valid?: boolean;
      stage?: string;
      message?: string;
      line?: number | null;
      elapsed_ms?: number;
    };
    execution_diagnostics?: {
      phase?: string;
      failure_source?: string;
      generated_line?: number | null;
      editor_line?: number | null;
      excerpt?: string | null;
      message?: string;
    } | null;
    visual_critique?:
      VisualCritiqueReport
      | null;
    visual_critique_url?:
      string | null;
  };

type VisualCritiqueFinding = {
  finding_id: string;
  category: string;
  severity:
    | "info"
    | "warning"
    | "error";
  revision_route:
    | "blender_code"
    | "material_mapping"
    | "look_development"
    | "human_review";
  affected_part_ids: string[];
  affected_material_slot_ids: string[];
  evidence_views: string[];
  suggested_adjustment: {
    direction:
      FoundryLookAdjustmentDirection;
  } | null;
  finding: string;
  recommended_revision: string;
  confidence: number;
};

type VisualCritiqueReport = {
  schema_version: string;
  prompt_version: string;
  job_id: string;
  asset_id: string;
  asset_class: string;
  model: string;
  created_at: string;
  analyzed_views: string[];
  overall_assessment:
    | "passes_visual_review"
    | "targeted_revision"
    | "human_review";
  summary: string;
  findings:
    VisualCritiqueFinding[];
  routing_summary: {
    blender_code: number;
    material_mapping: number;
    look_development: number;
    human_review: number;
  };
};

type VisualCritiqueResponse =
  ApiBase & {
    report?:
      VisualCritiqueReport;
    visual_critique_url?:
      string;
    analyzed_views?: Array<{
      label: string;
      file_name: string;
    }>;
  };

type Revision = {
  revision: number;
  label: string;
  code: string;
  execution:
    ExecuteResponse;
};

const STARTER_CODE = `import bpy
import math

# Direct code mode remains fully supported.
# MyWay appends trusted PBR resources, validation, export, and inspection code.

myway_reset_scene()
myway_print_progress("starting custom build")

body = myway_box(
    "main_body",
    location=(0, 0, 0.5),
    dimensions=(1.0, 1.0, 1.0),
    material=myway_material_slot(
        "primary_surface",
        fallback_color=(0.14, 0.48, 0.9, 1.0),
        roughness=0.38,
    ),
    bevel=0.08,
)
myway_generate_uvs(body)
myway_ground_asset([body])

myway_print_progress("custom build complete")
`;

const panelStyle = {
  border:
    "1px solid rgba(148,163,184,0.22)",
  borderRadius: 18,
  background:
    "rgba(15,23,42,0.78)",
  boxShadow:
    "0 24px 60px rgba(0,0,0,0.24)",
} as const;

const inputStyle = {
  borderRadius: 10,
  border:
    "1px solid rgba(148,163,184,0.28)",
  background: "#020617",
  color: "#e2e8f0",
  padding: 11,
} as const;

function Model({
  url,
}: {
  url: string;
}) {
  const gltf =
    useGLTF(url);
  const clone =
    useMemo(
      () =>
        gltf.scene.clone(
          true,
        ),
      [gltf.scene],
    );
  return (
    <primitive
      object={clone}
    />
  );
}

function formatBytes(
  value?: number,
) {
  if (!value) {
    return "—";
  }
  if (
    value <
    1024 * 1024
  ) {
    return `${Math.round(
      value / 1024,
    )} KB`;
  }
  return `${(
    value /
    1024 /
    1024
  ).toFixed(2)} MB`;
}

function formatDurationMs(
  value?: number,
) {
  if (!value) {
    return "—";
  }
  if (value < 1000) {
    return `${Math.round(
      value,
    )} ms`;
  }
  return `${(
    value / 1000
  ).toFixed(1)}s`;
}

function labelForInspection(
  url: string,
) {
  const name =
    url.split("/").pop() ??
    "";
  return name
    .replace(
      /^preview_?/,
      "",
    )
    .replace(
      /\.png$/i,
      "",
    )
    .replaceAll(
      "_",
      " ",
    ) || "hero";
}

function statusColor(
  status: string,
) {
  if (
    status ===
    "ready_r2"
  ) {
    return "#86efac";
  }
  if (
    status ===
    "catalog_match"
  ) {
    return "#fde68a";
  }
  return "#cbd5e1";
}

function candidateLabel(
  candidate:
    FoundryResourceCandidate,
) {
  const suffix = [
    candidate.resolution,
    candidate.file_format,
    candidate
      .candidate_kind ===
      "cached_r2"
      ? "R2 ready"
      : candidate
          .candidate_kind ===
          "ambientcg_catalog"
        ? "AmbientCG catalog"
        : "procedural",
  ]
    .filter(Boolean)
    .join(" · ");
  return suffix
    ? `${candidate.display_name} — ${suffix}`
    : candidate.display_name;
}

export function BlenderPythonBuilderLab() {
  const [
    mode,
    setMode,
  ] = useState<
    "guided" | "code"
  >("guided");
  const [
    request,
    setRequest,
  ] = useState(
    "Build a high-quality stylized wooden treasure chest with a curved separate lid, substantial dark metal bands, hinges, corner hardware, side handles, a front lock, softened manufactured edges, and useful pivots for opening.",
  );
  const [
    assetName,
    setAssetName,
  ] = useState(
    "foundry_treasure_chest",
  );
  const [
    style,
    setStyle,
  ] = useState(
    "high-quality clean stylized",
  );
  const [
    qualityMode,
    setQualityMode,
  ] = useState<
    FoundryQualityMode
  >("standard");
  const [
    targetExtent,
    setTargetExtent,
  ] = useState(2);
  const [
    maxTriangles,
    setMaxTriangles,
  ] = useState(
    45_000,
  );
  const [
    animationReady,
    setAnimationReady,
  ] = useState(true);
  const [
    code,
    setCode,
  ] = useState(
    STARTER_CODE,
  );
  const [
    designBrief,
    setDesignBrief,
  ] = useState<
    AssetDesignBriefV2
    | null
  >(null);
  const [
    designBriefText,
    setDesignBriefText,
  ] = useState("");
  const [
    resourcePlan,
    setResourcePlan,
  ] = useState<
    FoundryResourcePlanV1
    | null
  >(null);
  const [
    lookAdjustments,
    setLookAdjustments,
  ] = useState<
    FoundryLookAdjustmentsV1
    | null
  >(null);
  const [
    lookTargetBySlot,
    setLookTargetBySlot,
  ] = useState<
    Record<string, string>
  >({});
  const [
    planResponse,
    setPlanResponse,
  ] = useState<
    PlanResponse | null
  >(null);
  const [
    resourceResponse,
    setResourceResponse,
  ] = useState<
    ResourceResponse | null
  >(null);
  const [
    generation,
    setGeneration,
  ] = useState<
    GenerateResponse
    | null
  >(null);
  const [
    execution,
    setExecution,
  ] = useState<
    ExecuteResponse
    | null
  >(null);
  const [
    visualCritique,
    setVisualCritique,
  ] = useState<
    VisualCritiqueResponse
    | null
  >(null);
  const [
    critique,
    setCritique,
  ] = useState("");
  const [
    improveResponse,
    setImproveResponse,
  ] = useState<
    GenerateResponse
    | null
  >(null);
  const [
    revisions,
    setRevisions,
  ] = useState<
    Revision[]
  >([]);
  const [
    candidateMessage,
    setCandidateMessage,
  ] = useState<
    string | null
  >(null);
  const [
    busy,
    setBusy,
  ] = useState<
    | "fixture"
    | "plan"
    | "resources"
    | "prepare"
    | "generate"
    | "execute"
    | "visual-critique"
    | "improve"
    | "candidate"
    | null
  >(null);

  const visibleLookAdjustments =
    designBrief
      ? normalizeFoundryLookAdjustments(
          lookAdjustments,
          designBrief,
          resourcePlan,
        )
      : null;

  function currentBrief() {
    if (
      designBriefText.trim()
    ) {
      try {
        return JSON.parse(
          designBriefText,
        ) as
          AssetDesignBriefV2;
      } catch {
        throw new Error(
          "The editable design brief JSON is not valid.",
        );
      }
    }
    return designBrief;
  }

  function normalizedLookAdjustments(
    briefOverride?:
      AssetDesignBriefV2 | null,
    planOverride?:
      FoundryResourcePlanV1 | null,
  ) {
    const brief =
      briefOverride ??
      currentBrief();
    if (!brief) {
      return null;
    }
    return normalizeFoundryLookAdjustments(
      lookAdjustments,
      brief,
      planOverride ??
        resourcePlan,
    );
  }

  function resetLookDevelopment(
    brief:
      AssetDesignBriefV2,
    plan?:
      FoundryResourcePlanV1 | null,
  ) {
    setLookAdjustments(
      createDefaultFoundryLookAdjustments(
        brief,
        plan ?? null,
      ),
    );
    setLookTargetBySlot({});
  }

  function materialLookTarget(
    slotId: string,
  ): FoundryMaterialLookOverrideV1 | null {
    const slot =
      visibleLookAdjustments
        ?.material_slots[
        slotId
      ];
    if (!slot) {
      return null;
    }
    const partId =
      lookTargetBySlot[
        slotId
      ];
    return partId &&
      partId !== "__slot__"
      ? slot.part_overrides[
          partId
        ] ?? slot
      : slot;
  }

  function updateMaterialLook(
    slotId: string,
    patch:
      Partial<
        FoundryMaterialLookOverrideV1
      >,
  ) {
    const brief =
      currentBrief();
    if (!brief) {
      return;
    }
    setLookAdjustments(
      (currentValue) => {
        const current =
          normalizeFoundryLookAdjustments(
            currentValue,
            brief,
            resourcePlan,
          );
        const slot =
          current.material_slots[
            slotId
          ];
        if (!slot) {
          return current;
        }
        const partId =
          lookTargetBySlot[
            slotId
          ];
        if (
          partId &&
          partId !== "__slot__"
        ) {
          const base =
            slot.part_overrides[
              partId
            ] ?? {
              physical_scale_m:
                slot.physical_scale_m,
              uv_repeat: [
                ...slot.uv_repeat,
              ] as [number, number],
              rotation_degrees:
                slot.rotation_degrees,
              offset: [
                ...slot.offset,
              ] as [number, number],
              normal_strength:
                slot.normal_strength,
              roughness_factor:
                slot.roughness_factor,
              height_strength:
                slot.height_strength,
              mapping_mode:
                slot.mapping_mode,
            };
          slot.part_overrides[
            partId
          ] = {
            ...base,
            ...patch,
            uv_repeat:
              patch.uv_repeat ??
              base.uv_repeat,
            offset:
              patch.offset ??
              base.offset,
          };
        } else {
          Object.assign(
            slot,
            patch,
          );
        }
        return {
          ...current,
          material_slots: {
            ...current.material_slots,
            [slotId]: {
              ...slot,
              part_overrides: {
                ...slot.part_overrides,
              },
            },
          },
        };
      },
    );
  }

  function updateEnvironmentLook(
    patch:
      Partial<
        FoundryLookAdjustmentsV1[
          "environment"
        ]
      >,
  ) {
    const brief =
      currentBrief();
    if (!brief) {
      return;
    }
    setLookAdjustments(
      (currentValue) => {
        const current =
          normalizeFoundryLookAdjustments(
            currentValue,
            brief,
            resourcePlan,
          );
        return {
          ...current,
          environment: {
            ...current.environment,
            ...patch,
          },
        };
      },
    );
  }

  function applyVisualAdjustment(
    finding:
      VisualCritiqueFinding,
  ) {
    if (
      !finding
        .suggested_adjustment
    ) {
      return;
    }
    const brief =
      currentBrief();
    if (!brief) {
      return;
    }
    setLookAdjustments(
      (currentValue) =>
        applyBoundedFoundryAdjustment(
          normalizeFoundryLookAdjustments(
            currentValue,
            brief,
            resourcePlan,
          ),
          {
            direction:
              finding
                .suggested_adjustment!
                .direction,
            affected_material_slot_ids:
              finding
                .affected_material_slot_ids,
            affected_part_ids:
              finding
                .affected_part_ids,
          },
        ),
    );
  }

  async function loadNativeVintageCameraProof() {
    setBusy(
      "fixture",
    );
    setPlanResponse(
      null,
    );
    setResourceResponse(
      null,
    );
    setGeneration(
      null,
    );
    setExecution(
      null,
    );
    setVisualCritique(
      null,
    );
    setImproveResponse(
      null,
    );
    setCandidateMessage(
      null,
    );
    setRevisions([]);
    try {
      const response =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/native-vintage-camera-proof",
          {
            cache:
              "no-store",
          },
        );
      const payload =
        (await response.json()) as
          NativeProofFixtureResponse;
      if (
        !payload.ok ||
        !payload.fixture
      ) {
        throw new Error(
          payload.error ??
            "The native camera proof fixture could not be loaded.",
        );
      }

      const fixture =
        payload.fixture;
      setRequest(
        fixture.request,
      );
      setAssetName(
        fixture.asset_name,
      );
      setStyle(
        fixture.style,
      );
      setQualityMode(
        fixture.quality_mode,
      );
      setTargetExtent(
        fixture.target_extent_m,
      );
      setMaxTriangles(
        fixture.max_triangles,
      );
      setAnimationReady(
        fixture.animation_ready,
      );
      setDesignBrief(
        fixture.design_brief,
      );
      resetLookDevelopment(
        fixture.design_brief,
        null,
      );
      setDesignBriefText(
        JSON.stringify(
          fixture.design_brief,
          null,
          2,
        ),
      );
      setResourcePlan(
        null,
      );
      setCode(
        fixture.code,
      );
      setMode(
        "guided",
      );
    } catch (caught) {
      setPlanResponse({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  async function planAsset() {
    setBusy("plan");
    setPlanResponse(
      null,
    );
    setResourcePlan(
      null,
    );
    setResourceResponse(
      null,
    );
    try {
      const response =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/plan",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                request,
                style,
                quality_mode:
                  qualityMode,
                animation_ready:
                  animationReady,
                target_extent_m:
                  targetExtent,
                max_triangles:
                  maxTriangles,
              }),
          },
        );
      const payload =
        (await response.json()) as
          PlanResponse;
      setPlanResponse(
        payload,
      );
      if (
        payload.ok &&
        payload.design_brief
      ) {
        setDesignBrief(
          payload.design_brief,
        );
        resetLookDevelopment(
          payload.design_brief,
          null,
        );
        setDesignBriefText(
          JSON.stringify(
            payload.design_brief,
            null,
            2,
          ),
        );
        setAssetName(
          payload.design_brief
            .asset_id,
        );
      }
    } catch (caught) {
      setPlanResponse({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  async function resolveResources() {
    setBusy(
      "resources",
    );
    setResourceResponse(
      null,
    );
    try {
      const brief =
        currentBrief();
      if (!brief) {
        throw new Error(
          "Create a visual design and build brief first.",
        );
      }
      const response =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/resources",
          {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type":
                "application/json",
              "Cache-Control":
                "no-store",
            },
            body:
              JSON.stringify({
                action:
                  "resolve",
                request,
                style,
                quality_mode:
                  qualityMode,
                target_extent_m:
                  targetExtent,
                max_triangles:
                  maxTriangles,
                animation_ready:
                  animationReady,
                design_brief:
                  brief,
                resource_plan:
                  resourcePlan,
              }),
          },
        );
      const payload =
        (await response.json()) as
          ResourceResponse;
      setResourceResponse(
        payload,
      );
      if (
        payload.ok &&
        payload.plan
      ) {
        setResourcePlan(
          payload.plan,
        );
        setLookAdjustments(
          (currentValue) =>
            normalizeFoundryLookAdjustments(
              currentValue,
              payload.design_brief ??
                brief,
              payload.plan,
            ),
        );
      }
    } catch (caught) {
      setResourceResponse({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  async function prepareResources() {
    setBusy("prepare");
    setResourceResponse(
      null,
    );
    try {
      const brief =
        currentBrief();
      if (
        !brief ||
        !resourcePlan
      ) {
        throw new Error(
          "Resolve the resource plan first.",
        );
      }

      const prepareResponse =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/resources",
          {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type":
                "application/json",
              "Cache-Control":
                "no-store",
            },
            body:
              JSON.stringify({
                action:
                  "prepare",
                request,
                design_brief:
                  brief,
                resource_plan:
                  resourcePlan,
              }),
          },
        );
      const preparedPayload =
        (await prepareResponse.json()) as
          ResourceResponse;

      if (
        !preparedPayload.ok ||
        !preparedPayload.plan
      ) {
        setResourceResponse(
          preparedPayload,
        );
        return;
      }

      // Preparation mutates the reviewed R2 registry. Resolve again from the
      // completed server result rather than waiting for a manual page refresh.
      let refreshedPlan =
        preparedPayload.plan;
      for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
      ) {
        const resolveResponse =
          await fetch(
            "/api/sandbox/probe-lab/blender-python-builder/resources",
            {
              method: "POST",
              cache: "no-store",
              headers: {
                "Content-Type":
                  "application/json",
                "Cache-Control":
                  "no-store",
              },
              body:
                JSON.stringify({
                  action:
                    "resolve",
                  request,
                  style,
                  quality_mode:
                    qualityMode,
                  target_extent_m:
                    targetExtent,
                  max_triangles:
                    maxTriangles,
                  animation_ready:
                    animationReady,
                  design_brief:
                    brief,
                  resource_plan:
                    refreshedPlan,
                }),
            },
          );
        const resolvedPayload =
          (await resolveResponse.json()) as
            ResourceResponse;

        if (
          resolvedPayload.ok &&
          resolvedPayload.plan
        ) {
          refreshedPlan =
            resolvedPayload.plan;
          if (
            !refreshedPlan.summary
              .requires_preparation
          ) {
            break;
          }
        }

        if (attempt < 2) {
          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                250 *
                  (attempt + 1),
              ),
          );
        }
      }

      setResourcePlan(
        refreshedPlan,
      );
      setLookAdjustments(
        (currentValue) =>
          normalizeFoundryLookAdjustments(
            currentValue,
            brief,
            refreshedPlan,
          ),
      );
      setResourceResponse({
        ...preparedPayload,
        plan: refreshedPlan,
      });
    } catch (caught) {
      setResourceResponse({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  function updateMaterialCandidate(
    slotId: string,
    candidateIndex:
      number,
  ) {
    setResourcePlan(
      (current) => {
        if (!current) {
          return current;
        }
        const bindings =
          current
            .material_bindings
            .map(
              (binding) => {
                if (
                  binding.slot
                    .slot_id !==
                  slotId
                ) {
                  return binding;
                }
                const selected =
                  binding
                    .candidates[
                    candidateIndex
                  ];
                if (!selected) {
                  return binding;
                }
                return {
                  ...binding,
                  selected,
                  status:
                    selected
                      .candidate_kind ===
                      "cached_r2"
                      ? "ready_r2" as const
                      : selected
                          .candidate_kind ===
                          "ambientcg_catalog"
                        ? "catalog_match" as const
                        : "procedural_fallback" as const,
                };
              },
            );
        const catalogMatches =
          bindings.filter(
            (binding) =>
              binding.status ===
              "catalog_match",
          ).length +
          (
            current.environment
              .status ===
            "catalog_match"
              ? 1
              : 0
          );
        return {
          ...current,
          material_bindings:
            bindings,
          summary: {
            ...current.summary,
            catalog_matches:
              catalogMatches,
            requires_preparation:
              catalogMatches >
              0,
          },
        };
      },
    );
  }

  function updateEnvironmentCandidate(
    candidateIndex:
      number,
  ) {
    setResourcePlan(
      (current) => {
        if (!current) {
          return current;
        }
        const selected =
          current.environment
            .candidates[
            candidateIndex
          ];
        if (!selected) {
          return current;
        }
        const status =
          selected
            .candidate_kind ===
            "cached_r2"
            ? "ready_r2" as const
            : selected
                .candidate_kind ===
                "ambientcg_catalog"
              ? "catalog_match" as const
              : "trusted_studio_fallback" as const;
        const catalogMatches =
          current
            .material_bindings
            .filter(
              (binding) =>
                binding.status ===
                "catalog_match",
            ).length +
          (
            status ===
            "catalog_match"
              ? 1
              : 0
          );
        return {
          ...current,
          environment: {
            ...current.environment,
            selected,
            status,
          },
          summary: {
            ...current.summary,
            catalog_matches:
              catalogMatches,
            requires_preparation:
              catalogMatches >
              0,
          },
        };
      },
    );
  }

  async function generateCode() {
    setBusy("generate");
    setGeneration(
      null,
    );
    try {
      const brief =
        currentBrief();
      const response =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/generate",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                request,
                style,
                quality_mode:
                  qualityMode,
                animation_ready:
                  animationReady,
                target_extent_m:
                  targetExtent,
                max_triangles:
                  maxTriangles,
                design_brief:
                  brief,
                resource_plan:
                  resourcePlan,
              }),
          },
        );
      const payload =
        (await response.json()) as
          GenerateResponse;
      setGeneration(
        payload,
      );
      if (
        payload.code
      ) {
        setCode(
          payload.code,
        );
        if (
          payload.design_brief
        ) {
          setDesignBrief(
            payload.design_brief,
          );
          setDesignBriefText(
            JSON.stringify(
              payload.design_brief,
              null,
              2,
            ),
          );
        }
        if (
          payload.resource_plan
        ) {
          setResourcePlan(
            payload.resource_plan,
          );
        }
        setMode("code");
      }
    } catch (caught) {
      setGeneration({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  async function executeCode(
    boundedRepair =
      false,
    revisionLabelOverride?:
      string,
  ) {
    setBusy("execute");
    setExecution(
      null,
    );
    setVisualCritique(
      null,
    );
    try {
      const brief =
        currentBrief();
      const previous =
        revisions.at(
          -1,
        );
      const revisionLabel =
        revisionLabelOverride ??
        (
          critique.trim()
            ? "quality improvement"
            : (
                revisions.length
                  ? "manual revision"
                  : "initial build"
              )
        );
      const activeLookAdjustments =
        brief
          ? normalizedLookAdjustments(
              brief,
              resourcePlan,
            )
          : null;
      const response =
        await fetch(
          boundedRepair
            ? "/api/sandbox/probe-lab/blender-python-builder/execute-with-repair"
            : "/api/sandbox/probe-lab/blender-python-builder/execute",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                code,
                asset_name:
                  assetName,
                request,
                style,
                quality_mode:
                  qualityMode,
                target_extent_m:
                  targetExtent,
                max_triangles:
                  maxTriangles,
                animation_ready:
                  animationReady,
                asset_spec:
                  generation
                    ?.asset_spec ??
                  null,
                design_brief:
                  brief,
                resource_plan:
                  resourcePlan,
                look_adjustments:
                  activeLookAdjustments,
                max_repair_attempts:
                  boundedRepair
                    ? 2
                    : 0,
                parent_job_id:
                  previous
                    ?.execution
                    .job_id ??
                  null,
                revision_number:
                  revisions.length +
                  1,
                revision_label:
                  revisionLabel,
                critique:
                  critique.trim() ||
                  null,
              }),
          },
        );
      const payload =
        (await response.json()) as
          ExecuteResponse;
      setExecution(
        payload,
      );
      if (
        payload.look_adjustments
      ) {
        setLookAdjustments(
          payload.look_adjustments,
        );
      }
      if (
        payload.final_code &&
        payload.final_code !==
          code
      ) {
        setCode(
          payload.final_code,
        );
      }
      if (
        payload.ok &&
        payload.job_id
      ) {
        setRevisions(
          (current) => [
            ...current,
            {
              revision:
                current.length +
                1,
              label:
                revisionLabel,
              code:
                payload
                  .final_code ??
                code,
              execution:
                payload,
            },
          ],
        );
      }
    } catch (caught) {
      setExecution({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  async function analyzeVisualCritique() {
    if (
      !execution?.job_id
    ) {
      return;
    }
    const jobId =
      execution.job_id;
    setBusy(
      "visual-critique",
    );
    setVisualCritique(
      null,
    );
    try {
      const response =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/visual-critique",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                job_id:
                  jobId,
              }),
          },
        );
      const payload =
        (await response.json()) as
          VisualCritiqueResponse;
      setVisualCritique(
        payload,
      );
      if (
        payload.ok &&
        payload.report
      ) {
        const report =
          payload.report;
        setExecution(
          (current) =>
            current?.job_id ===
            jobId
              ? {
                  ...current,
                  visual_critique:
                    report,
                  visual_critique_url:
                    payload.visual_critique_url ??
                    null,
                }
              : current,
        );
        setRevisions(
          (current) =>
            current.map(
              (revision) =>
                revision.execution
                  .job_id ===
                jobId
                  ? {
                      ...revision,
                      execution: {
                        ...revision.execution,
                        visual_critique:
                          report,
                        visual_critique_url:
                          payload.visual_critique_url ??
                          null,
                      },
                    }
                  : revision,
            ),
        );
      }
    } catch (caught) {
      setVisualCritique({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  async function improveCode() {
    setBusy("improve");
    setImproveResponse(
      null,
    );
    try {
      const brief =
        currentBrief();
      if (!brief) {
        throw new Error(
          "A visual design and build brief is required for targeted improvement.",
        );
      }
      if (!execution?.ok) {
        throw new Error(
          "Run the current code successfully before requesting a quality improvement.",
        );
      }
      const visualReport =
        visualCritique?.report ??
        execution.visual_critique ??
        null;
      if (
        visualReport &&
        visualReport.routing_summary
          .blender_code === 0 &&
        !critique.trim()
      ) {
        throw new Error(
          "The visual critic found no Blender-code revision. Its remaining findings belong to material mapping, look development, or human review; add a specific geometry critique to revise the script anyway.",
        );
      }
      const response =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/improve",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                request,
                style,
                quality_mode:
                  qualityMode,
                target_extent_m:
                  targetExtent,
                max_triangles:
                  maxTriangles,
                animation_ready:
                  animationReady,
                design_brief:
                  brief,
                code,
                critique,
                build_validation:
                  execution
                    .build_validation,
                quality_findings:
                  execution
                    .quality_report
                    ?.findings ??
                  [],
                resource_plan:
                  execution
                    .resource_plan ??
                  resourcePlan,
                visual_critique:
                  visualReport,
              }),
          },
        );
      const payload =
        (await response.json()) as
          GenerateResponse;
      setImproveResponse(
        payload,
      );
      if (
        payload.ok &&
        payload.code
      ) {
        setCode(
          payload.code,
        );
        setMode("code");
      }
    } catch (caught) {
      setImproveResponse({
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveCandidate() {
    if (
      !execution?.job_id
    ) {
      return;
    }
    setBusy(
      "candidate",
    );
    setCandidateMessage(
      null,
    );
    try {
      const response =
        await fetch(
          "/api/sandbox/probe-lab/blender-python-builder/candidate",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                job_id:
                  execution.job_id,
                review_notes:
                  critique.trim() ||
                  undefined,
              }),
          },
        );
      const payload =
        (await response.json()) as {
          ok: boolean;
          error?: string;
          candidate?: {
            candidate_id?:
              string;
            review_status?:
              string;
          };
        };
      if (!payload.ok) {
        throw new Error(
          payload.error ??
            "Candidate save failed.",
        );
      }
      setCandidateMessage(
        `Saved candidate ${payload.candidate?.candidate_id?.slice(0, 8) ?? ""} as ${payload.candidate?.review_status ?? "needs_review"}.`,
      );
    } catch (caught) {
      setCandidateMessage(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setBusy(null);
    }
  }

  const qualityScore =
    execution
      ?.quality_report
      ?.score;
  const canPrepare =
    resourcePlan
      ?.summary
      .requires_preparation ===
    true;
  const visualDescription =
    designBrief
      ?.visual_description ??
    null;

  return (
    <main
      style={{
        minHeight:
          "100vh",
        padding:
          "clamp(18px, 3vw, 42px)",
        color:
          "#e2e8f0",
        background:
          "radial-gradient(circle at 12% 0%, rgba(14,165,233,0.18), transparent 34%), radial-gradient(circle at 92% 8%, rgba(168,85,247,0.15), transparent 30%), #050816",
      }}
    >
      <div
        style={{
          maxWidth: 1760,
          margin: "0 auto",
        }}
      >
        <a
          href="/sandbox/probe-lab"
          style={{
            color:
              "#7dd3fc",
            textDecoration:
              "none",
          }}
        >
          ← Probe Lab
        </a>

        <div
          style={{
            margin:
              "18px 0 22px",
          }}
        >
          <div
            style={{
              color:
                "#38bdf8",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing:
                "0.16em",
              textTransform:
                "uppercase",
            }}
          >
            Visual design + brief → resources → Blender Python → benchmark inspection
          </div>
          <h1
            style={{
              margin:
                "8px 0",
              fontSize:
                "clamp(30px, 5vw, 58px)",
            }}
          >
            Blender Asset Foundry
          </h1>
          <p
            style={{
              maxWidth: 1040,
              color:
                "#94a3b8",
              lineHeight: 1.65,
            }}
          >
            Build assets toward the construction quality of the native camera,
            furniture, burger, and apple benchmarks: strong silhouettes,
            coherent construction, softened edges, semantic material regions,
            real PBR response, and useful inspection—not merely valid GLBs.
          </p>
        </div>

        <div
          style={{
            display:
              "flex",
            gap: 8,
            marginBottom: 18,
          }}
        >
          {(
            [
              [
                "guided",
                "Guided build",
              ],
              [
                "code",
                "Code / paste",
              ],
            ] as const
          ).map(
            ([
              value,
              label,
            ]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setMode(
                    value,
                  )
                }
                style={{
                  borderRadius:
                    999,
                  border:
                    mode ===
                    value
                      ? "1px solid #38bdf8"
                      : "1px solid rgba(148,163,184,0.28)",
                  background:
                    mode ===
                    value
                      ? "rgba(14,165,233,0.2)"
                      : "transparent",
                  color:
                    mode ===
                    value
                      ? "#bae6fd"
                      : "#cbd5e1",
                  padding:
                    "10px 16px",
                  fontWeight:
                    800,
                  cursor:
                    "pointer",
                }}
              >
                {label}
              </button>
            ),
          )}
        </div>

        <section
          style={{
            ...panelStyle,
            padding:
              "14px 16px",
            marginBottom: 18,
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap: 14,
            flexWrap:
              "wrap",
            border:
              "1px solid rgba(34,197,94,0.35)",
            background:
              "linear-gradient(135deg, rgba(22,101,52,0.18), rgba(15,23,42,0.82))",
          }}
        >
          <div
            style={{
              minWidth: 260,
              flex: "1 1 620px",
            }}
          >
            <strong
              style={{
                color:
                  "#bbf7d0",
              }}
            >
              Native vintage-camera cloud proof
            </strong>
            <div
              style={{
                marginTop: 4,
                color:
                  "#94a3b8",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              Loads the successful native-bpy camera strategy plus semantic
              paint, leather, brass, rubber, dark-metal, and studio-HDRI slots.
              Match chooses AmbientCG IDs automatically; Prepare publishes
              missing resources to R2; Run hydrates temporary local copies for
              your installed Blender.
            </div>
          </div>
          <button
            type="button"
            onClick={
              loadNativeVintageCameraProof
            }
            disabled={
              busy !== null
            }
            style={{
              border: 0,
              borderRadius: 11,
              padding:
                "11px 15px",
              fontWeight: 850,
              background:
                "#22c55e",
              color:
                "#052e16",
              cursor:
                "pointer",
              opacity:
                busy === null
                  ? 1
                  : 0.55,
            }}
          >
            {busy ===
            "fixture"
              ? "Loading proof…"
              : "Load native camera proof"}
          </button>
        </section>


        {mode ===
        "guided" ? (
          <div
            style={{
              display:
                "grid",
              gap: 18,
            }}
          >
            <section
              style={{
                ...panelStyle,
                padding: 20,
                display:
                  "grid",
                gap: 16,
                gridTemplateColumns:
                  "minmax(0, 1.5fr) minmax(270px, 0.5fr)",
              }}
            >
              <label
                style={{
                  display:
                    "grid",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontWeight:
                      800,
                  }}
                >
                  Describe the asset
                </span>
                <textarea
                  value={
                    request
                  }
                  onChange={(
                    event,
                  ) =>
                    setRequest(
                      event
                        .target
                        .value,
                    )
                  }
                  rows={7}
                  style={{
                    ...inputStyle,
                    width:
                      "100%",
                    resize:
                      "vertical",
                    font:
                      "inherit",
                    lineHeight:
                      1.55,
                  }}
                />
              </label>

              <div
                style={{
                  display:
                    "grid",
                  gap: 11,
                }}
              >
                <label
                  style={{
                    display:
                      "grid",
                    gap: 5,
                  }}
                >
                  <span>
                    Asset name
                  </span>
                  <input
                    value={
                      assetName
                    }
                    onChange={(
                      event,
                    ) =>
                      setAssetName(
                        event
                          .target
                          .value,
                      )
                    }
                    style={
                      inputStyle
                    }
                  />
                </label>
                <label
                  style={{
                    display:
                      "grid",
                    gap: 5,
                  }}
                >
                  <span>
                    Style
                  </span>
                  <input
                    value={
                      style
                    }
                    onChange={(
                      event,
                    ) =>
                      setStyle(
                        event
                          .target
                          .value,
                      )
                    }
                    style={
                      inputStyle
                    }
                  />
                </label>
                <label
                  style={{
                    display:
                      "grid",
                    gap: 5,
                  }}
                >
                  <span>
                    Quality
                  </span>
                  <select
                    value={
                      qualityMode
                    }
                    onChange={(
                      event,
                    ) =>
                      setQualityMode(
                        event
                          .target
                          .value as
                          FoundryQualityMode,
                      )
                    }
                    style={
                      inputStyle
                    }
                  >
                    <option
                      value="draft"
                    >
                      Draft · 1K
                    </option>
                    <option
                      value="standard"
                    >
                      Standard · 2K
                    </option>
                    <option
                      value="hero"
                    >
                      Hero · 4K
                    </option>
                  </select>
                </label>
                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <label
                    style={{
                      display:
                        "grid",
                      gap: 5,
                    }}
                  >
                    <span>
                      Extent (m)
                    </span>
                    <input
                      type="number"
                      min={0.02}
                      max={100}
                      step={0.1}
                      value={
                        targetExtent
                      }
                      onChange={(
                        event,
                      ) =>
                        setTargetExtent(
                          Number(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                      style={
                        inputStyle
                      }
                    />
                  </label>
                  <label
                    style={{
                      display:
                        "grid",
                      gap: 5,
                    }}
                  >
                    <span>
                      Triangles
                    </span>
                    <input
                      type="number"
                      min={100}
                      max={
                        2_000_000
                      }
                      step={500}
                      value={
                        maxTriangles
                      }
                      onChange={(
                        event,
                      ) =>
                        setMaxTriangles(
                          Number(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                      style={
                        inputStyle
                      }
                    />
                  </label>
                </div>
                <label
                  style={{
                    display:
                      "flex",
                    gap: 8,
                    alignItems:
                      "center",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      animationReady
                    }
                    onChange={(
                      event,
                    ) =>
                      setAnimationReady(
                        event
                          .target
                          .checked,
                      )
                    }
                  />
                  Animation-ready parts and pivots
                </label>
              </div>
            </section>

            <section
              style={{
                ...panelStyle,
                padding: 18,
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  flexWrap:
                    "wrap",
                  gap: 10,
                  alignItems:
                    "center",
                }}
              >
                <button
                  type="button"
                  onClick={
                    planAsset
                  }
                  disabled={
                    busy !==
                      null ||
                    !request.trim()
                  }
                  style={{
                    border: 0,
                    borderRadius:
                      11,
                    padding:
                      "11px 15px",
                    fontWeight:
                      850,
                    background:
                      "#0ea5e9",
                    color:
                      "#03111c",
                    cursor:
                      "pointer",
                  }}
                >
                  {busy ===
                  "plan"
                    ? "Designing + reviewing…"
                    : "1. Create visual design + brief"}
                </button>
                <button
                  type="button"
                  onClick={
                    resolveResources
                  }
                  disabled={
                    busy !==
                      null ||
                    !designBrief
                  }
                  style={{
                    border:
                      "1px solid rgba(56,189,248,0.45)",
                    borderRadius:
                      11,
                    padding:
                      "11px 15px",
                    fontWeight:
                      850,
                    background:
                      "rgba(14,165,233,0.12)",
                    color:
                      "#bae6fd",
                    cursor:
                      "pointer",
                  }}
                >
                  {busy ===
                  "resources"
                    ? "Searching…"
                    : "2. Match materials + HDRI"}
                </button>
                <button
                  type="button"
                  onClick={
                    prepareResources
                  }
                  disabled={
                    busy !==
                      null ||
                    !canPrepare
                  }
                  style={{
                    border:
                      "1px solid rgba(251,191,36,0.5)",
                    borderRadius:
                      11,
                    padding:
                      "11px 15px",
                    fontWeight:
                      850,
                    background:
                      "rgba(245,158,11,0.13)",
                    color:
                      "#fde68a",
                    cursor:
                      "pointer",
                    opacity:
                      canPrepare
                        ? 1
                        : 0.45,
                  }}
                >
                  {busy ===
                  "prepare"
                    ? "Downloading + publishing…"
                    : "3. Prepare uncached resources"}
                </button>
                <button
                  type="button"
                  onClick={
                    generateCode
                  }
                  disabled={
                    busy !==
                      null ||
                    !designBrief
                  }
                  style={{
                    border: 0,
                    borderRadius:
                      11,
                    padding:
                      "11px 15px",
                    fontWeight:
                      850,
                    background:
                      "#a3e635",
                    color:
                      "#18210a",
                    cursor:
                      "pointer",
                  }}
                >
                  {busy ===
                  "generate"
                    ? "Generating Blender Python…"
                    : "4. Generate Blender Python"}
                </button>
              </div>

              <div
                style={{
                  marginTop: 12,
                  color:
                    "#94a3b8",
                  fontSize: 13,
                  lineHeight:
                    1.6,
                }}
              >
                R2-ready resources are used immediately. Uncached AmbientCG
                catalog selections are downloaded only when you press Prepare.
                Original AmbientCG names remain unchanged.
              </div>

              {planResponse && (
                <div
                  style={{
                    marginTop: 10,
                    color:
                      planResponse.ok
                        ? "#86efac"
                        : "#fca5a5",
                    fontSize: 13,
                  }}
                >
                  {planResponse.ok
                    ? `${planResponse.model ?? "GLM"} created the visual design and build brief in ${formatDurationMs(planResponse.elapsed_ms)}${planResponse.design_review?.reviewed ? " after an independent design-review pass" : ""}.`
                    : planResponse.error}
                  {planResponse.ok &&
                  planResponse.design_review?.review_error ? (
                    <div
                      style={{
                        marginTop: 4,
                        color: "#fde68a",
                      }}
                    >
                      The visual-design review call failed, so the initial blueprint was kept: {planResponse.design_review.review_error}
                    </div>
                  ) : null}
                </div>
              )}
              {resourceResponse && (
                <div
                  style={{
                    marginTop: 8,
                    color:
                      resourceResponse.ok
                        ? "#86efac"
                        : "#fca5a5",
                    fontSize: 13,
                  }}
                >
                  {resourceResponse.ok
                    ? resourceResponse.prepared?.length
                      ? `Prepared ${resourceResponse.prepared.length} resource(s) and resolved the plan again.`
                      : "Resource plan resolved."
                    : resourceResponse.error}
                </div>
              )}
              {generation && (
                <div
                  style={{
                    marginTop: 8,
                    color:
                      generation.ok
                        ? "#86efac"
                        : "#fca5a5",
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  <div>
                    {generation.ok
                      ? `${generation.model ?? "GLM"} returned ${generation.line_count ?? "—"} lines in ${formatDurationMs(generation.elapsed_ms)} using native bpy with the camera as the only code example. Preflight passed${generation.preflight_repair?.attempted ? " after one automatic correction pass" : ""}.`
                      : generation.error ??
                        `GLM code is available for review, but ${generation.preflight_validation?.errors?.length ?? 0} preflight error(s) still block Blender execution.`}
                  </div>
                  {generation.context_package ? (
                    <details
                      style={{
                        marginTop: 8,
                        color: "#cbd5e1",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        GLM context package · {generation.context_package.runtime?.blender_version ?? "Blender runtime"} · native bpy · camera example only
                      </summary>
                      <pre
                        style={{
                          margin: "8px 0 0",
                          maxHeight: 320,
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          background: "#020617",
                          borderRadius: 10,
                          padding: 12,
                          fontSize: 11,
                          lineHeight: 1.5,
                          color: "#bfdbfe",
                        }}
                      >
                        {JSON.stringify(
                          generation.context_package,
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ) : null}
                  {(generation.preflight_validation?.errors?.length ||
                    generation.preflight_validation?.warnings?.length) ? (
                    <details
                      style={{
                        marginTop: 8,
                        color: "#cbd5e1",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Preflight details · {generation.preflight_validation?.errors?.length ?? 0} error(s) · {generation.preflight_validation?.warnings?.length ?? 0} warning(s)
                      </summary>
                      <div
                        style={{
                          marginTop: 8,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        {[
                          ...(generation.preflight_validation?.errors ?? []).map((item) => ({ ...item, severity: "error" as const })),
                          ...(generation.preflight_validation?.warnings ?? []).map((item) => ({ ...item, severity: "warning" as const })),
                        ].map((item, index) => (
                          <div
                            key={`${item.severity}-${item.code ?? index}-${item.line ?? "none"}`}
                            style={{
                              color:
                                item.severity === "error"
                                  ? "#fca5a5"
                                  : "#fde68a",
                            }}
                          >
                            {item.severity === "error" ? "Error" : "Warning"}
                            {item.line ? ` · line ${item.line}` : ""}
                            {item.helper ? ` · ${item.helper}` : ""}: {item.message ?? item.code ?? "Preflight finding"}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
            </section>

            {designBrief && (
              <section
                style={{
                  ...panelStyle,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    gap: 12,
                    alignItems:
                      "center",
                    flexWrap:
                      "wrap",
                  }}
                >
                  <div>
                    <strong>
                      Visual design + build brief
                    </strong>
                    <div
                      style={{
                        color:
                          "#94a3b8",
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      {designBrief.asset_class.replaceAll("_", " ")} ·{" "}
                      {designBrief.parts.length} parts ·{" "}
                      {designBrief.material_slots.length} material slots ·{" "}
                      {visualDescription?.normalized_proportions.length ?? 0} measured proportions
                    </div>
                  </div>
                  <span
                    style={{
                      color:
                        "#bae6fd",
                      fontSize: 12,
                    }}
                  >
                    Editable before generation
                  </span>
                </div>
                {visualDescription ? (
                  <div
                    style={{
                      marginTop: 14,
                      border: "1px solid rgba(56,189,248,0.26)",
                      borderRadius: 14,
                      background: "rgba(14,165,233,0.07)",
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <strong
                        style={{
                          color: "#bae6fd",
                        }}
                      >
                        Text-authored visual reference
                      </strong>
                      <span
                        style={{
                          color: "#7dd3fc",
                          fontSize: 12,
                        }}
                      >
                        {visualDescription.part_layout.filter(
                          (part) =>
                            Boolean(
                              part.dimensions_m &&
                              part.position_m,
                            ),
                        ).length} dimensioned parts
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        color: "#dbeafe",
                        fontSize: 13,
                        lineHeight: 1.55,
                      }}
                    >
                      {visualDescription.design_summary}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(190px, 1fr))",
                        gap: 8,
                        color: "#cbd5e1",
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <strong>Overall dimensions</strong>
                        <div style={{ marginTop: 3 }}>
                          {visualDescription.overall_dimensions_m
                            ? visualDescription.overall_dimensions_m
                                .map((value) => `${value.toFixed(3)} m`)
                                .join(" × ")
                            : "Not specified"}
                        </div>
                      </div>
                      <div>
                        <strong>Shape language</strong>
                        <div style={{ marginTop: 3 }}>
                          {visualDescription.shape_language.primary_forms.join(", ") || "Not specified"}
                        </div>
                      </div>
                      <div>
                        <strong>Edge character</strong>
                        <div style={{ marginTop: 3 }}>
                          {visualDescription.shape_language.edge_character}
                        </div>
                      </div>
                    </div>
                    <details
                      style={{
                        marginTop: 12,
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          color: "#bae6fd",
                          fontWeight: 750,
                        }}
                      >
                        Orthographic descriptions and measured ratios
                      </summary>
                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: 10,
                          color: "#cbd5e1",
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        {[
                          ["Front", visualDescription.orthographic_views.front],
                          ["Right", visualDescription.orthographic_views.right],
                          ["Top", visualDescription.orthographic_views.top],
                          ["Three-quarter", visualDescription.orthographic_views.three_quarter],
                        ].map(([label, description]) => (
                          <div
                            key={label}
                            style={{
                              background: "rgba(2,6,23,0.48)",
                              borderRadius: 10,
                              padding: 10,
                            }}
                          >
                            <strong>{label}</strong>
                            <div style={{ marginTop: 4 }}>{description}</div>
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gap: 5,
                          color: "#bfdbfe",
                          fontSize: 12,
                        }}
                      >
                        {visualDescription.normalized_proportions.map(
                          (item) => (
                            <div key={item.relationship}>
                              {item.relationship}: {item.ratio.toFixed(3)} ± {item.tolerance.toFixed(3)}
                            </div>
                          ),
                        )}
                      </div>
                    </details>
                  </div>
                ) : null}

                <details
                  style={{
                    marginTop: 12,
                  }}
                >
                  <summary
                    style={{
                      cursor:
                        "pointer",
                      color:
                        "#cbd5e1",
                    }}
                  >
                    Advanced: edit full JSON
                  </summary>
                  <textarea
                    value={
                      designBriefText
                    }
                    onChange={(
                      event,
                    ) =>
                      setDesignBriefText(
                        event
                          .target
                          .value,
                      )
                    }
                    spellCheck={
                      false
                    }
                    style={{
                      ...inputStyle,
                      width:
                        "100%",
                      minHeight:
                        420,
                      marginTop: 10,
                      resize:
                        "vertical",
                      fontFamily:
                        '"Cascadia Code", Consolas, monospace',
                      fontSize: 12,
                      lineHeight:
                        1.5,
                    }}
                  />
                </details>
              </section>
            )}

            {resourcePlan && (
              <section
                style={{
                  ...panelStyle,
                  padding: 18,
                }}
              >
                <strong>
                  Resource plan
                </strong>
                <div
                  style={{
                    color:
                      "#94a3b8",
                    fontSize: 12,
                    margin:
                      "5px 0 14px",
                  }}
                >
                  {resourcePlan.summary.ready_r2} R2 ready ·{" "}
                  {resourcePlan.summary.catalog_matches} catalog match(es) ·{" "}
                  {resourcePlan.summary.procedural_fallbacks} fallback(s)
                </div>

                <div
                  style={{
                    display:
                      "grid",
                    gap: 10,
                  }}
                >
                  {resourcePlan.material_bindings.map(
                    (
                      binding,
                    ) => (
                      <div
                        key={
                          binding
                            .slot
                            .slot_id
                        }
                        style={{
                          border:
                            "1px solid rgba(148,163,184,0.18)",
                          borderRadius:
                            12,
                          padding: 12,
                          display:
                            "grid",
                          gap: 8,
                          gridTemplateColumns:
                            "minmax(180px, 0.35fr) minmax(0, 0.65fr)",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight:
                                800,
                            }}
                          >
                            {
                              binding
                                .slot
                                .display_name
                            }
                          </div>
                          <div
                            style={{
                              color:
                                statusColor(
                                  binding.status,
                                ),
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            {binding.status.replaceAll("_", " ")}
                          </div>
                          <div
                            style={{
                              color:
                                "#64748b",
                              fontSize: 11,
                              marginTop: 4,
                            }}
                          >
                            Assigned:{" "}
                            {binding.slot.assigned_part_ids.join(", ") || "plan-defined"}
                          </div>
                        </div>
                        <select
                          value={Math.max(
                            0,
                            binding.candidates.findIndex(
                              (
                                candidate,
                              ) =>
                                candidate ===
                                  binding.selected ||
                                (
                                  candidate.resource_id ===
                                    binding.selected.resource_id &&
                                  candidate.source_asset_id ===
                                    binding.selected.source_asset_id &&
                                  candidate.variant_id ===
                                    binding.selected.variant_id
                                ),
                            ),
                          )}
                          onChange={(
                            event,
                          ) =>
                            updateMaterialCandidate(
                              binding
                                .slot
                                .slot_id,
                              Number(
                                event
                                  .target
                                  .value,
                              ),
                            )
                          }
                          style={
                            inputStyle
                          }
                        >
                          {binding.candidates.map(
                            (
                              candidate,
                              index,
                            ) => (
                              <option
                                key={`${candidate.candidate_kind}-${candidate.resource_id ?? candidate.source_asset_id ?? index}-${candidate.variant_id ?? ""}`}
                                value={
                                  index
                                }
                              >
                                {candidateLabel(candidate)}
                              </option>
                            ),
                          )}
                        </select>
                        <div
                          style={{
                            display: "grid",
                            gap: 4,
                            marginTop: 7,
                            color: "#94a3b8",
                            fontSize: 11,
                            lineHeight: 1.45,
                          }}
                        >
                          {binding.selected.appearance_summary ? (
                            <div
                              style={{
                                color: "#cbd5e1",
                              }}
                            >
                              {binding.selected.appearance_summary}
                            </div>
                          ) : null}
                          <div>
                            Match confidence:{" "}
                            {Math.round(
                              binding.selected.match_confidence * 100,
                            )}
                            %
                            {binding.selected.dominant_colors.length
                              ? ` · Colors: ${binding.selected.dominant_colors.join(", ")}`
                              : ""}
                            {binding.selected.brightness
                              ? ` · ${binding.selected.brightness} brightness`
                              : ""}
                          </div>
                          <div>
                            {binding.selected.reasons.join(" · ")}
                          </div>
                        </div>
                      </div>
                    ),
                  )}

                  <div
                    style={{
                      border:
                        "1px solid rgba(148,163,184,0.18)",
                      borderRadius:
                        12,
                      padding: 12,
                      display:
                        "grid",
                      gap: 8,
                      gridTemplateColumns:
                        "minmax(180px, 0.35fr) minmax(0, 0.65fr)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight:
                            800,
                        }}
                      >
                        Look-development HDRI
                      </div>
                      <div
                        style={{
                          color:
                            statusColor(
                              resourcePlan.environment.status,
                            ),
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        {resourcePlan.environment.status.replaceAll("_", " ")}
                      </div>
                    </div>
                    <select
                      value={Math.max(
                        0,
                        resourcePlan.environment.candidates.findIndex(
                          (
                            candidate,
                          ) =>
                            candidate ===
                              resourcePlan.environment.selected ||
                            (
                              candidate.resource_id ===
                                resourcePlan.environment.selected.resource_id &&
                              candidate.source_asset_id ===
                                resourcePlan.environment.selected.source_asset_id &&
                              candidate.variant_id ===
                                resourcePlan.environment.selected.variant_id
                            ),
                        ),
                      )}
                      onChange={(
                        event,
                      ) =>
                        updateEnvironmentCandidate(
                          Number(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                      style={
                        inputStyle
                      }
                    >
                      {resourcePlan.environment.candidates.map(
                        (
                          candidate,
                          index,
                        ) => (
                          <option
                            key={`${candidate.candidate_kind}-${candidate.resource_id ?? candidate.source_asset_id ?? index}-${candidate.variant_id ?? ""}`}
                            value={
                              index
                            }
                          >
                            {candidateLabel(candidate)}
                          </option>
                        ),
                      )}
                    </select>
                    <div
                      style={{
                        display: "grid",
                        gap: 4,
                        marginTop: 7,
                        color: "#94a3b8",
                        fontSize: 11,
                        lineHeight: 1.45,
                      }}
                    >
                      {resourcePlan.environment.selected.appearance_summary ? (
                        <div
                          style={{
                            color: "#cbd5e1",
                          }}
                        >
                          {resourcePlan.environment.selected.appearance_summary}
                        </div>
                      ) : null}
                      <div>
                        Match confidence:{" "}
                        {Math.round(
                          resourcePlan.environment.selected.match_confidence * 100,
                        )}
                        %
                      </div>
                      <div>
                        {resourcePlan.environment.selected.reasons.join(" · ")}
                      </div>
                    </div>
                  </div>
                </div>

                {visibleLookAdjustments ? (
                  <details
                    open
                    style={{
                      marginTop: 16,
                      borderTop:
                        "1px solid rgba(148,163,184,0.18)",
                      paddingTop: 14,
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 850,
                        color: "#e0f2fe",
                      }}
                    >
                      Material mapping & look development
                    </summary>
                    <div
                      style={{
                        marginTop: 7,
                        color: "#94a3b8",
                        fontSize: 12,
                        lineHeight: 1.55,
                      }}
                    >
                      Material IDs and selected R2 resources stay immutable. These controls only change mapping, PBR response, exposure, and the trusted fallback light rig. Re-running uses the same Blender Python without calling GLM.
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 12,
                        marginTop: 14,
                      }}
                    >
                      {resourcePlan.material_bindings.map(
                        (binding) => {
                          const slotId =
                            binding.slot.slot_id;
                          const look =
                            materialLookTarget(
                              slotId,
                            ) ??
                            visibleLookAdjustments
                              .material_slots[
                                slotId
                              ];
                          if (!look) {
                            return null;
                          }
                          const target =
                            lookTargetBySlot[
                              slotId
                            ] ??
                            "__slot__";
                          return (
                            <div
                              key={`look-${slotId}`}
                              style={{
                                border:
                                  "1px solid rgba(56,189,248,0.18)",
                                borderRadius: 12,
                                padding: 12,
                                background:
                                  "rgba(2,6,23,0.36)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  justifyContent:
                                    "space-between",
                                  alignItems:
                                    "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <strong>
                                  {binding.slot.display_name}
                                </strong>
                                <select
                                  value={target}
                                  onChange={(event) =>
                                    setLookTargetBySlot(
                                      (current) => ({
                                        ...current,
                                        [slotId]:
                                          event.target.value,
                                      }),
                                    )
                                  }
                                  style={{
                                    ...inputStyle,
                                    padding: 8,
                                    minWidth: 220,
                                  }}
                                >
                                  <option value="__slot__">
                                    Slot default
                                  </option>
                                  {binding.slot.assigned_part_ids.map(
                                    (partId) => (
                                      <option
                                        key={partId}
                                        value={partId}
                                      >
                                        Part override: {partId}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(150px, 1fr))",
                                  gap: 9,
                                  marginTop: 10,
                                }}
                              >
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Mapping
                                  </div>
                                  <select
                                    value={look.mapping_mode}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          mapping_mode:
                                            event.target.value ===
                                            "object_box"
                                              ? "object_box"
                                              : "uv",
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  >
                                    <option value="uv">UV</option>
                                    <option value="object_box">Object box</option>
                                  </select>
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Physical scale (m)
                                  </div>
                                  <input
                                    type="number"
                                    min="0.000001"
                                    step="0.005"
                                    value={look.physical_scale_m ?? ""}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          physical_scale_m:
                                            event.target.value
                                              ? Number(event.target.value)
                                              : null,
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Repeat X
                                  </div>
                                  <input
                                    type="number"
                                    min="0.05"
                                    step="0.1"
                                    value={look.uv_repeat[0]}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          uv_repeat: [
                                            Number(event.target.value),
                                            look.uv_repeat[1],
                                          ],
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Repeat Y
                                  </div>
                                  <input
                                    type="number"
                                    min="0.05"
                                    step="0.1"
                                    value={look.uv_repeat[1]}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          uv_repeat: [
                                            look.uv_repeat[0],
                                            Number(event.target.value),
                                          ],
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Rotation (°)
                                  </div>
                                  <input
                                    type="number"
                                    step="5"
                                    value={look.rotation_degrees}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          rotation_degrees:
                                            Number(event.target.value),
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Offset X
                                  </div>
                                  <input
                                    type="number"
                                    step="0.05"
                                    value={look.offset[0]}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          offset: [
                                            Number(event.target.value),
                                            look.offset[1],
                                          ],
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Offset Y
                                  </div>
                                  <input
                                    type="number"
                                    step="0.05"
                                    value={look.offset[1]}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          offset: [
                                            look.offset[0],
                                            Number(event.target.value),
                                          ],
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Normal strength
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    max="4"
                                    step="0.05"
                                    value={look.normal_strength}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          normal_strength:
                                            Number(event.target.value),
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Roughness factor
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.05"
                                    value={look.roughness_factor}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          roughness_factor:
                                            Number(event.target.value),
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                                <label>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                                    Height strength
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.02"
                                    value={look.height_strength}
                                    onChange={(event) =>
                                      updateMaterialLook(
                                        slotId,
                                        {
                                          height_strength:
                                            Number(event.target.value),
                                        },
                                      )
                                    }
                                    style={{ ...inputStyle, width: "100%" }}
                                  />
                                </label>
                              </div>
                              {target !== "__slot__" ? (
                                <div
                                  style={{
                                    marginTop: 8,
                                    color: "#7dd3fc",
                                    fontSize: 11,
                                  }}
                                >
                                  Editing a part-specific override for {target}. Other parts retain the slot default.
                                </div>
                              ) : null}
                            </div>
                          );
                        },
                      )}

                      <div
                        style={{
                          border:
                            "1px solid rgba(168,85,247,0.2)",
                          borderRadius: 12,
                          padding: 12,
                          background:
                            "rgba(30,5,48,0.2)",
                        }}
                      >
                        <strong>
                          Environment & fallback rig
                        </strong>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: 9,
                            marginTop: 10,
                          }}
                        >
                          <label>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                              HDRI strength
                            </div>
                            <input
                              type="number"
                              min="0"
                              max="8"
                              step="0.05"
                              value={visibleLookAdjustments.environment.strength}
                              onChange={(event) =>
                                updateEnvironmentLook({
                                  strength:
                                    Number(event.target.value),
                                })
                              }
                              style={{ ...inputStyle, width: "100%" }}
                            />
                          </label>
                          <label>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                              HDRI rotation (°)
                            </div>
                            <input
                              type="number"
                              step="5"
                              value={visibleLookAdjustments.environment.rotation_degrees}
                              onChange={(event) =>
                                updateEnvironmentLook({
                                  rotation_degrees:
                                    Number(event.target.value),
                                })
                              }
                              style={{ ...inputStyle, width: "100%" }}
                            />
                          </label>
                          <label>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                              Exposure
                            </div>
                            <input
                              type="number"
                              min="-8"
                              max="8"
                              step="0.1"
                              value={visibleLookAdjustments.environment.exposure}
                              onChange={(event) =>
                                updateEnvironmentLook({
                                  exposure:
                                    Number(event.target.value),
                                })
                              }
                              style={{ ...inputStyle, width: "100%" }}
                            />
                          </label>
                          <label>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                              Fallback light energy
                            </div>
                            <input
                              type="number"
                              min="0"
                              max="8"
                              step="0.05"
                              value={visibleLookAdjustments.environment.fallback_light_energy_scale}
                              onChange={(event) =>
                                updateEnvironmentLook({
                                  fallback_light_energy_scale:
                                    Number(event.target.value),
                                })
                              }
                              style={{ ...inputStyle, width: "100%" }}
                            />
                          </label>
                          <label
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              alignSelf: "end",
                              minHeight: 42,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={visibleLookAdjustments.environment.background_visible}
                              onChange={(event) =>
                                updateEnvironmentLook({
                                  background_visible:
                                    event.target.checked,
                                })
                              }
                            />
                            Visible environment background
                          </label>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 9,
                        flexWrap: "wrap",
                        marginTop: 14,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (designBrief) {
                            resetLookDevelopment(
                              designBrief,
                              resourcePlan,
                            );
                          }
                        }}
                        disabled={
                          busy !== null ||
                          !designBrief
                        }
                        style={{
                          borderRadius: 10,
                          border:
                            "1px solid rgba(148,163,184,0.3)",
                          background: "transparent",
                          color: "#cbd5e1",
                          padding: "9px 12px",
                        }}
                      >
                        Reset look controls
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void executeCode(
                            false,
                            "look-development rerender",
                          )
                        }
                        disabled={
                          busy !== null ||
                          !code.trim()
                        }
                        style={{
                          borderRadius: 10,
                          border:
                            "1px solid rgba(168,85,247,0.5)",
                          background:
                            "rgba(168,85,247,0.14)",
                          color: "#e9d5ff",
                          padding: "9px 13px",
                          fontWeight: 850,
                        }}
                      >
                        {busy === "execute"
                          ? "Re-rendering…"
                          : "Re-run same code with look adjustments"}
                      </button>
                    </div>
                  </details>
                ) : null}
              </section>
            )}
          </div>
        ) : (
          <section
            style={{
              ...panelStyle,
              padding: 18,
            }}
          >
            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                gap: 12,
                flexWrap:
                  "wrap",
                marginBottom: 12,
              }}
            >
              <div>
                <strong>
                  Editable Blender Python
                </strong>
                <div
                  style={{
                    color:
                      "#64748b",
                    fontSize: 12,
                    marginTop: 3,
                  }}
                >
                  Paste your own code or edit GLM output ·{" "}
                  {code.split(/\r?\n/).length} lines
                </div>
              </div>
              <div
                style={{
                  display:
                    "flex",
                  gap: 8,
                  flexWrap:
                    "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCode(
                      STARTER_CODE,
                    )
                  }
                  style={{
                    borderRadius:
                      10,
                    border:
                      "1px solid rgba(148,163,184,0.3)",
                    background:
                      "transparent",
                    color:
                      "#cbd5e1",
                    padding:
                      "9px 12px",
                  }}
                >
                  Reset example
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void executeCode(
                      true,
                    )
                  }
                  disabled={
                    busy !==
                      null ||
                    !code.trim()
                  }
                  style={{
                    border:
                      "1px solid rgba(56,189,248,0.5)",
                    borderRadius:
                      10,
                    padding:
                      "10px 14px",
                    fontWeight:
                      850,
                    background:
                      "rgba(14,165,233,0.18)",
                    color:
                      "#bae6fd",
                  }}
                >
                  {busy ===
                  "execute"
                    ? "Running…"
                    : "Run + execution repair"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void executeCode(
                      false,
                    )
                  }
                  disabled={
                    busy !==
                      null ||
                    !code.trim()
                  }
                  style={{
                    border: 0,
                    borderRadius:
                      10,
                    padding:
                      "10px 16px",
                    fontWeight:
                      850,
                    background:
                      "#a3e635",
                    color:
                      "#18210a",
                  }}
                >
                  {busy ===
                  "execute"
                    ? "Running Blender…"
                    : "Run code"}
                </button>
              </div>
            </div>
            <textarea
              value={code}
              onChange={(
                event,
              ) =>
                setCode(
                  event.target
                    .value,
                )
              }
              spellCheck={
                false
              }
              style={{
                width:
                  "100%",
                minHeight:
                  720,
                resize:
                  "vertical",
                borderRadius:
                  12,
                border:
                  "1px solid rgba(148,163,184,0.22)",
                background:
                  "#020617",
                color:
                  "#dbeafe",
                padding: 16,
                fontFamily:
                  '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
                fontSize: 13,
                lineHeight:
                  1.55,
                tabSize: 4,
              }}
            />
          </section>
        )}

        <section
          style={{
            display:
              "grid",
            gap: 20,
            gridTemplateColumns:
              "minmax(0, 1.05fr) minmax(380px, 0.95fr)",
            marginTop: 20,
          }}
        >
          <div
            style={{
              display:
                "grid",
              gap: 18,
              alignContent:
                "start",
            }}
          >
            <div
              style={{
                ...panelStyle,
                overflow:
                  "hidden",
              }}
            >
              <div
                style={{
                  padding:
                    "14px 16px",
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  gap: 10,
                }}
              >
                <strong>
                  Three.js GLB preview
                </strong>
                {typeof qualityScore ===
                  "number" && (
                  <span
                    style={{
                      color:
                        qualityScore >=
                        78
                          ? "#86efac"
                          : "#fde68a",
                      fontWeight:
                        800,
                    }}
                  >
                    Quality {qualityScore}/100
                  </span>
                )}
              </div>
              <div
                style={{
                  height: 560,
                  background:
                    "#020617",
                }}
              >
                {execution?.ok &&
                execution.glb_url ? (
                  <Canvas
                    camera={{
                      position: [
                        4,
                        3,
                        5,
                      ],
                      fov: 45,
                    }}
                  >
                    <color
                      attach="background"
                      args={[
                        "#020617",
                      ]}
                    />
                    <ambientLight
                      intensity={
                        1.2
                      }
                    />
                    <directionalLight
                      position={[
                        5,
                        8,
                        6,
                      ]}
                      intensity={
                        2.5
                      }
                    />
                    <directionalLight
                      position={[
                        -5,
                        3,
                        -4,
                      ]}
                      intensity={
                        1
                      }
                    />
                    <Suspense
                      fallback={
                        null
                      }
                    >
                      <Model
                        key={
                          execution.glb_url
                        }
                        url={
                          execution.glb_url
                        }
                      />
                    </Suspense>
                    <gridHelper
                      args={[
                        12,
                        24,
                        "#334155",
                        "#172033",
                      ]}
                    />
                    <OrbitControls
                      makeDefault
                    />
                  </Canvas>
                ) : (
                  <div
                    style={{
                      height:
                        "100%",
                      display:
                        "grid",
                      placeItems:
                        "center",
                      color:
                        "#64748b",
                      textAlign:
                        "center",
                      padding: 30,
                    }}
                  >
                    Generate or paste code, then run Blender.
                  </div>
                )}
              </div>
              {execution?.ok && (
                <div
                  style={{
                    padding: 14,
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(4, 1fr)",
                    gap: 8,
                    color:
                      "#94a3b8",
                    fontSize: 12,
                  }}
                >
                  <div>
                    GLB:{" "}
                    {formatBytes(
                      execution.glb_bytes,
                    )}
                  </div>
                  <div>
                    Blender:{" "}
                    {formatDurationMs(
                      execution.elapsed_ms,
                    )}
                  </div>
                  <div>
                    Job:{" "}
                    {execution.job_id?.slice(
                      0,
                      8,
                    )}
                  </div>
                  <div>
                    Status:{" "}
                    {execution.status ??
                      "complete"}
                  </div>
                </div>
              )}
            </div>

            {execution
              ?.inspection_urls
              ?.length ? (
              <div
                style={{
                  ...panelStyle,
                  padding: 14,
                }}
              >
                <strong>
                  Benchmark inspection package
                </strong>
                <div
                  style={{
                    color:
                      "#94a3b8",
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Beauty, orthographic-style views, clay, material ID, normals,
                  wireframe, and dimensions.
                </div>
                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                    marginTop: 12,
                  }}
                >
                  {execution.inspection_urls.map(
                    (url) => (
                      <figure
                        key={
                          url
                        }
                        style={{
                          margin: 0,
                        }}
                      >
                        <img
                          src={`${url}?v=${execution.job_id ?? "latest"}`}
                          alt={labelForInspection(
                            url,
                          )}
                          style={{
                            width:
                              "100%",
                            borderRadius:
                              10,
                            display:
                              "block",
                            background:
                              "#020617",
                          }}
                        />
                        <figcaption
                          style={{
                            marginTop: 5,
                            color:
                              "#94a3b8",
                            fontSize: 11,
                            textTransform:
                              "capitalize",
                          }}
                        >
                          {labelForInspection(
                            url,
                          )}
                        </figcaption>
                      </figure>
                    ),
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              display:
                "grid",
              gap: 18,
              alignContent:
                "start",
            }}
          >
            <div
              style={{
                ...panelStyle,
                padding: 16,
              }}
            >
              <strong>
                Critique + improve
              </strong>
              <p
                style={{
                  color:
                    "#94a3b8",
                  fontSize: 13,
                  lineHeight:
                    1.55,
                }}
              >
                Run the image-grounded critic to compare the rendered views with
                the approved brief. Geometry findings are routed into Blender-code
                revision; material mapping, lighting, and uncertain findings remain
                separate instead of triggering an unrelated geometry rewrite.
              </p>
              <textarea
                value={
                  critique
                }
                onChange={(
                  event,
                ) =>
                  setCritique(
                    event
                      .target
                      .value,
                  )
                }
                rows={4}
                placeholder="Example: The wheels are too simple. Keep the frame, but add layered tires, rims, hubs, push rims, and radial spokes."
                style={{
                  ...inputStyle,
                  width:
                    "100%",
                  resize:
                    "vertical",
                  font:
                    "inherit",
                  lineHeight:
                    1.5,
                }}
              />
              <div
                style={{
                  display:
                    "flex",
                  gap: 8,
                  marginTop: 10,
                  flexWrap:
                    "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={
                    analyzeVisualCritique
                  }
                  disabled={
                    busy !==
                      null ||
                    !execution
                      ?.job_id ||
                    !execution
                      ?.inspection_urls
                      ?.length
                  }
                  style={{
                    border:
                      "1px solid rgba(56,189,248,0.55)",
                    borderRadius:
                      10,
                    padding:
                      "10px 14px",
                    fontWeight:
                      850,
                    background:
                      "rgba(56,189,248,0.14)",
                    color:
                      "#bae6fd",
                  }}
                >
                  {busy ===
                  "visual-critique"
                    ? "Inspecting renders…"
                    : visualCritique
                        ?.report
                      ? "Re-run visual critic"
                      : "Analyze rendered asset"}
                </button>
                <button
                  type="button"
                  onClick={
                    improveCode
                  }
                  disabled={
                    busy !==
                      null ||
                    !execution
                      ?.ok ||
                    !designBrief
                  }
                  style={{
                    border:
                      "1px solid rgba(168,85,247,0.55)",
                    borderRadius:
                      10,
                    padding:
                      "10px 14px",
                    fontWeight:
                      850,
                    background:
                      "rgba(168,85,247,0.16)",
                    color:
                      "#e9d5ff",
                  }}
                >
                  {busy ===
                  "improve"
                    ? "Improving code…"
                    : "Critique + revise code"}
                </button>
                <button
                  type="button"
                  onClick={
                    saveCandidate
                  }
                  disabled={
                    busy !==
                      null ||
                    !execution
                      ?.job_id
                  }
                  style={{
                    border:
                      "1px solid rgba(34,197,94,0.48)",
                    borderRadius:
                      10,
                    padding:
                      "10px 14px",
                    fontWeight:
                      850,
                    background:
                      "rgba(34,197,94,0.13)",
                    color:
                      "#bbf7d0",
                  }}
                >
                  {busy ===
                  "candidate"
                    ? "Saving…"
                    : "Save as library candidate"}
                </button>
              </div>
              {improveResponse && (
                <div
                  style={{
                    marginTop: 9,
                    color:
                      improveResponse.ok
                        ? "#c4b5fd"
                        : "#fca5a5",
                    fontSize: 12,
                  }}
                >
                  {improveResponse.ok
                    ? `Revised ${improveResponse.line_count ?? "—"} lines. Review in Code mode, then run as the next revision.`
                    : improveResponse.error}
                </div>
              )}
              {candidateMessage && (
                <div
                  style={{
                    marginTop: 9,
                    color:
                      candidateMessage.includes(
                        "Saved",
                      )
                        ? "#86efac"
                        : "#fca5a5",
                    fontSize: 12,
                  }}
                >
                  {candidateMessage}
                </div>
              )}
            </div>

            {visualCritique && (
              <div
                style={{
                  ...panelStyle,
                  padding: 16,
                }}
              >
                <strong>
                  Image-grounded visual critique
                </strong>
                {!visualCritique.ok ? (
                  <div
                    style={{
                      marginTop: 10,
                      color:
                        "#fca5a5",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {visualCritique.error}
                  </div>
                ) : visualCritique.report ? (
                  <>
                    <div
                      style={{
                        marginTop: 6,
                        color:
                          "#cbd5e1",
                        fontSize: 12,
                        lineHeight: 1.55,
                      }}
                    >
                      {visualCritique.report.summary}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        flexWrap: "wrap",
                        marginTop: 10,
                        color: "#94a3b8",
                        fontSize: 11,
                      }}
                    >
                      <span>
                        Code {visualCritique.report.routing_summary.blender_code}
                      </span>
                      <span>
                        Mapping {visualCritique.report.routing_summary.material_mapping}
                      </span>
                      <span>
                        Lookdev {visualCritique.report.routing_summary.look_development}
                      </span>
                      <span>
                        Human {visualCritique.report.routing_summary.human_review}
                      </span>
                      <span>
                        {visualCritique.report.model}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginTop: 12,
                      }}
                    >
                      {visualCritique.report.findings.length ? (
                        visualCritique.report.findings.map(
                          (finding) => (
                            <div
                              key={finding.finding_id}
                              style={{
                                border:
                                  "1px solid rgba(148,163,184,0.16)",
                                borderRadius: 10,
                                padding: 10,
                                fontSize: 12,
                                lineHeight: 1.5,
                                color:
                                  finding.severity ===
                                  "error"
                                    ? "#fca5a5"
                                    : finding.severity ===
                                        "warning"
                                      ? "#fde68a"
                                      : "#cbd5e1",
                              }}
                            >
                              <div
                                style={{
                                  color: "#94a3b8",
                                  fontSize: 10,
                                  textTransform: "uppercase",
                                  letterSpacing: ".08em",
                                  marginBottom: 4,
                                }}
                              >
                                {finding.category.replaceAll("_", " ")} · {finding.revision_route.replaceAll("_", " ")} · {Math.round(finding.confidence * 100)}%
                              </div>
                              <div>
                                {finding.finding}
                              </div>
                              <div
                                style={{
                                  color: "#c4b5fd",
                                  marginTop: 5,
                                }}
                              >
                                Revision: {finding.recommended_revision}
                              </div>
                              {finding.evidence_views.length ? (
                                <div
                                  style={{
                                    color: "#64748b",
                                    marginTop: 5,
                                  }}
                                >
                                  Views: {finding.evidence_views.join(", ")}
                                </div>
                              ) : null}
                              {(finding.affected_material_slot_ids.length ||
                                finding.affected_part_ids.length) ? (
                                <div
                                  style={{
                                    color: "#64748b",
                                    marginTop: 4,
                                  }}
                                >
                                  {finding.affected_material_slot_ids.length
                                    ? `Slots: ${finding.affected_material_slot_ids.join(", ")}`
                                    : ""}
                                  {finding.affected_material_slot_ids.length &&
                                  finding.affected_part_ids.length
                                    ? " · "
                                    : ""}
                                  {finding.affected_part_ids.length
                                    ? `Parts: ${finding.affected_part_ids.join(", ")}`
                                    : ""}
                                </div>
                              ) : null}
                              {finding.suggested_adjustment &&
                              (finding.revision_route === "look_development" ||
                                (finding.revision_route === "material_mapping" &&
                                  finding.affected_material_slot_ids.length > 0)) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    applyVisualAdjustment(
                                      finding,
                                    )
                                  }
                                  disabled={busy !== null}
                                  style={{
                                    marginTop: 8,
                                    borderRadius: 9,
                                    border:
                                      "1px solid rgba(168,85,247,0.45)",
                                    background:
                                      "rgba(168,85,247,0.12)",
                                    color: "#e9d5ff",
                                    padding: "7px 10px",
                                    fontWeight: 800,
                                  }}
                                >
                                  Apply bounded {finding.suggested_adjustment.direction.replaceAll("_", " ")} step
                                </button>
                              ) : null}
                            </div>
                          ),
                        )
                      ) : (
                        <div
                          style={{
                            color: "#86efac",
                            fontSize: 12,
                          }}
                        >
                          No clear visible issue was identified in the supplied views.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {execution
              ?.quality_report && (
              <div
                style={{
                  ...panelStyle,
                  padding: 16,
                }}
              >
                <strong>
                  Quality findings
                </strong>
                <div
                  style={{
                    color:
                      "#94a3b8",
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {execution.quality_report.grade ?? "review"} · score{" "}
                  {execution.quality_report.score ?? "—"}
                </div>
                <div
                  style={{
                    display:
                      "grid",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  {execution.quality_report.findings?.length ? (
                    execution.quality_report.findings.map(
                      (
                        finding,
                        index,
                      ) => (
                        <div
                          key={`${finding.code ?? "finding"}-${index}`}
                          style={{
                            border:
                              "1px solid rgba(148,163,184,0.16)",
                            borderRadius:
                              10,
                            padding: 10,
                            color:
                              finding.severity ===
                              "error"
                                ? "#fca5a5"
                                : finding.severity ===
                                    "warning"
                                  ? "#fde68a"
                                  : "#cbd5e1",
                            fontSize: 12,
                            lineHeight:
                              1.45,
                          }}
                        >
                          {finding.message}
                        </div>
                      ),
                    )
                  ) : (
                    <div
                      style={{
                        color:
                          "#86efac",
                        fontSize: 12,
                      }}
                    >
                      No automated structural quality findings. Silhouette,
                      proportion, connection quality, and material response still
                      require visual review against the benchmark screenshots.
                    </div>
                  )}
                </div>
              </div>
            )}

            {execution
              ?.build_validation && (
              <details
                style={{
                  ...panelStyle,
                  padding: 16,
                }}
              >
                <summary
                  style={{
                    cursor:
                      "pointer",
                    fontWeight:
                      800,
                  }}
                >
                  Build validation:{" "}
                  {execution.build_validation.valid
                    ? "passed"
                    : "review required"}
                </summary>
                <pre
                  style={{
                    margin:
                      "12px 0 0",
                    maxHeight:
                      360,
                    overflow:
                      "auto",
                    whiteSpace:
                      "pre-wrap",
                    overflowWrap:
                      "anywhere",
                    color:
                      execution.build_validation.valid
                        ? "#bbf7d0"
                        : "#fde68a",
                    background:
                      "#020617",
                    borderRadius:
                      12,
                    padding: 14,
                    fontSize: 11,
                    lineHeight:
                      1.5,
                  }}
                >
                  {JSON.stringify(
                    {
                      validation:
                        execution.build_validation,
                      blender_runtime:
                        execution.blender_runtime ??
                        null,
                      compile_smoke:
                        execution.compile_smoke ??
                        null,
                      execution_diagnostics:
                        execution.execution_diagnostics ??
                        null,
                      repair_attempts:
                        execution.repair_attempts ??
                        [],
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}

            {revisions.length >
              0 && (
              <div
                style={{
                  ...panelStyle,
                  padding: 16,
                }}
              >
                <strong>
                  Revision history
                </strong>
                <div
                  style={{
                    display:
                      "grid",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  {revisions.map(
                    (
                      revision,
                    ) => (
                      <button
                        key={
                          revision
                            .execution
                            .job_id
                        }
                        type="button"
                        onClick={() => {
                          setCode(
                            revision.code,
                          );
                          setExecution(
                            revision.execution,
                          );
                          setVisualCritique(
                            revision.execution
                              .visual_critique
                              ? {
                                  ok: true,
                                  report:
                                    revision.execution
                                      .visual_critique,
                                  visual_critique_url:
                                    revision.execution
                                      .visual_critique_url ??
                                    undefined,
                                }
                              : null,
                          );
                          setMode(
                            "code",
                          );
                        }}
                        style={{
                          textAlign:
                            "left",
                          border:
                            "1px solid rgba(148,163,184,0.18)",
                          borderRadius:
                            10,
                          padding:
                            "10px 12px",
                          background:
                            "rgba(2,6,23,0.55)",
                          color:
                            "#cbd5e1",
                          cursor:
                            "pointer",
                        }}
                      >
                        v{revision.revision} ·{" "}
                        {revision.label} · quality{" "}
                        {revision.execution.quality_report?.score ?? "—"}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            <details
              style={{
                ...panelStyle,
                padding: 16,
              }}
            >
              <summary
                style={{
                  cursor:
                    "pointer",
                  fontWeight:
                    800,
                }}
              >
                Execution console
              </summary>
              <pre
                style={{
                  minHeight:
                    160,
                  maxHeight:
                    420,
                  overflow:
                    "auto",
                  whiteSpace:
                    "pre-wrap",
                  color:
                    execution?.ok
                      ? "#bbf7d0"
                      : "#fecaca",
                  background:
                    "#020617",
                  borderRadius:
                    12,
                  padding: 14,
                  fontSize: 11,
                  lineHeight:
                    1.5,
                }}
              >
                {busy ===
                "execute"
                  ? "Starting Blender…"
                  : execution
                    ? execution.ok
                      ? [
                          execution.stdout,
                          execution.stderr,
                          `GLB: ${execution.glb_url}`,
                          `Blend: ${execution.blend_url}`,
                        ]
                          .filter(Boolean)
                          .join("\n")
                      : [
                          execution.error,
                          execution.execution_diagnostics
                            ? JSON.stringify(
                                execution.execution_diagnostics,
                                null,
                                2,
                              )
                            : null,
                        ]
                          .filter(Boolean)
                          .join("\n\n")
                    : "No Blender run yet."}
              </pre>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
