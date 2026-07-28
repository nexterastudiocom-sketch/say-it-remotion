// metadata.mjs — PURE metadata builder for the Mosaic → YouTube uploader.
//
// buildMetadata(lesson, overrides, seoConfig) → { snippet, status, recordingDetails }
//
// No network calls, no file reads. Data in, resource object out. This keeps the
// SEO rules (docs/youtube-seo-spec.md) in one reviewable, unit-testable place.
//
// The `lesson` argument is a NORMALISED object assembled by publish.mjs:
//   {
//     meta:     { lesson, language, level, title, can_do, items:[...] },
//     chapters: [ { start: <seconds>, title } ],   // incl. the 00:00 Intro
//     words:    [ { word, gloss } ],                // meta.items order, no extras
//     recordingDate: "2026-07-28",                   // date or full ISO
//     links:    { playlist?, next?, prev? }          // optional; placeholders otherwise
//   }
// `seoConfig` is the channel config for the language (config/channels.json entry).
// `overrides` is merged LAST so hand-tuned fields always win.

const LANG_NAMES = {
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  de: 'German',
};

function langName(code) {
  return LANG_NAMES[code] || (code ? code.toUpperCase() : 'Language');
}

function two(n) {
  return String(n).padStart(2, '0');
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function toIsoDate(d) {
  if (!d) return new Date().toISOString();
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `${d}T00:00:00.000Z`;
  }
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function buildTitle(lesson) {
  const { meta } = lesson;
  const L = langName(meta.language);
  const nn = two(meta.lesson);
  const n = meta.items.length;
  return `${L} for Beginners #${nn} — ${meta.title} | Speak ${n} Words (${meta.level})`;
}

function buildDescription(lesson, seoConfig) {
  const { meta, chapters, words, links = {} } = lesson;
  const L = langName(meta.language);
  const appUrl = (seoConfig && seoConfig.appUrl) || '';
  const playlist = links.playlist || '(playlist link — add once the course playlist is live)';
  const next = links.next || '(add once the next lesson is published)';
  const prev = links.prev || '(add once the previous lesson is published)';

  const hook =
    `Learn ${L} by speaking it. In this ${meta.level} lesson you'll say ${meta.items.length} new ` +
    `${L} words out loud — not just recognise them.`;

  const chapterLines = chapters.map((c) => `${fmtTime(c.start)} ${c.title}`).join('\n');
  const wordLines = words.map((w) => `${w.word} — ${w.gloss}`).join('\n');

  const langNoSpace = L.replace(/\s+/g, '');
  const hashtags = `#Learn${langNoSpace} #${langNoSpace}ForBeginners #${langNoSpace}${meta.level}`;

  return [
    hook,
    '',
    `🃏 Free flashcard practice for this lesson: ${appUrl}`,
    '',
    '⏱️ CHAPTERS',
    chapterLines,
    '',
    "🗣️ WORDS YOU'LL SPEAK",
    wordLines,
    '',
    '🔁 THE MOSAIC METHOD',
    'Every word goes through four steps:',
    '1. Meet — see it, hear it, read the sound',
    '2. Echo — say it out loud',
    '3. Build — grow it into a full sentence, one chunk at a time',
    '4. Make It Yours — write and speak your own sentence',
    '',
    'Most courses stop after step 1. That’s why you can recognise a hundred words and still not be able to order a coffee.',
    '',
    `▶️ FULL ${L.toUpperCase()} ${meta.level} COURSE: ${playlist}`,
    `⏭️ NEXT: ${next}`,
    `⏮️ PREVIOUS: ${prev}`,
    '',
    '🔊 Narration uses synthetic voices. Illustrations are AI-assisted.',
    '',
    hashtags,
  ].join('\n');
}

function buildTags(lesson) {
  const { meta, words } = lesson;
  const L = langName(meta.language).toLowerCase();
  const level = meta.level.toLowerCase();

  const head = [
    `learn ${L}`,
    `${L} for beginners`,
    `${L} lessons`,
    `learn ${L} for beginners`,
    `beginner ${L}`,
  ];
  const mid = [
    `${L} ${level}`,
    `${L} lesson ${meta.lesson}`,
    `beginner ${L} course`,
    `${L} speaking practice`,
    `speak ${L}`,
    `${L} vocabulary`,
    `${L} pronunciation`,
  ];
  // Long-tail from THIS lesson only: the actual taught words + a topic phrase.
  const longTail = words.map((w) => w.word);
  longTail.push(`${meta.title.toLowerCase()} in ${L}`);
  const brand = ['mosaic', 'mosaic method'];

  // Assemble, then trim from the tail to respect the 500-char (join('')) cap.
  const all = [...head, ...mid, ...longTail, ...brand];
  const out = [];
  for (const t of all) {
    const candidate = out.join('') + t;
    if (candidate.length > 500) break;
    out.push(t);
  }
  return out;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function buildMetadata(lesson, overrides = {}, seoConfig = {}) {
  if (!lesson || !lesson.meta) throw new Error('buildMetadata: lesson.meta is required');
  if (!Array.isArray(lesson.chapters)) throw new Error('buildMetadata: lesson.chapters[] is required');
  if (!Array.isArray(lesson.words)) throw new Error('buildMetadata: lesson.words[] is required');

  // Topic fallback: some workbooks omit a lesson title, so derive it from the
  // can-do ("I can order a coffee" → "Order a coffee") rather than crashing.
  if (!lesson.meta.title) {
    const cd = String(lesson.meta.can_do || '').replace(/^I can\s+/i, '').split(/[,;]/)[0].replace(/\.$/, '').trim();
    lesson = { ...lesson, meta: { ...lesson.meta, title: (cd ? cd[0].toUpperCase() + cd.slice(1) : `Lesson ${lesson.meta.lesson || ''}`.trim()) } };
  }

  const snippet = {
    title: buildTitle(lesson),
    description: buildDescription(lesson, seoConfig),
    tags: buildTags(lesson),
    categoryId: '27',
    defaultLanguage: (seoConfig && seoConfig.defaultLanguage) || 'en',
    defaultAudioLanguage: (seoConfig && seoConfig.defaultAudioLanguage) || 'en',
  };

  const status = {
    privacyStatus: 'private',
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: true,
    license: 'youtube',
    embeddable: true,
  };

  const recordingDetails = {
    recordingDate: toIsoDate(lesson.recordingDate),
  };

  let resource = { snippet, status, recordingDetails };

  // Merge overrides LAST. Support both convenience keys (title/description/tags)
  // and structured patches ({ snippet, status, recordingDetails }).
  if (overrides && typeof overrides === 'object') {
    const { title, description, tags, ...structured } = overrides;
    if (title !== undefined) resource.snippet.title = title;
    if (description !== undefined) resource.snippet.description = description;
    if (tags !== undefined) resource.snippet.tags = tags;
    resource = deepMerge(resource, structured);
  }

  // --- Hard assertions (throw, never warn) -------------------------------
  const { title, description, tags, categoryId } = resource.snippet;
  const { selfDeclaredMadeForKids } = resource.status;
  const chapters = lesson.chapters;

  if (typeof title !== 'string' || title.length > 100) {
    throw new Error(`metadata: title exceeds 100 chars (${title ? title.length : 0})`);
  }
  if (typeof description !== 'string' || description.length > 5000) {
    throw new Error(`metadata: description exceeds 5000 chars (${description ? description.length : 0})`);
  }
  if (!Array.isArray(tags) || tags.join('').length > 500) {
    throw new Error(`metadata: tags exceed 500 chars (${Array.isArray(tags) ? tags.join('').length : 'not an array'})`);
  }
  if (categoryId !== '27') {
    throw new Error(`metadata: categoryId must be "27" (got ${JSON.stringify(categoryId)})`);
  }
  if (selfDeclaredMadeForKids !== false) {
    throw new Error('metadata: selfDeclaredMadeForKids must be false');
  }
  if (!(chapters.length >= 3)) {
    throw new Error(`metadata: need at least 3 chapters (got ${chapters.length})`);
  }
  if (chapters[0].start !== 0) {
    throw new Error(`metadata: first chapter must start at 0 (got ${chapters[0].start})`);
  }
  for (let i = 1; i < chapters.length; i++) {
    const gap = chapters[i].start - chapters[i - 1].start;
    if (!(gap >= 10)) {
      throw new Error(
        `metadata: chapter ${i} ("${chapters[i].title}") is only ${gap.toFixed(2)}s after the previous — must be >= 10s and ascending`
      );
    }
  }

  return resource;
}

// Exported for reuse / testing of formatting helpers.
export { fmtTime, langName, buildTitle, buildTags, buildDescription };
