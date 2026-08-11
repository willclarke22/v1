import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { config } from "dotenv";

config({
  path: path.join(
    process.cwd(),
    ".env.local",
  ),
  override: false,
});

const V15_CONFIRMATION =
  "RECONCILE_CHEESEBURGER_R2_REGISTRY_V15";
const ASSET_ID =
  "cheeseburger_ms193r4w";
const SOURCE_RECORD_REFERENCE =
  `sandbox/probe-lab/assets/library/source-records/${ASSET_ID}.json`;
const VIEW_NAMES = [
  "front_three_quarter",
  "rear_three_quarter",
  "side",
  "elevated_front",
] as const;

type ViewName =
  (typeof VIEW_NAMES)[number];

type SourceRecord = {
  schema_version?: unknown;
  asset_id?: unknown;
  source_provider?: unknown;
  source_url?: unknown;
  license_kind_asserted_by_user?: unknown;
  attribution?: unknown;
  content_hash?: unknown;
};

function argumentValue(
  name: string,
) {
  const prefix = `--${name}=`;
  const direct = process.argv.find(
    (value) =>
      value.startsWith(prefix),
  );
  if (direct) {
    return direct.slice(prefix.length);
  }

  const index = process.argv.indexOf(
    `--${name}`,
  );
  if (
    index >= 0 &&
    process.argv[index + 1]
  ) {
    return process.argv[index + 1]!;
  }

  return null;
}

function reportRoot() {
  const configured =
    process.env.MYWAY_CLEANUP_REPORT_DIR
      ?.trim();

  return configured
    ? path.resolve(configured)
    : path.join(
        os.homedir(),
        "Documents",
        "MyWayCleanupReports",
      );
}

function encodedObjectKey(
  key: string,
) {
  return key
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment),
    )
    .join("/");
}

function publicRuntimeUrl(
  objectKey: string,
) {
  const base =
    process.env.R2_PUBLIC_BASE_URL
      ?.trim()
      .replace(/\/+$/g, "");
  if (!base) {
    throw new Error(
      "R2_PUBLIC_BASE_URL is required to reconcile existing runtime object keys back into registry HTTPS URLs.",
    );
  }
  return `${base}/${encodedObjectKey(
    objectKey,
  )}`;
}

function missingChecks(
  audit: Awaited<
    ReturnType<
      typeof import(
        "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
      )["runAssetCloudAuthorityAudit"]
    >
  >,
) {
  return audit.cloud_checks.filter(
    (item) =>
      item.classification ===
        "cloud_missing_local_repair_available" ||
      item.classification ===
        "cloud_missing_no_repair_source",
  );
}

function stringField(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

async function buildPlan() {
  const {
    getMyWayAsset,
  } = await import(
    "../../sandbox/probe-lab/assets/asset-library.server"
  );
  const {
    attributionCompletenessIssues,
  } = await import(
    "../../sandbox/probe-lab/assets/asset-attribution"
  );
  const {
    readDurableAssetJson,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/asset-durable-artifacts.server"
  );
  const {
    getR2RuntimeStorage,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/r2-asset-storage.server"
  );
  const {
    runAssetCloudAuthorityAudit,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
  );

  const before =
    await runAssetCloudAuthorityAudit();
  if (before.authority_issues.length) {
    throw new Error(
      `v15 refused to run because ${before.authority_issues.length} authority/reference issue(s) are present before registry reconciliation.`,
    );
  }

  const sizeMismatches =
    before.cloud_checks.filter(
      (item) =>
        item.classification ===
        "cloud_size_mismatch",
    );
  if (sizeMismatches.length) {
    throw new Error(
      `v15 refused to run because ${sizeMismatches.length} R2 size mismatch(es) require review first.`,
    );
  }

  const asset =
    await getMyWayAsset(ASSET_ID);
  if (!asset) {
    throw new Error(
      `Asset was not found in the authoritative registry: ${ASSET_ID}`,
    );
  }
  if (
    !asset.appearance_profile ||
    asset.appearance_profile.status !==
      "ready"
  ) {
    throw new Error(
      `${ASSET_ID} does not have a ready appearance profile to reconcile.`,
    );
  }

  const currentAttributionIssues =
    attributionCompletenessIssues(
      asset.attribution,
    );
  if (
    currentAttributionIssues.length !== 1 ||
    currentAttributionIssues[0] !==
      "source URL is required"
  ) {
    throw new Error(
      `v15 expected exactly one current attribution defect (source URL is required), but found: ${currentAttributionIssues.join(
        "; ",
      ) || "none"}.`,
    );
  }

  const sourceRecord =
    await readDurableAssetJson<SourceRecord>(
      SOURCE_RECORD_REFERENCE,
    );
  if (!sourceRecord) {
    throw new Error(
      `The authoritative R2 source record is missing: ${SOURCE_RECORD_REFERENCE}`,
    );
  }
  if (
    stringField(sourceRecord.asset_id) !==
    ASSET_ID
  ) {
    throw new Error(
      "The authoritative source record does not belong to the expected cheeseburger asset.",
    );
  }
  if (
    stringField(
      sourceRecord.source_provider,
    ).toLowerCase() !== "hi3d"
  ) {
    throw new Error(
      "The authoritative source record is not the reviewed Hi3D provenance expected by v15.",
    );
  }
  const sourceUrl =
    stringField(sourceRecord.source_url);
  if (!/^https:\/\//i.test(sourceUrl)) {
    throw new Error(
      "The authoritative Hi3D source record does not contain an HTTPS source_url.",
    );
  }
  if (
    stringField(
      sourceRecord.license_kind_asserted_by_user,
    ) !== "cc_by_4_0"
  ) {
    throw new Error(
      "The authoritative source record no longer matches the reviewed CC BY 4.0 provenance expected by v15.",
    );
  }
  if (
    stringField(sourceRecord.attribution) !==
    "Generated with Hi3D"
  ) {
    throw new Error(
      "The authoritative source record no longer carries the expected Hi3D attribution text.",
    );
  }

  const runtime =
    getR2RuntimeStorage();
  const analysisObjects =
    await runtime.list({
      prefix:
        `runtime/analysis/${ASSET_ID}/`,
    });

  const views = VIEW_NAMES.map(
    (name) => {
      const prefix =
        `runtime/analysis/${ASSET_ID}/${name}/`;
      const matches =
        analysisObjects.filter(
          (item) =>
            item.object_key.startsWith(
              prefix,
            ),
        );
      if (matches.length !== 1) {
        throw new Error(
          `Expected exactly one existing R2 object under ${prefix}, found ${matches.length}.`,
        );
      }
      const objectKey =
        matches[0]!.object_key;
      return {
        name: name as ViewName,
        object_key: objectKey,
        public_path:
          publicRuntimeUrl(
            objectKey,
          ),
      };
    },
  );

  const beforeMissing =
    missingChecks(before);
  const beforeNonAmbient =
    beforeMissing.filter(
      (item) =>
        item.category !==
        "ambientcg_reference",
    );

  return {
    asset,
    sourceUrl,
    views,
    before,
    beforeMissing,
    beforeNonAmbient,
  };
}

async function main() {
  const confirmation =
    argumentValue("confirmation");
  const preflightOnly =
    process.argv.includes(
      "--preflight-only",
    );
  if (
    confirmation !== V15_CONFIRMATION
  ) {
    throw new Error(
      `Explicit confirmation is required: --confirmation=${V15_CONFIRMATION}`,
    );
  }

  const plan = await buildPlan();

  console.log(
    "MyWay v15 cheeseburger registry reconciliation preflight passed.",
  );
  console.log(
    `Current missing cloud checks: ${plan.beforeMissing.length}`,
  );
  console.log(
    `Current non-AmbientCG missing checks: ${plan.beforeNonAmbient.length}`,
  );
  console.log(
    `Authoritative provenance source URL: ${plan.sourceUrl}`,
  );
  console.log(
    `Existing R2 analysis objects selected: ${plan.views.length}`,
  );

  if (preflightOnly) {
    console.log(
      "v15 preflight-only mode complete. No R2 registry mutation was performed.",
    );
    return;
  }

  const {
    updateMyWayAsset,
    getMyWayAsset,
  } = await import(
    "../../sandbox/probe-lab/assets/asset-library.server"
  );
  const {
    attributionCompletenessIssues,
  } = await import(
    "../../sandbox/probe-lab/assets/asset-attribution"
  );
  const {
    runtimeObjectKeyFromPublicUrl,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/asset-durable-artifacts.server"
  );
  const {
    runAssetCloudAuthorityAudit,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
  );

  const updated =
    await updateMyWayAsset(
      ASSET_ID,
      {
        source_url:
          plan.asset.source_url ??
          plan.sourceUrl,
        attribution: {
          ...plan.asset.attribution!,
          source_url:
            plan.sourceUrl,
        },
        appearance_profile: {
          ...plan.asset.appearance_profile!,
          analysis_views:
            plan.views.map(
              (view) => ({
                name: view.name,
                public_path:
                  view.public_path,
              }),
            ),
        },
      },
    );

  const finalAttributionIssues =
    attributionCompletenessIssues(
      updated.attribution,
    );
  if (finalAttributionIssues.length) {
    throw new Error(
      `v15 registry update completed but attribution is still incomplete: ${finalAttributionIssues.join(
        "; ",
      )}`,
    );
  }

  for (const expected of plan.views) {
    const current =
      updated.appearance_profile
        ?.analysis_views.find(
          (view) =>
            view.name ===
            expected.name,
        );
    if (!current) {
      throw new Error(
        `Updated registry is missing analysis view ${expected.name}.`,
      );
    }
    const objectKey =
      runtimeObjectKeyFromPublicUrl(
        current.public_path,
      );
    if (
      objectKey !==
      expected.object_key
    ) {
      throw new Error(
        `Updated registry analysis view ${expected.name} does not resolve to the verified R2 object key.`,
      );
    }
  }

  const reloaded =
    await getMyWayAsset(ASSET_ID);
  if (!reloaded) {
    throw new Error(
      "The reconciled cheeseburger asset could not be reloaded from the authoritative registry.",
    );
  }

  const after =
    await runAssetCloudAuthorityAudit();
  const afterMissing =
    missingChecks(after);
  const afterNonAmbient =
    afterMissing.filter(
      (item) =>
        item.category !==
        "ambientcg_reference",
    );
  const afterAmbient =
    afterMissing.filter(
      (item) =>
        item.category ===
        "ambientcg_reference",
    );

  if (after.authority_issues.length) {
    throw new Error(
      `v15 introduced ${after.authority_issues.length} authority/reference issue(s).`,
    );
  }
  if (afterNonAmbient.length) {
    throw new Error(
      `v15 finished with ${afterNonAmbient.length} non-AmbientCG missing cloud check(s).`,
    );
  }

  const stamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, "-");
  const outputDir = path.join(
    reportRoot(),
    `cloud-registry-v15-${stamp}`,
  );
  await mkdir(
    outputDir,
    { recursive: true },
  );
  const reportPath = path.join(
    outputDir,
    "cheeseburger-cloud-registry-reconciliation-v15.json",
  );
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        schema_version:
          "myway_asset_cloud_registry_reconciliation_v15",
        asset_id: ASSET_ID,
        source_url:
          plan.sourceUrl,
        analysis_views:
          plan.views,
        before: {
          missing_cloud_checks:
            plan.beforeMissing.length,
          missing_non_ambientcg:
            plan.beforeNonAmbient.length,
          authority_issues:
            plan.before.authority_issues.length,
        },
        after: {
          missing_cloud_checks:
            afterMissing.length,
          missing_non_ambientcg:
            afterNonAmbient.length,
          remaining_ambientcg:
            afterAmbient.map(
              (item) => ({
                object_key:
                  item.object_key,
                reason:
                  item.reason,
              }),
            ),
          authority_issues:
            after.authority_issues.length,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    "MyWay v15 cheeseburger R2 registry reconciliation completed.",
  );
  console.log(
    `Remaining cloud gaps: ${afterMissing.length}`,
  );
  console.log(
    `Remaining non-AmbientCG gaps: ${afterNonAmbient.length}`,
  );
  console.log(
    `Remaining AmbientCG gaps: ${afterAmbient.length}`,
  );
  console.log(
    `Authority/reference issues: ${after.authority_issues.length}`,
  );
  console.log(
    `Report: ${reportPath}`,
  );
}

main().catch((caught) => {
  console.error(caught);
  process.exitCode = 1;
});
