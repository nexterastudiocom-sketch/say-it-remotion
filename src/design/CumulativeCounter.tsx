import React from 'react';
import { hud, languageToken } from './tokens';

// Whole-course running total of words learned so far — a secondary GHOST pill
// beside the per-lesson {learned}/{total} counter. It reuses the wordCounter
// token geometry, drawn as an outline in the LANGUAGE accent so it reads as the
// same "words" signal but subordinate to the solid per-lesson pill.
export const CumulativeCounter: React.FC<{ language: string; count: number }> = ({ language, count }) => {
  const accent = languageToken(language).accent;
  // Matched ghost pill — SAME height/radius/padding/font/shadow as the solid pills
  // so all three sit on one line; only the outline (vs solid fill) marks it as the
  // subordinate whole-course total. Content is vertically centred, not baseline.
  return (
    <div style={{
      height: hud.h, borderRadius: hud.radius, background: 'transparent',
      border: `4px solid ${accent}`, color: accent, boxSizing: 'border-box', boxShadow: hud.shadow,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: `0 ${hud.padX}px`,
      fontFamily: `"${hud.font}", system-ui, sans-serif`, fontWeight: hud.weight, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ fontSize: hud.size }}>{count}</span>
      <span style={{ fontSize: Math.round(hud.size * 0.4), fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.9 }}>total</span>
    </div>
  );
};
