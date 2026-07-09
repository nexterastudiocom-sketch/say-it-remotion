import '../fonts';
import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SayItLogo, DotAnim } from './SayItLogo';
import { IntroBackground } from './IntroBackground';
import { assetSrc } from '../assetSrc';
import { LANGUAGES, monogramLogo } from './theme';
import { LanguageCode } from './types';

// Full "Say ıt" wordmark, big + centred.
const LOGO_W = 1700;
const LOGO_H = LOGO_W / (260.9 / 140.6);
const BIG = { x: (3840 - LOGO_W) / 2, y: (2160 - LOGO_H) / 2 };

// Monogram sized/placed to EXACTLY match the lesson header logo:
// header uses height:132 at left:192, vertically centred in a 200px bar.
// PNG is 1024×956 → width at h132 = 141.39; centre = (262.7, 100).
const MONO_H = 132;
const MONO_W = MONO_H * (1024 / 956);
const CORNER = { cx: 192 + MONO_W / 2, cy: 100, s: 1 };
const MONO_BIG_S = 4.3; // big-centre monogram scale during the hand-off

const dotDrop = (frame: number, fps: number, startAt: number, fromY: number): DotAnim => {
  const s = spring({ frame: frame - startAt, fps, config: { damping: 9, mass: 0.75 }, durationInFrames: 42 });
  return {
    dropY: interpolate(s, [0, 1], [fromY, 0]),
    scale: interpolate(s, [0, 0.6, 1], [0.6, 1.12, 1]),
    opacity: interpolate(frame, [startAt, startAt + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    rotate: interpolate(s, [0, 0.6, 1], [-12, 4, 0]),
  };
};

const Monogram: React.FC<{ language: LanguageCode; cx: number; cy: number; s: number; opacity: number }> = ({
  language,
  cx,
  cy,
  s,
  opacity,
}) => (
  <Img
    src={assetSrc(monogramLogo(language))}
    alt="Say it"
    style={{
      position: 'absolute',
      width: MONO_W,
      height: MONO_H,
      left: cx - MONO_W / 2,
      top: cy - MONO_H / 2,
      transform: `scale(${s})`,
      transformOrigin: 'center',
      opacity,
    }}
  />
);

const FullLogo: React.FC<{ accent: string; dot: DotAnim; opacity: number }> = ({ accent, dot, opacity }) => (
  <div style={{ position: 'absolute', left: BIG.x, top: BIG.y, width: LOGO_W, height: LOGO_H, opacity }}>
    <SayItLogo accent={accent} dot={dot} style={{ width: '100%', height: '100%', display: 'block' }} />
  </div>
);

export const LogoMotion: React.FC<{ language: LanguageCode; mode: 'intro' | 'outro' }> = ({ language, mode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = LANGUAGES[language].accent;

  if (mode === 'intro') {
    // Wordmark forms (dot bounces on) → condenses into the "Sı" monogram →
    // monogram flies to the exact header corner and rests there.
    const appear = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const dot = dotDrop(frame, fps, 8, -95);
    const xfade = interpolate(frame, [60, 74], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const travel = spring({ frame: frame - 74, fps, config: { damping: 200 }, durationInFrames: 40 });
    const cx = interpolate(travel, [0, 1], [1920, CORNER.cx]);
    const cy = interpolate(travel, [0, 1], [1080, CORNER.cy]);
    const s = interpolate(travel, [0, 1], [MONO_BIG_S, CORNER.s]);

    return (
      <AbsoluteFill>
        <IntroBackground language={language} />
        <FullLogo accent={accent} dot={dot} opacity={appear * (1 - xfade)} />
        <Monogram language={language} cx={cx} cy={cy} s={s} opacity={xfade} />
      </AbsoluteFill>
    );
  }

  // OUTRO — monogram sits in the header corner, then grows + travels to centre
  // and blooms back into the full "Say ıt" wordmark.
  const travel = spring({ frame: frame - 6, fps, config: { damping: 200 }, durationInFrames: 40 });
  const cx = interpolate(travel, [0, 1], [CORNER.cx, 1920]);
  const cy = interpolate(travel, [0, 1], [CORNER.cy, 1080]);
  const s = interpolate(travel, [0, 1], [CORNER.s, MONO_BIG_S]);
  const xfade = interpolate(frame, [46, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const monoOpacity = interpolate(frame, [0, 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (1 - xfade);
  const pulse = spring({ frame: frame - 56, fps, config: { damping: 10, mass: 0.6 }, durationInFrames: 24 });
  const dot: DotAnim = { dropY: 0, scale: interpolate(pulse, [0, 0.5, 1], [1, 1.12, 1]), opacity: 1 };

  return (
    <AbsoluteFill>
      <IntroBackground language={language} calm />
      <Monogram language={language} cx={cx} cy={cy} s={s} opacity={monoOpacity} />
      <FullLogo accent={accent} dot={dot} opacity={xfade} />
    </AbsoluteFill>
  );
};
