import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeUp } from '../anim';
import { ScoreSlide as ScoreSlideData } from '../types';

const CONFETTI: React.CSSProperties[] = [
  { left: 140, top: 120, background: 'var(--accent)', transform: 'rotate(18deg)' },
  { left: 380, top: 360, background: 'var(--tint)' },
  { right: 220, top: 160, background: 'var(--accent)', borderRadius: '50%' },
  { right: 460, top: 380, background: 'var(--tint)', transform: 'rotate(30deg)' },
  { left: 240, bottom: 300, background: 'var(--tint)', borderRadius: '50%' },
  { right: 300, bottom: 280, background: 'var(--accent)', transform: 'rotate(12deg)' },
];

/** Progress summary / score card with confetti + three stat blocks. */
export const ScoreSlide: React.FC<{ slide: ScoreSlideData }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { stats } = slide;

  // Pop the confetti in, then animate the level mini-bar filling.
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 }, durationInFrames: 30 });
  const barPct = interpolate(spring({ frame: frame - 10, fps, config: { damping: 200 }, durationInFrames: 30 }), [0, 1], [0, stats.levelPct]);

  return (
    <AbsoluteFill>
      <div className="confetti">
        {CONFETTI.map((s, i) => (
          <span key={i} style={{ ...s, opacity: pop, transform: `${s.transform ?? ''} scale(${pop})` }} />
        ))}
      </div>
      <div className="content center">
        <h1 className="h1" style={{ fontSize: 170, ...fadeUp(frame, fps) }}>
          {slide.headline}
        </h1>
        <p className="body" style={{ marginTop: 24, ...fadeUp(frame, fps, 6) }}>
          {slide.nowSayLead} <span className="hl">{slide.nowSaySentence}</span>
        </p>
        <div style={{ display: 'flex', gap: 60, marginTop: 90, width: '100%', ...fadeUp(frame, fps, 12) }}>
          <div className="stat">
            <div className="big">{stats.wordsToday}</div>
            <div className="lab">{stats.wordsTodayLabel}</div>
          </div>
          <div className="stat">
            <div className="big" style={{ fontSize: 88 }}>
              {stats.levelValue}
            </div>
            <div className="lab">{stats.levelLabel}</div>
            <div className="mini">
              <i style={{ width: `${barPct}%` }} />
            </div>
          </div>
          <div className="stat">
            <div className="big">{stats.sentences}</div>
            <div className="lab">{stats.sentencesLabel}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
