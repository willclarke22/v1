import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildFoundryHelperContractPrompt,
} from "../blender-helper-contract";
import {
  buildTrustedBlenderHelperPrelude,
} from "../blender-helper-library";

async function main() {
  const prelude =
    buildTrustedBlenderHelperPrelude();

  assert.match(
    prelude,
    /def _myway_collect_object_targets\(value=None\):/,
    "The helper prelude must normalize single objects and iterables through one compatibility boundary.",
  );
  assert.match(
    prelude,
    /elif isinstance\(value, bpy\.types\.Object\):\s+seeds = \[value\]/,
    "A single bpy Object must be wrapped rather than treated as an iterable.",
  );
  assert.match(
    prelude,
    /def myway_ground_asset\(objects=None\):/,
    "Grounding must retain the public helper name.",
  );
  assert.match(
    prelude,
    /def myway_normalize_extent\(\*args, \*\*kwargs\):/,
    "Extent normalization must accept the legacy object-first and canonical extent-first call orders.",
  );
  assert.match(
    prelude,
    /Canonical: myway_normalize_extent\(2\.0, root\)/,
    "The helper must document the canonical extent-first call.",
  );
  assert.doesNotMatch(
    prelude,
    /targets = objects or \[obj for obj in bpy\.context\.scene\.objects/,
    "The old implementation incorrectly iterated a single Blender Object.",
  );

  const helperContractPrompt =
    buildFoundryHelperContractPrompt();

  assert.match(
    helperContractPrompt,
    /myway_ground_asset\(objects=None\)/,
    "The rendered GLM contract must expose the real grounding signature.",
  );
  assert.match(
    helperContractPrompt,
    /myway_normalize_extent\(target_extent, root_or_iterable\)/,
    "The rendered GLM contract must expose the canonical extent-first normalization signature.",
  );
  assert.match(
    helperContractPrompt,
    /A single bpy Object is accepted directly/,
    "The rendered GLM contract must tell the model not to iterate a Blender Object.",
  );
  assert.match(
    helperContractPrompt,
    /myway_ground_asset\(frame\)/,
    "The rendered GLM contract must include a single-root grounding example.",
  );
  assert.match(
    helperContractPrompt,
    /myway_normalize_extent\(1\.12, frame\)/,
    "The rendered GLM contract must include an extent-first normalization example.",
  );

  const generatorSource =
    await readFile(
      "sandbox/probe-lab/blender-python-builder/glm-blender-python.server.ts",
      "utf8",
    );

  assert.match(
    generatorSource,
    /const DIRECT_MYWAY_BOUNDARY/,
    "The direct GLM generator must expose a compact resource and lifecycle boundary.",
  );
  assert.match(
    generatorSource,
    /native bpy, bmesh and mathutils as the primary modelling language/,
    "The direct GLM generator must prefer native Blender modelling over helper-authored geometry.",
  );
  assert.doesNotMatch(
    generatorSource,
    /const HELPER_CAPABILITIES\s*=\s*buildFoundryHelperContractPrompt\(\);/,
    "The direct generation prompt must not inject the entire geometry-helper contract.",
  );

  console.log(
    "Blender Asset Foundry helper compatibility fixture passed.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
