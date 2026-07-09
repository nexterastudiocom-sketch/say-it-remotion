import { interpolate, spring } from 'remotion';

/** Gentle fade + rise used for slide content entrances. */
export const fadeUp = (frame: number, fps: number, delay = 0, rise = 46) => {
  const p = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });
  return {
    opacity: interpolate(p, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(p, [0, 1], [rise, 0])}px)`,
  } as const;
};
