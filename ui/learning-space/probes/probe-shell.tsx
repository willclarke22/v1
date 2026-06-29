"use client";

import type { CSSProperties, ReactNode } from "react";
import type { EngineRenderableProbe } from "@/lib/engine";
import type {
  GenericProbeComponentProps,
  ProbeAnswerDraft,
} from "./probe-ui-types";
import { getProbeTypeLabel, submitProbe } from "./probe-ui-types";
import {
  ProbeButton,
  ProbePill,
  ProbeSection,
  ProbeStack,
  cleanProbeLabel,
} from "./shared";

type ProbeShellProps = GenericProbeComponentProps & {
  children: ReactNode;
  draft: ProbeAnswerDraft;
};

const shellStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  width: "100%",
};

function DebugDetails({ probe }: { probe: EngineRenderableProbe }) {
  return (
    <details
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px",
        padding: "0.85rem",
        background: "rgba(0,0,0,0.16)",
        color: "rgba(255,255,255,0.72)",
        fontSize: "0.84rem",
        lineHeight: 1.55,
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>
        Probe contract details
      </summary>
      <pre
        style={{
          margin: "0.75rem 0 0",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontSize: "0.76rem",
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

function PromptSupport({ probe }: { probe: EngineRenderableProbe }) {
  const rootProblem = probe.prompt.root_problem_explanation?.trim();
  const reshaping = probe.prompt.reshaping_explanation?.trim();

  if (!rootProblem && !reshaping) return null;

  return (
    <details
      style={{
        marginTop: "0.9rem",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px",
        padding: "0.8rem",
        background: "rgba(0,0,0,0.12)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          color: "rgba(233,213,255,0.86)",
          fontSize: "0.8rem",
          fontWeight: 850,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        What MyWay is checking
      </summary>
      <ProbeStack gap="0.55rem" style={{ marginTop: "0.75rem" }}>
        {rootProblem ? (
          <p
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.82)",
              fontSize: "0.86rem",
              lineHeight: 1.55,
            }}
          >
            {rootProblem}
          </p>
        ) : null}
        {reshaping ? (
          <p
            style={{
              margin: 0,
              color: "rgba(212,212,216,0.72)",
              fontSize: "0.84rem",
              lineHeight: 1.55,
            }}
          >
            {reshaping}
          </p>
        ) : null}
      </ProbeStack>
    </details>
  );
}

export function ProbeShell(props: ProbeShellProps) {
  const { probe, draft, disabled, showDebug, children } = props;
  const typeLabel = cleanProbeLabel(getProbeTypeLabel(probe.probe_type));
  const attemptLabel = cleanProbeLabel(probe.expected_attempt_type);
  const promptText = probe.prompt.full_prompt || probe.prompt.task;
  const showFullPrompt = promptText && promptText !== probe.prompt.task;

  return (
    <section style={shellStyle} aria-label={`${typeLabel} probe`}>
      <ProbeSection
        tone="deep"
        style={{
          padding: "1.08rem",
          borderRadius: "30px",
          background:
            "radial-gradient(circle at top left, rgba(221,214,254,0.2), transparent 34%), radial-gradient(circle at bottom right, rgba(168,85,247,0.12), transparent 36%), linear-gradient(145deg, rgba(25,16,50,0.82), rgba(8,8,18,0.88))",
          boxShadow: "0 20px 70px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
              <ProbePill tone="purple" active>
                {typeLabel}
              </ProbePill>
              <ProbePill>{attemptLabel}</ProbePill>
              {probe.confidence ? (
                <ProbePill tone={probe.confidence >= 0.72 ? "success" : "warning"}>
                  confidence {Math.round(probe.confidence * 100)}%
                </ProbePill>
              ) : null}
            </div>

            <h3
              style={{
                margin: "0.72rem 0 0",
                color: "white",
                fontSize: "clamp(1.25rem, 2vw, 1.72rem)",
                lineHeight: 1.16,
                letterSpacing: "-0.03em",
                fontWeight: 900,
              }}
            >
              {probe.prompt.task}
            </h3>

            {showFullPrompt ? (
              <p
                style={{
                  margin: "0.7rem 0 0",
                  color: "rgba(244,244,245,0.88)",
                  fontSize: "0.96rem",
                  lineHeight: 1.68,
                  whiteSpace: "pre-wrap",
                }}
              >
                {promptText}
              </p>
            ) : null}
          </div>
        </div>

        <PromptSupport probe={probe} />
      </ProbeSection>

      <ProbeSection
        tone="default"
        style={{
          padding: "1rem",
          borderRadius: "30px",
          background:
            "radial-gradient(circle at top right, rgba(221,214,254,0.08), transparent 32%), linear-gradient(145deg, rgba(255,255,255,0.078), rgba(255,255,255,0.035))",
        }}
      >
        {children}
      </ProbeSection>

      {showDebug ? <DebugDetails probe={probe} /> : null}

      {props.onSubmit ? (
        <ProbeButton
          variant="primary"
          disabled={disabled}
          onClick={() => submitProbe(props, draft)}
          style={{ justifySelf: "end" }}
        >
          Submit probe
        </ProbeButton>
      ) : null}
    </section>
  );
}
