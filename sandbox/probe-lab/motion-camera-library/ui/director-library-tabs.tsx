"use client";

import type { CSSProperties } from "react";

export type DirectorLibraryTab = "capabilities" | "qualification";

export function DirectorLibraryTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: DirectorLibraryTab;
  onTabChange: (tab: DirectorLibraryTab) => void;
}) {
  return (
    <nav style={tabBarStyle} aria-label="Director Capability Library sections">
      <button
        type="button"
        onClick={() => onTabChange("capabilities")}
        style={{
          ...tabStyle,
          ...(activeTab === "capabilities" ? activeTabStyle : null),
        }}
      >
        Capabilities
      </button>
      <button
        type="button"
        onClick={() => onTabChange("qualification")}
        style={{
          ...tabStyle,
          ...(activeTab === "qualification" ? activeTabStyle : null),
        }}
      >
        Qualification Room
      </button>
    </nav>
  );
}

const tabBarStyle: CSSProperties = {
  display: "inline-flex",
  gap: 4,
  padding: 4,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.82)",
};

const tabStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid transparent",
  background: "transparent",
  color: "rgba(226,232,240,0.68)",
  padding: "8px 11px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 850,
};

const activeTabStyle: CSSProperties = {
  border: "1px solid transparent",
  background: "rgba(8,145,178,0.28)",
  color: "#ecfeff",
  boxShadow: "inset 0 0 0 1px rgba(56,189,248,0.34)",
};
