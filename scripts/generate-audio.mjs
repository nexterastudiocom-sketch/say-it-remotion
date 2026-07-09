// Generate per-segment narration with ElevenLabs and capture the ACTUAL audio
// duration so each lesson segment's timing matches the voice exactly.
//
// Each segment can mix languages: parts tagged "native" use the language voice,
// parts tagged "en" use an English voice spoken in an English-only context, so
// the English translation is pronounced natively (not with the target accent).
// Parts are stitched into one clip with Remotion's bundled ffmpeg (lossless).
//
// Usage:
//   npm run audio            # all languages
//   npm run audio -- fr es   # only these languages
//
// Reads   src/data/narration/lesson-04.<lang>.json
// Writes  public/assets/audio/lesson-04/<lang>/<segmentId>.mp3
//         src/data/audio/manifest.<lang>.json   (durations + audioSrc)
//
// Keys come from .env (loaded via `node --env-file=.env`). Never hard-code them.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTION = path.join(ROOT, 'node_modules/.bin/remotion'); // bundles ffmpeg
const LESSON_ID = 'lesson-04';
const TAIL_PAD = 0.6; // seconds held after speech ends
const ALL_LANGS = ['fr', 'es', 'it', 'pt', 'de'];

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('\n✗ ELEVENLABS_API_KEY is not set.\n  Add it to .env (see .env.example), then run `npm run audio`.\n');
  process.exit(1);
}
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const FALLBACK = '21m00Tcm4TlvDq8ikWAM'; // Rachel (English; multilingual-capable)
const EN_VOICE = process.env.ELEVENLABS_VOICE_EN || FALLBACK;
const nativeVoice = (lang, fromFile) =>
  fromFile || process.env[`ELEVENLABS_VOICE_${lang.toUpperCase()}`] || process.env.ELEVENLABS_VOICE || FALLBACK;

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ALL_LANGS;

async function tts(text, voiceId) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const partsOf = (seg) => seg.parts ?? (seg.text ? [{ text: seg.text, voice: 'native' }] : []);

for (const lang of langs) {
  const narrPath = path.join(ROOT, 'src/data/narration', `${LESSON_ID}.${lang}.json`);
  if (!existsSync(narrPath)) {
    console.warn(`• ${lang}: no narration file — skipping`);
    continue;
  }
  const narr = JSON.parse(await readFile(narrPath, 'utf8'));
  const nat = nativeVoice(lang, narr.voiceId);
  const outDir = path.join(ROOT, 'public/assets/audio', LESSON_ID, lang);
  const tmpDir = path.join(outDir, '_parts');
  await mkdir(tmpDir, { recursive: true });

  console.log(`\n▶ ${lang}  (native ${nat}, english ${EN_VOICE}, model ${MODEL})`);
  const segments = {};
  for (const seg of narr.segments) {
    const parts = partsOf(seg);
    if (!parts.length) {
      segments[seg.id] = { durationInSeconds: seg.minSeconds ?? 3 };
      console.log(`  · ${seg.id}: (no speech) → ${segments[seg.id].durationInSeconds}s`);
      continue;
    }
    process.stdout.write(`  · ${seg.id}: `);

    // Synthesize each part with its voice.
    const partFiles = [];
    for (let i = 0; i < parts.length; i++) {
      const voiceId = parts[i].voice === 'en' ? EN_VOICE : nat;
      const buf = await tts(parts[i].text, voiceId);
      const pf = path.join(tmpDir, `${seg.id}.${i}.mp3`);
      await writeFile(pf, buf);
      partFiles.push(pf);
    }

    const rel = `assets/audio/${LESSON_ID}/${lang}/${seg.id}.mp3`;
    const abs = path.join(ROOT, 'public', rel);
    if (partFiles.length === 1) {
      await writeFile(abs, await readFile(partFiles[0]));
    } else {
      // Lossless concat of same-format mp3 parts via ffmpeg concat demuxer.
      const list = path.join(tmpDir, `${seg.id}.txt`);
      await writeFile(list, partFiles.map((f) => `file '${f}'`).join('\n') + '\n');
      execFileSync(REMOTION, ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', abs], { stdio: 'pipe' });
    }

    const { format } = await parseFile(abs);
    const spoken = format.duration || 0;
    const durationInSeconds = +Math.max(spoken + TAIL_PAD, seg.minSeconds || 0).toFixed(2);
    segments[seg.id] = { audioSrc: rel, durationInSeconds };
    console.log(`${parts.length} part(s), ${spoken.toFixed(2)}s spoken → ${durationInSeconds}s segment`);
  }

  await rm(tmpDir, { recursive: true, force: true });
  const manifestPath = path.join(ROOT, 'src/data/audio', `manifest.${lang}.json`);
  await writeFile(manifestPath, JSON.stringify({ lessonId: LESSON_ID, voiceId: nat, segments }, null, 2) + '\n');
  console.log(`  ✓ wrote ${path.relative(ROOT, manifestPath)} (${Object.keys(segments).length} segments)`);
}

console.log('\nDone. Reload Remotion studio (or re-render) to hear the narration with matched timing.\n');
