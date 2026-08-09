import type { MyWayAssetRecord } from "../asset-types";

export type BlenderKitManualCandidate = {
  source_asset_id: string;
  source_internal_id: string | null;
  display_name: string;
  description: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  author_name: string | null;
  license_kind: "cc0";
  verification_status: string | null;
  is_free: boolean | null;
  rating_quality: number | null;
  polygon_count: number | null;
  file_size_bytes: number | null;
  available_resolutions: string[];
  tags: string[];
  match_score: number;
  semantic_match: boolean;
  already_imported: boolean;
};

type BlenderKitSearchResult = Record<string, unknown>;

const LOW_INFORMATION_QUERY_TOKENS = new Set([
  "generic",
  "simple",
  "basic",
  "realistic",
  "small",
  "large",
  "medium",
  "modern",
  "classic",
  "wooden",
  "plastic",
  "metal",
  "household",
  "home",
  "indoor",
  "outdoor",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function tokenize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function tokenMatches(queryToken: string, sourceToken: string) {
  if (queryToken === sourceToken) return true;

  if (
    queryToken.length >= 4 &&
    sourceToken.length >= 4 &&
    (queryToken.includes(sourceToken) ||
      sourceToken.includes(queryToken))
  ) {
    return true;
  }

  const querySingular =
    queryToken.endsWith("s") && queryToken.length > 4
      ? queryToken.slice(0, -1)
      : queryToken;
  const sourceSingular =
    sourceToken.endsWith("s") && sourceToken.length > 4
      ? sourceToken.slice(0, -1)
      : sourceToken;

  return querySingular === sourceSingular;
}

function resultWords(result: BlenderKitSearchResult) {
  return tokenize(
    [
      text(result.displayName) ?? "",
      text(result.name) ?? "",
      text(result.description) ?? "",
      ...stringList(result.tags),
    ].join(" "),
  );
}

function queryAnchor(query: string) {
  const tokens = tokenize(query);
  const meaningful = tokens.filter(
    (entry) => !LOW_INFORMATION_QUERY_TOKENS.has(entry),
  );
  return (meaningful.length > 0 ? meaningful : tokens).at(-1) ?? null;
}

function semanticMatch(result: BlenderKitSearchResult, query: string) {
  const anchor = queryAnchor(query);
  if (!anchor) return false;
  return resultWords(result).some((word) => tokenMatches(anchor, word));
}

function resultScore(result: BlenderKitSearchResult, query: string) {
  const queryTokens = tokenize(query);
  const words = resultWords(result);
  let score = 0;

  for (const token of queryTokens) {
    if (words.includes(token)) score += 8;
    if (
      words.some(
        (word) => token.includes(word) || word.includes(token),
      )
    ) {
      score += 2;
    }
  }

  if (text(result.verificationStatus)?.toLowerCase() === "validated") {
    score += 5;
  }
  if (result.isFree === true) score += 4;

  const ratings = record(result.ratingsAverage);
  const quality = number(ratings?.quality);
  if (quality != null) score += quality;

  return score;
}

function normalizedLicense(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[- ]/g, "_");

  return new Set([
    "cc0",
    "cc_0",
    "cc_zero",
    "creative_commons_zero",
  ]).has(normalized)
    ? "cc0"
    : normalized;
}

function authorName(result: BlenderKitSearchResult) {
  const author = record(result.author);
  if (!author) return null;

  const joined = [
    text(author.firstName),
    text(author.lastName),
  ]
    .filter(Boolean)
    .join(" ");

  return text(author.fullName) ?? (joined || null);
}

function thumbnailUrl(result: BlenderKitSearchResult) {
  const candidates = [
    result.thumbnailMiddleUrl,
    result.thumbnailLargeUrl,
    result.thumbnailSmallUrl,
    result.thumbnailXlargeUrl,
    result.thumbnail_url,
    result.thumbnail,
  ];

  for (const candidate of candidates) {
    const value = text(candidate);
    if (!value) continue;
    if (value.startsWith("//")) return `https:${value}`;
    if (/^https:\/\//i.test(value)) return value;
  }

  return null;
}

function sourceUrl(result: BlenderKitSearchResult) {
  const assetBaseId = text(result.assetBaseId);
  if (assetBaseId) {
    return `https://www.blenderkit.com/asset-gallery-detail/${assetBaseId}/`;
  }

  const url = text(result.url);
  return url && /^https:\/\//i.test(url) ? url : null;
}

function fileSummary(result: BlenderKitSearchResult) {
  const files = Array.isArray(result.files) ? result.files : [];
  const normalized = files
    .map((entry) => record(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const preferred =
    normalized.find((entry) => text(entry.fileType) === "resolution_1K") ??
    normalized.find((entry) => text(entry.fileType) === "resolution_0_5K") ??
    normalized.find((entry) => text(entry.fileType) === "resolution_2K") ??
    normalized.find((entry) => text(entry.fileType) === "blend") ??
    null;

  const size =
    number(preferred?.fileSize) ??
    number(preferred?.file_size) ??
    number(preferred?.size) ??
    null;

  return {
    availableResolutions: Array.from(
      new Set(
        normalized
          .map((entry) => text(entry.fileType))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    ),
    fileSizeBytes: size,
  };
}

function polygonCount(result: BlenderKitSearchResult) {
  const parameters = record(result.dictParameters) ?? record(result.parameters);
  const candidates = [
    parameters?.faceCount,
    parameters?.faces,
    parameters?.polygonCount,
    result.faceCount,
    result.polygonCount,
  ];

  for (const candidate of candidates) {
    const parsed = number(candidate);
    if (parsed != null && parsed >= 0) return Math.round(parsed);
  }

  return null;
}

async function fetchJson(url: string, signal: AbortSignal) {
  const apiKey = process.env.BLENDERKIT_API_KEY?.trim();

  async function request(token?: string) {
    return fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MyWay-BlendKit-Candidate-Search/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
      signal,
    });
  }

  let response = await request(apiKey);
  if (response.status === 401 && apiKey) {
    console.warn(
      "[MyWay BlendKit] Configured BLENDERKIT_API_KEY returned HTTP 401; retrying public candidate search without Authorization.",
    );
    response = await request();
  }

  if (!response.ok) {
    throw new Error(
      `BlendKit candidate search failed with HTTP ${response.status}.`,
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function searchBlenderKitCandidates(input: {
  query: string;
  existingAssets: MyWayAssetRecord[];
  limit?: number;
}) {
  const query = input.query.trim();
  if (!query) {
    throw new Error("Type an object identity before searching BlendKit.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const searchExpression = [
      query,
      "asset_type:model",
      "order:_score",
    ].join(" ");
    const params = new URLSearchParams({
      query: searchExpression,
      page_size: "100",
      dict_parameters: "1",
    });
    const payload = await fetchJson(
      `https://www.blenderkit.com/api/v1/search/?${params.toString()}`,
      controller.signal,
    );
    const rawResults = Array.isArray(payload.results)
      ? payload.results
      : [];
    const importedIds = new Set(
      input.existingAssets
        .filter(
          (asset) =>
            asset.source_type === "blenderkit" &&
            typeof asset.source_asset_id === "string" &&
            asset.source_asset_id.trim(),
        )
        .map((asset) => asset.source_asset_id!.trim()),
    );

    const candidates = rawResults
      .map((entry) => record(entry))
      .filter(
        (entry): entry is BlenderKitSearchResult =>
          Boolean(entry) &&
          text(entry!.assetType)?.toLowerCase() === "model" &&
          entry!.canDownload !== false &&
          normalizedLicense(entry!.license) === "cc0",
      )
      .map((entry): BlenderKitManualCandidate | null => {
        const sourceAssetId =
          text(entry.assetBaseId) ?? text(entry.id);
        if (!sourceAssetId) return null;

        const file = fileSummary(entry);
        return {
          source_asset_id: sourceAssetId,
          source_internal_id: text(entry.id),
          display_name:
            text(entry.displayName) ?? text(entry.name) ?? "Unnamed asset",
          description: text(entry.description)?.slice(0, 480) ?? null,
          source_url: sourceUrl(entry),
          thumbnail_url: thumbnailUrl(entry),
          author_name: authorName(entry),
          license_kind: "cc0",
          verification_status: text(entry.verificationStatus),
          is_free:
            typeof entry.isFree === "boolean" ? entry.isFree : null,
          rating_quality: number(record(entry.ratingsAverage)?.quality),
          polygon_count: polygonCount(entry),
          file_size_bytes: file.fileSizeBytes,
          available_resolutions: file.availableResolutions,
          tags: stringList(entry.tags).slice(0, 10),
          match_score: resultScore(entry, query),
          semantic_match: semanticMatch(entry, query),
          already_imported: importedIds.has(sourceAssetId),
        };
      })
      .filter(
        (entry): entry is BlenderKitManualCandidate => Boolean(entry),
      )
      .sort(
        (left, right) =>
          Number(right.semantic_match) - Number(left.semantic_match) ||
          right.match_score - left.match_score ||
          left.display_name.localeCompare(right.display_name),
      );

    const semantic = candidates.filter((entry) => entry.semantic_match);
    const ordered =
      semantic.length >= 4
        ? semantic
        : [
            ...semantic,
            ...candidates.filter((entry) => !entry.semantic_match),
          ];
    const limit = Math.max(1, Math.min(20, input.limit ?? 12));

    return {
      query,
      candidates: ordered.slice(0, limit),
      total_cc0_downloadable: candidates.length,
      semantic_match_count: semantic.length,
      broadened_results: semantic.length < Math.min(4, candidates.length),
    };
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new Error("BlendKit candidate search timed out after 90 seconds.");
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}
