import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './LessonVideo';
import { LessonFilm, getFilmDurationInFrames } from './LessonFilm';
import { LanguageCode, Lesson } from './deck/types';
import { getSampleLesson } from './sampleLesson';
import lesson01Fr from './data/lessons/lesson-01.fr.json';
import lesson01FrTest from './data/lessons/lesson-01.fr.test.json';
import lesson01Method from './data/lessons/lesson-01.method.json';
import { LogoMotion } from './deck/LogoMotion';
import { IntroVideo, INTRO_VIDEO_FRAMES } from './deck/IntroVideo';
import { SubscribeMotion } from './deck/SubscribeMotion';
import { Thumbnail, THUMB_W, THUMB_H } from './deck/Thumbnail';
import { ShortVideo, SHORT_FPS, SHORT_FRAMES, ShortSpec } from './shorts/ShortVideo';
import { WordShort, WORD_FPS, WORD_FRAMES, WordSpec } from './shorts/WordShort';
import { HudCheck } from './design/HudCheck';

const SAMPLE_WORD_SPEC: WordSpec = {
  id: 'sample', lesson: 'lesson-01', targetFrench: 'bonjour', phonetic: 'bohn-ZHOOR',
  english: 'hello / good morning', imageSrc: 'assets/images/items/img_fr_bonjour_01.png',
  normalAudioSrc: null, slowAudioSrc: null, meaningAudioSrc: null,
  opener: 'French word of the day', accent: '#2E4FE0', tint: '#E7ECFE', safeZoneOverlay: false,
};

// Placeholder spec — the shorts build script renders real ones via --props.
const SAMPLE_SHORT_SPEC: ShortSpec = {
  id: 'sample', type: 'MISTAKE', lesson: 'lesson-01',
  hook: "You're saying bonjour wrong.",
  targetFrench: 'bonjour', phonetic: 'bohn-ZHOOR', english: 'hello / good morning',
  why: 'The on is nasal. Air through the nose, no hard N at the end.',
  imageSrc: 'assets/images/items/img_fr_bonjour_01.png', revealAudioSrc: null,
  accent: '#2E4FE0', tint: '#E7ECFE', safeZoneOverlay: false,
};

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
      component={IntroVideo}
      fps={FPS}
      width={3840}
      height={2160}
      durationInFrames={INTRO_VIDEO_FRAMES}
      defaultProps={{ language: 'fr' as LanguageCode }}
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

    {/* "Word of the day" Short (1080x1920) — a teach micro-lesson. */}
    <Composition
      id="WordShort"
      component={WordShort}
      width={1080}
      height={1920}
      fps={WORD_FPS}
      durationInFrames={WORD_FRAMES}
      defaultProps={{ spec: SAMPLE_WORD_SPEC }}
    />

    {/* Per-level HUD verification frame (3840x2160). Render a still per level. */}
    <Composition
      id="HudCheck"
      component={HudCheck}
      width={3840}
      height={2160}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ level: 'A1', language: 'French', learned: 7, total: 12 }}
    />

    {/* Vertical Short (1080x1920). The shorts build script renders one per candidate
        via --props; this default just makes it previewable in the studio. */}
    <Composition
      id="Short"
      component={ShortVideo}
      width={1080}
      height={1920}
      fps={SHORT_FPS}
      durationInFrames={SHORT_FRAMES}
      defaultProps={{ spec: SAMPLE_SHORT_SPEC }}
    />

    {/* Real lesson from the curriculum workbook (npm run lesson -- 1).
        calculateMetadata derives the duration from the ACTUAL lesson prop, so the
        generation loop can render any baked lesson (any length) via --props without
        being truncated to lesson-01's default length. */}
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
          calculateMetadata={({ props }) => ({
            durationInFrames: getFilmDurationInFrames(props.lesson as unknown as Lesson),
          })}
        />
      );
    })()}

    {/* Say It Method lesson (12 stages), baked from a workbook via the generator. */}
    {(() => {
      const lesson = lesson01Method as unknown as Lesson;
      return (
        <Composition
          id="Lesson-01-Method"
          component={LessonFilm}
          fps={FPS}
          width={3840}
          height={2160}
          durationInFrames={getFilmDurationInFrames(lesson)}
          defaultProps={{ lesson }}
          calculateMetadata={({ props }) => ({ durationInFrames: getFilmDurationInFrames(props.lesson as unknown as Lesson) })}
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
