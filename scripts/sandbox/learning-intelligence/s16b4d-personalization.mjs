/** S1.6B.4D: evidence-bounded, temporary personalization. No profile write or inference. */
import {adaptExistingPersonalization} from './s16b4a-interfaces.mjs';
import {INTEREST_USE_MODES} from './s16b4a-teaching-contract.mjs';
export const PERSONALIZATION_VERSION='myway_personalization_selector_v1';
const norm=x=>String(x??'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
const valid=x=>x&&typeof x==='object'&&!Array.isArray(x);
const matchScope=(x,topic,diagnosis)=>x.scope==='global'||x.scope==='topic'&&norm(x.scope_key)===norm(topic)||x.scope==='diagnosis_label'&&norm(x.scope_key)===norm(diagnosis);
const text=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const safeResult=(reason,preferences,excluded=[])=>({schema_version:'myway_personalization_decision_v1',selector_version:PERSONALIZATION_VERSION,
 chosen_interest:null,use_interest:'do_not_use',reason,structural_mapping:'',anti_distortion_guard:'No unverified analogy or interest is authorized.',
 preferences,excluded,profile_mutations:0,confidence_is_not_learning_effectiveness:true});
/** bridgeCandidates are separately curated proposals, NOT arbitrary model suggestions.
 * Unknown interests and unverified structural mappings always result in do_not_use.
 */
export function chooseTeachingPersonalization({profileInput={},topic,diagnosisLabel='',action,bridgeCandidates=[]}={}){
 if(!text(topic,300)||!text(action,80)||!Array.isArray(bridgeCandidates)||bridgeCandidates.length>20)throw Error('Invalid personalization selection inputs');
 const p=adaptExistingPersonalization(profileInput), excluded=[];
 const signals=p.teaching_signals.filter(s=>matchScope(s,topic,diagnosisLabel));
 const strong=s=>s.confidence>=0.65&&s.evidence_count>=2;
 const avoid=signals.filter(s=>s.direction==='avoid'&&s.confidence>=0.5&&s.evidence_count>=1);
 const optOut=avoid.some(s=>s.kind==='presentation_style'&&['analogy_based','metaphor_based','concrete_examples','real_world_connection'].includes(s.value)||s.kind==='bridge_level'&&s.value==='bridge_0');
 const style=[...signals].filter(s=>s.kind==='presentation_style'&&s.direction==='prefer'&&strong(s)&&!avoid.some(a=>a.kind===s.kind&&a.value===s.value));
 style.sort((a,b)=>b.confidence*b.evidence_count-a.confidence*a.evidence_count||a.signal_id.localeCompare(b.signal_id));
 const preferredStyle=p.presentation.preferred_style&&!avoid.some(a=>a.value===p.presentation.preferred_style)?p.presentation.preferred_style:style[0]?.value??null;
 const preferences={preferred_style:preferredStyle,jargon_level:p.presentation.jargon_level,bridge_level:p.presentation.bridge_level,avoided_styles:avoid.filter(s=>s.kind==='presentation_style').map(s=>s.value).slice(0,5),source_schema:p.source_schema,
  evidence_level:style[0]?{confidence:style[0].confidence,evidence_count:style[0].evidence_count}:null};
 if(['acknowledge_correction','close_clarification'].includes(action))return safeResult('Correction and closure are clearer without interest analogies.',preferences);
 if(optOut||p.presentation.bridge_level==='bridge_0')return safeResult('A learner preference prohibits analogy-based personalization.',preferences);
 const sourceInterests=new Map();
 for(const x of p.explicitly_provided_interests)if(x.user_interest_confidence>=0.7)sourceInterests.set(norm(x.interest),{interest:x.interest,confidence:x.user_interest_confidence,source:'user_provided_interest'});
 for(const x of p.example_domains){if(!matchScope(x,topic,diagnosisLabel)||x.confidence<0.70||x.evidence_count<2||x.preference_score<=0.25)continue;
  const key=norm(x.domain);if(!sourceInterests.has(key))sourceInterests.set(key,{interest:x.domain,confidence:x.confidence,source:'supported_example_domain',recent_use_count:x.recent_use_count});}
 const eligible=[];
 for(const c of bridgeCandidates){
  if(!valid(c)||!text(c.interest,120)||!text(c.topic,300)||!INTEREST_USE_MODES.includes(c.mode)||!text(c.evidence_tag,130))throw Error('Malformed bridge candidate');
  const source=sourceInterests.get(norm(c.interest));
  if(!source){excluded.push({interest:c.interest,reason:'unsupported_interest'});continue;}
  if(norm(c.topic)!==norm(topic)){excluded.push({interest:c.interest,reason:'topic_mismatch'});continue;}
  const domain=p.example_domains.find(x=>norm(x.domain)===norm(c.interest)&&matchScope(x,topic,diagnosisLabel));
  if(domain&&domain.preference_score< -0.25&&domain.confidence>=0.5){excluded.push({interest:c.interest,reason:'avoided_interest_domain'});continue;}
  if(domain&&domain.recent_use_count>=3){excluded.push({interest:c.interest,reason:'repetition_limit'});continue;}
  if(c.mode==='structural_bridge'&&(!text(c.structural_mapping,600)||!text(c.anti_distortion_guard,600)||!text(c.mechanism_match,200)||c.review_status!=='curated_illustrative')){excluded.push({interest:c.interest,reason:'mapping_not_curated'});continue;}
  if(c.mode==='light_tone'&&(!text(c.anti_distortion_guard,600)||c.review_status!=='curated_illustrative')){excluded.push({interest:c.interest,reason:'light_reference_not_curated'});continue;}
  if(c.mode==='do_not_use')continue;
  eligible.push({c,source,domain,rank:(source.confidence??0)-(domain?.recent_use_count??0)*0.1+(c.mode==='structural_bridge'?0.15:0)});
 }
 eligible.sort((a,b)=>b.rank-a.rank||a.c.interest.localeCompare(b.c.interest));
 const best=eligible[0];if(!best)return safeResult('No supported, relevant, non-repetitive interest mapping was available.',preferences,excluded);
 return {schema_version:'myway_personalization_decision_v1',selector_version:PERSONALIZATION_VERSION,
  chosen_interest:best.c.interest,use_interest:best.c.mode,reason:`Illustrative ${best.c.mode} supported by ${best.source.source}; teaching benefit unverified.`,
  structural_mapping:best.c.mode==='structural_bridge'?best.c.structural_mapping:'',anti_distortion_guard:best.c.anti_distortion_guard,
  evidence_tag:best.c.evidence_tag,mechanism_match:best.c.mechanism_match??null,preferences,excluded,profile_mutations:0,confidence_is_not_learning_effectiveness:true};
}
