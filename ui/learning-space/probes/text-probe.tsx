"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

export function TextProbe(props: GenericProbeComponentProps) {
  const isAudioResponse = props.probe.expected_attempt_type === "audio_response";
  const value = isAudioResponse
    ? props.draft.audio_response_transcript ?? ""
    : props.draft.text_response ?? "";

  return (
    <ProbeShell {...props}>
      <label style={{ display: "grid", gap: "0.65rem" }}>
        <span
          style={{
            color: "rgba(255,255,255,0.86)",
            fontSize: "0.9rem",
            fontWeight: 700,
          }}
        >
          {isAudioResponse ? "Transcript or spoken response" : "Your response"}
        </span>

        <textarea
          value={value}
          disabled={props.disabled}
          rows={7}
          placeholder="Explain it in your own words. A partial answer is okay."
          onChange={(event) => {
            const nextValue = event.target.value;
            props.onDraftChange({
              ...props.draft,
              attempt_type: props.probe.expected_attempt_type,
              text_response: isAudioResponse
                ? props.draft.text_response
                : nextValue,
              audio_response_transcript: isAudioResponse
                ? nextValue
                : props.draft.audio_response_transcript,
            });
          }}
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: "18px",
            padding: "1rem",
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.045))",
            color: "inherit",
            outline: "none",
            lineHeight: 1.6,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        />

        <span
          style={{
            color: "rgba(212,212,216,0.72)",
            fontSize: "0.78rem",
            lineHeight: 1.5,
          }}
        >
          MyWay is looking for the shape of your thinking, not perfect wording.
        </span>
      </label>
    </ProbeShell>
  );
}
