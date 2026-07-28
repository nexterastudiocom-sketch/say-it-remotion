import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../assetSrc';

// "Word of the day" Short — a complete micro-lesson, mirroring the lesson's teach
// loop: the French word + phonetic + meaning + picture stay on screen throughout
// (this is learn-and-repeat, not a hidden-answer hook), while the audio walks
// through: say it NORMAL → say the meaning → say it SLOW → your turn (repeat) →
// say it NORMAL again. Seamless loop (frame 0 == last frame).
//
// Beats (s): INTRO 0-2 · NORMAL 2-4 · MEANING 4-6.5 · SLOW 6.5-9 · REPEAT 9-13 ·
//            NORMAL 13-15.5 · RECAP 15.5-20

export type WordSpec = {
  id: string; lesson: string;
  targetFrench: string; phonetic?: string | null; english?: string | null;
  imageSrc?: string | null;
  normalAudioSrc?: string | null; slowAudioSrc?: string | null; meaningAudioSrc?: string | null;
  opener: string;                 // "French word of the day" (hook variant)
  accent: string; tint: string;
  safeZoneOverlay?: boolean;
};

export const WORD_FPS = 30;
export const WORD_FRAMES = 600; // 20s
const W = 1080, H = 1920;
const SAFE = { top: 0.12, bottom: 0.12, right: 0.12 };
const PAD_L = W * 0.07, PAD_R = W * SAFE.right;
const IMG = { top: H * 0.44, size: 620 };

const cueFor = (t: number, opener: string): { label: string; mic?: boolean } => {
  if (t < 2) return { label: opener };
  if (t < 4) return { label: 'Listen 🔊' };
  if (t < 6.5) return { label: 'What it means' };
  if (t < 9) return { label: 'Now — slowly' };
  if (t < 13) return { label: 'Your turn — repeat!', mic: true };
  if (t < 15.5) return { label: 'One more time' };
  return { label: opener };
};

export const WordShort: React.FC<{ spec: WordSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const accent = spec.accent;
  const imgScale = 1 + 0.015 * Math.sin((frame / WORD_FRAMES) * Math.PI * 2 * 3); // period-locked → seamless loop
  const cue = cueFor(t, spec.opener);
  const pulse = 1 + 0.1 * Math.sin((frame / fps) * Math.PI * 3);
  // emphasise the meaning line while it's being spoken
  const meaningHot = t >= 4 && t < 6.5;

  return (
    <AbsoluteFill style={{ backgroundColor: '#F7F5F0', overflow: 'hidden' }}>
      {/* WORD CARD — always on (the taught word, like the lesson) */}
      <div style={{ position: 'absolute', left: PAD_L, right: PAD_R, top: H * 0.135, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontFamily: '"Poppins", system-ui, sans-serif', fontWeight: 800, fontSize: 150, lineHeight: 1, color: accent }}>{spec.targetFrench}</span>
        {spec.phonetic ? <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600, fontSize: 58, color: '#0E1116', letterSpacing: 2 }}>[{spec.phonetic}]</span> : null}
        {spec.english ? <span style={{ fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: 64, color: meaningHot ? accent : '#0E1116', transform: `scale(${meaningHot ? 1.04 : 1})`, transformOrigin: 'left center' }}>{spec.english}</span> : null}
      </div>

      {/* PICTURE — fixed lower-centre */}
      {spec.imageSrc ? (
        <div style={{ position: 'absolute', left: '50%', top: IMG.top, transform: `translateX(-50%) scale(${imgScale})`, width: IMG.size, height: IMG.size, borderRadius: 44, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,0.28)', border: '6px solid rgba(255,255,255,0.85)' }}>
          <Img src={assetSrc(spec.imageSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : null}

      {/* BOTTOM BAND — the phase cue (Listen / Slowly / Your turn — repeat!) */}
      <div style={{ position: 'absolute', left: PAD_L, right: PAD_R, top: H * 0.80, display: 'flex', alignItems: 'center', gap: 28 }}>
        <span style={{ fontFamily: '"Poppins", sans-serif', fontWeight: 800, fontSize: 66, color: '#0E1116', background: '#FFFFFF', boxShadow: '0 10px 40px rgba(0,0,0,0.16)', padding: '18px 28px', borderRadius: 20, borderLeft: `14px solid ${accent}` }}>{cue.label}</span>
        {cue.mic ? (
          <span style={{ width: 108, height: 108, borderRadius: '50%', background: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pulse})`, boxShadow: `0 0 0 14px ${accent}22` }}>
            <span style={{ width: 40, height: 60, borderRadius: 20, background: '#fff' }} />
          </span>
        ) : null}
      </div>

      {/* AUDIO — say it normal → meaning → slow → (repeat gap) → normal again */}
      {spec.normalAudioSrc ? <Sequence from={Math.round(2.2 * fps)} durationInFrames={Math.round(1.6 * fps)}><Audio src={assetSrc(spec.normalAudioSrc)} /></Sequence> : null}
      {spec.meaningAudioSrc ? <Sequence from={Math.round(4.3 * fps)} durationInFrames={Math.round(2 * fps)}><Audio src={assetSrc(spec.meaningAudioSrc)} /></Sequence> : null}
      {spec.slowAudioSrc ? <Sequence from={Math.round(6.9 * fps)} durationInFrames={Math.round(2 * fps)}><Audio src={assetSrc(spec.slowAudioSrc)} /></Sequence> : null}
      {spec.normalAudioSrc ? <Sequence from={Math.round(13.3 * fps)} durationInFrames={Math.round(1.6 * fps)}><Audio src={assetSrc(spec.normalAudioSrc)} /></Sequence> : null}

      {spec.safeZoneOverlay ? (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: H * SAFE.top, background: 'rgba(255,0,0,0.16)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: H * SAFE.bottom, background: 'rgba(255,0,0,0.16)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: W * SAFE.right, background: 'rgba(255,0,0,0.16)' }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
