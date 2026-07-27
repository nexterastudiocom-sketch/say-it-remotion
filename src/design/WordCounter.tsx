import React from 'react';
import { hud, languageToken } from './tokens';

// Words-learned counter — geometry from tokens.hud.wordCounter; fill is the
// LANGUAGE accent (so it reads as a different signal from the level badge). Uses
// the token's own {learned}/{total} format string.
export const WordCounter: React.FC<{ language: string; learned: number; total: number }> = ({ language, learned, total }) => {
  const w = hud.wordCounter;
  const accent = languageToken(language).accent; // throws on unknown language
  const label = w.format.replace('{learned}', String(learned)).replace('{total}', String(total));
  return (
    <div style={{
      height: w.h, borderRadius: w.radius, background: accent, color: w.text,
      display: 'inline-flex', alignItems: 'center', padding: '0 30px',
      fontFamily: `"${w.font}", system-ui, sans-serif`, fontWeight: w.weight,
      fontSize: w.size, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
    }}>{label}</div>
  );
};
