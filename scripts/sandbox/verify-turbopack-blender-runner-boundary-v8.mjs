import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const runnerPath =
  "sandbox/probe-lab/blender-python-builder/blender-python-runner.server.ts";

const source = await readFile(runnerPath, "utf8");

assert.ok(
  !source.includes("projectPath("),
  "Runner must not use generic projectPath().",
);
assert.equal(
  (source.match(/path\.join\(/g) ?? []).length,
  2,
  "Runner must retain exactly two path.join() calls for the fixed private/public roots.",
);
assert.ok(
  source.includes("FOUNDRY_PRIVATE_JOB_ROOT") &&
    source.includes("FOUNDRY_PUBLIC_JOB_ROOT"),
  "Runner must define fixed private/public Foundry roots.",
);
assert.ok(
  source.includes("runtimeChild(") &&
    source.includes("ensureRuntimeDirectory(") &&
    source.includes("writeRuntimeText(") &&
    source.includes("runtimeStat("),
  "Runner must use opaque runtime descendants and centralized filesystem helpers.",
);
assert.ok(
  source.includes("/* turbopackIgnore: true */"),
  "Runner must retain Turbopack ignore boundaries on runtime filesystem access.",
);
for (const name of [
  "build_asset.py",
  "source_code.py",
  "design-brief.json",
  "resource-plan.json",
  "resource-manifest.json",
  "look-adjustments.json",
  "compile_smoke.py",
  "request.json",
  "compile-smoke.json",
  "stdout.log",
  "stderr.log",
  "validation.json",
  "quality.json",
  "manifest.json",
]) {
  assert.ok(source.includes(name), `Runner must preserve ${name}.`);
}
assert.ok(
  source.includes("MYWAY_BLENDER_OUTPUT_DIR") &&
    source.includes("MYWAY_BLENDER_RESOURCE_MANIFEST") &&
    source.includes("MYWAY_BLENDER_DESIGN_BRIEF"),
  "Runner must preserve Blender runtime environment wiring.",
);
console.log(
  "Blender runner Turbopack boundary v8 source verification passed: two fixed roots, opaque runtime descendants, and trace-safe filesystem helpers are in place.",
);
