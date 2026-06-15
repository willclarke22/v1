"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeOptions } from "./probe-ui-types";

export function SingleChoiceProbe(props: GenericProbeComponentProps) {
  const options = getProbeOptions(props.probe);

  return (
    <ProbeShell {...props}>
      <fieldset
        disabled={props.disabled}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          display: "grid",
          gap: "0.6rem",
        }}
      >
        <legend style={{ marginBottom: "0.35rem" }}>Choose one</legend>

        {options.length > 0 ? (
          options.map((option) => (
            <label
              key={option.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.6rem",
                alignItems: "start",
                padding: "0.75rem",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "12px",
              }}
            >
              <input
                type="radio"
                name="single-choice-probe"
                checked={props.draft.selected_option_id === option.id}
                onChange={() =>
                  props.onDraftChange({
                    ...props.draft,
                    attempt_type: "single_choice",
                    selected_option_id: option.id,
                  })
                }
              />
              <span>
                <strong>{option.label}</strong>
                <br />
                {option.text}
              </span>
            </label>
          ))
        ) : (
          <p>No options were supplied in renderer_params.options.</p>
        )}
      </fieldset>
    </ProbeShell>
  );
}

