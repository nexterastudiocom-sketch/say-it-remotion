import React from 'react';
import { hud, languageToken } from './tokens';

// Whole-course running total of words learned so far — a secondary GHOST pill
// beside the per-lesson {learned}/{total} counter. It reuses the wordCounter
// token geometry, drawn as an outline in the LANGUAGE accent so it reads as the
// same "words" signal but subordinate to the solid per-lesson pill.
export const CumulativeCounter: React.FC<{ language: string; count: number }> = ({ language, count }) => {
  const w = hud.wordCounter;
  const accent = languageToken(language).accent;
  return (
    <div style={{
      height: w.h, borderRadius: w.radius, background: 'transparent',
      border: `3px solid ${accent}`, color: accent, boxSizing: 'border-box',
      display: 'inline-flex', alignItems: 'baseline', gap: 10, padding: '0 26px',
      fontFamily: `"${w.font}", system-ui, sans-serif`, fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ fontWeight: w.weight, fontSize: w.size }}>{count}</span>
      <span style={{ fontWeight: 600, fontSize: Math.round(w.size * 0.6), letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.85 }}>so far</span>
    </div>
  );
};
