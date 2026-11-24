/** R5.5.1 story + executable interaction in the SAME model call.
 * This is a transport contract only: no forced scene IDs, modalities, or proof of fidelity.
 */
import {ACTIVITY_SCHEMA,validateActivity,sha} from './s62bfix1r55-creative-core.mjs';
export {sha};
export const STORY_ACTIVITY_SCHEMA={type:'object',additionalProperties:false,properties:{...ACTIVITY_SCHEMA.properties,visual_storyboard:{type:'string'}},required:[...ACTIVITY_SCHEMA.required,'visual_storyboard']};
export function validateStoryActivity(value){
 if(!value||typeof value.visual_storyboard!=='string'||value.visual_storyboard.length>5000)throw Error('Visual story must be a text description (max 5000 characters)');
 validateActivity({title:value.title,html_fragment:value.html_fragment,evidence_notes:value.evidence_notes,limitations:value.limitations});
 return value;
}
