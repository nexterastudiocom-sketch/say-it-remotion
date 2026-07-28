import React from 'react';
import { AbsoluteFill, OffthreadVideo, Audio } from 'remotion';
import { assetSrc } from '../assetSrc';
import { LanguageCode } from './types';

// Brand intro — a pre-rendered logo video with its synced audio bed, replacing the
// motion-logo intro. Source is 1920x1080 (16:9), so it fills the 3840x2160 canvas
// with no crop. Duration = the video's length. Per-language assets keyed by slug;
// only the French intro exists today (others fall back to the motion logo upstream).
export const INTRO_VIDEO_FRAMES = 308; // 10.267s @ 30fps

const introSlug = (_lang: LanguageCode) => 'fr';

export const IntroVideo: React.FC<{ language: LanguageCode }> = ({ language }) => {
  const s = introSlug(language);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo src={assetSrc(`assets/intro/intro-${s}.mp4`)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <Audio src={assetSrc(`assets/intro/intro-${s}.wav`)} />
    </AbsoluteFill>
  );
};
