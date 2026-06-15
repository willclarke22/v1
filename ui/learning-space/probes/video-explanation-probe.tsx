"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

export function VideoExplanationProbe(props: GenericProbeComponentProps) {
  const video = props.probe.renderer_params?.video;

  return (
    <ProbeShell
      {...props}
      draft={{
        ...props.draft,
        attempt_type: "none",
      }}
    >
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {video?.video_url ? (
          <video controls src={video.video_url} style={{ width: "100%" }} />
        ) : (
          <p>No video URL was supplied in renderer_params.video.</p>
        )}

        {video?.informational_only ? (
          <p style={{ margin: 0, opacity: 0.78 }}>
            This is an explanation-only probe. The next step can ask for an
            attempt after the learner watches.
          </p>
        ) : null}
      </div>
    </ProbeShell>
  );
}

