import type {
  AnswerKey,
  DiagnosisLabel,
  ProbeAttemptType,
  ProbePrompt,
  ProbeType,
  RendererParams,
} from "@/lib/engine";

export const runtime = "nodejs";

export const DEFAULT_OPENAI_MODEL =
  process.env.MYWAY_OPENAI_FULL_LOOP_MODEL?.trim() || "gpt-5.5";

export const DEFAULT_IMAGE_MODEL =
  process.env.MYWAY_OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";

export const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";

export type EngineRenderableProbeLike = {
  schema_version: "engine_renderable_probe_v1";
  probe_type: ProbeType;
  expected_attempt_type: ProbeAttemptType;
  prompt: ProbePrompt;
  presentation_support?: unknown;
  answer_key?: AnswerKey | null;
  misconception_markers: Array<{
    misconception_id: string;
    label: string;
    marker?: string | null;
    description?: string | null;
    confidence?: number | null;
  }>;
  renderer_params?: RendererParams | null;
  delivery_context?: unknown;
  confidence: number;
  renderer_compatibility: {
    renderer_kind: ProbeType;
    is_renderable: boolean;
    blocking_reasons: string[];
    warnings: string[];
  };
};

export type FullLoopOutput = {
  schema_version: "myway_openai_full_loop_generate_output_v1";
  diagnosis: Record<string, unknown>;
  probe: EngineRenderableProbeLike;
  image_prompt?: string | null;
  image_use_case?: string | null;
  rationale: {
    why_this_probe_type: string;
    what_it_measures: string;
    cost_note: string;
  };
};

const PROBE_TYPES: ProbeType[] = [
  "explain",
  "discriminate",
  "apply_transfer",
  "sequence",
  "single_choice",
  "multi_choice",
  "drag_drop_placements",
  "predict",
  "slider",
  "graph_relationship",
  "audio_clip_question",
  "audio_response_question",
  "video_click_interval",
  "video_explanation",
];

const ATTEMPT_TYPES: ProbeAttemptType[] = [
  "text",
  "single_choice",
  "multi_choice",
  "ordered_items",
  "drag_drop_placements",
  "numeric",
  "graph",
  "audio_response",
  "video_click",
  "none",
  "unknown",
];

const DIAGNOSES: DiagnosisLabel[] = [
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
];

export function apiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY. Add it to .env.local and restart pnpm dev.");
  return key;
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function text(value: unknown, fallback: string, max = 2000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback.slice(0, max);
}

export function num(value: unknown, fallback: number, min = 0, max = 1) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isProbeType(value: unknown): value is ProbeType {
  return typeof value === "string" && PROBE_TYPES.includes(value as ProbeType);
}

function isAttemptType(value: unknown): value is ProbeAttemptType {
  return typeof value === "string" && ATTEMPT_TYPES.includes(value as ProbeAttemptType);
}

function defaultAttempt(probeType: ProbeType): ProbeAttemptType {
  if (probeType === "multi_choice") return "multi_choice";
  if (probeType === "drag_drop_placements") return "drag_drop_placements";
  if (probeType === "sequence") return "ordered_items";
  if (probeType === "slider") return "numeric";
  if (probeType === "graph_relationship") return "graph";
  if (probeType === "video_explanation") return "none";
  return probeType === "single_choice" || probeType === "discriminate" ? "single_choice" : "text";
}

export function parseJson(content: string): unknown {
  const stripped = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error("Could not parse JSON from model output.");
  }
}

export function outputText(data: unknown) {
  const r = record(data);
  if (typeof r.output_text === "string") return r.output_text;
  const chunks: string[] = [];
  for (const item of arr(r.output)) {
    for (const part of arr(record(item).content)) {
      const p = record(part);
      if (typeof p.text === "string") chunks.push(p.text);
      if (typeof p.output_text === "string") chunks.push(p.output_text);
    }
  }
  return chunks.join("").trim();
}

function normalizeOptions(value: unknown) {
  return arr(value).map((option, index) => {
    const o = record(option);
    return {
      id: text(o.id, `option_${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, "_"),
      label: text(o.label, String.fromCharCode(65 + index), 18),
      text: text(o.text, `Option ${index + 1}`, 350),
    };
  }).slice(0, 6);
}

function normalizeItems(value: unknown) {
  return arr(value).map((item, index) => {
    const i = record(item);
    return {
      id: text(i.id, `item_${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, "_"),
      text: text(i.text, `Item ${index + 1}`, 260),
    };
  }).slice(0, 10);
}

function normalizeTargets(value: unknown) {
  return arr(value).map((target, index) => {
    const t = record(target);
    return {
      id: text(t.id, `target_${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, "_"),
      label: text(t.label, `Bucket ${index + 1}`, 160),
    };
  }).slice(0, 5);
}

export function normalizeProbe(value: unknown, learnerMessage: string): EngineRenderableProbeLike {
  const r = record(value);
  const probeType = isProbeType(r.probe_type) ? r.probe_type : "single_choice";
  const expectedAttemptType = isAttemptType(r.expected_attempt_type) ? r.expected_attempt_type : defaultAttempt(probeType);
  const promptRecord = record(r.prompt);
  const rendererRecord = record(r.renderer_params);
  const rendererParams: RendererParams = {};

  const options = normalizeOptions(rendererRecord.options);
  if (options.length) rendererParams.options = options;

  const items = normalizeItems(rendererRecord.items);
  if (items.length) rendererParams.items = items;

  const targets = normalizeTargets(rendererRecord.placement_targets);
  if (targets.length) rendererParams.placement_targets = targets;

  const slider = record(rendererRecord.slider);
  if (Object.keys(slider).length) {
    const min = num(slider.min, 0, -1000000, 1000000);
    const max = num(slider.max, 1, -1000000, 1000000);
    rendererParams.slider = {
      min,
      max: max <= min ? min + 1 : max,
      step: num(slider.step, 0.01, 0.0001, 1000),
      unit: typeof slider.unit === "string" ? slider.unit.slice(0, 30) : null,
    };
  }

  const warnings: string[] = [];
  if ((probeType === "single_choice" || probeType === "multi_choice") && !rendererParams.options?.length) {
    rendererParams.options = [
      { id: "best_answer", label: "A", text: "The answer that best targets the missing relationship." },
      { id: "surface_answer", label: "B", text: "A tempting surface-level answer." },
    ];
    warnings.push("Inserted fallback options because the model did not provide options.");
  }

  return {
    schema_version: "engine_renderable_probe_v1",
    probe_type: probeType,
    expected_attempt_type: expectedAttemptType,
    prompt: {
      root_problem_explanation: text(promptRecord.root_problem_explanation, "MyWay is checking one specific part of the learner's thinking.", 700),
      reshaping_explanation: text(promptRecord.reshaping_explanation, "Answer in a way that makes your current mental model visible.", 700),
      task: text(promptRecord.task, `Respond to this probe: ${learnerMessage}`, 280),
      full_prompt: text(promptRecord.full_prompt, `Respond to this probe: ${learnerMessage}`, 1400),
    },
    presentation_support: r.presentation_support,
    answer_key: Object.keys(record(r.answer_key)).length ? (record(r.answer_key) as AnswerKey) : null,
    misconception_markers: arr(r.misconception_markers).map((marker, index) => {
      const m = record(marker);
      return {
        misconception_id: text(m.misconception_id, `misconception_${index + 1}`, 80),
        label: text(m.label, `Misconception ${index + 1}`, 160),
        marker: typeof m.marker === "string" ? m.marker.slice(0, 200) : null,
        description: typeof m.description === "string" ? m.description.slice(0, 600) : null,
        confidence: num(m.confidence, 0.55),
      };
    }).slice(0, 6),
    renderer_params: rendererParams,
    delivery_context: r.delivery_context ?? null,
    confidence: num(r.confidence, 0.72),
    renderer_compatibility: {
      renderer_kind: probeType,
      is_renderable: true,
      blocking_reasons: [],
      warnings,
    },
  };
}

export function normalizeFullLoop(value: unknown, learnerMessage: string): FullLoopOutput {
  const r = record(value);
  const d = record(r.diagnosis);
  const diagnosisValue = typeof d.diagnosis === "string" && DIAGNOSES.includes(d.diagnosis as DiagnosisLabel) ? d.diagnosis : "unknown";

  return {
    schema_version: "myway_openai_full_loop_generate_output_v1",
    diagnosis: {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: diagnosisValue,
      diagnosis_confidence: num(d.diagnosis_confidence, 0.6),
      next_action: typeof d.next_action === "string" ? d.next_action : "generate_probe_contract",
      next_action_confidence: num(d.next_action_confidence, 0.7),
      suggested_question: typeof d.suggested_question === "string" ? d.suggested_question.slice(0, 300) : null,
      root_problem: text(d.root_problem, "The learner has a specific gap that needs a probe.", 700),
      target_topic_label: text(d.target_topic_label, "Auto-detected topic", 160),
    },
    probe: normalizeProbe(r.probe, learnerMessage),
    image_prompt: typeof r.image_prompt === "string" && r.image_prompt.trim() ? r.image_prompt.slice(0, 1800) : null,
    image_use_case: typeof r.image_use_case === "string" && r.image_use_case.trim() ? r.image_use_case.slice(0, 500) : null,
    rationale: {
      why_this_probe_type: text(record(r.rationale).why_this_probe_type, "This probe type was selected to measure the target gap.", 700),
      what_it_measures: text(record(r.rationale).what_it_measures, "Whether the learner can use the missing relationship.", 700),
      cost_note: text(record(r.rationale).cost_note, "Use the strong model first, then replace parts with cheaper models once the loop works.", 700),
    },
  };
}

export async function callResponses(args: { model: string; system: string; user: string; maxOutputTokens?: number }) {
  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      max_output_tokens: args.maxOutputTokens ?? 4200,
      text: { format: { type: "json_object" } },
    }),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenAI Responses request failed (${response.status}): ${raw.slice(0, 1200)}`);
  const data = JSON.parse(raw) as unknown;
  const content = outputText(data);
  if (!content) throw new Error(`OpenAI response did not include output text. Raw preview: ${raw.slice(0, 1000)}`);
  return content;
}
