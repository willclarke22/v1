"use client";

import { useMemo, useState } from "react";

type AuditRow = {
  asset_id: string;
  provider_code: string;
  provider_label: string;
  provider_confidence: "high" | "medium" | "low";
  current_display_name: string;
  proposed_display_name: string;
  current_canonical_label: string;
  proposed_canonical_label: string;
  current_asset_id: string;
  proposed_asset_id: string;
  technical_id_change: boolean;
  semantic_change: boolean;
  safe_to_auto_rename: boolean;
  reasons: string[];
  review_bucket: "needs_review" | "approved" | "other";
  storage_provider: string;
  model_available: boolean | null;
  thumbnail_available: boolean | null;
  source_metadata_available: boolean | null;
  license_metadata_available: boolean | null;
};

type AuditResponse = {
  ok: boolean;
  error?: string;
  total?: number;
  needing_technical_rename?: number;
  safe_needs_review_repairs?: number;
  approved_with_legacy_ids?: number;
  rows?: AuditRow[];
};

type RowDraft = {
  assetId: string;
  displayName: string;
  canonicalLabel: string;
};

export function AssetIdentityAuditLab(props: {
  onChanged?: () => void;
}) {
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] =
    useState<"needs_review" | "approved" | "all">("needs_review");
  const [refreshEmbedding, setRefreshEmbedding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const rows = useMemo(() => {
    const all = audit?.rows ?? [];
    return scope === "all"
      ? all
      : all.filter((row) => row.review_bucket === scope);
  }, [audit, scope]);

  async function scan() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/identity-audit",
        { cache: "no-store" },
      );
      const payload = (await response.json()) as AuditResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Identity audit failed.");
      }
      setAudit(payload);
      setDrafts(
        Object.fromEntries(
          (payload.rows ?? []).map((row) => [
            row.asset_id,
            {
              assetId: row.proposed_asset_id,
              displayName: row.proposed_display_name,
              canonicalLabel: row.proposed_canonical_label,
            },
          ]),
        ),
      );
      setMessage(
        `Scanned ${payload.total ?? 0} assets. ` +
        `${payload.needing_technical_rename ?? 0} legacy technical IDs detected; ` +
        `${payload.safe_needs_review_repairs ?? 0} are safe Needs Review auto-repair candidates.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function applyRow(row: AuditRow) {
    const draft = drafts[row.asset_id] ?? {
      assetId: row.proposed_asset_id,
      displayName: row.proposed_display_name,
      canonicalLabel: row.proposed_canonical_label,
    };
    setApplying(row.asset_id);
    setError(null);
    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/identity-audit",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "apply",
            asset_id: row.asset_id,
            next_asset_id: draft.assetId,
            next_display_name: draft.displayName,
            next_canonical_label: draft.canonicalLabel,
            refresh_embedding: refreshEmbedding,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        result?: {
          asset?: { asset_id: string };
          moved_artifacts?: string[];
          embedding_refresh_needed?: boolean;
          embedding_refresh_queued?: boolean;
          cloud_verified?: boolean;
        };
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Identity repair failed.");
      }
      setMessage(
        `Repaired ${row.asset_id} → ${payload.result?.asset?.asset_id ?? draft.assetId}. ` +
        `Cloud verified: ${payload.result?.cloud_verified === false ? "no" : "yes"}. ` +
        `Embedding ${payload.result?.embedding_refresh_needed ? (payload.result?.embedding_refresh_queued ? "refresh queued" : "refresh pending") : "unchanged"}.`,
      );
      props.onChanged?.();
      await scan();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setApplying(null);
    }
  }

  async function applySafe() {
    setApplying("__safe__");
    setError(null);
    const failedIds = new Set<string>();
    let attemptedTotal = 0;
    let repairedTotal = 0;
    let failedTotal = 0;

    try {
      for (let pass = 0; pass < 40; pass += 1) {
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/identity-audit",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "apply_safe_needs_review",
              refresh_embedding: refreshEmbedding,
              limit: 10,
              exclude_asset_ids: [...failedIds],
            }),
          },
        );
        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          attempted?: number;
          repaired?: unknown[];
          failed?: Array<{ asset_id: string; error: string }>;
          remaining_safe_candidates?: number;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Safe identity repair failed.");
        }

        const attempted = payload.attempted ?? 0;
        const repaired = payload.repaired?.length ?? 0;
        const failed = payload.failed ?? [];
        attemptedTotal += attempted;
        repairedTotal += repaired;
        failedTotal += failed.length;
        for (const item of failed) failedIds.add(item.asset_id);

        setMessage(
          `Safe repair progress: ${repairedTotal} repaired, ${failedTotal} failed; ` +
          `${payload.remaining_safe_candidates ?? 0} safe candidate(s) remain.`,
        );

        if (attempted === 0 || (payload.remaining_safe_candidates ?? 0) === 0) {
          break;
        }
      }

      setMessage(
        `Safe repair pass complete: ${repairedTotal}/${attemptedTotal} repaired; ${failedTotal} failed. ` +
        "Approved assets were not mass-renamed.",
      );
      props.onChanged?.();
      await scan();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setApplying(null);
    }
  }


  return (
    <section className="identity-audit">
      <div className="identity-audit-hero">
        <div>
          <strong>Asset identity audit</strong>
          <small>
            Provider metadata is authoritative; legacy ID patterns are fallback evidence.
            Needs Review assets can be safely migrated automatically when provenance is
            high-confidence. Approved assets are shown too, but never mass-renamed.
          </small>
        </div>
        <button
          className="asset-library-button"
          data-primary="true"
          disabled={loading || applying !== null}
          onClick={() => void scan()}
          type="button"
        >
          {loading ? "Scanning…" : audit ? "Rescan identities" : "Scan identities"}
        </button>
      </div>

      <div className="identity-audit-controls">
        <label>
          Show
          <select
            disabled={loading || applying !== null}
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as typeof scope)
            }
          >
            <option value="needs_review">Needs Review</option>
            <option value="approved">Approved</option>
            <option value="all">All assets</option>
          </select>
        </label>
        <label className="identity-audit-toggle">
          <input
            checked={refreshEmbedding}
            disabled={loading || applying !== null}
            onChange={(event) => setRefreshEmbedding(event.target.checked)}
            type="checkbox"
          />
          <span>
            Refresh embeddings after semantic identity edits
            <small>
              Leave off while the embedding endpoint is rate-limited. Stale vectors
              remain marked pending and can be refreshed later.
            </small>
          </span>
        </label>
        <button
          className="asset-library-button"
          disabled={
            !audit ||
            applying !== null ||
            (audit.safe_needs_review_repairs ?? 0) === 0
          }
          onClick={() => void applySafe()}
          type="button"
        >
          {applying === "__safe__"
            ? "Applying safe repairs…"
            : `Apply ${audit?.safe_needs_review_repairs ?? 0} safe Needs Review repairs`}
        </button>
      </div>

      {audit ? (
        <div className="identity-audit-summary">
          <span>{audit.total ?? 0} scanned</span>
          <span>{audit.needing_technical_rename ?? 0} legacy IDs</span>
          <span>{audit.safe_needs_review_repairs ?? 0} safe auto-repairs</span>
          <span>{audit.approved_with_legacy_ids ?? 0} approved legacy IDs</span>
        </div>
      ) : null}

      {message ? <div className="identity-audit-message">{message}</div> : null}
      {error ? <div className="identity-audit-error">{error}</div> : null}

      {audit ? (
        <div className="identity-audit-list">
          {rows.map((row) => {
            const draft = drafts[row.asset_id] ?? {
              assetId: row.proposed_asset_id,
              displayName: row.proposed_display_name,
              canonicalLabel: row.proposed_canonical_label,
            };
            return (
              <details className="identity-audit-row" key={row.asset_id}>
                <summary>
                  <strong>{row.current_display_name || row.current_asset_id}</strong>
                  <span>{row.provider_label}</span>
                  <span>{row.review_bucket === "approved" ? "Approved" : "Needs Review"}</span>
                  <span>
                    {row.technical_id_change ? "⚠ legacy ID" : "✓ technical ID"}
                  </span>
                  <span>
                    model {
                      row.model_available === false
                        ? "✕"
                        : row.model_available === true
                          ? "✓"
                          : "check on apply"
                    } · storage {row.storage_provider}
                  </span>
                </summary>

                <div className="identity-audit-grid">
                  <label className="wide">
                    Technical asset ID
                    <input
                      value={draft.assetId}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.asset_id]: {
                            ...draft,
                            assetId: event.target.value,
                          },
                        }))
                      }
                    />
                    <small>Current: {row.current_asset_id}</small>
                  </label>
                  <label>
                    Display name
                    <input
                      value={draft.displayName}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.asset_id]: {
                            ...draft,
                            displayName: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Canonical identity
                    <input
                      value={draft.canonicalLabel}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.asset_id]: {
                            ...draft,
                            canonicalLabel: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <div className="wide identity-audit-evidence">
                    <span>
                      Provider confidence: <strong>{row.provider_confidence}</strong>
                    </span>
                    <span>
                      Source metadata: {row.source_metadata_available === false ? "missing" : row.source_metadata_available ? "ready" : "not required/unknown"}
                    </span>
                    <span>
                      Licence metadata: {row.license_metadata_available === false ? "missing" : row.license_metadata_available ? "ready" : "not required/unknown"}
                    </span>
                    <span>
                      Thumbnail: {
                        row.thumbnail_available === false
                          ? "missing"
                          : row.thumbnail_available === true
                            ? "ready"
                            : "checked on apply"
                      }
                    </span>
                  </div>
                  {row.reasons.length ? (
                    <ul className="wide identity-audit-reasons">
                      {row.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="identity-audit-actions">
                  {row.review_bucket === "approved" && row.technical_id_change ? (
                    <small>
                      Approved technical IDs are never mass-renamed. Applying this row
                      is an explicit manual migration; review code fixtures that may
                      intentionally reference the old ID.
                    </small>
                  ) : (
                    <small>
                      {row.safe_to_auto_rename
                        ? "High-confidence provider metadata: safe for Needs Review migration."
                        : "MyWay will not auto-rename this asset; review the proposal first."}
                    </small>
                  )}
                  <button
                    className="asset-library-button"
                    data-primary="true"
                    disabled={applying !== null}
                    onClick={() => void applyRow(row)}
                    type="button"
                  >
                    {applying === row.asset_id ? "Applying…" : "Apply this identity"}
                  </button>
                </div>
              </details>
            );
          })}
          {!rows.length ? (
            <div className="identity-audit-empty">
              No assets in this audit scope.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="identity-audit-empty">
          Run the audit to inspect Needs Review and Approved naming without changing anything.
        </div>
      )}

      <style jsx>{`
        .identity-audit { display:grid; gap:12px; }
        .identity-audit-hero { display:flex; justify-content:space-between; gap:16px; align-items:center; padding:15px; border-radius:15px; border:1px solid rgba(167,139,250,.24); background:rgba(124,58,237,.06); }
        .identity-audit-hero > div { display:grid; gap:5px; }
        .identity-audit-hero small, .identity-audit-toggle small, .identity-audit-actions small { color:rgba(226,232,240,.68); line-height:1.45; }
        .identity-audit-controls { display:grid; grid-template-columns:minmax(180px,.35fr) minmax(320px,1fr) auto; gap:10px; align-items:end; }
        .identity-audit-controls label, .identity-audit-grid label { display:grid; gap:5px; font-size:12px; font-weight:750; }
        .identity-audit-controls input, .identity-audit-controls select, .identity-audit-grid input { min-width:0; padding:8px 9px; border-radius:9px; border:1px solid rgba(255,255,255,.12); background:rgba(2,6,23,.72); color:#f8fafc; }
        .identity-audit-toggle { grid-template-columns:auto 1fr !important; align-items:start; }
        .identity-audit-toggle input { margin-top:3px; }
        .identity-audit-toggle span { display:grid; gap:3px; }
        .identity-audit-summary { display:flex; flex-wrap:wrap; gap:7px; }
        .identity-audit-summary span { padding:5px 8px; border-radius:999px; background:rgba(255,255,255,.05); font-size:11px; }
        .identity-audit-message, .identity-audit-error { padding:9px 11px; border-radius:10px; font-size:12px; }
        .identity-audit-message { border:1px solid rgba(34,197,94,.22); background:rgba(34,197,94,.07); }
        .identity-audit-error { border:1px solid rgba(248,113,113,.3); background:rgba(239,68,68,.08); }
        .identity-audit-list { display:grid; gap:8px; max-height:680px; overflow:auto; padding-right:4px; }
        .identity-audit-row { border:1px solid rgba(255,255,255,.09); border-radius:12px; background:rgba(2,6,23,.44); overflow:hidden; }
        .identity-audit-row summary { cursor:pointer; display:grid; grid-template-columns:minmax(180px,1.3fr) minmax(100px,.6fr) minmax(90px,.5fr) minmax(90px,.5fr) minmax(140px,.7fr); gap:8px; align-items:center; padding:10px; font-size:11px; }
        .identity-audit-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:12px; border-top:1px solid rgba(255,255,255,.07); }
        .identity-audit-grid .wide { grid-column:1 / -1; }
        .identity-audit-grid small { color:rgba(226,232,240,.6); }
        .identity-audit-evidence { display:flex; flex-wrap:wrap; gap:8px; font-size:11px; color:rgba(226,232,240,.72); }
        .identity-audit-evidence span { padding:5px 7px; border-radius:8px; background:rgba(255,255,255,.04); }
        .identity-audit-reasons { margin:0; color:rgba(253,224,71,.82); font-size:11px; line-height:1.45; }
        .identity-audit-actions { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:0 12px 12px; }
        .identity-audit-empty { padding:16px; border:1px dashed rgba(255,255,255,.12); border-radius:12px; color:rgba(226,232,240,.64); }
        @media (max-width:900px) {
          .identity-audit-controls, .identity-audit-grid { grid-template-columns:1fr; }
          .identity-audit-grid .wide { grid-column:auto; }
          .identity-audit-row summary { grid-template-columns:1fr; }
          .identity-audit-actions, .identity-audit-hero { align-items:stretch; flex-direction:column; }
        }
      `}</style>
    </section>
  );
}
