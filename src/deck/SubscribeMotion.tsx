import '../fonts';
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { LANGUAGES } from './theme';
import { LanguageCode } from './types';

export const SUB_FRAMES = 150; // 5s

const NATIVE: Record<LanguageCode, string> = {
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  de: 'Deutsch',
};
const SUBSCRIBE: Record<LanguageCode, string> = {
  fr: "S'abonner",
  es: 'Suscribirse',
  it: 'Iscriviti',
  pt: 'Subscrever',
  de: 'Abonnieren',
};
const SUBSCRIBED: Record<LanguageCode, string> = {
  fr: 'Abonné',
  es: 'Suscrito',
  it: 'Iscritto',
  pt: 'Subscrito',
  de: 'Abonniert',
};

const YT_RED = '#FF0033';

const Cursor: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.35))' }}>
    <path d="M4 2 L4 22 L9.5 16.5 L13 24 L16 22.5 L12.5 15 L20 15 Z" fill="#16181D" stroke="#fff" strokeWidth={1.3} />
  </svg>
);

const Bell: React.FC<{ color: string; angle: number; size: number }> = ({ color, angle, size }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} style={{ transformOrigin: '50% 12%', transform: `rotate(${angle}deg)` }}>
    <circle cx="50" cy="12" r="7" fill={color} />
    <path
      d="M50 18 C35 18 27 29 27 44 C27 61 21 66 17 73 C15 76 17 80 21 80 H79 C83 80 85 76 83 73 C79 66 73 61 73 44 C73 29 65 18 50 18 Z"
      fill={color}
    />
    <path d="M39 84 a11 11 0 0 0 22 0 Z" fill={color} />
  </svg>
);

/** Transparent lower-third subscribe bar (bottom-left), YouTube-style, with a
 *  cursor that clicks Subscribe → Subscribed + a ringing bell. Overlay this
 *  over the tail of a video. */
export const SubscribeLowerThird: React.FC<{ language: LanguageCode }> = ({ language }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { accent } = LANGUAGES[language];

  // Card slides in from the left, holds, then slides out.
  const inSpring = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const out = interpolate(frame, [SUB_FRAMES - 26, SUB_FRAMES], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Slides in from the right edge and exits back out to the right.
  const x = interpolate(inSpring, [0, 1], [780, 0]) + out * 820;
  const opacity = interpolate(inSpring, [0, 1], [0, 1]) * (1 - out);

  // Cursor glides toward the button, then clicks at CLICK.
  const CLICK = 58;
  const curIn = spring({ frame: frame - 26, fps, config: { damping: 200 }, durationInFrames: 24 });
  const press = interpolate(frame, [CLICK - 3, CLICK, CLICK + 6], [0, 10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const clicked = frame >= CLICK;

  // After the click: button flips, badge pops, bell rings (decaying).
  const flip = spring({ frame: frame - CLICK, fps, config: { damping: 14 }, durationInFrames: 12 });
  const rt = Math.max(0, frame - CLICK - 2);
  const bellAngle = Math.sin(rt * 0.9) * 15 * Math.exp(-rt / 40);
  const badgePop = spring({ frame: frame - CLICK - 2, fps, config: { damping: 9, mass: 0.5 }, durationInFrames: 14 });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          right: 192,
          bottom: 360,
          transform: `translateX(${x}px)`,
          opacity,
          display: 'flex',
          alignItems: 'center',
          gap: 40,
          background: '#FFFFFF',
          borderRadius: 44,
          padding: '34px 44px',
          boxShadow: '0 50px 110px -40px rgba(22,24,29,.5), 0 20px 50px -30px rgba(22,24,29,.3)',
        }}
      >
        {/* Channel avatar */}
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: '50%',
            background: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 700,
            fontSize: 62,
            color: '#fff',
            flex: 'none',
          }}
        >
          Sı
        </div>

        {/* Channel name */}
        <div style={{ marginRight: 20 }}>
          <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 58, color: '#16181D', lineHeight: 1.05 }}>
            Say It
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 38, color: '#5C5F66', marginTop: 6 }}>
            {NATIVE[language]} · A1
          </div>
        </div>

        {/* Subscribe button (relative anchor for the cursor) */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              background: clicked ? '#ECEAE4' : YT_RED,
              color: clicked ? '#16181D' : '#fff',
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 600,
              fontSize: 50,
              padding: '28px 52px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              transform: `scale(${1 - press * 0.006})`,
            }}
          >
            {clicked ? (
              <>
                <span style={{ transform: `scale(${interpolate(flip, [0, 1], [0.2, 1])})`, display: 'inline-flex' }}>
                  <Bell color="#16181D" angle={bellAngle} size={54} />
                </span>
                {SUBSCRIBED[language]}
              </>
            ) : (
              <>
                <Bell color="#fff" angle={0} size={54} />
                {SUBSCRIBE[language]}
              </>
            )}
          </div>

          {/* Notification badge on subscribe */}
          {clicked && (
            <div
              style={{
                position: 'absolute',
                top: -18,
                right: -14,
                width: 62,
                height: 62,
                borderRadius: '50%',
                background: YT_RED,
                border: '6px solid #fff',
                color: '#fff',
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 700,
                fontSize: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${interpolate(badgePop, [0, 1], [0, 1])})`,
              }}
            >
              1
            </div>
          )}

          {/* Clicking cursor */}
          <div
            style={{
              position: 'absolute',
              right: -40,
              bottom: -46,
              transform: `translate(${interpolate(curIn, [0, 1], [140, 0])}px, ${interpolate(curIn, [0, 1], [140, 0]) + press}px)`,
              opacity: interpolate(curIn, [0, 1], [0, 1]),
            }}
          >
            <Cursor size={96} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Standalone preview composition — shows the lower-third over a placeholder
 *  "video" frame so its real overlay placement is clear. */
export const SubscribeMotion: React.FC<{ language: LanguageCode }> = ({ language }) => (
  <AbsoluteFill>
    <AbsoluteFill
      style={{
        background: 'repeating-linear-gradient(135deg,#2a2d34 0 120px,#23262d 120px 240px)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          fontSize: 72,
          letterSpacing: '.3em',
          color: 'rgba(255,255,255,.28)',
          textTransform: 'uppercase',
          border: '4px solid rgba(255,255,255,.18)',
          padding: '40px 90px',
          borderRadius: 22,
        }}
      >
        Your video
      </div>
    </AbsoluteFill>
    <SubscribeLowerThird language={language} />
  </AbsoluteFill>
);
