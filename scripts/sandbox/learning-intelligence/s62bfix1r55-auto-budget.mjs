/** Session-scoped explicit bounded authorization for automatic dual generation.
 * Estimated usage is not a provider-enforced spending limit. All unknown billing outcomes pause authorization.
 */
import fs from 'node:fs';import path from 'node:path';import {BASE} from './s62bfix1r54-creative-store.mjs';
const id=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const allowed=new Set(['gpt-4.1-mini','gpt-4.1']);
const fail=s=>{throw Error('R55 authorization: '+s)};
const check=(v,m)=>{if(!v)fail(m)};
const file=session=>{check(id.test(session??''),'invalid session');return path.join(BASE,session,'auto-dual-authorization.json')};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const round=n=>Math.round(n*1e6)/1e6;
function save(p,record){const tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(record,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,p)}
export function viewAuthorization(session){const p=file(session);if(!fs.existsSync(p))return {enabled:false,exists:false,remaining_usd:0};const x=read(p);return {exists:true,enabled:x.enabled===true&&!x.pending_turn_id&&x.limit_usd-x.spent_estimated_usd-x.committed_reserve_usd >=(3*(x.models.A==='gpt-4.1'?0.29:0.055)+2*(x.models.B==='gpt-4.1'?0.29:0.055)+(x.models.X==='gpt-4.1'?0.29:0.055)),paused_reason:x.pending_turn_id?'unresolved_reserved_paid_turn_manual_review':x.paused_reason??(x.enabled&&x.limit_usd-x.spent_estimated_usd-x.committed_reserve_usd<.33?'session_budget_below_reservation':null),session_id:session,limit_usd:x.limit_usd,spent_estimated_usd:x.spent_estimated_usd,committed_reserve_usd:x.committed_reserve_usd,remaining_usd:round(x.limit_usd-x.spent_estimated_usd-x.committed_reserve_usd),models:x.models,successful_turns:x.successful_turns,unknown_charge_caution:true};}
export function enableAuthorization({session_id,limit_usd,model_a,model_b,model_x,approval_phrase}){
 const p=file(session_id),dir=path.dirname(p);fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(path.join(dir,'state.json'))){const empty={schema:'myway_goldloop_human_v1',stage:'S62B-FIX1R43-GOLDLOOP-v1',learner:session_id,topics:[],observations:[],records:[],turns:[],version:0};fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(empty,null,2)+'\n',{flag:'wx',mode:0o600});}
 check(approval_phrase==='AUTHORIZE_AUTOMATIC_DUAL_CALLS','explicit bounded approval required');
 check(typeof limit_usd==='number'&&Number.isFinite(limit_usd)&&limit_usd>=0.5&&limit_usd<=10,'limit must be $0.50–$10');
 check([model_a,model_b,model_x].every(m=>allowed.has(m)),'unsupported model');check(!fs.existsSync(p),'authorization exists; do not silently replace or reset spending ledger');
 const record={schema:'myway_r55_authorization_v1',session_id,enabled:true,paused_reason:null,limit_usd,spent_estimated_usd:0,committed_reserve_usd:0,models:{A:model_a,B:model_b,X:model_x},successful_turns:0,created_at:new Date().toISOString(),pending_turn_id:null,disclaimer:'Cost is an estimate, not a provider-set billing cap. A session limit gates new requests. Unknown outcomes reserve full allowance and PAUSE. No automatic retry.'};
 fs.writeFileSync(p,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});return viewAuthorization(session_id);
}
export function pauseAuthorization(session){const p=file(session);check(fs.existsSync(p),'authorization missing');const x=read(p);x.enabled=false;x.paused_reason=x.paused_reason||'learner_paused';save(p,x);return viewAuthorization(session)}
const floor=m=>m==='gpt-4.1'?0.29:0.055;
export function reserveAutomaticTurn(session,turn_id,{probe=false}={}){
 const p=file(session);check(fs.existsSync(p),'session-level authorization missing');const x=read(p);check(x.enabled===true&&!x.pending_turn_id,'authorization paused or a paid turn is already reserved');
 // Reserve for ROUTE, potentially two A assessments, B-only, B design, X implementation. A saved probe skips ROUTE.
 const reserve=round((probe?2:3)*floor(x.models.A)+2*floor(x.models.B)+floor(x.models.X));
 check(x.limit_usd-x.spent_estimated_usd-x.committed_reserve_usd>=reserve,'automatic session spend ceiling reached; explicitly start another session');
 x.committed_reserve_usd=round(x.committed_reserve_usd+reserve);x.pending_turn_id=turn_id;x.pending_reserve_usd=reserve;x.updated_at=new Date().toISOString();save(p,x);
 return {budget_usd:reserve,models:x.models,turn_id};
}
export function finishAutomaticTurn(session,turn_id,{success,estimated_usd=0,error_message=null}={}){
 const p=file(session),x=read(p);check(x.pending_turn_id===turn_id,'reservation mismatch');const reserve=x.pending_reserve_usd;
 x.committed_reserve_usd=round(x.committed_reserve_usd-reserve);const actual=success?Math.max(0,Number(estimated_usd)||0):reserve;
 x.spent_estimated_usd=round(x.spent_estimated_usd+actual);if(success&&actual>reserve){x.enabled=false;x.paused_reason='reported_usage_exceeded_reserved_allowance'}
 x.pending_turn_id=null;x.pending_reserve_usd=0;x.updated_at=new Date().toISOString();
 if(success)x.successful_turns+=1;else{x.enabled=false;x.paused_reason='unknown_billing_or_incomplete_paid_operation';x.error=String(error_message??'unknown').slice(0,350)}
 save(p,x);return viewAuthorization(session);
}
