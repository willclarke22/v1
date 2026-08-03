import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  AmbientCgMaterialAppearanceProfile,
} from "../../assets/catalog/ambientcg/ambientcg-types";
import type {
  AssetEnvironmentIntentV2,
  AssetMaterialSlotIntentV2,
} from "../asset-design-brief";
import {
  scoreEnvironmentCompatibility,
  scoreMaterialAppearanceCompatibility,
  scoreMaterialFamilyCompatibility,
} from "../foundry-resource-ranking";

async function main() {
  const slot: AssetMaterialSlotIntentV2 = {
    slot_id: "camera_grip",
    display_name: "Camera grip",
    assigned_part_ids: [
      "camera_grip",
    ],
    material_family: "leather",
    intent:
      "clean black matte leather grip",
    semantic_tags: [
      "leather",
      "black",
      "matte",
    ],
    color_hint: "black",
    roughness_hint: "matte",
    metallic_hint: "nonmetallic",
    texture_hint:
      "fine uniform leather texture",
    brightness_hint: "dark",
    avoid_tags: [
      "tan",
      "cracked",
      "large",
      "pebbled",
    ],
    physical_scale_m: 0.01,
    required_maps: [
      "base_color",
      "roughness",
      "normal_gl",
    ],
    procedural_fallback: {
      color_rgba: [
        0.03,
        0.03,
        0.03,
        1,
      ],
      metallic: 0,
      roughness: 0.72,
    },
  };
  
  const strongProfile:
    AmbientCgMaterialAppearanceProfile = {
      schema_version:
        "myway_ambientcg_material_appearance_v1",
      source_asset_id:
        "Leather037",
      status: "ready",
      summary:
        "Near-black leather with a fine uniform texture, subtle grain variation, and a matte finish.",
      dominant_colors: [
        "black",
        "charcoal",
      ],
      brightness: "dark",
      confidence: 0.92,
      warnings: [],
      preview_url:
        "https://example.test/Leather037.jpg",
      model:
        "nvidia/nemotron-nano-12b-v2-vl",
      prompt_version:
        "myway_ambientcg_material_appearance_prompt_v1_texture",
      analyzed_at:
        "2026-08-02T00:00:00.000Z",
      error: null,
    };
  
  const wrongProfile:
    AmbientCgMaterialAppearanceProfile = {
      ...strongProfile,
      source_asset_id:
        "Leather034",
      summary:
        "Light tan leather with a large pebbled texture and glossy highlights.",
      dominant_colors: [
        "tan",
        "beige",
      ],
      brightness: "light",
    };
  
  const family =
    scoreMaterialFamilyCompatibility(
      slot,
      [
        "fabric",
        "woven",
        "cloth",
      ],
    );
  assert.equal(
    family.compatible,
    false,
    "Fabric must not satisfy a leather slot.",
  );
  
  const strong =
    scoreMaterialAppearanceCompatibility(
      slot,
      strongProfile,
    );
  const wrong =
    scoreMaterialAppearanceCompatibility(
      slot,
      wrongProfile,
    );
  assert.equal(
    strong.compatible,
    true,
  );
  assert.equal(
    wrong.compatible,
    false,
    "Avoided tan/large/pebbled qualities must reject the wrong leather.",
  );
  assert.ok(
    strong.score > 50,
    "The concise texture-aware profile should strongly support the correct leather.",
  );
  
  const studioIntent:
    AssetEnvironmentIntentV2 = {
      intent:
        "neutral product look-development studio",
      semantic_tags: [
        "studio",
        "neutral",
        "product",
      ],
      preferred_environment_class:
        "product_studio",
      strength: 0.8,
      rotation_degrees: 0,
      background_visible: false,
    };
  assert.equal(
    scoreEnvironmentCompatibility(
      studioIntent,
      [
        "DayEnvironmentHDRI005",
        "sunny forest path",
        "outdoor woodland",
      ],
    ).compatible,
    false,
    "A forest HDRI must not satisfy product-studio intent.",
  );
  assert.equal(
    scoreEnvironmentCompatibility(
      studioIntent,
      [
        "PhotoStudio03",
        "neutral softbox showroom",
      ],
    ).compatible,
    true,
  );
  
  const projectRoot =
    process.cwd();
  const appearanceServer =
    await readFile(
      path.resolve(
        projectRoot,
        "sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-material-appearance.server.ts",
      ),
      "utf8",
    );
  assert.match(
    appearanceServer,
    /visible texture, pattern or grain/,
  );
  assert.match(
    appearanceServer,
    /dominantColors/,
  );
  assert.match(
    appearanceServer,
    /brightness/,
  );
  assert.match(
    appearanceServer,
    /!byId\.has/,
    "Batch analysis must advance past failed profiles instead of retrying the same first entries forever.",
  );
  assert.doesNotMatch(
    appearanceServer,
    /status !== "ready"/,
    "Failed material profiles should require an explicit retry rather than blocking the analyze-all batch.",
  );
  
  const resourceService =
    await readFile(
      path.resolve(
        projectRoot,
        "sandbox/probe-lab/blender-python-builder/foundry-resource-service.server.ts",
      ),
      "utf8",
    );
  assert.match(
    resourceService,
    /0\.2 \+\s*appearance\.confidence/,
    "An unprofiled cached texture must stay below the automatic-selection confidence threshold for a visually specific slot.",
  );
  assert.match(
    resourceService,
    /0\.18 \+\s*appearance\.confidence/,
    "An unprofiled catalog texture must stay below the automatic-selection confidence threshold for a visually specific slot.",
  );

  const helperLibrary =
    await readFile(
      path.resolve(
        projectRoot,
        "sandbox/probe-lab/blender-python-builder/blender-helper-library.ts",
      ),
      "utf8",
    );
  assert.match(
    helperLibrary,
    /normal_dx/,
  );
  assert.match(
    helperLibrary,
    /invert_green/,
  );
  
  console.log(
    "AmbientCG material selection and appearance fixture passed.",
  );
}

void main();
