"use client";

import { ProbeShell } from "./probe-shell";
import { SingleChoiceProbe } from "./single-choice-probe";
import { TextProbe } from "./text-probe";
import type { GenericProbeComponentProps } from "./probe-ui-types";
import { getProbeOptions } from "./probe-ui-types";

export function AudioClipProbe(props: GenericProbeComponentProps) {
  const audio = props.probe.renderer_params?.audio;
  const hasOptions = getProbeOptions(props.probe).length > 0;

  const media = (
    <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.75rem" }}>
      {audio?.audio_url ? <audio controls src={audio.audio_url} /> : null}
      {audio?.transcript ? (
        <details>
          <summary>Transcript</summary>
          <p>{audio.transcript}</p>
        </details>
      ) : null}
      {!audio?.audio_url && !audio?.transcript ? (
        <p>No audio metadata was supplied in renderer_params.audio.</p>
      ) : null}
    </div>
  );

  if (hasOptions) {
    return (
      <div>
        {media}
        <SingleChoiceProbe {...props} />
      </div>
    );
  }

  return (
    <ProbeShell {...props}>
      {media}
      <TextProbe {...props} />
    </ProbeShell>
  );
}

