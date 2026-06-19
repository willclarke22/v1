#!/usr/bin/env tsx

/**
 * MyWay Phase A workbook JSON repair script.
 *
 * Purpose:
 *   Apply narrow, schema-preserving repairs to audited Phase A workbook JSON
 *   before running export-validate-phase-a-workbooks.ts.
 *
 * It fixes the current known validation clusters:
 *   1) delivery_context.presentation_styles_used accidentally containing
 *      support/modality tags like "contrast" or "auditory_cue".
 *   2) drag/drop correct_placements or attempt.placements encoded as
 *      target_id -> item_id[] instead of item_id -> target_id.
 *   3) probe/attempt pair mismatches:
 *        apply_transfer + single_choice -> predict + single_choice
 *        predict + text                 -> explain + text
 *        discriminate + text            -> explain + text
 *
 * It creates a timestamped backup of every workbook it modifies.
 *
 * Run from repo root:
 *   npx tsx scripts/engine-datasets/repair-phase-a-workbook-json.ts
 *
 * Dependency:
 *   pnpm add -D xlsx
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

type JsonRecord = Record<string, unknown>;

type RepairStats = {
  workbook: string;
  sheet: string;
  rowNumber: number;
  changes: string[];
};

const REPO_ROOT = process.cwd();
const DEFAULT_WORKBOOK_DIR = path.join(REPO_ROOT, "datasets", "engine-datasets", "phase-a-workbooks");
const WORKBOOK_DIR = getArgValue("--workbooks-dir") ?? DEFAULT_WORKBOOK_DIR;
const DRY_RUN = process.argv.includes("--dry-run");

const COLUMN_ALIASES = {
  inputJson: ["input_json", "model_input_json", "input json", "input"],
  outputJson: ["output_json", "model_output_json", "output json", "output"],
  jsonlLine: ["jsonl_line", "jsonl", "jsonl record", "jsonl_record", "training_jsonl_line"],
};

const PRESENTATION_STYLES = new Set([
  "plain_direct",
  "gentle_coaching",
  "analogy_based",
  "metaphor_based",
  "concrete_examples",
  "step_by_step",
  "visual_description",
  "curiosity_question",
  "real_world_connection",
]);

const SUPPORT_KINDS = new Set([
  "analogy",
  "metaphor",
  "contrast",
  "example",
  "real_world_connection",
  "visual_description",
  "step_by_step_frame",
  "curiosity_hook",
]);

main();

function main(): void {
  if (!fs.existsSync(WORKBOOK_DIR)) {
    fail(`Workbook directory does not exist: ${WORKBOOK_DIR}`);
  }

  const workbookFiles = fs
    .readdirSync(WORKBOOK_DIR)
    .filter((fileName) => fileName.toLowerCase().endsWith(".xlsx") && !fileName.startsWith("~$"))
    .sort((a, b) => a.localeCompare(b));

  if (workbookFiles.length === 0) {
    fail(`No .xlsx files found in: ${WORKBOOK_DIR}`);
  }

  const backupDir = path.join(
    WORKBOOK_DIR,
    `backup-before-json-repair-${makeTimestamp()}`,
  );

  const allStats: RepairStats[] = [];
  let modifiedWorkbookCount = 0;

  console.log(`Reading ${workbookFiles.length} workbook(s) from ${relativeToRoot(WORKBOOK_DIR)}...`);
  if (DRY_RUN) {
    console.log("Dry run mode: no files will be written.");
  }

  for (const fileName of workbookFiles) {
    const workbookPath = path.join(WORKBOOK_DIR, fileName);
    const wb = XLSX.readFile(workbookPath, { cellDates: false, raw: false });
    let workbookChanged = false;

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
        blankrows: false,
      });

      if (rows.length === 0) continue;

      let sheetChanged = false;

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const changes: string[] = [];

        const inputKey = findAliasedKey(row, COLUMN_ALIASES.inputJson);
        const outputKey = findAliasedKey(row, COLUMN_ALIASES.outputJson);
        const jsonlKey = findAliasedKey(row, COLUMN_ALIASES.jsonlLine);

        if (inputKey) {
          const result = repairJsonCell(row[inputKey], `${fileName}:${sheetName}:${rowNumber}:input_json`);
          if (result.changed) {
            row[inputKey] = stringifyStable(result.value);
            changes.push(...result.changes.map((c) => `input_json: ${c}`));
          }
        }

        if (outputKey) {
          const result = repairJsonCell(row[outputKey], `${fileName}:${sheetName}:${rowNumber}:output_json`);
          if (result.changed) {
            row[outputKey] = stringifyStable(result.value);
            changes.push(...result.changes.map((c) => `output_json: ${c}`));
          }
        }

        if (jsonlKey) {
          const result = repairJsonlLine(row[jsonlKey], `${fileName}:${sheetName}:${rowNumber}:jsonl_line`);
          if (result.changed) {
            row[jsonlKey] = stringifyStable(result.value);
            changes.push(...result.changes.map((c) => `jsonl_line: ${c}`));
          }
        }

        if (changes.length > 0) {
          sheetChanged = true;
          workbookChanged = true;
          allStats.push({ workbook: fileName, sheet: sheetName, rowNumber, changes });
        }
      });

      if (sheetChanged && !DRY_RUN) {
        wb.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
      }
    }

    if (workbookChanged) {
      modifiedWorkbookCount += 1;
      if (!DRY_RUN) {
        ensureDir(backupDir);
        fs.copyFileSync(workbookPath, path.join(backupDir, fileName));
        XLSX.writeFile(wb, workbookPath, { bookType: "xlsx" });
      }
    }
  }

  const byWorkbook = countBy(allStats, (stat) => stat.workbook);
  const changeCount = allStats.reduce((sum, stat) => sum + stat.changes.length, 0);

  console.log("\nRepair scan complete.");
  console.log(`Modified workbook(s): ${modifiedWorkbookCount}`);
  console.log(`Row(s) with changes: ${allStats.length}`);
  console.log(`Total JSON repair action(s): ${changeCount}`);
  console.log(`By workbook: ${JSON.stringify(byWorkbook, null, 2)}`);

  if (!DRY_RUN && modifiedWorkbookCount > 0) {
    console.log(`Backup folder: ${relativeToRoot(backupDir)}`);
  }

  const sample = allStats.slice(0, 12);
  if (sample.length > 0) {
    console.log("\nSample changes:");
    for (const stat of sample) {
      console.log(`- ${stat.workbook} / ${stat.sheet} row ${stat.rowNumber}`);
      for (const change of stat.changes.slice(0, 5)) {
        console.log(`  - ${change}`);
      }
      if (stat.changes.length > 5) {
        console.log(`  - ...${stat.changes.length - 5} more`);
      }
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run only. Re-run without --dry-run to apply repairs.");
  } else {
    console.log("\nNext step:");
    console.log("  npx tsx scripts/engine-datasets/export-validate-phase-a-workbooks.ts");
  }
}

function repairJsonCell(value: unknown, context: string): { changed: boolean; value: unknown; changes: string[] } {
  if (!hasUsefulValue(value)) {
    return { changed: false, value, changes: [] };
  }

  const parsed = parseJsonCell(value, context);
  if (parsed === undefined) {
    return { changed: false, value, changes: [] };
  }

  const changes: string[] = [];
  const repaired = deepRepair(parsed, "$", changes);
  return { changed: changes.length > 0, value: repaired, changes };
}

function repairJsonlLine(value: unknown, context: string): { changed: boolean; value: unknown; changes: string[] } {
  if (!hasUsefulValue(value)) {
    return { changed: false, value, changes: [] };
  }

  const parsed = parseJsonCell(value, context);
  if (!isRecord(parsed)) {
    return { changed: false, value, changes: [] };
  }

  const changes: string[] = [];

  for (const key of ["input", "input_json", "model_input", "output", "output_json", "model_output"] as const) {
    if (key in parsed) {
      parsed[key] = deepRepair(parsed[key], `$.${key}`, changes);
    }
  }

  return { changed: changes.length > 0, value: parsed, changes };
}

function deepRepair(value: unknown, pathText: string, changes: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => deepRepair(item, `${pathText}[${index}]`, changes));
  }

  if (!isRecord(value)) {
    return value;
  }

  for (const key of Object.keys(value)) {
    value[key] = deepRepair(value[key], `${pathText}.${key}`, changes);
  }

  repairDeliveryContext(value, pathText, changes);
  repairPlacementRecordProperty(value, "correct_placements", pathText, changes);
  repairPlacementRecordProperty(value, "placements", pathText, changes);
  repairProbeAttemptPair(value, pathText, changes);

  return value;
}

function repairDeliveryContext(record: JsonRecord, pathText: string, changes: string[]): void {
  const hasDeliveryContextShape = "bridge_level" in record && "language_policy" in record;
  if (!hasDeliveryContextShape) return;

  const rawStyles = Array.isArray(record.presentation_styles_used)
    ? record.presentation_styles_used
    : undefined;

  const rawSupportKinds = Array.isArray(record.support_kinds_used)
    ? record.support_kinds_used
    : [];

  if (!rawStyles && rawSupportKinds.length === 0) return;

  const styles: string[] = [];
  const supportKinds: string[] = [];

  for (const raw of rawSupportKinds) {
    if (typeof raw !== "string") continue;
    if (SUPPORT_KINDS.has(raw)) {
      pushUnique(supportKinds, raw);
    } else if (raw === "auditory_cue") {
      pushUnique(supportKinds, "example");
      changes.push(`${pathText}.support_kinds_used migrated invalid auditory_cue -> example`);
    } else {
      changes.push(`${pathText}.support_kinds_used removed invalid value ${JSON.stringify(raw)}`);
    }
  }

  if (rawStyles) {
    for (const raw of rawStyles) {
      if (typeof raw !== "string") continue;

      if (PRESENTATION_STYLES.has(raw)) {
        pushUnique(styles, raw);
        continue;
      }

      if (raw === "contrast") {
        pushUnique(supportKinds, "contrast");
        changes.push(`${pathText}.presentation_styles_used moved contrast -> support_kinds_used`);
        continue;
      }

      if (raw === "auditory_cue") {
        pushUnique(supportKinds, "example");
        changes.push(`${pathText}.presentation_styles_used migrated auditory_cue -> support_kinds_used example`);
        continue;
      }

      if (SUPPORT_KINDS.has(raw)) {
        pushUnique(supportKinds, raw);
        changes.push(`${pathText}.presentation_styles_used moved support kind ${raw} -> support_kinds_used`);
        continue;
      }

      changes.push(`${pathText}.presentation_styles_used removed invalid value ${JSON.stringify(raw)}`);
    }
  }

  if (rawStyles && rawStyles.length > 0 && styles.length === 0) {
    styles.push("plain_direct");
    changes.push(`${pathText}.presentation_styles_used defaulted to plain_direct`);
  }

  if (rawStyles) {
    record.presentation_styles_used = styles;
  }

  if (rawSupportKinds.length > 0 || supportKinds.length > 0) {
    record.support_kinds_used = supportKinds;
  }
}

function repairPlacementRecordProperty(
  record: JsonRecord,
  propertyName: "correct_placements" | "placements",
  pathText: string,
  changes: string[],
): void {
  const placementRecord = record[propertyName];
  if (!isRecord(placementRecord)) return;

  const entries = Object.entries(placementRecord);
  const hasArrayValues = entries.some(([, targetOrItems]) => Array.isArray(targetOrItems));
  if (!hasArrayValues) return;

  const inverted: Record<string, string> = {};
  const leftovers: Record<string, string> = {};

  for (const [targetId, targetOrItems] of entries) {
    if (Array.isArray(targetOrItems)) {
      for (const itemId of targetOrItems) {
        if (typeof itemId === "string" && itemId.trim()) {
          inverted[itemId] = targetId;
        }
      }
    } else if (typeof targetOrItems === "string") {
      leftovers[targetId] = targetOrItems;
    }
  }

  record[propertyName] = { ...leftovers, ...inverted };
  changes.push(`${pathText}.${propertyName} inverted array-valued target map to item_id -> target_id strings`);
}

function repairProbeAttemptPair(record: JsonRecord, pathText: string, changes: string[]): void {
  const probeType = record.probe_type;
  const attemptType = record.expected_attempt_type;

  if (typeof probeType !== "string" || typeof attemptType !== "string") return;

  if (probeType === "apply_transfer" && attemptType === "single_choice") {
    record.probe_type = "predict";
    changes.push(`${pathText}.probe_type changed apply_transfer -> predict for single_choice attempt`);
    return;
  }

  if (probeType === "predict" && attemptType === "text") {
    record.probe_type = "explain";
    changes.push(`${pathText}.probe_type changed predict -> explain for text attempt`);
    return;
  }

  if (probeType === "discriminate" && attemptType === "text") {
    record.probe_type = "explain";
    changes.push(`${pathText}.probe_type changed discriminate -> explain for text attempt`);
  }
}

function findAliasedKey(row: Record<string, unknown>, aliases: string[]): string | null {
  const entries = Object.keys(row).map((key) => ({ key, normalized: normalizeName(key) }));
  for (const alias of aliases) {
    const normalizedAlias = normalizeName(alias);
    const hit = entries.find((entry) => entry.normalized === normalizedAlias);
    if (hit) return hit.key;
  }
  return null;
}

function parseJsonCell(value: unknown, context: string): unknown | undefined {
  if (typeof value !== "string") {
    if (typeof value === "object" && value !== null) return value;
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn(`Skipping unparseable JSON at ${context}: ${(error as Error).message}`);
    return undefined;
  }
}

function hasUsefulValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyStable(value: unknown): string {
  return JSON.stringify(value);
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function getArgValue(name: string): string | undefined {
  const withEquals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];

  return undefined;
}

function relativeToRoot(filePath: string): string {
  return path.relative(REPO_ROOT, filePath) || ".";
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
