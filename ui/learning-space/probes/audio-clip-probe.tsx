"use client";

import { useEffect, useRef, useState } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeOptions } from "./probe-ui-types";
import {
  ProbeMediaFrame,
  ProbeMiniLabel,
  ProbeOptionCard,
  ProbePill,
  ProbeStack,
  ProbeTextArea,
} from "./shared";

function AudioWaveButton({
  isPlaying,
  disabled,
  onPress,
}: {
  isPlaying: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      aria-label={isPlaying ? "Pause audio clip" : "Play audio clip"}
      style={{
        position: "relative",
        width: "6.25rem",
        height: "6.25rem",
        borderRadius: "999px",
        border: isPlaying
          ? "1px solid rgba(255,255,255,0.46)"
          : "1px solid rgba(255,255,255,0.22)",
        background: isPlaying
          ? "radial-gradient(circle at 35% 25%, rgba(255,255,255,0.28), transparent 28%), linear-gradient(145deg, rgba(192,132,252,0.54), rgba(79,70,229,0.25))"
          : "radial-gradient(circle at 35% 25%, rgba(255,255,255,0.2), transparent 28%), linear-gradient(145deg, rgba(221,214,254,0.24), rgba(168,85,247,0.18))",
        color: "white",
        boxShadow: isPlaying
          ? "0 0 54px rgba(168,85,247,0.36), inset 0 1px 0 rgba(255,255,255,0.1)"
          : "0 0 42px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "grid",
        placeItems: "center",
        opacity: disabled ? 0.58 : 1,
        transform: isPlaying ? "translateY(-1px) scale(1.025)" : "translateY(0)",
        transition:
          "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
      }}
    >
      <style>{`
        @keyframes myway-audio-ring {
          0% { transform: scale(0.78); opacity: 0.42; }
          70% { transform: scale(1.42); opacity: 0; }
          100% { transform: scale(1.42); opacity: 0; }
        }

        @keyframes myway-audio-bar {
          0%, 100% { transform: scaleY(0.34); opacity: 0.62; }
          50% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>

      {isPlaying ? (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: "0.14rem",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.18)",
              animation: "myway-audio-ring 1300ms ease-out infinite",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: "0.45rem",
              borderRadius: "999px",
              border: "1px solid rgba(221,214,254,0.22)",
              animation: "myway-audio-ring 1300ms ease-out 360ms infinite",
            }}
          />
        </>
      ) : null}

      <span
        aria-hidden
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.22rem",
          height: "2.65rem",
          width: "3.35rem",
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <span
            key={index}
            style={{
              width: index === 3 ? "0.34rem" : "0.27rem",
              height: `${1.02 + (index % 4) * 0.34}rem`,
              borderRadius: "999px",
              background: "rgba(255,255,255,0.95)",
              transformOrigin: "center",
              animation: isPlaying
                ? `myway-audio-bar ${600 + index * 90}ms ease-in-out ${index * 70}ms infinite`
                : undefined,
            }}
          />
        ))}
      </span>
    </button>
  );
}

export function AudioClipProbe(props: GenericProbeComponentProps) {
  const audio = props.probe.renderer_params?.audio;
  const audioUrl = audio?.audio_url?.trim() || null;
  const options = getProbeOptions(props.probe);
  const hasOptions = options.length > 0;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const value = props.draft.text_response ?? "";
  const transcript = audio?.transcript?.trim() ?? "";
  const hasAudioUrl = Boolean(audioUrl);
  const canPlay = hasAudioUrl || transcript.length > 0;

  useEffect(() => {
    if (!transcript) return;
    if (props.draft.text_response?.trim()) return;

    props.onDraftChange({
      ...props.draft,
      text_response: `Audio transcript: ${transcript}`,
    });
    // Store hidden transcript once for local review/debug output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, props.probe]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      utteranceRef.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function togglePlayback() {
    if (props.disabled || !canPlay) return;

    setPlayError(null);

    if (isPlaying) {
      audioRef.current?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    if (hasAudioUrl) {
      const audioElement = audioRef.current;
      if (!audioElement) return;

      try {
        await audioElement.play();
      } catch (error) {
        setIsPlaying(false);
        setPlayError(
          error instanceof Error ? error.message : "Could not play this audio clip.",
        );
      }
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlayError("This browser cannot play the transcript fallback voice.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(transcript);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => {
      setIsPlaying(false);
      setPlayError("Could not play the transcript fallback voice.");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <ProbeShell {...props}>
      <ProbeStack gap="1rem">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <ProbeMiniLabel>Listen first</ProbeMiniLabel>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.84rem",
                lineHeight: 1.5,
              }}
            >
              Press the sound wave, listen to the clip, then answer based on what you heard.
            </p>
          </div>
          <ProbePill tone={isPlaying ? "success" : "purple"} active={isPlaying}>
            {isPlaying ? "playing" : hasAudioUrl ? "audio" : transcript ? "voice" : "waiting"}
          </ProbePill>
        </div>

        <ProbeMediaFrame>
          <div
            style={{
              display: "grid",
              gap: "0.95rem",
              justifyItems: "center",
              padding: "1.45rem",
              minHeight: "13rem",
              background:
                "radial-gradient(circle at center, rgba(168,85,247,0.2), transparent 52%), rgba(0,0,0,0.16)",
            }}
          >
            <AudioWaveButton
              isPlaying={isPlaying}
              disabled={props.disabled || !canPlay}
              onPress={togglePlayback}
            />

            <div style={{ textAlign: "center" }}>
              <p style={{ margin: 0, color: "white", fontWeight: 900 }}>
                {isPlaying
                  ? "Playing audio..."
                  : canPlay
                    ? "Play the clip"
                    : "Audio clip waiting"}
              </p>
              <p
                style={{
                  margin: "0.28rem 0 0",
                  color: "rgba(255,255,255,0.64)",
                  fontSize: "0.84rem",
                  lineHeight: 1.45,
                }}
              >
                {hasAudioUrl
                  ? "Press once to play. Press again to pause."
                  : transcript
                    ? "Prototype voice is generated from the hidden transcript."
                    : "The wave button will activate when an audio URL or transcript is supplied."}
              </p>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl ?? undefined}
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              style={{ display: "none" }}
            />

            {playError ? (
              <p
                style={{
                  margin: 0,
                  color: "rgba(254,202,202,0.95)",
                  fontSize: "0.84rem",
                  textAlign: "center",
                }}
              >
                {playError}
              </p>
            ) : null}
          </div>
        </ProbeMediaFrame>

        {hasOptions ? (
          <fieldset style={{ display: "grid", gap: "0.7rem", border: 0, padding: 0, margin: 0 }}>
            <legend style={{ marginBottom: "0.15rem" }}>
              <ProbeMiniLabel>Answer after listening</ProbeMiniLabel>
            </legend>

            {options.map((option) => {
              const checked = props.draft.selected_option_id === option.id;

              return (
                <ProbeOptionCard
                  key={option.id}
                  selected={checked}
                  disabled={props.disabled}
                  label={option.label}
                  input={
                    <input
                      type="radio"
                      checked={checked}
                      onChange={() =>
                        props.onDraftChange({
                          ...props.draft,
                          attempt_type: "single_choice",
                          selected_option_id: option.id,
                        })
                      }
                      style={{ marginTop: "0.35rem", accentColor: "#ddd6fe" }}
                    />
                  }
                >
                  {option.text}
                </ProbeOptionCard>
              );
            })}
          </fieldset>
        ) : (
          <div style={{ display: "grid", gap: "0.55rem" }}>
            <ProbeMiniLabel>Your response</ProbeMiniLabel>
            <ProbeTextArea
              value={value.startsWith("Audio transcript:") ? "" : value}
              disabled={props.disabled}
              rows={5}
              placeholder="What did you notice in the clip?"
              onChange={(nextValue) =>
                props.onDraftChange({
                  ...props.draft,
                  attempt_type: "text",
                  text_response: nextValue,
                })
              }
            />
          </div>
        )}
      </ProbeStack>
    </ProbeShell>
  );
}

