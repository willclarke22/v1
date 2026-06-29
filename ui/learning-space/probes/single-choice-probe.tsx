"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeOptions } from "./probe-ui-types";
import { ProbeEmptyState, ProbeMiniLabel, ProbeOptionCard, ProbeStack } from "./shared";

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
          gap: "0.8rem",
        }}
      >
        <legend style={{ marginBottom: "0.15rem" }}>
          <ProbeMiniLabel>Choose the idea that fits best</ProbeMiniLabel>
        </legend>

        {options.length > 0 ? (
          <ProbeStack gap="0.72rem">
            {options.map((option) => {
              const checked = props.draft.selected_option_id === option.id;

              return (
                <ProbeOptionCard
                  key={option.id}
                  selected={checked}
                  disabled={props.disabled}
                  label={option.label}
                  input={
                    <input
                      type="radio"
                      name={`single-choice-probe-${props.probe.prompt.task}`}
                      checked={checked}
                      onChange={() =>
                        props.onDraftChange({
                          ...props.draft,
                          attempt_type: "single_choice",
                          selected_option_id: option.id,
                        })
                      }
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
            body="This probe needs renderer_params.options before it can render as a choice probe."
          />
        )}
      </fieldset>
    </ProbeShell>
  );
}
