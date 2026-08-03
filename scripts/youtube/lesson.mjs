// lesson.mjs — assemble the normalised `lesson` object buildMetadata expects.
//
// Shared by publish.mjs (one lesson, about to upload) and series.mjs (every
// published lesson, about to have its links refreshed). Both need identical
// title/description/word/chapter inputs; if they diverged, a backfill would
// silently rewrite a live description into something slightly different from
// what publishing produces.
//
// Throws on bad input. Callers own how a failure is reported.

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline, deriveChapters } from './timing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function two(n) {
  return String(n).padStart(2, '0');
}

export function resolveLessonPaths(lesson, idOverride, repoRoot = REPO_ROOT) {
  const id = idOverride || `lesson-${two(lesson)}`;
  return {
    id,
    methodJson: path.join(repoRoot, 'src', 'data', 'lessons', `${id}.method.json`),
    manifest: path.join(repoRoot, 'build', id, 'manifest.json'),
    registry: path.join(repoRoot, 'assets', 'images', 'registry.json'),
    channels: path.join(repoRoot, 'config', 'channels.json'),
    video: path.join(repoRoot, 'out', `${id}-method-540p-norm.mp4`),
    thumbnail: path.join(repoRoot, 'out', 'thumbnails', `${id}.png`),
    transcript: path.join(repoRoot, 'lessons', `${id}.md`),
  };
}

/**
 * The words list is the highest-value block in the description after the hook
 * (docs/youtube-seo-spec.md), so the gloss has to be right.
 *
 * meta.glosses is authored with the lesson and aligned by position with
 * meta.items — that is the authority. The image registry is a side store that
 * merely happens to carry a gloss, and it is runtime state: an item with no
 * generated image yet has no entry, which degrades the line to "sept — sept"
 * (useless to a searcher, and it reads as a bug to a viewer).
 */
export function buildWords(meta, registry) {
  const items = (registry && registry.items) || {};
  const glosses = Array.isArray(meta.glosses) ? meta.glosses : [];
  return meta.items.map((w, i) => {
    const authored = typeof glosses[i] === 'string' ? glosses[i].trim() : '';
    const entry = items[w];
    const fromRegistry = entry && entry.gloss ? String(entry.gloss).trim() : '';
    return { word: w, gloss: authored || fromRegistry || w };
  });
}

/**
 * @param {{lang:string, lesson?:number, id?:string, links?:object, repoRoot?:string}} args
 * @returns {{P:object, lesson:object, seoConfig:object, meta:object, method:object}}
 */
export function loadLesson(args) {
  const repoRoot = args.repoRoot || REPO_ROOT;
  const P = resolveLessonPaths(args.lesson, args.id, repoRoot);

  if (!existsSync(P.methodJson)) throw new Error(`Lesson JSON missing: ${P.methodJson}`);
  if (!existsSync(P.channels)) throw new Error(`Channel config missing: ${P.channels}`);

  const method = readJson(P.methodJson);
  const meta = method.meta;
  if (!meta || !Array.isArray(meta.items)) throw new Error('Lesson JSON has no meta.items');

  const channels = readJson(P.channels);
  const seoConfig = channels[args.lang];
  if (!seoConfig) throw new Error(`No channel config for lang "${args.lang}" in config/channels.json`);

  // The registry is only a gloss fallback now, so a missing one is not fatal.
  const registry = existsSync(P.registry) ? readJson(P.registry) : { items: {} };

  // Chapters come from the lesson JSON the renderer itself consumes, so the
  // timestamps match the encoded film rather than approximating it.
  const chapters = deriveChapters(buildTimeline(method));
  const words = buildWords(meta, registry);

  // recordingDate = render date (video mtime if present, else today).
  const recordingDate = existsSync(P.video) ? statSync(P.video).mtime : new Date();

  const lesson = {
    meta,
    chapters,
    words,
    recordingDate: recordingDate.toISOString(),
    links: args.links || {},
  };

  return { P, lesson, seoConfig, meta, method };
}

export { readJson };
