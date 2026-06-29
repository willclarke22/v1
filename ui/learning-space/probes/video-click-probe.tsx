"use client";

import { useEffect, useRef, useState } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import {
  ProbeButton,
  ProbeMediaFrame,
  ProbeMiniLabel,
  ProbePill,
  ProbeStack,
} from "./shared";

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

  function markCurrentMoment(label = "selected moment") {
    const seconds = Number(videoRef.current?.currentTime ?? 0);

    props.onDraftChange({
      ...props.draft,
      attempt_type: "video_click",
      selected_click_seconds: Number(seconds.toFixed(2)),
      selected_click_label: label,
      text_response: `${label}: ${seconds.toFixed(2)} seconds`,
    });
  }

  function clearMoment() {
    props.onDraftChange({
      ...props.draft,
      attempt_type: "video_click",
      selected_click_seconds: null,
      selected_click_label: null,
      text_response: "",
    });
  }

  return (
    <ProbeShell {...props}>
      <ProbeStack gap="1rem">
        <div>
          <ProbeMiniLabel>Watch and mark the moment</ProbeMiniLabel>
          <p
            style={{
              margin: "0.35rem 0 0",
              color: "rgba(255,255,255,0.66)",
              fontSize: "0.84rem",
              lineHeight: 1.5,
            }}
          >
            Click the video or press the marker when you see or hear the target moment.
          </p>
        </div>

        <ProbeMediaFrame
          missing={!video?.video_url}
          title="Video click placeholder"
          body="No video URL was supplied yet. When a URL exists, clicking the player marks the current timestamp."
        >
          <div style={{ position: "relative" }}>
            <video
              ref={videoRef}
              controls
              playsInline
              src={video?.video_url ?? undefined}
              onClick={() => markCurrentMoment("clicked video")}
              style={{
                display: "block",
                width: "100%",
                maxHeight: "32rem",
                background: "black",
              }}
            />
            {autoplayBlocked ? (
              <button
                type="button"
                onClick={() => {
                  videoRef.current?.play();
                  setAutoplayBlocked(false);
                }}
                style={{
                  position: "absolute",
                  inset: "50% auto auto 50%",
                  transform: "translate(-50%, -50%)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "999px",
                  background: "rgba(0,0,0,0.58)",
                  color: "white",
                  padding: "0.78rem 1rem",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Play video
              </button>
            ) : null}
          </div>
        </ProbeMediaFrame>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.8rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <ProbePill tone={value === null ? "default" : "success"}>
            selected: {value === null ? "not yet" : formatSeconds(value)}
          </ProbePill>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <ProbeButton
              variant="primary"
              disabled={props.disabled || !video?.video_url}
              onClick={() => markCurrentMoment("marked moment")}
            >
              Mark this moment
            </ProbeButton>
            <ProbeButton
              variant="ghost"
              disabled={props.disabled || value === null}
              onClick={clearMoment}
            >
              Clear
            </ProbeButton>
          </div>
        </div>
      </ProbeStack>
    </ProbeShell>
  );
}
