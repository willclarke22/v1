// MyWay Local Assessment Lab - browser-only experimental MiniLM worker.
// No MyWay APIs, persistence, Qdrant calls, or automatic background work.
// Library/model files are downloaded on first use from third-party origins.
const LIBRARY_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const TOPICS = [
  "Electric circuits",
  "Electrical current",
  "Krebs cycle",
  "Cellular respiration",
  "Gravity and falling objects",
  "Newton's laws of motion",
  "Spanish reflexive pronouns",
];
const PAIR_EXAMPLES = [[0, 1], [2, 3], [0, 2], [4, 5]];
let transformerModule = null;
let pipelineInstance = null;
let activeBackend = null;
let working = false;

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    throw new Error("Inconsistent embedding vector dimensions.");
  }
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]), y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Non-finite embedding component.");
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  if (aa <= 0 || bb <= 0) throw new Error("Zero-norm embedding.");
  return Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb)));
}
function sendProgress(runId, message, percent) {
  postMessage({ type: "progress", runId, message, percent });
}

self.onmessage = async (event) => {
  const { type, runId, backend, input } = event.data ?? {};
  if (type !== "run" || working || !Number.isSafeInteger(runId)) return;
  working = true;
  const started = performance.now();
  let importMs = 0;
  let loadMs = 0;
  let inferenceMs = 0;
  try {
    if ((backend !== "webgpu" && backend !== "wasm") || typeof input !== "string" || !input.trim() || input.length > 6000) {
      throw new Error("Invalid backend or input text (maximum 6,000 characters).");
    }
    if (backend === "webgpu" && !self.navigator?.gpu) {
      throw new Error("WebGPU is not exposed here. Select WASM (CPU) or enable supported WebGPU in Edge.");
    }
    if (!transformerModule) {
      sendProgress(runId, "Loading browser inference library from jsDelivr…");
      const start = performance.now();
      transformerModule = await import(LIBRARY_URL);
      importMs = performance.now() - start;
      // Do not attempt local URLs for model weights. Browser cache is used by the library.
      transformerModule.env.allowLocalModels = false;
      transformerModule.env.allowRemoteModels = true;
    }
    const reusedModel = Boolean(pipelineInstance && activeBackend === backend);
    if (!reusedModel) {
      pipelineInstance = null;
      activeBackend = null;
      sendProgress(runId, `Loading MiniLM model (${backend.toUpperCase()})…`);
      const start = performance.now();
      pipelineInstance = await transformerModule.pipeline("feature-extraction", MODEL_ID, {
        device: backend,
        dtype: "q8",
        progress_callback: (progress) => {
          const pct = typeof progress?.progress === "number" && Number.isFinite(progress.progress)
            ? Math.max(0, Math.min(100, progress.progress)) : undefined;
          if (progress?.status === "progress") sendProgress(runId, `Downloading model… ${progress.file ?? ""}`, pct);
          else if (progress?.status === "initiate") sendProgress(runId, `Preparing ${progress.file ?? "model"}…`);
        },
      });
      loadMs = performance.now() - start;
      activeBackend = backend;
    }
    const texts = [input.trim(), ...TOPICS];
    sendProgress(runId, `Generating ${texts.length} local embeddings…`);
    const inferenceStarted = performance.now();
    const output = await pipelineInstance(texts, { pooling: "mean", normalize: true });
    inferenceMs = performance.now() - inferenceStarted;
    const vectors = output.tolist();
    if (!Array.isArray(vectors) || vectors.length !== texts.length) throw new Error("Unexpected model output count.");
    const dimensions = vectors[0]?.length;
    if (dimensions !== 384 || vectors.some((v) => !Array.isArray(v) || v.length !== dimensions)) {
      throw new Error(`Expected 384-D MiniLM vectors; received ${dimensions ?? "unknown"}.`);
    }
    const neighbors = TOPICS.map((label, index) => ({
      label, similarity: cosine(vectors[0], vectors[index + 1]),
    })).sort((a, b) => b.similarity - a.similarity);
    const pairs = PAIR_EXAMPLES.map(([a, b]) => ({
      first: TOPICS[a], second: TOPICS[b], similarity: cosine(vectors[a + 1], vectors[b + 1]),
    }));
    postMessage({
      type: "result", runId,
      result: {
        backend, input: input.trim(), model: MODEL_ID, dimensions, reusedModel,
        importMs, loadMs, inferenceMs, totalMs: performance.now() - started,
        neighbors, pairs, queryVector: vectors[0],
      },
    });
  } catch (error) {
    postMessage({ type: "error", runId, error: error instanceof Error ? error.message : String(error) });
  } finally {
    working = false;
  }
};
