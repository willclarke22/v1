import { setTimeout as sleep } from "node:timers/promises";

import { stableJsonHash, stableTextHash } from "../content-hash.server";
import {
  embedAssetSemanticSearchTexts,
  embedSemanticSearchQuery,
} from "../enrichment/asset-enrichment-provider.server";
import {
  deleteDurableAssetJson,
  readDurableAssetJson,
  writeDurableAssetJson,
} from "../storage/asset-durable-artifacts.server";
import {
  buildAssetLexicalSearchIndexV1,
  searchAssetLexicalIndexV1,
  type AssetSearchRequirementV1,
} from "./asset-lexical-search";
import {
  buildSemanticRetrievalPassageV1,
  buildSemanticRetrievalQueryV1,
  fuseLexicalAndSemanticPilotResults,
  rankSemanticVectorRows,
  selectSemanticEmbeddingPilotDocuments,
  ASSET_SEMANTIC_PILOT_BATCH_SIZE,
  ASSET_SEMANTIC_PILOT_SELECTION_VERSION,
  ASSET_SEMANTIC_PILOT_TARGET_COUNT,
  type SemanticVectorRowV1,
} from "./asset-semantic-search";
import {
  getPreparedAssetSearchCorpus,
  runLexicalAssetSearchBench,
  type AssetSearchBenchCollectionMode,
} from "./asset-search-bench.server";
import type { AssetSearchDocumentV1 } from "./asset-search-document";

export const ASSET_SEMANTIC_EMBEDDING_PILOT_SCHEMA_VERSION =
  "myway_asset_semantic_embedding_pilot_v1" as const;
export const ASSET_SEMANTIC_EMBEDDING_VECTOR_SCHEMA_VERSION =
  "myway_asset_semantic_retrieval_embedding_v1" as const;

const PILOT_STATE_REFERENCE =
  "sandbox/probe-lab/assets/embeddings/semantic-search/bodyparts3d-pilot-state.json";
const VECTOR_REFERENCE_PREFIX =
  "sandbox/probe-lab/assets/embeddings/semantic-search/vectors/";
const DEFAULT_EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
const MAX_PROVIDER_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;

type PilotFailure = {
  at: string;
  asset_ids: string[];
  message: string;
  retryable: boolean;
};

export type AssetSemanticEmbeddingPilotStateV1 = {
  schema_version: typeof ASSET_SEMANTIC_EMBEDDING_PILOT_SCHEMA_VERSION;
  selection_version: typeof ASSET_SEMANTIC_PILOT_SELECTION_VERSION;
  asset_collection_mode: AssetSearchBenchCollectionMode;
  target_count: number;
  batch_size: number;
  model: string;
  registry_snapshot_id: string;
  selection_hash: string;
  selected_asset_ids: string[];
  completed_asset_ids: string[];
  reused_asset_ids: string[];
  provider_request_count: number;
  generated_vector_count: number;
  created_at: string;
  updated_at: string;
  last_error: PilotFailure | null;
};

export type AssetSemanticEmbeddingVectorArtifactV1 = {
  schema_version: typeof ASSET_SEMANTIC_EMBEDDING_VECTOR_SCHEMA_VERSION;
  asset_id: string;
  collection_member_id: string | null;
  model: string;
  dimensions: number;
  search_document_schema_version: string;
  source_text_hash: string;
  source_text: string;
  vector: number[];
  created_at: string;
};

let vectorCache:
  | {
      state_updated_at: string;
      rows: SemanticVectorRowV1[];
    }
  | null = null;

function configuredEmbeddingModel() {
  return process.env.MYWAY_ASSET_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
}

function vectorReference(assetId: string) {
  return `${VECTOR_REFERENCE_PREFIX}${encodeURIComponent(assetId)}.json`;
}

function retryableProviderError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  return /(429|408|500|502|503|504|rate limit|timeout|timed out|aborted|fetch failed|network)/i.test(
    message,
  );
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function requirementFromRaw(raw: Record<string, unknown>): AssetSearchRequirementV1 {
  return {
    semantic_name:
      typeof raw.semantic_name === "string" && raw.semantic_name.trim()
        ? raw.semantic_name.trim()
        : "hip joint",
    visual_role:
      typeof raw.visual_role === "string" ? raw.visual_role.trim() : "",
    semantic_tags: stringList(raw.semantic_tags).slice(0, 12),
  };
}

function modeFromRaw(raw: Record<string, unknown>): AssetSearchBenchCollectionMode {
  return raw.asset_collection_mode === "bodyparts3d_slp_pilot"
    ? "bodyparts3d_slp_pilot"
    : "bodyparts3d_full_atlas";
}

async function writeState(state: AssetSemanticEmbeddingPilotStateV1) {
  state.updated_at = new Date().toISOString();
  await writeDurableAssetJson(PILOT_STATE_REFERENCE, state);
  vectorCache = null;
  return state;
}

async function readState() {
  return readDurableAssetJson<AssetSemanticEmbeddingPilotStateV1>(
    PILOT_STATE_REFERENCE,
  );
}

function selectionForDocuments(
  documents: AssetSearchDocumentV1[],
  registrySnapshotId: string,
  mode: AssetSearchBenchCollectionMode,
) {
  const selected = selectSemanticEmbeddingPilotDocuments(
    documents,
    ASSET_SEMANTIC_PILOT_TARGET_COUNT,
  );
  const model = configuredEmbeddingModel();
  const selectionHash = stableJsonHash({
    selection_version: ASSET_SEMANTIC_PILOT_SELECTION_VERSION,
    mode,
    model,
    registry_snapshot_id: registrySnapshotId,
    assets: selected.map((document) => ({
      asset_id: document.asset_id,
      source_text_hash: stableTextHash(buildSemanticRetrievalPassageV1(document)),
    })),
  });
  return { selected, model, selectionHash };
}

function compatibleState(
  state: AssetSemanticEmbeddingPilotStateV1 | null,
  input: {
    mode: AssetSearchBenchCollectionMode;
    model: string;
    registry_snapshot_id: string;
    selection_hash: string;
  },
) {
  return Boolean(
    state &&
      state.schema_version === ASSET_SEMANTIC_EMBEDDING_PILOT_SCHEMA_VERSION &&
      state.selection_version === ASSET_SEMANTIC_PILOT_SELECTION_VERSION &&
      state.asset_collection_mode === input.mode &&
      state.model === input.model &&
      state.registry_snapshot_id === input.registry_snapshot_id &&
      state.selection_hash === input.selection_hash,
  );
}

export async function prepareSemanticEmbeddingPilot(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
) {
  const prepared = await getPreparedAssetSearchCorpus(mode);
  const selection = selectionForDocuments(
    prepared.documents,
    prepared.registry_snapshot_id,
    mode,
  );
  const existing = await readState();
  if (
    compatibleState(existing, {
      mode,
      model: selection.model,
      registry_snapshot_id: prepared.registry_snapshot_id,
      selection_hash: selection.selectionHash,
    })
  ) {
    return {
      state: existing!,
      prepared_cache_hit: prepared.cache_hit,
      status: "resume" as const,
    };
  }

  const now = new Date().toISOString();
  const state: AssetSemanticEmbeddingPilotStateV1 = {
    schema_version: ASSET_SEMANTIC_EMBEDDING_PILOT_SCHEMA_VERSION,
    selection_version: ASSET_SEMANTIC_PILOT_SELECTION_VERSION,
    asset_collection_mode: mode,
    target_count: selection.selected.length,
    batch_size: ASSET_SEMANTIC_PILOT_BATCH_SIZE,
    model: selection.model,
    registry_snapshot_id: prepared.registry_snapshot_id,
    selection_hash: selection.selectionHash,
    selected_asset_ids: selection.selected.map((document) => document.asset_id),
    completed_asset_ids: [],
    reused_asset_ids: [],
    provider_request_count: 0,
    generated_vector_count: 0,
    created_at: now,
    updated_at: now,
    last_error: null,
  };
  await writeState(state);
  return {
    state,
    prepared_cache_hit: prepared.cache_hit,
    status: "prepared" as const,
  };
}

async function ensurePilotState(mode: AssetSearchBenchCollectionMode) {
  const prepared = await getPreparedAssetSearchCorpus(mode);
  const selection = selectionForDocuments(
    prepared.documents,
    prepared.registry_snapshot_id,
    mode,
  );
  const current = await readState();
  let state: AssetSemanticEmbeddingPilotStateV1;
  if (
    compatibleState(current, {
      mode,
      model: selection.model,
      registry_snapshot_id: prepared.registry_snapshot_id,
      selection_hash: selection.selectionHash,
    })
  ) {
    state = current!;
  } else {
    state = (
      await prepareSemanticEmbeddingPilot(mode)
    ).state;
  }
  return { prepared, state, selection };
}

function progress(state: AssetSemanticEmbeddingPilotStateV1) {
  const completed = new Set(state.completed_asset_ids);
  const remaining = state.selected_asset_ids.filter(
    (assetId) => !completed.has(assetId),
  ).length;
  return {
    target_count: state.target_count,
    completed_count: state.completed_asset_ids.length,
    reused_count: state.reused_asset_ids.length,
    generated_count: state.generated_vector_count,
    remaining_count: remaining,
    complete: remaining === 0,
    percent: state.target_count
      ? Number(((state.completed_asset_ids.length / state.target_count) * 100).toFixed(1))
      : 0,
  };
}

async function reusableArtifact(
  document: AssetSearchDocumentV1,
  model: string,
) {
  const sourceText = buildSemanticRetrievalPassageV1(document);
  const sourceTextHash = stableTextHash(sourceText);
  const existing =
    await readDurableAssetJson<AssetSemanticEmbeddingVectorArtifactV1>(
      vectorReference(document.asset_id),
    );
  if (
    existing &&
    existing.schema_version === ASSET_SEMANTIC_EMBEDDING_VECTOR_SCHEMA_VERSION &&
    existing.asset_id === document.asset_id &&
    existing.model === model &&
    existing.source_text_hash === sourceTextHash &&
    Array.isArray(existing.vector) &&
    existing.vector.length > 0 &&
    existing.vector.every(Number.isFinite)
  ) {
    return { reusable: true as const, sourceText, sourceTextHash, artifact: existing };
  }
  return { reusable: false as const, sourceText, sourceTextHash, artifact: null };
}

async function embedWithRetry(texts: string[]) {
  let lastError: unknown = null;
  let attempts = 0;
  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    attempts += 1;
    try {
      const result = await embedAssetSemanticSearchTexts(texts);
      return { result, attempts };
    } catch (caught) {
      lastError = caught;
      const retryable = retryableProviderError(caught);
      if (!retryable || attempt >= MAX_PROVIDER_ATTEMPTS - 1) break;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!);
    }
  }
  throw Object.assign(
    new Error(lastError instanceof Error ? lastError.message : String(lastError)),
    { provider_attempts: attempts },
  );
}

export async function runSemanticEmbeddingPilotStep(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
) {
  const { prepared, state } = await ensurePilotState(mode);
  const documentById = new Map(
    prepared.documents.map((document) => [document.asset_id, document]),
  );
  const completed = new Set(state.completed_asset_ids);
  const pendingIds = state.selected_asset_ids
    .filter((assetId) => !completed.has(assetId))
    .slice(0, ASSET_SEMANTIC_PILOT_BATCH_SIZE);

  if (!pendingIds.length) {
    return {
      ok: true as const,
      state,
      progress: progress(state),
      provider_attempts: 0,
      provider_items: 0,
      reused_items: 0,
    };
  }

  const reusable: Array<{
    document: AssetSearchDocumentV1;
    artifact: AssetSemanticEmbeddingVectorArtifactV1;
  }> = [];
  const needed: Array<{
    document: AssetSearchDocumentV1;
    sourceText: string;
    sourceTextHash: string;
  }> = [];

  for (const assetId of pendingIds) {
    const document = documentById.get(assetId);
    if (!document) continue;
    const checked = await reusableArtifact(document, state.model);
    if (checked.reusable) {
      reusable.push({ document, artifact: checked.artifact });
    } else {
      needed.push({
        document,
        sourceText: checked.sourceText,
        sourceTextHash: checked.sourceTextHash,
      });
    }
  }

  for (const item of reusable) {
    if (!state.completed_asset_ids.includes(item.document.asset_id)) {
      state.completed_asset_ids.push(item.document.asset_id);
    }
    if (!state.reused_asset_ids.includes(item.document.asset_id)) {
      state.reused_asset_ids.push(item.document.asset_id);
    }
    state.last_error = null;
    await writeState(state);
  }

  let providerAttempts = 0;
  if (needed.length) {
    try {
      const embedded = await embedWithRetry(
        needed.map((item) => item.sourceText),
      );
      providerAttempts = embedded.attempts;
      state.provider_request_count += embedded.attempts;
      if (embedded.result.vectors.length !== needed.length) {
        throw new Error("Semantic embedding batch size did not match requested passages.");
      }

      for (let index = 0; index < needed.length; index += 1) {
        const item = needed[index]!;
        const vector = embedded.result.vectors[index]!;
        const artifact: AssetSemanticEmbeddingVectorArtifactV1 = {
          schema_version: ASSET_SEMANTIC_EMBEDDING_VECTOR_SCHEMA_VERSION,
          asset_id: item.document.asset_id,
          collection_member_id: item.document.collection_member_id,
          model: embedded.result.model,
          dimensions: vector.length,
          search_document_schema_version: item.document.schema_version,
          source_text_hash: item.sourceTextHash,
          source_text: item.sourceText,
          vector,
          created_at: new Date().toISOString(),
        };
        await writeDurableAssetJson(
          vectorReference(item.document.asset_id),
          artifact,
        );
        if (!state.completed_asset_ids.includes(item.document.asset_id)) {
          state.completed_asset_ids.push(item.document.asset_id);
        }
        state.generated_vector_count += 1;
        state.last_error = null;
        await writeState(state);
      }
    } catch (caught) {
      const attempts = Number(
        (caught as { provider_attempts?: number }).provider_attempts ?? providerAttempts,
      );
      state.provider_request_count += Math.max(0, attempts - providerAttempts);
      state.last_error = {
        at: new Date().toISOString(),
        asset_ids: needed.map((item) => item.document.asset_id),
        message: caught instanceof Error ? caught.message : String(caught),
        retryable: retryableProviderError(caught),
      };
      await writeState(state);
      return {
        ok: false as const,
        state,
        progress: progress(state),
        provider_attempts: attempts,
        provider_items: needed.length,
        reused_items: reusable.length,
        error: state.last_error,
      };
    }
  }

  return {
    ok: true as const,
    state,
    progress: progress(state),
    provider_attempts: providerAttempts,
    provider_items: needed.length,
    reused_items: reusable.length,
  };
}

export async function runSemanticEmbeddingPilotWindow(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
  maxBatches = 6,
) {
  const batches = Math.max(1, Math.min(8, Math.round(maxBatches)));
  const steps = [];
  for (let batch = 0; batch < batches; batch += 1) {
    const step = await runSemanticEmbeddingPilotStep(mode);
    steps.push(step);
    if (!step.ok || step.progress.complete) break;
    await sleep(500);
  }
  const state = steps.at(-1)?.state ?? (await ensurePilotState(mode)).state;
  return {
    ok: steps.every((step) => step.ok),
    state,
    progress: progress(state),
    steps,
  };
}

export async function getSemanticEmbeddingPilotStatus(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
) {
  const state = await readState();
  if (!state || state.asset_collection_mode !== mode) {
    return {
      state: null,
      progress: null,
    };
  }
  return {
    state,
    progress: progress(state),
  };
}

export async function resetSemanticEmbeddingPilot() {
  await deleteDurableAssetJson(PILOT_STATE_REFERENCE);
  vectorCache = null;
  return { ok: true as const };
}

async function loadVectorRows(
  state: AssetSemanticEmbeddingPilotStateV1,
) {
  if (vectorCache?.state_updated_at === state.updated_at) {
    return { rows: vectorCache.rows, cache_hit: true };
  }

  const rows: SemanticVectorRowV1[] = [];
  const ids = state.completed_asset_ids;
  for (let offset = 0; offset < ids.length; offset += 8) {
    const chunk = ids.slice(offset, offset + 8);
    const values = await Promise.all(
      chunk.map(async (assetId) => {
        const artifact =
          await readDurableAssetJson<AssetSemanticEmbeddingVectorArtifactV1>(
            vectorReference(assetId),
          );
        if (
          !artifact ||
          artifact.schema_version !== ASSET_SEMANTIC_EMBEDDING_VECTOR_SCHEMA_VERSION ||
          artifact.model !== state.model ||
          !Array.isArray(artifact.vector)
        ) {
          return null;
        }
        return {
          asset_id: artifact.asset_id,
          vector: artifact.vector,
          model: artifact.model,
          source_text_hash: artifact.source_text_hash,
        } satisfies SemanticVectorRowV1;
      }),
    );
    rows.push(
      ...values.filter(
        (value): value is SemanticVectorRowV1 => Boolean(value),
      ),
    );
  }

  vectorCache = {
    state_updated_at: state.updated_at,
    rows,
  };
  return { rows, cache_hit: false };
}

export async function runSemanticAssetSearchComparison(
  raw: Record<string, unknown>,
) {
  const started = performance.now();
  const mode = modeFromRaw(raw);
  const requirement = requirementFromRaw(raw);
  const numericLimit = Number(raw.limit);
  const limit = Number.isFinite(numericLimit)
    ? Math.max(1, Math.min(20, Math.round(numericLimit)))
    : 8;

  const pilot = await ensurePilotState(mode);
  const state = pilot.state;
  if (!state.completed_asset_ids.length) {
    throw new Error(
      "Semantic embedding pilot has no completed vectors yet. Prepare and index at least one pilot batch first.",
    );
  }

  const lexicalStarted = performance.now();
  const lexicalFull = await runLexicalAssetSearchBench({
    requirements: [requirement],
    asset_collection_mode: mode,
    limit,
  });
  const lexicalDurationMs = performance.now() - lexicalStarted;

  const selectedIds = new Set(state.selected_asset_ids);
  const pilotDocuments = pilot.prepared.documents.filter((document) =>
    selectedIds.has(document.asset_id),
  );
  const pilotIndex = buildAssetLexicalSearchIndexV1(pilotDocuments);
  const pilotLexical = searchAssetLexicalIndexV1(
    pilotIndex,
    requirement,
    Math.min(32, pilotDocuments.length),
  );

  const vectorLoadStarted = performance.now();
  const loaded = await loadVectorRows(state);
  const vectorLoadDurationMs = performance.now() - vectorLoadStarted;

  const queryText = buildSemanticRetrievalQueryV1(requirement);
  const queryEmbedStarted = performance.now();
  const queryEmbedding = await embedSemanticSearchQuery(queryText);
  const queryEmbeddingDurationMs = performance.now() - queryEmbedStarted;

  if (
    loaded.rows.length &&
    loaded.rows.some((row) => row.vector.length !== queryEmbedding.vector.length)
  ) {
    throw new Error(
      "Semantic query vector dimensions do not match one or more indexed pilot vectors.",
    );
  }

  const vectorRankStarted = performance.now();
  const vectorResults = rankSemanticVectorRows(
    pilotDocuments,
    loaded.rows,
    queryEmbedding.vector,
    Math.min(32, pilotDocuments.length),
  );
  const vectorRankDurationMs = performance.now() - vectorRankStarted;
  const hybridResults = fuseLexicalAndSemanticPilotResults(
    pilotDocuments,
    pilotLexical,
    vectorResults,
    limit,
  );

  return {
    schema_version: "myway_semantic_asset_search_comparison_v1" as const,
    requirement,
    model: queryEmbedding.model,
    pilot: {
      target_count: state.target_count,
      completed_count: state.completed_asset_ids.length,
      vector_count: loaded.rows.length,
      vector_cache_hit: loaded.cache_hit,
      complete: progress(state).complete,
      selection_version: state.selection_version,
    },
    provider_calls: 1,
    embedding_calls: 1,
    lexical_full: lexicalFull,
    vector_pilot: vectorResults.slice(0, limit),
    hybrid_pilot: hybridResults,
    metrics: {
      lexical_full_duration_ms: Number(lexicalDurationMs.toFixed(2)),
      vector_load_duration_ms: Number(vectorLoadDurationMs.toFixed(2)),
      query_embedding_duration_ms: Number(queryEmbeddingDurationMs.toFixed(2)),
      vector_ranking_duration_ms: Number(vectorRankDurationMs.toFixed(2)),
      total_duration_ms: Number((performance.now() - started).toFixed(2)),
    },
    authority_note:
      "Semantic vectors are candidate-generation evidence only. The 96-asset pilot never authors or executes asset ids; MyWay retains review, ambiguity, grouping, geometry, and runtime authority.",
  };
}
