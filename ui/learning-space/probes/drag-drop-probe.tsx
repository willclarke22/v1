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
import {
  ProbeButton,
  ProbeEmptyState,
  ProbeMiniLabel,
  ProbeOptionCard,
  ProbePill,
  ProbeStack,
} from "./shared";

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

function getItemLabel(index: number) {
  return String.fromCharCode(65 + (index % 26));
}

function ItemCard({
  item,
  label,
  disabled,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  item: ProbeItem;
  label: string;
  disabled?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <ProbeOptionCard
        selected={selected}
        disabled={disabled}
        label={label}
        onClick={onSelect}
      >
        {item.text}
      </ProbeOptionCard>
    </div>
  );
}

function BucketCard({
  target,
  label,
  items,
  selectedItem,
  activeDragItemId,
  disabled,
  props,
  onPlaced,
  onHover,
  isHovering,
}: {
  target: ProbePlacementTarget;
  label: string;
  items: ProbeItem[];
  selectedItem: ProbeItem | null;
  activeDragItemId: string | null;
  disabled?: boolean;
  props: GenericProbeComponentProps;
  onPlaced: () => void;
  onHover: (targetId: string | null) => void;
  isHovering: boolean;
}) {
  const isReady = Boolean(selectedItem || activeDragItemId);

  function placeItem(itemId: string) {
    updatePlacement({ props, itemId, targetId: target.id });
    onPlaced();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain") || activeDragItemId;
    if (!itemId) return;
    placeItem(itemId);
  }

  return (
    <div
      onClick={() => {
        if (disabled || !selectedItem) return;
        placeItem(selectedItem.id);
      }}
      onDragEnter={() => onHover(target.id)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onHover(target.id);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onHover(null);
        }
      }}
      onDrop={handleDrop}
      style={{
        display: "grid",
        gap: "0.8rem",
        alignContent: "start",
        minHeight: "9.25rem",
        border: isHovering || selectedItem
          ? "1px solid rgba(221,214,254,0.58)"
          : "1px solid rgba(255,255,255,0.12)",
        borderRadius: "24px",
        padding: "0.9rem",
        background: isHovering || selectedItem
          ? "radial-gradient(circle at top left, rgba(221,214,254,0.16), transparent 38%), rgba(255,255,255,0.065)"
          : "rgba(255,255,255,0.045)",
        cursor: selectedItem && !disabled ? "pointer" : "default",
        transition: "border-color 140ms ease, background 140ms ease, transform 140ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: "2rem",
            height: "2rem",
            borderRadius: "999px",
            background: "rgba(221,214,254,0.13)",
            border: "1px solid rgba(221,214,254,0.18)",
            color: "white",
            fontSize: "0.78rem",
            fontWeight: 950,
          }}
        >
          {label}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, color: "white", fontWeight: 900 }}>{target.label}</p>
          <p
            style={{
              margin: "0.22rem 0 0",
              color: "rgba(255,255,255,0.56)",
              fontSize: "0.76rem",
              lineHeight: 1.4,
            }}
          >
            {isReady ? "Release or tap to connect." : "Drop matching items here."}
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.7rem",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "16px",
                padding: "0.55rem 0.65rem",
                background: "rgba(0,0,0,0.16)",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.84rem", lineHeight: 1.35 }}>
                {item.text}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  removePlacement(props, item.id);
                }}
                aria-label={`Move ${item.text} back to items`}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.055)",
                  color: "rgba(255,255,255,0.72)",
                  width: "1.65rem",
                  height: "1.65rem",
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "3.6rem",
            border: "1px dashed rgba(255,255,255,0.14)",
            borderRadius: "16px",
            color: "rgba(255,255,255,0.46)",
            fontSize: "0.82rem",
          }}
        >
          Empty
        </div>
      )}
    </div>
  );
}

export function DragDropProbe(props: GenericProbeComponentProps) {
  const items = getProbeItems(props.probe);
  const targets = getProbePlacementTargets(props.probe);
  const placements = props.draft.placements ?? {};
  const unplacedItems = getUnplacedItems({ items, placements });
  const placedCount = items.length - unplacedItems.length;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeDragItemId, setActiveDragItemId] = useState<string | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => unplacedItems.find((item) => item.id === selectedItemId) ?? null,
    [selectedItemId, unplacedItems],
  );

  function clearActiveState() {
    setSelectedItemId(null);
    setActiveDragItemId(null);
    setHoveredTargetId(null);
  }

  return (
    <ProbeShell {...props}>
      <ProbeStack gap="1rem">
        <div
          style={{
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <ProbeMiniLabel>Match items to buckets</ProbeMiniLabel>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.84rem",
                lineHeight: 1.5,
              }}
            >
              Drag an item into a bucket, or tap an item and then tap its bucket.
            </p>
          </div>

          <ProbePill tone={placedCount === items.length && items.length > 0 ? "success" : "purple"} active>
            {placedCount}/{items.length} connected
          </ProbePill>
        </div>

        {items.length > 0 && targets.length > 0 ? (
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
              alignItems: "start",
            }}
          >
            <section style={{ display: "grid", gap: "0.65rem" }}>
              <ProbeMiniLabel>Items</ProbeMiniLabel>
              {unplacedItems.length > 0 ? (
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  {unplacedItems.map((item, index) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      label={getItemLabel(index)}
                      disabled={props.disabled}
                      selected={selectedItemId === item.id || activeDragItemId === item.id}
                      onSelect={() => setSelectedItemId(selectedItemId === item.id ? null : item.id)}
                      onDragStart={() => {
                        setActiveDragItemId(item.id);
                        setSelectedItemId(null);
                      }}
                      onDragEnd={() => {
                        setActiveDragItemId(null);
                        setHoveredTargetId(null);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <ProbeEmptyState title="All items are connected." body="Use the × on a bucket item to move it back." />
              )}
            </section>

            <section style={{ display: "grid", gap: "0.65rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                <ProbeMiniLabel>Buckets</ProbeMiniLabel>
                {selectedItem ? (
                  <ProbeButton variant="ghost" disabled={props.disabled} onClick={() => setSelectedItemId(null)}>
                    Cancel selection
                  </ProbeButton>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: "0.65rem" }}>
                {targets.map((target, index) => (
                  <BucketCard
                    key={target.id}
                    target={target}
                    label={String(index + 1)}
                    items={getTargetItems({ items, placements, targetId: target.id })}
                    selectedItem={selectedItem}
                    activeDragItemId={activeDragItemId}
                    disabled={props.disabled}
                    props={props}
                    onPlaced={clearActiveState}
                    onHover={setHoveredTargetId}
                    isHovering={hoveredTargetId === target.id}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : (
          <ProbeEmptyState
            title="This drag/drop probe needs items and buckets."
            body="Add renderer_params.items and renderer_params.placement_targets to preview this template."
          />
        )}
      </ProbeStack>
    </ProbeShell>
  );
}
