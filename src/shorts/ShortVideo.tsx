import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { assetSrc } from '../assetSrc';

// Vertical Short — 1080x1920, 20s (600f @30). Reads finished lesson assets only.
// Beats (s): JOLT 0-0.5 · HOOK 0.5-2 · FLASH 2-3 · SETUP 3-7 · GAP 7-10 · REVEAL 10-15 · LOOP 15-20
// Rules baked in: SH-03 no French before REVEAL · SH-04 GAP animates · SH-05 loop match ·
//   SH-06 hook readable muted · SH-07/PZ-05 safe zones.
//
// LAYOUT (no overlaps): three fixed zones inside the safe area —
//   TEXT  y 13.5%–40%  (hook / captions / the revealed word)
//   IMAGE y 43%–76%    (fixed lower-centre card, never moves)
//   BAND  y 78%–87%    (the one-line 'why', or GAP prompt)

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
const W = 1080, H = 1920;
const SAFE = { top: 0.12, bottom: 0.12, right: 0.12 };

// zones (px)
const PAD_L = W * 0.07, PAD_R = W * SAFE.right;
const TEXT = { top: H * 0.135, bottom: H * 0.40 };
const IMG = { top: H * 0.43, size: 630 };
const BAND = { top: H * 0.78, bottom: H * 0.87 };

const beat = (t: number) =>
  t < 0.5 ? 'JOLT' : t < 2 ? 'HOOK' : t < 3 ? 'FLASH' : t < 7 ? 'SETUP' : t < 10 ? 'GAP' : t < 15 ? 'REVEAL' : 'LOOP';

// A plate in the TEXT zone, bottom-anchored so multi-line text grows upward and
// never drifts toward the image.
const TextZone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', left: PAD_L, right: PAD_R, top: TEXT.top, height: TEXT.bottom - TEXT.top,
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 18 }}>{children}</div>
);

const HookPlate: React.FC<{ text: string; accent: string }> = ({ text, accent }) => (
  <span style={{
    fontFamily: '"Poppins", system-ui, sans-serif', fontWeight: 800, fontSize: 92, lineHeight: 1.04, color: '#0E1116',
    background: '#FFFFFF', boxShadow: '0 10px 40px rgba(0,0,0,0.18)', padding: '18px 26px', borderRadius: 22,
    borderLeft: `14px solid ${accent}`, alignSelf: 'flex-start', maxWidth: '100%',
  }}>{text}</span>
);

export const ShortVideo: React.FC<{ spec: ShortSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const b = beat(t);
  const accent = spec.accent, tint = spec.tint;

  const jolt = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const imgScale = 1 + 0.02 * Math.sin((frame / fps) * Math.PI * 1.4);

  const flashAudio = b === 'FLASH' && spec.revealAudioSrc;
  const revealAudio = t >= 10 && t < 12.5 && spec.revealAudioSrc;

  const gapT = (t - 7) / 3;
  const ring = Math.max(0, Math.min(1, gapT));
  const remaining = Math.max(1, Math.ceil(3 - (t - 7)));
  const pulse = 1 + 0.08 * Math.sin((frame / fps) * Math.PI * 3);
  const revealFade = interpolate(t, [10, 10.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // dim the image a touch under the reveal text so the French reads cleanly
  const imgDim = b === 'REVEAL' ? 0.55 : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: '#F7F5F0', overflow: 'hidden' }}>
      {/* lesson-cream background (matches the long-form videos); accent/tint used for brand marks */}
      {/* JOLT colour-snap */}
      <AbsoluteFill style={{ backgroundColor: accent, opacity: interpolate(t, [0, 0.45, 0.65], [1, 1, 0], { extrapolateRight: 'clamp' }) }} />

      {/* IMAGE — fixed lower-centre card, never moves (only a subtle breathe + JOLT punch-in) */}
      {spec.imageSrc ? (
        <div style={{
          position: 'absolute', left: '50%', top: IMG.top, transform: `translateX(-50%) scale(${(0.7 + 0.3 * jolt) * imgScale})`,
          width: IMG.size, height: IMG.size, borderRadius: 44, overflow: 'hidden', opacity: imgDim,
          boxShadow: '0 30px 90px rgba(0,0,0,0.28)', border: '6px solid rgba(255,255,255,0.85)',
        }}>
          <Img src={assetSrc(spec.imageSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : null}

      {/* TEXT ZONE — hook / setup / gap-prompt / revealed word (never over the image) */}
      {(b === 'JOLT' || b === 'HOOK' || b === 'LOOP') ? (
        <TextZone><HookPlate text={spec.hook} accent={accent} /></TextZone>
      ) : b === 'SETUP' ? (
        <TextZone>
          <HookPlate text={spec.english ? `“${spec.english}”` : 'Your turn is coming…'} accent={accent} />
        </TextZone>
      ) : b === 'GAP' ? (
        <TextZone><HookPlate text={'Say it. In French.'} accent={accent} /></TextZone>
      ) : b === 'REVEAL' ? (
        <div style={{ position: 'absolute', left: PAD_L, right: PAD_R, top: TEXT.top, opacity: revealFade,
          display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontFamily: '"Poppins", sans-serif', fontWeight: 800, fontSize: 150, lineHeight: 1, color: accent }}>{spec.targetFrench}</span>
          {spec.phonetic ? <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600, fontSize: 58, color: '#0E1116', letterSpacing: 2 }}>[{spec.phonetic}]</span> : null}
          {spec.english ? <span style={{ fontFamily: '"Poppins", sans-serif', fontWeight: 600, fontSize: 60, color: '#0E1116' }}>{spec.english}</span> : null}
        </div>
      ) : null}

      {/* GAP countdown ring — centred on the image (a graphic, not colliding text) */}
      {b === 'GAP' ? (
        <div style={{ position: 'absolute', left: '50%', top: IMG.top + IMG.size / 2, transform: 'translate(-50%,-50%)' }}>
          <svg width="320" height="320" viewBox="0 0 320 320">
            <circle cx="160" cy="160" r="132" fill="rgba(255,255,255,0.35)" stroke="rgba(255,255,255,0.6)" strokeWidth="18" />
            <circle cx="160" cy="160" r="132" fill="none" stroke={accent} strokeWidth="18" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 132} strokeDashoffset={2 * Math.PI * 132 * ring} transform="rotate(-90 160 160)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${pulse})`, fontFamily: '"Poppins", sans-serif', fontWeight: 800, fontSize: 150, color: accent }}>{remaining}</div>
        </div>
      ) : null}

      {/* BOTTOM BAND — the one-line 'why' during REVEAL (below the image) */}
      {b === 'REVEAL' ? (
        <div style={{ position: 'absolute', left: PAD_L, right: PAD_R, top: BAND.top, opacity: revealFade }}>
          <span style={{ display: 'inline-block', fontFamily: '"Inter", sans-serif', fontWeight: 600, fontSize: 46, lineHeight: 1.25,
            color: '#0E1116', background: 'rgba(255,255,255,0.94)', padding: '16px 22px', borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.14)' }}>{spec.why}</span>
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
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
