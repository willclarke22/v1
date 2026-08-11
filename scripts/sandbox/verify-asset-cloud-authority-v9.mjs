import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

const root =
  process.cwd();

async function source(
  relativePath,
) {
  return readFile(
    path.join(
      root,
      relativePath,
    ),
    "utf8",
  );
}

function requireText(
  text,
  needle,
  label,
) {
  if (!text.includes(needle)) {
    throw new Error(
      `Asset cloud-authority v9 verifier failed: ${label}`,
    );
  }
}

function forbidText(
  text,
  needle,
  label,
) {
  if (text.includes(needle)) {
    throw new Error(
      `Asset cloud-authority v9 verifier failed: ${label}`,
    );
  }
}

const [
  assetLibrary,
  ambientStore,
  durableArtifacts,
  promotion,
  migration,
  gapRepair,
  storageTypes,
  r2Storage,
  audit,
  auditCli,
] = await Promise.all([
  source(
    "sandbox/probe-lab/assets/asset-library.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-store.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/asset-durable-artifacts.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/asset-promotion.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/cloud-library-migration.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/asset-cloud-gap-repair.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/asset-storage.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/r2-asset-storage.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server.ts",
  ),
  source(
    "scripts/sandbox/asset-cloud-authority-audit.ts",
  ),
]);

requireText(
  assetLibrary,
  "Authoritative R2 asset registry is missing",
  "normal asset-registry reads must fail closed when R2 metadata is missing",
);
requireText(
  assetLibrary,
  "restoreMyWayAssetRegistryToCloudFromLocal",
  "explicit registry recovery helper is missing",
);
forbidText(
  assetLibrary,
  "localCanRestoreCloud",
  "legacy automatic local registry restoration is still present",
);
forbidText(
  assetLibrary,
  "localIsNewer",
  "legacy local-newer authority selection is still present",
);

requireText(
  ambientStore,
  "Normal reads never restore it from this laptop",
  "ambientCG normal reads are not strict-cloud",
);
requireText(
  ambientStore,
  "recoverAmbientCgCloudMetadataFromLocal",
  "explicit ambientCG recovery helper is missing",
);

requireText(
  durableArtifacts,
  "recoverDurableAssetJsonFromLocal",
  "explicit durable JSON recovery helper is missing",
);
const durableRead =
  durableArtifacts.slice(
    durableArtifacts.indexOf(
      "export async function readDurableAssetJson",
    ),
    durableArtifacts.indexOf(
      "export async function recoverDurableAssetJsonFromLocal",
    ),
  );
requireText(
  durableRead,
  "if (durableAssetCloudEnabled()) {\n    return readCloudJson<T>(",
  "cloud-mode durable reads do not return directly from R2",
);
forbidText(
  durableRead,
  "if (remote",
  "cloud-mode durable reads still contain a remote-then-local fallback branch",
);

requireText(
  promotion,
  "readOrRecoverDurableAssetJson",
  "explicit asset promotion cannot recover historical local metadata",
);
requireText(
  migration,
  "restoreMyWayAssetRegistryToCloudFromLocal",
  "explicit cloud bootstrap does not use explicit registry recovery",
);
requireText(
  gapRepair,
  "recoverDurableAssetJsonFromLocal",
  "cloud-gap repair is not using explicit durable metadata recovery",
);

requireText(
  storageTypes,
  "list(input?:",
  "R2 provider contract does not expose read-only object listing",
);
requireText(
  r2Storage,
  "ListObjectsV2Command",
  "R2 implementation does not paginate bucket listings",
);
requireText(
  r2Storage,
  "ContinuationToken",
  "R2 object listing is not paginated",
);

for (const classification of [
  "cloud_verified",
  "cloud_missing_local_repair_available",
  "cloud_missing_no_repair_source",
  "cloud_size_mismatch",
  "cloud_unreferenced_managed_object",
  "git_tracked_generated_mirror",
  "local_duplicate_safe_to_remove",
]) {
  requireText(
    audit,
    classification,
    `audit classification is missing: ${classification}`,
  );
}

requireText(
  audit,
  "auditHistoricalLocalAssetStorage",
  "comprehensive audit does not include the existing Phase 3 local audit",
);
requireText(
  audit,
  "buildCloudGapRepairPlan",
  "comprehensive audit does not include repair-source detection",
);
requireText(
  auditCli,
  "This audit is read-only",
  "audit CLI does not state its no-deletion safety boundary",
);
forbidText(
  auditCli,
  "git rm",
  "audit CLI must not mutate Git",
);

console.log(
  "Asset cloud-authority v9 source verification passed: strict R2 authority, explicit recovery paths, bucket listing, and read-only comprehensive audit are in place.",
);
