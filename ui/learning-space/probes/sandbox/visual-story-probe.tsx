"use client";

import { VideoExplanationProbe } from "../video-explanation-probe";

export const VisualStoryProbe = VideoExplanationProbe;

export function hasVisualStoryContract(_probe: unknown) {
  return false;
}