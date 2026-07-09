import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../../assetSrc';
import { fadeUp } from '../anim';
import { TitleSlide as TitleSlideData } from '../types';

export const TitleSlide: React.FC<{ slide: TitleSlideData }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <div
        className="content"
        style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 130, alignItems: 'center' }}
      >
        <div style={fadeUp(frame, fps)}>
          <span className="pill">
            <span className="dot" />
            {slide.kicker}
          </span>
          <h1 className="h1" style={{ marginTop: 60 }}>
            {slide.titleLines.map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </h1>
          <p className="h2" style={{ marginTop: 44 }}>
            {slide.subtitle}
          </p>
          {slide.methodLabels?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 56 }}>
              {slide.methodLabels.map((label, i) => (
                <span key={label} className="pill" style={fadeUp(frame, fps, 10 + i * 8)}>
                  <span className="dot" />
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="slot" style={{ aspectRatio: '1 / 1', width: '100%', alignSelf: 'center', ...fadeUp(frame, fps, 6) }}>
          {slide.imageSrc ? (
            <Img src={assetSrc(slide.imageSrc)} />
          ) : (
            <div className="ph">
              <span>
                line-art
                <br />
                illustration
              </span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
