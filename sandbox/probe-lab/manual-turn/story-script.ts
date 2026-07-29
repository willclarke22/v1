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

export type ManualTurnStoryStep = {
  id: string;
  script: string;
  learning_job: string;
  visual_claim: string;
  introduced_terms: Array<{ term: string; plain_language_definition: string }>;
};

export type ManualTurnStorySyncReport = {
  full_prompt: string;
  reconstructed_full_prompt: string;
  story_steps: ManualTurnStoryStep[];
  moment_links: Array<{
    story_step_id: string;
    moment_ids: string[];
    script_matches_timed_text: boolean;
    has_visual_claim: boolean;
  }>;
  missing_moment_step_ids: string[];
  mismatched_script_step_ids: string[];
  unlinked_moment_ids: string[];
  exact_reconstruction: boolean;
  one_to_one_valid: boolean;
  warnings: string[];
};

export const MANUAL_TURN_STORY_CONTRACT = {
  source_of_truth: "learner_facing_prompt.full_prompt",
  required_story_shape: [
    "name_the_misunderstanding",
    "name_the_missing_link",
    "introduce_jargon_when_needed",
    "show_the_causal_change",
    "land_the_repaired_mental_model",
  ],
  invariants: [
    "story_steps must reconstruct full_prompt in order",
    "each story step has one primary learning_job",
    "each story step has at least one director moment",
    "director timed_text must reuse story_step.script verbatim",
    "visual action must prove the story step rather than merely decorate it",
    "new jargon is defined in plain language when first introduced",
  ],
} as const;

export function buildManualTurnStorySync(raw: unknown): ManualTurnStorySyncReport {
  const wrapper = record(raw) ?? {};
  const draft = record(wrapper.semantic_draft) ?? record(wrapper.output) ?? wrapper;
  const learnerPrompt = record(draft.learner_facing_prompt) ?? {};
  const scene = record(draft.scene) ?? {};
  const director = record(scene.director_plan) ?? {};

  const fullPrompt = text(learnerPrompt.full_prompt);
  const storySteps = array(learnerPrompt.story_steps)
    .map(record)
    .filter(Boolean)
    .map((step, index): ManualTurnStoryStep => ({
      id: text(step?.id) || `story_step_${index + 1}`,
      script: text(step?.script) || text(step?.text),
      learning_job: text(step?.learning_job) || text(step?.role),
      visual_claim: text(step?.visual_claim),
      introduced_terms: array(step?.introduced_terms)
        .map(record)
        .filter(Boolean)
        .map((term) => ({
          term: text(term?.term),
          plain_language_definition: text(term?.plain_language_definition),
        }))
        .filter((term) => term.term && term.plain_language_definition),
    }))
    .filter((step) => step.script);

  const moments = array(director.moments).map(record).filter(Boolean) as JsonRecord[];
  const momentByStoryStep = new Map<string, JsonRecord[]>();
  const unlinkedMomentIds: string[] = [];

  for (const moment of moments) {
    const momentId = text(moment.id) || "unknown_moment";
    const directId = text(moment.story_step_id);
    const compatibilityIds = array(moment.source_explanation_piece_ids).map(String).filter(Boolean);
    const ids = directId ? [directId] : compatibilityIds;
    if (!ids.length) unlinkedMomentIds.push(momentId);
    for (const id of ids) {
      const current = momentByStoryStep.get(id) ?? [];
      current.push(moment);
      momentByStoryStep.set(id, current);
    }
  }

  const momentLinks = storySteps.map((step) => {
    const linked = momentByStoryStep.get(step.id) ?? [];
    const scriptMatches = linked.some((moment) => {
      const timedText = record(moment.timed_text);
      const candidate = text(timedText?.text) || text(moment.spoken_text) || text(moment.narration);
      return candidate === step.script;
    });
    return {
      story_step_id: step.id,
      moment_ids: linked.map((moment) => text(moment.id) || "unknown_moment"),
      script_matches_timed_text: scriptMatches,
      has_visual_claim: Boolean(step.visual_claim),
    };
  });

  const reconstructedFullPrompt = storySteps.map((step) => step.script).join("\n\n");
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const exactReconstruction = Boolean(fullPrompt) && normalize(fullPrompt) === normalize(reconstructedFullPrompt);
  const missingMomentStepIds = momentLinks.filter((link) => !link.moment_ids.length).map((link) => link.story_step_id);
  const mismatchedScriptStepIds = momentLinks.filter((link) => link.moment_ids.length && !link.script_matches_timed_text).map((link) => link.story_step_id);

  const warnings = [
    ...(!storySteps.length ? ["No learner_facing_prompt.story_steps were supplied."] : []),
    ...(!exactReconstruction ? ["story_steps do not reconstruct learner_facing_prompt.full_prompt exactly."] : []),
    ...(missingMomentStepIds.length ? [`Story steps without director moments: ${missingMomentStepIds.join(", ")}.`] : []),
    ...(mismatchedScriptStepIds.length ? [`Director timed text does not match story script for: ${mismatchedScriptStepIds.join(", ")}.`] : []),
    ...(unlinkedMomentIds.length ? [`Director moments without a story_step_id: ${unlinkedMomentIds.join(", ")}.`] : []),
    ...momentLinks.filter((link) => !link.has_visual_claim).map((link) => `${link.story_step_id}: add a visual_claim that states what the scene must prove.`),
  ];

  return {
    full_prompt: fullPrompt,
    reconstructed_full_prompt: reconstructedFullPrompt,
    story_steps: storySteps,
    moment_links: momentLinks,
    missing_moment_step_ids: missingMomentStepIds,
    mismatched_script_step_ids: mismatchedScriptStepIds,
    unlinked_moment_ids: unlinkedMomentIds,
    exact_reconstruction: exactReconstruction,
    one_to_one_valid:
      storySteps.length > 0 &&
      exactReconstruction &&
      missingMomentStepIds.length === 0 &&
      mismatchedScriptStepIds.length === 0 &&
      unlinkedMomentIds.length === 0,
    warnings,
  };
}
