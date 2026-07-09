import './styles/lesson-system.css';
import './fonts';

import React from 'react';
import { AbsoluteFill, Audio, Sequence, Img } from 'remotion';
import { assetSrc } from './assetSrc';
import { Frame } from './deck/Frame';
import { LANGUAGES } from './deck/theme';
import { PhaseBadge } from './deck/PhaseBadge';
import { TitleSlide } from './deck/slides/TitleSlide';
import { VocabSlide } from './deck/slides/VocabSlide';
import { BuildUpSlide } from './deck/slides/BuildUpSlide';
import { YourTurnSlide } from './deck/slides/YourTurnSlide';
import { ModelSlide } from './deck/slides/ModelSlide';
import { RecapSlide } from './deck/slides/RecapSlide';
import { ScoreSlide } from './deck/slides/ScoreSlide';
import { FPS, getLessonDurationInFrames, Lesson, Overlay, Slide } from './deck/types';

// Re-exported so Root.tsx / merge.ts keep their existing import paths.
export { FPS, getLessonDurationInFrames };
export type { Lesson, Overlay };

const secToFrames = (s: number) => Math.round(s * FPS);

// Walk every slide's beats to derive contiguous phase spans (MEET/ECHO/BUILD/…)
// across the whole lesson, for the persistent corner badge + announcement flash.
type PhaseSpan = { phase: string; from: number; to: number };
const computePhaseSpans = (slides: Slide[]): PhaseSpan[] => {
  const spans: PhaseSpan[] = [];
  let cursor = 0;
  let cur: string | undefined;
  let start = 0;
  const flush = (end: number) => {
    if (cur) spans.push({ phase: cur, from: start, to: end });
  };
  for (const slide of slides) {
    const beats = slide.beats;
    if (beats?.length) {
      for (const b of beats) {
        const ph = b.phase ?? undefined;
        if (ph !== cur) { flush(cursor); cur = ph; start = cursor; }
        cursor += secToFrames(b.durationInSeconds);
      }
    } else {
      if (cur) { flush(cursor); cur = undefined; }
      cursor += secToFrames(slide.durationInSeconds);
    }
  }
  flush(cursor);
  return spans;
};

const renderSlide = (slide: Slide, lesson: Lesson): React.ReactNode => {
  switch (slide.type) {
    case 'title':
      return <TitleSlide slide={slide} />;
    case 'vocab':
      return <VocabSlide slide={slide} repeatLabel={lesson.ui.repeat} />;
    case 'buildup':
      return <BuildUpSlide slide={slide} />;
    case 'yourturn':
      return <YourTurnSlide slide={slide} />;
    case 'model':
      return <ModelSlide slide={slide} />;
    case 'recap':
      return <RecapSlide slide={slide} />;
    case 'score':
      return <ScoreSlide slide={slide} />;
  }
};

const overlayPositionStyle = (
  position: Overlay['position'] = 'bottom-right'
): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 480,
    borderRadius: 16,
    boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
    zIndex: 8,
  };
  switch (position) {
    case 'top-left':
      return { ...base, top: 260, left: 192 };
    case 'top-right':
      return { ...base, top: 260, right: 192 };
    case 'bottom-left':
      return { ...base, bottom: 260, left: 192 };
    case 'center':
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    default:
      return { ...base, bottom: 260, right: 192 };
  }
};

export const LessonVideo: React.FC<{ lesson: Lesson }> = ({ lesson }) => {
  let cursor = 0;
  const phaseSpans = computePhaseSpans(lesson.slides);

  // Running "words learned" checkpoints — bump at each vocab card by the number
  // of French words it introduces (e.g. "oui / non" = 2), keyed by its frame.
  const learnedMarks: { from: number; count: number }[] = [];
  {
    let c = 0;
    let learned = lesson.chrome.wordsFrom;
    for (const slide of lesson.slides) {
      if (slide.type === 'vocab') {
        learned += String(slide.word).split('/').filter((w) => w.trim()).length || 1;
        learnedMarks.push({ from: secToFrames(c), count: learned });
      }
      c += slide.durationInSeconds;
    }
  }

  return (
    <AbsoluteFill
      className="deck-root"
      data-lang={lesson.language}
      style={{
        ['--accent' as string]: LANGUAGES[lesson.language].accent,
        ['--tint' as string]: LANGUAGES[lesson.language].tint,
      }}
    >
      {lesson.slides.map((slide) => {
        const from = secToFrames(cursor);
        const duration = secToFrames(slide.durationInSeconds);
        cursor += slide.durationInSeconds;
        return (
          <Sequence key={slide.id} from={from} durationInFrames={duration}>
            {slide.beats?.length ? (
              // Ordered narration clips + scripted PAUSE gaps (learner speaks).
              (() => {
                let off = 0;
                return slide.beats.map((b, i) => {
                  const beatFrom = off;
                  off += secToFrames(b.durationInSeconds);
                  if (!b.src) return null; // pause
                  return (
                    <Sequence key={i} from={beatFrom} durationInFrames={secToFrames(b.durationInSeconds)}>
                      <Audio src={assetSrc(b.src)} />
                    </Sequence>
                  );
                });
              })()
            ) : (
              slide.audioSrc && <Audio src={assetSrc(slide.audioSrc)} />
            )}
            {renderSlide(slide, lesson)}
          </Sequence>
        );
      })}

      {/* Manual overlays ("add a picture at 2:35") — merged in from the
          overrides file, never the generated lesson JSON. */}
      {(lesson.overlays ?? []).map((overlay) => (
        <Sequence
          key={overlay.id}
          from={secToFrames(overlay.atSeconds)}
          durationInFrames={secToFrames(overlay.durationInSeconds)}
        >
          <Img src={assetSrc(overlay.src)} style={overlayPositionStyle(overlay.position)} />
        </Sequence>
      ))}

      {/* Core-Loop phase system: a persistent corner badge holds the current
          phase (MEET/ECHO/BUILD/…) — no spoken or center-screen transition. */}
      {phaseSpans.map((s, i) => (
        <Sequence key={`badge-${i}`} from={s.from} durationInFrames={Math.max(1, s.to - s.from)}>
          <PhaseBadge phase={s.phase} />
        </Sequence>
      ))}

      {/* Always-on brand frame chrome (header + rule + words-learned counter). */}
      <Frame
        chrome={lesson.chrome}
        language={lesson.language}
        durationInFrames={getLessonDurationInFrames(lesson)}
        learnedMarks={learnedMarks}
      />
    </AbsoluteFill>
  );
};
