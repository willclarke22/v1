/** R4.9 defensive, LOSSLESS B-beat grouping. B is the only author of narration.
 * Returns the exact same paragraph-joined learner-facing words, never paraphrases.
 * The original paid raw response always stays in trace.calls[].response_raw.
 */
import {validateBWithProbe} from './s62bfix1r46-probe-core.mjs';
import {teacherText} from './s62bfix1r43-goldloop-core.mjs';
const die=m=>{throw Error('R49: '+m);};
const tokens=s=>new Set(String(s).toLowerCase().match(/[\p{L}]{3,}/gu)?.filter(w=>!['the','and','for','with','that','this','from','where','which','when','into','here','how','use','show','learner','explain','example','meaning','understanding','sentence'].includes(w))??[]);
function affinity(a,b){const x=tokens(a.educational_purpose+' '+a.narration),y=tokens(b.educational_purpose+' '+b.narration);let inter=0;for(const w of x)if(y.has(w))inter++;return inter/Math.max(1,Math.sqrt(x.size*y.size));}
export function normalizeBBeats(raw,{maxBeats=8}={}){
 const original=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
 if(!original||!Array.isArray(original.beats)||!original.beats.length||original.beats.length>16)die('B has zero or over 16 beats; manual review required');
 for(let i=0;i<original.beats.length;i++){
  const b=original.beats[i];if(!b||b.id!==`b${String(i+1).padStart(2,'0')}`||!['narration','educational_purpose','visual_opportunity','learner_action'].every(k=>typeof b[k]==='string')||b.narration.trim().length<8||b.narration.length>1150)die('Malformed B beat; manual review required');
 }
 const groups=original.beats.map(b=>({source:[b.id],parts:[b]}));
 while(groups.length>maxBeats){
  let best=-1,score=-Infinity;
  for(let i=0;i<groups.length-1;i++){
   const a=groups[i],b=groups[i+1],chars=[...a.parts,...b.parts].map(p=>p.narration).join('\n\n').length;
   if(chars>1150)continue;
   const left=a.parts.at(-1),right=b.parts[0];
   const value=affinity(left,right)*1700-chars*0.25;
   if(value>score){score=value;best=i;}
  }
  if(best<0)die('Cannot losslessly group B narration into eight <=1150-char beats; saved paid response requires manual review');
  groups.splice(best,2,{source:[...groups[best].source,...groups[best+1].source],parts:[...groups[best].parts,...groups[best+1].parts]});
 }
 const candidate={...original,beats:groups.map((g,i)=>({
  id:`b${String(i+1).padStart(2,'0')}`,narration:g.parts.map(p=>p.narration).join('\n\n'),
  educational_purpose:g.parts.map(p=>p.educational_purpose).join(' | '),
  visual_opportunity:g.parts.map(p=>p.visual_opportunity).join(' | '),
  learner_action:g.parts.map(p=>p.learner_action).filter(Boolean).join(' | ')
 }))};
 const normalized=validateBWithProbe(candidate);
 const exactOriginal=original.beats.map(b=>b.narration).join('\n\n');
 if(teacherText(normalized)!==exactOriginal)die('Lossless narration integrity check failed');
 return {output:normalized,report:{status:original.beats.length>maxBeats?'lossless_adjacent_beat_grouping':'no_grouping',original_beat_count:original.beats.length,normalized_beat_count:normalized.beats.length,source_beat_mapping:groups.map((g,i)=>({normalized_id:normalized.beats[i].id,original_ids:g.source})),raw_B_response_preserved_in_paid_trace:true,original_narration_unchanged:true,original_probe_plan_preserved:JSON.stringify(original.probe_plan)===JSON.stringify(candidate.probe_plan),note:'Segmentation only; no text was written, shortened, or paraphrased by the host. Educational purpose and action text of merged beats concatenated.'}};
}
