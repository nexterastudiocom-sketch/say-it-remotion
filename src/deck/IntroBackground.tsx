import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { LANGUAGES } from './theme';
import { LanguageCode } from './types';

const BG = '#F7F5F0';

type ShapeKind = 'ring' | 'disc' | 'square' | 'bubble';
type Shape = {
  kind: ShapeKind;
  x: number; // vw-ish, 0..100
  y: number; // vh-ish, 0..100
  size: number; // px at 4K
  colorRole: 'accent' | 'tint' | 'ink' | 'p1' | 'p2';
  drift: number; // vertical drift amplitude (px)
  phase: number; // motion phase offset
  spin: number; // deg per frame
  depth: number; // 0..1 parallax / opacity
};

// Shapes hug the edges and corners, leaving the centre clear for the logo.
const SHAPES: Shape[] = [
  { kind: 'ring', x: 12, y: 20, size: 240, colorRole: 'accent', drift: 40, phase: 0.0, spin: 0.08, depth: 0.9 },
  { kind: 'disc', x: 84, y: 16, size: 120, colorRole: 'p1', drift: 60, phase: 1.1, spin: 0, depth: 0.8 },
  { kind: 'square', x: 90, y: 74, size: 180, colorRole: 'accent', drift: 34, phase: 2.0, spin: 0.05, depth: 1 },
  { kind: 'bubble', x: 18, y: 78, size: 150, colorRole: 'p2', drift: 46, phase: 0.6, spin: -0.04, depth: 0.85 },
  { kind: 'disc', x: 8, y: 52, size: 70, colorRole: 'tint', drift: 70, phase: 3.0, spin: 0, depth: 0.6 },
  { kind: 'square', x: 74, y: 40, size: 80, colorRole: 'tint', drift: 52, phase: 1.7, spin: 0.09, depth: 0.55 },
  { kind: 'ring', x: 94, y: 46, size: 140, colorRole: 'p2', drift: 38, phase: 2.6, spin: -0.06, depth: 0.7 },
  { kind: 'disc', x: 30, y: 12, size: 46, colorRole: 'ink', drift: 64, phase: 0.9, spin: 0, depth: 0.5 },
  { kind: 'bubble', x: 68, y: 84, size: 96, colorRole: 'accent', drift: 44, phase: 2.3, spin: 0.03, depth: 0.75 },
  { kind: 'square', x: 6, y: 88, size: 70, colorRole: 'p1', drift: 50, phase: 1.4, spin: -0.07, depth: 0.6 },
  { kind: 'disc', x: 50, y: 8, size: 54, colorRole: 'p2', drift: 58, phase: 3.4, spin: 0, depth: 0.45 },
  { kind: 'ring', x: 40, y: 90, size: 110, colorRole: 'tint', drift: 42, phase: 0.3, spin: 0.05, depth: 0.5 },
];

export const IntroBackground: React.FC<{ language: LanguageCode; calm?: boolean }> = ({
  language,
  calm,
}) => {
  const frame = useCurrentFrame();
  const theme = LANGUAGES[language];

  // Two brand pops drawn from the *other* language accents — a quiet nod to the
  // five-language family without turning the frame into a circus.
  const others = (Object.keys(LANGUAGES) as LanguageCode[]).filter((c) => c !== language);
  const palette: Record<Shape['colorRole'], string> = {
    accent: theme.accent,
    tint: theme.tint,
    ink: '#16181D',
    p1: LANGUAGES[others[0]].accent,
    p2: LANGUAGES[others[1]].accent,
  };

  const amp = calm ? 0.5 : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: 'hidden' }}>
      {SHAPES.map((s, i) => {
        const t = frame / 30;
        const dy = Math.sin(t * (0.5 + s.depth) + s.phase) * s.drift * amp;
        const rot = frame * s.spin;
        const appear = interpolate(frame, [0, 14 + i], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const color = palette[s.colorRole];
        const common: React.CSSProperties = {
          position: 'absolute',
          left: `${s.x}%`,
          top: `${s.y}%`,
          width: s.size,
          height: s.size,
          transform: `translate(-50%, -50%) translateY(${dy}px) rotate(${rot}deg)`,
          opacity: appear * (0.35 + s.depth * 0.45),
        };

        if (s.kind === 'ring') {
          return (
            <div
              key={i}
              style={{ ...common, borderRadius: '50%', border: `${Math.max(10, s.size * 0.11)}px solid ${color}`, background: 'transparent' }}
            />
          );
        }
        if (s.kind === 'disc') {
          return <div key={i} style={{ ...common, borderRadius: '50%', background: color }} />;
        }
        if (s.kind === 'square') {
          return <div key={i} style={{ ...common, borderRadius: s.size * 0.28, background: color }} />;
        }
        // bubble — rounded square with a small tail (echoes the logo dot)
        return (
          <div key={i} style={common}>
            <div style={{ width: '100%', height: '82%', borderRadius: s.size * 0.26, background: color }} />
            <div
              style={{
                position: 'absolute',
                left: '22%',
                bottom: 0,
                width: s.size * 0.22,
                height: s.size * 0.22,
                background: color,
                borderRadius: 4,
                transform: 'rotate(20deg)',
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
