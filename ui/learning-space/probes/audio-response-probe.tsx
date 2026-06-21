"use client";

import { useEffect, useRef, useState } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function buildRecordingSummary(durationSeconds: number) {
  return `Audio recording captured (${durationSeconds.toFixed(2)} seconds).`;
}

export function AudioResponseProbe(props: GenericProbeComponentProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const previousAudioUrlRef = useRef<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(
    props.draft.audio_recording_url ?? null,
  );

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previousAudioUrlRef.current) {
        URL.revokeObjectURL(previousAudioUrlRef.current);
      }
    };
  }, []);

  async function startRecording() {
    if (props.disabled || isRecording) return;

    setErrorMessage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const durationSeconds = Math.max(
          0,
          ((Date.now() - (startedAtRef.current ?? Date.now())) / 1000),
        );
        const nextAudioUrl = URL.createObjectURL(blob);

        if (previousAudioUrlRef.current) {
          URL.revokeObjectURL(previousAudioUrlRef.current);
        }

        previousAudioUrlRef.current = nextAudioUrl;
        setAudioUrl(nextAudioUrl);
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;

        const typedTranscript = props.draft.audio_response_transcript?.trim() ?? "";
        const recordingSummary = buildRecordingSummary(durationSeconds);

        props.onDraftChange({
          ...props.draft,
          attempt_type: "audio_response",
          audio_response_transcript: typedTranscript || recordingSummary,
          text_response: typedTranscript || recordingSummary,
          audio_recording_url: nextAudioUrl,
          audio_recording_duration_seconds: Number(durationSeconds.toFixed(2)),
          audio_recording_mime_type: blob.type,
          audio_recording_size_bytes: blob.size,
        });
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not start microphone recording.",
      );
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    recorderRef.current?.stop();
  }

  const duration = props.draft.audio_recording_duration_seconds ?? null;
  const transcript = props.draft.audio_response_transcript ?? "";

  return (
    <ProbeShell
      {...props}
      draft={{
        ...props.draft,
        attempt_type: "audio_response",
      }}
    >
      <div style={{ display: "grid", gap: "1rem" }}>
        <div
          style={{
            display: "grid",
            gap: "0.9rem",
            justifyItems: "center",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "28px",
            padding: "1.4rem",
            background:
              "radial-gradient(circle at center, rgba(168,85,247,0.16), rgba(0,0,0,0.12))",
          }}
        >
          <button
            type="button"
            disabled={props.disabled}
            onClick={isRecording ? stopRecording : startRecording}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            style={{
              width: "6.25rem",
              height: "6.25rem",
              borderRadius: isRecording ? "2rem" : "999px",
              border: "1px solid rgba(255,255,255,0.22)",
              background: isRecording
                ? "linear-gradient(145deg, rgba(244,63,94,0.7), rgba(168,85,247,0.28))"
                : "linear-gradient(145deg, rgba(221,214,254,0.26), rgba(168,85,247,0.22))",
              color: "white",
              boxShadow: isRecording
                ? "0 0 42px rgba(244,63,94,0.24)"
                : "0 0 42px rgba(168,85,247,0.22)",
              cursor: props.disabled ? "not-allowed" : "pointer",
              display: "grid",
              placeItems: "center",
              transition: "border-radius 160ms ease, background 160ms ease, transform 160ms ease",
            }}
          >
            {isRecording ? (
              <span
                aria-hidden
                style={{
                  width: "1.75rem",
                  height: "1.75rem",
                  borderRadius: "0.35rem",
                  background: "white",
                }}
              />
            ) : (
              <span aria-hidden style={{ fontSize: "2.15rem", lineHeight: 1 }}>
                ●
              </span>
            )}
          </button>

          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, color: "white", fontWeight: 900 }}>
              {isRecording ? "Recording..." : audioUrl ? "Recording ready" : "Record your answer"}
            </p>
            <p
              style={{
                margin: "0.28rem 0 0",
                color: "rgba(255,255,255,0.64)",
                fontSize: "0.84rem",
              }}
            >
              Press the circle to start. Press the square to stop.
              {duration ? ` Duration: ${formatDuration(duration)}.` : ""}
            </p>
          </div>

          {audioUrl ? (
            <audio controls src={audioUrl} style={{ width: "min(100%, 34rem)" }} />
          ) : null}

          {errorMessage ? (
            <p
              style={{
                margin: 0,
                color: "rgba(254,202,202,0.95)",
                fontSize: "0.84rem",
              }}
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <label style={{ display: "grid", gap: "0.6rem" }}>
          <span
            style={{
              color: "rgba(255,255,255,0.86)",
              fontSize: "0.9rem",
              fontWeight: 800,
            }}
          >
            Optional transcript or note
          </span>
          <textarea
            value={transcript.startsWith("Audio recording captured") ? "" : transcript}
            disabled={props.disabled}
            rows={4}
            placeholder="Type what you said, or add a quick note. The recording itself is enough for this local prototype."
            onChange={(event) => {
              props.onDraftChange({
                ...props.draft,
                attempt_type: "audio_response",
                audio_response_transcript: event.target.value,
                text_response: event.target.value,
              });
            }}
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: "18px",
              padding: "0.9rem",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.065)",
              color: "inherit",
              outline: "none",
              lineHeight: 1.55,
            }}
          />
        </label>
      </div>
    </ProbeShell>
  );
}
