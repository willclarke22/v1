import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";

import {
  validateAssetDesignBrief,
} from "../asset-design-brief";
import {
  foundryResourceWords,
  scoreMaterialFamilyCompatibility,
} from "../foundry-resource-ranking";
import {
  NATIVE_VINTAGE_CAMERA_PROOF,
} from "../native-vintage-camera-proof";

async function main() {
  assert.deepEqual(
    foundryResourceWords([
      "Leather037",
      "PaintedMetal012",
      "StudioSmall09",
    ]),
    [
      "leather",
      "037",
      "painted",
      "metal",
      "012",
      "studio",
      "small",
      "09",
    ],
    "AmbientCG IDs must expose their semantic prefix instead of remaining one opaque alphanumeric token.",
  );

  const leatherSlot =
    NATIVE_VINTAGE_CAMERA_PROOF
      .design_brief
      .material_slots.find(
        (slot) =>
          slot.slot_id ===
          "leather_grip",
      );
  assert.ok(
    leatherSlot,
    "The proof must declare a leather semantic slot.",
  );
  assert.equal(
    scoreMaterialFamilyCompatibility(
      leatherSlot,
      foundryResourceWords([
        "Leather037",
        "Fine brown leather",
      ]),
    ).compatible,
    true,
  );
  assert.equal(
    scoreMaterialFamilyCompatibility(
      leatherSlot,
      foundryResourceWords([
        "Rock035",
        "granite stone",
      ]),
    ).compatible,
    false,
    "A stone material must not outrank the trusted fallback for a leather slot.",
  );

  const validation =
    validateAssetDesignBrief(
      NATIVE_VINTAGE_CAMERA_PROOF
        .design_brief,
    );
  assert.equal(
    validation.valid,
    true,
    validation.errors.join("; "),
  );

  const code =
    NATIVE_VINTAGE_CAMERA_PROOF.code;
  assert.match(
    code,
    /bpy\.ops\.mesh\.primitive_cube_add/,
  );
  assert.match(
    code,
    /bpy\.ops\.mesh\.primitive_cylinder_add/,
  );
  assert.doesNotMatch(
    code,
    /\bmyway_(?:box|cylinder|sphere|torus|mesh_from_vertices_faces)\s*\(/,
    "The proof geometry must remain native bpy rather than returning to the custom geometry SDK.",
  );

  for (const slotId of [
    "camera_body_paint",
    "leather_grip",
    "aged_brass",
    "matte_rubber",
    "dark_metal",
  ]) {
    assert.match(
      code,
      new RegExp(
        `myway_material_slot\\(\\s*\\n?\\s*"${slotId}"`,
      ),
      `The native camera code must request semantic slot ${slotId}.`,
    );
  }

  const ui =
    await readFile(
      "sandbox/probe-lab/blender-python-builder/ui/blender-python-builder-lab.tsx",
      "utf8",
    );
  assert.match(
    ui,
    /Load native camera proof/,
  );
  assert.match(
    ui,
    /Match chooses AmbientCG IDs automatically/,
  );

  const service =
    await readFile(
      "sandbox/probe-lab/blender-python-builder/foundry-resource-service.server.ts",
      "utf8",
    );
  assert.match(
    service,
    /scoreMaterialFamilyCompatibility/,
  );
  assert.match(
    service,
    /searchParams\.get\("file"\)/,
    "Variant eligibility must recognize ambientCG download filenames carried in the URL query string.",
  );
  assert.match(
    service,
    /catalogMaterialMapRole/,
  );
  assert.match(
    service,
    /!hasRequiredMap\(\s*normalizedAvailable,\s*"base_color"/,
    "Catalog materials that explicitly lack base color must be excluded from automatic surface selection.",
  );

  const downloader =
    await readFile(
      "sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-download.server.ts",
      "utf8",
    );
  assert.match(
    downloader,
    /ambientCgVariantFileExtension/,
  );
  assert.match(
    downloader,
    /parsed\.searchParams\.get\("file"\)/,
    "The downloader must infer .zip from ambientCG's ?file=... URL instead of relying only on the /get pathname.",
  );
  assert.match(
    downloader,
    /fileLooksLikeZip/,
    "The downloaded bytes must provide a ZIP-signature fallback when catalog metadata is incomplete.",
  );
  assert.match(
    downloader,
    /Inspected \${files\.length} file\(s\)/,
    "A failed package must report which extracted files were inspected.",
  );

  console.log(
    "Native vintage-camera cloud proof fixture passed.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
