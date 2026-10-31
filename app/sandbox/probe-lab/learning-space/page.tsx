import CloudTopicsExperience from "@/lib/sandbox/v37d2c5b/cloud-topics-experience";
import LearningSpacePreview from "@/sandbox/probe-lab/learning-space/learning-space-preview";
/** Cloud: owner-scoped read-only snapshot or explicitly fictional fallback.
 * Local: original full Learning Space remains unchanged. */
export default function Page() {
  return process.env.VERCEL === "1" ? <CloudTopicsExperience/> : <LearningSpacePreview/>;
}
