import assert from "node:assert/strict";
import {
  access,
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";

import {
  FOUNDRY_ASSET_CLASSES,
} from "../asset-design-brief";
import {
  buildDirectGlmContextPackage,
} from "../direct-glm-context.server";
import {
  routeForVisualCategory,
} from "../foundry-visual-critic.server";
import {
  buildAssetClassStrategyPrompt,
} from "../glm-blender-python.server";
import {
  NATIVE_VINTAGE_CAMERA_PROOF_BRIEF,
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
    context.schema_version,
    "myway_direct_glm_context_v2",
  );
  assert.ok(
    context.asset_contract
      .required_parts.every(
        (part) =>
          Array.isArray(
            part.geometry_strategy,
          ),
      ),
    "Every compact required part must preserve its planned geometry strategy.",
  );
  assert.ok(
    context.asset_contract
      .required_parts.some(
        (part) =>
          part.geometry_strategy
            .length > 0,
      ),
    "The compact context must retain useful construction guidance.",
  );

  const furnitureStrategy =
    buildAssetClassStrategyPrompt(
      "furniture_architecture",
    );
  assert.match(
    furnitureStrategy,
    /load-bearing frame/i,
  );
  assert.doesNotMatch(
    furnitureStrategy,
    /leaf instances/i,
    "Generation must receive the active class strategy rather than all unrelated strategies.",
  );
  assert.ok(
    FOUNDRY_ASSET_CLASSES.includes(
      "soft_goods_upholstery",
    ),
  );

  assert.equal(
    routeForVisualCategory(
      "structural_connection",
    ),
    "blender_code",
  );
  assert.equal(
    routeForVisualCategory(
      "material_mapping",
    ),
    "material_mapping",
  );
  assert.equal(
    routeForVisualCategory(
      "lighting_environment",
    ),
    "look_development",
  );
  assert.equal(
    routeForVisualCategory(
      "uncertain",
    ),
    "human_review",
  );

  const root = process.cwd();
  await Promise.all([
    access(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/foundry-visual-critic.server.ts",
      ),
    ),
    access(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/routes/visual-critique.ts",
      ),
    ),
    access(
      resolve(
        root,
        "app/api/sandbox/probe-lab/blender-python-builder/visual-critique/route.ts",
      ),
    ),
  ]);

  const critic =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/foundry-visual-critic.server.ts",
      ),
      "utf8",
    );
  for (const term of [
    "visible evidence",
    "affected_part_ids",
    "affected_material_slot_ids",
    "suggested_adjustment",
    "evidence_views",
    "material_mapping",
    "look_development",
    "visual-critique.json",
  ]) {
    assert.ok(
      critic.includes(term),
      `Visual critic must include ${term}.`,
    );
  }

  const improve =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/glm-blender-python.server.ts",
      ),
      "utf8",
    );
  assert.match(
    improve,
    /Visual findings routed to Blender code/,
  );
  assert.match(
    improve,
    /Deferred material-mapping, look-development, or human-review findings/,
  );
  assert.match(
    improve,
    /Preserve selected material ids and material-slot intent/,
  );

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
    /Analyze rendered asset/,
  );
  assert.match(
    ui,
    /Image-grounded visual critique/,
  );
  assert.match(
    ui,
    /visual_critique:/,
  );

  const candidate =
    await readFile(
      resolve(
        root,
        "sandbox/probe-lab/blender-python-builder/foundry-candidate-store.server.ts",
      ),
      "utf8",
    );
  assert.match(
    candidate,
    /visual_critique/,
    "Candidate records should preserve the visual review provenance.",
  );

  console.log(
    "Foundry context-fidelity and image-grounded visual-critic fixture passed.",
  );
}

void main();
