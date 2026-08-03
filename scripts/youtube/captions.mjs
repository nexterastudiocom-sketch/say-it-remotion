// captions.mjs — timed caption tracks built from the frame-exact timeline.
//
// WHY THIS EXISTS
// docs/youtube-seo-spec.md calls caption text "the most under-used lever
// available" — captions are indexed by search, and every French word the course
// teaches is already sitting in the lesson JSON with exact timings. Until now
// publish.mjs looked for out/<lang>/<id>/captions.en.srt, nothing ever wrote it,
// and the upload silently skipped captions on every lesson.
//
// THE CONSTRAINT THAT SHAPES THIS FILE
// Captions put text on the learner's screen. Rules X-06 / I-05 forbid on-screen
// French during a retrieval gap — the silence where the learner is supposed to
// produce the word from memory. A cue that runs long, or a merge that bridges
// two beats, would paint the answer into that silence and quietly destroy the
// pedagogy the whole QA system exists to protect.
//
// So the rule here is absolute: A CUE NEVER EXTENDS BEYOND THE BEAT IT CAME
// FROM. Silent beats produce no cue. Adjacent beats are never merged. Long text
// is split into sub-cues that subdivide the beat's own span. `assertNoGapLeak`
// re-checks all of it against the timeline and throws rather than emitting a
// track that would leak.
//
// The audio is genuinely bilingual (English narration teaching French words), so
// the track is a verbatim transcript of what is audible, labelled `en` to match
// snippet.defaultAudioLanguage. Translated tracks are a separate concern.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline, srtTime, vttTime } from './timing.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Caption convention: ~42 characters per line, two lines on screen.
const MAX_CHARS_PER_LINE = 42;
const PREFERRED_MAX_LINES = 2;
const HARD_MAX_LINES = 4;
// Below this a cue flashes past unreadably, so prefer more lines over more cues.
const MIN_CUE_SECONDS = 0.7;

/** Which language is actually being spoken on this beat. */
export function beatLanguage(beat, targetLang = 'fr') {
  const v = String(beat.voice || '');
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('fr')) return 'fr';
  // Voices are named <lang>_<gender>; fall back to the course's target language.
  const m = v.match(/^([a-z]{2})_/);
  return m ? m[1] : targetLang;
}

/** Greedy word wrap. Words longer than the limit get their own line. */
export function wrapLines(text, maxChars = MAX_CHARS_PER_LINE) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Split one beat into 1..n cues that together exactly span the beat.
 *
 * Time is allocated in proportion to character count, and the last cue is
 * pinned to the beat's own end so rounding can never push it past the boundary.
 */
export function cuesForBeat(beat, targetLang = 'fr') {
  if (!beat.isSpeech || !beat.text) return [];

  const duration = beat.endSec - beat.startSec;
  const lines = wrapLines(beat.text);

  // How many lines may share a cue? Start at 2, but grow rather than emit cues
  // too brief to read.
  let linesPerCue = PREFERRED_MAX_LINES;
  while (
    linesPerCue < HARD_MAX_LINES &&
    duration / Math.ceil(lines.length / linesPerCue) < MIN_CUE_SECONDS
  ) {
    linesPerCue += 1;
  }

  const groups = [];
  for (let i = 0; i < lines.length; i += linesPerCue) {
    groups.push(lines.slice(i, i + linesPerCue));
  }

  const weights = groups.map((g) => g.join(' ').length || 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const cues = [];
  let cursor = beat.startSec;
  groups.forEach((g, i) => {
    const isLast = i === groups.length - 1;
    // Pin the final cue to the beat end: proportional maths must never overrun.
    const end = isLast ? beat.endSec : cursor + (duration * weights[i]) / totalWeight;
    cues.push({
      start: cursor,
      end,
      lines: g,
      text: g.join('\n'),
      lang: beatLanguage(beat, targetLang),
      beatIndex: beat.index,
      stage: beat.stage,
      register: beat.register,
    });
    cursor = end;
  });

  return cues;
}

/**
 * Build every cue for a lesson, in order.
 *
 * @param {object} method  parsed <id>.method.json
 * @param {{targetLang?: string}} [opts]
 */
export function buildCues(method, opts = {}) {
  const targetLang = opts.targetLang || 'fr';
  const timeline = buildTimeline(method);
  const cues = [];
  for (const beat of timeline.beats) cues.push(...cuesForBeat(beat, targetLang));
  return { timeline, cues };
}

/**
 * The safety net. Throws if any cue could put text on screen outside the beat
 * that produced it — i.e. inside a retrieval gap.
 *
 * Checked here rather than trusted from construction because this is the one
 * failure in the whole SEO system that damages the product itself.
 */
export function assertNoGapLeak(cues, timeline) {
  const byIndex = new Map(timeline.beats.map((b) => [b.index, b]));
  // Tolerate only sub-frame float noise.
  const EPS = 1 / (timeline.fps * 2);

  for (const c of cues) {
    const beat = byIndex.get(c.beatIndex);
    if (!beat) throw new Error(`caption cue references unknown beat ${c.beatIndex}`);
    if (!beat.isSpeech) {
      throw new Error(`caption cue ${c.beatIndex} came from a silent beat — that is a retrieval gap`);
    }
    if (c.start < beat.startSec - EPS || c.end > beat.endSec + EPS) {
      throw new Error(
        `caption cue on beat ${c.beatIndex} spans ${c.start.toFixed(3)}–${c.end.toFixed(3)}s ` +
        `but its beat is ${beat.startSec.toFixed(3)}–${beat.endSec.toFixed(3)}s — ` +
        `this would show text during a silence (X-06 / I-05)`
      );
    }
    if (!(c.end > c.start)) {
      throw new Error(`caption cue on beat ${c.beatIndex} has non-positive duration`);
    }
  }

  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start < cues[i - 1].end - EPS) {
      throw new Error(
        `caption cues ${i - 1} and ${i} overlap (${cues[i - 1].end.toFixed(3)}s > ${cues[i].start.toFixed(3)}s)`
      );
    }
  }

  // Every silent beat must be free of cues for its whole span.
  for (const beat of timeline.beats) {
    if (beat.isSpeech) continue;
    for (const c of cues) {
      if (c.start < beat.endSec - EPS && c.end > beat.startSec + EPS) {
        throw new Error(
          `caption cue (beat ${c.beatIndex}) overlaps SILENT beat ${beat.index} ` +
          `[${beat.startSec.toFixed(3)}–${beat.endSec.toFixed(3)}s] — text in a retrieval gap`
        );
      }
    }
  }

  return true;
}

/** SubRip. This is what youtube.captions.insert consumes. */
export function toSRT(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

/** WebVTT, for the web player / archive. */
export function toVTT(cues) {
  const body = cues
    .map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

/** Plain reading transcript — a text surface for the description or site. */
export function toPlainText(cues) {
  return cues.map((c) => c.text.replace(/\n/g, ' ')).join('\n');
}

/**
 * Everything a caller needs: validated cues plus the serialised formats.
 * Throws rather than returning a track that would leak into a gap.
 */
export function buildCaptions(method, opts = {}) {
  const { timeline, cues } = buildCues(method, opts);
  assertNoGapLeak(cues, timeline);
  const spoken = timeline.beats.filter((b) => b.isSpeech).length;
  const target = opts.targetLang || 'fr';
  return {
    timeline,
    cues,
    srt: toSRT(cues),
    vtt: toVTT(cues),
    text: toPlainText(cues),
    stats: {
      cues: cues.length,
      speechBeats: spoken,
      silentBeats: timeline.beats.length - spoken,
      targetLangCues: cues.filter((c) => c.lang === target).length,
      characters: cues.reduce((n, c) => n + c.text.length, 0),
    },
  };
}

/**
 * Generate and write a lesson's caption files.
 *
 * Writes to out/<lang>/<id>/ — the directory publish.mjs already looks in for
 * captions.en.srt, so producing them here is what turns that permanent "skipped"
 * into an actual upload.
 *
 * @returns {{srtPath:string, vttPath:string, txtPath:string, stats:object}}
 */
export function writeCaptions({ id, lang = 'fr', repoRoot = REPO_ROOT, methodPath, outDir } = {}) {
  if (!id) throw new Error('writeCaptions: id is required');
  const mp = methodPath || path.join(repoRoot, 'src', 'data', 'lessons', `${id}.method.json`);
  if (!existsSync(mp)) throw new Error(`Lesson JSON not found: ${mp}`);

  const method = JSON.parse(readFileSync(mp, 'utf8'));
  const built = buildCaptions(method, { targetLang: lang });

  const dir = outDir || path.join(repoRoot, 'out', lang, id);
  mkdirSync(dir, { recursive: true });

  // captions.en.srt: the narration language, matching snippet.defaultAudioLanguage.
  const srtPath = path.join(dir, 'captions.en.srt');
  const vttPath = path.join(dir, 'captions.en.vtt');
  const txtPath = path.join(dir, 'transcript.txt');
  writeFileSync(srtPath, built.srt, 'utf8');
  writeFileSync(vttPath, built.vtt, 'utf8');
  writeFileSync(txtPath, built.text, 'utf8');

  return { srtPath, vttPath, txtPath, stats: built.stats };
}

// CLI: node scripts/youtube/captions.mjs --id <lesson-id> [--lang fr]
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const id = get('--id');
  const lang = get('--lang') || 'fr';
  if (!id) {
    console.error('Usage: node scripts/youtube/captions.mjs --id <lesson-id> [--lang fr]');
    process.exit(1);
  }
  try {
    const r = writeCaptions({ id, lang });
    console.log(`✓ ${path.relative(REPO_ROOT, r.srtPath)}`);
    console.log(`✓ ${path.relative(REPO_ROOT, r.vttPath)}`);
    console.log(`✓ ${path.relative(REPO_ROOT, r.txtPath)}`);
    console.log(
      `  ${r.stats.cues} cues · ${r.stats.targetLangCues} in ${lang} · ` +
      `${r.stats.silentBeats} silent beats left uncaptioned · ${r.stats.characters} chars`
    );
    process.exit(0);
  } catch (e) {
    console.error(`\n✗ ${(e && e.message) || e}`);
    process.exit(1);
  }
}
