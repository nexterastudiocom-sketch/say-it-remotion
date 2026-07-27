import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { assetSrc } from '../assetSrc';

// Vertical Short — 1080x1920, 20s (600f @30). Reads finished lesson assets only.
// Beat windows (seconds), per the spec:
//   JOLT 0-0.5 · HOOK 0.5-2 · FLASH 2-3 · SETUP 3-7 · GAP 7-10 · REVEAL 10-15 · LOOP 15-20
// Load-bearing rules baked in here:
//   SH-03 no French on screen before REVEAL · SH-04 GAP animates every frame ·
//   SH-05 final frame == opening frame · SH-06 hook readable muted · SH-07/PZ-05 safe zones.

export type ShortSpec = {
  id: string; type: string; lesson: string;
  hook: string;
  targetFrench: string; phonetic?: string | null; english?: string | null;
  why: string;
  imageSrc?: string | null;
  revealAudioSrc?: string | null;
  accent: string; tint: string;
  safeZoneOverlay?: boolean;
};

export const SHORT_FPS = 30;
export const SHORT_FRAMES = 600; // 20s

// Safe zones: keep text/subject in the middle 76% vertically, clear of the right 12%.
const SAFE = { top: 0.12, bottom: 0.12, right: 0.12 };
const W = 1080, H = 1920;

const beat = (t: number) =>
  t < 0.5 ? 'JOLT' : t < 2 ? 'HOOK' : t < 3 ? 'FLASH' : t < 7 ? 'SETUP' : t < 10 ? 'GAP' : t < 15 ? 'REVEAL' : 'LOOP';

const Caption: React.FC<{ text: React.ReactNode; sub?: React.ReactNode; accent: string; big?: boolean }> = ({ text, sub, accent, big }) => (
  <div style={{
    position: 'absolute', left: W * 0.07, right: W * SAFE.right, top: H * 0.30,
    display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start',
  }}>
    <span style={{
      fontFamily: '"Poppins", system-ui, sans-serif', fontWeight: 800,
      fontSize: big ? 108 : 84, lineHeight: 1.05, color: '#0E1116',
      // high-contrast plate so it reads with sound off (SH-06)
      background: '#FFFFFF', boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
      padding: '18px 28px', borderRadius: 22, borderLeft: `14px solid ${accent}`,
      maxWidth: '100%',
    }}>{text}</span>
    {sub ? <span style={{
      fontFamily: '"Inter", system-ui, sans-serif', fontWeight: 600, fontSize: 52,
      color: '#0E1116', background: 'rgba(255,255,255,0.92)', padding: '12px 22px', borderRadius: 16,
    }}>{sub}</span> : null}
  </div>
);

export const ShortVideo: React.FC<{ spec: ShortSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const b = beat(t);
  const accent = spec.accent, tint = spec.tint;

  // JOLT: a colour snap + the subject image punching in (motion, no text/branding).
  const jolt = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const bg = interpolate(Math.min(t, 0.5), [0, 0.5], [0, 1]) < 0.5 ? accent : spec.tint;

  // The subject image sits behind, always on (the "picture cues meaning"), gently animated.
  const imgScale = 1.03 + 0.02 * Math.sin((frame / fps) * Math.PI * 1.4);

  // FLASH plays the target once (fast, natural) with NO French text (SH-03). REVEAL plays it clear.
  const flashAudio = b === 'FLASH' && spec.revealAudioSrc;
  const revealAudio = t >= 10 && t < 12.5 && spec.revealAudioSrc;

  // GAP animated countdown ring (3s), motion every frame (SH-04).
  const gapT = (t - 7) / 3; // 0..1
  const ring = Math.max(0, Math.min(1, gapT));
  const remaining = Math.max(1, Math.ceil(3 - (t - 7)));
  const pulse = 1 + 0.08 * Math.sin((frame / fps) * Math.PI * 3);

  // REVEAL fade-in for the French.
  const revealFade = interpolate(t, [10, 10.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: tint, overflow: 'hidden' }}>
      {/* colour-snap backdrop for the JOLT */}
      <AbsoluteFill style={{ backgroundColor: accent, opacity: interpolate(t, [0, 0.5, 0.7], [1, 1, 0], { extrapolateRight: 'clamp' }) }} />

      {/* subject image — pops in on the JOLT, stays as the constant visual */}
      {spec.imageSrc ? (
        <div style={{
          position: 'absolute', left: '50%', top: H * 0.60, transform: `translate(-50%,-50%) scale(${(0.6 + 0.4 * jolt) * imgScale})`,
          width: 820, height: 820, borderRadius: 48, overflow: 'hidden',
          boxShadow: '0 40px 120px rgba(0,0,0,0.30)', border: '6px solid rgba(255,255,255,0.85)',
        }}>
          <Img src={assetSrc(spec.imageSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : null}

      {/* HOOK + LOOP: identical burned-in hook (SH-05 loop match, SH-06 readable muted) */}
      {(b === 'HOOK' || b === 'LOOP' || b === 'JOLT') ? (
        <Caption accent={accent} big text={spec.hook} />
      ) : null}

      {/* SETUP: English context, no French (SH-03) */}
      {b === 'SETUP' ? (
        <Caption accent={accent} text={spec.english ? `“${spec.english}”` : 'Your turn is coming…'} sub={spec.type === 'MISTAKE' ? 'One sound trips everyone up' : null} />
      ) : null}

      {/* GAP: animated countdown + mic pulse, English only, NO French (SH-04, SH-03) */}
      {b === 'GAP' ? (
        <>
          <Caption accent={accent} text={'Say it. In French.'} />
          <div style={{ position: 'absolute', left: '50%', top: H * 0.60, transform: 'translate(-50%,-50%)' }}>
            <svg width="360" height="360" viewBox="0 0 360 360">
              <circle cx="180" cy="180" r="150" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="20" />
              <circle cx="180" cy="180" r="150" fill="none" stroke={accent} strokeWidth="20" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 150} strokeDashoffset={2 * Math.PI * 150 * ring}
                transform="rotate(-90 180 180)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: `scale(${pulse})`, fontFamily: '"Poppins", sans-serif', fontWeight: 800, fontSize: 160, color: accent }}>
              {remaining}
            </div>
          </div>
        </>
      ) : null}

      {/* REVEAL: French appears now and not before */}
      {b === 'REVEAL' ? (
        <div style={{ position: 'absolute', left: W * 0.07, right: W * SAFE.right, top: H * 0.28, opacity: revealFade,
          display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ fontFamily: '"Poppins", sans-serif', fontWeight: 800, fontSize: 150, lineHeight: 1, color: accent }}>{spec.targetFrench}</span>
          {spec.phonetic ? <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600, fontSize: 60, color: '#0E1116', letterSpacing: 2 }}>[{spec.phonetic}]</span> : null}
          {spec.english ? <span style={{ fontFamily: '"Poppins", sans-serif', fontWeight: 600, fontSize: 64, color: '#0E1116' }}>{spec.english}</span> : null}
          <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 500, fontSize: 46, color: '#2b2e34', marginTop: 10, background: 'rgba(255,255,255,0.9)', padding: '14px 20px', borderRadius: 14 }}>{spec.why}</span>
        </div>
      ) : null}

      {flashAudio ? <Audio src={assetSrc(spec.revealAudioSrc!)} /> : null}
      {revealAudio ? <Audio src={assetSrc(spec.revealAudioSrc!)} /> : null}

      {/* safe-zone overlay (preview only) */}
      {spec.safeZoneOverlay ? (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: H * SAFE.top, background: 'rgba(255,0,0,0.16)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: H * SAFE.bottom, background: 'rgba(255,0,0,0.16)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: W * SAFE.right, background: 'rgba(255,0,0,0.16)' }} />
          <div style={{ position: 'absolute', inset: 0, border: '4px dashed rgba(255,0,0,0.5)' }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
