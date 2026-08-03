// keywords.mjs — replace guessed keywords with a real demand signal.
//
//   node scripts/youtube/keywords.mjs --id <lesson-id> --lang fr [--json] [--offline]
//
// Titles and tags have been pure template: `${L} for Beginners #NN — ${topic}`
// and a fixed head/mid list. That is a guess about what people type. YouTube's
// own autocomplete is the cheapest honest correction — it ranks by what is
// actually searched, needs no API key, and costs no quota.
//
// THE PART THAT MATTERS MORE THAN THE RANKING
// docs/youtube-seo-spec.md carries an explicit warning: YouTube documents
// unrelated or misleading tags as a cause of videos being locked private, and
// that outcome is not appealable — the video has to be re-uploaded. Autocomplete
// will happily hand back "learn french numbers 1-1000", "learn french numbers
// song" and "learn french with alexa" for a lesson that teaches nine numbers up
// to twenty and contains no song. Shipping those is the exact failure the spec
// warns about.
//
// So every suggestion is checked against what the lesson ACTUALLY contains, and
// anything making a claim the lesson does not fulfil is dropped. A phrase
// survives only if every content word in it is accounted for by the lesson's own
// vocabulary, its topic, or a small generic learning lexicon. Numbers are checked
// against the numbers the lesson actually teaches — which is what separates
// "1-20" (true for lesson 4) from "1-1000" (not).
//
// Output is a proposal written to out/<lang>/<id>/keywords.json, not an
// automatic rewrite. Tags are safe to apply mechanically; a title is editorial.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SUGGEST_URL = 'https://suggestqueries-clients6.youtube.com/complete/search';

const LANG_NAMES = {
  fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', de: 'German',
};

// Function words carry no claim, so they never need to be justified.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for', 'from',
  'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'the', 'their',
  'them', 'to', 'up', 'we', 'what', 'when', 'where', 'which', 'who', 'with',
  'you', 'your', 'can', 'not', 'no', 'that', 'this', 'its',
]);

// Generic language-learning vocabulary. These describe the format of any lesson
// in the course, so they are always fair to use.
const GENERIC = new Set([
  'learn', 'learning', 'lesson', 'lessons', 'beginner', 'beginners', 'beginning',
  'basic', 'basics', 'course', 'practice', 'practise', 'speak', 'speaking',
  'say', 'saying', 'said', 'pronounce', 'pronunciation', 'vocabulary', 'vocab',
  'word', 'words', 'phrase', 'phrases', 'sentence', 'sentences', 'easy', 'simple',
  'slow', 'slowly', 'tutorial', 'class', 'classes', 'listen', 'listening',
  'conversation', 'conversational', 'understand', 'language', 'free', 'online',
  'start', 'starting', 'first', 'introduction', 'intro', 'guide', 'step',
  'a1', 'a2', 'b1', 'b2', 'level', 'full',
]);

// Words that describe a counting lesson. Deliberately NOT in GENERIC: "learn
// french numbers" is a fair description of a lesson that teaches sept/vingt and
// a false one for a lesson that teaches bonjour, so these are allowed only when
// the lesson actually teaches numbers.
const NUMERIC_TOPIC = new Set([
  'number', 'numbers', 'numeral', 'numerals', 'count', 'counting', 'digits',
]);

// Only used to decide whether a numeric claim in a phrase is true of the lesson.
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};

export function langName(code) {
  return LANG_NAMES[code] || (code ? code.toUpperCase() : 'Language');
}

export function tokenize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // fold accents: québécois -> quebecois
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Everything this lesson can honestly claim: its taught words and glosses, its
 * topic, its can-do statement, the language, and the level.
 */
export function lessonVocabulary(meta) {
  const tokens = new Set();
  const add = (s) => { for (const t of tokenize(s)) tokens.add(t); };

  add(langName(meta.language));
  add(meta.language || '');
  add(meta.level || '');
  add(meta.title || '');
  add(meta.can_do || '');
  for (const w of meta.items || []) add(w);
  for (const g of meta.glosses || []) add(g);

  // Numbers the lesson teaches, so a numeric claim can be checked.
  const numbers = new Set();
  for (const g of meta.glosses || []) {
    for (const t of tokenize(g)) {
      if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, t)) numbers.add(NUMBER_WORDS[t]);
      else if (/^\d+$/.test(t)) numbers.add(Number(t));
    }
  }
  // A course that teaches counting can claim the span it covers.
  const maxNumber = numbers.size ? Math.max(...numbers) : null;

  return { tokens, numbers, maxNumber };
}

/**
 * Would this phrase be a truthful description of this lesson?
 *
 * Strict by design: an unjustified content word is a rejection, not a warning.
 * The downside of a broad tag is small; the downside is losing the video.
 */
export function isRelevant(phrase, vocab) {
  const toks = tokenize(phrase);
  if (!toks.length) return false;

  for (const t of toks) {
    if (STOPWORDS.has(t) || GENERIC.has(t)) continue;
    if (vocab.tokens.has(t)) continue;

    // "numbers" / "counting" are fair only for a lesson that teaches numbers.
    if (NUMERIC_TOPIC.has(t)) {
      if (vocab.numbers.size > 0) continue;
      return false;
    }

    // A numeric claim is true only if it is within what the lesson teaches.
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (vocab.numbers.has(n)) continue;
      if (vocab.maxNumber != null && n <= vocab.maxNumber) continue;
      return false;
    }
    // A number word ("thousand") the lesson never teaches.
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, t)) {
      const n = NUMBER_WORDS[t];
      if (vocab.numbers.has(n) || (vocab.maxNumber != null && n <= vocab.maxNumber)) continue;
      return false;
    }
    return false; // "song", "alexa", "rap", "duolingo", ...
  }
  return true;
}

/** Search phrases to ask autocomplete about. */
export function seedsForLesson(meta) {
  const L = langName(meta.language).toLowerCase();
  const topic = String(meta.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  const seeds = new Set([
    `learn ${L}`,
    `${L} for beginners`,
    `${L} lesson`,
    `${L} ${String(meta.level || '').toLowerCase()}`,
  ]);
  if (topic) {
    seeds.add(`learn ${L} ${topic}`);
    seeds.add(`${L} ${topic}`);
  }
  // The taught words are the long-tail people actually type.
  for (const g of (meta.glosses || []).slice(0, 12)) {
    const gl = String(g).toLowerCase().replace(/\(.*?\)/g, '').trim();
    if (gl) seeds.add(`how to say ${gl} in ${L}`);
  }
  return [...seeds].filter(Boolean);
}

/** Parse the JSONP autocomplete response. */
export function parseSuggestResponse(body) {
  const m = String(body).match(/^[^(]*\((.*)\)\s*;?\s*$/s);
  if (!m) return [];
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) && Array.isArray(parsed[1]) ? parsed[1] : [];
  return rows.map((r) => (Array.isArray(r) ? String(r[0]) : String(r))).filter(Boolean);
}

export async function fetchSuggestions(seed, { hl = 'en', gl = 'us', timeoutMs = 10000 } = {}) {
  const url = `${SUGGEST_URL}?client=youtube&ds=yt&hl=${hl}&gl=${gl}&q=${encodeURIComponent(seed)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    return parseSuggestResponse(await res.text());
  } catch {
    return []; // keyword research is advisory; never fail a build on it
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rank suggestions. Earlier in an autocomplete list means more demand, and a
 * phrase surfaced by several different seeds is more central to the topic.
 */
export function scoreSuggestions(bySeed) {
  const scores = new Map();
  for (const [, list] of Object.entries(bySeed)) {
    list.forEach((phrase, rank) => {
      const p = phrase.toLowerCase().trim();
      const cur = scores.get(p) || { phrase: p, score: 0, seeds: 0, bestRank: Infinity };
      cur.score += 1 / (rank + 1);
      cur.seeds += 1;
      cur.bestRank = Math.min(cur.bestRank, rank);
      scores.set(p, cur);
    });
  }
  return [...scores.values()]
    .map((s) => ({ ...s, score: s.score * (1 + 0.25 * (s.seeds - 1)) }))
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank);
}

/** Assemble tags within YouTube's 500-character budget. */
export function buildTags(meta, keptPhrases) {
  const L = langName(meta.language).toLowerCase();
  const level = String(meta.level || '').toLowerCase();
  const head = [
    `learn ${L}`, `${L} for beginners`, `${L} lessons`,
    `learn ${L} for beginners`, `beginner ${L}`,
  ];
  const mid = [
    `${L} ${level}`, `${L} lesson ${meta.lesson}`, `beginner ${L} course`,
    `${L} speaking practice`, `speak ${L}`, `${L} vocabulary`, `${L} pronunciation`,
  ];
  const researched = keptPhrases.filter((p) => !head.includes(p) && !mid.includes(p));
  const words = (meta.items || []).map((w) => String(w).toLowerCase());
  const brand = ['mosaic', 'mosaic method'];

  const out = [];
  const seen = new Set();
  // Interleave researched phrases early — they are the ones with real demand.
  for (const t of [...head, ...researched.slice(0, 10), ...mid, ...words, ...brand]) {
    const tag = String(t).trim();
    if (!tag || seen.has(tag)) continue;
    if (out.join('').length + tag.length > 500) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/**
 * The topic the lesson author intended.
 *
 * meta.title is frequently empty in practice, and metadata.mjs already falls
 * back to the can-do statement ("I can count to twenty..." -> "Count to
 * twenty..."). Mirroring that here is what keeps the authored title in the
 * candidate list instead of silently losing it to research suggestions.
 */
export function authoredTopic(meta) {
  const title = String(meta.title || '').trim();
  if (title) return title;
  const cd = String(meta.can_do || '')
    .replace(/^I can\s+/i, '')
    .split(/[,;]/)[0]
    .replace(/\.$/, '')
    .trim();
  return cd ? cd[0].toUpperCase() + cd.slice(1) : '';
}

/**
 * Turn a search phrase into a usable title topic, or return '' if it cannot be
 * one.
 *
 * A search phrase is not a topic. "how to say seven in french" strips down to
 * "seven"; "french lessons" strips to nothing at all. Emitting those produces
 * titles like "French for Beginners #04 — Lessons", which is worse than the
 * authored title it would replace. So a candidate has to survive a substance
 * test: at least two words left, and at least one of them specific to THIS
 * lesson rather than scaffolding every lesson shares.
 */
export function phraseToTopic(phrase, meta, vocab) {
  const L = langName(meta.language).toLowerCase();
  let s = String(phrase).toLowerCase().trim();

  s = s.replace(/^(how (do you|to) say|learn|teach me|speak)\s+/i, '');
  s = s.replace(new RegExp(`\\b(in|for|the)?\\s*${L}\\b`, 'gi'), ' ');
  s = s.replace(/\b(for beginners?|beginners?|lessons?|course|tutorial|practice|class(es)?)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  const toks = tokenize(s);
  if (toks.length < 2) return '';

  const specific = toks.some(
    (t) => vocab.tokens.has(t) || NUMERIC_TOPIC.has(t) || /^\d+$/.test(t)
  );
  if (!specific) return '';

  // Title Case, preserving digit ranges like 1-20.
  return s.replace(/\b([a-z])/g, (m0) => m0.toUpperCase());
}

/**
 * Title candidates that keep the spec's shape but swap the topic for a phrase
 * people actually search. Capped at 100 characters.
 *
 * The authored title always leads — research proposes alternatives, it does not
 * overrule the person who wrote the lesson.
 */
export function titleCandidates(meta, keptPhrases) {
  const L = langName(meta.language);
  const nn = String(meta.lesson).padStart(2, '0');
  const n = (meta.items || []).length;
  const mk = (topic) => `${L} for Beginners #${nn} — ${topic} | Speak ${n} Words (${meta.level})`;
  const vocab = lessonVocabulary(meta);

  const topics = [];
  const authored = authoredTopic(meta);
  if (authored) topics.push(authored);
  for (const p of keptPhrases) {
    const topic = phraseToTopic(p, meta, vocab);
    if (topic) topics.push(topic);
  }

  const out = [];
  const seen = new Set();
  for (const topic of topics) {
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    // Trim a long topic at a word boundary rather than dropping the candidate —
    // the same accommodation metadata.buildTitle makes.
    let fitted = topic;
    while (mk(fitted).length > 100 && fitted.includes(' ')) {
      fitted = fitted.slice(0, fitted.lastIndexOf(' ')).replace(/[\s,;:–-]+$/, '');
    }
    const t = mk(fitted);
    if (t.length > 100) continue;
    seen.add(key);
    out.push({ title: t, length: t.length, topic: fitted });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Full report for one lesson.
 * @param {object} meta            lesson meta (items, glosses, title, level...)
 * @param {object} [opts]
 * @param {object} [opts.bySeed]   pre-fetched suggestions, for offline/testing
 */
export async function researchLesson(meta, opts = {}) {
  const seeds = seedsForLesson(meta);
  const vocab = lessonVocabulary(meta);

  let bySeed = opts.bySeed;
  if (!bySeed) {
    bySeed = {};
    for (const seed of seeds) {
      bySeed[seed] = await fetchSuggestions(seed, opts);
      // Be a polite client; this is an undocumented public endpoint.
      await new Promise((r) => setTimeout(r, opts.delayMs ?? 120));
    }
  }

  const ranked = scoreSuggestions(bySeed);
  const kept = [];
  const rejected = [];
  for (const r of ranked) {
    (isRelevant(r.phrase, vocab) ? kept : rejected).push(r);
  }

  const keptPhrases = kept.map((k) => k.phrase);
  return {
    seeds,
    totalSuggestions: ranked.length,
    kept,
    rejected,
    tags: buildTags(meta, keptPhrases),
    titles: titleCandidates(meta, keptPhrases),
  };
}

// --- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--id': args.id = next(); break;
      case '--lang': args.lang = next(); break;
      case '--json': args.json = true; break;
      case '--offline': args.offline = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    let args;
    try {
      args = parseArgs(process.argv.slice(2));
    } catch (e) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
    if (!args.id) {
      console.error('Usage: node scripts/youtube/keywords.mjs --id <lesson-id> [--lang fr] [--json]');
      process.exit(1);
    }
    const lang = args.lang || 'fr';
    const mp = path.join(REPO_ROOT, 'src', 'data', 'lessons', `${args.id}.method.json`);
    if (!existsSync(mp)) {
      console.error(`✗ Lesson JSON not found: ${mp}`);
      process.exit(1);
    }
    const meta = JSON.parse(readFileSync(mp, 'utf8')).meta;

    const report = await researchLesson(meta, args.offline ? { bySeed: {} } : {});

    const outDir = path.join(REPO_ROOT, 'out', lang, args.id);
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'keywords.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    const line = '─'.repeat(72);
    console.log('\n' + line);
    console.log(`Keyword research — ${args.id}`);
    console.log(line);
    console.log(`${report.seeds.length} seeds · ${report.totalSuggestions} suggestions · ` +
                `${report.kept.length} kept · ${report.rejected.length} rejected as off-topic`);

    console.log('\nTOP SEARCHES THIS LESSON CAN HONESTLY CLAIM');
    for (const k of report.kept.slice(0, 15)) {
      console.log(`  ${k.score.toFixed(3).padStart(6)}  ${k.phrase}`);
    }

    console.log('\nREJECTED (would be a misleading tag — see the spec\'s enforcement warning)');
    for (const r of report.rejected.slice(0, 10)) console.log(`  ${r.phrase}`);

    console.log('\nTITLE CANDIDATES');
    for (const t of report.titles) console.log(`  (${String(t.length).padStart(3)}/100) ${t.title}`);

    console.log(`\nTAGS (${report.tags.join('').length}/500 chars)`);
    console.log('  ' + report.tags.join(', '));
    console.log(`\n✓ wrote ${path.relative(REPO_ROOT, outPath)}`);
    console.log('  Tags are safe to apply as-is; the title is an editorial choice.\n');
    process.exit(0);
  })();
}
