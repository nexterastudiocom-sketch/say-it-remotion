import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { LessonVideo } from './LessonVideo';
import { IntroVideo, INTRO_VIDEO_FRAMES } from './deck/IntroVideo';
import { OutroVideo, OUTRO_VIDEO_FRAMES } from './deck/OutroVideo';
import { SubscribeLowerThird, SUB_FRAMES } from './deck/SubscribeMotion';
import { Lesson, getLessonDurationInFrames } from './deck/types';

export const INTRO_FRAMES = INTRO_VIDEO_FRAMES; // brand intro video (10.27s) + its synced audio
export const OUTRO_FRAMES = OUTRO_VIDEO_FRAMES; // brand outro end-card (9.97s) + its audio bed

export const getFilmDurationInFrames = (lesson: Lesson) =>
  INTRO_FRAMES + getLessonDurationInFrames(lesson) + OUTRO_FRAMES;

// CRITICAL: `--props=<baked json>` passes the RAW lesson object (top-level `slides`).
// Remotion merges input props ALONGSIDE defaultProps ({lesson: sample}), so
// `props.lesson` would wrongly stay the build-time sample and every render would be
// that one sample lesson. Resolve the real lesson: a top-level `slides` array means
// the raw lesson was supplied via --props; otherwise use the wrapped `lesson` prop.
export const resolveLesson = (props: unknown): Lesson => {
  const p = props as { slides?: unknown; lesson?: Lesson };
  return (p && Array.isArray(p.slides) ? (p as unknown as Lesson) : (p.lesson as Lesson));
};

/** Full default lesson video: logo intro → lesson → logo outro, one language. */
export const LessonFilm: React.FC<{ lesson: Lesson }> = (props) => {
  const lesson = resolveLesson(props);
  const lessonFrames = getLessonDurationInFrames(lesson);
  return (
    <AbsoluteFill style={{ backgroundColor: '#F7F5F0' }}>
      <Sequence durationInFrames={INTRO_FRAMES}>
        <IntroVideo language={lesson.language} />
      </Sequence>
      <Sequence from={INTRO_FRAMES} durationInFrames={lessonFrames}>
        <LessonVideo lesson={lesson} />
      </Sequence>
      {/* Subscribe lower-third pops in over the final seconds of the lesson. */}
      <Sequence from={INTRO_FRAMES + lessonFrames - SUB_FRAMES} durationInFrames={SUB_FRAMES}>
        <SubscribeLowerThird language={lesson.language} />
      </Sequence>
      <Sequence from={INTRO_FRAMES + lessonFrames} durationInFrames={OUTRO_FRAMES}>
        <OutroVideo language={lesson.language} />
      </Sequence>
    </AbsoluteFill>
  );
};
