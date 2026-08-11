import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function source(relativePath) {
  return readFile(
    path.join(root, relativePath),
    "utf8",
  );
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(
      `Asset cloud-repair v11 verifier failed: ${label}`,
    );
  }
}

function forbidText(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(
      `Asset cloud-repair v11 verifier failed: ${label}`,
    );
  }
}

const [repair, durable, audit, cli] = await Promise.all([
  source(
    "sandbox/probe-lab/assets/storage/asset-cloud-gap-repair.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/asset-durable-artifacts.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server.ts",
  ),
  source(
    "scripts/sandbox/repair-asset-cloud-completeness-v11.ts",
  ),
]);

requireText(
  repair,
  "analysis_view_name",
  "analysis repair does not preserve the registry logical view name",
);
requireText(
  repair,
  "asset.appearance_profile",
  "analysis repair plan is not registry-driven",
);
forbidText(
  repair,
  "const analysisRoot = projectPath(",
  "historical directory-driven analysis planning is still active",
);
requireText(
  repair,
  "durable_reference:",
  "durable metadata plan items do not carry their canonical logical reference",
);
requireText(
  repair,
  "object_key:\n          objectKey",
  "durable metadata plan items do not carry canonical R2 object keys",
);
requireText(
  repair,
  "sourceRecordMatchesAsset",
  "source-record identity drift is not matched against stable provenance",
);
requireText(
  repair,
  "candidates.length === 1",
  "identity-drift source record recovery is not restricted to one unambiguous candidate",
);
requireText(
  repair,
  "objectKeys?: string[]",
  "repair execution cannot be constrained to the audited expected object keys",
);
requireText(
  durable,
  "recoverDurableAssetJsonFromExplicitLocalFile",
  "explicit alternate-file durable metadata recovery helper is missing",
);
requireText(
  durable,
  "outside the project root",
  "explicit local recovery does not enforce project-root containment",
);
requireText(
  audit,
  "missing.local_repair_available ||\n      existingRepairPlanCovered",
  "reconciliation does not recognize an explicit planner-backed alternate local repair source",
);
requireText(
  cli,
  "REPAIR_EXPECTED_R2_ASSET_GAPS_V11",
  "v11 repair requires no explicit confirmation token",
);
requireText(
  cli,
  "ambientcg_reference",
  "v11 does not explicitly preserve unresolved AmbientCG material references for later rebuild",
);
requireText(
  cli,
  "objectKeys:",
  "v11 does not constrain cloud mutation to audited expected object keys",
);
requireText(
  cli,
  "deletes_local_files: false",
  "v11 safety report does not state that local files are retained",
);
requireText(
  cli,
  "deletes_r2_objects: false",
  "v11 safety report does not state that R2 deletion is disabled",
);
forbidText(
  cli,
  "git rm",
  "v11 must not mutate Git",
);
forbidText(
  cli,
  ".delete(",
  "v11 repair CLI must not delete R2 objects",
);

console.log(
  "Asset cloud-repair v11 source verification passed: expected-object-only repair, registry-driven analysis recovery, canonical durable metadata keys, and unambiguous source-record identity recovery are in place.",
);
