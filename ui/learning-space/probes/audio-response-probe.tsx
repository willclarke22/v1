"use client";

import { TextProbe } from "./text-probe";
import type { GenericProbeComponentProps } from "./probe-ui-types";

export function AudioResponseProbe(props: GenericProbeComponentProps) {
  return (
    <TextProbe
      {...props}
      draft={{
        ...props.draft,
        attempt_type: "audio_response",
      }}
    />
  );
}

