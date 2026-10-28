import CloudInteractiveDemo from "@/lib/sandbox/v37d2c4/cloud-learning-space-demo";
import LearningSpacePreview from "@/sandbox/probe-lab/learning-space/learning-space-preview";
export default function Page() { return process.env.VERCEL === "1" ? <CloudInteractiveDemo/> : <LearningSpacePreview/>; }
