import {
  designBriefToProceduralSpec,
  normalizeAssetDesignBrief,
  type AssetDesignBriefV2,
  type FoundryQualityMode,
} from "./asset-design-brief";
import type {
  FoundryResourcePlanV1,
} from "./foundry-resource-plan";
import type {
  ProceduralAssetSpecV1,
} from "./procedural-asset-spec";
import {
  buildFoundryHelperContractPrompt,
} from "./blender-helper-contract";
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

const BENCHMARK_QUALITY_RULES = `MyWay benchmark quality bar:
- Treasure-chest quality: a strong curved-lid silhouette, substantial wrapping metal bands, real hinges/hardware, softened edges, separate wood and metal regions, and readable ornament.
- Wheelchair quality: connected tubular frame, layered wheels with tires/rims/hubs/spokes/push rims, separate casters, fabric seating, and believable support structure.
- Camera quality: layered lens barrels and rings, recessed front glass, body bevels, controls, strap curves, and distinct body/metal/glass/rubber materials.
- Furniture quality: repeated slats, believable frame thickness, connected supports, softened manufactured edges, and separate wood/metal construction.
- Burger quality: distinct irregular ingredient layers with volume, controlled asymmetry, material diversity, and repeated details such as seeds.
- Apple quality: non-spherical sculpted silhouette, top depression, stem, subtle asymmetry, gloss and roughness variation.
Prioritize silhouette, proportion, coherent assembly, semantic material regions, edge treatment, and useful detail over merely increasing triangle count.`;

const ASSET_CLASS_STRATEGIES = `Asset-class strategies:
- hard_surface_assembly: profile-based pieces, bevelled edges, real hardware, arrays/symmetry, meaningful gaps and layered construction.
- furniture_architecture: structural frames, repeated slats/panels, believable joints, consistent thickness and real support members.
- mechanical_vehicle: nested cylinders, tubes, hubs, bearings, brackets, fasteners and mechanically plausible connections.
- layered_organic: smooth sculptural masses, controlled asymmetry, irregular boundaries, overlapping layers and surface variation.
- plant: stems/branches as curves, leaf instances, natural variation and hierarchy.
- educational_anatomy: clear landmarks and readable semantic parts without disconnected diagram-spheres.
- advanced_organic or character: landmark-based proportions, blended masses, recognizable head/limbs/appendages and smooth transitions.`;

const BLENDER_STATE_RULES = `Blender operator-state rules:
- Treat bpy.ops as context-sensitive. Before modifier application, explicitly enter OBJECT mode, deselect all, select the intended object, and set it active.
- Never create or apply an object modifier while the active object is in EDIT mode.
- After topology edits, refresh lookup tables before reusing mesh elements.
- Before transforms, origins, parenting, joins, conversions, or modifier application, establish the correct mode and active object.
- Use modifier.name rather than a guessed string when applying a modifier.
- Avoid UI-area-dependent operators. Prefer direct data APIs.
- Use version-tolerant Blender 5.1+ APIs.
- The script must run from --background --factory-startup without interaction.`;

const HELPER_CAPABILITIES =
  buildFoundryHelperContractPrompt();

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
  },
) {
  const system = `You are correcting a Blender 5.1+ Python script that failed MyWay's static helper-contract preflight before Blender was launched.

Return only the complete corrected Python script inside one Python markdown fence.
Preserve the approved asset design, exact required part ids, exact material slot ids, hierarchy, pivots and successful geometry.
Correct every listed preflight error together; do not make a one-line patch that leaves related invalid helper calls behind.

${BLENDER_STATE_RULES}

${HELPER_CAPABILITIES}

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
  const system = `You are MyWay's senior asset designer. Produce a construction-ready Asset Design Brief V2 before any Blender code is written.

Return exactly one JSON markdown fence and no prose. Use schema_version "myway_asset_design_brief_v2".

Required fields:
schema_version, asset_id, concept, asset_class, intended_use, target_extent_m,
axis_dimensions_m, max_triangles, quality_mode, realism, style_tags, silhouette,
proportions, parts, material_slots, environment, requirements,
acceptance_criteria, benchmark_priorities.

Each part needs part_id, semantic_role, geometry_strategy, parent_part_id,
connection_strategy, material_slot_id, animation_role, pivot_requirement,
required, identifying_features.

Each material slot needs slot_id, display_name, assigned_part_ids,
material_family, intent, semantic_tags, color_hint, roughness_hint,
metallic_hint, physical_scale_m, required_maps, and procedural_fallback with
color_rgba, metallic and roughness.

Make the brief specific enough that another modeller could build the asset
without guessing its silhouette, proportions, connections, pivots or surface
regions. Use 3-32 semantic parts when appropriate; do not create fake parts.

${BENCHMARK_QUALITY_RULES}

${ASSET_CLASS_STRATEGIES}`;

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

Design the asset for a Three.js learning scene and controlled Blender look-development.`;

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
        temperature: 0.15,
        maxTokens: 8000,
      },
    );
  const designBrief =
    normalizeAssetDesignBrief(
      extractJson(
        result.content,
      ),
      {
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
      },
    );

  return {
    ...result,
    design_brief:
      designBrief,
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
    assetSpec?:
      ProceduralAssetSpecV1
      | null;
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
  const spec =
    input.assetSpec ??
    designBriefToProceduralSpec(
      brief,
    );

  const system = `You are a senior Blender procedural modeller writing one complete asset-specific Python script for Blender 5.1+.

Return only one Python markdown fence and no prose.

Execution contract:
- Import bpy and only safe standard-library modules such as math.
- Do not use subprocess, socket, requests, urllib, external commands, package installation, add-ons, network access, or file-system scanning.
- Use Z as vertical.
- Begin with myway_reset_scene().
- Build a cohesive asset, not a loose pile of primitives.
- Exact required part_ids from the design brief must be exact Blender object names.
- Use semantic material slots with myway_material_slot("slot_id"). The trusted runtime resolves prepared AmbientCG PBR maps or a procedural fallback.
- Give movable parts useful origins/pivots and preserve their separate object identity.
- Ground the asset near Z=0 and normalize toward the requested extent.
- Generate UVs for textured mesh parts.
- Do not export, save or render. MyWay appends trusted code.
- Print concise MYWAY_PROGRESS messages.
- Repeated parts must use loops, arrays or helper functions.
- Preserve real structural connections; avoid floating or paper-thin parts.
- Before returning, verify every myway_* call against the exact helper contract below.
- Use exact target_extent_m from the approved brief; never hardcode a default extent.

${BLENDER_STATE_RULES}

${HELPER_CAPABILITIES}

${BENCHMARK_QUALITY_RULES}

${ASSET_CLASS_STRATEGIES}

Before returning, mentally inspect front, side and three-quarter silhouettes and trace every context-sensitive operation.`;

  const user = `Original asset request:
${input.request}

Approved Asset Design Brief V2:
${JSON.stringify(
  brief,
  null,
  2,
)}

Compatible procedural specification:
${JSON.stringify(
  spec,
  null,
  2,
)}

Prepared resource plan:
${JSON.stringify(
  input.resourcePlan ??
    null,
  null,
  2,
)}

Write the complete asset-specific Blender Python. Preserve all required part ids,
material slot ids, hierarchy, connections, pivots, scale and acceptance criteria.
The geometry must remain readable in neutral clay without textures.`;

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
    asset_spec:
      spec,
    design_brief:
      brief,
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

  const system = `You are repairing a Blender 5.1+ Python script after a real headless execution failure.

Return only the complete corrected Python script inside one Python markdown fence.
Preserve the asset, design brief, object names, material-slot ids, hierarchy,
pivots, successful geometry and intended appearance. Make the smallest reliable
fix, while correcting directly related context hazards.

${BLENDER_STATE_RULES}

${HELPER_CAPABILITIES}

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

  const system = `You are improving an already successful Blender asset toward MyWay's benchmark quality bar.

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

${HELPER_CAPABILITIES}

${BENCHMARK_QUALITY_RULES}

${ASSET_CLASS_STRATEGIES}`;

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

Current complete script:
\`\`\`python
${input.code.slice(
  0,
  500_000,
)}
\`\`\`

Revise only what is needed to address the critique and findings while preserving
the approved design.`;

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
