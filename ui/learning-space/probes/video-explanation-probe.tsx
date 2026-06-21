"use client";

import { useEffect, useRef, useState } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

export function VideoExplanationProbe(props: GenericProbeComponentProps) {
  const video = props.probe.renderer_params?.video;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !video?.video_url) return;

    const playPromise = element.play();
    if (playPromise) {
      playPromise.catch(() => setAutoplayBlocked(true));
    }
  }, [video?.video_url]);

  return (
    <ProbeShell
      {...props}
      draft={{
        ...props.draft,
        attempt_type: "none",
      }}
    >
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Watch the explanation.
          </p>
          <p style={{ margin: "0.34rem 0 0", color: "rgba(255,255,255,0.66)", fontSize: "0.84rem", lineHeight: 1.5 }}>
            The video can carry the prompt through narration. After it plays, MyWay can ask a follow-up attempt.
          </p>
        </div>

        {video?.video_url ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <video
              ref={videoRef}
              controls
              autoPlay
              playsInline
              src={video.video_url}
              style={{
                width: "100%",
                maxHeight: "32rem",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "24px",
                background: "black",
              }}
            />

            {autoplayBlocked ? (
              <button
                type="button"
                disabled={props.disabled}
                onClick={() => videoRef.current?.play()}
                style={{
                  justifySelf: "start",
                  border: "1px solid rgba(221,214,254,0.22)",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  padding: "0.55rem 0.78rem",
                  fontWeight: 800,
                }}
              >
                Play video
              </button>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              minHeight: "18rem",
              display: "grid",
              placeItems: "center",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "24px",
              background:
                "radial-gradient(circle at center, rgba(168,85,247,0.16), rgba(0,0,0,0.3))",
              color: "rgba(255,255,255,0.72)",
              textAlign: "center",
              padding: "1rem",
            }}
          >
            <div>
              <p style={{ margin: 0, color: "white", fontWeight: 900 }}>
                Video explanation placeholder
              </p>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.86rem" }}>
                No video URL was supplied yet. When a URL exists, this player attempts to autoplay.
              </p>
            </div>
          </div>
        )}
      </div>
    </ProbeShell>
  );
}
