"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";

export function GraphProbe(props: GenericProbeComponentProps) {
  const value = (props.draft.graph_features ?? []).join("\n");

  return (
    <ProbeShell {...props}>
      <label style={{ display: "grid", gap: "0.5rem" }}>
        <span>Graph features you notice</span>
        <textarea
          disabled={props.disabled}
          rows={6}
          value={value}
          placeholder={"One feature per line, like:\nincreases at first\nlevels off\nstarts at zero"}
          onChange={(event) =>
            props.onDraftChange({
              ...props.draft,
              attempt_type: "graph",
              graph_features: event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: "12px",
            padding: "0.75rem",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
          }}
        />
      </label>
    </ProbeShell>
  );
}

