"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MAX_MANUAL_GLB_BATCH_FILES,
  buildManualCcByAttributionText,
  manualConceptFromFileName,
  parseManualGlbFileName,
  validateCcByImportDraft,
  type ManualCcByLicenseKind,
} from "../manual-glb-batch-intake";
import {
  buildPolyPizzaAttributionText,
  parsePolyPizzaFileName,
  polyPizzaAssetId,
  polyPizzaConceptFromFileName,
  polyPizzaSourceUrl,
  validatePolyPizzaImportDraft,
} from "../poly-pizza-manual-intake";

type RowStatus =
  | "draft"
  | "importing"
  | "imported"
  | "duplicate"
  | "failed";

type CcByBatchRow = {
  row_id: string;
  file: File;
  selected: boolean;
  concept: string;
  aliases: string;
  semantic_tags: string;
  source_provider: string;
  source_url: string;
  source_asset_id: string;
  source_title: string;
  creator_name: string;
  license_kind: ManualCcByLicenseKind;
  modification_notice: string;
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

type CcByBatchImportLabProps = {
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

export function CcByBatchImportLab({
  onImportComplete,
  onRunningChange,
}: CcByBatchImportLabProps) {
  const [rows, setRows] =
    useState<CcByBatchRow[]>([]);
  const [polyPizzaMode, setPolyPizzaMode] =
    useState(true);
  const [targetExtentM, setTargetExtentM] =
    useState("2");
  const [domain, setDomain] = useState(
    "cc_by_manual_intake",
  );
  const [defaultSourceProvider, setDefaultSourceProvider] =
    useState("");
  const [defaultLicenseKind, setDefaultLicenseKind] =
    useState<ManualCcByLicenseKind>(
      "cc_by",
    );
  const [downloadedAt, setDownloadedAt] =
    useState(today());
  const [defaultModificationNotice, setDefaultModificationNotice] =
    useState(
      DEFAULT_MODIFICATION_NOTICE,
    );
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
        "myway_cc_by_batch_defaults_v1",
      );
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        polyPizzaMode?: boolean;
        targetExtentM?: string;
        domain?: string;
        defaultSourceProvider?: string;
        defaultLicenseKind?: ManualCcByLicenseKind;
        downloadedAt?: string;
        defaultModificationNotice?: string;
      };
      setPolyPizzaMode(
        parsed.polyPizzaMode ?? true,
      );
      setTargetExtentM(
        parsed.targetExtentM ?? "2",
      );
      setDomain(
        parsed.domain ??
          "cc_by_manual_intake",
      );
      setDefaultSourceProvider(
        parsed.defaultSourceProvider ?? "",
      );
      setDefaultLicenseKind(
        parsed.defaultLicenseKind ===
          "cc_by_4_0"
          ? "cc_by_4_0"
          : "cc_by",
      );
      setDownloadedAt(
        parsed.downloadedAt ?? today(),
      );
      setDefaultModificationNotice(
        parsed.defaultModificationNotice ??
          DEFAULT_MODIFICATION_NOTICE,
      );
    } catch {
      // Invalid local preferences should not block importing.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "myway_cc_by_batch_defaults_v1",
      JSON.stringify({
        polyPizzaMode,
        targetExtentM,
        domain,
        defaultSourceProvider,
        defaultLicenseKind,
        downloadedAt,
        defaultModificationNotice,
      }),
    );
  }, [
    polyPizzaMode,
    targetExtentM,
    domain,
    defaultSourceProvider,
    defaultLicenseKind,
    downloadedAt,
    defaultModificationNotice,
  ]);

  useEffect(() => {
    onRunningChange?.(running);
    return () => {
      onRunningChange?.(false);
    };
  }, [running, onRunningChange]);

  function effectiveProvider(
    row: CcByBatchRow,
  ) {
    return polyPizzaMode
      ? "Poly Pizza"
      : row.source_provider.trim() ||
          defaultSourceProvider.trim();
  }

  function effectiveSourceUrl(
    row: CcByBatchRow,
  ) {
    return polyPizzaMode
      ? polyPizzaSourceUrl(
          row.source_asset_id,
        )
      : row.source_url.trim();
  }

  function rowAssetId(
    row: CcByBatchRow,
  ) {
    return polyPizzaMode
      ? polyPizzaAssetId(
          row.concept,
          row.source_asset_id,
        )
      : "Generated on import";
  }

  function rowAttribution(
    row: CcByBatchRow,
  ) {
    if (polyPizzaMode) {
      return buildPolyPizzaAttributionText({
        sourceTitle:
          row.source_title ||
          row.concept,
        creatorName:
          row.creator_name,
        licenseKind:
          row.license_kind,
      });
    }
    return buildManualCcByAttributionText({
      sourceTitle:
        row.source_title ||
        row.concept,
      creatorName:
        row.creator_name,
      sourceProvider:
        effectiveProvider(row),
      licenseKind:
        row.license_kind,
    });
  }

  function rowErrors(
    row: CcByBatchRow,
  ) {
    if (polyPizzaMode) {
      return validatePolyPizzaImportDraft({
        file_name: row.file.name,
        concept: row.concept,
        source_asset_id:
          row.source_asset_id,
        source_title:
          row.source_title ||
          row.concept,
        creator_name:
          row.creator_name,
        license_kind:
          row.license_kind,
        modification_notice:
          row.modification_notice,
      });
    }
    return validateCcByImportDraft({
      file_name: row.file.name,
      concept: row.concept,
      source_provider:
        effectiveProvider(row),
      source_url:
        effectiveSourceUrl(row),
      source_asset_id:
        row.source_asset_id,
      source_title:
        row.source_title ||
        row.concept,
      creator_name:
        row.creator_name,
      license_kind:
        row.license_kind,
      modification_notice:
        row.modification_notice,
    });
  }

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
  }, [
    rows,
    polyPizzaMode,
    defaultSourceProvider,
  ]);

  function updateRow(
    rowId: string,
    patch: Partial<CcByBatchRow>,
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

  function changePolyPizzaMode(
    nextMode: boolean,
  ) {
    if (running) return;
    setPolyPizzaMode(nextMode);
    setDomain(
      nextMode
        ? "poly_pizza_manual_intake"
        : "cc_by_manual_intake",
    );
    setRows((current) =>
      current.map((row) => {
        if (
          row.status === "imported" ||
          row.status === "duplicate"
        ) {
          return row;
        }
        if (nextMode) {
          const parsed =
            parsePolyPizzaFileName(
              row.file.name,
            );
          return {
            ...row,
            concept:
              polyPizzaConceptFromFileName(
                row.file.name,
              ),
            semantic_tags:
              row.semantic_tags ||
              "poly pizza, low poly",
            source_provider:
              "Poly Pizza",
            source_url:
              polyPizzaSourceUrl(
                parsed.source_asset_id ?? "",
              ),
            source_asset_id:
              parsed.source_asset_id ?? "",
            source_title:
              parsed.source_title,
            creator_name:
              parsed.creator_name ?? "",
            status: "draft",
            message: null,
          };
        }
        const parsed =
          parseManualGlbFileName(
            row.file.name,
          );
        return {
          ...row,
          concept:
            manualConceptFromFileName(
              row.file.name,
            ),
          semantic_tags:
            row.semantic_tags
              .split(",")
              .map((item) => item.trim())
              .filter(
                (item) =>
                  item.toLowerCase() !==
                    "poly pizza" &&
                  item.toLowerCase() !==
                    "low poly",
              )
              .join(", "),
          source_provider: "",
          source_url: "",
          source_asset_id:
            parsed.source_asset_id,
          source_title:
            parsed.source_title,
          creator_name:
            parsed.creator_name ?? "",
          status: "draft",
          message: null,
        };
      }),
    );
    setGlobalError(null);
    setGlobalMessage(
      nextMode
        ? "Poly Pizza mode is on. MyWay will derive Poly Pizza metadata and use concept_polyp_modelid asset IDs."
        : "Poly Pizza mode is off. Enter the source provider and source page for each generic CC BY asset; MyWay will not use the polyp naming rule.",
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
      const generic =
        parseManualGlbFileName(
          file.name,
        );
      const poly =
        parsePolyPizzaFileName(
          file.name,
        );
      const sourceAssetId =
        polyPizzaMode
          ? poly.source_asset_id ?? ""
          : generic.source_asset_id;
      return {
        row_id:
          `${file.name}:${file.size}:${file.lastModified}`,
        file,
        selected: true,
        concept: polyPizzaMode
          ? polyPizzaConceptFromFileName(
              file.name,
            )
          : manualConceptFromFileName(
              file.name,
            ),
        aliases: "",
        semantic_tags:
          polyPizzaMode
            ? "poly pizza, low poly"
            : "",
        source_provider:
          polyPizzaMode
            ? "Poly Pizza"
            : "",
        source_url:
          polyPizzaMode
            ? polyPizzaSourceUrl(
                sourceAssetId,
              )
            : "",
        source_asset_id:
          sourceAssetId,
        source_title:
          polyPizzaMode
            ? poly.source_title
            : generic.source_title,
        creator_name:
          polyPizzaMode
            ? poly.creator_name ?? ""
            : generic.creator_name ?? "",
        license_kind:
          defaultLicenseKind,
        modification_notice:
          defaultModificationNotice,
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
        ? `Added ${next.length} CC BY GLB file(s). Each file now has a review row.`
        : "No new GLB files were added.",
    );
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
        const provider =
          effectiveProvider(row);
        const sourceUrl =
          effectiveSourceUrl(row);
        const attribution =
          rowAttribution(row);
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
            (polyPizzaMode
              ? "poly_pizza_manual_intake"
              : "cc_by_manual_intake"),
        );
        formData.set(
          "target_extent_m",
          String(parsedExtent),
        );
        formData.set(
          "source_provider",
          provider,
        );
        formData.set(
          "source_url",
          sourceUrl,
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
        formData.set(
          "license_kind",
          row.license_kind,
        );
        formData.set(
          "license_version",
          row.license_kind ===
            "cc_by_4_0"
            ? "4.0"
            : "",
        );
        formData.set(
          "attribution",
          attribution,
        );
        formData.set(
          "modification_notice",
          row.modification_notice.trim(),
        );
        formData.set(
          "downloaded_at",
          downloadedAt,
        );
        formData.set(
          "provenance_notes",
          polyPizzaMode
            ? "Manually downloaded from Poly Pizza and imported through MyWay's CC BY multi-GLB intake."
            : "Manually downloaded from a user-recorded CC BY source and imported through MyWay's CC BY multi-GLB intake.",
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
              "The CC BY GLB import failed.",
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
        : "The selected CC BY import queue finished. New assets are in Needs review.",
    );
  }

  return (
    <div className="manual-batch-panel">
      <div className="intro">
        <strong>
          Import manually downloaded CC BY GLBs
        </strong>
        <small>
          Add up to {MAX_MANUAL_GLB_BATCH_FILES} files per batch. Attribution is generated from the recorded title, creator, licence, and source. Poly Pizza mode applies the deterministic concept_polyp_modelid naming rule and derives its source page from the model ID.
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

      <section className="panel source-mode">
        <label className="toggle-row">
          <input
            checked={polyPizzaMode}
            disabled={running}
            onChange={(event) =>
              changePolyPizzaMode(
                event.target.checked,
              )
            }
            type="checkbox"
          />
          <span>
            <strong>Poly Pizza source</strong>
            <small>
              Turn this on for Poly Pizza downloads. MyWay parses filenames such as “Mouse by jeremy - 6DOjEGKd8nx.glb”, uses Poly Pizza as the provider, derives the source page, and generates IDs such as mouse_polyp_6dojegkd8nx. Turn it off for CC BY assets from other sources.
            </small>
          </span>
        </label>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>1. Add CC BY GLB files</h3>
            <p>
              Selected files appear immediately below. Adding more files appends more rows until the 50-file batch limit is reached.
            </p>
          </div>
          <label className="file-button">
            Add GLB files
            <input
              accept=".glb,model/gltf-binary,application/octet-stream"
              disabled={
                running ||
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
                    {formatBytes(row.file.size)} · {polyPizzaMode ? rowAssetId(row) || "Poly Pizza ID needed" : row.concept || "concept needed"}
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
        {!polyPizzaMode ? (
          <label>
            Default source provider
            <input
              disabled={running}
              onChange={(event) =>
                setDefaultSourceProvider(
                  event.target.value,
                )
              }
              placeholder="For example: Sketchfab"
              value={defaultSourceProvider}
            />
            <small>
              Required for generic CC BY assets; rows may override it.
            </small>
          </label>
        ) : (
          <label>
            Source provider
            <input
              readOnly
              value="Poly Pizza"
            />
          </label>
        )}
        <label>
          Default licence
          <select
            disabled={running}
            onChange={(event) => {
              const value =
                event.target.value as ManualCcByLicenseKind;
              setDefaultLicenseKind(value);
              setRows((current) =>
                current.map((row) =>
                  row.status === "imported" ||
                  row.status === "duplicate"
                    ? row
                    : {
                        ...row,
                        license_kind: value,
                      },
                ),
              );
            }}
            value={defaultLicenseKind}
          >
            <option value="cc_by">
              CC BY — version unspecified
            </option>
            <option value="cc_by_4_0">
              CC BY 4.0
            </option>
          </select>
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
        <label className="wide">
          Default modification notice
          <input
            disabled={running}
            onChange={(event) => {
              const value =
                event.target.value;
              setDefaultModificationNotice(
                value,
              );
              setRows((current) =>
                current.map((row) =>
                  row.status === "imported" ||
                  row.status === "duplicate"
                    ? row
                    : {
                        ...row,
                        modification_notice:
                          value,
                      },
                ),
              );
            }}
            value={defaultModificationNotice}
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
              const technicalId =
                rowAssetId(row);
              const sourceUrl =
                effectiveSourceUrl(row);
              const attribution =
                rowAttribution(row);
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
                        placeholder="mouse"
                        value={row.concept}
                      />
                      <small>
                        Used for search and scene matching.
                      </small>
                    </label>
                    <label>
                      Asset ID
                      <input
                        readOnly
                        value={technicalId}
                      />
                      <small>
                        {polyPizzaMode
                          ? "Generated as concept_polyp_PolyPizzaID."
                          : "Generic CC BY imports receive the normal manual asset ID; no polyp suffix is used."}
                      </small>
                    </label>
                    <label>
                      Source asset title
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
                      Creator
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            creator_name:
                              event.target.value,
                          })
                        }
                        placeholder="Creator name"
                        value={row.creator_name}
                      />
                    </label>
                    {!polyPizzaMode ? (
                      <label>
                        Source provider override
                        <input
                          disabled={running}
                          onChange={(event) =>
                            updateRow(row.row_id, {
                              source_provider:
                                event.target.value,
                            })
                          }
                          placeholder={
                            defaultSourceProvider ||
                            "Required source"
                          }
                          value={row.source_provider}
                        />
                      </label>
                    ) : null}
                    <label>
                      {polyPizzaMode
                        ? "Poly Pizza ID"
                        : "Stable source asset ID"}
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            source_asset_id:
                              event.target.value.trim(),
                          })
                        }
                        value={row.source_asset_id}
                      />
                    </label>
                    <label className="wide">
                      Source page
                      <input
                        disabled={
                          running ||
                          polyPizzaMode
                        }
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            source_url:
                              event.target.value,
                          })
                        }
                        placeholder="https://source.example/model/..."
                        readOnly={polyPizzaMode}
                        type="url"
                        value={sourceUrl}
                      />
                    </label>
                    <label>
                      Licence
                      <select
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            license_kind:
                              event.target.value as ManualCcByLicenseKind,
                          })
                        }
                        value={row.license_kind}
                      >
                        <option value="cc_by">
                          CC BY — version unspecified
                        </option>
                        <option value="cc_by_4_0">
                          CC BY 4.0
                        </option>
                      </select>
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
                        placeholder="rodent, small mouse"
                        value={row.aliases}
                      />
                    </label>
                    <label className="wide">
                      Semantic tags
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            semantic_tags:
                              event.target.value,
                          })
                        }
                        placeholder="animal, rodent, low poly"
                        value={row.semantic_tags}
                      />
                    </label>
                    <label className="wide">
                      Modification notice
                      <input
                        disabled={running}
                        onChange={(event) =>
                          updateRow(row.row_id, {
                            modification_notice:
                              event.target.value,
                          })
                        }
                        value={row.modification_notice}
                      />
                    </label>
                  </div>

                  <div className="derived-record">
                    <span>
                      Source provider: <strong>{effectiveProvider(row) || "required"}</strong>
                    </span>
                    <span>
                      Source page: {sourceUrl || "required"}
                    </span>
                    <span>
                      Credit generated automatically: <strong>{attribution || "waiting for title, creator, and source"}</strong>
                    </span>
                  </div>

                  {errors.length ? (
                    <ul className="errors">
                      {errors.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ready">
                      Ready: source identity, licence, generated credit, and modification notice are complete. The asset will still enter Needs review before scene approval.
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
              Add GLB files above to create review rows.
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
        .toggle-row {
          display: flex;
          align-items: flex-start;
          gap: 11px;
        }
        .toggle-row input {
          width: auto;
          margin-top: 4px;
        }
        .toggle-row strong {
          display: block;
          margin-bottom: 4px;
          color: #eef7ff;
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
        input[readonly] {
          color: #91cce9;
          background: rgba(7, 27, 42, 0.86);
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
        .derived-record {
          display: grid;
          gap: 6px;
          margin-top: 12px;
          border: 1px solid rgba(125, 211, 252, 0.13);
          border-radius: 9px;
          padding: 10px;
          color: #a8bdd5;
          font-size: 12px;
          overflow-wrap: anywhere;
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
          .row-grid {
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
