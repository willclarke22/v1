"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
type Stage = 1 | 2 | 3;
type Model = "z-ai/glm-5.3" | "z-ai/glm-5.3-flash";
type Reasoning = "low" | "high" | "max";

type ResultMap = Partial<Record<Stage, JsonValue>>;

const stageDefinitions = [
  { stage: 1 as const, title: "Root problem", description: "Find the precise missing mental model. No assets, lesson, or Director yet." },
  { stage: 2 as const, title: "Anatomy requirements", description: "Add the minimum semantic anatomy cast, then let MyWay resolve BodyParts3D candidates." },
  { stage: 3 as const, title: "Target takeaway + relationships", description: "Add the smallest corrective mental model and the semantic mechanism relationships." },
];

const futureStages = [
  "4 · Teaching skeleton",
  "5 · Semantic scene",
  "6 · Visual thesis + moments",
  "7 · Director capability retrieval/orchestration",
  "8 · Deterministic Director compilation",
  "9 · Personalization + interaction",
  "10 · Follow-up probe",
  "11 · Full Visual Experience",
];

const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 20,
  background: "rgba(15,23,42,0.7)",
  padding: 18,
};
const input: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(2,6,23,0.82)",
  color: "white",
  padding: "10px 12px",
};
const button: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 12,
  color: "white",
  background: "rgba(255,255,255,0.08)",
  padding: "11px 14px",
  cursor: "pointer",
  fontWeight: 700,
};
const pre: CSSProperties = {
  margin: 0,
  padding: 14,
  maxHeight: 520,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.7)",
  color: "rgba(226,232,240,0.92)",
  fontSize: 12,
  lineHeight: 1.5,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function value(root: unknown, key: string) {
  return asRecord(root)?.[key] ?? null;
}

function Panel({ title, value: panelValue }: { title: string; value: unknown }) {
  return (
    <section style={{ ...card, display: "grid", gap: 10 }}>
      <strong>{title}</strong>
      <pre style={pre}>{JSON.stringify(panelValue ?? null, null, 2)}</pre>
    </section>
  );
}

function SearchBenchPanel({ title, benchValue }: { title: string; benchValue: unknown }) {
  const bench = asRecord(benchValue);
  if (!bench) return null;
  const index = asRecord(bench.index);
  const metrics = asRecord(bench.metrics);
  const queries = Array.isArray(bench.queries) ? bench.queries : [];
  const summary: Array<{ label: string; value: string }> = [
    { label: "Strategy", value: String(bench.strategy ?? "—") },
    { label: "Documents", value: String(index?.document_count ?? "—") },
    { label: "Index build ms", value: String(index?.build_duration_ms ?? "—") },
    { label: "Search ms", value: String(metrics?.total_search_duration_ms ?? "—") },
    { label: "Provider calls", value: String(bench.provider_calls ?? "—") },
    { label: "Embedding calls", value: String(bench.embedding_calls ?? "—") },
  ];

  return (
    <section style={{ ...card, display: "grid", gap: 14 }}>
      <div>
        <strong>{title}</strong>
        <p style={{ margin: "5px 0 0", color: "rgba(255,255,255,0.56)", lineHeight: 1.5 }}>
          Search Document V1 + lexical BM25 only. No embedding or external model call is used by this retrieval step.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        {summary.map((metric) => (
          <div key={metric.label} style={{ borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.045)" }}>
            <div style={{ color: "rgba(255,255,255,0.44)", fontSize: 10 }}>{metric.label}</div>
            <strong style={{ fontSize: 12 }}>{metric.value}</strong>
          </div>
        ))}
      </div>
      {queries.map((queryValue, queryIndex) => {
        const query = asRecord(queryValue);
        const requirement = asRecord(query?.requirement);
        const ranked = Array.isArray(query?.results) ? query.results : [];
        return (
          <div key={`${String(requirement?.semantic_name ?? "query")}-${queryIndex}`} style={{ borderTop: "1px solid rgba(255,255,255,0.09)", paddingTop: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>Semantic requirement</div>
                <strong>{String(requirement?.semantic_name ?? "—")}</strong>
                {requirement?.visual_role ? (
                  <div style={{ marginTop: 3, color: "rgba(255,255,255,0.56)", fontSize: 12 }}>
                    {String(requirement.visual_role)}
                  </div>
                ) : null}
              </div>
              <span style={{ color: "rgba(125,211,252,0.9)", fontSize: 12 }}>
                {String(query?.duration_ms ?? "—")} ms
              </span>
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {ranked.length ? ranked.map((resultValue, resultIndex) => {
                const result = asRecord(resultValue);
                const matchedFields = Array.isArray(result?.matched_fields)
                  ? result.matched_fields.map((item) => String(item))
                  : [];
                const matchedTerms = Array.isArray(result?.matched_terms)
                  ? result.matched_terms.map((item) => String(item))
                  : [];
                return (
                  <div key={`${String(result?.asset_id ?? resultIndex)}`} style={{ borderRadius: 11, padding: 10, background: "rgba(2,6,23,0.48)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong>{String(result?.rank ?? resultIndex + 1)}. {String(result?.canonical_identity ?? result?.display_name ?? "unknown asset")}</strong>
                      <span style={{ color: "#7dd3fc" }}>score {String(result?.score ?? "—")}</span>
                    </div>
                    <div style={{ marginTop: 4, color: "rgba(255,255,255,0.48)", fontSize: 11 }}>
                      {String(result?.asset_id ?? "—")} · {String(result?.identity_match ?? "none")} · {String(result?.laterality ?? "unspecified")}
                    </div>
                    <div style={{ marginTop: 5, color: "rgba(255,255,255,0.58)", fontSize: 11, lineHeight: 1.45 }}>
                      matched terms: {matchedTerms.join(", ") || "—"}<br />
                      evidence fields: {matchedFields.join(", ") || "—"}
                    </div>
                  </div>
                );
              }) : (
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>No lexical candidates found.</div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function OrchestrationLab() {
  const [stage, setStage] = useState<Stage>(1);
  const [learnerMessage, setLearnerMessage] = useState(
    "Why does rotating your hip inward change where your knee points?",
  );
  const [model, setModel] = useState<Model>("z-ai/glm-5.3");
  const [reasoning, setReasoning] = useState<Reasoning>("low");
  const [assetMode, setAssetMode] = useState<
    "bodyparts3d_full_atlas" | "bodyparts3d_slp_pilot"
  >("bodyparts3d_full_atlas");
  const [results, setResults] = useState<ResultMap>({});
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchConcept, setSearchConcept] = useState("hip joint");
  const [searchRole, setSearchRole] = useState("joint where the femur rotates relative to the pelvis");
  const [searchTags, setSearchTags] = useState("femur, pelvis, rotation");
  const [standaloneSearchResult, setStandaloneSearchResult] = useState<JsonValue | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const currentResult = results[stage];
  const metrics = asRecord(value(currentResult, "metrics"));
  const validation = asRecord(value(currentResult, "validation"));
  const currentStage = useMemo(
    () => stageDefinitions.find((item) => item.stage === stage) ?? stageDefinitions[0],
    [stage],
  );
  const summaryMetrics: Array<{ label: string; value: string }> = [
    { label: "Prompt chars", value: String(metrics?.prompt_chars ?? "—") },
    { label: "Provider ms", value: String(metrics?.provider_duration_ms ?? "—") },
    { label: "Total ms", value: String(metrics?.total_route_duration_ms ?? "—") },
    { label: "First answer ms", value: String(metrics?.first_answer_token_ms ?? "—") },
    { label: "Attempts", value: String(metrics?.attempt_count ?? "—") },
    { label: "Search ms", value: String(metrics?.lexical_search_duration_ms ?? "—") },
    { label: "Schema", value: validation ? (validation.valid ? "valid" : "invalid") : "—" },
  ];

  async function runStandaloneSearch() {
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/visual-experience/asset-search-bench",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            semantic_name: searchConcept,
            visual_role: searchRole,
            semantic_tags: searchTags.split(",").map((value) => value.trim()).filter(Boolean),
            asset_collection_mode: assetMode,
            limit: 8,
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as JsonValue;
      setStandaloneSearchResult(json);
      if (!response.ok) setSearchError(`Lexical search returned HTTP ${response.status}.`);
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSearching(false);
    }
  }

  async function runStage() {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/visual-experience/orchestration-stage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage,
            learner_message: learnerMessage,
            model,
            reasoning_effort: reasoning,
            asset_collection_mode: assetMode,
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as JsonValue;
      setResults((current) => ({ ...current, [stage]: json }));
      if (!response.ok) {
        setError(`Stage ${stage} returned HTTP ${response.status}. Inspect the result panels below.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <span style={{ color: "#7dd3fc", fontSize: 12, fontWeight: 800, letterSpacing: 0.6 }}>
          VISUAL EXPERIENCE · ORCHESTRATION LAB
        </span>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3.6rem)", letterSpacing: -1.2 }}>
          Rebuild GLM orchestration one responsibility at a time
        </h1>
        <p style={{ maxWidth: 980, margin: 0, lineHeight: 1.7, color: "rgba(255,255,255,0.68)" }}>
          The Full Turn stays intact next door. This bench starts with tiny semantic contracts, measures latency and validity, and keeps exact assets, placement, and Director execution deterministic inside MyWay.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 420px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <section style={{ ...card, display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Calibration controls</h2>
            <p style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 0 }}>
              One provider call, no retry, no model fallback, no streaming. Each stage is intentionally cumulative and bounded.
            </p>
          </div>

          <label style={{ display: "grid", gap: 7 }}>
            <span>Learner message</span>
            <textarea value={learnerMessage} onChange={(event) => setLearnerMessage(event.target.value)} rows={5} style={{ ...input, resize: "vertical" }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 7 }}>
              <span>Model</span>
              <select value={model} onChange={(event) => setModel(event.target.value as Model)} style={input}>
                <option value="z-ai/glm-5.3">GLM-5.3</option>
                <option value="z-ai/glm-5.3-flash">GLM-5.3-Flash</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 7 }}>
              <span>Reasoning</span>
              <select value={reasoning} onChange={(event) => setReasoning(event.target.value as Reasoning)} style={input}>
                <option value="low">low</option>
                <option value="high">high</option>
                <option value="max">max</option>
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 7 }}>
            <span>Anatomy context</span>
            <select value={assetMode} onChange={(event) => setAssetMode(event.target.value as typeof assetMode)} style={input}>
              <option value="bodyparts3d_full_atlas">BodyParts3D full atlas · 2,234 elements</option>
              <option value="bodyparts3d_slp_pilot">BodyParts3D SLP pilot</option>
            </select>
          </label>

          <div style={{ display: "grid", gap: 8 }}>
            {stageDefinitions.map((item) => {
              const selected = item.stage === stage;
              const hasResult = Boolean(results[item.stage]);
              return (
                <button
                  key={item.stage}
                  onClick={() => setStage(item.stage)}
                  style={{
                    ...button,
                    textAlign: "left",
                    background: selected ? "rgba(14,165,233,0.18)" : "rgba(255,255,255,0.05)",
                    borderColor: selected ? "rgba(56,189,248,0.55)" : "rgba(255,255,255,0.12)",
                  }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{item.stage} · {item.title}</strong>
                    <span>{hasResult ? "✓ run" : ""}</span>
                  </span>
                  <span style={{ display: "block", marginTop: 5, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.56)", lineHeight: 1.45 }}>
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>

          <button disabled={isRunning || !learnerMessage.trim()} onClick={runStage} style={{ ...button, background: "linear-gradient(135deg, #0ea5e9, #6366f1)", border: "none" }}>
            {isRunning ? `Running Stage ${stage}…` : `Run Stage ${stage}`}
          </button>

          {error ? <div style={{ color: "#fecaca", background: "rgba(127,29,29,0.32)", borderRadius: 12, padding: 12 }}>{error}</div> : null}
        </section>

        <div style={{ display: "grid", gap: 14 }}>
          <section style={{ ...card, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Current stage</div>
                <h2 style={{ margin: "4px 0 0" }}>{stage} · {currentStage.title}</h2>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span>{model}</span>
                <span>reasoning: {reasoning}</span>
              </div>
            </div>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.66)", lineHeight: 1.55 }}>{currentStage.description}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {summaryMetrics.map((metric) => (
                <div key={metric.label} style={{ borderRadius: 12, padding: 11, background: "rgba(255,255,255,0.05)" }}>
                  <div style={{ color: "rgba(255,255,255,0.46)", fontSize: 11 }}>{metric.label}</div>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          </section>

          {currentResult ? (
            <>
              <Panel title="GLM output" value={value(currentResult, "glm_output") ?? value(currentResult, "provider_result")} />
              <SearchBenchPanel
                title="Stage Search Bench · lexical baseline"
                benchValue={value(value(currentResult, "myway_deterministic_result"), "semantic_asset_search")}
              />
              <Panel title="MyWay deterministic result" value={value(currentResult, "myway_deterministic_result")} />
              <details style={card}>
                <summary style={{ cursor: "pointer", fontWeight: 800 }}>Exact model request</summary>
                <div style={{ marginTop: 12 }}>
                  <pre style={pre}>{JSON.stringify({
                    planned: value(currentResult, "exact_model_request"),
                    actual_provider_request: value(currentResult, "actual_provider_request"),
                  }, null, 2)}</pre>
                </div>
              </details>
              <details style={card}>
                <summary style={{ cursor: "pointer", fontWeight: 800 }}>Provider diagnostics</summary>
                <div style={{ marginTop: 12 }}>
                  <pre style={pre}>{JSON.stringify(value(currentResult, "provider_diagnostics") ?? value(currentResult, "provider_result"), null, 2)}</pre>
                </div>
              </details>
            </>
          ) : (
            <section style={{ ...card, minHeight: 220, display: "grid", placeItems: "center", color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
              Run Stage {stage} to inspect GLM's exact request/output and MyWay's deterministic follow-up.
            </section>
          )}
        </div>
      </div>

      <section style={{ ...card, display: "grid", gap: 14 }}>
        <div>
          <span style={{ color: "#7dd3fc", fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>SEARCH BENCH · PHASE A/B</span>
          <h2 style={{ margin: "4px 0 0" }}>Test asset retrieval without calling GLM</h2>
          <p style={{ margin: "7px 0 0", color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>
            This isolates retrieval latency from GLM-5.3 latency. Search Document V1 uses identity, aliases, BodyParts3D named concepts, IS-A/PART-OF evidence, system/laterality, tags and affordances. Embeddings remain off.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.75fr) minmax(260px, 1.5fr)", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Semantic concept</span>
            <input value={searchConcept} onChange={(event) => setSearchConcept(event.target.value)} style={input} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Visual role / functional description</span>
            <input value={searchRole} onChange={(event) => setSearchRole(event.target.value)} style={input} />
          </label>
        </div>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Semantic tags · comma separated</span>
          <input value={searchTags} onChange={(event) => setSearchTags(event.target.value)} style={input} />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button disabled={isSearching || !searchConcept.trim()} onClick={runStandaloneSearch} style={{ ...button, background: "rgba(14,165,233,0.18)", borderColor: "rgba(56,189,248,0.45)" }}>
            {isSearching ? "Searching…" : "Run lexical search only"}
          </button>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>No GLM call · no embedding call</span>
        </div>
        {searchError ? <div style={{ color: "#fecaca", background: "rgba(127,29,29,0.32)", borderRadius: 12, padding: 12 }}>{searchError}</div> : null}
        <SearchBenchPanel
          title="Standalone lexical Search Bench"
          benchValue={value(standaloneSearchResult, "search_bench")}
        />
      </section>

      <section style={{ ...card, display: "grid", gap: 10 }}>
        <strong>Later ladder stages</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {futureStages.map((item) => (
            <span key={item} style={{ borderRadius: 999, padding: "7px 10px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.46)", fontSize: 12 }}>
              {item} · locked
            </span>
          ))}
        </div>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.52)", lineHeight: 1.5 }}>
          These stay disabled until Stages 1–3 are fast, semantically correct, and stable. The Director Capability Library remains downstream; GLM will eventually orchestrate qualified capabilities while MyWay owns exact execution.
        </p>
      </section>
    </div>
  );
}
