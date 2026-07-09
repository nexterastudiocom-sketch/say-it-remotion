import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeUp } from '../anim';
import { ModelSlide as ModelSlideData } from '../types';

/** Model answer reveal — highlighted opening + trailing text + compare note. */
export const ModelSlide: React.FC<{ slide: ModelSlideData }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <div className="content center">
        <span className="eyebrow" style={fadeUp(frame, fps)}>
          {slide.eyebrow}
        </span>
        <div className="card pad" style={{ marginTop: 56, maxWidth: 2700, ...fadeUp(frame, fps, 6) }}>
          <p className="h1" style={{ fontSize: 120 }}>
            <span className="hl">{slide.highlight}</span>
            {slide.rest}
          </p>
          {slide.translationEn && (
            <p className="body muted" style={{ marginTop: 36, fontStyle: 'italic' }}>
              {slide.translationEn}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 56, ...fadeUp(frame, fps, 12) }}>
          <span className="check sm" />
          <p className="body muted">{slide.compareNote}</p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
