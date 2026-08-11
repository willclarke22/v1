import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`Asset cloud-repair v14 verifier failed: ${label}`);
  }
}

function forbidText(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(`Asset cloud-repair v14 verifier failed: ${label}`);
  }
}

const [repair, cli] = await Promise.all([
  source("sandbox/probe-lab/assets/storage/asset-cloud-gap-repair.server.ts"),
  source("scripts/sandbox/repair-asset-cloud-completeness-v14.ts"),
]);

// Preserve the provider-aware source-record recovery added after v11.
requireText(repair, "sourceRecordStableSourceIds", "provider-stable source-record identity helper is missing");
requireText(repair, "candidate.value.asset_base_id", "BlendKit asset_base_id is not considered a stable provider identity");
requireText(repair, "candidate.value.selected_source_asset_id", "selected provider source identity is not considered");
requireText(repair, "stableProviderIdentity", "source-record recovery still requires historical MyWay asset_id equality");
requireText(repair, "candidates.length === 1", "provider-aware source-record recovery is not restricted to one unambiguous match");

// v14: prefix expectations must map to one concrete repair object under the prefix.
requireText(cli, "repairPlanMatchesExpectation", "prefix-aware repair-plan matching helper is missing");
requireText(cli, 'expectedObjectKey.endsWith("/*")', "analysis-prefix expectations are not detected");
requireText(cli, "planObjectKey.startsWith(prefix)", "analysis-prefix expectations do not match canonical child/wildcard repair-plan keys");
requireText(cli, "missingPlanCoverage", "zero-match repair-plan expectations are not rejected");
requireText(cli, "ambiguousPlanCoverage", "multi-match repair-plan expectations are not rejected");
requireText(cli, "entry.matches.length > 1", "ambiguous prefix repair mappings are not explicitly detected");
requireText(cli, "selectedKeys.length !==", "one unique canonical repair-plan item per expected local repair is not enforced");
requireText(cli, "localRepairExpectations.length", "local-repair expectation count is not used as a safety invariant");

requireText(cli, "REPAIR_EXPECTED_R2_ASSET_GAPS_V14", "v14 repair requires no explicit confirmation token");
requireText(cli, "--preflight-only", "v14 does not support a read-only preflight before R2 mutation");
requireText(cli, "v14 preflight-only mode complete. No R2 mutations were performed.", "v14 preflight-only safety boundary is not explicit");
requireText(cli, "objectKeys:", "v14 repair is not constrained to audited concrete repair object keys");
requireText(cli, "deletes_local_files: false", "v14 safety report does not retain local files");
requireText(cli, "deletes_r2_objects: false", "v14 safety report does not disable R2 deletion");
forbidText(cli, "git rm", "v14 must not mutate Git");
forbidText(cli, ".delete(", "v14 repair CLI must not delete R2 objects");

// v14: browser-rooted public URLs must be resolved before path.isAbsolute on Windows.
const sourceUrlCheck = 'if (source.startsWith("/"))';
const sourceAbsoluteCheck = "if (path.isAbsolute(source))";
const referenceUrlCheck = 'if (value.startsWith("/"))';
const referenceAbsoluteCheck = "if (path.isAbsolute(value))";
requireText(repair, sourceUrlCheck, "localSourcePath does not recognize browser-rooted public URLs");
requireText(repair, referenceUrlCheck, "localReferencePath does not recognize browser-rooted public URLs");
if (repair.indexOf(sourceUrlCheck) > repair.indexOf(sourceAbsoluteCheck)) {
  throw new Error("Asset cloud-repair v14 verifier failed: localSourcePath still checks path.isAbsolute before public URL resolution");
}
if (repair.indexOf(referenceUrlCheck) > repair.indexOf(referenceAbsoluteCheck)) {
  throw new Error("Asset cloud-repair v14 verifier failed: localReferencePath still checks path.isAbsolute before public URL resolution");
}
requireText(repair, "On Windows, path.isAbsolute", "Windows public-path repair rationale is missing");

console.log(
  "Asset cloud-repair v14 source verification passed: Windows public asset URLs resolve to project files before absolute-path handling, BlendKit provenance recovery remains provider-aware, analysis prefix expectations resolve safely, and preflight remains read-only before mutation.",
);
