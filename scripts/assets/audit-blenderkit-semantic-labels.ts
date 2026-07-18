import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import {
  listMyWayAssets,
  updateMyWayAsset,
} from "../../sandbox/probe-lab/assets/asset-library.server";
import { projectPath } from "../../sandbox/probe-lab/assets/paths.server";

loadEnvConfig(process.cwd());

const REPORT_PATH =
  "sandbox/probe-lab/assets/debug/blenderkit-semantic-label-audit.json";

const LOW_INFORMATION_TOKENS = new Set([
  "generic",
  "simple",
  "basic",
  "realistic",
  "small",
  "large",
  "medium",
  "modern",
  "classic",
  "wooden",
  "plastic",
  "metal",
  "household",
  "home",
  "indoor",
  "outdoor",
]);

function tokens(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function anchorToken(value: string) {
  const all = tokens(value);
  const meaningful = all.filter(
    (token) => !LOW_INFORMATION_TOKENS.has(token),
  );
  return (meaningful.length > 0 ? meaningful : all).at(-1) ?? null;
}

function tokenMatches(queryToken: string, sourceToken: string) {
  if (queryToken === sourceToken) return true;

  if (queryToken.length >= 4 && sourceToken.length >= 4) {
    if (
      queryToken.includes(sourceToken) ||
      sourceToken.includes(queryToken)
    ) {
      return true;
    }
  }

  const querySingular =
    queryToken.endsWith("s") && queryToken.length > 4
      ? queryToken.slice(0, -1)
      : queryToken;
  const sourceSingular =
    sourceToken.endsWith("s") && sourceToken.length > 4
      ? sourceToken.slice(0, -1)
      : sourceToken;

  return querySingular === sourceSingular;
}

function sourceMatchesAnyPhrase(
  sourceTokens: string[],
  phrases: string[],
) {
  return phrases.some((phrase) => {
    const anchor = anchorToken(phrase);
    return (
      anchor !== null &&
      sourceTokens.some((sourceToken) =>
        tokenMatches(anchor, sourceToken),
      )
    );
  });
}

async function main() {
  const quarantine = process.argv.includes("--quarantine");
  const assets = await listMyWayAssets();
  const checked: unknown[] = [];
  const mismatches: Array<{
    asset_id: string;
    canonical_label: string;
    display_name: string;
    source_asset_id: string | null | undefined;
    source_display_name: string | null;
    source_description: string | null;
    source_tags: string[];
    accepted_phrases: string[];
    quarantined: boolean;
  }> = [];

  for (const asset of assets) {
    if (asset.source_type !== "blenderkit") continue;

    const sourceRecordPath = projectPath(
      "sandbox/probe-lab/assets/library/source-records",
      `${asset.asset_id}.json`,
    );

    let sourceRecord: Record<string, unknown>;

    try {
      sourceRecord = JSON.parse(
        await readFile(sourceRecordPath, "utf8"),
      ) as Record<string, unknown>;
    } catch {
      checked.push({
        asset_id: asset.asset_id,
        result: "source_record_missing",
      });
      continue;
    }

    const sourceDisplayName =
      typeof sourceRecord.display_name === "string"
        ? sourceRecord.display_name
        : null;
    const sourceDescription =
      typeof sourceRecord.description === "string"
        ? sourceRecord.description
        : null;
    const sourceTags = Array.isArray(sourceRecord.tags)
      ? sourceRecord.tags
          .filter((value): value is string => typeof value === "string")
      : [];

    const sourceTokens = tokens(
      [
        sourceDisplayName,
        sourceDescription,
        ...sourceTags,
      ].join(" "),
    );

    const acceptedPhrases = Array.from(
      new Set([
        asset.canonical_label,
        ...asset.aliases,
      ]),
    ).filter(Boolean);

    const relevant = sourceMatchesAnyPhrase(
      sourceTokens,
      acceptedPhrases,
    );

    checked.push({
      asset_id: asset.asset_id,
      canonical_label: asset.canonical_label,
      source_display_name: sourceDisplayName,
      relevant,
    });

    if (relevant) continue;

    if (quarantine && asset.status !== "rejected") {
      await updateMyWayAsset(asset.asset_id, {
        status: "rejected",
        safe_to_use_in_sandbox: false,
        safe_to_promote_to_app: false,
        notes:
          `${asset.notes ?? ""}`.trim() +
          `${asset.notes ? " " : ""}` +
          "Quarantined by the BlendKit semantic-label audit because the captured source title, description, and tags did not match the requested object name or aliases.",
      });
    }

    mismatches.push({
      asset_id: asset.asset_id,
      canonical_label: asset.canonical_label,
      display_name: asset.display_name,
      source_asset_id: asset.source_asset_id,
      source_display_name: sourceDisplayName,
      source_description: sourceDescription,
      source_tags: sourceTags,
      accepted_phrases: acceptedPhrases,
      quarantined: quarantine,
    });
  }

  const report = {
    schema_version: "myway_blenderkit_semantic_label_audit_v1",
    generated_at: new Date().toISOString(),
    quarantine_requested: quarantine,
    checked_count: checked.length,
    mismatch_count: mismatches.length,
    mismatches,
    checked,
    next:
      "Review mismatches in the Asset Library. Quarantined entries remain available for deliberate removal, but are no longer eligible for sandbox reuse or app promotion.",
  };

  const outputPath = projectPath(REPORT_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ?? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
