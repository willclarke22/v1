/** D.2C.2 experimental independent score observations. Requires opt-in and a separate sandbox table.
 * These records never infer topic membership, alter mastery, or create spheres.
 */
import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isRubricScore } from "./topic-memory-scores";
export type ScoreObservationInput={eventId:string;topicName:string;rootProblem:string;evidenceQuote:string;originalMessage:string;currentMessage:string;confusion:number;insight:number;rootConfidence:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function observationIsValid(x:Record<string,unknown>):x is Record<string,unknown>&ScoreObservationInput {
 const expected=["operation","eventId","topicName","rootProblem","evidenceQuote","originalMessage","currentMessage","confusion","insight","rootConfidence"].sort().join("|");
 if(Object.keys(x).sort().join("|")!==expected)return false;
 if(typeof x.eventId!=="string"||!uuid.test(x.eventId)||typeof x.topicName!=="string"||!x.topicName.trim()||x.topicName.length>110||typeof x.rootProblem!=="string"||x.rootProblem.trim().length<15||x.rootProblem.length>500)return false;
 if(typeof x.originalMessage!=="string"||x.originalMessage.length>2500||typeof x.currentMessage!=="string"||x.currentMessage.length>2500||typeof x.evidenceQuote!=="string"||!x.evidenceQuote.trim()||x.evidenceQuote.length>500)return false;
 if(!`${x.originalMessage}\n${x.currentMessage}`.toLowerCase().includes(x.evidenceQuote.trim().toLowerCase()))return false;
 return isRubricScore(x.confusion)&&isRubricScore(x.insight)&& (x.confusion>=0||x.insight>=0) && typeof x.rootConfidence==="number"&&Number.isFinite(x.rootConfidence)&&x.rootConfidence>=0.65&&x.rootConfidence<=1;
}
export async function saveIndependentObservation(x:ScoreObservationInput):Promise<{status:"recorded"|"duplicate";eventId:string;topicId:null}>{
 if(process.env.NODE_ENV!=="development"||process.env.MYWAY_EXPERIMENTAL_RUNTIME!=="v37b"||process.env.MYWAY_TOPIC_VECTOR_BACKEND!=="supabase"||process.env.MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL!=="v37c-route-audit-passed") throw Error("sandbox_guard_missing");
 const db=createServerSupabaseClient(); // enforces the sandbox project pin
 const record={event_id:x.eventId,topic_id:null,topic_label_candidate:x.topicName.trim(),root_problem:x.rootProblem.trim(),evidence_quote:x.evidenceQuote.trim(),confusion:x.confusion>=0?x.confusion:null,insight:x.insight>=0?x.insight:null,evidence_confidence:x.rootConfidence,rubric:"model_0_10_v1",origin:"v37d2c2_explicit_session_opt_in"};
 const {error}=await db.from("myway_sandbox_learning_observations").insert(record);
 if(error){
  if(error.code==="23505")return {status:"duplicate",eventId:x.eventId,topicId:null};
  throw Error("observation_store_unavailable_or_write_refused");
 }
 return {status:"recorded",eventId:x.eventId,topicId:null};
}
