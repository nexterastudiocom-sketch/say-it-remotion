// Rewrite the transcript so EVERY between-clip gap the pipeline adds automatically
// becomes an explicit, editable "⏸ PAUSE" line. Also reflects the current rules:
// one French voice (FR·WOMAN) and French shown natural (tags stripped except slow).
//
// Usage: node scripts/expand-gaps.mjs           # writes curriculum/lesson-01.sent.md
//        node scripts/expand-gaps.mjs 2.0        # with a custom default gap (seconds)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAP = Number(process.argv[2] || 1.5); // default gap inserted between back-to-back clips
const script = JSON.parse(await readFile(path.join(ROOT, 'src/data/scripts/lesson-01.json'), 'utf8'));

const LABEL = (v) => (v.startsWith('fr') ? 'FR·WOMAN' : v === 'en_man' ? 'EN·MAN' : 'EN·WOMAN');

let out = `# Lesson 1 — editable transcript (every gap is an explicit ⏸ PAUSE)
Model: eleven_v3. VOICE [PHASE] → [tag] text = one clip. ⏸ PAUSE Ns = silent gap.
Rules: one French voice (woman), always natural (no tags except [slowly]); never the word "clear".
Pauses render at their value + 0.3s settle, floored to 2s. Raise any ⏸ value to add more pause.
`;

for (const seg of script.segments) {
  out += `\n## ${seg.title}\n`;
  let prevSpoken = false;
  for (const b of seg.beats) {
    if (b.pause != null) {
      out += `    ⏸ PAUSE ${b.pause}s${b.phase ? `  [${b.phase}]` : ''}\n`;
      prevSpoken = false;
      continue;
    }
    if (prevSpoken) out += `    ⏸ PAUSE ${GAP}s${b.phase ? `  [${b.phase}]` : ''}\n`; // the auto-gap, now explicit
    let tag = b.tag;
    if (b.voice.startsWith('fr')) tag = /slow/i.test(tag || '') ? 'slowly' : ''; // FR = natural only
    const text = tag ? `[${tag}] ${b.text}` : b.text;
    out += `  ${LABEL(b.voice).padEnd(8)}${b.phase ? ` [${b.phase}]` : ''}  →  ${text}\n`;
    prevSpoken = true;
  }
}

const dest = path.join(ROOT, 'curriculum/lesson-01.sent.md');
await writeFile(dest, out);
console.log(`✓ wrote ${path.relative(ROOT, dest)} — every gap is now an explicit ⏸ PAUSE (default ${GAP}s).`);
