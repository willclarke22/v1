import type { NextConfig } from "next";

const sandboxProbeLabTraceExcludes = [
  "./.git/**/*",
  "./.venv/**/*",
  "./.turbo/**/*",
  "./archive/**/*",
  "./datasets/**/*",
  "./models/**/*",
  "./assets/**/*",
  "./public/sandbox-assets/myway/**/*",
  "./sandbox/probe-lab/assets/debug/**/*",
  "./sandbox/probe-lab/assets/jobs/**/*",
  "./sandbox/probe-lab/assets/inbox/**/*",
  "./sandbox/probe-lab/assets/downloads/**/*",
  "./sandbox/probe-lab/assets/embeddings/**/*",
  "./sandbox/probe-lab/assets/enrichment/cache/**/*",
  "./sandbox/probe-lab/blender-python-builder/jobs/**/*",
  "./sandbox/probe-lab/visual-experience/assets/generated/**/*",
  "./sandbox/probe-lab/visual-experience/assets/source/blender/**/*",
  "./myway-*.txt",
  "./visual-experience-context.txt",
];

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/api/sandbox/probe-lab/**":
      sandboxProbeLabTraceExcludes,
  },
};

export default nextConfig;
