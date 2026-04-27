type EmbeddingServiceTiming = {
  total_ms?: unknown;
  encode_ms?: unknown;
  serialize_ms?: unknown;
  text_count?: unknown;
};

type EmbeddingServiceResponse = {
  vectors?: unknown;
  timing?: EmbeddingServiceTiming;
};

type EmbedTimingStep = {
  label: string;
  duration_ms: number;
  elapsed_ms: number;
};

type EmbedTimingDebug = {
  enabled: boolean;
  total_ms: number;
  steps: EmbedTimingStep[];
  metadata: {
    route: "embedTexts";
    text_count: number;
    vector_count: number;
    vector_size: number | null;
    service_timing: EmbeddingServiceTiming | null;
    skipped_reason: string | null;
  };
};

const EMBED_TEXT_CACHE_LIMIT = 200;
const embedTextCache = new Map<string, number[]>();

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function createEmbedTimer() {
  const enabled = process.env.MYWAY_EMBED_TIMING !== "off";
  const startedAt = performance.now();
  let lastMark = startedAt;
  const steps: EmbedTimingStep[] = [];

  function step(label: string) {
    if (!enabled) return;

    const now = performance.now();

    steps.push({
      label,
      duration_ms: roundMs(now - lastMark),
      elapsed_ms: roundMs(now - startedAt),
    });

    lastMark = now;
  }

  function finish(metadata: EmbedTimingDebug["metadata"]): EmbedTimingDebug {
    return {
      enabled,
      total_ms: roundMs(performance.now() - startedAt),
      steps,
      metadata,
    };
  }

  return { step, finish };
}

function logEmbedTiming(debug: EmbedTimingDebug) {
  if (!debug.enabled) return;
  console.info("[embedTexts timing]", debug);
}

function normalizeCacheKey(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function getCachedTextVector(text: string): number[] | null {
  const key = normalizeCacheKey(text);
  const cached = embedTextCache.get(key);
  return cached ? [...cached] : null;
}

function setCachedTextVector(text: string, vector: number[]) {
  const key = normalizeCacheKey(text);
  if (!key) return;

  embedTextCache.set(key, [...vector]);

  if (embedTextCache.size > EMBED_TEXT_CACHE_LIMIT) {
    const oldestKey = embedTextCache.keys().next().value;
    if (oldestKey) embedTextCache.delete(oldestKey);
  }
}

function validateAndNormalizeTexts(texts: string[]) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("embedTexts requires at least one text");
  }

  return texts.map((text, index) => {
    if (typeof text !== "string") {
      throw new Error(`embedTexts expected string at index ${index}`);
    }

    const normalized = text.trim();

    if (!normalized) {
      throw new Error(`embedTexts expected non-empty string at index ${index}`);
    }

    return normalized;
  });
}

function validateVectors(vectors: unknown): number[][] {
  if (!Array.isArray(vectors)) {
    throw new Error("Embedding service returned invalid response: vectors missing");
  }

  return vectors.map((vector, index) => {
    if (!Array.isArray(vector)) {
      throw new Error(`Embedding service returned invalid vector at index ${index}`);
    }

    const numericVector = vector.map((value, valueIndex) => {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(
          `Embedding service returned non-numeric value at vector ${index}, position ${valueIndex}`
        );
      }

      return value;
    });

    if (numericVector.length === 0) {
      throw new Error(`Embedding service returned empty vector at index ${index}`);
    }

    return numericVector;
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const timer = createEmbedTimer();
  const baseUrl = process.env.EMBEDDINGS_URL;

  if (!baseUrl) {
    const debug = timer.finish({
      route: "embedTexts",
      text_count: Array.isArray(texts) ? texts.length : 0,
      vector_count: 0,
      vector_size: null,
      service_timing: null,
      skipped_reason: "missing_embeddings_url",
    });
    logEmbedTiming(debug);
    throw new Error("Missing EMBEDDINGS_URL");
  }

  const normalizedTexts = validateAndNormalizeTexts(texts);
  timer.step("validate_and_normalize_texts");

  // Fast path for common single-text requests. This is especially useful when the
  // same message is evaluated more than once during local debugging.
  if (normalizedTexts.length === 1) {
    const cachedVector = getCachedTextVector(normalizedTexts[0]);

    if (cachedVector) {
      timer.step("cache_hit");
      const debug = timer.finish({
        route: "embedTexts",
        text_count: 1,
        vector_count: 1,
        vector_size: cachedVector.length,
        service_timing: null,
        skipped_reason: "cache_hit",
      });
      logEmbedTiming(debug);
      return [cachedVector];
    }
  }

  timer.step("cache_check");

  const res = await fetch(`${baseUrl}/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts: normalizedTexts }),
    cache: "no-store",
  });
  timer.step("fetch_embedding_service");

  if (!res.ok) {
    const text = await res.text();
    timer.step("read_error_response");
    const debug = timer.finish({
      route: "embedTexts",
      text_count: normalizedTexts.length,
      vector_count: 0,
      vector_size: null,
      service_timing: null,
      skipped_reason: `embedding_service_failed_${res.status}`,
    });
    logEmbedTiming(debug);
    throw new Error(`Embedding service failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as EmbeddingServiceResponse;
  timer.step("parse_embedding_json");

  const vectors = validateVectors(data.vectors);
  timer.step("validate_vectors");

  if (normalizedTexts.length === vectors.length) {
    normalizedTexts.forEach((text, index) => {
      const vector = vectors[index];
      if (vector) setCachedTextVector(text, vector);
    });
  }
  timer.step("cache_vectors");

  const debug = timer.finish({
    route: "embedTexts",
    text_count: normalizedTexts.length,
    vector_count: vectors.length,
    vector_size: vectors[0]?.length ?? null,
    service_timing: data.timing ?? null,
    skipped_reason: null,
  });
  logEmbedTiming(debug);

  return vectors;
}

export async function embedText(text: string): Promise<number[]> {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("embedText requires a non-empty string");
  }

  const vectors = await embedTexts([text]);

  if (!vectors[0]) {
    throw new Error("No embedding returned");
  }

  return vectors[0];
}
