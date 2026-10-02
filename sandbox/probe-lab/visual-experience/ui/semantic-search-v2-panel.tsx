"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

type Props = {
  assetMode: "bodyparts3d_full_atlas" | "bodyparts3d_slp_pilot";
  semanticName: string;
  visualRole: string;
  semanticTags: string[];
};

const card: CSSProperties = {
  border: "1px solid rgba(129,140,248,0.24)",
  borderRadius: 20,
  background: "rgba(30,27,75,0.26)",
  padding: 18,
};

const subcard: CSSProperties = {
  borderRadius: 14,
  padding: 13,
  background: "rgba(2,6,23,0.38)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const button: CSSProperties = {
  border: "1px solid rgba(165,180,252,0.3)",
  borderRadius: 12,
  color: "white",
  background: "rgba(99,102,241,0.14)",
  padding: "11px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const primaryButton: CSSProperties = {
  ...button,
  background: "linear-gradient(135deg, rgba(8,145,178,0.42), rgba(99,102,241,0.42))",
  borderColor: "rgba(103,232,249,0.4)",
};

const pre: CSSProperties = {
  margin: 0,
  padding: 12,
  maxHeight: 480,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  borderRadius: 12,
  background: "rgba(2,6,23,0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(226,232,240,0.9)",
  fontSize: 11,
  lineHeight: 1.45,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metricCard(label: string, metricValue: unknown) {
  return (
    <div key={label} style={{ borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.045)" }}>
      <div style={{ color: "rgba(255,255,255,0.44)", fontSize: 10 }}>{label}</div>
      <strong style={{ fontSize: 12 }}>{String(metricValue ?? "—")}</strong>
    </div>
  );
}

function statusPill(label: string, ready: boolean | null) {
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "6px 9px",
        fontSize: 11,
        fontWeight: 800,
        background:
          ready === true
            ? "rgba(34,197,94,0.14)"
            : ready === false
              ? "rgba(245,158,11,0.13)"
              : "rgba(255,255,255,0.06)",
        color:
          ready === true
            ? "#86efac"
            : ready === false
              ? "#fde68a"
              : "rgba(255,255,255,0.58)",
      }}
    >
      {ready === true ? "✓ " : ready === false ? "○ " : ""}{label}
    </span>
  );
}

function queryBody(
  assetMode: Props["assetMode"],
  semanticName: string,
  visualRole: string,
  semanticTags: string[],
) {
  return {
    semantic_name: semanticName,
    visual_role: visualRole,
    semantic_tags: semanticTags,
    anchors: semanticTags.map((concept) => ({
      concept,
      role: "context_anchor",
    })),
    asset_collection_mode: assetMode,
  };
}

function RawJson({ title, value, open = false }: { title: string; value: JsonValue | null; open?: boolean }) {
  if (!value) return null;
  return (
    <details style={subcard} open={open}>
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>{title}</summary>
      <div style={{ marginTop: 10 }}>
        <pre style={pre}>{JSON.stringify(value, null, 2)}</pre>
      </div>
    </details>
  );
}

export function SemanticSearchV2Panel({
  assetMode,
  semanticName,
  visualRole,
  semanticTags,
}: Props) {
  const [pilotResult, setPilotResult] = useState<JsonValue | null>(null);
  const [comparisonResult, setComparisonResult] = useState<JsonValue | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<JsonValue | null>(null);
  const [servingResult, setServingResult] = useState<JsonValue | null>(null);
  const [evidenceStatusResult, setEvidenceStatusResult] = useState<JsonValue | null>(null);
  const [evidenceAuditResult, setEvidenceAuditResult] = useState<JsonValue | null>(null);
  const [evidenceAuditRouteMetrics, setEvidenceAuditRouteMetrics] = useState<JsonValue | null>(null);
  const [probeResult, setProbeResult] = useState<JsonValue | null>(null);
  const [rerankResult, setRerankResult] = useState<JsonValue | null>(null);
  const [rerankRouteMetrics, setRerankRouteMetrics] = useState<JsonValue | null>(null);
  const [evidenceAbResult, setEvidenceAbResult] = useState<JsonValue | null>(null);
  const [evidenceAbRouteMetrics, setEvidenceAbRouteMetrics] = useState<JsonValue | null>(null);
  const [evidenceAbcResult, setEvidenceAbcResult] = useState<JsonValue | null>(null);
  const [evidenceAbcRouteMetrics, setEvidenceAbcRouteMetrics] = useState<JsonValue | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<JsonValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(
      "/api/sandbox/probe-lab/visual-experience/semantic-embedding-pilot",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await response.json().catch(() => null)) as JsonValue;
    if (!response.ok || asRecord(json)?.ok === false) {
      throw new Error(
        String(asRecord(json)?.error ?? `Semantic retrieval request returned HTTP ${response.status}.`),
      );
    }
    return json;
  }

  async function runTask(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function runPilotAction(
    action:
      | "pilot_v2_prepare"
      | "pilot_v2_status"
      | "pilot_v2_step"
      | "pilot_v2_run_window"
      | "pilot_v2_reset",
    extra: Record<string, unknown> = {},
  ) {
    await runTask(async () => {
      const json = await post({ action, asset_collection_mode: assetMode, ...extra });
      setPilotResult(json);
    });
  }

  async function runComparison() {
    await runTask(async () => {
      const json = await post({
        action: "semantic_compare_v2",
        ...queryBody(assetMode, semanticName, visualRole, semanticTags),
        limit: 12,
      });
      setComparisonResult((asRecord(json)?.semantic_comparison_v2 as JsonValue | undefined) ?? null);
      setRouteMetrics((asRecord(json)?.route_metrics as JsonValue | undefined) ?? null);
    });
  }

  async function runServingAction(
    action:
      | "pilot_v2_publish_serving_snapshot"
      | "pilot_v2_serving_snapshot_status"
      | "pilot_v2_clear_serving_snapshot",
  ) {
    await runTask(async () => {
      const json = await post({ action, asset_collection_mode: assetMode });
      setServingResult(json);
      if (action === "pilot_v2_clear_serving_snapshot") {
        setEvidenceStatusResult((asRecord(json)?.evidence_snapshot as JsonValue | undefined) ?? null);
      }
    });
  }

  async function runEvidenceAction(
    action:
      | "semantic_evidence_publish_v1"
      | "semantic_evidence_status_v1"
      | "semantic_evidence_clear_v1",
  ) {
    await runTask(async () => {
      const json = await post({ action, asset_collection_mode: assetMode });
      setEvidenceStatusResult(json);
    });
  }

  async function refreshPipelineStatus() {
    await runTask(async () => {
      const [serving, evidence] = await Promise.all([
        post({ action: "pilot_v2_serving_snapshot_status", asset_collection_mode: assetMode }),
        post({ action: "semantic_evidence_status_v1", asset_collection_mode: assetMode }),
      ]);
      setServingResult(serving);
      setEvidenceStatusResult(evidence);
    });
  }

  async function runEvidenceAudit() {
    await runTask(async () => {
      const json = await post({
        action: "semantic_evidence_anchor_audit_v2",
        ...queryBody(assetMode, semanticName, visualRole, semanticTags),
        max_candidates: 10,
      });
      setEvidenceAuditResult((asRecord(json)?.semantic_evidence_anchor_audit_v2 as JsonValue | undefined) ?? null);
      setEvidenceAuditRouteMetrics((asRecord(json)?.route_metrics as JsonValue | undefined) ?? null);
    });
  }

  async function runProbe() {
    await runTask(async () => {
      const json = await post({ action: "reranker_probe" });
      setProbeResult((asRecord(json)?.reranker_probe as JsonValue | undefined) ?? json);
    });
  }

  async function runRerank() {
    await runTask(async () => {
      const json = await post({
        action: "semantic_rerank_v1",
        ...queryBody(assetMode, semanticName, visualRole, semanticTags),
      });
      setRerankResult((asRecord(json)?.semantic_rerank_v1 as JsonValue | undefined) ?? null);
      setRerankRouteMetrics((asRecord(json)?.route_metrics as JsonValue | undefined) ?? null);
    });
  }

  async function runEvidenceAb() {
    await runTask(async () => {
      const json = await post({
        action: "semantic_evidence_rerank_ab_v1",
        ...queryBody(assetMode, semanticName, visualRole, semanticTags),
      });
      setEvidenceAbResult((asRecord(json)?.semantic_evidence_rerank_ab_v1 as JsonValue | undefined) ?? null);
      setEvidenceAbRouteMetrics((asRecord(json)?.route_metrics as JsonValue | undefined) ?? null);
    });
  }

  async function runEvidenceAbc() {
    await runTask(async () => {
      const json = await post({
        action: "semantic_evidence_rerank_abc_v2",
        ...queryBody(assetMode, semanticName, visualRole, semanticTags),
      });
      setEvidenceAbcResult((asRecord(json)?.semantic_evidence_rerank_abc_v2 as JsonValue | undefined) ?? null);
      setEvidenceAbcRouteMetrics((asRecord(json)?.route_metrics as JsonValue | undefined) ?? null);
    });
  }

  async function runBenchmarkSmoke() {
    await runTask(async () => {
      const json = await post({
        action: "semantic_rerank_benchmark_v1",
        asset_collection_mode: assetMode,
        max_cases: 3,
      });
      setBenchmarkResult((asRecord(json)?.reranker_benchmark_v1 as JsonValue | undefined) ?? null);
    });
  }

  const servingEnvelope = asRecord(servingResult);
  const servingSnapshot = asRecord(servingEnvelope?.snapshot);
  const evidenceEnvelope = asRecord(evidenceStatusResult);
  const evidenceSnapshot = asRecord(evidenceEnvelope?.snapshot) ?? evidenceEnvelope;
  const evidenceAudit = asRecord(evidenceAuditResult);
  const auditCandidates = Array.isArray(evidenceAudit?.candidates) ? evidenceAudit.candidates : [];
  const auditAnchorResolution = Array.isArray(evidenceAudit?.anchor_resolution) ? evidenceAudit.anchor_resolution : [];

  const evidenceAb = asRecord(evidenceAbResult);
  const abComparison = Array.isArray(evidenceAb?.comparison) ? evidenceAb.comparison : [];
  const baselineV1 = asRecord(evidenceAb?.baseline_v1);
  const evidenceV2 = asRecord(evidenceAb?.evidence_v2);
  const baselineRankings = Array.isArray(baselineV1?.rankings) ? baselineV1.rankings : [];
  const evidenceRankings = Array.isArray(evidenceV2?.rankings) ? evidenceV2.rankings : [];
  const baselineById = new Map(
    baselineRankings.map((value) => {
      const record = asRecord(value);
      return [String(record?.asset_id ?? ""), record] as const;
    }),
  );
  const evidenceById = new Map(
    evidenceRankings.map((value) => {
      const record = asRecord(value);
      return [String(record?.asset_id ?? ""), record] as const;
    }),
  );

  const evidenceAbc = asRecord(evidenceAbcResult);
  const abcComparison = Array.isArray(evidenceAbc?.comparison) ? evidenceAbc.comparison : [];
  const abcBaseline = asRecord(evidenceAbc?.baseline_v1);
  const abcV2 = asRecord(evidenceAbc?.evidence_v2);
  const abcV3 = asRecord(evidenceAbc?.evidence_v3);
  const abcBaselineById = new Map(
    (Array.isArray(abcBaseline?.rankings) ? abcBaseline.rankings : []).map((value) => {
      const record = asRecord(value);
      return [String(record?.asset_id ?? ""), record] as const;
    }),
  );
  const abcV2ById = new Map(
    (Array.isArray(abcV2?.rankings) ? abcV2.rankings : []).map((value) => {
      const record = asRecord(value);
      return [String(record?.asset_id ?? ""), record] as const;
    }),
  );
  const abcV3ById = new Map(
    (Array.isArray(abcV3?.rankings) ? abcV3.rankings : []).map((value) => {
      const record = asRecord(value);
      return [String(record?.asset_id ?? ""), record] as const;
    }),
  );

  const comparison = asRecord(comparisonResult);
  const pilot = asRecord(comparison?.pilot);
  const metrics = asRecord(comparison?.metrics);
  const queryPacket = comparison?.query_packet ?? null;
  const candidateUnion = Array.isArray(comparison?.candidate_union) ? comparison.candidate_union : [];
  const channels = asRecord(comparison?.candidate_channels);

  const rerank = asRecord(rerankResult);
  const rerankMetrics = asRecord(rerank?.metrics);
  const rerankRetrieval = asRecord(rerank?.retrieval);
  const reranker = asRecord(rerank?.reranker);
  const rrfCandidates = Array.isArray(rerankRetrieval?.rrf_candidates) ? rerankRetrieval.rrf_candidates : [];
  const rerankedCandidates = Array.isArray(reranker?.rankings) ? reranker.rankings : [];
  const benchmark = asRecord(benchmarkResult);
  const benchmarkAggregate = asRecord(benchmark?.aggregate);

  const servingReady = typeof servingSnapshot?.ready === "boolean" ? Boolean(servingSnapshot.ready) : null;
  const evidenceReady = typeof evidenceSnapshot?.ready === "boolean" ? Boolean(evidenceSnapshot.ready) : null;
  const queryReady = Boolean(semanticName.trim());

  return (
    <section style={{ ...card, display: "grid", gap: 14 }}>
      <div>
        <span style={{ color: "#67e8f9", fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>
          ASSET RETRIEVAL · CURRENT PIPELINE
        </span>
        <h2 style={{ margin: "4px 0 0" }}>Retrieve → inspect evidence → rerank</h2>
        <p style={{ margin: "7px 0 0", color: "rgba(255,255,255,0.62)", lineHeight: 1.55 }}>
          The active experiment keeps the existing 96-asset retrieval/RRF baseline fixed, but lets evidence-only anchor lookup consult the full source-backed collection for reference geometry. Evidence V3 then compares the same NVIDIA reranker against V1 and V2 using deterministic two-anchor measurements. Reference anchors never enter the candidate set, no model-authored facts are persisted, and no reranker lane can resolve an asset.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {statusPill("query ready", queryReady)}
        {statusPill("serving snapshot", servingReady)}
        {statusPill("evidence snapshot", evidenceReady)}
        {statusPill("anchor audit V2", evidenceAudit ? true : null)}
        {statusPill("V3 A/B/C run", evidenceAbc ? true : null)}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => void refreshPipelineStatus()} style={button}>
          Refresh pipeline status
        </button>
        <button disabled={busy} onClick={() => void runServingAction("pilot_v2_publish_serving_snapshot")} style={button}>
          Publish query snapshot
        </button>
        <button disabled={busy} onClick={() => void runEvidenceAction("semantic_evidence_publish_v1")} style={button}>
          Build / refresh evidence
        </button>
        <button disabled={busy || !queryReady} onClick={() => void runEvidenceAudit()} style={primaryButton}>
          {busy ? "Request running…" : "Audit anchor geometry V2"}
        </button>
        <button disabled={busy || !queryReady} onClick={() => void runEvidenceAbc()} style={primaryButton}>
          {busy ? "Request running…" : "Run Evidence V3 A/B/C reranker"}
        </button>
      </div>

      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.5 }}>
        Setup order after a server restart: publish query snapshot → build / refresh evidence → audit anchor geometry V2 → inspect the raw JSON → run Evidence V3 A/B/C reranker.
      </div>

      {error ? (
        <div style={{ color: "#fecaca", background: "rgba(127,29,29,0.3)", borderRadius: 12, padding: 12 }}>
          {error}
        </div>
      ) : null}

      {evidenceSnapshot ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
          {metricCard("Evidence ready", evidenceSnapshot.ready === true ? "yes" : "no")}
          {metricCard("Evidence assets", evidenceSnapshot.asset_count)}
          {metricCard("Reference assets", evidenceSnapshot.reference_asset_count)}
          {metricCard("Reference geometry", evidenceSnapshot.reference_geometry_asset_count)}
          {metricCard("Source facts", asRecord(evidenceSnapshot.evidence_counts)?.source_asserted_fact_count)}
          {metricCard("Measured facts", asRecord(evidenceSnapshot.evidence_counts)?.measured_fact_count)}
          {metricCard("Reviewed facts", asRecord(evidenceSnapshot.evidence_counts)?.reviewed_fact_count)}
          {metricCard("Model-inferred facts", asRecord(evidenceSnapshot.evidence_counts)?.model_inferred_fact_count)}
          {metricCard("Geometry assets", asRecord(evidenceSnapshot.evidence_counts)?.collection_geometry_asset_count)}
        </div>
      ) : null}

      {evidenceAudit ? (
        <section style={{ ...subcard, display: "grid", gap: 10 }}>
          <div>
            <strong>Anchor Resolution V2 audit · truth before ranking</strong>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,0.54)", fontSize: 12 }}>
              Source-backed and reviewed statements stay separate from deterministic measurements. Anchor references may come from the full collection even when they are not in the 96-asset candidate set; spatial values report distances/projections and do not claim semantic relationships such as “articulates with.”
            </div>
          </div>

          {auditAnchorResolution.length ? (
            <details style={{ ...subcard, padding: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>Query anchor resolution</summary>
              <div style={{ marginTop: 8 }}><pre style={pre}>{JSON.stringify(auditAnchorResolution, null, 2)}</pre></div>
            </details>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            {auditCandidates.map((candidateValue, index) => {
              const candidate = asRecord(candidateValue);
              const summary = asRecord(candidate?.evidence_summary);
              const spatial = asRecord(candidate?.contextual_spatial_evidence);
              const anchorDistances = Array.isArray(spatial?.anchor_distances) ? spatial.anchor_distances : [];
              const pairGeometry = Array.isArray(spatial?.anchor_pair_geometry) ? spatial.anchor_pair_geometry : [];
              return (
                <details key={String(candidate?.asset_id ?? index)} style={{ ...subcard, padding: 11 }}>
                  <summary style={{ cursor: "pointer" }}>
                    <strong>{index + 1}. {String(candidate?.canonical_identity ?? "unknown asset")}</strong>
                    <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                      source {String(summary?.source_asserted_count ?? 0)} · measured {String(summary?.measured_count ?? 0)} · reviewed {String(summary?.reviewed_count ?? 0)} · inferred {String(summary?.model_inferred_count ?? 0)}
                    </span>
                  </summary>
                  <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
                    {anchorDistances.length ? <pre style={pre}>{JSON.stringify({ anchor_distances: anchorDistances, anchor_pair_geometry: pairGeometry }, null, 2)}</pre> : (
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>No query-anchor collection-space measurement was available for this candidate.</div>
                    )}
                    <pre style={pre}>{JSON.stringify({
                      source_asserted: candidate?.source_asserted,
                      measured: candidate?.measured,
                      reviewed: candidate?.reviewed,
                      model_inferred: candidate?.model_inferred,
                      excluded_unreviewed_role_metadata: candidate?.excluded_unreviewed_role_metadata,
                    }, null, 2)}</pre>
                  </div>
                </details>
              );
            })}
          </div>

          <RawJson title="Evidence audit · Raw JSON · Anchor Resolution V2" value={evidenceAuditResult} />
          <RawJson title="Anchor Resolution V2 audit · route timing JSON" value={evidenceAuditRouteMetrics} />
        </section>
      ) : null}

      {evidenceAbc ? (
        <section style={{ ...subcard, display: "grid", gap: 10, borderColor: "rgba(34,211,238,0.34)" }}>
          <div>
            <strong>Same RRF Top 20 · Passage V1 vs Evidence V2 vs Evidence V3</strong>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,0.54)", fontSize: 12 }}>
              Same query, same candidate set, same NVIDIA model. V3 changes only the candidate evidence passage by resolving source-backed full-collection reference anchors and adding deterministic two-anchor geometry.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
            {metricCard("Retrieval ms", asRecord(evidenceAbc.metrics)?.retrieval_duration_ms)}
            {metricCard("Evidence context ms", asRecord(evidenceAbc.metrics)?.evidence_context_duration_ms)}
            {metricCard("V1 provider ms", asRecord(evidenceAbc.metrics)?.baseline_provider_duration_ms)}
            {metricCard("V2 provider ms", asRecord(evidenceAbc.metrics)?.evidence_v2_provider_duration_ms)}
            {metricCard("V3 provider ms", asRecord(evidenceAbc.metrics)?.evidence_v3_provider_duration_ms)}
            {metricCard("A/B/C total ms", asRecord(evidenceAbc.metrics)?.total_duration_ms)}
          </div>

          <RawJson title="Anchor Resolution V2 used by Evidence V3" value={(evidenceAbc.anchor_resolution_v2 as JsonValue | undefined) ?? null} />

          <div style={{ display: "grid", gap: 8 }}>
            {abcComparison.map((itemValue, index) => {
              const item = asRecord(itemValue);
              const assetId = String(item?.asset_id ?? "");
              const baseline = abcBaselineById.get(assetId);
              const v2 = abcV2ById.get(assetId);
              const v3 = abcV3ById.get(assetId);
              return (
                <details key={assetId || String(index)} style={{ ...subcard, padding: 11 }}>
                  <summary style={{ cursor: "pointer" }}>
                    <strong>{String(item?.canonical_identity ?? "unknown asset")}</strong>
                    <span style={{ marginLeft: 8, color: "#67e8f9", fontSize: 11 }}>
                      RRF #{String(item?.rrf_rank ?? "—")} · V1 #{String(item?.baseline_v1_rank ?? "—")} · V2 #{String(item?.evidence_v2_rank ?? "—")} · V3 #{String(item?.evidence_v3_rank ?? "—")}
                    </span>
                  </summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 10 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>Passage V1 · logit {String(baseline?.reranker_logit ?? "—")}</strong>
                      <pre style={pre}>{String(baseline?.candidate_passage ?? "")}</pre>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>Evidence Passage V2 · logit {String(v2?.reranker_logit ?? "—")}</strong>
                      <pre style={pre}>{String(v2?.candidate_passage ?? "")}</pre>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>Evidence Passage V3 · logit {String(v3?.reranker_logit ?? "—")}</strong>
                      <pre style={pre}>{String(v3?.candidate_passage ?? "")}</pre>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>

          <RawJson title="Evidence V3 A/B/C reranker · Raw JSON" value={evidenceAbcResult} />
          <RawJson title="Evidence V3 A/B/C reranker · route timing JSON" value={evidenceAbcRouteMetrics} />
        </section>
      ) : null}

      {evidenceAb ? (
        <section style={{ ...subcard, display: "grid", gap: 10, borderColor: "rgba(34,211,238,0.28)" }}>
          <div>
            <strong>Same RRF Top 20 · Passage V1 vs Evidence Passage V2</strong>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,0.54)", fontSize: 12 }}>
              Same query, same candidate set, same NVIDIA model. Only the candidate evidence passage changes.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
            {metricCard("Retrieval ms", asRecord(evidenceAb.metrics)?.retrieval_duration_ms)}
            {metricCard("Evidence context ms", asRecord(evidenceAb.metrics)?.evidence_context_duration_ms)}
            {metricCard("Baseline provider ms", asRecord(evidenceAb.metrics)?.baseline_provider_duration_ms)}
            {metricCard("Evidence provider ms", asRecord(evidenceAb.metrics)?.evidence_provider_duration_ms)}
            {metricCard("A/B total ms", asRecord(evidenceAb.metrics)?.total_duration_ms)}
            {metricCard("Unaccounted ms", asRecord(evidenceAb.metrics)?.unaccounted_duration_ms)}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {abComparison.map((itemValue, index) => {
              const item = asRecord(itemValue);
              const assetId = String(item?.asset_id ?? "");
              const baseline = baselineById.get(assetId);
              const enriched = evidenceById.get(assetId);
              const delta = Number(item?.evidence_vs_baseline_rank_delta ?? 0);
              return (
                <details key={assetId || String(index)} style={{ ...subcard, padding: 11 }}>
                  <summary style={{ cursor: "pointer" }}>
                    <strong>{String(item?.canonical_identity ?? "unknown asset")}</strong>
                    <span style={{ marginLeft: 8, color: "#67e8f9", fontSize: 11 }}>
                      RRF #{String(item?.rrf_rank ?? "—")} · V1 #{String(item?.baseline_v1_rank ?? "—")} → Evidence #{String(item?.evidence_v2_rank ?? "—")} · Δ {delta > 0 ? `+${delta}` : String(delta)}
                    </span>
                  </summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10, marginTop: 10 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>Passage V1 · logit {String(baseline?.reranker_logit ?? "—")}</strong>
                      <pre style={pre}>{String(baseline?.candidate_passage ?? "")}</pre>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>Evidence Passage V2 · logit {String(enriched?.reranker_logit ?? "—")}</strong>
                      <pre style={pre}>{String(enriched?.candidate_passage ?? "")}</pre>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>

          <RawJson title="Evidence A/B reranker · Raw JSON" value={evidenceAbResult} />
          <RawJson title="Evidence A/B reranker · route timing JSON" value={evidenceAbRouteMetrics} />
        </section>
      ) : null}

      <details style={{ ...subcard, padding: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Diagnostics / history · setup, old baselines, benchmark, raw JSON</summary>
        <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
          <section style={{ ...subcard, display: "grid", gap: 10 }}>
            <div>
              <span style={{ color: "#c4b5fd", fontSize: 11, fontWeight: 800 }}>SEARCH DOCUMENT / QUERY PACKET V2 · HISTORICAL CANDIDATE BASELINE</span>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.56)", fontSize: 12 }}>
                V1 artifacts untouched · this keeps the original RRF candidate-generation result available for regression checks.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={busy} onClick={() => void runPilotAction("pilot_v2_prepare")} style={button}>Prepare / resume V2</button>
              <button disabled={busy} onClick={() => void runPilotAction("pilot_v2_step")} style={button}>Index next 4 passages</button>
              <button disabled={busy} onClick={() => void runPilotAction("pilot_v2_run_window", { max_batches: 6 })} style={button}>Index / resume next 24 passages</button>
              <button disabled={busy} onClick={() => void runPilotAction("pilot_v2_status")} style={button}>Refresh V2 status</button>
              <button disabled={busy || !queryReady} onClick={() => void runComparison()} style={button}>Run V2 candidate comparison</button>
              <button disabled={busy} onClick={() => void runPilotAction("pilot_v2_reset")} style={{ ...button, color: "#fecaca" }}>Clear V2 session</button>
            </div>
            <RawJson title="V2 pilot state · Raw JSON" value={pilotResult} />
            {comparison ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
                  {metricCard("Model", comparison.model)}
                  {metricCard("Assets complete", `${String(pilot?.completed_asset_count ?? "—")} / ${String(pilot?.target_asset_count ?? "—")}`)}
                  {metricCard("Vectors loaded", `${String(pilot?.loaded_vector_count ?? "—")} / ${String(pilot?.target_vector_count ?? "—")}`)}
                  {metricCard("Candidate pool", comparison.candidate_pool_size)}
                  {metricCard("Comparison total ms", metrics?.comparison_total_duration_ms)}
                  {metricCard("Unaccounted ms", metrics?.unaccounted_duration_ms)}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <strong>RRF candidate union</strong>
                  <pre style={pre}>{JSON.stringify(candidateUnion, null, 2)}</pre>
                </div>
                <RawJson title="Compiled SearchQueryPacketV2" value={queryPacket as JsonValue} />
                <RawJson title="Per-channel candidate evidence" value={channels as JsonValue} />
                <RawJson title="Historical V2 route timing" value={{ comparison: metrics, route: routeMetrics }} />
              </>
            ) : null}
          </section>

          <section style={{ ...subcard, display: "grid", gap: 10 }}>
            <div>
              <span style={{ color: "#67e8f9", fontSize: 11, fontWeight: 800 }}>SEMANTIC RETRIEVAL RERANKER PILOT V1 · HISTORICAL BASELINE</span>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.56)", fontSize: 12 }}>
                Published serving snapshot → RRF Top 20 → NVIDIA cross-encoder. Baseline remains available unchanged for comparison.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={busy} onClick={() => void runServingAction("pilot_v2_publish_serving_snapshot")} style={button}>Publish query-ready snapshot</button>
              <button disabled={busy} onClick={() => void runServingAction("pilot_v2_serving_snapshot_status")} style={button}>Snapshot status</button>
              <button disabled={busy} onClick={() => void runProbe()} style={button}>Probe NVIDIA reranker</button>
              <button disabled={busy || !queryReady} onClick={() => void runRerank()} style={button}>Run RRF → reranker</button>
              <button disabled={busy || !queryReady} onClick={() => void runEvidenceAb()} style={button}>Run Evidence V2 A/B reranker (historical)</button>
              <button disabled={busy} onClick={() => void runBenchmarkSmoke()} style={button}>Run benchmark smoke (3 cases)</button>
              <button disabled={busy} onClick={() => void runServingAction("pilot_v2_clear_serving_snapshot")} style={{ ...button, color: "#fde68a" }}>Clear serving snapshot</button>
              <button disabled={busy} onClick={() => void runEvidenceAction("semantic_evidence_clear_v1")} style={{ ...button, color: "#fde68a" }}>Clear evidence snapshot</button>
            </div>
            <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 11 }}>Historical V1 route label retained for regression: Audit current evidence.</div>
            <RawJson title="Serving snapshot · Raw JSON" value={servingResult} />
            <RawJson title="Evidence snapshot/status · Raw JSON" value={evidenceStatusResult} />
            <RawJson title="NVIDIA reranker probe · Raw JSON" value={probeResult} />
            {rerank ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
                  {metricCard("Reranker model", reranker?.model)}
                  {metricCard("Shortlist", reranker?.passage_count)}
                  {metricCard("Retrieval ms", rerankMetrics?.retrieval_duration_ms)}
                  {metricCard("Reranker provider ms", rerankMetrics?.reranker_provider_duration_ms)}
                  {metricCard("Rerank total ms", rerankMetrics?.rerank_total_duration_ms)}
                  {metricCard("Unaccounted ms", rerankMetrics?.unaccounted_duration_ms)}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <strong>Before vs after</strong>
                  <pre style={pre}>{JSON.stringify(rerankedCandidates, null, 2)}</pre>
                </div>
                <RawJson title="Reranker query" value={String(rerank?.reranker_query ?? "")} />
                <RawJson title="RRF Top 20 sent to reranker" value={rrfCandidates as JsonValue} />
                <RawJson title="Reranker route timing" value={{ rerank: rerankMetrics, route: rerankRouteMetrics }} />
              </>
            ) : null}
            {benchmark ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
                  {metricCard("Cases run", benchmark.successful_case_count)}
                  {metricCard("Recall@5", benchmarkAggregate?.candidate_recall_at_5)}
                  {metricCard("Recall@10", benchmarkAggregate?.candidate_recall_at_10)}
                  {metricCard("Recall@20", benchmarkAggregate?.candidate_recall_at_20)}
                  {metricCard("Reranker Top-1", benchmarkAggregate?.reranker_top_1_accuracy)}
                  {metricCard("Reranker Top-3", benchmarkAggregate?.reranker_top_3_accuracy)}
                  {metricCard("MRR", benchmarkAggregate?.mean_reciprocal_rank)}
                  {metricCard("p95 case ms", benchmarkAggregate?.p95_case_latency_ms)}
                </div>
                <RawJson title="Benchmark smoke details" value={benchmarkResult} />
              </>
            ) : null}
          </section>
        </div>
      </details>

      <div style={{ color: "rgba(255,255,255,0.48)", fontSize: 12 }}>
        Evidence remains derived, in-memory, and provenance-aware · full-collection anchors are reference-only · no permanent AI-authored facts · existing 192 vectors unchanged · RRF unchanged · NVIDIA logits/ranks remain evidence only · no Grounding Policy V2 · no Director binding · no 2,234-asset semantic backfill
      </div>
    </section>
  );
}
