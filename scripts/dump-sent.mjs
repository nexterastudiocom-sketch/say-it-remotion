// Print exactly what is sent to ElevenLabs: for every beat, the voice + the
// literal text string (with the [tag] prefix, as build-from-script builds it),
// plus the PAUSE gaps (never sent — they're timeline silence).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(await readFile(path.join(ROOT, 'src/data/scripts/lesson-01.json'), 'utf8'));
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';
const VNAME = { en_man: 'EN·MAN', en_woman: 'EN·WOMAN', fr_man: 'FR·MAN', fr_woman: 'FR·WOMAN' };

let out = `# Lesson 1 — exact text sent to ElevenLabs\nModel: ${MODEL}. Each quoted line = one API call. ⏸ = silent timeline gap (never sent).\n`;
let calls = 0;
for (const seg of script.segments) {
  out += `\n## ${seg.title}\n`;
  for (const b of seg.beats) {
    if (b.pause != null) { out += `    ⏸ PAUSE ${b.pause}s${b.phase ? `  [${b.phase}]` : ''}\n`; continue; }
    const text = b.tag ? `[${b.tag}] ${b.text}` : b.text;
    out += `  ${(VNAME[b.voice] || b.voice).padEnd(8)}${b.phase ? ` [${b.phase}]` : ''}  →  ${text}\n`;
    calls++;
  }
}
out += `\n— ${calls} ElevenLabs calls total —\n`;

const dest = path.join(ROOT, 'out/lesson-01-elevenlabs-sent.md');
await writeFile(dest, out);
console.log(out);
console.log(`\nSaved → ${path.relative(ROOT, dest)}`);
