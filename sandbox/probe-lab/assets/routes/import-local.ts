
import { NextRequest, NextResponse } from "next/server";

import type { MyWayAssetRecord } from "../asset-types";
import { recordSmartAssetImportLedgerRow } from "../asset-import-ledger.server";
import { importManualGlb } from "../providers/manual-glb-provider.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function csvValues(value: string) {
  return [...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function licenseKind(value: string): MyWayAssetRecord["license_kind"] {
  if (value === "self_owned") return "self_owned";
  if (value === "cc0") return "cc0";
  if (value === "cc_by") return "cc_by";
  if (value === "cc_by_4_0") return "cc_by_4_0";
  if (value === "royalty_free") return "royalty_free";
  return "unknown";
}


type ImportLedgerContext = {
  runId: string;
  total: number;
  rowIndex: number;
  sourceName: string;
  batchTitle: string | null;
};

function importLedgerContext(form: FormData): ImportLedgerContext | null {
  const runId = formText(form, "import_run_id");
  if (!runId) return null;
  const total = Number(formText(form, "import_total"));
  const rowIndex = Number(formText(form, "import_row_index"));
  return {
    runId,
    total: Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0,
    rowIndex: Number.isFinite(rowIndex) ? Math.max(0, Math.floor(rowIndex)) : 0,
    sourceName: formText(form, "import_source_name") || "unknown source",
    batchTitle: formText(form, "import_batch_title") || null,
  };
}

export async function POST(request: NextRequest) {
  let ledgerContext: ImportLedgerContext | null = null;
  try {
    const formData = await request.formData();
    ledgerContext = importLedgerContext(formData);
    const fileValue = formData.get("file");
    const concept = formText(formData, "concept");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "A GLB file is required." },
        { status: 400 },
      );
    }

    if (!concept) {
      return NextResponse.json(
        { ok: false, error: "A canonical object identity is required." },
        { status: 400 },
      );
    }

    const targetExtentRaw = Number(formText(formData, "target_extent_m"));
    const result = await importManualGlb({
      file: fileValue,
      concept,
      aliases: csvValues(formText(formData, "aliases")),
      semanticTags: csvValues(formText(formData, "semantic_tags")),
      domain: formText(formData, "domain") || "asset_library_manual_upload",
      targetExtentM:
        Number.isFinite(targetExtentRaw) && targetExtentRaw > 0
          ? targetExtentRaw
          : 2,
      sourceProvider: formText(formData, "source_provider") || "Manual upload",
      sourceUrl: formText(formData, "source_url") || null,
      sourceAssetId: formText(formData, "source_asset_id") || null,
      assetTitle: formText(formData, "asset_title") || null,
      creatorName: formText(formData, "creator_name") || null,
      licenseKind: licenseKind(formText(formData, "license_kind")),
      licenseVersion: formText(formData, "license_version") || null,
      attribution: formText(formData, "attribution") || null,
      modificationNotice:
        formText(formData, "modification_notice") || null,
      downloadedAt: formText(formData, "downloaded_at") || null,
      provenanceNotes: formText(formData, "provenance_notes") || null,
      runVision: formText(formData, "run_vision") !== "false",
      runEmbedding: formText(formData, "run_embedding") !== "false",
    });

    const message = result.repaired_existing
      ? result.enrichment_entry
        ? result.enrichment_entry.mode === "vision_only"
          ? "The existing source identity had a missing runtime model. MyWay re-staged the model and queued Omni vision with embeddings deferred."
          : "The existing source identity had a missing runtime model. MyWay re-staged the model and queued Omni vision plus embedding."
        : "The existing source identity had a missing runtime model. MyWay re-staged it without starting Vision or Embedding providers."
      : result.created
      ? result.enrichment_entry
        ? result.enrichment_entry.mode === "vision_only"
          ? "The local GLB was validated, normalized, registered, and queued for Omni vision with embeddings deferred."
          : "The local GLB was validated, normalized, registered, and queued for Omni appearance analysis plus embedding."
        : "The local GLB was validated, normalized, and registered with provider enrichment deferred. It is in Needs review."
      : `This GLB matches an existing library asset${result.duplicate_of ? ` (${result.duplicate_of})` : ""}; MyWay did not create a duplicate.`;

    const ledgerResult = ledgerContext
      ? await recordSmartAssetImportLedgerRow({
          runId: ledgerContext.runId,
          total: ledgerContext.total,
          rowIndex: ledgerContext.rowIndex,
          sourceName: ledgerContext.sourceName,
          batchTitle: ledgerContext.batchTitle,
          assetId: result.asset.asset_id,
          status: result.created ? "imported" : "duplicate",
          message,
        })
      : null;

    return NextResponse.json({
      ok: true,
      source: "manual",
      ...result,
      vision_queued: Boolean(result.enrichment_entry),
      import_ledger: ledgerResult?.ledger ?? null,
      import_ledger_path: ledgerResult?.ledger_path ?? null,
      message,
    });
  } catch (caught) {
    const error =
      caught instanceof Error ? caught.message : String(caught);
    if (ledgerContext) {
      await recordSmartAssetImportLedgerRow({
        runId: ledgerContext.runId,
        total: ledgerContext.total,
        rowIndex: ledgerContext.rowIndex,
        sourceName: ledgerContext.sourceName,
        batchTitle: ledgerContext.batchTitle,
        assetId: null,
        status: "failed",
        message: error,
      }).catch(() => undefined);
    }
    return NextResponse.json(
      {
        ok: false,
        error,
        debug_path:
          "sandbox/probe-lab/assets/debug/latest-manual-glb-import.json",
      },
      { status: 502 },
    );
  }
}
