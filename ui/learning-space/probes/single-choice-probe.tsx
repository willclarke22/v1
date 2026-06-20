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
          gap: "0.7rem",
        }}
      >
        <legend
          style={{
            marginBottom: "0.25rem",
            color: "rgba(255,255,255,0.86)",
            fontSize: "0.9rem",
            fontWeight: 700,
          }}
        >
          Choose the idea that fits best
        </legend>

        {options.length > 0 ? (
          options.map((option) => {
            const checked = props.draft.selected_option_id === option.id;

            return (
              <label
                key={option.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "0.75rem",
                  alignItems: "start",
                  padding: "0.9rem",
                  border: checked
                    ? "1px solid rgba(221,214,254,0.58)"
                    : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "18px",
                  background: checked
                    ? "linear-gradient(135deg, rgba(124,58,237,0.32), rgba(255,255,255,0.08))"
                    : "rgba(255,255,255,0.045)",
                  boxShadow: checked
                    ? "0 14px 36px rgba(76,29,149,0.28)"
                    : "none",
                  cursor: props.disabled ? "default" : "pointer",
                  transition: "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease",
                }}
              >
                <input
                  type="radio"
                  name="single-choice-probe"
                  checked={checked}
                  onChange={() =>
                    props.onDraftChange({
                      ...props.draft,
                      attempt_type: "single_choice",
                      selected_option_id: option.id,
                    })
                  }
                  style={{
                    marginTop: "0.18rem",
                    accentColor: "#ddd6fe",
                  }}
                />

                <span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "1.7rem",
                      height: "1.7rem",
                      marginBottom: "0.35rem",
                      borderRadius: "999px",
                      background: checked
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.92)",
                      fontSize: "0.78rem",
                      fontWeight: 800,
                    }}
                  >
                    {option.label}
                  </span>

                  <span
                    style={{
                      display: "block",
                      color: "rgba(255,255,255,0.92)",
                      lineHeight: 1.5,
                    }}
                  >
                    {option.text}
                  </span>
                </span>
              </label>
            );
          })
        ) : (
          <p style={{ margin: 0, color: "rgba(255,255,255,0.72)" }}>
            No options were supplied in renderer_params.options.
          </p>
        )}
      </fieldset>
    </ProbeShell>
  );
}
