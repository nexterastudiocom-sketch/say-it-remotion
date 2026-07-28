import '../fonts';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { assetSrc } from '../assetSrc';
import { LANGUAGES, monogramLogo } from './theme';
import { LanguageCode } from './types';

export const THUMB_W = 1280;
export const THUMB_H = 720;

export type ThumbnailProps = {
  language: LanguageCode;
  level: string; // e.g. "A1"
  line1: string; // focal line 1, e.g. "Je"
  line2: string; // focal line 2, e.g. "travaille…"
  subtitle: string; // e.g. "Talk about your job"
  imageSrc?: string; // public-relative path to the chosen illustration
};

// The two tesserae per channel — a lighter and a soft tint of the accent's own
// value family (from the Mosaic thumbnail spec). Only these two, never more.
const TESSERAE: Record<LanguageCode, [string, string]> = {
  fr: ['#8FA4FF', '#E7ECFE'],
  es: ['#F0998E', '#FDEAE6'],
  it: ['#8FD9BA', '#E4F6EE'],
  pt: ['#88D4CE', '#E0F5F2'],
  de: ['#EFD080', '#FBF1D6'],
};

const INK = '#16181D';
const PAPER = '#F7F5F0';

/**
 * Mosaic YouTube thumbnail — one locked layout, five channels. Only the accent,
 * the phrase and the image change (Mosaic Thumbnails spec, 1280×720). Block-right
 * composition: 576px accent block flush right, 12px mortar channel, Mosaic lockup,
 * Rubik 124px headline (ceiling), Hanken sub-line, level pill, 432×480 image slot,
 * two tesserae. German inverts the badge (its accent fails contrast on white).
 */
export const Thumbnail: React.FC<ThumbnailProps> = ({ language, level, line1, line2, subtitle, imageSrc }) => {
  const accent = LANGUAGES[language].accent;
  const [tessLight, tessSoft] = TESSERAE[language] ?? TESSERAE.fr;
  const invert = language === 'de'; // ink type + ink tessera on the badge
  const badgeFg = invert ? INK : '#FFFFFF';

  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: "'Rubik', sans-serif", overflow: 'hidden' }}>
      {/* accent block, flush right (45% of frame) + the 12px mortar channel */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 576, background: accent }} />
      <div style={{ position: 'absolute', top: 0, right: 576, bottom: 0, width: 12, background: PAPER }} />

      {/* two tesserae, from the accent's value family */}
      <span style={{ position: 'absolute', right: 552, top: 132, width: 84, height: 84, borderRadius: 22, background: tessLight }} />
      <span style={{ position: 'absolute', right: 40, bottom: 52, width: 64, height: 64, borderRadius: 18, background: tessSoft }} />

      {/* lockup: tonal mark + Mosaic wordmark */}
      <div style={{ position: 'absolute', left: 64, top: 42, display: 'flex', alignItems: 'center', gap: 16, zIndex: 30 }}>
        <Img src={assetSrc(monogramLogo(language))} style={{ width: 52, height: 52 }} />
        <span style={{ fontWeight: 600, fontSize: 34, letterSpacing: '-0.03em', color: INK }}>Mosaic</span>
      </div>

      {/* image slot — the illustration, or the mortar-grid placeholder */}
      <div style={{ position: 'absolute', right: 84, top: '50%', transform: 'translateY(-50%)', width: 432, height: 480,
        borderRadius: 28, overflow: 'hidden', background: '#ECE8DF', boxShadow: '0 26px 60px -22px rgba(0,0,0,.45)', zIndex: 15 }}>
        {imageSrc ? (
          <Img src={assetSrc(imageSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg,#EFEBE2 0 26px,#E6E1D6 26px 52px)' }} />
        )}
      </div>

      {/* content column */}
      <div style={{ position: 'absolute', left: 64, top: 150, bottom: 64, width: 600, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 28, zIndex: 20 }}>
        <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 14, background: accent,
          color: badgeFg, fontWeight: 600, fontSize: 32, letterSpacing: '0.01em', padding: '12px 30px', borderRadius: 999 }}>
          <span style={{ width: 16, height: 16, borderRadius: 5, background: badgeFg }} />
          {level}
        </span>
        <p style={{ fontWeight: 700, fontSize: 124, lineHeight: 0.94, letterSpacing: '-0.04em', color: INK, margin: 0 }}>
          {line1}<br />{line2}
        </p>
        <p style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, fontSize: 42, color: '#5C5F66', margin: 0 }}>{subtitle}</p>
      </div>
    </AbsoluteFill>
  );
};
