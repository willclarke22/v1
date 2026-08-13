import type {
  MotionProgramTrack,
} from "./motion-program-contract";

export type MotionProgramFragment = {
  id: string;
  duration_weight: number;
  tracks: MotionProgramTrack[];
};

function safeWeight(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function cloneTrack(
  track: MotionProgramTrack,
  input: {
    id: string;
    start_progress: number;
    end_progress: number;
    order_offset?: number;
    reverse_progress?: boolean;
  },
): MotionProgramTrack {
  return {
    ...track,
    id: input.id,
    start_progress: input.start_progress,
    end_progress: input.end_progress,
    order: track.order + (input.order_offset ?? 0),
    reverse_progress:
      input.reverse_progress === undefined
        ? track.reverse_progress
        : input.reverse_progress,
  } as MotionProgramTrack;
}

function remapTrack(
  track: MotionProgramTrack,
  windowStart: number,
  windowEnd: number,
  idPrefix: string,
  orderOffset = 0,
) {
  const span = Math.max(0, windowEnd - windowStart);
  return cloneTrack(track, {
    id: `${idPrefix}:${track.id}`,
    start_progress: windowStart + track.start_progress * span,
    end_progress: windowStart + track.end_progress * span,
    order_offset: orderOffset,
  });
}

export function motionFragment(
  id: string,
  tracks: MotionProgramTrack[],
  durationWeight = 1,
): MotionProgramFragment {
  return {
    id,
    duration_weight: safeWeight(durationWeight),
    tracks,
  };
}

export function sequenceMotion(
  id: string,
  fragments: MotionProgramFragment[],
): MotionProgramFragment {
  if (!fragments.length) return motionFragment(id, [], 1);
  const total = fragments.reduce(
    (sum, fragment) => sum + safeWeight(fragment.duration_weight),
    0,
  );
  let cursor = 0;
  const tracks: MotionProgramTrack[] = [];

  fragments.forEach((fragment, fragmentIndex) => {
    const weight = safeWeight(fragment.duration_weight);
    const start = cursor / total;
    cursor += weight;
    const end = cursor / total;
    fragment.tracks.forEach((track) => {
      tracks.push(
        remapTrack(
          track,
          start,
          end,
          `${id}:sequence:${fragmentIndex}`,
          fragmentIndex * 1000,
        ),
      );
    });
  });

  return motionFragment(id, tracks, total);
}

export function parallelMotion(
  id: string,
  fragments: MotionProgramFragment[],
): MotionProgramFragment {
  if (!fragments.length) return motionFragment(id, [], 1);
  const maximum = Math.max(
    ...fragments.map((fragment) => safeWeight(fragment.duration_weight)),
  );
  const tracks: MotionProgramTrack[] = [];

  fragments.forEach((fragment, fragmentIndex) => {
    const end = safeWeight(fragment.duration_weight) / maximum;
    fragment.tracks.forEach((track) => {
      tracks.push(
        remapTrack(
          track,
          0,
          end,
          `${id}:parallel:${fragmentIndex}`,
          fragmentIndex * 1000,
        ),
      );
    });
  });

  return motionFragment(id, tracks, maximum);
}

/** Allocates timeline duration without adding an execution track. */
export function holdMotion(
  id: string,
  durationWeight = 1,
): MotionProgramFragment {
  return motionFragment(id, [], durationWeight);
}

export function repeatMotion(
  id: string,
  fragment: MotionProgramFragment,
  count: number,
): MotionProgramFragment {
  const repetitions = Math.max(1, Math.floor(count));
  return sequenceMotion(
    id,
    Array.from({ length: repetitions }, (_, index) => ({
      ...fragment,
      id: `${fragment.id}:repeat:${index}`,
      tracks: fragment.tracks.map((track) => ({
        ...track,
        id: `${track.id}:repeat:${index}`,
      })) as MotionProgramTrack[],
    })),
  );
}

export function reverseMotion(
  id: string,
  fragment: MotionProgramFragment,
): MotionProgramFragment {
  return motionFragment(
    id,
    fragment.tracks.map((track, index) =>
      cloneTrack(track, {
        id: `${id}:reverse:${index}:${track.id}`,
        start_progress: 1 - track.end_progress,
        end_progress: 1 - track.start_progress,
        order_offset: (fragment.tracks.length - index) * 1000,
        reverse_progress: !track.reverse_progress,
      }),
    ),
    fragment.duration_weight,
  );
}
