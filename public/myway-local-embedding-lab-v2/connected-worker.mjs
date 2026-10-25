// MyWay sandbox: automatic sequential topic + learning-difficulty retrieval.
// Never calls MyWay production APIs, Supabase, Qdrant, or local storage.
import { MOCK_TOPICS } from "./mock-topics.mjs";

const LIBRARY_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const EXPECTED_DIMENSIONS = 384;
let transformerModule = null;
let pipelineInstance = null;
let pipelineBackend = null;
let referenceVectors = null;
let working = false;

function validVector(vector) {
  return Array.isArray(vector) && vector.length === EXPECTED_DIMENSIONS && vector.every(Number.isFinite);
}
function cosine(a, b) {
  let dot = 0, a2 = 0, b2 = 0;
  for (let i = 0; i < EXPECTED_DIMENSIONS; i += 1) {
    dot += a[i] * b[i]; a2 += a[i] * a[i]; b2 += b[i] * b[i];
  }
  if (a2 <= 0 || b2 <= 0) throw new Error("Encountered zero-length embedding vector.");
  return Math.max(-1, Math.min(1, dot / Math.sqrt(a2 * b2)));
}
function progress(runId, message, percent) {
  postMessage({ type: "progress", runId, message, percent });
}
function ensureVectors(vectors, count) {
  if (!Array.isArray(vectors) || vectors.length !== count || !vectors.every(validVector)) {
    throw new Error(`Expected ${count} normalized ${EXPECTED_DIMENSIONS}-D vectors.`);
  }
  return vectors;
}

self.onmessage = async (event) => {
  const { type, runId, backend, topicName, rootProblem } = event.data ?? {};
  if (type !== "compare" || working || !Number.isSafeInteger(runId)) return;
  working = true;
  const started = performance.now();
  let importMs = 0, loadMs = 0, referencesMs = 0, queryMs = 0, comparisonMs = 0;
  try {
    if (!(["wasm", "webgpu"].includes(backend)) || typeof topicName !== "string" || !topicName.trim() ||
        typeof rootProblem !== "string" || topicName.length > 1000 || rootProblem.length > 6000) {
      throw new Error("Invalid backend, topic name or root-problem description.");
    }
    if (MOCK_TOPICS.length !== 50) throw new Error("Sandbox fixture must have exactly 50 mock topics.");
    if (backend === "webgpu" && !self.navigator?.gpu) throw new Error("WebGPU unavailable; choose WASM.");
    if (!transformerModule) {
      progress(runId, "Loading browser inference library…");
      const start = performance.now();
      transformerModule = await import(LIBRARY_URL);
      importMs = performance.now() - start;
      transformerModule.env.allowLocalModels = false;
      transformerModule.env.allowRemoteModels = true;
    }
    const reusedModel = Boolean(pipelineInstance && pipelineBackend === backend);
    if (!reusedModel) {
      pipelineInstance = null;
      pipelineBackend = null;
      referenceVectors = null;
      progress(runId, `Loading MiniLM on ${backend.toUpperCase()}…`);
      const start = performance.now();
      pipelineInstance = await transformerModule.pipeline("feature-extraction", MODEL_ID, {
        device: backend,
        dtype: "q8",
        progress_callback: (item) => {
          if (item?.status === "progress") {
            progress(runId, `Downloading model… ${item.file ?? ""}`,
              typeof item.progress === "number" ? Math.max(0, Math.min(100, item.progress)) : undefined);
          }
        },
      });
      loadMs = performance.now() - start;
      pipelineBackend = backend;
    }
    const reusedReferences = Boolean(referenceVectors);
    if (!referenceVectors) {
      progress(runId, "Embedding 50 topics + 50 root-problem descriptions (one-time cache)…");
      const start = performance.now();
      const descriptions = [...MOCK_TOPICS.map((topic) => topic.label), ...MOCK_TOPICS.map((topic) => topic.rootProblem)];
      const output = await pipelineInstance(descriptions, { pooling: "mean", normalize: true });
      referenceVectors = ensureVectors(output.tolist(), descriptions.length);
      referencesMs = performance.now() - start;
    }
    const hasRoot = Boolean(rootProblem.trim());
    progress(runId, hasRoot ? "Embedding topic and root-problem hypothesis…" : "Embedding topic only (root problem not established)…");
    const queryStart = performance.now();
    const queryOutput = await pipelineInstance(hasRoot ? [topicName.trim(), rootProblem.trim()] : [topicName.trim()], { pooling: "mean", normalize: true });
    let queryVectors;
    if (hasRoot) {
      const queries = ensureVectors(queryOutput.tolist(), 2);
      queryVectors = queries;
    } else {
      queryVectors = ensureVectors(queryOutput.tolist(), 1);
    }
    queryMs = performance.now() - queryStart;

    progress(runId, "Ranking two independent similarity comparisons…");
    const compareStart = performance.now();
    const subjects = MOCK_TOPICS.map((topic, index) => ({
      label: topic.label, similarity: cosine(queryVectors[0], referenceVectors[index]),
    })).sort((a, b) => b.similarity - a.similarity);
    const difficulties = hasRoot ? MOCK_TOPICS.map((topic, index) => ({
      label: topic.label, rootProblem: topic.rootProblem,
      similarity: cosine(queryVectors[1], referenceVectors[index + MOCK_TOPICS.length]),
    })).sort((a, b) => b.similarity - a.similarity) : [];
    comparisonMs = performance.now() - compareStart;
    postMessage({ type: "result", runId, result: {
      backend, model: MODEL_ID, dimensions: EXPECTED_DIMENSIONS,
      topicName: topicName.trim(), rootProblem: rootProblem.trim(), referenceCount: MOCK_TOPICS.length,
      reusedModel, reusedReferences,
      importMs, loadMs, referencesMs, queryMs, comparisonMs, totalMs: performance.now() - started,
      subjects, difficulties, topicVector: queryVectors[0], problemVector: hasRoot ? queryVectors[1] : [],
    } });
  } catch (error) {
    postMessage({ type: "error", runId, error: error instanceof Error ? error.message : String(error) });
  } finally {
    working = false;
  }
};
