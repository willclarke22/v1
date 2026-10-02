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
} from "./asset-lexical-search";
import { compileSearchQueryPacketV2 } from "./asset-search-query-v2";
import {
  buildAssetSearchDocumentV2,
  buildAssetSearchDocumentV2Views,
  type AssetSearchDocumentV2,
} from "./asset-search-document-v2";
import {
  fuseCandidateChannelsRrfV2,
  lexicalChannelForFusionV2,
  rankGraphAnchorEvidenceV2,
  rankSemanticChannelV2,
  semanticPassagesForDocumentV2,
  ASSET_SEMANTIC_PILOT_V2_PROVIDER_BATCH_SIZE,
  ASSET_SEMANTIC_PILOT_V2_SELECTION_VERSION,
  ASSET_SEMANTIC_PILOT_V2_TARGET_COUNT,
  type SemanticDocumentViewV2,
  type SemanticVectorRowV2,
} from "./asset-semantic-search-v2";
import {
  selectSemanticEmbeddingPilotDocuments,
} from "./asset-semantic-search";
import {
  getPreparedAssetSearchCorpus,
  runLexicalAssetSearchBench,
  type AssetSearchBenchCollectionMode,
} from "./asset-search-bench.server";
import type { AssetSearchDocumentV1 } from "./asset-search-document";

export const ASSET_SEMANTIC_EMBEDDING_PILOT_V2_SCHEMA_VERSION =
  "myway_asset_semantic_embedding_pilot_v2" as const;
export const ASSET_SEMANTIC_EMBEDDING_VECTOR_V2_SCHEMA_VERSION =
  "myway_asset_semantic_retrieval_embedding_v2" as const;

const PILOT_V2_STATE_REFERENCE =
  "sandbox/probe-lab/assets/embeddings/semantic-search-v2/bodyparts3d-pilot-state.json";
const VECTOR_V2_REFERENCE_PREFIX =
  "sandbox/probe-lab/assets/embeddings/semantic-search-v2/vectors/";
const DEFAULT_EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
const MAX_PROVIDER_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;

export type SemanticPilotVectorKeyV2 = `${string}::${SemanticDocumentViewV2}`;

type PilotFailureV2 = {
  at: string;
  vector_keys: string[];
  message: string;
  retryable: boolean;
};

export type AssetSemanticEmbeddingPilotStateV2 = {
  schema_version: typeof ASSET_SEMANTIC_EMBEDDING_PILOT_V2_SCHEMA_VERSION;
  selection_version: typeof ASSET_SEMANTIC_PILOT_V2_SELECTION_VERSION;
  asset_collection_mode: AssetSearchBenchCollectionMode;
  target_asset_count: number;
  target_vector_count: number;
  provider_batch_size: number;
  model: string;
  registry_snapshot_id: string;
  selection_hash: string;
  selected_asset_ids: string[];
  selected_vector_keys: SemanticPilotVectorKeyV2[];
  completed_vector_keys: SemanticPilotVectorKeyV2[];
  reused_vector_keys: SemanticPilotVectorKeyV2[];
  provider_request_count: number;
  generated_vector_count: number;
  created_at: string;
  updated_at: string;
  last_error: PilotFailureV2 | null;
};

export type AssetSemanticEmbeddingVectorArtifactV2 = {
  schema_version: typeof ASSET_SEMANTIC_EMBEDDING_VECTOR_V2_SCHEMA_VERSION;
  asset_id: string;
  collection_member_id: string | null;
  document_view: SemanticDocumentViewV2;
  model: string;
  dimensions: number;
  search_document_schema_version: string;
  source_document_schema_version: string;
  source_text_hash: string;
  source_text: string;
  provenance_hash: string;
  vector: number[];
  created_at: string;
};

type PassageSpecV2 = {
  key: SemanticPilotVectorKeyV2;
  asset_id: string;
  view: SemanticDocumentViewV2;
  text: string;
  source_text_hash: string;
  provenance_hash: string;
};

let vectorCacheV2:
  | {
      state_updated_at: string;
      rows: SemanticVectorRowV2[];
    }
  | null = null;

export const ASSET_SEMANTIC_SERVING_SNAPSHOT_V2_SCHEMA_VERSION =
  "myway_asset_semantic_serving_snapshot_v2" as const;

type SemanticSearchServingSnapshotV2 = {
  schema_version: typeof ASSET_SEMANTIC_SERVING_SNAPSHOT_V2_SCHEMA_VERSION;
  asset_collection_mode: AssetSearchBenchCollectionMode;
  state_updated_at: string;
  registry_snapshot_id: string;
  selection_hash: string;
  model: string;
  source_documents: AssetSearchDocumentV1[];
  documents: AssetSearchDocumentV2[];
  lexical_index: ReturnType<typeof buildAssetLexicalSearchIndexV1>;
  vector_rows: SemanticVectorRowV2[];
  published_at: string;
};

let servingSnapshotV2: SemanticSearchServingSnapshotV2 | null = null;

function roundedMs(value: number) {
  return Number(value.toFixed(2));
}

async function timed<T>(run: () => Promise<T>) {
  const started = performance.now();
  const value = await run();
  return { value, duration_ms: roundedMs(performance.now() - started) };
}

function configuredEmbeddingModel() {
  return process.env.MYWAY_ASSET_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
}

function vectorKey(assetId: string, view: SemanticDocumentViewV2) {
  return `${assetId}::${view}` as SemanticPilotVectorKeyV2;
}

function parseVectorKey(key: SemanticPilotVectorKeyV2) {
  const separator = key.lastIndexOf("::");
  const assetId = separator >= 0 ? key.slice(0, separator) : key;
  const view = (separator >= 0 ? key.slice(separator + 2) : "identity") as SemanticDocumentViewV2;
  return { assetId, view };
}

function vectorReferenceV2(assetId: string, view: SemanticDocumentViewV2) {
  return `${VECTOR_V2_REFERENCE_PREFIX}${encodeURIComponent(assetId)}--${view}.json`;
}

function retryableProviderError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  return /(429|408|500|502|503|504|rate limit|timeout|timed out|aborted|fetch failed|network)/i.test(
    message,
  );
}

function modeFromRaw(raw: Record<string, unknown>): AssetSearchBenchCollectionMode {
  return raw.asset_collection_mode === "bodyparts3d_slp_pilot"
    ? "bodyparts3d_slp_pilot"
    : "bodyparts3d_full_atlas";
}

function buildV2Selection(
  sourceDocuments: AssetSearchDocumentV1[],
  registrySnapshotId: string,
  mode: AssetSearchBenchCollectionMode,
) {
  const selectedSource = selectSemanticEmbeddingPilotDocuments(
    sourceDocuments,
    ASSET_SEMANTIC_PILOT_V2_TARGET_COUNT,
  );
  const documents = selectedSource.map(buildAssetSearchDocumentV2);
  const passages: PassageSpecV2[] = [];
  for (const document of documents) {
    const views = buildAssetSearchDocumentV2Views(document);
    for (const view of views) {
      passages.push({
        key: vectorKey(document.asset_id, view.view),
        asset_id: document.asset_id,
        view: view.view,
        text: view.text,
        source_text_hash: stableTextHash(view.text),
        provenance_hash: stableJsonHash(view.provenance),
      });
    }
  }
  const model = configuredEmbeddingModel();
  const selectionHash = stableJsonHash({
    selection_version: ASSET_SEMANTIC_PILOT_V2_SELECTION_VERSION,
    mode,
    model,
    registry_snapshot_id: registrySnapshotId,
    assets: documents.map((document) => document.asset_id),
    passages: passages.map((passage) => ({
      key: passage.key,
      source_text_hash: passage.source_text_hash,
      provenance_hash: passage.provenance_hash,
    })),
  });
  return { selectedSource, documents, passages, model, selectionHash };
}

function compatibleStateV2(
  state: AssetSemanticEmbeddingPilotStateV2 | null,
  input: {
    mode: AssetSearchBenchCollectionMode;
    model: string;
    registry_snapshot_id: string;
    selection_hash: string;
  },
) {
  return Boolean(
    state &&
      state.schema_version === ASSET_SEMANTIC_EMBEDDING_PILOT_V2_SCHEMA_VERSION &&
      state.selection_version === ASSET_SEMANTIC_PILOT_V2_SELECTION_VERSION &&
      state.asset_collection_mode === input.mode &&
      state.model === input.model &&
      state.registry_snapshot_id === input.registry_snapshot_id &&
      state.selection_hash === input.selection_hash,
  );
}

async function writeStateV2(state: AssetSemanticEmbeddingPilotStateV2) {
  state.updated_at = new Date().toISOString();
  await writeDurableAssetJson(PILOT_V2_STATE_REFERENCE, state);
  vectorCacheV2 = null;
  servingSnapshotV2 = null;
  return state;
}

async function readStateV2() {
  return readDurableAssetJson<AssetSemanticEmbeddingPilotStateV2>(
    PILOT_V2_STATE_REFERENCE,
  );
}

function progressV2(state: AssetSemanticEmbeddingPilotStateV2) {
  const completed = new Set(state.completed_vector_keys);
  const completeAssets = state.selected_asset_ids.filter((assetId) => {
    const required = state.selected_vector_keys.filter((key) =>
      key.startsWith(`${assetId}::`),
    );
    return required.length > 0 && required.every((key) => completed.has(key));
  }).length;
  const remainingVectors = state.selected_vector_keys.filter(
    (key) => !completed.has(key),
  ).length;
  return {
    target_asset_count: state.target_asset_count,
    completed_asset_count: completeAssets,
    target_vector_count: state.target_vector_count,
    completed_vector_count: state.completed_vector_keys.length,
    reused_vector_count: state.reused_vector_keys.length,
    generated_vector_count: state.generated_vector_count,
    remaining_vector_count: remainingVectors,
    complete: remainingVectors === 0,
    percent: state.target_vector_count
      ? Number(
          ((state.completed_vector_keys.length / state.target_vector_count) * 100).toFixed(1),
        )
      : 0,
  };
}

export async function prepareSemanticEmbeddingPilotV2(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
) {
  const prepared = await getPreparedAssetSearchCorpus(mode);
  const selection = buildV2Selection(
    prepared.documents,
    prepared.registry_snapshot_id,
    mode,
  );
  const existing = await readStateV2();
  if (
    compatibleStateV2(existing, {
      mode,
      model: selection.model,
      registry_snapshot_id: prepared.registry_snapshot_id,
      selection_hash: selection.selectionHash,
    })
  ) {
    return {
      state: existing!,
      progress: progressV2(existing!),
      prepared_cache_hit: prepared.cache_hit,
      status: "resume" as const,
    };
  }

  const now = new Date().toISOString();
  const state: AssetSemanticEmbeddingPilotStateV2 = {
    schema_version: ASSET_SEMANTIC_EMBEDDING_PILOT_V2_SCHEMA_VERSION,
    selection_version: ASSET_SEMANTIC_PILOT_V2_SELECTION_VERSION,
    asset_collection_mode: mode,
    target_asset_count: selection.documents.length,
    target_vector_count: selection.passages.length,
    provider_batch_size: ASSET_SEMANTIC_PILOT_V2_PROVIDER_BATCH_SIZE,
    model: selection.model,
    registry_snapshot_id: prepared.registry_snapshot_id,
    selection_hash: selection.selectionHash,
    selected_asset_ids: selection.documents.map((document) => document.asset_id),
    selected_vector_keys: selection.passages.map((passage) => passage.key),
    completed_vector_keys: [],
    reused_vector_keys: [],
    provider_request_count: 0,
    generated_vector_count: 0,
    created_at: now,
    updated_at: now,
    last_error: null,
  };
  await writeStateV2(state);
  return {
    state,
    progress: progressV2(state),
    prepared_cache_hit: prepared.cache_hit,
    status: "prepared" as const,
  };
}

async function ensurePilotStateV2(mode: AssetSearchBenchCollectionMode) {
  const prepared = await getPreparedAssetSearchCorpus(mode);
  const selection = buildV2Selection(
    prepared.documents,
    prepared.registry_snapshot_id,
    mode,
  );
  const current = await readStateV2();
  if (
    compatibleStateV2(current, {
      mode,
      model: selection.model,
      registry_snapshot_id: prepared.registry_snapshot_id,
      selection_hash: selection.selectionHash,
    })
  ) {
    return { prepared, state: current!, selection };
  }
  const now = new Date().toISOString();
  const state: AssetSemanticEmbeddingPilotStateV2 = {
    schema_version: ASSET_SEMANTIC_EMBEDDING_PILOT_V2_SCHEMA_VERSION,
    selection_version: ASSET_SEMANTIC_PILOT_V2_SELECTION_VERSION,
    asset_collection_mode: mode,
    target_asset_count: selection.documents.length,
    target_vector_count: selection.passages.length,
    provider_batch_size: ASSET_SEMANTIC_PILOT_V2_PROVIDER_BATCH_SIZE,
    model: selection.model,
    registry_snapshot_id: prepared.registry_snapshot_id,
    selection_hash: selection.selectionHash,
    selected_asset_ids: selection.documents.map((document) => document.asset_id),
    selected_vector_keys: selection.passages.map((passage) => passage.key),
    completed_vector_keys: [],
    reused_vector_keys: [],
    provider_request_count: 0,
    generated_vector_count: 0,
    created_at: now,
    updated_at: now,
    last_error: null,
  };
  await writeStateV2(state);
  return { prepared, state, selection };
}

async function reusableArtifactV2(
  passage: PassageSpecV2,
  document: AssetSearchDocumentV2,
  model: string,
) {
  const existing =
    await readDurableAssetJson<AssetSemanticEmbeddingVectorArtifactV2>(
      vectorReferenceV2(passage.asset_id, passage.view),
    );
  if (
    existing &&
    existing.schema_version === ASSET_SEMANTIC_EMBEDDING_VECTOR_V2_SCHEMA_VERSION &&
    existing.asset_id === passage.asset_id &&
    existing.document_view === passage.view &&
    existing.model === model &&
    existing.source_text_hash === passage.source_text_hash &&
    existing.provenance_hash === passage.provenance_hash &&
    existing.search_document_schema_version === document.schema_version &&
    Array.isArray(existing.vector) &&
    existing.vector.length > 0 &&
    existing.vector.every(Number.isFinite)
  ) {
    return existing;
  }
  return null;
}

async function embedWithRetryV2(texts: string[]) {
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

export async function runSemanticEmbeddingPilotStepV2(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
) {
  const { state, selection } = await ensurePilotStateV2(mode);
  const completed = new Set(state.completed_vector_keys);
  const pendingKeys = state.selected_vector_keys
    .filter((key) => !completed.has(key))
    .slice(0, ASSET_SEMANTIC_PILOT_V2_PROVIDER_BATCH_SIZE);

  if (!pendingKeys.length) {
    return {
      ok: true as const,
      state,
      progress: progressV2(state),
      provider_attempts: 0,
      provider_items: 0,
      reused_items: 0,
    };
  }

  const passageByKey = new Map(
    selection.passages.map((passage) => [passage.key, passage]),
  );
  const documentById = new Map(
    selection.documents.map((document) => [document.asset_id, document]),
  );
  const needed: PassageSpecV2[] = [];
  let reusedItems = 0;

  for (const key of pendingKeys) {
    const passage = passageByKey.get(key);
    if (!passage) continue;
    const document = documentById.get(passage.asset_id);
    if (!document) continue;
    const reusable = await reusableArtifactV2(passage, document, state.model);
    if (reusable) {
      reusedItems += 1;
      if (!state.completed_vector_keys.includes(key)) {
        state.completed_vector_keys.push(key);
      }
      if (!state.reused_vector_keys.includes(key)) {
        state.reused_vector_keys.push(key);
      }
      state.last_error = null;
      await writeStateV2(state);
    } else {
      needed.push(passage);
    }
  }

  let providerAttempts = 0;
  if (needed.length) {
    try {
      const embedded = await embedWithRetryV2(
        needed.map((passage) => passage.text),
      );
      providerAttempts = embedded.attempts;
      state.provider_request_count += embedded.attempts;
      if (embedded.result.vectors.length !== needed.length) {
        throw new Error(
          "Semantic V2 embedding batch size did not match requested passages.",
        );
      }
      for (let index = 0; index < needed.length; index += 1) {
        const passage = needed[index]!;
        const document = documentById.get(passage.asset_id)!;
        const vector = embedded.result.vectors[index]!;
        const artifact: AssetSemanticEmbeddingVectorArtifactV2 = {
          schema_version: ASSET_SEMANTIC_EMBEDDING_VECTOR_V2_SCHEMA_VERSION,
          asset_id: passage.asset_id,
          collection_member_id: document.collection_member_id,
          document_view: passage.view,
          model: embedded.result.model,
          dimensions: vector.length,
          search_document_schema_version: document.schema_version,
          source_document_schema_version: document.source_document_schema_version,
          source_text_hash: passage.source_text_hash,
          source_text: passage.text,
          provenance_hash: passage.provenance_hash,
          vector,
          created_at: new Date().toISOString(),
        };
        await writeDurableAssetJson(
          vectorReferenceV2(passage.asset_id, passage.view),
          artifact,
        );
        if (!state.completed_vector_keys.includes(passage.key)) {
          state.completed_vector_keys.push(passage.key);
        }
        state.generated_vector_count += 1;
        state.last_error = null;
        await writeStateV2(state);
      }
    } catch (caught) {
      const attempts = Number(
        (caught as { provider_attempts?: number }).provider_attempts ??
          providerAttempts,
      );
      state.provider_request_count += Math.max(0, attempts - providerAttempts);
      state.last_error = {
        at: new Date().toISOString(),
        vector_keys: needed.map((passage) => passage.key),
        message: caught instanceof Error ? caught.message : String(caught),
        retryable: retryableProviderError(caught),
      };
      await writeStateV2(state);
      return {
        ok: false as const,
        state,
        progress: progressV2(state),
        provider_attempts: attempts,
        provider_items: needed.length,
        reused_items: reusedItems,
        error: state.last_error,
      };
    }
  }

  return {
    ok: true as const,
    state,
    progress: progressV2(state),
    provider_attempts: providerAttempts,
    provider_items: needed.length,
    reused_items: reusedItems,
  };
}

export async function runSemanticEmbeddingPilotWindowV2(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
  maxBatches = 6,
) {
  const batches = Math.max(1, Math.min(12, Math.round(maxBatches)));
  const steps = [];
  for (let batch = 0; batch < batches; batch += 1) {
    const step = await runSemanticEmbeddingPilotStepV2(mode);
    steps.push(step);
    if (!step.ok || step.progress.complete) break;
    await sleep(500);
  }
  const state = steps.at(-1)?.state ?? (await ensurePilotStateV2(mode)).state;
  return {
    ok: steps.every((step) => step.ok),
    state,
    progress: progressV2(state),
    steps,
  };
}

export async function getSemanticEmbeddingPilotStatusV2(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
) {
  const state = await readStateV2();
  if (!state || state.asset_collection_mode !== mode) {
    return { state: null, progress: null };
  }
  return { state, progress: progressV2(state) };
}

export async function resetSemanticEmbeddingPilotV2() {
  await deleteDurableAssetJson(PILOT_V2_STATE_REFERENCE);
  vectorCacheV2 = null;
  servingSnapshotV2 = null;
  return { ok: true as const };
}

async function loadVectorRowsV2(state: AssetSemanticEmbeddingPilotStateV2) {
  if (vectorCacheV2?.state_updated_at === state.updated_at) {
    return { rows: vectorCacheV2.rows, cache_hit: true };
  }
  const rows: SemanticVectorRowV2[] = [];
  for (let offset = 0; offset < state.completed_vector_keys.length; offset += 8) {
    const keys = state.completed_vector_keys.slice(offset, offset + 8);
    const values = await Promise.all(
      keys.map(async (key) => {
        const parsed = parseVectorKey(key);
        const artifact =
          await readDurableAssetJson<AssetSemanticEmbeddingVectorArtifactV2>(
            vectorReferenceV2(parsed.assetId, parsed.view),
          );
        if (
          !artifact ||
          artifact.schema_version !== ASSET_SEMANTIC_EMBEDDING_VECTOR_V2_SCHEMA_VERSION ||
          artifact.model !== state.model ||
          !Array.isArray(artifact.vector)
        ) {
          return null;
        }
        return {
          asset_id: artifact.asset_id,
          view: artifact.document_view,
          vector: artifact.vector,
          model: artifact.model,
          source_text_hash: artifact.source_text_hash,
        } satisfies SemanticVectorRowV2;
      }),
    );
    for (const value of values) {
      if (value) rows.push(value);
    }
  }
  vectorCacheV2 = {
    state_updated_at: state.updated_at,
    rows,
  };
  return { rows, cache_hit: false };
}

export async function publishSemanticSearchServingSnapshotV2(
  mode: AssetSearchBenchCollectionMode = "bodyparts3d_full_atlas",
) {
  const totalStarted = performance.now();
  const prepareTimed = await timed(() => ensurePilotStateV2(mode));
  const pilot = prepareTimed.value;
  const state = pilot.state;
  const progress = progressV2(state);
  if (!progress.complete) {
    throw new Error(
      `Semantic V2 serving snapshot requires a complete pilot. ${progress.completed_vector_count}/${progress.target_vector_count} vectors are complete.`,
    );
  }

  const selectedIds = new Set(state.selected_asset_ids);
  const documentStarted = performance.now();
  const sourceDocuments = pilot.prepared.documents.filter((document) =>
    selectedIds.has(document.asset_id),
  );
  const documents = sourceDocuments.map(buildAssetSearchDocumentV2);
  const documentBuildDurationMs = roundedMs(performance.now() - documentStarted);

  const lexicalStarted = performance.now();
  const lexicalIndex = buildAssetLexicalSearchIndexV1(sourceDocuments);
  const lexicalIndexDurationMs = roundedMs(performance.now() - lexicalStarted);

  const vectorTimed = await timed(() => loadVectorRowsV2(state));
  if (vectorTimed.value.rows.length !== state.target_vector_count) {
    throw new Error(
      `Semantic V2 serving snapshot loaded ${vectorTimed.value.rows.length}/${state.target_vector_count} vectors. Refusing to publish a partial snapshot.`,
    );
  }

  const publishedAt = new Date().toISOString();
  servingSnapshotV2 = {
    schema_version: ASSET_SEMANTIC_SERVING_SNAPSHOT_V2_SCHEMA_VERSION,
    asset_collection_mode: mode,
    state_updated_at: state.updated_at,
    registry_snapshot_id: state.registry_snapshot_id,
    selection_hash: state.selection_hash,
    model: state.model,
    source_documents: sourceDocuments,
    documents,
    lexical_index: lexicalIndex,
    vector_rows: vectorTimed.value.rows,
    published_at: publishedAt,
  };

  return {
    ok: true as const,
    snapshot: semanticSearchServingSnapshotStatusV2(),
    metrics: {
      pilot_state_and_prepare_duration_ms: prepareTimed.duration_ms,
      search_document_build_duration_ms: documentBuildDurationMs,
      lexical_index_build_duration_ms: lexicalIndexDurationMs,
      vector_load_duration_ms: vectorTimed.duration_ms,
      vector_cache_hit: vectorTimed.value.cache_hit,
      publish_total_duration_ms: roundedMs(performance.now() - totalStarted),
    },
    authority_note:
      "Publishing prepares an in-memory query-serving snapshot only. It does not change search ranking, reranker authority, or asset execution authority.",
  };
}

export function semanticSearchServingSnapshotStatusV2() {
  if (!servingSnapshotV2) {
    return {
      schema_version: ASSET_SEMANTIC_SERVING_SNAPSHOT_V2_SCHEMA_VERSION,
      ready: false as const,
      asset_collection_mode: null,
      asset_count: 0,
      vector_count: 0,
      published_at: null,
    };
  }
  return {
    schema_version: servingSnapshotV2.schema_version,
    ready: true as const,
    asset_collection_mode: servingSnapshotV2.asset_collection_mode,
    asset_count: servingSnapshotV2.documents.length,
    vector_count: servingSnapshotV2.vector_rows.length,
    model: servingSnapshotV2.model,
    registry_snapshot_id: servingSnapshotV2.registry_snapshot_id,
    selection_hash: servingSnapshotV2.selection_hash,
    state_updated_at: servingSnapshotV2.state_updated_at,
    published_at: servingSnapshotV2.published_at,
  };
}

export function clearSemanticSearchServingSnapshotV2() {
  servingSnapshotV2 = null;
  return {
    ok: true as const,
    snapshot: semanticSearchServingSnapshotStatusV2(),
  };
}

export function getSemanticSearchServingDocumentsV2(assetIds: string[]) {
  if (!servingSnapshotV2) {
    throw new Error(
      "Semantic V2 serving snapshot is not ready. Publish it before requesting serving documents.",
    );
  }
  const wanted = new Set(assetIds);
  return servingSnapshotV2.documents.filter((document) =>
    wanted.has(document.asset_id),
  );
}

export function getSemanticSearchServingCorpusV2() {
  if (!servingSnapshotV2) {
    throw new Error(
      "Semantic V2 serving snapshot is not ready. Publish it before requesting serving corpus evidence.",
    );
  }
  return {
    asset_collection_mode: servingSnapshotV2.asset_collection_mode,
    registry_snapshot_id: servingSnapshotV2.registry_snapshot_id,
    selection_hash: servingSnapshotV2.selection_hash,
    published_at: servingSnapshotV2.published_at,
    source_documents: servingSnapshotV2.source_documents,
    documents: servingSnapshotV2.documents,
  };
}

export async function runSemanticAssetSearchServingV2(
  raw: Record<string, unknown>,
) {
  const totalStarted = performance.now();
  const snapshotLookupStarted = performance.now();
  const mode = modeFromRaw(raw);
  const snapshot = servingSnapshotV2;
  const snapshotLookupDurationMs = roundedMs(
    performance.now() - snapshotLookupStarted,
  );
  if (!snapshot || snapshot.asset_collection_mode !== mode) {
    throw new Error(
      "Semantic V2 serving snapshot is not ready for this collection. Publish the query-ready snapshot before running the serving/reranker path.",
    );
  }

  const compileStarted = performance.now();
  const packet = compileSearchQueryPacketV2(raw);
  const numericLimit = Number(raw.limit);
  const limit = Number.isFinite(numericLimit)
    ? Math.max(1, Math.min(20, Math.round(numericLimit)))
    : 20;
  const queryCompileDurationMs = roundedMs(performance.now() - compileStarted);

  const lexicalStarted = performance.now();
  const pilotLexical = searchAssetLexicalIndexV1(
    snapshot.lexical_index,
    packet.lexical_requirement,
    20,
  );
  const pilotLexicalDurationMs = roundedMs(performance.now() - lexicalStarted);

  const queryEmbeddingWallStarted = performance.now();
  const [identityEmbedding, fullEmbedding, relationshipEmbedding] =
    await Promise.all([
      timed(() => embedSemanticSearchQuery(packet.views.identity_hint)),
      timed(() => embedSemanticSearchQuery(packet.views.full_intent)),
      timed(() => embedSemanticSearchQuery(packet.views.relationship_role)),
    ]);
  const queryEmbeddingWallDurationMs = roundedMs(
    performance.now() - queryEmbeddingWallStarted,
  );

  const expectedDimensions = identityEmbedding.value.vector.length;
  if (
    snapshot.vector_rows.some((row) => row.vector.length !== expectedDimensions) ||
    fullEmbedding.value.vector.length !== expectedDimensions ||
    relationshipEmbedding.value.vector.length !== expectedDimensions
  ) {
    throw new Error(
      "Semantic V2 serving query vector dimensions do not match the published snapshot.",
    );
  }

  const vectorRankStarted = performance.now();
  const identityResults = rankSemanticChannelV2(
    snapshot.documents,
    snapshot.vector_rows,
    identityEmbedding.value.vector,
    "identity_hint",
    ["identity"],
    20,
  );
  const fullIntentResults = rankSemanticChannelV2(
    snapshot.documents,
    snapshot.vector_rows,
    fullEmbedding.value.vector,
    "full_intent",
    ["identity", "relationship", "role"],
    20,
  );
  const relationshipResults = rankSemanticChannelV2(
    snapshot.documents,
    snapshot.vector_rows,
    relationshipEmbedding.value.vector,
    "relationship_role",
    ["relationship", "role"],
    20,
  );
  const vectorRankingDurationMs = roundedMs(
    performance.now() - vectorRankStarted,
  );

  const graphStarted = performance.now();
  const graphResults = rankGraphAnchorEvidenceV2(
    snapshot.documents,
    packet,
    20,
  );
  const graphRankingDurationMs = roundedMs(performance.now() - graphStarted);

  const fusionStarted = performance.now();
  const fusedPool = fuseCandidateChannelsRrfV2(
    snapshot.documents,
    [
      { name: "lexical", results: lexicalChannelForFusionV2(pilotLexical) },
      { name: "identity_vector", results: identityResults },
      { name: "full_intent_vector", results: fullIntentResults },
      { name: "relationship_vector", results: relationshipResults },
      { name: "graph_anchor", results: graphResults },
    ],
    80,
  );
  const candidateFusionDurationMs = roundedMs(performance.now() - fusionStarted);
  const totalBeforeReturn = roundedMs(performance.now() - totalStarted);
  const accounted = roundedMs(
    snapshotLookupDurationMs +
      queryCompileDurationMs +
      pilotLexicalDurationMs +
      queryEmbeddingWallDurationMs +
      vectorRankingDurationMs +
      graphRankingDurationMs +
      candidateFusionDurationMs,
  );

  return {
    schema_version: "myway_semantic_asset_search_serving_v2" as const,
    query_packet: packet,
    model: identityEmbedding.value.model,
    snapshot: semanticSearchServingSnapshotStatusV2(),
    provider_calls: 3,
    embedding_calls: 3,
    candidate_channels: {
      lexical_pilot: pilotLexical,
      identity_vector: identityResults,
      full_intent_vector: fullIntentResults,
      relationship_vector: relationshipResults,
      graph_anchor: graphResults,
    },
    candidate_union: fusedPool.slice(0, limit),
    candidate_pool_size: fusedPool.length,
    metrics: {
      snapshot_lookup_duration_ms: snapshotLookupDurationMs,
      query_compile_duration_ms: queryCompileDurationMs,
      pilot_lexical_duration_ms: pilotLexicalDurationMs,
      query_embedding_wall_duration_ms: queryEmbeddingWallDurationMs,
      query_embedding_identity_duration_ms: identityEmbedding.duration_ms,
      query_embedding_full_intent_duration_ms: fullEmbedding.duration_ms,
      query_embedding_relationship_duration_ms: relationshipEmbedding.duration_ms,
      vector_ranking_duration_ms: vectorRankingDurationMs,
      graph_ranking_duration_ms: graphRankingDurationMs,
      candidate_fusion_duration_ms: candidateFusionDurationMs,
      accounted_phase_duration_ms: accounted,
      serving_total_duration_ms: totalBeforeReturn,
      unaccounted_duration_ms: roundedMs(
        Math.max(0, totalBeforeReturn - accounted),
      ),
    },
    authority_note:
      "Published-snapshot V2 retrieval is candidate-generation evidence only. The query path performs no corpus rebuild and grants no execution authority.",
  };
}

export async function runSemanticAssetSearchComparisonV2(
  raw: Record<string, unknown>,
) {
  const totalStarted = performance.now();
  const compileStarted = performance.now();
  const mode = modeFromRaw(raw);
  const packet = compileSearchQueryPacketV2(raw);
  const numericLimit = Number(raw.limit);
  const limit = Number.isFinite(numericLimit)
    ? Math.max(1, Math.min(20, Math.round(numericLimit)))
    : 12;
  const queryCompileDurationMs = roundedMs(performance.now() - compileStarted);

  const pilotTimed = await timed(() => ensurePilotStateV2(mode));
  const pilot = pilotTimed.value;
  const state = pilot.state;
  if (!state.completed_vector_keys.length) {
    throw new Error(
      "Semantic embedding pilot V2 has no completed vectors yet. Prepare and index at least one V2 pilot batch first.",
    );
  }

  const documentBuildStarted = performance.now();
  const selectedIds = new Set(state.selected_asset_ids);
  const pilotSourceDocuments = pilot.prepared.documents.filter((document) =>
    selectedIds.has(document.asset_id),
  );
  const pilotDocuments = pilotSourceDocuments.map(buildAssetSearchDocumentV2);
  const pilotDocumentBuildDurationMs = roundedMs(
    performance.now() - documentBuildStarted,
  );

  const lexicalFullTimed = await timed(() =>
    runLexicalAssetSearchBench({
      requirements: [packet.lexical_requirement],
      asset_collection_mode: mode,
      limit: 20,
    }),
  );

  const pilotLexicalStarted = performance.now();
  const pilotIndex = buildAssetLexicalSearchIndexV1(pilotSourceDocuments);
  const pilotLexical = searchAssetLexicalIndexV1(
    pilotIndex,
    packet.lexical_requirement,
    20,
  );
  const pilotLexicalDurationMs = roundedMs(
    performance.now() - pilotLexicalStarted,
  );

  const vectorLoadTimed = await timed(() => loadVectorRowsV2(state));
  const loaded = vectorLoadTimed.value;

  const queryEmbeddingWallStarted = performance.now();
  const [identityEmbedding, fullEmbedding, relationshipEmbedding] =
    await Promise.all([
      timed(() => embedSemanticSearchQuery(packet.views.identity_hint)),
      timed(() => embedSemanticSearchQuery(packet.views.full_intent)),
      timed(() => embedSemanticSearchQuery(packet.views.relationship_role)),
    ]);
  const queryEmbeddingWallDurationMs = roundedMs(
    performance.now() - queryEmbeddingWallStarted,
  );

  const expectedDimensions = identityEmbedding.value.vector.length;
  if (
    loaded.rows.some((row) => row.vector.length !== expectedDimensions) ||
    fullEmbedding.value.vector.length !== expectedDimensions ||
    relationshipEmbedding.value.vector.length !== expectedDimensions
  ) {
    throw new Error(
      "Semantic V2 query vector dimensions do not match one or more indexed pilot vectors.",
    );
  }

  const vectorRankStarted = performance.now();
  const identityResults = rankSemanticChannelV2(
    pilotDocuments,
    loaded.rows,
    identityEmbedding.value.vector,
    "identity_hint",
    ["identity"],
    20,
  );
  const fullIntentResults = rankSemanticChannelV2(
    pilotDocuments,
    loaded.rows,
    fullEmbedding.value.vector,
    "full_intent",
    ["identity", "relationship", "role"],
    20,
  );
  const relationshipResults = rankSemanticChannelV2(
    pilotDocuments,
    loaded.rows,
    relationshipEmbedding.value.vector,
    "relationship_role",
    ["relationship", "role"],
    20,
  );
  const vectorRankingDurationMs = roundedMs(
    performance.now() - vectorRankStarted,
  );

  const graphStarted = performance.now();
  const graphResults = rankGraphAnchorEvidenceV2(
    pilotDocuments,
    packet,
    20,
  );
  const graphRankingDurationMs = roundedMs(performance.now() - graphStarted);

  const fusionStarted = performance.now();
  const fusedPool = fuseCandidateChannelsRrfV2(
    pilotDocuments,
    [
      {
        name: "lexical",
        results: lexicalChannelForFusionV2(pilotLexical),
      },
      {
        name: "identity_vector",
        results: identityResults,
      },
      {
        name: "full_intent_vector",
        results: fullIntentResults,
      },
      {
        name: "relationship_vector",
        results: relationshipResults,
      },
      {
        name: "graph_anchor",
        results: graphResults,
      },
    ],
    80,
  );
  const candidateFusionDurationMs = roundedMs(performance.now() - fusionStarted);

  const totalBeforeReturn = roundedMs(performance.now() - totalStarted);
  const accounted = roundedMs(
    queryCompileDurationMs +
      pilotTimed.duration_ms +
      pilotDocumentBuildDurationMs +
      lexicalFullTimed.duration_ms +
      pilotLexicalDurationMs +
      vectorLoadTimed.duration_ms +
      queryEmbeddingWallDurationMs +
      vectorRankingDurationMs +
      graphRankingDurationMs +
      candidateFusionDurationMs,
  );

  return {
    schema_version: "myway_semantic_asset_search_comparison_v2" as const,
    query_packet: packet,
    model: identityEmbedding.value.model,
    pilot: {
      target_asset_count: state.target_asset_count,
      completed_asset_count: progressV2(state).completed_asset_count,
      target_vector_count: state.target_vector_count,
      completed_vector_count: state.completed_vector_keys.length,
      loaded_vector_count: loaded.rows.length,
      vector_cache_hit: loaded.cache_hit,
      complete: progressV2(state).complete,
      selection_version: state.selection_version,
      search_document_schema_version: pilotDocuments[0]?.schema_version ?? null,
    },
    provider_calls: 3,
    embedding_calls: 3,
    lexical_full: lexicalFullTimed.value,
    candidate_channels: {
      lexical_pilot: pilotLexical,
      identity_vector: identityResults,
      full_intent_vector: fullIntentResults,
      relationship_vector: relationshipResults,
      graph_anchor: graphResults,
    },
    candidate_union: fusedPool.slice(0, limit),
    candidate_pool_size: fusedPool.length,
    metrics: {
      query_compile_duration_ms: queryCompileDurationMs,
      pilot_state_and_prepare_duration_ms: pilotTimed.duration_ms,
      pilot_document_build_duration_ms: pilotDocumentBuildDurationMs,
      lexical_full_duration_ms: lexicalFullTimed.duration_ms,
      pilot_lexical_duration_ms: pilotLexicalDurationMs,
      vector_load_duration_ms: vectorLoadTimed.duration_ms,
      query_embedding_wall_duration_ms: queryEmbeddingWallDurationMs,
      query_embedding_identity_duration_ms: identityEmbedding.duration_ms,
      query_embedding_full_intent_duration_ms: fullEmbedding.duration_ms,
      query_embedding_relationship_duration_ms: relationshipEmbedding.duration_ms,
      vector_ranking_duration_ms: vectorRankingDurationMs,
      graph_ranking_duration_ms: graphRankingDurationMs,
      candidate_fusion_duration_ms: candidateFusionDurationMs,
      accounted_phase_duration_ms: accounted,
      comparison_total_duration_ms: totalBeforeReturn,
      unaccounted_duration_ms: roundedMs(Math.max(0, totalBeforeReturn - accounted)),
    },
    authority_note:
      "V2 multi-view embeddings, graph evidence, and RRF are candidate-generation evidence only. They do not grant execution authority, hide ambiguity, or replace MyWay review/runtime grounding.",
  };
}
