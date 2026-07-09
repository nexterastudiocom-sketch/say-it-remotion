import '../fonts';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { assetSrc } from '../assetSrc';
import { LANGUAGES, horizontalLogo } from './theme';
import { LanguageCode } from './types';

export const THUMB_W = 1280;
export const THUMB_H = 720;

export type ThumbnailProps = {
  language: LanguageCode;
  level: string; // e.g. "A1"
  line1: string; // focal line 1, e.g. "Je"
  line2: string; // focal line 2, e.g. "travaille"
  subtitle: string; // e.g. "Talk about your job"
  imageSrc?: string; // public-relative path to the chosen illustration
};

/** Warm-Spark YouTube thumbnail, rebuilt from the design as a Remotion still. */
export const Thumbnail: React.FC<ThumbnailProps> = ({ language, level, line1, line2, subtitle, imageSrc }) => {
  const t = LANGUAGES[language];
  const s = t.spark;
  const stroke = (c: string) =>
    `-3px -3px 0 ${c},3px -3px 0 ${c},-3px 3px 0 ${c},3px 3px 0 ${c},0 2px 0 ${c},0 16px 34px rgba(20,22,28,.20)`;

  return (
    <AbsoluteFill style={{ background: '#F7F5F0', fontFamily: 'Poppins, sans-serif', overflow: 'hidden' }}>
      {/* accent wedge */}
      <div style={{ position: 'absolute', inset: 0, left: 'auto', width: '54%', background: t.accent,
        clipPath: 'polygon(26% 0,100% 0,100% 100%,0 100%)' }} />
      {/* spark shapes */}
      <div style={{ position: 'absolute', right: 560, top: 96, width: 150, height: 150, borderRadius: '50%', border: `16px solid ${s.ring}` }} />
      <div style={{ position: 'absolute', right: 600, bottom: 150, width: 54, height: 54, borderRadius: '50%', background: s.dot }} />
      <div style={{ position: 'absolute', right: 70, bottom: 56, width: 120, height: 120, borderRadius: 26, background: s.chip,
        transform: 'rotate(14deg)', boxShadow: '0 14px 30px -10px rgba(0,0,0,.4)', zIndex: 16 }} />

      {/* brand logo */}
      <Img src={assetSrc(horizontalLogo(language))} style={{ position: 'absolute', top: 42, left: 56, height: 54, zIndex: 30 }} />

      {/* image slot */}
      <div style={{ position: 'absolute', right: 84, top: '50%', transform: 'translateY(-50%)', width: 430, height: 470,
        borderRadius: 30, overflow: 'hidden', border: '6px solid #fff', boxShadow: '0 26px 60px -22px rgba(0,0,0,.5)', zIndex: 15, background: '#ECE8DF' }}>
        {imageSrc ? <Img src={assetSrc(imageSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      </div>

      {/* text block */}
      <div style={{ position: 'absolute', left: 64, top: 150, bottom: 66, width: 680, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 28, zIndex: 20 }}>
        <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 14, background: s.badgeBg,
          color: s.badgeFg, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 34, letterSpacing: '.04em',
          padding: '12px 30px', borderRadius: 999, boxShadow: '0 10px 24px -10px rgba(0,0,0,.4)' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: s.badgeDot }} />
          {level}
        </span>
        <h1 style={{ fontWeight: 800, fontSize: 150, lineHeight: 0.92, letterSpacing: '-.02em', color: '#16181D', margin: 0,
          textShadow: stroke('#F7F5F0') }}>
          {line1}
          <br />
          {line2}
          <span style={{ position: 'relative', display: 'inline-block' }}>
            …
            <span style={{ position: 'absolute', left: 0, bottom: -4, height: 18, width: '100%', borderRadius: 999, background: s.chip, zIndex: -1 }} />
          </span>
        </h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 44, color: '#16181D', margin: 0 }}>{subtitle}</p>
      </div>
    </AbsoluteFill>
  );
};
