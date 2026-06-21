"use client";

import { useEffect } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeItems } from "./probe-ui-types";

function moveItem(ids: string[], fromIndex: number, toIndex: number): string[] {
  const next = [...ids];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function ensureOrder(items: ReturnType<typeof getProbeItems>, orderedIds?: string[]) {
  const validIds = new Set(items.map((item) => item.id));
  const existing = (orderedIds ?? []).filter((id) => validIds.has(id));
  const missing = items.map((item) => item.id).filter((id) => !existing.includes(id));

  return [...existing, ...missing];
}

export function SequenceProbe(props: GenericProbeComponentProps) {
  const items = getProbeItems(props.probe);
  const currentOrder = ensureOrder(items, props.draft.ordered_item_ids);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const draftOrderKey = (props.draft.ordered_item_ids ?? []).join("|");
  const currentOrderKey = currentOrder.join("|");

  function setOrder(nextOrder: string[]) {
    props.onDraftChange({
      ...props.draft,
      attempt_type: "ordered_items",
      ordered_item_ids: nextOrder,
    });
  }

  useEffect(() => {
    if (items.length > 0 && currentOrderKey !== draftOrderKey) {
      setOrder(currentOrder);
    }
  }, [currentOrderKey, draftOrderKey, items.length]);

  return (
    <ProbeShell {...props}>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <p
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.92)",
              fontWeight: 800,
            }}
          >
            Arrange the steps.
          </p>
          <p
            style={{
              margin: "0.35rem 0 0",
              color: "rgba(255,255,255,0.66)",
              fontSize: "0.84rem",
              lineHeight: 1.5,
            }}
          >
            Move the cards until the order matches how you think the idea works.
          </p>
        </div>

        {currentOrder.length > 0 ? (
          <div style={{ display: "grid", gap: "0.68rem" }}>
            {currentOrder.map((itemId, index) => {
              const item = itemById.get(itemId);

              return (
                <div
                  key={itemId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0,1fr) auto",
                    gap: "0.78rem",
                    alignItems: "center",
                    padding: "0.82rem",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "22px",
                    background:
                      "linear-gradient(145deg, rgba(255,255,255,0.085), rgba(255,255,255,0.04))",
                    boxShadow: "0 12px 28px rgba(0,0,0,0.13)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-grid",
                      placeItems: "center",
                      width: "2.15rem",
                      height: "2.15rem",
                      borderRadius: "999px",
                      border: "1px solid rgba(221,214,254,0.24)",
                      background: "rgba(221,214,254,0.11)",
                      color: "rgba(255,255,255,0.92)",
                      fontSize: "0.82rem",
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </span>

                  <p
                    style={{
                      margin: 0,
                      color: "rgba(255,255,255,0.94)",
                      fontSize: "0.93rem",
                      lineHeight: 1.45,
                      fontWeight: 750,
                    }}
                  >
                    {item?.text ?? itemId}
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.42rem",
                    }}
                  >
                    <button
                      type="button"
                      disabled={props.disabled || index === 0}
                      onClick={() => setOrder(moveItem(currentOrder, index, index - 1))}
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.07)",
                        color: "white",
                        padding: "0.45rem 0.58rem",
                        cursor:
                          props.disabled || index === 0 ? "not-allowed" : "pointer",
                        opacity: props.disabled || index === 0 ? 0.45 : 1,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={props.disabled || index === currentOrder.length - 1}
                      onClick={() => setOrder(moveItem(currentOrder, index, index + 1))}
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.07)",
                        color: "white",
                        padding: "0.45rem 0.58rem",
                        cursor:
                          props.disabled || index === currentOrder.length - 1
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          props.disabled || index === currentOrder.length - 1
                            ? 0.45
                            : 1,
                      }}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, color: "rgba(255,255,255,0.72)" }}>
            No sequence items were supplied in renderer_params.items.
          </p>
        )}
      </div>
    </ProbeShell>
  );
}
