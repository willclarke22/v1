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

const glassCardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: "24px",
  padding: "1rem",
  background:
    "linear-gradient(145deg, rgba(24,18,44,0.78), rgba(8,8,18,0.82))",
  boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
};

const softCardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "20px",
  padding: "1rem",
  background: "rgba(255,255,255,0.055)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "rgba(216, 201, 255, 0.78)",
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

const mutedStyle: CSSProperties = {
  opacity: 0.78,
  fontSize: "0.9rem",
  lineHeight: 1.55,
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(221,214,254,0.38)",
  borderRadius: "999px",
  padding: "0.72rem 1.05rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(168,85,247,0.18))",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 700,
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

function BridgePill({ probe }: { probe: EngineRenderableProbe }) {
  const bridgeLevel = probe.delivery_context?.bridge_level;
  const jargonLevel = probe.delivery_context?.language_policy?.jargon_level;

  if (!bridgeLevel && !jargonLevel) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.45rem",
        marginTop: "0.85rem",
      }}
    >
      {bridgeLevel ? (
        <span
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "999px",
            padding: "0.32rem 0.58rem",
            background: "rgba(255,255,255,0.065)",
            color: "rgba(255,255,255,0.82)",
            fontSize: "0.72rem",
          }}
        >
          {bridgeLevel === "bridge_0" ? "No-jargon bridge" : bridgeLevel}
        </span>
      ) : null}

      {jargonLevel ? (
        <span
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "999px",
            padding: "0.32rem 0.58rem",
            background: "rgba(255,255,255,0.065)",
            color: "rgba(255,255,255,0.82)",
            fontSize: "0.72rem",
          }}
        >
          Jargon: {jargonLevel}
        </span>
      ) : null}
    </div>
  );
}

export function ProbeShell(props: ProbeShellProps) {
  const { probe, draft, disabled, showDebug, children } = props;
  const typeLabel = getProbeTypeLabel(probe.probe_type);
  const promptText = probe.prompt.full_prompt || probe.prompt.task;
  const support = probe.presentation_support ?? [];

  return (
    <section style={shellStyle} aria-label={`${typeLabel} probe`}>
      <div style={glassCardStyle}>
        <p style={eyebrowStyle}>{typeLabel}</p>

        <h3
          style={{
            margin: "0.38rem 0 0.65rem",
            color: "white",
            fontSize: "1.32rem",
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
          }}
        >
          {probe.prompt.task}
        </h3>

        <p
          style={{
            margin: 0,
            color: "rgba(244,244,245,0.92)",
            fontSize: "0.98rem",
            lineHeight: 1.72,
            whiteSpace: "pre-wrap",
          }}
        >
          {promptText}
        </p>

        <BridgePill probe={probe} />
      </div>

      {support.length > 0 ? (
        <div style={softCardStyle}>
          <p style={eyebrowStyle}>Helpful frame</p>
          <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.75rem" }}>
            {support.map((item, index) => (
              <div
                key={`${item.kind}-${index}`}
                style={{
                  borderLeft: "2px solid rgba(221,214,254,0.42)",
                  paddingLeft: "0.8rem",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: "rgba(244,244,245,0.88)",
                    fontSize: "0.92rem",
                    lineHeight: 1.6,
                  }}
                >
                  {item.text}
                </p>
                {item.user_interest_used ? (
                  <p
                    style={{
                      margin: "0.35rem 0 0",
                      color: "rgba(196,181,253,0.82)",
                      fontSize: "0.75rem",
                    }}
                  >
                    Connected through: {item.user_interest_used}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={softCardStyle}>{children}</div>

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
