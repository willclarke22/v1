/** S60 curated research benchmark. Private rubrics are never read by model input builders. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const DIR=path.join(path.dirname(fileURLToPath(import.meta.url)),'s16b60-fixtures');
const read=n=>JSON.parse(fs.readFileSync(path.join(DIR,n+'.json'),'utf8'));
const copy=x=>JSON.parse(JSON.stringify(x));
export function fixturePublic(){
 const topics=read('topics_public'),cases=read('cases_public'),links=read('curriculum_links_public');
 if(topics.length!==30||cases.length!==30)throw Error('S60 fixture requires 30 distinct topics and 30 focus cases');
 const ids=new Set(topics.map(t=>t.topic_id)),caseIds=new Set(cases.map(c=>c.case_id));
 if(ids.size!==30||caseIds.size!==30||new Set(cases.map(c=>c.focus_topic_id)).size!==30)throw Error('S60 duplicate/missing topic coverage');
 if(cases.some(c=>!ids.has(c.focus_topic_id)||!c.research_only||!c.no_assumed_mastery||!c.learner_id||!c.latest_observation?.id||!c.latest_observation?.text))throw Error('S60 invalid public case');
 for(const c of cases){
  const all=[...c.historical_observations,c.latest_observation],seen=new Set();
  for(const o of all){if(!ids.has(o.topic_id)||!o.text||seen.has(o.id)||!o.source||!o.task_conditions)throw Error('S60 invalid evidence in '+c.case_id);seen.add(o.id);}
  if(c.historical_observations.length<10)throw Error('S60 missing broad historical context in '+c.case_id);
 }
 if(links.some(x=>!ids.has(x.from_topic_id)||!ids.has(x.to_topic_id)||x.type!=='curriculum_reference_only'))throw Error('S60 invalid curricular link');
 if(JSON.stringify({topics,cases,links}).includes('researcher_hypothesis_not_ground_truth')||JSON.stringify(cases).includes('suggested_relationship_stance'))throw Error('Private material leaked to public fixture');
 return copy({topics,cases,links,synthetic:true,private_keys_exposed:false});
}
/** The benchmark invokes this ONLY after calls have completed, for a separate human review report. */
export function privateRubricForReview(caseId){const x=read('review_rubrics_PRIVATE').find(c=>c.case_id===caseId);if(!x)throw Error('Missing S60 review guide '+caseId);return copy(x);}
export function privateFixtureAudit(){const profiles=read('learner_profiles_PRIVATE'),rubrics=read('review_rubrics_PRIVATE');if(profiles.length!==8||rubrics.length!==30||rubrics.some(r=>r.automatic_semantic_correctness_scoring!==false))throw Error('S60 private fixture integrity failed');return {profiles:profiles.length,rubrics:rubrics.length};}
