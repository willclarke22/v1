import CloudReadonlyView from "@/lib/sandbox/v37d2c3/cloud-view";
import LearningSpaceWorkbench from "@/sandbox/probe-lab/learning-space/workbench";
export default function Page() { return process.env.VERCEL === "1" ? <CloudReadonlyView view="workbench"/> : <LearningSpaceWorkbench/>; }
