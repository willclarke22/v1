import { buildManualTurnStorySync, MANUAL_TURN_STORY_CONTRACT } from "./story-script";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const BASIC_EXECUTABLE_BEHAVIOURS = new Set([
  "show", "show_entity", "hide", "fade_in", "fade_out", "highlight",
  "highlight_entity", "move", "move_entity", "slide", "rotate", "spin",
  "trace_path", "show_label", "show_relationship", "pause_for_check",
]);

const PREMIUM_SEMANTIC_BEHAVIOURS = new Set([
  "follow_path", "orbit", "oscillate", "pivot", "hinge", "slider_constraint",
  "two_point_linkage", "attach", "detach", "parent_follow", "look_at",
  "pour", "transfer_material", "mix", "stir", "fill", "empty", "flow",
  "filter_material", "separate_material", "accumulate", "emit", "scatter",
  "settle", "deform", "stretch", "compress", "bend", "morph_geometry",
  "crossfade_state", "replace_representation", "trigger_chain", "propagate",
]);

const CAMERA_MOVEMENTS = new Set([
  "static", "cut", "push_in", "pull_out", "dolly_in", "dolly_out", "pan",
  "tilt", "truck_left", "truck_right", "pedestal_up", "pedestal_down",
  "orbit", "follow", "track", "crane", "spline", "object_attached",
]);

export const MANUAL_TURN_AUTHORING_CONTRACT = {
  story: MANUAL_TURN_STORY_CONTRACT,
  learning_focus: {
    preferred_fields: ["misunderstanding", "target_understanding"],
    guidance:
      "Keep diagnosis concise and internal. Put the learner-friendly misunderstanding near the beginning of the canonical full_prompt.",
  },
  full_prompt: {
    source_of_truth: true,
    guidance:
      "Write one teacher-like story: name the misunderstanding, introduce the missing link, define jargon only when needed, show the causal change, and finish with the repaired mental model.",
  },
  motion: {
    semantic_behaviours: [...PREMIUM_SEMANTIC_BEHAVIOURS],
    basic_renderer_behaviours: [...BASIC_EXECUTABLE_BEHAVIOURS],
    timing_phases: ["enter", "establish", "act", "reveal_result", "hold", "transition"],
    easing_presets: [
      "instructional_smooth", "mechanical_precise", "gentle_reveal",
      "energetic_demo", "slow_examination", "rapid_transition",
      "physical_heavy", "light_float",
    ],
  },
  camera: {
    movements: [...CAMERA_MOVEMENTS],
    required_intent: [
      "focus_entity_ids", "framing_intent", "keep_visible_entity_ids",
      "avoid_occlusion_entity_ids", "reserve_text_space",
    ],
  },
} as const;

export function auditManualTurnQuality(raw: unknown) {
  const wrapper = record(raw) ?? {};
  const draft = record(wrapper.semantic_draft) ?? record(wrapper.output) ?? wrapper;
  const learningFocus = record(draft.learning_focus) ?? {};
  const learnerPrompt = record(draft.learner_facing_prompt) ?? {};
  const scene = record(draft.scene) ?? {};
  const director = record(scene.director_plan) ?? {};
  const storySync = buildManualTurnStorySync(raw);
  const misunderstanding = text(learningFocus.misunderstanding) || text(learningFocus.root_problem);
  const targetUnderstanding = text(learningFocus.target_understanding) || text(learningFocus.target_takeaway);
  const moments = array(director.moments).map(record).filter(Boolean) as JsonRecord[];

  const behaviours: Array<{ behaviour: string; fallback: string | null; status: string; moment_id: string }> = [];
  const cameraIssues: string[] = [];
  const timingIssues: string[] = [];

  for (const moment of moments) {
    const momentId = text(moment.id) || "unknown_moment";
    const camera = record(moment.camera) ?? {};
    const movement = text(camera.movement) || "static";
    if (!CAMERA_MOVEMENTS.has(movement)) cameraIssues.push(`${momentId}: unknown camera movement '${movement}'.`);
    if (!array(camera.focus_entity_ids).length) cameraIssues.push(`${momentId}: camera has no focus_entity_ids.`);
    if (!text(camera.framing_intent)) cameraIssues.push(`${momentId}: camera has no framing_intent.`);

    const phaseTiming = record(moment.phase_timing);
    if (!phaseTiming && typeof moment.duration_ms !== "number") timingIssues.push(`${momentId}: provide duration_ms or phase_timing.`);

    for (const eventValue of array(moment.events)) {
      const event = record(eventValue) ?? {};
      const behaviour = text(event.behaviour) || "unknown";
      const fallback = text(event.fallback_behaviour) || null;
      let status = "unsupported";
      if (BASIC_EXECUTABLE_BEHAVIOURS.has(behaviour)) status = "basic_executable";
      else if (PREMIUM_SEMANTIC_BEHAVIOURS.has(behaviour) && fallback && BASIC_EXECUTABLE_BEHAVIOURS.has(fallback)) status = "semantic_with_basic_fallback";
      else if (PREMIUM_SEMANTIC_BEHAVIOURS.has(behaviour)) status = "semantic_missing_fallback";
      behaviours.push({ behaviour, fallback, status, moment_id: momentId });
    }
  }

  const fullPrompt = text(learnerPrompt.full_prompt);
  const semanticMissingFallback = behaviours.filter((item) => item.status === "semantic_missing_fallback");
  const unsupported = behaviours.filter((item) => item.status === "unsupported");
  const startsWithMisunderstanding = Boolean(misunderstanding) && fullPrompt.toLowerCase().slice(0, 260).includes(misunderstanding.toLowerCase().slice(0, Math.min(70, misunderstanding.length)));

  const warnings = [
    ...(!misunderstanding ? ["Add learning_focus.misunderstanding."] : []),
    ...(!targetUnderstanding ? ["Add learning_focus.target_understanding."] : []),
    ...(!startsWithMisunderstanding ? ["The full_prompt should name the learner's misunderstanding near the beginning."] : []),
    ...storySync.warnings,
    ...cameraIssues,
    ...timingIssues,
    ...semanticMissingFallback.map((item) => `${item.moment_id}: '${item.behaviour}' needs a basic fallback_behaviour.`),
    ...unsupported.map((item) => `${item.moment_id}: '${item.behaviour}' is not in the declared motion vocabulary.`),
  ];

  const scoreParts = [
    Boolean(misunderstanding),
    Boolean(targetUnderstanding),
    startsWithMisunderstanding,
    fullPrompt.length >= 180,
    storySync.one_to_one_valid,
    moments.length >= 3,
    cameraIssues.length === 0,
    timingIssues.length === 0,
    semanticMissingFallback.length === 0,
    unsupported.length === 0,
  ];

  return {
    score: Math.round((scoreParts.filter(Boolean).length / scoreParts.length) * 100),
    learning_focus: { misunderstanding, target_understanding: targetUnderstanding, misunderstanding_near_start: startsWithMisunderstanding },
    full_prompt: { character_count: fullPrompt.length, source_of_truth: true },
    story_sync: storySync,
    director: { moment_count: moments.length, camera_issues: cameraIssues, timing_issues: timingIssues },
    motion: {
      event_count: behaviours.length,
      behaviours,
      basic_executable_count: behaviours.filter((item) => item.status === "basic_executable").length,
      semantic_with_fallback_count: behaviours.filter((item) => item.status === "semantic_with_basic_fallback").length,
      semantic_missing_fallback_count: semanticMissingFallback.length,
      unsupported_count: unsupported.length,
    },
    warnings,
    authoring_contract: MANUAL_TURN_AUTHORING_CONTRACT,
  };
}
