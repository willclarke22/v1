"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { ProbeMiniLabel, ProbePill, ProbeStack, ProbeTextArea } from "./shared";

function getWordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function TextProbe(props: GenericProbeComponentProps) {
  const isAudioResponse = props.probe.expected_attempt_type === "audio_response";
  const value = isAudioResponse
    ? props.draft.audio_response_transcript ?? ""
    : props.draft.text_response ?? "";
  const wordCount = getWordCount(value);

  return (
    <ProbeShell {...props}>
      <ProbeStack gap="0.85rem">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.85rem",
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <div>
            <ProbeMiniLabel>
              {isAudioResponse ? "Transcript or spoken response" : "Your response"}
            </ProbeMiniLabel>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.84rem",
                lineHeight: 1.55,
              }}
            >
              MyWay is looking for the shape of your thinking, not perfect wording.
            </p>
          </div>

          <ProbePill tone={wordCount >= 20 ? "success" : wordCount > 0 ? "warning" : "default"}>
            {wordCount === 0 ? "not started" : `${wordCount} word${wordCount === 1 ? "" : "s"}`}
          </ProbePill>
        </div>

        <ProbeTextArea
          value={value}
          disabled={props.disabled}
          rows={8}
          placeholder="Explain it in your own words. A partial answer is okay."
          ariaLabel={isAudioResponse ? "Transcript or spoken response" : "Your response"}
          onChange={(nextValue) => {
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
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          {["Start with what you know", "Use an example", "Explain why"].map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={props.disabled}
              onClick={() => {
                const prefix = value.trim() ? `${value.trim()}\n` : "";
                const nextValue = `${prefix}${starter}: `;
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
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.055)",
                color: "rgba(255,255,255,0.72)",
                padding: "0.36rem 0.58rem",
                fontSize: "0.74rem",
                cursor: props.disabled ? "not-allowed" : "pointer",
              }}
            >
              + {starter}
            </button>
          ))}
        </div>
      </ProbeStack>
    </ProbeShell>
  );
}
