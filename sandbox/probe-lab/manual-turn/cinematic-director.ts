type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function words(value: string): number {
  return value.trim().match(/\S+/g)?.length ?? 0;
}

function sentenceCues(script: string): string[] {
  const matches = script.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
  return matches.length ? matches : [script];
}

function cueDurationMs(script: string, visualComplexity = 1): number {
  const readingMs = (words(script) / 185) * 60_000;
  const punctuationPauses = (script.match(/[,:;—→]/g)?.length ?? 0) * 170;
  const jargonPause = /called the|called a|—the|means|mechanism/i.test(script) ? 550 : 0;
  return Math.round(Math.max(1900, readingMs + punctuationPauses + jargonPause + visualComplexity * 420));
}

export type CinematicScriptCue = {
  id: string;
  story_step_id: string;
  moment_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  visual_event_ids: string[];
};

export type CinematicMomentRange = {
  id: string;
  story_step_id: string;
  start_ms: number;
  end_ms: number;
  director_intent: string;
  success_observation: string;
};

export type CinematicCameraKeyframe = {
  time_ms: number;
  moment_id: string;
  shot_type: string;
  movement: string;
  focus_entity_ids: string[];
  keep_visible_entity_ids: string[];
  avoid_occlusion_entity_ids: string[];
  framing_intent: string;
  transition: "cut" | "smooth_blend";
};

export type CinematicMotionTrack = {
  id: string;
  moment_id: string;
  actor_entity_id: string;
  target_entity_id: string | null;
  supporting_entity_ids: string[];
  requested_behaviour: string;
  compiled_controller: string;
  capability_status: "direct" | "compound" | "approximate" | "unsupported";
  start_ms: number;
  end_ms: number;
  easing: string;
  description: string;
};

export type CinematicDirectorTimeline = {
  schema_version: "myway_continuous_cinematic_timeline_v1";
  duration_ms: number;
  full_prompt: string;
  exact_script_required: true;
  script_cues: CinematicScriptCue[];
  moment_ranges: CinematicMomentRange[];
  camera_track: CinematicCameraKeyframe[];
  motion_tracks: CinematicMotionTrack[];
  constraint_contracts: Array<{
    controller: string;
    master_parameter: string;
    entity_ids: string[];
    invariant: string;
  }>;
  capability_warnings: string[];
  legacy_beats_are_playback_authority: false;
};

const directBehaviours = new Set([
  "show_entity", "hide_entity", "highlight_entity", "show_label", "show_relationship",
  "slide", "translate", "rotate", "trace_path", "fade", "scale", "transform",
]);

const compoundControllers: Record<string, string> = {
  oscillate: "reciprocating_slider",
  two_point_linkage: "rigid_two_anchor_linkage",
  follow_anchor: "anchored_follower",
  slider_crank_cycle: "slider_crank_mechanism",
  pour: "pour_transfer_controller",
  stir: "stir_path_controller",
  filter_material: "material_filter_controller",
  flow: "flow_path_controller",
  orbit: "orbital_path_controller",
};

function classifyBehaviour(behaviour: string, fallback: string) {
  if (directBehaviours.has(behaviour)) {
    return { controller: behaviour, status: "direct" as const };
  }
  if (compoundControllers[behaviour]) {
    return { controller: compoundControllers[behaviour], status: "compound" as const };
  }
  if (fallback && directBehaviours.has(fallback)) {
    return { controller: fallback, status: "approximate" as const };
  }
  return { controller: behaviour || "none", status: "unsupported" as const };
}

export const CINEMATIC_DIRECTOR_CONTRACT = {
  creative_chain: [
    "exact_full_prompt",
    "exact_phrase_cues",
    "continuous_master_timeline",
    "constraint_driven_motion",
    "continuous_camera_choreography",
    "synchronized_transcript_highlighting",
  ],
  director_responsibilities: [
    "state what the audience must understand",
    "state what must remain visible",
    "state the attention sequence",
    "request cinematic movement and composition",
    "define a measurable success observation",
  ],
  compiler_responsibilities: [
    "preserve exact learner-facing words",
    "derive timing from script and visual complexity",
    "expand semantic motion into controllers and constraints",
    "turn camera intent into a continuous keyframe track",
    "warn rather than silently distort unsupported direction",
  ],
  renderer_responsibilities: [
    "evaluate one master clock",
    "execute compiled motion and camera tracks",
    "keep constrained entities physically coherent",
    "display and highlight the exact script",
  ],
} as const;

export function compileCinematicDirectorTimeline(raw: unknown): CinematicDirectorTimeline {
  const wrapper = record(raw) ?? {};
  const draft = record(wrapper.semantic_draft) ?? record(wrapper.output) ?? wrapper;
  const learnerPrompt = record(draft.learner_facing_prompt) ?? {};
  const scene = record(draft.scene) ?? {};
  const director = record(scene.director_plan) ?? {};
  const storySteps = array(learnerPrompt.story_steps).map(record).filter(Boolean) as JsonRecord[];
  const moments = array(director.moments).map(record).filter(Boolean) as JsonRecord[];
  const momentByStep = new Map<string, JsonRecord>();
  moments.forEach((moment) => {
    const stepId = text(moment.story_step_id) || text(array(moment.source_explanation_piece_ids)[0]);
    if (stepId && !momentByStep.has(stepId)) momentByStep.set(stepId, moment);
  });

  const scriptCues: CinematicScriptCue[] = [];
  const momentRanges: CinematicMomentRange[] = [];
  const cameraTrack: CinematicCameraKeyframe[] = [];
  const motionTracks: CinematicMotionTrack[] = [];
  const warnings: string[] = [];
  let cursor = 0;

  storySteps.forEach((step, stepIndex) => {
    const stepId = text(step.id, `step_${stepIndex + 1}`);
    const script = text(step.script) || text(step.text);
    const moment = momentByStep.get(stepId) ?? moments[stepIndex] ?? {};
    const momentId = text(moment.id, `moment_${stepIndex + 1}`);
    const events = array(moment.events).map(record).filter(Boolean) as JsonRecord[];
    const cues = sentenceCues(script);
    const momentStart = cursor;

    cues.forEach((cueText, cueIndex) => {
      const eventIds = events
        .filter((_, eventIndex) => eventIndex % Math.max(1, cues.length) === cueIndex || cues.length === 1)
        .map((event, eventIndex) => text(event.id, `${momentId}_event_${eventIndex + 1}`));
      const duration = cueDurationMs(cueText, Math.max(1, eventIds.length));
      scriptCues.push({
        id: `${stepId}_cue_${cueIndex + 1}`,
        story_step_id: stepId,
        moment_id: momentId,
        text: cueText,
        start_ms: cursor,
        end_ms: cursor + duration,
        visual_event_ids: eventIds,
      });
      cursor += duration;
    });

    cursor += 650;
    const momentEnd = cursor;
    momentRanges.push({
      id: momentId,
      story_step_id: stepId,
      start_ms: momentStart,
      end_ms: momentEnd,
      director_intent: text(moment.director_intent) || text(step.visual_claim),
      success_observation: text(moment.success_observation) || text(step.visual_claim),
    });

    const camera = record(moment.camera) ?? {};
    cameraTrack.push({
      time_ms: momentStart,
      moment_id: momentId,
      shot_type: text(camera.shot_type, stepIndex === 0 ? "wide" : "medium_close"),
      movement: text(camera.movement, stepIndex === 0 ? "static" : "smooth_track"),
      focus_entity_ids: array(camera.focus_entity_ids).map(String).filter(Boolean),
      keep_visible_entity_ids: array(camera.keep_visible_entity_ids).map(String).filter(Boolean),
      avoid_occlusion_entity_ids: array(camera.avoid_occlusion_entity_ids).map(String).filter(Boolean),
      framing_intent: text(camera.framing_intent) || text(moment.director_intent),
      transition: stepIndex === 0 || text(camera.transition).toLowerCase() === "cut" ? "cut" : "smooth_blend",
    });

    events.forEach((event, eventIndex) => {
      const requested = text(event.behaviour, text(event.type, "none"));
      const fallback = text(event.fallback_behaviour);
      const classification = classifyBehaviour(requested, fallback);
      const relativeStart = numberValue(event.start_ms, 0);
      const requestedDuration = numberValue(event.duration_ms, Math.max(800, momentEnd - momentStart - relativeStart));
      const trackStart = Math.min(momentEnd, momentStart + relativeStart);
      const trackEnd = Math.min(momentEnd, trackStart + requestedDuration);
      const track: CinematicMotionTrack = {
        id: text(event.id, `${momentId}_motion_${eventIndex + 1}`),
        moment_id: momentId,
        actor_entity_id: text(event.actor_entity_id, text(event.entity_id)),
        target_entity_id: text(event.target_entity_id) || null,
        supporting_entity_ids: array(event.supporting_entity_ids).map(String).filter(Boolean),
        requested_behaviour: requested,
        compiled_controller: classification.controller,
        capability_status: classification.status,
        start_ms: trackStart,
        end_ms: Math.max(trackStart + 1, trackEnd),
        easing: text(event.easing, "instructional_smooth"),
        description: text(event.description, requested),
      };
      motionTracks.push(track);
      if (classification.status === "approximate") {
        warnings.push(`${track.id}: ${requested} is currently approximated with ${classification.controller}; verify that the fallback preserves the teaching claim.`);
      }
      if (classification.status === "unsupported") {
        warnings.push(`${track.id}: ${requested} has no executable controller and must not be silently treated as successful.`);
      }
    });
  });

  const entityIds = array(scene.entities).map(record).filter(Boolean).map((entity) => text(entity?.id)).filter(Boolean);
  const pistonEntities = ["piston", "rod", "crank"].filter((id) => entityIds.includes(id));
  const constraintContracts = pistonEntities.length === 3
    ? [{
        controller: "slider_crank_mechanism",
        master_parameter: "crank_angle",
        entity_ids: [...pistonEntities, ...(entityIds.includes("wheel") ? ["wheel"] : [])],
        invariant: "crank pin follows a circle; rod length stays constant; rod remains attached at both ends; piston is constrained to one axis; wheel rotation is derived from crank angle",
      }]
    : [];

  return {
    schema_version: "myway_continuous_cinematic_timeline_v1",
    duration_ms: Math.max(1, cursor),
    full_prompt: text(learnerPrompt.full_prompt),
    exact_script_required: true,
    script_cues: scriptCues,
    moment_ranges: momentRanges,
    camera_track: cameraTrack,
    motion_tracks: motionTracks,
    constraint_contracts: constraintContracts,
    capability_warnings: [...new Set(warnings)],
    legacy_beats_are_playback_authority: false,
  };
}
