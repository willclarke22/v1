import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeSemanticPartName } from "../semantic-name";

async function read(relativePath: string) {
  return readFile(resolve(process.cwd(), relativePath), "utf8");
}

async function main() {
  assert.equal(normalizeSemanticPartName("CameraBody"), "camerabody");
  assert.equal(normalizeSemanticPartName("camera_body"), "camerabody");
  assert.equal(normalizeSemanticPartName("camera-body"), "camerabody");
  assert.equal(normalizeSemanticPartName(" CAMERA BODY "), "camerabody");
  assert.equal(normalizeSemanticPartName("LensBarrelOuter.001"), "lensbarrelouter001");

  const runner = await read(
    "sandbox/probe-lab/blender-python-builder/blender-python-runner.server.ts",
  );
  assert.match(runner, /normalizeSemanticPartName/);
  assert.match(runner, /semanticObjectNames/);
  assert.doesNotMatch(
    runner,
    /!objectNames\.has\(\s*part\.part_id/,
  );

  const footer = await read(
    "sandbox/probe-lab/blender-python-builder/blender-inspection-footer.ts",
  );
  assert.match(footer, /myway_blender_foundry_inspection_v3/);
  assert.match(footer, /def _myway_semantic_name/);
  assert.match(footer, /_myway_object_semantic_names/);
  assert.match(footer, /extent = max\(dimensions \+ \[0\.001\]\)/);
  assert.match(footer, /_myway_radius/);
  assert.match(footer, /view_direction\.normalize\(\)/);
  assert.doesNotMatch(footer, /max\(dimensions \+ \[0\.5\]\)/);

  const ui = await read(
    "sandbox/probe-lab/blender-python-builder/ui/blender-python-builder-lab.tsx",
  );
  assert.match(ui, /Load native camera proof/);
  assert.match(ui, /Preparation mutates the reviewed R2 registry/);
  assert.match(ui, /cache: "no-store"/);
  assert.match(ui, /attempt < 3/);
  assert.match(ui, /setResourcePlan\(\s*refreshedPlan/);

  console.log(
    "Foundry semantic normalization, adaptive framing, and post-prepare refresh fixture passed.",
  );
}

void main();
