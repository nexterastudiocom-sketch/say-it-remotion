// timing.mjs — the single source of truth for "when does this beat happen in the
// rendered film".
//
// Everything time-based that we publish (chapters, captions) MUST come from here.
// Getting this wrong is not cosmetic: a caption cue that drifts into a retrieval
// gap puts French on screen during the exact silence the learner is supposed to
// fill, which breaks rules X-06 / I-05.
//
// WHY NOT THE BUILD MANIFEST
// build/<id>/manifest.json carries a `videoStart` per line, but it is accumulated
// in SECONDS and assumes a stale 4.5s intro. The renderer accumulates in FRAMES.
// The two disagree by up to ~2.5s by the end of a lesson. This module instead
// REPLAYS the renderer's own arithmetic, so the numbers are the numbers.
//
// The arithmetic being replayed (src/LessonVideo.tsx, src/LessonFilm.tsx):
//
//   secToFrames = (s) => Math.round(s * FPS)
//
//   let cursor = 0;                          // accumulated in SECONDS
//   for (const slide of slides) {
//     const from = secToFrames(cursor);      // ...rounded once, so no slide drift
//     const duration = secToFrames(slide.durationInSeconds);
//     cursor += slide.durationInSeconds;
//     let off = 0;                           // ...but beats accumulate in FRAMES
//     for (const b of slide.beats) {
//       beatFrom = from + off;               //    within the slide only, so the
//       off += secToFrames(b.durationInSeconds); //  drift resets every slide
//     }
//   }
//
// CLIPPING: the per-beat frame sum can exceed the slide's own rounded duration,
// so the last beat(s) of a slide may overrun it. Remotion clips a child Sequence
// to its parent, so the renderer simply cuts that audio off. We clamp the same
// way — without it, ~20-50 beats per lesson would overlap the next one and the
// caption cues would collide.
//
//   film = [ intro 308f ][ lesson ][ outro 299f ]
//
// Verified against a real render: the computed end of the last beat lands within
// 1 frame (0.033s) of the renderer's own lessonFrames, and the resulting film
// length matches ffprobe on the encoded mp4.

export const FPS = 30;

// Keep in sync with src/deck/IntroVideo.tsx and src/deck/OutroVideo.tsx.
export const INTRO_FRAMES = 308; // 10.267s @ 30fps
export const OUTRO_FRAMES = 299; //  9.967s @ 30fps

const secToFrames = (s) => Math.round((Number(s) || 0) * FPS);

// Human-facing chapter names for the Method's 12 stages.
export const STAGE_TITLES = {
  CAN_DO_GOAL: 'Your goal',
  WARM_UP: 'Warm-up',
  COLD_INPUT: 'Listen',
  ITEM_BLOCK: 'Meet the words',
  MICRO_RECALL: 'Quick check',
  FRAME_INTRO: 'Build a sentence',
  BUILD_LADDER: 'Build it',
  INPUT_RETURN: 'Listen again',
  MAKE_IT_YOURS: 'Make it yours',
  TRANSFER_TASK: 'Your turn',
  FLUENCY_ROUND: 'Fluency',
  CAN_DO_CHECK: 'Recap',
};

/**
 * Build the frame-exact beat timeline for a lesson.
 *
 * @param {object} method  parsed src/data/lessons/<id>.method.json
 * @returns {{
 *   fps: number,
 *   introFrames: number, outroFrames: number,
 *   lessonFrames: number, filmFrames: number, filmSeconds: number,
 *   beats: Array<{
 *     index: number, slideIndex: number, slideId: string|null,
 *     stage: string|null, phase: string|null,
 *     voice: string|null, register: string|null, rate: string|null,
 *     level: number|null, text: string|null, isSpeech: boolean,
 *     startFrame: number, endFrame: number, startSec: number, endSec: number
 *   }>
 * }}
 */
export function buildTimeline(method) {
  if (!method || !Array.isArray(method.slides)) {
    throw new Error('buildTimeline: method.slides[] is required');
  }

  const beats = [];
  let cursorSeconds = 0; // seconds, exactly like the renderer's `cursor`
  let index = 0;

  method.slides.forEach((slide, slideIndex) => {
    const slideStartFrame = secToFrames(cursorSeconds);
    const slideFrames = secToFrames(slide.durationInSeconds);
    const slideEndFrame = slideStartFrame + slideFrames;
    cursorSeconds += Number(slide.durationInSeconds) || 0;

    const slideBeats = Array.isArray(slide.beats) ? slide.beats : null;

    if (!slideBeats || slideBeats.length === 0) {
      // A slide with no beats occupies its own duration as one span.
      beats.push(makeBeat({
        index: index++, slideIndex, slide, beat: null,
        startFrame: slideStartFrame, endFrame: slideEndFrame,
      }));
      return;
    }

    let off = 0; // frames, relative to the slide — resets each slide
    for (const b of slideBeats) {
      const startFrame = slideStartFrame + off;
      off += secToFrames(b.durationInSeconds);
      // Clip to the parent slide, exactly as Remotion does.
      const endFrame = Math.min(slideStartFrame + off, slideEndFrame);
      // A beat that begins at or past the slide's end never renders at all.
      if (startFrame >= slideEndFrame) continue;
      beats.push(makeBeat({
        index: index++, slideIndex, slide, beat: b,
        startFrame, endFrame,
      }));
    }
  });

  // Adjacent slides are sibling Sequences whose rounded bounds can disagree by a
  // single frame, so the last beat of a slide may end 1 frame after the next one
  // starts. On screen the later sibling simply paints over; for captions an
  // overlap is a malformed cue, so square the seam off here.
  for (let i = 1; i < beats.length; i++) {
    if (beats[i - 1].endFrame > beats[i].startFrame) {
      beats[i - 1].endFrame = beats[i].startFrame;
      beats[i - 1].endSec = beats[i - 1].endFrame / FPS;
    }
  }
  const trimmed = beats.filter((b) => b.endFrame > b.startFrame);

  // The renderer rounds the TOTAL once, independently of the per-beat sums.
  const lessonFrames = secToFrames(
    method.slides.reduce((sum, s) => sum + (Number(s.durationInSeconds) || 0), 0)
  );
  const filmFrames = INTRO_FRAMES + lessonFrames + OUTRO_FRAMES;

  return {
    fps: FPS,
    introFrames: INTRO_FRAMES,
    outroFrames: OUTRO_FRAMES,
    lessonFrames,
    filmFrames,
    filmSeconds: filmFrames / FPS,
    beats: trimmed,
  };
}

function makeBeat({ index, slideIndex, slide, beat, startFrame, endFrame }) {
  // Film coordinates: the lesson body starts after the brand intro.
  const s = startFrame + INTRO_FRAMES;
  const e = endFrame + INTRO_FRAMES;
  const text = beat && typeof beat.text === 'string' ? beat.text.trim() : '';
  return {
    index,
    slideIndex,
    slideId: slide.id ?? null,
    stage: (beat && beat.stage) ?? slide.stage ?? null,
    phase: (beat && beat.phase) ?? null,
    voice: (beat && beat.voice) ?? null,
    register: (beat && beat.register) ?? null,
    rate: (beat && beat.rate) ?? null,
    level: (beat && beat.level) ?? null,
    text: text || null,
    // A beat with no text is silence — a pause, a retrieval gap, a held image.
    isSpeech: Boolean(text),
    startFrame: s,
    endFrame: e,
    startSec: s / FPS,
    endSec: e / FPS,
  };
}

/**
 * Chapters for the description, derived from the first beat of each stage.
 *
 * YouTube only renders chapters when ALL of these hold, so they are enforced
 * rather than hoped for:
 *   - the first timestamp is exactly 0
 *   - there are at least 3
 *   - each runs >= 10s
 *   - they ascend
 *
 * A stage that starts less than 10s after the previous chapter is merged into
 * it (dropped) rather than emitted — one bad gap silently disables chapters for
 * the whole video.
 *
 * @param {ReturnType<typeof buildTimeline>} timeline
 * @returns {Array<{start:number, title:string}>}
 */
export function deriveChapters(timeline) {
  const firstByStage = [];
  const seen = new Set();
  for (const b of timeline.beats) {
    if (!b.stage || seen.has(b.stage)) continue;
    seen.add(b.stage);
    firstByStage.push({ title: STAGE_TITLES[b.stage] || b.stage, start: b.startSec });
  }

  const withIntro = [{ title: 'Intro', start: 0 }, ...firstByStage];

  const kept = [];
  for (const c of withIntro) {
    if (kept.length === 0) { kept.push(c); continue; }
    if (c.start - kept[kept.length - 1].start >= 10) kept.push(c);
  }
  return kept;
}

/** SRT timestamp: 00:01:23,456 */
export function srtTime(seconds) {
  return clock(seconds, ',');
}

/** WebVTT timestamp: 00:01:23.456 */
export function vttTime(seconds) {
  return clock(seconds, '.');
}

function clock(seconds, msSep) {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  // Guard the 999.5ms → 1000ms carry so we never emit ",1000".
  const carry = ms === 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  if (carry) return clock(Math.floor(total) + 1, msSep);
  return `${p(h)}:${p(m)}:${p(s)}${msSep}${p(ms, 3)}`;
}

/** Human chapter time: 1:23 or 1:02:03 (YouTube's accepted forms). */
export function chapterTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(rem)}` : `${m}:${p(rem)}`;
}
