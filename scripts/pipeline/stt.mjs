// Speech-to-text backend + scoring for the pronunciation gate.
//
// The gate answers ONE question honestly: "does the French the voice actually
// SAYS match the French the curriculum INTENDED?" We transcribe each FR clip and
// compare the transcription to the expected card text. No engine → no claim.
//
// Backends, in priority order (first available wins):
//   1. OpenAI transcription API   (OPENAI_API_KEY)         — accurate, costs $
//   2. faster-whisper venv        (.venv-whisper, or $WHISPER_PY) — local, free, no system ffmpeg
//   3. openai-whisper CLI         (`whisper` on PATH)      — local, free (needs ffmpeg)
//   4. whisper.cpp                (`whisper-cli`/`main` + WHISPER_CPP_MODEL)
// If none is available, detectBackend() returns null and the caller reports
// needs-review — never a pass.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, run } from './lib.mjs';

// ---- text normalization + similarity (pure, unit-tested) -------------------
export function normalizeFr(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[’']/g, ' ')                             // elisions → boundaries (l'ami → l ami)
    .replace(/[^a-z0-9\s]/g, ' ')                      // drop punctuation
    .replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

// Confidence = the BETTER of word-level (1 − WER) and char-level (despaced)
// similarity. The char-level pass makes the score robust to the deliberate
// slow syllable-break teaching clips — "Bon... jour" (2 "words") vs the heard
// "Bonjour" (1 word) is a perfect char match — while still catching a genuinely
// wrong word (both scores stay low). 1.0 = said exactly the intended French.
export function pronunciationConfidence(expected, heard) {
  const e = normalizeFr(expected).split(' ').filter(Boolean);
  const h = normalizeFr(heard).split(' ').filter(Boolean);
  if (!e.length) return heard && heard.trim() ? 0 : 1;
  const wordConf = Math.max(0, 1 - levenshtein(e, h) / e.length);
  const ec = e.join('').split(''), hc = h.join('').split('');
  const charConf = ec.length ? Math.max(0, 1 - levenshtein(ec, hc) / ec.length) : (hc.length ? 0 : 1);
  return Math.max(wordConf, charConf);
}

// ---- backend detection -----------------------------------------------------
export async function detectBackend() {
  if (process.env.OPENAI_API_KEY) return { name: 'openai-api', transcribe: openaiTranscribe };
  const py = process.env.WHISPER_PY || path.join(ROOT, '.venv-whisper/bin/python');
  if (existsSync(py)) return { name: 'faster-whisper', transcribe: (f, l) => fasterWhisperTranscribe(py, f, l) };
  if (await onPath('whisper')) return { name: 'whisper-cli', transcribe: whisperCliTranscribe };
  for (const bin of ['whisper-cli', 'main']) {
    if (process.env.WHISPER_CPP_MODEL && await onPath(bin)) return { name: `whisper.cpp(${bin})`, transcribe: (f, l) => whisperCppTranscribe(bin, f, l) };
  }
  return null;
}

async function fasterWhisperTranscribe(py, fileAbs, lang) {
  const r = await run(py, [path.join(ROOT, 'scripts/pipeline/stt_transcribe.py'), fileAbs, lang]);
  if (r.code !== 0) throw new Error('faster-whisper failed: ' + r.stderr.trim().slice(-200));
  return r.stdout.trim();
}

async function onPath(cmd) {
  const r = await run('which', [cmd]).catch(() => ({ code: 1 }));
  return r.code === 0;
}

async function openaiTranscribe(fileAbs, lang) {
  const buf = await readFile(fileAbs);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), path.basename(fileAbs));
  form.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1');
  form.append('language', lang);
  form.append('response_format', 'json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).text || '';
}

async function whisperCliTranscribe(fileAbs, lang) {
  const outDir = path.join(ROOT, 'pipeline/.stt-tmp');
  await mkdir(outDir, { recursive: true });
  const model = process.env.WHISPER_MODEL || 'base';
  const r = await run('whisper', [fileAbs, '--language', lang === 'fr' ? 'French' : lang,
    '--model', model, '--output_format', 'txt', '--output_dir', outDir, '--fp16', 'False']);
  if (r.code !== 0) throw new Error('whisper CLI failed: ' + r.stderr.trim().slice(-200));
  const txt = path.join(outDir, path.basename(fileAbs).replace(/\.[^.]+$/, '.txt'));
  return existsSync(txt) ? (await readFile(txt, 'utf8')).trim() : '';
}

async function whisperCppTranscribe(bin, fileAbs, lang) {
  const outBase = path.join(ROOT, 'pipeline/.stt-tmp', path.basename(fileAbs).replace(/\.[^.]+$/, ''));
  await mkdir(path.dirname(outBase), { recursive: true });
  const r = await run(bin, ['-m', process.env.WHISPER_CPP_MODEL, '-l', lang, '-otxt', '-of', outBase, fileAbs]);
  if (r.code !== 0) throw new Error('whisper.cpp failed: ' + r.stderr.trim().slice(-200));
  return existsSync(outBase + '.txt') ? (await readFile(outBase + '.txt', 'utf8')).trim() : '';
}

export async function cleanupStt() {
  const d = path.join(ROOT, 'pipeline/.stt-tmp');
  if (existsSync(d)) await rm(d, { recursive: true, force: true });
}
