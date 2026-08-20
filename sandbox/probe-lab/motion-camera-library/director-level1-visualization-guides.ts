import type { DirectorPerceptualCapability } from "./director-perceptual-capabilities";

export const DIRECTOR_LEVEL1_VISUALIZATION_VERSION =
  "director_level1_visualizations_phase1b6_2_v1" as const;

export type DirectorLevel1VisualizationGuide = {
  capability_id: string;
  headline: string;
  watch_for: string[];
  source_mechanism: string;
  production_boundary: string;
};

export const DIRECTOR_LEVEL1_VISUALIZATION_GUIDES: DirectorLevel1VisualizationGuide[] = [
  {
    capability_id: "agent_approach_contact_response_retreat",
    headline: "Cause becomes visible as approach → contact → response → clear retreat.",
    watch_for: [
      "The target is stable before the effector arrives.",
      "Contact is readable before the target response becomes dominant.",
      "The target keeps the changed state while the effector retreats.",
    ],
    source_mechanism: "Golden Lunch hand → burger nudge, generalized as visible causal intervention.",
    production_boundary:
      "The proof uses normalized role-space only. Production contact corridors and response vectors must come from measured asset geometry/directability.",
  },
  {
    capability_id: "arrive_settle_present_depart",
    headline: "A temporary actor enters intentionally, settles, presents, then leaves without resetting context.",
    watch_for: [
      "The insert begins off the active composition instead of popping into place.",
      "Arrival includes a restrained settle before the readable hold.",
      "The context anchor persists while the insert departs from its settled pose.",
    ],
    source_mechanism: "Golden Lunch cow/chicken entrances, generalized as readable participant presentation.",
    production_boundary:
      "Arrival side, presentation region, facing, and clearance are solved from the selected scene and asset geometry in production.",
  },
  {
    capability_id: "overlapping_attention_handoff",
    headline: "Attention transfers from A to B through an overlap instead of a hard visual reset.",
    watch_for: [
      "The source remains readable while the target becomes available.",
      "Source emphasis decreases as target emphasis increases.",
      "Camera target bias moves continuously toward the new attention owner.",
    ],
    source_mechanism: "Golden Lunch cow → chicken attention transfer, generalized as continuous attention choreography.",
    production_boundary:
      "Production framing and target bias are geometry-aware; the visualization only demonstrates the semantic handoff envelope.",
  },
  {
    capability_id: "occlusion_to_parallax_discovery",
    headline: "A hidden subject is discovered because the camera moves, not because the hidden relationship moves.",
    watch_for: [
      "The hidden subject starts substantially behind the foreground occluder.",
      "Occluder and hidden subject remain world-stable during the reveal.",
      "Camera travel creates progressive projected separation while the occluder remains visible.",
    ],
    source_mechanism: "Golden Lunch fish-behind-burger discovery, generalized as camera-earned spatial revelation.",
    production_boundary:
      "Production must search geometry-qualified viewpoints for real occlusion, safe clearance, reveal curve, and final screen-space readability.",
  },
  {
    capability_id: "context_to_hero_resolution",
    headline: "A contextual actor becomes the final answer through increasing screen priority and a settled hero composition.",
    watch_for: [
      "Hero emphasis rises progressively instead of peaking early.",
      "Supporting actors recede without arbitrary disappearance.",
      "The camera lowers and pushes toward a stable final hero hold.",
    ],
    source_mechanism: "Golden Lunch final burger payoff, generalized as context → conceptual hero resolution.",
    production_boundary:
      "Hero framing, ending elevation, support placement, and screen occupancy must be solved from real scene geometry in production.",
  },
  {
    capability_id: "recap_sweep",
    headline: "Previously established targets are revisited in order while remaining part of one shared spatial model.",
    watch_for: [
      "Targets reach distinct attention peaks in a deliberate order.",
      "The camera continues through the established space rather than rebuilding separate shots.",
      "The scene anchor keeps the recap integrated instead of becoming a slideshow.",
    ],
    source_mechanism: "Golden Lunch late tray recap, generalized as ordered spatial review.",
    production_boundary:
      "Production target order is semantic; exact camera rail and target biases are solved against the actual established scene.",
  },
  {
    capability_id: "action_consequence_reframe",
    headline: "After an action resolves, composition gives the resulting state enough priority to be understood.",
    watch_for: [
      "The changed state exists before the reframe claims it.",
      "Attention and framing transfer toward the consequence after the causal event.",
      "The consequence receives a readable hold while causal context recedes.",
    ],
    source_mechanism: "Golden Lunch post-nudge burger readability, generalized as consequence-first compositional priority.",
    production_boundary:
      "Production reframe strength and hold timing depend on the actual changed feature, camera momentum, and scene competition.",
  },
];

export function directorLevel1VisualizationGuide(
  capability: DirectorPerceptualCapability,
) {
  return (
    DIRECTOR_LEVEL1_VISUALIZATION_GUIDES.find(
      (guide) => guide.capability_id === capability.id,
    ) ?? null
  );
}
