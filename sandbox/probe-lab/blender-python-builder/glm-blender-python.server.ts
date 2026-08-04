import {
  FOUNDRY_ASSET_CLASSES,
  normalizeAssetDesignBrief,
  type AssetDesignBriefV2,
  type FoundryAssetClass,
  type FoundryQualityMode,
} from "./asset-design-brief";
import type {
  FoundryResourcePlanV1,
} from "./foundry-resource-plan";
import {
  buildDirectGlmContextPackage,
  publicDirectGlmContextSummary,
} from "./direct-glm-context.server";
import {
  resolveFoundryBlenderRuntime,
  type FoundryBlenderRuntimeInfo,
} from "./blender-runtime.server";
import {
  visualCritiqueCodeFindings,
  visualCritiqueDeferredFindings,
  type FoundryVisualCritiqueReport,
} from "./foundry-visual-critic.server";
import {
  validateBlenderPythonPreflight,
  type BlenderPythonPreflightResult,
} from "./blender-python-preflight";

const REQUEST_TIMEOUT_MS =
  300_000;
const MAX_RESPONSE_TOKENS =
  16_000;
const STREAM_CHAT_COMPLETIONS =
  true;

type GlmContentPart = {
  type?: string;
  text?: string;
};

type GlmResponsePayload = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | GlmContentPart[];
    };
    delta?: {
      content?:
        | string
        | GlmContentPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

function extractPython(
  content: string,
) {
  const fenced =
    content.match(
      /```python\s*([\s\S]*?)```/i,
    )?.[1] ??
    content.match(
      /```\s*([\s\S]*?)```/i,
    )?.[1];

  const code =
    (fenced ?? content)
      .trim();
  if (
    !code.includes(
      "import bpy",
    )
  ) {
    throw new Error(
      "GLM response did not contain a Blender Python script.",
    );
  }
  return code;
}

function extractJson(
  content: string,
) {
  const fenced =
    content.match(
      /```json\s*([\s\S]*?)```/i,
    )?.[1] ??
    content.match(
      /```\s*([\s\S]*?)```/i,
    )?.[1];
  const source =
    (fenced ?? content)
      .trim();
  try {
    const parsed =
      JSON.parse(source) as
        unknown;
    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "JSON output must be an object.",
      );
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `GLM JSON could not be parsed: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}

function extractContentText(
  value: unknown,
) {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) => {
      if (
        !part ||
        typeof part !==
          "object" ||
        Array.isArray(part)
      ) {
        return "";
      }
      const text =
        (
          part as Record<
            string,
            unknown
          >
        ).text;
      return typeof text ===
        "string"
        ? text
        : "";
    })
    .join("");
}

function resolveGlmConfig() {
  const apiKey =
    process.env
      .NVIDIA_API_KEY
      ?.trim();
  if (!apiKey) {
    throw new Error(
      "NVIDIA_API_KEY is required for GLM Blender Python generation.",
    );
  }

  return {
    apiKey,
    endpoint: (
      process.env
        .NVIDIA_BASE_URL ??
      "https://integrate.api.nvidia.com/v1"
    ).replace(/\/$/, ""),
    model:
      process.env
        .MYWAY_GLM_BLENDER_PYTHON_MODEL ??
      process.env
        .MYWAY_GLM_ASSET_MODEL ??
      process.env
        .MYWAY_GLM_MODEL ??
      "z-ai/glm-5.2",
  };
}

function isAbortError(
  caught: unknown,
) {
  return (
    caught instanceof Error &&
    (
      caught.name ===
        "AbortError" ||
      caught.message
        .toLowerCase()
        .includes(
          "aborted",
        )
    )
  );
}

async function readJsonChatCompletion(
  response: Response,
) {
  const raw =
    await response.text();
  const payload =
    raw.trim()
      ? (
          (
            JSON.parse(
              raw,
            ) as
              | GlmResponsePayload
              | null
          ) ?? null
        )
      : null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
      raw.slice(0, 1200) ??
      `GLM request failed with HTTP ${response.status}.`,
    );
  }

  const content =
    extractContentText(
      payload?.choices?.[0]
        ?.message?.content,
    );
  if (!content.trim()) {
    throw new Error(
      "GLM returned no message content.",
    );
  }

  return content;
}

async function readStreamingChatCompletion(
  response: Response,
) {
  if (!response.body) {
    throw new Error(
      "GLM returned no readable stream.",
    );
  }

  const reader =
    response.body.getReader();
  const decoder =
    new TextDecoder();
  let buffer = "";
  let content = "";
  let providerError = "";

  const processEventBlock = (
    block: string,
  ) => {
    const normalized =
      block
        .replace(
          /\r\n/g,
          "\n",
        )
        .trim();
    if (!normalized) {
      return;
    }

    const data =
      normalized
        .split("\n")
        .filter((line) =>
          line.startsWith(
            "data:",
          ),
        )
        .map((line) =>
          line
            .slice(5)
            .trimStart(),
        )
        .join("\n")
        .trim();

    if (
      !data ||
      data === "[DONE]"
    ) {
      return;
    }

    let payload:
      | GlmResponsePayload
      | null = null;
    try {
      payload =
        JSON.parse(
          data,
        ) as
          GlmResponsePayload;
    } catch {
      return;
    }

    if (
      payload?.error?.message
        ?.trim()
    ) {
      providerError =
        payload.error.message
          .trim();
    }

    const choice =
      payload?.choices?.[0];
    if (!choice) {
      return;
    }

    const chunk =
      extractContentText(
        choice.delta?.content,
      ) ||
      extractContentText(
        choice.message?.content,
      );
    if (chunk) {
      content += chunk;
    }
  };

  while (true) {
    const {
      value,
      done,
    } = await reader.read();
    buffer +=
      decoder.decode(
        value ??
          new Uint8Array(),
        { stream: !done },
      );
    buffer =
      buffer.replace(
        /\r\n/g,
        "\n",
      );

    let boundary =
      buffer.indexOf(
        "\n\n",
      );
    while (boundary >= 0) {
      const block =
        buffer.slice(
          0,
          boundary,
        );
      buffer =
        buffer.slice(
          boundary + 2,
        );
      processEventBlock(
        block,
      );
      boundary =
        buffer.indexOf(
          "\n\n",
        );
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processEventBlock(
      buffer,
    );
  }

  if (providerError) {
    throw new Error(
      providerError,
    );
  }

  if (!response.ok) {
    throw new Error(
      `GLM request failed with HTTP ${response.status}.`,
    );
  }

  if (!content.trim()) {
    throw new Error(
      "GLM returned no streamed message content.",
    );
  }

  return content;
}

async function requestGlm(
  messages: Array<{
    role: string;
    content: string;
  }>,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {},
) {
  const {
    apiKey,
    endpoint,
    model,
  } = resolveGlmConfig();
  const controller =
    new AbortController();
  const startedAt =
    Date.now();
  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${endpoint}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              model,
              messages,
              temperature:
                options.temperature ??
                0.1,
              top_p: 0.9,
              max_tokens:
                options.maxTokens ??
                MAX_RESPONSE_TOKENS,
              stream:
                STREAM_CHAT_COMPLETIONS,
            }),
          signal:
            controller.signal,
        },
      );

    const content =
      STREAM_CHAT_COMPLETIONS
        ? await readStreamingChatCompletion(
            response,
          )
        : await readJsonChatCompletion(
            response,
          );

    return {
      content,
      model,
      elapsed_ms:
        Date.now() -
        startedAt,
      transport:
        STREAM_CHAT_COMPLETIONS
          ? "streaming"
          : "json",
    };
  } catch (caught) {
    if (
      isAbortError(
        caught,
      )
    ) {
      throw new Error(
        `GLM generation exceeded ${Math.round(
          REQUEST_TIMEOUT_MS /
            1000,
        )} seconds.`,
      );
    }
    throw caught;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

const GENERAL_QUALITY_RULES = `MyWay asset-quality bar:
- The asset must read clearly in front, side, top and three-quarter views.
- Prioritize recognizable silhouette, believable proportions, coherent assembly, real structural connections, meaningful negative space, softened manufactured edges and useful detail.
- Geometry must remain convincing in neutral clay before textures.
- Use layered construction rather than one undifferentiated mass.
- Repeated parts should be consistently placed through loops, arrays or reusable functions.
- Keep movable parts separate and place origins at useful pivots.
- Stay within the approved browser triangle budget.`;

const ASSET_CLASS_STRATEGY_BY_CLASS: Record<
  FoundryAssetClass,
  string
> = {
  hard_surface_assembly:
    "Use native mesh/profile pieces, softened manufactured edges, real hardware, symmetry or repeated arrays, meaningful gaps, and layered construction. Make attachments visible rather than relying on intersections alone.",
  furniture_architecture:
    "Build a load-bearing frame first, then repeated slats, panels, cushions, or trim. Keep believable joints, consistent member thickness, grounded feet, real support members, and readable gaps between structural layers.",
  mechanical_vehicle:
    "Use nested cylinders, tubes, hubs, bearings, brackets, axles, fasteners, and mechanically plausible connections. Keep moving components separate with aligned origins and visible support paths.",
  soft_goods_upholstery:
    "Build padded volumes with controlled compression, rounded seams, believable panel thickness, restrained folds, piping or stitched boundaries when visible, and clear support from any underlying frame. Avoid rigid box-like cushions and noisy micro-wrinkles.",
  layered_organic:
    "Use smooth sculptural masses, controlled asymmetry, irregular boundaries, overlapping layers, and surface variation. Preserve a clean silhouette and avoid disconnected blobs.",
  plant:
    "Use stems and branches as hierarchical curves or tapered geometry, leaf instances, natural variation, coherent branching, and readable primary masses before small foliage detail.",
  educational_anatomy:
    "Prioritize clear landmarks, readable semantic parts, coherent attachment, and instructional separation without disconnected diagram spheres or misleading hidden detail.",
  advanced_organic:
    "Use landmark-based proportions, blended masses, controlled topology, recognizable appendages, and smooth transitions. Keep this conservative unless the brief contains enough visible construction guidance.",
  character:
    "Use landmark-based proportions, coherent head and limb masses, readable joints, controlled symmetry, and smooth transitions. Preserve semantic part identity and avoid treating a character as assembled primitive capsules.",
  general:
    "Choose the simplest native-Blender construction that preserves the requested silhouette, proportions, part hierarchy, structural attachments, negative spaces, and camera-readable details.",
};

export function buildAssetClassStrategyPrompt(
  assetClass:
    FoundryAssetClass,
) {
  return `Active asset-class strategy (${assetClass}):
${ASSET_CLASS_STRATEGY_BY_CLASS[assetClass]}`;
}

const ALL_ASSET_CLASS_STRATEGIES =
  `Asset-class strategy reference for planning:
${FOUNDRY_ASSET_CLASSES.map(
    (assetClass) =>
      `- ${assetClass}: ${ASSET_CLASS_STRATEGY_BY_CLASS[assetClass]}`,
  ).join("\n")}`;

const BLENDER_STATE_RULES = `Blender operator-state rules:
- Treat bpy.ops as context-sensitive. Before modifier application, explicitly enter OBJECT mode, deselect all, select the intended object, and set it active.
- Never create or apply an object modifier while the active object is in EDIT mode.
- After topology edits, refresh lookup tables before reusing mesh elements.
- Before transforms, origins, parenting, joins, conversions, or modifier application, establish the correct mode and active object.
- Use modifier.name rather than a guessed string when applying a modifier.
- Avoid UI-area-dependent operators. Prefer direct data APIs.
- The script must run from --background --factory-startup without interaction.`;

const DIRECT_MYWAY_BOUNDARY = `Required MyWay boundary helpers:
- myway_reset_scene()
- myway_print_progress(message)
- myway_material_slot(slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55, part_id=None)
- myway_assign_material_slot(obj, slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55, part_id=None)
- myway_normalize_extent(target_extent, root_or_iterable)

Use native bpy, bmesh and mathutils for modelling. MyWay geometry constructors are optional and should not be used unless their exact signature is already known from the camera reference. MyWay appends trusted resource hydration, UV fallback, grounding, environment setup, inspection, .blend save and GLB export.`;

type GlmPreflightRepairMetadata = {
  attempted: boolean;
  model: string | null;
  elapsed_ms: number | null;
  transport: string | null;
  initial_error_count: number;
  final_error_count: number;
};

async function repairGeneratedCodeAfterPreflight(
  input: {
    code: string;
    request: string;
    designBrief: AssetDesignBriefV2;
    preflight: BlenderPythonPreflightResult;
    runtime:
      FoundryBlenderRuntimeInfo;
  },
) {
  const system = `You are correcting a Blender ${input.runtime.blender_version} Python script that failed MyWay's static helper-contract preflight before Blender was launched.

Return only the complete corrected Python script inside one Python markdown fence.
Preserve the approved asset design, exact required part ids, exact material slot ids, hierarchy, pivots and successful geometry.
Correct every listed preflight error together; do not make a one-line patch that leaves related invalid helper calls behind.

${BLENDER_STATE_RULES}

${DIRECT_MYWAY_BOUNDARY}

Do not add export, save or rendering code. Do not use unsafe imports, network access, external commands, add-ons or file-system scanning.`;

  const user = `Original request:
${input.request}

Approved design brief:
${JSON.stringify(input.designBrief, null, 2)}

Static preflight result:
${JSON.stringify(input.preflight, null, 2)}

Current script:
\`\`\`python
${input.code.slice(0, 500_000)}
\`\`\`

Return the complete corrected script and verify every myway_* call against the exact contract.`;

  const result = await requestGlm(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.05, maxTokens: MAX_RESPONSE_TOKENS },
  );

  return {
    code: extractPython(result.content),
    model: result.model,
    elapsed_ms: result.elapsed_ms,
    transport: result.transport,
  };
}

export async function planAssetDesign(
  input: {
    request: string;
    style: string;
    animationReady: boolean;
    targetExtentM: number;
    maxTriangles: number;
    qualityMode:
      FoundryQualityMode;
  },
) {
  const system = `You are MyWay's senior industrial designer. Before any Blender code is written, author both a construction-ready Asset Design Brief V2 and a dimensionally coherent text-authored visual blueprint.

Return exactly one JSON markdown fence and no prose. Use schema_version "myway_asset_design_brief_v2".

Required top-level fields:
schema_version, asset_id, concept, asset_class, intended_use, target_extent_m,
axis_dimensions_m, max_triangles, quality_mode, realism, style_tags, silhouette,
proportions, visual_description, parts, material_slots, environment, requirements,
acceptance_criteria, benchmark_priorities.

The visual_description is the imagined reference sheet that the Blender code model will follow. Use schema_version "myway_asset_visual_description_v1" and include:
- design_summary;
- shape_language with primary_forms, edge_character, symmetry, detail_density and proportion_emphasis;
- orthographic_views with front, right, top and three_quarter descriptions;
- overall_dimensions_m in [width_x, depth_y, height_z] order;
- normalized_proportions as objects with relationship, numeric ratio and tolerance;
- part_layout with exactly one item for every semantic part;
- material_regions with exactly one item for every material slot;
- visual_acceptance_tests;
- uncertainty_notes.

Coordinate and measurement rules:
- Use asset-local metres with +X right, +Y back and +Z up.
- Ground-contact geometry begins at Z=0.
- part_layout dimensions_m are [width_x, depth_y, height_z].
- part_layout position_m is the intended object centre or clearly stated pivot-centred location in the same asset-local frame.
- part_layout rotation_degrees is [x, y, z].
- axis_dimensions_m and visual_description.overall_dimensions_m must agree.
- Choose concrete, internally consistent dimensions. Do not leave important dimensions or positions null.
- Include at least five measurable normalized_proportions for standard or hero quality, and at least three for draft quality.
- Ratios must describe visible relationships such as cage diameter / total height, seat thickness / chair height or wheel diameter / body length. Avoid meaningless ratios.

Each part needs part_id, semantic_role, geometry_strategy, parent_part_id,
connection_strategy, material_slot_id, animation_role, pivot_requirement,
required and identifying_features. Geometry strategy must encode the native-Blender construction approach, relative thickness or scale, symmetry/repetition, and view-critical details. Connection strategy must describe the visible support, clearance, axle, hinge, seam, socket, overlap or fastener rather than merely saying attached.

Each visual_description.part_layout item needs part_id, shape_description,
dimensions_m, position_m, rotation_degrees, visible_from and construction_notes.
The part_id must exactly match a parts entry. Construction notes should clarify the shape in ways that dimensions alone cannot, including taper, profile, curvature, ring counts, spoke counts, blade sweep, padding bulge, panel recess or similar visible details.

Each material slot needs slot_id, display_name, assigned_part_ids,
material_family, intent, semantic_tags, color_hint, roughness_hint,
metallic_hint, physical_scale_m, required_maps, and procedural_fallback with
color_rgba, metallic and roughness. Describe visible texture in texture_hint,
clearly unwanted qualities in avoid_tags, and brightness_hint as dark, medium or
light when important.

Each visual_description.material_regions item needs slot_id,
visible_description, dominant_color_hex, finish and mapping_intent. The slot_id
must exactly match a material_slots entry. Author appearance intent only; do not
invent AmbientCG ids.

The visual description must be specific enough that another modeller could draw consistent front, side, top and three-quarter views without guessing. Use 3-32 semantic parts when appropriate; do not create fake parts.

${GENERAL_QUALITY_RULES}

${ALL_ASSET_CLASS_STRATEGIES}`;

  const user = `Asset request:
${input.request}

Style:
${input.style}

Quality mode:
${input.qualityMode}

Animation ready:
${input.animationReady ? "yes" : "no"}

Target extent:
${input.targetExtentM} metres

Browser triangle budget:
${input.maxTriangles}

Design an original asset for a Three.js learning scene and controlled Blender look-development. Commit to one coherent visual design before coding.`;

  const draftResult =
    await requestGlm(
      [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: user,
        },
      ],
      {
        temperature: 0.15,
        maxTokens: 10_000,
      },
    );
  const fallback = {
    concept:
      input.request,
    target_extent_m:
      input.targetExtentM,
    max_triangles:
      input.maxTriangles,
    quality_mode:
      input.qualityMode,
    style:
      input.style,
    animation_ready:
      input.animationReady,
  };
  const draftBrief =
    normalizeAssetDesignBrief(
      extractJson(
        draftResult.content,
      ),
      fallback,
    );

  const reviewSystem = `You are MyWay's independent visual-design auditor. Review a draft Asset Design Brief V2 before it reaches the Blender code model.

Return exactly one complete corrected JSON markdown fence and no prose. Preserve schema_version "myway_asset_design_brief_v2" and visual_description.schema_version "myway_asset_visual_description_v1".

Audit and correct all of these together:
- silhouette and proportions form one recognizable original design;
- axis_dimensions_m equals visual_description.overall_dimensions_m;
- every required part has a useful non-empty geometry_strategy;
- every part appears exactly once in visual_description.part_layout;
- important parts have concrete dimensions_m and position_m;
- all part dimensions fit inside the overall bounds unless an intentional overhang is described;
- parents, supports, clearances, pivots and moving-part dependencies are physically coherent;
- orthographic descriptions agree with the numeric part layout;
- normalized ratios agree with the dimensions and are visually meaningful;
- every material slot appears in material_regions and its assigned parts are consistent;
- visual acceptance tests are measurable from controlled Blender renders;
- the design is not a generic placeholder and can be built without inventing missing proportions.

Use asset-local metres with +X right, +Y back, +Z up and ground at Z=0. Correct the whole blueprint instead of appending comments about problems. Keep the user's requested concept and style.`;

  let reviewedBrief =
    draftBrief;
  let reviewResult:
    Awaited<ReturnType<typeof requestGlm>> | null =
    null;
  let reviewError:
    string | null = null;
  try {
    reviewResult =
      await requestGlm(
        [
          {
            role: "system",
            content:
              reviewSystem,
          },
          {
            role: "user",
            content: `Original request:\n${input.request}\n\nRequested style:\n${input.style}\n\nDraft design and visual blueprint:\n${JSON.stringify(
              draftBrief,
              null,
              2,
            )}\n\nReturn the complete corrected design brief JSON.`,
          },
        ],
        {
          temperature: 0.05,
          maxTokens: 10_000,
        },
      );
    reviewedBrief =
      normalizeAssetDesignBrief(
        extractJson(
          reviewResult.content,
        ),
        fallback,
      );
  } catch (caught) {
    reviewError =
      caught instanceof Error
        ? caught.message
        : String(caught);
  }

  return {
    content:
      reviewResult?.content ??
      draftResult.content,
    model:
      reviewResult?.model ??
      draftResult.model,
    elapsed_ms:
      draftResult.elapsed_ms +
      (reviewResult?.elapsed_ms ?? 0),
    transport:
      reviewResult
        ? `${draftResult.transport}+${reviewResult.transport}`
        : draftResult.transport,
    design_brief:
      reviewedBrief,
    design_review: {
      schema_version:
        "myway_visual_design_review_v1",
      reviewed:
        reviewResult !== null,
      draft_model:
        draftResult.model,
      review_model:
        reviewResult?.model ??
        null,
      draft_elapsed_ms:
        draftResult.elapsed_ms,
      review_elapsed_ms:
        reviewResult?.elapsed_ms ??
        null,
      review_error:
        reviewError,
    },
  };
}

export async function generateBlenderPython(
  input: {
    request: string;
    style: string;
    animationReady: boolean;
    targetExtentM: number;
    maxTriangles: number;
    qualityMode?:
      FoundryQualityMode;
    designBrief?:
      AssetDesignBriefV2
      | null;
    resourcePlan?:
      FoundryResourcePlanV1
      | null;
  },
) {
  const qualityMode =
    input.qualityMode ??
    input.designBrief
      ?.quality_mode ??
    "standard";
  const brief =
    input.designBrief ??
    (
      await planAssetDesign({
        request:
          input.request,
        style:
          input.style,
        animationReady:
          input.animationReady,
        targetExtentM:
          input.targetExtentM,
        maxTriangles:
          input.maxTriangles,
        qualityMode,
      })
    ).design_brief;
  const runtime =
    await resolveFoundryBlenderRuntime();
  const contextPackage =
    buildDirectGlmContextPackage({
      brief,
      resourcePlan:
        input.resourcePlan ??
        null,
      runtime,
    });
  const promptContext = {
    ...contextPackage,
    reference_example: {
      id:
        contextPackage.reference_example.id,
      purpose:
        contextPackage.reference_example.purpose,
      line_count:
        contextPackage.reference_example.line_count,
    },
  };

  const system = `You are a senior Blender procedural modeller writing one complete asset-specific Python script for the exact configured runtime: Blender ${runtime.blender_version} with Python ${runtime.python_version}.

Return only one Python markdown fence and no prose.

Execution contract:
- Import bpy, bmesh, math, mathutils and only other safe standard-library modules when needed.
- Do not use subprocess, socket, requests, urllib, external commands, package installation, add-ons, network access, or file-system scanning.
- Use Z as vertical.
- Begin with myway_reset_scene().
- Build a cohesive asset, not a loose pile of primitives.
- Exact required part_ids from the design brief must be exact Blender object names.
- Follow each part's geometry_strategy, connection_strategy, identifying features, and parent relationship from the compact context.
- Treat asset_contract.visual_description as the text-authored reference sheet and primary source of truth for visible proportions, part dimensions, part centres, orthographic silhouettes, shape language and material regions.
- Establish the overall coordinate frame and dimensioned primary masses before adding secondary detail. Do not replace the approved blueprint with generic proportions.
- Use visual_description.part_layout dimensions and positions as build targets, allowing only small construction-driven adjustments that preserve the listed normalized ratios.
- Use semantic material slots with myway_material_slot("slot_id"). The trusted runtime resolves prepared AmbientCG PBR maps or a procedural fallback.
- Give movable parts useful origins/pivots and preserve their separate object identity.
- Ground the asset near Z=0 and normalize toward the requested extent.
- Generate UVs for textured mesh parts.
- Do not export, save or render. MyWay appends trusted code.
- Print concise MYWAY_PROGRESS messages.
- Repeated parts must use loops, arrays or helper functions.
- Preserve real structural connections; avoid floating or paper-thin parts.
- Use native bpy, bmesh and mathutils as the primary modelling language.
- Use MyWay only at the compact resource and lifecycle boundary below.
- Use exact target_extent_m from the approved contract; never hardcode a generic default.
- Do not copy the camera's dimensions, names or geometry unless the requested asset is actually that camera.

${BLENDER_STATE_RULES}

${DIRECT_MYWAY_BOUNDARY}

${GENERAL_QUALITY_RULES}

${buildAssetClassStrategyPrompt(
  brief.asset_class,
)}

The only proven code example follows. Study its native-bpy construction discipline, helper functions, object-state handling, material boundary and connected assembly. Do not turn unrelated requests into cameras.

\`\`\`python
${contextPackage.reference_example.code}
\`\`\`

Before returning, mentally compare front, right, top and three-quarter silhouettes against asset_contract.visual_description, verify the normalized proportions, and trace every context-sensitive operation.`;

  const user = `Original asset request:
${input.request}

Compact direct-Blender context package:
${JSON.stringify(
  promptContext,
  null,
  2,
)}

Write the complete asset-specific Blender Python. Preserve every required part id,
material slot id, hierarchy, connection, pivot, target scale, visual-description
dimension, normalized proportion and acceptance criterion. Use native Blender
geometry and make the result readable in neutral clay without textures. Return
only the complete Python script.`;

  const result =
    await requestGlm(
      [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: user,
        },
      ],
      {
        temperature: 0.1,
        maxTokens:
          MAX_RESPONSE_TOKENS,
      },
    );

  let code =
    extractPython(
      result.content,
    );
  let preflight =
    validateBlenderPythonPreflight(
      code,
      {
        designBrief:
          brief,
        enforceDesignBrief:
          true,
      },
    );
  const preflightRepair:
    GlmPreflightRepairMetadata = {
      attempted: false,
      model: null,
      elapsed_ms: null,
      transport: null,
      initial_error_count:
        preflight.errors.length,
      final_error_count:
        preflight.errors.length,
    };

  if (!preflight.valid) {
    const repaired =
      await repairGeneratedCodeAfterPreflight({
        code,
        request:
          input.request,
        designBrief:
          brief,
        preflight,
        runtime,
      });
    code =
      repaired.code;
    preflight =
      validateBlenderPythonPreflight(
        code,
        {
          designBrief:
            brief,
          enforceDesignBrief:
            true,
        },
      );
    preflightRepair.attempted =
      true;
    preflightRepair.model =
      repaired.model;
    preflightRepair.elapsed_ms =
      repaired.elapsed_ms;
    preflightRepair.transport =
      repaired.transport;
    preflightRepair.final_error_count =
      preflight.errors.length;
  }

  return {
    code,
    design_brief:
      brief,
    context_package:
      publicDirectGlmContextSummary(
        contextPackage,
      ),
    model:
      result.model,
    elapsed_ms:
      result.elapsed_ms,
    transport:
      result.transport,
    preflight_validation:
      preflight,
    preflight_repair:
      preflightRepair,
  };
}

export async function repairBlenderPython(
  input: {
    code: string;
    blenderError: string;
    request?: string;
    designBrief?:
      AssetDesignBriefV2
      | null;
  },
) {
  if (
    !input.code.includes(
      "import bpy",
    )
  ) {
    throw new Error(
      "The repair request must include a Blender Python script.",
    );
  }
  if (
    !input.blenderError
      .trim()
  ) {
    throw new Error(
      "A Blender error or traceback is required for repair.",
    );
  }

  const runtime =
    await resolveFoundryBlenderRuntime();
  const system = `You are repairing a Blender ${runtime.blender_version} Python script after a real headless execution failure.

Return only the complete corrected Python script inside one Python markdown fence.
Preserve the asset, design brief, object names, material-slot ids, hierarchy,
pivots, successful geometry and intended appearance. Make the smallest reliable
fix, while correcting directly related context hazards.

${BLENDER_STATE_RULES}

${DIRECT_MYWAY_BOUNDARY}

Do not add export or rendering code. Do not use unsafe imports, network access,
external commands, package installation, add-ons or file-system scanning.`;

  const user = `Original request:
${input.request?.trim() ||
"Not provided"}

Design brief:
${JSON.stringify(
  input.designBrief ??
    null,
  null,
  2,
)}

Blender error:
${input.blenderError.slice(
  0,
  30_000,
)}

Current script:
\`\`\`python
${input.code.slice(
  0,
  500_000,
)}
\`\`\`

Return the complete repaired script.`;

  const result =
    await requestGlm([
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: user,
      },
    ]);

  return {
    code:
      extractPython(
        result.content,
      ),
    model:
      result.model,
    elapsed_ms:
      result.elapsed_ms,
    transport:
      result.transport,
  };
}

export async function improveBlenderPython(
  input: {
    code: string;
    request: string;
    critique: string;
    designBrief:
      AssetDesignBriefV2;
    buildValidation?: unknown;
    qualityFindings?: unknown;
    resourcePlan?:
      FoundryResourcePlanV1
      | null;
    visualCritique?:
      FoundryVisualCritiqueReport
      | null;
    preservePartIds?: boolean;
  },
) {
  if (
    !input.code.includes(
      "import bpy",
    )
  ) {
    throw new Error(
      "The improvement request must include a Blender Python script.",
    );
  }

  const runtime =
    await resolveFoundryBlenderRuntime();
  const system = `You are improving an already successful Blender ${runtime.blender_version} asset toward MyWay's benchmark quality bar.

Return only the complete revised Python script in one Python markdown fence.
This is a targeted revision, not a fresh unrelated design.

Rules:
- Preserve every required part id, material slot id, hierarchy and animation pivot.
- Preserve successful portions that are not implicated by the critique.
- Improve silhouette, proportions, structural connections, edge treatment,
  layered construction, semantic surface regions and readable detail.
- Keep within the design brief's triangle budget.
- Geometry must look convincing in neutral clay before textures.
- Do not export, save or render.
- Do not use unsafe imports, network access, external commands, add-ons or file scanning.

${BLENDER_STATE_RULES}

${DIRECT_MYWAY_BOUNDARY}

${GENERAL_QUALITY_RULES}

${buildAssetClassStrategyPrompt(
  input.designBrief.asset_class,
)}`;

  const user = `Original request:
${input.request}

Approved design brief:
${JSON.stringify(
  input.designBrief,
  null,
  2,
)}

User critique:
${input.critique.trim() ||
"Improve the weakest visible construction and benchmark-quality issues."}

Automated build validation:
${JSON.stringify(
  input.buildValidation ??
    null,
  null,
  2,
)}

Automated quality findings:
${JSON.stringify(
  input.qualityFindings ??
    null,
  null,
  2,
)}

Visual findings routed to Blender code:
${JSON.stringify(
  visualCritiqueCodeFindings(
    input.visualCritique,
  ),
  null,
  2,
)}

Deferred material-mapping, look-development, or human-review findings:
${JSON.stringify(
  visualCritiqueDeferredFindings(
    input.visualCritique,
  ),
  null,
  2,
)}

Selected resource plan and appearance intent:
${JSON.stringify(
  input.resourcePlan ??
    null,
  null,
  2,
)}

Current complete script:
\`\`\`python
${input.code.slice(
  0,
  500_000,
)}
\`\`\`

Revise only what is needed to address the user critique and findings routed to Blender code while preserving the approved design. Preserve selected material ids and material-slot intent. Do not attempt to solve deferred texture-scale, mapping, roughness, normal-strength, HDRI, exposure, or uncertain findings by unrelated geometry changes.`;

  const result =
    await requestGlm(
      [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: user,
        },
      ],
      {
        temperature: 0.1,
      },
    );

  return {
    code:
      extractPython(
        result.content,
      ),
    model:
      result.model,
    elapsed_ms:
      result.elapsed_ms,
    transport:
      result.transport,
  };
}
