"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

export function VideoClickProbe(props: GenericProbeComponentProps) {
  const video = props.probe.renderer_params?.video;
  const value = props.draft.selected_click_seconds ?? 0;

  return (
    <ProbeShell {...props}>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {video?.video_url ? (
          <video controls src={video.video_url} style={{ width: "100%" }} />
        ) : (
          <p>No video URL was supplied in renderer_params.video.</p>
        )}

        <label style={{ display: "grid", gap: "0.4rem" }}>
          <span>Moment selected, in seconds</span>
          <input
            type="number"
            min={0}
            max={video?.duration_seconds ?? undefined}
            value={value}
            disabled={props.disabled}
            onChange={(event) =>
              props.onDraftChange({
                ...props.draft,
                attempt_type: "video_click",
                selected_click_seconds: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
    </ProbeShell>
  );
}

