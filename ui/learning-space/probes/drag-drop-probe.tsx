"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import {
  getProbeItems,
  getProbePlacementTargets,
} from "./probe-ui-types";

export function DragDropProbe(props: GenericProbeComponentProps) {
  const items = getProbeItems(props.probe);
  const targets = getProbePlacementTargets(props.probe);
  const placements = props.draft.placements ?? {};

  return (
    <ProbeShell {...props}>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <p style={{ margin: 0, opacity: 0.78 }}>
          Generic first version: place each item into a target bucket.
        </p>

        {items.length > 0 && targets.length > 0 ? (
          items.map((item) => (
            <label
              key={item.id}
              style={{
                display: "grid",
                gap: "0.35rem",
                padding: "0.75rem",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "12px",
              }}
            >
              <span>{item.text}</span>
              <select
                disabled={props.disabled}
                value={placements[item.id] ?? ""}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    attempt_type: "drag_drop_placements",
                    placements: {
                      ...placements,
                      [item.id]: event.target.value,
                    },
                  })
                }
              >
                <option value="">Choose a bucket</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
          ))
        ) : (
          <p>
            This probe needs renderer_params.items and
            renderer_params.placement_targets.
          </p>
        )}
      </div>
    </ProbeShell>
  );
}

