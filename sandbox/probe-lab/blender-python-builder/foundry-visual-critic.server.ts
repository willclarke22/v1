import {
  access,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  projectPath,
} from "../assets/paths.server";
import type {
  AssetDesignBriefV2,
} from "./asset-design-brief";
import type {
  FoundryResourcePlanV1,
} from "./foundry-resource-plan";
import {
  FOUNDRY_LOOK_ADJUSTMENT_DIRECTIONS,
  type FoundryLookAdjustmentDirection,
} from "./foundry-look-adjustments";

export const FOUNDRY_VISUAL_CRITIQUE_SCHEMA_VERSION =
  "myway_foundry_visual_critique_v2" as const;
export const FOUNDRY_VISUAL_CRITIQUE_PROMPT_VERSION =
  "myway_foundry_visual_critic_v2_actionable_lookdev" as const;

export const FOUNDRY_VISUAL_CRITIQUE_CATEGORIES = [
  "silhouette",
  "proportion",
  "structural_connection",
  "construction_detail",
  "part_readability",
  "material_region_assignment",
  "material_mapping",
  "surface_response",
  "lighting_environment",
  "uncertain",
] as const;

export type FoundryVisualCritiqueCategory =
  (typeof FOUNDRY_VISUAL_CRITIQUE_CATEGORIES)[number];

export type FoundryVisualRevisionRoute =
  | "blender_code"
  | "material_mapping"
  | "look_development"
  | "human_review";

export type FoundryVisualCritiqueFinding = {
  finding_id: string;
  category:
    FoundryVisualCritiqueCategory;
  severity:
    | "info"
    | "warning"
    | "error";
  revision_route:
    FoundryVisualRevisionRoute;
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

export type FoundryVisualCritiqueReport = {
  schema_version:
    typeof FOUNDRY_VISUAL_CRITIQUE_SCHEMA_VERSION;
  prompt_version:
    typeof FOUNDRY_VISUAL_CRITIQUE_PROMPT_VERSION;
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
    FoundryVisualCritiqueFinding[];
  routing_summary: Record<
    FoundryVisualRevisionRoute,
    number
  >;
};

type VisionResponsePayload = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type InspectionView = {
  label: string;
  file_name: string;
  file_path: string;
};

const VIEW_PRIORITY = [
  ["hero", "preview.png"],
  ["front", "preview_front.png"],
  ["right", "preview_right.png"],
  ["back", "preview_back.png"],
  ["top", "preview_top.png"],
  ["neutral_clay", "preview_clay.png"],
  ["material_id", "preview_material_id.png"],
] as const;

function safeJobId(
  value: string,
) {
  if (
    !/^[a-z0-9-]{8,80}$/i.test(
      value,
    )
  ) {
    throw new Error(
      "A valid Blender Foundry job id is required for visual critique.",
    );
  }
  return value;
}

function baseUrl(
  value: string | undefined,
) {
  return (
    value ??
    "https://integrate.api.nvidia.com/v1"
  ).replace(/\/$/, "");
}

function isLocalEndpoint(
  value: string,
) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i.test(
    `${value}/`,
  );
}

function authorizationHeaders(
  endpoint: string,
): Record<string, string> {
  const apiKey =
    process.env
      .MYWAY_FOUNDRY_VISION_API_KEY
      ?.trim() ||
    process.env
      .MYWAY_ASSET_NVIDIA_API_KEY
      ?.trim() ||
    process.env
      .NVIDIA_API_KEY
      ?.trim();

  if (
    !apiKey &&
    !isLocalEndpoint(endpoint)
  ) {
    throw new Error(
      "NVIDIA_API_KEY is required for the hosted Foundry visual critic. A local NIM endpoint may be used without a key.",
    );
  }

  return apiKey
    ? {
        Authorization:
          `Bearer ${apiKey}`,
      }
    : {};
}

async function postJson(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const controller =
    new AbortController();
  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
          ...authorizationHeaders(
            endpoint,
          ),
        },
        body:
          JSON.stringify(body),
        signal:
          controller.signal,
      });
    const text =
      await response.text();

    if (!response.ok) {
      let providerMessage = "";
      try {
        const payload =
          JSON.parse(text) as
            VisionResponsePayload;
        providerMessage =
          payload.error?.message ??
          "";
      } catch {
        providerMessage = "";
      }
      throw new Error(
        providerMessage ||
        `Foundry visual critique failed with HTTP ${response.status}: ${text.slice(0, 1200)}`,
      );
    }

    try {
      return JSON.parse(text) as
        unknown;
    } catch {
      throw new Error(
        `Foundry visual critic returned invalid JSON: ${text.slice(0, 1200)}`,
      );
    }
  } catch (caught) {
    if (
      caught instanceof Error &&
      (
        caught.name ===
          "AbortError" ||
        caught.message
          .toLowerCase()
          .includes("aborted")
      )
    ) {
      throw new Error(
        `Foundry visual critique exceeded ${Math.round(timeoutMs / 1000)} seconds.`,
      );
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

function assistantText(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return "";
  }

  const choices =
    (value as Record<string, unknown>)
      .choices;
  if (
    !Array.isArray(choices) ||
    !choices.length
  ) {
    return "";
  }
  const first = choices[0];
  if (
    !first ||
    typeof first !== "object" ||
    Array.isArray(first)
  ) {
    return "";
  }
  const message =
    (first as Record<string, unknown>)
      .message;
  if (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message)
  ) {
    return "";
  }
  const content =
    (message as Record<string, unknown>)
      .content;

  if (
    typeof content === "string"
  ) {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (
        !part ||
        typeof part !== "object" ||
        Array.isArray(part)
      ) {
        return "";
      }
      const text =
        (part as Record<
          string,
          unknown
        >).text;
      return typeof text ===
        "string"
        ? text
        : "";
    })
    .join("");
}

function extractJsonObject(
  value: string,
) {
  const trimmed =
    value.trim();
  try {
    return JSON.parse(
      trimmed,
    ) as unknown;
  } catch {
    const first =
      trimmed.indexOf("{");
    const last =
      trimmed.lastIndexOf("}");
    if (
      first < 0 ||
      last <= first
    ) {
      throw new Error(
        "The Foundry visual critic did not return a JSON object.",
      );
    }
    return JSON.parse(
      trimmed.slice(
        first,
        last + 1,
      ),
    ) as unknown;
  }
}

function record(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<
        string,
        unknown
      >
    : {};
}

function text(
  value: unknown,
  fallback = "",
) {
  return typeof value ===
    "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function stringArray(
  value: unknown,
  limit = 24,
) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .filter(
          (entry): entry is string =>
            typeof entry ===
            "string",
        )
        .map((entry) =>
          entry.trim(),
        )
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function confidence(
  value: unknown,
) {
  const parsed =
    Number(value);
  return Number.isFinite(parsed)
    ? Math.max(
        0,
        Math.min(1, parsed),
      )
    : 0.5;
}

function category(
  value: unknown,
): FoundryVisualCritiqueCategory {
  return FOUNDRY_VISUAL_CRITIQUE_CATEGORIES.includes(
    value as
      FoundryVisualCritiqueCategory,
  )
    ? value as
        FoundryVisualCritiqueCategory
    : "uncertain";
}

function adjustmentDirection(
  value: unknown,
): FoundryLookAdjustmentDirection | null {
  return FOUNDRY_LOOK_ADJUSTMENT_DIRECTIONS.includes(
    value as FoundryLookAdjustmentDirection,
  )
    ? value as FoundryLookAdjustmentDirection
    : null;
}

function adjustmentAllowedForCategory(
  category:
    FoundryVisualCritiqueCategory,
  direction:
    FoundryLookAdjustmentDirection | null,
) {
  if (!direction) {
    return false;
  }
  const mapping =
    new Set<
      FoundryLookAdjustmentDirection
    >([
      "make_texture_finer",
      "make_texture_coarser",
      "rotate_mapping_clockwise",
      "rotate_mapping_counterclockwise",
      "switch_to_object_box",
      "switch_to_uv",
    ]);
  const surface =
    new Set<
      FoundryLookAdjustmentDirection
    >([
      "increase_normal_strength",
      "reduce_normal_strength",
      "increase_roughness",
      "decrease_roughness",
      "increase_height_strength",
      "reduce_height_strength",
    ]);
  const environment =
    new Set<
      FoundryLookAdjustmentDirection
    >([
      "increase_exposure",
      "decrease_exposure",
      "increase_environment_strength",
      "decrease_environment_strength",
      "rotate_environment_clockwise",
      "rotate_environment_counterclockwise",
      "increase_fallback_light_energy",
      "reduce_fallback_light_energy",
    ]);
  return category ===
      "material_mapping"
    ? mapping.has(direction)
    : category ===
        "surface_response"
      ? surface.has(direction)
      : category ===
          "lighting_environment"
        ? environment.has(direction)
        : false;
}

export function routeForVisualCategory(
  value:
    FoundryVisualCritiqueCategory,
): FoundryVisualRevisionRoute {
  switch (value) {
    case "silhouette":
    case "proportion":
    case "structural_connection":
    case "construction_detail":
    case "part_readability":
    case "material_region_assignment":
      return "blender_code";
    case "material_mapping":
    case "surface_response":
      return "material_mapping";
    case "lighting_environment":
      return "look_development";
    default:
      return "human_review";
  }
}

function severity(
  value: unknown,
): FoundryVisualCritiqueFinding[
  "severity"
] {
  return value === "error" ||
    value === "warning" ||
    value === "info"
    ? value
    : "warning";
}

function normalizeReport(
  input: {
    value: unknown;
    jobId: string;
    model: string;
    brief: AssetDesignBriefV2;
    viewLabels: string[];
  },
): FoundryVisualCritiqueReport {
  const root =
    record(input.value);
  const validPartIds =
    new Set(
      input.brief.parts.map(
        (part) =>
          part.part_id,
      ),
    );
  const validMaterialSlotIds =
    new Set(
      input.brief.material_slots.map(
        (slot) =>
          slot.slot_id,
      ),
    );
  const validViews =
    new Set(
      input.viewLabels,
    );
  const rawFindings =
    Array.isArray(root.findings)
      ? root.findings
      : [];

  const findings =
    rawFindings
      .slice(0, 12)
      .map((value, index) => {
        const item =
          record(value);
        const normalizedCategory =
          category(
            item.category,
          );
        const normalizedDirection =
          adjustmentDirection(
            record(
              item.suggested_adjustment,
            ).direction,
          );
        const finding =
          text(item.finding)
            .slice(0, 1200);
        const recommendedRevision =
          text(
            item.recommended_revision,
          ).slice(0, 1200);
        if (
          !finding ||
          !recommendedRevision
        ) {
          return null;
        }
        return {
          finding_id:
            `finding_${index + 1}`,
          category:
            normalizedCategory,
          severity:
            severity(
              item.severity,
            ),
          revision_route:
            routeForVisualCategory(
              normalizedCategory,
            ),
          affected_part_ids:
            stringArray(
              item.affected_part_ids,
            ).filter((partId) =>
              validPartIds.has(
                partId,
              ),
            ),
          affected_material_slot_ids:
            stringArray(
              item.affected_material_slot_ids,
            ).filter((slotId) =>
              validMaterialSlotIds.has(
                slotId,
              ),
            ),
          evidence_views:
            stringArray(
              item.evidence_views,
            ).filter((view) =>
              validViews.has(view),
            ),
          suggested_adjustment:
            adjustmentAllowedForCategory(
              normalizedCategory,
              normalizedDirection,
            )
              ? {
                  direction:
                    normalizedDirection!,
                }
              : null,
          finding,
          recommended_revision:
            recommendedRevision,
          confidence:
            confidence(
              item.confidence,
            ),
        } satisfies
          FoundryVisualCritiqueFinding;
      })
      .filter(
        (
          finding,
        ): finding is
          FoundryVisualCritiqueFinding =>
          Boolean(finding),
      );

  const routingSummary:
    FoundryVisualCritiqueReport[
      "routing_summary"
    ] = {
    blender_code: 0,
    material_mapping: 0,
    look_development: 0,
    human_review: 0,
  };
  for (const finding of findings) {
    routingSummary[
      finding.revision_route
    ] += 1;
  }

  const explicitAssessment =
    root.overall_assessment;
  const overallAssessment:
    FoundryVisualCritiqueReport[
      "overall_assessment"
    ] =
    explicitAssessment ===
      "passes_visual_review" ||
    explicitAssessment ===
      "targeted_revision" ||
    explicitAssessment ===
      "human_review"
      ? explicitAssessment
      : routingSummary
          .human_review > 0
        ? "human_review"
        : findings.length
          ? "targeted_revision"
          : "passes_visual_review";

  return {
    schema_version:
      FOUNDRY_VISUAL_CRITIQUE_SCHEMA_VERSION,
    prompt_version:
      FOUNDRY_VISUAL_CRITIQUE_PROMPT_VERSION,
    job_id:
      input.jobId,
    asset_id:
      input.brief.asset_id,
    asset_class:
      input.brief.asset_class,
    model:
      input.model,
    created_at:
      new Date()
        .toISOString(),
    analyzed_views:
      input.viewLabels,
    overall_assessment:
      overallAssessment,
    summary:
      text(
        root.summary,
        findings.length
          ? "The rendered asset has targeted visible issues that should be reviewed."
          : "No clear visible issue was identified in the supplied inspection views.",
      ).slice(0, 1600),
    findings,
    routing_summary:
      routingSummary,
  };
}

export function visualCritiqueCodeFindings(
  report:
    FoundryVisualCritiqueReport
    | null
    | undefined,
) {
  return report?.findings.filter(
    (finding) =>
      finding.revision_route ===
      "blender_code",
  ) ?? [];
}

export function visualCritiqueDeferredFindings(
  report:
    FoundryVisualCritiqueReport
    | null
    | undefined,
) {
  return report?.findings.filter(
    (finding) =>
      finding.revision_route !==
      "blender_code",
  ) ?? [];
}

async function exists(
  filePath: string,
) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(
  filePath: string,
) {
  return JSON.parse(
    await readFile(
      filePath,
      "utf8",
    ),
  ) as Record<string, unknown>;
}

async function inspectionViews(
  publicDir: string,
) {
  const candidates:
    InspectionView[] = [];
  for (const [label, fileName] of
    VIEW_PRIORITY) {
    const filePath =
      path.join(
        publicDir,
        fileName,
      );
    if (
      await exists(filePath)
    ) {
      candidates.push({
        label,
        file_name:
          fileName,
        file_path:
          filePath,
      });
    }
  }
  if (
    candidates.length < 3
  ) {
    throw new Error(
      `Foundry visual critique requires at least three inspection renders; found ${candidates.length}.`,
    );
  }
  return candidates;
}

function compactResourcePlan(
  value: unknown,
  lookAdjustments?: unknown,
) {
  const plan =
    value as
      | FoundryResourcePlanV1
      | null;
  if (!plan) {
    return null;
  }
  return {
    material_bindings:
      plan.material_bindings.map(
        (binding) => ({
          slot_id:
            binding.slot.slot_id,
          assigned_part_ids:
            binding.slot
              .assigned_part_ids,
          texture_hint:
            binding.slot
              .texture_hint ??
            null,
          physical_scale_m:
            binding.slot
              .physical_scale_m,
          selected_resource: {
            status:
              binding.status,
            display_name:
              binding.selected
                .display_name,
            source_asset_id:
              binding.selected
                .source_asset_id,
            appearance_summary:
              binding.selected
                .appearance_summary,
            dominant_colors:
              binding.selected
                .dominant_colors,
            brightness:
              binding.selected
                .brightness,
            match_confidence:
              binding.selected
                .match_confidence,
          },
        }),
      ),
    look_adjustments:
      lookAdjustments ?? null,
    environment: {
      intent:
        plan.environment.intent,
      selected_resource: {
        status:
          plan.environment.status,
        display_name:
          plan.environment.selected
            .display_name,
        source_asset_id:
          plan.environment.selected
            .source_asset_id,
        appearance_summary:
          plan.environment.selected
            .appearance_summary,
        match_confidence:
          plan.environment.selected
            .match_confidence,
      },
    },
  };
}

function buildPrompt(
  input: {
    brief:
      AssetDesignBriefV2;
    manifest:
      Record<string, unknown>;
    viewLabels: string[];
  },
) {
  return [
    "Inspect one Blender-generated 3D asset across the supplied standardized views.",
    "Compare only visible evidence against the approved design brief and the selected material/environment intent.",
    "Do not infer hidden mechanisms, internal construction, brand, age, origin, durability, or functionality that cannot be seen.",
    "Do not report an issue merely because a view is stylized. Evaluate whether the requested silhouette, proportions, connections, semantic parts, negative spaces, pivots, surface regions, and camera-readable details are visibly convincing.",
    "Use exact part ids from the design brief when a visible issue can be tied to a declared part. Leave affected_part_ids empty rather than inventing an id.",
    "For material mapping or surface response findings, use exact material slot ids from the design brief in affected_material_slot_ids. Leave the array empty rather than inventing an id.",
    "Evidence views must use only the supplied labels.",
    "Separate geometry/code issues from material mapping or lighting issues:",
    "- silhouette, proportion, structural_connection, construction_detail, part_readability, and material_region_assignment describe issues addressable in Blender Python geometry or assignments.",
    "- material_mapping describes scale, orientation, stretching, seams, or repetition problems in an otherwise suitable texture.",
    "- surface_response describes visible roughness, normal, height, or PBR-strength problems.",
    "- lighting_environment describes exposure, contrast, reflections, or environment problems.",
    "- uncertain is only for a visible concern that the supplied views cannot diagnose reliably.",
    "For material_mapping, optionally use only: make_texture_finer, make_texture_coarser, rotate_mapping_clockwise, rotate_mapping_counterclockwise, switch_to_object_box, switch_to_uv.",
    "For surface_response, optionally use only: increase_normal_strength, reduce_normal_strength, increase_roughness, decrease_roughness, increase_height_strength, reduce_height_strength.",
    "For lighting_environment, optionally use only: increase_exposure, decrease_exposure, increase_environment_strength, decrease_environment_strength, rotate_environment_clockwise, rotate_environment_counterclockwise, increase_fallback_light_energy, reduce_fallback_light_energy.",
    "Never provide an exact numeric value in suggested_adjustment. The Foundry applies one bounded reviewable step.",
    "Return no more than 12 distinct, actionable findings. Do not duplicate one problem across views.",
    "A finding must include a concise visible observation and a concrete recommended revision.",
    "Return only one JSON object with exactly this shape:",
    '{"overall_assessment":"passes_visual_review|targeted_revision|human_review","summary":"concise overall visual assessment","findings":[{"category":"silhouette|proportion|structural_connection|construction_detail|part_readability|material_region_assignment|material_mapping|surface_response|lighting_environment|uncertain","severity":"info|warning|error","affected_part_ids":["exact_part_id"],"affected_material_slot_ids":["exact_slot_id"],"evidence_views":["hero"],"suggested_adjustment":{"direction":"bounded_direction"},"finding":"visible evidence only","recommended_revision":"specific revision","confidence":0.0}]}',
    `Supplied view order: ${input.viewLabels.join(", ")}.`,
    "Approved design brief:",
    JSON.stringify(
      input.brief,
      null,
      2,
    ),
    "Selected material and environment context:",
    JSON.stringify(
      compactResourcePlan(
        input.manifest
          .resource_plan,
        input.manifest
          .look_adjustments,
      ),
      null,
      2,
    ),
    "Automated structural validation:",
    JSON.stringify(
      input.manifest
        .build_validation ??
        null,
      null,
      2,
    ),
    "Automated technical quality findings:",
    JSON.stringify(
      record(
        input.manifest
          .quality_report,
      ).findings ??
        [],
      null,
      2,
    ),
  ].join("\n");
}

export async function critiqueFoundryJob(
  input: {
    jobId: string;
  },
) {
  const jobId =
    safeJobId(
      input.jobId,
    );
  const privateDir =
    projectPath(
      "sandbox/probe-lab/blender-python-builder/jobs",
      jobId,
    );
  const publicDir =
    projectPath(
      "public/sandbox-assets/myway/blender-python-builder",
      jobId,
    );
  const manifestPath =
    path.join(
      publicDir,
      "manifest.json",
    );
  const requestPath =
    path.join(
      privateDir,
      "request.json",
    );

  const [
    manifest,
    requestRecord,
    views,
  ] = await Promise.all([
    readJson(manifestPath),
    readJson(requestPath),
    inspectionViews(publicDir),
  ]);
  const briefValue =
    manifest.design_brief ??
    requestRecord.design_brief;
  if (
    !briefValue ||
    typeof briefValue !==
      "object" ||
    Array.isArray(briefValue)
  ) {
    throw new Error(
      "The Foundry job does not contain an approved design brief for visual critique.",
    );
  }
  const brief =
    briefValue as
      AssetDesignBriefV2;
  const endpoint =
    `${baseUrl(
      process.env
        .MYWAY_FOUNDRY_VISION_BASE_URL ??
      process.env
        .MYWAY_ASSET_VISION_BASE_URL ??
      process.env
        .NVIDIA_BASE_URL,
    )}/chat/completions`;
  const model =
    process.env
      .MYWAY_FOUNDRY_VISION_MODEL
      ?.trim() ||
    process.env
      .MYWAY_ASSET_VISION_MODEL
      ?.trim() ||
    "nvidia/nemotron-nano-12b-v2-vl";
  const imageUrls =
    await Promise.all(
      views.map(
        async (view) => {
          const bytes =
            await readFile(
              view.file_path,
            );
          return `data:image/png;base64,${bytes.toString("base64")}`;
        },
      ),
    );
  const startedAt =
    Date.now();
  const prompt =
    buildPrompt({
      brief,
      manifest,
      viewLabels:
        views.map(
          (view) =>
            view.label,
        ),
    });
  const response =
    await postJson(
      endpoint,
      {
        model,
        messages: [
          {
            role: "system",
            content:
              "/no_think\nReturn only valid JSON. Do not include Markdown or commentary.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              ...imageUrls.map(
                (url) => ({
                  type:
                    "image_url",
                  image_url: {
                    url,
                  },
                }),
              ),
            ],
          },
        ],
        frequency_penalty: 0,
        presence_penalty: 0,
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 3000,
        stream: false,
      },
      240_000,
    );
  const content =
    assistantText(response);
  if (!content.trim()) {
    throw new Error(
      "The Foundry visual critic returned no content.",
    );
  }
  const report =
    normalizeReport({
      value:
        extractJsonObject(
          content,
        ),
      jobId,
      model,
      brief,
      viewLabels:
        views.map(
          (view) =>
            view.label,
        ),
    });

  const publicReportPath =
    path.join(
      publicDir,
      "visual-critique.json",
    );
  const privateReportPath =
    path.join(
      privateDir,
      "visual-critique.json",
    );
  await mkdir(
    privateDir,
    { recursive: true },
  );
  await Promise.all([
    writeFile(
      publicReportPath,
      JSON.stringify(
        report,
        null,
        2,
      ) + "\n",
      "utf8",
    ),
    writeFile(
      privateReportPath,
      JSON.stringify(
        report,
        null,
        2,
      ) + "\n",
      "utf8",
    ),
  ]);

  const publicUrl =
    `/sandbox-assets/myway/blender-python-builder/${jobId}/visual-critique.json`;
  const updatedManifest = {
    ...manifest,
    visual_critique_url:
      publicUrl,
    visual_critique:
      report,
  };
  await writeFile(
    manifestPath,
    JSON.stringify(
      updatedManifest,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return {
    report,
    visual_critique_url:
      publicUrl,
    model,
    elapsed_ms:
      Date.now() -
      startedAt,
    analyzed_views:
      views.map((view) => ({
        label:
          view.label,
        file_name:
          view.file_name,
      })),
  };
}
