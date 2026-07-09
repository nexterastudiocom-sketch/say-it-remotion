import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { YourTurnSlide as YourTurnSlideData } from '../types';

/** Your turn — write-a-sentence prompt with a live countdown ring. */
export const YourTurnSlide: React.FC<{ slide: YourTurnSlideData }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = Math.max(1, slide.seconds * fps);
  const p = Math.max(0.001, 1 - Math.min(1, frame / totalFrames)); // ring sweep 1 → 0
  const secondsLeft = Math.max(0, Math.ceil(slide.seconds - frame / fps));

  return (
    <AbsoluteFill>
      <div
        className="content"
        style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 120, alignItems: 'start' }}
      >
        {/* pushed down so the "À toi !" heading clears the top-left phase badge */}
        <div style={{ marginTop: 150 }}>
          <span className="eyebrow accent-text" style={{ color: 'var(--accent)' }}>
            {slide.cue}
          </span>
          <p className="h2" style={{ color: 'var(--ink)', fontWeight: 700, marginTop: 36, maxWidth: 1900 }}>
            {slide.prompt}
          </p>
          <p className="body" style={{ marginTop: 28, maxWidth: 1900 }}>
            {slide.sub}
          </p>
          <div className="write-area" style={{ marginTop: 64, height: 560, width: 2000 }} />
        </div>
        <div className="ring" style={{ ['--p' as string]: p, ['--sz' as string]: '380px' }}>
          <div className="hole" style={{ fontSize: 170 }}>
            {secondsLeft}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
