import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const DEFAULT_OMNI_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const LEGACY_DIAGNOSTIC_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 300_000;
const OMNI_MAX_TOKENS = 65_536;
const OMNI_REASONING_BUDGET = 16_384;
const OMNI_PERCEPTION_MAX_TOKENS = 8_192;
const OMNI_SMOKE_MAX_TOKENS = 1_024;
const NVIDIA_REFERENCE_VIDEO_URL =
  "https://blogs.nvidia.com/wp-content/uploads/2023/04/nvidia-studio-itns-wk53-scene-in-omniverse-1280w.mp4";

export type CinematicVideoDifference = {
  time_range_s: string;
  category: string;
  importance: "high" | "medium" | "low";
  golden: string;
  generated: string;
  fix_hint: string;
};

export type CinematicVideoComparison = {
  summary: string;
  similarity_score: number;
  verdict: string;
  differences: CinematicVideoDifference[];
  generated_strengths: string[];
  highest_priority_fix: string;
  confidence: number;
};

type OmniJsonKind = "smoke" | "video_analysis" | "comparison";
type OmniCallMode = "smoke" | "perception" | "comparison";

type OmniResponseMetadata = {
  model: string | null;
  finish_reason: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  reasoning_chars: number;
  content_chars: number;
};

type OmniParseCandidateDiagnostic = {
  index: number;
  start: number;
  end: number;
  length: number;
  score: number;
  keys: string[];
  parse_error: string | null;
};

type OmniParseDiagnostics = {
  expected: OmniJsonKind;
  raw_length: number;
  balanced_candidate_count: number;
  parseable_candidate_count: number;
  selected_candidate_index: number | null;
  selected_score: number | null;
  selected_keys: string[];
  candidates: OmniParseCandidateDiagnostic[];
};

type OmniCallResult = {
  raw: string;
  parsed: unknown;
  parse_diagnostics: OmniParseDiagnostics;
  response_metadata: OmniResponseMetadata;
};

type OmniObservationAttemptDiagnostic = {
  attempt: "compact" | "ultra_compact";
  parse_ok: boolean;
  response_metadata: OmniResponseMetadata | null;
  parse_diagnostics: OmniParseDiagnostics | null;
  error: string | null;
  raw_preview: string | null;
};

type OmniVideoAnalysisResult = OmniCallResult & {
  observation_diagnostics: {
    used_ultra_compact_retry: boolean;
    attempts: OmniObservationAttemptDiagnostic[];
  };
};

class OmniOutputParseError extends Error {
  diagnostics: OmniParseDiagnostics;
  rawPreview: string;
  responseMetadata: OmniResponseMetadata | null;

  constructor(message: string, diagnostics: OmniParseDiagnostics, rawPreview: string) {
    super(message);
    this.name = "OmniOutputParseError";
    this.diagnostics = diagnostics;
    this.rawPreview = rawPreview;
    this.responseMetadata = null;
  }
}

class NemotronRequestError extends Error {
  status: number | null;
  responseText: string;

  constructor(message: string, status: number | null, responseText = "") {
    super(message);
    this.name = "NemotronRequestError";
    this.status = status;
    this.responseText = responseText;
  }
}

function baseUrl(value: string | undefined) {
  return (value ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
}

function isLocalEndpoint(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i.test(`${value}/`);
}

function authorizationHeaders(endpoint: string): Record<string, string> {
  const apiKey =
    process.env.MYWAY_ASSET_NVIDIA_API_KEY?.trim() ||
    process.env.NVIDIA_API_KEY?.trim();

  if (!apiKey && !isLocalEndpoint(endpoint)) {
    throw new Error(
      "NVIDIA_API_KEY is required for hosted cinematic video comparison. The existing MYWAY_ASSET_NVIDIA_API_KEY may also be reused.",
    );
  }

  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function postJson(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authorizationHeaders(endpoint),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new NemotronRequestError(
        `Nemotron cinematic video request failed with ${response.status}: ${responseText.slice(0, 1800)}`,
        response.status,
        responseText,
      );
    }
    try {
      return JSON.parse(responseText) as unknown;
    } catch {
      throw new NemotronRequestError(
        `Nemotron cinematic video endpoint returned invalid JSON: ${responseText.slice(0, 1800)}`,
        response.status,
        responseText,
      );
    }
  } catch (caught) {
    if (
      caught instanceof Error &&
      (caught.name === "AbortError" || caught.message.toLowerCase().includes("aborted"))
    ) {
      throw new NemotronRequestError(
        `Nemotron cinematic video request exceeded ${Math.round(timeoutMs / 1000)} seconds.`,
        null,
      );
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

function assistantText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const choices = (value as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices.length) return "";
  const first = choices[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return "";
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return "";
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return "";
      const item = part as Record<string, unknown>;
      return typeof item.text === "string" ? item.text : "";
    })
    .join("");
}

function finiteNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textFieldLength(value: unknown) {
  if (typeof value === "string") return value.length;
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, part) => {
    if (typeof part === "string") return total + part.length;
    if (!part || typeof part !== "object" || Array.isArray(part)) return total;
    const item = part as Record<string, unknown>;
    return total + (typeof item.text === "string" ? item.text.length : 0);
  }, 0);
}

function omniResponseMetadata(value: unknown, raw: string): OmniResponseMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      model: null,
      finish_reason: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      reasoning_tokens: null,
      reasoning_chars: 0,
      content_chars: raw.length,
    };
  }

  const root = value as Record<string, unknown>;
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first =
    choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    first?.message && typeof first.message === "object" && !Array.isArray(first.message)
      ? (first.message as Record<string, unknown>)
      : null;
  const usage =
    root.usage && typeof root.usage === "object" && !Array.isArray(root.usage)
      ? (root.usage as Record<string, unknown>)
      : null;
  const completionDetails =
    usage?.completion_tokens_details &&
    typeof usage.completion_tokens_details === "object" &&
    !Array.isArray(usage.completion_tokens_details)
      ? (usage.completion_tokens_details as Record<string, unknown>)
      : null;

  const reasoningChars = Math.max(
    textFieldLength(message?.reasoning),
    textFieldLength(message?.reasoning_content),
    textFieldLength(message?.reasoning_text),
  );

  return {
    model: typeof root.model === "string" ? root.model : null,
    finish_reason: typeof first?.finish_reason === "string" ? first.finish_reason : null,
    prompt_tokens: finiteNumberOrNull(usage?.prompt_tokens),
    completion_tokens: finiteNumberOrNull(usage?.completion_tokens),
    total_tokens: finiteNumberOrNull(usage?.total_tokens),
    reasoning_tokens: finiteNumberOrNull(completionDetails?.reasoning_tokens),
    reasoning_chars: reasoningChars,
    content_chars: raw.length,
  };
}

function responseMetadataSummary(metadata: OmniResponseMetadata | null) {
  if (!metadata) return "response_metadata=unavailable";
  return [
    `finish_reason=${metadata.finish_reason ?? "unknown"}`,
    `prompt_tokens=${metadata.prompt_tokens ?? "unknown"}`,
    `completion_tokens=${metadata.completion_tokens ?? "unknown"}`,
    `reasoning_tokens=${metadata.reasoning_tokens ?? "unknown"}`,
    `reasoning_chars=${metadata.reasoning_chars}`,
    `content_chars=${metadata.content_chars}`,
  ].join("; ");
}

function balancedJsonObjectCandidates(value: string) {
  const candidates: Array<{ text: string; start: number; end: number }> = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (start < 0) {
      if (character === "{") {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        candidates.push({
          text: value.slice(start, index + 1),
          start,
          end: index + 1,
        });
        start = -1;
      }
    }
  }

  return candidates.slice(0, 64);
}

function recordKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

function omniCandidateScore(value: unknown, expected: OmniJsonKind) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return -1;
  const item = value as Record<string, unknown>;

  if (expected === "smoke") {
    return (
      (typeof item.video_ok === "boolean" ? 8 : 0) +
      (typeof item.summary === "string" ? 4 : 0)
    );
  }

  if (expected === "video_analysis") {
    const beats = Array.isArray(item.beats) ? item.beats : [];
    const timeline = Array.isArray(item.timeline) ? item.timeline : [];
    return (
      (typeof item.overall === "string" ? 4 : 0) +
      (Array.isArray(item.beats) ? 10 : 0) +
      Math.min(beats.length, 10) +
      (Array.isArray(item.timeline) ? 6 : 0) +
      Math.min(timeline.length, 6) +
      (Array.isArray(item.notable_details) ? 2 : 0) +
      (Array.isArray(item.visual_issues) ? 2 : 0) +
      (Array.isArray(item.notable_strengths) ? 1 : 0) +
      (Array.isArray(item.possible_visual_issues) ? 1 : 0)
    );
  }

  return (
    (typeof item.summary === "string" ? 4 : 0) +
    (Number.isFinite(Number(item.similarity_score)) ? 5 : 0) +
    (typeof item.verdict === "string" ? 4 : 0) +
    (Array.isArray(item.differences) ? 8 : 0) +
    (Array.isArray(item.generated_strengths) ? 2 : 0) +
    (typeof item.highest_priority_fix === "string" ? 3 : 0) +
    (Number.isFinite(Number(item.confidence)) ? 3 : 0)
  );
}

function omniMinimumScore(expected: OmniJsonKind) {
  if (expected === "smoke") return 4;
  if (expected === "video_analysis") return 8;
  return 8;
}

function rawPreview(value: string, limit = 1200) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function extractExpectedJsonObject(value: string, expected: OmniJsonKind) {
  const candidates = balancedJsonObjectCandidates(value);
  const diagnostics: OmniParseDiagnostics = {
    expected,
    raw_length: value.length,
    balanced_candidate_count: candidates.length,
    parseable_candidate_count: 0,
    selected_candidate_index: null,
    selected_score: null,
    selected_keys: [],
    candidates: [],
  };

  const parsedCandidates: Array<{
    index: number;
    parsed: unknown;
    score: number;
    keys: string[];
    length: number;
  }> = [];

  candidates.forEach((candidate, index) => {
    try {
      const parsed = JSON.parse(candidate.text) as unknown;
      const keys = recordKeys(parsed);
      const score = omniCandidateScore(parsed, expected);
      diagnostics.parseable_candidate_count += 1;
      diagnostics.candidates.push({
        index,
        start: candidate.start,
        end: candidate.end,
        length: candidate.text.length,
        score,
        keys,
        parse_error: null,
      });
      parsedCandidates.push({
        index,
        parsed,
        score,
        keys,
        length: candidate.text.length,
      });
    } catch (caught) {
      diagnostics.candidates.push({
        index,
        start: candidate.start,
        end: candidate.end,
        length: candidate.text.length,
        score: -1,
        keys: [],
        parse_error: caught instanceof Error ? caught.message : String(caught),
      });
    }
  });

  const selected = parsedCandidates
    .filter((candidate) => candidate.score >= omniMinimumScore(expected))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.keys.length - left.keys.length ||
        right.length - left.length,
    )[0];

  if (!selected) {
    const scoreSummary = diagnostics.candidates
      .map(
        (candidate) =>
          `#${candidate.index}:score=${candidate.score}:keys=${candidate.keys.join(",") || "none"}`,
      )
      .join(" | ");
    throw new OmniOutputParseError(
      [
        `Nemotron Omni returned final assistant content, but MyWay could not identify a JSON object matching the expected ${expected} schema.`,
        `raw_length=${diagnostics.raw_length}; balanced_candidates=${diagnostics.balanced_candidate_count}; parseable_candidates=${diagnostics.parseable_candidate_count}.`,
        scoreSummary ? `candidate_scores=${scoreSummary}.` : "No complete balanced JSON object was found.",
        `raw_preview=${JSON.stringify(rawPreview(value))}`,
      ].join(" "),
      diagnostics,
      rawPreview(value),
    );
  }

  diagnostics.selected_candidate_index = selected.index;
  diagnostics.selected_score = selected.score;
  diagnostics.selected_keys = selected.keys;
  return { parsed: selected.parsed, diagnostics };
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function number01(value: unknown, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function number100(value: unknown, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function stringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeImportance(value: unknown): "high" | "medium" | "low" {
  const normalized = text(value).toLowerCase();
  return normalized === "high" || normalized === "low" ? normalized : "medium";
}

function normalizeComparison(value: unknown): CinematicVideoComparison {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Nemotron returned an invalid cinematic comparison object.");
  }
  const item = value as Record<string, unknown>;
  const rawDifferences = Array.isArray(item.differences) ? item.differences : [];
  const differences = rawDifferences
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => {
      const difference = entry as Record<string, unknown>;
      return {
        time_range_s: text(difference.time_range_s, "unspecified"),
        category: text(difference.category, "visual difference"),
        importance: normalizeImportance(difference.importance),
        golden: text(difference.golden, "Not described."),
        generated: text(difference.generated, "Not described."),
        fix_hint: text(difference.fix_hint, "Inspect this interval."),
      };
    })
    .slice(0, 16);

  return {
    summary: text(item.summary, "Nemotron completed the comparison."),
    similarity_score: number100(item.similarity_score),
    verdict: text(item.verdict, "Comparison complete."),
    differences,
    generated_strengths: stringArray(item.generated_strengths, 10),
    highest_priority_fix: text(
      item.highest_priority_fix,
      differences[0]?.fix_hint ?? "No single dominant fix was identified.",
    ),
    confidence: number01(item.confidence),
  };
}

function singleVideoPrompt(label: "GOLDEN" | "GENERATED", durationS: number) {
  return [
    `Observe the ${label} version of the approximately ${durationS.toFixed(1)} second Lunch cinematic.`,
    "This is a visual-perception pass, not a reasoning essay. Report only what is visibly supported by the video.",
    "Cover the whole film in 6 to 10 meaningful beats. Pay special attention to camera movement, hand-to-burger contact, outline/highlight/emphasis, cow/chicken entrances, fish occlusion-to-reveal, continuity, orbit/recap, and final burger framing.",
    "Return exactly one COMPLETE JSON object and nothing else.",
    "Keep the entire JSON concise (target under 3500 characters).",
    '{"overall":"one concise sentence","beats":[{"t":"0-2","event":"what visibly happens","camera":"brief camera behavior","emphasis":"visible highlight/outline/none"}],"notable_details":["important visible detail"],"visual_issues":["visible issue only"]}',
    "Do not invent unseen details. Use compact timestamps and short phrases.",
  ].join("\n");
}

function ultraCompactVideoPrompt(label: "GOLDEN" | "GENERATED", durationS: number) {
  return [
    `Re-observe the ${label} version of the approximately ${durationS.toFixed(1)} second Lunch cinematic.`,
    "Your previous structured answer was incomplete. Return ONLY one COMPLETE compact JSON object.",
    "Use 4 to 8 beats maximum and keep the entire JSON under 1800 characters.",
    "Prioritize: hand/burger contact and highlight, major animal entrances, fish reveal/occlusion, major camera/orbit changes, continuity, and final framing.",
    '{"overall":"short","beats":[{"t":"0-2","event":"short visible event","emphasis":"short visible emphasis"}],"notable_details":["short"],"visual_issues":["short"]}',
    "No markdown, no commentary, no trailing text.",
  ].join("\n");
}

function comparisonPrompt(
  goldenAnalysis: unknown,
  generatedAnalysis: unknown,
  durationS: number,
) {
  return [
    "Compare two independent temporal analyses of the same deterministic 3D film.",
    `The target duration is approximately ${durationS.toFixed(1)} seconds.`,
    "The first analysis is GOLDEN; the second is GENERATED.",
    "Use only differences supported by those analyses. Do not invent frame-level claims that neither analysis reports.",
    "Return exactly this JSON schema:",
    '{"summary":"concise overall comparison","similarity_score":0,"verdict":"one-sentence verdict","differences":[{"time_range_s":"3.0-5.0","category":"interaction|camera|staging|motion|timing|visibility|emphasis|composition|continuity|other","importance":"high|medium|low","golden":"what Golden does","generated":"what Generated does differently","fix_hint":"what should change in Generated"}],"generated_strengths":["..."],"highest_priority_fix":"single most important change","confidence":0.0}',
    "similarity_score is 0 to 100. confidence is 0 to 1.",
    "Pay special attention to the hand-to-burger interaction and any visible outline/highlight/emphasis difference.",
    "",
    "GOLDEN ANALYSIS:",
    JSON.stringify(goldenAnalysis),
    "",
    "GENERATED ANALYSIS:",
    JSON.stringify(generatedAnalysis),
  ].join("\n");
}

async function callOmni(input: {
  model: string;
  endpoint: string;
  content: Array<Record<string, unknown>> | string;
  expectedJson: OmniJsonKind;
  mode: OmniCallMode;
}): Promise<OmniCallResult> {
  const isComparison = input.mode === "comparison";
  const maxTokens =
    input.mode === "smoke"
      ? OMNI_SMOKE_MAX_TOKENS
      : isComparison
        ? OMNI_MAX_TOKENS
        : OMNI_PERCEPTION_MAX_TOKENS;

  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: input.content }],
    model: input.model,
    max_tokens: maxTokens,
    stream: false,
    temperature: isComparison ? 0.6 : 0.2,
    top_p: isComparison ? 0.95 : 0.9,
    chat_template_kwargs: { enable_thinking: isComparison },
  };

  // CP.2A.6F separates perception from critique. Video observation is
  // deterministic/non-thinking; only the final text comparison gets reasoning.
  if (isComparison) {
    body.reasoning_budget = OMNI_REASONING_BUDGET;
  }

  const response = await postJson(input.endpoint, body);
  const raw = assistantText(response);
  const metadata = omniResponseMetadata(response, raw);

  if (!raw.trim()) {
    throw new Error(
      `Nemotron Omni returned no final assistant content. ${responseMetadataSummary(metadata)}.`,
    );
  }

  try {
    const extracted = extractExpectedJsonObject(raw, input.expectedJson);
    return {
      raw,
      parsed: extracted.parsed,
      parse_diagnostics: extracted.diagnostics,
      response_metadata: metadata,
    };
  } catch (caught) {
    if (caught instanceof OmniOutputParseError) {
      caught.responseMetadata = metadata;
      caught.message = `${caught.message} ${responseMetadataSummary(metadata)}.`;
    }
    throw caught;
  }
}

async function callLegacyDiagnostic(input: {
  endpoint: string;
  content: Array<Record<string, unknown>>;
}) {
  const response = await postJson(input.endpoint, {
    model: LEGACY_DIAGNOSTIC_MODEL,
    messages: [
      { role: "system", content: "/no_think\nReturn only valid JSON." },
      { role: "user", content: input.content },
    ],
    max_tokens: 512,
    stream: false,
    media_io_kwargs: { video: { num_frames: 8 } },
    mm_processor_kwargs: { max_num_tiles: 1 },
  });
  const raw = assistantText(response);
  if (!raw.trim()) throw new Error("Legacy Nemotron diagnostic returned no assistant text.");
  return raw;
}

async function fileToVideoDataUrl(file: File) {
  if (file.size <= 0) throw new Error(`${file.name || "Video"} is empty.`);
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `${file.name || "Video"} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the cinematic comparison limit is ${MAX_VIDEO_BYTES / 1024 / 1024} MB per movie.`,
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:video/mp4;base64,${bytes.toString("base64")}`;
}

function compactError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  return message.replace(/\s+/g, " ").slice(0, 1200);
}

async function fetchReferenceVideoAsDataUrl() {
  const response = await fetch(NVIDIA_REFERENCE_VIDEO_URL, {
    headers: { Accept: "video/mp4,*/*;q=0.8" },
  });
  if (!response.ok) {
    throw new Error(
      `Could not download NVIDIA reference MP4 for smoke test (${response.status}).`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("NVIDIA reference MP4 smoke asset was empty.");
  if (bytes.length > MAX_VIDEO_BYTES) {
    throw new Error(
      `NVIDIA reference MP4 smoke asset was ${(bytes.length / 1024 / 1024).toFixed(1)} MB, above the ${MAX_VIDEO_BYTES / 1024 / 1024} MB diagnostic limit.`,
    );
  }
  return `data:video/mp4;base64,${bytes.toString("base64")}`;
}

async function runOmniReferenceVideoSmoke(input: {
  model: string;
  endpoint: string;
}) {
  try {
    const videoUrl = await fetchReferenceVideoAsDataUrl();
    const result = await callOmni({
      model: input.model,
      endpoint: input.endpoint,
      content: [
        { type: "video_url", video_url: { url: videoUrl } },
        {
          type: "text",
          text: 'Describe what you see in this video. Return only JSON: {"video_ok":true,"summary":"brief description"}',
        },
      ],
      expectedJson: "smoke",
      mode: "smoke",
    });
    return {
      ok: true as const,
      raw: result.raw,
      parse_diagnostics: result.parse_diagnostics,
      response_metadata: result.response_metadata,
    };
  } catch (caught) {
    return { ok: false as const, error: compactError(caught) };
  }
}

async function runLegacyReferenceVideoSmoke(input: { endpoint: string }) {
  try {
    const videoUrl = await fetchReferenceVideoAsDataUrl();
    const raw = await callLegacyDiagnostic({
      endpoint: input.endpoint,
      content: [
        { type: "video_url", video_url: { url: videoUrl } },
        {
          type: "text",
          text: 'Return only JSON: {"video_ok":true,"summary":"brief description"}',
        },
      ],
    });
    return { ok: true as const, raw };
  } catch (caught) {
    return { ok: false as const, error: compactError(caught) };
  }
}

async function analyzeOmniVideo(input: {
  label: "GOLDEN" | "GENERATED";
  videoUrl: string;
  durationS: number;
  model: string;
  endpoint: string;
}): Promise<OmniVideoAnalysisResult> {
  const attempts: OmniObservationAttemptDiagnostic[] = [];

  try {
    const result = await callOmni({
      model: input.model,
      endpoint: input.endpoint,
      content: [
        { type: "video_url", video_url: { url: input.videoUrl } },
        { type: "text", text: singleVideoPrompt(input.label, input.durationS) },
      ],
      expectedJson: "video_analysis",
      mode: "perception",
    });

    attempts.push({
      attempt: "compact",
      parse_ok: true,
      response_metadata: result.response_metadata,
      parse_diagnostics: result.parse_diagnostics,
      error: null,
      raw_preview: rawPreview(result.raw, 700),
    });

    return {
      ...result,
      observation_diagnostics: {
        used_ultra_compact_retry: false,
        attempts,
      },
    };
  } catch (caught) {
    if (!(caught instanceof OmniOutputParseError)) throw caught;

    attempts.push({
      attempt: "compact",
      parse_ok: false,
      response_metadata: caught.responseMetadata,
      parse_diagnostics: caught.diagnostics,
      error: compactError(caught),
      raw_preview: caught.rawPreview,
    });
  }

  try {
    const retry = await callOmni({
      model: input.model,
      endpoint: input.endpoint,
      content: [
        { type: "video_url", video_url: { url: input.videoUrl } },
        { type: "text", text: ultraCompactVideoPrompt(input.label, input.durationS) },
      ],
      expectedJson: "video_analysis",
      mode: "perception",
    });

    attempts.push({
      attempt: "ultra_compact",
      parse_ok: true,
      response_metadata: retry.response_metadata,
      parse_diagnostics: retry.parse_diagnostics,
      error: null,
      raw_preview: rawPreview(retry.raw, 700),
    });

    return {
      ...retry,
      observation_diagnostics: {
        used_ultra_compact_retry: true,
        attempts,
      },
    };
  } catch (caught) {
    if (caught instanceof OmniOutputParseError) {
      attempts.push({
        attempt: "ultra_compact",
        parse_ok: false,
        response_metadata: caught.responseMetadata,
        parse_diagnostics: caught.diagnostics,
        error: compactError(caught),
        raw_preview: caught.rawPreview,
      });
      throw new Error(
        [
          `${input.label} Omni video inference returned assistant content twice, but neither compact observation was complete/usable JSON.`,
          ...attempts.map(
            (attempt) =>
              `${attempt.attempt}: ${responseMetadataSummary(attempt.response_metadata)}; parse_ok=${attempt.parse_ok}; raw_preview=${JSON.stringify(rawPreview(attempt.raw_preview ?? "", 500))}`,
          ),
        ].join("\n"),
      );
    }
    throw caught;
  }
}

async function compareVideos(golden: File, generated: File, durationS: number) {
  const endpoint = `${baseUrl(
    process.env.MYWAY_CINEMATIC_VISION_BASE_URL ??
      process.env.MYWAY_ASSET_VISION_BASE_URL ??
      process.env.NVIDIA_BASE_URL,
  )}/chat/completions`;

  // Do not inherit MYWAY_ASSET_VISION_MODEL here. Asset Library may continue to
  // use the older 12B image model while Cinematic Production independently
  // defaults to the newer Omni video provider.
  const configuredModel = process.env.MYWAY_CINEMATIC_VISION_MODEL?.trim();
  const model =
    !configuredModel || configuredModel === LEGACY_DIAGNOSTIC_MODEL
      ? DEFAULT_OMNI_MODEL
      : configuredModel;

  const [goldenUrl, generatedUrl] = await Promise.all([
    fileToVideoDataUrl(golden),
    fileToVideoDataUrl(generated),
  ]);

  // Prove the hosted Omni video lane with NVIDIA's own documented reference MP4
  // before spending time analyzing either Lunch movie.
  const referenceSmoke = await runOmniReferenceVideoSmoke({ model, endpoint });
  if (!referenceSmoke.ok) {
    const legacySmoke = await runLegacyReferenceVideoSmoke({ endpoint });
    throw new Error(
      [
        "Nemotron 3 Nano Omni failed the NVIDIA reference-video smoke test before Lunch analysis began.",
        `Omni smoke: ${referenceSmoke.error}`,
        legacySmoke.ok
          ? "Legacy 12B diagnostic smoke succeeded, which points to an Omni-specific hosted-provider problem."
          : `Legacy 12B diagnostic smoke also failed: ${legacySmoke.error}`,
        "The cinematic provider is using base64 video_url. CP.2A.6G runs independent non-thinking video descriptions for Golden and Generated; no final comparison call is required for this observation-viewer experiment.",
      ].join("\n"),
    );
  }

  let goldenAnalysis: OmniVideoAnalysisResult;
  try {
    goldenAnalysis = await analyzeOmniVideo({
      label: "GOLDEN",
      videoUrl: goldenUrl,
      durationS,
      model,
      endpoint,
    });
  } catch (caught) {
    if (caught instanceof OmniOutputParseError) {
      throw new Error(
        [
          "Omni reference-video smoke succeeded, but GOLDEN Lunch did not yield a usable compact video observation.",
          "CP.2A.6F retries incomplete structured perception automatically; inspect the included finish_reason/token metadata before implicating the captured Lunch MP4.",
          compactError(caught),
        ].join("\n"),
      );
    }
    throw new Error(
      [
        "Omni reference-video smoke succeeded, but the GOLDEN Lunch request failed before a usable video analysis was returned.",
        compactError(caught),
      ].join("\n"),
    );
  }

  let generatedAnalysis: OmniVideoAnalysisResult;
  try {
    generatedAnalysis = await analyzeOmniVideo({
      label: "GENERATED",
      videoUrl: generatedUrl,
      durationS,
      model,
      endpoint,
    });
  } catch (caught) {
    if (caught instanceof OmniOutputParseError) {
      throw new Error(
        [
          "Omni reference-video smoke and GOLDEN analysis succeeded, but GENERATED Lunch did not yield a usable compact video observation.",
          "CP.2A.6F retries incomplete structured perception automatically; inspect the included finish_reason/token metadata before implicating the captured Lunch MP4.",
          compactError(caught),
        ].join("\n"),
      );
    }
    throw new Error(
      [
        "Omni reference-video smoke and GOLDEN analysis succeeded, but the GENERATED Lunch request failed before a usable video analysis was returned.",
        compactError(caught),
      ].join("\n"),
    );
  }

  // CP.2A.6G Observation Viewer deliberately stops after the two independent
  // video-perception calls. The purpose of this experiment is to inspect exactly
  // what Omni says it sees in Golden and Generated before any comparison model
  // interprets, scores, or summarizes those observations.
  return {
    model,
    observation_mode: "two_independent_video_descriptions" as const,
    golden_description: goldenAnalysis.raw,
    generated_description: generatedAnalysis.raw,
    video_diagnostics: {
      provider: "nvidia_nemotron_3_nano_omni_30b_a3b_reasoning",
      reference_smoke: "passed",
      perception: {
        enable_thinking: false,
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: OMNI_PERCEPTION_MAX_TOKENS,
        compact_retry: "ultra_compact_on_parse_failure",
      },
      capture_contract: "single finalized H.264/MP4 blob",
      legacy_model: LEGACY_DIAGNOSTIC_MODEL,
      parser: "balanced_schema_scored_json_objects",
      reference_response: referenceSmoke.response_metadata,
      reference_parse: referenceSmoke.parse_diagnostics,
      golden_observation: goldenAnalysis.observation_diagnostics,
      generated_observation: generatedAnalysis.observation_diagnostics,
      golden_parse: goldenAnalysis.parse_diagnostics,
      generated_parse: generatedAnalysis.parse_diagnostics,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const golden = form.get("golden");
    const generated = form.get("generated");
    if (!(golden instanceof File) || !(generated instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Both golden and generated MP4 files are required." },
        { status: 400 },
      );
    }

    const durationValue = Number(form.get("duration_s"));
    const durationS =
      Number.isFinite(durationValue) && durationValue > 0
        ? Math.min(durationValue, 120)
        : 26;

    const result = await compareVideos(golden, generated, durationS);
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    return NextResponse.json(
      { ok: false, error: caught instanceof Error ? caught.message : String(caught) },
      { status: 500 },
    );
  }
}
