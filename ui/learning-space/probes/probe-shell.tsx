"use client";

import type { CSSProperties, ReactNode } from "react";
import type { EngineRenderableProbe } from "@/lib/engine";
import type {
  GenericProbeComponentProps,
  ProbeAnswerDraft,
} from "./probe-ui-types";
import { getProbeTypeLabel, submitProbe } from "./probe-ui-types";

type ProbeShellProps = GenericProbeComponentProps & {
  children: ReactNode;
  draft: ProbeAnswerDraft;
};

const shellStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  width: "100%",
};

const heroCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "28px",
  padding: "1rem 1.08rem",
  background:
    "radial-gradient(circle at top left, rgba(221,214,254,0.2), transparent 34%), linear-gradient(145deg, rgba(28,18,54,0.78), rgba(8,8,18,0.86))",
  boxShadow: "0 18px 62px rgba(0,0,0,0.26)",
};

const interactionCardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "26px",
  padding: "1rem",
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "rgba(216, 201, 255, 0.82)",
  fontSize: "0.68rem",
  fontWeight: 800,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
};

const mutedStyle: CSSProperties = {
  opacity: 0.78,
  fontSize: "0.9rem",
  lineHeight: 1.55,
};

const submitButtonStyle: CSSProperties = {
  justifySelf: "end",
  border: "1px solid rgba(221,214,254,0.46)",
  borderRadius: "999px",
  padding: "0.78rem 1.12rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(168,85,247,0.22))",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 14px 34px rgba(88,28,135,0.24)",
};

function cleanLabel(value: string) {
  return value.replaceAll("_", " ");
}

function DebugDetails({ probe }: { probe: EngineRenderableProbe }) {
  return (
    <details style={mutedStyle}>
      <summary>Probe contract details</summary>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontSize: "0.78rem",
        }}
      >
        {JSON.stringify(
          {
            schema_version: probe.schema_version,
            probe_type: probe.probe_type,
            expected_attempt_type: probe.expected_attempt_type,
            answer_key_present: Boolean(probe.answer_key),
            misconception_marker_count: probe.misconception_markers.length,
            delivery_context: probe.delivery_context ?? null,
            renderer_compatibility: probe.renderer_compatibility,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}

export function ProbeShell(props: ProbeShellProps) {
  const { probe, draft, disabled, showDebug, children } = props;
  const typeLabel = cleanLabel(getProbeTypeLabel(probe.probe_type));
  const promptText = probe.prompt.full_prompt || probe.prompt.task;

  return (
    <section style={shellStyle} aria-label={`${typeLabel} probe`}>
      <div style={heroCardStyle}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "-20% auto auto -6%",
            width: "11rem",
            height: "11rem",
            borderRadius: "999px",
            background: "rgba(168,85,247,0.14)",
            filter: "blur(10px)",
          }}
        />

        <div style={{ position: "relative" }}>
          <p style={eyebrowStyle}>{typeLabel}</p>

          <h3
            style={{
              margin: "0.36rem 0 0.55rem",
              color: "white",
              fontSize: "1.28rem",
              lineHeight: 1.18,
              letterSpacing: "-0.025em",
            }}
          >
            {probe.prompt.task}
          </h3>

          {promptText && promptText !== probe.prompt.task ? (
            <p
              style={{
                margin: 0,
                color: "rgba(244,244,245,0.9)",
                fontSize: "0.95rem",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {promptText}
            </p>
          ) : null}
        </div>
      </div>

      <div style={interactionCardStyle}>{children}</div>

      {showDebug ? <DebugDetails probe={probe} /> : null}

      {props.onSubmit ? (
        <button
          type="button"
          disabled={disabled}
          style={{
            ...submitButtonStyle,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
          onClick={() => submitProbe(props, draft)}
        >
          Submit probe
        </button>
      ) : null}
    </section>
  );
}
