import CloudReadonlyView from "@/lib/sandbox/v37d2c3/cloud-view";
import LearningSpacePreview from "@/sandbox/probe-lab/learning-space/learning-space-preview";
export default function Page() { return process.env.VERCEL === "1" ? <CloudReadonlyView view="learning-space"/> : <LearningSpacePreview/>; }
