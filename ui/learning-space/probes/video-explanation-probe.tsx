"use client";

import { useEffect, useRef, useState } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { ProbeButton, ProbeMediaFrame, ProbePill, ProbeStack } from "./shared";

export function VideoExplanationProbe(props: GenericProbeComponentProps) {
  const video = props.probe.renderer_params?.video;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

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
        text_response: hasPlayed ? "Watched explanation" : props.draft.text_response,
      }}
    >
      <ProbeStack gap="1rem">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.8rem",
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <div>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>
              Watch the explanation.
            </p>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.84rem",
                lineHeight: 1.5,
              }}
            >
              This probe teaches first. A later probe can ask you to try the idea.
            </p>
          </div>
          <ProbePill tone={hasPlayed ? "success" : "default"}>
            {hasPlayed ? "watched" : "ready"}
          </ProbePill>
        </div>

        <ProbeMediaFrame
          missing={!video?.video_url}
          title="Video explanation placeholder"
          body="No video URL was supplied yet. When a URL exists, this player attempts to autoplay."
        >
          <div style={{ position: "relative" }}>
            <video
              ref={videoRef}
              controls
              playsInline
              src={video?.video_url ?? undefined}
              onPlay={() => setHasPlayed(true)}
              onEnded={() => setHasPlayed(true)}
              style={{
                display: "block",
                width: "100%",
                maxHeight: "32rem",
                background: "black",
              }}
            />
            {autoplayBlocked ? (
              <ProbeButton
                variant="primary"
                onClick={() => {
                  videoRef.current?.play();
                  setAutoplayBlocked(false);
                }}
                style={{
                  position: "absolute",
                  inset: "50% auto auto 50%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                Play explanation
              </ProbeButton>
            ) : null}
          </div>
        </ProbeMediaFrame>

        {video?.informational_only ? (
          <p
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.66)",
              fontSize: "0.84rem",
              lineHeight: 1.55,
            }}
          >
            This is marked as informational only, so it can behave like a teaching
            intervention rather than a scored answer.
          </p>
        ) : null}
      </ProbeStack>
    </ProbeShell>
  );
}
