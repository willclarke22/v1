/** V3.7D.2C.4: entirely invented, non-user data for a safe 3D renderer demo.
 * Nothing in this module queries storage, embeds text, or represents learner metrics.
 */
import type { Topic } from "@/types/topic";
import type { LearningSpaceRelationship } from "@/types/learning-space";

const syntheticLink = (
  id: string, source: string, target: string,
  kind: "semantic_similarity" | "shared_confusion_pattern" | "shared_insight_pattern",
  strength: number,
): LearningSpaceRelationship => ({
  relationship_id: `demo-${id}`,
  source_topic_id: source,
  target_topic_id: target,
  relationship_type: kind,
  strength,
  confidence: 0.85,
  evidence_count: 0,
  evidence_source: ["synthetic_cloud_demo"],
  evidence_summary: "Illustrative connection only; not derived from a learner.",
  affects_layout: false,
  visible_by_default: false,
  basis: {
    similarity: kind === "semantic_similarity" ? strength : null,
    normalized_similarity: strength,
    desired_distance: null,
    actual_distance: null,
    diagnostic_method: "synthetic_cloud_demo",
  },
  display_policy: {
    show_in_overview: false,
    show_on_focus: true,
    visible_by_default: false,
    affects_layout: false,
    max_opacity: 0.55,
    visual_style: "arc",
    priority: 2,
  },
});

const relationships: LearningSpaceRelationship[] = [
  syntheticLink("circuit-ohm", "demo-circuits", "demo-ohms", "semantic_similarity", 0.9),
  syntheticLink("circuit-series", "demo-circuits", "demo-series", "semantic_similarity", 0.86),
  syntheticLink("wave-double", "demo-waves", "demo-double-slit", "semantic_similarity", 0.91),
  syntheticLink("resp-krebs", "demo-respiration", "demo-krebs", "semantic_similarity", 0.91),
  syntheticLink("confusion", "demo-double-slit", "demo-series", "shared_confusion_pattern", 0.68),
  syntheticLink("insight", "demo-ohms", "demo-newton", "shared_insight_pattern", 0.72),
];

/** Values below are fictional display fixtures, NOT model-derived scores. */
export const DEMO_TOPICS: Topic[] = [
  { id:"demo-circuits", topic_label:"Electrical Circuits", diagnosis:"representation_gap", nextStep:"Explore a closed circuit", confusion:.54, insight:.27, learningScore:.35, position:[-2.5,.25,-.6], scale:1.15, messageCount:5, learningSpaceRelationships: relationships },
  { id:"demo-ohms", topic_label:"Ohm's Law", diagnosis:"procedure_gap", nextStep:"Compare current and voltage", confusion:.28, insight:.61, learningScore:.53, position:[-3.7,-.4,1.15], scale:.96, messageCount:3 },
  { id:"demo-series", topic_label:"Series vs Parallel", diagnosis:"discrimination_gap", nextStep:"Compare two arrangements", confusion:.46, insight:.36, learningScore:.43, position:[-1.4,.7,1.8], scale:1, messageCount:4 },
  { id:"demo-waves", topic_label:"Wave Interference", diagnosis:"representation_gap", nextStep:"Explore superposition", confusion:.22, insight:.64, learningScore:.66, position:[.9,.5,-1.2], scale:1.13, messageCount:4 },
  { id:"demo-double-slit", topic_label:"Double-Slit Experiment", diagnosis:"representation_gap", nextStep:"Compare patterns", confusion:.71, insight:.23, learningScore:.25, position:[2.3,-.1,.6], scale:1.12, messageCount:5 },
  { id:"demo-respiration", topic_label:"Cellular Respiration", diagnosis:"recall_gap", nextStep:"Trace energy flow", confusion:.36, insight:.42, learningScore:.56, position:[-1.2,-.65,-2.45], scale:1.06, messageCount:3 },
  { id:"demo-krebs", topic_label:"Krebs Cycle", diagnosis:"procedure_gap", nextStep:"Identify sequence", confusion:.52, insight:.32, learningScore:.42, position:[.25,-1.25,-3.15], scale:.96, messageCount:3 },
  { id:"demo-newton", topic_label:"Newton's Laws", diagnosis:"transfer_gap", nextStep:"Predict motion", confusion:.3, insight:.58, learningScore:.62, position:[3.55,.8,-1.8], scale:1.07, messageCount:6 },
  { id:"demo-spanish", topic_label:"Spanish: Use of 'se'", diagnosis:"discrimination_gap", nextStep:"Compare example sentences", confusion:.44, insight:.49, learningScore:.4, position:[2.8,-.85,3.2], scale:1, messageCount:3 },
];
