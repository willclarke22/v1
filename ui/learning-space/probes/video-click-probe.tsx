"use client";

import { useEffect, useRef, useState } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

function formatSeconds(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "0.00s";
  return `${seconds.toFixed(2)}s`;
}

export function VideoClickProbe(props: GenericProbeComponentProps) {
  const video = props.probe.renderer_params?.video;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const value = props.draft.selected_click_seconds ?? null;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !video?.video_url) return;

    const playPromise = element.play();
    if (playPromise) {
      playPromise.catch(() => setAutoplayBlocked(true));
    }
  }, [video?.video_url]);

  function markCurrentMoment() {
    const seconds = Number(videoRef.current?.currentTime ?? 0);

    props.onDraftChange({
      ...props.draft,
      attempt_type: "video_click",
      selected_click_seconds: Number(seconds.toFixed(2)),
      selected_click_label: `Clicked at ${seconds.toFixed(2)} seconds`,
    });
  }

  return (
    <ProbeShell {...props}>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Watch and click the target moment.
          </p>
          <p style={{ margin: "0.34rem 0 0", color: "rgba(255,255,255,0.66)", fontSize: "0.84rem", lineHeight: 1.5 }}>
            The video prompt can be spoken in the video/audio itself. Click the video, or press the marker button, when you see or hear the thing MyWay is checking.
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
              onClick={markCurrentMoment}
              style={{
                width: "100%",
                maxHeight: "30rem",
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
            onClick={markCurrentMoment}
            role="button"
            tabIndex={0}
            style={{
              minHeight: "18rem",
              display: "grid",
              placeItems: "center",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "24px",
              background:
                "radial-gradient(circle at center, rgba(168,85,247,0.16), rgba(0,0,0,0.3))",
              color: "rgba(255,255,255,0.72)",
              cursor: "pointer",
              textAlign: "center",
              padding: "1rem",
            }}
          >
            <div>
              <p style={{ margin: 0, color: "white", fontWeight: 900 }}>
                Video placeholder
              </p>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.86rem" }}>
                No video URL was supplied. Click here to simulate marking a moment.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px", padding: "0.72rem 0.9rem", background: "rgba(0,0,0,0.18)" }}>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: "0.7rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Selected moment
            </p>
            <p style={{ margin: "0.12rem 0 0", color: "white", fontSize: "1.1rem", fontWeight: 900 }}>
              {value === null ? "Not selected" : formatSeconds(value)}
            </p>
          </div>

          <button
            type="button"
            disabled={props.disabled}
            onClick={markCurrentMoment}
            style={{
              border: "1px solid rgba(221,214,254,0.28)",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              padding: "0.72rem 1rem",
              fontWeight: 900,
              cursor: props.disabled ? "not-allowed" : "pointer",
            }}
          >
            Mark this moment
          </button>
        </div>
      </div>
    </ProbeShell>
  );
}
