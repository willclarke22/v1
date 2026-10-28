/** V3.7D.2C.1: strict shadow-only semantic-verification contract. No write authority. */
export const VERIFIER_FORMAT="myway_topic_association_verifier_v1" as const;
export type VerifierRelation="same_topic_same_difficulty"|"same_topic_new_difficulty"|"new_topic"|"uncertain";
export type VerifierCandidate={topicId:string;topicLabel:string;topicSimilarity:number|null;difficultySimilarity:number|null;storedRootProblems:string[]};
export type VerifierInput={topicName:string;rootProblem:string;originalStatement:string;clarification:string;candidates:VerifierCandidate[]};
export type VerifierDecision={relation:VerifierRelation;target_topic_id:string;rationale:string};
export const VERIFIER_SCHEMA={type:"object",additionalProperties:false,properties:{
 relation:{type:"string",enum:["same_topic_same_difficulty","same_topic_new_difficulty","new_topic","uncertain"]},
 target_topic_id:{type:"string"},rationale:{type:"string"}},required:["relation","target_topic_id","rationale"]} as const;
export const VERIFIER_SYSTEM_PROMPT=`You compare a learner's diagnosed difficulty with up to three retrieved topic memories. This is a diagnostic SHADOW judgment, not authorization to change data.
Choose exactly one: same_topic_same_difficulty, same_topic_new_difficulty, new_topic, uncertain.
Distinguish the subject of the topic from the specific difficulty. Historical difficulty evidence takes priority over literal label overlap or uncalibrated cosine scores. A semantically similar subject does not prove a repeated misconception. An absence of retrieval matches is not proof of novelty.
Only use candidate topic IDs supplied in the input. For either same_topic option, copy the exact ID; for new_topic or uncertain, target_topic_id must be an empty string.
If information is insufficient or candidate topics conflict, say uncertain. Never invent learner beliefs, topic history, or confidence probabilities. Explain the deciding evidence in at most 45 words. Return only the requested JSON object.`;
const obj=(x:unknown):Record<string,unknown>|null=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
export function verifierInput(x:{topicName:string;rootProblem:string;originalStatement:string;clarification:string;candidates:VerifierCandidate[]}):VerifierInput{
 const short=(s:string,n:number)=>s.replace(/\s+/g," ").trim().slice(0,n);
 return {topicName:short(x.topicName,100),rootProblem:short(x.rootProblem,480),originalStatement:short(x.originalStatement,550),clarification:short(x.clarification,250),candidates:x.candidates.slice(0,3).map(c=>({
 topicId:short(c.topicId,80),topicLabel:short(c.topicLabel,110),topicSimilarity:c.topicSimilarity,difficultySimilarity:c.difficultySimilarity,storedRootProblems:c.storedRootProblems.slice(0,3).map(t=>short(t,330))}))};
}
export function validVerifierInput(value:unknown):value is VerifierInput{
 const v=obj(value);if(!v||Object.keys(v).sort().join('|')!==['topicName','rootProblem','originalStatement','clarification','candidates'].sort().join('|'))return false;
 if(!Array.isArray(v.candidates)||v.candidates.length>3||!v.candidates.every(x=>{const c=obj(x);return !!c&&typeof c.topicId==='string'&&c.topicId.length>0&&c.topicId.length<=80&&typeof c.topicLabel==='string'&&c.topicLabel.length<=110&&['topicSimilarity','difficultySimilarity'].every(k=>c[k]===null||(typeof c[k]==='number'&&Number.isFinite(c[k])&&c[k]>=-1&&c[k]<=1))&&Array.isArray(c.storedRootProblems)&&c.storedRootProblems.length<=3&&c.storedRootProblems.every(t=>typeof t==='string'&&t.length<=330)}))return false;
 return typeof v.topicName==='string'&&v.topicName.length<=100&&typeof v.rootProblem==='string'&&v.rootProblem.length>=15&&v.rootProblem.length<=480&&typeof v.originalStatement==='string'&&v.originalStatement.length<=550&&typeof v.clarification==='string'&&v.clarification.length<=250&&JSON.stringify(v).length<3500;
}
export function parseVerifier(raw:string,input:VerifierInput):{decision:VerifierDecision|null;error:string|null}{
 try{
  const trimmed=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const p=obj(JSON.parse(trimmed));if(!p||Object.keys(p).sort().join('|')!==['relation','target_topic_id','rationale'].sort().join('|'))return {decision:null,error:'Unexpected verifier fields'};
  const relation=p.relation;
  if(!['same_topic_same_difficulty','same_topic_new_difficulty','new_topic','uncertain'].includes(String(relation))||typeof p.target_topic_id!=='string'||typeof p.rationale!=='string'||p.rationale.trim().length<12||p.rationale.length>360)return {decision:null,error:'Invalid verifier decision'};
  const same=relation==='same_topic_same_difficulty'||relation==='same_topic_new_difficulty';
  if(same?!input.candidates.some(c=>c.topicId===p.target_topic_id):p.target_topic_id!=='')return {decision:null,error:'Verifier target is not a supplied candidate'};
  if(relation==='new_topic'&&input.candidates.length===0)return {decision:null,error:'No candidates is not proof of new topic'};
  return {decision:{relation:relation as VerifierRelation,target_topic_id:p.target_topic_id,rationale:p.rationale.trim()},error:null};
 }catch{return {decision:null,error:'Verifier returned invalid JSON'};}
}
