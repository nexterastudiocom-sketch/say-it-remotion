import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import { assetSrc } from '../assetSrc';
import { LessonChrome, LanguageCode } from './types';
import { monogramLogo, LANGUAGES } from './theme';
import { LessonHud } from '../design/LessonHud';

/**
 * Always-on header + rule + the persistent bottom-right HUD (words-learned counter
 * in the LANGUAGE accent, beside the LEVEL badge in the level colour — both driven
 * by src/design/tokens.json). The level lives here, not in the header, so it is
 * never confused with the language accent.
 */
export const Frame: React.FC<{
  chrome: LessonChrome;
  language: LanguageCode;
  durationInFrames: number;
  /** Cumulative words-learned checkpoints keyed by the frame each word reveals. */
  learnedMarks?: { from: number; count: number }[];
}> = ({ chrome, language, learnedMarks = [] }) => {
  const frame = useCurrentFrame();

  // learnedMarks carry the CUMULATIVE (cross-course) count; the HUD counter is
  // PER-LESSON, so it resets each lesson — words learned in THIS lesson out of this
  // lesson's own total (wordsTo − wordsFrom), not a running whole-course tally.
  let cumulative = chrome.wordsFrom;
  for (const m of learnedMarks) {
    if (frame >= m.from) cumulative = m.count;
    else break;
  }
  const learned = Math.max(0, cumulative - chrome.wordsFrom);
  const total = Math.max(1, chrome.wordsTo - chrome.wordsFrom);

  return (
    <>
      <div className="lf-header">
        <div className="lf-brand">
          <Img className="lf-logo" src={assetSrc(monogramLogo(language))} alt="Mosaic" />
          <div className="lf-lesson">
            {chrome.lessonA}
            {chrome.lessonB ? (<><span className="sep">·</span>{chrome.lessonB}</>) : null}
          </div>
        </div>
      </div>

      <div className="lf-rule" />

      {/* Persistent bottom-right HUD — {learned}/{total} counter + level badge, from tokens. */}
      <LessonHud
        level={chrome.level}
        language={LANGUAGES[language].englishName}
        learned={learned}
        total={total}
        cumulative={cumulative}
      />
    </>
  );
};
