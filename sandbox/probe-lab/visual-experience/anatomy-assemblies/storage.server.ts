import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { cloudAssetMetadataEnabled, readCloudJson, writeCloudJson } from "../../assets/storage/cloud-json.server";
import type { AssemblyReview } from "./contract";

const CLOUD_KEY = "metadata/myway/visual-experience/bodyparts3d-assembly-reviews-v1.json";
const LOCAL_FILE = path.join(process.cwd(), ".myway-assembly-review-data", "reviews-v1.json");
type Store = {schema_version:"myway_bodyparts3d_assembly_reviews_v1";reviews:Record<string,AssemblyReview>};
const blank=():Store=>({schema_version:"myway_bodyparts3d_assembly_reviews_v1",reviews:{}});
export async function readAssemblyReviews():Promise<Store>{
 if(cloudAssetMetadataEnabled())return (await readCloudJson<Store>(CLOUD_KEY))??blank();
 if(process.env.VERCEL==="1")return blank();
 try{return JSON.parse(await readFile(LOCAL_FILE,"utf8")) as Store}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return blank();throw error}
}
export async function writeAssemblyReviews(data:Store){
 if(cloudAssetMetadataEnabled()){
  const result=await writeCloudJson(CLOUD_KEY,data);
  if(!result)throw new Error("Assembly review cloud write returned no object.");
  return "private-r2";
 }
 if(process.env.VERCEL==="1")throw new Error("No private-R2 metadata storage configured; refusing ephemeral serverless writes.");
 await mkdir(path.dirname(LOCAL_FILE),{recursive:true});
 const temporary=LOCAL_FILE+".writing";
 await writeFile(temporary,JSON.stringify(data,null,2)+"\n",{encoding:"utf8",flag:"w"});
 await rename(temporary,LOCAL_FILE);
 return "local-file";
}
export function reviewStorageLabel(){return cloudAssetMetadataEnabled()?"private-r2":process.env.VERCEL==="1"?"unavailable-on-vercel":"local-file"}
