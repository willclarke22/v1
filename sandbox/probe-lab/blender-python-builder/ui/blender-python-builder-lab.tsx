
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
    | "improve"
    | "candidate"
    | null
  >(null);

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

  async function loadNativeWheelchairProof() {
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
          "/api/sandbox/probe-lab/blender-python-builder/native-wheelchair-proof",
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
            "The native wheelchair proof fixture could not be loaded.",
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
          "Create an asset design brief first.",
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
  ) {
    setBusy("execute");
    setExecution(
      null,
    );
    try {
      const brief =
        currentBrief();
      const previous =
        revisions.at(
          -1,
        );
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
                  critique.trim()
                    ? "quality improvement"
                    : (
                        revisions.length
                          ? "manual revision"
                          : "initial build"
                      ),
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
                critique.trim()
                  ? "quality improvement"
                  : (
                      current.length
                        ? "manual revision"
                        : "initial build"
                    ),
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
          "A design brief is required for targeted improvement.",
        );
      }
      if (!execution?.ok) {
        throw new Error(
          "Run the current code successfully before requesting a quality improvement.",
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
            Design brief → resources → Blender Python → benchmark inspection
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
            Build assets toward the quality of the chest, wheelchair, camera,
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
              "1px solid rgba(14,165,233,0.38)",
            background:
              "linear-gradient(135deg, rgba(3,105,161,0.18), rgba(15,23,42,0.82))",
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
                  "#bae6fd",
              }}
            >
              Native stylized-wheelchair reference build
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
              Loads a native-bpy manual wheelchair with a connected tube frame,
              two layered spoked rear wheels, hand rims, caster forks, upholstery,
              push handles, brakes, folding braces, and footrests. Use this as the
              human-authored reference before asking GLM 5.2 to generate the same
              asset independently.
            </div>
          </div>
          <button
            type="button"
            onClick={
              loadNativeWheelchairProof
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
                "#38bdf8",
              color:
                "#082f49",
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
              : "Load native wheelchair proof"}
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
                    ? "Planning…"
                    : "1. Create design brief"}
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
                    ? `${planResponse.model ?? "GLM"} created the brief in ${formatDurationMs(planResponse.elapsed_ms)}.`
                    : planResponse.error}
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
                      ? `${generation.model ?? "GLM"} returned ${generation.line_count ?? "—"} lines in ${formatDurationMs(generation.elapsed_ms)}. Helper-contract preflight passed${generation.preflight_repair?.attempted ? " after one automatic correction pass" : ""}.`
                      : generation.error ??
                        `GLM code is available for review, but ${generation.preflight_validation?.errors?.length ?? 0} preflight error(s) still block Blender execution.`}
                  </div>
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
                      Design brief
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
                      {designBrief.material_slots.length} material slots
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
                  </div>
                </div>
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
                Use the inspection views and benchmark quality bar. The model
                receives the existing script, design brief, validation findings,
                and your targeted feedback instead of rebuilding blindly.
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
                      : execution.error
                    : "No Blender run yet."}
              </pre>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
