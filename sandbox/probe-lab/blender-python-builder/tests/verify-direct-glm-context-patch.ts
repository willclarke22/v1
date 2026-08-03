import assert from "node:assert/strict";
import {
  access,
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";

import {
  buildCompileSmokeScript,
} from "../blender-runtime.server";
import {
  buildDirectGlmContextPackage,
  publicDirectGlmContextSummary,
} from "../direct-glm-context.server";
import {
  NATIVE_VINTAGE_CAMERA_PROOF_BRIEF,
  NATIVE_VINTAGE_CAMERA_PROOF_CODE,
} from "../native-vintage-camera-proof";

async function main() {
  const runtime = {
    schema_version:
      "myway_blender_runtime_v1" as const,
    blender_version:
      "5.1.2",
    blender_version_tuple: [
      5,
      1,
      2,
    ],
    python_version:
      "3.11.9",
    executable_name:
      "blender.exe",
    execution_mode:
      "background_factory_startup" as const,
  };
  const context =
    buildDirectGlmContextPackage({
      brief:
        NATIVE_VINTAGE_CAMERA_PROOF_BRIEF,
      resourcePlan:
        null,
      runtime,
    });

  assert.equal(
    context.modelling_strategy,
    "native_bpy_primary",
  );
  assert.equal(
    context.runtime.blender_version,
    "5.1.2",
  );
  assert.equal(
    context.reference_example.id,
    "native_vintage_camera",
  );
  assert.equal(
    context.reference_example.code,
    NATIVE_VINTAGE_CAMERA_PROOF_CODE,
  );
  assert.ok(
    context.reference_example.code.includes(
      "# Native bpy geometry proof.",
    ),
  );
  assert.ok(
    context.model_boundary.excluded_context.includes(
      "procedural asset specification",
    ),
  );
  assert.ok(
    context.model_boundary.excluded_context.includes(
      "wheelchair reference",
    ),
  );
  const summary =
    publicDirectGlmContextSummary(
      context,
    );
  assert.equal(
    summary.reference_example.id,
    "native_vintage_camera",
  );
  assert.equal(
    "code" in summary.reference_example,
    false,
    "The browser summary must not repeat the full camera source.",
  );

  const smoke =
    buildCompileSmokeScript(
      "C:/tmp/source_code.py",
      "C:/tmp/build_asset.py",
    );
  assert.match(
    smoke,
    /check\("model_source"/,
  );
  assert.match(
    smoke,
    /check\("assembled_script"/,
  );
  assert.match(
    smoke,
    /compile\(source, target, "exec"\)/,
  );

  const root =
    process.cwd();
  const generation =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/glm-blender-python.server.ts",
      ),
      "utf8",
    );
  assert.match(
    generation,
    /native bpy, bmesh and mathutils as the primary modelling language/,
  );
  assert.match(
    generation,
    /contextPackage\.reference_example\.code/,
  );
  assert.doesNotMatch(
    generation,
    /Compatible procedural specification:/,
  );
  assert.doesNotMatch(
    generation,
    /NATIVE_WHEELCHAIR/,
  );

  const runner =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/blender-python-runner.server.ts",
      ),
      "utf8",
    );
  for (const term of [
    "runFoundryCompileSmoke",
    "source_start_line",
    "editor_line",
    '"model_code"',
    "trusted_resource_layer",
  ]) {
    assert.ok(
      runner.includes(term),
      `Runner must include ${term}`,
    );
  }

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
    /GLM context package/,
  );
  assert.match(
    ui,
    /camera example only/,
  );
  assert.doesNotMatch(
    ui,
    /Load native wheelchair proof/,
  );

  for (const removed of [
    "sandbox/probe-lab/blender-python-builder/native-wheelchair-proof.ts",
    "sandbox/probe-lab/blender-python-builder/routes/native-wheelchair-proof.ts",
    "sandbox/probe-lab/blender-python-builder/tests/verify-native-wheelchair-proof.ts",
    "sandbox/probe-lab/blender-python-builder/examples/native-stylized-wheelchair-proof.py",
    "app/api/sandbox/probe-lab/blender-python-builder/native-wheelchair-proof/route.ts",
  ]) {
    await assert.rejects(
      access(
        resolve(
          root,
          removed,
        ),
      ),
      undefined,
      `${removed} should be removed by Patch 1.`,
    );
  }

  console.log(
    "Direct GLM camera-context and compile-smoke fixture passed.",
  );
}

void main();
