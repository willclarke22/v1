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
  gap: "0.9rem",
  width: "100%",
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "16px",
  padding: "1rem",
  background: "rgba(8, 8, 16, 0.72)",
};

const mutedStyle: CSSProperties = {
  opacity: 0.72,
  fontSize: "0.9rem",
  lineHeight: 1.45,
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "999px",
  padding: "0.65rem 1rem",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  cursor: "pointer",
};

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

  return (
    <section
      style={shellStyle}
      aria-label={`${getProbeTypeLabel(probe.probe_type)} probe`}
    >
      <div style={cardStyle}>
        <div style={mutedStyle}>{getProbeTypeLabel(probe.probe_type)}</div>
        <h3 style={{ margin: "0.25rem 0 0.5rem" }}>{probe.prompt.task}</h3>
        <p style={{ margin: 0, lineHeight: 1.55 }}>{probe.prompt.full_prompt}</p>
      </div>

      {probe.presentation_support && probe.presentation_support.length > 0 ? (
        <div style={cardStyle}>
          <strong>Helpful frame</strong>
          <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.65rem" }}>
            {probe.presentation_support.map((support, index) => (
              <p key={`${support.kind}-${index}`} style={{ margin: 0, lineHeight: 1.5 }}>
                {support.text}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div style={cardStyle}>{children}</div>

      {showDebug ? <DebugDetails probe={probe} /> : null}

      {props.onSubmit ? (
        <button
          type="button"
          disabled={disabled}
          style={{
            ...buttonStyle,
            opacity: disabled ? 0.5 : 1,
          }}
          onClick={() => submitProbe(props, draft)}
        >
          Submit probe
        </button>
      ) : null}
    </section>
  );
}

