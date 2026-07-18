import { loadEnvConfig } from "@next/env";

import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "../../sandbox/probe-lab/assets/storage/r2-asset-storage.server";

loadEnvConfig(process.cwd());

async function main() {
  const runtime = getR2RuntimeStorage();

  console.log(
    `Runtime bucket configured: ${runtime.bucket}`,
  );

  if (process.env.R2_SOURCE_BUCKET_NAME?.trim()) {
    const source = getR2SourceStorage();
    console.log(
      `Private source bucket configured: ${source.bucket}`,
    );
  } else {
    console.log(
      "Private source bucket is not configured yet.",
    );
  }

  console.log(
    "R2 credentials and bucket configuration loaded successfully.",
  );
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
