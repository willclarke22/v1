"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { DirectableAssetPairLab } from "./directable-asset-pair-lab";
import { DirectableAssetQualificationLab } from "./directable-asset-qualification-lab";
import { DIRECTOR_CAPABILITY_AUTHORITY_LAYERS } from "../capability-authority-contract";

type DirectableAssetsTab = "qualification" | "interactions";

const CANONICAL_PATH = "/sandbox/probe-lab/directable-assets";

function tabFromLocation(): DirectableAssetsTab {
  if (typeof window === "undefined") return "qualification";
  return new URLSearchParams(window.location.search).get("tab") === "interactions"
    ? "interactions"
    : "qualification";
}

const TAB_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 38,
  padding: "0.55rem 0.85rem",
  borderRadius: 10,
  border: "1px solid transparent",
  fontSize: 13,
  fontWeight: 650,
  textDecoration: "none",
  cursor: "pointer",
  transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
};

export function DirectableAssetsWorkbench() {
  const [activeTab, setActiveTab] = useState<DirectableAssetsTab>("qualification");

  useEffect(() => {
    const syncFromLocation = () => setActiveTab(tabFromLocation());
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  function chooseTab(nextTab: DirectableAssetsTab) {
    const nextUrl =
      nextTab === "interactions"
        ? `${CANONICAL_PATH}?tab=interactions`
        : CANONICAL_PATH;

    if (typeof window !== "undefined") {
      window.history.pushState({}, "", nextUrl);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    setActiveTab(nextTab);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#050816" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(5,8,22,0.94)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div
          style={{
            maxWidth: 1500,
            margin: "0 auto",
            padding: "0.7rem clamp(1rem, 3vw, 2.4rem)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "rgba(255,255,255,0.48)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              Director · Directability
            </div>
            <div style={{ marginTop: 3, color: "white", fontSize: 14, fontWeight: 700 }}>
              Directable Assets
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Directable Assets sections"
            style={{
              display: "inline-flex",
              gap: 5,
              padding: 4,
              borderRadius: 13,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.035)",
            }}
          >
            <a
              href={CANONICAL_PATH}
              role="tab"
              aria-selected={activeTab === "qualification"}
              onClick={(event) => {
                event.preventDefault();
                chooseTab("qualification");
              }}
              style={{
                ...TAB_STYLE,
                color: activeTab === "qualification" ? "#e0f2fe" : "rgba(255,255,255,0.58)",
                borderColor:
                  activeTab === "qualification" ? "rgba(56,189,248,0.3)" : "transparent",
                background:
                  activeTab === "qualification" ? "rgba(14,165,233,0.14)" : "transparent",
              }}
            >
              Asset Qualification
            </a>
            <a
              href={`${CANONICAL_PATH}?tab=interactions`}
              role="tab"
              aria-selected={activeTab === "interactions"}
              onClick={(event) => {
                event.preventDefault();
                chooseTab("interactions");
              }}
              style={{
                ...TAB_STYLE,
                color: activeTab === "interactions" ? "#dcfce7" : "rgba(255,255,255,0.58)",
                borderColor:
                  activeTab === "interactions" ? "rgba(74,222,128,0.28)" : "transparent",
                background:
                  activeTab === "interactions" ? "rgba(34,197,94,0.13)" : "transparent",
              }}
            >
              Asset Interactions
            </a>
          </div>
        </div>
      </div>

      <section
        aria-label="Director capability authority layers"
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: "1rem clamp(1rem, 3vw, 2.4rem) 0",
          color: "white",
        }}
      >
        <div
          style={{
            padding: "0.9rem",
            borderRadius: 16,
            border: "1px solid rgba(125,211,252,0.16)",
            background: "rgba(14,165,233,0.055)",
          }}
        >
          <div style={{ fontSize: 11, color: "#7dd3fc", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Phase 1B.5D · vocabulary authority
          </div>
          <div style={{ marginTop: 5, color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 1.55 }}>
            These layers cooperate but are not synonyms. Director actions describe semantic motion; asset operators qualify evidence; pair interactions qualify two-asset compatibility; Builder placement remains final fit/collision authority.
          </div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
            {DIRECTOR_CAPABILITY_AUTHORITY_LAYERS.map((layer, index) => (
              <div
                key={layer.id}
                style={{
                  padding: "0.72rem",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.075)",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 10 }}>
                  {index + 1} · {layer.id}
                </div>
                <strong style={{ display: "block", marginTop: 3, fontSize: 12 }}>{layer.label}</strong>
                <div style={{ marginTop: 5, color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 1.45 }}>
                  {layer.question}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div role="tabpanel" aria-label={activeTab === "interactions" ? "Asset Interactions" : "Asset Qualification"}>
        {activeTab === "interactions" ? (
          <DirectableAssetPairLab />
        ) : (
          <DirectableAssetQualificationLab />
        )}
      </div>
    </div>
  );
}
