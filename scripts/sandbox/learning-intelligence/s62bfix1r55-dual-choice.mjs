import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {BASE} from './s62bfix1r54-creative-store.mjs';
import {ID,TURN,VARIANTS} from './s62bfix1r55-creative-core.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function selectDualVariant({session_id,turn_id,variant}){
 if(!ID.test(session_id??'')||!TURN.test(turn_id??'')||!VARIANTS.has(variant))throw Error('Invalid dual-experience selection');
 const dir=path.join(BASE,session_id),stateFile=path.join(dir,'state.json');
 const state=read(stateFile),t=state.turns?.at(-1);
 if(state.learner!==session_id||t?.turn_id!==turn_id||!t.dual_experience)throw Error('Only latest completed dual turn can be selected');
 if(fs.existsSync(path.join(dir,'turns',turn_id+'.pending.json')))throw Error('Pending paid turn blocks choice');
 if(t.dual_experience.selected_variant){if(t.dual_experience.selected_variant===variant)return {status:'already_selected',variant,turn_id};throw Error('Selection is already committed for this turn');}
 for(const v of ['b_only','bx']){const p=path.join(dir,'creative-designs',turn_id+'-'+v+'.json');if(!fs.existsSync(p)||read(p).status!=='complete')throw Error('Both variants must be complete before selection');}
 const record={schema:'myway_r55_dual_choice_v1',session_id,turn_id,variant,selected_at:new Date().toISOString(),both_variants_available:true,displayed_both:true,unchosen_variant_not_completed:true};
 const folder=path.join(dir,'dual-choices');fs.mkdirSync(folder,{recursive:true});const p=path.join(folder,turn_id+'.json');
 fs.writeFileSync(p,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
 const next=structuredClone(state);next.turns.at(-1).dual_experience.selected_variant=variant;next.turns.at(-1).dual_experience.status='chosen';
 const tmp=stateFile+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,stateFile);
 return {status:'selected',variant,turn_id};
}
