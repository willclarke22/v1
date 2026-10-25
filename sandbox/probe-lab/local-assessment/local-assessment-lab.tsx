"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./local-assessment-lab.module.css";
import { requestOpenAIAssessment, checkOpenAISetup, type CloudSetupInfo } from "./cloud-assessment-client";
import { requestOpenAITeaching } from "./cloud-teaching-client";
import { buildVisualHandoff, type VisualHandoff } from "./visual-handoff";
import { LearningDecisionInspector } from "./learning-decision-inspector";
import { TEACH_SCHEMA, TEACH_SYSTEM_PROMPT, normalizeProfile, makeTeachingInput, validateTeachingPlan, type TeachingStyle, type TeachingPlan, type TeachingInput } from "./learning-plan";

type ModelAvailability = "checking" | "available" | "downloadable" | "downloading" | "unavailable" | "unsupported" | "error";
type Assessment = {
  topic_name: string;
  evidence_quote: string;
  root_problem: string;
  confusion: number; // -1 = insufficient evidence; 0..10 is the original 0.1 rubric
  insight: number;
  next_action: "clarify" | "proceed";
  clarifying_question: string;
  root_problem_confidence: number; // Uncalibrated self-report, 0..1; never mastery.
};
type ClarificationContext = { originalMessage: string; question: string; depth: number };
type Resolution = "clarify" | "proceed" | "provisional" | "unresolved";
const MAX_CLARIFICATION_DEPTH = 1;
const PROMPT_VERSION = "myway_assessment_provider_confidence_v3_4";
type AssessmentProvider = "edge" | "openai";
function buildUserPrompt(message: string, context: ClarificationContext | null) {
  if (!context) return message;
  return [
    "LATEST LEARNER ANSWER:", message,
    "EARLIER LEARNER STATEMENT:", context.originalMessage,
    "MYWAY'S PREVIOUS CLARIFYING QUESTION (not learner evidence):", context.question,
    "Update the difficulty from BOTH learner statements, prioritizing the latest answer. MyWay's question is not evidence.",
  ].join("\n");
}
type Timing = { availabilityMs: number; sessionMs: number; baseSessionMs: number; cloneMs: number; sessionMode: "cold clone" | "warm clone" | "fresh fallback" | "cloud API"; generationMs: number; totalMs: number; responseChars: number };
type EmbedBackend = "webgpu" | "wasm";
type EmbedInputMode = "learner_message" | "topic_label";
type EmbedNeighbor = { label: string; similarity: number };
type EmbedPair = { first: string; second: string; similarity: number };
type EmbedRun = {
  id: number;
  at: string;
  backend: EmbedBackend;
  mode: EmbedInputMode;
  input: string;
  model: string;
  dimensions: number;
  reusedModel: boolean;
  importMs: number;
  loadMs: number;
  inferenceMs: number;
  totalMs: number;
  neighbors: EmbedNeighbor[];
  pairs: EmbedPair[];
  // Retain query vector for later Python-vs-browser parity checks.
  queryVector: number[];
};
type EmbeddingReply =
  | { type: "progress"; runId: number; message: string; percent?: number }
  | { type: "result"; runId: number; result: Omit<EmbedRun, "id" | "at" | "mode"> }
  | { type: "error"; runId: number; error: string };
const EMBED_WORKER_URL = "/myway-local-embedding-lab-v1/embedding-worker.mjs";
const CONNECTED_WORKER_URL = "/myway-local-embedding-lab-v2/connected-worker.mjs";
type ConnectedSubject = { label: string; similarity: number };
type ConnectedDifficulty = ConnectedSubject & { rootProblem: string };
type ConnectedRun = {
  backend: EmbedBackend;
  model: string;
  dimensions: number;
  topicName: string;
  rootProblem: string;
  referenceCount: number;
  reusedModel: boolean;
  reusedReferences: boolean;
  importMs: number;
  loadMs: number;
  referencesMs: number;
  queryMs: number;
  comparisonMs: number;
  totalMs: number;
  subjects: ConnectedSubject[];
  difficulties: ConnectedDifficulty[];
  topicVector: number[];
  problemVector: number[];
};
type ConnectedReply =
  | { type: "progress"; runId: number; message: string; percent?: number }
  | { type: "result"; runId: number; result: ConnectedRun }
  | { type: "error"; runId: number; error: string };

type Attempt = {
  id: number;
  provider: AssessmentProvider;
  teachingProvider: AssessmentProvider;
  handoff?: VisualHandoff;
  handoffError?: string;
  modelName?: string;
  confidenceThreshold: number;
  message: string;
  promptInput?: string;
  promptVersion?: string;
  systemPromptUsed?: string;
  responseSchemaUsed?: Record<string, unknown>;
  clarificationOf?: number | null;
  timestamp: string;
  state: "running" | "success" | "invalid" | "error" | "cancelled";
  assessment?: Assessment;
  raw?: string;
  error?: string;
  timing?: Timing;
  workflowStage?: "assessing" | "embedding" | "complete" | "embedding_error" | "invalid" | "cancelled" | "error";
  workflowTotalMs?: number;
  connected?: ConnectedRun;
  connectedError?: string;
  warnings?: string[]; // Deterministic corrections, also retained in exported runs.
  resolution?: Resolution;
  teachingStage?: "planning" | "complete" | "skipped" | "error";
  teaching?: TeachingPlan;
  teachingError?: string;
  teachingRaw?: string;
  teachingModel?: string;
  teachingMs?: number;
  teachingInput?: TeachingInput;
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
    topic_name: { type: "string", description: "Short subject label." },
    evidence_quote: { type: "string", description: "Exact substring from the learner's own words, or empty if none." },
    root_problem: { type: "string", description: "Concise evidence-grounded conceptual hypothesis, or empty if unknown." },
    confusion: { type: "integer", minimum: -1, maximum: 10, description: "0..10 confusion rubric; -1 means insufficient evidence." },
    insight: { type: "integer", minimum: -1, maximum: 10, description: "0..10 insight rubric; -1 means insufficient evidence." },
    next_action: { type: "string", enum: ["clarify", "proceed"] },
    clarifying_question: { type: "string", description: "One targeted question if clarifying; otherwise empty string." },
    root_problem_confidence: { type: "number", minimum: 0, maximum: 1, description: "How well learner evidence supports the specific root problem; estimate, not a probability." },
  },
  required: ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"],
  additionalProperties: false,
};
const SCHEMA_FIELDS = ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"];
const DEFAULT_SCHEMA_TEXT = JSON.stringify(SCHEMA, null, 2);

// Edited schemas must remain compatible with the known sandbox UI/validator.
// Descriptions and metadata are editable, but changing or adding fields is blocked
// rather than silently accepting values that won't be displayed or verified.
function parseEditableSchema(text: string): { schema?: Record<string, unknown>; error?: string } {
  try {
    const input: unknown = JSON.parse(text);
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Schema must be a JSON object." };
    const schema = input as Record<string, unknown>;
    const props = schema.properties;
    if (!props || typeof props !== "object" || Array.isArray(props)) return { error: "Schema must include properties." };
    const fields = props as Record<string, unknown>;
    if (schema.type !== "object" || schema.additionalProperties !== false) return { error: "Require type: object and additionalProperties: false." };
    if (Object.keys(fields).sort().join("|") !== [...SCHEMA_FIELDS].sort().join("|")) return { error: "Keep the eight required contract fields; edit their descriptions or metadata." };
    if (!Array.isArray(schema.required) || [...schema.required].sort().join("|") !== [...SCHEMA_FIELDS].sort().join("|")) return { error: "All eight contract fields must remain required." };
    for (const key of SCHEMA_FIELDS) {
      const value = fields[key];
      if (!value || typeof value !== "object" || Array.isArray(value)) return { error: `Invalid field schema: ${key}.` };
      const def = value as Record<string, unknown>;
      const type = key === "confusion" || key === "insight" ? "integer" : key === "root_problem_confidence" ? "number" : "string";
      if (def.type !== type) return { error: `${key} must remain ${type}.` };
      if ((key === "confusion" || key === "insight") && (def.minimum !== -1 || def.maximum !== 10)) return { error: `${key} must allow -1 through 10.` };
      if (key === "root_problem_confidence" && (def.minimum !== 0 || def.maximum !== 1)) return { error: "Confidence must remain within 0..1." };
      if (key === "next_action" && (!Array.isArray(def.enum) || [...def.enum].sort().join("|") !== "clarify|proceed")) return { error: "next_action must remain clarify/proceed." };
    }
    return { schema };
  } catch (error) {
    return { error: `JSON schema syntax error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const DEFAULT_SYSTEM_PROMPT = `Assess learner statements only. Return the JSON fields, no teaching.
Topic_name: short subject label. Evidence_quote: exact learner words or "". Root_problem: learner's specific difficulty in <=30 words (misunderstanding, missing knowledge, or nonautomatic application), not the correct explanation. Don't invent examples, beliefs or emotions. Use "" if unsupported.
Confusion (-1 if unclear; otherwise 0..10):
0 complete clarity; 1 almost full clarity but slight checking; 2 light uncertainty; 3 mild confusion, small gaps; 4 noticeable confusion; 5 moderate confusion, incomplete model; 6 strong confusion; 7 significant confusion, major misinterpretations; 8 deep confusion; 9 severe confusion, close to giving up; 10 total confusion or frustration.
Insight (-1 if unclear; otherwise 0..10):
0 no insight (acknowledgment, filler); 1 extremely minimal curiosity; 2 slight engagement: factual follow-up; 3 basic noticing; 4 shallow connection; 5 clear realization; 6 reframing / analogy; 7 strong integration of multiple ideas; 8 cross-domain integration; 9 breakthrough synthesis; 10 profound/original insight.
Score independently from evidence; describing a known struggle is not itself a new realization. Root_problem_confidence (0..1): estimate how strongly learner evidence supports the specific difficulty, not topic knowledge or mastery; use 0 without a grounded root problem. Ask one helpful question distinguishing possible difficulties, not a quiz; clarify if needed, otherwise proceed with an empty question. On follow-up, prioritize the learner's latest answer, not MyWay's question.`;

/** Match learner word sequences, ignoring harmless quotation and spacing differences.
 * Apostrophes INSIDE words remain significant: "we'll" cannot match "well".
 * Recovery always returns the source's exact original substring.
 */
function evidenceTokens(input: string): { word: string; start: number; end: number }[] {
  const words: { word: string; start: number; end: number }[] = [];
  for (const match of input.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
    words.push({ word: match[0].toLowerCase().replaceAll("’", "'"), start: match.index, end: match.index + match[0].length });
  }
  return words;
}
function recoverEvidenceQuote(quote: string, learnerStatements: string[]): string | null {
  if (!quote.trim()) return null;
  const sought = evidenceTokens(quote);
  if (!sought.length) return null;
  for (const statement of learnerStatements) {
    if (statement.includes(quote)) return quote;
    const words = evidenceTokens(statement);
    for (let start = 0; start <= words.length - sought.length; start++) {
      if (sought.every((token, offset) => token.word === words[start + offset].word)) {
        return statement.slice(words[start].start, words[start + sought.length - 1].end);
      }
    }
  }
  return null;
}

/** Keep structural failures strict; recover harmless quotes without accepting new words.
 * A matched quote DOES NOT prove the model's inferred root problem is correct.
 */
function validateAssessment(raw: string, learnerEvidence: string | string[]): { assessment?: Assessment; error?: string; warnings?: string[] } {
  try {
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Response was not a JSON object." };
    const value = input as Record<string, unknown>;
    if (Object.keys(value).sort().join("|") !== [...SCHEMA_FIELDS].sort().join("|")) return { error: "Output must contain exactly the eight expected fields." };
    for (const field of ["topic_name", "evidence_quote", "root_problem", "clarifying_question"]) {
      if (typeof value[field] !== "string") return { error: `${field} must be a string.` };
    }
    if (!(value.topic_name as string).trim()) return { error: "topic_name cannot be empty." };
    for (const score of ["confusion", "insight"]) {
      const n = value[score];
      if (typeof n !== "number" || !Number.isInteger(n) || n < -1 || n > 10) return { error: `${score} must be an integer -1..10.` };
    }
    if (value.next_action !== "clarify" && value.next_action !== "proceed") return { error: "Invalid next_action." };
    if (typeof value.root_problem_confidence !== "number" || !Number.isFinite(value.root_problem_confidence) || value.root_problem_confidence < 0 || value.root_problem_confidence > 1) return { error: "root_problem_confidence must be 0..1." };
    const assessment = { ...(value as unknown as Assessment) };
    const warnings: string[] = [];
    const statements = Array.isArray(learnerEvidence) ? learnerEvidence : [learnerEvidence];
    const quote = assessment.evidence_quote.trim();
    const recovered = recoverEvidenceQuote(quote, statements);
    if (quote && recovered === null) {
      assessment.evidence_quote = "";
      assessment.root_problem = "";
      assessment.next_action = "clarify";
      warnings.push("Model quoted words not present in a learner statement; withheld quote and root-problem hypothesis.");
    } else if (quote && recovered !== null && recovered !== assessment.evidence_quote) {
      assessment.evidence_quote = recovered;
      warnings.push("Recovered verbatim learner evidence after a harmless punctuation or spacing difference.");
    } else if (!quote && assessment.root_problem.trim()) {
      assessment.root_problem = "";
      assessment.next_action = "clarify";
      warnings.push("Root problem lacked supporting quoted learner evidence; withheld until clarification.");
    }
    if (assessment.root_problem && /\be\.g\.|\bfor example\b/i.test(assessment.root_problem) &&
        !statements.some((line) => /\be\.g\.|\bfor example\b/i.test(line))) {
      assessment.root_problem = "";
      assessment.next_action = "clarify";
      warnings.push("Model supplied examples not stated by the learner; withheld speculative root problem.");
    }
    if (!assessment.root_problem.trim() && assessment.root_problem_confidence !== 0) {
      assessment.root_problem_confidence = 0;
      warnings.push("No supported root problem; confidence set to zero.");
    }
    if (assessment.next_action === "proceed" && assessment.clarifying_question.trim()) {
      assessment.clarifying_question = "";
      warnings.push("Removed a stray clarifying question because the model selected proceed.");
    }
    if (assessment.next_action === "clarify" && !assessment.clarifying_question.trim()) {
      assessment.clarifying_question = "What specifically feels difficult about this topic?";
      warnings.push("The model omitted its clarification question; using a neutral fallback question.");
    }
    if (assessment.topic_name.trim().endsWith("?")) warnings.push("The model returned a question instead of a subject label; topic retrieval is provisional.");
    return { assessment, warnings };
  } catch (error) {
    return { error: `Model response could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** After one clarification, stop repeating questions. An evidence-backed hypothesis
 * may proceed provisionally; otherwise the learning difficulty stays unresolved.
 */
function resolveAssessmentRoute(assessment: Assessment, context: ClarificationContext | null, confidenceThreshold = 0.65): Resolution {
  if (context && context.depth >= MAX_CLARIFICATION_DEPTH) {
    return assessment.root_problem.trim() && assessment.evidence_quote.trim() ? "provisional" : "unresolved";
  }
  if (!assessment.root_problem.trim() || assessment.root_problem_confidence < confidenceThreshold) return "clarify";
  return assessment.next_action;
}

function formatScore(score: number): string { return score < 0 ? "Not enough evidence" : (score / 10).toFixed(1); }

const EXAMPLES = [
  { label: "Clear misconception", text: "I think a battery should still light a bulb when one wire is disconnected because the battery already contains electricity. Why does the second wire matter?" },
  { label: "Question only", text: "I'm learning how electrical circuits work. Could you explain why a circuit needs to be closed?" },
  { label: "Correct understanding", text: "A bulb needs a complete conducting path for current to flow through it. Breaking the circuit stops the sustained current, even though the battery still has stored chemical energy." },
];

function formatMs(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${Math.round(value).toLocaleString()} ms`;
}

export function LocalAssessmentLab() {
  const [modelStatus, setModelStatus] = useState<ModelAvailability>("checking");
  const [statusDetail, setStatusDetail] = useState("Checking whether Edge exposes LanguageModel…");
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [message, setMessage] = useState(EXAMPLES[0].text);
  const [assessmentProvider, setAssessmentProvider] = useState<AssessmentProvider>("edge");
  const [teachingProvider, setTeachingProvider] = useState<AssessmentProvider>("edge");
  const [workflowPreset, setWorkflowPreset] = useState<"local" | "cloud" | "hybrid" | "custom">("local");
  const [profileInterests, setProfileInterests] = useState("");
  const [profileStyle, setProfileStyle] = useState<TeachingStyle>("unsure");
  const [profileGoal, setProfileGoal] = useState("");
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.65);
  const [configurationTab, setConfigurationTab] = useState<"prompt" | "schema" | "diagnostics">("prompt");
  const [cloudSetup, setCloudSetup] = useState<CloudSetupInfo | null>(null);
  const [cloudSetupError, setCloudSetupError] = useState("");
  const [checkingCloudSetup, setCheckingCloudSetup] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [schemaText, setSchemaText] = useState(DEFAULT_SCHEMA_TEXT);
  const schemaValidation = parseEditableSchema(schemaText);
  const [pendingClarification, setPendingClarification] = useState<ClarificationContext | null>(null);
  const [configMessage, setConfigMessage] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState(false);
  const [embedBackend, setEmbedBackend] = useState<EmbedBackend>("webgpu");
  // The connected workflow defaults to WASM based on the measured small-batch timings.
  const [connectedBackend, setConnectedBackend] = useState<EmbedBackend>("wasm");
  const [connectedStatus, setConnectedStatus] = useState("Ready · Assessment then two automatic similarity searches");
  const [connectedPercent, setConnectedPercent] = useState<number | null>(null);
  const connectedWorker = useRef<Worker | null>(null);
  const connectedPendingReject = useRef<((error: Error) => void) | null>(null);
  const [embedMode, setEmbedMode] = useState<EmbedInputMode>("topic_label");
  const [embedBusy, setEmbedBusy] = useState(false);
  const [embedStatus, setEmbedStatus] = useState("Off · Runs only when requested");
  const [embedPercent, setEmbedPercent] = useState<number | null>(null);
  const [embeddingRuns, setEmbeddingRuns] = useState<EmbedRun[]>([]);
  const embeddingWorker = useRef<Worker | null>(null);
  const embeddingActiveId = useRef<number | null>(null);
  const embeddingNextId = useRef(0);
  const [copyState, setCopyState] = useState("");
  const nextId = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const activeSession = useRef<PromptSession | null>(null);
  // Untouched base context: clones cannot inherit earlier learner responses.
  const baseSession = useRef<{ session: PromptSession; systemPrompt: string } | null>(null);
  // Separate base prevents teaching turns from inheriting assessment/learner history.
  const teachingBase = useRef<PromptSession | null>(null);
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
      connectedPendingReject.current?.(new DOMException("Page closed", "AbortError"));
      connectedPendingReject.current = null;
      connectedWorker.current?.terminate();
      connectedWorker.current = null;
      embeddingWorker.current?.terminate();
      embeddingWorker.current = null;
      embeddingActiveId.current = null;
      activeController.current?.abort();
      activeSession.current?.destroy?.();
      baseSession.current?.session.destroy?.();
      baseSession.current = null;
      teachingBase.current?.destroy?.();
      teachingBase.current = null;
    };
  }, [checkAvailability]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [attempts]);

  function updateAttempt(id: number, patch: Partial<Attempt>) {
    if (!alive.current) return;
    setAttempts((current) => current.map((attempt) => attempt.id === id ? { ...attempt, ...patch } : attempt));
  }

  const cancel = () => {
    activeController.current?.abort();
    connectedPendingReject.current?.(new DOMException("Stopped by user", "AbortError"));
    connectedPendingReject.current = null;
    connectedWorker.current?.terminate();
    connectedWorker.current = null;
    setConnectedPercent(null);
  };

  // Only the sandbox worker sees the Edge-generated topic and root-problem text.
  // It caches all 100 reference vectors until backend change, stop or page exit.
  function runConnectedComparison(runId: number, topicName: string, rootProblem: string): Promise<ConnectedRun> {
    return new Promise((resolve, reject) => {
      try {
        let worker = connectedWorker.current;
        if (!worker) {
          worker = new Worker(CONNECTED_WORKER_URL, { type: "module" });
          connectedWorker.current = worker;
        }
        const target = worker;
        let settled = false;
        const finish = (error: Error | null, result?: ConnectedRun) => {
          if (settled) return;
          settled = true;
          connectedPendingReject.current = null;
          if (error) reject(error);
          else if (result) resolve(result);
          else reject(new Error("Missing comparison result."));
        };
        connectedPendingReject.current = (error) => finish(error);
        target.onmessage = (event: MessageEvent<ConnectedReply>) => {
          const data = event.data;
          if (!alive.current || !data || data.runId !== runId || settled) return;
          if (data.type === "progress") {
            setConnectedStatus(data.message);
            setConnectedPercent(typeof data.percent === "number" ? Math.max(0, Math.min(100, data.percent)) : null);
          } else if (data.type === "result") {
            setConnectedPercent(null);
            finish(null, data.result);
          } else if (data.type === "error") {
            connectedWorker.current?.terminate();
            connectedWorker.current = null;
            setConnectedPercent(null);
            finish(new Error(data.error));
          }
        };
        target.onerror = (event: ErrorEvent) => {
          if (settled) return;
          connectedWorker.current?.terminate();
          connectedWorker.current = null;
          setConnectedPercent(null);
          finish(new Error(event.message || "Embedding worker failed. Check Edge console/network access."));
        };
        target.postMessage({ type: "compare", runId, backend: connectedBackend, topicName, rootProblem });
      } catch (error) {
        connectedPendingReject.current = null;
        connectedWorker.current?.terminate();
        connectedWorker.current = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // Explicit cancellation stops the entire worker, releasing its model runtime.
  function releaseEmbeddingWorker(label = "Worker released. Model will reload on next run.") {
    embeddingActiveId.current = null;
    embeddingWorker.current?.terminate();
    embeddingWorker.current = null;
    if (alive.current) {
      setEmbedBusy(false);
      setEmbedPercent(null);
      setEmbedStatus(label);
    }
  }

  function changeEmbeddingBackend(next: EmbedBackend) {
    if (embedBusy) return;
    // Never keep two backend copies of a model resident in the same worker.
    releaseEmbeddingWorker("Backend changed · Ready for manual test");
    setEmbedBackend(next);
  }

  function runEmbeddings() {
    if (busy || embedBusy) return;
    const latest = [...attempts].reverse().find((item) => item.assessment);
    const input = embedMode === "topic_label"
      ? latest?.assessment?.topic_name?.trim() ?? ""
      : message.trim() || latest?.message?.trim() || "";
    if (!input) {
      setEmbedStatus(embedMode === "topic_label" ? "Run an Edge assessment first to obtain a topic label." : "Enter a learner message or run an assessment first.");
      return;
    }
    const runId = ++embeddingNextId.current;
    embeddingActiveId.current = runId;
    setEmbedBusy(true);
    setEmbedPercent(null);
    setEmbedStatus("Starting browser embedding worker…");
    try {
      let worker = embeddingWorker.current;
      if (!worker) {
        worker = new Worker(EMBED_WORKER_URL, { type: "module" });
        embeddingWorker.current = worker;
      }
      const target = worker;
      target.onmessage = (event: MessageEvent<EmbeddingReply>) => {
        if (!alive.current || embeddingActiveId.current !== runId) return;
        const data = event.data;
        if (!data || data.runId !== runId) return;
        if (data.type === "progress") {
          setEmbedStatus(data.message);
          setEmbedPercent(typeof data.percent === "number" ? Math.max(0, Math.min(100, data.percent)) : null);
        } else if (data.type === "result") {
          embeddingActiveId.current = null;
          setEmbedBusy(false);
          setEmbedPercent(null);
          setEmbedStatus("Complete · Browser-only inference; no topic records updated");
          setEmbeddingRuns((existing) => [...existing, { ...data.result, id: runId, at: new Date().toISOString(), mode: embedMode }]);
        } else if (data.type === "error") {
          releaseEmbeddingWorker(`Embedding failed: ${data.error}`);
        }
      };
      target.onerror = (event: ErrorEvent) => {
        if (embeddingActiveId.current !== runId) return;
        releaseEmbeddingWorker(`Worker failed: ${event.message || "Check Edge console and network access."}`);
      };
      target.postMessage({ type: "run", runId, backend: embedBackend, input });
    } catch (error) {
      releaseEmbeddingWorker(`Unable to start worker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  function changeSystemPrompt(nextPrompt: string) {
    // Never reuse a session whose system instructions have changed.
    baseSession.current?.session.destroy?.();
    baseSession.current = null;
    setSystemPrompt(nextPrompt);
  }

  async function inspectCloudSetup() {
    setCheckingCloudSetup(true);
    setCloudSetupError("");
    try {
      const info = await checkOpenAISetup();
      if (!alive.current) return;
      setCloudSetup(info);
    } catch (error) {
      if (!alive.current) return;
      setCloudSetup(null);
      setCloudSetupError(error instanceof Error ? error.message : String(error));
    } finally { if (alive.current) setCheckingCloudSetup(false); }
  }

  async function createTeachingPlan(input: TeachingInput, provider: AssessmentProvider, signal: AbortSignal) {
    const begun = performance.now();
    let raw: string;
    let model: string;
    if (provider === "openai") {
      const result = await requestOpenAITeaching(input, signal);
      raw = result.raw; model = result.model;
    } else {
      const factory = getModelFactory();
      if (!factory) throw new Error("Edge LanguageModel is unavailable for teaching.");
      const availability = await factory.availability();
      if (availability === "unavailable") throw new Error("Edge teaching model is unavailable.");
      if (!teachingBase.current) {
        const base = await factory.create({ initialPrompts: [{ role: "system", content: TEACH_SYSTEM_PROMPT }] });
        if (signal.aborted || !alive.current) { base.destroy?.(); throw new DOMException("Stopped", "AbortError"); }
        teachingBase.current = base;
      }
      const base = teachingBase.current;
      let session: PromptSession;
      if (typeof base.clone === "function") {
        try { session = await base.clone(); }
        catch { session = base; teachingBase.current = null; }
      } else { session = base; teachingBase.current = null; }
      if (signal.aborted || !alive.current) { session.destroy?.(); throw new DOMException("Stopped", "AbortError"); }
      activeSession.current = session;
      try {
        raw = await session.prompt(JSON.stringify(input), { responseConstraint: TEACH_SCHEMA as unknown as Record<string, unknown>, signal });
      } finally {
        session.destroy?.(); activeSession.current = null;
      }
      model = "Edge Prompt API · teaching";
    }
    if (signal.aborted || !alive.current) throw new DOMException("Stopped", "AbortError");
    const parsed = validateTeachingPlan(raw, input);
    return { ...parsed, raw, model, duration: performance.now() - begun };
  }

  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy || embedBusy) return;
    const parsedSchema = parseEditableSchema(schemaText);
    if (!parsedSchema.schema) { setConfigMessage(parsedSchema.error ?? "Invalid schema"); return; }
    if (!systemPrompt.trim()) { setConfigMessage("System prompt cannot be empty."); return; }
    setConfigMessage("");
    const context = pendingClarification;
    const userPrompt = buildUserPrompt(text, context);
    const evidenceText = context ? [context.originalMessage, text] : [text];
    const profile = normalizeProfile({ interests: profileInterests, preferred_style: profileStyle, goal: profileGoal });
    const id = ++nextId.current;
    setAttempts((current) => [...current, {
      id, provider: assessmentProvider, teachingProvider, confidenceThreshold, message: text, promptInput: userPrompt, promptVersion: PROMPT_VERSION,
      systemPromptUsed: systemPrompt, responseSchemaUsed: parsedSchema.schema,
      clarificationOf: context ? context.depth : null,
      timestamp: new Date().toISOString(), state: "running", workflowStage: "assessing",
    }]);
    setConnectedStatus(`Step 1 of 2 · ${assessmentProvider === "edge" ? "Edge local" : "OpenAI cloud"} assessment running…`);
    setConnectedPercent(null);
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
    let cloudModelName: string | undefined;
    let raw: string;
    let finished: number;
    try {
      if (assessmentProvider === "openai") {
        // Explicit opt-in. Only the sandbox API route can access the server-side key.
        const response = await requestOpenAIAssessment({
          userPrompt, systemPrompt, responseSchema: parsedSchema.schema, signal: controller.signal,
        });
        raw = response.raw;
        cloudModelName = response.model;
        checked = started;
        created = started;
        finished = performance.now();
        sessionMode = "cloud API";
      } else {
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
      const SCHEMA = parsedSchema.schema;
      raw = await session.prompt(userPrompt, { responseConstraint: SCHEMA, signal: controller.signal });
      finished = performance.now();
      }
      // Both providers pass through exactly the same validator and routing rules.
      if (!alive.current || controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const parsed = validateAssessment(raw, evidenceText);
      const resolution = parsed.assessment ? resolveAssessmentRoute(parsed.assessment, context, confidenceThreshold) : undefined;
      const routedWarnings = [...(parsed.warnings ?? [])];
      if (parsed.assessment && resolution === "clarify" && parsed.assessment.next_action === "proceed") {
        parsed.assessment.clarifying_question = "Is the harder part understanding the idea, or recognizing how to use it in context?";
        routedWarnings.push(`Confidence ${parsed.assessment.root_problem_confidence.toFixed(2)} is below threshold ${confidenceThreshold.toFixed(2)}; one diagnostic clarification requested.`);
      }
      if (resolution === "provisional") routedWarnings.push("One clarification completed; using a provisional hypothesis, not repeating the question.");
      if (resolution === "unresolved") routedWarnings.push("One clarification completed without a supported root problem; another automatic question is paused.");
      updateAttempt(id, {
        state: parsed.assessment ? "success" : "invalid",
        workflowStage: parsed.assessment ? "embedding" : "invalid",
        workflowTotalMs: parsed.assessment ? undefined : performance.now() - started,
        assessment: parsed.assessment,
        modelName: cloudModelName ?? (assessmentProvider === "edge" ? "Edge Prompt API" : undefined),
        raw,
        error: parsed.error,
        warnings: routedWarnings,
        resolution,
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
      if (assessmentProvider === "edge") setStatusDetail(sessionMode === "fresh fallback" ? "Ready. This Edge build used a fresh model session." : "Ready. Base session cached for the next assessment.");
      if (parsed.assessment) {
        const wantsClarify = resolution === "clarify";
        const allowsReply = wantsClarify && (!context || context.depth < MAX_CLARIFICATION_DEPTH);
        if (allowsReply) {
          setPendingClarification({
            originalMessage: context ? `${context.originalMessage}\n${text}` : text,
            question: parsed.assessment.clarifying_question,
            depth: context ? context.depth + 1 : 1,
          });
        } else {
          setPendingClarification(null);
        }
        const rootProblem = parsed.assessment.root_problem.trim();
        setConnectedStatus(rootProblem ? "Step 2 of 2 · Comparing subjects and learning difficulties…" : "Step 2 of 2 · Comparing subjects only (difficulty uncertain)…");
        try {
          const connected = await runConnectedComparison(id, parsed.assessment.topic_name, rootProblem);
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
          updateAttempt(id, { connected, workflowStage: "complete", workflowTotalMs: performance.now() - started });
          setConnectedStatus(`Complete · ${connected.referenceCount} mock topics · ${rootProblem ? "2 comparisons" : "subject-only comparison"}${resolution === "unresolved" ? " · root problem unresolved" : ""}`);
          // No teaching for an unanswered clarification or a completely unsupported difficulty.
          if (rootProblem && resolution !== "clarify" && resolution !== "unresolved") {
            const input = makeTeachingInput(parsed.assessment, connected, profile);
            updateAttempt(id, { teachingStage: "planning", teachingInput: input });
            try {
              const result = await createTeachingPlan(input, teachingProvider, controller.signal);
              // Freeze the evidence-grounded handoff after a validated teaching response.
              // No visual model call or production state update occurs here.
              const handoffResult = result.plan ? buildVisualHandoff({
                learnerMessage: context ? context.originalMessage : text,
                topic: parsed.assessment.topic_name,
                rootProblem: parsed.assessment.root_problem,
                evidenceQuote: parsed.assessment.evidence_quote,
                rootConfidence: parsed.assessment.root_problem_confidence,
                resolution: resolution ?? "unresolved",
                teaching: result.plan,
                assessmentProvider,
                teachingProvider,
              }) : undefined;
              updateAttempt(id, {
                teachingStage: result.plan ? "complete" : "error", teaching: result.plan,
                teachingError: result.error, teachingRaw: result.raw, teachingModel: result.model,
                teachingMs: result.duration, workflowTotalMs: performance.now() - started,
                handoff: handoffResult?.handoff, handoffError: handoffResult?.error,
              });
            } catch (teachingError) {
              if (controller.signal.aborted) throw teachingError;
              updateAttempt(id, { teachingStage: "error", teachingError: teachingError instanceof Error ? teachingError.message : String(teachingError), workflowTotalMs: performance.now() - started });
            }
          } else updateAttempt(id, { teachingStage: "skipped" });
        } catch (embeddingError) {
          const aborted = controller.signal.aborted || (embeddingError instanceof Error && embeddingError.name === "AbortError");
          const reason = aborted ? "Embedding phase stopped." : embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
          updateAttempt(id, { workflowStage: aborted ? "cancelled" : "embedding_error", teachingStage: "skipped", connectedError: reason, workflowTotalMs: performance.now() - started });
          setConnectedStatus(aborted ? "Embedding phase stopped. Edge assessment retained." : `Embeddings failed: ${reason}`);
        }
      } else {
        setConnectedStatus("Model output invalid · Embeddings not run");
      }
    } catch (error) {
      const aborted = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      updateAttempt(id, { state: aborted ? "cancelled" : "error", workflowStage: aborted ? "cancelled" : "error", workflowTotalMs: performance.now() - started, error: aborted ? "Request stopped by user." : error instanceof Error ? error.message : String(error) });
      setConnectedStatus(aborted ? "Assessment stopped" : "Assessment failed · Embeddings not run");
      if (!aborted && alive.current && assessmentProvider === "edge") setStatusDetail(`Local request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!aborted && alive.current && assessmentProvider === "openai") {
        setConfigurationTab("diagnostics");
        setCloudSetupError(`Cloud request: ${error instanceof Error ? error.message : String(error)}`);
      }
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
    if (!attempts.length && !embeddingRuns.length) return;
    const text = JSON.stringify({
      schema_version: "myway_learning_workflow_v3_6",
      exported_at: new Date().toISOString(),
      provider_options: ["edge_prompt_api", "openai_api"],
      visual_stage: "handoff_only_no_director_inference",
      assessments: attempts,
      embedding_runs: embeddingRuns,
      embedding_warning: "Sandbox-only. Browser vectors may differ from Python and must not be mixed into the production Qdrant index without validated parity.",
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
  const latestAttempt = attempts[attempts.length - 1];
  const latestConnected = latestAttempt?.connected;
  const latestTeaching = [...attempts].reverse().find(a => a.teaching)?.teaching;
  const latestHandoff = latestAttempt?.handoff;
  const latestWorkflowMs = latestAttempt?.workflowTotalMs;
  const lastTiming = [...attempts].reverse().find((attempt) => attempt.timing)?.timing;
  const lastEmbed = embeddingRuns[embeddingRuns.length - 1];
  const latestAssessedTopic = [...attempts].reverse().find((item) => item.assessment)?.assessment?.topic_name;
  const canEmbed = embedMode === "topic_label" ? Boolean(latestAssessedTopic) : Boolean(message.trim() || attempts.length);


  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <a href="/sandbox/probe-lab" className={styles.back}>← Probe Lab</a>
            <div className={styles.eyebrow}><span className={styles.glowDot} /> MYWAY EXPERIMENT 01 · LOCAL INTELLIGENCE</div>
            <h1>Learning <span>Studio</span></h1>
            <p>Assessment, discovery, teaching, and visual handoff in one inspectable sandbox workflow. Sandbox only; no learning-state writes.</p>
          </div>
          <div className={styles.badge}>V3.6 · LEARNING WORKFLOW INSPECTOR</div>
        </header>

        <div className={styles.workflowControl}>
          <div className={styles.workflowControlTop}>
            <strong>Model configuration</strong>
            <span>Model A: {assessmentProvider === "openai" ? "OpenAI" : "Edge"} · Model B: {teachingProvider === "openai" ? "OpenAI" : "Edge"} · Visual director: not run</span>
          </div>
          <details className={styles.workflowPresetDetails}>
            <summary>Workflow presets and independent provider controls</summary>
            <label htmlFor="myway-workflow-preset">Workflow preset</label>
            <select id="myway-workflow-preset" value={workflowPreset} disabled={busy || embedBusy} onChange={event => {
              const value = event.target.value as typeof workflowPreset;
              setWorkflowPreset(value);
              if (value === "cloud") { setAssessmentProvider("openai"); setTeachingProvider("openai"); }
              if (value === "hybrid") { setAssessmentProvider("edge"); setTeachingProvider("openai"); }
              if (value === "local") { setAssessmentProvider("edge"); setTeachingProvider("edge"); }
              setPendingClarification(null);
            }}>
              <option value="local">Local · Edge assessment + Edge teaching</option>
              <option value="cloud">Reference · OpenAI assessment + OpenAI teaching</option>
              <option value="hybrid">Hybrid · Edge assessment + OpenAI teaching</option>
              <option value="custom">Custom · Independent model selection</option>
            </select>
            <div className={styles.providerRow} aria-label="Model provider configuration">
              <div className={styles.providerHeading}>
                <label htmlFor="myway-assessment-provider">Assessment model · Model A</label>
                <span className={styles.providerBadge}>{assessmentProvider === "edge" ? "ON DEVICE" : "CLOUD · OPT IN"}</span>
              </div>
              <select id="myway-assessment-provider" className={styles.providerSelect} value={assessmentProvider} disabled={busy || embedBusy} onChange={(event) => {
                setAssessmentProvider(event.target.value as AssessmentProvider);
                setWorkflowPreset("custom");
                setPendingClarification(null);
                setCloudSetup(null); setCloudSetupError("");
                setConfigMessage("Model changed. Start a new clarification exchange for fair comparisons.");
              }}>
                <option value="edge">Edge · Local LanguageModel</option>
                <option value="openai">OpenAI · MyWay-configured GPT</option>
              </select>
              <div className={styles.teachingProviderRow}>
                <label htmlFor="myway-teaching-provider">Teaching model · Model B</label>
                <select id="myway-teaching-provider" className={styles.providerSelect} value={teachingProvider} disabled={busy || embedBusy} onChange={event => {
                  setTeachingProvider(event.target.value as AssessmentProvider);
                  setWorkflowPreset("custom");
                }}>
                  <option value="edge">Edge · Local LanguageModel</option>
                  <option value="openai">OpenAI · MyWay-configured GPT</option>
                </select>
              </div>
              <p className={styles.providerDescription}>Model A analyzes learner evidence. Model B creates the teaching plan independently. Cloud calls occur only for explicitly selected OpenAI stages.</p>
            </div>
          </details>
        </div>
        <nav className={styles.stageRail} aria-label="Learning workflow stages">
          {(["Assess", "Connect", "Teach", "Visualize", "Verify"] as const).map((stage, i) => {
            const done = i === 0 ? latestAttempt?.state === "success" : i === 1 ? Boolean(latestAttempt?.connected) : i === 2 ? latestAttempt?.teachingStage === "complete" : i === 3 ? Boolean(latestHandoff) : false;
            const detail = i === 3 ? "handoff only" : i === 4 ? "future probe" : "";
            return <div className={`${styles.stagePill} ${done ? styles.stageDone : ""}`} key={stage}>
              <span>{done ? "✓" : i + 1}</span>{stage}{detail && <small>{detail}</small>}
            </div>;
          })}
        </nav>

        <div className={styles.columns}>
          <div className={styles.chatStack}>
          <section className={styles.chatColumn} aria-label="Assessment conversation">
            <div className={styles.columnHeader}>
              <div><h2>Assessment console</h2><p>Understand → clarify when useful → compare related difficulties.</p></div>
              <button type="button" className={styles.subtleButton} disabled={busy || embedBusy || !attempts.length} onClick={() => { setAttempts([]); setPendingClarification(null); }}>Clear</button>
            </div>
            <div className={styles.feed} ref={scrollRef}>
              {!attempts.length && <div className={styles.empty}>
                <div className={styles.orb}>✦</div>
                <h3>Start with a learner's words</h3>
                <p>Try a learner question or misconception. The selected model estimates the learning difficulty; evidence checks and local retrieval follow.</p>
                <div className={styles.exampleList}>{EXAMPLES.map((example) => <button type="button" key={example.label} onClick={() => setMessage(example.text)}>{example.label}<span>↗</span></button>)}</div>
              </div>}
              {attempts.map((attempt) => <div className={styles.exchange} key={attempt.id}>
                <div className={styles.userMessage}><span className={styles.messageLabel}>LEARNER</span>{attempt.message}</div>
                <div className={styles.modelMessage}>
                  <div className={styles.modelMessageHead}><span className={styles.messageLabel}>{attempt.provider === "edge" ? "EDGE LOCAL" : "OPENAI CLOUD"}</span><span className={styles.turnState}>{attempt.state === "running" ? "Analyzing…" : attempt.state.toUpperCase()}</span></div>
                  {attempt.state === "running" && <div className={styles.loading}><span/><span/><span/> <small>{attempt.provider === "edge" ? "Running locally in Edge" : "Calling the OpenAI API (explicit cloud selection)"}</small></div>}
                  {attempt.assessment && <div className={styles.assessment}>
                    <div className={styles.topicRow}><span>TOPIC</span><strong>{attempt.assessment.topic_name}</strong></div>
                    <div className={styles.rootProblem}><span>ROOT-PROBLEM HYPOTHESIS</span><p>{attempt.assessment.root_problem || "Not established from this message."}</p></div>
                    {attempt.assessment.evidence_quote && <div className={styles.evidenceRow}><span>LEARNER EVIDENCE</span><q>{attempt.assessment.evidence_quote}</q></div>}
                    <div className={styles.scorePairs}>
                      <div><span>CONFUSION</span><strong>{formatScore(attempt.assessment.confusion)}</strong></div>
                      <div><span>INSIGHT</span><strong>{formatScore(attempt.assessment.insight)}</strong></div>
                      <div><span>ROOT CONFIDENCE</span><strong>{attempt.assessment.root_problem_confidence.toFixed(2)}</strong></div>
                    </div>
                    {attempt.resolution === "clarify" && <div className={styles.clarifyBox}>
                      <span>CLARIFICATION RECOMMENDED</span><p>{attempt.assessment.clarifying_question}</p>
                    </div>}
                    {attempt.resolution === "provisional" && <div className={styles.clarifyBox}>
                      <span>CLARIFICATION COMPLETE · PROVISIONAL HYPOTHESIS</span><p>One follow-up answered. Use the hypothesis cautiously; no repeat question is queued.</p>
                    </div>}
                    {attempt.resolution === "unresolved" && <div className={styles.clarifyBox}>
                      <span>CLARIFICATION COMPLETE · DIFFICULTY UNRESOLVED</span><p>Not enough grounded evidence to identify a root problem. Topic similarity is still available.</p>
                    </div>}
                    <p className={styles.scoreCaution}>Original 0–10 rubrics shown as 0.0–1.0 · Confidence is uncalibrated (threshold {attempt.confidenceThreshold.toFixed(2)}), not mastery.</p>
                  </div>}
                  {attempt.teachingStage === "planning" && <p className={styles.workflowProgress}>↳ Finding a helpful approach · {attempt.teachingProvider === "edge" ? "Edge local" : "OpenAI cloud"} teaching planner…</p>}
                  {attempt.teaching && <div className={styles.teachingCard}>
                    <div className={styles.teachingTitle}>✦ HOW MYWAY CAN HELP <span>EXPERIMENTAL PLAN</span></div>
                    <p className={styles.teachingReflection}>{attempt.teaching.learner_reflection}</p>
                    <div><strong>Next step</strong><p>{attempt.teaching.next_step}</p></div>
                    <div className={styles.teachingVisual}><strong>Visual direction</strong><p>{attempt.teaching.visual_intent}</p></div>
                    <details className={styles.rawDetails}><summary>Why this strategy? · Personalization · Related candidates</summary>
                      <p><b>Strategy:</b> {attempt.teaching.teaching_strategy}</p>
                      <p><b>Rationale:</b> {attempt.teaching.reason}</p>
                      <p><b>Interest:</b> {attempt.teaching.use_interest === "do_not_use" ? "Not used" : `${attempt.teaching.chosen_interest} (${attempt.teaching.use_interest})`}</p>
                      {attempt.teachingInput?.candidate_relationships.length ? <ul>{attempt.teachingInput.candidate_relationships.map(r => <li key={r.label}>{r.label}: {r.description} · similarity {r.similarity.toFixed(3)} (unverified candidate)</li>)}</ul> : <p>No qualified cross-topic difficulty candidate from the mock set.</p>}
                      <p className={styles.mini}>Candidates suggest possible connections; similarity does not establish a shared misconception.</p>
                    </details>
                  </div>}
                  {attempt.teachingError && <p className={styles.workflowError}>Teaching planner: {attempt.teachingError}. Assessment and retrieval retained.</p>}
                  {attempt.teachingRaw !== undefined && <details className={styles.rawDetails}><summary>Teaching model JSON · schema · exact input ({formatMs(attempt.teachingMs)})</summary>
                    <pre>{attempt.teachingRaw}</pre><pre>{JSON.stringify(attempt.teachingInput, null, 2)}</pre><pre>{TEACH_SYSTEM_PROMPT}</pre><pre>{JSON.stringify(TEACH_SCHEMA, null, 2)}</pre>
                  </details>}
                  {attempt.workflowStage === "embedding" && <p className={styles.workflowProgress}>↳ Assessment complete · Comparing 50 mock subjects and difficulties…</p>}
                  {attempt.workflowStage === "complete" && attempt.connected && <p className={styles.workflowComplete}>↳ {attempt.connected.difficulties.length ? "Two similarity rankings" : "Subject-only ranking"} ready · {attempt.connected.referenceCount} mock topics {attempt.resolution === "clarify" ? "· provisional until clarified" : ""}</p>}
                  {attempt.connectedError && <p className={styles.workflowError}>↳ {attempt.connectedError} Assessment retained.</p>}
                  {attempt.workflowTotalMs !== undefined && <div className={styles.workflowTiming}>END-TO-END {formatMs(attempt.workflowTotalMs)} <span>·</span> {attempt.provider === "edge" ? "Edge" : (attempt.modelName ?? "OpenAI")} {formatMs(attempt.timing?.totalMs)} <span>·</span> Browser retrieval {formatMs(attempt.connected?.totalMs)}</div>}
                  {attempt.warnings && attempt.warnings.length > 0 && <details className={styles.rawDetails}>
                    <summary>Validation adjustments ({attempt.warnings.length}) · Raw response preserved</summary>
                    <ul>{attempt.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
                  </details>}
                  {attempt.error && <div className={styles.error}>{attempt.error}</div>}
                  {attempt.raw !== undefined && <details className={styles.rawDetails}><summary>Inspect raw model JSON & exact prompt snapshot</summary>
                    <pre>{attempt.raw}</pre>
                    <button type="button" className={styles.subtleButton} onClick={() => void copyResponse(attempt.raw ?? "")}>Copy JSON</button>
                    <details><summary>Prompt and schema used on this run</summary>
                      <span>USER INPUT</span><pre>{attempt.promptInput}</pre>
                      <span>SYSTEM</span><pre>{attempt.systemPromptUsed}</pre>
                      <span>RESPONSE SCHEMA</span><pre>{JSON.stringify(attempt.responseSchemaUsed, null, 2)}</pre>
                    </details>
                  </details>}
                  {attempt.timing && <div className={styles.turnTiming}>Total {formatMs(attempt.timing.totalMs)} <span>·</span> Session {formatMs(attempt.timing.sessionMs)} <span>·</span> Response {formatMs(attempt.timing.generationMs)} <span>·</span> {attempt.timing.sessionMode}</div>}
                </div>
              </div>)}
            </div>
            <form onSubmit={(event) => { void run(event); }} className={styles.composer}>
              <label htmlFor="local-assessment-message">{pendingClarification ? "ANSWER MYWAY'S QUESTION" : "LEARNER MESSAGE"}</label>
              {pendingClarification && <div className={styles.pendingClarify}>
                <span>CLARIFICATION · ONE FOLLOW-UP</span>
                <p>{pendingClarification.question}</p>
                <button type="button" disabled={busy} className={styles.subtleButton} onClick={() => { setPendingClarification(null); setMessage(""); }}>Start fresh instead</button>
              </div>}
              <textarea id="local-assessment-message" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!busy && !embedBusy && message.trim()) event.currentTarget.form?.requestSubmit();
                }
              }} placeholder={pendingClarification ? "Answer the clarification question…" : "Type what the learner is thinking…"} rows={4} disabled={busy || embedBusy} />
              <div className={styles.composerBottom}><span>Enter to run · Shift+Enter for a new line · No learning-state writes.</span><div className={styles.actionRow}>{busy && <button type="button" onClick={cancel} className={styles.stopButton}>Stop</button>}<button type="submit" className={styles.submitButton} disabled={busy || embedBusy || !message.trim()}>{busy ? "Working…" : pendingClarification ? "Clarify + compare" : "Assess + compare"} <span>↗</span></button></div></div>
            </form>
          </section>
          <section className={styles.visualHandoffPanel} aria-label="Visual learning handoff">
            <div className={styles.visualHandoffHead}><h2>Learning experience · Visual handoff</h2><span>{latestHandoff ? "HANDOFF READY" : "AWAITING TEACHING PLAN"}</span></div>
            {latestHandoff ? <>
              <p className={styles.visualHandoffLabel}>Teaching direction</p>
              <p>{latestHandoff.teaching_strategy}</p>
              <p className={styles.visualHandoffLabel}>Visual intent · supplied to future Model C</p>
              <p>{latestHandoff.visual_intent}</p>
              <div className={styles.visualHandoffNotice}>Director has not run. No assets retrieved or scene rendered; the validated upstream decisions are preserved for V3.7.</div>
            </> : <p className={styles.visualPlaceholder}>Once Model B finishes, a frozen, validated visual handoff will appear here. Assessment and relationships stay inspectable even if teaching fails.</p>}
          </section>
          <details className={styles.profilePanel}>
            <summary>Optional learner profile <span>Interests · presentation preference · learning goal</span></summary>
            <div className={styles.profileFields}>
              <label htmlFor="myway-profile-interests">Interests <small>Comma-separated; voluntary</small></label>
              <input id="myway-profile-interests" value={profileInterests} maxLength={240} disabled={busy} placeholder="e.g. soccer, music" onChange={event => setProfileInterests(event.target.value)} />
              <label htmlFor="myway-profile-style">How to begin <small>Self-reported, not a fixed learning style</small></label>
              <select id="myway-profile-style" value={profileStyle} disabled={busy} onChange={event => setProfileStyle(event.target.value as TeachingStyle)}>
                <option value="unsure">Not sure / discover over time</option><option value="examples_first">Examples first</option><option value="rules_first">Rules first</option><option value="visual_first">Visual comparison first</option><option value="step_by_step">Step by step</option>
              </select>
              <label htmlFor="myway-profile-goal">Optional goal</label>
              <input id="myway-profile-goal" value={profileGoal} maxLength={140} disabled={busy} placeholder="e.g. Understand spoken Spanish more automatically" onChange={event => setProfileGoal(event.target.value)} />
              <p className={styles.mini}>Only an in-memory test profile, passed to the teaching model after assessment. No learner database writes; no inferred personality traits.</p>
            </div>
          </details>
          <details className={styles.promptDock}>
              <summary>Model configuration <span>Prompt · JSON schema · Diagnostics</span></summary>
              <div className={styles.promptDockBody}>
                <div className={styles.configTabs} role="tablist" aria-label="Assessment model configuration">
                  {(["prompt", "schema", "diagnostics"] as const).map((tab) => <button type="button" key={tab}
                    className={`${styles.configTab} ${configurationTab === tab ? styles.configTabActive : ""}`}
                    role="tab" id={`assessment-tab-${tab}`} aria-controls={`assessment-panel-${tab}`}
                    aria-selected={configurationTab === tab} onClick={() => setConfigurationTab(tab)}>
                    {tab === "prompt" ? "Prompt" : tab === "schema" ? "JSON schema" : "Diagnostics"}
                  </button>)}
                </div>
                {configurationTab === "prompt" && <div className={styles.configPane} role="tabpanel" id="assessment-panel-prompt" aria-labelledby="assessment-tab-prompt">
                  <div className={styles.promptLabel}><strong>System prompt</strong><small>{systemPrompt.length} characters · {systemPrompt.trim().split(/\s+/).length} words</small></div>
                  <textarea aria-label="Assessment system prompt" rows={12} value={systemPrompt} onChange={(event) => changeSystemPrompt(event.target.value)} disabled={busy} spellCheck={false} />
                  <button type="button" className={styles.subtleButton} disabled={busy} onClick={() => changeSystemPrompt(DEFAULT_SYSTEM_PROMPT)}>Reset prompt</button>
                  <div className={styles.promptLabel}><strong>Next learner input · exact snapshot</strong><small>Read-only</small></div>
                  <pre className={styles.promptReadOnly}>{buildUserPrompt(message.trim(), pendingClarification) || "Enter a learner message above."}</pre>
                </div>}
                {configurationTab === "schema" && <div className={styles.configPane} role="tabpanel" id="assessment-panel-schema" aria-labelledby="assessment-tab-schema">
                  <div className={styles.promptLabel}><strong>Eight-field JSON response schema</strong><small>Descriptions editable; fields locked</small></div>
                  <textarea aria-label="Assessment JSON schema" rows={14} value={schemaText} onChange={(event) => setSchemaText(event.target.value)} disabled={busy} spellCheck={false} />
                  <p className={schemaValidation.error ? styles.schemaError : styles.schemaGood} role="status">{schemaValidation.error ?? "Schema valid · eight-field assessment contract"}</p>
                  <button type="button" className={styles.subtleButton} disabled={busy} onClick={() => { setSchemaText(DEFAULT_SCHEMA_TEXT); setConfigMessage(""); }}>Reset schema</button>
                  <p className={styles.mini}>Both providers use this schema. Scores, action options, and evidence checks remain guarded.</p>
                </div>}
                {configurationTab === "diagnostics" && <div className={styles.configPane} role="tabpanel" id="assessment-panel-diagnostics" aria-labelledby="assessment-tab-diagnostics">
                  <div className={styles.promptLabel}><strong>Root-problem confidence threshold</strong><small>{confidenceThreshold.toFixed(2)} · experimental</small></div>
                  <input type="range" min={0} max={1} step={0.05} value={confidenceThreshold} disabled={busy} onChange={(event) => setConfidenceThreshold(Number(event.target.value))} aria-label="Root-problem confidence threshold" />
                  <p className={styles.mini}>Below the threshold, ask one useful clarification. Confidence is not calibrated or a mastery score.</p>
                  <div className={styles.configDiagnostics}>
                    <div><span>Selected provider</span><strong>{assessmentProvider === "edge" ? "Edge local" : "OpenAI API (explicit)"}</strong></div>
                    <div><span>Latest model</span><strong>{latestAttempt?.modelName ?? "—"}</strong></div>
                    <div><span>Latest state</span><strong>{latestAttempt?.workflowStage ?? "Not run"}</strong></div>
                    <div><span>Assessment duration</span><strong>{formatMs(lastTiming?.totalMs)}</strong></div>
                  </div>
                  <div className={styles.promptLabel}><strong>Cloud configuration</strong><small>No API charge for this check</small></div>
                  <button type="button" className={styles.outlineButton} disabled={checkingCloudSetup || busy} onClick={() => void inspectCloudSetup()}>{checkingCloudSetup ? "Checking…" : "Check OpenAI setup"}</button>
                  {cloudSetup && <p className={cloudSetup.ready ? styles.schemaGood : styles.schemaError} role="status">{cloudSetup.ready ? "Configured" : "Not configured"} · {cloudSetup.model} · Key: {cloudSetup.keySource ?? "missing"} · Endpoint: {cloudSetup.endpointHost} · Server limit {cloudSetup.serverTimeoutSeconds}s</p>}
                  {cloudSetupError && <p className={styles.schemaError} role="alert">{cloudSetupError}</p>}
                  {latestAttempt?.error && <p className={styles.schemaError} role="alert">Last run: {latestAttempt.error}</p>}
                  <p className={styles.mini}>The setup check does not send learner text or make a paid OpenAI request. Live cloud runs stop within a bounded time and keep the raw model response when available.</p>
                </div>}
                {configMessage && <p className={styles.schemaError}>{configMessage}</p>}
              </div>
            </details>
          </div>

          <aside className={styles.sideColumn}>
            <LearningDecisionInspector attempt={latestAttempt ?? null} backend={connectedBackend} connectedStatus={connectedStatus} />
            <details className={styles.legacyDiagnostics}><summary>Advanced tools · Existing session, retrieval, benchmark & export</summary><div className={styles.legacyPanels}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}><span>01</span><h2>Edge local model status</h2></div>
              <div className={styles.statusLine}><span className={`${styles.statusDot} ${modelStatus === "available" ? styles.good : modelStatus === "downloadable" || modelStatus === "downloading" ? styles.warn : styles.bad}`} />{modelStatus.replaceAll("_", " ").toUpperCase()}</div>
              <p className={styles.detail}>{statusDetail}</p>
              {downloadPercent !== null && <><div className={styles.downloadBar}><div style={{ width: `${downloadPercent}%` }} /></div><p className={styles.detail}>Model download: {downloadPercent}%</p></>}
              <button type="button" className={styles.outlineButton} onClick={() => void checkAvailability()} disabled={busy || embedBusy}>Refresh availability</button>
              <p className={styles.mini}>Edge uses <code>window.LanguageModel</code>. The second phase runs quantized MiniLM locally in a separate browser worker.</p>
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
              <div className={styles.workflowSummary}><span>LATEST WORKFLOW</span><strong>{formatMs(latestWorkflowMs)}</strong><small>Chosen assessment model + one or two local retrievals</small></div>
              <button type="button" className={styles.outlineButton} onClick={exportExperiments} disabled={(!attempts.length && !embeddingRuns.length) || busy || embedBusy}>Export test results as JSON ↓</button>
            </section>
            <section className={styles.panel} aria-label="Connected browser embedding comparisons">
              <div className={styles.panelHeading}><span>03</span><h2>Connected retrieval</h2></div>
              <p className={styles.detail}>Compare subjects and supported learning difficulties across 50 mock topics. If the root problem is uncertain, show subjects only. References are cached.</p>
              <div className={styles.embedControls}>
                <label htmlFor="myway-connected-backend">Automatic embedding backend</label>
                <select id="myway-connected-backend" value={connectedBackend} disabled={busy || embedBusy} onChange={(event) => {
                  connectedWorker.current?.terminate(); connectedWorker.current = null;
                  setConnectedBackend(event.target.value as EmbedBackend);
                  setConnectedStatus("Backend changed · Reference vectors will reload");
                  setConnectedPercent(null);
                }}>
                  <option value="wasm">WASM · CPU (default)</option>
                  <option value="webgpu">WebGPU · GPU</option>
                </select>
              </div>
              <div className={styles.connectedStatusRow}>
                <p className={styles.embedStatus} role="status">{connectedStatus}</p>
                <button type="button" className={styles.subtleButton} disabled={busy || embedBusy || !connectedWorker.current} onClick={() => {
                  connectedWorker.current?.terminate();
                  connectedWorker.current = null;
                  setConnectedStatus("Model released · References reload on next run");
                  setConnectedPercent(null);
                }}>Release</button>
              </div>
              {connectedPercent !== null && <div className={styles.downloadBar}><div style={{ width: `${connectedPercent}%` }} /></div>}
              {latestConnected ? <div className={styles.embedResults}>
                <div className={styles.embedNumbers}>
                  <div><span>RETRIEVAL TOTAL</span><strong>{formatMs(latestConnected.totalMs)}</strong></div>
                  <div><span>QUERY EMBEDDINGS</span><strong>{formatMs(latestConnected.queryMs)}</strong></div>
                  <div><span>50 × 2 REFERENCES</span><strong>{latestConnected.reusedReferences ? "Cached" : formatMs(latestConnected.referencesMs)}</strong></div>
                  <div><span>MODEL + LIBRARY</span><strong>{formatMs(latestConnected.loadMs + latestConnected.importMs)}</strong></div>
                </div>
                <p className={styles.embedFootnote}>{latestConnected.backend.toUpperCase()} · {latestConnected.dimensions}-D · {latestConnected.reusedModel ? "warm model" : "new model"} · {latestConnected.reusedReferences ? "cached reference vectors" : "reference vectors generated"}</p>
                <h3>Subject similarity · topic label</h3>
                <ol className={styles.embedList}>{latestConnected.subjects.slice(0, 5).map((match) => <li key={match.label}><span>{match.label}</span><strong>{match.similarity.toFixed(3)}</strong></li>)}</ol>
                <h3>Learning-difficulty similarity · root problem</h3>
                {latestConnected.difficulties.length ? <ol className={styles.embedList}>{latestConnected.difficulties.slice(0, 5).map((match) => <li key={match.label} className={styles.difficultyItem}><span><b>{match.label}</b><small>{match.rootProblem}</small></span><strong>{match.similarity.toFixed(3)}</strong></li>)}</ol> : <p className={styles.mini}>Withheld · no grounded root-problem hypothesis for this turn.</p>}
                <details className={styles.rawDetails}><summary>All 50 rankings and breakdown</summary>
                  <p className={styles.embedFootnote}>Subject rankings</p>
                  <ol className={styles.embedList}>{latestConnected.subjects.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.similarity.toFixed(3)}</strong></li>)}</ol>
                  <p className={styles.embedFootnote}>Root-problem rankings</p>
                  <ol className={styles.embedList}>{latestConnected.difficulties.map((item) => <li key={item.label} className={styles.difficultyItem}><span><b>{item.label}</b><small>{item.rootProblem}</small></span><strong>{item.similarity.toFixed(3)}</strong></li>)}</ol>
                  <p className={styles.embedFootnote}>Library {formatMs(latestConnected.importMs)} · Model load {formatMs(latestConnected.loadMs)} · Reference embeddings {formatMs(latestConnected.referencesMs)} · Query embeddings {formatMs(latestConnected.queryMs)} · Cosine ranking {formatMs(latestConnected.comparisonMs)}</p>
                </details>
              </div> : <p className={styles.mini}>Submit a learner message to see both rankings. Root-problem similarity is exploratory, not evidence of a shared misconception.</p>}
              <details className={styles.settingsDetails}><summary>Advanced · Legacy manual benchmark (7 topics)</summary>
              <p className={styles.mini}>Original separate MiniLM benchmark retained for regression comparisons. Run only while the connected workflow is idle.</p>
              <div className={styles.embedControls}>
                <label htmlFor="myway-embed-backend">Backend</label>
                <select id="myway-embed-backend" value={embedBackend} onChange={(event) => changeEmbeddingBackend(event.target.value as EmbedBackend)} disabled={busy || embedBusy}>
                  <option value="webgpu">WebGPU · GPU</option>
                  <option value="wasm">WASM · CPU</option>
                </select>
                <label htmlFor="myway-embed-input">Compare using</label>
                <select id="myway-embed-input" value={embedMode} onChange={(event) => setEmbedMode(event.target.value as EmbedInputMode)} disabled={busy || embedBusy}>
                  <option value="topic_label">Latest assessed topic label</option>
                  <option value="learner_message">Draft / latest learner message</option>
                </select>
              </div>
              <div className={styles.embedActions}>
                <button type="button" className={styles.outlineButton} disabled={busy || embedBusy || !canEmbed} onClick={runEmbeddings}>{embedBusy ? "Embedding…" : "Run embedding test"}</button>
                {embedBusy
                  ? <button type="button" className={styles.subtleButton} onClick={() => releaseEmbeddingWorker("Cancelled · Worker stopped")}>Stop</button>
                  : <button type="button" className={styles.subtleButton} disabled={!embeddingWorker.current} onClick={() => releaseEmbeddingWorker()}>Release</button>}
              </div>
              <p className={styles.embedStatus} role="status">{embedStatus}</p>
              {embedPercent !== null && <div className={styles.downloadBar}><div style={{ width: `${embedPercent}%` }} /></div>}
              {lastEmbed && <div className={styles.embedResults}>
                <div className={styles.embedNumbers}>
                  <div><span>TOTAL</span><strong>{formatMs(lastEmbed.totalMs)}</strong></div>
                  <div><span>INFERENCE</span><strong>{formatMs(lastEmbed.inferenceMs)}</strong></div>
                  <div><span>MODEL LOAD</span><strong>{formatMs(lastEmbed.loadMs)}</strong></div>
                  <div><span>IMPORT</span><strong>{formatMs(lastEmbed.importMs)}</strong></div>
                </div>
                <p className={styles.embedFootnote}>{lastEmbed.backend.toUpperCase()} · {lastEmbed.dimensions} dimensions · {lastEmbed.reusedModel ? "warm pipeline" : "new pipeline"} · {lastEmbed.mode === "topic_label" ? "topic label" : "learner message"}</p>
                <h3>Closest sample topics</h3>
                <ol className={styles.embedList}>{lastEmbed.neighbors.slice(0, 5).map((neighbor) => <li key={neighbor.label}><span>{neighbor.label}</span><strong>{neighbor.similarity.toFixed(3)}</strong></li>)}</ol>
                <details className={styles.rawDetails}><summary>Sample pairwise similarities</summary><ol className={styles.embedList}>{lastEmbed.pairs.map((pair) => <li key={`${pair.first}/${pair.second}`}><span>{pair.first} ↔ {pair.second}</span><strong>{pair.similarity.toFixed(3)}</strong></li>)}</ol></details>
                <p className={styles.embedFootnote}>Latest Edge result: {formatMs(lastTiming?.totalMs)}. Tests are separate and sequential, not simultaneous. Export JSON to compare vectors across backends or with Python.</p>
              </div>}
              </details>
              <p className={styles.mini}>50 sandbox-only fixtures · <a className={styles.fixtureLink} href="/myway-local-embedding-lab-v2/mock-topics.mjs" target="_blank" rel="noreferrer">Inspect mock topics and descriptions ↗</a>. Downloads from jsDelivr and Hugging Face on first use. No MyWay database access. Similarities are not confidence or mastery scores.</p>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeading}><span>04</span><h2>Learning plan</h2></div>
              <p className={styles.detail}>Assessment → retrieval → one compact teaching call. Provisional relationship candidates and optional interests guide a short next step.</p>
              <p className={styles.mini}>{latestTeaching ? `Latest strategy: ${latestTeaching.teaching_strategy}` : "A validated assessment will produce a plan after clarification and retrieval."}</p>
              <p className={styles.mini}>Experimental only · No relationship, mastery, or personalization writes.</p>
            </section>
            <div className={styles.privacy}>◆ &nbsp;Experimental local inference. Outputs can be inaccurate; verify diagnoses before using them for assessment.</div>
            {copyState && <p role="status" className={styles.copyStatus}>{copyState}</p>}
            </div></details>
          </aside>
        </div>
      </div>
    </main>
  );
}
