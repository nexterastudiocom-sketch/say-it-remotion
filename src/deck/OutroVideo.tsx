import React from 'react';
import { AbsoluteFill, OffthreadVideo, Audio } from 'remotion';
import { assetSrc } from '../assetSrc';
import { LanguageCode } from './types';

// Brand outro — a pre-rendered end-card video (subscribe CTA) with a separate
// audio bed, replacing the motion-logo outro. Source is 1920x1080 (16:9), fills
// the 3840x2160 canvas with no crop. Per-language assets keyed by slug; only the
// French outro exists today (others fall back to the motion logo upstream).
export const OUTRO_VIDEO_FRAMES = 299; // 9.97s @ 30fps

const outroSlug = (_lang: LanguageCode) => 'fr';

export const OutroVideo: React.FC<{ language: LanguageCode }> = ({ language }) => {
  const s = outroSlug(language);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo src={assetSrc(`assets/outro/outro-${s}.mp4`)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <Audio src={assetSrc(`assets/outro/outro-${s}.wav`)} />
    </AbsoluteFill>
  );
};
