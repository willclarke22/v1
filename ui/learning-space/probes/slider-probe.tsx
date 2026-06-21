"use client";

import { useEffect } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

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

  /**
   * MyWay slider probes should be fine-grained by default. Model contracts can
   * still supply min/max/unit, but coarse steps like 5 should not make the UI
   * feel jumpy or imprecise.
   */
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
        <div style={{ display: "grid", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 800,
                }}
              >
                Set your estimate.
              </p>
              <p
                style={{
                  margin: "0.32rem 0 0",
                  color: "rgba(255,255,255,0.64)",
                  fontSize: "0.84rem",
                  lineHeight: 1.5,
                }}
              >
                Use the slider for a quick estimate, then fine-tune the exact
                value in the number box.
              </p>
            </div>

            <div
              style={{
                minWidth: "8.5rem",
                border: "1px solid rgba(221,214,254,0.2)",
                borderRadius: "22px",
                padding: "0.72rem 0.9rem",
                background: "rgba(0,0,0,0.18)",
                textAlign: "right",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.58)",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Estimate
              </p>
              <p
                style={{
                  margin: "0.16rem 0 0",
                  color: "white",
                  fontSize: "1.45rem",
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                }}
              >
                {formattedValue}
                {slider.unit ? (
                  <span style={{ fontSize: "0.9rem", opacity: 0.76 }}>
                    {` ${slider.unit}`}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <label style={{ display: "grid", gap: "0.65rem" }}>
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.78rem",
              }}
            >
              <span>
                {formatSliderValue(min, step)}
                {slider.unit ? ` ${slider.unit}` : ""}
              </span>
              <span>
                {formatSliderValue(max, step)}
                {slider.unit ? ` ${slider.unit}` : ""}
              </span>
            </span>

            <input
              type="range"
              disabled={props.disabled}
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(event) => updateValue(Number(event.target.value))}
              style={{ width: "100%", accentColor: "#c4b5fd" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.44rem", maxWidth: "18rem" }}>
            <span
              style={{
                color: "rgba(255,255,255,0.72)",
                fontSize: "0.8rem",
                fontWeight: 800,
              }}
            >
              Exact value
            </span>
            <input
              type="number"
              disabled={props.disabled}
              min={min}
              max={max}
              step={step}
              value={formattedValue}
              onChange={(event) => updateValue(Number(event.target.value))}
              style={{
                width: "100%",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.07)",
                color: "white",
                padding: "0.78rem 0.9rem",
                fontWeight: 800,
                outline: "none",
              }}
            />
          </label>
        </div>
      ) : (
        <p style={{ margin: 0, color: "rgba(255,255,255,0.72)" }}>
          This probe needs renderer_params.slider.
        </p>
      )}
    </ProbeShell>
  );
}
