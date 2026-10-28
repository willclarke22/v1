/** D.2C.2 manual review policy; Model C output is advisory, not server authority. */
import type { TopicMemoryPreview } from "./topic-memory-preview";
export type ReviewRelation="same_topic_same_difficulty"|"same_topic_new_difficulty";
export function validateReviewedAssociation(preview:TopicMemoryPreview,targetTopicId:string,relation:string,rootConfidence:number):{ok:boolean;reason:string}{
 if(!["same_topic_same_difficulty","same_topic_new_difficulty"].includes(relation))return {ok:false,reason:"invalid_relation"};
 if(preview.retrievalStatus!=="semantic_pgvector"||!Number.isFinite(rootConfidence)||rootConfidence<0.70)return {ok:false,reason:"insufficient_evidence"};
 const candidate=preview.candidates.find(c=>c.topicId===targetTopicId);
 if(!candidate||!candidate.storedRootProblems.length||candidate.comparison!=="historical_evidence")return {ok:false,reason:"missing_historical_evidence"};
 const similarity=candidate.rootProblemSemanticSimilarity;
 if(similarity===null||!Number.isFinite(similarity)||similarity<0.68)return {ok:false,reason:"low_semantic_evidence"};
 const rival=preview.candidates.filter(c=>c.topicId!==targetTopicId&&c.rootProblemSemanticSimilarity!==null)
  .reduce((best,c)=>Math.max(best,c.rootProblemSemanticSimilarity??-1),-1);
 if(rival>=similarity-0.04)return {ok:false,reason:"ambiguous_candidates"};
 return {ok:true,reason:"manual_review_supported"};
}
