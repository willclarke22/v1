/**
 * BodyParts3D automatic assembly generator V1.
 * Geometric membership is derived from the same collection-aligned GLB bounds
 * used by the viewer. Landmark meshes define region envelopes; those envelopes
 * are expanded conservatively for soft tissue and vascular structures.
 * This is an atlas-coverage hypothesis, NOT proof of anatomical completeness.
 * No mutations of the catalog or persisted reviews are performed.
 */
import { ASSEMBLY_PROFILES, type AssemblyAsset, type AssemblyProfile } from "./contract";
import { buildSpatialIndex, type AtlasVec3, type SpatialBound, type SpatialIndex } from "./spatial-discovery";

export const AUTO_ASSEMBLY_SCHEMA = "myway_bodyparts3d_spatial_assemblies_v1" as const;
type Region = "head" | "neck" | "thorax" | "abdomen" | "pelvis" | "upper_left" | "upper_right" | "lower_left" | "lower_right";
type Extent = { min: AtlasVec3; max: AtlasVec3 };
type RegionVolume = { region: Region; landmark_member_ids: string[]; bounds: Extent; padding_m: number };
export type AutomaticAssemblyEntry = {
  asset_id: string;
  member_id: string;
  label: string;
  system: string;
  evidence: "spatial_center" | "spatial_overlap" | "anatomical_crossing";
  crossing: boolean;
  spatial_overlap_ratio: number;
};
export type AutomaticAssembly = {
  assembly_id: string;
  label: string;
  parent_id: string | null;
  generator_version: typeof AUTO_ASSEMBLY_SCHEMA;
  coordinate_space: "glb_y_up_meters";
  asset_count: number;
  asset_ids: string[];
  assets: AutomaticAssemblyEntry[];
  region_volumes: RegionVolume[];
  warnings: string[];
};
export type AutomaticAssemblyReport = {
  schema_version: typeof AUTO_ASSEMBLY_SCHEMA;
  atlas_fingerprint: string;
  coordinate_space: "glb_y_up_meters";
  generator: "landmark_anchored_spatial_aabb_v1";
  eligible_count: number;
  bounds_available: number;
  bounds_unavailable: number;
  missing_bounds_asset_ids: string[];
  assigned_unique_count: number;
  unassigned_asset_ids: string[];
  assemblies: AutomaticAssembly[];
  notes: string[];
};

const REGIONS: Region[] = ["head", "neck", "thorax", "abdomen", "pelvis", "upper_left", "upper_right", "lower_left", "lower_right"];
const same = (id: string, set: readonly string[]) => set.includes(id.toUpperCase());
const union = (bounds: Extent[]): Extent => ({
  min: [0,1,2].map(i => Math.min(...bounds.map(b=>b.min[i]!))) as AtlasVec3,
  max: [0,1,2].map(i => Math.max(...bounds.map(b=>b.max[i]!))) as AtlasVec3,
});
const pad = (box: Extent, px: number, py: number, pz: number): Extent => ({
  min: [box.min[0]-px,box.min[1]-py,box.min[2]-pz],
  max: [box.max[0]+px,box.max[1]+py,box.max[2]+pz],
});
const intersectionVolume = (a: Extent, b: Extent): number => {
  const widths = [0,1,2].map(i => Math.max(0,Math.min(a.max[i]!,b.max[i]!)-Math.max(a.min[i]!,b.min[i]!)));
  return widths[0]!*widths[1]!*widths[2]!;
};
const volume = (a: Extent) => [0,1,2].reduce((p,i)=>p*Math.max(1e-8,a.max[i]!-a.min[i]!),1);
const center = (a: Extent) => [0,1,2].map(i=>(a.min[i]!+a.max[i]!)/2) as AtlasVec3;
const contains = (box: Extent,p: AtlasVec3) => [0,1,2].every(i=>p[i]!>=box.min[i]! && p[i]!<=box.max[i]!);
const extent = (b: SpatialBound): Extent => ({min:b.min,max:b.max});

// Explicit anchor IDs provide deterministic, version-locked fallbacks for key structures.
// All other landmarks are resolved from the actual 2,234-element atlas manifest.
const HEAD_FJ = ["FJ3200","FJ3289","FJ3309","FJ3274","FJ3380","FJ3269","FJ3375"];
const NECK_FJ = ["FJ3176","FJ3177","FJ3161","FJ3164","FJ3167","FJ3170","FJ3172"];
const patterns: Record<Region, RegExp> = {
 head: /\b(frontal bone|occipital bone|parietal bone|maxilla|mandible|temporal bone|sphenoid bone|ethmoid)\b/i,
 neck: /\b(atlas|axis|(?:third|fourth|fifth|sixth|seventh) cervical vertebra)\b/i,
 thorax: /\b(sternum|manubrium|thoracic vertebra|(?:left|right) (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib)\b/i,
 abdomen: /\b(lumbar vertebra|twelfth thoracic vertebra)\b/i,
 pelvis: /\b(sacrum|coccyx|(?:left|right) hip|hip bone|ilium|ischium|sacral vertebra)\b/i,
 upper_left: /\b(left (?:clavicle|scapula|humerus|radius|ulna|carpal|metacarpal|phalanx|phalanges))\b/i,
 upper_right: /\b(right (?:clavicle|scapula|humerus|radius|ulna|carpal|metacarpal|phalanx|phalanges))\b/i,
 lower_left: /\b(left (?:femur|patella|tibia|fibula|talus|calcaneus|tarsal|metatarsal|phalanx|phalanges))\b/i,
 lower_right: /\b(right (?:femur|patella|tibia|fibula|talus|calcaneus|tarsal|metatarsal|phalanx|phalanges))\b/i,
};
// Landmark descriptors often omit "left/right" for some bones: use specific
// named big bones first, then both distal elements. Never use a generic "left" alone.
const assetMatches = (region: Region, a: AssemblyAsset) => {
  if (region==="head" && same(a.member_id,HEAD_FJ)) return true;
  if (region==="neck" && same(a.member_id,NECK_FJ)) return true;
  return patterns[region].test(a.label);
};
const sideOf = (s:string): "left"|"right"|"both"|null => {
  const l=/\b(left|sinistra|sinister)\b/i.test(s),r=/\b(right|dextra|dexter)\b/i.test(s);
  return l&&r?"both":l?"left":r?"right":null;
};
const regionSide = (r:Region) => r.endsWith("_left")?"left":r.endsWith("_right")?"right":null;
const association: Record<Region,RegExp>={
 head:/\b(head|face|cranial|cerebral|brain|orbital|eye|nasal|oral|mouth|tongue|mandibular|maxillary|dental|tooth|teeth|ear|skull|temporal|parietal|occipital)\b/i,
 neck:/\b(neck|cervical|pharyng|laryng|vocal|crico|thyro|arytenoid|epiglott|hyoid|carotid|jugular|trachea|esophag)\b/i,
 thorax:/\b(thorax|thoracic|lung|pulmonary|cardiac|heart|coronary|bronch|rib|intercostal|mediastin|sternum)\b/i,
 abdomen:/\b(abdom|gastric|stomach|liver|hepatic|splenic|pancrea|intestinal|colon|kidney|renal|duoden|mesenteric)\b/i,
 pelvis:/\b(pelv|sacral|coccy|iliac|bladder|prostate|rectum|testis|urethra|pubi|sacrum)\b/i,
 upper_left:/\b(upper limb|arm|shoulder|humer|forearm|elbow|wrist|hand|palmar|finger|radial|ulnar|brachial|carpal)\b/i,
 upper_right:/\b(upper limb|arm|shoulder|humer|forearm|elbow|wrist|hand|palmar|finger|radial|ulnar|brachial|carpal)\b/i,
 lower_left:/\b(lower limb|thigh|femoral|knee|leg|calf|ankle|foot|toe|tibial|fibular|plantar|patellar|metatarsal)\b/i,
 lower_right:/\b(lower limb|thigh|femoral|knee|leg|calf|ankle|foot|toe|tibial|fibular|plantar|patellar|metatarsal)\b/i,
};

export function generateAutomaticAssemblies(assets:AssemblyAsset[], fingerprint:string):AutomaticAssemblyReport {
  const spatial: SpatialIndex=buildSpatialIndex(assets);
  const bounds=new Map(spatial.records.map(b=>[b.asset_id,b]));
  const volumeByRegion=new Map<Region,RegionVolume[]>();
  const issues:string[]=[];
  for(const region of REGIONS){
    const landmarks=assets.filter(a=>bounds.has(a.asset_id)&&assetMatches(region,a));
    // Fail closed for an inadequately anchored region: reporting an empty
    // region is safer than generating a full-body false positive.
    if(landmarks.length<2){volumeByRegion.set(region,[]);issues.push(`${region}: insufficient anatomical landmarks (${landmarks.length})`);continue;}
    let b=union(landmarks.map(a=>extent(bounds.get(a.asset_id)!)));
    // The lumbar bones alone are far narrower than the abdomen. Use the
    // neighbouring lower ribcage and pelvic girdle for its X/Z envelope,
    // while retaining the lumbar vertebrae's Y span as its vertical anchor.
    if(region==="abdomen"){
      const sides=assets.filter(a=>bounds.has(a.asset_id)&&
        (/\b(tenth|eleventh|twelfth) rib\b/i.test(a.label)||/\b(left|right) hip\b/i.test(a.label)));
      if(sides.length>=2){
        const around=union(sides.map(a=>extent(bounds.get(a.asset_id)!)));
        b={min:[around.min[0],b.min[1],around.min[2]],max:[around.max[0],b.max[1],around.max[2]]};
      }
    }
    const isLimb=region.startsWith("upper_")||region.startsWith("lower_");
    const isHead=region==="head";
    const isNeck=region==="neck";
    const px=isHead ? .075 : isNeck ? .12 : isLimb ? .18 : .12;
    const pz=isHead ? .075 : isNeck ? .12 : isLimb ? .18 : .12;
    const py=isHead ? .045 : isNeck ? .065 : isLimb ? .09 : .10;
    const expanded=pad(b,px,py,pz);
    // Use the landmarks' actual world bounds. Multiple volumes for limbs
    // reduce torso spillover compared with a single massive arm/leg AABB.
    let segments:Extent[]=[expanded];
    if(isLimb){
      const sorted=landmarks.map(a=>({a,b:bounds.get(a.asset_id)!})).sort((a,b)=>center(b.b)[1]-center(a.b)[1]);
      const count=Math.min(5,Math.max(2,Math.ceil(sorted.length/6)));
      const chunks=Array.from({length:count},()=>[] as Extent[]);
      sorted.forEach((item,i)=>chunks[Math.min(count-1,Math.floor(i*count/sorted.length))]!.push(extent(item.b)));
      segments=chunks.filter(chunk=>chunk.length).map(chunk=>pad(union(chunk),px,py,pz));
      // Bridge adjacent segments to avoid gaps between humerus and forearm.
      segments=[...segments,...segments.slice(1).map((seg,i)=>pad(union([segments[i]!,seg]),.035,.04,.035))];
    }
    volumeByRegion.set(region,segments.map(bounds=>({region,landmark_member_ids:[...new Set(landmarks.map(a=>a.member_id))],bounds,padding_m:Math.max(px,py,pz)})));
  }
  const byRegion=new Map<Region,Map<string,AutomaticAssemblyEntry>>();
  for(const region of REGIONS){
    const hits=new Map<string,AutomaticAssemblyEntry>();const volumes=volumeByRegion.get(region)??[];
    for(const a of assets){
      const bound=bounds.get(a.asset_id);if(!bound||!volumes.length)continue;
      const side=regionSide(region),assetSide=sideOf(a.label);
      if(side && (assetSide==="both" || (assetSide && assetSide!==side)))continue;
      const box=extent(bound), c=center(box),v=volume(box);
      const overlaps=volumes.map(vol=>intersectionVolume(box,vol.bounds));
      const fraction=Math.min(1,overlaps.reduce((sum,n)=>sum+n,0)/v);
      const centered=volumes.some(vol=>contains(vol.bounds,c));
      if(!centered && fraction<0.075)continue;
      // Do not let broad, low-information midline tissue bleed into limbs.
      // Side-named structures may still cross the torso/limb transition.
      if(side && !assetSide && !association[region].test(a.label))continue;
      const named=association[region].test(a.label);
      // Unusually large crossing structures require supporting anatomical
      // evidence rather than automatically importing everything they touch.
      if(!centered && fraction<0.2 && !named)continue;
      hits.set(a.asset_id,{
        asset_id:a.asset_id,member_id:a.member_id,label:a.label,system:a.system,
        evidence:centered?"spatial_center":named?"anatomical_crossing":"spatial_overlap",
        crossing:!volumes.some(vol=>contains(vol.bounds,box.min)&&contains(vol.bounds,box.max)),
        spatial_overlap_ratio:Number(fraction.toFixed(5)),
      });
    }
    byRegion.set(region,hits);
  }
  const assemblyRegions:Record<string,Region[]>={
    head_neck:["head","neck"],head:["head"],neck:["neck"],
    torso:["thorax","abdomen","pelvis"],thorax:["thorax"],abdomen:["abdomen"],pelvis:["pelvis"],
    upper_left:["upper_left"],upper_right:["upper_right"],lower_left:["lower_left"],lower_right:["lower_right"],
  };
  const assemblies:AutomaticAssembly[]=ASSEMBLY_PROFILES.map((p:AssemblyProfile)=>{
    const members=new Map<string,AutomaticAssemblyEntry>();const volumes:RegionVolume[]=[];
    for(const reg of assemblyRegions[p.id]??[]){
      for(const [id,entry] of byRegion.get(reg)??[])members.set(id,entry);
      volumes.push(...(volumeByRegion.get(reg)??[]));
    }
    const entries=[...members.values()].sort((a,b)=>a.member_id.localeCompare(b.member_id)||a.asset_id.localeCompare(b.asset_id));
    return {assembly_id:p.id,label:p.label,parent_id:p.parent_id,generator_version:AUTO_ASSEMBLY_SCHEMA,
      coordinate_space:"glb_y_up_meters",asset_count:entries.length,asset_ids:entries.map(a=>a.asset_id),assets:entries,
      region_volumes:volumes,warnings:issues.filter(w=>(assemblyRegions[p.id]??[]).some(r=>w.startsWith(`${r}:`))) };
  });
  const included=new Set(assemblies.flatMap(a=>a.asset_ids));
  return {schema_version:AUTO_ASSEMBLY_SCHEMA,atlas_fingerprint:fingerprint,coordinate_space:"glb_y_up_meters",
    generator:"landmark_anchored_spatial_aabb_v1",eligible_count:assets.length,bounds_available:spatial.bounds_available,
    bounds_unavailable:spatial.bounds_unavailable,missing_bounds_asset_ids:assets.filter(a=>!bounds.has(a.asset_id)).map(a=>a.asset_id),
    assigned_unique_count:included.size,unassigned_asset_ids:assets.filter(a=>!included.has(a.asset_id)).map(a=>a.asset_id),assemblies,
    notes:[
      "Automatic deterministic region membership; no manual staging or review changes were applied.",
      "Spatial AABB envelopes derived from bone landmarks are broad-phase approximations, not exact anatomical segmentation.",
      "Crossing structures can belong to multiple regions; completeness and geometric correctness are not certified.",
      "Only atlas members with valid saved spatial bounds may be automatically assigned. Missing bounds are reported.",
    ]};
}
