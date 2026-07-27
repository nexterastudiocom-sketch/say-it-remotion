import React from 'react';
import { hud, levelToken } from './tokens';

// Level badge — geometry entirely from tokens.hud.levelBadge; fill/text from the
// LEVEL token (system-wide, never language-themed). The label is the actual level.
export const LevelBadge: React.FC<{ level: string }> = ({ level }) => {
  const b = hud.levelBadge;
  const tk = levelToken(level); // throws on an unknown level — never a default colour
  return (
    <div style={{
      width: b.w, height: b.h, borderRadius: b.radius,
      background: tk.hex, color: tk.on,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: `"${b.font}", system-ui, sans-serif`, fontWeight: b.weight,
      fontSize: b.size, letterSpacing: `${b.tracking}em`,
    }}>{level}</div>
  );
};
