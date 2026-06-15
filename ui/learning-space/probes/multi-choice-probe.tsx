"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeOptions } from "./probe-ui-types";

export function MultiChoiceProbe(props: GenericProbeComponentProps) {
  const options = getProbeOptions(props.probe);
  const selected = new Set(props.draft.selected_option_ids ?? []);

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
        <legend style={{ marginBottom: "0.35rem" }}>Choose all that fit</legend>

        {options.length > 0 ? (
          options.map((option) => {
            const checked = selected.has(option.id);

            return (
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
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selected);

                    if (checked) {
                      next.delete(option.id);
                    } else {
                      next.add(option.id);
                    }

                    props.onDraftChange({
                      ...props.draft,
                      attempt_type: "multi_choice",
                      selected_option_ids: [...next],
                    });
                  }}
                />
                <span>
                  <strong>{option.label}</strong>
                  <br />
                  {option.text}
                </span>
              </label>
            );
          })
        ) : (
          <p>No options were supplied in renderer_params.options.</p>
        )}
      </fieldset>
    </ProbeShell>
  );
}

