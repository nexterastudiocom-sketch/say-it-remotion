// Parse a two-voice production script (.md) into segments → ordered beats:
//   { voice:'en'|'fr', text, tag }   (a spoken clip)
//   { pause: seconds }               (a silent gap — learner speaks)
// Audio tags [like this] are captured separately (used by v3, stripped for v2).
// Writes src/data/scripts/<lesson>.json and prints a runtime estimate.
//
// Usage: node scripts/parse-script.mjs "curriculum/Lesson_01_Full_Script_Dire_Bonjour.md" lesson-01

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = path.join(ROOT, process.argv[2] || 'curriculum/Lesson_01_Full_Script_Dire_Bonjour.md');
const lessonId = process.argv[3] || 'lesson-01';

const lines = (await readFile(mdPath, 'utf8')).split(/\r?\n/);

const segments = [];
let cur = null; // { title, beats }
let voice = null; // pending voice for upcoming quote lines
let tag = '';
let phase = null; // current phase (MEET/ECHO/BUILD/MAKE IT YOURS/RECALL/RECAP), persists until changed

const tagOf = (s) => (s.match(/\*\[([^\]]+)\]\*/) || [, ''])[1].trim();

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  if (line.startsWith('## ')) {
    // New segment (skip the "How to read" meta section headers with no beats later)
    cur = { title: line.replace(/^##\s+/, ''), beats: [] };
    segments.push(cur);
    voice = null;
    tag = '';
    continue;
  }
  if (!cur) continue;

  // Phase cue, e.g. 🖼 **[PHASE → ECHO]** — persists until the next one.
  const pm = line.match(/\[PHASE\s*→\s*([^\]]+)\]/);
  if (pm) { phase = pm[1].trim(); continue; }

  // Explicit voice label, e.g. **NARRATOR (EN · MAN)** / **FRENCH VOICE (FR · WOMAN)**
  if (line.includes('NARRATOR (EN') || line.includes('FRENCH VOICE (FR')) {
    const lang = line.includes('FRENCH VOICE (FR') ? 'fr' : 'en';
    const gender = /WOMAN/i.test(line) ? 'woman' : 'man';
    voice = `${lang}_${gender}`;
    tag = tagOf(line);
    continue;
  }

  const pause = line.match(/PAUSE\s*[—-]\s*(\d+(?:\.\d+)?)\s*s/i);
  if (pause) { cur.beats.push({ pause: Number(pause[1]), phase }); voice = null; continue; }

  // A standalone audio-tag line updates the current performance tag.
  if (/^\*\[[^\]]+\]\*$/.test(line)) { tag = tagOf(line); continue; }

  // A quoted line is spoken text for the pending voice.
  const q = line.match(/^"(.+)"$/);
  if (q && voice) { cur.beats.push({ voice, text: q[1], tag, phase }); continue; }
}

// Keep only segments that actually contain beats.
const withBeats = segments.filter((s) => s.beats.length);

// ---- runtime estimate ----
const wc = (t) => t.split(/\s+/).filter(Boolean).length;
let en = 0, fr = 0, pauses = 0, pauseSecs = 0, est = 0;
for (const s of withBeats) {
  for (const b of s.beats) {
    if (b.pause) { pauses++; pauseSecs += b.pause; est += b.pause; }
    else if (b.voice.startsWith('en')) { en++; est += wc(b.text) * 0.36 + 0.4; }
    else { fr++; est += wc(b.text) * 0.5 + 0.6; }
  }
}

const outDir = path.join(ROOT, 'src/data/scripts');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${lessonId}.json`);
await writeFile(outPath, JSON.stringify({ lessonId, language: 'fr', segments: withBeats }, null, 2) + '\n');

console.log(`Parsed ${withBeats.length} segments → ${path.relative(ROOT, outPath)}\n`);
for (const s of withBeats) {
  const v = (k) => s.beats.filter((b) => b.voice === k).length;
  const p = s.beats.filter((b) => b.pause).length;
  console.log(`  ${s.title.slice(0, 40).padEnd(42)} EN(m/w):${v('en_man')}/${v('en_woman')}  FR(m/w):${v('fr_man')}/${v('fr_woman')}  P:${p}`);
}
console.log(`\nTotals: ${en} narrator clips, ${fr} french clips, ${pauses} pauses (${pauseSecs}s of silence)`);
console.log(`Estimated runtime ≈ ${Math.round(est / 60)} min ${Math.round(est % 60)}s  (${en + fr} ElevenLabs calls)`);
