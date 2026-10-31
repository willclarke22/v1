/** V3.7D.2C.5B: explicit scalar allowlist; no topic_json, learner transcripts or embeddings. */
import type { Topic } from "@/types/topic";
import type { DiagnosisType } from "@/types/contracts";
import type { LearningSpaceRelationship, LearningSpaceRelationshipType } from "@/types/learning-space";

export type CloudTopicRow = {
  topic_id: string; topic_label: string; diagnosis: string | null; next_step: string | null;
  confusion: number | null; insight: number | null; learning_score: number | null;
  topic_position_x: number; topic_position_y: number; topic_position_z: number;
  semantic_position_x: number | null; semantic_position_y: number | null; semantic_position_z: number | null;
  semantic_position_method: string | null; semantic_position_updated_at: string | null;
};
export type CloudRelationshipRow = {
  relationship_id: string; source_topic_id: string; target_topic_id: string;
  relationship_type: string; strength: number; confidence: number;
  evidence_count: number; visible_by_default: boolean; affects_layout: boolean;
  show_in_overview: boolean; show_on_focus: boolean; max_opacity: number;
  visual_style: string; priority: number;
};
const diagnoses = new Set<DiagnosisType>(["recall_gap", "representation_gap", "procedure_gap", "discrimination_gap", "transfer_gap"]);
const relationshipKinds = new Set<LearningSpaceRelationshipType>([
  "semantic", "semantic_similarity", "shared_diagnosis", "shared_confusion_pattern",
  "shared_insight_pattern", "prerequisite", "blocks", "transfer_bridge", "analogy",
  "same_cluster", "co_attempted", "content_source_overlap", "shared_confusion", "strategy", "temporal",
]);
const visualStyles = new Set(["arc", "thread", "arrow", "halo", "trail", "line", "dashed_line", "pulse_line"]);
const finite = (x:unknown, defaultValue:number):number => typeof x === "number" && Number.isFinite(x) ? x : defaultValue;
const fraction = (x:unknown, defaultValue:number) => Math.max(0, Math.min(1, finite(x, defaultValue)));
const shortString = (x:unknown, fallback:string, limit=140) => typeof x === "string" && x.trim() ? x.trim().slice(0,limit) : fallback;

export function mapCloudTopicRows(rows:CloudTopicRow[], edges:CloudRelationshipRow[]):Topic[] {
  const seen=new Set<string>();
  const topics:Topic[]=[];
  for(const r of rows){
    if (!r || typeof r.topic_id!=="string" || !r.topic_id || seen.has(r.topic_id) ||
      ![r.topic_position_x,r.topic_position_y,r.topic_position_z].every(v=>typeof v==="number"&&Number.isFinite(v))) continue;
    seen.add(r.topic_id);
    const semantic=[r.semantic_position_x,r.semantic_position_y,r.semantic_position_z];
    const hasSemantic=semantic.every(v=>typeof v==="number"&&Number.isFinite(v));
    topics.push({
      id:r.topic_id,topic_label:shortString(r.topic_label,"Untitled topic"),
      diagnosis:diagnoses.has(r.diagnosis as DiagnosisType)?r.diagnosis as DiagnosisType:"representation_gap",
      nextStep:shortString(r.next_step,"Continue learning",250),
      confusion:fraction(r.confusion,.5),insight:fraction(r.insight,.5),learningScore:fraction(r.learning_score,.5),
      position:[r.topic_position_x,r.topic_position_y,r.topic_position_z],
      semanticPosition:hasSemantic?[semantic[0] as number,semantic[1] as number,semantic[2] as number]:null,
      semanticPositionMethod:hasSemantic?r.semantic_position_method:null,
      semanticPositionUpdatedAt:hasSemantic?r.semantic_position_updated_at:null,
      positionSource:"topic_position",scale:1,messageCount:0,hasAvailableProbe:false,
    });
  }
  if (!topics.length) return [];
  const links:LearningSpaceRelationship[]=[];
  const linkIds=new Set<string>();
  for(const r of edges){
    if (!r || !r.relationship_id || linkIds.has(r.relationship_id) || !seen.has(r.source_topic_id) ||
      !seen.has(r.target_topic_id) || r.source_topic_id===r.target_topic_id ||
      !relationshipKinds.has(r.relationship_type as LearningSpaceRelationshipType))continue;
    linkIds.add(r.relationship_id);
    links.push({
      relationship_id:r.relationship_id,source_topic_id:r.source_topic_id,target_topic_id:r.target_topic_id,
      relationship_type:r.relationship_type as LearningSpaceRelationshipType,
      strength:fraction(r.strength,.5),confidence:fraction(r.confidence,.5),
      evidence_count:Math.max(0,Math.floor(finite(r.evidence_count,0))),
      evidence_source:[],evidence_summary:null,
      affects_layout:Boolean(r.affects_layout),visible_by_default:Boolean(r.visible_by_default),
      basis:{similarity:null,normalized_similarity:null,desired_distance:null,actual_distance:null,diagnostic_method:"owner_scoped_cloud_snapshot"},
      display_policy:{show_in_overview:Boolean(r.show_in_overview),show_on_focus:Boolean(r.show_on_focus),
        visible_by_default:Boolean(r.visible_by_default),affects_layout:Boolean(r.affects_layout),
        max_opacity:fraction(r.max_opacity,.35),visual_style:visualStyles.has(r.visual_style)?r.visual_style as LearningSpaceRelationship["display_policy"]["visual_style"]:"thread",
        priority:finite(r.priority,1)},
    });
  }
  topics[0].learningSpaceRelationships=links;
  return topics;
}
