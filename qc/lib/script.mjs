// script.mjs — Layer 2: script fidelity. All text, no AI. Everything here reads
// the built lesson JSON directly (src/data/lessons/<id>.<lang>.json), which is
// already structured — so unlike the prototype we don't regex a transcript, we
// walk beats and slides that carry exact text/phase/voice/duration.

import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PASS, FAIL, WARN, SKIP, result } from './report.mjs';

export function loadLesson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Flatten the lesson into an absolute timeline: each slide gets [start, end),
// and we keep the spoken beats (those with text) for vocab/audio checks.
export function buildTimeline(lesson) {
  let t = 0;
  const slides = [];
  for (const s of lesson.slides || []) {
    const dur = Number(s.durationInSeconds || 0);
    slides.push({ ...s, start: t, end: t + dur, mid: t + dur / 2 });
    t += dur;
  }
  return { slides, totalSeconds: t };
}

// Every spoken beat in order, tagged with its slide — the expected utterance
// sequence the audio-diff layer aligns the render's transcript against.
export function spokenBeats(lesson) {
  const beats = [];
  for (const s of lesson.slides || []) {
    for (const b of s.beats || []) {
      if (b.text && b.voice) beats.push({ voice: b.voice, phase: b.phase ?? null, text: b.text, slide: s.id });
    }
  }
  return beats;
}

// --- taught vocabulary -----------------------------------------------------

const lettersOnly = (s) => (s.toLowerCase().match(/[a-zà-ÿ]/g) || []).join('');

// The authoritative taught set for a lesson is its recap slide's item list.
// We also fold in the vocab-slide words and split "oui / non"-style entries.
export function taughtWords(lesson, override) {
  if (override?.length) return override;
  const set = new Set();
  const add = (w) => w.split(/[/,]/).map((x) => x.trim()).filter(Boolean).forEach((x) => set.add(x));
  const recap = (lesson.slides || []).find((s) => s.type === 'recap');
  for (const it of recap?.items || []) add(it.word);
  for (const s of lesson.slides || []) if (s.type === 'vocab' && s.word) add(s.word);
  return [...set];
}

// Classic word-break DP. The house style breaks words at phonetic syllables for
// the [slowly] pass ("Bon... jour", "Au... re... voir"), which line up with
// neither whitespace nor real word boundaries — so we ask a stricter question:
// can the line's letters be segmented into a sequence of taught-vocab entries?
// One routine handles both a single word split into syllables and a short
// multi-word line ("Bonjour, madame.").
function canSegment(letters, dict) {
  const n = letters.length;
  if (n === 0) return true;
  const dp = new Array(n + 1).fill(false);
  dp[0] = true;
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < i; j++) {
      if (dp[j] && dict.has(letters.slice(j, i))) { dp[i] = true; break; }
    }
  }
  return dp[n];
}

// Check every taught-language beat decomposes into the taught set. A line that
// only fails once framing cognates (bravo/bienvenue) are allowed is a WARN, not
// a FAIL — those are near-universal and appear in the title/score framing, not
// the teaching body.
export function checkVocabulary(lesson, allowedWords, framingAllowances, targetVoicePrefix) {
  const core = new Set(allowedWords.map(lettersOnly).filter(Boolean));
  const withFraming = new Set([...core, ...framingAllowances.map(lettersOnly).filter(Boolean)]);

  const fails = []; const warns = []; let checked = 0;
  for (const s of lesson.slides || []) {
    for (const b of s.beats || []) {
      if (!b.text || !b.voice || !b.voice.startsWith(targetVoicePrefix)) continue;
      checked++;
      const letters = lettersOnly(b.text);
      if (!letters || canSegment(letters, core)) continue;
      if (canSegment(letters, withFraming)) warns.push({ slide: s.id, text: b.text });
      else fails.push({ slide: s.id, text: b.text });
    }
  }

  const sample = (arr) => arr.slice(0, 5).map((v) => `${v.slide}: "${v.text}"`).join('; ')
    + (arr.length > 5 ? ` (+${arr.length - 5} more)` : '');

  if (fails.length) {
    return result('vocabulary_compliance', FAIL,
      `${fails.length} ${targetVoicePrefix}-voice line(s) contain untaught vocabulary: ${sample(fails)}`,
      { fails, warns });
  }
  if (warns.length) {
    return result('vocabulary_compliance', WARN,
      `${warns.length} line(s) use only framing cognates (${framingAllowances.join(', ')}) outside the taught set: ${sample(warns)}`,
      { warns });
  }
  return result('vocabulary_compliance', PASS,
    `all ${checked} ${targetVoicePrefix}-voice lines decompose into the ${core.size} taught vocabulary items`);
}

export function checkForbiddenWords(lesson, forbidden) {
  const hits = [];
  for (const s of lesson.slides || []) {
    for (const b of s.beats || []) {
      if (!b.text) continue;
      for (const bad of forbidden) {
        if (new RegExp(`\\b${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(b.text)) {
          hits.push({ slide: s.id, voice: b.voice, word: bad });
        }
      }
    }
  }
  if (hits.length) {
    return result('forbidden_words', FAIL,
      `found: ${hits.map((h) => `"${h.word}" in ${h.slide} (${h.voice})`).join(', ')}`, { hits });
  }
  return result('forbidden_words', PASS, `none of [${forbidden.join(', ')}] appear in any spoken line`);
}

// Deterministic: does every audio clip the lesson references actually exist on
// disk? A missing beat mp3 means a silent gap in the render — cheap to catch
// here rather than by ear.
export function checkAudioAssets(lesson, assetsRoots) {
  const missing = [];
  let total = 0;
  for (const s of lesson.slides || []) {
    for (const b of s.beats || []) {
      if (!b.src) continue;
      total++;
      const found = assetsRoots.some((root) => existsSync(join(root, b.src)));
      if (!found) missing.push(b.src);
    }
  }
  if (total === 0) return result('audio_assets', SKIP, 'lesson JSON references no beat audio files');
  if (missing.length) {
    return result('audio_assets', WARN,
      `${missing.length}/${total} referenced audio clips not found under [${assetsRoots.join(', ')}]: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
      { missing });
  }
  return result('audio_assets', PASS, `all ${total} referenced beat audio clips exist on disk`);
}

// Smoke test: roughly as many silence gaps in the render as pauses in the
// lesson. Generous band — short pauses won't clear the noise floor and
// cross-fades eat into others. The audio-diff layer is the real per-line check.
export function checkPauseCount(lesson, silenceGaps) {
  let pauses = 0;
  for (const s of lesson.slides || []) {
    for (const b of s.beats || []) if (b.text == null && b.durationInSeconds) pauses++;
  }
  const ok = silenceGaps >= pauses * 0.4;
  return result('pause_count_sanity', ok ? PASS : WARN,
    `lesson has ~${pauses} pause beats; render shows ${silenceGaps} silence gaps (rough smoke test)`);
}
