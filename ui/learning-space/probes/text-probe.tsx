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
      <label style={{ display: "grid", gap: "0.5rem" }}>
        <span>Your response</span>
        <textarea
          value={value}
          disabled={props.disabled}
          rows={6}
          placeholder="Explain it in your own words."
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
            borderRadius: "12px",
            padding: "0.75rem",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
          }}
        />
      </label>
    </ProbeShell>
  );
}

