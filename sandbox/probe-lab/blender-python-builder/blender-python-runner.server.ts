import {
  spawn,
} from "node:child_process";
import {
  randomUUID,
} from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  resolveBlenderExecutable,
} from "../assets/paths.server";
import {
  designBriefToProceduralSpec,
  normalizeAssetDesignBrief,
  validateAssetDesignBrief,
  type AssetDesignBriefV2,
} from "./asset-design-brief";
import {
  buildTrustedBlenderHelperPrelude,
  FOUNDRY_HELPER_LIBRARY_VERSION,
} from "./blender-helper-library";
import {
  buildTrustedBlenderInspectionFooter,
  FOUNDRY_INSPECTION_FOOTER_VERSION,
} from "./blender-inspection-footer";
import {
  buildCompileSmokeScript,
  resolveFoundryBlenderRuntime,
  runFoundryCompileSmoke,
  type FoundryCompileSmokeResult,
  type FoundryBlenderRuntimeInfo,
} from "./blender-runtime.server";
import {
  cleanupFoundryResourceHydration,
  hydrateFoundryResourcesForBlender,
  publicResourceManifest,
} from "./foundry-resource-service.server";
import {
  normalizeFoundryResourcePlan,
} from "./foundry-resource-plan";
import {
  normalizeSemanticPartName,
} from "./semantic-name";
import {
  normalizeProceduralAssetSpec,
  validateProceduralAssetSpec,
  type ProceduralAssetSpecV1,
} from "./procedural-asset-spec";
import {
  formatBlenderPythonPreflightFailure,
  validateBlenderPythonPreflight,
} from "./blender-python-preflight";
import {
  pruneFoundryExecutionWorkspaces,
} from "./foundry-workspace-lifecycle.server";

export const FOUNDRY_EXECUTION_DIAGNOSTICS_SCHEMA_VERSION =
  "myway_blender_execution_diagnostics_v1" as const;

export type FoundryExecutionDiagnostics = {
  schema_version:
    typeof FOUNDRY_EXECUTION_DIAGNOSTICS_SCHEMA_VERSION;
  phase:
    | "resource_hydration"
    | "compile_smoke"
    | "blender_execution"
    | "output_verification";
  failure_source:
    | "model_code"
    | "trusted_helper"
    | "trusted_footer"
    | "trusted_resource_layer"
    | "unknown";
  message: string;
  generated_line: number | null;
  editor_line: number | null;
  excerpt: string | null;
  runtime:
    FoundryBlenderRuntimeInfo | null;
  compile_smoke:
    FoundryCompileSmokeResult | null;
};

export class FoundryBlenderExecutionError
  extends Error {
  diagnostics:
    FoundryExecutionDiagnostics;

  constructor(
    message: string,
    diagnostics:
      FoundryExecutionDiagnostics,
  ) {
    super(message);
    this.name =
      "FoundryBlenderExecutionError";
    this.diagnostics =
      diagnostics;
  }
}

export function foundryExecutionDiagnostics(
  caught: unknown,
) {
  return caught instanceof
    FoundryBlenderExecutionError
    ? caught.diagnostics
    : null;
}

type ScriptLineMap = {
  source_start_line: number;
  source_end_line: number;
  footer_start_line: number;
};

function lineCount(
  value: string,
) {
  return value.split(
    /\r?\n/,
  ).length;
}

function buildCompleteScript(
  sourceCode: string,
) {
  const header =
    "import bpy\nimport mathutils\n" +
    buildTrustedBlenderHelperPrelude() +
    "\n";
  const footer =
    buildTrustedBlenderInspectionFooter();
  const sourceStartLine =
    lineCount(header);
  const sourceEndLine =
    sourceStartLine +
    lineCount(sourceCode) -
    1;
  return {
    script:
      header +
      sourceCode +
      footer,
    line_map: {
      source_start_line:
        sourceStartLine,
      source_end_line:
        sourceEndLine,
      footer_start_line:
        sourceEndLine +
        1,
    } satisfies ScriptLineMap,
  };
}

function sourceExcerpt(
  sourceCode: string,
  editorLine: number | null,
) {
  if (!editorLine) return null;
  const lines =
    sourceCode.split(/\r?\n/);
  const start =
    Math.max(
      0,
      editorLine - 3,
    );
  const end =
    Math.min(
      lines.length,
      editorLine + 2,
    );
  return lines
    .slice(start, end)
    .map(
      (value, index) =>
        `${start + index + 1}: ${value}`,
    )
    .join("\n");
}

function tracebackLines(
  output: string,
  scriptPath: string,
) {
  const normalizedPath =
    scriptPath.replace(
      /\\/g,
      "/",
    );
  const frames:
    number[] = [];
  for (const line of
    output.split(/\r?\n/)) {
    const match =
      line.match(
        /File "([^"]+)", line (\d+)/,
      );
    if (!match) continue;
    const framePath =
      (match[1] ?? "")
        .replace(/\\/g, "/");
    if (
      framePath ===
        normalizedPath ||
      framePath.endsWith(
        "/build_asset.py",
      )
    ) {
      frames.push(
        Number(match[2]),
      );
    }
  }
  return frames.filter(
    Number.isFinite,
  );
}

function runtimeDiagnostics(
  input: {
    message: string;
    output: string;
    scriptPath: string;
    sourceCode: string;
    lineMap:
      ScriptLineMap;
    runtime:
      FoundryBlenderRuntimeInfo;
    compileSmoke:
      FoundryCompileSmokeResult;
  },
): FoundryExecutionDiagnostics {
  const frames =
    tracebackLines(
      input.output,
      input.scriptPath,
    );
  const modelFrame =
    [...frames]
      .reverse()
      .find(
        (line) =>
          line >=
            input.lineMap
              .source_start_line &&
          line <=
            input.lineMap
              .source_end_line,
      );
  const generatedLine =
    modelFrame ??
    frames.at(-1) ??
    null;
  let failureSource:
    FoundryExecutionDiagnostics[
      "failure_source"
    ] = "unknown";
  let editorLine:
    number | null = null;

  if (
    generatedLine != null &&
    generatedLine >=
      input.lineMap
        .source_start_line &&
    generatedLine <=
      input.lineMap
        .source_end_line
  ) {
    failureSource =
      "model_code";
    editorLine =
      generatedLine -
      input.lineMap
        .source_start_line +
      1;
  } else if (
    generatedLine != null &&
    generatedLine <
      input.lineMap
        .source_start_line
  ) {
    failureSource =
      "trusted_helper";
  } else if (
    generatedLine != null &&
    generatedLine >=
      input.lineMap
        .footer_start_line
  ) {
    failureSource =
      "trusted_footer";
  }

  return {
    schema_version:
      FOUNDRY_EXECUTION_DIAGNOSTICS_SCHEMA_VERSION,
    phase:
      "blender_execution",
    failure_source:
      failureSource,
    message:
      input.message,
    generated_line:
      generatedLine,
    editor_line:
      editorLine,
    excerpt:
      sourceExcerpt(
        input.sourceCode,
        editorLine,
      ),
    runtime:
      input.runtime,
    compile_smoke:
      input.compileSmoke,
  };
}

function diagnosticMessage(
  diagnostics:
    FoundryExecutionDiagnostics,
  ) {
  const location =
    diagnostics.editor_line
      ? `Editor line ${diagnostics.editor_line}`
      : diagnostics.generated_line
        ? `Generated script line ${diagnostics.generated_line}`
        : "No script line resolved";
  return [
    `[MyWay ${diagnostics.phase}] failure source: ${diagnostics.failure_source}.`,
    location + ".",
    diagnostics.message,
    diagnostics.excerpt
      ? `Model-source excerpt:\n${diagnostics.excerpt}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const TIMEOUT_MS =
  4 * 60 * 1000;
const MAX_SCRIPT_CHARS =
  500_000;

const FOUNDRY_PRIVATE_JOB_ROOT =
  path.join(
    /* turbopackIgnore: true */
    process.cwd(),
    "sandbox",
    "probe-lab",
    "blender-python-builder",
    "jobs",
  );

const FOUNDRY_PUBLIC_JOB_ROOT =
  path.join(
    /* turbopackIgnore: true */
    process.cwd(),
    "public",
    "sandbox-assets",
    "myway",
    "blender-python-builder",
  );

function runtimeChild(
  root: string,
  ...segments: string[]
) {
  return [
    root,
    ...segments,
  ].join(path.sep);
}

async function ensureRuntimeDirectory(
  directory: string,
) {
  const traceSafeDirectory =
    directory;
  await mkdir(
    /* turbopackIgnore: true */
    traceSafeDirectory,
    { recursive: true },
  );
}

async function writeRuntimeText(
  filePath: string,
  value: string,
  _encoding: "utf8" = "utf8",
) {
  const traceSafeFilePath =
    filePath;
  await writeFile(
    /* turbopackIgnore: true */
    traceSafeFilePath,
    value,
    "utf8",
  );
}

async function runtimeStat(
  filePath: string,
) {
  const traceSafeFilePath =
    filePath;
  return stat(
    /* turbopackIgnore: true */
    traceSafeFilePath,
  );
}

const FORBIDDEN_PATTERNS:
  Array<[RegExp, string]> = [
    [
      /\bimport\s+subprocess\b/,
      "subprocess imports are not allowed",
    ],
    [
      /\bfrom\s+subprocess\b/,
      "subprocess imports are not allowed",
    ],
    [
      /\bimport\s+socket\b/,
      "socket imports are not allowed",
    ],
    [
      /\bfrom\s+socket\b/,
      "socket imports are not allowed",
    ],
    [
      /\bimport\s+requests\b/,
      "requests imports are not allowed",
    ],
    [
      /\bimport\s+urllib\b/,
      "urllib imports are not allowed",
    ],
    [
      /\bos\.system\s*\(/,
      "os.system calls are not allowed",
    ],
    [
      /\bos\.popen\s*\(/,
      "os.popen calls are not allowed",
    ],
    [
      /\beval\s*\(/,
      "eval calls are not allowed",
    ],
    [
      /\bexec\s*\(/,
      "exec calls are not allowed",
    ],
    [
      /\b__import__\s*\(/,
      "dynamic imports are not allowed",
    ],
  ];

function validateScript(
  code: string,
) {
  if (!code.trim()) {
    throw new Error(
      "The Blender Python editor is empty.",
    );
  }
  if (
    code.length >
    MAX_SCRIPT_CHARS
  ) {
    throw new Error(
      `Script exceeds ${MAX_SCRIPT_CHARS} characters.`,
    );
  }
  if (
    !/\bimport\s+bpy\b/.test(
      code,
    )
  ) {
    throw new Error(
      "The script must import bpy.",
    );
  }

  for (const [
    pattern,
    message,
  ] of FORBIDDEN_PATTERNS) {
    if (
      pattern.test(code)
    ) {
      throw new Error(
        message,
      );
    }
  }
}

function safeAssetName(
  value: string,
) {
  return (
    value
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "_",
      )
      .replace(
        /^_+|_+$/g,
        "",
      )
      .slice(0, 64) ||
    "generated_asset"
  );
}

function terminateProcessTree(
  child:
    ReturnType<
      typeof spawn
    >,
) {
  return new Promise<void>(
    (resolve) => {
      if (!child.pid) {
        resolve();
        return;
      }

      if (
        process.platform !==
        "win32"
      ) {
        child.kill(
          "SIGKILL",
        );
        resolve();
        return;
      }

      const killer =
        spawn(
          "taskkill",
          [
            "/PID",
            String(
              child.pid,
            ),
            "/T",
            "/F",
          ],
          {
            windowsHide:
              true,
            stdio: "ignore",
          },
        );
      killer.on(
        "error",
        () => {
          child.kill();
          resolve();
        },
      );
      killer.on(
        "close",
        () =>
          resolve(),
      );
    },
  );
}

function runBlender(
  executable: string,
  scriptPath: string,
  env:
    NodeJS.ProcessEnv,
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    elapsedMs: number;
  }>(
    (
      resolve,
      reject,
    ) => {
      const started =
        Date.now();
      const child =
        spawn(
          executable,
          [
            "--background",
            "--factory-startup",
            "--python-exit-code",
            "1",
            "--python",
            scriptPath,
          ],
          {
            cwd:
              process.cwd(),
            windowsHide:
              true,
            env,
            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          },
        );

      let stdout = "";
      let stderr = "";
      let settled = false;

      child.stdout.on(
        "data",
        (chunk) => {
          stdout +=
            chunk.toString();
        },
      );
      child.stderr.on(
        "data",
        (chunk) => {
          stderr +=
            chunk.toString();
        },
      );

      const timeout =
        setTimeout(
          () => {
            if (settled) {
              return;
            }
            settled = true;
            void terminateProcessTree(
              child,
            ).finally(() => {
              reject(
                new Error(
                  "Blender execution exceeded 240 seconds.",
                ),
              );
            });
          },
          TIMEOUT_MS,
        );

      child.on(
        "error",
        (error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(
            timeout,
          );
          reject(error);
        },
      );

      child.on(
        "close",
        (exitCode) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(
            timeout,
          );
          resolve({
            stdout,
            stderr,
            exitCode:
              exitCode ??
              -1,
            elapsedMs:
              Date.now() -
              started,
          });
        },
      );
    },
  );
}

async function exists(
  filePath: string,
) {
  const traceSafeFilePath =
    filePath;
  try {
    await access(
      /* turbopackIgnore: true */
      traceSafeFilePath,
    );
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<
  T
>(
  filePath: string,
): Promise<T | null> {
  if (
    !(
      await exists(
        filePath,
      )
    )
  ) {
    return null;
  }
  try {
    const traceSafeFilePath =
      filePath;
    return JSON.parse(
      await readFile(
        /* turbopackIgnore: true */
        traceSafeFilePath,
        "utf8",
      ),
    ) as T;
  } catch {
    return null;
  }
}

type FooterValidationReport = {
  mesh_count?: number;
  material_slot_count?: number;
  triangle_count?: number;
  object_names?: string[];
  uv_missing_object_names?: string[];
  zero_scale_object_names?: string[];
  negative_scale_object_names?: string[];
  bounds_min?: number[];
  bounds_max?: number[];
  dimensions?: number[];
  ground_offset?: number;
  topology_totals?: {
    non_manifold_edges?: number;
    loose_edges?: number;
    loose_vertices?: number;
    degenerate_faces?: number;
  };
  objects?: unknown[];
};

type FooterQualityReport = {
  score?: number;
  grade?: string;
  asset_class?: string;
  findings?: Array<{
    severity?: string;
    code?: string;
    message?: string;
  }>;
  benchmark_checks?: Record<
    string,
    unknown
  >;
};

async function inspectGlb(
  filePath: string,
) {
  const traceSafeFilePath =
    filePath;
  const bytes =
    await readFile(
      /* turbopackIgnore: true */
      traceSafeFilePath,
    );
  const errors:
    string[] = [];
  const warnings:
    string[] = [];

  if (
    bytes.length <
    20
  ) {
    errors.push(
      "GLB is too small to contain a valid header and JSON chunk.",
    );
    return {
      valid: false,
      errors,
      warnings,
      version: null,
      declared_length:
        null,
      actual_length:
        bytes.length,
      mesh_count: 0,
      material_count:
        0,
      animation_count:
        0,
      node_names:
        [] as string[],
      primitive_count:
        0,
      primitives_missing_uvs:
        0,
    };
  }

  const magic =
    bytes.readUInt32LE(
      0,
    );
  const version =
    bytes.readUInt32LE(
      4,
    );
  const declaredLength =
    bytes.readUInt32LE(
      8,
    );

  if (
    magic !==
    0x46546c67
  ) {
    errors.push(
      "GLB magic header is invalid.",
    );
  }
  if (version !== 2) {
    errors.push(
      `Expected GLB 2.0 but found version ${version}.`,
    );
  }
  if (
    declaredLength !==
    bytes.length
  ) {
    errors.push(
      `GLB declared length ${declaredLength} does not match actual length ${bytes.length}.`,
    );
  }

  const jsonLength =
    bytes.readUInt32LE(
      12,
    );
  const jsonType =
    bytes.readUInt32LE(
      16,
    );
  if (
    jsonType !==
    0x4e4f534a
  ) {
    errors.push(
      "The first GLB chunk is not JSON.",
    );
  }
  if (
    20 + jsonLength >
    bytes.length
  ) {
    errors.push(
      "The GLB JSON chunk exceeds the file length.",
    );
  }

  let gltf:
    Record<
      string,
      unknown
    > = {};
  if (!errors.length) {
    try {
      gltf =
        JSON.parse(
          bytes
            .subarray(
              20,
              20 +
                jsonLength,
            )
            .toString(
              "utf8",
            )
            .trim(),
        ) as Record<
          string,
          unknown
        >;
    } catch (error) {
      errors.push(
        `GLB JSON could not be parsed: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  const nodes =
    Array.isArray(
      gltf.nodes,
    )
      ? gltf.nodes
      : [];
  const meshes =
    Array.isArray(
      gltf.meshes,
    )
      ? gltf.meshes
      : [];
  let primitiveCount =
    0;
  let primitivesMissingUvs =
    0;

  for (const rawMesh of
    meshes) {
    const mesh =
      rawMesh &&
      typeof rawMesh ===
        "object"
        ? rawMesh as
            Record<
              string,
              unknown
            >
        : {};
    const primitives =
      Array.isArray(
        mesh.primitives,
      )
        ? mesh.primitives
        : [];
    primitiveCount +=
      primitives.length;
    for (const rawPrimitive of
      primitives) {
      const primitive =
        rawPrimitive &&
        typeof rawPrimitive ===
          "object"
          ? rawPrimitive as
              Record<
                string,
                unknown
              >
          : {};
      const attributes =
        primitive.attributes &&
        typeof primitive.attributes ===
          "object"
          ? primitive.attributes as
              Record<
                string,
                unknown
              >
          : {};
      if (
        attributes.TEXCOORD_0 ==
        null
      ) {
        primitivesMissingUvs +=
          1;
      }
    }
  }

  if (!meshes.length) {
    errors.push(
      "The exported GLB contains no meshes.",
    );
  }

  return {
    valid:
      errors.length ===
      0,
    errors,
    warnings,
    version,
    declared_length:
      declaredLength,
    actual_length:
      bytes.length,
    mesh_count:
      meshes.length,
    material_count:
      Array.isArray(
        gltf.materials,
      )
        ? gltf.materials
            .length
        : 0,
    animation_count:
      Array.isArray(
        gltf.animations,
      )
        ? gltf.animations
            .length
        : 0,
    node_names:
      nodes
        .map((node) =>
          node &&
          typeof node ===
            "object" &&
          typeof (
            node as Record<
              string,
              unknown
            >
          ).name ===
            "string"
            ? String(
                (
                  node as Record<
                    string,
                    unknown
                  >
                ).name,
              )
            : "",
        )
        .filter(Boolean),
    primitive_count:
      primitiveCount,
    primitives_missing_uvs:
      primitivesMissingUvs,
  };
}

function validateBuildAgainstSpec(
  spec:
    ProceduralAssetSpecV1,
  enforceRequiredParts:
    boolean,
  footer:
    | FooterValidationReport
    | null,
  glb:
    Awaited<
      ReturnType<
        typeof inspectGlb
      >
    >,
) {
  const errors = [
    ...glb.errors,
  ];
  const warnings = [
    ...glb.warnings,
  ];
  const exportedObjectNames =
    footer?.object_names ??
    glb.node_names;
  const semanticObjectNames =
    new Set(
      exportedObjectNames
        .map(
          normalizeSemanticPartName,
        )
        .filter(Boolean),
    );

  for (const part of
    spec.parts) {
    if (
      enforceRequiredParts &&
      part.required &&
      !semanticObjectNames.has(
        normalizeSemanticPartName(
          part.part_id,
        ),
      )
    ) {
      errors.push(
        `Required part ${part.part_id} was not found in the exported object names.`,
      );
    }
  }

  const triangleCount =
    footer?.triangle_count ??
    0;
  if (
    triangleCount >
    spec.max_triangles
  ) {
    errors.push(
      `Triangle count ${triangleCount} exceeds the requested budget ${spec.max_triangles}.`,
    );
  }

  if (
    footer
      ?.zero_scale_object_names
      ?.length
  ) {
    errors.push(
      `Zero-scale objects were detected: ${footer.zero_scale_object_names.join(", ")}.`,
    );
  }

  if (
    footer
      ?.negative_scale_object_names
      ?.length
  ) {
    warnings.push(
      `Negative object transforms were detected: ${footer.negative_scale_object_names.join(", ")}.`,
    );
  }

  if (
    spec.requirements
      .uv_required &&
    glb
      .primitives_missing_uvs >
      0
  ) {
    warnings.push(
      `${glb.primitives_missing_uvs} exported primitive(s) do not contain TEXCOORD_0 UV data.`,
    );
  }

  if (
    spec.requirements
      .ground_contact_required &&
    typeof footer
      ?.ground_offset ===
      "number" &&
    Math.abs(
      footer.ground_offset,
    ) > 0.05
  ) {
    warnings.push(
      `The lowest point is ${footer.ground_offset.toFixed(3)} m from Z=0.`,
    );
  }

  const nonManifold =
    footer?.topology_totals
      ?.non_manifold_edges ??
    0;
  const degenerate =
    footer?.topology_totals
      ?.degenerate_faces ??
    0;
  if (nonManifold > 0) {
    warnings.push(
      `${nonManifold} non-manifold edge(s) were detected.`,
    );
  }
  if (degenerate > 0) {
    warnings.push(
      `${degenerate} degenerate face(s) were detected.`,
    );
  }

  const dimensions =
    footer?.dimensions ??
    [];
  const measuredExtent =
    dimensions.length
      ? Math.max(
          ...dimensions.map(
            (value) =>
              Math.abs(
                value,
              ),
          ),
        )
      : null;
  if (
    measuredExtent &&
    (
      measuredExtent >
        spec
          .target_extent_m *
          4 ||
      measuredExtent <
        spec
          .target_extent_m *
          0.2
    )
  ) {
    warnings.push(
      `Measured extent ${measuredExtent.toFixed(3)} m is far from the requested ${spec.target_extent_m.toFixed(3)} m target.`,
    );
  }

  const requiredParts =
    spec.parts.filter(
      (part) =>
        part.required,
    );
  const matchedParts =
    requiredParts.filter(
      (part) =>
        semanticObjectNames.has(
          normalizeSemanticPartName(
            part.part_id,
          ),
        ),
    );

  return {
    valid:
      errors.length ===
      0,
    errors,
    warnings,
    footer,
    glb,
    required_part_count:
      enforceRequiredParts
        ? requiredParts.length
        : 0,
    matched_required_part_count:
      enforceRequiredParts
        ? matchedParts.length
        : 0,
  };
}

export async function executeBlenderPython(
  input: {
    code: string;
    assetName: string;
    assetSpec?: unknown;
    designBrief?: unknown;
    resourcePlan?: unknown;
    lookAdjustments?: unknown;
    parentJobId?: string | null;
    revisionNumber?: number | null;
    revisionLabel?: string | null;
    critique?: string | null;
  },
) {
  validateScript(
    input.code,
  );
  const hasExplicitDesign =
    Boolean(
      input.designBrief &&
      typeof input
        .designBrief ===
        "object",
    );
  const hasExplicitAssetSpec =
    Boolean(
      input.assetSpec &&
      typeof input
        .assetSpec ===
        "object",
    );
  const designBrief:
    AssetDesignBriefV2 =
    normalizeAssetDesignBrief(
      input.designBrief,
      {
        concept:
          input.assetName,
        target_extent_m:
          2,
        max_triangles:
          30_000,
        quality_mode:
          "standard",
        style:
          "manual code",
        animation_ready:
          true,
      },
    );
  const designValidation =
    validateAssetDesignBrief(
      designBrief,
    );
  if (
    !designValidation.valid
  ) {
    throw new Error(
      `Asset design brief is invalid: ${designValidation.errors.join("; ")}`,
    );
  }

  const preflight =
    validateBlenderPythonPreflight(
      input.code,
      {
        designBrief,
        enforceDesignBrief:
          hasExplicitDesign,
      },
    );
  if (!preflight.valid) {
    throw new Error(
      formatBlenderPythonPreflightFailure(
        preflight,
      ),
    );
  }

  const resourcePlan =
    normalizeFoundryResourcePlan(
      input.resourcePlan,
      designBrief,
    );
  let resourceManifest:
    Awaited<
      ReturnType<
        typeof hydrateFoundryResourcesForBlender
      >
    >;
  try {
    resourceManifest =
      await hydrateFoundryResourcesForBlender(
        designBrief,
        resourcePlan,
        input.lookAdjustments,
      );
  } catch (caught) {
    const message =
      caught instanceof Error
        ? caught.message
        : String(caught);
    const diagnostics:
      FoundryExecutionDiagnostics = {
        schema_version:
          FOUNDRY_EXECUTION_DIAGNOSTICS_SCHEMA_VERSION,
        phase:
          "resource_hydration",
        failure_source:
          "trusted_resource_layer",
        message,
        generated_line:
          null,
        editor_line:
          null,
        excerpt:
          null,
        runtime:
          null,
        compile_smoke:
          null,
      };
    throw new FoundryBlenderExecutionError(
      diagnosticMessage(
        diagnostics,
      ),
      diagnostics,
    );
  }

  try {
  const assetSpec =
    normalizeProceduralAssetSpec(
      input.assetSpec ??
      designBriefToProceduralSpec(
        designBrief,
      ),
      {
        concept:
          designBrief.concept,
        target_extent_m:
          designBrief
            .target_extent_m,
        max_triangles:
          designBrief
            .max_triangles,
        animation_ready:
          designBrief
            .requirements
            .animation_ready,
      },
    );
  const specValidation =
    validateProceduralAssetSpec(
      assetSpec,
    );
  if (
    !specValidation.valid
  ) {
    throw new Error(
      `Procedural asset specification is invalid: ${specValidation.errors.join("; ")}`,
    );
  }

  const jobId =
    randomUUID();
  const assetName =
    safeAssetName(
      input.assetName,
    );
  const privateDir =
    runtimeChild(
      FOUNDRY_PRIVATE_JOB_ROOT,
      jobId,
    );
  const publicRelative = [
    "sandbox-assets",
    "myway",
    "blender-python-builder",
    jobId,
  ];
  const publicDir =
    runtimeChild(
      FOUNDRY_PUBLIC_JOB_ROOT,
      jobId,
    );

  // Foundry execution output is temporary review state, not durable storage.
  // Before creating a new workspace, keep room for this run and remove stale
  // or overflow workspaces. Saved candidates remain durable through R2.
  await pruneFoundryExecutionWorkspaces({
    privateRoot:
      FOUNDRY_PRIVATE_JOB_ROOT,
    publicRoot:
      FOUNDRY_PUBLIC_JOB_ROOT,
    reserveSlots:
      1,
  });

  await Promise.all([
    ensureRuntimeDirectory(
      privateDir,
    ),
    ensureRuntimeDirectory(
      publicDir,
    ),
  ]);

  const scriptPath =
    runtimeChild(
      privateDir,
      "build_asset.py",
    );
  const sourceCodePath =
    runtimeChild(
      privateDir,
      "source_code.py",
    );
  const briefPath =
    runtimeChild(
      privateDir,
      "design-brief.json",
    );
  const resourcePlanPath =
    runtimeChild(
      privateDir,
      "resource-plan.json",
    );
  const resourceManifestPath =
    runtimeChild(
      privateDir,
      "resource-manifest.json",
    );
  const lookAdjustmentsPath =
    runtimeChild(
      privateDir,
      "look-adjustments.json",
    );
  const complete =
    buildCompleteScript(
      input.code,
    );
  const completeScript =
    complete.script;
  const smokeScriptPath =
    runtimeChild(
      privateDir,
      "compile_smoke.py",
    );

  await Promise.all([
    writeRuntimeText(
      scriptPath,
      completeScript,
      "utf8",
    ),
    writeRuntimeText(
      sourceCodePath,
      input.code,
      "utf8",
    ),
    writeRuntimeText(
      briefPath,
      JSON.stringify(
        designBrief,
        null,
        2,
      ) + "\n",
      "utf8",
    ),
    writeRuntimeText(
      resourcePlanPath,
      JSON.stringify(
        resourcePlan,
        null,
        2,
      ) + "\n",
      "utf8",
    ),
    writeRuntimeText(
      resourceManifestPath,
      JSON.stringify(
        resourceManifest,
        null,
        2,
      ) + "\n",
      "utf8",
    ),
    writeRuntimeText(
      lookAdjustmentsPath,
      JSON.stringify(
        resourceManifest
          .look_adjustments,
        null,
        2,
      ) + "\n",
      "utf8",
    ),
    writeRuntimeText(
      smokeScriptPath,
      buildCompileSmokeScript(
        sourceCodePath,
        scriptPath,
      ),
      "utf8",
    ),
    writeRuntimeText(
      runtimeChild(
        privateDir,
        "request.json",
      ),
      JSON.stringify(
        {
          job_id:
            jobId,
          asset_name:
            assetName,
          parent_job_id:
            input
              .parentJobId ??
            null,
          revision_number:
            input
              .revisionNumber ??
            1,
          revision_label:
            input
              .revisionLabel ??
            null,
          critique:
            input
              .critique ??
            null,
          asset_spec:
            assetSpec,
          asset_spec_validation:
            specValidation,
          design_brief:
            designBrief,
          design_brief_validation:
            designValidation,
          resource_plan:
            resourcePlan,
          resource_manifest:
            publicResourceManifest(
              resourceManifest,
            ),
          look_adjustments:
            resourceManifest
              .look_adjustments,
          helper_library_version:
            FOUNDRY_HELPER_LIBRARY_VERSION,
          inspection_footer_version:
            FOUNDRY_INSPECTION_FOOTER_VERSION,
          created_at:
            new Date()
              .toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    ),
  ]);

  const blender =
    await resolveBlenderExecutable();
  const runtime =
    await resolveFoundryBlenderRuntime();
  const compileSmoke =
    await runFoundryCompileSmoke({
      executable:
        blender,
      smokeScriptPath,
      runtime,
    });
  await writeRuntimeText(
    runtimeChild(
      privateDir,
      "compile-smoke.json",
    ),
    JSON.stringify(
      compileSmoke,
      null,
      2,
    ) + "\n",
    "utf8",
  );
  if (!compileSmoke.valid) {
    const assembledLine =
      compileSmoke.stage ===
        "assembled_script"
        ? compileSmoke.line
        : null;
    const assembledSourceLine =
      assembledLine != null &&
      assembledLine >=
        complete.line_map
          .source_start_line &&
      assembledLine <=
        complete.line_map
          .source_end_line
        ? assembledLine -
          complete.line_map
            .source_start_line +
          1
        : null;
    const editorLine =
      compileSmoke.stage ===
        "model_source"
        ? compileSmoke.line
        : assembledSourceLine;
    const failureSource:
      FoundryExecutionDiagnostics[
        "failure_source"
      ] =
      compileSmoke.stage ===
        "model_source" ||
      assembledSourceLine != null
        ? "model_code"
        : assembledLine != null &&
            assembledLine >=
              complete.line_map
                .footer_start_line
          ? "trusted_footer"
          : "trusted_helper";
    const diagnostics:
      FoundryExecutionDiagnostics = {
        schema_version:
          FOUNDRY_EXECUTION_DIAGNOSTICS_SCHEMA_VERSION,
        phase:
          "compile_smoke",
        failure_source:
          failureSource,
        message:
          compileSmoke.message,
        generated_line:
          assembledLine,
        editor_line:
          editorLine,
        excerpt:
          sourceExcerpt(
            input.code,
            editorLine,
          ),
        runtime,
        compile_smoke:
          compileSmoke,
      };
    throw new FoundryBlenderExecutionError(
      diagnosticMessage(
        diagnostics,
      ),
      diagnostics,
    );
  }

  const result =
    await runBlender(
      blender,
      scriptPath,
      {
        ...process.env,
        MYWAY_BLENDER_OUTPUT_DIR:
          publicDir,
        MYWAY_BLENDER_ASSET_NAME:
          assetName,
        MYWAY_BLENDER_RESOURCE_MANIFEST:
          resourceManifestPath,
        MYWAY_BLENDER_DESIGN_BRIEF:
          briefPath,
      },
    );

  await Promise.all([
    writeRuntimeText(
      runtimeChild(
        privateDir,
        "stdout.log",
      ),
      result.stdout,
      "utf8",
    ),
    writeRuntimeText(
      runtimeChild(
        privateDir,
        "stderr.log",
      ),
      result.stderr,
      "utf8",
    ),
  ]);

  const glbPath =
    runtimeChild(
      publicDir,
      `${assetName}.glb`,
    );
  const blendPath =
    runtimeChild(
      publicDir,
      `${assetName}.blend`,
    );

  if (
    result.exitCode !==
    0
  ) {
    const rawMessage = [
      `Blender exited with code ${result.exitCode}.`,
      result.stderr
        .trim(),
      result.stdout
        .trim()
        .slice(-7000),
    ]
      .filter(Boolean)
      .join("\n");
    const diagnostics =
      runtimeDiagnostics({
        message:
          rawMessage,
        output:
          `${result.stderr}\n${result.stdout}`,
        scriptPath,
        sourceCode:
          input.code,
        lineMap:
          complete.line_map,
        runtime,
        compileSmoke,
      });
    throw new FoundryBlenderExecutionError(
      diagnosticMessage(
        diagnostics,
      ),
      diagnostics,
    );
  }

  if (
    !(
      await exists(
        glbPath,
      )
    )
  ) {
    const diagnostics:
      FoundryExecutionDiagnostics = {
        schema_version:
          FOUNDRY_EXECUTION_DIAGNOSTICS_SCHEMA_VERSION,
        phase:
          "output_verification",
        failure_source:
          "trusted_footer",
        message:
          "Blender exited successfully but the expected GLB was not created.",
        generated_line:
          null,
        editor_line:
          null,
        excerpt:
          null,
        runtime,
        compile_smoke:
          compileSmoke,
      };
    throw new FoundryBlenderExecutionError(
      diagnosticMessage(
        diagnostics,
      ),
      diagnostics,
    );
  }

  const glbStats =
    await runtimeStat(
      glbPath,
    );
  const validationPath =
    runtimeChild(
      publicDir,
      "validation.json",
    );
  const qualityPath =
    runtimeChild(
      publicDir,
      "quality.json",
    );
  const footerValidation =
    await readJsonFile<
      FooterValidationReport
    >(
      validationPath,
    );
  const qualityReport =
    await readJsonFile<
      FooterQualityReport
    >(
      qualityPath,
    );
  const glbInspection =
    await inspectGlb(
      glbPath,
    );
  const buildValidation =
    validateBuildAgainstSpec(
      assetSpec,
      hasExplicitAssetSpec ||
        hasExplicitDesign,
      footerValidation,
      glbInspection,
    );

  const inspectionNames = [
    "preview.png",
    "preview_front.png",
    "preview_right.png",
    "preview_back.png",
    "preview_left.png",
    "preview_top.png",
    "preview_clay.png",
    "preview_material_id.png",
    "preview_normals.png",
    "preview_wireframe.png",
    "preview_dimensions.png",
  ];
  const inspectionUrls =
    (
      await Promise.all(
        inspectionNames.map(
          async (name) => ({
            name,
            exists:
              await exists(
                runtimeChild(
                  publicDir,
                  name,
                ),
              ),
          }),
        ),
      )
    )
      .filter(
        (entry) =>
          entry.exists,
      )
      .map(
        (entry) =>
          `/${publicRelative.join("/")}/${entry.name}`,
      );

  const manifest = {
    schema_version:
      "myway_blender_foundry_job_v2",
    job_id:
      jobId,
    asset_name:
      assetName,
    status:
      buildValidation.valid &&
      (
        qualityReport?.score ??
        0
      ) >= 78
        ? "technical_ready"
        : "review_required",
    technical_status:
      buildValidation.valid &&
      (
        qualityReport?.score ??
        0
      ) >= 78
        ? "passed"
        : "needs_revision",
    release_status:
      "visual_and_human_review_required",
    parent_job_id:
      input.parentJobId ??
      null,
    revision_number:
      input.revisionNumber ??
      1,
    revision_label:
      input.revisionLabel ??
      null,
    critique:
      input.critique ??
      null,
    glb_url:
      `/${publicRelative.join("/")}/${assetName}.glb`,
    blend_url:
      (
        await exists(
          blendPath,
        )
      )
        ? `/${publicRelative.join("/")}/${assetName}.blend`
        : null,
    preview_url:
      inspectionUrls.find(
        (url) =>
          url.endsWith(
            "/preview.png",
          ),
      ) ?? null,
    inspection_urls:
      inspectionUrls,
    validation_url:
      footerValidation
        ? `/${publicRelative.join("/")}/validation.json`
        : null,
    quality_url:
      qualityReport
        ? `/${publicRelative.join("/")}/quality.json`
        : null,
    asset_spec:
      assetSpec,
    asset_spec_validation:
      specValidation,
    design_brief:
      designBrief,
    design_brief_validation:
      designValidation,
    resource_plan:
      resourcePlan,
    resource_manifest:
      publicResourceManifest(
        resourceManifest,
      ),
    look_adjustments:
      resourceManifest
        .look_adjustments,
    build_validation:
      buildValidation,
    quality_report:
      qualityReport,
    helper_library_version:
      FOUNDRY_HELPER_LIBRARY_VERSION,
    inspection_footer_version:
      FOUNDRY_INSPECTION_FOOTER_VERSION,
    blender_runtime:
      runtime,
    compile_smoke:
      compileSmoke,
    glb_bytes:
      glbStats.size,
    elapsed_ms:
      result.elapsedMs,
    completed_at:
      new Date()
        .toISOString(),
  };

  await writeRuntimeText(
    runtimeChild(
      publicDir,
      "manifest.json",
    ),
    JSON.stringify(
      manifest,
      null,
      2,
    ) + "\n",
    "utf8",
  );

    return {
      ...manifest,
      stdout:
        result.stdout,
      stderr:
        result.stderr,
    };
  }
  finally {
    await cleanupFoundryResourceHydration(
      resourceManifest,
    ).catch(
      (caught) => {
        console.warn(
          "Foundry ambientCG hydration cleanup warning:",
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      },
    );
  }
}
