"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MAX_MANUAL_GLB_BATCH_FILES,
  manualConceptFromFileName,
  parseManualGlbFileName,
  validateCc0ImportDraft,
} from "../manual-glb-batch-intake";
import {
  MAX_CC0_BUNDLE_FILES,
  buildCc0BundleProvenanceNotes,
  cc0BundleMemberSourceAssetId,
  cc0BundleMemberTitleFromPath,
  cc0BundleSourceIdFromUrl,
  cc0BundleTitleFromZipName,
  extractCc0GlbBundleBuffer,
} from "../cc0-glb-bundle";

type RowStatus =
  | "draft"
  | "importing"
  | "imported"
  | "duplicate"
  | "failed";

type Cc0BatchRow = {
  row_id: string;
  file: File;
  selected: boolean;
  concept: string;
  aliases: string;
  semantic_tags: string;
  source_title: string;
  source_asset_id: string;
  source_url: string;
  source_provider: string;
  creator_name: string;
  provenance_notes: string;
  bundle_entry_path: string | null;
  status: RowStatus;
  message: string | null;
  imported_asset_id: string | null;
};

type ImportResponse = {
  ok: boolean;
  created?: boolean;
  duplicate_of?: string | null;
  asset?: {
    asset_id: string;
    display_name: string;
  };
  error?: string;
  message?: string;
};

type Cc0BatchImportLabProps = {
  onImportComplete?: (
    assetId: string,
  ) => void;
  onRunningChange?: (
    running: boolean,
  ) => void;
};

const DEFAULT_MODIFICATION_NOTICE =
  "Normalized and processed for real-time use by MyWay.";

function today() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function rowErrors(row: Cc0BatchRow) {
  return validateCc0ImportDraft({
    file_name: row.file.name,
    concept: row.concept,
  });
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(
    value /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

export function Cc0BatchImportLab({
  onImportComplete,
  onRunningChange,
}: Cc0BatchImportLabProps) {
  const [rows, setRows] =
    useState<Cc0BatchRow[]>([]);
  const [targetExtentM, setTargetExtentM] =
    useState("2");
  const [domain, setDomain] = useState(
    "cc0_manual_intake",
  );
  const [defaultSourceProvider, setDefaultSourceProvider] =
    useState("Manual CC0 source");
  const [downloadedAt, setDownloadedAt] =
    useState(today());
  const [bundleTitle, setBundleTitle] =
    useState("");
  const [bundleSourceProvider, setBundleSourceProvider] =
    useState("");
  const [bundleSourceUrl, setBundleSourceUrl] =
    useState("");
  const [bundleSourceId, setBundleSourceId] =
    useState("");
  const [bundleCreatorName, setBundleCreatorName] =
    useState("");
  const [bundleSemanticTags, setBundleSemanticTags] =
    useState("");
  const [bundleInspecting, setBundleInspecting] =
    useState(false);
  const [bundleSummary, setBundleSummary] =
    useState<string | null>(null);
  const [running, setRunning] =
    useState(false);
  const [globalMessage, setGlobalMessage] =
    useState<string | null>(null);
  const [globalError, setGlobalError] =
    useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        "myway_cc0_batch_defaults_v1",
      );
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        targetExtentM?: string;
        domain?: string;
        defaultSourceProvider?: string;
        downloadedAt?: string;
      };
      setTargetExtentM(
        parsed.targetExtentM ?? "2",
      );
      setDomain(
        parsed.domain ??
          "cc0_manual_intake",
      );
      setDefaultSourceProvider(
        parsed.defaultSourceProvider ??
          "Manual CC0 source",
      );
      setDownloadedAt(
        parsed.downloadedAt ?? today(),
      );
    } catch {
      // Invalid local preferences should not block importing.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "myway_cc0_batch_defaults_v1",
      JSON.stringify({
        targetExtentM,
        domain,
        defaultSourceProvider,
        downloadedAt,
      }),
    );
  }, [
    targetExtentM,
    domain,
    defaultSourceProvider,
    downloadedAt,
  ]);

  useEffect(() => {
    onRunningChange?.(running);
    return () => {
      onRunningChange?.(false);
    };
  }, [running, onRunningChange]);

  const summary = useMemo(() => {
    const selected = rows.filter(
      (row) => row.selected,
    );
    const ready = selected.filter(
      (row) =>
        rowErrors(row).length === 0 &&
        row.status !== "imported" &&
        row.status !== "duplicate",
    );
    return {
      total: rows.length,
      selected: selected.length,
      ready: ready.length,
      imported: rows.filter(
        (row) => row.status === "imported",
      ).length,
      duplicate: rows.filter(
        (row) => row.status === "duplicate",
      ).length,
      failed: rows.filter(
        (row) => row.status === "failed",
      ).length,
    };
  }, [rows]);

  function updateRow(
    rowId: string,
    patch: Partial<Cc0BatchRow>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.row_id === rowId
          ? {
              ...row,
              ...patch,
              status:
                row.status === "imported" ||
                row.status === "duplicate"
                  ? row.status
                  : patch.status ?? "draft",
              message:
                patch.message === undefined
                  ? null
                  : patch.message,
            }
          : row,
      ),
    );
  }

  function removeRow(rowId: string) {
    setRows((current) =>
      current.filter(
        (row) => row.row_id !== rowId,
      ),
    );
  }

  function addFiles(
    files: FileList | File[],
  ) {
    const candidates = Array.from(files).filter(
      (file) =>
        file.name
          .toLowerCase()
          .endsWith(".glb"),
    );
    const existing = new Set(
      rows.map((row) => row.row_id),
    );
    const available = Math.max(
      0,
      MAX_MANUAL_GLB_BATCH_FILES -
        rows.length,
    );
    const uniqueCandidates = candidates.filter(
      (file) =>
        !existing.has(
          `${file.name}:${file.size}:${file.lastModified}`,
        ),
    );
    const accepted = uniqueCandidates.slice(
      0,
      available,
    );
    const next = accepted.map((file) => {
      const parsed =
        parseManualGlbFileName(
          file.name,
        );
      return {
        row_id:
          `${file.name}:${file.size}:${file.lastModified}`,
        file,
        selected: true,
        concept:
          manualConceptFromFileName(
            file.name,
          ),
        aliases: "",
        semantic_tags: "",
        source_title:
          parsed.source_title,
        source_asset_id:
          parsed.source_asset_id,
        source_url: "",
        source_provider: "",
        creator_name: parsed.creator_name ?? "",
        provenance_notes:
          "Imported through MyWay's CC0 multi-GLB intake. Source and licence remain subject to human review before scene approval.",
        bundle_entry_path: null,
        status: "draft" as const,
        message: null,
        imported_asset_id: null,
      };
    });

    setRows((current) => [
      ...current,
      ...next,
    ]);
    const omitted = Math.max(
      0,
      uniqueCandidates.length -
        accepted.length,
    );
    setGlobalError(
      omitted > 0
        ? `This importer accepts up to ${MAX_MANUAL_GLB_BATCH_FILES} files per batch. ${omitted} file(s) were not added; import the current batch and then start another.`
        : null,
    );
    setGlobalMessage(
      next.length
        ? `Added ${next.length} CC0 GLB file(s). Review the generated rows, then choose Import selected assets.`
        : "No new GLB files were added.",
    );
  }

  async function addBundleZip(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setGlobalError("CC0 bundle intake requires a .zip file.");
      return;
    }
    if (rows.length >= MAX_MANUAL_GLB_BATCH_FILES) {
      setGlobalError("The current 50-model queue is full. Clear or import it before adding a bundle.");
      return;
    }

    setBundleInspecting(true);
    setGlobalError(null);
    setBundleSummary(null);
    setGlobalMessage(`Inspecting ${file.name}…`);

    try {
      const inferredTitle =
        bundleTitle.trim() ||
        cc0BundleTitleFromZipName(file.name);
      const sourceIdFromUrl =
        cc0BundleSourceIdFromUrl(
          bundleSourceUrl,
        );
      const effectiveBundleId =
        bundleSourceId.trim() ||
        sourceIdFromUrl ||
        inferredTitle;
      const sourceLooksLikePolyPizza = (() => {
        try {
          return new URL(
            bundleSourceUrl,
          ).hostname.toLowerCase() ===
            "poly.pizza";
        } catch {
          return false;
        }
      })();
      const effectiveProvider =
        bundleSourceProvider.trim() ||
        (sourceLooksLikePolyPizza
          ? "Poly Pizza"
          : defaultSourceProvider.trim()) ||
        "Manual CC0 source";
      const extracted =
        await extractCc0GlbBundleBuffer(
          await file.arrayBuffer(),
        );
      const available = Math.max(
        0,
        MAX_MANUAL_GLB_BATCH_FILES - rows.length,
      );
      const accepted = extracted.entries.slice(
        0,
        available,
      );
      const existing = new Set(
        rows.map((row) => row.row_id),
      );
      const next: Cc0BatchRow[] = [];

      for (const entry of accepted) {
        const title =
          cc0BundleMemberTitleFromPath(
            entry.path,
          );
        // File/Blob constructors require ArrayBuffer-backed BlobParts under
        // modern TypeScript DOM typings. Keep extracted ZIP bytes identical
        // while crossing that browser API boundary with a concrete buffer.
        const glbBuffer = new ArrayBuffer(
          entry.bytes.byteLength,
        );
        new Uint8Array(glbBuffer).set(
          entry.bytes,
        );
        const glbFile = new File(
          [glbBuffer],
          entry.file_name,
          {
            type: "model/gltf-binary",
            lastModified: file.lastModified,
          },
        );
        const rowId =
          `bundle:${file.name}:${entry.path}:${entry.crc32}`;
        if (existing.has(rowId)) continue;
        existing.add(rowId);

        const parsed = parseManualGlbFileName(
          `${title || entry.file_name}.glb`,
        );
        next.push({
          row_id: rowId,
          file: glbFile,
          selected: true,
          concept: manualConceptFromFileName(
            `${title || entry.file_name}.glb`,
          ),
          aliases: "",
          semantic_tags:
            bundleSemanticTags.trim(),
          source_title:
            parsed.source_title || title,
          source_asset_id:
            cc0BundleMemberSourceAssetId(
              effectiveBundleId,
              entry.path,
            ),
          source_url:
            bundleSourceUrl.trim(),
          source_provider: effectiveProvider,
          creator_name:
            bundleCreatorName.trim(),
          provenance_notes:
            buildCc0BundleProvenanceNotes({
              bundleTitle: inferredTitle,
              bundleSourceId:
                effectiveBundleId,
              entryPath: entry.path,
            }),
          bundle_entry_path: entry.path,
          status: "draft",
          message: null,
          imported_asset_id: null,
        });
      }

      setBundleTitle(inferredTitle);
      if (!bundleSourceId.trim()) {
        setBundleSourceId(effectiveBundleId);
      }
      if (!bundleSourceProvider.trim() && sourceLooksLikePolyPizza) {
        setBundleSourceProvider("Poly Pizza");
      }
      setRows((current) => [
        ...current,
        ...next,
      ]);

      const omittedByCapacity = Math.max(
        0,
        extracted.entries.length - accepted.length,
      );
      setBundleSummary(
        `${file.name}: ${extracted.entries.length} standalone GLB(s), ${formatBytes(extracted.total_uncompressed_bytes)} uncompressed${extracted.ignored_entry_count ? `, ${extracted.ignored_entry_count} non-GLB entr${extracted.ignored_entry_count === 1 ? "y" : "ies"} ignored` : ""}.`,
      );
      setGlobalError(
        omittedByCapacity > 0
          ? `${omittedByCapacity} model(s) could not be added because the shared CC0 queue is capped at ${MAX_MANUAL_GLB_BATCH_FILES}.`
          : null,
      );
      setGlobalMessage(
        next.length
          ? `Added ${next.length} GLB(s) from ${file.name}. Review the rows, then choose Import selected assets.`
          : "This bundle did not add any new rows.",
      );
    } catch (caught) {
      setGlobalError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
      setGlobalMessage(null);
    } finally {
      setBundleInspecting(false);
    }
  }

  async function importRows() {
    const parsedExtent = Number(
      targetExtentM,
    );
    if (
      !Number.isFinite(parsedExtent) ||
      parsedExtent <= 0
    ) {
      setGlobalError(
        "Normalization extent must be greater than zero.",
      );
      return;
    }

    const queue = rows.filter(
      (row) =>
        row.selected &&
        rowErrors(row).length === 0 &&
        row.status !== "imported" &&
        row.status !== "duplicate",
    );
    if (!queue.length) {
      setGlobalError(
        "No selected, valid, unprocessed rows are ready.",
      );
      return;
    }

    cancelled.current = false;
    setRunning(true);
    setGlobalError(null);
    setGlobalMessage(
      `Starting ${queue.length} sequential Blender import job(s). Keep this tab open while the queue runs.`,
    );

    for (
      let index = 0;
      index < queue.length;
      index += 1
    ) {
      if (cancelled.current) break;
      const row = queue[index]!;
      updateRow(row.row_id, {
        status: "importing",
        message:
          `Importing ${index + 1} of ${queue.length}…`,
      });

      try {
        const formData = new FormData();
        formData.set("file", row.file);
        formData.set(
          "concept",
          row.concept.trim(),
        );
        formData.set("aliases", row.aliases);
        formData.set(
          "semantic_tags",
          row.semantic_tags,
        );
        formData.set(
          "domain",
          domain.trim() ||
            "cc0_manual_intake",
        );
        formData.set(
          "target_extent_m",
          String(parsedExtent),
        );
        formData.set(
          "source_provider",
          row.source_provider.trim() ||
            defaultSourceProvider.trim() ||
            "Manual CC0 source",
        );
        formData.set(
          "source_url",
          row.source_url.trim(),
        );
        formData.set(
          "source_asset_id",
          row.source_asset_id.trim(),
        );
        formData.set(
          "asset_title",
          (
            row.source_title ||
            row.concept
          ).trim(),
        );
        formData.set(
          "creator_name",
          row.creator_name.trim(),
        );
        formData.set("license_kind", "cc0");
        formData.set("license_version", "");
        formData.set("attribution", "");
        formData.set(
          "modification_notice",
          DEFAULT_MODIFICATION_NOTICE,
        );
        formData.set(
          "downloaded_at",
          downloadedAt,
        );
        formData.set(
          "provenance_notes",
          row.provenance_notes.trim() ||
            "Imported through MyWay's CC0 multi-GLB intake. Source and licence remain subject to human review before scene approval.",
        );

        const response = await fetch(
          "/api/sandbox/probe-lab/assets/import-local",
          {
            method: "POST",
            body: formData,
          },
        );
        const payload =
          (await response.json()) as ImportResponse;
        if (
          !response.ok ||
          !payload.ok ||
          !payload.asset
        ) {
          throw new Error(
            payload.error ||
              "The CC0 GLB import failed.",
          );
        }

        const duplicate =
          payload.created === false ||
          Boolean(payload.duplicate_of);
        updateRow(row.row_id, {
          status: duplicate
            ? "duplicate"
            : "imported",
          message:
            payload.message ||
            (duplicate
              ? `Already imported as ${payload.asset.asset_id}.`
              : `Imported as ${payload.asset.asset_id} and placed in Needs review.`),
          imported_asset_id:
            payload.asset.asset_id,
        });
        onImportComplete?.(
          payload.asset.asset_id,
        );
      } catch (caught) {
        updateRow(row.row_id, {
          status: "failed",
          message:
            caught instanceof Error
              ? caught.message
              : String(caught),
        });
      }
    }

    setRunning(false);
    setGlobalMessage(
      cancelled.current
        ? "Stopped after the current import. Completed rows were preserved."
        : "The selected CC0 import queue finished. New assets are in Needs review.",
    );
  }

  return (
    <div className="manual-batch-panel">
      <div className="intro">
        <strong>
          Import CC0 GLBs or bundle ZIPs
        </strong>
        <small>
          Add individual GLBs or a ZIP containing up to {MAX_CC0_BUNDLE_FILES} standalone GLBs. Bundle intake only unpacks the archive in the browser; every model still goes one at a time through the existing validation, source preservation, Blender normalization, geometry profiling, enrichment, and Needs review pipeline.
        </small>
      </div>

      {globalError ? (
        <div className="message error">
          {globalError}
        </div>
      ) : null}
      {globalMessage ? (
        <div className="message">
          {globalMessage}
        </div>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>1. Add CC0 models</h3>
            <p>
              Add standalone GLBs directly, or choose a CC0 bundle ZIP. ZIP intake supports stored/deflated archives whose model members are self-contained GLB 2.0 files; external GLTF dependency folders are intentionally not accepted here.
            </p>
          </div>
          <div className="button-row">
            <label className="file-button">
              Add GLB files
              <input
                accept=".glb,model/gltf-binary,application/octet-stream"
                disabled={
                  running ||
                  bundleInspecting ||
                  rows.length >=
                    MAX_MANUAL_GLB_BATCH_FILES
                }
                multiple
                onChange={(event) => {
                  if (event.target.files) {
                    addFiles(event.target.files);
                  }
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <label className="file-button secondary">
              {bundleInspecting
                ? "Reading ZIP…"
                : "Add CC0 bundle ZIP"}
              <input
                accept=".zip,application/zip,application/x-zip-compressed"
                disabled={
                  running ||
                  bundleInspecting ||
                  rows.length >=
                    MAX_MANUAL_GLB_BATCH_FILES
                }
                onChange={(event) => {
                  const bundle =
                    event.target.files?.[0];
                  if (bundle) {
                    void addBundleZip(bundle);
                  }
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
          </div>
        </div>

        <div className="bundle-defaults">
          <div className="bundle-defaults-heading">
            <strong>Bundle provenance defaults</strong>
            <small>
              These values are snapshotted onto every GLB when a ZIP is added. For the Ultimate Food Pack test, use the Poly Pizza bundle page, Quaternius as creator, and its stable bundle ID.
            </small>
          </div>
          <div className="bundle-grid">
            <label>
              Bundle title
              <input
                disabled={running || bundleInspecting}
                onChange={(event) =>
                  setBundleTitle(event.target.value)
                }
                placeholder="Derived from ZIP filename if blank"
                value={bundleTitle}
              />
            </label>
            <label>
              Creator
              <input
                disabled={running || bundleInspecting}
                onChange={(event) =>
                  setBundleCreatorName(
                    event.target.value,
                  )
                }
                placeholder="For example: Quaternius"
                value={bundleCreatorName}
              />
            </label>
            <label>
              Source provider
              <input
                disabled={running || bundleInspecting}
                onChange={(event) =>
                  setBundleSourceProvider(
                    event.target.value,
                  )
                }
                placeholder={defaultSourceProvider}
                value={bundleSourceProvider}
              />
            </label>
            <label>
              Stable bundle ID
              <input
                disabled={running || bundleInspecting}
                onChange={(event) =>
                  setBundleSourceId(
                    event.target.value,
                  )
                }
                placeholder="Derived from bundle title if blank"
                value={bundleSourceId}
              />
            </label>
            <label className="wide">
              Bundle source page
              <input
                disabled={running || bundleInspecting}
                onChange={(event) =>
                  setBundleSourceUrl(
                    event.target.value,
                  )
                }
                placeholder="Optional but strongly recommended"
                type="url"
                value={bundleSourceUrl}
              />
            </label>
            <label className="wide">
              Tags applied to bundle members
              <input
                disabled={running || bundleInspecting}
                onChange={(event) =>
                  setBundleSemanticTags(
                    event.target.value,
                  )
                }
                placeholder="food, low poly"
                value={bundleSemanticTags}
              />
            </label>
          </div>
          {bundleSummary ? (
            <p className="bundle-summary">
              {bundleSummary}
            </p>
          ) : null}
        </div>

        <div className="attached-files">
          {rows.length ? (
            rows.map((row) => (
              <div
                className="attached-file"
                key={row.row_id}
              >
                <div>
                  <strong>{row.file.name}</strong>
                  <small>
                    {formatBytes(row.file.size)} · concept: {row.concept || "needs a concept"}{row.bundle_entry_path ? ` · bundle entry: ${row.bundle_entry_path}` : ""}
                  </small>
                </div>
                <button
                  className="remove-button"
                  disabled={running}
                  onClick={() =>
                    removeRow(row.row_id)
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="empty">
              No GLB files attached yet.
            </p>
          )}
        </div>
      </section>

      <section className="panel defaults">
        <label>
          Default source
          <input
            disabled={running}
            onChange={(event) =>
              setDefaultSourceProvider(
                event.target.value,
              )
            }
            placeholder="For example: Kenney"
            value={defaultSourceProvider}
          />
          <small>
            Applied to rows that do not override it.
          </small>
        </label>
        <label>
          Normalization extent (m)
          <input
            disabled={running}
            min="0.05"
            onChange={(event) =>
              setTargetExtentM(
                event.target.value,
              )
            }
            step="0.05"
            type="number"
            value={targetExtentM}
          />
        </label>
        <label>
          Downloaded date
          <input
            disabled={running}
            onChange={(event) =>
              setDownloadedAt(
                event.target.value,
              )
            }
            type="date"
            value={downloadedAt}
          />
        </label>
        <label>
          Domain
          <input
            disabled={running}
            onChange={(event) =>
              setDomain(event.target.value)
            }
            value={domain}
          />
        </label>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>2. Review and import</h3>
            <p>
              {summary.total} attached · {summary.selected} selected · {summary.ready} ready · {summary.imported} imported · {summary.duplicate} duplicates · {summary.failed} failed
            </p>
          </div>
          <div className="button-row">
            {running ? (
              <button
                className="danger"
                onClick={() => {
                  cancelled.current = true;
                }}
                type="button"
              >
                Stop after current
              </button>
            ) : null}
            {!running && rows.length ? (
              <button
                className="remove-button"
                disabled={bundleInspecting}
                onClick={() => {
                  setRows([]);
                  setBundleSummary(null);
                  setGlobalError(null);
                  setGlobalMessage(
                    "Cleared the CC0 import queue.",
                  );
                }}
                type="button"
              >
                Clear queue
              </button>
            ) : null}
            <button
              disabled={
                running ||
                summary.ready === 0
              }
              onClick={() => {
                void importRows();
              }}
              type="button"
            >
              {running
                ? "Importing…"
                : "Import selected assets"}
            </button>
          </div>
        </div>

        <div className="rows">
          {rows.length ? (
            rows.map((row) => {
              const errors = rowErrors(row);
              return (
                <article
                  className="review-row"
                  data-status={row.status}
                  key={row.row_id}
                >
                  <div className="row-title">
                    <label className="select-row">
                      <input
                        checked={row.selected}
                        disabled={
                          running ||
                          row.status === "imported" ||
                          row.status === "duplicate"
                        }
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            selected:
                              event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                      <span>{row.file.name}</span>
                    </label>
                    <span className="status">
                      {row.status}
                    </span>
                  </div>

                  <div className="row-grid">
                    <label>
                      Concept
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            concept:
                              event.target.value.toLowerCase(),
                          })
                        }
                        placeholder="chair"
                        value={row.concept}
                      />
                      <small>
                        Used for search and scene matching.
                      </small>
                    </label>
                    <label>
                      Source title
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            source_title:
                              event.target.value,
                          })
                        }
                        value={row.source_title}
                      />
                    </label>
                    <label>
                      Aliases
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            aliases:
                              event.target.value,
                          })
                        }
                        placeholder="seat, dining chair"
                        value={row.aliases}
                      />
                    </label>
                    <label>
                      Semantic tags
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            semantic_tags:
                              event.target.value,
                          })
                        }
                        placeholder="furniture, indoor"
                        value={row.semantic_tags}
                      />
                    </label>
                  </div>

                  <details>
                    <summary>
                      Optional source details
                    </summary>
                    <div className="row-grid details-grid">
                      <label>
                        Source override
                        <input
                          disabled={running}
                          onChange={(event) =>
                            updateRow(row.row_id, {
                              source_provider:
                                event.target.value,
                            })
                          }
                          placeholder={defaultSourceProvider}
                          value={row.source_provider}
                        />
                      </label>
                      <label>
                        Source asset ID
                        <input
                          disabled={running}
                          onChange={(event) =>
                            updateRow(row.row_id, {
                              source_asset_id:
                                event.target.value,
                            })
                          }
                          value={row.source_asset_id}
                        />
                      </label>
                      <label>
                        Creator
                        <input
                          disabled={running}
                          onChange={(event) =>
                            updateRow(row.row_id, {
                              creator_name:
                                event.target.value,
                            })
                          }
                          placeholder="Optional for CC0"
                          value={row.creator_name}
                        />
                      </label>
                      {row.bundle_entry_path ? (
                        <label>
                          Bundle member path
                          <input
                            disabled
                            value={row.bundle_entry_path}
                          />
                        </label>
                      ) : null}
                      <label className="wide">
                        Source page
                        <input
                          disabled={running}
                          onChange={(event) =>
                            updateRow(row.row_id, {
                              source_url:
                                event.target.value,
                            })
                          }
                          placeholder="Optional model page"
                          type="url"
                          value={row.source_url}
                        />
                      </label>
                    </div>
                  </details>

                  {errors.length ? (
                    <ul className="errors">
                      {errors.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ready">
                      Ready for the CC0 import queue. The asset will still require identity, appearance, geometry, licence, and scene review.
                    </p>
                  )}

                  {row.message ? (
                    <p className="row-message">
                      {row.message}
                    </p>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="empty">
              Add GLB files or a CC0 bundle ZIP above to create review rows.
            </p>
          )}
        </div>
      </section>

      <style jsx>{`
        .manual-batch-panel {
          display: grid;
          gap: 14px;
          margin-top: 18px;
        }
        .intro,
        .panel,
        .message {
          border: 1px solid rgba(125, 211, 252, 0.2);
          background: rgba(7, 19, 33, 0.76);
          border-radius: 14px;
          padding: 16px;
        }
        .intro strong {
          display: block;
          margin-bottom: 6px;
          color: #f2f8ff;
        }
        .intro small,
        .section-heading p,
        label small {
          display: block;
          color: #91a9c5;
          line-height: 1.5;
        }
        .message {
          color: #cfe7ff;
        }
        .message.error {
          border-color: rgba(248, 113, 113, 0.55);
          background: rgba(69, 10, 20, 0.5);
          color: #ffc0c7;
        }
        .section-heading,
        .row-title,
        .attached-file {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        h3 {
          margin: 0 0 5px;
          color: #f2f8ff;
          font-size: 16px;
        }
        .section-heading p {
          margin: 0;
        }
        .file-button,
        button {
          border: 0;
          border-radius: 9px;
          padding: 9px 13px;
          background: #4bb8e8;
          color: #04121d;
          font-weight: 750;
          cursor: pointer;
        }
        .file-button {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
        }
        .file-button.secondary {
          background: rgba(56, 189, 248, 0.16);
          border: 1px solid rgba(125, 211, 252, 0.38);
          color: #d9f2ff;
        }
        .file-button input {
          display: none;
        }
        button.remove-button {
          background: rgba(51, 72, 98, 0.86);
          color: #e8f1ff;
        }
        button.danger {
          background: #d66a76;
          color: #26060a;
        }
        button:disabled,
        .file-button:has(input:disabled) {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .bundle-defaults {
          margin-top: 14px;
          border: 1px solid rgba(52, 211, 153, 0.2);
          border-radius: 12px;
          padding: 13px;
          background: rgba(6, 32, 30, 0.34);
        }
        .bundle-defaults-heading {
          display: grid;
          gap: 5px;
        }
        .bundle-defaults-heading strong {
          color: #d7fff2;
        }
        .bundle-defaults-heading small,
        .bundle-summary {
          color: #9fc9bf;
          line-height: 1.5;
        }
        .bundle-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .bundle-summary {
          margin: 11px 0 0;
        }
        .attached-files,
        .rows {
          display: grid;
          gap: 10px;
          margin-top: 14px;
        }
        .attached-file {
          border: 1px solid rgba(125, 211, 252, 0.14);
          border-radius: 10px;
          padding: 11px 12px;
          background: rgba(3, 12, 23, 0.48);
        }
        .attached-file strong,
        .attached-file small {
          display: block;
          overflow-wrap: anywhere;
        }
        .attached-file small {
          margin-top: 4px;
          color: #8fa7c3;
        }
        .defaults {
          display: grid;
          grid-template-columns: repeat(4, minmax(145px, 1fr));
          gap: 12px;
        }
        label {
          display: grid;
          gap: 6px;
          color: #cfe1f5;
          font-size: 13px;
          font-weight: 650;
        }
        input,
        textarea,
        select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(129, 161, 199, 0.28);
          border-radius: 8px;
          background: rgba(2, 10, 20, 0.86);
          color: #eef7ff;
          padding: 9px 10px;
          font: inherit;
        }
        .button-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .review-row {
          border: 1px solid rgba(125, 211, 252, 0.16);
          border-radius: 12px;
          padding: 14px;
          background: rgba(3, 12, 23, 0.55);
        }
        .review-row[data-status="failed"] {
          border-color: rgba(248, 113, 113, 0.5);
        }
        .review-row[data-status="imported"] {
          border-color: rgba(74, 222, 128, 0.45);
        }
        .select-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .select-row input {
          width: auto;
        }
        .select-row span {
          overflow-wrap: anywhere;
        }
        .status {
          color: #8fcff2;
          text-transform: capitalize;
          font-size: 12px;
        }
        .row-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }
        .wide {
          grid-column: 1 / -1;
        }
        details {
          margin-top: 12px;
          color: #a8bdd5;
        }
        summary {
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
        }
        .details-grid {
          padding-top: 4px;
        }
        .errors {
          margin: 12px 0 0;
          color: #ffadb7;
        }
        .ready,
        .row-message,
        .empty {
          margin: 12px 0 0;
          color: #a8bdd5;
          line-height: 1.5;
        }
        .ready {
          color: #9de8bd;
        }
        @media (max-width: 900px) {
          .defaults,
          .row-grid,
          .bundle-grid {
            grid-template-columns: 1fr;
          }
          .wide {
            grid-column: auto;
          }
          .section-heading,
          .row-title,
          .attached-file {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
