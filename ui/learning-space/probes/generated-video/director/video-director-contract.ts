export type MyWayVideoDirectorSchemaVersion = "myway_video_director_contract_v1";

export type VideoDirectorBridgeLevel =
  | "bridge_0"
  | "bridge_1"
  | "bridge_2"
  | "full_bridge";

export type VideoDirectorDiagnosisLabel =
  | "unknown"
  | "no_gap_detected"
  | "recall_gap"
  | "representation_gap"
  | "procedure_gap"
  | "discrimination_gap"
  | "transfer_gap"
  | "metacognitive_gap";

export type VideoDirectorRendererTarget =
  | "remotion_svg_2d"
  | "surface_3d"
  | "flow_system_3d"
  | "state_transition_3d"
  | "comparison_space_3d"
  | "hybrid_timeline_3d";

export type VideoDirectorSceneKind =
  | "surface_3d"
  | "flow_system_3d"
  | "state_transition_3d"
  | "comparison_space_3d"
  | "object_relationship_3d";

export type VideoDirectorCapability =
  | "remotion_timeline"
  | "svg_2d_primitives"
  | "webgl_3d_scene"
  | "surface_mesh"
  | "camera_orbit"
  | "slice_planes"
  | "glow_trails"
  | "particle_flow"
  | "billboard_labels"
  | "checkpoint_overlay";

export type VideoDirectorPresentationStyle =
  | "plain_direct"
  | "gentle_coaching"
  | "analogy_based"
  | "metaphor_based"
  | "concrete_examples"
  | "step_by_step"
  | "visual_description"
  | "curiosity_question"
  | "real_world_connection";

export type VideoDirectorLanguagePolicy = {
  jargon_level: "none" | "light" | "standard" | "full";
};

export type VideoDirectorLearningContext = {
  topic_label?: string | null;
  diagnosis_label?: VideoDirectorDiagnosisLabel | null;
  root_problem?: string | null;
  misconception_target?: string | null;
  bridge_level: VideoDirectorBridgeLevel;
  language_policy: VideoDirectorLanguagePolicy;
  prior_attempt_summary?: string | null;
};

export type VideoDirectorPersonalizationProfile = {
  interests: string[];
  preferred_explanation_style: VideoDirectorPresentationStyle[];
  avoidances: string[];
  known_good_metaphors: string[];
  profile_summary?: string | null;
};

export type VideoDirectorRendererCapabilities = {
  supports_remotion_timeline: boolean;
  supports_svg_2d_primitives: boolean;
  supports_webgl_3d_scene: boolean;
  supports_surface_mesh: boolean;
  supports_camera_orbit: boolean;
  supports_slice_planes: boolean;
  supports_glow_trails: boolean;
  supports_particle_flow: boolean;
  supports_billboard_labels: boolean;
  supports_checkpoint_overlay: boolean;
};

export type VideoDirectorRequestContext = {
  learner_message: string;
  attempt_context?: {
    attempt_type?: string | null;
    attempt_summary?: string | null;
    attempt_text?: string | null;
    correctness_summary?: string | null;
    may_be_lucky_guess?: boolean | null;
  } | null;
  learning_context: VideoDirectorLearningContext;
  personalization_profile: VideoDirectorPersonalizationProfile;
  renderer_capabilities: VideoDirectorRendererCapabilities;
};

export type VideoDirectorCreativeBrief = {
  desired_feeling: string;
  visual_metaphor: string;
  aha_moment: string;
  what_to_avoid: string[];
  why_this_should_unstick_the_learner: string;
};

export type VideoDirectorRendererIntent = {
  preferred_renderer: VideoDirectorRendererTarget;
  fallback_renderer: VideoDirectorRendererTarget;
  scene_kind: VideoDirectorSceneKind;
  required_capabilities: VideoDirectorCapability[];
  camera_language?: string | null;
  style_language?: string | null;
};

export type VideoDirectorConceptualObjectRole =
  | "actor"
  | "surface"
  | "axis"
  | "force"
  | "state"
  | "path"
  | "container"
  | "label"
  | "comparison"
  | "evidence"
  | "rule"
  | "checkpoint";

export type VideoDirectorConceptualObject = {
  id: string;
  role: VideoDirectorConceptualObjectRole;
  name: string;
  meaning: string;
  visual_hint: string;
};

export type VideoDirectorRelationshipKind =
  | "causes"
  | "opposes"
  | "transforms"
  | "reveals"
  | "depends_on"
  | "same_point_different_direction"
  | "supports"
  | "contrasts"
  | "flows_to"
  | "must_happen_before";

export type VideoDirectorRelationship = {
  id: string;
  from: string;
  to: string;
  kind: VideoDirectorRelationshipKind;
  explanation: string;
};

export type VideoDirectorBeat = {
  id: string;
  purpose: string;
  learner_thought_before?: string | null;
  visual_change: string;
  narration?: string | null;
  focus_object_ids: string[];
  motion_intents: string[];
  expected_realization: string;
  duration_seconds: number;
};

export type VideoDirectorVisualModel = {
  scene_kind: VideoDirectorSceneKind;
  surface_3d?: {
    expression?: string | null;
    x_label?: string | null;
    y_label?: string | null;
    z_label?: string | null;
    highlight_slices?: Array<"x" | "y" | "both">;
  } | null;
  flow_system_3d?: {
    nodes?: Array<{ id: string; label: string; role?: string | null }>;
    flows?: Array<{ from: string; to: string; label?: string | null }>;
  } | null;
  comparison_space_3d?: {
    left_label?: string | null;
    right_label?: string | null;
    contrast_label?: string | null;
  } | null;
  state_transition_3d?: {
    states?: Array<{ id: string; label: string; description?: string | null }>;
    transition_label?: string | null;
  } | null;
};

export type MyWayVideoDirectorContract = {
  schema_version: MyWayVideoDirectorSchemaVersion;
  contract_id: string;
  title: string;
  learner_message: string;
  learning_context: VideoDirectorLearningContext;
  personalization_profile: VideoDirectorPersonalizationProfile;
  creative_brief: VideoDirectorCreativeBrief;
  renderer_intent: VideoDirectorRendererIntent;
  conceptual_objects: VideoDirectorConceptualObject[];
  relationships: VideoDirectorRelationship[];
  beats: VideoDirectorBeat[];
  visual_model: VideoDirectorVisualModel;
  checkpoint: {
    prompt: string;
    expected_idea: string;
  };
  safety_notes: string[];
};

const DIAGNOSIS_LABELS = new Set<VideoDirectorDiagnosisLabel>([
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
]);

const BRIDGE_LEVELS = new Set<VideoDirectorBridgeLevel>([
  "bridge_0",
  "bridge_1",
  "bridge_2",
  "full_bridge",
]);

const SCENE_KINDS = new Set<VideoDirectorSceneKind>([
  "surface_3d",
  "flow_system_3d",
  "state_transition_3d",
  "comparison_space_3d",
  "object_relationship_3d",
]);

const RENDERER_TARGETS = new Set<VideoDirectorRendererTarget>([
  "remotion_svg_2d",
  "surface_3d",
  "flow_system_3d",
  "state_transition_3d",
  "comparison_space_3d",
  "hybrid_timeline_3d",
]);

const CAPABILITIES = new Set<VideoDirectorCapability>([
  "remotion_timeline",
  "svg_2d_primitives",
  "webgl_3d_scene",
  "surface_mesh",
  "camera_orbit",
  "slice_planes",
  "glow_trails",
  "particle_flow",
  "billboard_labels",
  "checkpoint_overlay",
]);

const OBJECT_ROLES = new Set<VideoDirectorConceptualObjectRole>([
  "actor",
  "surface",
  "axis",
  "force",
  "state",
  "path",
  "container",
  "label",
  "comparison",
  "evidence",
  "rule",
  "checkpoint",
]);

const RELATIONSHIP_KINDS = new Set<VideoDirectorRelationshipKind>([
  "causes",
  "opposes",
  "transforms",
  "reveals",
  "depends_on",
  "same_point_different_direction",
  "supports",
  "contrasts",
  "flows_to",
  "must_happen_before",
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown, fallback: string, maxLength = 240) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return clamp(numberValue, min, max);
}

function asStringArray(value: unknown, fallback: string[], maxItems = 8, maxLength = 90) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => asText(item, "", maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
  return cleaned.length ? cleaned : fallback;
}

function asInterestArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => {
      if (typeof item === "string") return asText(item, "", 70);
      const record = asRecord(item);
      return asText(record.interest ?? record.value ?? record.label, "", 70);
    })
    .filter(Boolean)
    .slice(0, 8);
  return cleaned.length ? cleaned : fallback;
}

function sanitizeId(value: unknown, fallback: string) {
  const text = asText(value, fallback, 64).toLowerCase();
  return text.replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

function asDiagnosis(value: unknown, fallback: VideoDirectorDiagnosisLabel): VideoDirectorDiagnosisLabel {
  return typeof value === "string" && DIAGNOSIS_LABELS.has(value as VideoDirectorDiagnosisLabel)
    ? (value as VideoDirectorDiagnosisLabel)
    : fallback;
}

function asBridge(value: unknown, fallback: VideoDirectorBridgeLevel): VideoDirectorBridgeLevel {
  return typeof value === "string" && BRIDGE_LEVELS.has(value as VideoDirectorBridgeLevel)
    ? (value as VideoDirectorBridgeLevel)
    : fallback;
}

function asSceneKind(value: unknown, fallback: VideoDirectorSceneKind): VideoDirectorSceneKind {
  return typeof value === "string" && SCENE_KINDS.has(value as VideoDirectorSceneKind)
    ? (value as VideoDirectorSceneKind)
    : fallback;
}

function asRendererTarget(value: unknown, fallback: VideoDirectorRendererTarget): VideoDirectorRendererTarget {
  return typeof value === "string" && RENDERER_TARGETS.has(value as VideoDirectorRendererTarget)
    ? (value as VideoDirectorRendererTarget)
    : fallback;
}

function asCapabilityArray(value: unknown, fallback: VideoDirectorCapability[]) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => (typeof item === "string" && CAPABILITIES.has(item as VideoDirectorCapability) ? (item as VideoDirectorCapability) : null))
    .filter((item): item is VideoDirectorCapability => Boolean(item))
    .slice(0, 10);
  return cleaned.length ? cleaned : fallback;
}

function asObjectRole(value: unknown, fallback: VideoDirectorConceptualObjectRole): VideoDirectorConceptualObjectRole {
  return typeof value === "string" && OBJECT_ROLES.has(value as VideoDirectorConceptualObjectRole)
    ? (value as VideoDirectorConceptualObjectRole)
    : fallback;
}

function asRelationshipKind(value: unknown, fallback: VideoDirectorRelationshipKind): VideoDirectorRelationshipKind {
  return typeof value === "string" && RELATIONSHIP_KINDS.has(value as VideoDirectorRelationshipKind)
    ? (value as VideoDirectorRelationshipKind)
    : fallback;
}

export function stableVideoDirectorContractId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `video_director_${hash.toString(16).padStart(8, "0")}`;
}

export function buildDefaultVideoDirectorRendererCapabilities(): VideoDirectorRendererCapabilities {
  return {
    supports_remotion_timeline: true,
    supports_svg_2d_primitives: true,
    supports_webgl_3d_scene: true,
    supports_surface_mesh: true,
    supports_camera_orbit: true,
    supports_slice_planes: true,
    supports_glow_trails: true,
    supports_particle_flow: true,
    supports_billboard_labels: true,
    supports_checkpoint_overlay: true,
  };
}

function inferTopicLabel(message: string) {
  const lower = message.toLowerCase();
  if (/saddle|x\^?2|x²|y\^?2|y²|surface|graph/.test(lower)) return "3D surfaces and equations";
  if (/claim|evidence|essay|paragraph|argument/.test(lower)) return "Claim and evidence";
  if (/electron|oxidation|reduction|chem/.test(lower)) return "Electron transfer";
  if (/circuit|current|resistance|voltage/.test(lower)) return "Electric circuits";
  if (/bank|loan|money|record|ledger/.test(lower)) return "Money and bank records";
  if (/baseball|tag|runner|fly ball/.test(lower)) return "Baseball tag-up rule";
  if (/spanish| se |reflexive|passive/.test(` ${lower} `)) return "Spanish se";
  return "Learner's stuck point";
}

function inferSceneKind(message: string, rootProblem?: string | null): VideoDirectorSceneKind {
  const text = `${message} ${rootProblem ?? ""}`.toLowerCase();
  if (/saddle|surface|x\^?2|x²|y\^?2|y²|z\s*=|graph|paraboloid/.test(text)) return "surface_3d";
  if (/flow|move|transfer|electron|current|circuit|money|loan|bank|fluid|pipe|plumb|valve/.test(text)) return "flow_system_3d";
  if (/state|before|after|change|transform|compile|runtime|phase|step/.test(text)) return "state_transition_3d";
  if (/claim|evidence|compare|contrast|which one|mixing up|discriminat/.test(text)) return "comparison_space_3d";
  return "object_relationship_3d";
}

function fallbackDiagnosisForSceneKind(sceneKind: VideoDirectorSceneKind): VideoDirectorDiagnosisLabel {
  if (sceneKind === "comparison_space_3d") return "discrimination_gap";
  if (sceneKind === "surface_3d" || sceneKind === "object_relationship_3d") return "representation_gap";
  if (sceneKind === "flow_system_3d" || sceneKind === "state_transition_3d") return "procedure_gap";
  return "unknown";
}

export function buildDefaultVideoDirectorRequestContext(learnerMessage: string): VideoDirectorRequestContext {
  const message = learnerMessage.trim() || "I am stuck on this idea.";
  const sceneKind = inferSceneKind(message);
  return {
    learner_message: message,
    attempt_context: null,
    learning_context: {
      topic_label: inferTopicLabel(message),
      diagnosis_label: fallbackDiagnosisForSceneKind(sceneKind),
      root_problem: "The learner has pieces of the idea but cannot yet see the relationship that makes them work together.",
      misconception_target: "Treating the pieces as separate instead of seeing the changing relationship between them.",
      bridge_level: "bridge_0",
      language_policy: { jargon_level: "none" },
      prior_attempt_summary: null,
    },
    personalization_profile: {
      interests: ["clear visual explanations", "interactive diagrams"],
      preferred_explanation_style: ["visual_description", "concrete_examples", "step_by_step"],
      avoidances: ["long textbook narration", "decorative personalization that does not clarify the idea"],
      known_good_metaphors: [],
      profile_summary: "Use personalization only if it makes the hidden relationship easier to see.",
    },
    renderer_capabilities: buildDefaultVideoDirectorRendererCapabilities(),
  };
}

export function normalizeVideoDirectorRequestContext(input: unknown): VideoDirectorRequestContext {
  const record = asRecord(input);
  const learnerMessage = asText(record.learner_message ?? record.learnerMessage ?? record.learner_signal, "I am stuck on this idea.", 1200);
  const fallback = buildDefaultVideoDirectorRequestContext(learnerMessage);
  const learning = asRecord(record.learning_context ?? record.learningContext);
  const languagePolicy = asRecord(learning.language_policy ?? learning.languagePolicy);
  const personalization = asRecord(record.personalization_profile ?? record.personalizationProfile ?? record.personalization_context);
  const attempt = asRecord(record.attempt_context ?? record.attemptContext);
  const capabilities = asRecord(record.renderer_capabilities ?? record.rendererCapabilities);

  const interests = asInterestArray(
    personalization.interests ?? personalization.user_interests ?? personalization.userInterests,
    fallback.personalization_profile.interests,
  );

  return {
    learner_message: learnerMessage,
    attempt_context: Object.keys(attempt).length
      ? {
          attempt_type: asText(attempt.attempt_type ?? attempt.attemptType, "", 60) || null,
          attempt_summary: asText(attempt.attempt_summary ?? attempt.attemptSummary, "", 240) || null,
          attempt_text: asText(attempt.attempt_text ?? attempt.attemptText ?? attempt.text_response, "", 500) || null,
          correctness_summary: asText(attempt.correctness_summary ?? attempt.correctnessSummary, "", 240) || null,
          may_be_lucky_guess:
            typeof attempt.may_be_lucky_guess === "boolean"
              ? attempt.may_be_lucky_guess
              : typeof attempt.possible_guess === "boolean"
                ? attempt.possible_guess
                : null,
        }
      : fallback.attempt_context,
    learning_context: {
      topic_label: asText(learning.topic_label ?? learning.topicLabel, fallback.learning_context.topic_label ?? "Learner's stuck point", 120),
      diagnosis_label: asDiagnosis(learning.diagnosis_label ?? learning.diagnosisLabel, fallback.learning_context.diagnosis_label ?? "unknown"),
      root_problem: asText(learning.root_problem ?? learning.rootProblem, fallback.learning_context.root_problem ?? "", 320),
      misconception_target: asText(learning.misconception_target ?? learning.misconceptionTarget, fallback.learning_context.misconception_target ?? "", 320),
      bridge_level: asBridge(learning.bridge_level ?? learning.bridgeLevel, fallback.learning_context.bridge_level),
      language_policy: {
        jargon_level: asText(languagePolicy.jargon_level ?? languagePolicy.jargonLevel, fallback.learning_context.language_policy.jargon_level, 20) as VideoDirectorLanguagePolicy["jargon_level"],
      },
      prior_attempt_summary: asText(learning.prior_attempt_summary ?? learning.priorAttemptSummary, "", 320) || null,
    },
    personalization_profile: {
      interests,
      preferred_explanation_style: asStringArray(
        personalization.preferred_explanation_style ?? personalization.preferredExplanationStyle ?? personalization.preferred_order,
        fallback.personalization_profile.preferred_explanation_style,
        6,
        40,
      ).filter((style): style is VideoDirectorPresentationStyle =>
        [
          "plain_direct",
          "gentle_coaching",
          "analogy_based",
          "metaphor_based",
          "concrete_examples",
          "step_by_step",
          "visual_description",
          "curiosity_question",
          "real_world_connection",
        ].includes(style),
      ),
      avoidances: asStringArray(personalization.avoidances, fallback.personalization_profile.avoidances, 8, 90),
      known_good_metaphors: asStringArray(personalization.known_good_metaphors ?? personalization.knownGoodMetaphors, fallback.personalization_profile.known_good_metaphors, 6, 80),
      profile_summary:
        asText(
          personalization.profile_summary ?? personalization.profileSummary ?? personalization.profile_snapshot ?? personalization.profileSnapshot,
          fallback.personalization_profile.profile_summary ?? "",
          420,
        ) || null,
    },
    renderer_capabilities: {
      supports_remotion_timeline: asBoolean(capabilities.supports_remotion_timeline ?? capabilities.supportsRemotionTimeline, fallback.renderer_capabilities.supports_remotion_timeline),
      supports_svg_2d_primitives: asBoolean(capabilities.supports_svg_2d_primitives ?? capabilities.supportsSvg2dPrimitives, fallback.renderer_capabilities.supports_svg_2d_primitives),
      supports_webgl_3d_scene: asBoolean(capabilities.supports_webgl_3d_scene ?? capabilities.supportsWebgl3dScene, fallback.renderer_capabilities.supports_webgl_3d_scene),
      supports_surface_mesh: asBoolean(capabilities.supports_surface_mesh ?? capabilities.supportsSurfaceMesh, fallback.renderer_capabilities.supports_surface_mesh),
      supports_camera_orbit: asBoolean(capabilities.supports_camera_orbit ?? capabilities.supportsCameraOrbit, fallback.renderer_capabilities.supports_camera_orbit),
      supports_slice_planes: asBoolean(capabilities.supports_slice_planes ?? capabilities.supportsSlicePlanes, fallback.renderer_capabilities.supports_slice_planes),
      supports_glow_trails: asBoolean(capabilities.supports_glow_trails ?? capabilities.supportsGlowTrails, fallback.renderer_capabilities.supports_glow_trails),
      supports_particle_flow: asBoolean(capabilities.supports_particle_flow ?? capabilities.supportsParticleFlow, fallback.renderer_capabilities.supports_particle_flow),
      supports_billboard_labels: asBoolean(capabilities.supports_billboard_labels ?? capabilities.supportsBillboardLabels, fallback.renderer_capabilities.supports_billboard_labels),
      supports_checkpoint_overlay: asBoolean(capabilities.supports_checkpoint_overlay ?? capabilities.supportsCheckpointOverlay, fallback.renderer_capabilities.supports_checkpoint_overlay),
    },
  };
}

function buildFallbackObjects(sceneKind: VideoDirectorSceneKind): VideoDirectorConceptualObject[] {
  if (sceneKind === "surface_3d") {
    return [
      { id: "current_picture", role: "state", name: "Current picture", meaning: "The learner's first mental model", visual_hint: "a dim flat sheet" },
      { id: "x_slice", role: "axis", name: "x direction", meaning: "One direction through the same point", visual_hint: "bright left-right slice" },
      { id: "y_slice", role: "axis", name: "y direction", meaning: "The crossing direction through the same point", visual_hint: "bright front-back slice" },
      { id: "surface", role: "surface", name: "Combined surface", meaning: "The full relationship after both directions act together", visual_hint: "transparent surface mesh" },
    ];
  }

  if (sceneKind === "flow_system_3d") {
    return [
      { id: "source", role: "container", name: "Source", meaning: "Where the moving thing starts", visual_hint: "left glowing node" },
      { id: "moving_item", role: "actor", name: "Moving item", meaning: "The thing being transferred or changed", visual_hint: "small bright particle" },
      { id: "path", role: "path", name: "Path", meaning: "The hidden route or rule", visual_hint: "glowing trail" },
      { id: "receiver", role: "container", name: "Receiver", meaning: "Where the effect lands", visual_hint: "right glowing node" },
    ];
  }

  if (sceneKind === "comparison_space_3d") {
    return [
      { id: "left_case", role: "comparison", name: "Looks similar", meaning: "One option the learner may choose", visual_hint: "left panel" },
      { id: "job_test", role: "rule", name: "Job test", meaning: "The rule that separates the options", visual_hint: "center spotlight" },
      { id: "right_case", role: "comparison", name: "Actually different", meaning: "The corrected option", visual_hint: "right panel" },
    ];
  }

  return [
    { id: "before", role: "state", name: "Before", meaning: "What the learner currently sees", visual_hint: "left object" },
    { id: "hidden_link", role: "rule", name: "Hidden link", meaning: "The relationship that explains the result", visual_hint: "center glowing connector" },
    { id: "after", role: "state", name: "After", meaning: "What becomes clear after the rule is visible", visual_hint: "right object" },
  ];
}

function buildFallbackRelationships(objects: VideoDirectorConceptualObject[], sceneKind: VideoDirectorSceneKind): VideoDirectorRelationship[] {
  if (sceneKind === "surface_3d") {
    return [
      { id: "x_and_y_cross", from: "x_slice", to: "y_slice", kind: "same_point_different_direction", explanation: "Both slices pass through the same point but bend differently." },
      { id: "slices_make_surface", from: "x_slice", to: "surface", kind: "reveals", explanation: "The surface is easier to see after the directions are separated." },
    ];
  }

  if (objects.length >= 3) {
    return [
      { id: "first_link", from: objects[0]!.id, to: objects[1]!.id, kind: sceneKind === "flow_system_3d" ? "flows_to" : "reveals", explanation: "The animation shows the missing link rather than only naming it." },
      { id: "second_link", from: objects[1]!.id, to: objects[2]!.id, kind: sceneKind === "comparison_space_3d" ? "contrasts" : "transforms", explanation: "The learner sees how the corrected relationship changes the result." },
    ];
  }

  return [];
}

function buildFallbackBeats(objects: VideoDirectorConceptualObject[], sceneKind: VideoDirectorSceneKind, context: VideoDirectorRequestContext): VideoDirectorBeat[] {
  const ids = objects.map((object) => object.id);
  return [
    {
      id: "show_current_picture",
      purpose: "Start from the learner's current mental picture.",
      learner_thought_before: context.learning_context.root_problem,
      visual_change: "Place the main objects on screen and show the tempting incomplete picture.",
      narration: "Start with the way this currently looks.",
      focus_object_ids: ids.slice(0, 2),
      motion_intents: ["soft reveal", "hold the confusing part still"],
      expected_realization: "This is the picture that was missing one relationship.",
      duration_seconds: 4.5,
    },
    {
      id: "reveal_missing_relationship",
      purpose: "Reveal the exact relationship that explains the root problem.",
      learner_thought_before: null,
      visual_change: sceneKind === "surface_3d" ? "Separate the two directions, then highlight their opposite behavior." : "Move a glowing connector or particle through the hidden rule.",
      narration: "Now watch the part that changes the meaning.",
      focus_object_ids: ids,
      motion_intents: ["draw hidden path", "pulse rule", "camera orbit"],
      expected_realization: "The result follows from this relationship, not from memorizing a label.",
      duration_seconds: 6,
    },
    {
      id: "lock_in_checkpoint",
      purpose: "Let the learner test the newly visible relationship.",
      learner_thought_before: null,
      visual_change: "Freeze on the corrected relationship and ask a short checkpoint.",
      narration: "Use the visual to answer one check.",
      focus_object_ids: ids.slice(-2),
      motion_intents: ["freeze corrected view", "checkpoint spotlight"],
      expected_realization: "The learner can name the relationship in their own words.",
      duration_seconds: 5,
    },
  ];
}

function fallbackCreativeBrief(context: VideoDirectorRequestContext, sceneKind: VideoDirectorSceneKind): VideoDirectorCreativeBrief {
  const interest = context.personalization_profile.interests[0];
  const bridgeNote = context.learning_context.bridge_level === "bridge_0" ? "Use no jargon and make the relationship visible before naming it." : "Name the relationship after the visual reveal.";
  return {
    desired_feeling: "The learner should feel that MyWay saw the exact stuck point and made the hidden relationship visible.",
    visual_metaphor:
      sceneKind === "surface_3d"
        ? "A shape that changes differently depending on which direction you walk through it."
        : interest
          ? `A clean visual scene that may borrow from ${interest} only if it clarifies the root problem.`
          : "A clean visual scene that shows before, hidden link, and corrected result.",
    aha_moment: "The result changes because one relationship was hidden, not because the learner needed more wording.",
    what_to_avoid: ["long captions", "generic explainer lecture", "decorative personalization", "model-written code", "too many moving parts"],
    why_this_should_unstick_the_learner: `${bridgeNote} The animation targets: ${context.learning_context.root_problem ?? "the root problem"}`,
  };
}

function fallbackVisualModel(sceneKind: VideoDirectorSceneKind, message: string): VideoDirectorVisualModel {
  if (sceneKind === "surface_3d") {
    const lower = message.toLowerCase();
    const expression = /saddle|x\^?2|x²|y\^?2|y²/.test(lower) ? "x^2-y^2" : "sin(x)+cos(y)";
    return {
      scene_kind: "surface_3d",
      surface_3d: {
        expression,
        x_label: "x direction",
        y_label: "y direction",
        z_label: "height / result",
        highlight_slices: ["both"],
      },
    };
  }

  if (sceneKind === "flow_system_3d") {
    return {
      scene_kind: "flow_system_3d",
      flow_system_3d: {
        nodes: [
          { id: "source", label: "start", role: "source" },
          { id: "rule", label: "rule", role: "transform" },
          { id: "receiver", label: "result", role: "receiver" },
        ],
        flows: [
          { from: "source", to: "rule", label: "moves" },
          { from: "rule", to: "receiver", label: "changes" },
        ],
      },
    };
  }

  if (sceneKind === "comparison_space_3d") {
    return {
      scene_kind: "comparison_space_3d",
      comparison_space_3d: {
        left_label: "tempting match",
        right_label: "correct role",
        contrast_label: "ask what job it does",
      },
    };
  }

  return {
    scene_kind: sceneKind,
    state_transition_3d: {
      states: [
        { id: "before", label: "before", description: "current picture" },
        { id: "rule", label: "hidden link", description: "what changes the result" },
        { id: "after", label: "after", description: "corrected view" },
      ],
      transition_label: "reveals",
    },
  };
}

export function buildFallbackVideoDirectorContract(contextInput: VideoDirectorRequestContext | string): MyWayVideoDirectorContract {
  const context = typeof contextInput === "string" ? buildDefaultVideoDirectorRequestContext(contextInput) : contextInput;
  const sceneKind = inferSceneKind(context.learner_message, context.learning_context.root_problem);
  const objects = buildFallbackObjects(sceneKind);
  const relationships = buildFallbackRelationships(objects, sceneKind);

  return {
    schema_version: "myway_video_director_contract_v1",
    contract_id: stableVideoDirectorContractId(`fallback:${context.learner_message}:${context.learning_context.root_problem ?? ""}`),
    title: `Make ${context.learning_context.topic_label ?? "the stuck point"} visible`,
    learner_message: context.learner_message,
    learning_context: context.learning_context,
    personalization_profile: context.personalization_profile,
    creative_brief: fallbackCreativeBrief(context, sceneKind),
    renderer_intent: {
      preferred_renderer: context.renderer_capabilities.supports_webgl_3d_scene ? "hybrid_timeline_3d" : "remotion_svg_2d",
      fallback_renderer: "remotion_svg_2d",
      scene_kind: sceneKind,
      required_capabilities:
        sceneKind === "surface_3d"
          ? ["remotion_timeline", "webgl_3d_scene", "surface_mesh", "camera_orbit", "slice_planes", "billboard_labels", "checkpoint_overlay"]
          : ["remotion_timeline", "webgl_3d_scene", "camera_orbit", "billboard_labels", "checkpoint_overlay"],
      camera_language: sceneKind === "surface_3d" ? "orbit just enough to reveal the direction change" : "slow orbit around the hidden relationship",
      style_language: "dark MyWay glass scene, one strong glow path, short captions",
    },
    conceptual_objects: objects,
    relationships,
    beats: buildFallbackBeats(objects, sceneKind, context),
    visual_model: fallbackVisualModel(sceneKind, context.learner_message),
    checkpoint: {
      prompt: "What relationship did the animation make visible?",
      expected_idea: "The learner names the hidden relationship or rule in their own words.",
    },
    safety_notes: [
      "The model writes a semantic director contract, not executable renderer code.",
      "MyWay validates scene kind, object ids, beats, captions, and renderer capabilities before rendering.",
      "Personalization is only used when it clarifies the root problem.",
    ],
  };
}

function normalizeCreativeBrief(value: unknown, fallback: VideoDirectorCreativeBrief): VideoDirectorCreativeBrief {
  const record = asRecord(value);
  return {
    desired_feeling: asText(record.desired_feeling ?? record.desiredFeeling, fallback.desired_feeling, 240),
    visual_metaphor: asText(record.visual_metaphor ?? record.visualMetaphor, fallback.visual_metaphor, 240),
    aha_moment: asText(record.aha_moment ?? record.ahaMoment, fallback.aha_moment, 260),
    what_to_avoid: asStringArray(record.what_to_avoid ?? record.whatToAvoid, fallback.what_to_avoid, 8, 90),
    why_this_should_unstick_the_learner: asText(record.why_this_should_unstick_the_learner ?? record.whyThisShouldUnstickTheLearner, fallback.why_this_should_unstick_the_learner, 360),
  };
}

function normalizeRendererIntent(value: unknown, fallback: VideoDirectorRendererIntent): VideoDirectorRendererIntent {
  const record = asRecord(value);
  const sceneKind = asSceneKind(record.scene_kind ?? record.sceneKind, fallback.scene_kind);
  return {
    preferred_renderer: asRendererTarget(record.preferred_renderer ?? record.preferredRenderer, fallback.preferred_renderer),
    fallback_renderer: asRendererTarget(record.fallback_renderer ?? record.fallbackRenderer, fallback.fallback_renderer),
    scene_kind: sceneKind,
    required_capabilities: asCapabilityArray(record.required_capabilities ?? record.requiredCapabilities, fallback.required_capabilities),
    camera_language: asText(record.camera_language ?? record.cameraLanguage, fallback.camera_language ?? "", 180) || null,
    style_language: asText(record.style_language ?? record.styleLanguage, fallback.style_language ?? "", 180) || null,
  };
}

function normalizeObjects(value: unknown, fallback: VideoDirectorConceptualObject[]): VideoDirectorConceptualObject[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .slice(0, 8)
    .map((item, index): VideoDirectorConceptualObject | null => {
      const record = asRecord(item);
      if (!Object.keys(record).length) return null;
      return {
        id: sanitizeId(record.id, `object_${index + 1}`),
        role: asObjectRole(record.role, index === 0 ? "actor" : "state"),
        name: asText(record.name ?? record.label, `Object ${index + 1}`, 70),
        meaning: asText(record.meaning, "Part of the learner's mental model.", 160),
        visual_hint: asText(record.visual_hint ?? record.visualHint, "simple glowing object", 120),
      };
    })
    .filter((item): item is VideoDirectorConceptualObject => Boolean(item));
  return cleaned.length >= 2 ? cleaned : fallback;
}

function normalizeRelationships(value: unknown, objects: VideoDirectorConceptualObject[], fallback: VideoDirectorRelationship[]): VideoDirectorRelationship[] {
  const objectIds = new Set(objects.map((object) => object.id));
  if (!Array.isArray(value)) return fallback.filter((relationship) => objectIds.has(relationship.from) && objectIds.has(relationship.to));
  const cleaned = value
    .slice(0, 8)
    .map((item, index): VideoDirectorRelationship | null => {
      const record = asRecord(item);
      const from = sanitizeId(record.from, "");
      const to = sanitizeId(record.to, "");
      if (!from || !to || !objectIds.has(from) || !objectIds.has(to) || from === to) return null;
      return {
        id: sanitizeId(record.id, `relationship_${index + 1}`),
        from,
        to,
        kind: asRelationshipKind(record.kind, "reveals"),
        explanation: asText(record.explanation, "This relationship is what the animation should make visible.", 180),
      };
    })
    .filter((item): item is VideoDirectorRelationship => Boolean(item));
  return cleaned.length ? cleaned : fallback.filter((relationship) => objectIds.has(relationship.from) && objectIds.has(relationship.to));
}

function normalizeBeats(value: unknown, objects: VideoDirectorConceptualObject[], fallback: VideoDirectorBeat[]): VideoDirectorBeat[] {
  const objectIds = new Set(objects.map((object) => object.id));
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .slice(0, 5)
    .map((item, index): VideoDirectorBeat | null => {
      const record = asRecord(item);
      if (!Object.keys(record).length) return null;
      const fallbackFocus = index === 0 ? objects.slice(0, 2).map((object) => object.id) : objects.map((object) => object.id);
      const focus = asStringArray(record.focus_object_ids ?? record.focusObjectIds, fallbackFocus, 6, 64).filter((id) => objectIds.has(sanitizeId(id, id)) || objectIds.has(id));
      return {
        id: sanitizeId(record.id, `beat_${index + 1}`),
        purpose: asText(record.purpose, index === 0 ? "Set up the learner's current picture." : "Reveal the missing relationship.", 180),
        learner_thought_before: asText(record.learner_thought_before ?? record.learnerThoughtBefore, "", 180) || null,
        visual_change: asText(record.visual_change ?? record.visualChange, "Make one hidden relationship visible through motion.", 220),
        narration: asText(record.narration, "", 140) || null,
        focus_object_ids: focus.length ? focus : fallbackFocus,
        motion_intents: asStringArray(record.motion_intents ?? record.motionIntents, ["reveal", "highlight", "freeze"], 6, 80),
        expected_realization: asText(record.expected_realization ?? record.expectedRealization, "The learner sees why the result changes.", 180),
        duration_seconds: asNumber(record.duration_seconds ?? record.durationSeconds, fallback[index]?.duration_seconds ?? 5, 3, 8),
      };
    })
    .filter((item): item is VideoDirectorBeat => Boolean(item));
  return cleaned.length >= 3 ? cleaned : fallback;
}

function normalizeVisualModel(value: unknown, sceneKind: VideoDirectorSceneKind, fallback: VideoDirectorVisualModel): VideoDirectorVisualModel {
  const record = asRecord(value);
  const surface = asRecord(record.surface_3d ?? record.surface3d);
  const flow = asRecord(record.flow_system_3d ?? record.flowSystem3d);
  const comparison = asRecord(record.comparison_space_3d ?? record.comparisonSpace3d);
  const state = asRecord(record.state_transition_3d ?? record.stateTransition3d);

  return {
    scene_kind: asSceneKind(record.scene_kind ?? record.sceneKind, sceneKind),
    surface_3d:
      sceneKind === "surface_3d" || Object.keys(surface).length
        ? {
            expression: asText(surface.expression, fallback.surface_3d?.expression ?? "x^2-y^2", 80),
            x_label: asText(surface.x_label ?? surface.xLabel, fallback.surface_3d?.x_label ?? "x direction", 60),
            y_label: asText(surface.y_label ?? surface.yLabel, fallback.surface_3d?.y_label ?? "y direction", 60),
            z_label: asText(surface.z_label ?? surface.zLabel, fallback.surface_3d?.z_label ?? "result", 60),
            highlight_slices: (() => {
              const rawSlices = surface.highlight_slices ?? surface.highlightSlices;
              return Array.isArray(rawSlices)
                ? rawSlices.filter((item: unknown) => item === "x" || item === "y" || item === "both").slice(0, 3)
                : fallback.surface_3d?.highlight_slices ?? ["both"];
            })(),
          }
        : fallback.surface_3d ?? null,
    flow_system_3d: Object.keys(flow).length ? (flow as VideoDirectorVisualModel["flow_system_3d"]) : fallback.flow_system_3d ?? null,
    comparison_space_3d: Object.keys(comparison).length
      ? {
          left_label: asText(comparison.left_label ?? comparison.leftLabel, fallback.comparison_space_3d?.left_label ?? "left", 60),
          right_label: asText(comparison.right_label ?? comparison.rightLabel, fallback.comparison_space_3d?.right_label ?? "right", 60),
          contrast_label: asText(comparison.contrast_label ?? comparison.contrastLabel, fallback.comparison_space_3d?.contrast_label ?? "difference", 80),
        }
      : fallback.comparison_space_3d ?? null,
    state_transition_3d: Object.keys(state).length ? (state as VideoDirectorVisualModel["state_transition_3d"]) : fallback.state_transition_3d ?? null,
  };
}

export function normalizeVideoDirectorContract(input: unknown, contextInput: VideoDirectorRequestContext | string): MyWayVideoDirectorContract {
  const context = typeof contextInput === "string" ? buildDefaultVideoDirectorRequestContext(contextInput) : contextInput;
  const fallback = buildFallbackVideoDirectorContract(context);
  const record = asRecord(input);

  const rendererIntent = normalizeRendererIntent(record.renderer_intent ?? record.rendererIntent, fallback.renderer_intent);
  const sceneKind = rendererIntent.scene_kind;
  const fallbackForScene = sceneKind === fallback.renderer_intent.scene_kind ? fallback : buildFallbackVideoDirectorContract({
    ...context,
    learning_context: {
      ...context.learning_context,
      diagnosis_label: context.learning_context.diagnosis_label ?? fallbackDiagnosisForSceneKind(sceneKind),
    },
  });
  const objects = normalizeObjects(record.conceptual_objects ?? record.conceptualObjects, fallbackForScene.conceptual_objects);
  const relationships = normalizeRelationships(record.relationships, objects, fallbackForScene.relationships);
  const beats = normalizeBeats(record.beats, objects, fallbackForScene.beats);
  const checkpoint = asRecord(record.checkpoint);

  return {
    schema_version: "myway_video_director_contract_v1",
    contract_id: asText(record.contract_id ?? record.contractId, stableVideoDirectorContractId(`${context.learner_message}:${JSON.stringify(record).slice(0, 700)}`), 80),
    title: asText(record.title, fallback.title, 90),
    learner_message: context.learner_message,
    learning_context: context.learning_context,
    personalization_profile: context.personalization_profile,
    creative_brief: normalizeCreativeBrief(record.creative_brief ?? record.creativeBrief, fallbackForScene.creative_brief),
    renderer_intent: rendererIntent,
    conceptual_objects: objects,
    relationships,
    beats,
    visual_model: normalizeVisualModel(record.visual_model ?? record.visualModel, sceneKind, fallbackForScene.visual_model),
    checkpoint: {
      prompt: asText(checkpoint.prompt, fallbackForScene.checkpoint.prompt, 180),
      expected_idea: asText(checkpoint.expected_idea ?? checkpoint.expectedIdea, fallbackForScene.checkpoint.expected_idea, 240),
    },
    safety_notes: asStringArray(record.safety_notes ?? record.safetyNotes, fallbackForScene.safety_notes, 6, 140),
  };
}

export function getVideoDirectorDurationSeconds(contract: MyWayVideoDirectorContract) {
  return contract.beats.reduce((sum, beat) => sum + beat.duration_seconds, 0);
}

export function findVideoDirectorBeatAtTime(contract: MyWayVideoDirectorContract, elapsedSeconds: number) {
  let cursor = 0;

  for (let index = 0; index < contract.beats.length; index += 1) {
    const beat = contract.beats[index]!;
    const startSeconds = cursor;
    const endSeconds = startSeconds + beat.duration_seconds;

    if (elapsedSeconds <= endSeconds || index === contract.beats.length - 1) {
      return {
        beat,
        beatIndex: index,
        startSeconds,
        endSeconds,
        progress: clamp((elapsedSeconds - startSeconds) / Math.max(0.001, beat.duration_seconds), 0, 1),
      };
    }

    cursor = endSeconds;
  }

  const fallback = contract.beats[0] ?? buildFallbackVideoDirectorContract(contract.learner_message).beats[0]!;
  return { beat: fallback, beatIndex: 0, startSeconds: 0, endSeconds: fallback.duration_seconds, progress: 0 };
}
