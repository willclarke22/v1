"use client";

import { useEffect, useRef, useState } from "react";
import {
  BODYPARTS3D_EXPECTED_ELEMENT_COUNT,
  BODYPARTS3D_SLP_PILOT_MEMBERS,
  BODYPARTS3D_SOURCE_ARCHIVE,
} from "../bodyparts3d-slp-pilot";

type ImportCompleteSummary = {
  mode: "pilot" | "full";
  imported: number;
  duplicate: number;
  failed: number;
  missing: number;
  available?: number;
  total?: number;
};

type Props = {
  onComplete?: (summary: ImportCompleteSummary) => void;
  onRunningChange?: (running: boolean) => void;
};

type FullProgress = {
  phase?: string;
  session_id?: string;
  total: number;
  available: number;
  completed_percent?: number;
  already_present: number;
  imported: number;
  duplicate: number;
  failed: number;
  missing_from_archive: number;
  remaining: number;
  archive_entry_count?: number;
  catalog_counts?: {
    elements?: number;
    named_concepts?: number;
    isa_relations?: number;
    partof_relations?: number;
  };
  system_counts?: Record<string, number>;
  failures?: Array<{ element_id?: string; name?: string; error?: string }>;
  reconciliation_missing?: string[];
  message?: string;
};

const FULL_SESSION_KEY = "myway_bodyparts3d_full_import_session_v1";
const FULL_BATCH_SIZE = 4;

async function readJsonApiResponse(
  response: Response,
  label: string,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const looksLikeHtml = /^\s*</.test(text);
    throw new Error(
      `${label} returned ${looksLikeHtml ? "HTML instead of JSON" : "a non-JSON response"} (HTTP ${response.status}). ` +
        "The Next.js dev server may have restarted or still be compiling. Imported BodyParts3D assets are preserved; wait for the server to settle and retry/resume.",
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `${label} returned malformed JSON (HTTP ${response.status}). Imported BodyParts3D assets are preserved; retry after the dev server is stable.`,
    );
  }
}

function asProgress(value: Record<string, unknown>): FullProgress {
  return {
    phase: typeof value.phase === "string" ? value.phase : undefined,
    session_id: typeof value.session_id === "string" ? value.session_id : undefined,
    total: Number(value.total ?? BODYPARTS3D_EXPECTED_ELEMENT_COUNT),
    available: Number(value.available ?? 0),
    completed_percent: Number(value.completed_percent ?? 0),
    already_present: Number(value.already_present ?? 0),
    imported: Number(value.imported ?? 0),
    duplicate: Number(value.duplicate ?? 0),
    failed: Number(value.failed ?? 0),
    missing_from_archive: Number(value.missing_from_archive ?? 0),
    remaining: Number(value.remaining ?? BODYPARTS3D_EXPECTED_ELEMENT_COUNT),
    archive_entry_count: Number(value.archive_entry_count ?? 0),
    catalog_counts: value.catalog_counts as FullProgress["catalog_counts"],
    system_counts: value.system_counts as FullProgress["system_counts"],
    failures: Array.isArray(value.failures) ? value.failures as FullProgress["failures"] : [],
    reconciliation_missing: Array.isArray(value.reconciliation_missing)
      ? value.reconciliation_missing.filter((item): item is string => typeof item === "string")
      : [],
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

export function BodyParts3dSlpPilotImportLab({ onComplete, onRunningChange }: Props) {
  const [archive, setArchive] = useState<File | null>(null);
  const [isaParts, setIsaParts] = useState<File | null>(null);
  const [isaElements, setIsaElements] = useState<File | null>(null);
  const [partofParts, setPartofParts] = useState<File | null>(null);
  const [partofElements, setPartofElements] = useState<File | null>(null);
  const [isaRelations, setIsaRelations] = useState<File | null>(null);
  const [partofRelations, setPartofRelations] = useState<File | null>(null);
  const [fullProgress, setFullProgress] = useState<FullProgress | null>(null);
  const [fullSessionId, setFullSessionId] = useState<string | null>(null);
  const [fullRunning, setFullRunning] = useState(false);
  const fullRunRef = useRef(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const [fullNotice, setFullNotice] = useState<string | null>(null);

  const [runVision, setRunVision] = useState(false);
  const [runEmbedding, setRunEmbedding] = useState(false);
  const [pilotRunning, setPilotRunning] = useState(false);
  const [pilotResult, setPilotResult] = useState<Record<string, unknown> | null>(null);
  const [pilotError, setPilotError] = useState<string | null>(null);

  const anyRunning = fullRunning || pilotRunning;

  useEffect(() => {
    onRunningChange?.(anyRunning);
  }, [anyRunning, onRunningChange]);

  useEffect(() => {
    const stored = localStorage.getItem(FULL_SESSION_KEY);
    if (!stored) return;
    void (async () => {
      try {
        const response = await fetch(`/api/sandbox/probe-lab/assets/bodyparts3d-pilot?session_id=${encodeURIComponent(stored)}`, { cache: "no-store" });
        const json = await readJsonApiResponse(response, "BodyParts3D saved-session status");
        if (!response.ok || json.ok !== true) throw new Error(String(json.error ?? "Saved import session is no longer available."));
        setFullSessionId(stored);
        setFullProgress(asProgress(json));
        setFullNotice("Recovered the interrupted BodyParts3D import session. Press Resume full atlas import when the dev server is stable.");
      } catch (caught) {
        localStorage.removeItem(FULL_SESSION_KEY);
        setFullSessionId(null);
        setFullNotice(
          "The previous temporary BodyParts3D import session is no longer available after the restart. Already imported anatomy assets remain in Needs Review. Re-select the same official ZIP and prepare the atlas again; MyWay will skip elements already registered.",
        );
        if (caught instanceof Error && caught.message.includes("HTML instead of JSON")) {
          setFullError(caught.message);
        }
      }
    })();
  }, []);

  async function fullStep(sessionId: string) {
    const response = await fetch("/api/sandbox/probe-lab/assets/bodyparts3d-pilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "full_step", session_id: sessionId, batch_size: FULL_BATCH_SIZE }),
    });
    const json = await readJsonApiResponse(response, "BodyParts3D full-import step");
    if (!response.ok || json.ok !== true) throw new Error(String(json.error ?? `BodyParts3D full import step failed (${response.status}).`));
    const next = asProgress(json);
    setFullProgress(next);
    return next;
  }

  async function runFullLoop(sessionId: string) {
    fullRunRef.current = true;
    setFullRunning(true);
    setFullError(null);
    setFullNotice(null);
    try {
      while (fullRunRef.current) {
        const next = await fullStep(sessionId);
        if (next.phase === "complete") {
          fullRunRef.current = false;
          setFullSessionId(null);
          localStorage.removeItem(FULL_SESSION_KEY);
          setFullNotice("Full BodyParts3D import pass completed and the registry verifies all 2,234 official FJ element identities. Imported anatomy remains in Needs Review with Omni Vision and embeddings off.");
          onComplete?.({
            mode: "full",
            imported: next.imported,
            duplicate: next.duplicate + next.already_present,
            failed: next.failed,
            missing: next.missing_from_archive,
            available: next.available,
            total: next.total,
          });
          break;
        }
        if (next.remaining <= 0) {
          fullRunRef.current = false;
          setFullSessionId(null);
          localStorage.removeItem(FULL_SESSION_KEY);
          const missingCount = next.reconciliation_missing?.length ?? Math.max(0, next.total - next.available);
          setFullNotice(
            `The import queue ended, but the authoritative registry verifies only ${next.available.toLocaleString()} / ${next.total.toLocaleString()} BodyParts3D FJ identities. ` +
              `${missingCount.toLocaleString()} identity/identities still need reconciliation; this state is not treated as 100% complete.`,
          );
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    } catch (caught) {
      setFullError(caught instanceof Error ? caught.message : String(caught));
      setFullNotice("The full-atlas loop is paused. If the prepared session is still available, press Resume after the dev server is stable; otherwise re-select the ZIP and prepare again. Already registered anatomy assets are preserved.");
      fullRunRef.current = false;
    } finally {
      setFullRunning(false);
    }
  }

  async function prepareAndStartFullImport() {
    if (!archive || fullRunning) return;
    setFullError(null);
    setFullNotice(null);
    setFullProgress(null);
    setFullRunning(true);
    try {
      const body = new FormData();
      body.append("action", "full_prepare");
      body.append("archive", archive);
      if (isaParts) body.append("isa_parts", isaParts);
      if (isaElements) body.append("isa_elements", isaElements);
      if (partofParts) body.append("partof_parts", partofParts);
      if (partofElements) body.append("partof_elements", partofElements);
      if (isaRelations) body.append("isa_relations", isaRelations);
      if (partofRelations) body.append("partof_relations", partofRelations);
      const response = await fetch("/api/sandbox/probe-lab/assets/bodyparts3d-pilot", { method: "POST", body });
      const json = await readJsonApiResponse(response, "BodyParts3D atlas preparation");
      if (!response.ok || json.ok !== true) throw new Error(String(json.error ?? `BodyParts3D preparation failed (${response.status}).`));
      const next = asProgress(json);
      const sessionId = next.session_id;
      if (!sessionId) throw new Error("BodyParts3D preparation did not return a resumable session id.");
      setFullProgress(next);
      setFullSessionId(sessionId);
      localStorage.setItem(FULL_SESSION_KEY, sessionId);
      setFullRunning(false);
      await runFullLoop(sessionId);
    } catch (caught) {
      setFullError(caught instanceof Error ? caught.message : String(caught));
      setFullRunning(false);
    }
  }

  function pauseFullImport() {
    fullRunRef.current = false;
    setFullRunning(false);
  }

  async function cancelFullImport() {
    const sessionId = fullSessionId;
    fullRunRef.current = false;
    setFullRunning(false);
    if (sessionId) {
      await fetch("/api/sandbox/probe-lab/assets/bodyparts3d-pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "full_cancel", session_id: sessionId }),
      }).catch(() => undefined);
    }
    localStorage.removeItem(FULL_SESSION_KEY);
    setFullSessionId(null);
    setFullProgress(null);
    setFullNotice("Prepared BodyParts3D session cancelled. Already registered anatomy assets were not removed.");
  }

  async function importPilot() {
    if (!archive || pilotRunning) return;
    setPilotRunning(true);
    setPilotError(null);
    setPilotResult(null);
    try {
      const body = new FormData();
      body.append("action", "pilot");
      body.append("archive", archive);
      body.append("run_vision", runVision ? "true" : "false");
      body.append("run_embedding", runEmbedding ? "true" : "false");
      const response = await fetch("/api/sandbox/probe-lab/assets/bodyparts3d-pilot", { method: "POST", body });
      const json = await readJsonApiResponse(response, "BodyParts3D pilot import");
      if (!response.ok || json.ok !== true) throw new Error(String(json.error ?? `Import failed (${response.status}).`));
      setPilotResult(json);
      const summary = (json.summary ?? {}) as Record<string, unknown>;
      onComplete?.({
        mode: "pilot",
        imported: Number(summary.imported ?? 0),
        duplicate: Number(summary.duplicate ?? 0),
        failed: Number(summary.failed ?? 0),
        missing: Number(summary.missing ?? 0),
      });
    } catch (caught) {
      setPilotError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPilotRunning(false);
    }
  }

  const progressValue = Math.min(fullProgress?.available ?? 0, fullProgress?.total ?? BODYPARTS3D_EXPECTED_ELEMENT_COUNT);
  const progressTotal = fullProgress?.total ?? BODYPARTS3D_EXPECTED_ELEMENT_COUNT;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <strong>BodyParts3D 4.0 · full structured anatomy collection</strong>
        <p style={{ marginBottom: 0, opacity: 0.78 }}>
          Import all {BODYPARTS3D_EXPECTED_ELEMENT_COUNT.toLocaleString()} unique BodyParts3D element meshes into Needs Review. MyWay builds a durable named-concept/index layer above those meshes, preserves shared collection coordinates, and applies semantic anatomy colors at display time.
        </p>
      </div>

      <label>Official BodyParts3D IS-A OBJ archive
        <input accept=".zip,application/zip" disabled={anyRunning} onChange={(event) => setArchive(event.target.files?.[0] ?? null)} type="file" />
      </label>

      <div style={{ border: "1px solid rgba(148,163,184,0.28)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
        <strong>Full-atlas import policy</strong>
        <span>Omni Vision after import: <b>OFF</b></span>
        <span>Embedding generation after import: <b>OFF</b></span>
        <span>Scene review: <b>Needs Review / pending</b></span>
        <small style={{ opacity: 0.72 }}>
          These are intentionally fixed for the full import. Static IS-A/PART-OF metadata is indexed now; functional movement constraints are a separate later layer.
        </small>
      </div>

      <details>
        <summary>Metadata fallback if the official metadata fetch is unavailable</summary>
        <p style={{ opacity: 0.75 }}>
          Normally MyWay fetches the small official BodyParts3D metadata tables itself. Only choose these files if preparation reports that the official metadata server could not be reached.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <label>isa_parts_list_e.txt <input accept=".txt,text/plain" disabled={anyRunning} onChange={(event) => setIsaParts(event.target.files?.[0] ?? null)} type="file" /></label>
          <label>isa_element_parts.txt <input accept=".txt,text/plain" disabled={anyRunning} onChange={(event) => setIsaElements(event.target.files?.[0] ?? null)} type="file" /></label>
          <label>partof_parts_list_e.txt <input accept=".txt,text/plain" disabled={anyRunning} onChange={(event) => setPartofParts(event.target.files?.[0] ?? null)} type="file" /></label>
          <label>partof_element_parts.txt <input accept=".txt,text/plain" disabled={anyRunning} onChange={(event) => setPartofElements(event.target.files?.[0] ?? null)} type="file" /></label>
          <label>isa_inclusion_relation_list.txt <input accept=".txt,text/plain" disabled={anyRunning} onChange={(event) => setIsaRelations(event.target.files?.[0] ?? null)} type="file" /></label>
          <label>partof_inclusion_relation_list.txt <input accept=".txt,text/plain" disabled={anyRunning} onChange={(event) => setPartofRelations(event.target.files?.[0] ?? null)} type="file" /></label>
        </div>
      </details>

      {fullProgress ? (
        <div style={{ display: "grid", gap: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong>{fullProgress.available.toLocaleString()} / {fullProgress.total.toLocaleString()} anatomy elements available</strong>
            <span>{((fullProgress.available / Math.max(1, fullProgress.total)) * 100).toFixed(1)}%</span>
          </div>
          <progress max={progressTotal} value={progressValue} style={{ width: "100%", height: 18 }} />
          <small style={{ opacity: 0.78 }}>
            {fullProgress.imported.toLocaleString()} imported this session · {fullProgress.already_present.toLocaleString()} already present · {fullProgress.duplicate.toLocaleString()} same-source already registered · {fullProgress.remaining.toLocaleString()} remaining · {fullProgress.failed.toLocaleString()} failed
          </small>
          {fullProgress.catalog_counts ? (
            <small style={{ opacity: 0.72 }}>
              Catalog: {Number(fullProgress.catalog_counts.named_concepts ?? 0).toLocaleString()} named concepts · {Number(fullProgress.catalog_counts.isa_relations ?? 0).toLocaleString()} IS-A relations · {Number(fullProgress.catalog_counts.partof_relations ?? 0).toLocaleString()} PART-OF relations.
            </small>
          ) : null}
          {fullProgress.system_counts ? (
            <details>
              <summary>Semantic display systems ({Object.keys(fullProgress.system_counts).length})</summary>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {Object.entries(fullProgress.system_counts)
                  .sort((left, right) => right[1] - left[1])
                  .map(([system, count]) => <span key={system}>{system}: {count.toLocaleString()}</span>)}
              </div>
            </details>
          ) : null}
          {fullProgress.reconciliation_missing?.length ? (
            <details open>
              <summary>Official FJ identities still missing ({fullProgress.reconciliation_missing.length})</summary>
              <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                {fullProgress.reconciliation_missing.join(", ")}
              </div>
            </details>
          ) : null}
          {fullProgress.failures?.length ? (
            <details>
              <summary>Recent failures ({fullProgress.failed})</summary>
              <ul>{fullProgress.failures.slice(-20).map((failure, index) => <li key={`${failure.element_id ?? "failure"}-${index}`}>{failure.element_id} · {failure.name}: {failure.error}</li>)}</ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!fullSessionId ? (
          <button disabled={!archive || anyRunning} onClick={() => void prepareAndStartFullImport()} type="button">
            {fullRunning ? "Preparing BodyParts3D atlas…" : `Prepare + import all ${BODYPARTS3D_EXPECTED_ELEMENT_COUNT.toLocaleString()} elements`}
          </button>
        ) : fullRunning ? (
          <button onClick={pauseFullImport} type="button">Pause after current batch</button>
        ) : (
          <button onClick={() => void runFullLoop(fullSessionId)} type="button">Resume full atlas import</button>
        )}
        {fullSessionId ? <button disabled={fullRunning} onClick={() => void cancelFullImport()} type="button">Cancel prepared session</button> : null}
      </div>

      {fullNotice ? (
        <div style={{ border: "1px solid rgba(96,165,250,0.35)", borderRadius: 10, padding: 10, color: "#bfdbfe" }}>
          {fullNotice}
        </div>
      ) : null}
      {fullError ? <pre style={{ whiteSpace: "pre-wrap", color: "#fecaca" }}>{fullError}</pre> : null}

      <details>
        <summary>Original 12-structure SLP pilot</summary>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <p style={{ margin: 0, opacity: 0.76 }}>
            The original curated pilot remains available for regression checks. The full-atlas importer above is the preferred path now.
          </p>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <label><input checked={runVision} disabled={anyRunning} onChange={(event) => setRunVision(event.target.checked)} type="checkbox" /> Run Omni vision after pilot import</label>
            <label><input checked={runEmbedding} disabled={anyRunning || !runVision} onChange={(event) => setRunEmbedding(event.target.checked)} type="checkbox" /> Generate embedding after pilot import</label>
          </div>
          <details>
            <summary>Pilot structures ({BODYPARTS3D_SLP_PILOT_MEMBERS.length})</summary>
            <ul>{BODYPARTS3D_SLP_PILOT_MEMBERS.map((member) => <li key={member.representation_id}>{member.name} · {member.representation_id} · {member.concept_id}</li>)}</ul>
          </details>
          <button disabled={!archive || anyRunning} onClick={() => void importPilot()} type="button">{pilotRunning ? "Importing SLP pilot…" : "Re-run 12-structure pilot"}</button>
          {pilotError ? <pre style={{ whiteSpace: "pre-wrap", color: "#fecaca" }}>{pilotError}</pre> : null}
          {pilotResult ? <pre style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>{JSON.stringify(pilotResult, null, 2)}</pre> : null}
        </div>
      </details>
    </div>
  );
}
