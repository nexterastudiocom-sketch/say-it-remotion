// localize.mjs — translated titles and descriptions, so each course is findable
// by people who are not searching in English.
//
//   node --env-file=.env scripts/youtube/localize.mjs --id <lesson-id> --lang fr \
//        [--locales es,pt,de,it] [--dry-run] [--force]
//
// YouTube serves `localizations` by the viewer's UI language. The spec parks
// this as "worth adding later" — later is now, because it is the one lever that
// opens a French course to the enormous population learning French who do not
// type English into the search box. The metadata is translated; the video is
// untouched.
//
// THE RULE THAT MAKES THIS SAFE
// The description is not prose. It contains the French words being taught, exact
// chapter timestamps, and URLs. A translator that renders "sept — seven" as
// "siete — siete" has destroyed the lesson's meaning; one that renders "7:09" as
// "7.09" silently disables YouTube's chapters. So the French items, every
// timestamp and every URL are treated as invariants: extracted from the English
// original, required verbatim in the translation, and the result is REJECTED if
// any went missing. A model instruction alone is not a guarantee — the check is.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Default targets: the languages Mosaic already builds courses for. Adding a
// locale is cheap, but each one is a claim we serve that audience, so the
// default stays with audiences the project has actually committed to.
export const DEFAULT_LOCALES = ['es', 'pt', 'de', 'it'];

const LOCALE_NAMES = {
  es: 'Spanish', pt: 'Portuguese', de: 'German', it: 'Italian', fr: 'French',
  ja: 'Japanese', ko: 'Korean', ru: 'Russian', tr: 'Turkish', pl: 'Polish',
  nl: 'Dutch', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic', vi: 'Vietnamese',
  'zh-Hans': 'Simplified Chinese', 'pt-BR': 'Brazilian Portuguese',
};

export function localeName(code) {
  return LOCALE_NAMES[code] || code;
}

// --- invariants -------------------------------------------------------------

/**
 * The parts of a description that must survive translation byte-for-byte.
 *
 * @param {string} description
 * @param {string[]} items  the target-language words the lesson teaches
 */
export function extractInvariants(description, items = []) {
  const text = String(description);
  return {
    // Chapter timestamps: 0:00, 7:09, 1:02:03
    timestamps: [...text.matchAll(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s/gm)].map((m) => m[1]),
    urls: [...text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0].replace(/[.,)]+$/, '')),
    // Only the items that genuinely appear — a lesson JSON may list an item the
    // description does not print.
    items: items.filter((w) => text.includes(w)),
    hashtags: [...text.matchAll(/#\w+/g)].map((m) => m[0]),
  };
}

/**
 * Throw unless every invariant survived. Reports everything wrong at once so a
 * retry can fix it in one pass.
 */
export function verifyLocalization({ title, description }, invariants, locale) {
  const problems = [];

  if (typeof title !== 'string' || !title.trim()) problems.push('empty title');
  else if (title.length > 100) problems.push(`title is ${title.length} chars (max 100)`);

  if (typeof description !== 'string' || !description.trim()) problems.push('empty description');
  else if (description.length > 5000) problems.push(`description is ${description.length} chars (max 5000)`);

  const d = String(description || '');

  const missingWords = invariants.items.filter((w) => !d.includes(w));
  if (missingWords.length) {
    problems.push(
      `the taught words were altered or dropped: ${missingWords.slice(0, 8).join(', ')}` +
      ` — these must stay in the target language, never translated`
    );
  }

  const missingStamps = invariants.timestamps.filter((t) => !d.includes(t));
  if (missingStamps.length) {
    problems.push(
      `chapter timestamps changed: ${missingStamps.slice(0, 6).join(', ')}` +
      ` — YouTube stops rendering chapters if these do not parse`
    );
  }

  const missingUrls = invariants.urls.filter((u) => !d.includes(u));
  if (missingUrls.length) problems.push(`URLs changed: ${missingUrls.slice(0, 4).join(', ')}`);

  if (problems.length) {
    const e = new Error(`localization (${locale}) rejected:\n  - ${problems.join('\n  - ')}`);
    e.problems = problems;
    throw e;
  }
  return true;
}

// --- prompt -----------------------------------------------------------------

export function buildPrompt({ title, description, locale, courseLang, items }) {
  const target = localeName(locale);
  const course = localeName(courseLang);
  return [
    `Translate the YouTube title and description below into ${target}.`,
    '',
    `This is metadata for a lesson that teaches ${course} to beginners. The audience`,
    `reads ${target}; the language being taught is ${course}.`,
    '',
    'Rules:',
    `1. NEVER translate the ${course} words being taught. They are the subject of the`,
    `   lesson. In a line like "sept — seven", "sept" is ${course} and stays exactly as`,
    `   written; only the explanation after the dash becomes ${target}.`,
    `   The ${course} words in this lesson are: ${items.join(', ')}`,
    '2. Copy every timestamp exactly (0:00, 7:09). Do not reformat or re-time them.',
    '3. Copy every URL exactly.',
    '4. Keep the same line structure, blank lines, emoji and section order.',
    `5. Translate hashtags into natural ${target} equivalents, keeping the # prefix.`,
    '6. The title must be at most 100 characters; the description at most 5000.',
    '7. Keep the tone plain and instructional. Do not add marketing language.',
    '',
    'Return ONLY a JSON object, no prose, no code fence:',
    '{"title": "...", "description": "..."}',
    '',
    '--- TITLE ---',
    title,
    '',
    '--- DESCRIPTION ---',
    description,
  ].join('\n');
}

/** Pull the JSON object out of a model response that may be fenced or padded. */
export function parseModelJson(text) {
  const s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model returned no JSON object');
  const obj = JSON.parse(s.slice(start, end + 1));
  if (typeof obj.title !== 'string' || typeof obj.description !== 'string') {
    throw new Error('model JSON is missing title/description');
  }
  return { title: obj.title.trim(), description: obj.description };
}

// --- translation ------------------------------------------------------------

/**
 * Translate into one locale, retrying once with the specific failures fed back.
 *
 * @param {object} args
 * @param {(p:{system:string,user:string})=>Promise<{text:string}>} [args.generate]
 *        injectable for tests; defaults to the project's Claude client
 */
export async function localizeOne({
  title, description, locale, courseLang, items, generate, maxAttempts = 2,
}) {
  const invariants = extractInvariants(description, items);
  const gen = generate || (async (p) => {
    const { generateText } = await import('../claude-client.mjs');
    return generateText(p);
  });

  const system =
    'You are a professional localiser of educational video metadata. You translate ' +
    'precisely and never alter content that is being taught, quoted, or used as data.';

  let prompt = buildPrompt({ title, description, locale, courseLang, items });
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let candidate;
    try {
      const { text } = await gen({ system, user: prompt });
      candidate = parseModelJson(text);
      verifyLocalization(candidate, invariants, locale);
      return { ...candidate, locale, attempts: attempt };
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts) break;
      prompt =
        buildPrompt({ title, description, locale, courseLang, items }) +
        `\n\nYour previous attempt was rejected for these reasons. Fix them exactly:\n` +
        (e.problems ? e.problems.map((p) => `- ${p}`).join('\n') : `- ${e.message}`);
    }
  }
  throw lastError;
}

/**
 * Translate into several locales. One bad locale never sinks the rest — a
 * partial set of verified localizations is strictly better than none.
 */
export async function localizeAll({
  title, description, locales, courseLang, items, generate, onProgress,
}) {
  const localizations = {};
  const failures = [];
  for (const locale of locales) {
    try {
      const r = await localizeOne({ title, description, locale, courseLang, items, generate });
      localizations[locale] = { title: r.title, description: r.description };
      if (onProgress) onProgress({ locale, ok: true, attempts: r.attempts });
    } catch (e) {
      failures.push({ locale, error: (e && e.message) || String(e) });
      if (onProgress) onProgress({ locale, ok: false, error: (e && e.message) || String(e) });
    }
  }
  return { localizations, failures };
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--id': args.id = next(); break;
      case '--lang': args.lang = next(); break;
      case '--locales': args.locales = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--dry-run': args.dryRun = true; break;
      case '--force': args.force = true; break;
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
      console.error('Usage: node --env-file=.env scripts/youtube/localize.mjs --id <lesson-id> [--lang fr] [--locales es,pt,de,it]');
      process.exit(1);
    }
    const lang = args.lang || 'fr';
    const locales = args.locales || DEFAULT_LOCALES;

    try {
      const { loadLesson } = await import('./lesson.mjs');
      const { buildMetadata } = await import('./metadata.mjs');
      const { resolveLinksForLesson } = await import('./series.mjs');

      const method = JSON.parse(
        readFileSync(path.join(REPO_ROOT, 'src', 'data', 'lessons', `${args.id}.method.json`), 'utf8')
      );
      const lessonNo = method.meta.lesson;
      const { lesson, seoConfig } = loadLesson({
        lang, lesson: lessonNo, id: args.id, links: resolveLinksForLesson(lang, lessonNo),
      });
      const resource = buildMetadata(lesson, {}, seoConfig);
      const items = lesson.words.map((w) => w.word);

      const outDir = path.join(REPO_ROOT, 'out', lang, args.id);
      const outPath = path.join(outDir, 'localizations.json');

      if (existsSync(outPath) && !args.force && !args.dryRun) {
        console.log(`✓ ${path.relative(REPO_ROOT, outPath)} already exists (--force to regenerate).`);
        process.exit(0);
      }

      if (args.dryRun) {
        const inv = extractInvariants(resource.snippet.description, items);
        console.log(`\nDRY RUN — ${args.id} → ${locales.join(', ')}`);
        console.log(`  invariants that must survive translation:`);
        console.log(`    ${inv.items.length} taught words (never translated)`);
        console.log(`    ${inv.timestamps.length} chapter timestamps`);
        console.log(`    ${inv.urls.length} URLs`);
        console.log('\n  No API calls made.\n');
        process.exit(0);
      }

      console.log(`\nLocalising ${args.id} → ${locales.join(', ')}`);
      const { localizations, failures } = await localizeAll({
        title: resource.snippet.title,
        description: resource.snippet.description,
        locales,
        courseLang: lang,
        items,
        onProgress: ({ locale, ok, attempts, error }) =>
          console.log(ok ? `  ✓ ${locale} (attempt ${attempts})` : `  ✗ ${locale} — ${error}`),
      });

      mkdirSync(outDir, { recursive: true });
      writeFileSync(outPath, JSON.stringify(localizations, null, 2) + '\n', 'utf8');
      console.log(`\n✓ wrote ${path.relative(REPO_ROOT, outPath)} (${Object.keys(localizations).length} locale(s))`);
      if (failures.length) {
        console.log(`⚠ ${failures.length} locale(s) failed verification and were omitted:`);
        for (const f of failures) console.log(`    ${f.locale}`);
      }
      process.exit(0);
    } catch (e) {
      console.error(`\n✗ ${(e && e.message) || e}`);
      process.exit(1);
    }
  })();
}
