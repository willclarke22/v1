/** R5.2 Route title resilience; keeps R4.3 route schema and all non-title validation unchanged.
 * The model returns the full semantic topic title; >90 to 180 characters are valid.
 * No model call, fallback route, or learner evidence is fabricated here.
 */
import {validateRoute} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
const MAX_NEW_TITLE=180;
export const ROUTE_R52_ADDITION='\n\nKeep NEW topic titles concise and topic-centered (aim for <=90 characters), but preserve essential distinctions. A topic title is not a learner diagnosis. Route the learner based on the latest message rather than forcing an unrelated prior topic.';
export function validateRouteR52(raw, topics){
  const r=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
  if(r?.decision!=='new')return validateRoute(r,topics);
  const s=r.new_topic_title;
  if(typeof s!=='string'||s.trim().length<3||s.length>MAX_NEW_TITLE||/[\u0000-\u001F\u007F]/.test(s)){
    throw Error('GOLDLOOP: invalid new topic title (expected 3..180 characters without control characters)');
  }
  // Reuse the original validator for ALL other schema, decision, and rationale checks;
  // its former 90-char condition is the only relaxed assertion.
  validateRoute({...r,new_topic_title:s.slice(0,90)},topics);
  return {...r,new_topic_title:s.trim()};
}
