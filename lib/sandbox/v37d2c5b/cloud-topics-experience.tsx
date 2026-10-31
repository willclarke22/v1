"use client";
/** Browser-only READ via Supabase Auth + owner-scoped RLS.
 * No service-role keys, custom MyWay API, inference, embeddings, storage mutations,
 * anonymous topic queries or automatic database migrations.
 */
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import CloudInteractiveDemo from "@/lib/sandbox/v37d2c4/cloud-learning-space-demo";
import CloudSnapshotScene from "./cloud-snapshot-scene";
import { mapCloudTopicRows, type CloudTopicRow, type CloudRelationshipRow } from "./cloud-topic-mapping";
import type { Topic } from "@/types/topic";

type SnapshotState =
  | {kind:"checking"}
  | {kind:"demo";note:string}
  | {kind:"ready";topics:Topic[]};

const TOPIC_FIELDS="topic_id,topic_label,diagnosis,next_step,confusion,insight,learning_score,topic_position_x,topic_position_y,topic_position_z,semantic_position_x,semantic_position_y,semantic_position_z,semantic_position_method,semantic_position_updated_at";
const EDGE_FIELDS="relationship_id,source_topic_id,target_topic_id,relationship_type,strength,confidence,evidence_count,visible_by_default,affects_layout,show_in_overview,show_on_focus,max_opacity,visual_style,priority";

export default function CloudTopicsExperience(){
  const [state,setState]=useState<SnapshotState>({kind:"checking"});
  const client=useMemo(()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url||!key) return null;
    try {
      if(new URL(url).protocol!=="https:")return null;
      return createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
        storageKey:"myway-experiment-v37d2c5a-auth"}});
    } catch{return null;}
  },[]);
  // V3.7D.2C.5C: poll only while the tab is visible, also rechecking on focus.
  // The browser remains SELECT-only and the database sync job never runs here.
  useEffect(()=>{
    let live=true;
    let pending=false;
    let revision=0;
    let lastPayload="";
    if(!client){setState({kind:"demo",note:"Cloud Auth configuration is unavailable. No learner data loaded."});return;}
    async function load(){
      if(!client||!live||pending||document.visibilityState==="hidden")return;
      pending=true;
      const observedRevision=revision;
      try{
        const checked=await client.auth.getUser();
        if(!live||observedRevision!==revision)return;
        if(checked.error||!checked.data.user){
          lastPayload="";
          setState({kind:"demo",note:"Sign in through the Workbench to view your private snapshot. Fictional demo shown."});return;
        }
        const owner=checked.data.user.id;
        const [topicResult,edgeResult]=await Promise.all([
          client.from("myway_cloud_topic_snapshot").select(TOPIC_FIELDS).eq("owner_uid",owner).order("topic_label").limit(500),
          client.from("myway_cloud_relationship_snapshot").select(EDGE_FIELDS).eq("owner_uid",owner).order("relationship_id").limit(2000),
        ]);
        if(!live||observedRevision!==revision)return;
        if(topicResult.error||edgeResult.error){
          lastPayload="";
          setState({kind:"demo",note:"Private read-only snapshot is not available or access was denied. Fictional demo shown."});return;
        }
        if(!topicResult.data?.length){
          lastPayload="";
          setState({kind:"demo",note:"No owner-scoped snapshot records found. Fictional demo shown."});return;
        }
        const rows=topicResult.data as CloudTopicRow[];
        const edges=(edgeResult.data??[]) as CloudRelationshipRow[];
        const signature=JSON.stringify([owner,rows,edges]);
        if(signature===lastPayload)return; // Prevent remounting the scene when nothing changed.
        const topics=mapCloudTopicRows(rows,edges);
        if(topics.length!==rows.length){
          lastPayload="";
          setState({kind:"demo",note:"Snapshot rows failed validation; private snapshot was not rendered."});return;
        }
        lastPayload=signature;
        setState({kind:"ready",topics});
      }catch{
        if(live&&observedRevision===revision){
          lastPayload="";
          setState({kind:"demo",note:"Snapshot unavailable. Fictional demo shown; no writes were attempted."});
        }
      }finally{pending=false;}
    }
    void load();
    const interval=window.setInterval(()=>{void load();},60_000);
    const refresh=()=>{if(document.visibilityState==="visible")void load();};
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    const {data:{subscription}}=client.auth.onAuthStateChange((event)=>{
      if(event==="SIGNED_OUT"&&live){
        revision++;
        lastPayload="";
        setState({kind:"demo",note:"Signed out; showing fictional demo."});
      }
      if(event==="SIGNED_IN"&&live){
        // Avoid a Supabase Auth mutex re-entry inside its own callback.
        window.setTimeout(()=>{void load();},0);
      }
    });
    return()=>{
      live=false;revision++;
      window.clearInterval(interval);
      window.removeEventListener("focus",refresh);
      document.removeEventListener("visibilitychange",refresh);
      subscription.unsubscribe();
    };
  },[client]);
  if(state.kind==="ready")return <CloudSnapshotScene topics={state.topics}/>;
  return <div className="relative">
    <CloudInteractiveDemo/>
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[100] mx-auto max-w-lg px-4 text-center">
      <div role="status" className="pointer-events-auto rounded-xl border border-amber-300/40 bg-slate-950/95 px-4 py-2 text-xs text-amber-100 shadow-xl">
        {state.kind==="checking"?"Checking private snapshot permissions…":state.note}
        {state.kind==="demo"&&<Link href="/sandbox/probe-lab/learning-space/workbench" className="ml-2 underline">Workbench login</Link>}
      </div>
    </div>
  </div>;
}
