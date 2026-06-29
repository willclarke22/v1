import type {
  CompileVideoDirectorToProceduralPlanArgs,
  MyWayGeneratedAssetRequest,
  MyWayProceduralBeat,
  MyWayProceduralSceneStrategy,
  MyWayProceduralVisualPlan,
} from "./procedural-visual-contract";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback: string, maxLength = 140): string {
  if (typeof value !== "string") return fallback.slice(0, maxLength);
  const cleaned = value.replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function firstText(values: unknown[], fallback: string, maxLength = 140): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return text(value, fallback, maxLength);
  }
  return fallback.slice(0, maxLength);
}

function collectStringValues(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output);
    return output;
  }

  if (value && typeof value === "object") {
    // Intentionally collect VALUES only, not keys. This prevents fields like
    // { surface_3d: null } from making the compiler think the concept is a surface.
    for (const item of Object.values(value as Record<string, unknown>)) collectStringValues(item, output);
  }

  return output;
}

function lowerBundle(parts: unknown[]): string {
  return parts.flatMap((part) => collectStringValues(part)).join(" ").toLowerCase();
}

function stablePlanId(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `procedural_visual_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function uniqueAssets(assets: MyWayGeneratedAssetRequest[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

function explicitSceneKind(contract: Record<string, unknown>): string {
  const intent = asRecord(contract.renderer_intent);
  const visualModel = asRecord(contract.visual_model);
  return text(intent.scene_kind ?? visualModel.scene_kind, "", 80).toLowerCase();
}

function explicitPreferredRenderer(contract: Record<string, unknown>): string {
  const intent = asRecord(contract.renderer_intent);
  return text(intent.preferred_renderer, "", 80).toLowerCase();
}

function chooseStrategy(args: {
  contract: Record<string, unknown>;
  context: Record<string, unknown>;
  bundle: string;
}): MyWayProceduralSceneStrategy {
  const sceneKind = explicitSceneKind(args.contract);
  const preferred = explicitPreferredRenderer(args.contract);
  const bundle = args.bundle;

  // Respect explicit model scene-kind first. This is the bug fix: a contract that says
  // comparison_space_3d should not fall through to surface rendering just because a nullable
  // surface_3d field exists somewhere in the schema.
  if (/comparison|compare|contrast|object_relationship|relationship/.test(sceneKind)) return "comparison_reveal";
  if (/flow|process|cutaway/.test(`${sceneKind} ${preferred}`)) return "process_flow";
  if (/state|transition/.test(sceneKind)) return "state_change";
  if (/timeline|sequence/.test(sceneKind)) return "timeline_or_sequence";

  // Surface is only allowed when the learner/content actually points to a surface/graph/field.
  // Do not infer surface from renderer capability names or nullable schema keys.
  const meaningfulSurfaceCue = /\b(surface|saddle|paraboloid|graph|terrain|field|height|slope|x\^2|x²|y\^2|y²|function of x and y|multivariable)\b/.test(bundle);
  if ((/surface/.test(`${sceneKind} ${preferred}`) || meaningfulSurfaceCue) && meaningfulSurfaceCue) return "surface_or_field";

  if (/\b(flow|current|circuit|resistance|water|pipe|electron|air|pressure|blood|filter|valve|pump|turbine|engine|chemical pathway)\b/.test(bundle)) {
    return "process_flow";
  }

  if (/\b(sequence|timeline|order|first|before|after|step|recursion|loop|cycle)\b/.test(bundle)) {
    return "timeline_or_sequence";
  }

  if (/\b(state|transition|changes from|turns into|becomes|phase)\b/.test(bundle)) {
    return "state_change";
  }

  if (/\b(vs|versus|different|distinguish|mixing up|compare|contrast|claim|evidence|reflexive|passive|oxidation|reduction|valid|invalid)\b/.test(bundle)) {
    return "comparison_reveal";
  }

  return "relationship_reveal";
}

function extractBase(args: CompileVideoDirectorToProceduralPlanArgs) {
  const contract = asRecord(args.directorContract);
  const context = asRecord(args.requestContext);
  const learningContext = asRecord(context.learning_context ?? contract.learning_context);
  const creativeBrief = asRecord(contract.creative_brief);
  const checkpoint = asRecord(contract.checkpoint);

  const learnerMessage = firstText(
    [context.learner_message, contract.learner_message, context.learner_signal, contract.learner_signal],
    "I am stuck on this idea.",
    220,
  );

  const title = firstText([contract.title, learningContext.topic_label, learnerMessage], "MyWay generated visual explanation", 90);
  const rootProblem = firstText(
    [learningContext.root_problem, creativeBrief.why_this_should_unstick_the_learner, contract.diagnosis_guess, learnerMessage],
    "The learner needs one hidden relationship made visible.",
    220,
  );
  const misconceptionTarget = firstText(
    [learningContext.misconception_target, creativeBrief.aha_moment],
    "The learner's current picture is missing the deciding relationship.",
    220,
  );
  const visualGoal = firstText(
    [creativeBrief.aha_moment, creativeBrief.visual_metaphor, creativeBrief.why_this_should_unstick_the_learner],
    "Reveal the missing relationship with motion, then freeze it as a decision rule.",
    220,
  );

  const comparisonModel = asRecord(asRecord(contract.visual_model).comparison_space_3d);
  const flowModel = asRecord(asRecord(contract.visual_model).flow_system_3d);
  const stateModel = asRecord(asRecord(contract.visual_model).state_transition_3d);
  const surfaceModel = asRecord(asRecord(contract.visual_model).surface_3d);

  const bundle = lowerBundle([
    learnerMessage,
    title,
    rootProblem,
    misconceptionTarget,
    visualGoal,
    learningContext,
    contract.renderer_intent,
    comparisonModel,
    flowModel,
    stateModel,
    surfaceModel,
    contract.conceptual_objects,
    contract.relationships,
    contract.beats,
  ]);

  return {
    contract,
    context,
    learningContext,
    creativeBrief,
    checkpoint,
    learnerMessage,
    title,
    rootProblem,
    misconceptionTarget,
    visualGoal,
    bundle,
  };
}

function contractObjects(contract: Record<string, unknown>) {
  return asArray(contract.conceptual_objects)
    .map((item, index) => {
      const record = asRecord(item);
      return {
        id: text(record.id, `obj_${index + 1}`, 48),
        name: text(record.name, text(record.role, `Object ${index + 1}`, 40), 64),
        role: text(record.role, "object", 40),
        meaning: text(record.meaning, "Part of the explanation", 130),
      };
    })
    .slice(0, 6);
}

function buildRelationshipAssets(base: ReturnType<typeof extractBase>, strategy: MyWayProceduralSceneStrategy): MyWayGeneratedAssetRequest[] {
  const objects = contractObjects(base.contract);
  const isSe = /\bse\b|reflexive|passive/.test(base.bundle);
  const isClaimEvidence = /claim|evidence|argument/.test(base.bundle);
  const isOxReduction = /oxidation|reduction|electron/.test(base.bundle);

  if (isSe) {
    return [
      {
        id: "left_panel",
        asset_type: "stage_panel",
        label: "Reflexive",
        role: "case",
        meaning: "The action returns to the doer",
        position_hint: "left",
        color_hint: "purple",
        visible_from_beat: 1,
      },
      {
        id: "right_panel",
        asset_type: "stage_panel",
        label: "Passive-like",
        role: "case",
        meaning: "Something happens to the subject",
        position_hint: "right",
        color_hint: "cyan",
        visible_from_beat: 1,
      },
      {
        id: "left_subject",
        asset_type: "actor_marker",
        label: "doer",
        role: "actor",
        meaning: "The person doing the action",
        position_hint: "left_center",
        color_hint: "purple",
        visible_from_beat: 1,
      },
      {
        id: "right_subject",
        asset_type: "object_marker",
        label: "subject",
        role: "receiver",
        meaning: "The thing receiving the action",
        position_hint: "right_center",
        color_hint: "cyan",
        visible_from_beat: 1,
      },
      {
        id: "se_left",
        asset_type: "token_card",
        label: "se",
        role: "token",
        meaning: "Same word, reflexive use",
        position_hint: "above",
        color_hint: "amber",
        visible_from_beat: 1,
        emphasis: "primary",
      },
      {
        id: "se_right",
        asset_type: "token_card",
        label: "se",
        role: "token",
        meaning: "Same word, passive-like use",
        position_hint: "above",
        color_hint: "amber",
        visible_from_beat: 1,
        emphasis: "primary",
      },
      {
        id: "self_loop",
        asset_type: "self_loop_arrow",
        label: "back to self",
        role: "relationship",
        meaning: "The action loops back to the doer",
        position_hint: "left",
        from_id: "left_subject",
        to_id: "left_subject",
        path_type: "self_loop",
        color_hint: "purple",
        visible_from_beat: 2,
        emphasis: "primary",
      },
      {
        id: "outside_arrow",
        asset_type: "outside_force_arrow",
        label: "happens to it",
        role: "relationship",
        meaning: "An unnamed action lands on the subject",
        position_hint: "right",
        from_id: "outside",
        to_id: "right_subject",
        path_type: "outside_to_target",
        color_hint: "cyan",
        visible_from_beat: 2,
        emphasis: "primary",
      },
      {
        id: "rule_card",
        asset_type: "rule_card",
        label: "Trace where the action goes",
        role: "rule",
        meaning: "The action path decides the meaning",
        position_hint: "center",
        color_hint: "green",
        visible_from_beat: 3,
        emphasis: "checkpoint",
      },
    ];
  }

  if (isClaimEvidence) {
    return [
      { id: "left_panel", asset_type: "stage_panel", label: "Claim", role: "case", meaning: "The point the writer wants you to accept", position_hint: "left", color_hint: "purple", visible_from_beat: 1 },
      { id: "right_panel", asset_type: "stage_panel", label: "Evidence", role: "case", meaning: "The clue used to support the point", position_hint: "right", color_hint: "cyan", visible_from_beat: 1 },
      { id: "claim_card", asset_type: "token_card", label: "main point", role: "idea", meaning: "The sentence doing the arguing job", position_hint: "left_center", color_hint: "purple", visible_from_beat: 1 },
      { id: "evidence_card", asset_type: "token_card", label: "supporting clue", role: "evidence", meaning: "A fact used to support the claim", position_hint: "right_center", color_hint: "cyan", visible_from_beat: 1 },
      { id: "support_arrow", asset_type: "curved_arrow", label: "supports", role: "relationship", meaning: "Evidence points toward the claim", position_hint: "center", from_id: "evidence_card", to_id: "claim_card", path_type: "right_to_left", color_hint: "green", visible_from_beat: 2, emphasis: "primary" },
      { id: "rule_card", asset_type: "rule_card", label: "Ask what job it does", role: "rule", meaning: "Sort by role, not by whether it sounds factual", position_hint: "center", color_hint: "green", visible_from_beat: 3, emphasis: "checkpoint" },
    ];
  }

  if (isOxReduction) {
    return [
      { id: "left_panel", asset_type: "stage_panel", label: "Loses electron", role: "case", meaning: "One side gives away an electron", position_hint: "left", color_hint: "purple", visible_from_beat: 1 },
      { id: "right_panel", asset_type: "stage_panel", label: "Gains electron", role: "case", meaning: "The other side receives an electron", position_hint: "right", color_hint: "cyan", visible_from_beat: 1 },
      { id: "donor", asset_type: "actor_marker", label: "giver", role: "source", meaning: "The thing losing an electron", position_hint: "left_center", color_hint: "purple", visible_from_beat: 1 },
      { id: "receiver", asset_type: "object_marker", label: "receiver", role: "target", meaning: "The thing gaining an electron", position_hint: "right_center", color_hint: "cyan", visible_from_beat: 1 },
      { id: "electron_path", asset_type: "curved_arrow", label: "electron moves", role: "path", meaning: "Follow the electron to name the process", position_hint: "center", from_id: "donor", to_id: "receiver", path_type: "left_to_right", color_hint: "green", visible_from_beat: 2, emphasis: "primary" },
      { id: "rule_card", asset_type: "rule_card", label: "Follow the electron", role: "rule", meaning: "The electron path decides the label", position_hint: "center", color_hint: "green", visible_from_beat: 3, emphasis: "checkpoint" },
    ];
  }

  const first = objects[0];
  const second = objects[1];
  const third = objects[2];

  return [
    { id: "left_panel", asset_type: "stage_panel", label: first?.name ?? "Current picture", role: "case", meaning: first?.meaning ?? "What the learner is seeing now", position_hint: "left", color_hint: "purple", visible_from_beat: 1 },
    { id: "right_panel", asset_type: "stage_panel", label: second?.name ?? "Hidden link", role: "case", meaning: second?.meaning ?? "The relationship MyWay needs to reveal", position_hint: "right", color_hint: "cyan", visible_from_beat: 1 },
    { id: "left_object", asset_type: "token_card", label: first?.name ?? "piece A", role: first?.role ?? "object", meaning: first?.meaning ?? base.rootProblem, position_hint: "left_center", color_hint: "purple", visible_from_beat: 1 },
    { id: "right_object", asset_type: "token_card", label: second?.name ?? "piece B", role: second?.role ?? "object", meaning: second?.meaning ?? base.misconceptionTarget, position_hint: "right_center", color_hint: "cyan", visible_from_beat: 1 },
    { id: "missing_link", asset_type: "curved_arrow", label: third?.name ?? "hidden link", role: "relationship", meaning: third?.meaning ?? base.visualGoal, position_hint: "center", from_id: "left_object", to_id: "right_object", path_type: "left_to_right", color_hint: "green", visible_from_beat: 2, emphasis: "primary" },
    { id: "rule_card", asset_type: "rule_card", label: strategy === "comparison_reveal" ? "Compare the job, not the label" : "Name the link", role: "rule", meaning: base.visualGoal, position_hint: "center", color_hint: "green", visible_from_beat: 3, emphasis: "checkpoint" },
  ];
}

function buildProcessAssets(base: ReturnType<typeof extractBase>): MyWayGeneratedAssetRequest[] {
  const label = /circuit|current|resistance|electron/.test(base.bundle) ? "current path" : "flow path";
  const barrier = /resistance/.test(base.bundle) ? "resistance" : /filter/.test(base.bundle) ? "filter" : "constraint";

  return [
    { id: "flow_stage", asset_type: "stage_panel", label: text(base.title, "Process", 42), role: "stage", meaning: base.rootProblem, position_hint: "center", color_hint: "dim", visible_from_beat: 1 },
    { id: "channel", asset_type: "flow_channel", label, role: "path", meaning: "The route the moving pieces follow", position_hint: "center", color_hint: "cyan", visible_from_beat: 1 },
    { id: "particles", asset_type: "flow_particles", label: "moving pieces", role: "flow", meaning: "The quantity that changes as the constraint changes", position_hint: "center", color_hint: "cyan", visible_from_beat: 1, emphasis: "primary" },
    { id: "barrier", asset_type: "barrier", label: barrier, role: "constraint", meaning: base.misconceptionTarget, position_hint: "center", color_hint: "amber", visible_from_beat: 2, emphasis: "primary" },
    { id: "flow_arrow", asset_type: "curved_arrow", label: "changed flow", role: "relationship", meaning: base.visualGoal, position_hint: "center", path_type: "around_barrier", color_hint: "green", visible_from_beat: 3, emphasis: "primary" },
    { id: "rule_card", asset_type: "rule_card", label: "Change the path, change the flow", role: "rule", meaning: base.visualGoal, position_hint: "bottom", color_hint: "green", visible_from_beat: 3, emphasis: "checkpoint" },
  ];
}

function buildSurfaceAssets(base: ReturnType<typeof extractBase>): MyWayGeneratedAssetRequest[] {
  return [
    { id: "surface", asset_type: "surface_mesh", label: "surface", role: "surface", meaning: base.rootProblem, position_hint: "center", color_hint: "purple", visible_from_beat: 1, emphasis: "primary" },
    { id: "x_slice", asset_type: "slice_curve", label: "one direction", role: "slice", meaning: "One direction bends one way", position_hint: "center", color_hint: "purple", visible_from_beat: 2, emphasis: "primary" },
    { id: "y_slice", asset_type: "slice_curve", label: "other direction", role: "slice", meaning: "The other direction bends differently", position_hint: "center", color_hint: "cyan", visible_from_beat: 2, emphasis: "primary" },
    { id: "rule_card", asset_type: "rule_card", label: "Same point, different directions", role: "rule", meaning: base.visualGoal, position_hint: "bottom", color_hint: "green", visible_from_beat: 3, emphasis: "checkpoint" },
  ];
}

function buildBeats(base: ReturnType<typeof extractBase>, assets: MyWayGeneratedAssetRequest[], strategy: MyWayProceduralSceneStrategy): MyWayProceduralBeat[] {
  const sourceBeats = asArray(base.contract.beats).map((item, index) => {
    const record = asRecord(item);
    return {
      title: text(record.purpose, `Beat ${index + 1}`, 64),
      narration: text(record.narration, index === 0 ? "Start with what looks confusing." : "Now reveal the hidden link.", 90),
      purpose: text(record.expected_realization ?? record.visual_change ?? record.purpose, "Reveal one relationship.", 120),
      duration_seconds: typeof record.duration_seconds === "number" ? record.duration_seconds : 3,
    };
  });

  const allIds = assets.map((asset) => asset.id);
  const idsForBeat = (beatNumber: number) => assets.filter((asset) => (asset.visible_from_beat ?? 1) <= beatNumber).map((asset) => asset.id);
  const focusForBeat = (beatNumber: number) => assets.filter((asset) => asset.visible_from_beat === beatNumber || asset.emphasis === "primary").map((asset) => asset.id).slice(0, 5);

  const defaults =
    strategy === "process_flow"
      ? [
          ["Show the path", "First, see the route the moving pieces follow."],
          ["Add the constraint", "Now the path changes, so the flow changes."],
          ["Freeze the rule", "The route controls what can move through."],
        ]
      : strategy === "surface_or_field"
        ? [
            ["Show the surface", "One surface can hide two different directions."],
            ["Reveal both slices", "The two directions bend differently."],
            ["Freeze the contrast", "Same point, different directions."],
          ]
        : [
            ["Same-looking pieces", "Start with what looks the same."],
            ["Reveal the hidden path", "Now trace where the action goes."],
            ["Freeze the rule", "Use the path to decide next time."],
          ];

  const beat1 = sourceBeats[0] ?? { title: defaults[0][0], narration: defaults[0][1], purpose: base.rootProblem, duration_seconds: 3 };
  const beat2 = sourceBeats[1] ?? { title: defaults[1][0], narration: defaults[1][1], purpose: base.misconceptionTarget, duration_seconds: 4 };
  const beat3 = sourceBeats[2] ?? { title: defaults[2][0], narration: defaults[2][1], purpose: base.visualGoal, duration_seconds: 4 };

  return [
    {
      id: "beat_1",
      title: beat1.title,
      purpose: beat1.purpose,
      narration: beat1.narration,
      visible_asset_ids: idsForBeat(1),
      focus_asset_ids: focusForBeat(1),
      duration_seconds: Math.max(2, Math.min(5, beat1.duration_seconds)),
    },
    {
      id: "beat_2",
      title: beat2.title,
      purpose: beat2.purpose,
      narration: beat2.narration,
      visible_asset_ids: idsForBeat(2),
      focus_asset_ids: focusForBeat(2),
      duration_seconds: Math.max(3, Math.min(6, beat2.duration_seconds)),
    },
    {
      id: "beat_3",
      title: beat3.title,
      purpose: beat3.purpose,
      narration: beat3.narration,
      visible_asset_ids: allIds,
      focus_asset_ids: [...focusForBeat(3), "rule_card"].filter((id, index, array) => array.indexOf(id) === index).slice(0, 6),
      duration_seconds: Math.max(3, Math.min(6, beat3.duration_seconds)),
    },
  ];
}

export function compileVideoDirectorToProceduralPlan(args: CompileVideoDirectorToProceduralPlanArgs): MyWayProceduralVisualPlan {
  const base = extractBase(args);
  const warnings: string[] = [];
  const strategy = chooseStrategy({ contract: base.contract, context: base.context, bundle: base.bundle });
  const topic = text(base.learningContext.topic_label, "", 90).toLowerCase();
  const message = base.learnerMessage.toLowerCase();
  const sceneKind = explicitSceneKind(base.contract);

  if (sceneKind && sceneKind.includes("comparison") && strategy !== "comparison_reveal") {
    warnings.push(`Compiler corrected routing: model requested ${sceneKind}, so MyWay should not render a surface.`);
  }

  if (topic && message && !message.includes(topic) && /multivariable|surface|saddle/.test(topic) && /spanish|\bse\b|claim|evidence|circuit|resistance/.test(message)) {
    warnings.push("Learner message and lab context appear to conflict. The procedural compiler prioritized the learner message and visible relationship over the stale topic label.");
  }

  const generatedAssets = uniqueAssets(
    strategy === "surface_or_field"
      ? buildSurfaceAssets(base)
      : strategy === "process_flow"
        ? buildProcessAssets(base)
        : buildRelationshipAssets(base, strategy),
  );

  const beats = buildBeats(base, generatedAssets, strategy);
  const checkpoint = asRecord(base.checkpoint);

  return {
    schema_version: "myway_procedural_visual_plan_v1",
    plan_id: stablePlanId(`${base.learnerMessage}:${base.title}:${base.rootProblem}:${base.misconceptionTarget}:${strategy}`),
    source_contract_id: typeof base.contract.contract_id === "string" ? base.contract.contract_id : null,
    title: base.title,
    learner_message: base.learnerMessage,
    strategy,
    visual_goal: base.visualGoal,
    root_problem: base.rootProblem,
    misconception_target: base.misconceptionTarget,
    style: {
      background: "myway_dark_stage",
      material_language: strategy === "process_flow" ? "transparent_cinematic_3d" : "glowing_minimal_3d",
      text_density: "low",
      personalization_mode: "clarifying_only",
    },
    generated_assets: generatedAssets,
    beats,
    camera: {
      opening: "wide",
      motion: strategy === "surface_or_field" ? "gentle_orbit" : "slow_push_in",
      focus: generatedAssets.find((asset) => asset.emphasis === "primary")?.id ?? generatedAssets[0]?.id ?? "center",
    },
    checkpoint: {
      prompt: text(checkpoint.prompt, "What hidden relationship did the animation reveal?", 160),
      expected_idea: text(checkpoint.expected_idea, base.visualGoal, 180),
    },
    compiler_warnings: warnings,
  };
}
