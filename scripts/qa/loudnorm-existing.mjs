#!/usr/bin/env node
// Retrofit per-clip loudness normalization onto already-synthesized clips (no
// ElevenLabs calls) so every speaker sits at the same level. Fixes the FR·MAN-
// too-quiet inconsistency on lessons baked before ttsClip did per-clip loudnorm.
//   node scripts/qa/loudnorm-existing.mjs [<id>]   (default: ALL method clips)
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loudnormClip } from '../lib/eleven.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const id = process.argv[2];
const audioRoot = path.join(ROOT, 'public/assets/audio');
const lessons = id ? [id] : (existsSync(audioRoot) ? await readdir(audioRoot) : []);

let total = 0;
for (const lid of lessons) {
  const dir = path.join(audioRoot, lid, 'method');
  if (!existsSync(dir)) continue;
  const clips = (await readdir(dir)).filter((f) => f.endsWith('.mp3'));
  for (const f of clips) { await loudnormClip(path.join(dir, f)); total++; }
  console.log(`  ${lid}: ${clips.length} clips evened`);
}
console.log(`✓ loudnorm applied to ${total} clip(s)`);
