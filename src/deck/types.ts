// Content model for the Say It lesson template.
//
// A lesson is an ordered list of slides. Each slide carries its own
// durationInSeconds so that — once ElevenLabs narration is wired — the
// segment length can be set from the ACTUAL returned audio duration
// (frame = round(seconds × 30)), keeping visuals locked to the voice.
//
// The generated pipeline JSON fills `slides`; hand edits (extra images,
// timing tweaks) live in a separate *-overrides.json and are merged in —
// never hand-edit the generated file.

export const FPS = 30;

export type LanguageCode = 'fr' | 'es' | 'it' | 'pt' | 'de';

/** Title / lesson card — big lesson name + English gloss + illustration slot. */
export type TitleSlide = {
  id: string;
  type: 'title';
  durationInSeconds: number;
  kicker: string; // e.g. "Leçon 4"
  titleLines: string[]; // e.g. ["Les verbes", "du quotidien"]
  subtitle: string; // English gloss, e.g. "Everyday verbs"
  imageSrc?: string; // optional illustration in the slot
  methodLabels?: string[]; // optional chips (e.g. Meet · Echo · Build · Make It Yours)
};

/** Vocab card — Meet + Echo. Word, translation, phonetic, part of speech. */
export type VocabSlide = {
  id: string;
  type: 'vocab';
  durationInSeconds: number;
  word: string;
  translation: string;
  phonetic: string;
  pos: string; // localized part-of-speech tag, e.g. "verbe"
  imageSrc?: string; // single illustration (fallback)
  imageSrcs?: string[]; // 2+ illustrations shown together (e.g. varied workers)
};

/** Progressive sentence build-up. Each step reveals one more chunk (highlighted). */
export type BuildUpSlide = {
  id: string;
  type: 'buildup';
  durationInSeconds: number;
  eyebrow: string; // e.g. "On construit la phrase"
  steps: { base: string; add?: string }[]; // `add` is the newly-revealed, highlighted chunk
  translation?: string; // English gloss of the full sentence, shown under it
};

/** Your turn — write-a-sentence prompt with a live countdown ring (seconds → 0). */
export type YourTurnSlide = {
  id: string;
  type: 'yourturn';
  durationInSeconds: number;
  cue: string; // e.g. "À toi !"
  prompt: string; // e.g. "Écris ta propre phrase."
  sub: string; // e.g. "Utilise un autre sujet — parle de ta vie."
  seconds: number; // countdown length shown in the ring
};

/** Model answer reveal. */
export type ModelSlide = {
  id: string;
  type: 'model';
  durationInSeconds: number;
  eyebrow: string; // e.g. "Exemple de réponse"
  highlight: string; // highlighted opening, e.g. "Nous travaillons"
  rest: string; // trailing text, e.g. " à Toronto."
  compareNote: string; // e.g. "Compare avec ta phrase."
  translationEn?: string; // English gloss, shown under the answer
};

/** Recap — two-column list of the lesson's words with their translations. */
export type RecapSlide = {
  id: string;
  type: 'recap';
  durationInSeconds: number;
  eyebrow: string; // e.g. "Récapitulatif"
  items: { word: string; translation: string }[];
};

/** Progress summary / score card with confetti + three stat blocks. */
export type ScoreSlide = {
  id: string;
  type: 'score';
  durationInSeconds: number;
  headline: string; // e.g. "Bravo !"
  nowSayLead: string; // e.g. "Tu peux maintenant dire :"
  nowSaySentence: string; // highlighted sentence
  stats: {
    wordsToday: string; // e.g. "+8"
    wordsTodayLabel: string; // e.g. "mots aujourd’hui"
    levelValue: string; // e.g. "A1 · 142/300"
    levelLabel: string; // e.g. "niveau"
    levelPct: number; // 0..100 mini-bar fill
    sentences: string; // e.g. "6"
    sentencesLabel: string; // e.g. "phrases écrites"
  };
};

// Narration audio attached to a slide by the ElevenLabs generation step.
// `audioSrc` points at the generated mp3 (public-relative) and the slide's
// durationInSeconds is set from the ACTUAL audio length (+ tail) so visuals
// stay locked to the voice.
// A slide can carry either a single narration clip (audioSrc) or an ordered
// list of `beats`: audio clips and silent PAUSE gaps (learner speaks). A beat
// with no `src` is a pause. The slide's durationInSeconds equals the sum of its
// beat durations, so timing stays locked to the voice + scripted pauses.
export type Beat = { src?: string; durationInSeconds: number; phase?: string; voice?: string };
export type SlideAudio = { audioSrc?: string; beats?: Beat[] };

export type Slide = (
  | TitleSlide
  | VocabSlide
  | BuildUpSlide
  | YourTurnSlide
  | ModelSlide
  | RecapSlide
  | ScoreSlide
) &
  SlideAudio;

/** Ad hoc overlay ("add a picture at 2:35") — lives in the overrides file. */
export type Overlay = {
  id: string;
  atSeconds: number;
  durationInSeconds: number;
  type: 'image';
  src: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
};

/** Frame-chrome metadata shown on every slide (header + footer progress). */
export type LessonChrome = {
  lessonA: string; // header left, e.g. "Leçon 4"
  lessonB: string; // header left secondary, e.g. "Les verbes"
  level: string; // level pill, e.g. "A1"
  progressLabel: string; // footer label, e.g. "Progression"
  wordUnit: string; // e.g. "mots" / "palabras"
  wordsFrom: number; // running word count at lesson start
  wordsTo: number; // running word count at lesson end
  wordsTotal: number; // denominator, e.g. 300
};

export type Lesson = {
  title: string;
  language: LanguageCode;
  chrome: LessonChrome;
  /** Lesson-level UI micro-copy shared across slides (localized). */
  ui: { repeat: string };
  slides: Slide[];
  overlays?: Overlay[];
};

const secToFrames = (s: number) => Math.round(s * FPS);

export const getLessonDurationInFrames = (lesson: Lesson) =>
  secToFrames(lesson.slides.reduce((sum, s) => sum + s.durationInSeconds, 0));
