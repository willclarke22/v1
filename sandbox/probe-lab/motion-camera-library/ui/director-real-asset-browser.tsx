"use client";

import { Html } from "@react-three/drei";
import { Component, type ErrorInfo, type ReactNode } from "react";

export type DirectorBrowserAssetRef = {
  asset_id: string;
  public_path: string;
  display_name?: string | null;
  canonical_label?: string | null;
};

/**
 * Browser real-asset proofs must not fetch remote R2 model URLs directly.
 * Remote reviewed assets are requested through a same-origin, asset-id scoped
 * model route. Local/public MyWay paths remain direct so existing local labs
 * keep their normal browser behavior.
 */
export function directorRealAssetBrowserUrl(asset: DirectorBrowserAssetRef) {
  const publicPath = asset.public_path.trim();
  if (/^https:\/\//i.test(publicPath)) {
    return `/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=${encodeURIComponent(asset.asset_id)}`;
  }
  return publicPath;
}

type LoadBoundaryProps = {
  resetKey: string;
  assetLabel: string;
  fallback: ReactNode;
  children: ReactNode;
};

type LoadBoundaryState = {
  error: Error | null;
};

/**
 * A broken or temporarily unreachable reviewed model must not crash the whole
 * Director Capability Library. Keep the proof surface alive, show its
 * controlled fallback, and make the failed real-asset load visible.
 */
export class DirectorRealAssetLoadBoundary extends Component<
  LoadBoundaryProps,
  LoadBoundaryState
> {
  state: LoadBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LoadBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[Director real-asset proof] ${this.props.assetLabel} could not be loaded; using the controlled fallback.`,
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(previousProps: LoadBoundaryProps) {
    if (
      previousProps.resetKey !== this.props.resetKey &&
      this.state.error
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <>
        {this.props.fallback}
        <Html position={[0, 1.35, 0]} center distanceFactor={7}>
          <div
            style={{
              maxWidth: 240,
              borderRadius: 12,
              border: "1px solid rgba(251,146,60,0.45)",
              background: "rgba(30,11,4,0.94)",
              color: "#fed7aa",
              padding: "7px 9px",
              fontSize: 10,
              fontWeight: 750,
              lineHeight: 1.35,
              textAlign: "center",
            }}
          >
            {this.props.assetLabel} could not be loaded. Controlled fallback shown.
          </div>
        </Html>
      </>
    );
  }
}
