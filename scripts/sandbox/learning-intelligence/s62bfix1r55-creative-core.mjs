/** R5.4 research-only: creative HTML activities without educational templates.
 * The HTML is untrusted and must only execute in a sandboxed opaque-origin iframe.
 * This file validates transport and provenance; it does not judge pedagogy.
 */
import crypto from 'node:crypto';
export const ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
export const TURN=/^t\d{4,}$/;
export const VARIANTS=new Set(['b_only','bx']);
export const sha=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const schema=(p)=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
export const S={type:'string'};
export const B_BRIEF_SCHEMA=schema({brief:S});
export const ACTIVITY_SCHEMA=schema({title:S,html_fragment:S,evidence_notes:S,limitations:S});
export function validateActivity(x){
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Activity must be object');
 if(Object.keys(x).sort().join('|')!==Object.keys(ACTIVITY_SCHEMA.properties).sort().join('|'))throw Error('Activity transport fields missing');
 for(const k of Object.keys(ACTIVITY_SCHEMA.properties))if(typeof x[k]!=='string')throw Error('Invalid activity field '+k);
 if(x.title.trim().length<3||x.title.length>180||x.html_fragment.length<45||x.html_fragment.length>45000||x.evidence_notes.length>2200||x.limitations.length>1500)throw Error('Activity size or field limits');
 if(/<\/?(?:html|head|body)\b|<!doctype\b/i.test(x.html_fragment))throw Error('Provide HTML FRAGMENT, not a whole document');
 // A fragment can contain HTML, CSS, JavaScript, Canvas and SVG; no hardcoded quiz types.
 return x;
}
export function validateEvents(items){
 if(!Array.isArray(items)||items.length>160)throw Error('Too many events');
 return items.map((e,i)=>{if(!e||typeof e!=='object'||typeof e.action!=='string'||typeof e.detail!=='string'||typeof e.at!=='string'||e.action.length>65||e.detail.length>550||e.at.length>60||typeof (e.view_text??'')!=='string'||(e.view_text??'').length>450)throw Error('Invalid event '+i);return {action:e.action,origin:['generated_report','bridge_observed'].includes(e.origin)?e.origin:'unknown',detail:e.detail,view_text:e.view_text??'',at:e.at};});
}
/** Strict iframe sandbox + CSP. No parent DOM, storage, cookies, network, frames, media/network URLs or navigation.
 * Generated code can call mywayRecord(action, detail) to report events, but these are UNVERIFIED reports.
 */
export function frameDocument(fragment,nonce){
 validateActivity({title:'Preview',html_fragment:fragment,evidence_notes:'',limitations:''});
 if(!/^[a-f0-9]{24,64}$/.test(nonce))throw Error('Invalid frame nonce');
 const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; child-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'";
 const bridge=`(function(){'use strict';const N=${JSON.stringify(nonce)};let seq=0;function record(action,detail,origin='generated_report'){if(++seq>160)return;const view=String(document.body?.innerText||'').replace(/\\s+/g,' ').slice(0,450);window.parent.postMessage({kind:'myway_r54_event_v1',nonce:N,action:String(action??'').slice(0,65),origin,detail:typeof detail==='string'?detail.slice(0,550):JSON.stringify(detail??'').slice(0,550),view_text:view,at:new Date().toISOString()},'*');}window.mywayRecord=record;document.addEventListener('click',function(e){const t=e.target?.closest?.('button, input[type=button], input[type=submit], [role=button]');if(t)record('browser_click',String(t.textContent||t.getAttribute('aria-label')||t.value||'').slice(0,200),'bridge_observed');},true);document.addEventListener('change',function(e){const t=e.target;if(t&&t.matches?.('input,select,textarea'))record('browser_change',String(t.type||t.tagName)+': '+String(t.value||'').slice(0,200),'bridge_observed');},true);window.addEventListener('error',function(e){record('runtime_error',String(e.message||'unknown'),'bridge_observed');});})();`;
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{box-sizing:border-box;margin:0;padding:16px;font:15px/1.5 system-ui,sans-serif;color:#172448;background:#f8faff}*,*:before,*:after{box-sizing:border-box}button,input,textarea,select{font:inherit}button{cursor:pointer}img,canvas,svg{max-width:100%}</style><script>${bridge}</script></head><body>${fragment}</body></html>`;
}
