"use client";

import { useMemo, useState, type DragEvent } from "react";
import { ProbeShell } from "./probe-shell";
import type {
  GenericProbeComponentProps,
  ProbeItem,
  ProbePlacementTarget,
} from "./probe-ui-types";
import {
  getProbeItems,
  getProbePlacementTargets,
} from "./probe-ui-types";

function getTargetItems(args: {
  items: ProbeItem[];
  placements: Record<string, string>;
  targetId: string;
}) {
  return args.items.filter((item) => args.placements[item.id] === args.targetId);
}

function getUnplacedItems(args: {
  items: ProbeItem[];
  placements: Record<string, string>;
}) {
  return args.items.filter((item) => !args.placements[item.id]);
}

function updatePlacement(args: {
  props: GenericProbeComponentProps;
  itemId: string;
  targetId: string;
}) {
  const placements = args.props.draft.placements ?? {};

  args.props.onDraftChange({
    ...args.props.draft,
    attempt_type: "drag_drop_placements",
    placements: {
      ...placements,
      [args.itemId]: args.targetId,
    },
  });
}

function removePlacement(props: GenericProbeComponentProps, itemId: string) {
  const placements = { ...(props.draft.placements ?? {}) };
  delete placements[itemId];

  props.onDraftChange({
    ...props.draft,
    attempt_type: "drag_drop_placements",
    placements,
  });
}

function stringHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getItemGlyph(item: ProbeItem) {
  const text = `${item.id} ${item.text}`.toLowerCase();

  if (text.includes("cause")) return "↯";
  if (text.includes("effect") || text.includes("result")) return "→";
  if (text.includes("evidence")) return "◈";
  if (text.includes("claim")) return "◆";
  if (text.includes("start") || text.includes("first")) return "1";
  if (text.includes("energy")) return "⚡";
  if (text.includes("light")) return "☼";
  if (text.includes("sound") || text.includes("audio")) return "♪";
  if (text.includes("graph") || text.includes("slope")) return "⌁";
  if (text.includes("role") || text.includes("actor")) return "◎";
  if (text.includes("step")) return "⇢";

  const glyphs = ["✦", "●", "◆", "▲", "◐", "◇", "✺", "✧"];
  return glyphs[stringHash(item.id || item.text) % glyphs.length];
}

function DraggableIcon({
  item,
  disabled,
  active,
  compact,
  placed,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  item: ProbeItem;
  disabled?: boolean;
  active?: boolean;
  compact?: boolean;
  placed?: boolean;
  onRemove?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      title={item.text}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: compact ? "auto 1fr" : "auto 1fr auto",
        gap: compact ? "0.55rem" : "0.7rem",
        alignItems: "center",
        minHeight: compact ? "3.25rem" : "4.25rem",
        border: active
          ? "1px solid rgba(255,255,255,0.58)"
          : placed
            ? "1px solid rgba(221,214,254,0.26)"
            : "1px solid rgba(255,255,255,0.14)",
        borderRadius: compact ? "18px" : "24px",
        padding: compact ? "0.54rem 0.62rem" : "0.72rem 0.8rem",
        background: active
          ? "radial-gradient(circle at top left, rgba(255,255,255,0.2), transparent 34%), linear-gradient(145deg, rgba(124,58,237,0.36), rgba(255,255,255,0.08))"
          : placed
            ? "linear-gradient(145deg, rgba(221,214,254,0.16), rgba(255,255,255,0.055))"
            : "linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.045))",
        boxShadow: active
          ? "0 0 0 5px rgba(221,214,254,0.08), 0 22px 44px rgba(0,0,0,0.24)"
          : placed
            ? "0 12px 28px rgba(76,29,149,0.18)"
            : "inset 0 1px 0 rgba(255,255,255,0.055)",
        cursor: disabled ? "not-allowed" : "grab",
        opacity: disabled ? 0.55 : 1,
        transform: active ? "translateY(-2px) scale(1.015)" : "translateY(0)",
        transition:
          "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease, transform 140ms ease",
        userSelect: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: compact ? "2.15rem" : "2.75rem",
          height: compact ? "2.15rem" : "2.75rem",
          borderRadius: compact ? "16px" : "20px",
          border: "1px solid rgba(255,255,255,0.16)",
          background:
            "radial-gradient(circle at 35% 25%, rgba(255,255,255,0.32), transparent 30%), linear-gradient(145deg, rgba(168,85,247,0.28), rgba(15,23,42,0.28))",
          color: "rgba(255,255,255,0.94)",
          fontSize: compact ? "1rem" : "1.22rem",
          fontWeight: 900,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {getItemGlyph(item)}
      </span>

      <span
        style={{
          minWidth: 0,
          color: "rgba(255,255,255,0.94)",
          fontSize: compact ? "0.82rem" : "0.92rem",
          lineHeight: 1.35,
          fontWeight: 850,
          overflowWrap: "anywhere",
        }}
      >
        {item.text}
      </span>

      {onRemove ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Move ${item.text} back to the tray`}
          style={{
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: "999px",
            background: "rgba(0,0,0,0.18)",
            color: "rgba(255,255,255,0.78)",
            width: "1.8rem",
            height: "1.8rem",
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function TargetZone({
  target,
  items,
  allItems,
  placements,
  props,
  activeDragItemId,
  hoveredTargetId,
  onHoverTarget,
  onDragEnd,
}: {
  target: ProbePlacementTarget;
  items: ProbeItem[];
  allItems: ProbeItem[];
  placements: Record<string, string>;
  props: GenericProbeComponentProps;
  activeDragItemId: string | null;
  hoveredTargetId: string | null;
  onHoverTarget: (targetId: string | null) => void;
  onDragEnd: () => void;
}) {
  const unplacedItems = getUnplacedItems({ items: allItems, placements });
  const isHovering = hoveredTargetId === target.id;
  const isActiveDrop = Boolean(activeDragItemId);

  function placeDraggedItem(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain") || activeDragItemId;
    if (!itemId) return;

    updatePlacement({ props, itemId, targetId: target.id });
    onHoverTarget(null);
    onDragEnd();
  }

  return (
    <div
      onDragEnter={() => onHoverTarget(target.id)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onHoverTarget(target.id);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onHoverTarget(null);
        }
      }}
      onDrop={placeDraggedItem}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: "0.8rem",
        minHeight: "16rem",
        border: isHovering
          ? "1px solid rgba(255,255,255,0.58)"
          : isActiveDrop
            ? "1px solid rgba(221,214,254,0.38)"
            : "1px solid rgba(221,214,254,0.18)",
        borderRadius: "30px",
        padding: "1rem",
        background: isHovering
          ? "radial-gradient(circle at top, rgba(221,214,254,0.18), transparent 42%), linear-gradient(145deg, rgba(124,58,237,0.28), rgba(255,255,255,0.065))"
          : isActiveDrop
            ? "linear-gradient(145deg, rgba(124,58,237,0.21), rgba(255,255,255,0.055))"
            : "linear-gradient(145deg, rgba(88,28,135,0.16), rgba(255,255,255,0.042))",
        boxShadow: isHovering
          ? "0 0 0 5px rgba(221,214,254,0.08), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "inset 0 1px 0 rgba(255,255,255,0.055)",
        transition: "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease",
      }}
    >
      <div>
        <p style={{ margin: 0, color: "white", fontWeight: 950, fontSize: "1rem" }}>
          {target.label}
        </p>
        <p
          style={{
            margin: "0.28rem 0 0",
            color: "rgba(255,255,255,0.62)",
            fontSize: "0.76rem",
            lineHeight: 1.4,
          }}
        >
          Drop icons here.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: "0.65rem",
          alignContent: "start",
          minHeight: "7rem",
          border: items.length > 0
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px dashed rgba(255,255,255,0.2)",
          borderRadius: "24px",
          padding: "0.75rem",
          background: items.length > 0 ? "rgba(0,0,0,0.13)" : "rgba(0,0,0,0.1)",
        }}
      >
        {items.length > 0 ? (
          items.map((item) => (
            <DraggableIcon
              key={item.id}
              item={item}
              disabled={props.disabled}
              compact
              placed
              active={activeDragItemId === item.id}
              onRemove={() => removePlacement(props, item.id)}
              onDragStart={() => null}
              onDragEnd={onDragEnd}
            />
          ))
        ) : (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              minHeight: "5rem",
              color: "rgba(255,255,255,0.48)",
              fontSize: "0.84rem",
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            {isActiveDrop ? "Release to place" : "No icons placed yet"}
          </div>
        )}
      </div>

      {unplacedItems.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.42rem" }}>
          {unplacedItems.map((item) => (
            <button
              key={`${target.id}-${item.id}`}
              type="button"
              disabled={props.disabled}
              onClick={() =>
                updatePlacement({ props, itemId: item.id, targetId: target.id })
              }
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.82)",
                padding: "0.36rem 0.58rem",
                fontSize: "0.74rem",
                cursor: props.disabled ? "not-allowed" : "pointer",
              }}
            >
              + {getItemGlyph(item)} {item.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DragDropProbe(props: GenericProbeComponentProps) {
  const items = getProbeItems(props.probe);
  const targets = getProbePlacementTargets(props.probe);
  const placements = props.draft.placements ?? {};
  const unplacedItems = getUnplacedItems({ items, placements });
  const placedCount = items.length - unplacedItems.length;
  const [activeDragItemId, setActiveDragItemId] = useState<string | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

  const completion = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.round((placedCount / items.length) * 100);
  }, [items.length, placedCount]);

  return (
    <ProbeShell {...props}>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "end",
          }}
        >
          <div>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>
              Drag each icon to the place where it belongs.
            </p>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.84rem",
                lineHeight: 1.5,
              }}
            >
              Icons snap into drop fields. Tap the shortcut buttons if dragging feels awkward.
            </p>
          </div>

          <span
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "999px",
              padding: "0.38rem 0.68rem",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.78)",
              fontSize: "0.76rem",
              whiteSpace: "nowrap",
            }}
          >
            {placedCount}/{items.length} placed · {completion}%
          </span>
        </div>

        {items.length > 0 && targets.length > 0 ? (
          <>
            <div
              style={{
                display: "grid",
                gap: "0.8rem",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "28px",
                padding: "1rem",
                background:
                  "radial-gradient(circle at top left, rgba(221,214,254,0.08), transparent 28%), rgba(0,0,0,0.14)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.78)",
                  fontSize: "0.78rem",
                  fontWeight: 950,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Icon tray
              </p>

              {unplacedItems.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: "0.72rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
                  }}
                >
                  {unplacedItems.map((item) => (
                    <DraggableIcon
                      key={item.id}
                      item={item}
                      disabled={props.disabled}
                      active={activeDragItemId === item.id}
                      onDragStart={() => setActiveDragItemId(item.id)}
                      onDragEnd={() => {
                        setActiveDragItemId(null);
                        setHoveredTargetId(null);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    minHeight: "4.4rem",
                    border: "1px dashed rgba(255,255,255,0.16)",
                    borderRadius: "22px",
                    color: "rgba(255,255,255,0.58)",
                  }}
                >
                  Every icon has been placed.
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.9rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
              }}
            >
              {targets.map((target) => (
                <TargetZone
                  key={target.id}
                  target={target}
                  items={getTargetItems({ items, placements, targetId: target.id })}
                  allItems={items}
                  placements={placements}
                  props={props}
                  activeDragItemId={activeDragItemId}
                  hoveredTargetId={hoveredTargetId}
                  onHoverTarget={setHoveredTargetId}
                  onDragEnd={() => {
                    setActiveDragItemId(null);
                    setHoveredTargetId(null);
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: "rgba(255,255,255,0.72)" }}>
            This probe needs renderer_params.items and renderer_params.placement_targets.
          </p>
        )}
      </div>
    </ProbeShell>
  );
}
