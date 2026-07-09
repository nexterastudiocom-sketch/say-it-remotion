import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/** Big-font phase announcement that flashes in briefly on each phase change. */
export const PhaseTitle: React.FC<{ phase: string; frames: number }> = ({ phase, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 16 }, durationInFrames: 10 });
  const exit = interpolate(frame, [frames - 10, frames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const op = Math.min(enter, exit);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 8 }}>
      <div
        style={{
          fontFamily: 'var(--head)',
          fontWeight: 700,
          fontSize: 300,
          letterSpacing: '.02em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          opacity: op * 0.16,
          transform: `scale(${0.86 + enter * 0.14})`,
        }}
      >
        {phase}
      </div>
    </AbsoluteFill>
  );
};
