// ElevenLabs narration helper. Synthesizes a segment made of parts (each tagged
// native/en so English is spoken by an English voice in an English-only context),
// stitches parts losslessly with Remotion's bundled ffmpeg, and returns the REAL
// spoken duration so segment timing can be locked to the voice.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseFile } from 'music-metadata';

const require = createRequire(import.meta.url);
let FFMPEG = null;
try { FFMPEG = require('ffmpeg-static'); } catch { /* trimming becomes a no-op */ }

// ElevenLabs v3 occasionally pads a short clip with up to ~2s of trailing (or
// leading) silence — especially when the line carries an audio tag. That dead
// air inflates the beat duration and desyncs P(beat) timing, so trim near-silent
// heads/tails from every clip, keeping a small 80ms cushion so nothing clips.
async function trimSilence(fileAbs) {
  if (!FFMPEG) return;
  const tmp = fileAbs.replace(/\.mp3$/i, '.trim.mp3');
  const th = '-40dB';
  const filt =
    `silenceremove=start_periods=1:start_silence=0.08:start_threshold=${th}:detection=peak,` +
    `areverse,` +
    `silenceremove=start_periods=1:start_silence=0.08:start_threshold=${th}:detection=peak,` +
    `areverse`;
  try {
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-nostats', '-i', fileAbs, '-af', filt, tmp], { stdio: 'pipe' });
    await writeFile(fileAbs, await readFile(tmp));
  } catch { /* leave the original clip untouched on any ffmpeg hiccup */ }
  finally { await rm(tmp, { force: true }); }
}

// Time-stretch a clip to `ratio`× its real speed (pitch preserved). Used to make
// French play at a fraction of natural conversational speed for comprehension —
// ElevenLabs' own speed param floors at 0.7, so anything slower is done here.
// ffmpeg atempo only accepts 0.5–100, so ratios below 0.5 are chained.
export async function atempoStretch(fileAbs, ratio) {
  if (!FFMPEG || !ratio || Math.abs(ratio - 1) < 0.001) return;
  const factors = [];
  let r = ratio;
  while (r < 0.5) { factors.push(0.5); r /= 0.5; }
  factors.push(r);
  const tmp = fileAbs.replace(/\.mp3$/i, '.tempo.mp3');
  try {
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-nostats', '-i', fileAbs, '-af', factors.map((f) => `atempo=${f.toFixed(4)}`).join(','), tmp], { stdio: 'pipe' });
    await writeFile(fileAbs, await readFile(tmp));
  } catch { /* keep the original on any ffmpeg hiccup */ }
  finally { await rm(tmp, { force: true }); }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';
const FALLBACK = '21m00Tcm4TlvDq8ikWAM'; // Rachel (English, multilingual-capable)
export const EN_VOICE = process.env.ELEVENLABS_VOICE_EN || FALLBACK;
export const nativeVoice = (lang) =>
  process.env[`ELEVENLABS_VOICE_${lang.toUpperCase()}`] || process.env.ELEVENLABS_VOICE || FALLBACK;
export const hasElevenKey = () => Boolean(API_KEY);

async function tts(text, voiceId, model = MODEL, speed = 1) {
  // ElevenLabs clamps speed to [0.7, 1.2]; the Method's rate tags map into that
  // band (very_slow→0.7 … fast→1.2) so slow-input beats are actually slow.
  const spd = Math.min(1.2, Math.max(0.7, speed || 1));
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: spd },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Synthesize a single clip; returns its duration (s). `text` may start with an
 * Eleven v3 audio tag like "[warmly] …". If the requested (v3) model fails, it
 * retries once on Multilingual v2 with the tag stripped — so a lack of v3 access
 * degrades gracefully instead of aborting the whole lesson.
 */
export async function ttsClip({ text, voiceId, model = MODEL, outAbs, speed = 1, atempo = 1 }) {
  await mkdir(path.dirname(outAbs), { recursive: true });
  let buf;
  try {
    buf = await tts(text, voiceId, model, speed);
  } catch (e) {
    if (/v3/.test(model)) {
      buf = await tts(text.replace(/^\s*\[[^\]]*\]\s*/, ''), voiceId, 'eleven_multilingual_v2', speed);
    } else throw e;
  }
  await writeFile(outAbs, buf);
  await trimSilence(outAbs);
  // Slow the clip to `atempo`× real speed (comprehension pacing) after trimming,
  // so the reported duration reflects the stretched clip.
  await atempoStretch(outAbs, atempo);
  const { format } = await parseFile(outAbs);
  return format.duration || 0;
}

/**
 * Synthesize one segment. `parts` = [{text, voice:'native'|'en'}].
 * Writes the stitched mp3 to `outAbs`; returns spoken duration in seconds.
 */
export async function synthSegment({ parts, nat, remotionBin, outAbs, tmpDir, id }) {
  await mkdir(path.dirname(outAbs), { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const partFiles = [];
  for (let i = 0; i < parts.length; i++) {
    const voiceId = parts[i].voice === 'en' ? EN_VOICE : nat;
    const pf = path.join(tmpDir, `${id}.${i}.mp3`);
    await writeFile(pf, await tts(parts[i].text, voiceId));
    partFiles.push(pf);
  }

  if (partFiles.length === 1) {
    await writeFile(outAbs, await readFile(partFiles[0]));
  } else {
    const list = path.join(tmpDir, `${id}.txt`);
    await writeFile(list, partFiles.map((f) => `file '${f}'`).join('\n') + '\n');
    execFileSync(remotionBin, ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outAbs], {
      stdio: 'pipe',
    });
  }

  const { format } = await parseFile(outAbs);
  return format.duration || 0;
}

export async function cleanup(tmpDir) {
  await rm(tmpDir, { recursive: true, force: true });
}
