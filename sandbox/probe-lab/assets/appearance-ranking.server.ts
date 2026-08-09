import type {
  MyWayAssetAppearanceRankingDiagnostics,
  MyWayAssetAppearanceRequestV1,
  MyWayAssetRecord,
} from "./asset-types";
import {
  canonicalAppearanceQueryText,
  hasAppearanceIntent,
  normalizeAppearanceRequest,
} from "./appearance-request";
import { stableTextHash } from "./content-hash.server";
import {
  embedAppearanceQuery,
} from "./enrichment/asset-enrichment-provider.server";
import { readDurableAssetJson } from "./storage/asset-durable-artifacts.server";

type StoredAppearanceVector = {
  asset_id: string;
  model: string;
  dimensions: number;
  vector: number[];
};

export type AssetAppearanceEvaluation = {
  asset_id: string;
  eligible: boolean;
  status:
    | "not_requested"
    | "ready"
    | "profile_only"
    | "missing"
    | "invalid"
    | "contradicted";
  similarity: number | null;
  similarity_bonus: number;
  required_trait_matches: string[];
  required_trait_unknown: string[];
  required_trait_conflicts: string[];
  preferred_trait_matches: string[];
  avoid_trait_matches: string[];
  trait_bonus: number;
  penalty: number;
  adjustment: number;
  summary: string | null;
};

export type AssetAppearanceRankingResult = {
  request: MyWayAssetAppearanceRequestV1 | undefined;
  evaluations: AssetAppearanceEvaluation[];
  diagnostics: MyWayAssetAppearanceRankingDiagnostics;
  warnings: string[];
};

const APPEARANCE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "with",
  "of",
  "for",
  "to",
  "in",
  "on",
  "style",
  "styled",
  "look",
  "looking",
  "appearance",
  "object",
  "asset",
]);

const APPEARANCE_TOKEN_EQUIVALENCE = [
  ["vintage", "antique", "retro", "traditional"],
  ["mechanical", "physical", "manual"],
  ["button", "key"],
  ["aged", "worn", "weathered", "distressed"],
  ["rectangular", "boxy"],
  ["transparent", "clear"],
  ["round", "circular"],
] as const;

function equivalentAppearanceToken(
  left: string,
  right: string,
) {
  return APPEARANCE_TOKEN_EQUIVALENCE.some(
    (group) =>
      group.includes(left as never) &&
      group.includes(right as never),
  );
}

const CONTRADICTION_GROUPS: Array<[string[], string[]]> = [
  [["transparent", "clear", "see through"], ["opaque", "solid"]],
  [["open", "opened"], ["closed", "sealed", "shut"]],
  [
    ["modern", "contemporary", "futuristic"],
    ["vintage", "antique", "retro", "old fashioned", "traditional"],
  ],
  [
    ["touchscreen", "touch screen"],
    ["mechanical keys", "physical keys", "mechanical buttons"],
  ],
  [["round", "circular"], ["rectangular", "square", "boxy"]],
  [["smooth"], ["rough", "textured", "weathered"]],
  [["new", "pristine"], ["worn", "aged", "weathered", "distressed"]],
];

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singular(value: string) {
  return value.endsWith("s") && value.length > 4
    ? value.slice(0, -1)
    : value;
}

function tokens(value: string) {
  return normalizePhrase(value)
    .split(" ")
    .map(singular)
    .filter(
      (token) =>
        token &&
        !APPEARANCE_STOP_WORDS.has(token),
    );
}

function textContainsPhrase(text: string, phrase: string) {
  const normalizedText = ` ${normalizePhrase(text)} `;
  const normalizedPhrase = normalizePhrase(phrase);
  return Boolean(
    normalizedPhrase &&
      normalizedText.includes(` ${normalizedPhrase} `),
  );
}

function traitMatchesText(trait: string, text: string) {
  const wanted = tokens(trait);
  if (!wanted.length) return false;
  const available = new Set(tokens(text));

  return wanted.every((token) => {
    if (available.has(token)) return true;
    return Array.from(available).some(
      (candidate) =>
        equivalentAppearanceToken(
          token,
          candidate,
        ) ||
        (candidate.length >= 4 &&
          token.length >= 4 &&
          (candidate.includes(token) ||
            token.includes(candidate))),
    );
  });
}

function traitContradiction(
  trait: string,
  appearanceText: string,
) {
  for (const [left, right] of CONTRADICTION_GROUPS) {
    const wantsLeft = left.some((phrase) =>
      textContainsPhrase(trait, phrase),
    );
    const wantsRight = right.some((phrase) =>
      textContainsPhrase(trait, phrase),
    );

    if (
      wantsLeft &&
      right.some((phrase) =>
        textContainsPhrase(appearanceText, phrase),
      )
    ) {
      return right.find((phrase) =>
        textContainsPhrase(appearanceText, phrase),
      ) ?? "opposing visible trait";
    }

    if (
      wantsRight &&
      left.some((phrase) =>
        textContainsPhrase(appearanceText, phrase),
      )
    ) {
      return left.find((phrase) =>
        textContainsPhrase(appearanceText, phrase),
      ) ?? "opposing visible trait";
    }
  }

  return null;
}

function appearanceCorpus(asset: MyWayAssetRecord) {
  const profile = asset.appearance_profile;
  if (!profile || profile.status !== "ready") return "";

  return [
    profile.summary,
    ...profile.style_descriptors,
    ...profile.design_era,
    ...profile.realism_level,
    ...profile.shape_language,
    ...profile.material_treatment,
    ...profile.color_palette,
    ...profile.surface_condition,
    ...profile.ornamentation,
    ...profile.visual_mood,
    ...profile.detail_level,
    ...profile.scene_compatibility,
    ...profile.descriptors,
    ...profile.materials,
    ...profile.colors,
    ...profile.geometry,
    ...profile.warnings,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return null;

  let dot = 0;
  let left = 0;
  let right = 0;

  for (let index = 0; index < a.length; index += 1) {
    const av = a[index]!;
    const bv = b[index]!;
    dot += av * bv;
    left += av * av;
    right += bv * bv;
  }

  if (left <= 0 || right <= 0) return null;
  return dot / (Math.sqrt(left) * Math.sqrt(right));
}

async function loadAssetVector(
  asset: MyWayAssetRecord,
): Promise<
  | { vector: StoredAppearanceVector; error: null }
  | { vector: null; error: string | null }
> {
  const metadata = asset.appearance_embedding;

  if (
    !metadata ||
    metadata.status !== "ready" ||
    !metadata.vector_key
  ) {
    return { vector: null, error: null };
  }

  try {
    const parsed =
      await readDurableAssetJson<Record<string, unknown>>(
        metadata.vector_key,
      );

    if (!parsed) {
      throw new Error(
        `Stored appearance embedding was not found: ${metadata.vector_key}`,
      );
    }
    const rawVector = parsed.vector;
    const vector = Array.isArray(rawVector)
      ? rawVector.map(Number)
      : [];
    const model =
      typeof parsed.model === "string"
        ? parsed.model
        : metadata.model;
    const assetId =
      typeof parsed.asset_id === "string"
        ? parsed.asset_id
        : asset.asset_id;
    const dimensions = Number(
      parsed.dimensions ?? metadata.dimensions,
    );

    if (
      assetId !== asset.asset_id ||
      !model ||
      !Number.isFinite(dimensions) ||
      dimensions <= 0 ||
      vector.length !== dimensions ||
      vector.some((entry) => !Number.isFinite(entry))
    ) {
      throw new Error(
        "Stored appearance embedding metadata or vector dimensions were invalid.",
      );
    }

    return {
      vector: {
        asset_id: asset.asset_id,
        model,
        dimensions,
        vector,
      },
      error: null,
    };
  } catch (caught) {
    return {
      vector: null,
      error:
        caught instanceof Error
          ? caught.message
          : String(caught),
    };
  }
}

function traitEvaluation(
  request: MyWayAssetAppearanceRequestV1,
  asset: MyWayAssetRecord,
) {
  const corpus = appearanceCorpus(asset);
  const requiredTraitMatches: string[] = [];
  const requiredTraitUnknown: string[] = [];
  const requiredTraitConflicts: string[] = [];
  const preferredTraitMatches: string[] = [];
  const avoidTraitMatches: string[] = [];

  for (const trait of request.required_traits) {
    if (corpus && traitMatchesText(trait, corpus)) {
      requiredTraitMatches.push(trait);
      continue;
    }

    const conflict = corpus
      ? traitContradiction(trait, corpus)
      : null;
    if (conflict) {
      requiredTraitConflicts.push(
        `${trait} (asset appears ${conflict})`,
      );
    } else {
      requiredTraitUnknown.push(trait);
    }
  }

  for (const trait of request.preferred_traits) {
    if (corpus && traitMatchesText(trait, corpus)) {
      preferredTraitMatches.push(trait);
    }
  }

  for (const trait of request.avoid_traits) {
    if (corpus && traitMatchesText(trait, corpus)) {
      avoidTraitMatches.push(trait);
    }
  }

  const traitBonus = Math.min(
    18,
    requiredTraitMatches.length * 3 +
      preferredTraitMatches.length * 2.5,
  );
  const penalty = Math.min(
    24,
    avoidTraitMatches.length * 6,
  );

  return {
    corpus,
    requiredTraitMatches,
    requiredTraitUnknown,
    requiredTraitConflicts,
    preferredTraitMatches,
    avoidTraitMatches,
    traitBonus,
    penalty,
  };
}

function similarityBonus(similarity: number | null) {
  if (similarity == null || !Number.isFinite(similarity)) return 0;
  const normalized = Math.max(
    0,
    Math.min(1, (similarity - 0.25) / 0.75),
  );
  return normalized * 28;
}

export async function evaluateAppearanceRanking(input: {
  concept: string;
  request: unknown;
  candidates: MyWayAssetRecord[];
  enabled?: boolean;
  vectorSimilarity?: boolean;
}): Promise<AssetAppearanceRankingResult> {
  const request = normalizeAppearanceRequest(input.request);
  const requested =
    input.enabled !== false &&
    hasAppearanceIntent(request);
  const vectorSimilarityEnabled =
    input.vectorSimilarity === true;

  if (!requested || !request) {
    return {
      request: undefined,
      evaluations: input.candidates.map((asset) => ({
        asset_id: asset.asset_id,
        eligible: true,
        status: "not_requested",
        similarity: null,
        similarity_bonus: 0,
        required_trait_matches: [],
        required_trait_unknown: [],
        required_trait_conflicts: [],
        preferred_trait_matches: [],
        avoid_trait_matches: [],
        trait_bonus: 0,
        penalty: 0,
        adjustment: 0,
        summary:
          asset.appearance_profile?.summary || null,
      })),
      diagnostics: {
        requested: false,
        used: false,
        model: null,
        dimensions: null,
        source_text_hash: null,
        comparable_candidate_count: 0,
        reason: "No appearance preference was requested.",
      },
      warnings: [],
    };
  }

  const vectorResults = await Promise.all(
    input.candidates.map(async (asset) => ({
      asset,
      loaded: await loadAssetVector(asset),
    })),
  );
  const validStoredVectors = vectorResults
    .map(({ loaded }) => loaded.vector)
    .filter(
      (
        vector,
      ): vector is StoredAppearanceVector =>
        Boolean(vector),
    );
  const warnings = vectorResults
    .filter(({ loaded }) => loaded.error)
    .map(
      ({ asset, loaded }) =>
        `Appearance embedding for ${asset.asset_id} was ignored: ${loaded.error}`,
    );

  let query:
    | {
        model: string;
        dimensions: number;
        source_text_hash: string;
        vector: number[];
      }
    | null = null;
  let reason: string | null = null;

  if (!vectorSimilarityEnabled) {
    reason =
      "Provider-backed appearance vector similarity is disabled for deterministic Phase 2 resolution. Reviewed appearance-profile traits were still evaluated.";
  } else if (validStoredVectors.length < 2) {
    reason =
      "Fewer than two eligible candidates had valid appearance embeddings, so vector similarity was not used.";
  } else {
    const sourceText = canonicalAppearanceQueryText({
      concept: input.concept,
      request,
    });

    try {
      const embedded =
        await embedAppearanceQuery(sourceText);
      query = {
        model: embedded.model,
        dimensions: embedded.vector.length,
        source_text_hash:
          stableTextHash(sourceText),
        vector: embedded.vector,
      };

      const comparable = validStoredVectors.filter(
        (vector) =>
          vector.model === query?.model &&
          vector.dimensions ===
            query?.dimensions,
      ).length;

      if (comparable < 2) {
        reason =
          "Fewer than two candidate embeddings matched the query model and vector dimensions.";
      }
    } catch (caught) {
      reason =
        `Appearance query embedding was unavailable: ${
          caught instanceof Error
            ? caught.message
            : String(caught)
        }`;
      warnings.push(reason);
      query = null;
    }
  }

  const comparableCandidateCount =
    query
      ? validStoredVectors.filter(
          (vector) =>
            vector.model === query?.model &&
            vector.dimensions ===
              query?.dimensions,
        ).length
      : 0;
  const useSimilarity =
    Boolean(query) &&
    comparableCandidateCount >= 2;

  const evaluations = vectorResults.map(
    ({ asset, loaded }): AssetAppearanceEvaluation => {
      const traits = traitEvaluation(
        request,
        asset,
      );
      const stored = loaded.vector;
      const similarity =
        useSimilarity &&
        query &&
        stored &&
        stored.model === query.model &&
        stored.dimensions ===
          query.dimensions
          ? cosineSimilarity(
              query.vector,
              stored.vector,
            )
          : null;
      const vectorBonus =
        similarityBonus(similarity);
      const eligible =
        traits.requiredTraitConflicts.length === 0;
      const status:
        AssetAppearanceEvaluation["status"] =
        !eligible
          ? "contradicted"
          : similarity != null
            ? "ready"
            : traits.corpus
              ? "profile_only"
              : loaded.error
                ? "invalid"
                : "missing";

      return {
        asset_id: asset.asset_id,
        eligible,
        status,
        similarity,
        similarity_bonus: vectorBonus,
        required_trait_matches:
          traits.requiredTraitMatches,
        required_trait_unknown:
          traits.requiredTraitUnknown,
        required_trait_conflicts:
          traits.requiredTraitConflicts,
        preferred_trait_matches:
          traits.preferredTraitMatches,
        avoid_trait_matches:
          traits.avoidTraitMatches,
        trait_bonus: traits.traitBonus,
        penalty: traits.penalty,
        adjustment:
          vectorBonus +
          traits.traitBonus -
          traits.penalty,
        summary:
          asset.appearance_profile?.summary || null,
      };
    },
  );

  const used = evaluations.some(
    (evaluation) =>
      evaluation.similarity != null ||
      evaluation.trait_bonus > 0 ||
      evaluation.penalty > 0 ||
      !evaluation.eligible,
  );

  return {
    request,
    evaluations,
    diagnostics: {
      requested: true,
      used,
      model:
        useSimilarity && query
          ? query.model
          : null,
      dimensions:
        useSimilarity && query
          ? query.dimensions
          : null,
      source_text_hash:
        useSimilarity && query
          ? query.source_text_hash
          : null,
      comparable_candidate_count:
        comparableCandidateCount,
      reason:
        useSimilarity
          ? null
          : reason ??
            "Appearance traits were evaluated without vector similarity.",
    },
    warnings,
  };
}
