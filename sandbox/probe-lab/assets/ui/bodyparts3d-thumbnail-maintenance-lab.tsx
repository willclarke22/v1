"use client";

import { useMemo, useState } from "react";

type AuditStatus =
  | "healthy"
  | "recoverable_reference"
  | "missing_object"
  | "unsupported";

type AuditItem = {
  asset_id: string;
  source_asset_id: string | null;
  concept_name: string | null;
  status: AuditStatus;
  thumbnail_object_key: string | null;
  registered_reference: boolean;
  object_exists: boolean;
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
      | "thumbnail_regenerated";
  };
  error?: string;
};

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
    useState<"audit" | "repair" | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  const counts = useMemo(() => {
    const next = {
      healthy: 0,
      recoverable_reference: 0,
      missing_object: 0,
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
              "missing_object",
        )
        .map((item) => item.asset_id),
    [auditItems],
  );

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
              limit: 64,
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
      setNotice(
        `Audit complete: ${healthy.toLocaleString()} healthy, ${recoverable.toLocaleString()} registry-reference repair(s), ${missing.toLocaleString()} thumbnail PNG(s) require regeneration.`,
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

  async function repairNext() {
    if (running || !repairQueue.length) return;
    setRunning("repair");
    setError(null);
    setNotice(null);

    const selected =
      repairQueue.slice(0, 4);
    let repaired = 0;
    let regenerated = 0;

    try {
      for (const assetId of selected) {
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              action: "backfill_one",
              registry_revision:
                registryRevision,
              asset_id: assetId,
            }),
          },
        );
        const json = await readJson(response);
        if (
          json.repair?.result ===
          "thumbnail_regenerated"
        ) {
          regenerated += 1;
        } else {
          repaired += 1;
        }

        setAuditItems((current) =>
          current.map((item) =>
            item.asset_id === assetId
              ? {
                  ...item,
                  status: "healthy",
                  registered_reference: true,
                  object_exists: true,
                }
              : item,
          ),
        );
      }

      const message =
        `BodyParts3D thumbnail repair completed for ${selected.length} asset(s): ${repaired} registry reference(s) repaired and ${regenerated} PNG(s) regenerated.`;
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
          <h3>Audit existing anatomy thumbnails</h3>
          <p>
            This does not re-import the atlas. It checks
            the existing private-R2 PNGs and only invokes
            Blender for a thumbnail whose PNG is actually
            missing.
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
        <button
          className="asset-library-secondary-button"
          disabled={Boolean(running)}
          onClick={() => void audit()}
          type="button"
        >
          {running === "audit"
            ? "Auditing thumbnails…"
            : "Audit 2,234 anatomy thumbnails"}
        </button>

        <button
          className="asset-library-secondary-button"
          disabled={
            Boolean(running) ||
            repairQueue.length === 0
          }
          onClick={() => void repairNext()}
          type="button"
        >
          {running === "repair"
            ? "Repairing next batch…"
            : `Repair next ${Math.min(4, repairQueue.length)} missing`}
        </button>
      </div>

      {auditItems.length ? (
        <p style={{ marginTop: 12 }}>
          Checked {auditItems.length.toLocaleString()}
          {" / "}
          {auditTotal.toLocaleString()} · healthy{" "}
          {counts.healthy.toLocaleString()} · recoverable{" "}
          {counts.recoverable_reference.toLocaleString()} ·
          missing PNG{" "}
          {counts.missing_object.toLocaleString()} · unsupported{" "}
          {counts.unsupported.toLocaleString()}
        </p>
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
