import React from 'react';
import { AbsoluteFill } from 'remotion';
import { LessonHud } from './LessonHud';
import { LevelBadge } from './LevelBadge';
import { levelToken } from './tokens';

// A 3840x2160 verification frame: the persistent HUD in its real corner position,
// plus a blown-up badge and the token facts, so a per-level still can be eyeballed.
// Reserved levels (C1/C2) must render even with no lessons for them yet.
export const HudCheck: React.FC<{ level: string; language: string; learned: number; total: number }> = ({ level, language, learned, total }) => {
  const tk = levelToken(level);
  return (
    <AbsoluteFill style={{ backgroundColor: '#F7F5F0', fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ position: 'absolute', top: 220, left: 240, display: 'flex', alignItems: 'center', gap: 80 }}>
        <div style={{ transform: 'scale(4)', transformOrigin: 'left center' }}><LevelBadge level={level} /></div>
      </div>
      <div style={{ position: 'absolute', top: 620, left: 260, color: '#16181D' }}>
        <div style={{ fontSize: 72, fontWeight: 700 }}>{level} · {tk.band} · {tk.step}</div>
        <div style={{ fontSize: 44, opacity: 0.7, marginTop: 16 }}>fill {tk.hex} · on {tk.on} · hue {tk.hue}° · lang {language}</div>
      </div>
      {/* the real persistent HUD, real size, real corner */}
      <LessonHud level={level} language={language} learned={learned} total={total} />
    </AbsoluteFill>
  );
};
