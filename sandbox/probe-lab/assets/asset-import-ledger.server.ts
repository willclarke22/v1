import {
  readDurableAssetJson,
  writeDurableAssetJson,
} from "./storage/asset-durable-artifacts.server";

export type SmartAssetImportLedgerRowStatus =
  | "imported"
  | "duplicate"
  | "failed";

export type SmartAssetImportLedgerRow = {
  row_index: number;
  source_name: string;
  asset_id: string | null;
  status: SmartAssetImportLedgerRowStatus;
  message: string | null;
  recorded_at: string;
};

export type SmartAssetImportLedger = {
  schema_version: "myway_smart_asset_import_ledger_v1";
  run_id: string;
  batch_title: string | null;
  total: number;
  accounted: number;
  imported: number;
  duplicate: number;
  failed: number;
  rows: SmartAssetImportLedgerRow[];
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

function safeRunId(value: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  if (!cleaned) {
    throw new Error("Import run ID is required.");
  }
  return cleaned;
}

export function smartAssetImportLedgerPath(runId: string) {
  return `sandbox/probe-lab/assets/import-ledgers/${safeRunId(runId)}.json`;
}

export async function recordSmartAssetImportLedgerRow(input: {
  runId: string;
  total: number;
  rowIndex: number;
  sourceName: string;
  batchTitle?: string | null;
  assetId?: string | null;
  status: SmartAssetImportLedgerRowStatus;
  message?: string | null;
}) {
  const runId = safeRunId(input.runId);
  const path = smartAssetImportLedgerPath(runId);
  const now = new Date().toISOString();
  const existing =
    await readDurableAssetJson<SmartAssetImportLedger>(path);

  const rows = [...(existing?.rows ?? [])];
  const nextRow: SmartAssetImportLedgerRow = {
    row_index: Math.max(0, Math.floor(input.rowIndex)),
    source_name: input.sourceName.trim().slice(0, 240) || "unknown source",
    asset_id: input.assetId?.trim() || null,
    status: input.status,
    message: input.message?.trim().slice(0, 1000) || null,
    recorded_at: now,
  };
  const existingIndex = rows.findIndex(
    (row) => row.row_index === nextRow.row_index,
  );
  if (existingIndex >= 0) {
    rows[existingIndex] = nextRow;
  } else {
    rows.push(nextRow);
  }
  rows.sort((left, right) => left.row_index - right.row_index);

  const imported = rows.filter((row) => row.status === "imported").length;
  const duplicate = rows.filter((row) => row.status === "duplicate").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const accounted = rows.length;
  const total = Math.max(accounted, Math.max(0, Math.floor(input.total)));

  const ledger: SmartAssetImportLedger = {
    schema_version: "myway_smart_asset_import_ledger_v1",
    run_id: runId,
    batch_title:
      input.batchTitle?.trim().slice(0, 240) ||
      existing?.batch_title ||
      null,
    total,
    accounted,
    imported,
    duplicate,
    failed,
    rows,
    started_at: existing?.started_at ?? now,
    updated_at: now,
    completed_at: accounted >= total ? now : null,
  };

  await writeDurableAssetJson(path, ledger);
  return {
    ledger,
    ledger_path: path,
  };
}

export async function readSmartAssetImportLedger(
  runId: string,
) {
  const path = smartAssetImportLedgerPath(runId);
  return {
    ledger_path: path,
    ledger:
      await readDurableAssetJson<SmartAssetImportLedger>(
        path,
      ),
  };
}
