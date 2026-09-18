"use client";

import { useMemo, useRef, useState } from "react";

type AuditStatus =
  | "healthy"
  | "recoverable_reference"
  | "missing_object"
  | "visual_blank"
  | "visual_too_small"
  | "visual_decode_error"
  | "unsupported";

type AuditItem = {
  asset_id: string;
  source_asset_id: string | null;
  concept_name: string | null;
  status: AuditStatus;
  thumbnail_object_key: string | null;
  registered_reference: boolean;
  object_exists: boolean;
  visual_assessment: {
    status:
      | "healthy"
      | "visual_blank"
      | "visual_too_small"
      | "visual_decode_error";
    width: number;
    height: number;
    visible_pixels: number;
    visible_fraction: number;
    bbox_width_fraction: number;
    bbox_height_fraction: number;
    bbox_area_fraction: number;
    max_span_fraction: number;
    reason: string;
  } | null;
};

type CalibrationCandidate = {
  id: string;
  label: string;
  description: string;
  render_profile: string;
  data_url: string | null;
  visual_assessment: AuditItem["visual_assessment"];
  error: string | null;
};

type CalibrationResult = {
  asset_id: string;
  source_asset_id: string | null;
  concept_name: string | null;
  target_color_hex: string;
  candidates: CalibrationCandidate[];
  storage_mutated: false;
};

type AuditResponse = {
  ok: boolean;
  total?: number;
  offset?: number;
  limit?: number;
  next_offset?: number | null;
  items?: AuditItem[];
  repair?: {
    asset_id: string;
    result:
      | "reference_repaired"
      | "thumbnail_regenerated"
      | "thumbnail_visual_regenerated"
      | "thumbnail_appearance_preview_regenerated"
      | "thumbnail_viewer_match_refined_regenerated";
  };
  calibration?: CalibrationResult;
  batch?: RefinedBatchResult;
  error?: string;
};


const BULK_CHECKPOINT_SIZE = 4;
const BULK_YIELD_MS = 250;
const DEFAULT_REFINED_BATCH_IDS = [
  "epiglottis_man_56eea5e0",
  "tongue_man_ed09301a",
  "esophagus_man_4cafb55a",
  "trachea_man_eb4af2ee",
  "inferior_vena_cava_man_8718fb2f",
].join("\n");

type RefinedBatchResult = {
  asset_ids: string[];
  results: Array<{
    asset_id: string;
    result:
      | "thumbnail_viewer_match_refined_regenerated"
      | "thumbnail_appearance_preview_regenerated"
      | "thumbnail_visual_regenerated"
      | "thumbnail_regenerated"
      | "reference_repaired";
  }>;
  stop_on_first_failure: true;
};

function parseExplicitAssetIds(value: string) {
  const unique = new Set<string>();
  const normalized: string[] = [];
  for (const piece of value.split(/[\s,]+/)) {
    const trimmed = piece.trim();
    if (!trimmed || unique.has(trimmed)) continue;
    unique.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

type BulkProgress = {
  total: number;
  completed: number;
  regenerated: number;
  failed: number;
  current_asset_id: string | null;
  current_label: string | null;
};

function isVisualIssue(item: AuditItem) {
  return (
    item.status === "visual_blank" ||
    item.status === "visual_too_small" ||
    item.status === "visual_decode_error"
  );
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, BULK_YIELD_MS);
  });
}

async function readJson(response: Response) {
  const text = await response.text();
  let value: AuditResponse;
  try {
    value = JSON.parse(text) as AuditResponse;
  } catch {
    throw new Error(
      `Anatomy thumbnail API returned non-JSON data (HTTP ${response.status}).`,
    );
  }
  if (!response.ok || !value.ok) {
    throw new Error(
      value.error ||
        `Anatomy thumbnail request failed (${response.status}).`,
    );
  }
  return value;
}

export function BodyParts3dThumbnailMaintenanceLab({
  registryRevision,
  onChanged,
}: {
  registryRevision: string;
  onChanged?: (message: string) => void;
}) {
  const [auditItems, setAuditItems] =
    useState<AuditItem[]>([]);
  const [auditTotal, setAuditTotal] =
    useState(0);
  const [running, setRunning] =
    useState<"audit" | "repair" | "bulk" | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] =
    useState("");
  const [sampleBatchAssetIds, setSampleBatchAssetIds] =
    useState(DEFAULT_REFINED_BATCH_IDS);
  const [previewRunning, setPreviewRunning] =
    useState(false);
  const [refinedRunning, setRefinedRunning] =
    useState(false);
  const [refinedBatchRunning, setRefinedBatchRunning] =
    useState(false);
  const [calibrationRunning, setCalibrationRunning] =
    useState(false);
  const [calibrationResult, setCalibrationResult] =
    useState<CalibrationResult | null>(null);
  const [refinedBatchResult, setRefinedBatchResult] =
    useState<RefinedBatchResult | null>(null);
  const pauseRequested = useRef(false);
  const [bulkPauseRequested, setBulkPauseRequested] =
    useState(false);
  const [bulkProgress, setBulkProgress] =
    useState<BulkProgress | null>(null);

  const counts = useMemo(() => {
    const next = {
      healthy: 0,
      recoverable_reference: 0,
      missing_object: 0,
      visual_blank: 0,
      visual_too_small: 0,
      visual_decode_error: 0,
      unsupported: 0,
    };
    for (const item of auditItems) {
      next[item.status] += 1;
    }
    return next;
  }, [auditItems]);

  const repairQueue = useMemo(
    () =>
      auditItems
        .filter(
          (item) =>
            item.status ===
              "recoverable_reference" ||
            item.status ===
              "missing_object" ||
            item.status ===
              "visual_blank" ||
            item.status ===
              "visual_too_small" ||
            item.status ===
              "visual_decode_error",
        )
        .map((item) => item.asset_id),
    [auditItems],
  );

  const visualRegenerationQueue = useMemo(
    () => auditItems.filter(isVisualIssue),
    [auditItems],
  );

  const explicitSampleBatchIds = useMemo(
    () => parseExplicitAssetIds(sampleBatchAssetIds),
    [sampleBatchAssetIds],
  );

  const auditComplete =
    auditTotal > 0 &&
    auditItems.length === auditTotal;

  async function audit() {
    if (running) return;
    setRunning("audit");
    setError(null);
    setNotice(null);
    setAuditItems([]);
    setAuditTotal(0);

    try {
      let offset = 0;
      const collected: AuditItem[] = [];

      while (true) {
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              action: "audit_batch",
              registry_revision:
                registryRevision,
              offset,
              limit: 48,
            }),
          },
        );
        const json = await readJson(response);
        const items = json.items ?? [];
        collected.push(...items);
        setAuditItems([...collected]);
        setAuditTotal(json.total ?? collected.length);

        if (json.next_offset == null) break;
        offset = json.next_offset;
      }

      const healthy =
        collected.filter(
          (item) => item.status === "healthy",
        ).length;
      const recoverable =
        collected.filter(
          (item) =>
            item.status ===
              "recoverable_reference",
        ).length;
      const missing =
        collected.filter(
          (item) =>
            item.status === "missing_object",
        ).length;
      const visuallyBad =
        collected.filter(
          (item) =>
            item.status === "visual_blank" ||
            item.status === "visual_too_small" ||
            item.status === "visual_decode_error",
        ).length;
      setNotice(
        `Visual audit complete: ${healthy.toLocaleString()} visually healthy, ${visuallyBad.toLocaleString()} visually bad PNG(s), ${recoverable.toLocaleString()} registry-reference repair(s), ${missing.toLocaleString()} missing PNG(s).`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setRunning(null);
    }
  }

  function markAuditItemHealthy(assetId: string) {
    setAuditItems((current) =>
      current.map((item) =>
        item.asset_id === assetId
          ? {
              ...item,
              status: "healthy",
              registered_reference: true,
              object_exists: true,
              visual_assessment: null,
            }
          : item,
      ),
    );
  }

  async function repairAuditItem(item: AuditItem) {
    const needsVisualRegeneration =
      isVisualIssue(item);
    const response = await fetch(
      "/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: needsVisualRegeneration
            ? "regenerate_visual_one"
            : "backfill_one",
          registry_revision:
            registryRevision,
          asset_id: item.asset_id,
        }),
      },
    );
    const json = await readJson(response);
    markAuditItemHealthy(item.asset_id);
    return json.repair?.result ?? null;
  }

  async function renderAppearanceCalibrationOne() {
    const assetId = previewAssetId.trim();
    if (
      running ||
      previewRunning ||
      refinedRunning ||
      refinedBatchRunning ||
      calibrationRunning ||
      !assetId
    ) {
      return;
    }

    setCalibrationRunning(true);
    setCalibrationResult(null);
    setRefinedBatchResult(null);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "render_appearance_calibration_one",
            registry_revision: registryRevision,
            asset_id: assetId,
          }),
        },
      );
      const json = await readJson(response);
      if (!json.calibration) {
        throw new Error(
          "The one-asset calibration did not return candidate renders.",
        );
      }
      if (json.calibration.storage_mutated !== false) {
        throw new Error(
          "Calibration unexpectedly reported a storage mutation.",
        );
      }

      setCalibrationResult(json.calibration);
      setNotice(
        `Rendered ${json.calibration.candidates.length} temporary calibration candidate(s) for ${json.calibration.asset_id}. No R2 thumbnail or registry record was changed.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setCalibrationRunning(false);
    }
  }

  async function regenerateAppearancePreviewOne() {
    const assetId = previewAssetId.trim();
    if (
      running ||
      previewRunning ||
      refinedRunning ||
      refinedBatchRunning ||
      calibrationRunning ||
      !assetId
    ) {
      return;
    }

    setPreviewRunning(true);
    setError(null);
    setNotice(null);
    setRefinedBatchResult(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "regenerate_appearance_preview_one",
            registry_revision: registryRevision,
            asset_id: assetId,
          }),
        },
      );
      const json = await readJson(response);
      if (
        json.repair?.result !==
        "thumbnail_appearance_preview_regenerated"
      ) {
        throw new Error(
          "The one-asset appearance preview did not return the expected regeneration result.",
        );
      }

      const message =
        `One-asset anatomy thumbnail preview regenerated for ${json.repair.asset_id}. Inspect its card against the 3D viewer before changing the bulk path.`;
      setNotice(message);
      onChanged?.(message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setPreviewRunning(false);
    }
  }

  async function regenerateViewerMatchRefinedOne() {
    const assetId = previewAssetId.trim();
    if (
      running ||
      previewRunning ||
      refinedRunning ||
      refinedBatchRunning ||
      calibrationRunning ||
      !assetId
    ) {
      return;
    }

    setRefinedRunning(true);
    setError(null);
    setNotice(null);
    setRefinedBatchResult(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "regenerate_viewer_match_refined_one",
            registry_revision: registryRevision,
            asset_id: assetId,
          }),
        },
      );
      const json = await readJson(response);
      if (
        json.repair?.result !==
        "thumbnail_viewer_match_refined_regenerated"
      ) {
        throw new Error(
          "The refined viewer-match render did not return the expected regeneration result.",
        );
      }

      const message =
        `Refined viewer-match thumbnail applied to ${json.repair.asset_id}. This overwrote only that asset's R2 thumbnail after visual QA; bulk regeneration remains unchanged.`;
      setNotice(message);
      onChanged?.(message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setRefinedRunning(false);
    }
  }

  async function regenerateViewerMatchRefinedBatch() {
    if (
      running ||
      previewRunning ||
      refinedRunning ||
      refinedBatchRunning ||
      calibrationRunning ||
      explicitSampleBatchIds.length === 0
    ) {
      return;
    }

    setRefinedBatchRunning(true);
    setRefinedBatchResult(null);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "regenerate_viewer_match_refined_batch",
            registry_revision: registryRevision,
            asset_ids: explicitSampleBatchIds,
          }),
        },
      );
      const json = await readJson(response);
      if (!json.batch) {
        throw new Error(
          "The explicit refined sample batch did not return any results.",
        );
      }
      if (json.batch.results.length !== explicitSampleBatchIds.length) {
        throw new Error(
          "The explicit refined sample batch did not return the expected number of results.",
        );
      }

      setRefinedBatchResult(json.batch);
      const message =
        `Refined viewer-match profile applied to ${json.batch.results.length} explicit sample asset(s). This overwrote only those listed thumbnails after visual QA, stopping on first failure if any asset breaks.`;
      setNotice(message);
      onChanged?.(message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setRefinedBatchRunning(false);
    }
  }

  async function repairNext() {
    if (running || !repairQueue.length) return;
    setRunning("repair");
    setError(null);
    setNotice(null);

    const selectedIds =
      repairQueue.slice(0, 4);
    const selected =
      selectedIds
        .map((assetId) =>
          auditItems.find((item) => item.asset_id === assetId),
        )
        .filter((item): item is AuditItem => Boolean(item));
    let repaired = 0;
    let regenerated = 0;

    try {
      for (const item of selected) {
        const result = await repairAuditItem(item);
        if (
          result === "thumbnail_regenerated" ||
          result === "thumbnail_visual_regenerated"
        ) {
          regenerated += 1;
        } else {
          repaired += 1;
        }
      }

      const message =
        `BodyParts3D thumbnail repair completed for ${selected.length} asset(s): ${repaired} registry reference(s) repaired and ${regenerated} PNG(s) regenerated with visual QA.`;
      setNotice(message);
      onChanged?.(message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setRunning(null);
    }
  }

  function pauseBulkRegeneration() {
    if (running !== "bulk") return;
    pauseRequested.current = true;
    setBulkPauseRequested(true);
  }

  async function regenerateAllVisualIssues() {
    if (
      running ||
      !auditComplete ||
      !visualRegenerationQueue.length
    ) {
      return;
    }

    const queue = [...visualRegenerationQueue];
    pauseRequested.current = false;
    setBulkPauseRequested(false);
    setRunning("bulk");
    setError(null);
    setNotice(null);
    setBulkProgress({
      total: queue.length,
      completed: 0,
      regenerated: 0,
      failed: 0,
      current_asset_id: null,
      current_label: null,
    });

    let completed = 0;
    let regenerated = 0;
    let failed = 0;
    let failure: unknown = null;

    try {
      for (const item of queue) {
        if (pauseRequested.current) break;

        setBulkProgress({
          total: queue.length,
          completed,
          regenerated,
          failed,
          current_asset_id: item.asset_id,
          current_label:
            item.concept_name ??
            item.source_asset_id ??
            item.asset_id,
        });

        try {
          const result = await repairAuditItem(item);
          if (
            result === "thumbnail_regenerated" ||
            result === "thumbnail_visual_regenerated"
          ) {
            regenerated += 1;
          }
          completed += 1;
        } catch (caught) {
          failed += 1;
          failure = caught;
          break;
        }

        setBulkProgress({
          total: queue.length,
          completed,
          regenerated,
          failed,
          current_asset_id: null,
          current_label: null,
        });

        if (
          completed > 0 &&
          completed % BULK_CHECKPOINT_SIZE === 0
        ) {
          await yieldToBrowser();
        }
      }

      const remaining =
        Math.max(0, queue.length - completed);
      const paused =
        pauseRequested.current && !failure;
      const message = failure
        ? `Bulk BodyParts3D thumbnail regeneration stopped after ${completed.toLocaleString()} / ${queue.length.toLocaleString()} completed in this run. ${remaining.toLocaleString()} remain in this audit queue.`
        : paused
          ? `Bulk BodyParts3D thumbnail regeneration paused after ${completed.toLocaleString()} / ${queue.length.toLocaleString()} completed in this run. ${remaining.toLocaleString()} remain and can be resumed.`
          : `Bulk BodyParts3D thumbnail regeneration complete: ${completed.toLocaleString()} / ${queue.length.toLocaleString()} visually bad PNG(s) regenerated and revalidated.`;

      setBulkProgress({
        total: queue.length,
        completed,
        regenerated,
        failed,
        current_asset_id: null,
        current_label: null,
      });
      setNotice(message);

      if (completed > 0) {
        onChanged?.(message);
      }

      if (failure) {
        setError(
          `Bulk regeneration stopped on the first failed asset so MyWay does not hammer Blender repeatedly. ${failure instanceof Error ? failure.message : String(failure)}`,
        );
      }
    } finally {
      pauseRequested.current = false;
      setBulkPauseRequested(false);
      setRunning(null);
    }
  }

  return (
    <section
      className="asset-library-import-panel"
      style={{ marginTop: 18 }}
    >
      <div className="asset-library-section-heading">
        <div>
          <span className="asset-library-kicker">
            BodyParts3D thumbnail maintenance
          </span>
          <h3>Visual QA for existing anatomy thumbnails</h3>
          <p>
            This does not re-import the atlas. It decodes
            each existing private-R2 PNG, measures the visible
            subject bounding box, and flags blank or badly
            undersized catalog renders. Blender runs only for
            thumbnails that are missing or fail visual QA.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 12,
        }}
      >
        <input
          aria-label="BodyParts3D asset ID for one-thumbnail appearance preview"
          disabled={Boolean(running) || previewRunning || refinedRunning || refinedBatchRunning || calibrationRunning}
          onChange={(event) => setPreviewAssetId(event.target.value)}
          placeholder="Paste one anatomy asset ID (for example trachea_man_...)"
          style={{
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            color: "inherit",
            flex: "1 1 360px",
            minWidth: 260,
            padding: "0.7rem 0.85rem",
          }}
          type="text"
          value={previewAssetId}
        />
        <button
          className="asset-library-secondary-button"
          disabled={
            Boolean(running) ||
            previewRunning ||
            refinedRunning ||
            refinedBatchRunning ||
            calibrationRunning ||
            !previewAssetId.trim()
          }
          onClick={() => void renderAppearanceCalibrationOne()}
          type="button"
        >
          {calibrationRunning
            ? "Rendering 4 calibration candidates…"
            : "Render 4 calibration candidates (no overwrite)"}
        </button>
        <button
          className="asset-library-secondary-button"
          disabled={
            Boolean(running) ||
            previewRunning ||
            refinedRunning ||
            refinedBatchRunning ||
            calibrationRunning ||
            !previewAssetId.trim()
          }
          onClick={() => void regenerateAppearancePreviewOne()}
          type="button"
        >
          {previewRunning
            ? "Rendering one appearance preview…"
            : "Preview viewer-like thumbnail for one asset"}
        </button>
        <button
          className="asset-library-secondary-button"
          disabled={
            Boolean(running) ||
            previewRunning ||
            refinedRunning ||
            refinedBatchRunning ||
            calibrationRunning ||
            !previewAssetId.trim()
          }
          onClick={() => void regenerateViewerMatchRefinedOne()}
          type="button"
        >
          {refinedRunning
            ? "Applying refined viewer match…"
            : "Apply refined D to one asset (overwrites thumbnail)"}
        </button>
      </div>
      <p style={{ marginTop: 8 }}>
        Calibration is the safe next step and remains non-destructive. A.12.17P3 adds a separate
        refined-D action for one explicitly selected asset only. That action uses scene-linear semantic
        color, a slightly brighter AgX exposure, and a higher fill-to-key ratio than candidate D, then
        overwrites only that asset's R2 thumbnail after the existing visual-QA gate passes.
        One-asset preview only remains available for direct comparison with the earlier A.12.17P1 experiment.
        A.12.17P4 adds an explicit small sample-batch path that reuses the same refined profile across a few
        manually listed atlas assets so color matching can be judged across multiple GLB categories before the
        bulk path is changed. Existing audit and bulk regeneration behavior remains unchanged.
      </p>

      <div
        style={{
          display: "grid",
          gap: 10,
          marginTop: 12,
        }}
      >
        <textarea
          aria-label="Explicit BodyParts3D sample asset IDs for refined thumbnail batch"
          disabled={Boolean(running) || previewRunning || refinedRunning || refinedBatchRunning || calibrationRunning}
          onChange={(event) => setSampleBatchAssetIds(event.target.value)}
          rows={6}
          style={{
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            color: "inherit",
            minWidth: 260,
            padding: "0.7rem 0.85rem",
            width: "100%",
          }}
          value={sampleBatchAssetIds}
        />
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <button
            className="asset-library-secondary-button"
            disabled={
              Boolean(running) ||
              previewRunning ||
              refinedRunning ||
              refinedBatchRunning ||
              calibrationRunning ||
              explicitSampleBatchIds.length === 0
            }
            onClick={() => void regenerateViewerMatchRefinedBatch()}
            type="button"
          >
            {refinedBatchRunning
              ? "Applying refined profile to explicit sample batch…"
              : `Apply refined profile to explicit sample batch (${explicitSampleBatchIds.length} assets, overwrites thumbnails)`}
          </button>
          <span style={{ fontSize: 13, opacity: 0.82 }}>
            Explicit sample batch only · sequential overwrite path · stopping on first failure · bulk regeneration remains unchanged.
          </span>
        </div>
      </div>

      {calibrationResult ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <strong>
              Calibration · {calibrationResult.concept_name ?? calibrationResult.asset_id}
            </strong>
            <span>
              Target semantic color {calibrationResult.target_color_hex}
            </span>
            <span
              aria-label={`Target color ${calibrationResult.target_color_hex}`}
              style={{
                background: calibrationResult.target_color_hex,
                border: "1px solid rgba(255,255,255,0.45)",
                borderRadius: 6,
                display: "inline-block",
                height: 24,
                width: 48,
              }}
            />
            <span>
              · temporary only · storage mutated: no
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",
            }}
          >
            {calibrationResult.candidates.map((candidate) => (
              <article
                key={candidate.id}
                style={{
                  background: "rgba(15, 23, 42, 0.72)",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  borderRadius: 12,
                  overflow: "hidden",
                  padding: 10,
                }}
              >
                <strong>
                  {candidate.id} · {candidate.label}
                </strong>
                <p
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    opacity: 0.75,
                    overflowWrap: "anywhere",
                  }}
                >
                  {candidate.render_profile}
                </p>

                {candidate.data_url ? (
                  <img
                    alt={`${candidate.label} thumbnail calibration candidate`}
                    src={candidate.data_url}
                    style={{
                      aspectRatio: "1 / 1",
                      background: "#07111f",
                      borderRadius: 8,
                      display: "block",
                      marginTop: 8,
                      objectFit: "contain",
                      width: "100%",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      alignItems: "center",
                      aspectRatio: "1 / 1",
                      background: "#07111f",
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "center",
                      marginTop: 8,
                      padding: 12,
                    }}
                  >
                    Candidate failed to render.
                  </div>
                )}

                <p style={{ fontSize: 13, marginTop: 8 }}>
                  {candidate.description}
                </p>
                {candidate.visual_assessment ? (
                  <p style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
                    QA {candidate.visual_assessment.status} · visible{" "}
                    {(candidate.visual_assessment.visible_fraction * 100).toFixed(2)}% · span{" "}
                    {(candidate.visual_assessment.max_span_fraction * 100).toFixed(1)}%
                  </p>
                ) : null}
                {candidate.error ? (
                  <p className="asset-library-error" style={{ marginTop: 8 }}>
                    {candidate.error}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {refinedBatchResult ? (
        <div style={{ marginTop: 14 }}>
          <strong>
            Explicit refined sample batch results · {refinedBatchResult.results.length} asset(s)
          </strong>
          <ul style={{ marginTop: 8 }}>
            {refinedBatchResult.results.map((item) => (
              <li key={item.asset_id}>
                {item.asset_id} · {item.result}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 12,
        }}
      >
        <button
          className="asset-library-secondary-button"
          disabled={Boolean(running) || refinedRunning || refinedBatchRunning || previewRunning || calibrationRunning}
          onClick={() => void audit()}
          type="button"
        >
          {running === "audit"
            ? "Auditing thumbnails…"
            : "Audit 2,234 anatomy thumbnails visually"}
        </button>

        <button
          className="asset-library-secondary-button"
          disabled={
            Boolean(running) ||
            refinedRunning ||
            refinedBatchRunning ||
            previewRunning ||
            calibrationRunning ||
            repairQueue.length === 0
          }
          onClick={() => void repairNext()}
          type="button"
        >
          {running === "repair"
            ? "Repairing next batch…"
            : `Repair next ${Math.min(4, repairQueue.length)} thumbnail issue${Math.min(4, repairQueue.length) === 1 ? "" : "s"}`}
        </button>

        <button
          className="asset-library-secondary-button"
          disabled={
            Boolean(running) ||
            refinedRunning ||
            refinedBatchRunning ||
            previewRunning ||
            calibrationRunning ||
            !auditComplete ||
            visualRegenerationQueue.length === 0
          }
          onClick={() => void regenerateAllVisualIssues()}
          type="button"
        >
          {bulkProgress && visualRegenerationQueue.length > 0
            ? `Resume bulk regeneration (${visualRegenerationQueue.length.toLocaleString()} remaining)`
            : `Regenerate all ${visualRegenerationQueue.length.toLocaleString()} visually bad thumbnails`}
        </button>

        {running === "bulk" ? (
          <button
            className="asset-library-secondary-button"
            disabled={bulkPauseRequested}
            onClick={pauseBulkRegeneration}
            type="button"
          >
            {bulkPauseRequested
              ? "Pausing after current thumbnail…"
              : "Pause bulk regeneration"}
          </button>
        ) : null}
      </div>

      {auditItems.length ? (
        <p style={{ marginTop: 12 }}>
          Checked {auditItems.length.toLocaleString()}
          {" / "}
          {auditTotal.toLocaleString()} · visually healthy{" "}
          {counts.healthy.toLocaleString()} · blank{" "}
          {counts.visual_blank.toLocaleString()} · too small{" "}
          {counts.visual_too_small.toLocaleString()} · decode error{" "}
          {counts.visual_decode_error.toLocaleString()} · recoverable{" "}
          {counts.recoverable_reference.toLocaleString()} · missing PNG{" "}
          {counts.missing_object.toLocaleString()} · unsupported{" "}
          {counts.unsupported.toLocaleString()}
        </p>
      ) : null}

      {bulkProgress ? (
        <div style={{ marginTop: 12 }}>
          <p>
            Bulk regeneration · completed{" "}
            {bulkProgress.completed.toLocaleString()} /{" "}
            {bulkProgress.total.toLocaleString()} · regenerated{" "}
            {bulkProgress.regenerated.toLocaleString()} · failed{" "}
            {bulkProgress.failed.toLocaleString()} · remaining{" "}
            {Math.max(
              0,
              bulkProgress.total - bulkProgress.completed,
            ).toLocaleString()}
          </p>
          {bulkProgress.current_label ? (
            <p style={{ marginTop: 6 }}>
              Current: {bulkProgress.current_label}
            </p>
          ) : null}
          <p style={{ marginTop: 6 }}>
            Processing is sequential and yields after every {BULK_CHECKPOINT_SIZE} thumbnails.
            Pause takes effect after the current thumbnail finishes. If this page reloads,
            run the visual audit again; already-fixed thumbnails will return healthy and
            automatically drop out of the regeneration queue.
          </p>
        </div>
      ) : null}

      {repairQueue.length ? (
        <details style={{ marginTop: 12 }}>
          <summary>
            Show first thumbnail issues
          </summary>
          <ul style={{ marginTop: 8 }}>
            {auditItems
              .filter((item) => item.status !== "healthy")
              .slice(0, 12)
              .map((item) => (
                <li key={item.asset_id}>
                  {item.source_asset_id ?? item.asset_id}
                  {" · "}
                  {item.concept_name ?? item.asset_id}
                  {" · "}
                  {item.status}
                  {item.visual_assessment
                    ? ` · visible ${(item.visual_assessment.visible_fraction * 100).toFixed(2)}% · span ${(item.visual_assessment.max_span_fraction * 100).toFixed(1)}%`
                    : ""}
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      {notice ? (
        <p className="asset-library-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="asset-library-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
