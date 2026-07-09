import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeUp } from '../anim';
import { BuildUpSlide as BuildUpSlideData } from '../types';

/**
 * Sentence-builder bar. The sentence grows one chunk at a time: each step reveals
 * more word-chips into the bar, with the newly-added (or swapped) words snapping
 * in highlighted. On the final step the bar gives a soft gold pulse.
 */
export const BuildUpSlide: React.FC<{ slide: BuildUpSlideData }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = Math.max(1, slide.durationInSeconds * fps);
  const progress = Math.min(0.999, frame / totalFrames);
  const active = Math.min(slide.steps.length - 1, Math.floor(progress * slide.steps.length));
  const stepStart = (active / slide.steps.length) * totalFrames;

  const words = slide.steps[active].base.split(/\s+/).filter(Boolean);
  const prevCount = active > 0 ? slide.steps[active - 1].base.split(/\s+/).filter(Boolean).length : 0;
  const isLast = active === slide.steps.length - 1;
  const pulse = isLast ? Math.max(0, 1 - (frame - stepStart) / (fps * 0.5)) : 0;

  return (
    <AbsoluteFill>
      <div className="content center">
        <span className="eyebrow" style={fadeUp(frame, fps)}>
          {slide.eyebrow}
        </span>

        <div
          style={{
            marginTop: 80,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 24,
            justifyContent: 'center',
            alignItems: 'center',
            background: 'var(--surface)',
            border: '3px solid var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: `var(--shadow)${pulse > 0 ? `, 0 0 0 ${Math.round(pulse * 18)}px var(--tint)` : ''}`,
            padding: '56px 72px',
            maxWidth: 3200,
          }}
        >
          {words.map((w, i) => {
            const isNew = i >= prevCount;
            const enter = isNew
              ? spring({ frame: frame - stepStart, fps, config: { damping: 14 }, durationInFrames: 12 })
              : 1;
            return (
              <span
                key={`${active}-${i}`}
                style={{
                  fontFamily: 'var(--head)',
                  fontWeight: 700,
                  fontSize: 96,
                  lineHeight: 1,
                  padding: '18px 34px',
                  borderRadius: 20,
                  transform: `scale(${0.6 + enter * 0.4})`,
                  color: isNew ? 'var(--accent)' : 'var(--ink)',
                  background: isNew ? 'var(--tint)' : 'transparent',
                }}
              >
                {w}
              </span>
            );
          })}
        </div>

        {slide.translation && (
          <p className="body muted" style={{ marginTop: 40, fontStyle: 'italic' }}>
            {slide.translation}
          </p>
        )}

        <div className="steps" style={{ marginTop: 72 }}>
          {slide.steps.map((_, i) => (
            <i key={i} className={i < active ? 'on' : i === active ? 'cur' : ''} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
