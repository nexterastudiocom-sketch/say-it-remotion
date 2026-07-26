#!/usr/bin/env node
// Run (and cache) the shared ASR pass for a rendered video → build/<id>/asr.json.
// The wpm / pronunciation / av-sync gates read this cache (and build it if stale).
//
//   node scripts/qa/asr.mjs <video-id> [--force]
//
// Cache is keyed on the video's mtime so it only re-runs when the render changes.

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { paths, readJson, writeJson, run, ROOT, WHISPER_PY } from './lib.mjs';

export async function ensureAsr(id, { force = false } = {}) {
  const P = paths(id);
  if (!existsSync(P.video)) throw new Error(`no render: ${P.video}`);
  if (!existsSync(P.manifest)) throw new Error(`no manifest — run: node scripts/qa/manifest.mjs ${id}`);
  const cachePath = path.join(ROOT, `build/${id}/asr.json`);
  const videoMtime = statSync(P.video).mtimeMs;
  if (!force && existsSync(cachePath)) {
    const cached = await readJson(cachePath);
    if (cached._videoMtime === videoMtime) return cached;
  }
  const manifest = await readJson(P.manifest);
  const windows = manifest.lines.filter((r) => r.kind === 'french')
    .map((r) => ({ index: r.index, start: r.videoStart, end: r.videoEnd }));
  const winPath = path.join(ROOT, `build/${id}/asr-windows.json`);
  await writeJson(winPath, windows);
  const r = await run(WHISPER_PY, [path.join(ROOT, 'scripts/qa/asr.py'), P.video, winPath], { maxBuffer: 256 * 1024 * 1024 });
  if (r.code !== 0) throw new Error('asr.py failed: ' + r.stderr.trim().slice(-500));
  const asr = JSON.parse(r.stdout);
  asr._videoMtime = videoMtime;
  await writeJson(cachePath, asr);
  return asr;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2] || 'lesson-01';
  console.log(`Transcribing ${id} (full word-timestamps + French windows) — a few minutes…`);
  const asr = await ensureAsr(id, { force: process.argv.includes('--force') });
  console.log(`✓ asr → build/${id}/asr.json  (lang=${asr.language}, ${asr.words.length} words, ${asr.windows.length} French windows)`);
}
