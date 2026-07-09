import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { LessonVideo } from './LessonVideo';
import { LogoMotion } from './deck/LogoMotion';
import { SubscribeLowerThird, SUB_FRAMES } from './deck/SubscribeMotion';
import { Lesson, getLessonDurationInFrames } from './deck/types';

export const INTRO_FRAMES = 135; // 4.5s (wordmark → monogram → corner, with a hold)
export const OUTRO_FRAMES = 90; // 3s

export const getFilmDurationInFrames = (lesson: Lesson) =>
  INTRO_FRAMES + getLessonDurationInFrames(lesson) + OUTRO_FRAMES;

/** Full default lesson video: logo intro → lesson → logo outro, one language. */
export const LessonFilm: React.FC<{ lesson: Lesson }> = ({ lesson }) => {
  const lessonFrames = getLessonDurationInFrames(lesson);
  return (
    <AbsoluteFill style={{ backgroundColor: '#F7F5F0' }}>
      <Sequence durationInFrames={INTRO_FRAMES}>
        <LogoMotion language={lesson.language} mode="intro" />
      </Sequence>
      <Sequence from={INTRO_FRAMES} durationInFrames={lessonFrames}>
        <LessonVideo lesson={lesson} />
      </Sequence>
      {/* Subscribe lower-third pops in over the final seconds of the lesson. */}
      <Sequence from={INTRO_FRAMES + lessonFrames - SUB_FRAMES} durationInFrames={SUB_FRAMES}>
        <SubscribeLowerThird language={lesson.language} />
      </Sequence>
      <Sequence from={INTRO_FRAMES + lessonFrames} durationInFrames={OUTRO_FRAMES}>
        <LogoMotion language={lesson.language} mode="outro" />
      </Sequence>
    </AbsoluteFill>
  );
};
