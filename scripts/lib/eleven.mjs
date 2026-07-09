// ElevenLabs narration helper. Synthesizes a segment made of parts (each tagged
// native/en so English is spoken by an English voice in an English-only context),
// stitches parts losslessly with Remotion's bundled ffmpeg, and returns the REAL
// spoken duration so segment timing can be locked to the voice.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseFile } from 'music-metadata';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const FALLBACK = '21m00Tcm4TlvDq8ikWAM'; // Rachel (English, multilingual-capable)
export const EN_VOICE = process.env.ELEVENLABS_VOICE_EN || FALLBACK;
export const nativeVoice = (lang) =>
  process.env[`ELEVENLABS_VOICE_${lang.toUpperCase()}`] || process.env.ELEVENLABS_VOICE || FALLBACK;
export const hasElevenKey = () => Boolean(API_KEY);

async function tts(text, voiceId, model = MODEL) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
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
export async function ttsClip({ text, voiceId, model = MODEL, outAbs }) {
  await mkdir(path.dirname(outAbs), { recursive: true });
  let buf;
  try {
    buf = await tts(text, voiceId, model);
  } catch (e) {
    if (/v3/.test(model)) {
      buf = await tts(text.replace(/^\s*\[[^\]]*\]\s*/, ''), voiceId, 'eleven_multilingual_v2');
    } else throw e;
  }
  await writeFile(outAbs, buf);
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
