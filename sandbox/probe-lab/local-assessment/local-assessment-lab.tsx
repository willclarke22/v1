"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./local-assessment-lab.module.css";

type ModelAvailability = "checking" | "available" | "downloadable" | "downloading" | "unavailable" | "unsupported" | "error";
type Assessment = { topic_name: string; root_problem: string; confusion: number };
type Timing = { availabilityMs: number; sessionMs: number; baseSessionMs: number; cloneMs: number; sessionMode: "cold clone" | "warm clone" | "fresh fallback"; generationMs: number; totalMs: number; responseChars: number };
type Attempt = {
  id: number;
  message: string;
  timestamp: string;
  state: "running" | "success" | "invalid" | "error" | "cancelled";
  assessment?: Assessment;
  raw?: string;
  error?: string;
  timing?: Timing;
};

type PromptSession = {
  prompt(input: string, options?: { responseConstraint?: Record<string, unknown>; signal?: AbortSignal }): Promise<string>;
  clone?: () => Promise<PromptSession>;
  destroy?: () => void;
};
type DownloadEvent = { loaded: number; total: number };
type PromptFactory = {
  availability(): Promise<string>;
  create(options?: {
    initialPrompts?: Array<{ role: "system"; content: string }>;
    monitor?: (monitor: { addEventListener: (event: "downloadprogress", listener: (progress: DownloadEvent) => void) => void }) => void;
  }): Promise<PromptSession>;
};

function getModelFactory(): PromptFactory | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { LanguageModel?: PromptFactory }).LanguageModel ?? null;
}

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    topic_name: { type: "string", description: "The specific topic or concept the learner is struggling with." },
    root_problem: { type: "string", description: "The underlying conceptual misunderstanding inferred from the learner's message." },
    confusion: { type: "number", minimum: 0, maximum: 1, description: "Estimated degree of conceptual confusion in the learner's message, where 0 is no evident confusion and 1 is strong explicit misunderstanding." },
  },
  required: ["topic_name", "root_problem", "confusion"],
  additionalProperties: false,
};

const DEFAULT_SYSTEM_PROMPT = `You are MyWay's learning diagnosis model.

Analyze the learner's message and return exactly three fields:

topic_name: A concise name for the specific concept being discussed.

root_problem: Identify the underlying missing conceptual relationship or misconception. Explain what the learner appears to understand, what they misunderstand, and the conceptual connection they are missing. Maximum 45 words.

confusion: Estimate the strength of evidence that the learner misunderstands the concept, from 0 to 1.

Calibration:
0.00 = Explicitly correct understanding, with no misconception evident.
0.25 = Mild uncertainty, with no clear conceptual error.
0.50 = Partial understanding or ambiguous evidence.
0.75 = A clearly expressed conceptual misunderstanding.
1.00 = Multiple explicit, fundamental misunderstandings.

Important rules:
- Score conceptual misunderstanding, not emotional frustration or whether the learner uses phrases such as "I don't understand."
- A clearly incorrect causal explanation generally warrants 0.70–0.90.
- Asking a question alone does not establish misunderstanding.
- If evidence is insufficient, identify the uncertainty instead of inventing a misconception.
- Do not invent prior learning history.
- Do not confuse the confusion score with a mastery score.
- Do not provide a lesson or extra commentary.`;

const EXAMPLES = [
  { label: "Clear misconception", text: "I think a battery should still light a bulb when one wire is disconnected because the battery already contains electricity. Why does the second wire matter?" },
  { label: "Question only", text: "I'm learning how electrical circuits work. Could you explain why a circuit needs to be closed?" },
  { label: "Correct understanding", text: "A bulb needs a complete conducting path for current to flow through it. Breaking the circuit stops the sustained current, even though the battery still has stored chemical energy." },
];

function validateAssessment(raw: string): { assessment?: Assessment; error?: string } {
  try {
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Response was not a JSON object." };
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some((key) => !["topic_name", "root_problem", "confusion"].includes(key))) {
      return { error: "Model returned unexpected JSON fields." };
    }
    if (typeof value.topic_name !== "string" || !value.topic_name.trim()) return { error: "Missing valid topic_name." };
    if (typeof value.root_problem !== "string") return { error: "Missing valid root_problem." };
    if (typeof value.confusion !== "number" || !Number.isFinite(value.confusion) || value.confusion < 0 || value.confusion > 1) return { error: "confusion must be a number between 0 and 1." };
    return { assessment: { topic_name: value.topic_name, root_problem: value.root_problem, confusion: value.confusion } };
  } catch (error) {
    return { error: `Model response could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function formatMs(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${Math.round(value).toLocaleString()} ms`;
}

export function LocalAssessmentLab() {
  const [modelStatus, setModelStatus] = useState<ModelAvailability>("checking");
  const [statusDetail, setStatusDetail] = useState("Checking whether Edge exposes LanguageModel…");
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [message, setMessage] = useState(EXAMPLES[0].text);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState("");
  const nextId = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const activeSession = useRef<PromptSession | null>(null);
  // Untouched base context: clones cannot inherit earlier learner responses.
  const baseSession = useRef<{ session: PromptSession; systemPrompt: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const alive = useRef(true);

  const checkAvailability = useCallback(async () => {
    const factory = getModelFactory();
    if (!factory) {
      if (alive.current) {
        setModelStatus("unsupported");
        setStatusDetail("This browser does not expose the experimental LanguageModel API. Open MyWay in Edge Dev with the Prompt API enabled.");
      }
      return;
    }
    if (alive.current) { setModelStatus("checking"); setStatusDetail("Checking local model availability…"); }
    try {
      const result = await factory.availability();
      if (!alive.current) return;
      if (result === "available" || result === "downloadable" || result === "downloading" || result === "unavailable") {
        setModelStatus(result);
        setStatusDetail(result === "available" ? "Local model is ready for assessments." : result === "downloadable" ? "Edge can download the model when you submit a prompt." : result === "downloading" ? "Edge is downloading the model." : "The local model isn't available on this browser or device.");
      } else { setModelStatus("error"); setStatusDetail(`Unexpected availability value: ${result}`); }
    } catch (error) {
      if (!alive.current) return;
      setModelStatus("error");
      setStatusDetail(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void checkAvailability();
    return () => {
      alive.current = false;
      activeController.current?.abort();
      activeSession.current?.destroy?.();
      baseSession.current?.session.destroy?.();
      baseSession.current = null;
    };
  }, [checkAvailability]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [attempts]);

  function updateAttempt(id: number, patch: Partial<Attempt>) {
    if (!alive.current) return;
    setAttempts((current) => current.map((attempt) => attempt.id === id ? { ...attempt, ...patch } : attempt));
  }

  const cancel = () => { activeController.current?.abort(); };

  function changeSystemPrompt(nextPrompt: string) {
    // Never reuse a session whose system instructions have changed.
    baseSession.current?.session.destroy?.();
    baseSession.current = null;
    setSystemPrompt(nextPrompt);
  }

  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    const id = ++nextId.current;
    setAttempts((current) => [...current, { id, message: text, timestamp: new Date().toISOString(), state: "running" }]);
    setMessage("");
    setBusy(true);
    setDownloadPercent(null);
    const controller = new AbortController();
    activeController.current = controller;
    let session: PromptSession | null = null;
    const started = performance.now();
    let checked = started;
    let created = started;
    let baseSessionMs = 0;
    let cloneMs = 0;
    let sessionMode: Timing["sessionMode"] = "fresh fallback";
    try {
      const factory = getModelFactory();
      if (!factory) throw new Error("LanguageModel API unavailable. Use Edge Dev with the Prompt API enabled, then reload.");
      const available = await factory.availability();
      checked = performance.now();
      if (available === "unavailable") throw new Error("The local model is unavailable on this device.");
      setModelStatus(available === "available" ? "available" : available === "downloading" ? "downloading" : "downloadable");
      setStatusDetail(available === "available" ? "Preparing local assessment session…" : "Downloading/preparing model. First request may take longer…");

      // Cache only the system-prompt base. It is NEVER given a learner prompt.
      // A new clone is created for each independent assessment.
      if (baseSession.current && baseSession.current.systemPrompt !== systemPrompt) {
        baseSession.current.session.destroy?.();
        baseSession.current = null;
      }
      if (!baseSession.current) {
        const baseStarted = performance.now();
        const base = await factory.create({
          initialPrompts: [{ role: "system", content: systemPrompt }],
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", (progress) => {
              if (alive.current && progress.total > 0) setDownloadPercent(Math.min(100, Math.round(100 * progress.loaded / progress.total)));
            });
          },
        });
        baseSessionMs = performance.now() - baseStarted;
        if (!alive.current || controller.signal.aborted) {
          base.destroy?.();
          throw new DOMException("Aborted", "AbortError");
        }
        baseSession.current = { session: base, systemPrompt };
      }

      const base = baseSession.current.session;
      if (typeof base.clone === "function") {
        const cloneStarted = performance.now();
        try {
          session = await base.clone();
          sessionMode = baseSessionMs > 0 ? "cold clone" : "warm clone";
        } catch {
          // Preview APIs can differ across Edge builds. This unprompted base is
          // still a fresh, independent session and is safe to use once.
          session = base;
          baseSession.current = null;
          sessionMode = "fresh fallback";
        }
        cloneMs = performance.now() - cloneStarted;
      } else {
        // Older Edge build: preserve the original V1 behavior, without sharing
        // conversation context between different learner messages.
        session = base;
        baseSession.current = null;
        sessionMode = "fresh fallback";
      }
      activeSession.current = session;
      created = performance.now();
      if (!alive.current || controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      setModelStatus("available");
      setStatusDetail(sessionMode === "fresh fallback" ? "Edge session cloning unavailable; using independent fresh sessions." : "On-device inference active. Reusable base session ready.");
      const raw = await session.prompt(text, { responseConstraint: SCHEMA, signal: controller.signal });
      const finished = performance.now();
      if (!alive.current || controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const parsed = validateAssessment(raw);
      updateAttempt(id, {
        state: parsed.assessment ? "success" : "invalid",
        assessment: parsed.assessment,
        raw,
        error: parsed.error,
        timing: {
          availabilityMs: checked - started,
          sessionMs: created - checked,
          baseSessionMs,
          cloneMs,
          sessionMode,
          generationMs: finished - created,
          totalMs: finished - started,
          responseChars: raw.length,
        },
      });
      setStatusDetail(sessionMode === "fresh fallback" ? "Ready. This Edge build used a fresh model session." : "Ready. Base session cached for the next assessment.");
    } catch (error) {
      const aborted = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      updateAttempt(id, { state: aborted ? "cancelled" : "error", error: aborted ? "Request stopped by user." : error instanceof Error ? error.message : String(error) });
      if (!aborted && alive.current) setStatusDetail(`Local request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Only destroy the per-attempt clone (or fallback session), never the
      // unprompted base. The base is destroyed on prompt edit or unmount.
      session?.destroy?.();
      activeSession.current = null;
      activeController.current = null;
      if (alive.current) { setBusy(false); setDownloadPercent(null); }
    }
  };

  async function copyResponse(raw: string) {
    try { await navigator.clipboard.writeText(raw); setCopyState("Copied JSON"); }
    catch { setCopyState("Clipboard unavailable"); }
  }

  function exportExperiments() {
    if (!attempts.length) return;
    const text = JSON.stringify({
      schema_version: "myway_edge_local_assessment_lab_v1",
      exported_at: new Date().toISOString(),
      provider: "edge_prompt_api",
      assessments: attempts,
    }, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "myway-edge-local-assessment-results.json";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const successful = attempts.filter((attempt) => attempt.state === "success");
  const lastTiming = [...attempts].reverse().find((attempt) => attempt.timing)?.timing;

  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <a href="/sandbox/probe-lab" className={styles.back}>← Probe Lab</a>
            <div className={styles.eyebrow}><span className={styles.glowDot} /> MYWAY EXPERIMENT 01 · LOCAL INTELLIGENCE</div>
            <h1>Local Assessment <span>Lab</span></h1>
            <p>Test your learner-diagnosis contract directly in Microsoft Edge. One message, one on-device assessment, no learning-state writes.</p>
          </div>
          <div className={styles.badge}>EDGE PROMPT API · DEV PREVIEW</div>
        </header>

        <div className={styles.columns}>
          <section className={styles.chatColumn} aria-label="Assessment conversation">
            <div className={styles.columnHeader}>
              <div><h2>Assessment console</h2><p>Independent single-message diagnosis; each turn starts fresh.</p></div>
              <button type="button" className={styles.subtleButton} disabled={busy || !attempts.length} onClick={() => setAttempts([])}>Clear</button>
            </div>
            <div className={styles.feed} ref={scrollRef}>
              {!attempts.length && <div className={styles.empty}>
                <div className={styles.orb}>✦</div>
                <h3>Start with a learner's words</h3>
                <p>Submit a misconception, question, or correct explanation. The on-device model will return topic_name, root_problem, and confusion.</p>
                <div className={styles.exampleList}>{EXAMPLES.map((example) => <button type="button" key={example.label} onClick={() => setMessage(example.text)}>{example.label}<span>↗</span></button>)}</div>
              </div>}
              {attempts.map((attempt) => <div className={styles.exchange} key={attempt.id}>
                <div className={styles.userMessage}><span className={styles.messageLabel}>LEARNER</span>{attempt.message}</div>
                <div className={styles.modelMessage}>
                  <div className={styles.modelMessageHead}><span className={styles.messageLabel}>LOCAL MODEL</span><span className={styles.turnState}>{attempt.state === "running" ? "Analyzing…" : attempt.state.toUpperCase()}</span></div>
                  {attempt.state === "running" && <div className={styles.loading}><span/><span/><span/> <small>Running in Edge on this computer</small></div>}
                  {attempt.assessment && <div className={styles.assessment}>
                    <div className={styles.topicRow}><span>TOPIC</span><strong>{attempt.assessment.topic_name}</strong></div>
                    <div className={styles.rootProblem}><span>ROOT PROBLEM</span><p>{attempt.assessment.root_problem || "No root problem provided."}</p></div>
                    <div className={styles.confusionRow}><div><span>CONFUSION EVIDENCE</span><strong>{attempt.assessment.confusion.toFixed(2)} <em>/ 1.00</em></strong></div><div className={styles.confusionTrack}><div style={{ width: `${attempt.assessment.confusion * 100}%` }} /></div></div>
                    <p className={styles.scoreCaution}>Model estimate only · not a learner mastery score</p>
                  </div>}
                  {attempt.error && <div className={styles.error}>{attempt.error}</div>}
                  {attempt.raw !== undefined && <details className={styles.rawDetails}><summary>Inspect raw model JSON</summary><pre>{attempt.raw}</pre><button type="button" className={styles.subtleButton} onClick={() => void copyResponse(attempt.raw ?? "")}>Copy JSON</button></details>}
                  {attempt.timing && <div className={styles.turnTiming}>Total {formatMs(attempt.timing.totalMs)} <span>·</span> Session {formatMs(attempt.timing.sessionMs)} <span>·</span> Response {formatMs(attempt.timing.generationMs)} <span>·</span> {attempt.timing.sessionMode}</div>}
                </div>
              </div>)}
            </div>
            <form onSubmit={(event) => { void run(event); }} className={styles.composer}>
              <label htmlFor="local-assessment-message">LEARNER MESSAGE</label>
              <textarea id="local-assessment-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type what the learner is confused about…" rows={4} disabled={busy} />
              <div className={styles.composerBottom}><span>Responses never update real MyWay learning records.</span><div className={styles.actionRow}>{busy && <button type="button" onClick={cancel} className={styles.stopButton}>Stop</button>}<button type="submit" className={styles.submitButton} disabled={busy || !message.trim()}>{busy ? "Assessing…" : "Run local assessment"} <span>↗</span></button></div></div>
            </form>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}><span>01</span><h2>Local model status</h2></div>
              <div className={styles.statusLine}><span className={`${styles.statusDot} ${modelStatus === "available" ? styles.good : modelStatus === "downloadable" || modelStatus === "downloading" ? styles.warn : styles.bad}`} />{modelStatus.replaceAll("_", " ").toUpperCase()}</div>
              <p className={styles.detail}>{statusDetail}</p>
              {downloadPercent !== null && <><div className={styles.downloadBar}><div style={{ width: `${downloadPercent}%` }} /></div><p className={styles.detail}>Model download: {downloadPercent}%</p></>}
              <button type="button" className={styles.outlineButton} onClick={() => void checkAvailability()} disabled={busy}>Refresh availability</button>
              <p className={styles.mini}>Runs via <code>window.LanguageModel</code> in this browser. This page makes no calls to cloud-model APIs.</p>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeading}><span>02</span><h2>Session performance</h2></div>
              <div className={styles.statGrid}>
                <div><span>TESTS COMPLETED</span><strong>{successful.length}</strong></div>
                <div><span>LAST TOTAL</span><strong>{formatMs(lastTiming?.totalMs)}</strong></div>
                <div><span>SESSION PREP</span><strong>{formatMs(lastTiming?.sessionMs)}</strong></div>
                <div><span>GENERATION</span><strong>{formatMs(lastTiming?.generationMs)}</strong></div>
              </div>
              <p className={styles.mini}>Last mode: {lastTiming?.sessionMode ?? "—"} · Base initialization: {formatMs(lastTiming?.baseSessionMs)} · Clone: {formatMs(lastTiming?.cloneMs)}. Generation is full-response latency, not first-token time.</p>
              <button type="button" className={styles.outlineButton} onClick={exportExperiments} disabled={!attempts.length || busy}>Export test results as JSON ↓</button>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeading}><span>03</span><h2>Experiment settings</h2></div>
              <p className={styles.detail}>Uses the same <code>topic_name</code>, <code>root_problem</code>, and <code>confusion</code> schema tested in the Edge playground.</p>
              <details className={styles.settingsDetails}><summary>View / edit system prompt</summary><textarea aria-label="Assessment system prompt" rows={16} value={systemPrompt} onChange={(event) => changeSystemPrompt(event.target.value)} disabled={busy}/><button type="button" className={styles.subtleButton} disabled={busy} onClick={() => changeSystemPrompt(DEFAULT_SYSTEM_PROMPT)}>Reset prompt</button></details>
              <details className={styles.settingsDetails}><summary>View locked JSON schema</summary><pre>{JSON.stringify(SCHEMA, null, 2)}</pre></details>
              <p className={styles.mini}>Deliberately isolated: no learner history retrieval, relationship graph updates, or mastery score writes in V1.</p>
            </section>
            <div className={styles.privacy}>◆ &nbsp;Experimental local inference. Outputs can be inaccurate; verify diagnoses before using them for assessment.</div>
            {copyState && <p role="status" className={styles.copyStatus}>{copyState}</p>}
          </aside>
        </div>
      </div>
    </main>
  );
}
