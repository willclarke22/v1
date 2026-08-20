/**
 * Director Capability Library · Phase 1B.6
 *
 * High-level perceptual/composite directing capabilities extracted from excellent
 * reference cinematography. These are not extra low-level motion operators.
 *
 * Production rule: semantic roles + normalized perceptual constraints are the
 * authority. Golden Lunch world coordinates, asset IDs, and camera keyframes are
 * deliberately absent. Exact staging/camera values must be solved later from
 * measured geometry/directability and the existing atomic Director vocabulary.
 */

export type DirectorPerceptualCapabilityCategory =
  | "causal_interaction"
  | "presentation"
  | "attention_continuity"
  | "spatial_reveal"
  | "recap"
  | "resolution"
  | "consequence";

export type DirectorPerceptualCapabilityStatus = "first_build" | "next" | "candidate";

export type DirectorPerceptualCapabilityRole = {
  id: string;
  label: string;
  purpose: string;
  required: boolean;
};

export type DirectorPerceptualCapabilityParameter = {
  id: string;
  label: string;
  default_value: string;
  purpose: string;
};

export type DirectorPerceptualCapabilityQualification = {
  id: string;
  kind: "hard" | "score";
  requirement: string;
};

export type DirectorPerceptualCapability = {
  level: "perceptual_composite";
  id: string;
  label: string;
  short_label: string;
  category: DirectorPerceptualCapabilityCategory;
  status: DirectorPerceptualCapabilityStatus;
  source: {
    film: "Golden Lunch";
    beat: string;
    time_range: string;
    evidence: string;
  };
  visual_job: string;
  proof_strategy: string;
  summary: string;
  roles: DirectorPerceptualCapabilityRole[];
  phases: string[];
  parameters: DirectorPerceptualCapabilityParameter[];
  hard_rules: string[];
  qualification: DirectorPerceptualCapabilityQualification[];
  fallbacks: string[];
  generalizes_to: string[];
  /** Informal visual ingredients retained from the Golden extraction. */
  primitives: string[];
  /** Existing atomic Director capability IDs this composition may invoke. */
  atomic_capability_ids: string[];
  policies: string[];
};

export type DirectorFilmPolicy = {
  id: string;
  label: string;
  summary: string;
  compiler_rule: string;
  quality_signal: string;
};

export const DIRECTOR_PERCEPTUAL_CATEGORY_LABELS: Record<DirectorPerceptualCapabilityCategory, string> = {
  causal_interaction: "Causal interaction",
  presentation: "Actor presentation",
  attention_continuity: "Attention continuity",
  spatial_reveal: "Spatial reveal",
  recap: "Recap / integration",
  resolution: "Resolution",
  consequence: "Consequence readability",
};

export const DIRECTOR_FILM_POLICIES: DirectorFilmPolicy[] = [
  {
    id: "continuous_spatial_journey",
    label: "Continuous spatial journey",
    summary:
      "Semantic beats are not automatic camera cuts. Prefer extending existing camera momentum over resetting to a canonical front view.",
    compiler_rule:
      "When adjacent motifs share a scene anchor, preserve camera direction and spatial momentum unless the next motif requires a contradictory viewpoint.",
    quality_signal:
      "No unmotivated camera stop, reversal, or front-view reset at a semantic boundary.",
  },
  {
    id: "c2_camera_motion",
    label: "C2 camera motion",
    summary:
      "Camera paths should remain continuous in position, velocity, and acceleration through internal control points.",
    compiler_rule:
      "Compile camera rails with shared position, velocity, and acceleration constraints rather than independent eased shot segments.",
    quality_signal:
      "Internal motif boundaries do not advertise themselves as bumps, stalls, or acceleration discontinuities.",
  },
  {
    id: "preserve_context_anchor",
    label: "Preserve context anchor",
    summary:
      "Keep the learner's existing spatial reference visible while introducing or explaining related information whenever possible.",
    compiler_rule:
      "Do not clear or replace established context solely because attention moves to a new participant.",
    quality_signal:
      "The learner can visually relate the newly emphasized actor to the established scene without reconstructing the layout.",
  },
  {
    id: "readable_actor_presentation",
    label: "Readable actor presentation",
    summary:
      "Orient actors for recognition and semantic readability rather than blindly preserving asset-native facing.",
    compiler_rule:
      "Use geometry/directability evidence to choose a readable presentation yaw while respecting contact, flow, and physical constraints.",
    quality_signal:
      "Important actors present a recognizable silhouette or three-quarter view during their readable hold.",
  },
  {
    id: "action_readability_hold",
    label: "Action readability hold",
    summary:
      "Transitions should resolve into readable states long enough for the learner to register what changed before the next transition dominates.",
    compiler_rule:
      "Every major action motif should expose a readable consequence or presentation hold unless urgency is itself the intended proof.",
    quality_signal:
      "The important state is visually stable long enough to be recognized without freezing the entire film.",
  },
];

export const DIRECTOR_PERCEPTUAL_CAPABILITIES: DirectorPerceptualCapability[] = [
  {
    level: "perceptual_composite",
    id: "agent_approach_contact_response_retreat",
    label: "Agent Approach → Contact → Response → Retreat",
    short_label: "Contact → response",
    category: "causal_interaction",
    status: "first_build",
    source: {
      film: "Golden Lunch",
      beat: "Hand entrance and burger nudge",
      time_range: "~1.0–6.2 s · contact ~3.15–4.55 s",
      evidence:
        "The burger remains still before the hand arrives, contact is allowed to read, the burger responds with the push, and the hand withdraws after the consequence is visible.",
    },
    visual_job: "Make a causal intervention physically undeniable.",
    proof_strategy:
      "Show the agent approaching a stable target, establish contact, make the target response follow that contact, hold the consequence, then clear the agent.",
    summary:
      "A reusable causal grammar for pushes, strikes, presses, attachments, triggers, and other visible interventions.",
    roles: [
      { id: "effector", label: "Effector", purpose: "Actor that causes the intervention.", required: true },
      { id: "target", label: "Target", purpose: "Actor that receives the intervention.", required: true },
      { id: "obstacles", label: "Obstacles", purpose: "Optional scene geometry the approach must clear.", required: false },
      { id: "downstream", label: "Downstream actor", purpose: "Optional actor that carries the response onward.", required: false },
    ],
    phases: ["establish", "approach", "contact", "response", "readable hold", "retreat"],
    parameters: [
      { id: "approach_direction", label: "Approach direction", default_value: "auto", purpose: "Choose a collision-safe, camera-readable arrival side." },
      { id: "response_strength", label: "Response strength", default_value: "clear", purpose: "Scale the target consequence without making it cartoonishly large." },
      { id: "contact_hold", label: "Contact hold", default_value: "readable", purpose: "Keep the physical relationship visible long enough to understand causality." },
      { id: "camera_attention", label: "Camera attention", default_value: "interaction", purpose: "Favor the contact region without losing the target silhouette." },
    ],
    hard_rules: [
      "Target does not meaningfully drift before contact.",
      "The effector reaches a geometry-valid contact corridor; literal authored contact points are not required.",
      "Target response begins after contact and is directionally compatible with the intervention.",
      "Retreat cannot erase or obscure the consequence before it is readable.",
    ],
    qualification: [
      { id: "precontact_stability", kind: "hard", requirement: "Target pre-contact drift remains below a motif-relative threshold." },
      { id: "contact_visibility", kind: "score", requirement: "Contact region remains visible and uncropped during the interaction peak." },
      { id: "response_alignment", kind: "hard", requirement: "Target response aligns with the solved intervention direction." },
      { id: "readable_consequence", kind: "score", requirement: "The resulting state persists long enough to be perceptually legible." },
    ],
    fallbacks: ["Try the opposite approach side.", "Widen the camera framing around the contact region.", "Reduce response magnitude.", "Use a non-contact causal motif if safe contact cannot be solved."],
    generalizes_to: ["finger → domino", "hammer → nail", "cue ball → ball", "piston → connecting rod", "hand → lever"],
    primitives: ["approach", "surface contact", "target-relative reanchor", "response motion", "retreat", "attention bias"],
    atomic_capability_ids: ["move_toward", "keep_visible", "show_consequence", "hold_for_understanding", "highlight_subject"],
    policies: ["c2_camera_motion", "preserve_context_anchor", "readable_actor_presentation", "action_readability_hold"],
  },
  {
    level: "perceptual_composite",
    id: "arrive_settle_present_depart",
    label: "Arrive → Settle → Present → Depart",
    short_label: "Present an insert",
    category: "presentation",
    status: "first_build",
    source: {
      film: "Golden Lunch",
      beat: "Cow and chicken inserts",
      time_range: "cow ~7.35–11.78 s · chicken ~10.45–14.62 s",
      evidence:
        "Each animal enters from a side, settles with restrained vertical motion into a camera-readable three-quarter presentation, holds, and departs while the tabletop context persists.",
    },
    visual_job: "Introduce a temporary participant without making the scene feel like an asset popped into a coordinate.",
    proof_strategy:
      "Bring a new actor from outside the active composition, settle it into a readable pose, preserve it long enough to inspect, then clear it without resetting the scene.",
    summary:
      "A presentation grammar for examples, components, alternatives, labels-as-objects, and temporary explanatory actors.",
    roles: [
      { id: "context_anchor", label: "Context anchor", purpose: "Persistent actor or scene that keeps the learner oriented.", required: true },
      { id: "insert_actor", label: "Insert actor", purpose: "Temporary participant being introduced or examined.", required: true },
    ],
    phases: ["offstage", "arrive", "settle", "present / hold", "depart"],
    parameters: [
      { id: "arrival_side", label: "Arrival side", default_value: "auto", purpose: "Use available negative space and current camera travel." },
      { id: "presentation_region", label: "Presentation region", default_value: "context-relative", purpose: "Place the insert where it reads without covering the anchor." },
      { id: "settle_strength", label: "Settle strength", default_value: "restrained", purpose: "Add enough arc/settle to feel intentional rather than flat." },
      { id: "presentation_duration", label: "Readable hold", default_value: "medium", purpose: "Keep the actor stable long enough to inspect." },
    ],
    hard_rules: [
      "Arrival and visibility envelopes are coupled; the actor cannot finish fading long after spatial arrival.",
      "Presentation orientation prioritizes recognizability unless a semantic constraint requires a different facing.",
      "Departure starts from the settled pose rather than from a hidden pre-departed key.",
      "Persistent context remains spatially coherent while the insert is introduced.",
    ],
    qualification: [
      { id: "readable_orientation", kind: "score", requirement: "Peak presentation produces a recognizable silhouette / three-quarter view." },
      { id: "arrival_shape", kind: "score", requirement: "Arrival includes a restrained settle rather than a flat constant-height slide." },
      { id: "hold_integrity", kind: "hard", requirement: "The settled pose remains stable through the intended presentation hold." },
      { id: "context_retention", kind: "score", requirement: "The established anchor remains readable during the insert." },
    ],
    fallbacks: ["Use the opposite side of the frame.", "Reduce insert scale or widen framing.", "Choose a higher/lower presentation lane.", "Use a static callout motif if no safe arrival path exists."],
    generalizes_to: ["cell → mitochondrion", "engine → piston", "sentence → verb example", "ecosystem → animal", "circuit → component"],
    primitives: ["offstage placement", "arrival arc", "settle", "presentation yaw", "visibility envelope", "departure"],
    atomic_capability_ids: ["enter_frame", "settle", "hold", "exit_frame", "highlight_subject"],
    policies: ["continuous_spatial_journey", "c2_camera_motion", "preserve_context_anchor", "readable_actor_presentation", "action_readability_hold"],
  },
  {
    level: "perceptual_composite",
    id: "overlapping_attention_handoff",
    label: "Overlapping Attention Handoff",
    short_label: "Attention handoff",
    category: "attention_continuity",
    status: "first_build",
    source: {
      film: "Golden Lunch",
      beat: "Cow → chicken attention transfer",
      time_range: "~10.45–12.9 s",
      evidence:
        "The next actor starts arriving before the previous composition fully disappears, while camera attention and emphasis transfer continuously across overlapping envelopes.",
    },
    visual_job: "Make the learner naturally stop looking at A and start looking at B without a visual reset.",
    proof_strategy:
      "Overlap source de-emphasis, target arrival/emphasis, and camera target bias so attention moves continuously while shared context remains visible.",
    summary:
      "A connective motif that lets larger educational sequences flow between participants instead of behaving like independent shots.",
    roles: [
      { id: "source_actor", label: "Source actor", purpose: "Current attention owner.", required: true },
      { id: "target_actor", label: "Target actor", purpose: "Next attention owner.", required: true },
      { id: "context_anchor", label: "Context anchor", purpose: "Optional shared spatial reference that should persist.", required: false },
    ],
    phases: ["source hold", "target anticipation", "overlap", "attention transfer", "target hold"],
    parameters: [
      { id: "handoff_overlap", label: "Overlap", default_value: "medium", purpose: "Control how much source and target coexist during the transfer." },
      { id: "attention_bias", label: "Attention bias", default_value: "smooth", purpose: "Blend camera target and visual emphasis rather than switching them discretely." },
      { id: "source_deemphasis", label: "Source de-emphasis", default_value: "restrained", purpose: "Reduce competition without making the source disappear abruptly." },
      { id: "target_emphasis", label: "Target emphasis", default_value: "clear", purpose: "Make the destination of attention unambiguous." },
    ],
    hard_rules: [
      "Camera attention does not jump from source to target in one frame.",
      "Source and target have an intentional coexistence window unless the narrative requires a hard interruption.",
      "Emphasis and camera attention derive from the same semantic handoff envelope.",
      "Shared context does not reset between the two attention owners.",
    ],
    qualification: [
      { id: "target_speed", kind: "hard", requirement: "Temporary camera target velocity stays within the continuity envelope." },
      { id: "overlap_window", kind: "score", requirement: "The source remains readable while the target becomes available." },
      { id: "attention_monotonicity", kind: "score", requirement: "Perceptual emphasis transfers progressively rather than oscillating." },
      { id: "context_continuity", kind: "score", requirement: "The viewer can still locate both actors in the same spatial model." },
    ],
    fallbacks: ["Increase overlap duration.", "Reduce camera target displacement.", "Use emphasis before camera motion.", "Insert a short shared-context hold before the transfer."],
    generalizes_to: ["step A → step B", "organ → adjacent organ", "term → contrasting term", "component → downstream component", "example 1 → example 2"],
    primitives: ["attention envelope", "target bias", "emphasis", "overlap timing", "context hold"],
    atomic_capability_ids: ["preserve_visual_anchor", "reframe", "keep_visible", "smooth_blend", "highlight_subject"],
    policies: ["continuous_spatial_journey", "c2_camera_motion", "preserve_context_anchor", "action_readability_hold"],
  },
  {
    level: "perceptual_composite",
    id: "occlusion_to_parallax_discovery",
    label: "Occlusion → Parallax Discovery",
    short_label: "Parallax reveal",
    category: "spatial_reveal",
    status: "first_build",
    source: {
      film: "Golden Lunch",
      beat: "Fish hidden behind burger",
      time_range: "setup ~12.9 s · reveal ~14.55–18.0 s",
      evidence:
        "The fish is physically hidden behind the burger, remains nearly fixed in world space, and becomes readable because the camera continues around the shared scene and earns separation through parallax.",
    },
    visual_job: "Reveal a previously hidden spatial relationship by moving the observer rather than moving the relationship.",
    proof_strategy:
      "Start with a real occlusion, keep occluder and hidden subject approximately world-fixed, then move the camera along a qualified lateral/orbital family until projected separation makes the hidden subject readable.",
    summary:
      "A geometry-aware discovery motif for behind/in-front-of relationships, hidden structures, nested systems, and viewpoint-dependent understanding.",
    roles: [
      { id: "occluder", label: "Occluder", purpose: "Foreground actor that initially hides the subject.", required: true },
      { id: "hidden_subject", label: "Hidden subject", purpose: "Actor discovered through camera motion.", required: true },
      { id: "context", label: "Context", purpose: "Optional actors that preserve scene scale and orientation.", required: false },
    ],
    phases: ["establish hidden", "begin viewpoint change", "progressive discovery", "readable reveal", "hold / continue"],
    parameters: [
      { id: "reveal_side", label: "Reveal side", default_value: "auto", purpose: "Choose the side with a safe path and stronger projected separation." },
      { id: "reveal_strength", label: "Reveal strength", default_value: "clear", purpose: "Control how much final projected separation is required." },
      { id: "orbit_extent", label: "Orbit extent", default_value: "qualified", purpose: "Search an angular range instead of accepting a fixed degree count." },
      { id: "camera_energy", label: "Camera energy", default_value: "restrained", purpose: "Shape speed while preserving progressive discovery." },
    ],
    hard_rules: [
      "The hidden subject is substantially occluded at the start.",
      "The reveal is primarily camera-earned; opacity, sliding, or shrinking the occluder cannot be the main mechanism.",
      "Occluder and hidden subject remain approximately fixed relative to the scene during discovery.",
      "The occluder remains visible after the reveal so the behind/in-front-of relationship is still legible.",
      "Camera direction remains monotonic through the core discovery unless a reversal is explicitly required by the lesson.",
    ],
    qualification: [
      { id: "initial_overlap", kind: "hard", requirement: "Projected occlusion exceeds the motif's starting overlap threshold." },
      { id: "reveal_curve", kind: "score", requirement: "Projected separation grows progressively rather than exposing the subject immediately." },
      { id: "world_stability", kind: "hard", requirement: "Hidden subject drift stays below a geometry-relative tolerance during the reveal." },
      { id: "final_readability", kind: "hard", requirement: "Hidden subject reaches a readable silhouette while the occluder remains visible." },
      { id: "camera_safety", kind: "hard", requirement: "Candidate rail clears geometry and maintains safe frame margins." },
    ],
    fallbacks: ["Try the opposite reveal side.", "Increase physical depth separation.", "Widen camera radius.", "Reduce starting occluder occupancy.", "Choose a non-occlusion spatial reveal motif if no candidate qualifies."],
    generalizes_to: ["engine housing → piston", "skull → hidden anatomy", "Earth → Moon", "foreground atom → rear atom", "wall → hidden object"],
    primitives: ["occlusion staging", "actor-relative orbit", "screen-space projection", "parallax", "camera rail search", "readable hold"],
    atomic_capability_ids: ["conceal", "orbit", "reveal", "keep_visible", "highlight_subject"],
    policies: ["continuous_spatial_journey", "c2_camera_motion", "preserve_context_anchor", "readable_actor_presentation", "action_readability_hold"],
  },
  {
    level: "perceptual_composite",
    id: "context_to_hero_resolution",
    label: "Context → Hero Resolution",
    short_label: "Hero resolution",
    category: "resolution",
    status: "first_build",
    source: {
      film: "Golden Lunch",
      beat: "Final burger hero payoff",
      time_range: "~23.05–25.85 s",
      evidence:
        "The ongoing spatial journey resolves into a lower, beauty-shot-like burger composition while supporting foods recede and the burger becomes the unambiguous final answer.",
    },
    visual_job: "Convert an actor that lived inside a larger context into the final conceptual answer or takeaway.",
    proof_strategy:
      "Preserve scene continuity while increasing hero dominance, reducing competition, shaping camera elevation/framing, and settling into a decisive final composition.",
    summary:
      "A concluding motif for landing an explanation on the object, component, variable, or relationship the learner should leave with.",
    roles: [
      { id: "hero", label: "Hero", purpose: "Final conceptual focus.", required: true },
      { id: "supporting_context", label: "Supporting context", purpose: "Previously established actors that should recede without vanishing arbitrarily.", required: false },
    ],
    phases: ["context hold", "priority shift", "hero push", "support recession", "final settle"],
    parameters: [
      { id: "hero_dominance", label: "Hero dominance", default_value: "strong", purpose: "Set the desired final screen-space priority." },
      { id: "ending_elevation", label: "Ending elevation", default_value: "beauty-low", purpose: "Prefer a readable, flattering final angle over a generic top-down view." },
      { id: "push_strength", label: "Push strength", default_value: "moderate", purpose: "Control how much the camera closes on the hero." },
      { id: "support_deemphasis", label: "Support de-emphasis", default_value: "restrained", purpose: "Reduce competition while preserving enough context to understand the conclusion." },
    ],
    hard_rules: [
      "Hero dominance increases through the ending rather than peaking early and weakening before the final frame.",
      "The final camera move inherits the existing spatial journey when compatible instead of resetting to a new shot.",
      "Supporting actors may recede or soften but cannot create a distracting simultaneous event.",
      "The final frame must hold long enough to read as a resolution rather than another passing waypoint.",
    ],
    qualification: [
      { id: "hero_screen_priority", kind: "hard", requirement: "Hero occupies the intended dominant screen-space range at the ending hold." },
      { id: "ending_height", kind: "score", requirement: "Camera elevation fits the motif's presentation family rather than defaulting to overhead." },
      { id: "support_competition", kind: "score", requirement: "Supporting actors remain contextual but do not rival hero salience." },
      { id: "ending_settle", kind: "hard", requirement: "Camera and hero emphasis converge into a stable final hold." },
    ],
    fallbacks: ["Widen slightly and reduce support emphasis.", "Lower camera elevation.", "Shift support actors toward frame edges.", "Use an attention-isolation resolution if a physical hero push cannot frame safely."],
    generalizes_to: ["cell → mitochondrion", "engine → piston", "system → key variable", "solar system → Earth", "sentence → verb"],
    primitives: ["dolly / push", "target bias", "screen-space dominance", "support de-emphasis", "camera height shaping", "settle"],
    atomic_capability_ids: ["isolate", "push_in", "preserve_visual_anchor", "hold_for_understanding", "highlight_subject"],
    policies: ["continuous_spatial_journey", "c2_camera_motion", "preserve_context_anchor", "readable_actor_presentation", "action_readability_hold"],
  },
  {
    level: "perceptual_composite",
    id: "recap_sweep",
    label: "Recap Sweep",
    short_label: "Recap sweep",
    category: "recap",
    status: "next",
    source: {
      film: "Golden Lunch",
      beat: "Return / recap across tray",
      time_range: "attention sequence ~17.75–20.9 s",
      evidence:
        "After the fish discovery, the camera continues through the established space while attention revisits apple, burger, and nigiri instead of cutting to independent recap shots.",
    },
    visual_job: "Revisit established elements so new information can be integrated into the original spatial model.",
    proof_strategy:
      "Move attention through an ordered set of known actors while preserving the same scene and, when possible, the existing camera journey.",
    summary:
      "A spatial recap grammar for reviewing a process, system, set of parts, or earlier concepts after a new relationship has been introduced.",
    roles: [
      { id: "scene_anchor", label: "Scene anchor", purpose: "Stable spatial model being revisited.", required: true },
      { id: "targets", label: "Ordered targets", purpose: "Two or more previously established attention targets.", required: true },
    ],
    phases: ["re-enter context", "target 1", "handoff", "target 2+", "integration hold"],
    parameters: [
      { id: "attention_order", label: "Attention order", default_value: "semantic", purpose: "Follow causal or conceptual order rather than arbitrary screen order." },
      { id: "recap_strength", label: "Recap strength", default_value: "light", purpose: "Re-emphasize without making each target feel like a new hero shot." },
      { id: "transition_overlap", label: "Transition overlap", default_value: "medium", purpose: "Blend target changes smoothly." },
    ],
    hard_rules: [
      "Targets must already be spatially established before the recap begins.",
      "The recap cannot rebuild the scene from scratch between targets.",
      "Attention order remains unambiguous even when camera motion continues."],
    qualification: [
      { id: "ordered_attention", kind: "hard", requirement: "Each target reaches a distinct local attention peak in the requested order." },
      { id: "journey_continuity", kind: "score", requirement: "Camera travel remains coherent with the pre-recap trajectory." },
      { id: "integration_readability", kind: "score", requirement: "The learner can still see the targets as parts of one shared system." },
    ],
    fallbacks: ["Reduce the number of recap targets.", "Use smaller camera target biases.", "Hold a wider shared composition and move emphasis only.", "Split into two recap groups when the scene is too spatially broad."],
    generalizes_to: ["heart → lungs → body", "piston → rod → crankshaft", "dendrite → soma → axon", "steps in a cycle", "parts of an equation"],
    primitives: ["ordered attention", "camera target bias", "emphasis envelope", "shared-scene travel"],
    atomic_capability_ids: ["return_to_context", "pan", "reframe", "summarize", "highlight_subject"],
    policies: ["continuous_spatial_journey", "c2_camera_motion", "preserve_context_anchor", "action_readability_hold"],
  },
  {
    level: "perceptual_composite",
    id: "action_consequence_reframe",
    label: "Action → Consequence Reframe",
    short_label: "Consequence reframe",
    category: "consequence",
    status: "candidate",
    source: {
      film: "Golden Lunch",
      beat: "Post-nudge burger readability",
      time_range: "~4.5–7.3 s",
      evidence:
        "After the hand intervention resolves, the film gives the changed burger state its own readable compositional priority before the next insert dominates.",
    },
    visual_job: "Give a changed state enough compositional priority that the learner can register the result of the preceding action.",
    proof_strategy:
      "After an intervention, bias framing and attention toward the resulting state while the causal context recedes, then continue into the next motif.",
    summary:
      "A candidate bridge motif for lessons where the consequence—not the action itself—is the key thing the learner must notice.",
    roles: [
      { id: "changed_target", label: "Changed target", purpose: "Actor or state that should become readable after an action.", required: true },
      { id: "causal_context", label: "Causal context", purpose: "Optional effector or scene evidence that may recede after the change.", required: false },
    ],
    phases: ["action resolves", "priority transfer", "consequence hold", "exit / next motif"],
    parameters: [
      { id: "reframe_strength", label: "Reframe strength", default_value: "moderate", purpose: "Control how much composition shifts toward the changed target." },
      { id: "hold_duration", label: "Consequence hold", default_value: "readable", purpose: "Guarantee time to perceive the new state." },
    ],
    hard_rules: [
      "The consequence must already exist before the reframe claims it.",
      "The reframe cannot hide the changed feature it is meant to clarify.",
      "The bridge should inherit camera momentum when possible."],
    qualification: [
      { id: "state_visibility", kind: "hard", requirement: "The changed state is visibly readable during the hold." },
      { id: "causal_order", kind: "hard", requirement: "Reframe begins after the causal event rather than anticipating the consequence." },
      { id: "bridge_continuity", kind: "score", requirement: "The move feels like continuation, not a new disconnected shot." },
    ],
    fallbacks: ["Increase the consequence hold.", "Reduce competing context.", "Use a context-to-hero resolution if this is also the final takeaway."],
    generalizes_to: ["domino after push", "lever after press", "molecule after reaction", "graph after parameter change", "object after deformation"],
    primitives: ["attention transfer", "reframe", "hold", "context deemphasis"],
    atomic_capability_ids: ["show_consequence", "reframe", "hold_for_understanding", "preserve_actor_state", "highlight_subject"],
    policies: ["continuous_spatial_journey", "c2_camera_motion", "preserve_context_anchor", "action_readability_hold"],
  },
];

export const FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS = [
  "agent_approach_contact_response_retreat",
  "arrive_settle_present_depart",
  "overlapping_attention_handoff",
  "occlusion_to_parallax_discovery",
  "context_to_hero_resolution",
] as const;

export const DIRECTOR_PERCEPTUAL_CAPABILITY_VERSION = "director_perceptual_capabilities_phase1b6_v1";
