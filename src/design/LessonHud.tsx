import React from 'react';
import { hud } from './tokens';
import { LevelBadge } from './LevelBadge';
import { WordCounter } from './WordCounter';

// Persistent bottom-right cluster: the words-learned counter (language accent)
// beside the level badge (level colour), composed in tokens.hud.order and anchored
// per tokens.hud.anchor with tokens.hud.safeMargin against the 3840x2160 canvas.
const anchorStyle = (anchor: string): React.CSSProperties => {
  const [v, h] = anchor.split('-'); // e.g. "bottom-right"
  const m = hud.safeMargin;
  return {
    position: 'absolute', zIndex: 7,
    [v === 'top' ? 'top' : 'bottom']: m.y,
    [h === 'left' ? 'left' : 'right']: m.x,
  } as React.CSSProperties;
};

export const LessonHud: React.FC<{ level: string; language: string; learned: number; total: number }> = ({ level, language, learned, total }) => {
  const parts: Record<string, React.ReactNode> = {
    wordCounter: <WordCounter key="wordCounter" language={language} learned={learned} total={total} />,
    levelBadge: <LevelBadge key="levelBadge" level={level} />,
  };
  return (
    <div style={{ ...anchorStyle(hud.anchor), display: 'flex', flexDirection: 'row', alignItems: 'center', gap: hud.wordCounter.gapToBadge }}>
      {hud.order.map((k) => parts[k])}
    </div>
  );
};
