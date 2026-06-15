"use client";

import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeItems } from "./probe-ui-types";

function moveItem(ids: string[], fromIndex: number, toIndex: number): string[] {
  const next = [...ids];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function SequenceProbe(props: GenericProbeComponentProps) {
  const items = getProbeItems(props.probe);
  const currentOrder =
    props.draft.ordered_item_ids && props.draft.ordered_item_ids.length > 0
      ? props.draft.ordered_item_ids
      : items.map((item) => item.id);

  const itemById = new Map(items.map((item) => [item.id, item]));

  return (
    <ProbeShell {...props}>
      <div style={{ display: "grid", gap: "0.6rem" }}>
        <p style={{ margin: 0, opacity: 0.78 }}>Put these in order.</p>

        {currentOrder.length > 0 ? (
          currentOrder.map((itemId, index) => {
            const item = itemById.get(itemId);

            return (
              <div
                key={itemId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.75rem",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "12px",
                }}
              >
                <span>
                  {index + 1}. {item?.text ?? itemId}
                </span>
                <button
                  type="button"
                  disabled={props.disabled || index === 0}
                  onClick={() =>
                    props.onDraftChange({
                      ...props.draft,
                      attempt_type: "ordered_items",
                      ordered_item_ids: moveItem(currentOrder, index, index - 1),
                    })
                  }
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={props.disabled || index === currentOrder.length - 1}
                  onClick={() =>
                    props.onDraftChange({
                      ...props.draft,
                      attempt_type: "ordered_items",
                      ordered_item_ids: moveItem(currentOrder, index, index + 1),
                    })
                  }
                >
                  Down
                </button>
              </div>
            );
          })
        ) : (
          <p>No sequence items were supplied in renderer_params.items.</p>
        )}
      </div>
    </ProbeShell>
  );
}

