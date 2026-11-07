/** S1.6B.4D FIX2: field diagnostics without silent clipping, repair, or coercion.
 * No provider, filesystem, database, or learner-profile access. */
import crypto from 'node:crypto';
const FIELDS=['teaching_strategy','next_step','visual_intent'];
const LIMIT=620;
const SHA=x=>crypto.createHash('sha256').update(String(x),'utf8').digest('hex');
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const FIX2_MAX_RETRIES_PER_RUN=2;
export function inspectTeacherOutput(raw){
 const info={ok:false,reason:null,field_diagnostics:[],raw_sha256:SHA(typeof raw==='string'?raw:JSON.stringify(raw)),raw_utf8_bytes:typeof raw==='string'?Buffer.byteLength(raw,'utf8'):null};
 if(typeof raw!=='string'){info.reason='raw_not_string';return {parsed:null,diagnostic:info};}
 let p;try{p=JSON.parse(raw);}catch{info.reason='invalid_json';return {parsed:null,diagnostic:info};}
 if(!plain(p)){info.reason='output_not_object';return {parsed:null,diagnostic:info};}
 const keys=Object.keys(p);const extras=keys.filter(x=>!FIELDS.includes(x));
 if(extras.length){info.field_diagnostics.push({field:'object',reason:'extra_keys',keys:extras.map(x=>x.slice(0,80))});}
 for(const field of FIELDS){
  const value=p[field], type=value===null?'null':Array.isArray(value)?'array':typeof value;
  const charLength=typeof value==='string'?value.length:null;
  const reasons=[];
  if(!Object.hasOwn(p,field))reasons.push('missing');
  else if(type!=='string')reasons.push('not_string');
  else {if(!value.trim())reasons.push('empty');if(value.length>LIMIT)reasons.push('over_limit');}
  if(reasons.length)info.field_diagnostics.push({field,reason:reasons.join(','),type,length_utf16:charLength,
   length_codepoints:typeof value==='string'?Array.from(value).length:null,
   length_utf8_bytes:typeof value==='string'?Buffer.byteLength(value,'utf8'):null,limit:LIMIT});
 }
 info.ok=info.field_diagnostics.length===0;
 info.reason=info.ok?null:'field_validation';
 return {parsed:info.ok?p:null,diagnostic:info};
}
/** Full rejected raw output is retained only in the ignored, local, synthetic trace.
 * For anomalously large responses retain only hash/length, never silently truncate. */
export function rejectedOutputEvidence(raw){
 if(typeof raw!=='string')return {stored:false,reason:'not_string'};
 if(raw.length>12000)return {stored:false,reason:'above_local_evidence_ceiling',sha256:SHA(raw),length_utf16:raw.length};
 return {stored:true,raw,sha256:SHA(raw),length_utf16:raw.length};
}
