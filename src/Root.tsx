import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './LessonVideo';
import { LessonFilm, getFilmDurationInFrames } from './LessonFilm';
import { LanguageCode, Lesson } from './deck/types';
import { getSampleLesson } from './sampleLesson';
import lesson01Fr from './data/lessons/lesson-01.fr.json';
import lesson01FrTest from './data/lessons/lesson-01.fr.test.json';
import { LogoMotion } from './deck/LogoMotion';
import { SubscribeMotion } from './deck/SubscribeMotion';
import { Thumbnail, THUMB_W, THUMB_H } from './deck/Thumbnail';

// One default composition per language channel. All five share the same
// LessonFilm (intro → lesson → outro) and sample content; only the language
// theme (accent/tint/logo) and translated copy change.
const CHANNELS: { id: string; lang: LanguageCode }[] = [
  { id: 'Lesson-FR', lang: 'fr' },
  { id: 'Lesson-ES', lang: 'es' },
  { id: 'Lesson-IT', lang: 'it' },
  { id: 'Lesson-PT', lang: 'pt' },
  { id: 'Lesson-DE', lang: 'de' },
];

export const RemotionRoot: React.FC = () => (
  <>
    {/* Standalone brand-motion previews (also embedded in every LessonFilm). */}
    <Composition
      id="Intro"
      component={LogoMotion}
      fps={FPS}
      width={3840}
      height={2160}
      durationInFrames={135}
      defaultProps={{ language: 'fr' as LanguageCode, mode: 'intro' as const }}
    />
    <Composition
      id="Outro"
      component={LogoMotion}
      fps={FPS}
      width={3840}
      height={2160}
      durationInFrames={90}
      defaultProps={{ language: 'fr' as LanguageCode, mode: 'outro' as const }}
    />
    <Composition
      id="Subscribe"
      component={SubscribeMotion}
      fps={FPS}
      width={3840}
      height={2160}
      durationInFrames={150}
      defaultProps={{ language: 'fr' as LanguageCode }}
    />

    {/* Cover / YouTube thumbnail (rendered as a still from the Cover page). */}
    <Composition
      id="Thumbnail"
      component={Thumbnail}
      width={THUMB_W}
      height={THUMB_H}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{
        language: 'fr' as LanguageCode,
        level: 'A1',
        line1: 'Je',
        line2: 'travaille',
        subtitle: 'Talk about your job',
        imageSrc: 'assets/images/lesson-01_vocab-1.png',
      }}
    />

    {/* Real lesson from the curriculum workbook (npm run lesson -- 1). */}
    {(() => {
      const lesson = lesson01Fr as unknown as Lesson;
      return (
        <Composition
          id="Lesson-01-FR"
          component={LessonFilm}
          fps={FPS}
          width={3840}
          height={2160}
          durationInFrames={getFilmDurationInFrames(lesson)}
          defaultProps={{ lesson }}
        />
      );
    })()}

    {/* Two-voice script test — first few segments (npm run lesson:script -- --limit 3). */}
    {(() => {
      const lesson = lesson01FrTest as unknown as Lesson;
      return (
        <Composition
          id="Lesson-01-FR-test"
          component={LessonFilm}
          fps={FPS}
          width={3840}
          height={2160}
          durationInFrames={getFilmDurationInFrames(lesson)}
          defaultProps={{ lesson }}
        />
      );
    })()}

    {/* Full per-language lesson films (intro → lesson → outro). */}
    {CHANNELS.map(({ id, lang }) => {
      const lesson = getSampleLesson(lang);
      return (
        <Composition
          key={id}
          id={id}
          component={LessonFilm}
          fps={FPS}
          width={3840}
          height={2160}
          durationInFrames={getFilmDurationInFrames(lesson)}
          defaultProps={{ lesson }}
        />
      );
    })}
  </>
);
