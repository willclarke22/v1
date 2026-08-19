import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import type { MyWayAssetRecord } from "../asset-types";
import {
  readSmartAssetImportLedger,
  recordSmartAssetImportLedgerRow,
} from "../asset-import-ledger.server";
import { importManualGlb } from "../providers/manual-glb-provider.server";
import {
  convertSourceModelToGlb,
  materializeArchiveModel,
} from "../smart-asset-intake.server";
import { createAssetTempWorkspace } from "../storage/asset-temp-workspace.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
function csv(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
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
  const runId = text(form, "import_run_id");
  if (!runId) return null;
  const total = Number(text(form, "import_total"));
  const rowIndex = Number(text(form, "import_row_index"));
  return {
    runId,
    total: Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0,
    rowIndex: Number.isFinite(rowIndex) ? Math.max(0, Math.floor(rowIndex)) : 0,
    sourceName: text(form, "import_source_name") || "unknown source",
    batchTitle: text(form, "import_batch_title") || null,
  };
}

function supportedExtension(name: string) {
  return [".glb", ".gltf", ".fbx", ".obj", ".blend"].includes(path.extname(name).toLowerCase());
}


export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get("run_id")?.trim() ?? "";
    if (!runId) {
      return NextResponse.json(
        { ok: false, error: "run_id is required." },
        { status: 400 },
      );
    }
    const result = await readSmartAssetImportLedger(runId);
    return NextResponse.json({
      ok: true,
      import_ledger: result.ledger,
      import_ledger_path: result.ledger_path,
    });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  let ledgerContext: ImportLedgerContext | null = null;
  let archiveCleanup: (() => Promise<void>) | null = null;
  let sourceWorkspaceCleanup: (() => Promise<void>) | null = null;
  let conversionCleanup: (() => Promise<void>) | null = null;
  try {
    const form = await request.formData();
    ledgerContext = importLedgerContext(form);
    const fileValue = form.get("file");
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose a 3D source file or ZIP archive." }, { status: 400 });
    }

    const concept = text(form, "concept");
    if (!concept) {
      return NextResponse.json({ ok: false, error: "A canonical object identity is required." }, { status: 400 });
    }

    const archiveEntryPath = text(form, "archive_entry_path");
    const targetExtentRaw = Number(text(form, "target_extent_m"));
    const targetExtentM =
      Number.isFinite(targetExtentRaw) && targetExtentRaw > 0
        ? Math.min(20, Math.max(0.05, targetExtentRaw))
        : 2;

    let modelFile: {
      name: string;
      size: number;
      type?: string;
      arrayBuffer(): Promise<ArrayBuffer>;
    };
    let originalSourceName = fileValue.name;

    if (archiveEntryPath) {
      if (!fileValue.name.toLowerCase().endsWith(".zip")) {
        throw new Error("archive_entry_path can only be used with a ZIP source.");
      }
      const materialized = await materializeArchiveModel({
        archive: fileValue,
        entryPath: archiveEntryPath,
      });
      archiveCleanup = materialized.cleanup;
      originalSourceName = materialized.originalName;

      if (path.extname(materialized.inputPath).toLowerCase() === ".glb") {
        const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(materialized.inputPath));
        modelFile = {
          name: materialized.originalName,
          size: bytes.length,
          type: "model/gltf-binary",
          async arrayBuffer() {
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          },
        };
      } else {
        const converted = await convertSourceModelToGlb({
          inputPath: materialized.inputPath,
          sourceTypeLabel: path.extname(materialized.inputPath).slice(1).toUpperCase(),
          targetExtentM,
        });
        conversionCleanup = converted.cleanup;
        modelFile = converted.file;
      }
    } else {
      const ext = path.extname(fileValue.name).toLowerCase();
      if (!supportedExtension(fileValue.name)) {
        throw new Error("Supported source formats are GLB, GLTF, FBX, OBJ, BLEND, and ZIP packages containing those model types.");
      }
      if (ext === ".glb") {
        modelFile = fileValue;
      } else {
        if (ext === ".gltf") {
          const sourceText = Buffer.from(await fileValue.arrayBuffer()).toString("utf8");
          const externalUris = [...sourceText.matchAll(/"uri"\s*:\s*"([^"]+)"/g)]
            .map((match) => match[1])
            .filter((uri) => !uri.startsWith("data:"));
          if (externalUris.length) {
            throw new Error(
              `This GLTF references external files (${externalUris.slice(0, 4).join(", ")}). Put the GLTF and its .bin/textures into one ZIP and add that ZIP instead.`,
            );
          }
        }
        const workspace = await createAssetTempWorkspace("smart-source");
        sourceWorkspaceCleanup = workspace.cleanup;
        const inputPath = path.join(workspace.path, path.basename(fileValue.name));
        await mkdir(path.dirname(inputPath), { recursive: true });
        await writeFile(inputPath, Buffer.from(await fileValue.arrayBuffer()));
        const converted = await convertSourceModelToGlb({
          inputPath,
          sourceTypeLabel: ext.slice(1).toUpperCase(),
          targetExtentM,
        });
        conversionCleanup = converted.cleanup;
        modelFile = converted.file;
      }
    }

    const extraProvenance = [
      text(form, "provenance_notes"),
      archiveEntryPath
        ? `Imported through universal Asset Intake from ZIP "${fileValue.name}" entry "${archiveEntryPath}".`
        : path.extname(originalSourceName).toLowerCase() === ".glb"
          ? ""
          : `Original source format was ${path.extname(originalSourceName).toLowerCase() || "unknown"} (${originalSourceName}); MyWay converted it to canonical GLB before library registration.`,
    ].filter(Boolean).join(" ");

    const result = await importManualGlb({
      file: modelFile,
      concept,
      aliases: csv(text(form, "aliases")),
      semanticTags: csv(text(form, "semantic_tags")),
      domain: text(form, "domain") || "asset_library_universal_import",
      targetExtentM,
      sourceProvider: text(form, "source_provider") || "Manual upload",
      sourceUrl: text(form, "source_url") || null,
      sourceAssetId: text(form, "source_asset_id") || null,
      assetTitle: text(form, "asset_title") || null,
      creatorName: text(form, "creator_name") || null,
      licenseKind: licenseKind(text(form, "license_kind")),
      licenseVersion: text(form, "license_version") || null,
      attribution: text(form, "attribution") || null,
      modificationNotice: text(form, "modification_notice") || null,
      downloadedAt: text(form, "downloaded_at") || null,
      provenanceNotes: extraProvenance || null,
      runVision: text(form, "run_vision") !== "false",
      runEmbedding: text(form, "run_embedding") !== "false",
    });

    const visionQueued = Boolean(result.enrichment_entry);
    const embeddingQueued =
      result.enrichment_entry?.mode === "full";
    const message = result.repaired_existing
      ? visionQueued
        ? embeddingQueued
          ? "Existing source identity repaired; the missing runtime model was re-staged and Omni vision plus embedding are queued."
          : "Existing source identity repaired; the missing runtime model was re-staged and Omni vision is queued with embedding deferred."
        : "Existing source identity repaired; the missing runtime model was re-staged with Vision and Embedding providers deferred."
      : result.created
      ? visionQueued
        ? embeddingQueued
          ? "Asset imported; Omni vision and embedding are queued. It is now in Needs review."
          : "Asset imported; Omni vision is queued and embedding is deferred. It is now in Needs review."
        : "Asset imported with Vision and Embedding provider calls deferred. It is now in Needs review."
      : `This source matches an existing library asset${result.duplicate_of ? ` (${result.duplicate_of})` : ""}; MyWay did not create a duplicate.`;

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
      source: "universal_import",
      ...result,
      vision_queued: visionQueued,
      embedding_queued: embeddingQueued,
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
      { ok: false, error },
      { status: 502 },
    );
  } finally {
    if (conversionCleanup) {
      await conversionCleanup().catch(() => undefined);
    }
    if (sourceWorkspaceCleanup) {
      await sourceWorkspaceCleanup().catch(() => undefined);
    }
    if (archiveCleanup) {
      await archiveCleanup().catch(() => undefined);
    }
  }
}
