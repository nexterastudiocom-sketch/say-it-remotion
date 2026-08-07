// Shared helpers for the two-gate QA system. No side effects on import.
// Paths, process runner, tool locations, whisper word-transcription, and the
// qa/<id>.json finding writer. Each gate script imports only what it needs.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

// Render timeline facts — the film prepends an intro, so every manifest timestamp
// is offset by it. These were hardcoded at 135/90 frames (4.5s/3s) while the film
// actually renders 308/299 (10.267s/9.97s); the resulting 5.77s skew made I-05 read
// the wrong frames (12 false "French on screen" blocks) and pushed all 144 P-07
// deltas negative. Read the real values from the components so they cannot drift again.
export const FPS = 30;
function videoFrames(file, constName, fallback) {
  try {
    const src = readFileSync(path.join(ROOT, 'src/deck', file), 'utf8');
    const m = src.match(new RegExp(`${constName}\\s*=\\s*(\\d+)`));
    if (m) return Number(m[1]);
  } catch { /* fall through */ }
  return fallback;
}
export const INTRO_SECONDS = videoFrames('IntroVideo.tsx', 'INTRO_VIDEO_FRAMES', 308) / FPS;
export const OUTRO_SECONDS = videoFrames('OutroVideo.tsx', 'OUTRO_VIDEO_FRAMES', 299) / FPS;

// Tools
export const REMOTION = path.join(ROOT, 'node_modules/.bin/remotion'); // ffprobe
export function ffmpegStatic() {
  try { const p = require('ffmpeg-static'); return p && existsSync(p) ? p : null; } catch { return null; }
}
export const WHISPER_PY = process.env.WHISPER_PY || path.join(ROOT, '.venv-whisper/bin/python');

// Per-video paths. MOSAIC_QA_VIDEO overrides the render under test (e.g. to run
// the gates against a fast preview before the final 4K exists).
export const paths = (id) => ({
  bakedLesson: path.join(ROOT, `src/data/lessons/${id}.fr.json`),
  script: path.join(ROOT, `src/data/scripts/${id}.json`),
  sentMd: path.join(ROOT, `curriculum/${id}.sent.md`),
  video: process.env.MOSAIC_QA_VIDEO ? path.resolve(ROOT, process.env.MOSAIC_QA_VIDEO) : path.join(ROOT, `out/films/${id}-fr-final.mp4`),
  manifest: path.join(ROOT, `build/${id}/manifest.json`),
  qa: path.join(ROOT, `qa/${id}.json`),
  lexicon: path.join(ROOT, 'state/lexicon.json'),
});

export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, maxBuffer: 128 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: stdout || '', stderr: stderr || '', err }));
  });
}

export const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

// state/lexicon.json is written as YAML despite the .json name, so a plain
// JSON.parse throws — and that throw used to kill gate-b-i05 outright (the OCR
// check silently never ran). Read it tolerantly: JSON first, then YAML via the
// QA venv's pyyaml. Never rewrite the file — only --promote-lexicon may.
export async function readJsonOrYaml(p) {
  const raw = await readFile(p, 'utf8');
  try { return JSON.parse(raw); } catch { /* fall through to YAML */ }
  const py = process.env.QA_PY || path.join(ROOT, '.venv-ocr/bin/python');
  const r = await run(py, ['-c', 'import sys,yaml,json; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)', p]);
  if (r.code !== 0) throw new Error(`cannot parse ${p} as JSON or YAML: ${r.stderr.trim().slice(0, 200)}`);
  return JSON.parse(r.stdout);
}
export const writeJson = async (p, obj) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(obj, null, 2) + '\n'); };

// ---- qa/<id>.json findings: {gate, severity, timestamp, issue, evidence, suggested_fix}
// Each gate REPLACES its own findings and preserves the others', so gates run independently.
export async function writeFindings(id, gate, findings) {
  const p = paths(id).qa;
  let all = [];
  if (existsSync(p)) { try { all = await readJson(p); } catch { all = []; } }
  const kept = all.filter((f) => f.gate !== gate);
  const merged = [...kept, ...findings].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  await writeJson(p, merged);
  return merged;
}
export const finding = (gate, severity, timestamp, issue, evidence, suggested_fix) =>
  ({ gate, severity, timestamp: timestamp == null ? null : +Number(timestamp).toFixed(2), issue, evidence, suggested_fix });

// ---- ffprobe duration of the rendered file
export async function videoDuration(fileAbs) {
  const r = await run(REMOTION, ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fileAbs]);
  return Number(r.stdout.trim()) || 0;
}

// ---- faster-whisper word-level transcription of an audio/video file.
// Returns { language, words: [{word, start, end}], segments: [...] }.
export async function transcribeWords(fileAbs, lang) {
  const r = await run(WHISPER_PY, [path.join(ROOT, 'scripts/qa/stt_words.py'), fileAbs, lang || 'auto']);
  if (r.code !== 0) throw new Error('whisper words failed: ' + r.stderr.trim().slice(-400));
  return JSON.parse(r.stdout);
}

// ---- text normalization for French matching (accents + punctuation stripped)
export function normFr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function levenshtein(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) { const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    prev = cur; }
  return prev[n];
}
// similarity of two strings by words (0..1), robust to minor drift
export function similarity(a, b) {
  const wa = normFr(a).split(' ').filter(Boolean), wb = normFr(b).split(' ').filter(Boolean);
  if (!wa.length && !wb.length) return 1;
  if (!wa.length || !wb.length) return 0;
  const d = levenshtein(wa, wb);
  return Math.max(0, 1 - d / Math.max(wa.length, wb.length));
}
