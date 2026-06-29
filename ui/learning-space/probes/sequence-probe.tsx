"use client";

import { useEffect, useState } from "react";
import { ProbeShell } from "./probe-shell";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeItems } from "./probe-ui-types";
import {
  ProbeButton,
  ProbeEmptyState,
  ProbeMiniLabel,
  ProbePill,
  ProbeProgressBar,
  ProbeStack,
} from "./shared";

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
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const completion = items.length > 0 ? Math.round((currentOrder.length / items.length) * 100) : 0;

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
    // Keep order in sync with renderer params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrderKey, draftOrderKey, items.length]);

  return (
    <ProbeShell {...props}>
      <ProbeStack gap="1rem">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <div>
            <ProbeMiniLabel>Order the steps</ProbeMiniLabel>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.84rem",
                lineHeight: 1.5,
              }}
            >
              Drag cards into order, or use the arrow buttons for precise control.
            </p>
          </div>
          <ProbePill tone={items.length > 0 ? "success" : "default"}>
            {currentOrder.length}/{items.length} steps
          </ProbePill>
        </div>

        <ProbeProgressBar value={completion} label="Sequence readiness" />

        {currentOrder.length > 0 ? (
          <div style={{ display: "grid", gap: "0.72rem" }}>
            {currentOrder.map((itemId, index) => {
              const item = itemById.get(itemId);
              const active = draggedId === itemId;

              return (
                <div
                  key={itemId}
                  draggable={!props.disabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", itemId);
                    setDraggedId(itemId);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromId = event.dataTransfer.getData("text/plain") || draggedId;
                    if (!fromId) return;
                    const fromIndex = currentOrder.indexOf(fromId);
                    if (fromIndex < 0 || fromIndex === index) return;
                    setOrder(moveItem(currentOrder, fromIndex, index));
                    setDraggedId(null);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0,1fr) auto",
                    gap: "0.78rem",
                    alignItems: "center",
                    padding: "0.86rem",
                    border: active
                      ? "1px solid rgba(221,214,254,0.58)"
                      : "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "24px",
                    background: active
                      ? "radial-gradient(circle at top left, rgba(221,214,254,0.18), transparent 35%), linear-gradient(145deg, rgba(124,58,237,0.26), rgba(255,255,255,0.07))"
                      : "linear-gradient(145deg, rgba(255,255,255,0.085), rgba(255,255,255,0.04))",
                    boxShadow: active
                      ? "0 18px 42px rgba(76,29,149,0.24)"
                      : "0 12px 28px rgba(0,0,0,0.13)",
                    cursor: props.disabled ? "not-allowed" : "grab",
                    transition: "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease",
                  }}
                >
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: "2.4rem",
                      height: "2.4rem",
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.08)",
                      color: "white",
                      fontWeight: 950,
                    }}
                  >
                    {index + 1}
                  </span>

                  <span
                    style={{
                      minWidth: 0,
                      color: "rgba(255,255,255,0.92)",
                      fontWeight: 800,
                      lineHeight: 1.45,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item?.text ?? itemId}
                  </span>

                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <ProbeButton
                      variant="ghost"
                      disabled={props.disabled || index === 0}
                      ariaLabel="Move item up"
                      onClick={() => setOrder(moveItem(currentOrder, index, index - 1))}
                      style={{ width: "2.35rem", height: "2.35rem", padding: 0 }}
                    >
                      ↑
                    </ProbeButton>
                    <ProbeButton
                      variant="ghost"
                      disabled={props.disabled || index === currentOrder.length - 1}
                      ariaLabel="Move item down"
                      onClick={() => setOrder(moveItem(currentOrder, index, index + 1))}
                      style={{ width: "2.35rem", height: "2.35rem", padding: 0 }}
                    >
                      ↓
                    </ProbeButton>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ProbeEmptyState
            title="No sequence items yet"
            body="This probe needs renderer_params.items before the order can be shown."
          />
        )}
      </ProbeStack>
    </ProbeShell>
  );
}

