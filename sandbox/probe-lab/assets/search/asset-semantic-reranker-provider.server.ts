import { setTimeout as sleep } from "node:timers/promises";

import type { AssetRerankerProviderRankingV1 } from "./asset-semantic-reranker";

export const DEFAULT_ASSET_RERANK_MODEL =
  "nvidia/llama-nemotron-rerank-vl-1b-v2" as const;
export const DEFAULT_ASSET_RERANK_ENDPOINT =
  "https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-vl-1b-v2/reranking" as const;

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_500;

function configuredModel() {
  return process.env.MYWAY_ASSET_RERANK_MODEL?.trim() || DEFAULT_ASSET_RERANK_MODEL;
}

function configuredEndpoint() {
  return process.env.MYWAY_ASSET_RERANK_ENDPOINT?.trim() || DEFAULT_ASSET_RERANK_ENDPOINT;
}

function isLocalEndpoint(value: string) {
  return /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i.test(`${value}/`);
}

function authorizationHeaders(endpoint: string): Record<string, string> {
  const apiKey =
    process.env.MYWAY_ASSET_NVIDIA_API_KEY?.trim() ||
    process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey && !isLocalEndpoint(endpoint)) {
    throw new Error(
      "NVIDIA_API_KEY (or MYWAY_ASSET_NVIDIA_API_KEY) is required for the hosted MyWay asset reranker.",
    );
  }
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function responseMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["detail", "message", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

function parseRankings(payload: unknown, passageCount: number) {
  if (!payload || typeof payload !== "object") {
    throw new Error("NVIDIA reranker returned a non-object response.");
  }
  const rawRankings = (payload as Record<string, unknown>).rankings;
  if (!Array.isArray(rawRankings)) {
    throw new Error("NVIDIA reranker response did not contain a rankings array.");
  }
  const rankings: AssetRerankerProviderRankingV1[] = [];
  const seen = new Set<number>();
  for (const raw of rawRankings) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const index = Number(record.index);
    const logit = Number(record.logit);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= passageCount ||
      !Number.isFinite(logit) ||
      seen.has(index)
    ) continue;
    seen.add(index);
    rankings.push({ index, logit });
  }
  if (!rankings.length) {
    throw new Error("NVIDIA reranker response contained no valid ranking rows.");
  }
  return rankings.sort((left, right) => right.logit - left.logit || left.index - right.index);
}

export async function callNvidiaAssetRerankerV1(input: {
  query: string;
  passages: string[];
  timeout_ms?: number;
}) {
  const query = input.query.trim();
  const passages = input.passages.map((value) => value.trim()).filter(Boolean);
  if (!query) throw new Error("Reranker query is empty.");
  if (!passages.length) throw new Error("Reranker requires at least one candidate passage.");
  if (passages.length > 1000) throw new Error("Reranker passage count exceeds NVIDIA's documented limit of 1000.");

  const endpoint = configuredEndpoint();
  const model = configuredModel();
  const timeoutMs = Math.max(1_000, Math.min(120_000, Number(input.timeout_ms) || DEFAULT_TIMEOUT_MS));
  const requestBody = {
    model,
    query: { text: query },
    passages: passages.map((text) => ({ text })),
    truncate: "END" as const,
  };

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authorizationHeaders(endpoint),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const message = responseMessage(payload, text.slice(0, 1200) || response.statusText);
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS) {
          lastError = new Error(`NVIDIA reranker HTTP ${response.status}: ${message}`);
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new Error(`NVIDIA reranker HTTP ${response.status}: ${message}`);
      }
      const rankings = parseRankings(payload, passages.length);
      const usage =
        payload && typeof payload === "object"
          ? ((payload as Record<string, unknown>).usage ?? null)
          : null;
      return {
        ok: true as const,
        model,
        endpoint,
        rankings,
        usage,
        passage_count: passages.length,
        attempt_count: attempt,
        duration_ms: Number((performance.now() - started).toFixed(2)),
      };
    } catch (caught) {
      lastError = caught;
      const retryable =
        caught instanceof DOMException && caught.name === "AbortError" ||
        /fetch failed|network|timeout|timed out|429|500|502|503|504/i.test(
          caught instanceof Error ? caught.message : String(caught),
        );
      if (retryable && attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `NVIDIA reranker request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function probeNvidiaAssetRerankerV1() {
  const result = await callNvidiaAssetRerankerV1({
    query: "Which candidate is the bone of the upper arm?",
    passages: [
      "Candidate asset: humerus. Named concept: upper arm bone.",
      "Candidate asset: knee. Named concept: knee joint region.",
    ],
    timeout_ms: 30_000,
  });
  return {
    ok: true as const,
    model: result.model,
    endpoint: result.endpoint,
    duration_ms: result.duration_ms,
    attempt_count: result.attempt_count,
    rankings: result.rankings,
    provider_contract: "query.text + passages[].text -> rankings[].index/logit",
  };
}
