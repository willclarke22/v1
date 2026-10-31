import CloudReadonlyView from "@/lib/sandbox/v37d2c3/cloud-view";
import CloudAuthCheck from "@/lib/sandbox/v37d2c5a/cloud-auth-check";
import BrowserEmbeddingDiagnostic from "@/lib/sandbox/v37d2c6a/browser-embedding-diagnostic";
import LearningSpaceWorkbench from "@/sandbox/probe-lab/learning-space/workbench";

/**
 * Cloud: unchanged Auth diagnostic plus user-initiated in-browser MiniLM benchmark.
 * No database access, application APIs, or learner persistence from embeddings.
 * Local: original full Workbench, unchanged.
 */
export default function Page() {
  return process.env.VERCEL === "1"
    ? <>
        <CloudAuthCheck />
        <BrowserEmbeddingDiagnostic />
        <CloudReadonlyView view="workbench"/>
      </>
    : <LearningSpaceWorkbench/>;
}
