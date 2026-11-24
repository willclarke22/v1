/** Retains R5.5 iframe isolation and event provenance; changes default iframe palette only. */
import {frameDocument as previousFrameDocument} from './s62bfix1r55-creative-core.mjs';
export function frameDocument(fragment,nonce){
 const html=previousFrameDocument(fragment,nonce);
 const old='color:#172448;background:#f8faff';
 if(!html.includes(old))throw Error('Unexpected R5.5 frame base styling; refuse unsafe modification');
 return html.replace(old,'color:#eaf0ff;background:#080c18');
}
