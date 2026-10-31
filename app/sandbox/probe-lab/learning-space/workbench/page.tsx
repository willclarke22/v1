import CloudReadonlyView from "@/lib/sandbox/v37d2c3/cloud-view";
import CloudAuthCheck from "@/lib/sandbox/v37d2c5a/cloud-auth-check";
import LearningSpaceWorkbench from "@/sandbox/probe-lab/learning-space/workbench";

/**
 * Cloud: static status page + Auth-only diagnostic. No topic reads.
 * Local: original full Workbench, unchanged.
 */
export default function Page() {
  return process.env.VERCEL === "1"
    ? <>
        <CloudAuthCheck />
        <CloudReadonlyView view="workbench"/>
      </>
    : <LearningSpaceWorkbench/>;
}
