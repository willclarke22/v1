import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.join(
  root,
  "sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server.ts",
);
const livePath = path.join(
  root,
  "scripts/sandbox/verify-ambientcg-cloud-root-audit-v16.ts",
);

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Required v16 file is missing: ${filePath}`,
    );
  }
  return fs.readFileSync(
    filePath,
    "utf8",
  );
}

function requireText(
  text,
  fragment,
  label,
) {
  if (!text.includes(fragment)) {
    throw new Error(
      `v16 source verification failed: ${label}`,
    );
  }
}

const audit =
  requireFile(auditPath);
const live =
  requireFile(livePath);

requireText(
  audit,
  "prefixExpectations:",
  "collectCloudReferences must receive prefix expectations",
);
requireText(
  audit,
  "/^public[_-]?root$/i.test",
  "public_root must be recognized as a prefix/root semantic",
);
requireText(
  audit,
  "input.prefixExpectations.push",
  "public_root must create a prefix expectation",
);
requireText(
  audit,
  "At least one cloud artifact exists under the expected prefix",
  "prefix verification must be generic rather than analysis-only",
);
requireText(
  audit,
  "No R2 object exists under ${item.prefix}",
  "prefix failure diagnostics must be generic",
);
requireText(
  live,
  "runtime/materials/ambientcg/Metal046B/2k-jpg/",
  "v16 live verifier must cover the known AmbientCG roots",
);
requireText(
  live,
  "missing_check_count !== 0",
  "v16 live verifier must require zero missing cloud checks",
);
requireText(
  live,
  "authority_issues.length !== 0",
  "v16 live verifier must require zero authority/reference issues",
);
requireText(
  live,
  "No R2 objects were uploaded, replaced, or deleted.",
  "v16 must remain read-only with respect to R2",
);

console.log(
  "Asset cloud-audit v16 source verification passed: AmbientCG public_root URLs are treated as directory-prefix expectations, exact child object references remain authoritative, and live verification remains R2-read-only.",
);
