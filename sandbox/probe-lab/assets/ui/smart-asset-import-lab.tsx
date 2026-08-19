"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  MAX_SMART_ASSET_BATCH_FILES,
  conceptFromSourceName,
  extractSmartArchiveEntry,
  inspectSmartAssetArchiveBuffer,
  smartModelExtension,
  type SmartArchiveEntry,
} from "../smart-asset-archive";
import {
  identifyKnownBundle,
  metadataForKnownBundleMember,
  type KnownBundleLicenseKind,
} from "../known-asset-bundles";

type LicenseKind =
  | "unknown"
  | "self_owned"
  | "cc0"
  | "cc_by"
  | "cc_by_4_0"
  | "royalty_free";

type RowStatus = "draft" | "importing" | "imported" | "duplicate" | "failed";

type IntakeRow = {
  row_id: string;
  source_file: File;
  archive_entry: SmartArchiveEntry | null;
  bundle_id: string | null;
  bundle_title: string | null;
  selected: boolean;
  concept: string;
  aliases: string;
  semantic_tags: string;
  source_title: string;
  creator_name: string;
  source_provider: string;
  source_url: string;
  source_asset_id: string;
  license_kind: LicenseKind;
  modification_notice: string;
  provenance_notes: string;
  attribution_confidence: "known_bundle" | "filename" | "manual_required";
  status: RowStatus;
  message: string | null;
  imported_asset_id: string | null;
};

type ImportLedgerSummary = {
  run_id: string;
  total: number;
  accounted: number;
  imported: number;
  duplicate: number;
  failed: number;
  completed_at: string | null;
};

type ImportResponse = {
  ok: boolean;
  created?: boolean;
  duplicate_of?: string | null;
  asset?: { asset_id: string; display_name: string };
  error?: string;
  message?: string;
  vision_queued?: boolean;
  embedding_queued?: boolean;
  import_ledger?: ImportLedgerSummary | null;
  import_ledger_path?: string | null;
};

type ImportProgress = {
  runId: string;
  total: number;
  accounted: number;
  imported: number;
  duplicate: number;
  failed: number;
  current: string | null;
  ledgerPath: string | null;
};

type SmartAssetImportLabProps = {
  onImportComplete?: (assetId: string) => void;
  onBatchComplete?: (input: {
    lastAssetId: string | null;
    imported: number;
    duplicate: number;
    failed: number;
  }) => void;
  onRunningChange?: (running: boolean) => void;
};

const DEFAULT_MODIFICATION_NOTICE =
  "Normalized and processed for real-time use by MyWay.";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function basename(value: string) {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function filenameSourceIdentity(fileName: string) {
  const stem = basename(fileName).replace(/\.(glb|gltf|fbx|obj|blend)$/i, "");
  const match = stem.match(/^(.+?)\s+by\s+(.+?)(?:\s+-\s+([A-Za-z0-9_-]{4,80}))?$/i);
  return match
    ? {
        title: match[1]!.trim(),
        creator: match[2]!.trim(),
        sourceId: match[3]?.trim() ?? stem,
      }
    : null;
}
function rowErrors(row: IntakeRow) {
  const errors: string[] = [];
  if (!row.concept.trim()) errors.push("object identity");
  if (row.license_kind === "unknown") errors.push("licence");
  if (row.license_kind !== "self_owned") {
    if (!row.source_provider.trim()) errors.push("source provider");
    if (!row.source_url.trim()) errors.push("source page");
    if (!row.source_asset_id.trim()) errors.push("source ID");
  }
  if (row.license_kind === "cc_by" || row.license_kind === "cc_by_4_0") {
    if (!row.creator_name.trim()) errors.push("creator");
    if (!row.modification_notice.trim()) errors.push("modification notice");
  }
  return errors;
}

export function SmartAssetImportLab({
  onImportComplete,
  onBatchComplete,
  onRunningChange,
}: SmartAssetImportLabProps) {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [runVision, setRunVision] = useState(true);
  const [runEmbedding, setRunEmbedding] = useState(true);
  const [targetExtentM, setTargetExtentM] = useState("2");
  const [domain, setDomain] = useState("asset_library_universal_import");
  const [defaultLicense, setDefaultLicense] = useState<LicenseKind>("unknown");
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultSourceUrl, setDefaultSourceUrl] = useState("");
  const [defaultCreator, setDefaultCreator] = useState("");
  const [running, setRunning] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("myway_smart_asset_import_defaults_v1");
      if (!saved) return;
      const value = JSON.parse(saved) as {
        runVision?: boolean;
        runEmbedding?: boolean;
        targetExtentM?: string;
        domain?: string;
        defaultLicense?: LicenseKind;
        defaultProvider?: string;
        defaultSourceUrl?: string;
        defaultCreator?: string;
      };
      setRunVision(value.runVision ?? true);
      setRunEmbedding(value.runEmbedding ?? true);
      setTargetExtentM(value.targetExtentM ?? "2");
      setDomain(value.domain ?? "asset_library_universal_import");
      setDefaultLicense(value.defaultLicense ?? "unknown");
      setDefaultProvider(value.defaultProvider ?? "");
      setDefaultSourceUrl(value.defaultSourceUrl ?? "");
      setDefaultCreator(value.defaultCreator ?? "");
    } catch {
      // Preferences are optional.
    }
  }, []);

  useEffect(() => {
    const lastRunId = localStorage.getItem(
      "myway_smart_asset_import_last_run_v1",
    );
    if (!lastRunId) return;

    let active = true;
    void fetch(
      `/api/sandbox/probe-lab/assets/import-smart?run_id=${encodeURIComponent(lastRunId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload = (await response.json()) as ImportResponse;
        if (!active || !response.ok || !payload.ok || !payload.import_ledger) {
          return;
        }
        const ledger = payload.import_ledger;
        setProgress({
          runId: ledger.run_id,
          total: ledger.total,
          accounted: ledger.accounted,
          imported: ledger.imported,
          duplicate: ledger.duplicate,
          failed: ledger.failed,
          current: null,
          ledgerPath: payload.import_ledger_path ?? null,
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "myway_smart_asset_import_defaults_v1",
      JSON.stringify({
        runVision,
        runEmbedding,
        targetExtentM,
        domain,
        defaultLicense,
        defaultProvider,
        defaultSourceUrl,
        defaultCreator,
      }),
    );
  }, [
    runVision,
    runEmbedding,
    targetExtentM,
    domain,
    defaultLicense,
    defaultProvider,
    defaultSourceUrl,
    defaultCreator,
  ]);

  useEffect(() => {
    onRunningChange?.(running);
    return () => onRunningChange?.(false);
  }, [running, onRunningChange]);

  const summary = useMemo(() => {
    const selected = rows.filter((row) => row.selected);
    return {
      total: rows.length,
      selected: selected.length,
      ready: selected.filter(
        (row) =>
          rowErrors(row).length === 0 &&
          row.status !== "imported" &&
          row.status !== "duplicate",
      ).length,
      unresolved: selected.filter((row) => rowErrors(row).length > 0).length,
      imported: rows.filter((row) => row.status === "imported").length,
      duplicate: rows.filter((row) => row.status === "duplicate").length,
      failed: rows.filter((row) => row.status === "failed").length,
      known: rows.filter((row) => row.attribution_confidence === "known_bundle").length,
    };
  }, [rows]);

  function updateRow(rowId: string, patch: Partial<IntakeRow>) {
    setRows((current) =>
      current.map((row) =>
        row.row_id === rowId
          ? {
              ...row,
              ...patch,
              status:
                row.status === "imported" || row.status === "duplicate"
                  ? row.status
                  : patch.status ?? "draft",
              message: patch.message === undefined ? null : patch.message,
            }
          : row,
      ),
    );
  }

  async function addFiles(files: FileList | File[]) {
    setGlobalError(null);
    setGlobalMessage(null);
    const chosen = Array.from(files);
    const pending: IntakeRow[] = [];
    const notes: string[] = [];

    for (const file of chosen) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".zip")) {
        try {
          const buffer = await file.arrayBuffer();
          const inspection = inspectSmartAssetArchiveBuffer(buffer);
          const known = identifyKnownBundle(
            file.name,
            inspection.model_entries.map((entry) => entry.file_name),
          );
          if (known) {
            notes.push(
              `${known.title}: ${inspection.model_entries.length} models recognized with a local per-model licensing manifest.`,
            );
          } else {
            notes.push(
              `${file.name}: ${inspection.model_entries.length} models found; licensing needs to be supplied for unresolved rows.`,
            );
          }

          for (const entry of inspection.model_entries) {
            const knownMetadata = metadataForKnownBundleMember(
              known?.id ?? null,
              entry.path,
            );
            const filenameMetadata = filenameSourceIdentity(entry.file_name);
            const sourceTitle =
              knownMetadata?.source_title ??
              filenameMetadata?.title ??
              conceptFromSourceName(entry.file_name);
            const creator =
              knownMetadata?.creator_name ??
              filenameMetadata?.creator ??
              "";
            pending.push({
              row_id: uid(),
              source_file: file,
              archive_entry: entry,
              bundle_id: known?.id ?? null,
              bundle_title: known?.title ?? file.name.replace(/\.zip$/i, ""),
              selected: true,
              concept: sourceTitle.toLowerCase(),
              aliases: "",
              semantic_tags: known?.title ? "office, workplace" : "",
              source_title: sourceTitle,
              creator_name: creator,
              source_provider: knownMetadata?.source_provider ?? defaultProvider,
              source_url: knownMetadata?.source_url ?? defaultSourceUrl,
              source_asset_id:
                knownMetadata?.source_asset_id ??
                filenameMetadata?.sourceId ??
                `${file.name}:${entry.path}`,
              license_kind:
                (knownMetadata?.license_kind as KnownBundleLicenseKind | undefined) ??
                defaultLicense,
              modification_notice:
                knownMetadata?.license_kind === "cc_by" ||
                knownMetadata?.license_kind === "cc_by_4_0"
                  ? DEFAULT_MODIFICATION_NOTICE
                  : "",
              provenance_notes: knownMetadata
                ? `Known Poly Pizza bundle "${knownMetadata.bundle_title}" member "${entry.path}". Bundle source: ${knownMetadata.bundle_source_url}.`
                : `Imported from ZIP "${file.name}" entry "${entry.path}".`,
              attribution_confidence: knownMetadata
                ? "known_bundle"
                : filenameMetadata
                  ? "filename"
                  : "manual_required",
              status: "draft",
              message: null,
              imported_asset_id: null,
            });
          }
        } catch (caught) {
          setGlobalError(
            `${file.name}: ${caught instanceof Error ? caught.message : String(caught)}`,
          );
        }
        continue;
      }

      if (!smartModelExtension(file.name)) {
        notes.push(
          `${file.name} was ignored. Loose sidecars should be placed in the same ZIP as their GLTF/OBJ model.`,
        );
        continue;
      }

      const filenameMetadata = filenameSourceIdentity(file.name);
      const title = filenameMetadata?.title ?? conceptFromSourceName(file.name);
      pending.push({
        row_id: uid(),
        source_file: file,
        archive_entry: null,
        bundle_id: null,
        bundle_title: null,
        selected: true,
        concept: title.toLowerCase(),
        aliases: "",
        semantic_tags: "",
        source_title: title,
        creator_name: filenameMetadata?.creator ?? defaultCreator,
        source_provider: defaultProvider,
        source_url: defaultSourceUrl,
        source_asset_id: filenameMetadata?.sourceId ?? basename(file.name),
        license_kind: defaultLicense,
        modification_notice:
          defaultLicense === "cc_by" || defaultLicense === "cc_by_4_0"
            ? DEFAULT_MODIFICATION_NOTICE
            : "",
        provenance_notes: `Added through universal Asset Intake as ${file.name}.`,
        attribution_confidence: filenameMetadata ? "filename" : "manual_required",
        status: "draft",
        message: null,
        imported_asset_id: null,
      });
    }

    if (rows.length + pending.length > MAX_SMART_ASSET_BATCH_FILES) {
      setGlobalError(
        `This would create ${rows.length + pending.length} model rows. Import Asset accepts at most ${MAX_SMART_ASSET_BATCH_FILES} models per batch.`,
      );
      return;
    }
    setRows((current) => [...current, ...pending]);
    setGlobalMessage(
      [
        pending.length ? `${pending.length} model${pending.length === 1 ? "" : "s"} added.` : "No model rows were added.",
        ...notes,
      ].join(" "),
    );
  }

  function applyDefaultsToUnresolved() {
    setRows((current) =>
      current.map((row) => {
        if (rowErrors(row).length === 0) return row;
        const license = row.license_kind === "unknown" ? defaultLicense : row.license_kind;
        return {
          ...row,
          license_kind: license,
          source_provider: row.source_provider || defaultProvider,
          source_url: row.source_url || defaultSourceUrl,
          creator_name: row.creator_name || defaultCreator,
          modification_notice:
            row.modification_notice ||
            (license === "cc_by" || license === "cc_by_4_0"
              ? DEFAULT_MODIFICATION_NOTICE
              : ""),
        };
      }),
    );
  }

  async function fileForRow(row: IntakeRow) {
    if (!row.archive_entry) return row.source_file;
    if (row.archive_entry.extension !== ".glb") return row.source_file;
    const buffer = await row.source_file.arrayBuffer();
    const bytes = await extractSmartArchiveEntry(buffer, row.archive_entry);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return new File([copy], row.archive_entry.file_name, {
      type: "model/gltf-binary",
    });
  }

  async function importRow(row: IntakeRow, ledger: { runId: string; total: number; rowIndex: number; batchTitle: string }) {
    const errors = rowErrors(row);
    if (errors.length) {
      updateRow(row.row_id, {
        status: "failed",
        message: `Missing: ${errors.join(", ")}.`,
      });
      return {
        status: "failed" as const,
        assetId: null,
      };
    }

    updateRow(row.row_id, { status: "importing", message: null });
    try {
      const file = await fileForRow(row);
      const needsSmartRoute =
        Boolean(row.archive_entry && row.archive_entry.extension !== ".glb") ||
        (!row.archive_entry && !row.source_file.name.toLowerCase().endsWith(".glb"));
      const body = new FormData();
      body.append("file", file, file.name);
      if (needsSmartRoute && row.archive_entry) {
        body.set("file", row.source_file, row.source_file.name);
        body.append("archive_entry_path", row.archive_entry.path);
      }
      body.append("concept", row.concept);
      body.append("aliases", row.aliases);
      body.append("semantic_tags", row.semantic_tags);
      body.append("domain", domain);
      body.append("target_extent_m", targetExtentM);
      body.append("source_provider", row.source_provider || "Manual upload");
      body.append("source_url", row.source_url);
      body.append("source_asset_id", row.source_asset_id);
      body.append("asset_title", row.source_title || row.concept);
      body.append("creator_name", row.creator_name);
      body.append("license_kind", row.license_kind);
      body.append(
        "license_version",
        row.license_kind === "cc_by_4_0"
          ? "4.0"
          : "",
      );
      body.append("modification_notice", row.modification_notice);
      body.append("downloaded_at", today());
      body.append("provenance_notes", row.provenance_notes);
      body.append("run_vision", runVision ? "true" : "false");
      body.append("run_embedding", runEmbedding ? "true" : "false");
      body.append("import_run_id", ledger.runId);
      body.append("import_total", String(ledger.total));
      body.append("import_row_index", String(ledger.rowIndex));
      body.append(
        "import_source_name",
        row.archive_entry?.path ?? row.source_file.name,
      );
      body.append("import_batch_title", ledger.batchTitle);

      const response = await fetch(
        needsSmartRoute
          ? "/api/sandbox/probe-lab/assets/import-smart"
          : "/api/sandbox/probe-lab/assets/import-local",
        { method: "POST", body },
      );
      const payload = (await response.json()) as ImportResponse;
      if (!response.ok || !payload.ok || !payload.asset) {
        throw new Error(payload.error || "Asset import failed.");
      }
      const status: RowStatus = payload.created === false ? "duplicate" : "imported";
      updateRow(row.row_id, {
        status,
        imported_asset_id: payload.asset.asset_id,
        message:
          payload.message ??
          (status === "duplicate"
            ? `Already exists as ${payload.asset.asset_id}.`
            : runVision
              ? runEmbedding
                ? `Imported as ${payload.asset.asset_id}; Omni vision + embedding queued.`
                : `Imported as ${payload.asset.asset_id}; Omni vision queued, embedding pending.`
              : runEmbedding
                ? `Imported as ${payload.asset.asset_id}; vision pending, embedding waiting for vision.`
                : `Imported as ${payload.asset.asset_id}; vision + embedding pending.`),
      });
      const ledgerSummary = payload.import_ledger;
      if (ledgerSummary) {
        setProgress((current) => ({
          runId: ledgerSummary.run_id,
          total: ledgerSummary.total,
          accounted: ledgerSummary.accounted,
          imported: ledgerSummary.imported,
          duplicate: ledgerSummary.duplicate,
          failed: ledgerSummary.failed,
          current: row.source_title || row.concept,
          ledgerPath: payload.import_ledger_path ?? current?.ledgerPath ?? null,
        }));
      }
      return {
        status,
        assetId: payload.asset.asset_id,
      } as const;
    } catch (caught) {
      updateRow(row.row_id, {
        status: "failed",
        message: caught instanceof Error ? caught.message : String(caught),
      });
      setProgress((current) =>
        current
          ? {
              ...current,
              accounted: Math.min(current.total, current.accounted + 1),
              failed: current.failed + 1,
              current: row.source_title || row.concept,
            }
          : current,
      );
      return {
        status: "failed" as const,
        assetId: null,
      };
    }
  }

  async function importSelected() {
    if (running) return;
    cancelled.current = false;
    setRunning(true);
    setGlobalError(null);

    const work = rows.filter(
      (row) =>
        row.selected &&
        rowErrors(row).length === 0 &&
        row.status !== "imported" &&
        row.status !== "duplicate",
    );
    if (!work.length) {
      setRunning(false);
      setGlobalError(
        "No selected, fully attributed model rows are ready to import.",
      );
      return;
    }
    const runId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `asset_import_${uid()}`;
    const batchTitle =
      [...new Set(work.map((row) => row.bundle_title).filter(Boolean))].join(", ") ||
      "Asset Library import";

    localStorage.setItem(
      "myway_smart_asset_import_last_run_v1",
      runId,
    );

    setProgress({
      runId,
      total: work.length,
      accounted: 0,
      imported: 0,
      duplicate: 0,
      failed: 0,
      current: work[0]?.source_title ?? null,
      ledgerPath: null,
    });
    setGlobalMessage(
      `Importing ${work.length} asset${work.length === 1 ? "" : "s"} sequentially without refreshing the library. ` +
      `Vision ${runVision ? "ON" : "OFF"} · Embedding ${runEmbedding ? "ON" : "OFF"}.`,
    );

    let lastAssetId: string | null = null;
    let importedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    try {
      for (let index = 0; index < work.length; index += 1) {
        const row = work[index]!;
        if (cancelled.current) break;
        setProgress((current) =>
          current
            ? { ...current, current: row.source_title || row.concept }
            : current,
        );
        const result = await importRow(row, {
          runId,
          total: work.length,
          rowIndex: index,
          batchTitle,
        });
        if (result.status === "imported") {
          importedCount += 1;
          lastAssetId = result.assetId;
        } else if (result.status === "duplicate") {
          duplicateCount += 1;
          lastAssetId = result.assetId;
        } else {
          failedCount += 1;
        }
      }

      setGlobalMessage(
        cancelled.current
          ? "Import stopped after the current asset. Every completed row remains durably recorded in the import ledger."
          : "Import pass complete. The Asset Library will refresh once; the ledger below is the authoritative batch accounting.",
      );
    } finally {
      setRunning(false);
      cancelled.current = false;
      setProgress((current) =>
        current
          ? { ...current, current: null }
          : current,
      );

      onBatchComplete?.({
        lastAssetId,
        imported: importedCount,
        duplicate: duplicateCount,
        failed: failedCount,
      });
      if (!onBatchComplete && lastAssetId) {
        onImportComplete?.(lastAssetId);
      }
    }
  }

  return (
    <div className="smart-asset-intake">
      <div className="smart-intake-hero">
        <div>
          <strong>Import assets</strong>
          <small>
            Add one model, many models, or a ZIP. MyWay accepts GLB, GLTF, FBX,
            OBJ, and BLEND sources, normalizes runtime assets to GLB, and refuses
            to guess unresolved licensing.
          </small>
        </div>
        <label className="smart-add-files">
          Add files
          <input
            disabled={running}
            multiple
            accept=".glb,.gltf,.fbx,.obj,.blend,.zip"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      </div>

      <div className="smart-intake-settings">
        <label className="smart-vision-toggle">
          <input
            checked={runVision}
            disabled={running}
            onChange={(event) => setRunVision(event.target.checked)}
            type="checkbox"
          />
          <span>
            Run Omni vision after import
            <small>
              Turn this off while NVIDIA is rate-limited. Imported assets remain
              in Needs review with a ◌ vision-pending marker and can be analyzed later.
            </small>
          </span>
        </label>

        <label className="smart-vision-toggle">
          <input
            checked={runEmbedding}
            disabled={running}
            onChange={(event) => setRunEmbedding(event.target.checked)}
            type="checkbox"
          />
          <span>
            Generate embedding after import
            <small>
              Turn this off independently when the embedding endpoint is rate-limited.
              If Vision is off, embedding waits for the visual profile instead of
              silently starting Omni.
            </small>
          </span>
        </label>

        <label>
          Normalization extent (m)
          <input
            disabled={running}
            min="0.05"
            max="20"
            step="0.05"
            type="number"
            value={targetExtentM}
            onChange={(event) => setTargetExtentM(event.target.value)}
          />
        </label>
        <label>
          Domain
          <input disabled={running} value={domain} onChange={(event) => setDomain(event.target.value)} />
        </label>
      </div>

      <details className="smart-intake-defaults">
        <summary>Defaults for sources MyWay cannot identify automatically</summary>
        <div className="smart-intake-default-grid">
          <label>
            Licence
            <select
              disabled={running}
              value={defaultLicense}
              onChange={(event) => setDefaultLicense(event.target.value as LicenseKind)}
            >
              <option value="unknown">Choose licence</option>
              <option value="cc0">CC0</option>
              <option value="cc_by">CC BY</option>
              <option value="cc_by_4_0">CC BY 4.0</option>
              <option value="royalty_free">Royalty-free</option>
              <option value="self_owned">Self-owned</option>
            </select>
          </label>
          <label>
            Source provider
            <input disabled={running} value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value)} placeholder="Poly Pizza, own work, vendor…" />
          </label>
          <label className="wide">
            Source page
            <input disabled={running} value={defaultSourceUrl} onChange={(event) => setDefaultSourceUrl(event.target.value)} placeholder="https://…" />
          </label>
          <label>
            Creator
            <input disabled={running} value={defaultCreator} onChange={(event) => setDefaultCreator(event.target.value)} />
          </label>
          <button type="button" disabled={running} onClick={applyDefaultsToUnresolved}>
            Apply defaults to unresolved rows
          </button>
        </div>
      </details>

      {progress ? (
        <section className="smart-progress" aria-live="polite">
          <div className="smart-progress-head">
            <strong>
              {progress.accounted} / {progress.total} accounted for
            </strong>
            <span>{progress.current ? `Current: ${progress.current}` : "Batch complete"}</span>
          </div>
          <div className="smart-progress-track" aria-hidden="true">
            <span
              style={{
                width: `${progress.total > 0 ? Math.min(100, (progress.accounted / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="smart-progress-stats">
            <span>{progress.imported} newly imported</span>
            <span>{progress.duplicate} already present</span>
            <span>{progress.failed} failed</span>
            <span>{Math.max(0, progress.total - progress.accounted)} remaining</span>
          </div>
          <small>
            Import run {progress.runId}
            {progress.ledgerPath ? ` · durable ledger: ${progress.ledgerPath}` : ""}
          </small>
        </section>
      ) : null}

      {globalMessage ? <div className="smart-message">{globalMessage}</div> : null}
      {globalError ? <div className="smart-error">{globalError}</div> : null}

      {rows.length ? (
        <>
          <div className="smart-summary">
            <span>{summary.total} models</span>
            <span>{summary.selected} selected</span>
            <span>{summary.ready} ready</span>
            <span>{summary.known} known-bundle attributions</span>
            <span>{summary.unresolved} unresolved</span>
            <span>{summary.imported} imported</span>
            <span>{summary.duplicate} duplicates</span>
            <span>{summary.failed} failed</span>
          </div>

          <div className="smart-actions">
            <button
              type="button"
              disabled={running || summary.ready === 0}
              onClick={() => void importSelected()}
            >
              {running ? "Importing…" : `Import ${summary.ready} ready asset${summary.ready === 1 ? "" : "s"}`}
            </button>
            {running ? (
              <button type="button" onClick={() => { cancelled.current = true; }}>
                Stop after current
              </button>
            ) : null}
            <button
              type="button"
              disabled={running}
              onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: true })))}
            >
              Select all
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: false })))}
            >
              Select none
            </button>
            <button type="button" disabled={running} onClick={() => setRows([])}>
              Clear
            </button>
          </div>

          <div className="smart-rows">
            {rows.map((row) => {
              const errors = rowErrors(row);
              return (
                <details className="smart-row" key={row.row_id}>
                  <summary>
                    <input
                      aria-label={`Select ${row.source_title}`}
                      checked={row.selected}
                      disabled={running || row.status === "imported" || row.status === "duplicate"}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateRow(row.row_id, { selected: event.target.checked })}
                      type="checkbox"
                    />
                    <strong>{row.source_title || row.concept || basename(row.source_file.name)}</strong>
                    <span>{row.archive_entry?.extension ?? smartModelExtension(row.source_file.name)}</span>
                    <span className={row.attribution_confidence === "known_bundle" ? "good" : errors.length ? "warn" : ""}>
                      {row.attribution_confidence === "known_bundle"
                        ? "✓ attribution known"
                        : errors.length
                          ? `⚠ ${errors.length} metadata item${errors.length === 1 ? "" : "s"} needed`
                          : "metadata ready"}
                    </span>
                    <span className={row.status === "failed" ? "bad" : row.status === "imported" || row.status === "duplicate" ? "good" : ""}>
                      {row.status}
                    </span>
                  </summary>

                  <div className="smart-row-grid">
                    <label>
                      Object identity
                      <input disabled={running} value={row.concept} onChange={(event) => updateRow(row.row_id, { concept: event.target.value })} />
                    </label>
                    <label>
                      Source title
                      <input disabled={running} value={row.source_title} onChange={(event) => updateRow(row.row_id, { source_title: event.target.value })} />
                    </label>
                    <label>
                      Creator
                      <input disabled={running} value={row.creator_name} onChange={(event) => updateRow(row.row_id, { creator_name: event.target.value })} />
                    </label>
                    <label>
                      Licence
                      <select disabled={running} value={row.license_kind} onChange={(event) => updateRow(row.row_id, { license_kind: event.target.value as LicenseKind })}>
                        <option value="unknown">Choose licence</option>
                        <option value="cc0">CC0</option>
                        <option value="cc_by">CC BY</option>
                        <option value="cc_by_4_0">CC BY 4.0</option>
                        <option value="royalty_free">Royalty-free</option>
                        <option value="self_owned">Self-owned</option>
                      </select>
                    </label>
                    <label>
                      Source provider
                      <input disabled={running} value={row.source_provider} onChange={(event) => updateRow(row.row_id, { source_provider: event.target.value })} />
                    </label>
                    <label className="wide">
                      Source page
                      <input disabled={running} value={row.source_url} onChange={(event) => updateRow(row.row_id, { source_url: event.target.value })} />
                    </label>
                    <label>
                      Source ID
                      <input disabled={running} value={row.source_asset_id} onChange={(event) => updateRow(row.row_id, { source_asset_id: event.target.value })} />
                    </label>
                    <label>
                      Aliases
                      <input disabled={running} value={row.aliases} onChange={(event) => updateRow(row.row_id, { aliases: event.target.value })} placeholder="comma-separated" />
                    </label>
                    <label>
                      Semantic tags
                      <input disabled={running} value={row.semantic_tags} onChange={(event) => updateRow(row.row_id, { semantic_tags: event.target.value })} placeholder="comma-separated" />
                    </label>
                    {(row.license_kind === "cc_by" || row.license_kind === "cc_by_4_0") ? (
                      <label className="wide">
                        Modification notice
                        <input disabled={running} value={row.modification_notice} onChange={(event) => updateRow(row.row_id, { modification_notice: event.target.value })} />
                      </label>
                    ) : null}
                  </div>

                  <div className="smart-row-footer">
                    <span>
                      {row.archive_entry
                        ? `${row.source_file.name} → ${row.archive_entry.path} · ${formatBytes(row.archive_entry.uncompressed_size)}`
                        : `${row.source_file.name} · ${formatBytes(row.source_file.size)}`}
                    </span>
                    {row.message ? <strong>{row.message}</strong> : null}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      ) : (
        <div className="smart-empty">
          No files added yet. A Poly Pizza Office Pack ZIP is recognized as 125
          separate GLBs with its local licensing manifest; other sources stay
          editable until their provenance is complete.
        </div>
      )}

      <style jsx>{`
        .smart-asset-intake { display:grid; gap:14px; }
        .smart-intake-hero { display:flex; gap:16px; align-items:center; justify-content:space-between; padding:16px; border:1px solid rgba(103,232,249,.22); border-radius:16px; background:rgba(34,211,238,.05); }
        .smart-intake-hero > div { display:grid; gap:5px; }
        .smart-intake-hero small, .smart-vision-toggle small { color:rgba(226,232,240,.68); line-height:1.45; }
        .smart-add-files { cursor:pointer; font-weight:850; padding:10px 14px; border-radius:10px; border:1px solid rgba(103,232,249,.38); background:rgba(34,211,238,.14); white-space:nowrap; }
        .smart-add-files input { display:none; }
        .smart-intake-settings { display:grid; grid-template-columns:repeat(2,minmax(260px,1fr)) minmax(160px,.45fr) minmax(220px,.7fr); gap:12px; align-items:start; }
        label { display:grid; gap:5px; font-size:12px; font-weight:750; color:rgba(226,232,240,.82); }
        input, select { min-width:0; padding:9px 10px; border-radius:9px; border:1px solid rgba(255,255,255,.12); background:rgba(2,6,23,.72); color:#f8fafc; }
        .smart-vision-toggle { display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:start; padding:10px; border-radius:12px; background:rgba(255,255,255,.035); }
        .smart-vision-toggle input { margin-top:3px; }
        .smart-vision-toggle span { display:grid; gap:3px; }
        .smart-intake-defaults { border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:11px; }
        .smart-intake-defaults summary { cursor:pointer; font-weight:800; }
        .smart-intake-default-grid { margin-top:12px; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
        .smart-intake-default-grid .wide { grid-column:span 2; }
        button { padding:9px 12px; border-radius:9px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:#f8fafc; font-weight:800; cursor:pointer; }
        button:disabled { opacity:.45; cursor:not-allowed; }
        .smart-progress { display:grid; gap:8px; padding:12px; border-radius:12px; border:1px solid rgba(103,232,249,.22); background:rgba(34,211,238,.045); }
        .smart-progress-head { display:flex; justify-content:space-between; gap:12px; align-items:center; }
        .smart-progress-head span, .smart-progress small { color:rgba(226,232,240,.68); font-size:11px; }
        .smart-progress-track { height:8px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.07); }
        .smart-progress-track span { display:block; height:100%; border-radius:999px; background:rgba(103,232,249,.78); transition:width .2s ease; }
        .smart-progress-stats { display:flex; gap:8px; flex-wrap:wrap; }
        .smart-progress-stats span { padding:4px 7px; border-radius:999px; background:rgba(255,255,255,.05); font-size:11px; }
        .smart-message, .smart-error { padding:10px 12px; border-radius:10px; line-height:1.45; font-size:12px; }
        .smart-message { background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.25); }
        .smart-error { background:rgba(248,113,113,.09); border:1px solid rgba(248,113,113,.28); }
        .smart-summary, .smart-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .smart-summary span { padding:5px 8px; border-radius:999px; background:rgba(255,255,255,.05); color:rgba(226,232,240,.75); font-size:11px; }
        .smart-rows { display:grid; gap:7px; max-height:720px; overflow:auto; padding-right:3px; }
        .smart-row { border:1px solid rgba(255,255,255,.09); border-radius:11px; background:rgba(2,6,23,.46); }
        .smart-row summary { cursor:pointer; list-style:none; display:grid; grid-template-columns:auto minmax(180px,1fr) auto auto auto; gap:9px; align-items:center; padding:10px; font-size:12px; }
        .smart-row summary input { padding:0; }
        .smart-row summary span { color:rgba(226,232,240,.62); }
        .smart-row summary .good { color:#86efac; }
        .smart-row summary .warn { color:#fde68a; }
        .smart-row summary .bad { color:#fca5a5; }
        .smart-row-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; padding:0 10px 10px; }
        .smart-row-grid .wide { grid-column:span 2; }
        .smart-row-footer { display:flex; gap:12px; justify-content:space-between; border-top:1px solid rgba(255,255,255,.07); padding:8px 10px; color:rgba(226,232,240,.58); font-size:11px; }
        .smart-row-footer strong { color:rgba(226,232,240,.84); }
        .smart-empty { padding:18px; border:1px dashed rgba(255,255,255,.14); border-radius:12px; color:rgba(226,232,240,.65); line-height:1.5; }
        @media (max-width:900px) {
          .smart-intake-settings, .smart-intake-default-grid, .smart-row-grid { grid-template-columns:1fr; }
          .smart-intake-default-grid .wide, .smart-row-grid .wide { grid-column:auto; }
          .smart-row summary { grid-template-columns:auto minmax(120px,1fr); }
        }
      `}</style>
    </div>
  );
}
