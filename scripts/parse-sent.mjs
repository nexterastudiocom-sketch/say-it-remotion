// Parse the "sent to ElevenLabs" dump format (what dump-sent.mjs prints, and
// what you can hand-edit) back into the beats JSON the pipeline consumes.
//
// Line grammar:
//   VOICE  [PHASE]  →  [tag] text        (a spoken clip; PHASE + tag optional)
//   ⏸ PAUSE Ns [PHASE]                   (a silent timeline gap)
//   ## Segment title                     (segment boundary)
//
// Usage: node scripts/parse-sent.mjs curriculum/lesson-01.sent.md lesson-01

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = path.join(ROOT, process.argv[2] || 'curriculum/lesson-01.sent.md');
const lessonId = process.argv[3] || 'lesson-01';

const VMAP = { 'EN·MAN': 'en_man', 'EN·WOMAN': 'en_woman', 'FR·MAN': 'fr_man', 'FR·WOMAN': 'fr_woman' };
const lines = (await readFile(mdPath, 'utf8')).split(/\r?\n/);

const segments = [];
let cur = null;
for (let idx = 0; idx < lines.length; idx++) {
  const raw = lines[idx];
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith('## ')) { cur = { title: line.replace(/^##\s+/, ''), beats: [] }; segments.push(cur); continue; }
  if (!cur) continue;

  const pause = line.match(/PAUSE\s*(\d+(?:\.\d+)?)\s*s(?:\s*\[([^\]]+)\])?/i);
  if (/⏸|PAUSE/.test(line) && pause) { cur.beats.push({ pause: Number(pause[1]), phase: pause[2] ? pause[2].trim() : null, line: idx + 1 }); continue; }

  const arrow = line.indexOf('→');
  if (arrow === -1) continue;
  const left = line.slice(0, arrow);
  let right = line.slice(arrow + 1).trim();

  const vm = left.match(/(EN|FR)·(MAN|WOMAN)/);
  if (!vm) continue;
  const voice = VMAP[`${vm[1]}·${vm[2]}`];
  const pm = left.replace(/(EN|FR)·(MAN|WOMAN)/, '').match(/\[([^\]]+)\]/);
  const phase = pm ? pm[1].trim() : null;

  let tag = '';
  const tm = right.match(/^\[([^\]]*)\]\s*([\s\S]*)$/);
  if (tm) { tag = tm[1].trim(); right = tm[2].trim(); }
  cur.beats.push({ voice, text: right, tag, phase, line: idx + 1 }); // line = 1-based source line in the .sent.md
}

const withBeats = segments.filter((s) => s.beats.length);
const outDir = path.join(ROOT, 'src/data/scripts');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${lessonId}.json`);
await writeFile(outPath, JSON.stringify({ lessonId, language: 'fr', segments: withBeats }, null, 2) + '\n');

let en = 0, fr = 0, p = 0;
for (const s of withBeats) for (const b of s.beats) b.pause != null ? p++ : b.voice.startsWith('en') ? en++ : fr++;
console.log(`Parsed ${withBeats.length} segments → ${path.relative(ROOT, outPath)}`);
console.log(`${en} narrator + ${fr} french clips, ${p} pauses (${en + fr} ElevenLabs calls)`);
