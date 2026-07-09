import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import { assetSrc } from '../assetSrc';
import { LessonChrome, LanguageCode } from './types';
import { monogramLogo } from './theme';

/**
 * Always-on header + rule + a bottom-right running count of words learned so far
 * (in English). No progress bar — YouTube renders its own scrubber, and a live
 * word tally is the more useful cue for a learner.
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
            <span className="sep">·</span>
            {chrome.lessonB}
          </div>
        </div>
        <div className="lf-level">{chrome.level}</div>
      </div>

      <div className="lf-rule" />

      {/* Bottom-right: words learned so far (English). */}
      <div style={{ position: 'absolute', bottom: 96, right: 192, zIndex: 6 }}>
        <div className="lf-chip">
          <span className="ico" />
          <span>
            {learned} {learned === 1 ? 'word' : 'words'} learned
          </span>
        </div>
      </div>
    </>
  );
};
