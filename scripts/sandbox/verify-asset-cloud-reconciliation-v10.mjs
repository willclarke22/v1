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
      `Asset cloud-reconciliation v10 verifier failed: ${label}`,
    );
  }
}

function forbidText(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(
      `Asset cloud-reconciliation v10 verifier failed: ${label}`,
    );
  }
}

const [audit, cli] = await Promise.all([
  source(
    "sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server.ts",
  ),
  source(
    "scripts/sandbox/asset-cloud-authority-audit.ts",
  ),
]);

requireText(
  audit,
  '"myway_asset_cloud_authority_audit_v2"',
  "audit schema version was not advanced",
);
requireText(
  audit,
  "const exactExpectationCount =",
  "exact object expectations are not counted before prefix reconciliation",
);
requireText(
  audit,
  "prefix_expectations:",
  "analysis-prefix expectation count is missing",
);
requireText(
  audit,
  "expected_cloud_checks:",
  "total expected check count is missing",
);
requireText(
  audit,
  '"legacy_r2_rekey"',
  "legacy R2 re-key reconciliation strategy is missing",
);
requireText(
  audit,
  "unreferenced_source_candidates_scanned:",
  "unreferenced source-bucket reconciliation scan is missing",
);
requireText(
  audit,
  "existing_gap_repair_plan_covered:",
  "existing repair-plan coverage is not reported",
);
requireText(
  audit,
  "local_repair_not_covered_count:",
  "repairable-but-uncovered gap count is missing",
);
requireText(
  audit,
  "collectIdentityTokensFromJson",
  "legacy R2 JSON identity matching is missing",
);
requireText(
  cli,
  "Exact expected object keys:",
  "CLI does not distinguish exact object keys",
);
requireText(
  cli,
  "Analysis-prefix expectations:",
  "CLI does not report prefix expectations",
);
requireText(
  cli,
  "Legacy R2 re-key candidates:",
  "CLI does not report high-confidence legacy R2 candidates",
);
requireText(
  cli,
  "Still unresolved after reconciliation:",
  "CLI does not report unresolved gaps",
);
requireText(
  cli,
  "This audit is read-only",
  "read-only safety statement disappeared",
);

forbidText(
  cli,
  "git rm",
  "audit CLI must not mutate Git",
);
forbidText(
  cli,
  "deleteObject",
  "audit CLI must not delete R2 objects",
);

console.log(
  "Asset cloud-reconciliation v10 source verification passed: exact-key and prefix expectations are counted separately, legacy R2 objects are reconciled read-only, and repair-plan coverage is reported.",
);
