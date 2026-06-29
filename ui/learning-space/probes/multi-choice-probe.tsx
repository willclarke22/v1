"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeOptions } from "./probe-ui-types";
import {
  ProbeEmptyState,
  ProbeMiniLabel,
  ProbeOptionCard,
  ProbePill,
  ProbeStack,
} from "./shared";

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
          gap: "0.8rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <legend>
            <ProbeMiniLabel>Choose every idea that fits</ProbeMiniLabel>
          </legend>
          <ProbePill tone={selected.size > 0 ? "success" : "default"}>
            {selected.size} selected
          </ProbePill>
        </div>

        {options.length > 0 ? (
          <ProbeStack gap="0.72rem">
            {options.map((option) => {
              const checked = selected.has(option.id);

              return (
                <ProbeOptionCard
                  key={option.id}
                  selected={checked}
                  disabled={props.disabled}
                  label={option.label}
                  input={
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
                      style={{
                        marginTop: "0.35rem",
                        accentColor: "#ddd6fe",
                      }}
                    />
                  }
                >
                  {option.text}
                </ProbeOptionCard>
              );
            })}
          </ProbeStack>
        ) : (
          <ProbeEmptyState
            title="No answer options yet"
            body="This probe needs renderer_params.options before it can render as a multi-choice probe."
          />
        )}
      </fieldset>
    </ProbeShell>
  );
}
