"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

export function SliderProbe(props: GenericProbeComponentProps) {
  const slider = props.probe.renderer_params?.slider;
  const value = props.draft.numeric_response ?? slider?.min ?? 0;

  return (
    <ProbeShell {...props}>
      {slider ? (
        <label style={{ display: "grid", gap: "0.6rem" }}>
          <span>
            Your estimate: {value}
            {slider.unit ? ` ${slider.unit}` : ""}
          </span>
          <input
            type="range"
            disabled={props.disabled}
            min={slider.min}
            max={slider.max}
            step={slider.step ?? 1}
            value={value}
            onChange={(event) =>
              props.onDraftChange({
                ...props.draft,
                attempt_type: "numeric",
                numeric_response: Number(event.target.value),
              })
            }
          />
          <input
            type="number"
            disabled={props.disabled}
            min={slider.min}
            max={slider.max}
            step={slider.step ?? 1}
            value={value}
            onChange={(event) =>
              props.onDraftChange({
                ...props.draft,
                attempt_type: "numeric",
                numeric_response: Number(event.target.value),
              })
            }
          />
        </label>
      ) : (
        <p>This probe needs renderer_params.slider.</p>
      )}
    </ProbeShell>
  );
}

