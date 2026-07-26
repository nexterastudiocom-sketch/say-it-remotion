// Package one lesson into a self-contained, RELOADABLE project archive.
//
//   node scripts/pipeline/bundle.mjs <lessonId>
//
// The zip preserves repo-relative paths, so unzipping it at the repo root
// restores every source the local studio editor needs — transcript, parsed
// script, baked timeline, all audio clips, referenced images, the cover, and the
// pipeline config — then `npm run studio` opens it exactly as it was. A
// project.json manifest + README.txt describe how to reload.
//
// Output: pipeline/publish/<id>/<id>-project.zip  (+ the final video is copied
// alongside by the publish step). Nothing is uploaded here — see orchestrate.mjs `publish`.

import { readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, run, nowISO, hashFiles } from './lib.mjs';

export async function buildBundle(lessonId) {
  const lessonRel = `src/data/lessons/${lessonId}.fr.json`;
  const lessonAbs = path.join(ROOT, lessonRel);
  if (!existsSync(lessonAbs)) throw new Error(`no baked lesson: ${lessonRel}`);
  const lesson = JSON.parse(await readFile(lessonAbs, 'utf8'));

  // Reloadable source set (repo-relative paths, preserved in the zip).
  const files = new Set([
    `curriculum/${lessonId}.sent.md`,
    `src/data/scripts/${lessonId}.json`,
    lessonRel,
    'config/pipeline.json',
    'config/languages.json',
  ]);
  // audio clips + images actually referenced by the timeline
  for (const s of lesson.slides) {
    if (s.imageSrc) files.add(path.join('public', s.imageSrc.replace(/^\//, '')));
    for (const b of s.beats || []) if (b.src) files.add(path.join('public', b.src));
  }
  const coverRel = `public/assets/covers/${lessonId}.png`;
  if (existsSync(path.join(ROOT, coverRel))) files.add(coverRel);

  const present = [...files].filter((f) => existsSync(path.join(ROOT, f)));
  const missing = [...files].filter((f) => !existsSync(path.join(ROOT, f)));

  const outDir = path.join(ROOT, 'pipeline/publish', lessonId);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // manifest + README travel INSIDE the zip too (staged first)
  const manifest = {
    lessonId, title: lesson.title, builtAt: nowISO(),
    sourceHash: await hashFiles([`curriculum/${lessonId}.sent.md`, `src/data/scripts/${lessonId}.json`]),
    fileCount: present.length, missing,
    reload: `Unzip at the repo root (say-it-remotion/), then run "npm run studio" and open ${lessonId}.`,
    entryPoints: {
      transcript: `curriculum/${lessonId}.sent.md`,
      timeline: lessonRel,
      studio: 'npm run studio',
    },
  };
  const manifestRel = `pipeline/publish/${lessonId}/project.json`;
  await writeFile(path.join(ROOT, manifestRel), JSON.stringify(manifest, null, 2) + '\n');
  const readmeRel = `pipeline/publish/${lessonId}/README.txt`;
  await writeFile(path.join(ROOT, readmeRel),
    `Say It — ${lesson.title}\n\nThis archive is a complete, re-editable project for one lesson.\n\n` +
    `TO RELOAD ON ANY MACHINE:\n` +
    `  1. Clone/open the say-it-remotion repo.\n` +
    `  2. Unzip ${lessonId}-project.zip at the repo ROOT (paths are preserved).\n` +
    `  3. Add your .env (ELEVENLABS + RECRAFT keys) — secrets are NOT in this bundle.\n` +
    `  4. npm run studio   → open "${lessonId}" to edit transcript / rebuild audio / re-render.\n\n` +
    `Contents: transcript, parsed script, baked timeline, ${present.length} asset files, cover, config.\n`);

  const zipRel = `pipeline/publish/${lessonId}/${lessonId}-project.zip`;
  const zipAbs = path.join(ROOT, zipRel);
  // zip preserving repo-relative paths (run from ROOT); include the staged manifest/readme
  const r = await run('zip', ['-q', '-r', zipAbs, ...present, manifestRel, readmeRel], { cwd: ROOT });
  if (r.code !== 0) throw new Error('zip failed: ' + r.stderr.trim());

  return { zipRel, manifestRel, readmeRel, fileCount: present.length, missing, outDir: `pipeline/publish/${lessonId}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2] || 'lesson-01';
  const res = await buildBundle(id);
  console.log(`✓ ${res.zipRel}  (${res.fileCount} files${res.missing.length ? `, ${res.missing.length} missing` : ''})`);
  if (res.missing.length) console.log('  missing:', res.missing.join(', '));
}
