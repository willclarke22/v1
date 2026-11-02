import CloudReadonlyView from "@/lib/sandbox/v37d2c3/cloud-view";
import CloudAuthCheck from "@/lib/sandbox/v37d2c5a/cloud-auth-check";
import BrowserEmbeddingDiagnostic from "@/lib/sandbox/v37d2c6a/browser-embedding-diagnostic";
import CloudOwnerTopicSearch from "@/lib/sandbox/v37d2c6b/cloud-owner-topic-search";
import CloudProtectedVectorSearch from "@/lib/sandbox/v37d2c6e/cloud-protected-vector-search";
import CloudDifficultySearch from "@/lib/sandbox/v37d2c7a/cloud-difficulty-search";
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
        <CloudOwnerTopicSearch />
        <CloudProtectedVectorSearch />
        <CloudDifficultySearch />
        <CloudReadonlyView view="workbench"/>
      </>
    : <LearningSpaceWorkbench/>;
}
