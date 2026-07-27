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

  let learned = chrome.wordsFrom;
  for (const m of learnedMarks) {
    if (frame >= m.from) learned = m.count;
    else break;
  }

  return (
    <>
      <div className="lf-header">
        <div className="lf-brand">
          <Img className="lf-logo" src={assetSrc(monogramLogo(language))} alt="Say it" />
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
        total={chrome.wordsTo}
      />
    </>
  );
};
