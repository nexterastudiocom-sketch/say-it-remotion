// Say It — local control panel server.
// Runs on your Mac; drives the existing pipeline (parse-sent → build-from-script
// → Remotion render) plus per-clip ElevenLabs and per-image Recraft regeneration.
// No cloud, no new deps — Node's built-in http + the scripts already here.
//
// Launch:  npm run studio   →   open http://localhost:4599
//
// API keys come from .env (node --env-file=.env) and never leave this machine.

import http from 'node:http';
import { readFile, writeFile, stat, mkdir, readdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ttsClip } from './lib/eleven.mjs';
import { generateImage } from './recraft-client.mjs';
import { STYLE_DESCRIPTOR } from './style-lock.mjs';
import { generateText, hasAnthropicKey } from './claude-client.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(ROOT, 'studio-ui');
const LID = 'lesson-01';
const LANG = 'fr';
const PORT = 4599;

const SENT = path.join(ROOT, 'curriculum', `${LID}.sent.md`);
const LESSON = path.join(ROOT, 'src/data/lessons', `${LID}.${LANG}.json`);
const IMG_MANIFEST = path.join(ROOT, 'src/data/images/manifest.json');
const CONFIG = path.join(ROOT, 'config/languages.json');
const PROJECTS = path.join(ROOT, 'projects');
const REMOTION_BIN = path.join(ROOT, 'node_modules/.bin/remotion');
const NODE = process.execPath;

const runOnce = (cmd, args) => new Promise((resolve) => {
  const c = spawn(cmd, args, { cwd: ROOT, env: process.env }); let out = '';
  c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
  c.on('close', (code) => resolve({ code, out }));
});

const VOICE_ENV = {
  en_man: 'ELEVENLABS_VOICE_EN_MAN', en_woman: 'ELEVENLABS_VOICE_EN_WOMAN',
  fr_man: 'ELEVENLABS_VOICE_FR_WOMAN', fr_woman: 'ELEVENLABS_VOICE_FR_WOMAN', // one French voice
};
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg' };

const readJSON = async (p, fb) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fb);
const sendJSON = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });

// Serve a file with HTTP Range support (needed for <video> seeking on the MP4).
async function serveFile(req, res, abs) {
  if (!existsSync(abs)) { res.writeHead(404); return res.end('not found'); }
  const { size } = await stat(abs);
  const type = MIME[path.extname(abs)] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = parseInt(s, 10), end = e ? parseInt(e, 10) : size - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1, 'Content-Type': type });
    return createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Length': size, 'Content-Type': type, 'Cache-Control': 'no-cache' });
  createReadStream(abs).pipe(res);
}

// Run a child process, streaming its stdout/stderr to the client as SSE lines.
function sseRun(res, cmd, args) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const child = spawn(cmd, args, { cwd: ROOT, env: process.env });
  const pipe = (buf) => String(buf).split(/\r?\n/).filter(Boolean).forEach((line) => send({ line }));
  child.stdout.on('data', pipe);
  child.stderr.on('data', pipe);
  child.on('close', (code) => { send({ done: true, code }); res.end(); });
  res.on('close', () => child.kill());
}

// Gather the editable state: transcript + baked slides/beats + image list.
async function state() {
  const transcript = existsSync(SENT) ? await readFile(SENT, 'utf8') : '';
  const lesson = await readJSON(LESSON, { slides: [] });
  const imgs = (await readJSON(IMG_MANIFEST, { segments: {} })).segments || {};
  const sc = await readJSON(path.join(ROOT, 'src/data/images', `scenes.${LID}.json`), { segments: [] });
  const scenes = Object.fromEntries((sc.segments || []).map((s) => [s.id, s.scenes ? s.scenes.join(' | ') : s.scene || '']));
  return { lessonId: LID, lang: LANG, transcript, lesson, images: imgs, scenes };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    // ---- static UI ----
    if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(UI, 'index.html'));
    if (p === '/app.js' || p === '/app.css') return serveFile(req, res, path.join(UI, p.slice(1)));
    // ---- assets (audio / images / rendered films) ----
    if (p.startsWith('/assets/')) return serveFile(req, res, path.join(ROOT, 'public', p.slice(1)));
    if (p.startsWith('/film/')) return serveFile(req, res, path.join(ROOT, 'out/films', p.slice(6)));

    // ---- API ----
    if (p === '/api/state') return sendJSON(res, await state());

    if (p === '/api/transcript' && req.method === 'POST') {
      const { text } = await body(req);
      await writeFile(SENT, text);
      return sendJSON(res, { ok: true });
    }

    // Full rebuild: parse the transcript, then (re)generate audio + bake timings.
    if (p === '/api/build') {
      return sseRun(res, NODE, ['-e', `
        const { execFileSync } = require('node:child_process');
        execFileSync(process.execPath, ['scripts/parse-sent.mjs', 'curriculum/${LID}.sent.md', '${LID}'], { stdio: 'inherit' });
        execFileSync(process.execPath, ['scripts/build-from-script.mjs', '--force'], { stdio: 'inherit', env: process.env });
      `]);
    }

    // Full render of the intro→lesson→outro film.
    if (p === '/api/render') {
      return sseRun(res, path.join(ROOT, 'node_modules/.bin/remotion'),
        ['render', 'src/index.ts', 'Lesson-01-FR', `out/films/${LID}-studio.mp4`]);
    }

    // Regenerate ONE audio clip (ElevenLabs) in place; return its new duration.
    if (p === '/api/clip' && req.method === 'POST') {
      const { src, text, voice } = await body(req);
      const voiceId = process.env[VOICE_ENV[voice]];
      let t = text;
      if (voice.startsWith('fr')) t = /^\s*\[slow/i.test(text) ? text : text.replace(/^\s*\[[^\]]*\]\s*/, ''); // FR natural
      const dur = await ttsClip({ text: t, voiceId, model: process.env.ELEVENLABS_MODEL || 'eleven_v3', outAbs: path.join(ROOT, 'public', src) });
      // patch the baked lesson so the timeline stays in sync
      const lesson = await readJSON(LESSON, { slides: [] });
      let lineNo = null;
      for (const s of lesson.slides) {
        const b = (s.beats || []).find((x) => x.src === src);
        if (b) { b.text = text; b.durationInSeconds = +dur.toFixed(2); s.durationInSeconds = +s.beats.reduce((a, x) => a + x.durationInSeconds, 0).toFixed(2); lineNo = b.line; }
      }
      await writeFile(LESSON, JSON.stringify(lesson, null, 2) + '\n');

      // write the edit back into the transcript (same line), preserving VOICE/PHASE/tag
      let transcript = existsSync(SENT) ? await readFile(SENT, 'utf8') : '';
      if (lineNo) {
        const L = transcript.split(/\r?\n/);
        const raw = L[lineNo - 1] || '';
        const ar = raw.indexOf('→');
        if (ar !== -1) {
          const m = raw.slice(ar + 1).match(/^(\s*)(\[[^\]]*\]\s*)?([\s\S]*)$/);
          L[lineNo - 1] = raw.slice(0, ar + 1) + (m[1] || ' ') + (m[2] || '') + text;
          transcript = L.join('\n');
          await writeFile(SENT, transcript);
        }
      }
      return sendJSON(res, { ok: true, src, duration: +dur.toFixed(2), transcript });
    }

    // Regenerate ONE image (Recraft) for a segment; return its cache-busted url.
    if (p === '/api/image' && req.method === 'POST') {
      const { segment, scene } = await body(req);
      const styleId = process.env.RECRAFT_STYLE_ID || undefined;
      const rel = `assets/images/${LID}_${segment}.png`;
      const [u] = await generateImage({ prompt: scene, styleId, style: styleId ? undefined : 'digital_illustration', size: '1024x1024', n: 1 });
      await writeFile(path.join(ROOT, 'public', rel), Buffer.from(await (await fetch(u)).arrayBuffer()));
      const man = await readJSON(IMG_MANIFEST, { segments: {} });
      man.segments[segment] = { imageSrc: rel, imageSrcs: [rel] };
      await writeFile(IMG_MANIFEST, JSON.stringify(man, null, 2) + '\n');
      // persist the description per segment so it's remembered
      const scPath = path.join(ROOT, 'src/data/images', `scenes.${LID}.json`);
      const sc = await readJSON(scPath, { lessonId: LID, segments: [] });
      sc.segments = sc.segments || [];
      const ex = sc.segments.find((x) => x.id === segment);
      if (ex) ex.scene = scene; else sc.segments.push({ id: segment, scene });
      await writeFile(scPath, JSON.stringify(sc, null, 2) + '\n');
      return sendJSON(res, { ok: true, src: rel });
    }

    // ---- transcript sample (the pattern the generator follows) ----
    const SAMPLE = path.join(ROOT, 'config/transcript-sample.md');
    if (p === '/api/sample' && req.method === 'GET') return sendJSON(res, { sample: existsSync(SAMPLE) ? await readFile(SAMPLE, 'utf8') : '' });
    if (p === '/api/sample' && req.method === 'POST') { await writeFile(SAMPLE, (await body(req)).sample || ''); return sendJSON(res, { ok: true }); }

    // ---- generate a new lesson transcript from words + sentences (Claude) ----
    if (p === '/api/generate-transcript' && req.method === 'POST') {
      const { lessonNum, titleFr, titleEn, words, sentences } = await body(req);
      // No Anthropic key → deterministic template generator (works from the words
      // + sentences alone, no API). With a key → Claude drafts nicer prose.
      if (!hasAnthropicKey()) {
        const { buildTranscript } = await import('./gen-transcript.mjs');
        return sendJSON(res, { ok: true, transcript: buildTranscript({ lessonNum, titleFr, titleEn, words, sentences }) });
      }
      const sample = existsSync(SAMPLE) ? await readFile(SAMPLE, 'utf8') : '';
      const guidePath = path.join(ROOT, 'curriculum/TRANSCRIPT_AUTHORING_GUIDE.md');
      const guide = existsSync(guidePath) ? await readFile(guidePath, 'utf8') : '';
      const system =
        `You write "Say It" language-lesson transcripts in the exact "sent to ElevenLabs" format. ` +
        `Follow this authoring guide precisely:\n\n${guide}\n\n` +
        `Output ONLY the transcript (starting with "# Lesson"). No preamble, no explanation, no code fences.`;
      const user =
        `Here is a SAMPLE transcript — match its structure, phase banners, voice-pair alternation, pause style, and formatting exactly:\n\n` +
        `${sample}\n\n----------------\n\n` +
        `Now write the transcript for Lesson ${lessonNum}: ${titleFr} (${titleEn}).\n\n` +
        `WORDS (format: french | english | pronunciation | optional pronunciation tip):\n${words}\n\n` +
        `SENTENCES (format: french | english):\n${sentences || '(none)'}\n\n` +
        `Apply the SOP: the fixed 7-step vocab pattern per word (word heard ~4×: natural → English meaning → slow with syllable breaks → optional pronunciation tip → natural → "Repeat" → confirmation), a QUICK RECALL review after ~6 words, the sentence pattern for each sentence, phase badges (MEET/ECHO/BUILD/MAKE IT YOURS/RECALL/RECAP), 4-voice gender alternation flipping only at section banners, and the two hard rules: NEVER the bare word "clear" in a tag, and the French voice says ONLY taught vocabulary (no praise/filler). Output only the transcript.`;
      const { text, truncated } = await generateText({ system, user, maxTokens: 20000 });
      return sendJSON(res, { ok: true, transcript: text, truncated });
    }

    // ---- image generation config (constant, locked style) ----
    if (p === '/api/image-config') return sendJSON(res, {
      styleId: process.env.RECRAFT_STYLE_ID || '',
      baseStyle: process.env.RECRAFT_STYLE || 'digital_illustration',
      descriptor: STYLE_DESCRIPTOR,
    });

    // ---- language color config ----
    if (p === '/api/config' && req.method === 'GET') return sendJSON(res, await readJSON(CONFIG, {}));
    if (p === '/api/config' && req.method === 'POST') { await writeFile(CONFIG, JSON.stringify(await body(req), null, 2) + '\n'); return sendJSON(res, { ok: true }); }

    // ---- generated images (for the cover picker) ----
    if (p === '/api/images') {
      const dir = path.join(ROOT, 'public/assets/images');
      const files = existsSync(dir) ? (await readdir(dir)).filter((f) => /\.(png|jpg)$/i.test(f) && !/^(je|travailler|example)\./.test(f)) : [];
      return sendJSON(res, files.sort().map((f) => `assets/images/${f}`));
    }

    // ---- projects (history) ----
    if (p === '/api/projects') {
      await mkdir(PROJECTS, { recursive: true });
      const files = (await readdir(PROJECTS)).filter((f) => f.endsWith('.json'));
      const arr = (await Promise.all(files.map((f) => readJSON(path.join(PROJECTS, f), null)))).filter(Boolean);
      return sendJSON(res, arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    }
    if (p === '/api/project' && req.method === 'GET') return sendJSON(res, await readJSON(path.join(PROJECTS, `${url.searchParams.get('id')}.json`), null));
    if (p === '/api/project' && req.method === 'POST') {
      const proj = await body(req);
      if (!proj.id) proj.id = 'p' + Date.now();
      proj.updatedAt = new Date().toISOString();
      if (!proj.createdAt) proj.createdAt = proj.updatedAt;
      await mkdir(PROJECTS, { recursive: true });
      await writeFile(path.join(PROJECTS, `${proj.id}.json`), JSON.stringify(proj, null, 2) + '\n');
      return sendJSON(res, proj);
    }

    // ---- render a cover still (Warm-Spark thumbnail) ----
    if (p === '/api/cover' && req.method === 'POST') {
      const props = await body(req);
      const id = props.id || 'cover';
      const rel = `assets/covers/${id}.png`;
      await mkdir(path.join(ROOT, 'public/assets/covers'), { recursive: true });
      const r = await runOnce(REMOTION_BIN, ['still', 'src/index.ts', 'Thumbnail', path.join('public', rel), `--props=${JSON.stringify(props)}`]);
      if (r.code !== 0) return sendJSON(res, { error: r.out.slice(-600) }, 500);
      return sendJSON(res, { ok: true, src: rel });
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    sendJSON(res, { error: String(e.message || e) }, 500);
  }
});

server.listen(PORT, () => console.log(`\n  Say It studio → http://localhost:${PORT}\n`));
