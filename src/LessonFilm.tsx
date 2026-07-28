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

/** Full default lesson video: logo intro → lesson → logo outro, one language. */
export const LessonFilm: React.FC<{ lesson: Lesson }> = ({ lesson }) => {
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
