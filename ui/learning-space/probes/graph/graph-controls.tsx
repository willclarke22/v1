"use client";

import type { CSSProperties } from "react";
import type {
  ProbeGraphModeDraft,
  ProbeGraphParameterDraft,
  ProbeGraphWindow3DDraft,
  ProbeGraphWindowDraft,
} from "../probe-ui-types";
import {
  ProbeButton,
  ProbeMiniLabel,
  ProbePill,
  ProbeSection,
  ProbeStack,
  ProbeTextArea,
  probeTheme,
} from "../shared";
import {
  ANIMATION_PRESETS_2D,
  ANIMATION_PRESETS_3D,
  FUNCTION_EXAMPLES,
  GRAPH_MODE_COPY,
  QUICK_INSERTS_2D,
  QUICK_INSERTS_3D,
  SURFACE_EXAMPLES,
  type GraphAnimationId,
  type GraphExpressionStatus,
} from "./graph-types";
import { formatNumber } from "./graph-expression";

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "0.74rem 0.82rem",
  outline: "none",
  fontSize: "0.96rem",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

export function GraphModeSwitch({
  mode,
  disabled,
  onModeChange,
}: {
  mode: ProbeGraphModeDraft;
  disabled?: boolean;
  onModeChange: (mode: ProbeGraphModeDraft) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "999px",
        padding: "0.25rem",
        background: "rgba(0,0,0,0.2)",
      }}
    >
      {(["2d", "3d"] as const).map((nextMode) => (
        <button
          key={nextMode}
          type="button"
          disabled={disabled}
          onClick={() => onModeChange(nextMode)}
          style={{
            border: 0,
            borderRadius: "999px",
            padding: "0.52rem 0.85rem",
            background: mode === nextMode ? "rgba(221,214,254,0.2)" : "transparent",
            color: mode === nextMode ? "white" : "rgba(255,255,255,0.66)",
            fontWeight: 900,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {nextMode === "2d" ? "2D" : "3D"}
        </button>
      ))}
    </div>
  );
}

export function GraphEquationPanel({
  mode,
  expression,
  status,
  disabled,
  onExpressionChange,
  onInsert,
}: {
  mode: ProbeGraphModeDraft;
  expression: string;
  status: GraphExpressionStatus;
  disabled?: boolean;
  onExpressionChange: (value: string) => void;
  onInsert: (value: string) => void;
}) {
  const copy = GRAPH_MODE_COPY[mode];
  const examples = mode === "2d" ? FUNCTION_EXAMPLES : SURFACE_EXAMPLES;
  const inserts = mode === "2d" ? QUICK_INSERTS_2D : QUICK_INSERTS_3D;

  return (
    <ProbeSection
      title={mode === "2d" ? "Function" : "Surface"}
      subtitle={copy.body}
      badge={<ProbePill tone={status.isValid ? "success" : "warning"}>{status.isValid ? "Ready" : "Check"}</ProbePill>}
      style={{ padding: "1rem" }}
    >
      <ProbeStack gap="0.75rem">
        <label
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0,1fr)",
            gap: "0.55rem",
            alignItems: "center",
          }}
        >
          <span
            style={{
              border: "1px solid rgba(221,214,254,0.2)",
              borderRadius: "999px",
              padding: "0.54rem 0.7rem",
              background: "rgba(221,214,254,0.09)",
              color: "white",
              fontWeight: 950,
            }}
          >
            {copy.equationPrefix}
          </span>
          <input
            value={expression}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => onExpressionChange(event.target.value)}
            placeholder={mode === "2d" ? "a*x^2 + b*x + c" : "a*x^2 - b*y^2 + c"}
            style={{
              ...inputStyle,
              border: status.isValid
                ? inputStyle.border
                : "1px solid rgba(253,186,116,0.38)",
            }}
          />
        </label>

        {!status.isValid ? (
          <p style={{ margin: 0, color: "rgba(254,215,170,0.9)", fontSize: "0.78rem", lineHeight: 1.5 }}>
            {status.message}
          </p>
        ) : null}

        <div style={{ display: "grid", gap: "0.6rem" }}>
          <ProbeMiniLabel>Pick a shape</ProbeMiniLabel>
          <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(8.5rem, 1fr))" }}>
            {examples.map((example) => (
              <button
                key={example.id}
                type="button"
                disabled={disabled}
                onClick={() => onExpressionChange(example.expression)}
                style={{
                  minHeight: "4.1rem",
                  border: expression === example.expression
                    ? "1px solid rgba(221,214,254,0.52)"
                    : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "18px",
                  background: expression === example.expression
                    ? "radial-gradient(circle at top left, rgba(221,214,254,0.18), transparent 40%), rgba(255,255,255,0.065)"
                    : "rgba(255,255,255,0.04)",
                  color: "white",
                  padding: "0.7rem",
                  textAlign: "left",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <span style={{ display: "block", fontWeight: 900 }}>{example.label}</span>
                <span style={{ display: "block", marginTop: "0.25rem", color: probeTheme.text.secondary, fontSize: "0.74rem", lineHeight: 1.35 }}>
                  {example.explanation}
                </span>
              </button>
            ))}
          </div>
        </div>

        <details>
          <summary
            style={{
              cursor: "pointer",
              color: "rgba(255,255,255,0.72)",
              fontSize: "0.8rem",
              fontWeight: 850,
            }}
          >
            Quick inserts
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.55rem" }}>
            {inserts.map((insert) => (
              <ProbeButton
                key={insert}
                disabled={disabled}
                variant="ghost"
                onClick={() => onInsert(insert)}
                style={{ padding: "0.34rem 0.54rem", fontSize: "0.7rem" }}
              >
                + {insert}
              </ProbeButton>
            ))}
          </div>
        </details>
      </ProbeStack>
    </ProbeSection>
  );
}

export function GraphConceptControls({
  mode,
  parameters,
  disabled,
  onParameterChange,
  onReset,
  onAnimate,
}: {
  mode: ProbeGraphModeDraft;
  parameters: ProbeGraphParameterDraft[];
  disabled?: boolean;
  onParameterChange: (parameter: ProbeGraphParameterDraft) => void;
  onReset: () => void;
  onAnimate: (id: GraphAnimationId) => void;
}) {
  const animations = mode === "2d" ? ANIMATION_PRESETS_2D : ANIMATION_PRESETS_3D;

  return (
    <ProbeSection
      title="Concept controls"
      subtitle="Move one value and watch the graph respond."
      badge={<ProbeButton disabled={disabled} variant="ghost" onClick={onReset} style={{ padding: "0.42rem 0.62rem", fontSize: "0.72rem" }}>Reset</ProbeButton>}
    >
      <ProbeStack gap="0.85rem">
        <div style={{ display: "grid", gap: "0.68rem" }}>
          {parameters.map((parameter) => {
            const min = parameter.min ?? -10;
            const max = parameter.max ?? 10;
            const step = parameter.step ?? 0.01;

            return (
              <label
                key={parameter.name}
                style={{
                  display: "grid",
                  gap: "0.5rem",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: "18px",
                  padding: "0.72rem",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.8rem",
                    alignItems: "center",
                    color: "rgba(255,255,255,0.82)",
                    fontWeight: 850,
                  }}
                >
                  <span>{parameter.name}</span>
                  <ProbePill tone="purple">{formatNumber(parameter.value, 2)}</ProbePill>
                </span>
                <input
                  type="range"
                  disabled={disabled}
                  min={min}
                  max={max}
                  step={step}
                  value={parameter.value}
                  onChange={(event) =>
                    onParameterChange({
                      ...parameter,
                      value: Number(event.target.value),
                    })
                  }
                />
              </label>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: "0.5rem" }}>
          <ProbeMiniLabel>Animate the idea</ProbeMiniLabel>
          <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))" }}>
            {animations.map((animation) => (
              <button
                key={animation.id}
                type="button"
                disabled={disabled}
                onClick={() => onAnimate(animation.id)}
                style={{
                  minHeight: "3.9rem",
                  border: "1px solid rgba(221,214,254,0.18)",
                  borderRadius: "18px",
                  background:
                    "radial-gradient(circle at top left, rgba(221,214,254,0.1), transparent 42%), rgba(255,255,255,0.045)",
                  color: "white",
                  padding: "0.65rem",
                  textAlign: "left",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <span style={{ display: "block", fontWeight: 900 }}>{animation.label}</span>
                <span style={{ display: "block", marginTop: "0.2rem", color: probeTheme.text.secondary, fontSize: "0.72rem", lineHeight: 1.35 }}>
                  {animation.body}
                </span>
              </button>
            ))}
          </div>
        </div>
      </ProbeStack>
    </ProbeSection>
  );
}

function NumberField({
  label,
  value,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "0.28rem" }}>
      <span style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.72rem" }}>
        {label}
      </span>
      <input
        type="number"
        disabled={disabled}
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "12px",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          padding: "0.5rem",
          outline: "none",
        }}
      />
    </label>
  );
}

export function GraphWindowControls({
  mode,
  graphWindow,
  graph3DWindow,
  disabled,
  onWindowChange,
  on3DWindowChange,
}: {
  mode: ProbeGraphModeDraft;
  graphWindow: ProbeGraphWindowDraft;
  graph3DWindow: ProbeGraphWindow3DDraft;
  disabled?: boolean;
  onWindowChange: (graphWindow: ProbeGraphWindowDraft) => void;
  on3DWindowChange: (graphWindow: ProbeGraphWindow3DDraft) => void;
}) {
  return (
    <details
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "22px",
        padding: "0.85rem",
        background: "rgba(0,0,0,0.12)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          color: "rgba(255,255,255,0.78)",
          fontSize: "0.76rem",
          fontWeight: 900,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        Advanced window
      </summary>
      <div
        style={{
          display: "grid",
          gap: "0.55rem",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          marginTop: "0.75rem",
        }}
      >
        {mode === "2d"
          ? ([
              ["xMin", "x min"],
              ["xMax", "x max"],
              ["yMin", "y min"],
              ["yMax", "y max"],
            ] as const).map(([key, label]) => (
              <NumberField
                key={key}
                label={label}
                value={graphWindow[key]}
                disabled={disabled}
                onChange={(value) =>
                  onWindowChange({
                    ...graphWindow,
                    [key]: value,
                  })
                }
              />
            ))
          : ([
              ["xMin", "x min"],
              ["xMax", "x max"],
              ["yMin", "y min"],
              ["yMax", "y max"],
              ["zMin", "z min"],
              ["zMax", "z max"],
            ] as const).map(([key, label]) => (
              <NumberField
                key={key}
                label={label}
                value={graph3DWindow[key]}
                disabled={disabled}
                onChange={(value) =>
                  on3DWindowChange({
                    ...graph3DWindow,
                    [key]: value,
                  })
                }
              />
            ))}
      </div>
    </details>
  );
}

export function GraphObservationBox({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <ProbeSection
      title="What changed?"
      subtitle="Describe what you noticed. A short observation is enough."
    >
      <ProbeTextArea
        value={value}
        disabled={disabled}
        rows={4}
        placeholder="Example: when a gets larger, the bowl becomes steeper; when c changes, the whole graph moves up or down..."
        onChange={onChange}
        ariaLabel="Graph observation"
      />
    </ProbeSection>
  );
}
