import React from 'react';
import { AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../../assetSrc';
import { fadeUp } from '../anim';
import { VocabSlide as VocabSlideData, Beat } from '../types';

/** Vocab card — covers Meet + Echo (the "Répète" cue prompts the echo). */
export const VocabSlide: React.FC<{ slide: VocabSlideData & { beats?: Beat[] }; repeatLabel: string }> = ({
  slide,
  repeatLabel,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Find the active beat: mic cue pulses during pauses (learner echoes); the word
  // lights up in accent + gives a reveal pop while the French model is speaking it.
  let cur: Beat | null = null;
  let curStart = 0;
  if (slide.beats?.length) {
    let off = 0;
    for (const b of slide.beats) {
      const bf = Math.round(b.durationInSeconds * fps);
      if (frame >= off && frame < off + bf) { cur = b; curStart = off; break; }
      off += bf;
    }
  }
  const inPause = cur ? !cur.src : false;
  const speaking = !!(cur && cur.src && (cur.voice || '').startsWith('fr'));
  const reveal = speaking ? spring({ frame: frame - curStart, fps, config: { damping: 12 }, durationInFrames: 12 }) : 0;

  const imgs = slide.imageSrcs?.length ? slide.imageSrcs : slide.imageSrc ? [slide.imageSrc] : [];
  const cover: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };

  return (
    <AbsoluteFill>
      <div
        className="content"
        style={{ display: 'grid', gridTemplateColumns: '1240px 1fr', gap: 180, alignItems: 'center' }}
      >
        {imgs.length >= 2 ? (
          // Two (or more) illustrations stacked in the square slot area.
          <div
            style={{
              width: 1240,
              height: 1240,
              display: 'grid',
              gridTemplateRows: `repeat(${imgs.length}, 1fr)`,
              gap: 32,
              ...fadeUp(frame, fps),
            }}
          >
            {imgs.map((src, i) => (
              <div key={i} className="slot" style={{ overflow: 'hidden' }}>
                <Img src={assetSrc(src)} style={cover} />
              </div>
            ))}
          </div>
        ) : (
          <div className="slot" style={{ aspectRatio: '1 / 1', width: 1240, overflow: 'hidden', ...fadeUp(frame, fps) }}>
            {imgs.length === 1 ? (
              <Img src={assetSrc(imgs[0])} style={cover} />
            ) : (
              <div className="ph">
                <span>
                  word image
                  <br />“{slide.word}”
                </span>
              </div>
            )}
          </div>
        )}
        <div style={fadeUp(frame, fps, 6)}>
          <h1
            className="h1"
            style={{
              color: speaking ? 'var(--accent)' : undefined,
              transform: `scale(${1 + reveal * 0.05})`,
              transformOrigin: 'left center',
              transition: 'color 0.1s',
            }}
          >
            {slide.word}
          </h1>
          <p className="h2" style={{ marginTop: 32 }}>
            {slide.translation}
          </p>
          <p className="body" style={{ fontStyle: 'italic', color: 'var(--ink-2)', marginTop: 36 }}>
            {slide.phonetic}
          </p>
          <div style={{ marginTop: 56 }}>
            <span className="pos-tag">{slide.pos}</span>
          </div>
          <div className="cue" style={{ marginTop: 96 }}>
            <span className="spk" />
            {inPause ? 'À toi !' : repeatLabel}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
