"use client";

import { useEffect } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { ProbeMiniLabel, ProbePill, ProbeSection, ProbeStack } from "./shared";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number) {
  const precision = Math.max(0, Math.ceil(Math.abs(Math.log10(step))));
  return Number((Math.round(value / step) * step).toFixed(precision + 1));
}

function formatSliderValue(value: number, step: number) {
  const decimals = step < 1 ? Math.max(2, Math.ceil(Math.abs(Math.log10(step)))) : 2;
  return value.toFixed(decimals);
}

export function SliderProbe(props: GenericProbeComponentProps) {
  const slider = props.probe.renderer_params?.slider;

  const min = finiteNumber(slider?.min) ? slider.min : 0;
  const max = finiteNumber(slider?.max) ? slider.max : 100;
  const step =
    finiteNumber(slider?.step) && slider.step > 0 && slider.step < 0.01
      ? slider.step
      : 0.01;

  const midpoint = roundToStep((min + max) / 2, step);
  const value = clamp(props.draft.numeric_response ?? midpoint, min, max);
  const formattedValue = formatSliderValue(value, step);

  useEffect(() => {
    if (!slider) return;
    if (typeof props.draft.numeric_response === "number") return;

    props.onDraftChange({
      ...props.draft,
      attempt_type: "numeric",
      numeric_response: midpoint,
    });
    // Initialize once for this probe contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.probe]);

  function updateValue(rawValue: number) {
    props.onDraftChange({
      ...props.draft,
      attempt_type: "numeric",
      numeric_response: roundToStep(clamp(rawValue, min, max), step),
    });
  }

  return (
    <ProbeShell {...props}>
      {slider ? (
        <ProbeStack gap="1rem">
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <ProbeMiniLabel>Estimate</ProbeMiniLabel>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  color: "rgba(255,255,255,0.66)",
                  fontSize: "0.84rem",
                  lineHeight: 1.5,
                }}
              >
                Move the slider until the value matches your best estimate.
              </p>
            </div>

            <ProbePill tone="purple" active style={{ fontSize: "0.9rem", padding: "0.52rem 0.75rem" }}>
              {formattedValue}
              {slider.unit ? ` ${slider.unit}` : ""}
            </ProbePill>
          </div>

          <ProbeSection
            tone="selected"
            style={{
              padding: "1.25rem",
              borderRadius: "30px",
              background:
                "radial-gradient(circle at 50% 0%, rgba(221,214,254,0.16), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))",
            }}
          >
            <ProbeStack gap="0.95rem">
              <input
                type="range"
                disabled={props.disabled}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => updateValue(Number(event.target.value))}
                aria-label="Estimate slider"
                style={{
                  width: "100%",
                  accentColor: "#ddd6fe",
                }}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  color: "rgba(255,255,255,0.58)",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                }}
              >
                <span>
                  {min}
                  {slider.unit ? ` ${slider.unit}` : ""}
                </span>
                <span style={{ textAlign: "right" }}>
                  {max}
                  {slider.unit ? ` ${slider.unit}` : ""}
                </span>
              </div>
            </ProbeStack>
          </ProbeSection>
        </ProbeStack>
      ) : (
        <ProbeSection tone="empty">
          <p style={{ margin: 0, color: "rgba(255,255,255,0.72)" }}>
            This probe needs renderer_params.slider.
          </p>
        </ProbeSection>
      )}
    </ProbeShell>
  );
}
