import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeUp } from '../anim';
import { RecapSlide as RecapSlideData } from '../types';

/** Recap — the lesson's words in a two-column word/translation grid. */
export const RecapSlide: React.FC<{ slide: RecapSlideData }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <div className="content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span className="eyebrow" style={{ marginBottom: 48, ...fadeUp(frame, fps) }}>
          {slide.eyebrow}
        </span>
        <div className="card pad" style={{ padding: '56px 96px', ...fadeUp(frame, fps, 6) }}>
          <div className="recap-grid">
            {slide.items.map((it, i) => (
              <div className="item" key={i}>
                <span className="check sm tint" />
                <span className="w">{it.word}</span>
                <span className="t">{it.translation}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
