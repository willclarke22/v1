import assert from "node:assert/strict";
import {
  access,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import {
  execFile,
} from "node:child_process";
import {
  promisify,
} from "node:util";
import {
  resolve,
} from "node:path";

import {
  NATIVE_WHEELCHAIR_PROOF,
  NATIVE_WHEELCHAIR_PROOF_BRIEF,
  NATIVE_WHEELCHAIR_PROOF_CODE,
} from "../native-wheelchair-proof";

const execFileAsync = promisify(execFile);

async function main() {
  assert.equal(
    NATIVE_WHEELCHAIR_PROOF.asset_name,
    "native_stylized_wheelchair_proof",
  );
  assert.equal(
    NATIVE_WHEELCHAIR_PROOF.quality_mode,
    "standard",
  );
  assert.equal(
    NATIVE_WHEELCHAIR_PROOF_BRIEF.schema_version,
    "myway_asset_design_brief_v2",
  );

  const requiredParts =
    NATIVE_WHEELCHAIR_PROOF_BRIEF.parts
      .filter((part) => part.required)
      .map((part) => part.part_id);
  for (const part of [
    "WheelchairFrame",
    "SeatCushion",
    "Backrest",
    "RearWheel_L",
    "RearWheel_R",
    "CasterAssembly_L",
    "CasterAssembly_R",
    "Footrest_L",
    "Footrest_R",
    "PushHandle_L",
    "PushHandle_R",
  ]) {
    assert.ok(
      requiredParts.includes(part),
      `Missing required design-brief part ${part}`,
    );
    const authoredByLiteral =
      NATIVE_WHEELCHAIR_PROOF_CODE.includes(`"${part}"`);
    const authoredByMirroredBuilder =
      part.endsWith("_L") || part.endsWith("_R")
        ? NATIVE_WHEELCHAIR_PROOF_CODE.includes(
            `"${part.slice(0, -1)}" + suffix`,
          )
        : false;
    assert.ok(
      authoredByLiteral ||
        authoredByMirroredBuilder,
      `Generated fixture code does not author ${part}`,
    );
  }

  const slotIds =
    NATIVE_WHEELCHAIR_PROOF_BRIEF.material_slots.map(
      (slot) => slot.slot_id,
    );
  for (const slot of [
    "tubular_frame_metal",
    "seat_upholstery_fabric",
    "wheelchair_tire_rubber",
    "polished_handrim_metal",
    "molded_black_plastic",
  ]) {
    assert.ok(slotIds.includes(slot));
    assert.ok(
      NATIVE_WHEELCHAIR_PROOF_CODE.includes(
        `myway_material_slot(\n    "${slot}"`,
      ),
    );
  }

  assert.ok(
    NATIVE_WHEELCHAIR_PROOF_CODE.includes(
      "bpy.ops.mesh.primitive_torus_add",
    ),
  );
  assert.ok(
    NATIVE_WHEELCHAIR_PROOF_CODE.includes(
      "direction.to_track_quat",
    ),
  );
  assert.ok(
    NATIVE_WHEELCHAIR_PROOF_CODE.includes(
      "for index in range(18)",
    ),
  );
  assert.ok(
    !NATIVE_WHEELCHAIR_PROOF_CODE.includes("myway_box("),
  );
  assert.ok(
    !NATIVE_WHEELCHAIR_PROOF_CODE.includes("myway_cylinder("),
  );

  await Promise.all([
    access(
      resolve(
        process.cwd(),
        "app/api/sandbox/probe-lab/blender-python-builder/native-wheelchair-proof/route.ts",
      ),
    ),
    access(
      resolve(
        process.cwd(),
        "sandbox/probe-lab/blender-python-builder/routes/native-wheelchair-proof.ts",
      ),
    ),
  ]);

  const ui = await readFile(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/blender-python-builder/ui/blender-python-builder-lab.tsx",
    ),
    "utf8",
  );
  assert.ok(ui.includes("Load native wheelchair proof"));
  assert.ok(ui.includes("loadNativeWheelchairProof"));

  const temporaryPath = resolve(
    process.cwd(),
    "sandbox/probe-lab/blender-python-builder/tests/.native-wheelchair-proof-check.py",
  );
  await writeFile(
    temporaryPath,
    NATIVE_WHEELCHAIR_PROOF_CODE,
    "utf8",
  );
  try {
    const python =
      process.platform === "win32"
        ? "python"
        : "python3";
    await execFileAsync(
      python,
      [
        "-m",
        "py_compile",
        temporaryPath,
      ],
      {
        windowsHide: true,
      },
    );
  } finally {
    await rm(temporaryPath, {
      force: true,
    });
    await rm(
      resolve(
        process.cwd(),
        "sandbox/probe-lab/blender-python-builder/tests/__pycache__",
      ),
      {
        recursive: true,
        force: true,
      },
    );
  }

  console.log(
    "Native stylized-wheelchair reference fixture passed.",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
